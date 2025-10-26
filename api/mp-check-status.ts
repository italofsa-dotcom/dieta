// /api/mp-check-status.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MP_API = 'https://api.mercadopago.com';
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN as string;

/**
 * Busca pagamentos por external_reference e retorna o status mais recente.
 * Chamada: GET /api/mp-check-status?ref=EXTERNAL_REF
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!ACCESS_TOKEN) {
    return res.status(500).json({ error: 'ACCESS_TOKEN ausente no ambiente' });
  }

  const ref = (req.query.ref || '').toString().trim();
  if (!ref) {
    return res.status(400).json({ error: 'Parâmetro "ref" obrigatório' });
  }

  try {
    // Busca por external_reference
    const url = new URL(`${MP_API}/v1/payments/search`);
    url.searchParams.set('sort', 'date_created');
    url.searchParams.set('criteria', 'desc');
    url.searchParams.set('external_reference', ref);

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
    });
    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: data || 'Erro na consulta' });
    }

    const results = Array.isArray(data.results) ? data.results : [];
    if (results.length === 0) {
      return res.status(200).json({ found: false, status: 'unknown' });
    }

    // Pega o pagamento mais recente
    const last = results[0];
    return res.status(200).json({
      found: true,
      status: last.status,                // approved | pending | rejected | canceled...
      status_detail: last.status_detail,
      id: last.id,
      date_approved: last.date_approved,
      transaction_amount: last.transaction_amount
    });
  } catch (e:any) {
    console.error('[mp-check-status] erro:', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
