# OCR scontrini affidabile con Supabase Edge Function

Il riconoscimento locale con Tesseract.js su telefono è fragile: foto storte, luci, font dello scontrino e rumore producono parole sbagliate.

Questa versione usa una alternativa più valida:
**Supabase Edge Function + OpenAI Vision**.

La chiave OpenAI NON viene messa nel browser. Resta come secret su Supabase.

## 1. Pubblica la Edge Function

Dalla cartella del progetto:

```bash
supabase login
supabase link --project-ref evaftivdtyoaezxzzyml
supabase secrets set OPENAI_API_KEY=sk-...
supabase functions deploy receipt-vision --no-verify-jwt
```

Nota: `--no-verify-jwt` serve perché l’app è una PWA statica su GitHub Pages e non usa login Supabase Auth.

## 2. Carica i file su GitHub Pages

Sostituisci questi file nel repo:

- `index.html`
- `manifest.json`
- `sw.js`
- `icon-192.png`
- `icon-512.png`

## 3. Svuota cache PWA

Dopo il deploy:
- rimuovi la PWA dal telefono e reinstallala
oppure
- cancella dati/cache del sito `freddieita91.github.io`

Il service worker ora usa cache `dispensa-v9`.

## Come funziona ora

Modalità consigliata: **☁️ Visione AI**

La funzione riceve la foto ritagliata dello scontrino e restituisce JSON con sole voci:

```json
[
  {"name":"Acqua","category":"dispensa","qty":1,"unit":"pz"},
  {"name":"Latte","category":"frigo","qty":1,"unit":"pz"}
]
```

Prezzi, importi, totali, date, IVA, cassa e testo esterno vengono scartati.
