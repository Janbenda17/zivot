import { useEffect, useState } from 'preact/hooks';

let payload = null;
export function go(route, data = null) {
  payload = data;
  if (location.hash === '#/' + route) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = '#/' + route;
  window.scrollTo(0, 0);
}
export function takePayload() { const p = payload; payload = null; return p; }
export function useRoute() {
  const get = () => (location.hash.replace(/^#\/?/, '') || 'dnes').split('?')[0];
  const [r, set] = useState(get());
  useEffect(() => { const f = () => set(get()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return r;
}
