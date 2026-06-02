// Supabase Edge Function: receipt-vision
// Estrae SOLO le voci acquistate da uno scontrino.
// Richiede secret: OPENAI_API_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function sanitizeProducts(input: unknown) {
  if (!Array.isArray(input)) return [];
  const blacklist = /^(totale|subtotale|iva|resto|pagato|cassa|data|ora|scontrino|codice|p\.?iva|carta|bancomat|contanti|operatore|reparto)\b/i;

  const out = [];
  const seen = new Set();

  for (const item of input) {
    const obj = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    let name = String(obj.name || '')
      .replace(/[€$£]/g, ' ')
      .replace(/\b\d+[\.,]\d{2}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!name || name.length < 2 || name.length > 45) continue;
    if (blacklist.test(name)) continue;

    const letters = (name.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    if (letters < 2) continue;

    let category = String(obj.category || 'dispensa').toLowerCase();
    if (!['frigo', 'dispensa', 'altro'].includes(category)) category = 'dispensa';

    let qty = Number.parseInt(String(obj.qty || '1'), 10);
    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    qty = Math.min(qty, 99);

    const unit = String(obj.unit || 'pz').slice(0, 8);
    const key = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ name, category, qty, unit });
  }

  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Metodo non consentito' }, 405);

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY non configurata nella Edge Function' }, 500);
  }

  let body: { image?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Body JSON non valido' }, 400);
  }

  const image = String(body.image || '').replace(/^data:image\/\w+;base64,/, '');
  if (!image || image.length < 1000) {
    return jsonResponse({ error: 'Immagine mancante o troppo piccola' }, 400);
  }

  const prompt = `
Sei un estrattore di scontrini italiani.

Devi leggere l'immagine e restituire SOLO le voci/prodotti acquistati.

Regole obbligatorie:
- Non includere prezzi, importi, euro, totale, subtotale, IVA, resto, pagato.
- Non includere data, ora, cassa, negozio, codici, P.IVA, carte, punti, intestazioni o note fiscali.
- Se una riga contiene "Latte 2,30", restituisci solo "Latte".
- Se vedi testo non appartenente allo scontrino, ignoralo.
- Se sei incerto su una voce, includila solo se sembra un prodotto acquistato.
- Rispondi SOLO con JSON valido.

Formato:
{
  "products": [
    {"name":"Acqua","category":"dispensa","qty":1,"unit":"pz"}
  ],
  "rawText":"testo utile letto, senza dati fiscali lunghi"
}

Categorie:
- frigo: latte, yogurt, formaggi, burro, uova, salumi, carne, pesce, verdura/frutta fresca
- dispensa: acqua, pasta, riso, scatolame, olio, snack, biscotti, dolci, bevande
- altro: igiene, casa, detersivi, accessori non alimentari
`.trim();

  const payload = {
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}`, detail: 'high' } }
        ]
      }
    ]
  };

  const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`
    },
    body: JSON.stringify(payload)
  });

  const openaiData = await openaiResp.json().catch(() => ({}));
  if (!openaiResp.ok) {
    return jsonResponse({
      error: openaiData?.error?.message || `OpenAI HTTP ${openaiResp.status}`
    }, 502);
  }

  const content = openaiData?.choices?.[0]?.message?.content || '{}';

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    return jsonResponse({ error: 'Risposta AI non JSON', raw: content }, 502);
  }

  const products = sanitizeProducts(parsed.products);
  return jsonResponse({
    products,
    rawText: typeof parsed.rawText === 'string' ? parsed.rawText.slice(0, 2000) : ''
  });
});
