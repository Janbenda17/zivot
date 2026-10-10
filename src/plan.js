import { useEffect, useState } from 'preact/hooks';
import { html, today, addDays, fmtDay, fromMin, fmtDur, vibrate, DOW, parseDay } from './util.js';
import { Page, Card, Chips, Empty } from './ui.js';
import { daily, setDaily, useStore } from './store.js';
import { templates, templateIdFor, dayBlocks, planCheck, setBlock, moveBlockStart, inputToMin, addExtraBlock, removeExtraBlock, tasksFor, chaptersDue, overdueTasks, moveTask } from './logic.js';
import { BLOCK_TYPES } from './defaults.js';
import { DayTasks, Backlog } from './tasks.js';
import { takePayload } from './nav.js';

export function TimeInput({ id, value, onChange, label }) {
  return html`<span class="time-in"><label class="sr" for=${id}>${label}</label>
    <input id=${id} type="time" value=${fromMin(value)} onChange=${(e) => e.target.value && onChange(inputToMin(e.target.value))} /></span>`;
}

/** Textové pole, které uloží až po opuštění (nebo Enter). */
export function LazyInput({ id, value, onSave, placeholder, cls = '' }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value, id]);
  return html`<input id=${id} class=${cls} value=${v} placeholder=${placeholder} enterkeyhint="done"
    onInput=${(e) => setV(e.target.value)} onBlur=${() => v.trim() !== (value || '') && onSave(v.trim())}
    onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />`;
}

export function PlanPage() {
  useStore();
  const pre = takePayload();
  const [day, setDay] = useState(pre?.day || addDays(today(), 1));
  const t = today();
  const log = daily('daylog', day);
  const set = (p) => setDaily('daylog', day, p);
  const tplId = templateIdFor(day);
  const chk = planCheck(day);
  const all = dayBlocks(day, { includeRemoved: true });
  const tasks = tasksFor(day);
  const carry = day === addDays(t, 1) ? [...tasksFor(t).filter((x) => !x.data.done), ...overdueTasks()] : [];
  const reading = chaptersDue(day).filter((c) => c.ch.plan === day);
  const [adding, setAdding] = useState(false);

  return html`<${Page} title=${day === addDays(t, 1) ? 'Plán zítřka' : day === t ? 'Plán dneška' : 'Plán dne'} sub=${fmtDay(day, true)}
      action=${html`<div class="daypick">
        <button class="btn sm ghost" aria-label="Předchozí den" disabled=${day <= t} onClick=${() => setDay(addDays(day, -1))}>‹</button>
        <span>${day === t ? 'Dnes' : day === addDays(t, 1) ? 'Zítra' : DOW[parseDay(day).getDay()]}</span>
        <button class="btn sm ghost" aria-label="Další den" disabled=${day >= addDays(t, 7)} onClick=${() => setDay(addDays(day, 1))}>›</button></div>`}>

    <div class="plan-sum">
      <div><span class="lbl">Vstávání</span><b>${chk.wake != null ? fromMin(chk.wake) : '–'}</b></div>
      <div><span class="lbl">Spánek předtím</span><b class=${chk.sleepShort ? 'warn-t' : ''}>${chk.sleepH != null ? chk.sleepH.toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) + ' h' : '–'}</b></div>
      <div><span class="lbl">Hluboká práce</span><b class=${chk.overCap ? 'warn-t' : ''}>${fmtDur(chk.deepPlanned)}</b></div>
      <div><span class="lbl">Úkoly</span><b>${tasks.length}</b></div>
    </div>
    ${chk.overlaps.length > 0 && html`<p class="notice warn">Překrývá se: ${chk.overlaps.map(([a, b]) => `${a.title} a ${b.title}`).join('; ')}.</p>`}
    ${chk.overCap && html`<p class="notice warn">Plánuješ ${fmtDur(chk.deepPlanned)} hluboké práce, víc než strop. Zvaž zkrácení nebo odebrání bloku.</p>`}
    ${chk.sleepShort && html`<p class="notice warn">Mezi spánkem a vstáváním je jen ${chk.sleepH.toFixed(1)} h. Posuň spánek dřív nebo začátek dne později.</p>`}

    <${Card} title="Typ dne">
      <${Chips} options=${templates().map((x) => ({ key: x.id, label: x.name }))} value=${tplId} onChange=${(v) => v && set({ template: v })} />
      <p class="hint">${log.template ? 'Změněno jen pro tento den.' : 'Podle rozvrhu pro ' + DOW[parseDay(day).getDay()] + '. Šablony upravíš v Nastavení.'}</p>
    </${Card}>

    <${Card} title="Záměr">
      <div class="field"><label class="lbl" for=${'pm' + day}>Hlavní úkol dne</label>
        <${LazyInput} id=${'pm' + day} value=${log.mainTask} onSave=${(mainTask) => set({ mainTask })} placeholder="Jedna věc, která musí být hotová" /></div>
      <div class="field"><label class="lbl" for=${'pi' + day}>Jak chci, aby den proběhl</label>
        <${LazyInput} id=${'pi' + day} value=${log.intention} onSave=${(intention) => set({ intention })} placeholder="Např. klidně, bez telefonu do oběda" /></div>
    </${Card}>

    ${carry.length > 0 && html`<div class="card warmcard"><div class="card-h"><h2>Nedokončené z dneška</h2><span class="meta">${carry.length}</span></div>
      <ul class="rows">${carry.map((x) => html`<li><span class="grow">${x.data.text}</span><button class="btn sm" onClick=${() => moveTask(x, day)}>Na zítra</button></li>`)}</ul>
      <button class="btn sm" onClick=${() => carry.forEach((x) => moveTask(x, day))}>Přesunout vše na zítra</button></div>`}

    <${DayTasks} day=${day} blocks=${chk.blocks} title="Úkoly dne" placeholder="Co chceš ten den udělat?" />

    <div class="row between"><h2 class="h2">Bloky</h2><button class="btn sm" onClick=${() => setAdding(!adding)}>${adding ? 'Zavřít' : '+ Jednorázový blok'}</button></div>
    ${adding && html`<${AddBlock} day=${day} onDone=${() => setAdding(false)} />`}
    <ul class="plan-blocks">${all.map((b) => html`<${PlanBlock} key=${b.id} b=${b} day=${day} tasks=${tasks.filter((x) => x.data.blockId === b.id)} />`)}</ul>
    ${reading.length > 0 && html`<p class="hint">Čtení na tento den: ${reading.map((r) => `${r.book.data.title}, kap. ${r.ch.n}`).join(' · ')}</p>`}

    <${Backlog} targetDay=${day} />

    ${log.planned
      ? html`<div class="planned-ok"><span>Den je naplánovaný ✓</span><button class="btn sm ghost" onClick=${() => set({ planned: false })}>Upravit dál</button></div>`
      : html`<button class="btn primary big" onClick=${() => { vibrate([20, 40, 20]); set({ planned: true, plannedAt: new Date().toISOString() }); }}>Plán je hotový</button>`}
  </${Page}>`;
}

function PlanBlock({ b, day, tasks }) {
  const [open, setOpen] = useState(false);
  if (b.removed) return html`<li class="pb removed"><span class="pb-t">${fromMin(b.start)}</span><span class="grow">${b.title}</span>
    <button class="btn sm ghost" onClick=${() => setBlock(day, b.id, { removed: false })}>Vrátit</button></li>`;
  return html`<li class=${'pb' + (b.deep ? ' deep' : '')}>
    <div class="pb-row">
      <${TimeInput} id=${'ps' + b.id} label="Začátek" value=${b.start} onChange=${(v) => moveBlockStart(day, b, v)} />
      <${TimeInput} id=${'pe' + b.id} label="Konec" value=${b.end} onChange=${(v) => v > b.start && setBlock(day, b.id, { end: v })} />
      <button class="pb-title" onClick=${() => setOpen(!open)} aria-expanded=${open}>
        <span>${b.title}${b.extra ? html` <small class="muted">· jednorázový</small>` : ''}</span>
        <small class="muted">${BLOCK_TYPES[b.type]?.label} · ${fmtDur(b.end - b.start)}${tasks.length ? ` · ${tasks.length} úk.` : ''}</small>
      </button>
    </div>
    ${b.type !== 'sleep' && html`<${LazyInput} id=${'pg' + b.id} cls="pb-goal" value=${b.goal} onSave=${(goal) => setBlock(day, b.id, { goal })} placeholder=${b.deep ? 'Cíl bloku – co bude na konci hotové?' : 'Poznámka k bloku'} />`}
    ${tasks.length > 0 && html`<ul class="pb-tasks">${tasks.map((x) => html`<li class=${x.data.done ? 'done' : ''}>${x.data.star ? '★ ' : ''}${x.data.text}</li>`)}</ul>`}
    ${open && html`<div class="row wrap pb-more">
      ${[-30, -15, 15, 30].map((d) => html`<button class="btn sm" onClick=${() => moveBlockStart(day, b, b.start + d)}>${d > 0 ? '+' : '−'}${Math.abs(d)} min</button>`)}
      ${b.splittable && html`<button class="btn sm" onClick=${() => setDaily('daylog', day, (d) => ({ ...d, split: { ...(d.split || {}), [b.baseId]: !b.split } }))}>${b.split ? 'Spojit do 1 dlouhého' : 'Rozdělit na 2 bloky'}</button>`}
      ${b.moved && html`<button class="btn sm ghost" onClick=${() => setBlock(day, b.id, { start: null, end: null })}>Původní čas</button>`}
      ${b.extra ? html`<button class="btn sm ghost" onClick=${() => removeExtraBlock(day, b.baseId)}>Smazat blok</button>`
        : html`<button class="btn sm ghost" onClick=${() => setBlock(day, b.id, { removed: true })}>Tento den vynechat</button>`}
    </div>`}
  </li>`;
}

export function AddBlock({ day, onDone }) {
  const [title, setTitle] = useState(''), [start, setStart] = useState('16:00'), [end, setEnd] = useState('17:00'), [type, setType] = useState('other');
  return html`<form class="card" onSubmit=${(e) => { e.preventDefault(); if (!title.trim()) return; const s = inputToMin(start); let en = inputToMin(end); if (en <= s) en = s + 30; addExtraBlock(day, { title: title.trim(), start: s, end: en, type }); vibrate(); onDone(); }}>
    <div class="field"><label class="lbl" for="abt">Název</label><input id="abt" value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder="Např. Zubař, schůzka, výlet" /></div>
    <div class="grid2">
      <div class="field"><label class="lbl" for="abs">Od</label><input id="abs" type="time" value=${start} onInput=${(e) => setStart(e.target.value)} /></div>
      <div class="field"><label class="lbl" for="abe">Do</label><input id="abe" type="time" value=${end} onInput=${(e) => setEnd(e.target.value)} /></div>
    </div>
    <div class="field"><span class="lbl">Typ</span><${Chips} options=${Object.entries(BLOCK_TYPES).filter(([k]) => k !== 'sleep').map(([key, v]) => ({ key, label: v.label }))} value=${type} onChange=${(v) => v && setType(v)} /></div>
    <button class="btn primary" type="submit">Přidat blok</button>
  </form>`;
}
