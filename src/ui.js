import { html, vibrate } from './util.js';
import { useState } from 'preact/hooks';

export function Page({ title, sub, children, action }) {
  return html`<section class="page">
    <header class="page-h">
      <div><h1>${title}</h1>${sub && html`<p class="page-sub">${sub}</p>`}</div>
      ${action}
    </header>
    ${children}
  </section>`;
}

export function Card({ title, meta, children, cls = '' }) {
  return html`<div class=${'card ' + cls}>
    ${(title || meta) && html`<div class="card-h"><h2>${title}</h2>${meta && html`<span class="meta">${meta}</span>`}</div>`}
    ${children}
  </div>`;
}

/** Hodnocení 1–5 jedním klepnutím. */
export function Scale({ value, onChange, labels, id }) {
  return html`<div class="scale" role="radiogroup" id=${id}>
    ${[1, 2, 3, 4, 5].map((n) => html`<button type="button" role="radio" aria-checked=${value === n}
      class=${value === n ? 'on' : ''} onClick=${() => { vibrate(); onChange(value === n ? null : n); }}
      title=${labels?.[n - 1] || ''}>${n}</button>`)}
  </div>`;
}

export function Check({ on, onClick, label, sub, children }) {
  return html`<button type="button" class=${'check-row' + (on ? ' on' : '')} aria-pressed=${!!on}
    onClick=${() => { vibrate(); onClick(); }}>
    <span class="tick" aria-hidden="true"></span>
    <span class="cr-text"><span>${label}</span>${sub && html`<small>${sub}</small>`}</span>
    ${children}
  </button>`;
}

export function Chips({ options, value, onChange, multi = false }) {
  const isOn = (k) => (multi ? (value || []).includes(k) : value === k);
  return html`<div class="chips">${options.map((o) => {
    const k = typeof o === 'string' ? o : o.key, l = typeof o === 'string' ? o : o.label;
    return html`<button type="button" class=${'chip' + (isOn(k) ? ' on' : '')} aria-pressed=${isOn(k)}
      onClick=${() => { vibrate(8); if (multi) onChange(isOn(k) ? value.filter((x) => x !== k) : [...(value || []), k]); else onChange(isOn(k) ? null : k); }}>${l}</button>`;
  })}</div>`;
}

/** Rychlé zadání: jedno pole + Enter. */
export function QuickAdd({ placeholder, onAdd, id, button = 'Přidat' }) {
  const [v, setV] = useState('');
  return html`<form class="quick" onSubmit=${(e) => { e.preventDefault(); const t = v.trim(); if (!t) return; onAdd(t); setV(''); vibrate(); }}>
    <label class="sr" for=${id}>${placeholder}</label>
    <input id=${id} value=${v} onInput=${(e) => setV(e.target.value)} placeholder=${placeholder} autocomplete="off" enterkeyhint="done" />
    <button class="btn" type="submit">${button}</button>
  </form>`;
}

export function Empty({ children }) { return html`<p class="empty">${children}</p>`; }

export function Stepper({ value, onChange, step = 1, min = 0, max = 9999, unit = '', id }) {
  return html`<div class="stepper" id=${id}>
    <button type="button" aria-label="Méně" onClick=${() => { vibrate(8); onChange(Math.max(min, (value || 0) - step)); }}>−</button>
    <span class="num">${value || 0}${unit && html`<small> ${unit}</small>`}</span>
    <button type="button" aria-label="Více" onClick=${() => { vibrate(8); onChange(Math.min(max, (value || 0) + step)); }}>+</button>
  </div>`;
}

/** Jednoduchý sparkline / spojnicový graf v SVG. */
export function LineChart({ points, height = 140, fmt = (v) => v, label }) {
  if (!points.length) return null;
  const W = 600, H = height, P = { l: 36, r: 12, t: 12, b: 22 };
  const max = Math.max(1, ...points.map((p) => p.y));
  const x = (i) => P.l + (i / Math.max(1, points.length - 1)) * (W - P.l - P.r);
  const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const area = d + `L${x(points.length - 1)},${H - P.b}L${x(0)},${H - P.b}Z`;
  const ticks = [0, max / 2, max];
  const last = points[points.length - 1];
  return html`<svg class="chart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${label}>
    ${ticks.map((t) => html`<g><line x1=${P.l} x2=${W - P.r} y1=${y(t)} y2=${y(t)} class="grid" />
      <text x=${P.l - 6} y=${y(t) + 4} text-anchor="end" class="axis">${fmt(t)}</text></g>`)}
    <path d=${area} class="area" />
    <path d=${d} class="line" />
    <circle cx=${x(points.length - 1)} cy=${y(last.y)} r="4" class="dot" />
    <text x=${P.l} y=${H - 4} class="axis">${points[0].x}</text>
    <text x=${W - P.r} y=${H - 4} text-anchor="end" class="axis">${last.x}</text>
  </svg>`;
}

export function Bars({ items, max, fmt = (v) => v, height = 120, cap }) {
  const m = Math.max(1, max ?? Math.max(...items.map((i) => i.v)), cap || 0);
  return html`<div class="bars" style=${`height:${height}px`}>
    ${cap && html`<div class="bars-cap" style=${`bottom:${(cap / m) * 100}%`}><span>strop</span></div>`}
    ${items.map((it) => html`<div class="bar-col" title=${`${it.label}: ${fmt(it.v)}`}>
      <div class=${'bar' + (it.hi ? ' hi' : '') + (cap && it.v > cap ? ' over' : '')} style=${`height:${(it.v / m) * 100}%`}></div>
      <span>${it.label}</span></div>`)}
  </div>`;
}
