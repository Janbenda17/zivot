import { useEffect, useState } from 'preact/hooks';
import { html, today, fmtDay, fromMin, nowMin, fmtClock, fmtDur, addDays, vibrate } from './util.js';
import { Page, Card } from './ui.js';
import { daily, setDaily, useStore } from './store.js';
import { dayBlocks, deepMin, setBlock, moveBlockStart, tasksFor, toggleTask, chaptersDue, removeExtraBlock, templateFor, logEnergy, energyInSlot } from './logic.js';
import { ENERGY_SLOTS } from './push.js';
import { reviewDue } from './review.js';
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

  return html`<${Page} title=${fmtDay(day, true)} sub=${`${templateFor(day).name} · ${doneN}/${blocks.length} bloků · hluboká práce ${fmtDur(deepMin(day))}`}
      action=${html`<button class="btn sm" onClick=${() => go('zitra')}>Zítra ›</button>`}>
    ${isTicking(t) && html`<button class="banner" onClick=${() => go('blok')}>
      <span>${t.phase === 'break' ? 'Pauza' : 'Běží blok'}${t.goal && t.phase !== 'break' ? ': ' + t.goal : ''}</span><b>${remainingSec(t) >= 0 ? fmtClock(remainingSec(t)) : '+' + fmtClock(-remainingSec(t))}</b></button>`}

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
      <span>${tPlanned ? 'Zítřek je naplánovaný ✓' : 'Naplánuj zítřek, ať ráno nemusíš přemýšlet'}</span><b>›</b></button>`}

    <div class="row between">
      <h2 class="h2">Časová osa</h2>
      <div class="row">
        <button class="btn sm ghost" onClick=${() => { setAdding(!adding); setResched(false); }} aria-expanded=${adding}>+ Blok</button>
        <button class="btn sm" onClick=${() => { setResched(!resched); setAdding(false); }} aria-expanded=${resched}>Přeplánovat</button>
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

    <ol class="timeline">
      ${blocks.map((b, i) => {
        const prev = blocks[i - 1];
        const gap = prev ? b.start - prev.end : 0;
        const isCur = b === cur;
        const past = b.end <= nm;
        const bt = tasks.filter((x) => x.data.blockId === b.id);
        return html`
          ${gap >= 30 && html`<li class="gap"><span class="tl-time">${fromMin(prev.end)}</span><span>volno · ${fmtDur(gap)}</span></li>`}
          ${gap < 0 && html`<li class="gap warn-t"><span class="tl-time"></span><span>překryv ${fmtDur(-gap)}</span></li>`}
          <li class=${`tl ${b.status} ${isCur ? 'cur' : ''} ${past && b.status === 'pending' ? 'missed' : ''}`}>
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
  </${Page}>`;
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
