// Fabrique les sons de l'écran du bar (public/sons/*.wav).
// Pour les modifier : changer les notes ci-dessous puis lancer
//   node scripts/generer-sons.mjs
import { writeFileSync } from "node:fs";

const RATE = 22050;

/** Une note de cloche : fréquence (Hz), début et durée (secondes). */
function render(notes, { harmonics, peak }) {
  const length = Math.ceil(Math.max(...notes.map((n) => n.at + n.duration)) * RATE) + Math.round(RATE / 20);
  const samples = new Float32Array(length);
  for (const { frequency, at, duration } of notes) {
    const start = Math.round(at * RATE);
    const count = Math.round(duration * RATE);
    for (let i = 0; i < count; i++) {
      const t = i / RATE;
      const attack = Math.min(1, t / 0.008);
      const decay = Math.exp((-5 * t) / duration);
      let value = 0;
      harmonics.forEach((weight, h) => {
        value += weight * Math.sin(2 * Math.PI * frequency * (h + 1) * t);
      });
      samples[start + i] += value * attack * decay;
    }
  }
  const max = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  return samples.map((v) => (v / max) * peak);
}

/** Fichier WAV (PCM 16 bits, mono) : lu par tous les navigateurs. */
function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(v * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Nouvelle commande : « ding-dong » deux fois.
const commande = render(
  [
    { frequency: 1319, at: 0, duration: 0.55 },
    { frequency: 988, at: 0.3, duration: 0.75 },
    { frequency: 1319, at: 0.9, duration: 0.55 },
    { frequency: 988, at: 1.2, duration: 0.8 },
  ],
  { harmonics: [1, 0.45, 0.2], peak: 0.95 },
);

// Appel d'une table : trois notes rapides et aiguës.
const appel = render(
  [
    { frequency: 1568, at: 0, duration: 0.22 },
    { frequency: 1568, at: 0.18, duration: 0.22 },
    { frequency: 2093, at: 0.36, duration: 0.4 },
  ],
  { harmonics: [1, 0.35, 0.15], peak: 0.95 },
);

const folder = new URL("../public/sons/", import.meta.url);
writeFileSync(new URL("commande.wav", folder), wav(commande));
writeFileSync(new URL("appel.wav", folder), wav(appel));
console.log("Sons créés dans public/sons/");
