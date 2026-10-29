import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, supabaseConfigured } from '../config';

export interface GuestSession {
  id: string;
  /** `supabase` is a real account row; `local` means no backend is configured yet. */
  mode: 'supabase' | 'local';
}

let client: SupabaseClient | undefined;

export function supabase(): SupabaseClient | undefined {
  if (!supabaseConfigured) return undefined;
  client ??= createClient(config.supabaseUrl!, config.supabaseKey!, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

function localId(): string {
  try {
    const existing = localStorage.getItem('alexion.guest');
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem('alexion.guest', fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Start playing with no signup. With Supabase configured this creates an anonymous user whose life
 * can later be linked to Google, Apple or email; without it, a local id keeps the app usable offline.
 */
export async function ensureGuest(): Promise<GuestSession> {
  const sb = supabase();
  if (!sb) return { id: localId(), mode: 'local' };

  const { data } = await sb.auth.getSession();
  if (data.session) return { id: data.session.user.id, mode: 'supabase' };

  const { data: created, error } = await sb.auth.signInAnonymously();
  if (error || !created.user) return { id: localId(), mode: 'local' };
  return { id: created.user.id, mode: 'supabase' };
}
