"use client";

import { useState } from "react";

import { ImageField } from "@/components/admin/ImageField";
import { Field, inputClass } from "@/components/admin/ProductForm";
import { Toggle } from "@/components/admin/Toggle";
import { Icon } from "@/components/Icon";
import type { AdminSettings } from "@/lib/admin-types";
import { useAdminAction } from "@/lib/use-admin-action";

export function SettingsForm({ settings, stripeConfigured }: { settings: AdminSettings; stripeConfigured: boolean }) {
  const { run, error } = useAdminAction();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(settings.name);
  const [logoUrl, setLogoUrl] = useState<string | null>(settings.logo_url);
  const [payToStaff, setPayToStaff] = useState(settings.pay_to_staff_enabled);
  const [online, setOnline] = useState(settings.online_payment_enabled);
  const [saved, setSaved] = useState(false);

  const customersCanOrder = payToStaff || (online && stripeConfigured);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);
    setSaving(true);
    const result = await run("admin_update_settings", {
      p_venue_id: settings.id,
      p_settings: { name, logo_url: logoUrl, pay_to_staff_enabled: payToStaff, online_payment_enabled: online },
    });
    setSaving(false);
    if (result.ok) setSaved(true);
  }

  return (
    <form onSubmit={save} className="max-w-2xl space-y-5" onChange={() => setSaved(false)}>
      <h2 className="text-[30px]">Réglages</h2>

      <section className="card grid gap-4 !p-5">
        <Field label="Nom du bar (affiché aux clients)">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className={inputClass} />
        </Field>
        <div className="field">
          <span>Logo (facultatif, carré de préférence)</span>
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
      </section>

      <section className="card grid gap-3 !p-5">
        <h3 className="text-[24px]">Paiement</h3>
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
          <p className="flex gap-2 rounded-md bg-warn-soft px-4 py-3 text-warn-ink">
            <Icon name="alert" className="mt-0.5" />
            Aucun mode de paiement disponible : les clients pourront voir la carte mais pas commander.
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button type="submit" disabled={saving} className="btn btn--primary">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        {saved && (
          <span className="badge badge--ok">
            <Icon name="check" size={12} />
            Enregistré
          </span>
        )}
      </div>
    </form>
  );
}

function Setting({ title, text, checked, onChange }: { title: string; text: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-line pt-3 first-of-type:border-0">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-[13px] text-ink-2">{text}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}
