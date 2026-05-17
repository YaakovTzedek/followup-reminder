import { useState, useEffect, useMemo, useCallback } from 'react';
import { Phone, MessageCircle, Bell, Clock, CheckCircle2, X, AlertCircle, Inbox } from 'lucide-react';
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

function useMondayData() {
  const [items, setItems] = useState([]);
  const [user, setUser] = useState(null);
  const [boardId, setBoardId] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const ctxRes = await monday.get('context');
      const ctx = ctxRes.data;
  const me = ctx.user || { id: ctx.userId, name: 'Me' };
      setUser(me);
      setBoardId(ctx.boardId);

      const cols = Object.values(COLUMN_IDS).map(c => `"${c}"`).join(',');
      const q = `query {
        boards(ids: [״${ctx.boardId}״]) {
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

const relative = (d) => {
  const diff = d.getTime() - Date.now();
  if (diff < 0) {
    const ago = Math.abs(diff);
    if (ago < 60_000) return 'הגיע הזמן';
    if (ago < 3_600_000) return `איחור ${Math.floor(ago / 60_000)} דק׳`;
    if (ago < 86_400_000) return `איחור ${Math.floor(ago / 3_600_000)} שע׳`;
    return `איחור ${Math.floor(ago / 86_400_000)} ימים`;
  }
  if (diff < 60_000) return `בעוד ${Math.floor(diff / 1000)} שניות`;
  if (diff < 3_600_000) return `בעוד ${Math.floor(diff / 60_000)} דק׳`;
  if (diff < 86_400_000) return `בעוד ${Math.floor(diff / 3_600_000)} שעות`;
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
};

const hhmm = (d) => d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
const cleanPhone = (phone) => (phone || '').replace(/[^0-9+]/g, '');

const waLink = (phone, msg) => {
  let p = cleanPhone(phone);
  if (p.startsWith('+972')) p = p.slice(1);
  else if (p.startsWith('972')) {}
  else if (p.startsWith('0')) p = '972' + p.slice(1);
  else p = '972' + p;
  return `https://wa.me/${p}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;
};

const defaultMessage = (name) => `היי ${name}, רציתי לחזור אליך לגבי השיחה האחרונה שלנו. מתי נוח לך לדבר?`;

export default function App() {
  const { items, user, error } = useMondayData();
  const [tick, setTick] = useState(0);
  const [activeAlert, setActiveAlert] = useState(null);
  const [snoozed, setSnoozed] = useState({});
  const [done, setDone] = useState({});

  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (activeAlert || !user) return;
    const due = items
      .filter(it => !done[it.id])
      .filter(it => !snoozed[it.id] || snoozed[it.id] <= new Date())
      .sort((a, b) => a.followUpAt - b.followUpAt)
      .find(it => it.followUpAt <= new Date());
    if (due) setActiveAlert(due);
  }, [tick, items, user, activeAlert, snoozed, done]);

  const upcoming = useMemo(() => {
    return [...items]
      .filter(it => !done[it.id])
      .sort((a, b) => a.followUpAt - b.followUpAt);
  }, [items, done, tick]);

  const overdueCount = upcoming.filter(it => it.followUpAt <= new Date()).length;

  const snooze = (mins) => {
    if (!activeAlert) return;
    setSnoozed(s => ({ ...s, [activeAlert.id]: new Date(Date.now() + mins * 60_000) }));
    setActiveAlert(null);
  };

  const complete = () => {
    if (!activeAlert) return;
    const id = activeAlert.id;
    setDone(d => ({ ...d, [id]: true }));
    setActiveAlert(null);
  };

  return (
    <div dir="rtl" className="min-h-screen" style={{
      fontFamily: '"Rubik", system-ui, sans-serif',
      background: 'radial-gradient(at 0% 0%, #eef2ff 0%, transparent 50%), radial-gradient(at 100% 100%, #fef3c7 0%, transparent 50%), #f8fafc',
    }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      <header className="border-b border-slate-200/60 bg-white/60 backdrop-blur-lg sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center relative" style={{
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              boxShadow: '0 10px 30px -10px rgba(79,70,229,0.6)',
            }}>
              <Bell className="w-5 h-5 text-white" />
              {overdueCount > 0 && (
                <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                  {overdueCount}
                </span>
              )}
            </div>
            <div>
              <h1 className="font-bold text-base text-slate-900 leading-tight">תזכורות פולואפ</h1>
              <p className="text-xs text-slate-500">
                {user ? `${user.name} · ${upcoming.length} פתוחים` : 'טוען...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-white/80 px-3 py-1.5 rounded-full border border-slate-200">
            <Clock className="w-3.5 h-3.5" />
            {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">הפולואפים שלי</h2>
          <span className="text-xs text-slate-400">מסונן לפי המשתמש שלך</span>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
            שגיאה: {error}
          </div>
        )}

        <div className="space-y-2.5">
          {upcoming.map(item => {
            const due = item.followUpAt <= new Date();
            return (
              <div key={item.id} className="bg-white rounded-2xl p-4 flex items-center gap-3.5 transition-all"
                style={{
                  border: due ? '1px solid #fbbf24' : '1px solid #e2e8f0',
                  boxShadow: due ? '0 0 0 3px rgba(251,191,36,0.15), 0 4px 16px -4px rgba(245,158,11,0.3)' : '0 1px 2px rgba(0,0,0,0.03)',
                }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
                  style={{ background: due ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'linear-gradient(135deg, #64748b, #334155)' }}>
                  {item.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-semibold text-slate-900 text-sm">{item.name}</h3>
                    {item.source && (<>
                      <span className="text-[11px] text-slate-400">·</span>
                      <span className="text-[11px] text-slate-500">{item.source}</span>
                    </>)}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {item.status || item.notes || item.phone}
                  </p>
                </div>
                <div className="text-left shrink-0">
                  <div className={`text-xs font-semibold ${due ? 'text-amber-600' : 'text-slate-700'}`}>
                    {relative(item.followUpAt)}
                  </div>
                  <div className="text-[11px] text-slate-400 tabular-nums">{hhmm(item.followUpAt)}</div>
                </div>
              </div>
            );
          })}

          {upcoming.length === 0 && !error && (
            <div className="text-center py-16">
              <Inbox className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500 text-sm">אין פולואפים פתוחים</p>
              <p className="text-slate-400 text-xs mt-1">תוסיף תאריך בעמודת "פולואפ" + שייך את עצמך לליד והוא יופיע כאן</p>
            </div>
          )}
        </div>
      </main>

      {activeAlert && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 popup-overlay"
          style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(10px)' }}
          onClick={() => setActiveAlert(null)}>
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden popup-card"
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: '0 30px 60px -15px rgba(0,0,0,0.5)' }}>
            <div className="px-5 py-3.5 flex items-center gap-3 relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }}>
              <div className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center backdrop-blur shrink-0">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="text-white font-bold text-sm">הגיע זמן פולואפ</div>
                <div className="text-white/85 text-[11px]">
                  {hhmm(activeAlert.followUpAt)} {activeAlert.source && `· ${activeAlert.source}`}
                </div>
              </div>
              <button onClick={() => setActiveAlert(null)} className="text-white/80 hover:text-white transition">
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
                  <div className="line-clamp-4">{activeAlert.notes}</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-4">
                <a href={`tel:${cleanPhone(activeAlert.phone)}`} onClick={complete}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white text-sm transition hover:scale-[1.02] active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 6px 20px -6px rgba(79,70,229,0.5)' }}>
                  <Phone className="w-4 h-4" />
                  חייג
                </a>
                <a href={waLink(activeAlert.phone, defaultMessage(activeAlert.name))} target="_blank" rel="noreferrer" onClick={complete}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white text-sm transition hover:scale-[1.02] active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 6px 20px -6px rgba(16,185,129,0.5)' }}>
                  <MessageCircle className="w-4 h-4" />
                  וואטסאפ
                </a>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-2">
                <button onClick={() => snooze(5)} className="py-2.5 rounded-xl text-[13px] text-slate-600 hover:bg-slate-100 transition border border-slate-200">
                  דחה 5 דק׳
                </button>
                <button onClick={() => snooze(30)} className="py-2.5 rounded-xl text-[13px] text-slate-600 hover:bg-slate-100 transition border border-slate-200">
                  דחה 30 דק׳
                </button>
                <button onClick={complete} className="py-2.5 rounded-xl text-[13px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 inline -mt-0.5 ml-0.5" />
                  סיים
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .popup-overlay { animation: fade-in 0.2s ease-out; }
        .popup-card { animation: slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-up {
          from { opacity: 0; transform: scale(0.94) translateY(24px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
