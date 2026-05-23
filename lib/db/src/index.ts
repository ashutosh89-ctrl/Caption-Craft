import { createClient } from "@supabase/supabase-js";
import * as schema from "./schema";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("VITE_SUPABASE_URL must be set.");
}
if (!SUPABASE_ANON_KEY && !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY must be set.");
}

// Service-role client for server-side operations (bypasses RLS)
// Falls back to anon key if service role key is not available
export const supabase = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false } })
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY!);

// Pool is no longer used — kept as null for backward compat with connect-pg-simple import
export const pool = null as any;

export { schema };
export * from "./schema";
