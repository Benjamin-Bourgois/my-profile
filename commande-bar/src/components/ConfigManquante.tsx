import { MessageScreen } from "@/components/MessageScreen";

/** Affiché tant que les variables d'environnement ne sont pas renseignées. */
export function ConfigManquante({ missing }: { missing: string[] }) {
  return (
    <MessageScreen icon="tool" title="Configuration incomplète">
      <p>Il manque ces réglages dans Vercel (Settings → Environment Variables) :</p>
      <ul className="mt-4 space-y-1 font-mono text-[13px] text-ink">
        {missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-4">Ajoute-les, puis relance un déploiement (Deployments → Redeploy).</p>
    </MessageScreen>
  );
}
