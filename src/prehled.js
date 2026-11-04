import { useState } from 'preact/hooks';
import { html, today, addDays, fmtDay, DOW_S, parseDay, weekStart } from './util.js';
import { Card, Bars } from './ui.js';
import { useStore } from './store.js';
import { dayXP, xpSummary, achievements, DAY_GOAL } from './xp.js';
import { streak } from './logic.js';
import { Ring } from './today.js';
import { go } from './nav.js';

const nf = (n) => Math.round(n).toLocaleString('cs-CZ');

export function PrehledPage() {
  useStore();
  const t = today();
  const sum = xpSummary();
  const L = sum.level;
  const td = dayXP(t);
  const [showItems, setShowItems] = useState(false);
  const ws = weekStart(t);
  const weekXP = (from) => Array.from({ length: 7 }, (_, i) => sum.byDay.get(addDays(from, i)) || 0).reduce((a, b) => a + b, 0);
  const thisW = weekXP(ws), lastW = weekXP(addDays(ws, -7));
  const bars = Array.from({ length: 14 }, (_, i) => { const d = addDays(t, i - 13); return { label: DOW_S[parseDay(d).getDay()], v: Math.max(0, sum.byDay.get(d) || 0), hi: d === t }; });
  const ach = achievements();
  const got = ach.filter((a) => a.done).length;
  const streaks = [['routine', 'Rutina'], ['water', 'Voda'], ['gym', 'Gym'], ['deep', 'Hluboká práce'], ['journal', 'Deník'], ['planned', 'Plán předem']]
    .map(([k, l]) => ({ k, l, n: streak(k) }));

  return html`<section class="page">
    <header class="page-h"><div><h1>Přehled</h1><p class="page-sub">Body, level a série. Všechno se počítá z toho, co zapisuješ.</p></div></header>

    <div class="level-hero">
      <div class="lv-badge"><span>${L.lvl}</span><small>level</small></div>
      <div class="lv-body">
        <div class="row between"><b>${nf(sum.total)} bodů</b><span class="muted small">do levelu ${L.lvl + 1}: ${nf(L.need - L.into)}</span></div>
        <div class="prog lg"><i style=${`width:${L.pct * 100}%`}></i></div>
        <span class="muted small">${sum.goalStreak > 0 ? `${sum.goalStreak} ${sum.goalStreak === 1 ? 'den' : sum.goalStreak < 5 ? 'dny' : 'dní'} v řadě v denním cíli` : `Denní cíl je ${DAY_GOAL} bodů`}</span>
      </div>
    </div>

    <div class="card today-xp">
      <div class="txp-top">
        <div class="txp-ring"><${Ring} pct=${Math.max(0, Math.min(1, td.total / DAY_GOAL))} size=${92} stroke=${8} /><span><b>${td.total}</b><small>z ${DAY_GOAL}</small></span></div>
        <div class="txp-txt">
          <h2>Dnes</h2>
          <p>${td.total >= DAY_GOAL ? 'Denní cíl splněn. Každý další bod je bonus.' : `Do denního cíle chybí ${DAY_GOAL - td.total} bodů.`}</p>
          <button class="link" onClick=${() => setShowItems(!showItems)}>${showItems ? 'Skrýt rozpis' : 'Za co jsou body'}</button>
        </div>
      </div>
      ${showItems && html`<ul class="rows">${td.items.length ? td.items.map((x) => html`<li><span>${x.label}</span><b class=${'mono ' + (x.xp > 0 ? 'ok' : 'late')}>${x.xp > 0 ? '+' : ''}${x.xp}</b></li>`) : html`<li class="muted">Zatím nic. Rutina, voda, blok nebo +1 a body naskočí.</li>`}</ul>
        <p class="hint">Rutina 2/položka + 10 celá · hluboká práce 10/h + 5 za blok s kvalitou 4–5 · hlavní úkol 15 · úkol 3 · gym 15 · voda, spánek, sauna, deník 5 · +1 = 5, −1 = −2 · uzavřený den a plán zítřka 10.</p>`}
    </div>

    <div class="tiles">
      <div class="tile"><span class="lbl">Tento týden</span><b>${nf(thisW)}</b><small class=${thisW >= lastW ? 'ok' : 'late'}>${thisW >= lastW ? '▲' : '▼'} ${nf(Math.abs(thisW - lastW))} oproti minulému</small></div>
      <div class="tile"><span class="lbl">Nejlepší den</span><b>${nf(sum.best.xp)}</b><small class="muted">${sum.best.day ? fmtDay(sum.best.day) : '–'}</small></div>
      <div class="tile"><span class="lbl">Dny v cíli</span><b>${sum.goalDays}</b><small class="muted">za 400 dní</small></div>
      <div class="tile"><span class="lbl">Odznaky</span><b>${got}/${ach.length}</b><small class="muted">získáno</small></div>
    </div>

    <${Card} title="Body za 14 dní" meta=${`cíl ${DAY_GOAL}`}><${Bars} items=${bars} cap=${DAY_GOAL} capLabel="cíl" fmt=${(v) => v + ' b'} height=${110} /></${Card}>

    <${Card} title="Série">
      <div class="streak-grid">${streaks.map((x) => html`<div class=${'sg-item' + (x.n ? ' on' : '')}><b>${x.n}</b><span>${x.l}</span></div>`)}</div>
    </${Card}>

    <${Card} title="Odznaky" meta=${`${got}/${ach.length}`}>
      <div class="ach-grid">${[...ach].sort((a, b) => (b.done - a.done) || (b.cur / b.goal - a.cur / a.goal)).map((a) => html`<div class=${'ach' + (a.done ? ' done' : '')} title=${a.desc}>
        <span class="ach-ic">${a.icon}</span>
        <b>${a.title}</b><small>${a.desc}</small>
        ${!a.done && html`<div class="prog"><i style=${`width:${(a.cur / a.goal) * 100}%`}></i></div><small class="muted mono">${Math.floor(a.cur * 10) / 10}/${a.goal}</small>`}
      </div>`)}</div>
    </${Card}>

    <div class="link-cards">
      <button class="lc" onClick=${() => go('statistiky')}><b>Statistiky</b><span>hluboká práce, kvalita, souvislosti</span></button>
      <button class="lc" onClick=${() => go('revize')}><b>Týdenní revize</b><span>co se povedlo, cíle na další týden</span></button>
    </div>
  </section>`;
}
