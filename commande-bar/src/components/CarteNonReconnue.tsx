import { MessageScreen } from "@/components/MessageScreen";

export function CarteNonReconnue() {
  return (
    <MessageScreen icon="🤔" title="Carte non reconnue">
      <p>Demandez au serveur, il va vous aider.</p>
    </MessageScreen>
  );
}
