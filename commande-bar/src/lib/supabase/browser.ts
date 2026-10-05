"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

let client: SupabaseClient | undefined;

/** Client Supabase dans le navigateur (écran du bar), au nom de la personne connectée. */
export function getBrowserClient(): SupabaseClient {
  client ??= createBrowserClient(supabaseUrl, supabasePublishableKey);
  return client;
}
