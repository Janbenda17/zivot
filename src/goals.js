import { useState } from 'preact/hooks';
import { html, today, addDays, weekStart, isoWeek, fmtDay, vibrate } from './util.js';
import { Page, Card, Chips, Empty, Check } from './ui.js';
import { useStore, all, add, update, remove } from './store.js';
import { habitCount } from './logic.js';
import { HABITS } from './defaults.js';
import { ConfirmDelete } from './mind.js';
import { NoteField } from './life.js';

function periodRange(horizon, period) {
  if (horizon === 'week') { const ws = period; return [ws, addDays(ws, 6)]; }
  if (horizon === 'month') { const [y, m] = period.split('-').map(Number); const last = new Date(y, m, 0).getDate(); return [`${period}-01`, `${period}-${String(last).padStart(2, '0')}`]; }
  return null;
}
export function goalProgress(g) {
  const d = g.data;
  if (!d.habit || !d.target) return d.done ? 1 : 0;
  const r = periodRange(d.horizon, d.period);
  if (!r) return 0;
  const to = r[1] < today() ? r[1] : today();
  let v = habitCount(d.habit, r[0], to);
  if (d.habit === 'deep') v = v / 60;
  return { value: v, ratio: Math.min(1, v / d.target) };
}

export function GoalsPage() {
  useStore();
  const t = today();
  const ws = weekStart(t), mon = t.slice(0, 7);
  const goals = all('goal');
  const longs = goals.filter((g) => g.data.horizon === 'long').sort((a, b) => a.created_at.localeCompare(b.created_at));
  const months = goals.filter((g) => g.data.horizon === 'month' && g.data.period === mon);
  const weeks = goals.filter((g) => g.data.horizon === 'week' && g.data.period === ws);
  const [form, setForm] = useState(null);
  const m = +mon.slice(5, 7);
  const MN = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
  const sec = (kind, title, items) => html`<${Section} kind=${kind} title=${title} items=${items} form=${form === kind} onAdd=${() => setForm(form === kind ? null : kind)} close=${() => setForm(null)} longs=${longs} ws=${ws} mon=${mon} />`;
  return html`<${Page} title="Cíle" sub="Dlouhodobý směr, měsíční a týdenní kroky napojené na návyky">
    ${sec('long', 'Dlouhodobé', longs)}
    ${sec('month', `Měsíc · ${MN[m - 1]}`, months)}
    ${sec('week', `Týden ${+isoWeek(t).split('-W')[1]} · od ${fmtDay(ws)}`, weeks)}
    <${Past} goals=${goals} ws=${ws} mon=${mon} />
  </${Page}>`;
}

function Section({ kind, title, items, onAdd, form, close, longs, ws, mon }) {
  return html`<${Card} title=${title} meta=${html`<button class="btn sm" onClick=${onAdd}>${form ? 'Zavřít' : '+ Cíl'}</button>`}>
    ${form && html`<${GoalForm} kind=${kind} longs=${longs} ws=${ws} mon=${mon} close=${close} />`}
    ${items.length ? html`<ul class="goals">${items.map((g) => html`<${GoalItem} key=${g.id} g=${g} longs=${longs} />`)}</ul>` : !form && html`<${Empty}>Zatím žádný cíl.</${Empty}>`}
  </${Card}>`;
}

function GoalItem({ g, longs }) {
  const [open, setOpen] = useState(false);
  const d = g.data;
  const p = goalProgress(g);
  const parent = longs.find((l) => l.id === d.parentId);
  const hab = HABITS.find((h) => h.key === d.habit);
  return html`<li class="goal">
    <div class="row">
      ${!d.habit && d.horizon !== 'long' && html`<button class=${'ch-check' + (d.done ? ' on' : '')} aria-pressed=${!!d.done} aria-label="Splněno" onClick=${() => { vibrate(30); update(g.id, { done: !d.done }); }}></button>`}
      <button class="goal-main" onClick=${() => setOpen(!open)} aria-expanded=${open}>
        <span class=${'g-title' + (d.done ? ' done' : '')}>${d.title}</span>
        ${d.horizon === 'long' && d.why && html`<span class="g-why">Proč: ${d.why}</span>`}
        ${parent && html`<span class="muted small">↳ ${parent.data.title}</span>`}
      </button>
    </div>
    ${hab && d.target && html`<div class="g-prog"><div class="prog"><i style=${`width:${p.ratio * 100}%`}></i></div>
      <span class="small nowrap">${hab.label}: ${Math.round(p.value * 10) / 10}/${d.target}${d.habit === 'deep' ? ' h' : '×'}</span></div>`}
    ${open && html`<div class="g-edit">
      ${d.horizon === 'long' && html`<${NoteField} id=${'why' + g.id} value=${d.why} placeholder="Proč je to pro mě důležité?" onSave=${(why) => update(g.id, { why })} />`}
      <div class="row between">
        ${d.horizon === 'long' && html`<button class="btn sm ghost" onClick=${() => update(g.id, { done: !d.done })}>${d.done ? 'Znovu aktivní' : 'Dosaženo'}</button>`}
        <${ConfirmDelete} onYes=${() => remove(g.id)} />
      </div></div>`}
  </li>`;
}

function GoalForm({ kind, longs, ws, mon, close }) {
  const [title, setTitle] = useState(''), [why, setWhy] = useState(''), [habit, setHabit] = useState(null), [target, setTarget] = useState(kind === 'week' ? 4 : 15), [parentId, setParent] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    const ttl = title.trim() || (habit ? HABITS.find((h) => h.key === habit).label + ` ${target}${habit === 'deep' ? ' h' : '×'}` : '');
    if (!ttl) return;
    add('goal', { horizon: kind, title: ttl, why: why.trim(), habit, target: habit ? +target : null, parentId, period: kind === 'week' ? ws : kind === 'month' ? mon : null, done: false });
    close();
  };
  return html`<form class="goal-form" onSubmit=${submit}>
    <div class="field"><label class="lbl" for=${'gt' + kind}>Cíl</label><input id=${'gt' + kind} value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder=${kind === 'long' ? 'Např. Napsat knihu' : 'Např. 4× gym'} /></div>
    ${kind === 'long'
      ? html`<div class="field"><label class="lbl" for="gwhy">Proč</label><textarea id="gwhy" rows="2" value=${why} onInput=${(e) => setWhy(e.target.value)} placeholder="Co se změní, až ho dosáhnu?"></textarea></div>`
      : html`<div class="field"><span class="lbl">Napojit na návyk (měří se automaticky)</span><${Chips} options=${HABITS} value=${habit} onChange=${setHabit} /></div>
        ${habit && html`<div class="field"><label class="lbl" for=${'gtar' + kind}>Cíl ${habit === 'deep' ? '(hodin)' : '(kolikrát)'}</label><input id=${'gtar' + kind} type="number" min="1" value=${target} onInput=${(e) => setTarget(e.target.value)} /></div>`}
        ${longs.length > 0 && html`<div class="field"><span class="lbl">Patří k dlouhodobému cíli</span><${Chips} options=${longs.map((l) => ({ key: l.id, label: l.data.title }))} value=${parentId} onChange=${setParent} /></div>`}`}
    <div class="row"><button class="btn ghost" type="button" onClick=${close}>Zrušit</button><button class="btn primary grow" type="submit">Přidat</button></div>
  </form>`;
}

function Past({ goals, ws, mon }) {
  const past = goals.filter((g) => (g.data.horizon === 'week' && g.data.period < ws) || (g.data.horizon === 'month' && g.data.period < mon))
    .sort((a, b) => b.data.period.localeCompare(a.data.period)).slice(0, 12);
  if (!past.length) return null;
  return html`<${Card} title="Minulá období"><ul class="rows">${past.map((g) => {
    const p = goalProgress(g); const ok = typeof p === 'number' ? p >= 1 : p.ratio >= 1;
    return html`<li><span class="grow">${g.data.title}</span><span class="muted small">${g.data.horizon === 'week' ? 'týden ' + fmtDay(g.data.period) : g.data.period}</span><span class=${ok ? 'ok' : 'muted'}>${ok ? '✓' : '–'}</span></li>`;
  })}</ul></${Card}>`;
}
