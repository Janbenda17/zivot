import { useEffect, useState } from 'preact/hooks';
import { html, today, addDays, fmtDay, fmtClock, fmtDur, vibrate, DOW_S, parseDay, weekStart } from './util.js';
import { Page, Card, Check, Chips, Scale, Stepper, QuickAdd, Empty } from './ui.js';
import { daily, setDaily, useStore, all, add, update, remove } from './store.js';
import { streak, bestStreak, routineDone, sleepHours, habitValue } from './logic.js';
import { GYM_TYPES } from './defaults.js';
import { go } from './nav.js';
import { chime } from './timer.js';

/** Přepínač dne pro dopisování zpětně */
export function DayPicker({ day, setDay }) {
  const t = today();
  return html`<div class="daypick">
    <button class="btn sm ghost" aria-label="Předchozí den" onClick=${() => setDay(addDays(day, -1))}>‹</button>
    <span>${day === t ? 'Dnes' : day === addDays(t, -1) ? 'Včera' : fmtDay(day)}</span>
    <button class="btn sm ghost" aria-label="Další den" disabled=${day >= t} onClick=${() => setDay(addDays(day, 1))}>›</button>
  </div>`;
}

function Dots({ fn, days = 14 }) {
  const t = today();
  return html`<div class="dots" aria-label=${`Posledních ${days} dní`}>${Array.from({ length: days }, (_, i) => {
    const d = addDays(t, i - days + 1);
    const v = fn(d);
    return html`<span class=${'d' + (v ? ' on' : '') + (d === t ? ' t' : '')} title=${fmtDay(d)}></span>`;
  })}</div>`;
}

// ---------------- 3) Ranní rutina ----------------
export function RoutinePage() {
  const store = useStore();
  const [day, setDay] = useState(today());
  const r = daily('routine', day);
  const items = store.settings.routine;
  const [med, setMed] = useState(null); // {end}
  const [, tick] = useState(0);
  useEffect(() => {
    if (!med) return;
    const iv = setInterval(() => {
      tick((x) => x + 1);
      if (Date.now() >= med.end) { chime(); vibrate([200, 100, 200]); setMed(null); setDaily('routine', day, { meditation: true, meditationMin: med.min }); }
    }, 500);
    return () => clearInterval(iv);
  }, [med]);

  const toggle = (it) => {
    const on = !r[it.key];
    setDaily('routine', day, { [it.key]: on, ...(on ? { [it.key + 'At']: new Date().toISOString() } : {}) });
    if (it.key === 'water') setDaily('body', day, (b) => ({ ...b, waterMl: Math.max(0, (b.waterMl || 0) + (on ? 500 : -500)) }));
  };
  const n = items.filter((i) => r[i.key]).length;
  const s = streak('routine');
  return html`<${Page} title="Ranní rutina" sub=${`${n}/${items.length} · série ${s} ${s === 1 ? 'den' : s < 5 && s > 0 ? 'dny' : 'dní'}`} action=${html`<${DayPicker} day=${day} setDay=${setDay} />`}>
    <${Card}>
      <div class="checks">${items.map((it) => html`<${Check} on=${r[it.key]} onClick=${() => toggle(it)} label=${it.label}
        sub=${it.key === 'meditation' && r.meditationMin ? `${r.meditationMin} min` : it.key === 'water' ? 'přičte se k pitnému režimu' : null}>
        ${it.timer && !r[it.key] && html`<span class="btn sm" role="button" tabindex="0" onClick=${(e) => { e.stopPropagation(); setMed(med ? null : { end: Date.now() + it.timer * 60000, min: it.timer }); }}>
          ${med ? fmtClock((med.end - Date.now()) / 1000) : `${it.timer} min ▸`}</span>`}
      </${Check}>`)}</div>
      ${r.plan && !daily('daylog', day).mainTask && html`<p class="hint">Plán hotový, ale chybí hlavní úkol dne. <button class="link" onClick=${() => go('dnes')}>Doplnit</button></p>`}
      ${n === items.length && html`<p class="done-msg">Rutina splněna.</p>`}
    </${Card}>
    <${Card} title="Série" meta=${`nejdelší ${bestStreak('routine')}`}>
      <div class="big-n">${s}<small> ${s === 1 ? 'den' : s > 1 && s < 5 ? 'dny' : 'dní'} v řadě</small></div>
      <${Dots} fn=${routineDone} />
    </${Card}>
  </${Page}>`;
}

// ---------------- 4) Tělo ----------------
export function BodyPage() {
  const store = useStore();
  const [day, setDay] = useState(today());
  const b = daily('body', day);
  const set = (p) => setDaily('body', day, p);
  const goal = store.settings.waterGoalMl;
  const water = b.waterMl || 0;
  const sl = b.sleep || {};
  const hrs = sleepHours(sl);
  const gym = b.gym || {};
  const sauna = b.sauna || {};
  return html`<${Page} title="Tělo" action=${html`<${DayPicker} day=${day} setDay=${setDay} />`}>
    <${Card} title="Spánek" meta=${hrs != null ? fmtDur(hrs * 60) : 'noc před tímto dnem'}>
      <div class="grid2">
        <div class="field"><label class="lbl" for="sbed">Usnutí</label><input id="sbed" type="time" value=${sl.bed || ''} onChange=${(e) => set({ sleep: { ...sl, bed: e.target.value } })} /></div>
        <div class="field"><label class="lbl" for="swake">Probuzení</label><input id="swake" type="time" value=${sl.wake || ''} onChange=${(e) => set({ sleep: { ...sl, wake: e.target.value } })} /></div>
      </div>
      <div class="field"><span class="lbl">Kvalita spánku</span><${Scale} value=${sl.q} onChange=${(q) => set({ sleep: { ...sl, q } })} /></div>
    </${Card}>

    <${Card} title="Pitný režim" meta=${`${(water / 1000).toLocaleString('cs-CZ')} / ${(goal / 1000).toLocaleString('cs-CZ')} l`}>
      <div class="prog lg"><i style=${`width:${Math.min(100, (water / goal) * 100)}%`}></i></div>
      <div class="row wrap">
        <button class="btn" onClick=${() => { vibrate(); set({ waterMl: water + 250 }); }}>+ 250 ml</button>
        <button class="btn" onClick=${() => { vibrate(); set({ waterMl: water + 500 }); }}>+ 500 ml</button>
        <button class="btn ghost" onClick=${() => set({ waterMl: Math.max(0, water - 250) })}>− 250</button>
      </div>
    </${Card}>

    <${Card} title="Gym">
      <${Check} on=${gym.done} label=${gym.done ? 'Odcvičeno' : 'Dnes jsem cvičil'} onClick=${() => set({ gym: { ...gym, done: !gym.done, min: gym.min || 60 } })} />
      ${gym.done && html`
        <div class="field"><span class="lbl">Typ</span><${Chips} options=${GYM_TYPES} value=${gym.type} onChange=${(type) => set({ gym: { ...gym, type } })} /></div>
        <div class="field"><span class="lbl">Délka</span><${Stepper} value=${gym.min} step=${15} unit="min" onChange=${(min) => set({ gym: { ...gym, min } })} /></div>
        <${NoteField} id="gnote" value=${gym.note} placeholder="Poznámky (cviky, váhy, pocit)…" onSave=${(note) => set({ gym: { ...gym, note } })} />`}
    </${Card}>

    <${Card} title="Sauna">
      <${Check} on=${sauna.done} label=${sauna.done ? 'Sauna' : 'Byl jsem v sauně'} onClick=${() => set({ sauna: { ...sauna, done: !sauna.done, min: sauna.min || 30 } })} />
      ${sauna.done && html`<div class="field"><span class="lbl">Délka</span><${Stepper} value=${sauna.min} step=${5} unit="min" onChange=${(min) => set({ sauna: { ...sauna, min } })} /></div>`}
    </${Card}>

    <${Card} title="Posledních 7 dní">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th></th>${Array.from({ length: 7 }, (_, i) => { const d = addDays(today(), i - 6); return html`<th>${DOW_S[parseDay(d).getDay()]}</th>`; })}</tr></thead>
        <tbody>
          ${[['Spánek', (d) => { const h = sleepHours(daily('body', d).sleep); return h ? h.toFixed(1) : '·'; }],
             ['Voda', (d) => { const w = daily('body', d).waterMl; return w ? (w / 1000).toFixed(1) : '·'; }],
             ['Gym', (d) => (daily('body', d).gym?.done ? '●' : '·')],
             ['Sauna', (d) => (daily('body', d).sauna?.done ? '●' : '·')]].map(([l, f]) => html`<tr><th>${l}</th>${Array.from({ length: 7 }, (_, i) => html`<td>${f(addDays(today(), i - 6))}</td>`)}</tr>`)}
        </tbody></table></div>
    </${Card}>
  </${Page}>`;
}

export function NoteField({ id, value, onSave, placeholder, rows = 2 }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return html`<div class="field"><label class="sr" for=${id}>${placeholder}</label>
    <textarea id=${id} rows=${rows} value=${v} placeholder=${placeholder} onInput=${(e) => setV(e.target.value)} onBlur=${() => v !== (value || '') && onSave(v)}></textarea></div>`;
}

// ---------------- 9) Vlivy ----------------
export function InfluencePage() {
  const store = useStore();
  const [day, setDay] = useState(today());
  const inf = daily('influence', day);
  const set = (p) => setDaily('influence', day, p);
  const lim = store.settings.socialLimitMin;
  const m = inf.socialMin || 0;
  const ws = weekStart(today());
  let weekMin = 0, detoxMonth = 0;
  for (let i = 0; i < 7; i++) weekMin += daily('influence', addDays(ws, i)).socialMin || 0;
  const mon = today().slice(0, 7);
  for (const r of all('influence')) if (r.day?.startsWith(mon) && r.data.detox) detoxMonth++;
  const list = all('influence_item').sort((a, b) => (a.data.sign || '').localeCompare(b.data.sign || ''));
  const [sign, setSign] = useState('+');
  return html`<${Page} title="Vlivy" action=${html`<${DayPicker} day=${day} setDay=${setDay} />`}>
    <${Card} title="Sociální sítě" meta=${`limit ${lim} min`}>
      <div class=${'big-n' + (m > lim ? ' over' : '')}>${m}<small> min</small></div>
      <div class="prog"><i class=${m > lim ? 'over' : ''} style=${`width:${Math.min(100, (m / Math.max(lim, 1)) * 100)}%`}></i></div>
      <div class="row wrap">
        ${[5, 15, 30].map((x) => html`<button class="btn" onClick=${() => { vibrate(); set({ socialMin: m + x }); }}>+ ${x}</button>`)}
        <button class="btn ghost" onClick=${() => set({ socialMin: Math.max(0, m - 5) })}>− 5</button>
        ${inf.socialMin == null && html`<button class="btn ghost" onClick=${() => set({ socialMin: 0 })}>Dnes 0</button>`}
      </div>
      <p class="muted small">Tento týden ${fmtDur(weekMin)}. Přesné číslo najdeš v Čase u obrazovky / Digitální pohodě.</p>
    </${Card}>
    <${Card} title="Detox den" meta=${`${detoxMonth}× tento měsíc`}>
      <${Check} on=${inf.detox} label="Dnes bez sociálních sítí" onClick=${() => set({ detox: !inf.detox, ...(!inf.detox ? { socialMin: 0 } : {}) })} />
      <${Dots} fn=${(d) => daily('influence', d).detox} days=${28} />
    </${Card}>
    <${Card} title="Můj seznam vlivů" meta="soukromé">
      <p class="muted small">Lidé, zdroje a prostředí, které tě formují. Co přidává (+) a co ubírá (−).</p>
      <div class="row"><${Chips} options=${[{ key: '+', label: '+ přidává' }, { key: '-', label: '− ubírá' }]} value=${sign} onChange=${(v) => v && setSign(v)} /></div>
      <${QuickAdd} id="infadd" placeholder="Např. podcast X, ranní zprávy, kamarád Y…" onAdd=${(t) => add('influence_item', { text: t, sign })} />
      ${list.length ? html`<ul class="rows">${list.map((r) => html`<li>
        <button class=${'sign ' + (r.data.sign === '+' ? 'pos' : 'neg')} onClick=${() => update(r.id, { sign: r.data.sign === '+' ? '-' : '+' })} aria-label="Přepnout">${r.data.sign === '+' ? '+' : '−'}</button>
        <span class="grow">${r.data.text}</span>
        <button class="x" aria-label="Smazat" onClick=${() => remove(r.id)}>×</button></li>`)}</ul>` : html`<${Empty}>Zatím prázdné.</${Empty}>`}
    </${Card}>
  </${Page}>`;
}

// ---------------- 10) Volný čas ----------------
export function LeisurePage() {
  const ideas = all('leisure_idea').filter((r) => !r.data.used).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const used = all('leisure_idea').filter((r) => r.data.used).sort((a, b) => (b.data.usedAt || '').localeCompare(a.data.usedAt || '')).slice(0, 8);
  const day = today();
  return html`<${Page} title="Volný čas">
    <${Card} title="Zásobník nápadů na volno">
      <${QuickAdd} id="leiadd" placeholder="Výlet, film, kamarád, nová kavárna…" onAdd=${(t) => add('leisure_idea', { text: t })} />
      ${ideas.length ? html`<ul class="rows">${ideas.map((r) => html`<li><span class="grow">${r.data.text}</span>
        <button class="btn sm" onClick=${() => { vibrate(); update(r.id, { used: true, usedAt: new Date().toISOString() }); }}>Udělal jsem</button>
        <button class="x" aria-label="Smazat" onClick=${() => remove(r.id)}>×</button></li>`)}</ul>`
        : html`<${Empty}>Zásobník je prázdný. Přidej pár věcí, na které se těšíš.</${Empty}>`}
    </${Card}>
    <${LeisureCheck} day=${day} />
    ${used.length > 0 && html`<${Card} title="Nedávno užito"><ul class="rows">${used.map((r) => html`<li><span class="muted">${r.data.text}</span>
      <button class="btn sm ghost" onClick=${() => update(r.id, { used: false })}>Vrátit</button></li>`)}</ul></${Card}>`}
  </${Page}>`;
}

export function LeisureCheck({ day, compact }) {
  const c = daily('leisure_check', day);
  const set = (p) => setDaily('leisure_check', day, p);
  return html`<${Card} title=${compact ? null : 'Večerní kontrola'}>
    <p>Bylo dnešní volno vědomé?</p>
    <${Chips} options=${[{ key: 'yes', label: 'Ano' }, { key: 'part', label: 'Částečně' }, { key: 'no', label: 'Ne, prosurfoval jsem ho' }]} value=${c.conscious} onChange=${(v) => set({ conscious: v })} />
    <${NoteField} id=${'leinote' + (compact ? 'c' : '')} value=${c.note} placeholder="Co jsem ve volnu dělal?" onSave=${(note) => set({ note })} />
  </${Card}>`;
}
