"use client";

import { Icon } from "@/components/Icon";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn--primary">
      <Icon name="printer" />
      Imprimer
    </button>
  );
}
