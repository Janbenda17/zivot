const mem = {};
globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => mem[k] = String(v), removeItem: k => delete mem[k] };
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };
globalThis.location = { hash: '#/dnes', origin: 'http://x', protocol: 'http:' };
globalThis.matchMedia = () => ({ matches: false });
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const root = new URL('../src/', import.meta.url).href;
const { render } = await import('preact-render-to-string');
const { html, today, addDays } = await import(root + 'util.js');
const S = await import(root + 'store.js');
const st = S.getState(); st.user = { id: 'u1', email: 'a@b.cz' }; st.loaded = true;
const d = today();
// sample data
S.setDaily('daylog', d, { mainTask: 'Napsat kapitolu', split: { b1015: true } });
S.setDaily('body', d, { waterMl: 1000, sleep: { bed: '23:50', wake: '07:40', q: 4 }, gym: { done: true, type: 'Síla', min: 60 } });
S.setDaily('journal', d, { mood: 4, energy: 3, text: 'ok' });
S.setDaily('journal', addDays(d, -7), { mood: 3, text: 'minule' });
S.setDaily('influence', d, { socialMin: 20 });
S.setDaily('routine', d, { shower: true });
S.setDaily('shutdown', addDays(d, -1), { open: [{ id: 'o1', text: 'Email', when: 'Zítra' }] });
for (let i = 0; i < 10; i++) { const dd = addDays(d, -i); S.add('deep_block', { type: 'work', actualMin: 60 + i * 5, quality: 1 + (i % 5), interruptions: 1 }, dd); S.setDaily('body', dd, { sleep: { bed: '23:00', wake: i % 2 ? '07:00' : '06:00' }, gym: { done: i % 2 === 0 } }); S.setDaily('journal', dd, { mood: 1 + (i % 5) }); }
S.add('idea', { text: 'Test', tags: ['app'] });
S.add('book', { title: 'Kniha', chapters: [{ n: 1, plan: d, read: false, answers: {} }] });
S.add('goal', { horizon: 'long', title: 'Dlouhý', why: 'proto' });
S.add('goal', { horizon: 'week', title: 'Gym', habit: 'gym', target: 4, period: (await import(root+'util.js')).weekStart(d) });
S.add('leisure_idea', { text: 'Výlet' });
S.add('influence_item', { text: 'Podcast', sign: '+' });
const pages = {
  today: (await import(root + 'today.js')).TodayPage,
  timer: (await import(root + 'timer.js')).TimerPage,
  routine: (await import(root + 'life.js')).RoutinePage,
  body: (await import(root + 'life.js')).BodyPage,
  infl: (await import(root + 'life.js')).InfluencePage,
  leis: (await import(root + 'life.js')).LeisurePage,
  shut: (await import(root + 'mind.js')).ShutdownPage,
  ideas: (await import(root + 'mind.js')).IdeasPage,
  read: (await import(root + 'mind.js')).ReadingPage,
  journal: (await import(root + 'mind.js')).JournalPage,
  stats: (await import(root + 'stats.js')).StatsPage,
  goals: (await import(root + 'goals.js')).GoalsPage,
  settings: (await import(root + 'settings.js')).SettingsPage,
};
for (const [k, P] of Object.entries(pages)) {
  try { const out = render(html`<${P} />`); console.log(k, 'OK', out.length); }
  catch (e) { console.log(k, 'FAIL', e.stack.split('\n').slice(0, 4).join(' | ')); }
}
const T = await import(root + 'timer.js');
T.startTimer({ type: 'work', goal: 'x', plannedMin: 50 });
try { console.log('running', render(html`<${pages.timer} />`).includes('Vyrušení')); } catch (e) { console.log('running FAIL', e.message); }
for (const k of ["read","ideas","goals","today"]) console.log("\n=="+k, render(html`<${pages[k]} />`).replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,600));
process.exit(0);
