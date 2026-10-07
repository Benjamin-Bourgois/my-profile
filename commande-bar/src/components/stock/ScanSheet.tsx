"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { Sheet, SheetBody, SheetFooter } from "@/components/Sheet";
import { adminErrorMessage } from "@/lib/admin-errors";
import {
  APPLY_ERRORS,
  deliveryNote,
  SCAN_ERRORS,
  SCAN_MAX_BYTES,
  SCAN_MAX_FILES,
  SCAN_PHOTO_SIZE,
  type ScanResult,
} from "@/lib/delivery-scan";
import { resizeImage } from "@/lib/image-resize";
import { formatQuantity, parseQuantity, type StockItem } from "@/lib/stock";
import { getBrowserClient } from "@/lib/supabase/browser";

type Page = { id: string; blob: Blob; name: string; isPdf: boolean; preview: string | null };
type Row = {
  key: number;
  label: string;
  quantityText: string;
  explanation: string;
  uncertain: boolean;
  itemId: string;
  value: string;
};

const MB = 1024 * 1024;
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * « Scanner un bon » : photos du bon de livraison → l'IA propose les quantités →
 * la personne vérifie, corrige, puis tout est ajouté au stock en une fois.
 */
export function ScanSheet({
  venueId,
  items,
  isOwner,
  enabled,
  onClose,
  onDone,
}: {
  venueId: string;
  items: StockItem[];
  isOwner: boolean;
  enabled: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const [step, setStep] = useState<"pick" | "reading" | "review">("pick");
  const [pages, setPages] = useState<Page[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const previews = useRef(new Set<string>());

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  // Libère les aperçus des photos et interrompt une lecture en cours à la fermeture.
  useEffect(() => {
    const urls = previews.current;
    return () => {
      request.current?.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    setPreparing(true);
    const added: Page[] = [];
    let problem: string | null = null;
    for (const file of Array.from(list)) {
      if (pages.length + added.length >= SCAN_MAX_FILES) {
        problem = `${SCAN_MAX_FILES} fichiers au maximum : une photo par page du bon.`;
        break;
      }
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      try {
        // Les photos sont réduites ici : envoi rapide, même en 4G, et lisible par l'IA.
        const blob = isPdf ? file : await resizeImage(file, SCAN_PHOTO_SIZE, "image/jpeg");
        const preview = isPdf ? null : URL.createObjectURL(blob);
        if (preview) previews.current.add(preview);
        added.push({ id: `${Date.now()}-${added.length}-${file.name}`, blob, name: file.name || "Photo", isPdf, preview });
      } catch {
        problem = "Photo illisible : essayez une photo au format JPEG ou PNG.";
      }
    }
    const total = [...pages, ...added].reduce((sum, page) => sum + page.blob.size, 0);
    if (total > SCAN_MAX_BYTES) {
      added.forEach((page) => page.preview && URL.revokeObjectURL(page.preview));
      setError(SCAN_ERRORS.TROP_LOURD);
    } else {
      setPages((current) => [...current, ...added]);
      if (problem) setError(problem);
    }
    setPreparing(false);
  }

  function removePage(page: Page) {
    if (page.preview) URL.revokeObjectURL(page.preview);
    setPages((current) => current.filter((p) => p.id !== page.id));
  }

  async function read() {
    setError(null);
    setStep("reading");
    const body = new FormData();
    body.set("venue_id", venueId);
    pages.forEach((page, index) => body.append("pages", page.blob, page.isPdf ? page.name : `page-${index + 1}.jpg`));
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/stocks/scan", { method: "POST", body, signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.scan_id) {
        const warning = data?.warning ? ` (${data.warning})` : "";
        setError(`${data?.error ?? SCAN_ERRORS.ERREUR}${warning}`);
        setStep("pick");
        return;
      }
      const scan = data as ScanResult;
      setResult(scan);
      setRows(
        scan.lines.map((line, index) => ({
          key: index,
          label: line.label,
          quantityText: line.quantity_text,
          explanation: line.explanation,
          uncertain: line.confidence === "low" || !line.stock_item_id,
          itemId: line.stock_item_id ?? "",
          value: line.quantity !== null ? String(line.quantity).replace(".", ",") : "",
        })),
      );
      setStep("review");
    } catch (fetchError) {
      if (controller.signal.aborted) return;
      console.error(fetchError);
      setError("Connexion perdue pendant la lecture : vérifiez le réseau et réessayez.");
      setStep("pick");
    } finally {
      request.current = null;
    }
  }

  function updateRow(key: number, change: Partial<Row>) {
    setError(null);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  // Lignes à ajouter au stock et stock obtenu pour chaque article (un article peut être sur plusieurs lignes)
  const selected = rows.filter((row) => row.itemId);
  const invalid = selected.find((row) => {
    const quantity = parseQuantity(row.value);
    return quantity === null || quantity <= 0;
  });
  const totals = new Map<string, number>();
  for (const row of selected) totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + (parseQuantity(row.value) ?? 0));
  const toCheck = rows.filter((row) => row.uncertain).length;

  async function apply() {
    if (!result) return;
    if (invalid) {
      setError(`« ${invalid.label} » : quantité invalide. Écrivez un nombre, par exemple 12 ou 0,5.`);
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("stock_apply_delivery", {
      p_scan_id: result.scan_id,
      p_lines: selected.map((row) => ({ stock_item_id: row.itemId, quantity: parseQuantity(row.value) })),
      p_note: deliveryNote(result),
    });
    setSaving(false);
    if (rpcError) {
      setError(APPLY_ERRORS[rpcError.message] ?? adminErrorMessage(rpcError));
      return;
    }
    const count = Number(data);
    onDone(`Livraison enregistrée : ${count} article${count > 1 ? "s" : ""} mis à jour`);
  }

  function close() {
    if (step === "review" && !saving && !window.confirm("Fermer sans enregistrer la livraison ?")) return;
    onClose();
  }

  if (!enabled) {
    return (
      <Sheet title="Scanner un bon" eyebrow="Stocks" onClose={onClose}>
        <SheetBody>
          <p className="text-ink-2">
            Avec cette fonction, on prend en photo le bon de livraison ou la facture du fournisseur : l&apos;IA lit les produits et
            propose les quantités, il ne reste qu&apos;à vérifier.
          </p>
          <p className="mt-4 rounded-md bg-warn-soft px-4 py-3 text-warn-ink">
            {isOwner
              ? "Pas encore activée : ajoutez votre clé Anthropic (ANTHROPIC_API_KEY) dans Vercel → Settings → Environment Variables, puis redéployez. Le mode d'emploi (README) détaille chaque étape."
              : "Pas encore activée : demandez au gérant de l'activer."}
          </p>
        </SheetBody>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={step === "review" ? "Vérifier la livraison" : "Scanner un bon"}
      eyebrow={step === "review" && result?.supplier ? result.supplier : "Stocks"}
      onClose={close}
    >
      {step === "pick" && (
        <>
          <SheetBody>
            <p className="text-ink-2">
              Prenez en photo le bon de livraison ou la facture : l&apos;IA lit les produits et propose les quantités. Vous vérifiez
              avant que le stock change.
            </p>

            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {pages.length > 0 && (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {pages.map((page, index) => (
                  <li key={page.id} className="relative overflow-hidden rounded-md border border-line bg-card">
                    {page.preview ? (
                      <img src={page.preview} alt={`Page ${index + 1}`} className="aspect-[3/4] w-full object-cover" />
                    ) : (
                      <div className="grid aspect-[3/4] place-items-center p-2 text-center text-ink-2">
                        <span>
                          <Icon name="file" size={28} className="mx-auto" />
                          <span className="mt-1 block break-all text-[12px]">{page.name}</span>
                        </span>
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-matte px-2 py-0.5 text-[12px] font-semibold text-white">
                      {page.isPdf ? "PDF" : `Page ${index + 1}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePage(page)}
                      aria-label={`Retirer ${page.isPdf ? page.name : `la page ${index + 1}`}`}
                      className="icon-btn absolute right-1.5 top-1.5 !h-8 !w-8 bg-card"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {pages.length < SCAN_MAX_FILES && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => cameraInput.current?.click()} disabled={preparing} className="btn btn--soft">
                  <Icon name="camera" />
                  {pages.length ? "Photo de la page suivante" : "Prendre une photo"}
                </button>
                <button type="button" onClick={() => fileInput.current?.click()} disabled={preparing} className="btn btn--ghost">
                  <Icon name="image" />
                  Choisir une photo ou un PDF
                </button>
              </div>
            )}

            <ul className="mt-4 list-disc space-y-1 pl-5 text-[13px] text-muted">
              <li>Document bien à plat, bien éclairé, en entier dans la photo.</li>
              <li>Une photo par page ({SCAN_MAX_FILES} au maximum), ou le PDF reçu par e-mail ({Math.round(SCAN_MAX_BYTES / MB)} Mo au maximum).</li>
              <li>La photo sert seulement à la lecture : elle n&apos;est pas conservée.</li>
            </ul>
          </SheetBody>
          <SheetFooter>
            {error && (
              <p role="alert" className="mb-3 rounded-md bg-danger-soft px-4 py-3 text-[14px] text-danger">
                {error}
              </p>
            )}
            <button type="button" onClick={read} disabled={preparing || pages.length === 0} className="btn btn--primary btn--block">
              <Icon name="sparkle" />
              {preparing ? "Préparation des photos…" : "Lire le bon"}
            </button>
          </SheetFooter>
        </>
      )}

      {step === "reading" && (
        <SheetBody>
          <div role="status" className="py-12 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gold-soft text-gold motion-safe:animate-pulse">
              <Icon name="sparkle" size={28} />
            </span>
            <p className="mt-5 font-serif text-[24px] font-semibold">Lecture du bon en cours…</p>
            <p className="mt-1 text-ink-2">
              L&apos;IA relève chaque produit et convertit les quantités. Cela prend en général 15 à 40 secondes.
            </p>
          </div>
        </SheetBody>
      )}

      {step === "review" && result && (
        <>
          <SheetBody>
            <div className="flex items-start gap-3 rounded-md border border-line bg-card px-4 py-3 text-[14px]">
              <div className="min-w-0 flex-1">
                <p>
                  <strong>{result.supplier ?? "Fournisseur non lu"}</strong>
                  {result.reference && <span className="text-ink-2"> · n° {result.reference}</span>}
                  {result.document_date && <span className="text-ink-2"> · {dateFormat.format(new Date(`${result.document_date}T12:00:00Z`))}</span>}
                </p>
                <p className="mt-0.5 text-ink-2">
                  {rows.length} ligne{rows.length > 1 ? "s" : ""} lue{rows.length > 1 ? "s" : ""}
                  {toCheck > 0 && (
                    <>
                      {" "}
                      · <strong className="text-warn-ink">{toCheck} à vérifier</strong>
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep("pick");
                }}
                disabled={saving}
                className="btn btn--ghost btn--sm shrink-0"
              >
                <Icon name="camera" size={15} />
                Reprendre
              </button>
            </div>
            {result.warning && (
              <p className="mt-3 flex gap-2 rounded-md bg-warn-soft px-4 py-3 text-[14px] text-warn-ink">
                <Icon name="alert" size={17} className="mt-0.5 shrink-0" />
                {result.warning}
              </p>
            )}

            <ul className="mt-4 space-y-3">
              {rows.map((row) => {
                const item = row.itemId ? byId.get(row.itemId) : undefined;
                const quantity = parseQuantity(row.value);
                const after = item && totals.has(item.id) ? Number(item.quantity) + (totals.get(item.id) ?? 0) : null;
                return (
                  <li key={row.key} className={`rounded-md border bg-card p-3 ${row.uncertain ? "border-warn" : "border-line"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words font-semibold leading-snug">{row.label}</p>
                        {row.quantityText && <p className="text-[13px] text-muted">Sur le bon : {row.quantityText}</p>}
                      </div>
                      {row.uncertain && <span className="badge badge--warn shrink-0">À vérifier</span>}
                    </div>

                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="field min-w-0 flex-1 basis-48">
                        <span className="sr-only">Article du stock pour « {row.label} »</span>
                        <select
                          value={row.itemId}
                          onChange={(e) => updateRow(row.key, { itemId: e.target.value })}
                          className="input"
                        >
                          <option value="">— Ne pas ajouter —</option>
                          {items.map((stockItem) => (
                            <option key={stockItem.id} value={stockItem.id}>
                              {stockItem.name} ({stockItem.unit})
                            </option>
                          ))}
                        </select>
                      </label>
                      {item && (
                        <label className="field w-36">
                          <span className="sr-only">Quantité reçue en {item.unit}</span>
                          <span className="flex items-center gap-2">
                            <input
                              inputMode="decimal"
                              value={row.value}
                              onChange={(e) => updateRow(row.key, { value: e.target.value })}
                              aria-invalid={quantity === null || quantity <= 0}
                              className="input min-w-0 tabular-nums"
                            />
                            <span className="shrink-0 text-[14px] text-ink-2">{item.unit}</span>
                          </span>
                        </label>
                      )}
                    </div>

                    {row.explanation && <p className="mt-2 text-[13px] text-ink-2">IA : {row.explanation}</p>}
                    {!item && (
                      <p className="mt-1 text-[13px] text-muted">
                        {isOwner
                          ? "Pas dans vos articles : choisissez-en un, ou créez-le ensuite avec « Nouvel article »."
                          : "Pas dans vos articles : choisissez-en un, ou laissez « Ne pas ajouter »."}
                      </p>
                    )}
                    {item && after !== null && (
                      <p className="mt-1 text-[13px] text-muted">
                        Stock : {formatQuantity(item.quantity, item.unit)} →{" "}
                        <strong className="text-ink">{formatQuantity(after, item.unit)}</strong>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </SheetBody>
          <SheetFooter>
            {error && (
              <p role="alert" className="mb-3 rounded-md bg-danger-soft px-4 py-3 text-[14px] text-danger">
                {error}
              </p>
            )}
            <button type="button" onClick={apply} disabled={saving || selected.length === 0} className="btn btn--primary btn--block">
              <Icon name="truck" />
              {saving
                ? "Enregistrement…"
                : selected.length === 0
                  ? "Aucun article choisi"
                  : `Ajouter au stock (${totals.size} article${totals.size > 1 ? "s" : ""})`}
            </button>
          </SheetFooter>
        </>
      )}
    </Sheet>
  );
}
