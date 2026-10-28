// Tapigo — Prévision de stock du jour, par restaurant, avec Claude.
//
// POST { restaurant_id, context? }   (compte de l'équipe connecté)
//   -> calcule la prévision du jour et la renvoie.
// POST { restaurant_id }  + en-tête x-cron-secret: <CRON_SECRET>
//   -> appel automatique chaque matin (voir supabase/cron.sql).
//
// Méthode : on agrège les ventes des 8 dernières semaines (même jour de la
// semaine + 14 derniers jours), on calcule une base statistique, puis Claude
// ajuste les quantités et explique ses choix. Sans clé ANTHROPIC_API_KEY (ou
// en cas d'erreur), la base statistique est enregistrée seule.
// Le personnel valide ensuite chaque suggestion dans l'onglet Stocks.
import Anthropic from "npm:@anthropic-ai/sdk";
import { admin, body, callerRole, type Db, HttpError, json, serve, UUID } from "../_shared/util.ts";

const MODEL = Deno.env.get("FORECAST_MODEL") || "claude-opus-5-5";
const TZ = "Europe/Paris";
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

interface MenuItem {
  id: string;
  name: string;
  category?: string;
  price?: number;
  available?: boolean;
}

interface Suggestion {
  itemId: string;
  quantity: number;
  reason: string;
}

interface Forecast {
  summary: string;
  items: Suggestion[];
  alerts: string[];
  source: "ia" | "statistique";
}

const localDate = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: TZ }).format(d); // AAAA-MM-JJ
const weekday = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

serve(async (req) => {
  const { restaurant_id, context } = await body<{ restaurant_id?: string; context?: string }>(req);
  if (!restaurant_id || !UUID.test(restaurant_id)) throw new HttpError(400, "Restaurant manquant");
  const db = admin();

  const cronSecret = Deno.env.get("CRON_SECRET");
  const fromCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
  if (!fromCron && !(await callerRole(db, req, restaurant_id))) {
    throw new HttpError(403, "Accès refusé");
  }

  const today = localDate(new Date());
  const note = String(context || "").trim().slice(0, 300);

  // Limite les appels répétés (coût) : une prévision par minute au plus.
  const { data: existing } = await db.from("stock_forecasts").select("*")
    .eq("restaurant_id", restaurant_id).eq("for_date", today).maybeSingle();
  if (existing && !fromCron && Date.now() - Date.parse(existing.created_at) < 60_000 && existing.context === note) {
    return json(existing);
  }

  const { data: resto } = await db.from("restaurants").select("info, menu, active").eq("id", restaurant_id).maybeSingle();
  if (!resto) throw new HttpError(404, "Restaurant introuvable");
  if (fromCron && !resto.active) return json({ skipped: true });
  const items = ((resto.menu?.items || []) as MenuItem[]);
  if (!items.length) throw new HttpError(400, "La carte est vide.");

  const history = await salesHistory(db, restaurant_id, today);
  const { data: stockRows } = await db.from("item_stock").select("item_id, quantity").eq("restaurant_id", restaurant_id);
  const stock = Object.fromEntries((stockRows || []).map((s) => [s.item_id, s.quantity]));

  const base = baseline(items, history, today);
  let forecast: Forecast = base;
  if (Deno.env.get("ANTHROPIC_API_KEY") && history.openDays.length) {
    try {
      forecast = await askClaude(resto.info?.name || "Restaurant", items, history, stock, base, today, note);
    } catch (err) {
      console.error("Prévision IA indisponible, base statistique utilisée :", err);
    }
  }

  const row = {
    restaurant_id,
    for_date: today,
    items: forecast.items,
    summary: forecast.summary,
    alerts: forecast.alerts,
    context: note,
    source: forecast.source,
    created_at: new Date().toISOString(),
  };
  const { error } = await db.from("stock_forecasts").upsert(row);
  if (error) throw error;
  return json(row);
});

/* ---------------- Historique des ventes ---------------- */
interface History {
  openDays: string[]; // jours avec au moins une commande (8 dernières semaines)
  sold: Record<string, Record<string, number>>; // itemId -> jour -> quantité
}

async function salesHistory(db: Db, restaurantId: string, today: string): Promise<History> {
  const since = new Date(Date.parse(addDays(today, -56) + "T00:00:00Z") - 2 * 3600_000).toISOString();
  const sold: History["sold"] = {};
  const open = new Set<string>();
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from("orders").select("lines, payment, created_at")
      .eq("restaurant_id", restaurantId).gte("created_at", since)
      .order("created_at", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    for (const o of data || []) {
      if (o.payment?.status === "awaiting") continue;
      const day = localDate(new Date(o.created_at));
      if (day >= today) continue;
      open.add(day);
      for (const l of (o.lines || []) as { itemId: string; qty: number }[]) {
        (sold[l.itemId] ||= {})[day] = (sold[l.itemId][day] || 0) + (Number(l.qty) || 0);
      }
    }
    if (!data || data.length < 1000) break;
  }
  return { openDays: [...open].sort(), sold };
}

/* ---------------- Base statistique ---------------- */
// Moyenne pondérée des mêmes jours de semaine (les plus récents comptent
// davantage), sinon moyenne des 14 derniers jours ouverts, + 15 % de marge.
function baseline(items: MenuItem[], h: History, today: string): Forecast {
  const wd = weekday(today);
  const same = h.openDays.filter((d) => weekday(d) === wd).slice(-8);
  const recent = h.openDays.slice(-14);
  const out: Suggestion[] = [];
  for (const it of items) {
    const s = h.sold[it.id];
    if (!s) continue;
    let avg: number;
    let reason: string;
    if (same.length >= 2) {
      let w = 0, sum = 0;
      same.forEach((d, i) => { const k = i + 1; sum += (s[d] || 0) * k; w += k; });
      avg = sum / w;
      reason = `Moyenne des ${same.length} derniers ${DAYS[wd]}s`;
    } else {
      avg = recent.reduce((acc, d) => acc + (s[d] || 0), 0) / Math.max(1, recent.length);
      reason = `Moyenne des ${recent.length} derniers jours d’ouverture`;
    }
    if (avg <= 0) continue;
    out.push({ itemId: it.id, quantity: Math.ceil(avg * 1.15), reason: `${reason} (${avg.toFixed(1)}) + 15 % de marge` });
  }
  return {
    summary: h.openDays.length
      ? `Prévision statistique pour ce ${DAYS[wd]}, basée sur ${h.openDays.length} jours de ventes.`
      : "Pas encore assez de ventes pour une prévision : revenez après quelques jours de service.",
    items: out,
    alerts: [],
    source: "statistique",
  };
}

/* ---------------- Claude ---------------- */
const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item_id: { type: "string" },
          quantity: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["item_id", "quantity", "reason"],
        additionalProperties: false,
      },
    },
    alerts: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "items", "alerts"],
  additionalProperties: false,
};

const SYSTEM = `Tu es le responsable des stocks d'un restaurant français qui utilise Tapigo (commande à table par NFC).
Chaque matin, tu prévois combien de portions de chaque produit l'équipe doit avoir en stock pour la journée.

Tu reçois, pour chaque produit de la carte : les ventes des mêmes jours de semaine sur les dernières semaines (de la plus ancienne à la plus récente), les ventes des 14 derniers jours d'ouverture, le stock actuel saisi par l'équipe (null = non suivi), et une base statistique déjà calculée.

Règles :
- Pars de la base statistique et ajuste-la quand les données le justifient : tendance nette à la hausse ou à la baisse, jour de semaine atypique, produit nouveau ou relancé, contexte du jour donné par l'équipe (météo, événement, groupe réservé…).
- Une rupture coûte une vente et déçoit le client ; un surplus de produits frais est jeté. Garde une marge raisonnable, plus faible pour les produits périssables chers.
- Ne propose que des produits présents dans la liste, avec leur item_id exact. Omets un produit s'il n'a pas de ventes et que rien ne justifie d'en prévoir.
- quantity est un nombre entier de portions pour toute la journée (0 ou plus).
- reason : une phrase courte en français, concrète, pour le personnel de cuisine (ex. « Les samedis récents tournent autour de 18, tendance en hausse »).
- summary : 1 à 2 phrases en français résumant la journée attendue.
- alerts : 0 à 4 points d'attention courts en français (produit en forte hausse, stock actuel insuffisant, produit qui ne se vend plus…). Liste vide s'il n'y a rien de notable.`;

async function askClaude(
  name: string,
  items: MenuItem[],
  h: History,
  stock: Record<string, number>,
  base: Forecast,
  today: string,
  note: string,
): Promise<Forecast> {
  const wd = weekday(today);
  const same = h.openDays.filter((d) => weekday(d) === wd).slice(-8);
  const recent = h.openDays.slice(-14);
  const baseBy = Object.fromEntries(base.items.map((s) => [s.itemId, s.quantity]));
  const data = {
    restaurant: name,
    date: today,
    jour: DAYS[wd],
    contexte_du_jour: note || null,
    jours_de_vente_connus: h.openDays.length,
    memes_jours_precedents: same,
    derniers_jours: recent,
    produits: items.map((it) => ({
      item_id: it.id,
      nom: it.name,
      categorie: it.category || null,
      prix: it.price ?? null,
      en_vente: it.available !== false,
      stock_actuel: it.id in stock ? stock[it.id] : null,
      ventes_memes_jours: same.map((d) => h.sold[it.id]?.[d] || 0),
      ventes_14_derniers_jours: recent.map((d) => h.sold[it.id]?.[d] || 0),
      base_statistique: baseBy[it.id] ?? 0,
    })),
  };

  const client = new Anthropic();
  // fallbacks "default" : si le modèle décline la requête, l'API la relance
  // automatiquement sur le modèle de secours recommandé par Anthropic.
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{
      role: "user",
      content: `Voici les données de vente. Prépare la prévision de stock du jour.\n\n${JSON.stringify(data)}`,
    }],
  });

  if (response.stop_reason === "refusal") throw new Error("Requête déclinée par le modèle");
  if (response.stop_reason === "max_tokens") throw new Error("Réponse tronquée");
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
  if (!text) throw new Error("Réponse vide");
  const parsed = JSON.parse(text) as { summary: string; items: { item_id: string; quantity: number; reason: string }[]; alerts: string[] };

  const known = new Set(items.map((i) => i.id));
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of parsed.items || []) {
    if (!known.has(s.item_id) || seen.has(s.item_id)) continue;
    const q = Math.round(Number(s.quantity));
    if (!Number.isFinite(q) || q < 0 || q > 100000) continue;
    seen.add(s.item_id);
    out.push({ itemId: s.item_id, quantity: q, reason: String(s.reason || "").slice(0, 240) });
  }
  return {
    summary: String(parsed.summary || base.summary).slice(0, 400),
    items: out,
    alerts: (parsed.alerts || []).map((a) => String(a).slice(0, 200)).slice(0, 4),
    source: "ia",
  };
}
