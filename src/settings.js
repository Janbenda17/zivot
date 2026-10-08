import { useEffect, useState } from 'preact/hooks';
import { html, today, toMin, uuid, fromMin, nowMin } from './util.js';
import { Page, Card, Check, Stepper } from './ui.js';
import { useStore, setSettings, exportData, signOut, getState } from './store.js';
import { BLOCK_TYPES, DEFAULT_SCHEDULE } from './defaults.js';
import { dayBlocks } from './logic.js';
import { timerState, remainingSec, markNotified, chime } from './timer.js';
import { ConfirmDelete } from './mind.js';

// ---------- notifikace ----------
export async function notify(title, body, tag) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', renotify: true });
    else new Notification(title, { body, tag });
    return true;
  } catch { return false; }
}
function sentKey() { return 'zivot.notified.' + today(); }
function getSent() { try { return JSON.parse(localStorage.getItem(sentKey())) || []; } catch { return []; } }
function addSent(id) { try { localStorage.setItem(sentKey(), JSON.stringify([...getSent(), id])); } catch {} }

export function startNotifier() {
  const check = () => {
    const st = getState();
    const t = timerState();
    if (t && t.phase === 'running' && !t.pausedAt && remainingSec(t) <= 0 && !t.notified) {
      markNotified(); chime();
      if (st.settings.notify) notify('Blok skončil', t.goal ? `Cíl: ${t.goal}. Prodloužit, nebo ohodnotit?` : 'Prodloužit, nebo ohodnotit?', 'timer');
    }
    if (!st.user || !st.settings.notify) return;
    const nm = nowMin(), lead = st.settings.notifyLeadMin || 0;
    const sent = getSent();
    for (const b of dayBlocks(today())) {
      const at = b.start - lead;
      if (b.status === 'pending' && nm >= at && nm < at + 2 && !sent.includes(b.id + '@' + b.start)) {
        addSent(b.id + '@' + b.start);
        notify(lead ? `Za ${lead} min: ${b.title}` : `Teď: ${b.title}`, `${fromMin(b.start)}–${fromMin(b.end)}${b.goal ? ' · ' + b.goal : ''}`, 'block');
      }
    }
  };
  setInterval(check, 15000);
  setTimeout(check, 2000);
}

// ---------- stránka ----------
export function SettingsPage({ installPrompt }) {
  const store = useStore();
  const s = store.settings;
  const [perm, setPerm] = useState('Notification' in window ? Notification.permission : 'unsupported');
  const sched = [...s.schedule].sort((a, b) => toMin(a.start) - toMin(b.start));
  const setRow = (id, p) => setSettings({ schedule: s.schedule.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const deepPlanned = sched.filter((b) => BLOCK_TYPES[b.type]?.deep).reduce((a, b) => a + Math.max(0, toMin(b.end) - toMin(b.start)), 0);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  const toggleNotify = async () => {
    if (s.notify) return setSettings({ notify: false });
    if (perm === 'unsupported') return;
    let p = Notification.permission;
    if (p === 'default') p = await Notification.requestPermission();
    setPerm(p);
    if (p === 'granted') { setSettings({ notify: true }); notify('Upozornění zapnutá', 'Dám vědět na začátku bloků a na konci časovače.', 'test'); }
  };
  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `zivot-export-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const doExportCsv = () => {
    const rows = exportData().entries;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['kind,day,created_at,data', ...rows.map((r) => [r.kind, r.day, r.created_at, JSON.stringify(r.data)].map(esc).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = `zivot-export-${today()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  return html`<${Page} title="Nastavení">
    <${Card} title="Rozvrh" meta=${`hluboká práce v plánu: ${Math.round(deepPlanned / 6) / 10} h`}>
      ${deepPlanned > s.deepCapMin && html`<p class="notice warn small">Rozvrh plánuje víc hluboké práce, než je tvůj denní strop (${s.deepCapMin / 60} h). Časovač tě na to upozorní.</p>`}
      <ul class="sched">${sched.map((r) => html`<li>
        <label class="sr" for=${'ss' + r.id}>Začátek</label><input id=${'ss' + r.id} type="time" value=${disp(r.start)} onChange=${(e) => setRow(r.id, { start: fixMid(e.target.value, r) })} />
        <label class="sr" for=${'se' + r.id}>Konec</label><input id=${'se' + r.id} type="time" value=${disp(r.end)} onChange=${(e) => setRow(r.id, { end: fixMid(e.target.value, r, true) })} />
        <label class="sr" for=${'sn' + r.id}>Název</label><input id=${'sn' + r.id} class="grow" value=${r.title} onBlur=${(e) => e.target.value !== r.title && setRow(r.id, { title: e.target.value })} />
        <label class="sr" for=${'sy' + r.id}>Typ</label><select id=${'sy' + r.id} value=${r.type} onChange=${(e) => setRow(r.id, { type: e.target.value })}>
          ${Object.entries(BLOCK_TYPES).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select>
        <button class="x" aria-label="Odebrat blok" onClick=${() => setSettings({ schedule: s.schedule.filter((x) => x.id !== r.id) })}>×</button>
      </li>`)}</ul>
      <div class="row between wrap">
        <button class="btn" onClick=${() => { const last = sched[sched.length - 1]; const st = last ? Math.min(toMin(last.end), 1430) : 540; setSettings({ schedule: [...s.schedule, { id: 'b' + uuid().slice(0, 8), start: fromMin(st), end: fromMin(st + 60), title: 'Nový blok', type: 'other' }] }); }}>+ Přidat blok</button>
        <${ConfirmDelete} label="Obnovit výchozí rozvrh" onYes=${() => setSettings({ schedule: DEFAULT_SCHEDULE })} />
      </div>
      <p class="muted small">Časy po půlnoci (do 4:00) patří ke stejnému dni. Změny platí od dneška, už odškrtnuté bloky zůstanou.</p>
    </${Card}>

    <${Card} title="Limity a cíle">
      <div class="set-row"><span>Denní strop hluboké práce</span><${Stepper} value=${s.deepCapMin / 60} step=${0.5} min=${1} max=${10} unit="h" onChange=${(v) => setSettings({ deepCapMin: Math.round(v * 60) })} /></div>
      <div class="set-row"><span>Cíl pitného režimu</span><${Stepper} value=${s.waterGoalMl / 1000} step=${0.25} min=${0.5} max=${6} unit="l" onChange=${(v) => setSettings({ waterGoalMl: Math.round(v * 1000) })} /></div>
      <div class="set-row"><span>Cíl spánku</span><${Stepper} value=${s.sleepGoalH} step=${0.5} min=${5} max=${10} unit="h" onChange=${(v) => setSettings({ sleepGoalH: v })} /></div>
      <div class="set-row"><span>Limit sociálních sítí</span><${Stepper} value=${s.socialLimitMin} step=${5} min=${0} max=${300} unit="min" onChange=${(v) => setSettings({ socialLimitMin: v })} /></div>
    </${Card}>

    <${Card} title="Upozornění">
      ${perm === 'unsupported'
        ? html`<p class="muted">Tenhle prohlížeč upozornění nepodporuje. Na iPhonu nejdřív přidej aplikaci na plochu (Sdílet → Přidat na plochu) a otevři ji odtud.</p>`
        : html`<${Check} on=${s.notify} onClick=${toggleNotify} label="Upozornit na začátek bloku a konec časovače" sub=${perm === 'denied' ? 'Prohlížeč upozornění blokuje, povol je v nastavení webu.' : null} />
          ${s.notify && html`<div class="set-row"><span>Předstih</span><${Stepper} value=${s.notifyLeadMin} step=${5} min=${0} max=${30} unit="min" onChange=${(v) => setSettings({ notifyLeadMin: v })} /></div>`}
          <p class="muted small">Upozornění chodí, když je aplikace otevřená nebo běží na pozadí. Po úplném zavření ji telefon může uspat.</p>`}
    </${Card}>

    ${!standalone && html`<${Card} title="Aplikace na ploše">
      ${installPrompt ? html`<button class="btn primary" onClick=${() => installPrompt.prompt()}>Nainstalovat aplikaci</button>`
        : html`<p class="muted small">iPhone: Safari → Sdílet → Přidat na plochu. Android: menu prohlížeče → Přidat na plochu / Nainstalovat.</p>`}
    </${Card}>`}

    <${Card} title="Data">
      <div class="row wrap"><button class="btn" onClick=${doExport}>Exportovat JSON</button><button class="btn" onClick=${doExportCsv}>Exportovat CSV</button></div>
      <p class="muted small">Všechno je uložené v tvé soukromé databázi a v tomto zařízení pro práci offline.</p>
    </${Card}>

    <${Card} title="Účet">
      <p>${store.user?.email}</p>
      <button class="btn ghost" onClick=${signOut}>Odhlásit se</button>
    </${Card}>
  </${Page}>`;
}

const disp = (t) => (toMin(t) >= 1440 ? fromMin(toMin(t) - 1440) : t);
/** Časy 00:00–03:59 ukládat jako 24:00–27:59, aby patřily ke stejnému dni. */
function fixMid(v, r, isEnd) {
  const m = toMin(v);
  if (m < 240) { const x = m + 1440; return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; }
  return v;
}
