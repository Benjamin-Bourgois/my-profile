"use client";

// Sons et écran toujours allumé, pour la tablette du bar.
// Les sons sont de vrais fichiers (public/sons/, créés par scripts/generer-sons.mjs)
// joués par le lecteur audio du navigateur : sur iPhone / iPad, ils passent même en
// mode silencieux et restent autorisés après une mise en veille.

export type SoundName = "commande" | "appel";
export type BarSounds = Record<SoundName, HTMLAudioElement>;

type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<unknown> } };

let loaded: BarSounds | null = null;

function createSound(name: SoundName): HTMLAudioElement {
  const sound = new Audio(`/sons/${name}.wav`);
  sound.preload = "auto";
  return sound;
}

/** Télécharge les sons à l'ouverture de l'écran : l'activation est ensuite immédiate. */
export function loadSounds(): BarSounds {
  loaded ??= { commande: createSound("commande"), appel: createSound("appel") };
  return loaded;
}

/**
 * À appeler lors d'un appui sur l'écran : les navigateurs n'autorisent le son
 * qu'après une action de l'utilisateur, et chaque son doit être autorisé.
 * Le « ding-dong » est joué pour confirmer, le son d'appel l'est en silence.
 */
export async function unlockSounds(): Promise<BarSounds> {
  const sounds = loadSounds();
  const { commande, appel } = sounds;
  // Les deux lectures doivent démarrer pendant l'appui (avant toute attente).
  commande.currentTime = 0;
  const confirm = commande.play();
  appel.muted = true;
  const silent = appel.play().then(() => {
    appel.pause();
    appel.currentTime = 0;
    appel.muted = false;
  });
  await Promise.all([confirm, silent]);
  return sounds;
}

/** Joue un son. Renvoie false si l'appareil l'a bloqué (il faut alors un nouvel appui). */
export async function playSound(sounds: BarSounds, name: SoundName): Promise<boolean> {
  const sound = sounds[name];
  sound.muted = false;
  sound.currentTime = 0;
  try {
    await sound.play();
    return true;
  } catch {
    return false;
  }
}

/** Empêche la tablette de se mettre en veille tant que l'écran du bar est affiché. */
export async function keepScreenOn() {
  try {
    await (navigator as WakeLockNavigator).wakeLock?.request("screen");
  } catch {
    // non disponible : régler la mise en veille de la tablette sur « jamais »
  }
}
