import { NextResponse } from "next/server";

import { readDeliveryNote, ScanError, type ScanPage } from "@/lib/delivery-scan-ai";
import {
  SCAN_ERRORS,
  SCAN_MAX_BYTES,
  SCAN_MAX_FILES,
  SCAN_MAX_PAGES,
  type ScanErrorCode,
  type ScanResult,
} from "@/lib/delivery-scan";
import { isScanConfigured } from "@/lib/env";
import { UUID_PATTERN } from "@/lib/order-types";
import type { StockData } from "@/lib/stock";
import { getServerClient } from "@/lib/supabase/server";

// La lecture d'un bon de plusieurs pages peut prendre jusqu'à une minute.
export const maxDuration = 180;

function fail(code: ScanErrorCode, status: number, extra?: { warning?: string | null }) {
  return NextResponse.json({ error: SCAN_ERRORS[code], code, ...extra }, { status });
}

const DB_ERRORS: Record<string, [ScanErrorCode, number]> = {
  ACCES_REFUSE: ["ACCES_REFUSE", 403],
  AUCUN_ARTICLE: ["AUCUN_ARTICLE", 400],
  PAGES_INVALIDES: ["TROP_DE_PAGES", 400],
  TROP_DE_LECTURES: ["TROP_DE_LECTURES", 429],
};

function dbFail(error: { message: string; code?: string }) {
  const known = DB_ERRORS[error.message];
  if (known) return fail(...known);
  if (error.code === "42501" || /jwt|token|PGRST30/i.test(`${error.code} ${error.message}`)) return fail("ACCES_REFUSE", 401);
  if (/could not find the function/i.test(error.message)) return fail("BASE_INCOMPLETE", 500);
  console.error("Lecture du bon : erreur de la base", error);
  return fail("ERREUR", 500);
}

/** Type réel du fichier, d'après son contenu (le nom et le type annoncés ne sont pas fiables). */
function detectType(data: Buffer): ScanPage["mediaType"] | null {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (data.toString("latin1", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

/** Nombre de pages d'un PDF (estimation : 1 si la structure est compressée). */
function pdfPages(data: Buffer): number {
  return Math.max(1, data.toString("latin1").match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 1);
}

/**
 * Lit un bon de livraison (photos ou PDF) et propose les quantités reçues.
 * Réservé au personnel du bar ; rien n'est ajouté au stock avant validation.
 */
export async function POST(request: Request) {
  if (!isScanConfigured()) return fail("SCAN_NON_CONFIGURE", 503);
  if (Number(request.headers.get("content-length") ?? 0) > SCAN_MAX_BYTES + 64 * 1024) return fail("TROP_LOURD", 413);

  // Au nom de la personne connectée : la base vérifie ensuite qu'elle travaille dans ce bar.
  const supabase = await getServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail("ACCES_REFUSE", 401);

  const form = await request.formData().catch(() => null);
  const venueId = form?.get("venue_id");
  const files = (form?.getAll("pages") ?? []).filter((file): file is File => file instanceof File);
  if (typeof venueId !== "string" || !UUID_PATTERN.test(venueId) || files.length < 1 || files.length > SCAN_MAX_FILES) {
    return fail("FICHIERS_INVALIDES", 400);
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > SCAN_MAX_BYTES) return fail("TROP_LOURD", 413);

  const pages: ScanPage[] = [];
  let pageCount = 0;
  for (const file of files) {
    const data = Buffer.from(await file.arrayBuffer());
    const mediaType = detectType(data);
    if (!mediaType) return fail("FORMAT_NON_SUPPORTE", 400);
    pageCount += mediaType === "application/pdf" ? pdfPages(data) : 1;
    pages.push({ mediaType, data });
  }
  if (pageCount > SCAN_MAX_PAGES) return fail("TROP_DE_PAGES", 400);

  const { data: stock, error: stockError } = await supabase.rpc("get_stock", { p_venue_id: venueId });
  if (stockError) return dbFail(stockError);
  const items = (stock as StockData).items;
  if (items.length === 0) return fail("AUCUN_ARTICLE", 400);

  const { data: scanId, error: beginError } = await supabase.rpc("stock_scan_begin", { p_venue_id: venueId, p_pages: pageCount });
  if (beginError) return dbFail(beginError);

  const finish = (ok: boolean, details: { supplier?: string | null; reference?: string | null; lines?: number; usage?: { input: number; output: number } }) =>
    supabase.rpc("stock_scan_finish", {
      p_scan_id: scanId,
      p_ok: ok,
      p_supplier: details.supplier ?? null,
      p_reference: details.reference ?? null,
      p_lines: details.lines ?? 0,
      p_input_tokens: details.usage?.input ?? null,
      p_output_tokens: details.usage?.output ?? null,
    });

  let result: Awaited<ReturnType<typeof readDeliveryNote>>;
  try {
    result = await readDeliveryNote(pages, items);
  } catch (error) {
    await finish(false, {});
    if (error instanceof ScanError) return fail(error.code, 502);
    console.error("Lecture du bon impossible", error);
    return fail("ERREUR", 500);
  }

  if (!result.ok) {
    await finish(false, { usage: result.usage });
    const status = result.code === "IA_INDISPONIBLE" ? 502 : 422;
    return fail(result.code, status, { warning: "warning" in result ? result.warning : null });
  }

  const { error: finishError } = await finish(true, {
    supplier: result.supplier,
    reference: result.reference,
    lines: result.lines.length,
    usage: result.usage,
  });
  if (finishError) return dbFail(finishError);

  return NextResponse.json({
    scan_id: scanId as string,
    supplier: result.supplier,
    reference: result.reference,
    document_date: result.document_date,
    warning: result.warning,
    lines: result.lines,
  } satisfies ScanResult);
}
