"use server";

import { revalidatePath } from "next/cache";

import { agencyErrorMessage, type AgencyActionResult } from "@/lib/agency";
import { UUID_PATTERN } from "@/lib/order-types";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof getServerClient>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

/** Client au nom de la personne connectée, seulement si c'est un compte de l'agence. */
async function agencyClient(): Promise<Supabase | null> {
  const supabase = await getServerClient();
  const { data } = await supabase.rpc("is_agency");
  return data === true ? supabase : null;
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

/**
 * Compte existant pour cet email, sinon nouveau compte (confirmé) avec ce mot de passe.
 * La création passe par la clé secrète, côté serveur uniquement.
 */
async function ensureAccount(
  supabase: Supabase,
  email: string,
  password: string,
): Promise<{ id: string; created: boolean } | { error: string }> {
  const { data: existing, error } = await supabase.rpc("agency_find_user", { p_email: email });
  if (error) return { error: agencyErrorMessage(error) };
  if (existing) return { id: existing as string, created: false };
  if (password.length < MIN_PASSWORD) return { error: `Mot de passe trop court (${MIN_PASSWORD} caractères minimum).` };

  const { data, error: createError } = await getAdminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !data.user) {
    console.error("Espace agence : création du compte impossible", createError);
    return { error: "Création du compte impossible. Vérifiez l'email, ou choisissez un mot de passe plus long." };
  }
  return { id: data.user.id, created: true };
}

/** Nouveau bar, avec si besoin le compte de son gérant. */
export async function createVenue(_previous: AgencyActionResult, formData: FormData): Promise<AgencyActionResult> {
  const supabase = await agencyClient();
  if (!supabase) return { error: agencyErrorMessage({ message: "ACCES_REFUSE" }) };
  const name = field(formData, "name");
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  if (email && !EMAIL_PATTERN.test(email)) return { error: "Email du gérant invalide." };

  const { data: venueId, error } = await supabase.rpc("agency_create_venue", { p_name: name });
  if (error) return { error: agencyErrorMessage(error) };
  revalidatePath("/agence", "layout");
  if (!email) return { venueId: venueId as string, done: `Bar « ${name} » créé.` };

  const account = await ensureAccount(supabase, email, password);
  if ("error" in account) return { venueId: venueId as string, error: `Bar créé, mais pas le compte du gérant : ${account.error}` };
  const { error: memberError } = await supabase.rpc("agency_set_member", {
    p_venue_id: venueId,
    p_user_id: account.id,
    p_role: "owner",
  });
  if (memberError) return { venueId: venueId as string, error: `Bar créé, mais pas l'accès du gérant : ${agencyErrorMessage(memberError)}` };
  return {
    venueId: venueId as string,
    done: `Bar « ${name} » créé.`,
    credentials: { email, password: account.created ? password : "", created: account.created },
  };
}

/** Bar de démonstration : paiement en ligne simulé tant que Stripe n'est pas connecté. */
export async function setDemoPayment(_previous: AgencyActionResult, formData: FormData): Promise<AgencyActionResult> {
  const supabase = await agencyClient();
  if (!supabase) return { error: agencyErrorMessage({ message: "ACCES_REFUSE" }) };
  const venueId = field(formData, "venue_id");
  const enabled = field(formData, "demo") === "1";
  if (!UUID_PATTERN.test(venueId)) return { error: agencyErrorMessage({ message: "INTROUVABLE" }) };
  const { error } = await supabase.rpc("agency_set_demo_payment", { p_venue_id: venueId, p_enabled: enabled });
  if (error) {
    if (/could not find the function/i.test(error.message)) {
      return { error: "Base incomplète : exécutez dans Supabase (SQL Editor) le script supabase/12-paiement-demo.sql." };
    }
    return { error: agencyErrorMessage(error) };
  }
  revalidatePath("/agence", "layout");
  return { done: enabled ? "Démonstration activée pour ce bar." : "Démonstration désactivée." };
}

/** Donne l'accès à un bar (nouveau compte ou compte existant). */
export async function addMember(_previous: AgencyActionResult, formData: FormData): Promise<AgencyActionResult> {
  const supabase = await agencyClient();
  if (!supabase) return { error: agencyErrorMessage({ message: "ACCES_REFUSE" }) };
  const venueId = field(formData, "venue_id");
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  const role = field(formData, "role") === "owner" ? "owner" : "staff";
  if (!UUID_PATTERN.test(venueId)) return { error: agencyErrorMessage({ message: "INTROUVABLE" }) };
  if (!EMAIL_PATTERN.test(email)) return { error: "Email invalide." };

  const account = await ensureAccount(supabase, email, password);
  if ("error" in account) return { error: account.error };
  const { error } = await supabase.rpc("agency_set_member", { p_venue_id: venueId, p_user_id: account.id, p_role: role });
  if (error) return { error: agencyErrorMessage(error) };
  revalidatePath("/agence", "layout");
  return {
    done: account.created ? `Compte créé pour ${email}.` : `${email} avait déjà un compte : il garde son mot de passe et a maintenant accès à ce bar.`,
    credentials: account.created ? { email, password, created: true } : undefined,
  };
}

/** Compte d'un bar : changer le rôle, retirer l'accès ou donner un nouveau mot de passe. */
export async function updateMember(_previous: AgencyActionResult, formData: FormData): Promise<AgencyActionResult> {
  const supabase = await agencyClient();
  if (!supabase) return { error: agencyErrorMessage({ message: "ACCES_REFUSE" }) };
  const venueId = field(formData, "venue_id");
  const userId = field(formData, "user_id");
  const email = field(formData, "email");
  const op = field(formData, "op");
  if (!UUID_PATTERN.test(venueId) || !UUID_PATTERN.test(userId)) return { error: agencyErrorMessage({ message: "INTROUVABLE" }) };

  if (op === "owner" || op === "staff") {
    const { error } = await supabase.rpc("agency_set_member", { p_venue_id: venueId, p_user_id: userId, p_role: op });
    if (error) return { error: agencyErrorMessage(error) };
    revalidatePath("/agence", "layout");
    return { done: op === "owner" ? `${email} est maintenant gérant.` : `${email} fait maintenant partie de l'équipe.` };
  }

  if (op === "remove") {
    const { error } = await supabase.rpc("agency_remove_member", { p_venue_id: venueId, p_user_id: userId });
    if (error) return { error: agencyErrorMessage(error) };
    revalidatePath("/agence", "layout");
    return { done: `Accès de ${email} retiré.` };
  }

  if (op === "password") {
    const password = field(formData, "password");
    if (password.length < MIN_PASSWORD) return { error: `Mot de passe trop court (${MIN_PASSWORD} caractères minimum).` };
    // Seulement les comptes des bars (jamais un autre compte de l'agence)
    const { data: allowed, error } = await supabase.rpc("agency_can_manage_user", { p_user_id: userId });
    if (error) return { error: agencyErrorMessage(error) };
    if (allowed !== true) return { error: "Ce compte ne peut pas être modifié depuis l'espace agence." };
    const { error: updateError } = await getAdminClient().auth.admin.updateUserById(userId, { password });
    if (updateError) {
      console.error("Espace agence : changement de mot de passe impossible", updateError);
      return { error: "Changement de mot de passe impossible. Réessayez avec un mot de passe plus long." };
    }
    return { done: `Nouveau mot de passe enregistré pour ${email}.`, credentials: { email, password, created: false } };
  }

  return { error: "Opération inconnue." };
}

/** Suspendre (abonnement arrêté) ou réactiver un bar. */
export async function setSuspended(_previous: AgencyActionResult, formData: FormData): Promise<AgencyActionResult> {
  const supabase = await agencyClient();
  if (!supabase) return { error: agencyErrorMessage({ message: "ACCES_REFUSE" }) };
  const venueId = field(formData, "venue_id");
  const suspend = field(formData, "suspend") === "1";
  if (!UUID_PATTERN.test(venueId)) return { error: agencyErrorMessage({ message: "INTROUVABLE" }) };
  const { error } = await supabase.rpc("agency_set_suspended", {
    p_venue_id: venueId,
    p_suspended: suspend,
    p_note: field(formData, "note") || null,
  });
  if (error) return { error: agencyErrorMessage(error) };
  revalidatePath("/agence", "layout");
  return { done: suspend ? "Bar suspendu : plus de commandes, l'équipe n'a plus accès." : "Bar réactivé : tout fonctionne à nouveau." };
}
