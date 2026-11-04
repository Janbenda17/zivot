import { useEffect, useState } from 'preact/hooks';
import { html, today, fmtDay, fromMin, nowMin, fmtClock, fmtDur, addDays, vibrate } from './util.js';
import { Page, Card } from './ui.js';
import { daily, setDaily, useStore } from './store.js';
import { dayBlocks, deepMin, setBlock, moveBlockStart, tasksFor, toggleTask, chaptersDue, removeExtraBlock, templateFor, logEnergy, energyInSlot } from './logic.js';
import { ENERGY_SLOTS } from './push.js';
import { reviewDue } from './review.js';
import { willFor, willScore, addWill } from './will.js';
import { dayXP, DAY_GOAL } from './xp.js';
import { Scale } from './ui.js';
import { useStore as _us } from './store.js';
import { BLOCK_TYPES } from './defaults.js';
import { useTimer, remainingSec, isTicking } from './timer.js';
import { go } from './nav.js';
import { DayTasks, Overdue } from './tasks.js';
import { TimeInput, LazyInput, AddBlock } from './plan.js';

const LINKS = { routine: 'rutina', body: 'telo', shutdown: 'ritual', sleep: 'telo' };

export function TodayPage() {
  useStore();
  const t = useTimer();
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(iv); }, []);
  const day = today();
  const log = daily('daylog', day);
  const blocks = dayBlocks(day);
  const nm = nowMin();
  const cur = blocks.find((b) => b.start <= nm && nm < b.end);
  const next = blocks.find((b) => b.start > nm && b.status === 'pending');
  const [open, setOpen] = useState(null);
  const [resched, setResched] = useState(false);
  const [adding, setAdding] = useState(false);
  const doneN = blocks.filter((b) => b.status === 'done').length;
  const tasks = tasksFor(day);
  const tomorrow = addDays(day, 1);
  const tPlanned = daily('daylog', tomorrow).planned;
  const reading = chaptersDue(day);

  const pendingAhead = () => blocks.filter((b) => b.status === 'pending' && b.end > nm);
  const shift = (delta) => {
    setDaily('daylog', day, (d) => {
      const bl = { ...(d.blocks || {}) };
      for (const b of pendingAhead()) if (b !== cur || delta > 0) bl[b.id] = { ...(bl[b.id] || {}), start: b.start + delta, end: b.end + delta };
      return { ...d, blocks: bl };
    });
    setResched(false); vibrate(20);
  };
  const startNow = () => {
    const first = blocks.find((b) => b.status === 'pending' && b.start > nm);
    if (first) shift(Math.round(nm - first.start));
  };
  const skipRest = () => {
    setDaily('daylog', day, (d) => {
      const bl = { ...(d.blocks || {}) };
      for (const b of blocks) if (b.status === 'pending' && b.start > nm && b.type !== 'shutdown' && b.type !== 'sleep') bl[b.id] = { ...(bl[b.id] || {}), status: 'skipped' };
      return { ...d, blocks: bl };
    });
    setResched(false);
  };
  const reset = () => {
    setDaily('daylog', day, (d) => {
      const bl = {};
      for (const [k, v] of Object.entries(d.blocks || {})) { const { start, end, ...rest } = v; bl[k] = rest; }
      return { ...d, blocks: bl };
    });
    setResched(false);
  };

  const [full, setFull] = useState(false);
  const xp = dayXP(day).total;
  // kompaktní osa: od aktuálního (nebo posledního hotového) bloku dál, jinak celý den
  const curIdx = Math.max(0, blocks.findIndex((b) => b.end > nm) - 1);
  const shown = full ? blocks : blocks.slice(curIdx, curIdx + 5);
  const hiddenBefore = full ? 0 : curIdx, hiddenAfter = full ? 0 : Math.max(0, blocks.length - curIdx - 5);

  return html`<section class="page today">
    <header class="today-h">
      <div class="th-l">
        <span class="th-eyebrow">${templateFor(day).name}${log.planned ? ' · naplánováno předem' : ''}</span>
        <h1>${fmtDay(day, true)}</h1>
        <span class="th-sub">${doneN}/${blocks.length} bloků · ${fmtDur(deepMin(day))} hluboké práce</span>
      </div>
      <button class="xp-ring" onClick=${() => go('prehled')} aria-label=${`Dnešní body ${xp} z ${DAY_GOAL}`}>
        <${Ring} pct=${Math.max(0, Math.min(1, xp / DAY_GOAL))} />
        <span class="xr-n">${xp}</span><span class="xr-l">bodů</span>
      </button>
    </header>

    ${isTicking(t) && html`<button class="banner" onClick=${() => go('blok')}>
      <span>${t.phase === 'break' ? 'Pauza' : 'Běží blok'}${t.goal && t.phase !== 'break' ? ': ' + t.goal : ''}</span><b>${remainingSec(t) >= 0 ? fmtClock(remainingSec(t)) : '+' + fmtClock(-remainingSec(t))}</b></button>`}

    <${QuickRow} day=${day} nm=${nm} />

    <${MainTask} day=${day} value=${log.mainTask} />
    ${log.intention && html`<p class="intention">„${log.intention}“</p>`}

    <${Now} cur=${cur} next=${next} nm=${nm} day=${day} tasks=${tasks} />
    <${EnergyPrompt} day=${day} nm=${nm} />
    ${reviewDue() && html`<button class="banner" onClick=${() => go('revize')}><span>Týdenní revize: 10 minut na ohlédnutí a cíle</span><b>›</b></button>`}

    <${Overdue} />
    <${DayTasks} day=${day} blocks=${blocks} title="Úkoly dne" />

    ${reading.length > 0 && html`<button class="banner soft" onClick=${() => go('cteni')}>
      <span>Čtení: ${reading[0].book.data.title}, kapitola ${reading[0].ch.n}${reading.length > 1 ? ` (+${reading.length - 1})` : ''}</span><b>›</b></button>`}

    ${nm >= 18 * 60 && html`<button class=${'banner ' + (tPlanned ? 'soft' : '')} onClick=${() => go('zitra')}>
      <span>${tPlanned ? 'Zítřek je naplánovaný ✓' : 'Naplánuj zítřek, ať ráno nemusíš přemýšlet (+10 bodů)'}</span><b>›</b></button>`}

    <div class="sec-h">
      <h2>Časová osa</h2>
      <div class="row">
        <button class="btn sm ghost" onClick=${() => { setAdding(!adding); setResched(false); }} aria-expanded=${adding}>+ Blok</button>
        <button class="btn sm ghost" onClick=${() => { setResched(!resched); setAdding(false); }} aria-expanded=${resched}>Přeplánovat</button>
      </div>
    </div>
    ${adding && html`<${AddBlock} day=${day} onDone=${() => setAdding(false)} />`}
    ${resched && html`<div class="card resched">
      <p class="hint">Posune všechny nedokončené bloky od teď. Hotové a vynechané zůstanou.</p>
      <div class="row wrap">
        <button class="btn" onClick=${() => shift(15)}>+15 min</button>
        <button class="btn" onClick=${() => shift(30)}>+30 min</button>
        <button class="btn" onClick=${() => shift(60)}>+1 h</button>
        <button class="btn" onClick=${startNow}>Další blok začít teď</button>
        <button class="btn" onClick=${skipRest}>Zbytek vynechat</button>
        <button class="btn ghost" onClick=${reset}>Vrátit podle rozvrhu</button>
      </div></div>`}

    <div class="card tl-card">
    ${hiddenBefore > 0 && html`<button class="tl-more" onClick=${() => setFull(true)}>Dříve dnes · ${hiddenBefore} ${hiddenBefore === 1 ? 'blok' : hiddenBefore < 5 ? 'bloky' : 'bloků'}</button>`}
    <ol class="timeline">
      ${shown.map((b) => {
        const i = blocks.indexOf(b);
        const prev = blocks[i - 1];
        const gap = prev && shown.includes(prev) ? b.start - prev.end : 0;
        const isCur = b === cur;
        const past = b.end <= nm;
        const bt = tasks.filter((x) => x.data.blockId === b.id);
        return html`
          ${gap >= 30 && html`<li class="gap"><span class="tl-time">${fromMin(prev.end)}</span><span>volno · ${fmtDur(gap)}</span></li>`}
          ${gap < 0 && html`<li class="gap warn-t"><span class="tl-time"></span><span>překryv ${fmtDur(-gap)}</span></li>`}
          <li class=${`tl ${b.status} ${isCur ? 'cur' : ''} ${past && b.status === 'pending' ? 'missed' : ''} ${b.deep ? 'deep' : ''}`}>
            <button class="tl-main" onClick=${() => setOpen(open === b.id ? null : b.id)} aria-expanded=${open === b.id}>
              <span class="tl-time">${fromMin(b.start)}<small>${fromMin(b.end)}</small></span>
              <span class="tl-body">
                <span class="tl-title">${b.title}${b.moved ? html` <small class="muted">· posunuto</small>` : ''}</span>
                ${b.goal ? html`<span class="tl-goal">${b.goal}</span>` : b.deep && b.status === 'pending' ? html`<span class="tl-goal muted">bez cíle</span>` : null}
                ${bt.length > 0 && html`<span class="tl-tasks">${bt.map((x) => html`<span class=${x.data.done ? 'done' : ''}>${x.data.done ? '✓' : '○'} ${x.data.text}</span>`)}</span>`}
              </span>
              <span class="tl-st" aria-label=${b.status}>${b.status === 'done' ? '✓' : b.status === 'skipped' ? '–' : ''}</span>
            </button>
            ${open === b.id && html`<${BlockEdit} b=${b} day=${day} onClose=${() => setOpen(null)} />`}
          </li>`;
      })}
    </ol>
    ${hiddenAfter > 0 && html`<button class="tl-more" onClick=${() => setFull(true)}>Zbytek dne · ${hiddenAfter} ${hiddenAfter === 1 ? 'blok' : hiddenAfter < 5 ? 'bloky' : 'bloků'}</button>`}
    ${full && blocks.length > 5 && html`<button class="tl-more" onClick=${() => setFull(false)}>Jen nejbližší bloky</button>`}
    </div>
  </section>`;
}

/** Kruh pokroku. */
export function Ring({ pct, size = 64, stroke = 6, cls = '' }) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  return html`<svg class=${'ring-svg ' + cls} viewBox=${`0 0 ${size} ${size}`} width=${size} height=${size} aria-hidden="true">
    <circle cx=${size / 2} cy=${size / 2} r=${r} class="rg-bg" stroke-width=${stroke} />
    <circle cx=${size / 2} cy=${size / 2} r=${r} class="rg-fg" stroke-width=${stroke} stroke-dasharray=${`${C * pct} ${C}`} transform=${`rotate(-90 ${size / 2} ${size / 2})`} />
  </svg>`;
}

/** Rychlé akce jedním klepnutím. */
function QuickRow({ day, nm }) {
  const { settings } = _us();
  const b = daily('body', day);
  const r = daily('routine', day);
  const rn = settings.routine.filter((it) => r[it.key]).length;
  const water = b.waterMl || 0;
  const sc = willScore(day);
  const [will, setWill] = useState(null);
  const [txt, setTxt] = useState('');
  const save = (e) => { e.preventDefault(); if (!txt.trim()) return; addWill(will, txt); setTxt(''); setWill(null); };
  const morning = nm < 13 * 60 && !b.sleep?.wake;
  return html`<div class="qrow-wrap">
    <div class="qrow" role="group" aria-label="Rychlé zápisy">
      <button class=${'qa' + (water >= settings.waterGoalMl ? ' done' : '')} onClick=${() => { vibrate(); setDaily('body', day, { waterMl: water + 250 }); }}>
        <b>+250 ml</b><span>voda ${(water / 1000).toLocaleString('cs-CZ')}/${settings.waterGoalMl / 1000} l</span></button>
      <button class=${'qa' + (rn === settings.routine.length ? ' done' : '')} onClick=${() => go('rutina')}>
        <b>${rn}/${settings.routine.length}</b><span>rutina</span></button>
      <button class=${'qa plus' + (will === 1 ? ' on' : '')} onClick=${() => setWill(will === 1 ? null : 1)}><b>+1</b><span>překonal jsem se</span></button>
      <button class=${'qa minus' + (will === -1 ? ' on' : '')} onClick=${() => setWill(will === -1 ? null : -1)}><b>−1</b><span>podlehl jsem</span></button>
      ${morning && html`<button class="qa" onClick=${() => { const n = new Date(); setDaily('body', day, (x) => ({ ...x, sleep: { ...(x.sleep || {}), wake: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}` } })); vibrate(); }}><b>Vstávám</b><span>zapsat probuzení</span></button>`}
      <button class="qa" onClick=${() => go('blok')}><b>Blok</b><span>spustit časovač</span></button>
    </div>
    ${will && html`<form class="quick will-inline" onSubmit=${save}>
      <label class="sr" for="qwill">Důvod</label>
      <input id="qwill" value=${txt} onInput=${(e) => setTxt(e.target.value)} autofocus enterkeyhint="done" autocomplete="off" placeholder=${will > 0 ? 'Co jsi překonal?' : 'Čemu jsi podlehl?'} />
      <button class=${'btn ' + (will > 0 ? 'primary' : 'warmbtn')} type="submit">${will > 0 ? '+1' : '−1'}</button>
    </form>`}
    ${sc !== 0 && !will && html`<span class="qrow-note">Dnes +1/−1: <b class=${sc > 0 ? 'ok' : 'late'}>${sc > 0 ? '+' + sc : '−' + Math.abs(sc)}</b></span>`}
  </div>`;
}

function MainTask({ day, value }) {
  const [edit, setEdit] = useState(!value);
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); setEdit(!value); }, [value, day]);
  const d = daily('daylog', day);
  if (!edit) return html`<div class=${'main-task' + (d.mainDone ? ' done' : '')}>
    <button class="mt-check" aria-pressed=${!!d.mainDone} aria-label="Hlavní úkol hotový" onClick=${() => { vibrate(30); setDaily('daylog', day, { mainDone: !d.mainDone }); }}></button>
    <div class="mt-body" onClick=${() => setEdit(true)}><span class="lbl">Hlavní úkol dne${d.planned ? ' · naplánováno předem' : ''}</span><p>${value}</p></div>
  </div>`;
  return html`<form class="main-task edit" onSubmit=${(e) => { e.preventDefault(); setDaily('daylog', day, { mainTask: v.trim() }); if (v.trim()) setEdit(false); }}>
    <label class="lbl" for="mtask">Hlavní úkol dne</label>
    <div class="quick"><input id="mtask" value=${v} onInput=${(e) => setV(e.target.value)} placeholder="Jedna věc, která dnes musí být hotová" enterkeyhint="done" />
    <button class="btn" type="submit">Uložit</button></div>
  </form>`;
}

function Now({ cur, next, nm, day, tasks }) {
  if (!cur && !next) return html`<div class="now calm"><span class="lbl">Teď</span><p class="now-t">Den je u konce.</p>
    <button class="btn" onClick=${() => go('zitra')}>Podívat se na zítřek</button></div>`;
  if (!cur) return html`<div class="now calm">
    <span class="lbl">Teď volno · další za ${fmtDur(next.start - nm)}</span>
    <p class="now-t">${next.title}</p>
    <p class="muted">${fromMin(next.start)}–${fromMin(next.end)}${next.goal ? ' · ' + next.goal : ''}</p></div>`;
  const left = (cur.end - nm) * 60;
  const pct = (nm - cur.start) / (cur.end - cur.start);
  const link = LINKS[cur.type];
  const bt = tasks.filter((x) => x.data.blockId === cur.id);
  return html`<div class=${'now ' + cur.status}>
    <div class="row between"><span class="lbl">Teď · ${BLOCK_TYPES[cur.type]?.label}</span><span class="now-cd">${fmtClock(left)}</span></div>
    <p class="now-t">${cur.title}</p>
    <div class="prog"><i style=${`width:${Math.min(100, pct * 100)}%`}></i></div>
    <${LazyInput} id=${'ng' + cur.id} cls="goal-line" value=${cur.goal} onSave=${(goal) => setBlock(day, cur.id, { goal })} placeholder="Cíl tohoto bloku…" />
    ${bt.length > 0 && html`<ul class="now-tasks">${bt.map((x) => html`<li><button class=${'mini-check' + (x.data.done ? ' on' : '')} onClick=${() => { vibrate(); toggleTask(x); }}>
      <span class="tick" aria-hidden="true"></span><span>${x.data.text}</span></button></li>`)}</ul>`}
    <div class="row wrap">
      ${cur.deep && cur.status === 'pending' && html`<button class="btn primary" onClick=${() => go('blok', cur)}>Spustit časovač</button>`}
      ${link && html`<button class="btn" onClick=${() => go(link)}>Otevřít</button>`}
      <button class=${'btn' + (cur.status === 'done' ? ' on' : '')} onClick=${() => { vibrate(30); setBlock(day, cur.id, { status: cur.status === 'done' ? 'pending' : 'done' }); }}>Hotovo</button>
      <button class=${'btn' + (cur.status === 'skipped' ? ' on' : '')} onClick=${() => setBlock(day, cur.id, { status: cur.status === 'skipped' ? 'pending' : 'skipped' })}>Vynecháno</button>
    </div>
    ${next && html`<p class="muted small">Potom: ${next.title} v ${fromMin(next.start)}</p>`}
  </div>`;
}

function BlockEdit({ b, day, onClose }) {
  return html`<div class="tl-edit">
    <div class="row wrap">
      <${TimeInput} id=${'ts' + b.id} label="Začátek" value=${b.start} onChange=${(v) => moveBlockStart(day, b, v)} />
      <span class="muted">–</span>
      <${TimeInput} id=${'te' + b.id} label="Konec" value=${b.end} onChange=${(v) => v > b.start && setBlock(day, b.id, { end: v })} />
    </div>
    <${LazyInput} id=${'tg' + b.id} cls="goal-line" value=${b.goal} onSave=${(goal) => setBlock(day, b.id, { goal })} placeholder="Cíl bloku…" />
    <div class="row wrap">
      <button class=${'btn sm' + (b.status === 'done' ? ' on' : '')} onClick=${() => { setBlock(day, b.id, { status: b.status === 'done' ? 'pending' : 'done' }); onClose(); }}>Hotovo</button>
      <button class=${'btn sm' + (b.status === 'skipped' ? ' on' : '')} onClick=${() => { setBlock(day, b.id, { status: b.status === 'skipped' ? 'pending' : 'skipped' }); onClose(); }}>Vynecháno</button>
      ${b.deep && b.status === 'pending' && html`<button class="btn sm" onClick=${() => go('blok', b)}>Spustit časovač</button>`}
      ${b.splittable && html`<button class="btn sm ghost" onClick=${() => setDaily('daylog', day, (d) => ({ ...d, split: { ...(d.split || {}), [b.baseId]: !b.split } }))}>${b.split ? 'Spojit do 1 dlouhého' : 'Rozdělit na 2 bloky'}</button>`}
      ${b.extra ? html`<button class="btn sm ghost" onClick=${() => removeExtraBlock(day, b.baseId)}>Smazat</button>`
        : html`<button class="btn sm ghost" onClick=${() => setBlock(day, b.id, { removed: true })}>Dnes vynechat úplně</button>`}
    </div>
  </div>`;
}

function EnergyPrompt({ day, nm }) {
  const { settings } = _us();
  if (!settings.energyPrompts) return null;
  const slot = ENERGY_SLOTS.find((s) => nm >= s.from + 60 && nm < s.to);
  if (!slot || energyInSlot(day, slot.from, slot.to)) return null;
  return html`<div class="card energy-card"><div class="card-h"><h2>Jak máš energii ${slot.label}?</h2></div>
    <${Scale} value=${null} onChange=${(v) => v && logEnergy(day, v)} labels=${['vyčerpaný', 'unavený', 'ok', 'svěží', 'plný energie']} /></div>`;
}

function WillLine({ day }) {
  const list = willFor(day);
  const sc = willScore(day);
  return html`<button class="banner soft will-line" onClick=${() => go('skore')}>
    <span>+1 / −1 dnes${list.length ? ` · ${list.filter((r) => r.data.v > 0).length}× +1, ${list.filter((r) => r.data.v < 0).length}× −1` : ' · překonal ses v něčem?'}</span>
    <b class=${sc > 0 ? 'ok' : sc < 0 ? 'late' : ''}>${sc > 0 ? '+' + sc : sc < 0 ? '−' + Math.abs(sc) : '0'}</b></button>`;
}
