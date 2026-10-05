import "server-only";

import { TOKEN_PATTERN } from "@/lib/menu";
import { UUID_PATTERN, type CustomerOrder } from "@/lib/order-types";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Commande vue par le client. Il faut l'identifiant de la commande ET le
 * lien secret de la table ; sinon `null`.
 */
export async function getCustomerOrder(orderId: string, token: string): Promise<CustomerOrder | null> {
  if (!UUID_PATTERN.test(orderId) || !TOKEN_PATTERN.test(token)) return null;
  const { data, error } = await getAdminClient().rpc("get_customer_order", { p_order_id: orderId, p_token: token });
  if (error) throw error;
  return (data as CustomerOrder | null) ?? null;
}
