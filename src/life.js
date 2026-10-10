import { useEffect, useState } from 'preact/hooks';
import { html, today, addDays, fmtDay, fmtClock, fmtDur, vibrate, DOW_S, parseDay, weekStart, pad, toMin, fromMin } from './util.js';
import { Page, Card, Check, Chips, Scale, Stepper, QuickAdd, Empty, Bars, LineChart } from './ui.js';
import { daily, setDaily, useStore, all, add, update, remove, getState } from './store.js';
import { streak, bestStreak, routineDone, sleepHours, chaptersDue } from './logic.js';
import { GYM_TYPES, SOCIAL_APPS } from './defaults.js';
import { go } from './nav.js';
import { chime } from './timer.js';

const hhmm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Přepínač dne pro dopisování zpětně */
export function DayPicker({ day, setDay }) {
  const t = today();
  return html`<div class="daypick">
    <button class="btn sm ghost" aria-label="Předchozí den" onClick=${() => setDay(addDays(day, -1))}>‹</button>
    <span>${day === t ? 'Dnes' : day === addDays(t, -1) ? 'Včera' : fmtDay(day)}</span>
    <button class="btn sm ghost" aria-label="Další den" disabled=${day >= t} onClick=${() => setDay(addDays(day, 1))}>›</button>
  </div>`;
}

export function Dots({ fn, days = 14 }) {
  const t = today();
  return html`<div class="dots" aria-label=${`Posledních ${days} dní`}>${Array.from({ length: days }, (_, i) => {
    const d = addDays(t, i - days + 1);
    const v = fn(d);
    return html`<span class=${'d' + (v ? ' on' : '') + (d === t ? ' t' : '')} title=${fmtDay(d)}></span>`;
  })}</div>`;
}

const dnu = (n) => (n === 1 ? 'den' : n > 1 && n < 5 ? 'dny' : 'dní');

// ---------------- 3) Ranní rutina ----------------
export function RoutinePage() {
  const store = useStore();
  const [day, setDay] = useState(today());
  const r = daily('routine', day);
  const items = store.settings.routine;
  const [run, setRun] = useState(null); // { key, end, min }
  const [, tick] = useState(0);
  useEffect(() => {
    if (!run) return;
    const iv = setInterval(() => {
      tick((x) => x + 1);
      if (Date.now() >= run.end) { chime(); vibrate([200, 100, 200]); setRun(null); setDaily('routine', day, { [run.key]: true, [run.key + 'At']: new Date().toISOString(), [run.key + 'Min']: run.min }); }
    }, 500);
    return () => clearInterval(iv);
  }, [run]);

  const toggle = (it) => {
    const on = !r[it.key];
    setDaily('routine', day, { [it.key]: on, ...(on ? { [it.key + 'At']: new Date().toISOString() } : {}) });
    if (on && day === today() && !daily('body', day).sleep?.wake && !items.some((x) => r[x.key])) {
      const w = r.wakeAt || hhmm();
      setDaily('body', day, (b) => ({ ...b, sleep: { ...(b.sleep || {}), wake: w, wakeEst: !r.wakeAt } }));
    }
    if (it.key === 'water') setDaily('body', day, (b) => ({ ...b, waterMl: Math.max(0, (b.waterMl || 0) + (on ? 500 : -500)) }));
  };
  const wakeNow = () => {
    const w = hhmm();
    setDaily('routine', day, { wakeAt: w });
    setDaily('body', day, (b) => ({ ...b, sleep: { ...(b.sleep || {}), wake: b.sleep?.wake || w } }));
    vibrate(20);
  };
  const n = items.filter((i) => r[i.key]).length;
  const s = streak('routine');
  const reading = chaptersDue(day)[0];
  const planned = daily('daylog', day).planned;
  // kdy byla rutina dokončena (poslední odškrtnutí) za 14 dní
  const finishTimes = [];
  for (let i = 1; i <= 14; i++) {
    const d = addDays(today(), -i), rr = daily('routine', d);
    if (!routineDone(d)) continue;
    const ts = items.map((it) => rr[it.key + 'At']).filter(Boolean).map((x) => new Date(x));
    if (ts.length) { const last = new Date(Math.max(...ts)); finishTimes.push(last.getHours() * 60 + last.getMinutes()); }
  }
  const avgFinish = finishTimes.length ? fromMin(finishTimes.reduce((a, b) => a + b, 0) / finishTimes.length) : null;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6)).filter(routineDone).length;
  const sub = (it) => {
    if (run?.key === it.key) return `běží · ${fmtClock((run.end - Date.now()) / 1000)}`;
    if (r[it.key + 'Min']) return `${r[it.key + 'Min']} min`;
    if (it.key === 'water') return 'přičte se k pitnému režimu';
    if (it.key === 'reading' && reading) return `${reading.book.data.title}, kapitola ${reading.ch.n}`;
    if (it.key === 'plan') return planned ? 'den naplánován večer předem ✓' : 'otevři plán dne';
    return null;
  };

  return html`<${Page} title="Ranní rutina" sub=${`${n}/${items.length} · série ${s} ${dnu(s)}`} action=${html`<${DayPicker} day=${day} setDay=${setDay} />`}>
    ${r.wakeAt ? html`<p class="hint">Vstal jsi v ${r.wakeAt}.</p>`
      : day === today() && html`<button class="btn big" onClick=${wakeNow}>Vstávám (${hhmm()})</button>`}
    <${Card}>
      <div class="checks">${items.map((it) => html`<${Check} on=${r[it.key]} onClick=${() => toggle(it)} label=${it.label} sub=${sub(it)}>
        ${it.timer && !r[it.key] && html`<span class="btn sm" role="button" tabindex="0" onClick=${(e) => { e.stopPropagation(); setRun(run?.key === it.key ? null : { key: it.key, end: Date.now() + it.timer * 60000, min: it.timer }); }}>
          ${run?.key === it.key ? 'Stop' : `${it.timer} min ▸`}</span>`}
        ${it.key === 'plan' && !r.plan && html`<span class="btn sm" role="button" tabindex="0" onClick=${(e) => { e.stopPropagation(); go('zitra', { day }); }}>Plán ›</span>`}
        ${it.key === 'reading' && reading && !r.reading && html`<span class="btn sm" role="button" tabindex="0" onClick=${(e) => { e.stopPropagation(); go('cteni'); }}>Kniha ›</span>`}
      </${Check}>`)}</div>
      ${n === items.length && html`<p class="done-msg">Rutina splněna.</p>`}
    </${Card}>
    <${Card} title="Série" meta=${`nejdelší ${bestStreak('routine')}`}>
      <div class="big-n">${s}<small> ${dnu(s)} v řadě</small></div>
      <${Dots} fn=${routineDone} />
      <p class="muted small">Tento týden ${week}/7${avgFinish ? ` · obvykle hotovo v ${avgFinish}` : ''}. Položky upravíš v Nastavení.</p>
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
  const isToday = day === today();
  const tomorrowBed = daily('body', addDays(today(), 1)).sleep?.bed;
  const sleeps = Array.from({ length: 7 }, (_, i) => sleepHours(daily('body', addDays(today(), -i)).sleep)).filter((x) => x != null);
  const avgSleep = sleeps.length ? sleeps.reduce((a, c) => a + c, 0) / sleeps.length : null;
  const weights = all('body').filter((r) => r.data.weight).sort((a, c) => a.day.localeCompare(c.day)).slice(-60);

  return html`<${Page} title="Tělo" action=${html`<${DayPicker} day=${day} setDay=${setDay} />`}>
    <${Card} title="Spánek" meta=${hrs != null ? fmtDur(hrs * 60) : 'noc před tímto dnem'}>
      ${isToday && html`<div class="row wrap">
        ${!sl.wake && html`<button class="btn" onClick=${() => { set({ sleep: { ...sl, wake: hhmm() } }); vibrate(); }}>Vstávám teď</button>`}
        <button class=${'btn' + (tomorrowBed && !daily('body', addDays(today(), 1)).sleep?.bedEst ? ' on' : '')} onClick=${() => { setDaily('body', addDays(today(), 1), (x) => ({ ...x, sleep: { ...(x.sleep || {}), bed: hhmm(), bedEst: false } })); vibrate(); }}>${tomorrowBed ? `Jdu spát · ${tomorrowBed}` : 'Jdu spát teď'}</button>
      </div>`}
      <div class="grid2">
        <div class="field"><label class="lbl" for="sbed">Usnutí</label><input id="sbed" type="time" value=${sl.bed || ''} onChange=${(e) => set({ sleep: { ...sl, bed: e.target.value, bedEst: false } })} /></div>
        <div class="field"><label class="lbl" for="swake">Probuzení</label><input id="swake" type="time" value=${sl.wake || ''} onChange=${(e) => set({ sleep: { ...sl, wake: e.target.value, wakeEst: false } })} /></div>
      </div>
      ${(sl.bedEst || sl.wakeEst) && html`<p class="hint">${sl.bedEst ? 'Usnutí je odhad podle uzavření dne. ' : ''}${sl.wakeEst ? 'Probuzení je odhad podle rutiny. ' : ''}Oprav, pokud nesedí.</p>`}
      <div class="field"><span class="lbl">Kvalita spánku</span><${Scale} value=${sl.q} onChange=${(q) => set({ sleep: { ...sl, q } })} /></div>
      ${avgSleep != null && html`<p class="muted small">Průměr 7 dní ${avgSleep.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} h · cíl ${store.settings.sleepGoalH} h</p>`}
    </${Card}>

    <${Card} title="Pitný režim" meta=${`${(water / 1000).toLocaleString('cs-CZ')} / ${(goal / 1000).toLocaleString('cs-CZ')} l`}>
      <div class="prog lg"><i style=${`width:${Math.min(100, (water / goal) * 100)}%`}></i></div>
      <div class="row wrap">
        <button class="btn" onClick=${() => { vibrate(); set({ waterMl: water + 250 }); }}>+ 250 ml</button>
        <button class="btn" onClick=${() => { vibrate(); set({ waterMl: water + 500 }); }}>+ 500 ml</button>
        <button class="btn" onClick=${() => { vibrate(); set({ waterMl: water + 750 }); }}>+ 750 ml</button>
        <button class="btn ghost" onClick=${() => set({ waterMl: Math.max(0, water - 250) })}>− 250</button>
      </div>
      ${water < goal && isToday && html`<p class="muted small">Zbývá ${((goal - water) / 1000).toLocaleString('cs-CZ')} l.</p>`}
    </${Card}>

    <${Card} title="Gym">
      <${Check} on=${gym.done} label=${gym.done ? 'Odcvičeno' : 'Dnes jsem cvičil'} onClick=${() => set({ gym: { ...gym, done: !gym.done, min: gym.min || 60 } })} />
      ${gym.done && html`
        <div class="field"><span class="lbl">Typ</span><${Chips} options=${GYM_TYPES} value=${gym.type} onChange=${(type) => set({ gym: { ...gym, type } })} /></div>
        <div class="field"><span class="lbl">Délka</span><${Stepper} value=${gym.min} step=${15} unit="min" onChange=${(min) => set({ gym: { ...gym, min } })} /></div>
        <${Exercises} gym=${gym} day=${day} onChange=${(ex) => set({ gym: { ...gym, ex } })} />
        <${NoteField} id="gnote" value=${gym.note} placeholder="Poznámky (pocit, energie)…" onSave=${(note) => set({ gym: { ...gym, note } })} />`}
    </${Card}>

    <${Card} title="Sauna">
      <${Check} on=${sauna.done} label=${sauna.done ? 'Sauna' : 'Byl jsem v sauně'} onClick=${() => set({ sauna: { ...sauna, done: !sauna.done, min: sauna.min || 30, rounds: sauna.rounds || 3 } })} />
      ${sauna.done && html`<div class="set-row"><span>Délka</span><${Stepper} value=${sauna.min} step=${5} unit="min" onChange=${(min) => set({ sauna: { ...sauna, min } })} /></div>
        <div class="set-row"><span>Kola</span><${Stepper} value=${sauna.rounds} min=${1} max=${10} onChange=${(rounds) => set({ sauna: { ...sauna, rounds } })} /></div>`}
    </${Card}>

    <${Card} title="Váha" meta=${weights.length ? `${weights[weights.length - 1].data.weight} kg` : 'nepovinné'}>
      <div class="quick"><label class="sr" for="weight">Váha v kg</label>
        <input id="weight" type="number" inputmode="decimal" step="0.1" min="30" max="250" value=${b.weight || ''} placeholder="kg" onChange=${(e) => set({ weight: e.target.value ? +(+e.target.value).toFixed(1) : null })} /></div>
      ${weights.length >= 2 && html`<${LineChart} points=${weights.map((r) => ({ x: fmtDay(r.day), y: r.data.weight }))} fmt=${(v) => v.toFixed(1)} label="Vývoj váhy" height=${110} min=${Math.min(...weights.map((r) => r.data.weight)) - 1} />`}
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

/** Cviky: název, série × opakování @ kg, s nápovědou z minula. */
function Exercises({ gym, day, onChange }) {
  const ex = gym.ex || [];
  const history = all('body').filter((r) => r.day < day && r.data.gym?.ex?.length).sort((a, b) => b.day.localeCompare(a.day));
  const names = [...new Set(history.flatMap((r) => r.data.gym.ex.map((e) => e.name)))].slice(0, 12);
  const lastOf = (name) => { for (const r of history) { const e = r.data.gym.ex.find((x) => x.name === name); if (e) return { ...e, day: r.day }; } return null; };
  const lastSame = history.find((r) => r.data.gym.type && r.data.gym.type === gym.type);
  const [name, setName] = useState(''), [sets, setSets] = useState(3), [reps, setReps] = useState(10), [kg, setKg] = useState('');
  const prev = name ? lastOf(name) : null;
  const addEx = (e) => { e.preventDefault(); if (!name.trim()) return; onChange([...ex, { id: Math.random().toString(36).slice(2, 8), name: name.trim(), sets, reps, kg: kg === '' ? null : +kg }]); setName(''); vibrate(); };
  return html`<div class="field"><span class="lbl">Cviky</span>
    ${ex.length > 0 && html`<ul class="rows">${ex.map((e) => html`<li><span class="grow">${e.name}</span><span class="nowrap mono">${e.sets}×${e.reps}${e.kg != null ? ` · ${e.kg} kg` : ''}</span>
      <button class="x" aria-label="Odebrat cvik" onClick=${() => onChange(ex.filter((x) => x.id !== e.id))}>×</button></li>`)}</ul>`}
    ${!ex.length && lastSame && html`<button class="btn sm" onClick=${() => onChange(lastSame.data.gym.ex.map((e) => ({ ...e, id: Math.random().toString(36).slice(2, 8) })))}>Zopakovat trénink z ${fmtDay(lastSame.day)}</button>`}
    <form class="ex-form" onSubmit=${addEx}>
      <label class="sr" for="exname">Cvik</label>
      <input id="exname" value=${name} onInput=${(e) => { setName(e.target.value); const p = lastOf(e.target.value); if (p) { setSets(p.sets); setReps(p.reps); setKg(p.kg ?? ''); } }} placeholder="Cvik (např. dřep)" list="exnames" autocomplete="off" />
      <datalist id="exnames">${names.map((n) => html`<option value=${n} />`)}</datalist>
      <div class="ex-nums">
        <label class="sr" for="exsets">Série</label><input id="exsets" type="number" inputmode="numeric" min="1" value=${sets} onInput=${(e) => setSets(+e.target.value)} />
        <span>×</span>
        <label class="sr" for="exreps">Opakování</label><input id="exreps" type="number" inputmode="numeric" min="1" value=${reps} onInput=${(e) => setReps(+e.target.value)} />
        <label class="sr" for="exkg">Kg</label><input id="exkg" type="number" inputmode="decimal" step="0.5" value=${kg} placeholder="kg" onInput=${(e) => setKg(e.target.value)} />
        <button class="btn" type="submit">+</button>
      </div>
    </form>
    ${prev && html`<p class="hint">Minule (${fmtDay(prev.day)}): ${prev.sets}×${prev.reps}${prev.kg != null ? ` · ${prev.kg} kg` : ''}</p>`}
  </div>`;
}

export function NoteField({ id, value, onSave, placeholder, rows = 2 }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return html`<div class="field"><label class="sr" for=${id}>${placeholder}</label>
    <textarea id=${id} rows=${rows} value=${v} placeholder=${placeholder} onInput=${(e) => setV(e.target.value)} onBlur=${() => v !== (value || '') && onSave(v)}></textarea></div>`;
}

// ---------------- 9) Vlivy ----------------
export function appsOf(inf) { return inf.apps || (inf.socialMin ? { other: inf.socialMin } : {}); }
export function addSocial(day, app, x) {
  setDaily('influence', day, (inf) => {
    const apps = { ...appsOf(inf) };
    apps[app] = Math.max(0, (apps[app] || 0) + x);
    return { ...inf, apps, socialMin: Object.values(apps).reduce((a, b) => a + b, 0) };
  });
}

export function InfluencePage() {
  const store = useStore();
  const [day, setDay] = useState(today());
  const inf = daily('influence', day);
  const set = (p) => setDaily('influence', day, p);
  const lim = store.settings.socialLimitMin;
  const m = inf.socialMin || 0;
  const apps = appsOf(inf);
  const [app, setApp] = useState('ig');
  const ws = weekStart(today());
  let weekMin = 0, detoxMonth = 0;
  for (let i = 0; i < 7; i++) weekMin += daily('influence', addDays(ws, i)).socialMin || 0;
  const mon = today().slice(0, 7);
  for (const r of all('influence')) if (r.day?.startsWith(mon) && r.data.detox) detoxMonth++;
  const list = all('influence_item').sort((a, b) => (a.data.sign || '').localeCompare(b.data.sign || ''));
  const [sign, setSign] = useState('+');
  const bars = Array.from({ length: 7 }, (_, i) => { const d = addDays(today(), i - 6); return { label: DOW_S[parseDay(d).getDay()], v: daily('influence', d).socialMin || 0, hi: d === day }; });
  return html`<${Page} title="Vlivy" action=${html`<${DayPicker} day=${day} setDay=${setDay} />`}>
    <${Card} title="Sociální sítě" meta=${`limit ${lim} min`}>
      <div class=${'big-n' + (m > lim ? ' over' : '')}>${m}<small> min</small></div>
      <div class="prog"><i class=${m > lim ? 'over' : ''} style=${`width:${Math.min(100, (m / Math.max(lim, 1)) * 100)}%`}></i></div>
      <${Chips} options=${SOCIAL_APPS.map((a) => ({ key: a.key, label: a.label + (apps[a.key] ? ` · ${apps[a.key]}` : '') }))} value=${app} onChange=${(v) => v && setApp(v)} />
      <div class="row wrap">
        ${[5, 15, 30].map((x) => html`<button class="btn" onClick=${() => { vibrate(); addSocial(day, app, x); }}>+ ${x}</button>`)}
        <button class="btn ghost" onClick=${() => addSocial(day, app, -5)}>− 5</button>
        ${inf.socialMin == null && html`<button class="btn ghost" onClick=${() => set({ socialMin: 0, apps: {} })}>Dnes 0</button>`}
      </div>
      <${Bars} items=${bars} cap=${lim} fmt=${(v) => v + ' min'} height=${90} />
      <p class="muted small">Tento týden ${fmtDur(weekMin)}. Přesná čísla najdeš v Čase u obrazovky / Digitální pohodě.</p>
    </${Card}>
    <${Card} title="Detox den" meta=${`${detoxMonth}× tento měsíc`}>
      <${Check} on=${inf.detox} label="Dnes bez sociálních sítí" onClick=${() => set({ detox: !inf.detox, ...(!inf.detox ? { socialMin: 0, apps: {} } : {}) })} />
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
  useStore();
  const ideas = all('leisure_idea').filter((r) => !r.data.used).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const used = all('leisure_idea').filter((r) => r.data.used).sort((a, b) => (b.data.usedAt || '').localeCompare(a.data.usedAt || '')).slice(0, 8);
  const day = today();
  const [pick, setPick] = useState(null);
  const conscious = Array.from({ length: 14 }, (_, i) => daily('leisure_check', addDays(day, -i)).conscious).filter(Boolean);
  const yes = conscious.filter((c) => c === 'yes').length;
  return html`<${Page} title="Volný čas">
    <${Card} title="Zásobník nápadů na volno" meta=${ideas.length > 1 && html`<button class="btn sm" onClick=${() => { vibrate(); setPick(ideas[Math.floor(Math.random() * ideas.length)].id); }}>Vylosuj mi něco</button>`}>
      <${QuickAdd} id="leiadd" placeholder="Výlet, film, kamarád, nová kavárna…" onAdd=${(t) => add('leisure_idea', { text: t })} />
      ${ideas.length ? html`<ul class="rows">${ideas.map((r) => html`<li class=${r.id === pick ? 'picked' : ''}><span class="grow">${r.data.text}</span>
        <button class="btn sm" onClick=${() => { vibrate(); update(r.id, { used: true, usedAt: new Date().toISOString() }); setPick(null); }}>Udělal jsem</button>
        <button class="x" aria-label="Smazat" onClick=${() => remove(r.id)}>×</button></li>`)}</ul>`
        : html`<${Empty}>Zásobník je prázdný. Přidej pár věcí, na které se těšíš.</${Empty}>`}
    </${Card}>
    <${LeisureCheck} day=${day} />
    ${conscious.length > 0 && html`<p class="muted small">Za 14 dní vědomé volno ${yes}× z ${conscious.length} zapsaných večerů.</p>`}
    ${used.length > 0 && html`<${Card} title="Nedávno užito"><ul class="rows">${used.map((r) => html`<li><span class="muted grow">${r.data.text}</span>
      <span class="muted small">${r.data.usedAt ? fmtDay(r.data.usedAt.slice(0, 10)) : ''}</span>
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
