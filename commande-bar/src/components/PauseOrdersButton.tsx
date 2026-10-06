"use client";

import { Icon } from "@/components/Icon";

const PAUSE_CONFIRM =
  "Mettre les commandes en pause ?\n\nLes clients ne pourront plus commander depuis leur téléphone (ils pourront toujours appeler un serveur).";

/** « Commandes en pause » : bouton commun à l'écran du bar et à l'espace gérant. */
export function PauseOrdersButton({
  paused,
  onToggle,
  disabled,
}: {
  paused: boolean;
  onToggle: (paused: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={paused}
      onClick={() => {
        if (!paused && !window.confirm(PAUSE_CONFIRM)) return;
        onToggle(!paused);
      }}
      className={`btn btn--sm ${paused ? "btn--danger bg-danger-soft" : "btn--ghost"}`}
    >
      <Icon name={paused ? "play" : "pause"} size={16} />
      <span className="sm:hidden">{paused ? "Reprendre" : "Pause"}</span>
      <span className="max-sm:hidden">{paused ? "Reprendre les commandes" : "Pause des commandes"}</span>
    </button>
  );
}
