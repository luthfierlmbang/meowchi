import { supabase } from './client';

export async function checkAdminAccess(email: string | undefined | null): Promise<boolean> {
  if (!supabase || !email?.trim()) return false;
  const { data, error } = await supabase
    .from('admin_users')
    .select('email')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle<{ email: string }>();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[Supabase Admin] access check failed:', error);
    return false;
  }
  return Boolean(data);
}
