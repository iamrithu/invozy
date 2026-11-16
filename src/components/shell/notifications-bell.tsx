'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Bell, Boxes, Building2, CalendarClock, CheckCircle2, Clock, Mail, MessageCircle, Send, Share2, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { getNotifications, markNotificationsRead, setDailyDigest, type NotificationEntry, type NotificationItem } from '@/actions/notifications';
import { Switch } from '@/components/ui/switch';
import { useSendDraft, useWhatsAppShare } from '@/hooks/use-invoices';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/brand';

// "Read" is stored per login on the server (so a phone and a laptop agree),
// with this browser's localStorage as the fallback while the server table
// doesn't exist yet. Each notification is read at a particular signature;
// when the data behind it changes (a new overdue invoice), the signature
// changes and it counts as unread again.
const READ_KEY = 'asb_notifications_read_v1';

function loadRead(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveRead(read: Record<string, string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(read));
  } catch {
    // private mode / storage blocked — the badge just won't remember
  }
}

const ICON: Record<NotificationItem['id'], React.ComponentType<{ size?: number; className?: string }>> = {
  overdue: AlertTriangle,
  drafts: Clock,
  stock: Boxes,
  expiring: CalendarClock,
  profile: Building2,
  catalog: Tag,
};
const TONE: Record<NotificationItem['severity'], string> = {
  critical: 'bg-red-soft text-red',
  warning: 'bg-gold-soft text-gold',
  info: 'bg-brand-light text-brand-dark',
};

/** The top bar's bell: a badge with how many alerts are new, and a panel
 * where each one can be acted on directly — remind on WhatsApp, send a
 * draft, open the product to restock. */
export function NotificationsBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [localRead, setLocalRead] = useState<Record<string, string>>({});
  // What was unread at the moment the panel opened — stays highlighted for
  // this viewing even though opening marks everything read.
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(),
    staleTime: 30_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });
  const items = useMemo(() => data?.items ?? [], [data]);
  const serverReads = data?.reads ?? null;

  useEffect(() => setLocalRead(loadRead()), []);
  const read = serverReads ?? localRead;
  const unread = items.filter((n) => read[n.id] !== n.signature);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setFreshIds(new Set(unread.map((n) => n.id)));
    // Opening the panel marks everything in it read — in this browser
    // straight away, and for this login on the server.
    const next = { ...localRead };
    for (const n of items) next[n.id] = n.signature;
    setLocalRead(next);
    saveRead(next);
    if (unread.length) {
      const marked = items.map((n) => ({ id: n.id, signature: n.signature }));
      queryClient.setQueryData(['notifications'], (old: typeof data) => (old && old.reads ? { ...old, reads: Object.fromEntries(marked.map((m) => [m.id, m.signature])) } : old));
      markNotificationsRead(marked).catch(() => {});
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const critical = unread.some((n) => n.severity === 'critical');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread.length ? `Notifications, ${unread.length} new` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2 border bg-surface text-ink-soft transition-colors hover:text-ink sm:h-9 sm:w-9',
          open ? 'border-brand text-brand' : 'border-line'
        )}
      >
        <Bell size={14} className="sm:hidden" />
        <Bell size={16} className="hidden sm:block" />
        {unread.length > 0 && (
          <span
            className={cn(
              'absolute -right-1.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold leading-none text-white ring-2 ring-surface',
              critical ? 'bg-red' : 'bg-brand'
            )}
          >
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-2 top-[56px] z-[70] flex max-h-[calc(100dvh-72px)] flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-elevated sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[400px] sm:max-h-[min(70vh,600px)]"
        >
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <span className="text-[14px] font-extrabold text-ink">Notifications</span>
            {items.length > 0 && <span className="rounded-full bg-surface-alt px-2 py-0.5 font-mono text-[10.5px] font-bold text-ink-soft">{items.length}</span>}
            <span className="ml-auto text-[11px] text-ink-faint">Updates every 2 min</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {isLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-8 w-8 flex-shrink-0 rounded-sm2" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-soft text-green">
                  <CheckCircle2 size={20} />
                </span>
                <div className="text-[13.5px] font-bold text-ink">You&apos;re all caught up</div>
                <p className="text-[12px] text-ink-faint">Overdue invoices, drafts holding stock and stock alerts show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((n) => (
                  <NotificationRow key={n.id} n={n} fresh={freshIds.has(n.id)} onNavigate={() => setOpen(false)} />
                ))}
              </ul>
            )}
          </div>
          {(items.length > 0 || data?.dailyDigest != null) && (
            <PanelFooter items={items} dailyDigest={data?.dailyDigest ?? null} onDigestChange={(v) => queryClient.setQueryData(['notifications'], (old: typeof data) => (old ? { ...old, dailyDigest: v } : old))} />
          )}
        </div>
      )}
    </div>
  );
}

/** Plain-text roll-up of every open notification — for "Share summary"
 * (to a partner, an accountant, or yourself on WhatsApp). */
function summaryText(items: NotificationItem[]): string {
  const lines = items.map((n) => {
    const top = n.entries.slice(0, 3).map((e) => `   • ${e.label}${e.value ? ` — ${e.value}` : ''}`);
    return [`▸ ${n.title}`, ...top].join('\n');
  });
  return `${APP_NAME} — needs attention (${new Date().toLocaleDateString('en-IN')})\n\n${lines.join('\n\n')}`;
}

function PanelFooter({ items, dailyDigest, onDigestChange }: { items: NotificationItem[]; dailyDigest: boolean | null; onDigestChange: (v: boolean) => void }) {
  const [saving, setSaving] = useState(false);
  async function toggleDigest(v: boolean) {
    setSaving(true);
    onDigestChange(v);
    const res = await setDailyDigest(v).catch((e) => ({ error: e?.message as string }));
    setSaving(false);
    if (res?.error) {
      onDigestChange(!v);
      toast.error(res.error);
    } else toast.success(v ? 'Daily summary email turned on' : 'Daily summary email turned off');
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-bg px-4 py-2.5">
      {items.length > 0 && (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(summaryText(items))}`}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1.5 text-[11.5px] font-bold text-ink-soft hover:text-ink"
        >
          <Share2 size={12} /> Share summary on WhatsApp
        </a>
      )}
      {dailyDigest !== null && (
        <label className="ml-auto flex items-center gap-2 text-[11.5px] font-semibold text-ink-soft" title="An email at 8 AM with overdue invoices, drafts holding stock, stock alerts and yesterday's sales">
          <Mail size={12} /> Daily email at 8 AM
          <Switch checked={dailyDigest} disabled={saving} onChange={(e) => toggleDigest(e.target.checked)} aria-label="Daily summary email" />
        </label>
      )}
    </div>
  );
}

function NotificationRow({ n, fresh, onNavigate }: { n: NotificationItem; fresh: boolean; onNavigate: () => void }) {
  const Icon = ICON[n.id];
  const shown = n.entries.slice(0, 3);
  const more = n.entries.length - shown.length;
  return (
    <li className={cn('px-4 py-3', fresh && 'bg-brand-light/40')}>
      <div className="flex gap-3">
        <span className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm2', TONE[n.severity])}>
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span className="text-[13px] font-bold leading-snug text-ink">{n.title}</span>
            {fresh && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-brand" aria-label="New" />}
          </div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-soft">{n.detail}</p>
        </div>
      </div>

      {shown.length > 0 && (
        <ul className="mt-2 space-y-1 pl-11">
          {shown.map((e) => (
            <EntryRow key={e.id} e={e} onNavigate={onNavigate} />
          ))}
        </ul>
      )}

      <div className="mt-2 pl-11">
        <Link href={n.href} onClick={onNavigate} className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand hover:underline">
          {more > 0 ? `${n.hrefLabel} (${more} more)` : n.hrefLabel} <ArrowRight size={11} />
        </Link>
      </div>
    </li>
  );
}

function EntryRow({ e, onNavigate }: { e: NotificationEntry; onNavigate: () => void }) {
  const router = useRouter();
  const whatsApp = useWhatsAppShare();
  const sendDraft = useSendDraft();
  const [done, setDone] = useState(false);
  const a = e.action;

  function remind() {
    if (a?.kind !== 'remind') return;
    const win = window.open('', '_blank');
    whatsApp.mutate(
      {
        invoiceId: a.invoiceId,
        phone: a.phone,
        win,
        reminder: true,
        buildMessage: (url) =>
          `Hello ${a.customer}, a gentle reminder: invoice ${a.number} has ${fmtInr(a.balance)} due (due ${new Date(a.due).toLocaleDateString('en-IN')}).\n\nView invoice: ${url}\n\nThank you!`,
      },
      {
        onSuccess: () => {
          setDone(true);
          toast.success(`Reminder for ${a.number} opened in WhatsApp`);
        },
        onError: (err: any) => toast.error(err?.message ?? 'Could not create the reminder link'),
      }
    );
  }

  function send() {
    if (a?.kind !== 'send-draft') return;
    sendDraft.mutate(a.invoiceId, {
      onSuccess: () => {
        setDone(true);
        toast.success(`${a.number} sent`);
        router.refresh();
      },
      onError: (err) => toast.error(err.message || 'Could not send the draft'),
    });
  }

  return (
    <li className="flex items-center gap-2 rounded-md2 border border-line bg-bg px-2.5 py-1.5">
      <Link href={e.href} onClick={onNavigate} className="min-w-0 flex-1 hover:text-brand">
        <div className="truncate text-[12px] font-bold text-ink">{e.label}</div>
        <div className="truncate text-[10.5px] text-ink-faint">{e.sub}</div>
      </Link>
      {e.value && <span className="flex-shrink-0 font-mono text-[11.5px] font-bold text-ink-body">{e.value}</span>}
      {a?.kind === 'remind' &&
        (done ? (
          <span className="flex-shrink-0 text-[10.5px] font-bold text-green">Sent</span>
        ) : (
          <button
            type="button"
            onClick={remind}
            disabled={whatsApp.isPending}
            aria-label={`Remind ${e.label} on WhatsApp`}
            className="flex flex-shrink-0 items-center gap-1 rounded-sm2 bg-green px-2 py-1 text-[10.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <MessageCircle size={11} /> Remind
          </button>
        ))}
      {a?.kind === 'send-draft' &&
        (done ? (
          <span className="flex-shrink-0 text-[10.5px] font-bold text-green">Sent</span>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={sendDraft.isPending}
            aria-label={`Send ${a.number}`}
            className="flex flex-shrink-0 items-center gap-1 rounded-sm2 bg-brand px-2 py-1 text-[10.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Send size={11} /> Send
          </button>
        ))}
    </li>
  );
}
