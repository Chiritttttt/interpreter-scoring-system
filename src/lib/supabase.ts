import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseKey  = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ── 当前登录用户 ──────────────────────────────────────────────
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signOut() {
  await supabase.auth.signOut();
}