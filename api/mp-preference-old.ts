// /api/mp-preference.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MP_API = 'https://api.mercadopago.com';
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

function genRef() {
  return 'ref-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ACCESS_TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN ausente' });

  const {
    valor = 9.9,
    titulo = 'Plano de Dieta Completo',
    external_reference,
    customer_name = '',
    customer_email = '',
    customer_whatsapp = ''
  } = req.body || {};

  // Fallback seguro no servidor
  const extRef = (typeof external_reference === 'string' && external_reference.trim())
    ? external_reference.trim()
    : genRef();

  try {
    const prefBody = {
      items: [{ title: String(titulo), quantity: 1, unit_price: Number(valor), currency_id: 'BRL' }],
      back_urls: {
        success: 'https://dietapronta.online/approved',
        failure: 'https://dietapronta.online/failure',
        pending: 'https://dietapronta.online/pending'
      },
      auto_return: 'approved',
      notification_url: 'https://dietapronta.online/api/mp-webhook',
      external_reference: extRef,
      payer: {
        name: customer_name || undefined,
        email: customer_email || undefined
      }
    };

    const resp = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(prefBody)
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error('MP preference error:', data);
      return res.status(resp.status).json({ error: data });
    }

    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,
      external_reference: extRef
    });
  } catch (err: any) {
    console.error('mp-preference err', err);
    return res.status(500).json({ error: 'Erro interno ao criar preferência' });
  }
}
