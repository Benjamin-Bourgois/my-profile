"use client";

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
      className={`h-11 rounded-xl px-4 font-semibold disabled:opacity-60 ${
        paused ? "bg-red-600 text-white active:bg-red-700" : "bg-stone-700 text-white active:bg-stone-600"
      }`}
    >
      {paused ? "▶ Reprendre les commandes" : "⏸️ Pause des commandes"}
    </button>
  );
}
