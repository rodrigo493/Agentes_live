'use client';

import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import {
  format, addDays, addWeeks, subWeeks, addMonths, subMonths,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isSameMonth, isToday, getHours, getMinutes,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Calendar,
  Video,
  Phone,
  CheckSquare,
  Pencil,
  Trash2,
  X,
  ExternalLink,
  AlertCircle,
  Link2,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getCalendarEventsAction,
  createCalendarEventAction,
  updateCalendarEventAction,
  deleteCalendarEventAction,
  syncFromGoogleAction,
} from '../actions/calendar-actions';
import { useDesktopNotifications } from '@/features/notifications/hooks/use-desktop-notifications';
import type { CalendarEvent, CalendarEventType } from '@/shared/types/database';

// ── Constants ──────────────────────────────────────────────

const HOUR_H = 60; // px per hour (= 1px per minute)
const HOURS  = Array.from({ length: 24 }, (_, i) => i);

const EVENT_COLORS: Record<CalendarEventType, { bg: string; text: string; dot: string }> = {
  meeting: { bg: 'bg-blue-500',   text: 'text-white', dot: 'bg-blue-500'   },
  call:    { bg: 'bg-emerald-500',text: 'text-white', dot: 'bg-emerald-500' },
  task:    { bg: 'bg-violet-500', text: 'text-white', dot: 'bg-violet-500'  },
  event:   { bg: 'bg-amber-500',  text: 'text-white', dot: 'bg-amber-500'   },
};

const EVENT_LABELS: Record<CalendarEventType, string> = {
  meeting: 'Reunião', call: 'Call', task: 'Tarefa', event: 'Evento',
};

const EVENT_ICONS: Record<CalendarEventType, React.ComponentType<{className?: string}>> = {
  meeting: Video, call: Phone, task: CheckSquare, event: Calendar,
};

type CalView = 'semana' | 'mes' | 'dia';

// ── Helpers ────────────────────────────────────────────────

function toLocalDatetimeInput(iso: string) {
  return iso.slice(0, 16); // "YYYY-MM-DDTHH:MM"
}

function fromLocalDatetimeInput(val: string): string {
  return new Date(val).toISOString();
}

function getWeekRange(anchor: Date) {
  const start = startOfWeek(anchor, { weekStartsOn: 0 });
  const end   = endOfWeek(anchor,   { weekStartsOn: 0 });
  return { start, end };
}

function getMonthRange(anchor: Date) {
  return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
}

function eventTop(event: CalendarEvent): number {
  const d = new Date(event.start_at);
  return (getHours(d) * 60 + getMinutes(d)) * (HOUR_H / 60);
}

function eventHeight(event: CalendarEvent): number {
  const ms = new Date(event.end_at).getTime() - new Date(event.start_at).getTime();
  const mins = ms / 60000;
  return Math.max(mins * (HOUR_H / 60), 20);
}

function nowTop(): number {
  const d = new Date();
  return (getHours(d) * 60 + getMinutes(d)) * (HOUR_H / 60);
}

function isoWeekStart(anchor: Date): string {
  return startOfWeek(anchor, { weekStartsOn: 0 }).toISOString();
}
function isoWeekEnd(anchor: Date): string {
  return endOfWeek(anchor, { weekStartsOn: 0 }).toISOString();
}
function isoMonthStart(anchor: Date): string {
  return startOfMonth(anchor).toISOString();
}
function isoMonthEnd(anchor: Date): string {
  return endOfMonth(anchor).toISOString();
}

// ── Props ──────────────────────────────────────────────────

interface CalendarSectionProps {
  initialEvents: CalendarEvent[];
  googleConnected: boolean;
  googleEmail: string | null;
  googleConfigured: boolean;
}

// ── Empty form state ───────────────────────────────────────

function emptyForm(overrides?: Partial<FormState>): FormState {
  const now  = new Date();
  const plus1 = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    title: '',
    description: '',
    event_type: 'event' as CalendarEventType,
    start_at: toLocalDatetimeInput(now.toISOString()),
    end_at:   toLocalDatetimeInput(plus1.toISOString()),
    location: '',
    meet_url: '',
    reminder_minutes: 10,
    is_all_day: false,
    ...overrides,
  };
}

interface FormState {
  title: string;
  description: string;
  event_type: CalendarEventType;
  start_at: string;
  end_at: string;
  location: string;
  meet_url: string;
  reminder_minutes: number;
  is_all_day: boolean;
}

// ══════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════

export function CalendarSection({
  initialEvents,
  googleConnected,
  googleEmail,
  googleConfigured,
}: CalendarSectionProps) {
  const { notify } = useDesktopNotifications();
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [anchor, setAnchor] = useState(new Date());
  const [view, setView] = useState<CalView>('semana');
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);

  // Modal states
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  // Week view scroll ref
  const gridRef = useRef<HTMLDivElement>(null);
  const sentReminders = useRef<Set<string>>(new Set());

  // ── Scroll to current time on week/day view ────────────

  useEffect(() => {
    if ((view === 'semana' || view === 'dia') && gridRef.current) {
      const top = Math.max(nowTop() - 120, 0);
      gridRef.current.scrollTop = top;
    }
  }, [view, anchor]);

  // ── Fetch events when anchor/view changes ──────────────

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      let startIso: string, endIso: string;
      if (view === 'mes') {
        startIso = isoMonthStart(anchor);
        endIso   = isoMonthEnd(anchor);
      } else if (view === 'dia') {
        const d = new Date(anchor);
        d.setHours(0, 0, 0, 0);
        startIso = d.toISOString();
        d.setHours(23, 59, 59, 999);
        endIso = d.toISOString();
      } else {
        startIso = isoWeekStart(anchor);
        endIso   = isoWeekEnd(anchor);
      }
      const res = await getCalendarEventsAction(startIso, endIso);
      if (res.events) setEvents(res.events);
    } finally {
      setLoading(false);
    }
  }, [anchor, view]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // ── 10-min reminders ───────────────────────────────────

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const TEN = 10 * 60 * 1000;
      events.forEach((ev) => {
        const start = new Date(ev.start_at);
        const diff  = start.getTime() - now.getTime();
        const key   = `${ev.id}-${ev.start_at}`;
        if (diff > 0 && diff <= TEN && !sentReminders.current.has(key)) {
          sentReminders.current.add(key);
          const label = EVENT_LABELS[ev.event_type] ?? 'Evento';
          const timeStr = format(start, 'HH:mm');

          // In-app toast
          toast(`⏰ ${label} em 10 min`, {
            description: `${ev.title} — ${timeStr}`,
            duration: 12000,
          });

          // Browser/desktop notification
          notify(
            `⏰ ${label} em 10 minutos`,
            `${ev.title} às ${timeStr}`,
            '/producao',
          );
        }
      });
    };

    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [events, notify]);

  // ── Navigation ─────────────────────────────────────────

  function prev() {
    if (view === 'semana') setAnchor((a) => subWeeks(a, 1));
    else if (view === 'mes') setAnchor((a) => subMonths(a, 1));
    else setAnchor((a) => addDays(a, -1));
  }

  function next() {
    if (view === 'semana') setAnchor((a) => addWeeks(a, 1));
    else if (view === 'mes') setAnchor((a) => addMonths(a, 1));
    else setAnchor((a) => addDays(a, 1));
  }

  function goToday() { setAnchor(new Date()); }

  // ── Event CRUD ─────────────────────────────────────────

  function openCreate(day?: Date, hour?: number) {
    setEditing(null);
    const now  = day ? new Date(day) : new Date();
    if (hour !== undefined) { now.setHours(hour, 0, 0, 0); }
    const end  = new Date(now.getTime() + 60 * 60 * 1000);
    setForm(emptyForm({
      start_at: toLocalDatetimeInput(now.toISOString()),
      end_at:   toLocalDatetimeInput(end.toISOString()),
    }));
    setFormOpen(true);
  }

  function openEdit(ev: CalendarEvent, e?: React.MouseEvent) {
    e?.stopPropagation();
    setDetail(null);
    setEditing(ev);
    setForm({
      title:            ev.title,
      description:      ev.description ?? '',
      event_type:       ev.event_type,
      start_at:         toLocalDatetimeInput(ev.start_at),
      end_at:           toLocalDatetimeInput(ev.end_at),
      location:         ev.location ?? '',
      meet_url:         ev.meet_url ?? '',
      reminder_minutes: ev.reminder_minutes,
      is_all_day:       ev.is_all_day,
    });
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title:            form.title,
        description:      form.description || undefined,
        start_at:         fromLocalDatetimeInput(form.start_at),
        end_at:           fromLocalDatetimeInput(form.end_at),
        event_type:       form.event_type,
        location:         form.location || undefined,
        meet_url:         form.meet_url || undefined,
        is_all_day:       form.is_all_day,
        reminder_minutes: form.reminder_minutes,
      };

      if (editing) {
        const res = await updateCalendarEventAction(editing.id, payload);
        if (res.error) { toast.error(res.error); return; }
        setEvents((prev) => prev.map((e) => e.id === editing.id ? res.event! : e));
        toast.success('Evento atualizado');
      } else {
        const res = await createCalendarEventAction(payload);
        if (res.error) { toast.error(res.error); return; }
        setEvents((prev) => [...prev, res.event!]);
        toast.success(googleConnected ? 'Evento criado e enviado ao Google Calendar' : 'Evento criado');
      }
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este evento?')) return;
    const res = await deleteCalendarEventAction(id);
    if (res.error) { toast.error(res.error); return; }
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setDetail(null);
    toast.success('Evento removido');
  }

  async function handleSync() {
    setSyncing(true);
    try {
      let startIso: string, endIso: string;
      if (view === 'mes') {
        startIso = isoMonthStart(anchor); endIso = isoMonthEnd(anchor);
      } else {
        startIso = isoWeekStart(anchor); endIso = isoWeekEnd(anchor);
      }
      const res = await syncFromGoogleAction(startIso, endIso);
      if (res.error) { toast.error(res.error); return; }
      await fetchEvents();
      toast.success(`${res.synced} evento(s) sincronizado(s)`);
    } finally {
      setSyncing(false);
    }
  }

  // ── Header label ───────────────────────────────────────

  function headerLabel() {
    if (view === 'mes') return format(anchor, 'MMMM yyyy', { locale: ptBR });
    if (view === 'dia') return format(anchor, "EEEE, d 'de' MMMM", { locale: ptBR });
    const ws = startOfWeek(anchor, { weekStartsOn: 0 });
    const we = endOfWeek(anchor,   { weekStartsOn: 0 });
    if (isSameMonth(ws, we)) {
      return `${format(ws, 'd')} – ${format(we, 'd')} de ${format(ws, 'MMMM yyyy', { locale: ptBR })}`;
    }
    return `${format(ws, 'd MMM', { locale: ptBR })} – ${format(we, 'd MMM yyyy', { locale: ptBR })}`;
  }

  // ── Render ─────────────────────────────────────────────

  const { start: weekS } = getWeekRange(anchor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekS, i));

  function EventChip({ ev, compact = false }: { ev: CalendarEvent; compact?: boolean }) {
    const c = EVENT_COLORS[ev.event_type];
    return (
      <div
        className={`${c.bg} ${c.text} rounded px-1 py-0.5 text-[10px] font-medium truncate cursor-pointer hover:opacity-80`}
        onClick={(e) => { e.stopPropagation(); setDetail(ev); }}
      >
        {!compact && `${format(new Date(ev.start_at), 'HH:mm')} `}{ev.title}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <span className="text-base font-semibold">Calendário</span>
        {googleConnected && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Google: {googleEmail}
          </Badge>
        )}
        {!googleConnected && !googleConfigured && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Google Calendar desativado
          </Badge>
        )}
      </div>

      {/* Calendar card */}
      <div className="border border-border rounded-xl bg-card overflow-hidden" style={{ height: '680px' }}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card z-10">
          {/* Nav */}
          <button onClick={prev} className="p-1 rounded hover:bg-muted">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={next} className="p-1 rounded hover:bg-muted">
            <ChevronRight className="w-4 h-4" />
          </button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={goToday}>
            Hoje
          </Button>

          <span className="text-sm font-semibold flex-1 ml-1 capitalize">{headerLabel()}</span>

          {/* View switcher */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['dia', 'semana', 'mes'] as CalView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* Actions */}
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => openCreate(anchor)}>
            <Plus className="w-3.5 h-3.5" /> Evento
          </Button>

          {!googleConnected && googleConfigured && (
            <a href="/api/auth/google/calendar">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <ExternalLink className="w-3 h-3" /> Conectar Google
              </Button>
            </a>
          )}
          {googleConnected && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sync...' : 'Sync'}
            </Button>
          )}
          {!googleConfigured && (
            <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" title="Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.local">
                <AlertCircle className="w-3 h-3" /> Config Google
              </Button>
            </a>
          )}
        </div>

        {/* ─── WEEK VIEW ─── */}
        {view === 'semana' && (
          <div className="flex flex-col h-[calc(100%-45px)]">
            {/* Day headers */}
            <div className="flex border-b border-border bg-card">
              <div className="w-14 flex-shrink-0" />
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className="flex-1 py-1.5 text-center cursor-pointer hover:bg-muted/30"
                  onClick={() => { setAnchor(day); setView('dia'); }}
                >
                  <div className="text-[11px] text-muted-foreground uppercase">
                    {format(day, 'EEE', { locale: ptBR })}
                  </div>
                  <div className={`text-base font-semibold mx-auto w-8 h-8 flex items-center justify-center rounded-full ${
                    isToday(day) ? 'bg-primary text-primary-foreground' : ''
                  }`}>
                    {format(day, 'd')}
                  </div>
                </div>
              ))}
            </div>

            {/* Time grid */}
            <div ref={gridRef} className="flex-1 overflow-y-auto">
              <div className="relative flex">
                {/* Hour labels */}
                <div className="w-14 flex-shrink-0 relative">
                  {HOURS.map((h) => (
                    <div key={h} style={{ height: HOUR_H }} className="relative">
                      {h > 0 && (
                        <span className="absolute -top-2 right-2 text-[10px] text-muted-foreground select-none">
                          {String(h).padStart(2, '0')}:00
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {weekDays.map((day) => {
                  const dayEvents = events.filter((e) => isSameDay(new Date(e.start_at), day));
                  return (
                    <div key={day.toISOString()} className="flex-1 relative border-l border-border/40 min-w-0">
                      {/* Hour slots */}
                      {HOURS.map((h) => (
                        <div
                          key={h}
                          style={{ height: HOUR_H }}
                          className="border-b border-border/20 hover:bg-primary/5 cursor-pointer"
                          onClick={() => openCreate(day, h)}
                        />
                      ))}

                      {/* Current time line */}
                      {isToday(day) && (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none"
                          style={{ top: nowTop() }}
                        >
                          <div className="relative border-t-2 border-red-500">
                            <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
                          </div>
                        </div>
                      )}

                      {/* Events */}
                      {dayEvents.map((ev) => {
                        const c = EVENT_COLORS[ev.event_type];
                        const Icon = EVENT_ICONS[ev.event_type];
                        const h = eventHeight(ev);
                        return (
                          <div
                            key={ev.id}
                            className={`absolute ${c.bg} ${c.text} rounded-md overflow-hidden cursor-pointer hover:opacity-90 transition-opacity z-10 shadow-sm`}
                            style={{ top: eventTop(ev), height: h, left: 2, right: 2 }}
                            onClick={() => setDetail(ev)}
                          >
                            <div className="px-1.5 py-0.5 h-full flex flex-col overflow-hidden">
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Icon className="w-2.5 h-2.5 flex-shrink-0 opacity-80" />
                                <span className="text-[11px] font-semibold truncate">{ev.title}</span>
                              </div>
                              {h >= 32 && (
                                <span className="text-[10px] opacity-80">
                                  {format(new Date(ev.start_at), 'HH:mm')} – {format(new Date(ev.end_at), 'HH:mm')}
                                </span>
                              )}
                              {h >= 48 && ev.location && (
                                <span className="text-[10px] opacity-70 truncate flex items-center gap-0.5">
                                  <MapPin className="w-2 h-2" />{ev.location}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ─── DAY VIEW ─── */}
        {view === 'dia' && (
          <div className="flex flex-col h-[calc(100%-45px)]">
            <div ref={gridRef} className="flex-1 overflow-y-auto">
              <div className="relative flex">
                <div className="w-14 flex-shrink-0 relative">
                  {HOURS.map((h) => (
                    <div key={h} style={{ height: HOUR_H }} className="relative">
                      {h > 0 && (
                        <span className="absolute -top-2 right-2 text-[10px] text-muted-foreground">
                          {String(h).padStart(2, '0')}:00
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex-1 relative border-l border-border/40">
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      style={{ height: HOUR_H }}
                      className="border-b border-border/20 hover:bg-primary/5 cursor-pointer"
                      onClick={() => openCreate(anchor, h)}
                    />
                  ))}
                  {isToday(anchor) && (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowTop() }}>
                      <div className="relative border-t-2 border-red-500">
                        <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
                      </div>
                    </div>
                  )}
                  {events.filter((e) => isSameDay(new Date(e.start_at), anchor)).map((ev) => {
                    const c = EVENT_COLORS[ev.event_type];
                    const Icon = EVENT_ICONS[ev.event_type];
                    const h = eventHeight(ev);
                    return (
                      <div
                        key={ev.id}
                        className={`absolute ${c.bg} ${c.text} rounded-md overflow-hidden cursor-pointer hover:opacity-90 z-10 shadow-sm`}
                        style={{ top: eventTop(ev), height: h, left: 2, right: 2 }}
                        onClick={() => setDetail(ev)}
                      >
                        <div className="px-2 py-1 h-full flex flex-col overflow-hidden">
                          <div className="flex items-center gap-1">
                            <Icon className="w-3 h-3 flex-shrink-0" />
                            <span className="text-sm font-semibold truncate">{ev.title}</span>
                          </div>
                          {h >= 32 && (
                            <span className="text-xs opacity-80">
                              {format(new Date(ev.start_at), 'HH:mm')} – {format(new Date(ev.end_at), 'HH:mm')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── MONTH VIEW ─── */}
        {view === 'mes' && (() => {
          const monthStart = startOfMonth(anchor);
          const monthEnd   = endOfMonth(anchor);
          const gridStart  = startOfWeek(monthStart, { weekStartsOn: 0 });
          const gridEnd    = endOfWeek(monthEnd,     { weekStartsOn: 0 });
          const days       = eachDayOfInterval({ start: gridStart, end: gridEnd });

          return (
            <div className="flex flex-col h-[calc(100%-45px)]">
              {/* Day names header */}
              <div className="grid grid-cols-7 border-b border-border">
                {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((d) => (
                  <div key={d} className="py-1.5 text-center text-[11px] font-semibold text-muted-foreground uppercase">
                    {d}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-7 h-full" style={{ gridAutoRows: 'minmax(80px,1fr)' }}>
                  {days.map((day) => {
                    const dayEvents = events
                      .filter((e) => isSameDay(new Date(e.start_at), day))
                      .sort((a, b) => a.start_at.localeCompare(b.start_at));
                    const isCurrentMonth = isSameMonth(day, anchor);

                    return (
                      <div
                        key={day.toISOString()}
                        className={`border-r border-b border-border/50 p-1 min-h-[80px] cursor-pointer hover:bg-muted/20 transition-colors ${!isCurrentMonth ? 'opacity-40' : ''}`}
                        onClick={() => { setAnchor(day); setView('dia'); }}
                      >
                        <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-0.5 ${
                          isToday(day) ? 'bg-primary text-primary-foreground' : ''
                        }`}>
                          {format(day, 'd')}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map((ev) => (
                            <EventChip key={ev.id} ev={ev} compact={false} />
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} mais</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ─── Modal: Criar / Editar Evento ─── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar evento' : 'Novo evento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {/* Type */}
            <div className="flex gap-1.5">
              {(['event', 'meeting', 'call', 'task'] as CalendarEventType[]).map((t) => {
                const Icon = EVENT_ICONS[t];
                const c = EVENT_COLORS[t];
                return (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, event_type: t }))}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 text-xs font-medium transition-colors ${
                      form.event_type === t
                        ? `${c.bg} ${c.text} border-transparent`
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {EVENT_LABELS[t]}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1">
              <Label>Título *</Label>
              <Input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Título do evento" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Início</Label>
                <Input type="datetime-local" value={form.start_at} onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Fim</Label>
                <Input type="datetime-local" value={form.end_at} onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea rows={2} className="resize-none" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Detalhes..." />
            </div>

            <div className="space-y-1">
              <Label className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Local</Label>
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Endereço ou sala" />
            </div>

            {(form.event_type === 'meeting' || form.event_type === 'call') && (
              <div className="space-y-1">
                <Label className="flex items-center gap-1"><Link2 className="w-3 h-3" /> Link da reunião</Label>
                <Input value={form.meet_url} onChange={(e) => setForm((f) => ({ ...f, meet_url: e.target.value }))} placeholder="https://meet.google.com/..." />
              </div>
            )}

            <div className="space-y-1">
              <Label>Lembrete (minutos antes)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={form.reminder_minutes}
                onChange={(e) => setForm((f) => ({ ...f, reminder_minutes: Number(e.target.value) }))}
              />
            </div>

            <Button onClick={handleSave} disabled={saving || !form.title.trim()} className="w-full">
              {saving ? 'Salvando...' : editing ? 'Salvar' : googleConnected ? 'Criar e sincronizar' : 'Criar evento'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Detalhe do Evento ─── */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-sm">
          {detail && (() => {
            const c = EVENT_COLORS[detail.event_type];
            const Icon = EVENT_ICONS[detail.event_type];
            return (
              <>
                <div className={`-mx-6 -mt-6 px-6 pt-5 pb-4 rounded-t-lg ${c.bg}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-5 h-5 text-white flex-shrink-0" />
                      <DialogTitle className="text-white text-base font-bold leading-snug">
                        {detail.title}
                      </DialogTitle>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={(e) => openEdit(detail, e)} className="p-1 rounded bg-white/20 hover:bg-white/30">
                        <Pencil className="w-3.5 h-3.5 text-white" />
                      </button>
                      <button onClick={() => handleDelete(detail.id)} className="p-1 rounded bg-white/20 hover:bg-white/30">
                        <Trash2 className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  </div>
                  <p className="text-white/80 text-xs mt-1.5">
                    {format(new Date(detail.start_at), "EEEE, d 'de' MMMM · HH:mm", { locale: ptBR })}
                    {' – '}
                    {format(new Date(detail.end_at), 'HH:mm')}
                  </p>
                </div>

                <div className="space-y-3 pt-1">
                  {detail.description && (
                    <p className="text-sm whitespace-pre-wrap">{detail.description}</p>
                  )}
                  {detail.location && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      {detail.location}
                    </div>
                  )}
                  {detail.meet_url && (
                    <a href={detail.meet_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Link2 className="w-3.5 h-3.5 flex-shrink-0" />
                      Entrar na reunião
                    </a>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="w-3 h-3" />
                    Lembrete {detail.reminder_minutes} min antes
                    {detail.google_event_id && (
                      <Badge variant="secondary" className="text-[10px] gap-1 ml-auto">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Google
                      </Badge>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
