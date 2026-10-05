"use client";

// Signal sonore et écran toujours allumé, pour la tablette du bar.

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<unknown> } };

/** À appeler suite à un appui (les navigateurs bloquent le son sans action de l'utilisateur). */
export async function unlockAudio(existing: AudioContext | null): Promise<AudioContext> {
  const nav = navigator as AudioSessionNavigator;
  // iPhone / iPad : le son passe même si le bouton « silencieux » est activé.
  if (nav.audioSession) nav.audioSession.type = "playback";
  const context = existing ?? new AudioContext();
  await context.resume();
  return context;
}

/** « Ding-dong » de nouvelle commande. */
export function playChime(context: AudioContext) {
  const start = context.currentTime + 0.05;
  [
    { frequency: 988, at: 0 },
    { frequency: 1319, at: 0.22 },
    { frequency: 988, at: 0.6 },
    { frequency: 1319, at: 0.82 },
  ].forEach(({ frequency, at }) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(0.7, start + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.5);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + at);
    oscillator.stop(start + at + 0.55);
  });
}

/** Empêche la tablette de se mettre en veille tant que l'écran du bar est affiché. */
export async function keepScreenOn() {
  try {
    await (navigator as WakeLockNavigator).wakeLock?.request("screen");
  } catch {
    // non disponible : régler la mise en veille de la tablette sur « jamais »
  }
}
