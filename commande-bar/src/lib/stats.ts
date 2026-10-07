// Statistiques du gérant : types renvoyés par admin_get_stats(), choix de la
// période, regroupements et mises en forme.

export type StatsTotals = {
  revenue_cents: number;
  orders: number;
  avg_basket_cents: number;
  items: number;
  tips_cents: number;
  tip_orders: number;
  online_cents: number;
  online_orders: number;
  staff_cents: number;
  staff_orders: number;
  to_collect_cents: number;
  cancelled: number;
  tables: number;
  active_days: number;
  comments: number;
};

export type StatsData = {
  range: {
    from: string;
    to: string;
    days: number;
    previous_from: string;
    previous_to: string;
    today: string;
    timezone: string;
  };
  totals: StatsTotals;
  previous: {
    revenue_cents: number;
    orders: number;
    avg_basket_cents: number;
    items: number;
    tips_cents: number;
    avg_service_seconds: number | null;
  };
  by_day: { date: string; revenue_cents: number; orders: number }[];
  by_hour: { hour: number; orders: number; revenue_cents: number }[];
  by_weekday: { weekday: number; days: number; revenue_cents: number; orders: number }[];
  heatmap: { weekday: number; hour: number; orders: number }[];
  products: { name: string; quantity: number; revenue_cents: number; orders: number }[];
  categories: { name: string; quantity: number; revenue_cents: number }[];
  unsold: { name: string; available: boolean }[];
  tables: { label: string; orders: number; revenue_cents: number; avg_basket_cents: number; tips_cents: number }[];
  service: {
    measured: number;
    avg_seconds: number | null;
    median_seconds: number | null;
    within_10_min: number;
    buckets: [number, number, number, number, number];
    avg_pickup_seconds: number | null;
  };
  calls: { waiter: number; bill: number; unanswered: number; avg_response_seconds: number | null };
};

/* ------------------------------------------------------------------ */
/* Période                                                             */
/* ------------------------------------------------------------------ */

export const PERIOD_PRESETS = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
  { days: 365, label: "12 mois" },
] as const;

export type PeriodRequest = { days: number; from: string | null; to: string | null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  return Number.isNaN(Date.parse(`${value}T12:00:00Z`)) ? null : value;
}

/** ?periode=30 ou ?du=2026-09-01&au=2026-09-30 (30 derniers jours par défaut). */
export function parsePeriod(params: Record<string, string | string[] | undefined>): PeriodRequest {
  const from = validDate(params.du);
  const to = validDate(params.au);
  if (from || to) return { days: 30, from, to };
  const days = Number(params.periode);
  const preset = PERIOD_PRESETS.find((p) => p.days === days);
  return { days: preset?.days ?? 30, from: null, to: null };
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const utc = (date: string) => new Date(`${date}T12:00:00Z`);
const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: "UTC" });
const dayShort = fmt({ day: "numeric", month: "numeric" });
const dayLong = fmt({ weekday: "long", day: "numeric", month: "long" });
const dayMedium = fmt({ day: "numeric", month: "short", year: "numeric" });
const monthShort = fmt({ month: "short" });
const monthLong = fmt({ month: "long", year: "numeric" });

export function formatDayMedium(date: string): string {
  return dayMedium.format(utc(date));
}

/** « 30 derniers jours » ou « du 1 sept. 2026 au 30 sept. 2026 » */
export function periodLabel(range: StatsData["range"], request: PeriodRequest): string {
  if (!request.from && !request.to && range.to === range.today) {
    return range.days === 365 || range.days === 366 ? "12 derniers mois" : `${range.days} derniers jours`;
  }
  return range.from === range.to
    ? `le ${formatDayMedium(range.from)}`
    : `du ${formatDayMedium(range.from)} au ${formatDayMedium(range.to)}`;
}

export const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
export const WEEKDAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/* ------------------------------------------------------------------ */
/* Regroupement du chiffre d'affaires : par jour, semaine ou mois      */
/* ------------------------------------------------------------------ */

export type Bucket = { key: string; label: string; title: string; revenue_cents: number; orders: number };

export function bucketByDay(days: StatsData["by_day"]): { unit: string; buckets: Bucket[] } {
  if (days.length <= 31) {
    return {
      unit: "jour",
      buckets: days.map((d) => ({
        key: d.date,
        label: dayShort.format(utc(d.date)),
        title: dayLong.format(utc(d.date)),
        revenue_cents: d.revenue_cents,
        orders: d.orders,
      })),
    };
  }

  const byWeek = days.length <= 120;
  const groups = new Map<string, Bucket & { last: string }>();
  for (const d of days) {
    const date = utc(d.date);
    let key: string;
    if (byWeek) {
      const monday = new Date(date);
      monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      key = monday.toISOString().slice(0, 10);
    } else {
      key = d.date.slice(0, 7);
    }
    const group = groups.get(key) ?? {
      key,
      label: byWeek ? dayShort.format(utc(key)) : monthShort.format(date),
      title: byWeek ? "" : monthLong.format(date),
      revenue_cents: 0,
      orders: 0,
      last: d.date,
    };
    group.revenue_cents += d.revenue_cents;
    group.orders += d.orders;
    group.last = d.date;
    groups.set(key, group);
  }
  const first = days[0]?.date;
  return {
    unit: byWeek ? "semaine" : "mois",
    buckets: [...groups.values()].map(({ last, ...group }) => ({
      ...group,
      title: byWeek
        ? `Semaine du ${dayShort.format(utc(group.key < first ? first : group.key))} au ${dayShort.format(utc(last))}`
        : group.title,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Heures : de l'ouverture (5 h) à la fin de nuit, seulement les heures */
/* actives                                                             */
/* ------------------------------------------------------------------ */

const DAY_START_HOUR = 5;

/** Heures dans l'ordre d'une soirée (5 h → 4 h), réduites à la plage active. */
export function activeHours(hours: number[]): number[] {
  const order = Array.from({ length: 24 }, (_, i) => (i + DAY_START_HOUR) % 24);
  const positions = hours.map((h) => order.indexOf(h)).filter((i) => i >= 0);
  if (!positions.length) return [];
  const first = Math.max(0, Math.min(...positions) - 1);
  const last = Math.min(23, Math.max(...positions) + 1);
  return order.slice(first, last + 1);
}

export const hourLabel = (hour: number) => `${hour} h`;
export const hourRange = (hour: number) => `${hour} h – ${(hour + 1) % 24} h`;

/* ------------------------------------------------------------------ */
/* Nombres                                                             */
/* ------------------------------------------------------------------ */

const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("fr-FR");

/** 1250000 centimes → « 12,5 k € » (axes des graphiques) */
export function formatEurosCompact(cents: number): string {
  return `${compact.format(cents / 100)} €`;
}

export function formatInteger(value: number): string {
  return integer.format(value);
}

export function formatPercent(part: number, total: number): string {
  if (!total) return "0 %";
  return `${Math.round((part / total) * 100)} %`;
}

/** 694 → « 11 min 34 » ; 127 → « 2 min 07 » ; 45 → « 45 s » (espaces insécables : jamais coupé) */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}\u00a0s`;
  const minutes = Math.floor(s / 60);
  const rest = String(s % 60).padStart(2, "0");
  if (minutes >= 60) return `${Math.floor(minutes / 60)}\u00a0h\u00a0${String(minutes % 60).padStart(2, "0")}`;
  return `${minutes}\u00a0min\u00a0${rest}`;
}

/** Évolution par rapport à la période précédente (null si rien à comparer). */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

/** Graduations rondes pour un axe : 0, 500, 1 000, 1 500… */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const ticks: number[] = [];
  for (let value = 0; value < max + step; value += step) {
    ticks.push(value);
    if (value >= max) break;
  }
  return ticks;
}
