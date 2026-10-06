"use client";

import { useEffect, useRef, useState } from "react";

import type { MenuCategory } from "@/lib/menu";

/** Barre des catégories, collée en haut ; la catégorie visible est mise en avant. */
export function CategoryNav({ categories }: { categories: MenuCategory[] }) {
  const [stuck, setStuck] = useState(false);
  const [active, setActive] = useState<string | null>(categories[0]?.id ?? null);
  const sentinel = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);

  // Le filet n'apparaît qu'une fois la barre collée en haut.
  useEffect(() => {
    const element = sentinel.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Catégorie en cours de lecture : la dernière dont le titre est passé sous la barre.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = categories[0]?.id ?? null;
      for (const category of categories) {
        const section = document.getElementById(`cat-${category.id}`);
        if (section && section.getBoundingClientRect().top <= 120) current = category.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = categories.at(-1)?.id ?? current;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [categories]);

  // La pastille active reste visible dans la rangée.
  useEffect(() => {
    const container = row.current;
    const chip = container?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!container || !chip) return;
    const left = chip.offsetLeft - 16;
    const right = chip.offsetLeft + chip.offsetWidth + 16 - container.clientWidth;
    if (container.scrollLeft > left) container.scrollTo({ left, behavior: "smooth" });
    else if (container.scrollLeft < right) container.scrollTo({ left: right, behavior: "smooth" });
  }, [active]);

  if (categories.length < 2) return null;
  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px" />
      <nav
        aria-label="Catégories"
        className={`sticky top-0 z-10 bg-[rgba(251,249,245,.9)] backdrop-blur-[14px] backdrop-saturate-[1.4] transition-[border-color] duration-200 ${
          stuck ? "border-b border-line" : "border-b border-transparent"
        }`}
      >
        <div ref={row} className="no-scrollbar relative mx-auto flex max-w-[680px] gap-2 overflow-x-auto px-4 py-3">
          {categories.map((category) => (
            <a
              key={category.id}
              data-id={category.id}
              href={`#cat-${category.id}`}
              aria-current={active === category.id ? "true" : undefined}
              className="chip"
            >
              {category.name}
            </a>
          ))}
        </div>
      </nav>
    </>
  );
}
