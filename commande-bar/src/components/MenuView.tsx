import { formatPrice } from "@/lib/format";
import type { Menu, MenuProduct } from "@/lib/menu";

export function MenuView({ menu }: { menu: Menu }) {
  const { venue, table, categories } = menu;

  return (
    <div className="min-h-dvh">
      <header className="bg-stone-900 px-4 pb-6 pt-8 text-white">
        <div className="mx-auto flex max-w-xl items-center gap-4">
          {venue.logo_url ? (
            <img
              src={venue.logo_url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full bg-white object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-amber-400 text-3xl font-bold text-stone-900"
            >
              {venue.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{venue.name}</h1>
            <p className="mt-2 inline-flex rounded-full bg-amber-400 px-3 py-1 text-base font-bold text-stone-900">
              {table.label}
            </p>
          </div>
        </div>
      </header>

      {categories.length > 1 && (
        <nav
          aria-label="Catégories"
          className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 backdrop-blur"
        >
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
      )}

      <main className="mx-auto max-w-xl px-4 pb-16">
        {categories.length === 0 && (
          <p className="py-16 text-center text-lg text-stone-500">La carte est en cours de préparation.</p>
        )}
        {categories.map((category) => (
          <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-20 pt-6">
            <h2 className="mb-3 text-xl font-bold text-stone-900">{category.name}</h2>
            <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
              {category.products.map((product) => (
                <ProductRow key={product.id} product={product} />
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}

function ProductRow({ product }: { product: MenuProduct }) {
  return (
    <li className={`flex gap-4 p-4 ${product.is_available ? "" : "opacity-50"}`}>
      {product.image_url && (
        <img
          src={product.image_url}
          alt=""
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-xl bg-stone-100 object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold leading-snug text-stone-900">{product.name}</h3>
          <span className="shrink-0 text-lg font-semibold tabular-nums text-stone-900">
            {formatPrice(product.price_cents)}
          </span>
        </div>
        {product.description && <p className="mt-1 text-stone-500">{product.description}</p>}
        {!product.is_available && (
          <p className="mt-2 inline-block rounded-full bg-stone-200 px-2.5 py-0.5 text-sm font-semibold text-stone-700">
            Indisponible
          </p>
        )}
      </div>
    </li>
  );
}
