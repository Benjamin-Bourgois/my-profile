import Link from "next/link";

import { Icon, type IconName } from "@/components/Icon";
import { riseStyle } from "@/lib/style";

const steps: { icon: IconName; title: string; text: string }[] = [
  { icon: "phone", title: "Le client approche son téléphone", text: "de la carte posée sur la table (puce NFC ou QR code). Aucune application à installer." },
  { icon: "glass", title: "Il commande et paie", text: "depuis la carte du bar, en quelques secondes." },
  { icon: "bell", title: "Le bar est prévenu", text: "instantanément, avec le numéro de table. Le serveur n'a plus qu'à apporter la commande." },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[680px] flex-col px-4 py-16">
      <span aria-hidden className="grid h-14 w-14 place-items-center rounded-full bg-matte font-serif text-[30px] font-semibold italic text-sand">
        T
      </span>
      <p className="eyebrow mt-8">Commande à table</p>
      <h1 className="mt-2 text-[clamp(38px,9vw,58px)]">Vos clients commandent depuis leur table.</h1>
      <p className="mt-4 text-[17px] text-ink-2">Moins d&apos;attente pour vos clients, plus de temps pour votre équipe.</p>

      <ol className="mt-10 grid gap-3">
        {steps.map((step, index) => (
          <li key={step.title} className="card rise flex gap-4 !p-4" style={riseStyle(index)}>
            <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sand-2 text-ink">
              <Icon name={step.icon} size={20} />
            </span>
            <p className="pt-0.5 text-ink-2">
              <strong className="block font-serif text-[21px] font-semibold text-ink">{step.title}</strong>
              {step.text}
            </p>
          </li>
        ))}
      </ol>

      <footer className="mt-auto flex flex-wrap items-center gap-2 pt-14">
        <span className="mr-2 text-ink-2">Vous travaillez dans un bar ?</span>
        <Link href="/bar" className="btn btn--ghost btn--sm">
          Écran du bar
        </Link>
        <Link href="/admin" className="btn btn--ghost btn--sm">
          Espace gérant
        </Link>
      </footer>
    </main>
  );
}
