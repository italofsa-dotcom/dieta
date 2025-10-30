/api/admin/sales-mp.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN as string;

function basicAuth(req: VercelRequest) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const b = Buffer.from(h.split(' ')[1], 'base64').toString('utf8');
  const [u,p] = b.split(':');
  return (u === ADMIN_USER && p === ADMIN_PASS);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!basicAuth(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin area"');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!MP_ACCESS_TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN ausente' });

  try {
    // Busca últimos 100 pagamentos, ordenados por data
    const url = new URL('https://api.mercadopago.com/v1/payments/search');
    url.searchParams.set('sort', 'date_created');
    url.searchParams.set('criteria', 'desc');
    url.searchParams.set('limit', '100'); // ajuste se necessário

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data });

    const out = (data.results || []).map((p: any) => ({
      id: p.id,
      status: p.status,
      status_detail: p.status_detail,
      transaction_amount: p.transaction_amount,
      date_created: p.date_created,
      date_approved: p.date_approved,
      external_reference: p.external_reference,
      payer_email: p.payer?.email || '',
      // se você enviou metadata no checkout, pode ler aqui:
      metadata: p.metadata || {}
    }));

    return res.status(200).json(out);
  } catch (e:any) {
    return res.status(500).json({ error: e.message || 'Erro ao consultar Mercado Pago' });
  }
}
