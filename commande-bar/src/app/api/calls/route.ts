import { NextResponse } from "next/server";

import { isKnownOrderError, orderError } from "@/lib/order-errors";
import { TOKEN_PATTERN } from "@/lib/menu";
import { getAdminClient } from "@/lib/supabase/admin";

/** « Appeler un serveur » / « L'addition » depuis le téléphone d'un client. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token = body?.token;
  const kind = body?.kind;
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token) || (kind !== "waiter" && kind !== "bill")) {
    return NextResponse.json({ error: orderError("CARTE_INVALIDE").message, code: "CARTE_INVALIDE" }, { status: 400 });
  }

  const { error } = await getAdminClient().rpc("create_table_call", { p_token: token, p_kind: kind });
  if (error) {
    if (isKnownOrderError(error.message)) {
      const { status, message } = orderError(error.message);
      return NextResponse.json({ error: message, code: error.message }, { status });
    }
    console.error("Appel du serveur impossible", error);
    return NextResponse.json(
      { error: "Petit souci technique, l'appel n'est pas parti. Faites signe à un serveur.", code: "ERREUR" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
