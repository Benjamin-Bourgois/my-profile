"use client";

import { useState } from "react";

import { resizeImage } from "@/lib/image-resize";
import { getBrowserClient } from "@/lib/supabase/browser";

/** Choix d'une photo : réduite dans le navigateur puis envoyée dans le stockage Supabase. */
export function ImageField({
  venueId,
  folder,
  value,
  onChange,
  maxSize,
  format,
  emptyLabel,
}: {
  venueId: string;
  folder: "produits" | "logo";
  value: string | null;
  onChange: (url: string | null) => void;
  maxSize: number;
  format: "image/jpeg" | "image/png";
  emptyLabel: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    let blob: Blob;
    try {
      blob = await resizeImage(file, maxSize, format);
    } catch {
      setError("Format non reconnu : utilisez une photo JPEG ou PNG.");
      setUploading(false);
      return;
    }
    const path = `${venueId}/${folder}/${crypto.randomUUID()}.${format === "image/png" ? "png" : "jpg"}`;
    const storage = getBrowserClient().storage.from("images");
    const { error: uploadError } = await storage.upload(path, blob, {
      contentType: format,
      cacheControl: "31536000",
      upsert: false,
    });
    setUploading(false);
    if (uploadError) {
      console.error("Envoi de l'image impossible", uploadError);
      setError("Envoi impossible. Réessayez ; si cela persiste, le stockage des images n'est pas installé (script 1-structure.sql).");
      return;
    }
    onChange(storage.getPublicUrl(path).data.publicUrl);
  }

  return (
    <div className="flex items-center gap-4">
      {value ? (
        <img src={value} alt="" className="h-20 w-20 shrink-0 rounded-xl bg-stone-100 object-cover ring-1 ring-stone-200" />
      ) : (
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-stone-100 text-center text-xs text-stone-400 ring-1 ring-stone-200">
          {emptyLabel}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label className={`flex h-11 cursor-pointer items-center rounded-xl bg-stone-200 px-4 font-semibold ${uploading ? "opacity-50" : "hover:bg-stone-300"}`}>
          {uploading ? "Envoi…" : value ? "Changer" : "Choisir une photo"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload(file);
            }}
          />
        </label>
        {value && !uploading && (
          <button type="button" onClick={() => onChange(null)} className="h-11 rounded-xl px-3 font-semibold text-stone-600 underline">
            Retirer
          </button>
        )}
      </div>
      {error && <p className="basis-full text-sm text-red-700">{error}</p>}
    </div>
  );
}
