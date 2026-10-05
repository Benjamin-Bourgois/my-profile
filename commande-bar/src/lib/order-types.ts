// Types et libellés des commandes, partagés entre le serveur et le navigateur.

export type OrderStatus = "pending_payment" | "received" | "preparing" | "served" | "cancelled";
export type PaymentMethod = "online" | "staff";
export type PaymentStatus = "unpaid" | "paid";

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
  total_cents: number;
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
  total_cents: number;
  comment: string | null;
  created_at: string;
  received_at: string | null;
  preparing_at: string | null;
  served_at: string | null;
  cancelled_at: string | null;
  items: OrderItem[];
};

export type BarOrders = {
  business_date: string;
  server_time: string;
  active: BarOrder[];
  history: BarOrder[];
};

/** Libellé du paiement, tel qu'affiché au bar. */
export function paymentLabel(order: Pick<BarOrder, "payment_method" | "payment_status">): string {
  if (order.payment_method === "online") return order.payment_status === "paid" ? "Payé en ligne" : "Paiement en cours";
  return order.payment_status === "paid" ? "Encaissé" : "À encaisser";
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FINAL_STATUSES: OrderStatus[] = ["served", "cancelled"];

/** Mêmes limites que la fonction SQL create_order(). */
export const MAX_QUANTITY_PER_LINE = 20;
export const MAX_COMMENT_LENGTH = 300;
