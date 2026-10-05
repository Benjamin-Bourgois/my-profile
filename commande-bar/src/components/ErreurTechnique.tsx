import { MessageScreen } from "@/components/MessageScreen";

export function ErreurTechnique({ hint }: { hint: string }) {
  return (
    <MessageScreen icon="😕" title="Petit souci technique">
      <p>Réessayez dans un instant, ou demandez au serveur.</p>
      <p className="mt-6 whitespace-pre-line rounded-lg bg-stone-100 px-4 py-3 text-left text-sm text-stone-500">{hint}</p>
    </MessageScreen>
  );
}
