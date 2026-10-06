"use client";

import { useEffect, useState } from "react";

import { QuantityStepper } from "@/components/menu/QuantityStepper";
import { formatPrice, parsePrice } from "@/lib/format";
import type { MenuProduct } from "@/lib/menu";
import { MAX_COMMENT_LENGTH, MAX_TIP_CENTS, type PaymentMethod } from "@/lib/order-types";

export type CartLine = { product: MenuProduct; quantity: number };

type TipChoice = 0 | 5 | 10 | "autre";
const TIP_RATES = [5, 10] as const;

/** 5 % de 9,00 € → 0,50 € (arrondi aux 10 centimes). */
function percentTip(total: number, rate: number): number {
  return Math.round((total * rate) / 1000) * 10;
}

export function CartSheet({
  tableLabel,
  lines,
  total,
  payment,
  paused,
  onClose,
  onChangeQuantity,
  onSubmit,
}: {
  tableLabel: string;
  lines: CartLine[];
  total: number;
  payment: { staff: boolean; online: boolean };
  /** Le bar a mis les commandes en pause. */
  paused: boolean;
  onClose: () => void;
  onChangeQuantity: (productId: string, quantity: number) => void;
  /** Renvoie un message d'erreur, ou null si la commande est partie. */
  onSubmit: (order: { comment: string; paymentMethod: PaymentMethod; tipCents: number }) => Promise<string | null>;
}) {
  const [comment, setComment] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(payment.online ? "online" : "staff");
  const [tipChoice, setTipChoice] = useState<TipChoice>(0);
  const [customTip, setCustomTip] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pas de défilement de la page derrière le panier ; « Échap » ferme.
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

  // Pourboire : uniquement avec le paiement en ligne.
  const withTip = paymentMethod === "online";
  const maxTip = Math.min(total, MAX_TIP_CENTS);
  const tipCents = !withTip
    ? 0
    : tipChoice === "autre"
      ? (customTip.trim() ? parsePrice(customTip) : 0)
      : Math.min(percentTip(total, tipChoice), maxTip);
  const tipError =
    tipCents === null
      ? "Montant du pourboire illisible (ex. : 2 ou 2,50)."
      : tipCents > maxTip
        ? `Le pourboire ne peut pas dépasser ${formatPrice(maxTip)}.`
        : null;

  async function submit() {
    if (tipError || tipCents === null) return;
    setSubmitting(true);
    setError(null);
    const message = await onSubmit({ comment, paymentMethod, tipCents });
    if (message) {
      setError(message);
      setSubmitting(false);
    } else {
      setSent(true);
    }
  }

  const canOrder = !paused && (payment.staff || payment.online);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-stone-900/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="panier-titre"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-3xl bg-white"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h2 id="panier-titre" className="text-xl font-bold">
            Votre commande · {tableLabel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le panier"
            className="grid h-11 w-11 place-items-center rounded-full bg-stone-100 text-2xl active:bg-stone-200"
          >
            ×
          </button>
        </div>

        {sent ? (
          <div className="px-5 py-16 text-center">
            <p className="text-5xl">{paymentMethod === "online" ? "💳" : "✅"}</p>
            <p className="mt-4 text-xl font-bold">
              {paymentMethod === "online" ? "Ouverture du paiement sécurisé…" : "Commande envoyée !"}
            </p>
            <p className="mt-2 text-stone-500">
              {paymentMethod === "online" ? "Carte bancaire, Apple Pay ou Google Pay." : "Ouverture du suivi…"}
            </p>
          </div>
        ) : lines.length === 0 ? (
          <p className="px-5 py-16 text-center text-lg text-stone-500">Votre panier est vide.</p>
        ) : (
          <>
            <div className="overflow-y-auto px-5 py-2">
              <ul className="divide-y divide-stone-200">
                {lines.map(({ product, quantity }) => (
                  <li key={product.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{product.name}</p>
                      <p className="text-stone-500 tabular-nums">{formatPrice(product.price_cents * quantity)}</p>
                    </div>
                    <QuantityStepper
                      quantity={quantity}
                      label={product.name}
                      onChange={(next) => onChangeQuantity(product.id, next)}
                    />
                  </li>
                ))}
              </ul>

              <label className="mt-4 block">
                <span className="text-base font-semibold">Un commentaire ? (facultatif)</span>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={MAX_COMMENT_LENGTH}
                  rows={2}
                  placeholder="Ex. : sans glaçons, bien frais…"
                  className="mt-2 block w-full rounded-xl border border-stone-300 px-4 py-3 text-base focus:border-stone-900 focus:outline-none"
                />
              </label>

              {payment.staff && payment.online && (
                <fieldset className="mt-4">
                  <legend className="text-base font-semibold">Paiement</legend>
                  <div className="mt-2 grid gap-2">
                    <PaymentOption
                      checked={paymentMethod === "online"}
                      onSelect={() => setPaymentMethod("online")}
                      title="Payer maintenant"
                      subtitle="Carte bancaire, Apple Pay, Google Pay"
                    />
                    <PaymentOption
                      checked={paymentMethod === "staff"}
                      onSelect={() => setPaymentMethod("staff")}
                      title="Payer au serveur"
                      subtitle="Vous réglez quand on vous apporte la commande"
                    />
                  </div>
                </fieldset>
              )}

              {canOrder && withTip && (
                <fieldset className="mt-4">
                  <legend className="text-base font-semibold">Un pourboire pour l&apos;équipe ? (facultatif)</legend>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {([0, ...TIP_RATES, "autre"] as TipChoice[]).map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        aria-pressed={tipChoice === choice}
                        onClick={() => setTipChoice(choice)}
                        className={`flex h-14 flex-col items-center justify-center rounded-xl border-2 text-base font-semibold leading-tight ${
                          tipChoice === choice ? "border-stone-900 bg-stone-50" : "border-stone-200"
                        }`}
                      >
                        {choice === 0 ? "Sans" : choice === "autre" ? "Autre" : `${choice} %`}
                        {typeof choice === "number" && choice > 0 && (
                          <span className="text-xs font-normal tabular-nums text-stone-500">
                            {formatPrice(Math.min(percentTip(total, choice), maxTip))}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {tipChoice === "autre" && (
                    <label className="mt-2 flex items-center gap-3">
                      <span className="text-base">Montant</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={customTip}
                        onChange={(event) => setCustomTip(event.target.value)}
                        placeholder="2,00"
                        aria-label="Montant du pourboire en euros"
                        className="w-28 rounded-xl border border-stone-300 px-4 py-2 text-base tabular-nums focus:border-stone-900 focus:outline-none"
                      />
                      <span className="text-base">€</span>
                    </label>
                  )}
                  {tipError && <p className="mt-2 text-base text-red-700">{tipError}</p>}
                </fieldset>
              )}
            </div>

            <div className="border-t border-stone-200 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              {error && canOrder && (
                <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">
                  {error}
                </p>
              )}
              {canOrder ? (
                <>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitting || tipError !== null}
                    className="flex h-14 w-full items-center justify-between rounded-2xl bg-stone-900 px-5 text-lg font-bold text-white active:bg-stone-700 disabled:opacity-60"
                  >
                    <span>
                      {submitting ? "Envoi…" : paymentMethod === "online" ? "Payer" : "Envoyer la commande"}
                    </span>
                    <span className="tabular-nums">{formatPrice(total + (tipCents ?? 0))}</span>
                  </button>
                  {paymentMethod === "staff" && (
                    <p className="mt-2 text-center text-sm text-stone-500">Vous réglerez auprès du serveur.</p>
                  )}
                  {withTip && !!tipCents && !tipError && (
                    <p className="mt-2 text-center text-sm text-stone-500">
                      Dont {formatPrice(tipCents)} de pourboire. Merci !
                    </p>
                  )}
                </>
              ) : (
                <p className="rounded-xl bg-stone-100 px-4 py-3 text-center text-base text-stone-700">
                  {paused
                    ? "Le bar ne prend plus de commandes pour le moment. Votre panier est gardé : réessayez un peu plus tard."
                    : "La commande depuis le téléphone n'est pas disponible pour le moment. Demandez au serveur."}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PaymentOption({
  checked,
  onSelect,
  title,
  subtitle,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 ${
        checked ? "border-stone-900 bg-stone-50" : "border-stone-200"
      }`}
    >
      <input type="radio" name="paiement" checked={checked} onChange={onSelect} className="h-5 w-5 accent-stone-900" />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-stone-500">{subtitle}</span>
      </span>
    </label>
  );
}
