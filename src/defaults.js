// Typy bloků v rozvrhu
export const BLOCK_TYPES = {
  routine: { label: 'Rutina', deep: false },
  plan: { label: 'Plán', deep: false },
  work: { label: 'Hluboká práce', deep: true },
  psych: { label: 'Psychologie', deep: true },
  brainstorm: { label: 'Brainstorming', deep: true },
  shallow: { label: 'Mělká práce', deep: false },
  body: { label: 'Tělo', deep: false },
  shutdown: { label: 'Rituál ukončení', deep: false },
  sleep: { label: 'Spánek', deep: false },
  other: { label: 'Jiné', deep: false },
};
export const DEEP_TYPES = [
  { key: 'work', label: 'Práce' },
  { key: 'brainstorm', label: 'Brainstorming' },
  { key: 'psych', label: 'Psychologie' },
];

export const DEFAULT_SCHEDULE = [
  { id: 'b0900', start: '09:00', end: '10:00', title: 'Ranní rutina', type: 'routine' },
  { id: 'b1000', start: '10:00', end: '10:15', title: 'Voda + plán dne', type: 'plan' },
  { id: 'b1015', start: '10:15', end: '12:45', title: 'Práce', type: 'work', splittable: true },
  { id: 'b1400', start: '14:00', end: '16:00', title: 'Gym + sauna', type: 'body' },
  { id: 'b1700', start: '17:00', end: '17:45', title: 'Mělká práce', type: 'shallow' },
  { id: 'b1745', start: '17:45', end: '18:45', title: 'Psychologie', type: 'psych' },
  { id: 'b2000', start: '20:00', end: '21:00', title: 'Práce', type: 'work' },
  { id: 'b2110', start: '21:10', end: '22:10', title: 'Brainstorming', type: 'brainstorm' },
  { id: 'b2210', start: '22:10', end: '22:40', title: 'Rituál ukončení', type: 'shutdown' },
  { id: 'b2400', start: '24:00', end: '24:30', title: 'Spánek', type: 'sleep' },
];

export const DEFAULT_ROUTINE = [
  { key: 'shower', label: 'Studená sprcha' },
  { key: 'meditation', label: 'Meditace', timer: 10 },
  { key: 'reading', label: 'Čtení' },
  { key: 'water', label: '0,5 l vody' },
  { key: 'plan', label: 'Plán dne' },
];

// Šablony dnů: každý den v týdnu má přiřazenou jednu (lze změnit pro konkrétní den v plánu).
export const DEFAULT_TEMPLATES = [
  { id: 'main', name: 'Pracovní den', blocks: DEFAULT_SCHEDULE },
  {
    id: 'light', name: 'Lehký den', blocks: [
      { id: 'l0900', start: '09:00', end: '10:00', title: 'Ranní rutina', type: 'routine' },
      { id: 'l1000', start: '10:00', end: '10:15', title: 'Voda + plán dne', type: 'plan' },
      { id: 'l1015', start: '10:15', end: '12:15', title: 'Práce', type: 'work' },
      { id: 'l1400', start: '14:00', end: '16:00', title: 'Gym + sauna', type: 'body' },
      { id: 'l1745', start: '17:45', end: '18:45', title: 'Psychologie', type: 'psych' },
      { id: 'l2210', start: '22:10', end: '22:40', title: 'Rituál ukončení', type: 'shutdown' },
      { id: 'l2400', start: '24:00', end: '24:30', title: 'Spánek', type: 'sleep' },
    ],
  },
  {
    id: 'off', name: 'Volno', blocks: [
      { id: 'o0930', start: '09:30', end: '10:30', title: 'Ranní rutina', type: 'routine' },
      { id: 'o1030', start: '10:30', end: '10:45', title: 'Voda + plán dne', type: 'plan' },
      { id: 'o1400', start: '14:00', end: '16:00', title: 'Pohyb venku', type: 'body' },
      { id: 'o2200', start: '22:00', end: '22:20', title: 'Rituál ukončení', type: 'shutdown' },
      { id: 'o2400', start: '24:00', end: '24:30', title: 'Spánek', type: 'sleep' },
    ],
  },
];

export const DEFAULT_SETTINGS = {
  templates: DEFAULT_TEMPLATES,
  weekMap: ['main', 'main', 'main', 'main', 'main', 'main', 'main'], // index = den v týdnu (0 = neděle)
  routine: DEFAULT_ROUTINE,
  deepCapMin: 240,
  waterGoalMl: 2500,
  socialLimitMin: 30,
  sleepGoalH: 7.5,
  notify: false,
  notifyLeadMin: 5,
};

export const JOURNAL_QUESTIONS = [
  'Co mi dnes dalo energii a co mi ji vzalo?',
  'Kdy jsem se dnes cítil nejvíc sám sebou?',
  'Čemu jsem se dnes vyhýbal?',
  'Za co jsem dnes vděčný?',
  'Co bych udělal jinak, kdybych dnešek mohl zopakovat?',
  'Jaká myšlenka se mi dnes vracela?',
  'Co jsem se dnes naučil o sobě?',
  'Komu bych měl poděkovat a proč?',
  'Kde jsem dnes reagoval automaticky místo vědomě?',
  'Co malého mě dnes potěšilo?',
  'Jaký krok mě dnes přiblížil k mým cílům?',
  'Na co se zítra těším?',
  'Co mě dnes stresovalo a co s tím můžu udělat?',
  'Jak jsem dnes pečoval o své tělo?',
  'Kterou svoji hodnotu jsem dnes žil?',
];

export const READING_QUESTIONS = [
  'Kde tuhle myšlenku vidím ve svém životě?',
  'Co z kapitoly tento týden vyzkouším?',
  'Co mě překvapilo nebo vyvolalo odpor, a proč?',
];

export const GYM_TYPES = ['Síla', 'Horní tělo', 'Dolní tělo', 'Kardio', 'Mobilita', 'Plavání', 'Jiné'];

// Návyky, které lze napojit na cíle a sledovat ve statistikách
export const HABITS = [
  { key: 'routine', label: 'Ranní rutina' },
  { key: 'gym', label: 'Gym' },
  { key: 'sauna', label: 'Sauna' },
  { key: 'water', label: 'Pitný režim' },
  { key: 'sleep', label: 'Spánek podle cíle' },
  { key: 'journal', label: 'Deník' },
  { key: 'detox', label: 'Detox den' },
  { key: 'social', label: 'Sítě pod limitem' },
  { key: 'shutdown', label: 'Den uzavřen' },
  { key: 'read', label: 'Čtení kapitoly' },
  { key: 'planned', label: 'Zítřek naplánován' },
  { key: 'deep', label: 'Hluboká práce (h)' },
];

export const SOCIAL_APPS = [
  { key: 'ig', label: 'Instagram' },
  { key: 'yt', label: 'YouTube' },
  { key: 'tt', label: 'TikTok' },
  { key: 'x', label: 'X' },
  { key: 'fb', label: 'Facebook' },
  { key: 'other', label: 'Jiné' },
];

export const GRATITUDE_SLOTS = 3;
