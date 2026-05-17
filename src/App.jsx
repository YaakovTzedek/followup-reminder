import { useState, useEffect, useMemo, useCallback } from 'react';
import { Phone, MessageCircle, Bell, Clock, CheckCircle2, X, AlertCircle, Inbox, ChevronUp } from 'lucide-react';
import mondaySdk from 'monday-sdk-js';

const monday = mondaySdk();

const COLUMN_IDS = {
  followUpDate: 'date5__1',
  assignee: 'person',
  phone: 'phone',
  status: 'status',
  notes: 'long_text6__1',
  source: 'dropdown6',
};

/* ---------- DATA HOOK ---------- */
function useMondayData() {
  const [items, setItems] = useState([]);
  const [user, setUser] = useState(null);
  const [boardId, setBoardId] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const ctxRes = await monday.get('context');
      const ctx = ctxRes.data;
      const meRes = await monday.api(`query { me { id email name } }`);
      const me = meRes.data.me;
      setUser(me);
      setBoardId(ctx.boardId);

      const cols = Object.values(COLUMN_IDS).map(c => `"${c}"`).join(',');
      const q = `query {
        boards(ids: [${ctx.boardId}]) {
          items_page(limit: 500) {
            items {
              id name
              column_values(ids: [${cols}]) { id type text value }
            }
          }
        }
      }`;
      const res = await monday.api(q);
      const raw = res.data.boards[0].items_page.items;

      const myId = String(me.id);
      const mapped = raw.map(it => {
        const col = id => it.column_values.find(c => c.id === id) || {};
        const dateVal = JSON.parse(col(COLUMN_IDS.followUpDate).value || 'null');
        const peopleVal = JSON.parse(col(COLUMN_IDS.assignee).value || '{}');
        const followUpAt = dateVal && dateVal.date
          ? new Date(`${dateVal.date}T${dateVal.time || '09:00:00'}`)
          : null;
        const assignedTo = (peopleVal.personsAndTeams || []).map(p => String(p.id));
        return {
          id: it.id,
          name: it.name,
          followUpAt,
          assignedTo,
          phone: col(COLUMN_IDS.phone).text || '',
          status: col(COLUMN_IDS.status).text || '',
          notes: col(COLUMN_IDS.notes).text || '',
          source: col(COLUMN_IDS.source).text || '',
        };
      }).filter(it => it.followUpAt && it.assignedTo.includes(myId));

      setItems(mapped);
      setError(null);
    } catch (e) {
      console.error('Monday fetch error', e);
      setError(e.message || String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 60_000);
    return () => clearInterval(i);
  }, [refresh]);

  return { items, user, boardId, error, refresh };
}

/* ---------- HELPERS ---------- */
const pad = (n) => String(n).padStart(2, '0');

const countdown = (d) => {
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  const secs = Math.floor((abs % 60_000) / 1000);

  if (diff < 0) {
    if (abs < 60_000) return { text: 'הגיע הזמן!', urgency: 'overdue' };
    if (abs < 3_600_000) return { text: `איחור ${mins}:${pad(secs)}`, urgency: 'overdue' };
    if (abs < 86_400_000) return { text: `איחור ${hours}ש׳ ${mins}ד׳`, urgency: 'overdue' };
    if (days === 1) return { text: 'איחור יום', urgency: 'overdue' };
    if (days < 7) return { text: `איחור ${days} ימים`, urgency: 'overdue' };
    if (days < 30) return { text: `איחור ${Math.floor(days / 7)} שבועות`, urgency: 'overdue' };
    return { text: `איחור ${Math.floor(days / 30)} חודשים`, urgency: 'overdue' };
  }
  if (diff < 60_000) return { text: `${secs} שניות`, urgency: 'urgent' };
  if (diff < 3_600_000) return { text: `${mins}:${pad(secs)}`, urgency: 'urgent' };
  if (diff < 86_400_000) return { text: `${pad(hours)}:${pad(mins)}:${pad(secs)}`, urgency: 'soon' };
  if (days === 1) return { text: 'מחר', urgency: 'normal' };
  if (days < 7) return { text: `בעוד ${days} ימים`, urgency: 'normal' };
  return { text: d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }), urgency: 'far' };
};

const hhmm = (d) => d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
const dateLabel = (d) => d.toLocaleDateString('he-IL', {
  day: 'numeric', month: 'short',
  year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
});

const cleanPhone = (phone) => (phone || '').replace(/[^0-9+]/g, '');
const waLink = (phone, msg) => {
  let p = cleanPhone(phone);
  if (p.startsWith('+972')) p = p.slice(1);
  else if (p.startsWith('972')) {}
  else if (p.startsWith('0')) p = '972' + p.slice(1);
  else p = '972' + p;
  return `https://wa.me/${p}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;
};
const defaultMessage = (name) => `היי ${name || ''}, רציתי לחזור אליך לגבי השיחה האחרונה שלנו. מתי נוח לך לדבר?`;

const groupOf = (d) => {
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 86_400_000;
  const t = d.getTime();
  if (diff < 0) {
    const ago = Math.abs(diff);
    if (t >= startOfToday) return 'overdue_today';
    if (ago < 7 * 86_400_000) return 'overdue_week';
    return 'overdue_old';
  }
  if (t < endOfToday) return 'today';
  if (diff < 7 * 86_400_000) return 'this_week';
  return 'future';
};

const GROUP_META = {
  overdue_today: { title: 'דחוף — איחור היום', color: '#ef4444' },
  overdue_week: { title: 'איחור השבוע', color: '#f59e0b' },
  overdue_old: { title: 'איחור מלפני שבוע+', color: '#94a3b8' },
  today: { title: 'בהמשך היום', color: '#7c3aed' },
  this_week: { title: 'השבוע', color: '#3b82f6' },
  future: { title: 'בעתיד', color: '#64748b' },
};

const GROUP_ORDER = ['overdue_today', 'overdue_week', 'overdue_old', 'today', 'this_week', 'future'];

/* ---------- ITEM CARD ---------- */
function ItemCard({ item, color, onClick }) {
  const { text: cdText, urgency } = countdown(item.followUpAt);
  const cdColor = urgency === 'overdue' ? '#dc2626'
    : urgency === 'urgent' ? '#ea580c'
    : urgency === 'soon' ? '#7c3aed'
    : '#475569';
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl p-3.5 flex items-center gap-3 transition-all hover:shadow-md hover:-translate-y-0.5 text-right"
      style={{
        border: `1px solid ${urgency === 'overdue' ? '#fecaca' : '#e2e8f0'}`,
        boxShadow: urgency === 'overdue' ? '0 4px 14px -4px rgba(239,68,68,0.2)' : '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0 text-sm"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}dd)` }}
      >
        {item.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h3 className="font-semibold text-slate-900 text-[13px] leading-tight">{item.name}</h3>
          {item.source && <>
            <span className="text-[10px] text-slate-300">·</span>
            <span className="text-[10px] text-slate-500">{item.source}</span>
          </>}
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 truncate tabular-nums">
          {hhmm(item.followUpAt)} · {dateLabel(item.followUpAt)}
        </p>
      </div>
      <div className="text-left shrink-0 min-w-[80px]">
        <div className="text-[13px] font-bold tabular-nums" style={{ color: cdColor }}>
          {cdText}
        </div>
      </div>
    </button>
  );
}

/* ---------- FLOATING BOTTOM-RIGHT ---------- */
function FloatingNext({ item, onOpen }) {
  if (!item) return null;
  const { text: cdText, urgency } = countdown(item.followUpAt);
  const isOverdue = urgency === 'overdue';
  return (
    <button
      onClick={onOpen}
      className="fixed bottom-4 right-4 z-40 max-w-[300px] rounded-2xl p-3.5 flex items-center gap-3 shadow-2xl transition hover:scale-[1.02] active:scale-95 text-right floating-card"
      style={{
        background: isOverdue
          ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
          : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
        boxShadow: '0 20px 50px -10px rgba(0,0,0,0.4)',
      }}
    >
      <div className="w-10 h-10 rounded-xl bg-white/25 backdrop-blur flex items-center justify-center text-white font-bold shrink-0">
        {item.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white/85 text-[10px] uppercase tracking-wider font-semibold">
          {isOverdue ? 'איחור!' : 'הפולואפ הקרוב'}
        </div>
        <div className="text-white font-bold text-[13px] truncate">{item.name}</div>
        <div className="text-white/90 text-[12px] font-semibold tabular-nums">{cdText}</div>
      </div>
      <ChevronUp className="w-4 h-4 text-white/80 shrink-0" />
    </button>
  );
}

/* ---------- MAIN ---------- */
export default function App() {
  const { items, user, error } = useMondayData();
  const [tick, setTick] = useState(0);
  const [activeAlert, setActiveAlert] = useState(null);
  const [done, setDone] = useState(() => {
    try {
      const raw = localStorage.getItem('followup-done');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const persistDone = (d) => {
    try { localStorage.setItem('followup-done', JSON.stringify(d)); } catch {}
  };

  const visible = useMemo(() => {
    return [...items].filter(it => !done[it.id]).sort((a, b) => a.followUpAt - b.followUpAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, done, tick]);

  const grouped = useMemo(() => {
    const g = {};
    visible.forEach(it => {
      const key = groupOf(it.followUpAt);
      if (!g[key]) g[key] = [];
      g[key].push(it);
    });
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tick]);

  const nextItem = useMemo(() => {
    if (visible.length === 0) return null;
    const now = Date.now();
    const overdue = visible.filter(it => it.followUpAt.getTime() <= now);
    if (overdue.length > 0) {
      return overdue.sort((a, b) => b.followUpAt - a.followUpAt)[0];
    }
    return visible[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tick]);

  const overdueCount = visible.filter(it => it.followUpAt <= new Date()).length;

  const complete = () => {
    if (!activeAlert) return;
    const id = activeAlert.id;
    setDone(d => {
      const next = { ...d, [id]: true };
      persistDone(next);
      return next;
    });
    setActiveAlert(null);
  };

  return (
    <div dir="rtl" className="min-h-screen" style={{
      fontFamily: '"Rubik", system-ui, sans-serif',
      background: 'radial-gradient(at 0% 0%, #eef2ff 0%, transparent 50%), radial-gradient(at 100% 100%, #fef3c7 0%, transparent 50%), #f8fafc',
    }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      <header className="border-b border-slate-200/60 bg-white/70 backdrop-blur-lg sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center relative" style={{
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              boxShadow: '0 10px 30px -10px rgba(79,70,229,0.6)',
            }}>
              <Bell className="w-4 h-4 text-white" />
              {overdueCount > 0 && (
                <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white tabular-nums">
                  {overdueCount}
                </span>
              )}
            </div>
            <div>
              <h1 className="font-bold text-[15px] text-slate-900 leading-tight">תזכורות פולואפ</h1>
              <p className="text-[11px] text-slate-500">
                {user ? `${user.name} · ${visible.length} פתוחים` : 'טוען...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-white px-2.5 py-1.5 rounded-full border border-slate-200">
            <Clock className="w-3 h-3" />
            <span className="tabular-nums">{new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-5 pb-32">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
            שגיאה: {error}
          </div>
        )}

        {visible.length === 0 && !error && (
          <div className="text-center py-20">
            <Inbox className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 text-sm font-medium">אין פולואפים פתוחים</p>
            <p className="text-slate-400 text-xs mt-1">תוסיף תאריך בעמודת "פולואפ" + שייך את עצמך לליד</p>
          </div>
        )}

        {GROUP_ORDER.map(key => {
          const list = grouped[key];
          if (!list || list.length === 0) return null;
          const meta = GROUP_META[key];
          return (
            <section key={key} className="mb-6">
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
                <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: meta.color }}>
                  {meta.title}
                </h2>
                <span className="text-[10px] text-slate-400 tabular-nums">({list.length})</span>
                <div className="h-px flex-1 bg-slate-200/60 mr-1" />
              </div>
              <div className="space-y-2">
                {list.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    color={meta.color}
                    onClick={() => setActiveAlert(item)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </main>

      {nextItem && !activeAlert && (
        <FloatingNext item={nextItem} onOpen={() => setActiveAlert(nextItem)} />
      )}

      {activeAlert && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 popup-overlay"
          style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(8px)' }}
          onClick={() => setActiveAlert(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full overflow-hidden popup-card"
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: '0 30px 60px -15px rgba(0,0,0,0.5)' }}
          >
            <div className="px-5 py-3.5 flex items-center gap-3 relative" style={{
              background: countdown(activeAlert.followUpAt).urgency === 'overdue'
                ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
                : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            }}>
              <div className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center backdrop-blur shrink-0">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="text-white font-bold text-sm">
                  {countdown(activeAlert.followUpAt).urgency === 'overdue' ? 'הגיע זמן פולואפ' : 'פולואפ קרוב'}
                </div>
                <div className="text-white/85 text-[11px] tabular-nums">
                  {hhmm(activeAlert.followUpAt)} · {dateLabel(activeAlert.followUpAt)} · {countdown(activeAlert.followUpAt).text}
                </div>
              </div>
              <button onClick={() => setActiveAlert(null)} className="text-white/80 hover:text-white transition shrink-0 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shrink-0"
                  style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
                  {activeAlert.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-lg text-slate-900 truncate">{activeAlert.name}</div>
                  <div className="text-sm text-slate-500 tabular-nums">{activeAlert.phone || '—'}</div>
                </div>
              </div>

              {activeAlert.status && (
                <div className="bg-slate-50 rounded-xl p-3 mb-2.5 text-sm text-slate-700">
                  <div className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider mb-1">סטטוס</div>
                  {activeAlert.status}
                </div>
              )}

              {activeAlert.notes && (
                <div className="bg-slate-50 rounded-xl p-3 mb-2.5 text-sm text-slate-700">
                  <div className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider mb-1">הערות</div>
                  <div className="line-clamp-4 whitespace-pre-wrap">{activeAlert.notes}</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-4">
                
                  href={`tel:${cleanPhone(activeAlert.phone)}`}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white text-sm transition hover:scale-[1.02] active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                    boxShadow: '0 6px 20px -6px rgba(79,70,229,0.5)',
                  }}
                >
                  <Phone className="w-4 h-4" />
                  חייג
                </a>
                
                  href={waLink(activeAlert.phone, defaultMessage(activeAlert.name))}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white text-sm transition hover:scale-[1.02] active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    boxShadow: '0 6px 20px -6px rgba(16,185,129,0.5)',
                  }}
                >
                  <MessageCircle className="w-4 h-4" />
                  וואטסאפ
                </a>
              </div>

              <button
                onClick={complete}
                className="w-full mt-2 py-2.5 rounded-xl text-[13px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition border border-emerald-200 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                סיים טיפול
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .popup-overlay { animation: fade-in 0.2s ease-out; }
        .popup-card { animation: slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
        .floating-card { animation: float-in 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-up {
          from { opacity: 0; transform: scale(0.94) translateY(24px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes float-in {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
