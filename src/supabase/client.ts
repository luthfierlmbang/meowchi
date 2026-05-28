import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured =
  Boolean(supabaseUrl?.trim()) && Boolean(supabaseAnonKey?.trim());

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!.trim(), supabaseAnonKey!.trim())
  : null;

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInOrSignUp(email: string, password: string): Promise<Session | null> {
  if (!supabase) return null;
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });
  if (!error) return data.session;

  const shouldCreate =
    error.message.toLowerCase().includes('invalid login') ||
    error.message.toLowerCase().includes('invalid credentials');
  if (!shouldCreate) throw error;

  const created = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
  });
  if (created.error) throw created.error;
  return created.data.session;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
