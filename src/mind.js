import { useEffect, useMemo, useState } from 'preact/hooks';
import { html, today, addDays, fmtDay, fmtDur, vibrate, parseDay, dayKey, fromMin, DOW_S } from './util.js';
import { Page, Card, Chips, Scale, QuickAdd, Empty } from './ui.js';
import { daily, setDaily, useStore, all, add, update, remove } from './store.js';
import { dayBlocks, deepMin, tasksFor, toggleTask, moveTask, addTask, templates, templateIdFor, planCheck, streak } from './logic.js';
import { JOURNAL_QUESTIONS, READING_QUESTIONS, GRATITUDE_SLOTS } from './defaults.js';
import { NoteField, LeisureCheck, DayPicker } from './life.js';
import { DayTasks } from './tasks.js';
import { LazyInput } from './plan.js';
import { go } from './nav.js';

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
  const tLog = daily('daylog', tomorrow);
  const tasks = tasksFor(day);
  const ideasToday = all('idea').filter((r) => dayKey(new Date(r.created_at)) === dayKey()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [target, setTarget] = useState('tomorrow');
  const tChk = planCheck(tomorrow);
  const bed = blocks.find((b) => b.type === 'sleep');

  let body;
  if (step === 0) body = html`
    <ul class="rows">
      ${log.mainTask && html`<li><span>Hlavní úkol: ${log.mainTask}</span><span class=${log.mainDone ? 'ok' : 'muted'}>${log.mainDone ? 'hotovo' : 'nehotovo'}</span></li>`}
      <li><span>Hluboká práce</span><span>${fmtDur(deepMin(day))}</span></li>
      <li><span>Úkoly</span><span>${tasks.filter((t) => t.data.done).length}/${tasks.length}</span></li>
      ${blocks.filter((b) => b.status === 'done').map((b) => html`<li><span>✓ ${b.title}</span><span class="muted small">${b.goal}</span></li>`)}
      ${blocks.filter((b) => b.status === 'skipped').length > 0 && html`<li class="muted"><span>Vynecháno</span><span>${blocks.filter((b) => b.status === 'skipped').map((b) => b.title).join(', ')}</span></li>`}
    </ul>
    <div class="field"><span class="lbl">Jak se den povedl?</span><${Scale} value=${s.score} onChange=${(score) => set({ score })} labels=${['špatně', 'slabě', 'ok', 'dobře', 'výborně']} /></div>
    <${NoteField} id="sddone" rows=${3} value=${s.doneNote} placeholder="Co dalšího se dnes povedlo?" onSave=${(doneNote) => set({ doneNote })} />`;
  else if (step === 1) {
    const open = tasks.filter((t) => !t.data.done);
    body = html`
    <p class="muted small">Ať to nemusíš držet v hlavě. Každá otevřená věc dostane místo.</p>
    ${open.length ? html`<ul class="tasks">${open.map((t) => html`<li class="task"><div class="task-row">
        <button class="tick-btn" aria-label="Hotovo" onClick=${() => toggleTask(t)}></button>
        <span class="task-text static"><span>${t.data.text}</span></span></div>
        <div class="row wrap task-quick"><button class="btn sm" onClick=${() => moveTask(t, tomorrow)}>Zítra</button><button class="btn sm" onClick=${() => moveTask(t, null)}>Zásobník</button></div></li>`)}</ul>`
      : html`<p class="done-msg">Všechny dnešní úkoly mají místo.</p>`}
    <${Chips} options=${[{ key: 'tomorrow', label: 'Na zítra' }, { key: 'backlog', label: 'Do zásobníku' }]} value=${target} onChange=${(v) => v && setTarget(v)} />
    <${QuickAdd} id="sdopen" placeholder="Co dalšího zůstalo otevřené?" onAdd=${(text) => addTask(text, target === 'tomorrow' ? tomorrow : null)} />`;
  } else if (step === 2) body = html`
    <p class="muted small">Vysyp z hlavy všechno, co tě dnes napadlo.</p>
    <${QuickAdd} id="sdidea" placeholder="Nápad… (#štítek)" onAdd=${(t) => addIdea(t)} />
    ${ideasToday.length > 0 && html`<ul class="rows">${ideasToday.map((r) => html`<li><span>${r.data.text}</span></li>`)}</ul>`}`;
  else if (step === 3) body = html`
    <div class="field"><span class="lbl">Typ zítřka</span>
      <${Chips} options=${templates().map((x) => ({ key: x.id, label: x.name }))} value=${templateIdFor(tomorrow)} onChange=${(v) => v && setDaily('daylog', tomorrow, { template: v })} /></div>
    <div class="field"><label class="lbl" for="tmtask">Hlavní úkol na zítra</label>
      <${LazyInput} id="tmtask" value=${tLog.mainTask} onSave=${(mainTask) => setDaily('daylog', tomorrow, { mainTask })} placeholder="Jedna nejdůležitější věc" /></div>
    <${DayTasks} day=${tomorrow} blocks=${tChk.blocks} title="Úkoly na zítra" />
    <div class="mini-tl">${tChk.blocks.filter((b) => b.type !== 'sleep').map((b) => html`<div><span class="mono">${fromMin(b.start)}</span><span>${b.title}${b.goal ? html` <small class="muted">· ${b.goal}</small>` : ''}</span></div>`)}</div>
    <div class="row wrap">
      <button class="btn" onClick=${() => go('zitra')}>Detailní plán (časy, cíle bloků) ›</button>
      ${!tLog.planned && html`<button class="btn primary" onClick=${() => setDaily('daylog', tomorrow, { planned: true, plannedAt: new Date().toISOString() })}>Plán je hotový</button>`}
      ${tLog.planned && html`<span class="ok">Zítřek naplánován ✓</span>`}
    </div>`;
  else if (step === 4) body = html`<${LeisureCheck} day=${day} compact />`;
  else body = s.closed
    ? html`<div class="closed"><div class="closed-mark">Den uzavřen</div><p class="muted">v ${new Date(s.closedAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}. Teď už jen odpočinek.</p>
        ${bed && tChk.wake != null && html`<p>Spánek v ${fromMin(bed.start)}, zítra vstáváš v ${fromMin(tChk.wake)}.</p>`}
        <button class="btn ghost" onClick=${() => set({ closed: false })}>Otevřít znovu</button></div>`
    : html`<p>Všechno je zapsané. Práce na dnešek končí.</p>
      ${bed && tChk.wake != null && html`<p class="muted">Spánek v ${fromMin(bed.start)} · zítra vstáváš v ${fromMin(tChk.wake)}${tChk.sleepH ? ` (${tChk.sleepH.toFixed(1)} h spánku)` : ''}.</p>`}
      ${!tLog.planned && html`<p class="notice warn">Zítřek ještě není naplánovaný. <button class="link" onClick=${() => setStep(3)}>Naplánovat</button></p>`}
      <button class="btn primary big" onClick=${() => { vibrate([30, 60, 30]); set({ closed: true, closedAt: new Date().toISOString() });
        if (!daily('body', tomorrow).sleep?.bed) { const n = new Date(); const est = Math.max(n.getHours() * 60 + n.getMinutes() + (n.getHours() < 4 ? 1440 : 0) + 20, bed ? bed.start : 0); setDaily('body', tomorrow, (x) => ({ ...x, sleep: { ...(x.sleep || {}), bed: fromMin(est), bedEst: true } })); }
      }}>Den uzavřen</button>`;

  return html`<${Page} title="Rituál ukončení" sub=${`${fmtDay(day, true)} · série ${streak('shutdown')}`}>
    <ol class="steps">${STEPS.map((t, i) => html`<li><button class=${(i === step ? 'on' : '') + (i < step ? ' past' : '')} onClick=${() => setStep(i)} aria-current=${i === step ? 'step' : null}>
      <span>${i + 1}</span><small>${t}</small></button></li>`)}</ol>
    <${Card} title=${STEPS[step]}>${body}</${Card}>
    <div class="row between">
      <button class="btn ghost" disabled=${step === 0} onClick=${() => setStep(step - 1)}>Zpět</button>
      ${step < 5 && html`<button class="btn primary" onClick=${() => setStep(step + 1)}>Další</button>`}
    </div>
  </${Page}>`;
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
  const [arch, setArch] = useState(false);
  const [open, setOpen] = useState(null);
  const ideas = all('idea').sort((a, b) => ((b.data.pin ? 1 : 0) - (a.data.pin ? 1 : 0)) || b.created_at.localeCompare(a.created_at));
  const live = ideas.filter((r) => !!r.data.archived === arch);
  const tags = useMemo(() => {
    const m = new Map();
    ideas.forEach((r) => (r.data.tags || []).forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [ideas.length]);
  const ql = q.trim().toLowerCase();
  const shown = live.filter((r) => (!tag || (r.data.tags || []).includes(tag)) && (!ql || r.data.text.toLowerCase().includes(ql) || (r.data.tags || []).some((t) => t.includes(ql))));
  const tm = addDays(today(), 1);
  return html`<${Page} title="Nápady" sub=${`${ideas.filter((r) => !r.data.archived).length} aktivních`}
      action=${html`<button class="btn sm ghost" onClick=${() => setArch(!arch)}>${arch ? 'Aktivní' : 'Archiv'}</button>`}>
    ${!arch && html`<${QuickAdd} id="ideaadd" placeholder="Nápad… (štítky přes #)" onAdd=${addIdea} button="Uložit" />`}
    <div class="field"><label class="sr" for="ideaq">Hledat</label><input id="ideaq" type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Hledat v nápadech…" /></div>
    ${tags.length > 0 && html`<${Chips} options=${tags.map((t) => ({ key: t, label: '#' + t }))} value=${tag} onChange=${setTag} />`}
    ${shown.length ? html`<ul class="ideas">${shown.map((r) => html`<li class=${'idea' + (r.data.pin ? ' pinned' : '')}>
      <button class="idea-body" onClick=${() => setOpen(open === r.id ? null : r.id)} aria-expanded=${open === r.id}><p>${r.data.pin ? '📌 ' : ''}${r.data.text}</p></button>
      <div class="row between"><span class="muted small">${fmtDay(dayKey(new Date(r.created_at)))}${(r.data.tags || []).map((t) => html` <button class="tag" onClick=${() => setTag(t)}>#${t}</button>`)}${r.data.taskId ? ' · → úkol' : ''}</span>
        <button class=${'star' + (r.data.pin ? ' on' : '')} aria-label="Připnout" onClick=${() => update(r.id, { pin: !r.data.pin })}>★</button></div>
      ${open === r.id && html`<div class="row wrap">
        <button class="btn sm" onClick=${() => { const t = addTask(r.data.text, tm); update(r.id, { taskId: t.id, archived: true }); setOpen(null); vibrate(); }}>Udělat zítra</button>
        <button class="btn sm" onClick=${() => { const t = addTask(r.data.text, null); update(r.id, { taskId: t.id, archived: true }); setOpen(null); }}>Do zásobníku úkolů</button>
        <button class="btn sm" onClick=${() => update(r.id, { archived: !r.data.archived })}>${r.data.archived ? 'Obnovit' : 'Archivovat'}</button>
        <button class="btn sm ghost" onClick=${() => remove(r.id)}>Smazat</button>
      </div>`}
    </li>`)}</ul>`
      : html`<${Empty}>${ideas.length ? (arch ? 'Archiv je prázdný.' : 'Nic neodpovídá hledání.') : 'Zapiš první nápad. Štítek přidáš napsáním #slovo.'}</${Empty}>`}
  </${Page}>`;
}

// ---------------- 7) Čtení ----------------
export function ReadingPage() {
  useStore();
  const [openId, setOpenId] = useState(null);
  const books = all('book').sort((a, b) => (a.data.finished ? 1 : 0) - (b.data.finished ? 1 : 0) || b.created_at.localeCompare(a.created_at));
  const [form, setForm] = useState(false);
  const book = books.find((b) => b.id === openId);
  const t = today();
  if (book) return html`<${BookDetail} book=${book} onBack=${() => setOpenId(null)} />`;
  const s = streak('read');
  return html`<${Page} title="Čtení" sub=${books.length ? `série ${s} ${s === 1 ? 'den' : s > 1 && s < 5 ? 'dny' : 'dní'}` : ''} action=${html`<button class="btn sm" onClick=${() => setForm(!form)}>${form ? 'Zavřít' : '+ Kniha'}</button>`}>
    ${form && html`<${NewBook} onDone=${(id) => { setForm(false); setOpenId(id); }} />`}
    ${books.length ? html`<ul class="books">${books.map((b) => {
      const ch = b.data.chapters || [];
      const read = ch.filter((c) => c.read).length;
      const next = ch.find((c) => !c.read);
      const behind = ch.filter((c) => !c.read && c.plan && c.plan < t).length;
      return html`<li><div class="book">
        <button class="book-main" onClick=${() => setOpenId(b.id)}>
          <span class="b-title">${b.data.title}</span>
          <span class="muted small">${b.data.author || ''}</span>
          <div class="prog"><i style=${`width:${ch.length ? (read / ch.length) * 100 : 0}%`}></i></div>
          <span class=${'small ' + (behind ? 'late' : 'muted')}>${read}/${ch.length} kapitol${next?.plan ? ` · další ${next.plan === t ? 'dnes' : fmtDay(next.plan)}` : ''}${behind ? ` · ${behind} pozadu` : ''}${b.data.finished ? ' · dočteno' : ''}</span>
        </button>
        ${next && !b.data.finished && html`<button class="btn sm" onClick=${() => { vibrate(); update(b.id, (d) => ({ ...d, chapters: d.chapters.map((c) => (c === d.chapters.find((x) => !x.read) ? { ...c, read: true, readAt: t } : c)) })); }}>Kapitola ${next.n} přečtena</button>`}
      </div></li>`;
    })}</ul>` : !form && html`<${Empty}>Přidej knihu, kterou čteš. Rozplánuju ti ji po kapitolách.</${Empty}>`}
  </${Page}>`;
}

function planChapters(chapters, start, pace) {
  let k = 0;
  return chapters.map((c) => (c.read ? c : { ...c, plan: addDays(start, Math.floor(k++ * (7 / pace))) }));
}

function NewBook({ onDone }) {
  const [t, setT] = useState(''), [a, setA] = useState(''), [n, setN] = useState(12), [pace, setPace] = useState(2), [start, setStart] = useState(today());
  const submit = (e) => {
    e.preventDefault(); if (!t.trim()) return;
    const chapters = planChapters(Array.from({ length: Math.max(1, n) }, (_, i) => ({ n: i + 1, title: '', plan: '', read: false, note: '', answers: {} })), start, pace);
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
    <p class="hint">Dočteš zhruba ${fmtDay(addDays(start, Math.floor((Math.max(1, n) - 1) * (7 / pace))))}.</p>
    <button class="btn primary" type="submit">Vytvořit plán</button>
  </form>`;
}

function BookDetail({ book, onBack }) {
  const [open, setOpen] = useState(null);
  const ch = book.data.chapters || [];
  const setCh = (i, p) => update(book.id, (d) => ({ ...d, chapters: d.chapters.map((c, j) => (j === i ? { ...c, ...p } : c)) }));
  const read = ch.filter((c) => c.read).length;
  const t = today();
  const behind = ch.filter((c) => !c.read && c.plan && c.plan < t).length;
  const pace = book.data.pace || 2;
  return html`<${Page} title=${book.data.title} sub=${`${book.data.author ? book.data.author + ' · ' : ''}${read}/${ch.length} kapitol · ${pace}× týdně`}
      action=${html`<button class="btn sm ghost" onClick=${onBack}>‹ Knihy</button>`}>
    ${behind > 0 && html`<div class="notice warn">${behind} ${behind === 1 ? 'kapitola je' : 'kapitol je'} po plánu.
      <button class="link" onClick=${() => update(book.id, (d) => ({ ...d, chapters: planChapters(d.chapters, t, pace) }))}>Přeplánovat zbytek od dneška</button></div>`}
    <div class="field"><span class="lbl">Tempo</span><${Chips} options=${[1, 2, 3, 5, 7].map((k) => ({ key: k, label: `${k}× týdně` }))} value=${pace}
      onChange=${(v) => v && update(book.id, (d) => ({ ...d, pace: v, chapters: planChapters(d.chapters, t, v) }))} /></div>
    <ul class="chapters">${ch.map((c, i) => html`<li class=${c.read ? 'read' : ''}>
      <div class="ch-row">
        <button class="ch-check" aria-pressed=${c.read} aria-label=${`Kapitola ${c.n} přečtena`} onClick=${() => { vibrate(); setCh(i, { read: !c.read, readAt: !c.read ? t : null }); }}></button>
        <button class="ch-main" onClick=${() => setOpen(open === i ? null : i)} aria-expanded=${open === i}>
          <span>Kapitola ${c.n}${c.title ? ' · ' + c.title : ''}</span>
          <span class=${'small ' + (!c.read && c.plan && c.plan < t ? 'late' : 'muted')}>${c.read ? (c.readAt ? 'přečteno ' + fmtDay(c.readAt) : 'přečteno') : c.plan ? (c.plan === t ? 'dnes' : fmtDay(c.plan)) : ''}${(c.note || Object.values(c.answers || {}).some(Boolean)) ? ' · ✎' : ''}</span>
        </button>
      </div>
      ${open === i && html`<div class="ch-edit">
        <div class="field"><label class="lbl" for=${'ct' + i}>Název kapitoly</label><input id=${'ct' + i} value=${c.title} onBlur=${(e) => setCh(i, { title: e.target.value })} /></div>
        <div class="field"><label class="lbl" for=${'cp' + i}>Plán</label><input id=${'cp' + i} type="date" value=${c.plan} onChange=${(e) => setCh(i, { plan: e.target.value })} /></div>
        <${NoteField} id=${'cn' + i} rows=${3} value=${c.note} placeholder="Hlavní myšlenky kapitoly…" onSave=${(note) => setCh(i, { note })} />
        ${READING_QUESTIONS.map((q, k) => html`<${NoteField} id=${`cq${i}_${k}`} value=${c.answers?.[k]} placeholder=${q} onSave=${(v) => setCh(i, { answers: { ...(c.answers || {}), [k]: v } })} />`)}
      </div>`}
    </li>`)}</ul>
    <div class="row between wrap">
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

function MoodCalendar({ setDay }) {
  const t = today();
  const days = Array.from({ length: 35 }, (_, i) => addDays(t, i - 34));
  return html`<div class="moodcal">
    ${['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((d) => html`<span class="mc-h">${d}</span>`)}
    ${Array.from({ length: (parseDay(days[0]).getDay() + 6) % 7 }, () => html`<span></span>`)}
    ${days.map((d) => { const m = daily('journal', d).mood; return html`<button class=${'mc' + (m ? ' m' + m : '') + (d === t ? ' t' : '')} title=${`${fmtDay(d)}${m ? ' · nálada ' + m : ''}`} aria-label=${fmtDay(d)} onClick=${() => setDay(d)}></button>`; })}
  </div>`;
}

export function JournalPage() {
  useStore();
  const [day, setDay] = useState(today());
  const [q, setQ] = useState('');
  const j = daily('journal', day);
  const set = (p) => setDaily('journal', day, p);
  const question = questionFor(day);
  const grat = j.gratitude || [];
  const looks = [[7, 'Před týdnem'], [30, 'Před měsícem'], [365, 'Před rokem']]
    .map(([n, l]) => [l, addDays(day, -n), daily('journal', addDays(day, -n))]).filter(([, , e]) => e.text || e.answer || e.mood);
  const ql = q.trim().toLowerCase();
  const entries = all('journal').filter((r) => r.day !== day).sort((a, b) => b.day.localeCompare(a.day));
  const found = ql ? entries.filter((r) => [r.data.text, r.data.answer, ...(r.data.gratitude || [])].some((x) => x && x.toLowerCase().includes(ql))) : entries.filter((r) => r.day < day).slice(0, 8);
  const moods = Array.from({ length: 7 }, (_, i) => daily('journal', addDays(today(), -i)).mood).filter(Boolean);
  return html`<${Page} title="Deník" sub=${moods.length ? `nálada 7 dní ⌀ ${(moods.reduce((a, b) => a + b, 0) / moods.length).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}` : ''} action=${html`<${DayPicker} day=${day} setDay=${setDay} />`}>
    <${Card}>
      <div class="field"><span class="lbl">Nálada</span><${Scale} value=${j.mood} onChange=${(mood) => set({ mood })} labels=${['těžká', 'horší', 'neutrální', 'dobrá', 'skvělá']} /></div>
      <div class="field"><span class="lbl">Energie</span><${Scale} value=${j.energy} onChange=${(energy) => set({ energy })} labels=${['vyčerpaný', 'unavený', 'ok', 'svěží', 'plný energie']} /></div>
      <${NoteField} id=${'jtext' + day} rows=${4} value=${j.text} placeholder="Krátký zápis o dni…" onSave=${(text) => set({ text })} />
    </${Card}>
    <${Card} title="Vděčnost">
      ${Array.from({ length: GRATITUDE_SLOTS }, (_, i) => html`<div class="grat"><span class="mono muted">${i + 1}</span>
        <${LazyInput} id=${`gr${day}_${i}`} value=${grat[i]} placeholder=${['Za co jsem dnes vděčný…', 'Co hezkého se stalo…', 'Kdo mi udělal radost…'][i] || 'Další…'}
          onSave=${(v) => set({ gratitude: Array.from({ length: GRATITUDE_SLOTS }, (_, k) => (k === i ? v : grat[k] || '')) })} /></div>`)}
    </${Card}>
    <${Card} title="Otázka dne"><p class="question">${question}</p>
      <${NoteField} id=${'jans' + day} rows=${3} value=${j.answer} placeholder="Odpověď…" onSave=${(answer) => set({ answer, question })} /></${Card}>
    <${Card} title="Nálada za 5 týdnů"><${MoodCalendar} setDay=${setDay} /></${Card}>
    ${looks.length > 0 && html`<${Card} title="Zpětný pohled">${looks.map(([l, d, e]) => html`<div class="look">
      <span class="lbl">${l} · ${fmtDay(d)}${e.mood ? ` · nálada ${e.mood}` : ''}</span>${e.text && html`<p>${e.text}</p>`}
      ${e.answer && html`<p class="muted"><i>${e.question || ''}</i> ${e.answer}</p>`}</div>`)}</${Card}>`}
    <${Card} title=${ql ? `Nalezeno ${found.length}` : 'Starší zápisy'}>
      <label class="sr" for="jq">Hledat v deníku</label>
      <input id="jq" type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Hledat v deníku…" />
      ${found.length > 0 && html`<ul class="rows col">${found.map((r) => html`<li>
        <button class="link-row" onClick=${() => { setDay(r.day); setQ(''); window.scrollTo(0, 0); }}><span class="lbl">${fmtDay(r.day)}${r.data.mood ? ` · nálada ${r.data.mood}` : ''}${r.data.energy ? ` · energie ${r.data.energy}` : ''}</span>
        <span class="clip">${r.data.text || r.data.answer || (r.data.gratitude || []).filter(Boolean).join(', ')}</span></button></li>`)}</ul>`}
    </${Card}>
  </${Page}>`;
}
