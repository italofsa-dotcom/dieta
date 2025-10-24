// /api/mp-preference.ts — Gera preferência Mercado Pago (R$9,90)
import type { VercelRequest, VercelResponse } from 'vercel';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN ausente' });

  try {
    const { valor = 9.9, titulo = 'Plano de Dieta Completo' } = req.body || {};
    const body = {
      items: [{ title: String(titulo), quantity: 1, unit_price: Number(valor), currency_id: 'BRL' }],
      back_urls: {
        success: 'https://dietapronta.online/quiz?status=approved',
        failure: 'https://dietapronta.online/quiz?status=failure',
        pending: 'https://dietapronta.online/quiz?status=pending',
      },
      auto_return: 'approved',
      notification_url: 'https://dietapronta.online/api/mp-webhook'
    };

    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ error: data });

    return res.status(200).json({ id: data.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno ao criar preferência' });
  }
}
