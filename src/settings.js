import { useEffect, useState } from 'preact/hooks';
import { html, today, toMin, uuid, fromMin, nowMin, addDays, DOW } from './util.js';
import { Page, Card, Check, Stepper, Chips } from './ui.js';
import { useStore, setSettings, exportData, signOut, getState, daily } from './store.js';
import { BLOCK_TYPES, DEFAULT_TEMPLATES, DEFAULT_ROUTINE } from './defaults.js';
import { dayBlocks, inputToMin } from './logic.js';
import { timerState, remainingSec, markNotified, chime } from './timer.js';
import { ConfirmDelete } from './mind.js';
import { pushSupported, isStandalone, isIOS, enablePush, disablePush, testPush, currentSubscription } from './push.js';

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
  let n = 0;
  const check = () => {
    const st = getState();
    const t = timerState();
    if (t && (t.phase === 'running' || t.phase === 'break') && !t.pausedAt && remainingSec(t) <= 0 && !t.notified) {
      markNotified(); chime();
      try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch {}
      if (st.settings.notify && !st.settings.push) {
        if (t.phase === 'break') notify('Pauza skončila', 'Čas na další blok, nebo konec práce.', 'timer');
        else notify('Blok skončil', t.goal ? `Cíl: ${t.goal}. Prodloužit, nebo ohodnotit?` : 'Prodloužit, nebo ohodnotit?', 'timer');
      }
    }
    if (++n % 3 !== 0) return; // bloky stačí kontrolovat každých 15 s
    if (!st.user || !st.settings.notify || st.settings.push) return;
    const nm = nowMin(), lead = st.settings.notifyLeadMin || 0;
    const sent = getSent();
    for (const b of dayBlocks(today())) {
      const at = b.start - lead;
      if (b.status === 'pending' && nm >= at && nm < at + 2 && !sent.includes(b.id + '@' + b.start)) {
        addSent(b.id + '@' + b.start);
        const extra = b.type === 'shutdown' && !daily('daylog', addDays(today(), 1)).planned ? ' · nezapomeň naplánovat zítřek' : '';
        notify(lead ? `Za ${lead} min: ${b.title}` : `Teď: ${b.title}`, `${fromMin(b.start)}–${fromMin(b.end)}${b.goal ? ' · ' + b.goal : ''}${extra}`, 'block');
      }
    }
  };
  setInterval(check, 5000);
  setTimeout(check, 2000);
}

const disp = (m) => fromMin(m);

// ---------- editor šablony ----------
function TemplateEditor({ tpl, onChange }) {
  const blocks = [...tpl.blocks].sort((a, b) => toMin(a.start) - toMin(b.start));
  const setRow = (id, p) => onChange({ ...tpl, blocks: tpl.blocks.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const asStr = (v) => { const m = inputToMin(v); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`.padStart(5, '0'); };
  const deep = blocks.filter((b) => BLOCK_TYPES[b.type]?.deep).reduce((a, b) => a + Math.max(0, toMin(b.end) - toMin(b.start)), 0);
  const cap = getState().settings.deepCapMin;
  return html`<div class="tpl-edit">
    <div class="field"><label class="lbl" for=${'tn' + tpl.id}>Název šablony</label>
      <input id=${'tn' + tpl.id} value=${tpl.name} onBlur=${(e) => e.target.value.trim() && e.target.value !== tpl.name && onChange({ ...tpl, name: e.target.value.trim() })} /></div>
    <p class=${'small ' + (deep > cap ? 'late' : 'muted')}>Hluboká práce v šabloně: ${Math.round(deep / 6) / 10} h${deep > cap ? ` (víc než strop ${cap / 60} h)` : ''}</p>
    <ul class="sched">${blocks.map((r) => html`<li>
      <label class="sr" for=${'ss' + r.id}>Začátek</label><input id=${'ss' + r.id} type="time" value=${disp(toMin(r.start))} onChange=${(e) => e.target.value && setRow(r.id, { start: asStr(e.target.value) })} />
      <label class="sr" for=${'se' + r.id}>Konec</label><input id=${'se' + r.id} type="time" value=${disp(toMin(r.end))} onChange=${(e) => e.target.value && setRow(r.id, { end: asStr(e.target.value) })} />
      <label class="sr" for=${'sn' + r.id}>Název</label><input id=${'sn' + r.id} class="grow" value=${r.title} onBlur=${(e) => e.target.value !== r.title && setRow(r.id, { title: e.target.value })} />
      <label class="sr" for=${'sy' + r.id}>Typ</label><select id=${'sy' + r.id} value=${r.type} onChange=${(e) => setRow(r.id, { type: e.target.value })}>
        ${Object.entries(BLOCK_TYPES).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select>
      <button class="x" aria-label="Odebrat blok" onClick=${() => onChange({ ...tpl, blocks: tpl.blocks.filter((x) => x.id !== r.id) })}>×</button>
    </li>`)}</ul>
    <button class="btn" onClick=${() => { const last = blocks[blocks.length - 1]; const st = last ? Math.min(toMin(last.end), 1430) : 540; onChange({ ...tpl, blocks: [...tpl.blocks, { id: 'b' + uuid().slice(0, 8), start: fromMin(st), end: fromMin(st + 60), title: 'Nový blok', type: 'other' }] }); }}>+ Přidat blok</button>
  </div>`;
}

// ---------- stránka ----------
export function SettingsPage({ installPrompt }) {
  const store = useStore();
  const s = store.settings;
  const tpls = s.templates;
  const [edit, setEdit] = useState(tpls[0]?.id);
  const [perm, setPerm] = useState('Notification' in window ? Notification.permission : 'unsupported');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const cur = tpls.find((t) => t.id === edit) || tpls[0];
  const saveTpl = (t) => setSettings({ templates: tpls.map((x) => (x.id === t.id ? t : x)) });
  const [newItem, setNewItem] = useState('');

  const toggleNotify = async () => {
    if (s.notify) return setSettings({ notify: false });
    if (perm === 'unsupported') return;
    let p = Notification.permission;
    if (p === 'default') p = await Notification.requestPermission();
    setPerm(p);
    if (p === 'granted') { setSettings({ notify: true }); notify('Upozornění zapnutá', 'Dám vědět na začátku bloků a na konci časovače.', 'test'); }
  };
  const download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const doExport = async () => download(new Blob([JSON.stringify(await exportData(), null, 2)], { type: 'application/json' }), `zivot-export-${today()}.json`);
  const doExportCsv = async () => {
    const rows = (await exportData()).entries;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['kind,day,created_at,data', ...rows.map((r) => [r.kind, r.day, r.created_at, JSON.stringify(r.data)].map(esc).join(','))].join('\n');
    download(new Blob(['﻿' + csv], { type: 'text/csv' }), `zivot-export-${today()}.csv`);
  };

  return html`<${Page} title="Nastavení">
    <${Card} title="Rozvrh podle dne v týdnu">
      <p class="hint">Každý den má výchozí šablonu. Pro konkrétní den ji změníš v plánu dne.</p>
      <div class="weekmap">${[1, 2, 3, 4, 5, 6, 0].map((d) => html`<div class="set-row">
        <span>${DOW[d]}</span>
        <label class="sr" for=${'wm' + d}>Šablona pro ${DOW[d]}</label>
        <select id=${'wm' + d} value=${s.weekMap[d]} onChange=${(e) => { const wm = s.weekMap.slice(); wm[d] = e.target.value; setSettings({ weekMap: wm }); }}>
          ${tpls.map((t) => html`<option value=${t.id}>${t.name}</option>`)}</select></div>`)}</div>
    </${Card}>

    <${Card} title="Šablony dnů">
      <${Chips} options=${tpls.map((t) => ({ key: t.id, label: t.name }))} value=${cur?.id} onChange=${(v) => v && setEdit(v)} />
      ${cur && html`<${TemplateEditor} key=${cur.id} tpl=${cur} onChange=${saveTpl} />`}
      <div class="row between wrap">
        <button class="btn ghost" onClick=${() => { const id = 't' + uuid().slice(0, 6); setSettings({ templates: [...tpls, { id, name: 'Nová šablona', blocks: (cur?.blocks || []).map((b) => ({ ...b, id: 'b' + uuid().slice(0, 8) })) }] }); setEdit(id); }}>Duplikovat jako novou</button>
        ${tpls.length > 1 && html`<${ConfirmDelete} label="Smazat šablonu" onYes=${() => { const rest = tpls.filter((t) => t.id !== cur.id); setSettings({ templates: rest, weekMap: s.weekMap.map((w) => (w === cur.id ? rest[0].id : w)) }); setEdit(rest[0].id); }} />`}
        <${ConfirmDelete} label="Obnovit výchozí šablony" onYes=${() => { setSettings({ templates: DEFAULT_TEMPLATES, weekMap: s.weekMap.map((w) => (DEFAULT_TEMPLATES.some((t) => t.id === w) ? w : 'main')) }); setEdit('main'); }} />
      </div>
      <p class="muted small">Časy po půlnoci (do 4:00) patří ke stejnému dni. Změna šablony neovlivní už odškrtnuté bloky.</p>
    </${Card}>

    <${Card} title="Ranní rutina">
      <ul class="rt-list">${s.routine.map((it, i) => html`<li class="rt-row">
        <label class="sr" for=${'ri' + it.key}>Položka</label>
        <input id=${'ri' + it.key} class="grow" value=${it.label} onBlur=${(e) => e.target.value.trim() && e.target.value !== it.label && setSettings({ routine: s.routine.map((x) => (x.key === it.key ? { ...x, label: e.target.value.trim() } : x)) })} />
        <${Stepper} value=${it.timer || 0} step=${5} min=${0} max=${60} unit="min" onChange=${(v) => setSettings({ routine: s.routine.map((x) => (x.key === it.key ? { ...x, timer: v || undefined } : x)) })} />
        <button class="x" aria-label="Posunout výš" disabled=${i === 0} onClick=${() => { const r = s.routine.slice(); [r[i - 1], r[i]] = [r[i], r[i - 1]]; setSettings({ routine: r }); }}>↑</button>
        <button class="x" aria-label="Odebrat" onClick=${() => setSettings({ routine: s.routine.filter((x) => x.key !== it.key) })}>×</button>
      </li>`)}</ul>
      <form class="quick" onSubmit=${(e) => { e.preventDefault(); if (!newItem.trim()) return; setSettings({ routine: [...s.routine, { key: 'r' + uuid().slice(0, 6), label: newItem.trim() }] }); setNewItem(''); }}>
        <label class="sr" for="rnew">Nová položka</label><input id="rnew" value=${newItem} onInput=${(e) => setNewItem(e.target.value)} placeholder="Nová položka rutiny…" />
        <button class="btn" type="submit">Přidat</button>
      </form>
      <p class="muted small">Minuty = vestavěný časovač u položky (0 = bez časovače).</p>
      <${ConfirmDelete} label="Obnovit výchozí rutinu" onYes=${() => setSettings({ routine: DEFAULT_ROUTINE })} />
    </${Card}>

    <${Card} title="Limity a cíle">
      <div class="set-row"><span>Denní strop hluboké práce</span><${Stepper} value=${s.deepCapMin / 60} step=${0.5} min=${1} max=${10} unit="h" onChange=${(v) => setSettings({ deepCapMin: Math.round(v * 60) })} /></div>
      <div class="set-row"><span>Cíl pitného režimu</span><${Stepper} value=${s.waterGoalMl / 1000} step=${0.25} min=${0.5} max=${6} unit="l" onChange=${(v) => setSettings({ waterGoalMl: Math.round(v * 1000) })} /></div>
      <div class="set-row"><span>Cíl spánku</span><${Stepper} value=${s.sleepGoalH} step=${0.5} min=${5} max=${10} unit="h" onChange=${(v) => setSettings({ sleepGoalH: v })} /></div>
      <div class="set-row"><span>Limit sociálních sítí</span><${Stepper} value=${s.socialLimitMin} step=${5} min=${0} max=${300} unit="min" onChange=${(v) => setSettings({ socialLimitMin: v })} /></div>
    </${Card}>

    <${PushCard} />

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

const PUSH_TYPES = [
  ['blocks', 'Začátek bloku'], ['timer', 'Konec časovače a pauzy'], ['plan', 'Naplánuj zítřek'], ['sleep', 'Zapiš spánek (ráno)'],
  ['water', 'Pitný režim (14:00 a 18:00, jen když chybí)'], ['energy', 'Energie 3× denně'], ['review', 'Týdenní revize (neděle 19:00)'],
];
function PushCard() {
  const store = useStore();
  const s = store.settings;
  const [sub, setSub] = useState(undefined);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { currentSubscription().then((x) => setSub(!!x)); }, [s.push]);
  const on = s.push && sub;
  const run = async (fn) => { setBusy(true); setMsg(null); const e = await fn(); setBusy(false); if (e) setMsg({ ok: false, t: e }); setSub(!!(await currentSubscription())); };
  return html`<${Card} title="Upozornění">
    ${!pushSupported() && isIOS() && !isStandalone()
      ? html`<p class="notice warn">Na iPhonu fungují upozornění jen z aplikace na ploše: Safari → Sdílet → Přidat na plochu, pak ji otevři odtud a vrať se sem.</p>`
      : !pushSupported() ? html`<p class="muted">Tento prohlížeč upozornění nepodporuje.</p>`
      : html`
        <${Check} on=${on} label="Upozornění i se zavřenou aplikací" sub=${on ? 'Zapnuto na tomto zařízení' : 'Zapni na každém zařízení, kde je chceš dostávat'}
          onClick=${() => !busy && run(on ? async () => { await disablePush(); return null; } : enablePush)} />
        ${on && html`
          <div class="checks">${PUSH_TYPES.map(([k, l]) => html`<${Check} on=${s.pushTypes[k]} label=${l} onClick=${() => setSettings({ pushTypes: { ...s.pushTypes, [k]: !s.pushTypes[k] } })} />`)}</div>
          <div class="set-row"><span>Předstih u bloků</span><${Stepper} value=${s.notifyLeadMin} step=${5} min=${0} max=${30} unit="min" onChange=${(v) => setSettings({ notifyLeadMin: v })} /></div>
          <div class="set-row"><label for="planat">Připomenout plán zítřka v</label>
            <input id="planat" type="time" style="width:auto" value=${s.planRemindAt} onChange=${(e) => e.target.value && setSettings({ planRemindAt: e.target.value })} /></div>
          <button class="btn" disabled=${busy} onClick=${() => run(async () => { const e = await testPush(); if (!e) setMsg({ ok: true, t: 'Odesláno. Do minuty by mělo přijít upozornění.' }); return e; })}>Poslat zkušební upozornění</button>`}
        ${msg && html`<p class=${'notice ' + (msg.ok ? 'calm' : 'warn')}>${msg.t}</p>`}
        <p class="muted small">Připomínky se přeskočí, když už je věc hotová (blok odškrtnutý, zítřek naplánovaný, voda vypitá).</p>`}
  </${Card}>`;
}
