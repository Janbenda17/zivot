import { useEffect, useState } from 'preact/hooks';
import { html, fmtClock, fmtDur, today, vibrate, nowMin, fromMin } from './util.js';
import { Page, Card, Scale, Chips, Stepper } from './ui.js';
import { add, setDaily, useStore, getState } from './store.js';
import { DEEP_TYPES, BLOCK_TYPES } from './defaults.js';
import { deepMin, deepEntries, dayBlocks, tasksFor, toggleTask, setBlock } from './logic.js';

const KEY = 'zivot.timer';
let T = load();
const subs = new Set();
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
function save() { try { T ? localStorage.setItem(KEY, JSON.stringify(T)) : localStorage.removeItem(KEY); } catch {} subs.forEach((f) => f({})); syncWakeLock(); }
export function timerState() { return T; }
/** Běží odpočet (blok nebo pauza)? */
export function isTicking(t = T) { return !!t && (t.phase === 'running' || t.phase === 'break'); }

export function elapsedSec(t = T) {
  if (!t) return 0;
  const end = t.pausedAt || Date.now();
  return Math.max(0, (end - t.startedAt - (t.pausedTotal || 0)) / 1000);
}
export function remainingSec(t = T) { return t ? t.plannedMin * 60 - elapsedSec(t) : 0; }

export function startTimer({ type, goal, plannedMin, blockId = null }) {
  T = { type, goal, plannedMin, startedAt: Date.now(), pausedAt: null, pausedTotal: 0, interruptions: 0, thoughts: 0, blockId, day: today(), phase: 'running', notified: false };
  save();
  ensureNotifyPermission();
}
export function startBreak(min) {
  T = { phase: 'break', plannedMin: min, startedAt: Date.now(), pausedAt: null, pausedTotal: 0, notified: false, day: today() };
  save();
}
export function stopTimer() { T = null; save(); }
function ensureNotifyPermission() {
  const s = getState().settings;
  if (s.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}
export function useTimer() {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((x) => x + 1);
    subs.add(f);
    const iv = setInterval(f, 1000);
    return () => { subs.delete(f); clearInterval(iv); };
  }, []);
  return T;
}
function patch(p) { T = { ...T, ...p }; save(); }
export function markNotified() { if (T) patch({ notified: true }); }

// --- obrazovka nezhasne, dokud běží blok ---
let lock = null;
async function syncWakeLock() {
  const want = T && (T.phase === 'running' || T.phase === 'break') && !T.pausedAt && document.visibilityState === 'visible';
  try {
    if (want && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
    else if (!want && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}
document.addEventListener('visibilitychange', syncWakeLock);

// --- odpočet v názvu záložky ---
setInterval(() => {
  if (T && (T.phase === 'running' || T.phase === 'break')) {
    const r = remainingSec();
    document.title = `${r >= 0 ? fmtClock(r) : '+' + fmtClock(-r)} · ${T.phase === 'break' ? 'Pauza' : 'Blok'}`;
  } else if (document.title !== 'Život') document.title = 'Život';
}, 1000);

// --- zvuk na konci bloku ---
export function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 990].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.35 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 1.2);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.35); o.stop(ctx.currentTime + i * 0.35 + 1.3);
    });
  } catch {}
}

const DURS = [25, 50, 60, 75, 90, 150];

export function TimerPage({ preset }) {
  const store = useStore();
  const t = useTimer();
  const day = today();
  const cap = store.settings.deepCapMin;
  const done = deepMin(day);
  if (t && t.phase === 'review') return html`<${Review} t=${t} done=${done} cap=${cap} />`;
  if (t && t.phase === 'break') return html`<${Break} t=${t} />`;
  if (t && t.phase === 'saved') return html`<${SavedPanel} />`;
  if (t) return html`<${Running} t=${t} done=${done} cap=${cap} />`;
  return html`<${Setup} preset=${preset} done=${done} cap=${cap} day=${day} />`;
}

function blockDur(b, nm) { return Math.max(15, Math.round((b.end - Math.max(nm, b.start)) / 5) * 5); }

function Setup({ preset, done, cap, day }) {
  const nm = nowMin();
  const blocks = dayBlocks(day).filter((b) => b.deep && b.status === 'pending' && b.end > nm);
  const suggested = preset || blocks[0] || null;
  const typeOf = (b) => (DEEP_TYPES.some((d) => d.key === b?.type) ? b.type : 'work');
  const [type, setType] = useState(typeOf(suggested));
  const [goal, setGoal] = useState(suggested?.goal || '');
  const [dur, setDur] = useState(suggested ? blockDur(suggested, nm) : 50);
  const [blockId, setBlockId] = useState(suggested?.id || null);
  const pick = (b) => { setBlockId(b.id); setType(typeOf(b)); setGoal(b.goal || ''); setDur(blockDur(b, nm)); vibrate(8); };
  const left = cap - done;
  const over = done + dur > cap;
  const sessions = deepEntries(day);
  const bt = blockId ? tasksFor(day).filter((x) => x.data.blockId === blockId && !x.data.done) : [];

  return html`<${Page} title="Hluboký blok" sub=${`Dnes ${fmtDur(done)} z ~${fmtDur(cap)}`}>
    <div class="prog lg"><i class=${done > cap ? 'over' : ''} style=${`width:${Math.min(100, (done / cap) * 100)}%`}></i></div>
    ${over && html`<div class="notice warn">${left <= 0
      ? `Dnešní strop ~${fmtDur(cap)} hluboké práce je vyčerpaný. Další blok bude mít nižší kvalitu – zvaž mělkou práci nebo odpočinek.`
      : `Tímhle blokem se dostaneš přes denní strop (zbývá ${fmtDur(left)}). Zvaž kratší blok.`}</div>`}
    ${blocks.length > 0 && html`<${Card} title="Bloky z dnešního plánu">
      <div class="chips">${blocks.map((b) => html`<button class=${'chip' + (b.id === blockId ? ' on' : '')} onClick=${() => (b.id === blockId ? setBlockId(null) : pick(b))}>${fromMin(b.start)} ${b.title}</button>`)}</div>
    </${Card}>`}
    <${Card}>
      <div class="field"><span class="lbl">Typ</span><${Chips} options=${DEEP_TYPES} value=${type} onChange=${(v) => v && setType(v)} /></div>
      <div class="field"><label class="lbl" for="tgoal">Cíl bloku</label>
        <input id="tgoal" value=${goal} onInput=${(e) => setGoal(e.target.value)} placeholder="Co má být na konci hotové?" /></div>
      ${bt.length > 0 && html`<ul class="pb-tasks">${bt.map((x) => html`<li>${x.data.text}</li>`)}</ul>`}
      <div class="field"><span class="lbl">Délka</span>
        <${Chips} options=${[...new Set([...DURS, dur])].sort((a, b) => a - b).map((d) => ({ key: d, label: `${d} min` }))} value=${dur} onChange=${(v) => v && setDur(v)} /></div>
      <button class="btn primary big" onClick=${() => {
        vibrate(30);
        if (blockId && goal) setBlock(day, blockId, { goal });
        startTimer({ type, goal, plannedMin: dur, blockId });
      }}>Spustit ${dur} min</button>
      <p class="hint">Obrazovka během bloku nezhasne. Telefon dej displejem dolů.</p>
    </${Card}>
    ${sessions.length > 0 && html`<${Card} title="Dnešní bloky" meta=${fmtDur(done)}>
      <ul class="rows">${sessions.map((s) => html`<li><span>${BLOCK_TYPES[s.data.type]?.label || s.data.type}${s.data.goal && html` · <span class="muted">${s.data.goal}</span>`}</span>
        <span class="muted nowrap">${fmtDur(s.data.actualMin)} · ${s.data.quality ? `kvalita ${s.data.quality}` : '–'}</span></li>`)}</ul>
    </${Card}>`}
  </${Page}>`;
}

function Ring({ pct, warm }) {
  const R = 110, C = 2 * Math.PI * R;
  return html`<svg viewBox="0 0 260 260" class="ring" aria-hidden="true">
    <circle cx="130" cy="130" r=${R} class="ring-bg" />
    <circle cx="130" cy="130" r=${R} class=${'ring-fg' + (warm ? ' flow' : '')} stroke-dasharray=${`${C * pct} ${C}`} transform="rotate(-90 130 130)" />
  </svg>`;
}

function Running({ t, done, cap }) {
  const rem = remainingSec(t);
  const el = elapsedSec(t);
  const over = rem <= 0;
  const pct = Math.min(1, el / (t.plannedMin * 60));
  const total = done + el / 60;
  const paused = !!t.pausedAt;
  const [thought, setThought] = useState('');
  const bt = t.blockId ? tasksFor(t.day).filter((x) => x.data.blockId === t.blockId) : [];
  return html`<${Page} title=${(DEEP_TYPES.find((d) => d.key === t.type) || {}).label || 'Blok'} sub=${t.goal ? 'Cíl: ' + t.goal : 'Bez cíle'}>
    ${total > cap && html`<div class="notice warn">Jsi přes denní strop ~${fmtDur(cap)} hluboké práce.</div>`}
    <div class="timer">
      <${Ring} pct=${over ? 1 : pct} warm=${over} />
      <div class="timer-c">
        <div class="timer-n" aria-live="off">${over ? '+' + fmtClock(-rem) : fmtClock(rem)}</div>
        <div class="muted">${paused ? 'pozastaveno' : over ? 'flow · čas navíc' : `z ${t.plannedMin} min`}</div>
      </div>
    </div>
    ${over && html`<div class="notice calm">Čas bloku vypršel. Jsi ve flow? Prodluž ho, nebo blok ukonči.</div>`}
    <div class="row center wrap">
      ${over
        ? html`<button class="btn" onClick=${() => patch({ plannedMin: t.plannedMin + 15, notified: false })}>Flow +15</button>
               <button class="btn" onClick=${() => patch({ plannedMin: t.plannedMin + 30, notified: false })}>Flow +30</button>`
        : html`<button class="btn" onClick=${() => paused ? patch({ pausedTotal: (t.pausedTotal || 0) + (Date.now() - t.pausedAt), pausedAt: null }) : patch({ pausedAt: Date.now() })}>${paused ? 'Pokračovat' : 'Pauza'}</button>
               <button class="btn" onClick=${() => patch({ plannedMin: t.plannedMin + 15 })}>+15 min</button>`}
      <button class="btn primary" onClick=${() => { vibrate(30); patch({ phase: 'review', endedAt: Date.now(), actualMin: Math.round(elapsedSec(t) / 60), pausedAt: null }); }}>Ukončit</button>
    </div>
    ${bt.length > 0 && html`<${Card} title="Úkoly bloku"><ul class="now-tasks">${bt.map((x) => html`<li><button class=${'mini-check' + (x.data.done ? ' on' : '')} onClick=${() => { vibrate(); toggleTask(x); }}>
      <span class="tick" aria-hidden="true"></span><span>${x.data.text}</span></button></li>`)}</ul></${Card}>`}
    <button class="interrupt" onClick=${() => { vibrate(20); patch({ interruptions: (t.interruptions || 0) + 1 }); }}>
      <span>Vyrušení</span><b>${t.interruptions || 0}</b><small>klepni při každém vyrušení zvenku</small>
    </button>
    <form class="quick thought" onSubmit=${(e) => { e.preventDefault(); const v = thought.trim(); if (!v) return; add('idea', { text: v, tags: ['zblok'] }); patch({ thoughts: (t.thoughts || 0) + 1 }); setThought(''); vibrate(); }}>
      <label class="sr" for="thought">Rušivá myšlenka</label>
      <input id="thought" value=${thought} onInput=${(e) => setThought(e.target.value)} placeholder="Napadlo tě něco? Zapiš a pokračuj…" autocomplete="off" />
      <button class="btn" type="submit">Odložit</button>
    </form>
    ${t.thoughts > 0 && html`<p class="hint">${t.thoughts}× odloženo do Nápadů (#zblok).</p>`}
  </${Page}>`;
}

function Review({ t, done, cap }) {
  const [q, setQ] = useState(null);
  const [intr, setIntr] = useState(t.interruptions || 0);
  const [mins, setMins] = useState(t.actualMin || 0);
  const [note, setNote] = useState('');
  const [goalMet, setGoalMet] = useState(null);
  const save_ = () => {
    add('deep_block', { type: t.type, goal: t.goal, goalMet, plannedMin: t.plannedMin, actualMin: mins, quality: q, interruptions: intr, thoughts: t.thoughts || 0, note, startedAt: t.startedAt, endedAt: t.endedAt, blockId: t.blockId }, t.day);
    if (t.blockId) setBlock(t.day, t.blockId, { status: 'done' });
    T = { phase: 'saved', day: t.day, savedMin: mins }; save();
  };
  return html`<${Page} title="Jak to šlo?" sub=${t.goal ? 'Cíl: ' + t.goal : ''}>
    <${Card}>
      ${t.goal && html`<div class="field"><span class="lbl">Splnil jsi cíl bloku?</span><${Chips} options=${[{ key: 'yes', label: 'Ano' }, { key: 'part', label: 'Částečně' }, { key: 'no', label: 'Ne' }]} value=${goalMet} onChange=${setGoalMet} /></div>`}
      <div class="field"><span class="lbl">Kvalita soustředění</span><${Scale} value=${q} onChange=${setQ} labels=${['rozbité', 'slabé', 'ok', 'dobré', 'hluboký flow']} /></div>
      <div class="field"><span class="lbl">Počet vyrušení</span><${Stepper} value=${intr} onChange=${setIntr} /></div>
      <div class="field"><span class="lbl">Odpracováno</span><${Stepper} value=${mins} onChange=${setMins} step=${5} unit="min" /></div>
      <div class="field"><label class="lbl" for="rnote">Poznámka (nepovinné)</label>
        <input id="rnote" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="Co pomohlo nebo rušilo?" /></div>
      <div class="row">
        <button class="btn ghost" onClick=${() => { T = null; save(); }}>Zahodit</button>
        <button class="btn primary grow" onClick=${save_}>Uložit blok</button>
      </div>
    </${Card}>
  </${Page}>`;
}

export function SavedPanel() {
  const t = T;
  const done = deepMin(today());
  const cap = getState().settings.deepCapMin;
  return html`<${Page} title="Blok uložen" sub=${`Dnes celkem ${fmtDur(done)}${done >= cap ? ' · strop splněn' : ` · zbývá ~${fmtDur(cap - done)}`}`}>
    <${Card} title="Pauza">
      <p class="muted">Krátká pauza mimo obrazovku zlepší další blok. Projdi se, napij se, koukni z okna.</p>
      <div class="row wrap">${[5, 10, 15, 20].map((m) => html`<button class="btn" onClick=${() => startBreak(m)}>${m} min</button>`)}</div>
      <button class="btn ghost" onClick=${stopTimer}>Bez pauzy</button>
    </${Card}>
  </${Page}>`;
}

function Break({ t }) {
  const rem = remainingSec(t);
  const over = rem <= 0;
  return html`<${Page} title="Pauza" sub="Mimo obrazovku">
    <div class="timer">
      <${Ring} pct=${Math.min(1, elapsedSec(t) / (t.plannedMin * 60))} warm=${over} />
      <div class="timer-c"><div class="timer-n">${over ? '+' + fmtClock(-rem) : fmtClock(rem)}</div><div class="muted">${over ? 'pauza skončila' : `z ${t.plannedMin} min`}</div></div>
    </div>
    <div class="row center wrap">
      <button class="btn" onClick=${() => patch({ plannedMin: t.plannedMin + 5, notified: false })}>+5 min</button>
      <button class="btn primary" onClick=${stopTimer}>Konec pauzy</button>
    </div>
  </${Page}>`;
}
