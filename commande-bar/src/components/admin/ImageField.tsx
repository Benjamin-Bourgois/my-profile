"use client";

import { useState } from "react";

import { Icon } from "@/components/Icon";
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
    <div className="flex flex-wrap items-center gap-4">
      {value ? (
        <img src={value} alt="" className="h-20 w-20 shrink-0 rounded-[12px] border border-line bg-sand-2 object-cover" />
      ) : (
        <div className="photo-placeholder h-20 w-20 shrink-0 rounded-[12px] border border-line text-center text-[11px] font-semibold text-muted">
          {emptyLabel}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label className={`btn btn--soft btn--sm ${uploading ? "pointer-events-none opacity-45" : ""}`}>
          <Icon name="image" size={16} />
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
          <button type="button" onClick={() => onChange(null)} className="btn btn--ghost btn--sm">
            Retirer
          </button>
        )}
      </div>
      {error && <p className="basis-full text-[13px] text-danger">{error}</p>}
    </div>
  );
}
