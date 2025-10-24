// /api/mp-preference.ts — Vercel Serverless Function
// Gera uma preferência de pagamento Mercado Pago (R$ 9,90)
// Retorna { id, init_point } para o front usar modal e fallback
// Requer variável de ambiente: MP_ACCESS_TOKEN (Access Token de produção)

import type { VercelRequest, VercelResponse } from 'vercel';

// CORS básico (caso chame de outros domínios durante testes)
function applyCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN ausente' });

  try {
    const { valor = 9.9, titulo = 'Plano de Dieta Completo' } = (req.body || {}) as { valor?: number; titulo?: string };

    const prefBody = {
      items: [
        {
          title: String(titulo),
          quantity: 1,
          unit_price: Number(valor),
          currency_id: 'BRL',
        },
      ],
      back_urls: {
        success: 'https://dieta-self.vercel.app/quiz?status=approved',
        failure: 'https://dieta-self.vercel.app/quiz?status=failure',
        pending: 'https://dieta-self.vercel.app/quiz?status=pending',
      },
      auto_return: 'approved',
    };

    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(prefBody),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error('MercadoPago error:', data);
      return res.status(resp.status).json({ error: data });
    }

    const init_point = (data as any).init_point || (data as any).sandbox_init_point;
    return res.status(200).json({ id: data.id, init_point });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno ao criar preferência' });
  }
}
