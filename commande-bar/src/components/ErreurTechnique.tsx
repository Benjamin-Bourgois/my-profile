import { MessageScreen } from "@/components/MessageScreen";

export function ErreurTechnique({ hint }: { hint: string }) {
  return (
    <MessageScreen icon="alert" title="Petit souci technique">
      <p>Réessayez dans un instant, ou demandez au serveur.</p>
      <p className="mt-6 whitespace-pre-line rounded-md border border-line bg-sand-2 px-4 py-3 text-left text-[13px] text-ink-2">{hint}</p>
    </MessageScreen>
  );
}
