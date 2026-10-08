import { useEffect, useState } from 'preact/hooks';
import { html, fmtClock, fmtDur, today, vibrate } from './util.js';
import { Page, Card, Scale, Chips, Stepper } from './ui.js';
import { add, setDaily, useStore, getState } from './store.js';
import { DEEP_TYPES, BLOCK_TYPES } from './defaults.js';
import { deepMin, deepEntries, dayBlocks } from './logic.js';
import { nowMin } from './util.js';

const KEY = 'zivot.timer';
let T = load();
const subs = new Set();
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
function save() { try { T ? localStorage.setItem(KEY, JSON.stringify(T)) : localStorage.removeItem(KEY); } catch {} subs.forEach((f) => f({})); }
export function timerState() { return T; }

export function elapsedSec(t = T) {
  if (!t) return 0;
  const end = t.pausedAt || Date.now();
  return Math.max(0, (end - t.startedAt - (t.pausedTotal || 0)) / 1000);
}
export function remainingSec(t = T) { return t ? t.plannedMin * 60 - elapsedSec(t) : 0; }

export function startTimer({ type, goal, plannedMin, blockId = null }) {
  T = { type, goal, plannedMin, startedAt: Date.now(), pausedAt: null, pausedTotal: 0, interruptions: 0, blockId, day: today(), phase: 'running', notified: false };
  save();
  ensureNotifyPermission();
}
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

  if (t && t.phase === 'review') return html`<${Review} t=${t} />`;
  if (t) return html`<${Running} t=${t} done=${done} cap=${cap} />`;
  return html`<${Setup} preset=${preset} done=${done} cap=${cap} day=${day} />`;
}

function Setup({ preset, done, cap, day }) {
  // navržený blok z rozvrhu: aktuální nebo nejbližší hluboký blok
  const blocks = dayBlocks(day).filter((b) => b.deep && b.status === 'pending');
  const nm = nowMin();
  const suggested = preset || blocks.find((b) => b.end > nm) || null;
  const [type, setType] = useState(suggested ? (DEEP_TYPES.some((d) => d.key === suggested.type) ? suggested.type : 'work') : 'work');
  const [goal, setGoal] = useState(suggested?.goal || '');
  const [dur, setDur] = useState(suggested ? Math.max(15, Math.round((suggested.end - Math.max(nm, suggested.start)) / 5) * 5) : 50);
  const [blockId, setBlockId] = useState(suggested?.id || null);
  const left = cap - done;
  const over = done + dur > cap;
  const sessions = deepEntries(day);

  return html`<${Page} title="Hluboký blok" sub=${`Dnes ${fmtDur(done)} z ~${fmtDur(cap)}`}>
    ${over && html`<div class="notice warn">${left <= 0
      ? `Dnešní strop ~${fmtDur(cap)} hluboké práce je vyčerpaný. Další blok bude mít nižší kvalitu – zvaž mělkou práci nebo odpočinek.`
      : `Tímhle blokem se dostaneš přes denní strop (zbývá ${fmtDur(left)}). Zvaž kratší blok.`}</div>`}
    <${Card}>
      ${blockId && html`<p class="hint">Napojeno na blok z rozvrhu: <b>${suggested?.title}</b> <button class="link" onClick=${() => setBlockId(null)}>odpojit</button></p>`}
      <div class="field"><span class="lbl">Typ</span>
        <${Chips} options=${DEEP_TYPES} value=${type} onChange=${(v) => v && setType(v)} /></div>
      <div class="field"><label class="lbl" for="tgoal">Cíl bloku</label>
        <input id="tgoal" value=${goal} onInput=${(e) => setGoal(e.target.value)} placeholder="Co má být na konci hotové?" /></div>
      <div class="field"><span class="lbl">Délka</span>
        <${Chips} options=${[...new Set([...DURS, dur])].sort((a, b) => a - b).map((d) => ({ key: d, label: `${d} min` }))} value=${dur} onChange=${(v) => v && setDur(v)} /></div>
      <button class="btn primary big" onClick=${() => { vibrate(30); startTimer({ type, goal, plannedMin: dur, blockId }); }}>Spustit ${dur} min</button>
    </${Card}>
    ${sessions.length > 0 && html`<${Card} title="Dnešní bloky" meta=${fmtDur(done)}>
      <ul class="rows">${sessions.map((s) => html`<li><span>${BLOCK_TYPES[s.data.type]?.label || s.data.type}${s.data.goal && html` · <span class="muted">${s.data.goal}</span>`}</span>
        <span class="muted nowrap">${fmtDur(s.data.actualMin)} · ${s.data.quality ? `kvalita ${s.data.quality}` : '–'}</span></li>`)}</ul>
    </${Card}>`}
  </${Page}>`;
}

function Running({ t, done, cap }) {
  const rem = remainingSec(t);
  const el = elapsedSec(t);
  const over = rem <= 0;
  const pct = Math.min(1, el / (t.plannedMin * 60));
  const total = done + el / 60;
  const R = 110, C = 2 * Math.PI * R;
  const paused = !!t.pausedAt;
  return html`<${Page} title=${(DEEP_TYPES.find((d) => d.key === t.type) || {}).label || 'Blok'} sub=${t.goal ? 'Cíl: ' + t.goal : 'Bez cíle'}>
    ${total > cap && html`<div class="notice warn">Jsi přes denní strop ~${fmtDur(cap)} hluboké práce.</div>`}
    <div class="timer">
      <svg viewBox="0 0 260 260" class="ring" aria-hidden="true">
        <circle cx="130" cy="130" r=${R} class="ring-bg" />
        <circle cx="130" cy="130" r=${R} class=${'ring-fg' + (over ? ' flow' : '')} stroke-dasharray=${`${C * (over ? 1 : pct)} ${C}`} transform="rotate(-90 130 130)" />
      </svg>
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
    <button class="interrupt" onClick=${() => { vibrate(20); patch({ interruptions: (t.interruptions || 0) + 1 }); }}>
      <span>Vyrušení</span><b>${t.interruptions || 0}</b><small>klepni při každém vyrušení</small>
    </button>
  </${Page}>`;
}

function Review({ t }) {
  const [q, setQ] = useState(null);
  const [intr, setIntr] = useState(t.interruptions || 0);
  const [mins, setMins] = useState(t.actualMin || 0);
  const [note, setNote] = useState('');
  const save_ = () => {
    add('deep_block', { type: t.type, goal: t.goal, plannedMin: t.plannedMin, actualMin: mins, quality: q, interruptions: intr, note, startedAt: t.startedAt, endedAt: t.endedAt, blockId: t.blockId }, t.day);
    if (t.blockId) setDaily('daylog', t.day, (d) => ({ ...d, blocks: { ...(d.blocks || {}), [t.blockId]: { ...(d.blocks?.[t.blockId] || {}), status: 'done' } } }));
    T = null; save();
  };
  return html`<${Page} title="Jak to šlo?" sub=${t.goal ? 'Cíl: ' + t.goal : ''}>
    <${Card}>
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
