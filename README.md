# Život

Osobní lifestyle PWA v češtině: dnešní den podle rozvrhu, časovač hlubokých bloků, ranní rutina, tělo, večerní rituál, nápady, čtení, deník, vlivy, volný čas, statistiky a cíle.

- Frontend: Preact + htm, Vite, knihovny z CDN
- Přihlášení a data: Supabase (tabulky `entries` a `settings`, RLS jen pro vlastníka)
- Hosting: Vercel, každý push do `main` se nasadí

```
npm install
npm run dev     # lokálně
npm test        # vykreslí všechny stránky s ukázkovými daty
```
