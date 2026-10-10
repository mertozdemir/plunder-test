import { parseFlags } from "@plunder/core";

export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  tokenServiceUrl: (import.meta.env.VITE_TOKEN_SERVICE_URL as string | undefined) ?? "http://localhost:8787",
};

export const flags = parseFlags(import.meta.env);
export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
