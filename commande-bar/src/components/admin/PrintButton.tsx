"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="h-11 rounded-xl bg-stone-900 px-5 font-bold text-white">
      🖨️ Imprimer
    </button>
  );
}
