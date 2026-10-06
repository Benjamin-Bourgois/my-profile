"use client";

/**
 * Réduit une photo avant l'envoi (une photo de téléphone fait souvent 3 à 5 Mo) :
 * la carte se charge vite, même en 4G.
 */
export async function resizeImage(file: File, maxSize: number, type: "image/jpeg" | "image/png"): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    if (type === "image/jpeg") {
      context.fillStyle = "#ffffff"; // fond blanc pour les images transparentes
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), type, 0.85),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
