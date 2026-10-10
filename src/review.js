import { useState } from 'preact/hooks';
import { html, today, addDays, fmtDay, weekStart, parseDay, DOW_S, vibrate } from './util.js';
import { Page, Card, Chips, Empty } from './ui.js';
import { daily, setDaily, useStore, all, add } from './store.js';
import { habitValue, overdueTasks, deepByDay } from './logic.js';
import { HABITS } from './defaults.js';
import { weekData } from './stats.js';
import { goalProgress } from './goals.js';
import { NoteField } from './life.js';
import { go } from './nav.js';

const STEPS = ['Čísla týdne', 'Co se povedlo', 'Co drhlo', 'Co změním', 'Cíle na další týden', 'Pondělí'];
const TRACKED = ['routine', 'gym', 'water', 'sleep', 'journal', 'social', 'shutdown', 'planned', 'read'];

/** Kterého týdne se revize týká: v pondělí a úterý ještě minulého, pokud nebyl zrevidován. */
export function reviewWeek() {
  const t = today(), ws = weekStart(t), dow = parseDay(t).getDay();
  const prev = addDays(ws, -7);
  return (dow === 1 || dow === 2) && !daily('review', prev).done ? prev : ws;
}
export function reviewDue() {
  const dow = parseDay(today()).getDay();
  const ws = reviewWeek();
  return (dow === 0 || dow === 1 || dow === 2) && !daily('review', ws).done && (dow !== 0 || new Date().getHours() >= 16);
}

export function ReviewPage() {
  useStore();
  const ws = reviewWeek();
  const r = daily('review', ws);
  const set = (p) => setDaily('review', ws, p);
  const [step, setStep] = useState(r.done ? 5 : 0);
  const a = weekData(ws), b = weekData(addDays(ws, -7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const prevReview = daily('review', addDays(ws, -7));
  const nextWs = addDays(ws, 7);
  const f1 = (v) => (v == null ? '–' : v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 }));
  const habitRows = TRACKED.map((k) => ({ k, label: HABITS.find((h) => h.key === k)?.label || k, vals: days.map((d) => !!habitValue(k, d)) }))
    .map((x) => ({ ...x, n: x.vals.filter(Boolean).length }));
  const weekGoals = all('goal').filter((g) => g.data.horizon === 'week' && g.data.period === ws);
  const goalsState = weekGoals.map((g) => { const p = goalProgress(g); return { g, ok: typeof p === 'number' ? p >= 1 : p.ratio >= 1 }; });
  const blocks = all('deep_block').filter((x) => x.day >= ws && x.day <= addDays(ws, 6));
  const best = blocks.filter((x) => x.data.quality >= 4).sort((x, y) => y.data.quality - x.data.quality).slice(0, 3);
  const dm = deepByDay();
  const bestDay = days.reduce((m, d) => ((dm.get(d) || 0) > (dm.get(m) || 0) ? d : m), days[0]);

  let body;
  if (step === 0) body = html`
    ${prevReview.focus && html`<p class="notice calm">Minulý týden sis řekl: „${prevReview.focus}“</p>`}
    <div class="tbl-wrap"><table class="tbl wide">
      <thead><tr><th></th><th>Tento týden</th><th>Minulý</th></tr></thead>
      <tbody>
        ${[['Hluboká práce', a.deep, b.deep, (v) => f1(v) + ' h', 1], ['⌀ kvalita bloků', a.quality, b.quality, f1, 1], ['Vyrušení', a.interruptions, b.interruptions, f1, -1],
           ['⌀ spánek', a.sleep, b.sleep, (v) => f1(v) + (v == null ? '' : ' h'), 1], ['⌀ nálada', a.mood, b.mood, f1, 1], ['Sociální sítě', a.social, b.social, (v) => v + ' min', -1],
           ['Hotové úkoly', a.tasks, b.tasks, (v) => v, 1]].map(([l, x, y, f, dir]) => {
          const cls = x != null && y != null && x !== y ? ((x - y) * dir > 0 ? 'up' : 'down') : '';
          return html`<tr><th>${l}</th><td class=${cls}>${f(x)}</td><td class="muted">${f(y)}</td></tr>`;
        })}
      </tbody></table></div>
    <div class="tbl-wrap"><table class="tbl habit-grid">
      <thead><tr><th></th>${days.map((d) => html`<th>${DOW_S[parseDay(d).getDay()]}</th>`)}<th></th></tr></thead>
      <tbody>${habitRows.map((h) => html`<tr><th>${h.label}</th>${h.vals.map((v) => html`<td>${v ? '●' : '·'}</td>`)}<td class=${h.n >= 5 ? 'up' : h.n <= 2 ? 'down' : ''}>${h.n}/7</td></tr>`)}</tbody>
    </table></div>`;
  else if (step === 1) body = html`
    <ul class="rows">
      ${a.deep > 0 && html`<li><span>Nejvíc hluboké práce</span><span>${fmtDay(bestDay)} · ${f1((dm.get(bestDay) || 0) / 60)} h</span></li>`}
      ${best.map((x) => html`<li><span>Blok s kvalitou ${x.data.quality}${x.data.goal ? ': ' + x.data.goal : ''}</span><span class="muted">${fmtDay(x.day)}</span></li>`)}
      ${goalsState.filter((x) => x.ok).map((x) => html`<li><span>✓ ${x.g.data.title}</span><span class="ok">splněno</span></li>`)}
      ${habitRows.filter((h) => h.n >= 5).map((h) => html`<li><span>${h.label}</span><span class="ok">${h.n}/7</span></li>`)}
    </ul>
    <${NoteField} id=${'rw' + ws} rows=${4} value=${r.wins} placeholder="Co se tento týden povedlo? Na co můžeš být hrdý?" onSave=${(wins) => set({ wins })} />`;
  else if (step === 2) body = html`
    <ul class="rows">
      ${habitRows.filter((h) => h.n <= 2).map((h) => html`<li><span>${h.label}</span><span class="late">${h.n}/7</span></li>`)}
      ${goalsState.filter((x) => !x.ok).map((x) => html`<li><span>${x.g.data.title}</span><span class="late">nesplněno</span></li>`)}
      ${overdueTasks().length > 0 && html`<li><span>Nedokončené úkoly z minula</span><span class="late">${overdueTasks().length}</span></li>`}
      ${a.deep * 60 > 0 && a.quality != null && a.quality < 3 && html`<li><span>Nízká kvalita bloků</span><span class="late">⌀ ${f1(a.quality)}</span></li>`}
    </ul>
    <${NoteField} id=${'rb' + ws} rows=${4} value=${r.blockers} placeholder="Co drhlo? Proč? Co tě rozhodilo?" onSave=${(blockers) => set({ blockers })} />`;
  else if (step === 3) body = html`
    <${NoteField} id=${'rc' + ws} rows=${3} value=${r.change} placeholder="Co příští týden udělám jinak? (rozvrh, prostředí, návyky)" onSave=${(change) => set({ change })} />
    <div class="field"><label class="lbl" for=${'rf' + ws}>Jedna věc, na kterou se příští týden zaměřím</label>
      <input id=${'rf' + ws} value=${r.focus || ''} onChange=${(e) => set({ focus: e.target.value.trim() })} placeholder="Např. žádný telefon do 12:00" /></div>`;
  else if (step === 4) body = html`<${NextGoals} ws=${nextWs} habitRows=${habitRows} thisWeek=${weekGoals} />`;
  else body = r.done
    ? html`<div class="closed"><div class="closed-mark">Týden uzavřen</div>${r.focus && html`<p>Zaměření: „${r.focus}“</p>`}
        <button class="btn" onClick=${() => go('zitra', { day: nextWs })}>Plán pondělí ›</button>
        <button class="btn ghost" onClick=${() => set({ done: false })}>Upravit revizi</button></div>`
    : html`<p>Naplánuj si pondělí, ať týden začne v klidu.</p>
      <div class="row wrap">
        <button class="btn" onClick=${() => go('zitra', { day: nextWs })}>Plán pondělí ›</button>
        <button class="btn primary" onClick=${() => { vibrate([30, 60, 30]); set({ done: true, doneAt: new Date().toISOString() }); }}>Revize hotová</button>
      </div>`;

  return html`<${Page} title="Týdenní revize" sub=${`${fmtDay(ws)} – ${fmtDay(addDays(ws, 6))}`}>
    <ol class="steps">${STEPS.map((t, i) => html`<li><button class=${(i === step ? 'on' : '') + (i < step ? ' past' : '')} onClick=${() => setStep(i)} aria-current=${i === step ? 'step' : null}>
      <span>${i + 1}</span><small>${t}</small></button></li>`)}</ol>
    <${Card} title=${STEPS[step]}>${body}</${Card}>
    <div class="row between">
      <button class="btn ghost" disabled=${step === 0} onClick=${() => setStep(step - 1)}>Zpět</button>
      ${step < 5 && html`<button class="btn primary" onClick=${() => setStep(step + 1)}>Další</button>`}
    </div>
    <${PastReviews} ws=${ws} />
  </${Page}>`;
}

function NextGoals({ ws, habitRows, thisWeek }) {
  const goals = all('goal').filter((g) => g.data.horizon === 'week' && g.data.period === ws);
  const has = (k) => goals.some((g) => g.data.habit === k);
  const sugg = habitRows.filter((h) => !has(h.k)).map((h) => ({ ...h, target: Math.min(7, Math.max(3, h.n + (h.n < 5 ? 1 : 0))) }));
  const carry = thisWeek.filter((g) => !goals.some((x) => x.data.title === g.data.title));
  return html`
    ${goals.length ? html`<ul class="rows">${goals.map((g) => html`<li><span>${g.data.title}</span></li>`)}</ul>` : html`<${Empty}>Na příští týden zatím žádné cíle.</${Empty}>`}
    ${carry.length > 0 && html`<button class="btn sm" onClick=${() => carry.forEach((g) => add('goal', { ...g.data, period: ws, done: false }))}>Převzít ${carry.length} z tohoto týdne</button>`}
    <p class="lbl">Návrhy podle tohoto týdne (o kousek víc, než se povedlo)</p>
    <div class="chips">${sugg.map((h) => html`<button class="chip" onClick=${() => { vibrate(); add('goal', { horizon: 'week', title: `${h.label} ${h.target}×`, habit: h.k, target: h.target, period: ws, done: false, why: '' }); }}>+ ${h.label} ${h.target}×</button>`)}
      ${!has('deep') && html`<button class="chip" onClick=${() => add('goal', { horizon: 'week', title: 'Hluboká práce 15 h', habit: 'deep', target: 15, period: ws, done: false, why: '' })}>+ Hluboká práce 15 h</button>`}
    </div>
    <button class="btn ghost" onClick=${() => go('cile')}>Upravit cíle ›</button>`;
}

function PastReviews({ ws }) {
  const list = all('review').filter((r) => r.day < ws && (r.data.focus || r.data.wins)).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 6);
  if (!list.length) return null;
  return html`<${Card} title="Minulé revize"><ul class="rows col">${list.map((r) => html`<li>
    <span class="lbl">Týden od ${fmtDay(r.day)}</span>
    ${r.data.focus && html`<span>Zaměření: ${r.data.focus}</span>`}
    ${r.data.wins && html`<span class="muted clip">${r.data.wins}</span>`}
  </li>`)}</ul></${Card}>`;
}
