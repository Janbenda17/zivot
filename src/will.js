// +1 / −1: překonal jsem se (+1), nebo jsem podlehl (−1). Každý zápis má důvod.
import { useState } from 'preact/hooks';
import { html, today, addDays, fmtDay, DOW_S, parseDay, vibrate, dayKey } from './util.js';
import { Page, Card, Bars, Empty } from './ui.js';
import { useStore, all, add, remove } from './store.js';

export function willFor(day) { return all('will').filter((r) => r.day === day).sort((a, b) => a.created_at.localeCompare(b.created_at)); }
export function willScore(day) { return willFor(day).reduce((a, r) => a + (r.data.v || 0), 0); }
export function addWill(v, text, day = today()) { vibrate(v > 0 ? [20, 40, 20] : 40); return add('will', { v, text: text.trim() }, day); }

/** Nejčastější důvody pro rychlé zadání jedním klepnutím. */
function frequent(v, n = 6) {
  const m = new Map();
  for (const r of all('will')) if (r.data.v === v && r.data.text) { const k = r.data.text; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

const fmtScore = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0');

/** Formulář: vyber +1 / −1, napiš důvod, Enter. */
export function WillAdd({ day = today(), compact = false, onDone }) {
  const [v, setV] = useState(null);
  const [text, setText] = useState('');
  const sugg = v ? frequent(v) : [];
  const save = (t) => { if (!v || !t.trim()) return; addWill(v, t, day); setText(''); setV(null); onDone && onDone(v); };
  return html`<div class=${'will-add' + (compact ? ' compact' : '')}>
    <div class="will-btns">
      <button type="button" class=${'will-btn plus' + (v === 1 ? ' on' : '')} aria-pressed=${v === 1} onClick=${() => { setV(v === 1 ? null : 1); vibrate(8); }}><b>+1</b><span>překonal jsem se</span></button>
      <button type="button" class=${'will-btn minus' + (v === -1 ? ' on' : '')} aria-pressed=${v === -1} onClick=${() => { setV(v === -1 ? null : -1); vibrate(8); }}><b>−1</b><span>podlehl jsem</span></button>
    </div>
    ${v && html`
      <form class="quick" onSubmit=${(e) => { e.preventDefault(); save(text); }}>
        <label class="sr" for=${'wt' + (compact ? 'c' : '')}>Důvod</label>
        <input id=${'wt' + (compact ? 'c' : '')} value=${text} onInput=${(e) => setText(e.target.value)} autofocus enterkeyhint="done" autocomplete="off"
          placeholder=${v > 0 ? 'Co jsem překonal? Např. šel jsem do studeného sudu' : 'Čemu jsem podlehl? Např. scrollování'} />
        <button class=${'btn ' + (v > 0 ? 'primary' : 'warmbtn')} type="submit">Uložit</button>
      </form>
      ${sugg.length > 0 && html`<div class="chips">${sugg.map((s) => html`<button type="button" class="chip" onClick=${() => save(s)}>${s}</button>`)}</div>`}`}
  </div>`;
}

export function WillPage() {
  useStore();
  const [day, setDay] = useState(today());
  const t = today();
  const list = willFor(day);
  const score = willScore(day);
  const plus = list.filter((r) => r.data.v > 0).length, minus = list.length - plus;
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  const bars = days14.map((d) => ({ label: DOW_S[parseDay(d).getDay()], v: Math.max(0, willScore(d)), neg: Math.min(0, willScore(d)), hi: d === day, d }));
  const sum = (from) => all('will').filter((r) => r.day >= from && r.day <= t).reduce((a, r) => a + r.data.v, 0);
  const week = sum(addDays(t, -6)), month = sum(addDays(t, -29)), total = all('will').reduce((a, r) => a + r.data.v, 0);
  // série dní s kladným skóre
  let streak = 0, d = t;
  if (willScore(d) <= 0) d = addDays(d, -1);
  while (willScore(d) > 0 && streak < 3650) { streak++; d = addDays(d, -1); }
  const topPlus = frequent(1, 3), topMinus = frequent(-1, 3);
  const maxAbs = Math.max(1, ...bars.map((b) => Math.max(b.v, -b.neg)));

  return html`<${Page} title="+1 / −1" sub="Překonal ses, nebo podlehl? Jedno klepnutí a důvod."
      action=${html`<div class="daypick">
        <button class="btn sm ghost" aria-label="Předchozí den" onClick=${() => setDay(addDays(day, -1))}>‹</button>
        <span>${day === t ? 'Dnes' : day === addDays(t, -1) ? 'Včera' : fmtDay(day)}</span>
        <button class="btn sm ghost" aria-label="Další den" disabled=${day >= t} onClick=${() => setDay(addDays(day, 1))}>›</button></div>`}>

    <div class="will-score">
      <div class=${'ws-big ' + (score > 0 ? 'pos' : score < 0 ? 'neg' : '')}>${fmtScore(score)}</div>
      <div class="ws-meta"><span class="ok">${plus}× +1</span><span class="late">${minus}× −1</span></div>
    </div>

    <${Card}><${WillAdd} day=${day} /></${Card}>

    ${list.length ? html`<${Card} title=${day === t ? 'Dnes' : fmtDay(day, true)}>
      <ul class="rows">${[...list].reverse().map((r) => html`<li>
        <span class=${'will-tag ' + (r.data.v > 0 ? 'pos' : 'neg')}>${r.data.v > 0 ? '+1' : '−1'}</span>
        <span class="grow">${r.data.text}</span>
        <span class="muted small nowrap">${new Date(r.created_at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</span>
        <button class="x" aria-label="Smazat zápis" onClick=${() => remove(r.id)}>×</button></li>`)}</ul>
    </${Card}>` : html`<${Empty}>${day === t ? 'Dnes zatím nic. Až překonáš něco, co se ti nechce, dej si +1.' : 'Ten den bez zápisu.'}</${Empty}>`}

    <div class="tiles">
      <div class="tile"><span class="lbl">7 dní</span><b class=${week >= 0 ? 'ok' : 'late'}>${fmtScore(week)}</b></div>
      <div class="tile"><span class="lbl">30 dní</span><b class=${month >= 0 ? 'ok' : 'late'}>${fmtScore(month)}</b></div>
      <div class="tile"><span class="lbl">Celkem</span><b class=${total >= 0 ? 'ok' : 'late'}>${fmtScore(total)}</b></div>
      <div class="tile"><span class="lbl">Dny v plusu</span><b>${streak}</b></div>
    </div>

    <${Card} title="Posledních 14 dní">
      <div class="will-chart" role="img" aria-label="Denní skóre za 14 dní">
        ${bars.map((b) => html`<button class=${'wc-col' + (b.hi ? ' hi' : '')} onClick=${() => setDay(b.d)} title=${`${fmtDay(b.d)}: ${fmtScore(b.v + b.neg)}`}>
          <span class="wc-up"><i class="pos" style=${`height:${(b.v / maxAbs) * 100}%`}></i></span>
          <span class="wc-down"><i class="neg" style=${`height:${(-b.neg / maxAbs) * 100}%`}></i></span>
          <small>${b.label}</small></button>`)}
      </div>
    </${Card}>

    ${(topPlus.length > 0 || topMinus.length > 0) && html`<${Card} title="Co se opakuje">
      ${topPlus.length > 0 && html`<p class="small"><span class="ok">Nejčastěji překonáváš:</span> ${topPlus.join(' · ')}</p>`}
      ${topMinus.length > 0 && html`<p class="small"><span class="late">Nejčastěji podléháš:</span> ${topMinus.join(' · ')}</p>`}
    </${Card}>`}
  </${Page}>`;
}
