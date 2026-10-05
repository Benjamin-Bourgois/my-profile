"use client";

import { useCallback, useSyncExternalStore } from "react";

// Petite mémoire dans le téléphone (localStorage) pour le panier et les
// dernières commandes : un rechargement de page ne perd rien. Si le
// navigateur refuse (navigation privée…), tout fonctionne quand même,
// sans mémoire.

const listeners = new Set<() => void>();
const cache = new Map<string, unknown>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function read<T>(key: string, fallback: T, validate: (value: unknown) => T): T {
  if (cache.has(key)) return cache.get(key) as T;
  let value = fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) value = validate(JSON.parse(raw));
  } catch {
    value = fallback;
  }
  cache.set(key, value);
  return value;
}

export function useLocalState<T>(
  key: string,
  fallback: T,
  validate: (value: unknown) => T,
): [T, (update: (current: T) => T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback, validate),
    () => fallback,
  );

  const setValue = useCallback(
    (update: (current: T) => T) => {
      const next = update(read(key, fallback, validate));
      cache.set(key, next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // mémoire indisponible : on garde la valeur pour cette visite seulement
      }
      listeners.forEach((listener) => listener());
    },
    [key, fallback, validate],
  );

  return [value, setValue];
}
