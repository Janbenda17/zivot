import { defineConfig } from 'vite';
const CDN = {
  preact: 'https://cdn.jsdelivr.net/npm/preact@10.24.3/+esm',
  'preact/hooks': 'https://cdn.jsdelivr.net/npm/preact@10.24.3/hooks/+esm',
  htm: 'https://cdn.jsdelivr.net/npm/htm@3.1.1/+esm',
  '@supabase/supabase-js': 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm',
};
export default defineConfig({
  build: {
    assetsInlineLimit: 0,
    rollupOptions: { external: Object.keys(CDN), output: { paths: CDN, entryFileNames: 'assets/app.js', assetFileNames: 'assets/[name][extname]' } },
  },
});
