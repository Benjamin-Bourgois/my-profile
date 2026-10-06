"use client";

import Link from "next/link";
import { useOptimistic, useState } from "react";

import { IconButton, SavingIndicator, SmallButton } from "@/components/admin/MenuManager";
import { inputClass } from "@/components/admin/ProductForm";
import { tablesReducer, type TablesAction } from "@/lib/admin-reducers";
import type { TableWithLink } from "@/lib/admin-types";
import { useAdminAction } from "@/lib/use-admin-action";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Ancien navigateur : sélection + copie
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** Tables du bar et leurs cartes NFC / QR codes. */
export function TablesManager({ venueId, tables: serverTables }: { venueId: string; tables: TableWithLink[] }) {
  const { run, pending, error } = useAdminAction();
  // Tables affichées = tables du serveur + changements en cours d'enregistrement
  const [tables, applyOptimistic] = useOptimistic(serverTables, tablesReducer);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  /** Modification avec mise à jour immédiate de l'écran. */
  const act = (fn: string, args: Record<string, unknown>, action: TablesAction) => run(fn, args, () => applyOptimistic(action));

  async function addTable(event: React.FormEvent) {
    event.preventDefault();
    setAdding(true);
    const result = await run("admin_save_table", { p_venue_id: venueId, p_table_id: null, p_label: newLabel });
    setAdding(false);
    if (result.ok) setNewLabel("");
  }

  function rename(event: React.FormEvent) {
    event.preventDefault();
    if (!renaming) return;
    act("admin_save_table", { p_venue_id: venueId, p_table_id: renaming.id, p_label: renaming.label }, {
      type: "rename",
      tableId: renaming.id,
      label: renaming.label,
    });
    setRenaming(null);
  }

  async function regenerate(table: TableWithLink) {
    setRegeneratingId(table.id);
    await run("regenerate_table_token", { p_table_id: table.id });
    setRegeneratingId(null);
  }

  const move = (id: string, direction: -1 | 1) =>
    act("admin_move", { p_kind: "table", p_id: id, p_direction: direction }, { type: "move", tableId: id, direction });

  async function copy(table: TableWithLink) {
    if (await copyText(table.url)) {
      setCopiedId(table.id);
      window.setTimeout(() => setCopiedId((id) => (id === table.id ? null : id)), 2000);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Tables & cartes NFC</h2>
          <p className="text-stone-600">Une table = un lien secret = une carte NFC (et son QR code de secours).</p>
        </div>
        <SavingIndicator pending={pending} />
        <Link href="/admin/tables/imprimer" className="flex h-11 items-center rounded-xl bg-white px-4 font-semibold ring-1 ring-stone-300">
          🖨️ Imprimer les QR codes
        </Link>
      </div>

      <details className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
        <summary className="cursor-pointer font-semibold">Comment programmer une carte NFC ?</summary>
        <ol className="mt-3 list-decimal space-y-1 pl-6 text-stone-700">
          <li>Installez l&apos;application gratuite <strong>NFC Tools</strong> sur votre téléphone.</li>
          <li>Ici, touchez <strong>Copier le lien</strong> de la table, puis ouvrez NFC Tools.</li>
          <li>
            <strong>Écrire</strong> → <strong>Ajouter un enregistrement</strong> → <strong>URL / URI</strong> → collez le lien →{" "}
            <strong>Écrire</strong>, puis approchez la carte.
          </li>
          <li>
            Une fois la carte posée sur la table, verrouillez-la (NFC Tools → Autres → Verrouiller le tag) pour que personne ne
            puisse la réécrire. C&apos;est définitif.
          </li>
        </ol>
        <p className="mt-3 text-stone-700">
          Renommer ou déplacer une table ne change pas son lien : <strong>pas besoin de reprogrammer la carte</strong>. Une carte
          perdue ou volée ? <strong>Nouveau lien</strong> : l&apos;ancienne carte ne fonctionne plus.
        </p>
      </details>

      {error && (
        <p role="alert" className="sticky top-2 z-10 rounded-xl bg-red-100 px-4 py-3 text-red-900 shadow">
          {error}
        </p>
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        {tables.map((table, index) => (
          <li key={table.id} className={`flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200 ${table.is_active ? "" : "opacity-60"}`}>
            <img src={`data:image/svg+xml;utf8,${encodeURIComponent(table.qrSvg)}`} alt={`QR code de ${table.label}`} className="h-28 w-28 shrink-0 rounded-lg bg-white" />
            <div className="min-w-0 flex-1 space-y-2">
              {renaming?.id === table.id ? (
                <form onSubmit={rename} className="flex gap-2">
                  <input
                    autoFocus
                    value={renaming.label}
                    onChange={(e) => setRenaming({ id: table.id, label: e.target.value })}
                    maxLength={40}
                    aria-label="Nouveau nom de la table"
                    className="h-10 min-w-0 flex-1 rounded-xl border border-stone-300 px-3"
                  />
                  <SmallButton type="submit">OK</SmallButton>
                  <SmallButton onClick={() => setRenaming(null)}>✕</SmallButton>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-black">{table.label}</h3>
                  {!table.is_active && <span className="rounded-full bg-stone-200 px-2 py-0.5 text-sm font-semibold">Désactivée</span>}
                </div>
              )}
              <p className="break-all font-mono text-xs text-stone-500">{table.url}</p>
              <div className="flex flex-wrap gap-1.5">
                <SmallButton onClick={() => copy(table)}>{copiedId === table.id ? "✓ Copié" : "Copier le lien"}</SmallButton>
                <a href={`/api/admin/qr?table=${table.id}`} className="flex h-10 items-center rounded-xl bg-stone-200 px-3 text-sm font-semibold text-stone-800 hover:bg-stone-300">
                  QR code (PNG)
                </a>
                <a href={table.url} target="_blank" rel="noreferrer" className="flex h-10 items-center rounded-xl bg-stone-200 px-3 text-sm font-semibold text-stone-800 hover:bg-stone-300">
                  Tester ↗
                </a>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <IconButton label={`Monter ${table.label}`} disabled={index === 0} onClick={() => move(table.id, -1)}>
                  ↑
                </IconButton>
                <IconButton
                  label={`Descendre ${table.label}`}
                  disabled={index === tables.length - 1}
                  onClick={() => move(table.id, 1)}
                >
                  ↓
                </IconButton>
                <SmallButton onClick={() => setRenaming({ id: table.id, label: table.label })}>Renommer</SmallButton>
                <SmallButton
                  onClick={() =>
                    act(
                      "admin_set_table_active",
                      { p_table_id: table.id, p_active: !table.is_active },
                      { type: "active", tableId: table.id, value: !table.is_active },
                    )
                  }
                >
                  {table.is_active ? "Désactiver" : "Réactiver"}
                </SmallButton>
                <SmallButton
                  disabled={regeneratingId === table.id}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Créer un nouveau lien pour « ${table.label} » ?\n\nL'ancienne carte NFC et l'ancien QR code ne fonctionneront plus : il faudra reprogrammer la carte et réimprimer le QR code.`,
                      )
                    ) {
                      regenerate(table);
                    }
                  }}
                >
                  {regeneratingId === table.id ? "Nouveau lien…" : "Nouveau lien"}
                </SmallButton>
                <SmallButton
                  onClick={() => {
                    if (window.confirm(`Supprimer « ${table.label} » ? Sa carte NFC ne fonctionnera plus. L'historique des commandes est conservé.`)) {
                      act("admin_delete_table", { p_table_id: table.id }, { type: "delete", tableId: table.id });
                    }
                  }}
                >
                  Supprimer
                </SmallButton>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={addTable} className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <label className="min-w-56 flex-1">
          <span className="text-sm font-semibold text-stone-700">Nouvelle table</span>
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={40} placeholder="Ex. : Table 11, Terrasse 2, Comptoir" className={inputClass} />
        </label>
        <button type="submit" disabled={adding || !newLabel.trim()} className="h-12 rounded-xl bg-stone-900 px-5 font-bold text-white disabled:opacity-50">
          {adding ? "Ajout…" : "Ajouter la table"}
        </button>
      </form>
    </div>
  );
}
