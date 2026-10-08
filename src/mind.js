import { useEffect, useMemo, useState } from 'preact/hooks';
import { html, today, addDays, fmtDay, fmtDur, vibrate, uuid, parseDay, dayKey } from './util.js';
import { Page, Card, Chips, Scale, QuickAdd, Empty, Check } from './ui.js';
import { daily, setDaily, useStore, all, add, update, remove } from './store.js';
import { dayBlocks, deepMin } from './logic.js';
import { JOURNAL_QUESTIONS, READING_QUESTIONS } from './defaults.js';
import { NoteField, LeisureCheck, DayPicker } from './life.js';

// ---------------- 5) Večerní rituál ukončení ----------------
const STEPS = ['Co je hotovo', 'Co zůstalo otevřené', 'Nápady', 'Plán na zítra', 'Volný čas', 'Uzavřít den'];

export function ShutdownPage() {
  useStore();
  const day = today();
  const s = daily('shutdown', day);
  const [step, setStep] = useState(s.closed ? 5 : 0);
  const set = (p) => setDaily('shutdown', day, p);
  const tomorrow = addDays(day, 1);
  const blocks = dayBlocks(day);
  const log = daily('daylog', day);
  const ideasToday = all('idea').filter((r) => dayKey(new Date(r.created_at)) === dayKey()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [when, setWhen] = useState('Zítra');

  let body;
  if (step === 0) body = html`
    <ul class="rows">
      ${log.mainTask && html`<li><span>Hlavní úkol: ${log.mainTask}</span><span class=${log.mainDone ? 'ok' : 'muted'}>${log.mainDone ? 'hotovo' : 'nehotovo'}</span></li>`}
      <li><span>Hluboká práce</span><span>${fmtDur(deepMin(day))}</span></li>
      ${blocks.filter((b) => b.status === 'done').map((b) => html`<li><span>✓ ${b.title}</span><span class="muted small">${b.goal}</span></li>`)}
      ${blocks.filter((b) => b.status === 'skipped').length > 0 && html`<li class="muted"><span>Vynecháno</span><span>${blocks.filter((b) => b.status === 'skipped').map((b) => b.title).join(', ')}</span></li>`}
    </ul>
    <${NoteField} id="sddone" rows=${3} value=${s.doneNote} placeholder="Co dalšího se dnes povedlo?" onSave=${(doneNote) => set({ doneNote })} />`;
  else if (step === 1) body = html`
    <p class="muted small">Ať to nemusíš držet v hlavě. Ráno se ti ukáže na stránce Dnes.</p>
    <${Chips} options=${['Zítra', 'Tento týden', 'Později']} value=${when} onChange=${(v) => v && setWhen(v)} />
    <${QuickAdd} id="sdopen" placeholder="Co zůstalo otevřené?" onAdd=${(text) => set({ open: [...(s.open || []), { id: uuid(), text, when }] })} />
    ${(s.open || []).length ? html`<ul class="rows">${s.open.map((o) => html`<li><span class="grow">${o.text}</span><span class="muted small">${o.when}</span>
      <button class="x" aria-label="Smazat" onClick=${() => set({ open: s.open.filter((x) => x.id !== o.id) })}>×</button></li>`)}</ul>` : html`<${Empty}>Nic otevřeného? Skvělé.</${Empty}>`}`;
  else if (step === 2) body = html`
    <p class="muted small">Vysyp z hlavy všechno, co tě dnes napadlo.</p>
    <${QuickAdd} id="sdidea" placeholder="Nápad… (#štítek)" onAdd=${(t) => addIdea(t)} />
    ${ideasToday.length > 0 && html`<ul class="rows">${ideasToday.map((r) => html`<li><span>${r.data.text}</span></li>`)}</ul>`}`;
  else if (step === 3) body = html`
    <${TomorrowTask} day=${tomorrow} />
    <${NoteField} id="sdplan" rows=${3} value=${s.planNote} placeholder="Co dalšího zítra? (blok po bloku, schůzky…)" onSave=${(planNote) => set({ planNote })} />`;
  else if (step === 4) body = html`<${LeisureCheck} day=${day} compact />`;
  else body = s.closed
    ? html`<div class="closed"><div class="closed-mark">Den uzavřen</div><p class="muted">v ${new Date(s.closedAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}. Teď už jen odpočinek.</p>
        <button class="btn ghost" onClick=${() => set({ closed: false })}>Otevřít znovu</button></div>`
    : html`<p>Všechno je zapsané. Práce na dnešek končí.</p>
      <button class="btn primary big" onClick=${() => { vibrate([30, 60, 30]); set({ closed: true, closedAt: new Date().toISOString() }); }}>Den uzavřen</button>`;

  return html`<${Page} title="Rituál ukončení" sub=${fmtDay(day, true)}>
    <ol class="steps">${STEPS.map((t, i) => html`<li><button class=${(i === step ? 'on' : '') + (i < step ? ' past' : '')} onClick=${() => setStep(i)} aria-current=${i === step ? 'step' : null}>
      <span>${i + 1}</span><small>${t}</small></button></li>`)}</ol>
    <${Card} title=${STEPS[step]}>${body}</${Card}>
    <div class="row between">
      <button class="btn ghost" disabled=${step === 0} onClick=${() => setStep(step - 1)}>Zpět</button>
      ${step < 5 && html`<button class="btn primary" onClick=${() => setStep(step + 1)}>Další</button>`}
    </div>
  </${Page}>`;
}

function TomorrowTask({ day }) {
  const d = daily('daylog', day);
  const [v, setV] = useState(d.mainTask || '');
  return html`<div class="field"><label class="lbl" for="tmtask">Hlavní úkol na zítra</label>
    <input id="tmtask" value=${v} onInput=${(e) => setV(e.target.value)} onBlur=${() => setDaily('daylog', day, { mainTask: v.trim() })} placeholder="Jedna nejdůležitější věc" /></div>`;
}

// ---------------- 6) Nápady ----------------
export function parseTags(text) {
  const tags = [...text.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1].toLowerCase());
  return { text: text.replace(/\s*#[\p{L}\p{N}_-]+/gu, '').trim() || text, tags: [...new Set(tags)] };
}
export function addIdea(raw) { const p = parseTags(raw); return add('idea', p); }

export function IdeasPage() {
  useStore();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState(null);
  const ideas = all('idea').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const tags = useMemo(() => {
    const m = new Map();
    ideas.forEach((r) => (r.data.tags || []).forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [ideas.length]);
  const ql = q.trim().toLowerCase();
  const shown = ideas.filter((r) => (!tag || (r.data.tags || []).includes(tag)) && (!ql || r.data.text.toLowerCase().includes(ql) || (r.data.tags || []).some((t) => t.includes(ql))));
  return html`<${Page} title="Nápady" sub=${`${ideas.length} uložených`}>
    <${QuickAdd} id="ideaadd" placeholder="Nápad… (štítky přes #)" onAdd=${addIdea} button="Uložit" />
    <div class="field"><label class="sr" for="ideaq">Hledat</label><input id="ideaq" type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Hledat v nápadech…" /></div>
    ${tags.length > 0 && html`<${Chips} options=${tags.map((t) => ({ key: t, label: '#' + t }))} value=${tag} onChange=${setTag} />`}
    ${shown.length ? html`<ul class="ideas">${shown.map((r) => html`<li class="idea">
      <p>${r.data.text}</p>
      <div class="row between"><span class="muted small">${fmtDay(dayKey(new Date(r.created_at)))}${(r.data.tags || []).map((t) => html` <button class="tag" onClick=${() => setTag(t)}>#${t}</button>`)}</span>
      <button class="x" aria-label="Smazat nápad" onClick=${() => remove(r.id)}>×</button></div></li>`)}</ul>`
      : html`<${Empty}>${ideas.length ? 'Nic neodpovídá hledání.' : 'Zapiš první nápad. Štítek přidáš napsáním #slovo.'}</${Empty}>`}
  </${Page}>`;
}

// ---------------- 7) Čtení ----------------
export function ReadingPage() {
  useStore();
  const [openId, setOpenId] = useState(null);
  const books = all('book').sort((a, b) => (a.data.finished ? 1 : 0) - (b.data.finished ? 1 : 0) || b.created_at.localeCompare(a.created_at));
  const [form, setForm] = useState(false);
  const book = books.find((b) => b.id === openId);
  if (book) return html`<${BookDetail} book=${book} onBack=${() => setOpenId(null)} />`;
  return html`<${Page} title="Čtení" action=${html`<button class="btn sm" onClick=${() => setForm(!form)}>${form ? 'Zavřít' : '+ Kniha'}</button>`}>
    ${form && html`<${NewBook} onDone=${(id) => { setForm(false); setOpenId(id); }} />`}
    ${books.length ? html`<ul class="books">${books.map((b) => {
      const ch = b.data.chapters || [];
      const read = ch.filter((c) => c.read).length;
      const next = ch.find((c) => !c.read);
      return html`<li><button class="book" onClick=${() => setOpenId(b.id)}>
        <span class="b-title">${b.data.title}</span>
        <span class="muted small">${b.data.author || ''}</span>
        <div class="prog"><i style=${`width:${ch.length ? (read / ch.length) * 100 : 0}%`}></i></div>
        <span class="small muted">${read}/${ch.length} kapitol${next?.plan ? ` · další ${fmtDay(next.plan)}` : ''}${b.data.finished ? ' · dočteno' : ''}</span>
      </button></li>`;
    })}</ul>` : !form && html`<${Empty}>Přidej knihu, kterou čteš. Rozplánuju ti ji po kapitolách.</${Empty}>`}
  </${Page}>`;
}

function NewBook({ onDone }) {
  const [t, setT] = useState(''), [a, setA] = useState(''), [n, setN] = useState(12), [pace, setPace] = useState(2), [start, setStart] = useState(today());
  const submit = (e) => {
    e.preventDefault(); if (!t.trim()) return;
    const chapters = Array.from({ length: Math.max(1, n) }, (_, i) => ({ n: i + 1, title: '', plan: addDays(start, Math.floor(i * (7 / pace))), read: false, note: '', answers: {} }));
    const r = add('book', { title: t.trim(), author: a.trim(), pace, chapters });
    onDone(r.id);
  };
  return html`<form class="card" onSubmit=${submit}>
    <div class="field"><label class="lbl" for="bt">Název</label><input id="bt" value=${t} onInput=${(e) => setT(e.target.value)} required /></div>
    <div class="field"><label class="lbl" for="ba">Autor</label><input id="ba" value=${a} onInput=${(e) => setA(e.target.value)} /></div>
    <div class="grid2">
      <div class="field"><label class="lbl" for="bn">Počet kapitol</label><input id="bn" type="number" min="1" max="200" value=${n} onInput=${(e) => setN(+e.target.value)} /></div>
      <div class="field"><label class="lbl" for="bs">Začátek</label><input id="bs" type="date" value=${start} onInput=${(e) => setStart(e.target.value)} /></div>
    </div>
    <div class="field"><span class="lbl">Tempo</span><${Chips} options=${[1, 2, 3, 5, 7].map((k) => ({ key: k, label: `${k}× týdně` }))} value=${pace} onChange=${(v) => v && setPace(v)} /></div>
    <button class="btn primary" type="submit">Vytvořit plán</button>
  </form>`;
}

function BookDetail({ book, onBack }) {
  const [open, setOpen] = useState(null);
  const ch = book.data.chapters || [];
  const setCh = (i, p) => update(book.id, (d) => ({ ...d, chapters: d.chapters.map((c, j) => (j === i ? { ...c, ...p } : c)) }));
  const read = ch.filter((c) => c.read).length;
  return html`<${Page} title=${book.data.title} sub=${`${book.data.author ? book.data.author + ' · ' : ''}${read}/${ch.length} kapitol`}
      action=${html`<button class="btn sm ghost" onClick=${onBack}>‹ Knihy</button>`}>
    <ul class="chapters">${ch.map((c, i) => html`<li class=${c.read ? 'read' : ''}>
      <div class="ch-row">
        <button class="ch-check" aria-pressed=${c.read} aria-label=${`Kapitola ${c.n} přečtena`} onClick=${() => { vibrate(); setCh(i, { read: !c.read, readAt: !c.read ? today() : null }); }}></button>
        <button class="ch-main" onClick=${() => setOpen(open === i ? null : i)} aria-expanded=${open === i}>
          <span>Kapitola ${c.n}${c.title ? ' · ' + c.title : ''}</span>
          <span class=${'small ' + (!c.read && c.plan < today() ? 'late' : 'muted')}>${c.read ? 'přečteno' : c.plan ? fmtDay(c.plan) : ''}${(c.note || Object.values(c.answers || {}).some(Boolean)) ? ' · ✎' : ''}</span>
        </button>
      </div>
      ${open === i && html`<div class="ch-edit">
        <div class="field"><label class="lbl" for=${'ct' + i}>Název kapitoly</label><input id=${'ct' + i} value=${c.title} onBlur=${(e) => setCh(i, { title: e.target.value })} /></div>
        <div class="field"><label class="lbl" for=${'cp' + i}>Plán</label><input id=${'cp' + i} type="date" value=${c.plan} onChange=${(e) => setCh(i, { plan: e.target.value })} /></div>
        <${NoteField} id=${'cn' + i} rows=${3} value=${c.note} placeholder="Poznámky ke kapitole…" onSave=${(note) => setCh(i, { note })} />
        ${READING_QUESTIONS.map((q, k) => html`<${NoteField} id=${`cq${i}_${k}`} value=${c.answers?.[k]} placeholder=${q} onSave=${(v) => setCh(i, { answers: { ...(c.answers || {}), [k]: v } })} />`)}
      </div>`}
    </li>`)}</ul>
    <div class="row between">
      <button class="btn ghost" onClick=${() => update(book.id, (d) => ({ ...d, chapters: [...d.chapters, { n: d.chapters.length + 1, title: '', plan: '', read: false, note: '', answers: {} }] }))}>+ Kapitola</button>
      <button class="btn ghost" onClick=${() => update(book.id, { finished: !book.data.finished })}>${book.data.finished ? 'Čtu dál' : 'Dočteno'}</button>
      <${ConfirmDelete} onYes=${() => { remove(book.id); onBack(); }} label="Smazat knihu" />
    </div>
  </${Page}>`;
}

export function ConfirmDelete({ onYes, label = 'Smazat' }) {
  const [c, setC] = useState(false);
  useEffect(() => { if (!c) return; const t = setTimeout(() => setC(false), 4000); return () => clearTimeout(t); }, [c]);
  return c ? html`<button class="btn danger" onClick=${onYes}>Opravdu smazat</button>` : html`<button class="btn ghost" onClick=${() => setC(true)}>${label}</button>`;
}

// ---------------- 8) Deník ----------------
export function questionFor(day) {
  const d = parseDay(day);
  const n = Math.floor(d.getTime() / 864e5);
  return JOURNAL_QUESTIONS[((n % JOURNAL_QUESTIONS.length) + JOURNAL_QUESTIONS.length) % JOURNAL_QUESTIONS.length];
}
export function JournalPage() {
  useStore();
  const [day, setDay] = useState(today());
  const j = daily('journal', day);
  const set = (p) => setDaily('journal', day, p);
  const q = questionFor(day);
  const looks = [[7, 'Před týdnem'], [30, 'Před měsícem'], [365, 'Před rokem']]
    .map(([n, l]) => [l, addDays(day, -n), daily('journal', addDays(day, -n))]).filter(([, , e]) => e.text || e.answer || e.mood);
  const recent = all('journal').filter((r) => r.day < day).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 10);
  return html`<${Page} title="Deník" action=${html`<${DayPicker} day=${day} setDay=${setDay} />`}>
    <${Card}>
      <div class="field"><span class="lbl">Nálada</span><${Scale} value=${j.mood} onChange=${(mood) => set({ mood })} labels=${['těžká', 'horší', 'neutrální', 'dobrá', 'skvělá']} /></div>
      <div class="field"><span class="lbl">Energie</span><${Scale} value=${j.energy} onChange=${(energy) => set({ energy })} labels=${['vyčerpaný', 'unavený', 'ok', 'svěží', 'plný energie']} /></div>
      <${NoteField} id="jtext" rows=${4} value=${j.text} placeholder="Krátký zápis o dni…" onSave=${(text) => set({ text })} />
    </${Card}>
    <${Card} title="Otázka dne"><p class="question">${q}</p>
      <${NoteField} id="jans" rows=${3} value=${j.answer} placeholder="Odpověď…" onSave=${(answer) => set({ answer, question: q })} /></${Card}>
    ${looks.length > 0 && html`<${Card} title="Zpětný pohled">${looks.map(([l, d, e]) => html`<div class="look">
      <span class="lbl">${l} · ${fmtDay(d)}${e.mood ? ` · nálada ${e.mood}` : ''}</span>${e.text && html`<p>${e.text}</p>`}
      ${e.answer && html`<p class="muted"><i>${e.question || ''}</i> ${e.answer}</p>`}</div>`)}</${Card}>`}
    ${recent.length > 0 && html`<${Card} title="Starší zápisy"><ul class="rows col">${recent.map((r) => html`<li>
      <button class="link-row" onClick=${() => setDay(r.day)}><span class="lbl">${fmtDay(r.day)}${r.data.mood ? ` · nálada ${r.data.mood}` : ''}${r.data.energy ? ` · energie ${r.data.energy}` : ''}</span>
      <span class="clip">${r.data.text || r.data.answer || ''}</span></button></li>`)}</ul></${Card}>`}
  </${Page}>`;
}
