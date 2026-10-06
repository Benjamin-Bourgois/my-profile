"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/Icon";

/** Distance (px) à partir de laquelle un glissé vers le bas ferme la fenêtre. */
const DRAG_TO_CLOSE = 90;

/**
 * Fenêtre qui glisse depuis le bas sur téléphone (modale centrée sur ordinateur).
 * Poignée à faire glisser, bouton ×, touche Échap ou appui sur le fond pour fermer.
 * Le contenu est fait de <SheetBody> (qui défile) et <SheetFooter> (fixe).
 */
export function Sheet({
  title,
  eyebrow,
  onClose,
  closeLabel = "Fermer",
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);

  // Pas de défilement de la page derrière la fenêtre ; « Échap » ferme.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function endDrag() {
    const distance = drag;
    dragStart.current = null;
    setDrag(0);
    if (distance > DRAG_TO_CLOSE) onClose();
  }

  // Affichée directement dans <body> : rien dans la page ne peut la décaler ou la recouvrir.
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet"
        style={drag ? { transform: `translate(-50%, ${drag}px)`, transition: "none" } : undefined}
      >
        <div
          className="sheet__handle"
          onPointerDown={(event) => {
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragStart.current !== null) setDrag(Math.max(0, event.clientY - dragStart.current));
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-1 min-[720px]:pt-5">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id={titleId} className="mt-0.5 text-[28px]">
              {title}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="icon-btn">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}

export function SheetBody({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>;
}

export function SheetFooter({ children }: { children: ReactNode }) {
  return <div className="border-t border-line bg-sand px-5 pb-[calc(16px+var(--safe-b))] pt-4">{children}</div>;
}
