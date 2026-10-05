const steps = [
  { icon: "📱", title: "Le client approche son téléphone", text: "de la carte posée sur la table (puce NFC ou QR code). Aucune application à installer." },
  { icon: "🍹", title: "Il commande et paie", text: "depuis la carte du bar, en quelques secondes." },
  { icon: "🔔", title: "Le bar est prévenu", text: "instantanément, avec le numéro de table. Le serveur n'a plus qu'à apporter la commande." },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">Commande à table</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight text-stone-900">
        Vos clients commandent depuis leur table.
      </h1>
      <p className="mt-4 text-lg text-stone-600">
        Moins d&apos;attente pour vos clients, plus de temps pour votre équipe.
      </p>

      <ol className="mt-12 space-y-6">
        {steps.map((step) => (
          <li key={step.title} className="flex gap-4">
            <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-2xl shadow-sm ring-1 ring-stone-200">
              {step.icon}
            </span>
            <p className="pt-1 text-lg text-stone-700">
              <strong className="text-stone-900">{step.title}</strong> {step.text}
            </p>
          </li>
        ))}
      </ol>
    </main>
  );
}
