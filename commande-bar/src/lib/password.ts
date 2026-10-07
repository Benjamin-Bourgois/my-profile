// Mots de passe provisoires des comptes créés par l'agence (navigateur et serveur).

// Sans caractères ambigus (0/O, 1/l/I) : facile à dicter ou à recopier.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Mot de passe lisible, ex. « Kp7m-Xq2r-Tz9w » (environ 70 bits de hasard). */
export function newPassword(): string {
  const values = globalThis.crypto.getRandomValues(new Uint32Array(12));
  const chars = Array.from(values, (v) => ALPHABET[v % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}
