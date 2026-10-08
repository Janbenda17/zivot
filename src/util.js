import { h } from 'preact';
import htm from 'htm';
export const html = htm.bind(h);

export const pad = (n) => String(n).padStart(2, '0');
export const DAY_CUTOFF_MIN = 4 * 60; // do 4:00 se počítá předchozí den

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Logický den: noc do 4:00 patří ke včerejšku. */
export function today() {
  const d = new Date();
  if (d.getHours() * 60 + d.getMinutes() < DAY_CUTOFF_MIN) d.setDate(d.getDate() - 1);
  return dayKey(d);
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dayKey(dt);
}
export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const DOW = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
export const DOW_S = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
export const MONTHS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
export function fmtDay(key, long = false) {
  const d = parseDay(key);
  return long ? `${DOW[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}` : `${DOW_S[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;
}
/** "HH:MM" -> minuty od půlnoci (24:00 = 1440) */
export function toMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
export function fromMin(m) {
  m = Math.round(m);
  const hh = Math.floor(m / 60) % 24, mm = ((m % 60) + 60) % 60;
  return `${pad(hh)}:${pad(mm)}`;
}
/** Minuty od půlnoci v rámci logického dne (po půlnoci > 1440). */
export function nowMin() {
  const d = new Date();
  let m = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  if (m < DAY_CUTOFF_MIN) m += 1440;
  return m;
}
export function fmtDur(min) {
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
export function fmtHours(min) {
  return (min / 60).toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) + ' h';
}
export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
export function isoWeek(key) {
  const d = parseDay(key);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dn = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dn);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${pad(w)}`;
}
export function weekStart(key) {
  const d = parseDay(key);
  const dn = d.getDay() || 7;
  return addDays(key, 1 - dn);
}
export function plural(n, one, few, many) {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  if (!dx || !dy) return null;
  return num / Math.sqrt(dx * dy);
}
export function vibrate(p = 12) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }
