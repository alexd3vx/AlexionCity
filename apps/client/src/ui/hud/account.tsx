import { useEffect, useState } from 'react';
import { NAME_MAX_LENGTH, cleanName } from '@alexioncity/shared';
import { supabase } from '../../auth/guest';
import type { Multiplayer } from '../../net/useMultiplayer';

const heading = 'text-sm font-extrabold uppercase tracking-wider text-[#1b2340]/55';
const field =
  'min-w-0 flex-1 rounded-full bg-[#f3f5fa] px-4 py-2.5 text-[15px] font-semibold outline-none ring-[#ff7a1a] focus:ring-2';
const button =
  'shrink-0 rounded-full bg-[#1b2340] px-4 py-2.5 text-sm font-extrabold text-white active:scale-95 disabled:opacity-40';

type Who = { anonymous: boolean; email?: string | undefined };

/** Name, blocked players and account linking, the parts of Me that are about the person rather than the avatar. */
export function AccountSection({
  mp,
  name,
  onRename,
}: {
  mp: Multiplayer;
  name: string;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  const [who, setWho] = useState<Who | undefined>();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | undefined>();
  const sb = supabase();
  const clean = cleanName(draft);

  useEffect(() => {
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) setWho({ anonymous: Boolean(user.is_anonymous), email: user.email });
    });
  }, [sb]);

  // each provider needs to be switched on in the Supabase dashboard first; say so plainly when it is not
  const link = async (provider: 'google' | 'apple') => {
    if (!sb) return;
    const { error } = await sb.auth.linkIdentity({
      provider,
      options: { redirectTo: location.origin },
    });
    if (error)
      setMessage(
        `${provider === 'google' ? 'Google' : 'Apple'} sign-in is not set up yet. (${error.message})`,
      );
  };

  const saveEmail = async () => {
    if (!sb) return;
    const { error } = await sb.auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: location.origin },
    );
    setMessage(
      error
        ? `Could not save: ${error.message}`
        : 'Check your inbox and confirm the link. Then this guest is yours.',
    );
  };

  const signInWithEmail = async () => {
    if (!sb) return;
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: location.origin },
    });
    setMessage(
      error ? `Could not send the link: ${error.message}` : 'We emailed you a sign-in link.',
    );
  };

  const signOut = async () => {
    await sb?.auth.signOut();
    location.reload();
  };

  return (
    <>
      <section aria-label="Your name" className="space-y-2">
        <h3 className={heading}>Your name</h3>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (clean) onRename(clean);
          }}
        >
          <input
            aria-label="Display name"
            value={draft}
            maxLength={NAME_MAX_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            className={field}
          />
          <button type="submit" className={button} disabled={!clean || clean === name}>
            Save
          </button>
        </form>
      </section>

      <section aria-label="Blocked players" className="space-y-2">
        <h3 className={heading}>Blocked players</h3>
        {mp.room.blocks.length === 0 ? (
          <p className="text-sm text-[#1b2340]/60">
            Nobody. Tap a player&apos;s name tag to block or report them.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {mp.room.blocks.map((b) => (
              <li
                key={b.ref}
                className="flex items-center justify-between rounded-2xl bg-black/5 px-4 py-2.5"
              >
                <span className="font-extrabold">{b.name || 'Player'}</span>
                <button
                  className="text-sm font-extrabold text-[#1f6fd6]"
                  onClick={() => mp.unblock(b.ref)}
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sb && (
        <section aria-label="Account" className="space-y-3">
          <h3 className={heading}>Account</h3>
          {who && !who.anonymous ? (
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm text-[#1b2340]/70">
                Signed in as {who.email ?? 'a linked account'}.
              </p>
              <button className={button} onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-[#1b2340]/70">
                You are playing as a guest. Link an account so you can come back from any device and
                keep your life.
              </p>
              <div className="flex gap-2">
                <button className={`${button} flex-1`} onClick={() => void link('google')}>
                  Link Google
                </button>
                <button className={`${button} flex-1`} onClick={() => void link('apple')}>
                  Link Apple
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  aria-label="Email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={field}
                />
              </div>
              <div className="flex gap-2">
                <button
                  className={`${button} flex-1`}
                  disabled={!email.includes('@')}
                  onClick={() => void saveEmail()}
                >
                  Save guest to email
                </button>
                <button
                  className={`${button} flex-1 bg-black/10 !text-[#1b2340]`}
                  disabled={!email.includes('@')}
                  onClick={() => void signInWithEmail()}
                >
                  I already have an account
                </button>
              </div>
            </>
          )}
          {message && (
            <p role="status" className="rounded-2xl bg-[#fff3e0] px-4 py-2.5 text-sm font-semibold">
              {message}
            </p>
          )}
        </section>
      )}
    </>
  );
}
