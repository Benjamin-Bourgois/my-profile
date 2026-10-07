import type { ReactNode } from "react";

import { niceTicks } from "@/lib/stats";

// Graphiques de la charte : une seule teinte (--chart), barres fines aux bouts
// arrondis, grille en filets clairs. Rendu côté serveur, sans bibliothèque :
// les valeurs s'affichent au survol ou au clavier (Tab), et chaque graphique a
// son tableau de chiffres.

/** Étapes de la carte de chaleur (du plus clair au plus foncé), validées pour le contraste. */
export const HEAT_STEPS = ["#c9ab7c", "#b88f51", "#a8772b", "#845f26", "#604720"];

export function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card min-w-0 !p-5 ${className ?? ""}`}>
      <h3 className="text-[22px]">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Contenu d'une bulle : la valeur d'abord, puis les précisions, puis ce qu'elle désigne. */
type Tooltip = { value: string; lines: string[]; title: string };

const tooltipText = (t: Tooltip) => `${t.title} : ${[t.value, ...t.lines].join(", ")}`;

/** Bulle affichée au survol / au focus d'une barre. */
function TooltipBox({ tooltip, align }: { tooltip: Tooltip; align: "start" | "center" | "end" }) {
  const position = align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute bottom-full z-20 mb-1.5 hidden w-max max-w-[220px] rounded-sm bg-matte px-3 py-2 text-left text-[12px] leading-snug text-white shadow-float group-hover:block group-focus-visible:block ${position}`}
    >
      <strong className="block text-[14px] tabular-nums">{tooltip.value}</strong>
      {tooltip.lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
      <span className="mt-0.5 block text-white/70">{tooltip.title}</span>
    </div>
  );
}

export type ColumnPoint = { key: string; label: string; value: number; tooltip: Tooltip };

/**
 * Histogramme vertical, une seule série. `formatTick` met en forme l'axe ;
 * la plus haute barre porte son étiquette (les autres : survol ou tableau).
 */
export function ColumnChart({
  points,
  formatTick,
  formatValue,
  ariaLabel,
  height = 180,
  maxLabels = 8,
  labelMax = true,
}: {
  points: ColumnPoint[];
  formatTick: (value: number) => string;
  formatValue: (value: number) => string;
  ariaLabel: string;
  height?: number;
  maxLabels?: number;
  labelMax?: boolean;
}) {
  const max = Math.max(0, ...points.map((p) => p.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const maxIndex = points.findIndex((p) => p.value === max && max > 0);
  const every = Math.max(1, Math.ceil(points.length / maxLabels));

  return (
    <figure aria-label={ariaLabel} className="m-0 pt-4">
      <div className="flex gap-2">
        {/* Axe vertical */}
        <div className="relative w-12 shrink-0 text-right text-[11px] tabular-nums text-muted" style={{ height }}>
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(tick / top) * 100}%` }}>
              {formatTick(tick)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {ticks.map((tick) => (
              <div key={tick} aria-hidden className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(tick / top) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {points.map((point, index) => {
                const pct = (point.value / top) * 100;
                const align = index < points.length / 4 ? "start" : index > (points.length * 3) / 4 ? "end" : "center";
                return (
                  <div
                    key={point.key}
                    tabIndex={0}
                    aria-label={tooltipText(point.tooltip)}
                    className="group relative flex h-full min-w-0 flex-1 items-end justify-center rounded-[4px] outline-offset-0 hover:bg-sand-2/70 focus-visible:bg-sand-2/70"
                  >
                    {point.value > 0 && (
                      <div
                        className="w-full max-w-[24px] rounded-t-[4px] bg-chart transition-opacity duration-150 group-hover:opacity-80"
                        style={{ height: `${pct}%` }}
                      />
                    )}
                    {labelMax && index === maxIndex && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold tabular-nums text-ink-2"
                        style={{ bottom: `calc(${pct}% + 4px)` }}
                      >
                        {formatValue(point.value)}
                      </span>
                    )}
                    <TooltipBox tooltip={point.tooltip} align={align} />
                  </div>
                );
              })}
            </div>
          </div>
          {/* Axe horizontal */}
          <div aria-hidden className="mt-1.5 flex gap-[2px] text-[11px] text-muted">
            {points.map((point, index) => (
              <span
                key={point.key}
                className={`min-w-0 flex-1 overflow-visible whitespace-nowrap text-center ${
                  // Sur téléphone, une étiquette sur deux quand il y en a beaucoup
                  points.length > 12 && (index / every) % 2 === 1 ? "max-sm:invisible" : ""
                }`}
              >
                {index % every === 0 ? point.label : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

export type BarRow = { key: string; label: string; value: number; display: string; detail?: string };

/** Barres horizontales classées, valeur au bout de la barre. */
export function BarList({ rows, ariaLabel }: { rows: BarRow[]; ariaLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul aria-label={ariaLabel} className="grid gap-2.5">
      {rows.map((row) => (
        <li key={row.key} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate font-semibold">{row.label}</span>
            {row.detail && <span className="shrink-0 text-[12px] text-muted">{row.detail}</span>}
          </div>
          <div className="flex items-center gap-2">
            <div
              className="h-3.5 rounded-r-[4px] bg-chart"
              style={{ width: `calc((100% - 6.5rem) * ${row.value / max})`, minWidth: row.value > 0 ? 2 : 0 }}
            />
            <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-ink-2">{row.display}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Part d'un total (ex. payé en ligne / au bar) : jauge et légende. */
export function Meter({
  value,
  total,
  labels,
}: {
  value: number;
  total: number;
  labels: [string, string];
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${labels[0]} : ${pct} %`}
        className="flex h-3.5 overflow-hidden rounded-full bg-gold-soft"
      >
        <div className="h-full rounded-l-full bg-chart" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-3 grid gap-1.5 text-[14px]">
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 shrink-0 rounded-[3px] bg-chart" />
          <span className="flex-1">{labels[0]}</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 shrink-0 rounded-[3px] border border-line bg-gold-soft" />
          <span className="flex-1">{labels[1]}</span>
        </li>
      </ul>
    </div>
  );
}

/** Carte de chaleur jours × heures (nombre de commandes). */
export function Heatmap({
  rows,
  columns,
  value,
  rowLabel,
  columnLabel,
  cellTitle,
}: {
  rows: number[];
  columns: number[];
  value: (row: number, column: number) => number;
  rowLabel: (row: number) => string;
  columnLabel: (column: number) => string;
  cellTitle: (row: number, column: number) => string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => columns.map((c) => value(r, c))));
  const step = (v: number) => (v <= 0 ? -1 : Math.min(HEAT_STEPS.length - 1, Math.ceil((v / max) * HEAT_STEPS.length) - 1));

  return (
    <div>
      <div className="no-scrollbar overflow-x-auto pb-1">
        <div
          role="img"
          aria-label="Carte de chaleur des commandes par jour et par heure (détail dans le tableau ci-dessous)"
          className="grid min-w-max gap-[2px]"
          style={{ gridTemplateColumns: `2.6rem repeat(${columns.length}, minmax(24px, 1fr))` }}
        >
          <span />
          {columns.map((column) => (
            <span key={column} className="pb-1 text-center text-[11px] text-muted">
              {columnLabel(column)}
            </span>
          ))}
          {rows.map((row) => (
            <div key={row} className="contents">
              <span className="flex items-center text-[12px] font-semibold text-ink-2">{rowLabel(row)}</span>
              {columns.map((column, index) => {
                const v = value(row, column);
                const s = step(v);
                const align = index < columns.length / 3 ? "start" : index > (columns.length * 2) / 3 ? "end" : "center";
                return (
                  <div key={column} className="group relative h-7">
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-[4px] transition-opacity duration-150 group-hover:opacity-75"
                      style={{ background: s < 0 ? "var(--sand-2)" : HEAT_STEPS[s] }}
                    />
                    <TooltipBox tooltip={{ value: `${v} commande${v > 1 ? "s" : ""}`, lines: [], title: cellTitle(row, column) }} align={align} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
        <span className="mr-1">Aucune</span>
        <span className="h-3 w-5 rounded-[3px] border border-line bg-sand-2" />
        <span className="mx-1">Peu</span>
        {HEAT_STEPS.map((color) => (
          <span key={color} className="h-3 w-5 rounded-[3px]" style={{ background: color }} />
        ))}
        <span className="ml-1">Beaucoup</span>
      </div>
    </div>
  );
}

/** Tableau des chiffres d'un graphique, replié par défaut. */
export function DataTable({
  caption,
  head,
  rows,
  numeric = [],
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
  numeric?: number[];
}) {
  return (
    <details className="mt-4 border-t border-line pt-3">
      <summary className="text-[13px] font-semibold text-ink-2">Voir les chiffres</summary>
      <div className="mt-2 max-h-80 overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`sticky top-0 border-b border-line bg-card py-1.5 pr-3 font-semibold text-ink-2 ${numeric.includes(i) ? "text-right" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-b border-line/60 last:border-0">
                {row.map((cell, i) => (
                  <td key={i} className={`py-1.5 pr-3 ${numeric.includes(i) ? "text-right tabular-nums" : ""}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
