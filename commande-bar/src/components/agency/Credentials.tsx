"use client";

import { useState } from "react";

import { Icon } from "@/components/Icon";

/** Identifiants à transmettre au client (le mot de passe n'est affiché qu'ici, une seule fois). */
export function Credentials({ loginUrl, email, password }: { loginUrl: string; email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Commande à table — vos identifiants\nAdresse : ${loginUrl}\nEmail : ${email}\nMot de passe : ${password}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copiez les identifiants :", text);
    }
  }

  return (
    <div className="rounded-md border border-gold bg-gold-soft px-4 py-3 text-[14px]">
      <p className="font-semibold">Identifiants à transmettre</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-ink-2">Adresse</dt>
        <dd className="break-all">{loginUrl}</dd>
        <dt className="text-ink-2">Email</dt>
        <dd className="break-all">{email}</dd>
        <dt className="text-ink-2">Mot de passe</dt>
        <dd className="font-mono text-[15px] font-semibold tracking-wide">{password}</dd>
      </dl>
      <button type="button" onClick={copy} className="btn btn--soft btn--sm mt-3">
        <Icon name={copied ? "check" : "copy"} size={15} />
        {copied ? "Copié" : "Copier les identifiants"}
      </button>
      <p className="mt-2 text-[12px] text-ink-2">Le mot de passe ne sera plus affiché. Vous pourrez en donner un nouveau à tout moment.</p>
    </div>
  );
}
