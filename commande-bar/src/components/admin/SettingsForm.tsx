"use client";

import { useState } from "react";

import { ImageField } from "@/components/admin/ImageField";
import { Field, inputClass } from "@/components/admin/ProductForm";
import { Toggle } from "@/components/admin/Toggle";
import type { AdminSettings } from "@/lib/admin-types";
import { useAdminRpc } from "@/lib/use-admin-rpc";

export function SettingsForm({ settings, stripeConfigured }: { settings: AdminSettings; stripeConfigured: boolean }) {
  const { call, busy, error } = useAdminRpc();
  const [name, setName] = useState(settings.name);
  const [logoUrl, setLogoUrl] = useState<string | null>(settings.logo_url);
  const [payToStaff, setPayToStaff] = useState(settings.pay_to_staff_enabled);
  const [online, setOnline] = useState(settings.online_payment_enabled);
  const [saved, setSaved] = useState(false);

  const customersCanOrder = payToStaff || (online && stripeConfigured);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);
    const result = await call("admin_update_settings", {
      p_venue_id: settings.id,
      p_settings: { name, logo_url: logoUrl, pay_to_staff_enabled: payToStaff, online_payment_enabled: online },
    });
    if (result.ok) setSaved(true);
  }

  return (
    <form onSubmit={save} className="max-w-2xl space-y-6" onChange={() => setSaved(false)}>
      <h2 className="text-2xl font-bold">Réglages</h2>

      <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
        <Field label="Nom du bar (affiché aux clients)">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className={inputClass} />
        </Field>
        <div>
          <span className="text-sm font-semibold text-stone-700">Logo (facultatif, carré de préférence)</span>
          <div className="mt-1">
            <ImageField
              venueId={settings.id}
              folder="logo"
              value={logoUrl}
              onChange={(url) => {
                setLogoUrl(url);
                setSaved(false);
              }}
              maxSize={512}
              format="image/png"
              emptyLabel="Pas de logo"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
        <h3 className="text-lg font-bold">Paiement</h3>
        <Setting
          title="Payer au serveur"
          text="Le client commande sans payer ; la commande arrive au bar « À encaisser »."
          checked={payToStaff}
          onChange={setPayToStaff}
        />
        <Setting
          title="Paiement en ligne (carte, Apple Pay, Google Pay)"
          text={
            stripeConfigured
              ? "Le client paie sur la page sécurisée Stripe ; la commande arrive au bar « Payé en ligne »."
              : "Stripe n'est pas encore configuré (voir le README) : cette option n'est pas proposée aux clients pour l'instant."
          }
          checked={online}
          onChange={setOnline}
        />
        {!customersCanOrder && (
          <p className="rounded-xl bg-amber-100 px-4 py-3 text-amber-950">
            ⚠️ Aucun mode de paiement disponible : les clients pourront voir la carte mais pas commander.
          </p>
        )}
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-100 px-4 py-3 text-red-900">{error}</p>}
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy} className="h-12 rounded-xl bg-stone-900 px-6 font-bold text-white disabled:opacity-50">
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        {saved && <span className="font-semibold text-green-700">✓ Enregistré</span>}
      </div>
    </form>
  );
}

function Setting({ title, text, checked, onChange }: { title: string; text: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-stone-500">{text}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}
