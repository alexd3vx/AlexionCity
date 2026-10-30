import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import {
  CHAT_MAX_LENGTH,
  EMOTES,
  NAME_MAX_LENGTH,
  REPORT_REASONS,
  cleanName,
  type Emote,
  type ReportReason,
} from '@alexioncity/shared';
import type { NetStatus } from '../../net/client';
import { rejectionText, type ChatLine } from '../../net/room';
import type { Multiplayer } from '../../net/useMultiplayer';
import { Icon } from './icons';

const glass =
  'pointer-events-auto rounded-full bg-white/92 text-[#1b2340] shadow-[0_6px_18px_rgba(27,35,64,0.22)] backdrop-blur';
const chip = (on: boolean) =>
  `rounded-full px-3 py-1.5 text-sm font-extrabold active:scale-95 ${on ? 'bg-[#1b2340] text-white' : 'bg-black/5 text-[#1b2340]'}`;

const STATUS_DOT: Record<NetStatus, string> = {
  online: 'bg-emerald-500',
  connecting: 'bg-amber-400',
  reconnecting: 'bg-amber-400',
  offline: 'bg-slate-400',
  rejected: 'bg-rose-500',
};

const STATUS_TEXT: Record<NetStatus, string> = {
  online: 'Online',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
  rejected: 'Disconnected',
};

const REASON_TEXT: Record<ReportReason, string> = {
  harassment: 'Harassment or bullying',
  spam: 'Spam or advertising',
  inappropriate_name: 'Inappropriate name',
  cheating: 'Cheating',
  other: 'Something else',
};

const EMOTE_TEXT: Record<Emote, string> = {
  wave: 'Wave',
  clap: 'Clap',
  dance: 'Dance',
  laugh: 'Laugh',
};

export function ChatButton({ mp, onOpen }: { mp: Multiplayer; onOpen: () => void }) {
  const { status } = mp.room;
  const unread = mp.room.unread;
  return (
    <button
      aria-label={`Chat, ${STATUS_TEXT[status]}${unread ? `, ${unread} new` : ''}`}
      className={`${glass} relative grid h-12 w-12 place-items-center active:scale-95`}
      onClick={onOpen}
    >
      <Icon name="chat" className="h-6 w-6" />
      <span
        className={`absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-white ${STATUS_DOT[status]}`}
        data-status={status}
      />
      {unread > 0 && (
        <span className="absolute -left-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#ff7a1a] px-1 text-[11px] font-extrabold leading-5 text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}

/** The newest few lines, shown for a few seconds so the game stays in view. */
export function ChatFeed({ lines }: { lines: ChatLine[] }) {
  const firstSeen = useRef(new Map<number, number>());
  const [, tick] = useState(0);
  const now = Date.now();
  for (const l of lines) if (!firstSeen.current.has(l.key)) firstSeen.current.set(l.key, now);
  const live = lines.filter((l) => now - (firstSeen.current.get(l.key) ?? now) < 9000).slice(-3);

  useEffect(() => {
    if (live.length === 0) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [live.length]);

  if (live.length === 0) return null;
  return (
    <ul className="pointer-events-none flex max-w-[60vw] flex-col gap-1" aria-label="Recent chat">
      {live.map((l) => (
        <li
          key={l.key}
          className="w-fit max-w-full break-words rounded-2xl bg-[#1b2340]/72 px-3 py-1.5 text-[13px] font-semibold leading-snug text-white backdrop-blur"
        >
          <b className={l.self ? 'text-[#ffb36b]' : 'text-[#9fd2ff]'}>{l.name}</b> {l.text}
        </li>
      ))}
    </ul>
  );
}

export function ConnectionPill({
  status,
  reason,
}: {
  status: NetStatus;
  reason: string | undefined;
}) {
  if (status === 'online' || status === 'offline') return null;
  const bad = status === 'rejected';
  return (
    <motion.div
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      role="status"
      className={`pointer-events-auto max-w-[88vw] rounded-full px-3.5 py-1.5 text-center text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(27,35,64,0.25)] ${bad ? 'bg-rose-600' : 'bg-[#1b2340]/85'}`}
    >
      {bad
        ? rejectionText(reason)
        : status === 'connecting'
          ? 'Joining the city…'
          : 'Reconnecting to the city…'}
    </motion.div>
  );
}

export function ChatSheet({ mp }: { mp: Multiplayer }) {
  const [text, setText] = useState('');
  const list = useRef<HTMLUListElement>(null);
  const { room } = mp;
  const online = room.status === 'online';

  useEffect(() => {
    mp.markRead();
    list.current?.scrollTo({ top: list.current.scrollHeight });
    // the sheet being open means every new line is read
  }, [room.lines.length]);

  const send = () => {
    const t = text.trim();
    if (!t || !online) return;
    mp.chat(t);
    setText('');
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[#1b2340]/65">
        {online
          ? `You are in ${room.channel ?? 'the city'}. Players within about 80 m can read what you say.`
          : 'Chat works when you are connected to the city.'}
      </p>
      <ul
        ref={list}
        aria-label="Chat history"
        className="flex h-[34dvh] flex-col gap-1.5 overflow-y-auto rounded-2xl bg-[#f3f5fa] p-3"
      >
        {room.lines.length === 0 && (
          <li className="m-auto text-center text-sm text-[#1b2340]/50">
            No messages yet. Say hello!
          </li>
        )}
        {room.lines.map((l) => (
          <li key={l.key} className="break-words text-sm leading-snug">
            <button
              className={`font-extrabold ${l.self ? 'text-[#d9600a]' : 'text-[#1f6fd6]'}`}
              disabled={l.self}
              onClick={() => mp.select(l.from)}
            >
              {l.name}
            </button>{' '}
            {l.text}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2" aria-label="Emotes">
        {EMOTES.map((e) => (
          <button key={e} className={chip(false)} disabled={!online} onClick={() => mp.emote(e)}>
            {EMOTE_TEXT[e]}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          aria-label="Message"
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder={online ? 'Say something nice…' : 'Not connected'}
          disabled={!online}
          enterKeyHint="send"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-full bg-[#f3f5fa] px-4 py-3 text-[15px] font-semibold outline-none ring-[#ff7a1a] focus:ring-2 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!online || !text.trim()}
          className="rounded-full bg-[#ff7a1a] px-5 text-sm font-extrabold text-white active:scale-95 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}

/** Opens when a name tag is tapped: mute for this session, block for good, or report to the team. */
export function PlayerCard({ mp, show }: { mp: Multiplayer; show: (message: string) => void }) {
  const peer = mp.selected;
  const [mode, setMode] = useState<'menu' | 'report'>('menu');
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');

  useEffect(() => {
    setMode('menu');
    setDetails('');
  }, [peer?.id]);

  const close = () => mp.select(undefined);
  const muted = peer ? mp.isMuted(peer.id) : false;
  const row =
    'flex w-full items-center justify-between rounded-2xl bg-black/5 px-4 py-3.5 text-left text-[15px] font-extrabold active:bg-black/10';

  return (
    <AnimatePresence>
      {peer && (
        <motion.div
          key="scrim"
          className="pointer-events-auto absolute inset-0 z-30 flex items-end justify-center bg-[#1b2340]/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.section
            role="dialog"
            aria-label={`Player ${peer.name}`}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[#1b2340] shadow-[0_-10px_40px_rgba(27,35,64,0.35)]"
          >
            <header className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-extrabold">{peer.name}</h2>
              <button
                aria-label="Close player card"
                className="grid h-9 w-9 place-items-center rounded-full bg-black/5 active:bg-black/10"
                onClick={close}
              >
                <Icon name="close" />
              </button>
            </header>

            {mode === 'menu' ? (
              <div className="flex flex-col gap-2.5">
                <button
                  className={row}
                  onClick={() => {
                    if (muted) mp.unmute(peer.id);
                    else mp.mute(peer.id);
                    show(muted ? `Unmuted ${peer.name}` : `Muted ${peer.name} until you leave`);
                    close();
                  }}
                >
                  {muted ? 'Unmute chat' : 'Mute chat'}
                  <span className="text-xs font-bold text-[#1b2340]/50">this visit only</span>
                </button>
                <button
                  className={row}
                  onClick={() => {
                    mp.block(peer.id);
                    show(`Blocked ${peer.name}. Manage blocks in Me.`);
                    close();
                  }}
                >
                  Block
                  <span className="text-xs font-bold text-[#1b2340]/50">hides them, both ways</span>
                </button>
                <button className={`${row} text-rose-600`} onClick={() => setMode('report')}>
                  Report
                  <span className="text-xs font-bold text-[#1b2340]/50">tell the team</span>
                </button>
              </div>
            ) : (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  mp.report(peer.id, reason, details.trim());
                  show('Thanks. The team will take a look.');
                  close();
                }}
              >
                <p className="text-sm text-[#1b2340]/65">
                  Your report includes the recent chat nearby so the team can see what happened.
                </p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
                  {REPORT_REASONS.map((r) => (
                    <button
                      type="button"
                      key={r}
                      role="radio"
                      aria-checked={reason === r}
                      className={chip(reason === r)}
                      onClick={() => setReason(r)}
                    >
                      {REASON_TEXT[r]}
                    </button>
                  ))}
                </div>
                <textarea
                  aria-label="Details"
                  value={details}
                  maxLength={500}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Anything else we should know? (optional)"
                  rows={3}
                  className="resize-none rounded-2xl bg-[#f3f5fa] px-4 py-3 text-[15px] font-semibold outline-none ring-[#ff7a1a] focus:ring-2"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`${chip(false)} flex-1 py-3`}
                    onClick={() => setMode('menu')}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-full bg-rose-600 py-3 text-sm font-extrabold text-white active:scale-95"
                  >
                    Send report
                  </button>
                </div>
              </form>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Shown once, before the first join: how other players will see this one. */
export function NamePrompt({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (name: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const clean = cleanName(value);
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-[#1b2340]/70 px-4 backdrop-blur-sm">
      <form
        role="dialog"
        aria-label="Choose your name"
        className="w-full max-w-sm rounded-3xl bg-white p-6 text-[#1b2340] shadow-[0_20px_60px_rgba(0,0,0,0.4)]"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean) onDone(clean);
        }}
      >
        <h2 className="font-display text-2xl font-extrabold">What should we call you?</h2>
        <p className="mt-1 text-sm text-[#1b2340]/65">
          This is the name other players see above your head. You can change it later in Me.
        </p>
        <input
          aria-label="Your name"
          autoFocus
          value={value}
          maxLength={NAME_MAX_LENGTH}
          onChange={(e) => setValue(e.target.value)}
          className="mt-4 w-full rounded-2xl bg-[#f3f5fa] px-4 py-3.5 text-lg font-extrabold outline-none ring-[#ff7a1a] focus:ring-2"
        />
        <p className="mt-1.5 min-h-5 text-xs font-bold text-[#1b2340]/50">
          {clean ? '' : 'Use 2 to 20 letters, numbers or spaces.'}
        </p>
        <button
          type="submit"
          disabled={!clean}
          className="mt-3 w-full rounded-full bg-[#ff7a1a] py-3.5 text-base font-extrabold text-white shadow-[0_6px_18px_rgba(255,122,26,0.45)] active:scale-95 disabled:opacity-40"
        >
          Enter AlexionCity
        </button>
      </form>
    </div>
  );
}
