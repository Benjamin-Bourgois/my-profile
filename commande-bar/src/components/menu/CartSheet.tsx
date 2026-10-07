"use client";

import { useState } from "react";

import { Icon } from "@/components/Icon";
import { QuantityStepper } from "@/components/menu/QuantityStepper";
import { Sheet, SheetBody, SheetFooter } from "@/components/Sheet";
import { formatPrice, parsePrice } from "@/lib/format";
import type { MenuProduct } from "@/lib/menu";
import {
  MAX_COMMENT_LENGTH,
  MAX_QUANTITY_PER_LINE,
  MAX_TIP_CENTS,
  staffPaymentChoices,
  type PaymentMethod,
  type StaffPayment,
  type StaffPaymentOptions,
} from "@/lib/order-types";

export type CartLine = { product: MenuProduct; quantity: number };

type TipChoice = 0 | 5 | 10 | "autre";

const STAFF_CHOICE_LABEL: Record<StaffPayment, string> = { cash: "Espèces", card: "Carte", mixed: "Les deux" };
const STAFF_ONLY_TEXT: Record<StaffPayment, string> = {
  cash: "Au serveur, le règlement se fait en espèces uniquement.",
  card: "Au serveur, le règlement se fait par carte uniquement.",
  mixed: "",
};
const STAFF_HINT: Record<StaffPayment, string> = {
  cash: "Vous réglerez en espèces auprès du serveur.",
  card: "Vous réglerez par carte auprès du serveur.",
  mixed: "Vous réglerez auprès du serveur, en espèces et par carte.",
};
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
  suggestions,
  onAddSuggestion,
  onClose,
  onChangeQuantity,
  onSubmit,
}: {
  tableLabel: string;
  lines: CartLine[];
  total: number;
  payment: { staff: boolean; online: boolean; staffOptions: StaffPaymentOptions | null };
  /** Le bar a mis les commandes en pause. */
  paused: boolean;
  /** « Souvent pris avec » : produits à proposer avec ce panier. */
  suggestions: MenuProduct[];
  onAddSuggestion: (productId: string) => void;
  onClose: () => void;
  onChangeQuantity: (productId: string, quantity: number) => void;
  /** Renvoie un message d'erreur, ou null si la commande est partie. */
  onSubmit: (order: {
    comment: string;
    paymentMethod: PaymentMethod;
    staffPayment: StaffPayment | null;
    tipCents: number;
  }) => Promise<string | null>;
}) {
  const [comment, setComment] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(payment.online ? "online" : "staff");
  // Au serveur : espèces, carte ou les deux (selon ce que le bar accepte)
  const staffChoices = payment.staffOptions ? staffPaymentChoices(payment.staffOptions) : [];
  const [staffPayment, setStaffPayment] = useState<StaffPayment | null>(staffChoices.length === 1 ? staffChoices[0] : null);
  const staffChoiceMissing = paymentMethod === "staff" && staffChoices.length > 1 && staffPayment === null;
  const [tipChoice, setTipChoice] = useState<TipChoice>(0);
  const [customTip, setCustomTip] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (tipError || tipCents === null || staffChoiceMissing) return;
    setSubmitting(true);
    setError(null);
    const message = await onSubmit({ comment, paymentMethod, staffPayment: paymentMethod === "staff" ? staffPayment : null, tipCents });
    if (message) {
      setError(message);
      setSubmitting(false);
    } else {
      setSent(true);
    }
  }

  const canOrder = !paused && (payment.staff || payment.online);
  const toPay = total + (tipCents ?? 0);

  return (
    <Sheet title="Votre commande" eyebrow={tableLabel} onClose={onClose} closeLabel="Fermer le panier">
      {sent ? (
        <SheetBody>
          <div className="py-12 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok">
              <Icon name={paymentMethod === "online" ? "card" : "check"} size={26} />
            </span>
            <p className="mt-5 font-serif text-[28px] font-semibold">
              {paymentMethod === "online" ? "Ouverture du paiement sécurisé…" : "Commande envoyée !"}
            </p>
            <p className="mt-1 text-ink-2">
              {paymentMethod === "online" ? "Carte bancaire, Apple Pay ou Google Pay." : "Ouverture du suivi…"}
            </p>
          </div>
        </SheetBody>
      ) : lines.length === 0 ? (
        <SheetBody>
          <p className="py-12 text-center text-ink-2">Votre panier est vide.</p>
        </SheetBody>
      ) : (
        <>
          <SheetBody>
            <ul className="divide-y divide-line rounded-md border border-line bg-card px-4">
              {lines.map(({ product, quantity }) => (
                <li key={product.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-[20px] font-semibold leading-tight">{product.name}</p>
                    <p className="text-[13px] font-bold tabular-nums text-ink-2">{formatPrice(product.price_cents * quantity)}</p>
                  </div>
                  <QuantityStepper
                    quantity={quantity}
                    label={product.name}
                    max={Math.min(MAX_QUANTITY_PER_LINE, product.remaining ?? MAX_QUANTITY_PER_LINE)}
                    onChange={(next) => onChangeQuantity(product.id, next)}
                  />
                </li>
              ))}
            </ul>

            {canOrder && suggestions.length > 0 && (
              <section aria-labelledby="souvent-pris" className="mt-5">
                <p id="souvent-pris" className="field-label">
                  Souvent pris avec
                </p>
                <ul className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  {suggestions.map((product) => (
                    <li key={product.id} className="rise flex items-center gap-3 rounded-md border border-line bg-card p-3">
                      {product.image_url && (
                        <img src={product.image_url} alt="" className="h-12 w-12 shrink-0 rounded-sm object-cover" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-snug">{product.name}</p>
                        <p className="text-[13px] font-bold tabular-nums text-ink-2">{formatPrice(product.price_cents)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAddSuggestion(product.id)}
                        aria-label={`Ajouter ${product.name}`}
                        className="btn btn--soft btn--sm shrink-0"
                      >
                        <Icon name="plus" size={15} />
                        Ajouter
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <label className="field mt-5">
              <span>Un commentaire ? (facultatif)</span>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={MAX_COMMENT_LENGTH}
                rows={2}
                placeholder="Ex. : sans glaçons, bien frais…"
                className="input resize-none"
              />
            </label>

            {payment.staff && payment.online && (
              <fieldset className="mt-5">
                <legend className="field-label">Paiement</legend>
                <div className="mt-1.5 grid gap-2">
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

            {canOrder && paymentMethod === "staff" && staffChoices.length > 0 && (
              <fieldset className="mt-5">
                <legend className="field-label">Au serveur, vous réglerez…</legend>
                {staffChoices.length > 1 ? (
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {staffChoices.map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        aria-pressed={staffPayment === choice}
                        onClick={() => setStaffPayment(choice)}
                        className="chip chip--tag h-12 justify-center !px-2"
                      >
                        {STAFF_CHOICE_LABEL[choice]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 rounded-md bg-sand-2 px-4 py-3 text-[14px] text-ink-2">{STAFF_ONLY_TEXT[staffChoices[0]]}</p>
                )}
                {staffPayment === "mixed" && (
                  <p className="mt-2 text-[13px] text-muted">Une partie en espèces, le reste par carte : le serveur apporte le terminal.</p>
                )}
              </fieldset>
            )}

            {canOrder && withTip && (
              <fieldset className="mt-5">
                <legend className="field-label">Un pourboire pour l&apos;équipe ? (facultatif)</legend>
                <div className="mt-1.5 grid grid-cols-4 gap-2">
                  {([0, ...TIP_RATES, "autre"] as TipChoice[]).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      aria-pressed={tipChoice === choice}
                      onClick={() => setTipChoice(choice)}
                      className="chip chip--tag h-14 flex-col justify-center !gap-0 !px-2 leading-tight"
                    >
                      {choice === 0 ? "Sans" : choice === "autre" ? "Autre" : `${choice} %`}
                      {typeof choice === "number" && choice > 0 && (
                        <span className="text-[11px] font-medium tabular-nums opacity-80">
                          {formatPrice(Math.min(percentTip(total, choice), maxTip))}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {tipChoice === "autre" && (
                  <label className="mt-2 flex items-center gap-3">
                    <span className="field-label">Montant</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={customTip}
                      onChange={(event) => setCustomTip(event.target.value)}
                      placeholder="2,00"
                      aria-label="Montant du pourboire en euros"
                      className="input !w-28 tabular-nums"
                    />
                    <span className="text-ink-2">€</span>
                  </label>
                )}
                {tipError && <p className="mt-2 text-[14px] text-danger">{tipError}</p>}
              </fieldset>
            )}
          </SheetBody>

          <SheetFooter>
            {error && canOrder && (
              <p role="alert" className="mb-3 rounded-md bg-danger-soft px-4 py-3 text-[14px] text-danger">
                {error}
              </p>
            )}
            {canOrder ? (
              <>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || tipError !== null || staffChoiceMissing}
                  className="btn btn--primary btn--block"
                >
                  {submitting
                    ? "Envoi…"
                    : staffChoiceMissing
                      ? "Choisissez espèces ou carte"
                      : `${paymentMethod === "online" ? "Payer" : "Commander"} · ${formatPrice(toPay)}`}
                </button>
                <p className="mt-2 text-center text-[13px] text-muted">
                  {paymentMethod === "staff"
                    ? staffPayment
                      ? STAFF_HINT[staffPayment]
                      : "Vous réglerez auprès du serveur."
                    : withTip && !!tipCents && !tipError
                      ? `Dont ${formatPrice(tipCents)} de pourboire. Merci !`
                      : "Paiement sécurisé par Stripe."}
                </p>
              </>
            ) : (
              <p className="rounded-md bg-sand-2 px-4 py-3 text-center text-ink-2">
                {paused
                  ? "Le bar ne prend plus de commandes pour le moment. Votre panier est gardé : réessayez un peu plus tard."
                  : "La commande depuis le téléphone n'est pas disponible pour le moment. Demandez au serveur."}
              </p>
            )}
          </SheetFooter>
        </>
      )}
    </Sheet>
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
      className={`flex items-center gap-3 rounded-md border bg-card px-4 py-3 transition-colors duration-200 ${
        checked ? "border-ink" : "border-line hover:border-ink-2"
      }`}
    >
      <input type="radio" name="paiement" checked={checked} onChange={onSelect} className="h-5 w-5 accent-matte" />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-[13px] text-ink-2">{subtitle}</span>
      </span>
    </label>
  );
}
