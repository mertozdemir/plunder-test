import { createApi } from "@plunder/core";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.ts";

export const supabase = createClient(env.supabaseUrl ?? "http://localhost:54321", env.supabaseAnonKey ?? "missing", {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const api = createApi(supabase, { tokenServiceUrl: env.tokenServiceUrl });
