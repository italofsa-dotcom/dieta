// /api/mp-webhook.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';

const MP_API = 'https://api.mercadopago.com';
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN; // use seu token real do Mercado Pago

async function fetchPayment(id: string) {
  const r = await fetch(`${MP_API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
  });
  if (!r.ok) throw new Error('Erro ao buscar pagamento: ' + r.status);
  return r.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body: any = req.body || {};
    let topic = (req.query.topic || body.topic || body.type || '').toString();
    let paymentId =
      (req.query.id as string) ||
      (body.data && body.data.id) ||
      (body.resource && body.resource.split('/').pop()) ||
      '';

    console.log('[mp-webhook] Recebido:', topic, paymentId);

    if ((topic === 'payment' || body.type === 'payment') && paymentId) {
      const payment = await fetchPayment(paymentId);

      const ref = payment.external_reference || '';
      const status = payment.status; // approved, pending, rejected, etc.

      if (ref && status) {
        console.log(`[mp-webhook] Atualizando status ${status} para ref ${ref}`);

        // Envia para o servidor PHP
        await fetch('https://italomelo.com/server/update_status.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ref, status }),
        });
      }

      return res.status(200).json({ ok: true });
    }

    console.log('[mp-webhook] Notificação ignorada:', JSON.stringify(body).slice(0, 200));
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[mp-webhook] erro geral', err);
    return res.status(200).json({ ok: true });
  }
}
