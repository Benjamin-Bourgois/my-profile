import type { MenuCategory } from "@/lib/menu";

export function CategoryNav({ categories }: { categories: MenuCategory[] }) {
  if (categories.length < 2) return null;
  return (
    <nav aria-label="Catégories" className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
      <div className="no-scrollbar mx-auto flex max-w-xl gap-2 overflow-x-auto px-4 py-3">
        {categories.map((category) => (
          <a
            key={category.id}
            href={`#cat-${category.id}`}
            className="shrink-0 rounded-full border border-stone-300 bg-white px-4 py-2 text-base font-medium text-stone-800 active:bg-stone-100"
          >
            {category.name}
          </a>
        ))}
      </div>
    </nav>
  );
}
