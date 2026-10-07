// Types et libellés des commandes, partagés entre le serveur et le navigateur.

export type OrderStatus = "pending_payment" | "received" | "preparing" | "served" | "cancelled";
export type PaymentMethod = "online" | "staff";
export type PaymentStatus = "unpaid" | "paid";
/** Règlement au serveur : espèces, carte, ou les deux (une partie de chaque). */
export type StaffPayment = "cash" | "card" | "mixed";

export const STAFF_PAYMENT_LABEL: Record<StaffPayment, string> = {
  cash: "Espèces",
  card: "Carte",
  mixed: "Espèces + carte",
};

/** Moyens acceptés au serveur par le bar (réglages du gérant). */
export type StaffPaymentOptions = { cash: boolean; card: boolean };

/** Choix possibles pour le client, selon ce que le bar accepte. */
export function staffPaymentChoices(options: StaffPaymentOptions): StaffPayment[] {
  return [
    ...(options.cash ? (["cash"] as const) : []),
    ...(options.card ? (["card"] as const) : []),
    ...(options.cash && options.card ? (["mixed"] as const) : []),
  ];
}

export type OrderItem = {
  name: string;
  quantity: number;
  unit_price_cents: number;
};

/** Commande vue par le client (page de suivi). */
export type CustomerOrder = {
  id: string;
  order_number: number;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  /** Règlement au serveur choisi (absent avant le script 11) */
  staff_payment?: StaffPayment | null;
  total_cents: number;
  tip_cents: number;
  comment: string | null;
  table_label: string;
  created_at: string;
  items: (OrderItem & { line_total_cents: number })[];
};

/** Commande vue par l'écran du bar. */
export type BarOrder = {
  id: string;
  order_number: number;
  table_label: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  /** Règlement au serveur (espèces, carte, les deux) */
  staff_payment?: StaffPayment | null;
  total_cents: number;
  tip_cents: number;
  comment: string | null;
  /** « staff » : commande prise par un serveur. */
  source?: "client" | "staff";
  created_at: string;
  received_at: string | null;
  preparing_at: string | null;
  served_at: string | null;
  cancelled_at: string | null;
  items: OrderItem[];
};

/** Appel depuis une table : « Appeler un serveur » ou « L'addition ». */
export type CallKind = "waiter" | "bill";

export type TableCall = {
  id: string;
  table_label: string;
  kind: CallKind;
  created_at: string;
};

export type BarOrders = {
  business_date: string;
  server_time: string;
  orders_paused: boolean;
  active: BarOrder[];
  history: BarOrder[];
  calls: TableCall[];
  /** Articles de stock sous le seuil d'alerte ou épuisés. */
  stock_alerts?: number;
};

/** Libellé du paiement, tel qu'affiché au bar : « À encaisser · Carte ». */
export function paymentLabel(order: Pick<BarOrder, "payment_method" | "payment_status" | "staff_payment">): string {
  if (order.payment_method === "online") return order.payment_status === "paid" ? "Payé en ligne" : "Paiement en cours";
  const how = order.staff_payment ? ` · ${STAFF_PAYMENT_LABEL[order.staff_payment]}` : "";
  return `${order.payment_status === "paid" ? "Encaissé" : "À encaisser"}${how}`;
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FINAL_STATUSES: OrderStatus[] = ["served", "cancelled"];

/** Mêmes limites que la fonction SQL create_order(). */
export const MAX_QUANTITY_PER_LINE = 20;
export const MAX_COMMENT_LENGTH = 300;
/** Pourboire : au plus le montant de la commande, et 100 €. */
export const MAX_TIP_CENTS = 10000;
