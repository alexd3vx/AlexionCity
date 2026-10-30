/** Who a connection really is. The server never trusts a name or id sent by the browser. */
export interface Identity {
  userId: string;
  anonymous: boolean;
}

export interface Verifier {
  /** Returns the identity, or undefined when the credentials are missing or wrong. */
  verify(credentials: {
    token?: string | undefined;
    guestId?: string | undefined;
  }): Promise<Identity | undefined>;
}

type FetchFn = typeof fetch;

/**
 * Checks a player's Supabase access token by asking Supabase Auth who it belongs to. This works for
 * anonymous guests and for linked accounts alike, and needs no signing keys on the game server.
 */
export function createSupabaseVerifier(opts: {
  url: string;
  key: string;
  fetchFn?: FetchFn;
}): Verifier {
  const fetchFn = opts.fetchFn ?? ((...a) => fetch(...a));
  return {
    async verify({ token }) {
      if (!token || token.length > 4000) return undefined;
      try {
        const res = await fetchFn(`${opts.url.replace(/\/$/, '')}/auth/v1/user`, {
          headers: { apikey: opts.key, Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return undefined;
        const user = (await res.json()) as { id?: unknown; is_anonymous?: unknown };
        return typeof user.id === 'string'
          ? { userId: user.id, anonymous: user.is_anonymous === true }
          : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * For local development without Supabase: any well-formed guest id is accepted. Never enabled in
 * production, because it lets anyone pick any identity.
 */
export function createDevVerifier(): Verifier {
  return {
    async verify({ guestId }) {
      return guestId && /^[A-Za-z0-9-]{8,64}$/.test(guestId)
        ? { userId: `guest:${guestId}`, anonymous: true }
        : undefined;
    },
  };
}

/** Try each verifier in turn; the first that recognises the credentials wins. */
export function firstOf(...verifiers: Verifier[]): Verifier {
  return {
    async verify(credentials) {
      for (const v of verifiers) {
        const identity = await v.verify(credentials);
        if (identity) return identity;
      }
      return undefined;
    },
  };
}

export interface AuthEnv {
  SUPABASE_URL?: string | undefined;
  SUPABASE_SECRET_KEY?: string | undefined;
  NODE_ENV?: string | undefined;
  ALLOW_DEV_GUESTS?: string | undefined;
}

/** Real verification when Supabase is configured; dev guests only outside production, or when asked for. */
export function verifierFromEnv(env: AuthEnv): Verifier {
  const list: Verifier[] = [];
  if (env.SUPABASE_URL && env.SUPABASE_SECRET_KEY)
    list.push(createSupabaseVerifier({ url: env.SUPABASE_URL, key: env.SUPABASE_SECRET_KEY }));
  const devAllowed =
    env.ALLOW_DEV_GUESTS === '1' || (env.NODE_ENV !== 'production' && env.ALLOW_DEV_GUESTS !== '0');
  if (devAllowed) list.push(createDevVerifier());
  return firstOf(...list);
}
