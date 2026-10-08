import { useEffect, useState } from 'preact/hooks';
import { html, today, fmtDay, fromMin, nowMin, fmtClock, fmtDur, addDays, vibrate } from './util.js';
import { Page, Card } from './ui.js';
import { daily, setDaily, useStore } from './store.js';
import { dayBlocks, deepMin } from './logic.js';
import { BLOCK_TYPES } from './defaults.js';
import { useTimer, remainingSec } from './timer.js';
import { go } from './nav.js';

const LINKS = { routine: 'rutina', plan: 'dnes', body: 'telo', shutdown: 'ritual', sleep: 'telo' };

function setBlock(day, id, p) {
  setDaily('daylog', day, (d) => ({ ...d, blocks: { ...(d.blocks || {}), [id]: { ...(d.blocks?.[id] || {}), ...p } } }));
}

export function TodayPage() {
  const store = useStore();
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
  const doneN = blocks.filter((b) => b.status === 'done').length;
  const yShut = daily('shutdown', addDays(day, -1));
  const carry = (yShut.open || []).filter((o) => !(log.carryDone || []).includes(o.id));

  const shift = (delta) => {
    setDaily('daylog', day, (d) => {
      const bl = { ...(d.blocks || {}) };
      for (const b of blocks) if (b.status === 'pending' && b.end > nm) bl[b.id] = { ...(bl[b.id] || {}), start: b.start + delta, end: b.end + delta };
      return { ...d, blocks: bl };
    });
    setResched(false); vibrate(20);
  };
  const startNow = () => {
    const first = blocks.find((b) => b.status === 'pending' && b.end > nm && b !== cur) || cur;
    if (!first) return;
    shift(Math.round(nm - first.start));
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

  return html`<${Page} title=${fmtDay(day, true)} sub=${`${doneN}/${blocks.length} bloků · hluboká práce ${fmtDur(deepMin(day))}`}>
    ${t && html`<button class="banner" onClick=${() => go('blok')}>
      <span>Běží blok${t.goal ? ': ' + t.goal : ''}</span><b>${remainingSec(t) >= 0 ? fmtClock(remainingSec(t)) : '+' + fmtClock(-remainingSec(t))}</b></button>`}

    <${MainTask} day=${day} value=${log.mainTask} />

    ${carry.length > 0 && html`<${Card} title="Otevřené ze včerejška">
      <ul class="rows">${carry.map((o) => html`<li>
        <span>${o.text}${o.when && html` <span class="muted">· ${o.when}</span>`}</span>
        <button class="btn sm" onClick=${() => setDaily('daylog', day, (d) => ({ ...d, carryDone: [...(d.carryDone || []), o.id] }))}>Vyřízeno</button></li>`)}</ul>
    </${Card}>`}

    <${Now} cur=${cur} next=${next} nm=${nm} day=${day} />

    <div class="row between">
      <h2 class="h2">Časová osa</h2>
      <button class="btn sm" onClick=${() => setResched(!resched)} aria-expanded=${resched}>Přeplánovat zbytek dne</button>
    </div>
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
        return html`
          ${gap >= 30 && html`<li class="gap"><span class="tl-time">${fromMin(prev.end)}</span><span>volno · ${fmtDur(gap)}</span></li>`}
          <li class=${`tl ${b.status} ${isCur ? 'cur' : ''} ${past && b.status === 'pending' ? 'missed' : ''}`}>
            <button class="tl-main" onClick=${() => setOpen(open === b.id ? null : b.id)} aria-expanded=${open === b.id}>
              <span class="tl-time">${fromMin(b.start)}<small>${fromMin(b.end)}</small></span>
              <span class="tl-body">
                <span class="tl-title">${b.title}${b.moved && html` <small class="muted">· posunuto</small>`}</span>
                ${b.goal ? html`<span class="tl-goal">${b.goal}</span>` : b.deep && b.status === 'pending' ? html`<span class="tl-goal muted">bez cíle</span>` : null}
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
    <div class="mt-body" onClick=${() => setEdit(true)}><span class="lbl">Hlavní úkol dne</span><p>${value}</p></div>
  </div>`;
  return html`<form class="main-task edit" onSubmit=${(e) => { e.preventDefault(); setDaily('daylog', day, { mainTask: v.trim() }); if (v.trim()) setEdit(false); }}>
    <label class="lbl" for="mtask">Hlavní úkol dne</label>
    <div class="quick"><input id="mtask" value=${v} onInput=${(e) => setV(e.target.value)} placeholder="Jedna věc, která dnes musí být hotová" enterkeyhint="done" />
    <button class="btn" type="submit">Uložit</button></div>
  </form>`;
}

function Now({ cur, next, nm, day }) {
  if (!cur && !next) return html`<div class="now calm"><span class="lbl">Teď</span><p class="now-t">Den je u konce.</p></div>`;
  if (!cur) return html`<div class="now calm">
    <span class="lbl">Teď volno · další za ${fmtDur(next.start - nm)}</span>
    <p class="now-t">${next.title}</p>
    <p class="muted">${fromMin(next.start)}–${fromMin(next.end)}</p></div>`;
  const left = (cur.end - nm) * 60;
  const pct = (nm - cur.start) / (cur.end - cur.start);
  const link = LINKS[cur.type];
  return html`<div class=${'now ' + cur.status}>
    <div class="row between"><span class="lbl">Teď · ${BLOCK_TYPES[cur.type]?.label}</span><span class="now-cd">${fmtClock(left)}</span></div>
    <p class="now-t">${cur.title}</p>
    <div class="prog"><i style=${`width:${Math.min(100, pct * 100)}%`}></i></div>
    <${GoalInput} b=${cur} day=${day} />
    <div class="row wrap">
      ${cur.deep && cur.status === 'pending' && html`<button class="btn primary" onClick=${() => go('blok', cur)}>Spustit časovač</button>`}
      ${link && link !== 'dnes' && html`<button class="btn" onClick=${() => go(link)}>Otevřít</button>`}
      <button class=${'btn' + (cur.status === 'done' ? ' on' : '')} onClick=${() => { vibrate(30); setBlock(day, cur.id, { status: cur.status === 'done' ? 'pending' : 'done' }); }}>Hotovo</button>
      <button class=${'btn' + (cur.status === 'skipped' ? ' on' : '')} onClick=${() => setBlock(day, cur.id, { status: cur.status === 'skipped' ? 'pending' : 'skipped' })}>Vynecháno</button>
    </div>
    ${next && html`<p class="muted small">Potom: ${next.title} v ${fromMin(next.start)}</p>`}
  </div>`;
}

function GoalInput({ b, day }) {
  const [v, setV] = useState(b.goal);
  useEffect(() => setV(b.goal), [b.id, b.goal]);
  return html`<form class="goal-in" onSubmit=${(e) => { e.preventDefault(); setBlock(day, b.id, { goal: v.trim() }); e.target.querySelector('input').blur(); }}>
    <label class="sr" for=${'g' + b.id}>Cíl bloku</label>
    <input id=${'g' + b.id} value=${v} onInput=${(e) => setV(e.target.value)} onBlur=${() => v !== b.goal && setBlock(day, b.id, { goal: v.trim() })}
      placeholder="Cíl tohoto bloku…" enterkeyhint="done" />
  </form>`;
}

function BlockEdit({ b, day, onClose }) {
  return html`<div class="tl-edit">
    <${GoalInput} b=${b} day=${day} />
    <div class="row wrap">
      <button class=${'btn sm' + (b.status === 'done' ? ' on' : '')} onClick=${() => { setBlock(day, b.id, { status: b.status === 'done' ? 'pending' : 'done' }); onClose(); }}>Hotovo</button>
      <button class=${'btn sm' + (b.status === 'skipped' ? ' on' : '')} onClick=${() => { setBlock(day, b.id, { status: b.status === 'skipped' ? 'pending' : 'skipped' }); onClose(); }}>Vynecháno</button>
      ${b.deep && b.status === 'pending' && html`<button class="btn sm" onClick=${() => go('blok', b)}>Spustit časovač</button>`}
      ${b.splittable && html`<button class="btn sm ghost" onClick=${() => setDaily('daylog', day, (d) => ({ ...d, split: { ...(d.split || {}), [b.baseId]: !b.split } }))}>${b.split ? 'Spojit do 1 dlouhého' : 'Rozdělit na 2 bloky'}</button>`}
    </div>
  </div>`;
}
