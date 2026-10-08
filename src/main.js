import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { html, today, vibrate } from './util.js';
import { useStore, initAuth, sb, setDaily, daily, getState } from './store.js';
import { useRoute, go, takePayload } from './nav.js';
import { TodayPage } from './today.js';
import { TimerPage, useTimer, remainingSec } from './timer.js';
import { RoutinePage, BodyPage, InfluencePage, LeisurePage } from './life.js';
import { ShutdownPage, IdeasPage, ReadingPage, JournalPage, addIdea } from './mind.js';
import { StatsPage } from './stats.js';
import { GoalsPage } from './goals.js';
import { SettingsPage, startNotifier } from './settings.js';
import { Scale } from './ui.js';
import './style.css';


const MODULES = [
  { r: 'dnes', l: 'Dnes', ic: 'sun' },
  { r: 'blok', l: 'Hluboký blok', ic: 'timer' },
  { r: 'rutina', l: 'Ranní rutina', ic: 'dawn' },
  { r: 'telo', l: 'Tělo', ic: 'body' },
  { r: 'ritual', l: 'Rituál ukončení', ic: 'moon' },
  { r: 'napady', l: 'Nápady', ic: 'spark' },
  { r: 'cteni', l: 'Čtení', ic: 'book' },
  { r: 'denik', l: 'Deník', ic: 'pen' },
  { r: 'vlivy', l: 'Vlivy', ic: 'wave' },
  { r: 'volno', l: 'Volný čas', ic: 'leaf' },
  { r: 'statistiky', l: 'Statistiky', ic: 'chart' },
  { r: 'cile', l: 'Cíle', ic: 'target' },
  { r: 'nastaveni', l: 'Nastavení', ic: 'gear' },
];
const ICONS = {
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  timer: 'M12 8v5l3 2M9 2h6M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  dawn: 'M3 18h18M6 18a6 6 0 0 1 12 0M12 4v4M4.9 9.9l1.4 1.4M19.1 9.9l-1.4 1.4',
  body: 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  spark: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8l1.5 2.5L16 12l-2.5 1.5L12 16l-1.5-2.5L8 12l2.5-1.5z',
  book: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z',
  pen: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  wave: 'M2 12c3-5 5-5 8 0s5 5 8 0 3-3 4-2',
  leaf: 'M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l7-7',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 12h.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};
const Icon = ({ n }) => html`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d=${ICONS[n]} /></svg>`;

// ---------- přihlášení ----------
function Auth({ recovery }) {
  const [mode, setMode] = useState(recovery ? 'newpass' : 'in');
  const [email, setEmail] = useState(''), [pw, setPw] = useState('');
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (mode === 'in') {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      } else if (mode === 'up') {
        const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) setMsg({ ok: true, t: 'Účet vytvořen. Potvrď e-mail odkazem, který ti přišel, a pak se přihlas.' });
      } else if (mode === 'reset') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (error) throw error;
        setMsg({ ok: true, t: 'Poslal jsem odkaz pro nastavení nového hesla.' });
      } else if (mode === 'newpass') {
        const { error } = await sb.auth.updateUser({ password: pw });
        if (error) throw error;
        location.hash = '#/dnes'; location.reload();
      }
    } catch (err) {
      const m = String(err.message || err);
      setMsg({ ok: false, t: /Invalid login/i.test(m) ? 'Špatný e-mail nebo heslo.' : /not confirmed/i.test(m) ? 'E-mail ještě není potvrzený. Klikni na odkaz v e-mailu.' : /at least/i.test(m) ? 'Heslo musí mít aspoň 6 znaků.' : /registered/i.test(m) ? 'Tento e-mail už má účet. Přihlas se.' : m });
    } finally { setBusy(false); }
  };
  const titles = { in: 'Přihlášení', up: 'Nový účet', reset: 'Zapomenuté heslo', newpass: 'Nové heslo' };
  return html`<main class="auth">
    <div class="auth-box">
      <div class="brand"><span class="brand-mark"></span>Život</div>
      <h1>${titles[mode]}</h1>
      <form onSubmit=${submit}>
        ${mode !== 'newpass' && html`<div class="field"><label class="lbl" for="aemail">E-mail</label><input id="aemail" type="email" autocomplete="email" required value=${email} onInput=${(e) => setEmail(e.target.value)} /></div>`}
        ${mode !== 'reset' && html`<div class="field"><label class="lbl" for="apw">Heslo</label><input id="apw" type="password" autocomplete=${mode === 'in' ? 'current-password' : 'new-password'} required minlength="6" value=${pw} onInput=${(e) => setPw(e.target.value)} /></div>`}
        ${msg && html`<p class=${'notice ' + (msg.ok ? 'calm' : 'warn')}>${msg.t}</p>`}
        <button class="btn primary big" type="submit" disabled=${busy}>${busy ? 'Moment…' : mode === 'in' ? 'Přihlásit' : mode === 'up' ? 'Vytvořit účet' : mode === 'reset' ? 'Poslat odkaz' : 'Uložit heslo'}</button>
      </form>
      ${mode !== 'newpass' && html`<div class="auth-links">
        ${mode !== 'in' && html`<button class="link" onClick=${() => setMode('in')}>Mám účet</button>`}
        ${mode !== 'up' && html`<button class="link" onClick=${() => setMode('up')}>Vytvořit účet</button>`}
        ${mode === 'in' && html`<button class="link" onClick=${() => setMode('reset')}>Zapomenuté heslo</button>`}
      </div>`}
    </div>
  </main>`;
}

// ---------- rychlý zápis ----------
function Quick({ close }) {
  const [v, setV] = useState('');
  const day = today();
  const j = daily('journal', day);
  const b = daily('body', day);
  const inf = daily('influence', day);
  const [toast, setToast] = useState(null);
  const done = (t) => { vibrate(); setToast(t); setTimeout(() => setToast(null), 1400); };
  useEffect(() => { const f = (e) => e.key === 'Escape' && close(); addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, []);
  return html`<div class="sheet-bg" onClick=${close}>
    <div class="sheet" role="dialog" aria-label="Rychlý zápis" onClick=${(e) => e.stopPropagation()}>
      <div class="sheet-grip"></div>
      <form class="quick" onSubmit=${(e) => { e.preventDefault(); if (!v.trim()) return; addIdea(v.trim()); setV(''); done('Nápad uložen'); }}>
        <label class="sr" for="qidea">Nápad</label>
        <input id="qidea" value=${v} onInput=${(e) => setV(e.target.value)} placeholder="Nápad… (#štítek)" autofocus enterkeyhint="send" />
        <button class="btn primary" type="submit">Uložit</button>
      </form>
      <div class="quick-grid">
        <button class="qbtn" onClick=${() => { setDaily('body', day, { waterMl: (b.waterMl || 0) + 250 }); done('+250 ml vody'); }}><b>+250 ml</b><span>voda · ${((b.waterMl || 0) / 1000).toLocaleString('cs-CZ')} l</span></button>
        <button class="qbtn" onClick=${() => { setDaily('influence', day, { socialMin: (inf.socialMin || 0) + 15 }); done('+15 min sítě'); }}><b>+15 min</b><span>sociální sítě · ${inf.socialMin || 0}</span></button>
        <button class="qbtn" onClick=${() => { close(); go('blok'); }}><b>Blok</b><span>spustit časovač</span></button>
        <button class="qbtn" onClick=${() => { close(); go('ritual'); }}><b>Uzavřít den</b><span>večerní rituál</span></button>
      </div>
      <div class="field"><span class="lbl">Nálada teď</span><${Scale} value=${j.mood} onChange=${(mood) => { setDaily('journal', day, { mood }); done('Nálada zapsána'); }} /></div>
      <div class="field"><span class="lbl">Energie teď</span><${Scale} value=${j.energy} onChange=${(energy) => { setDaily('journal', day, { energy }); done('Energie zapsána'); }} /></div>
      ${toast && html`<div class="toast" role="status">${toast}</div>`}
    </div>
  </div>`;
}

// ---------- shell ----------
function More() {
  return html`<section class="page"><header class="page-h"><h1>Moduly</h1></header>
    <div class="modules">${MODULES.filter((m) => !['dnes', 'blok', 'denik'].includes(m.r)).map((m) => html`<a class="module" href=${'#/' + m.r}><${Icon} n=${m.ic} /><span>${m.l}</span></a>`)}</div>
  </section>`;
}

function App() {
  const store = useStore();
  const route = useRoute();
  const t = useTimer();
  const [quick, setQuick] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [installPrompt, setInstall] = useState(null);
  useEffect(() => {
    const { data } = sb.auth.onAuthStateChange((e) => { if (e === 'PASSWORD_RECOVERY') setRecovery(true); });
    const f = (e) => { e.preventDefault(); setInstall(e); };
    addEventListener('beforeinstallprompt', f);
    return () => { data.subscription.unsubscribe(); removeEventListener('beforeinstallprompt', f); };
  }, []);

  if (store.user === undefined) return html`<div class="splash"></div>`;
  if (!store.user || recovery) return html`<${Auth} recovery=${recovery} />`;
  if (!store.loaded) return html`<div class="splash"><span class="brand-mark"></span></div>`;

  let page;
  switch (route) {
    case 'blok': page = html`<${TimerPage} preset=${takePayload()} />`; break;
    case 'rutina': page = html`<${RoutinePage} />`; break;
    case 'telo': page = html`<${BodyPage} />`; break;
    case 'ritual': page = html`<${ShutdownPage} />`; break;
    case 'napady': page = html`<${IdeasPage} />`; break;
    case 'cteni': page = html`<${ReadingPage} />`; break;
    case 'denik': page = html`<${JournalPage} />`; break;
    case 'vlivy': page = html`<${InfluencePage} />`; break;
    case 'volno': page = html`<${LeisurePage} />`; break;
    case 'statistiky': page = html`<${StatsPage} />`; break;
    case 'cile': page = html`<${GoalsPage} />`; break;
    case 'nastaveni': page = html`<${SettingsPage} installPrompt=${installPrompt} />`; break;
    case 'vice': page = html`<${More} />`; break;
    default: page = html`<${TodayPage} />`;
  }
  const inMore = !['dnes', 'blok', 'denik'].includes(route);
  return html`<div class="app">
    <nav class="side" aria-label="Moduly">
      <div class="brand"><span class="brand-mark"></span>Život</div>
      ${MODULES.map((m) => html`<a href=${'#/' + m.r} class=${route === m.r ? 'on' : ''} aria-current=${route === m.r ? 'page' : null}><${Icon} n=${m.ic} />${m.l}
        ${m.r === 'blok' && t && html`<small class="side-t">●</small>`}</a>`)}
      <button class="btn primary side-quick" onClick=${() => setQuick(true)}><${Icon} n="plus" /> Rychlý zápis</button>
    </nav>
    <main class="main">
      ${(store.error || !store.online) && html`<div class="status">${!store.online ? 'Offline · změny se uloží po připojení' : store.error}</div>`}
      ${page}
    </main>
    <nav class="tabbar" aria-label="Hlavní navigace">
      <a href="#/dnes" class=${route === 'dnes' ? 'on' : ''}><${Icon} n="sun" /><span>Dnes</span></a>
      <a href="#/blok" class=${route === 'blok' ? 'on' : ''}><${Icon} n="timer" /><span>${t ? (remainingSec(t) > 0 ? Math.ceil(remainingSec(t) / 60) + ' min' : 'flow') : 'Blok'}</span></a>
      <button class="tab-plus" aria-label="Rychlý zápis" onClick=${() => { vibrate(); setQuick(true); }}><${Icon} n="plus" /></button>
      <a href="#/denik" class=${route === 'denik' ? 'on' : ''}><${Icon} n="pen" /><span>Deník</span></a>
      <a href="#/vice" class=${inMore ? 'on' : ''}><${Icon} n="more" /><span>Více</span></a>
    </nav>
    ${quick && html`<${Quick} close=${() => setQuick(false)} />`}
  </div>`;
}

getState().user = undefined;
render(html`<${App} />`, document.getElementById('app'));
initAuth();
startNotifier();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
