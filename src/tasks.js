import { useState } from 'preact/hooks';
import { html, today, addDays, fmtDay, fromMin, vibrate } from './util.js';
import { QuickAdd, Empty } from './ui.js';
import { update, remove } from './store.js';
import { tasksFor, backlog, overdueTasks, addTask, toggleTask, moveTask } from './logic.js';

const dayLabel = (d) => (d === today() ? 'dnes' : d === addDays(today(), 1) ? 'zítra' : fmtDay(d));

/** Jeden úkol: klepnutí na text rozbalí volby (blok, přesun, smazání). */
export function TaskRow({ t, blocks, showDay = false }) {
  const [open, setOpen] = useState(false);
  const d = t.data;
  const block = blocks?.find((b) => b.id === d.blockId);
  const td = today(), tm = addDays(td, 1);
  return html`<li class=${'task' + (d.done ? ' done' : '') + (open ? ' open' : '')}>
    <div class="task-row">
      <button class="tick-btn" aria-pressed=${!!d.done} aria-label=${d.done ? 'Označit jako nehotové' : 'Hotovo'} onClick=${() => { vibrate(20); toggleTask(t); }}></button>
      <button class="task-text" onClick=${() => setOpen(!open)} aria-expanded=${open}>
        <span>${d.text}</span>
        ${(block || showDay) && html`<small>${block ? `${fromMin(block.start)} · ${block.baseTitle}` : ''}${showDay && d.day ? (block ? ' · ' : '') + dayLabel(d.day) : ''}</small>`}
      </button>
      <button class=${'star' + (d.star ? ' on' : '')} aria-pressed=${!!d.star} aria-label="Důležité" onClick=${() => { vibrate(8); update(t.id, { star: !d.star }); }}>★</button>
    </div>
    ${open && html`<div class="task-more">
      ${blocks && blocks.length > 0 && html`<label class="sr" for=${'tb' + t.id}>Blok</label>
        <select id=${'tb' + t.id} value=${d.blockId || ''} onChange=${(e) => update(t.id, { blockId: e.target.value || null })}>
          <option value="">Bez bloku</option>
          ${blocks.filter((b) => b.type !== 'sleep').map((b) => html`<option value=${b.id}>${fromMin(b.start)} ${b.title}</option>`)}
        </select>`}
      <div class="row wrap">
        ${d.day !== td && html`<button class="btn sm" onClick=${() => moveTask(t, td)}>Na dnes</button>`}
        ${d.day !== tm && html`<button class="btn sm" onClick=${() => moveTask(t, tm)}>Na zítra</button>`}
        ${d.day && html`<button class="btn sm" onClick=${() => moveTask(t, null)}>Do zásobníku</button>`}
        <button class="btn sm ghost" onClick=${() => remove(t.id)}>Smazat</button>
      </div>
    </div>`}
  </li>`;
}

/** Úkoly konkrétního dne s rychlým přidáním. */
export function DayTasks({ day, blocks, title = 'Úkoly', placeholder }) {
  const list = tasksFor(day);
  const open = list.filter((t) => !t.data.done).length;
  return html`<div class="card">
    <div class="card-h"><h2>${title}</h2><span class="meta">${list.length ? `${list.length - open}/${list.length} hotovo` : ''}</span></div>
    <${QuickAdd} id=${'ta' + day} placeholder=${placeholder || 'Přidat úkol…'} onAdd=${(text) => addTask(text, day)} />
    ${list.length ? html`<ul class="tasks">${list.map((t) => html`<${TaskRow} key=${t.id} t=${t} blocks=${blocks} />`)}</ul>`
      : html`<p class="hint">Klepni na úkol a přiřaď ho k bloku. Hvězdička = důležité.</p>`}
  </div>`;
}

/** Nedokončené úkoly z minulých dní. */
export function Overdue() {
  const list = overdueTasks();
  if (!list.length) return null;
  const td = today();
  return html`<div class="card warmcard">
    <div class="card-h"><h2>Nedokončené z minula</h2><span class="meta">${list.length}</span></div>
    <ul class="tasks">${list.map((t) => html`<li class="task"><div class="task-row">
      <button class="tick-btn" aria-label="Hotovo" onClick=${() => toggleTask(t)}></button>
      <span class="task-text static"><span>${t.data.text}</span><small>${fmtDay(t.data.day)}</small></span>
    </div><div class="row wrap task-quick">
      <button class="btn sm" onClick=${() => moveTask(t, td)}>Dnes</button>
      <button class="btn sm" onClick=${() => moveTask(t, addDays(td, 1))}>Zítra</button>
      <button class="btn sm" onClick=${() => moveTask(t, null)}>Zásobník</button>
      <button class="btn sm ghost" onClick=${() => remove(t.id)}>Smazat</button>
    </div></li>`)}</ul>
    <button class="btn sm ghost" onClick=${() => list.forEach((t) => moveTask(t, td))}>Vše na dnes</button>
  </div>`;
}

/** Zásobník úkolů bez data. */
export function Backlog({ targetDay }) {
  const [show, setShow] = useState(false);
  const list = backlog();
  return html`<div class="card">
    <div class="card-h"><h2>Zásobník úkolů</h2><button class="btn sm ghost" onClick=${() => setShow(!show)} aria-expanded=${show}>${show ? 'Skrýt' : `Ukázat (${list.length})`}</button></div>
    ${show && html`
      <${QuickAdd} id="backlogadd" placeholder="Úkol na někdy…" onAdd=${(text) => addTask(text, null)} />
      ${list.length ? html`<ul class="tasks">${list.map((t) => html`<li class="task"><div class="task-row">
        <button class="tick-btn" aria-label="Hotovo" onClick=${() => toggleTask(t)}></button>
        <span class="task-text static"><span>${t.data.text}</span></span>
        <button class="btn sm" onClick=${() => moveTask(t, targetDay)}>→ ${dayLabel(targetDay)}</button>
        <button class="x" aria-label="Smazat" onClick=${() => remove(t.id)}>×</button>
      </div></li>`)}</ul>` : html`<${Empty}>Zásobník je prázdný.</${Empty}>`}`}
  </div>`;
}
