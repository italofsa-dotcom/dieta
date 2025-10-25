import type { VercelRequest, VercelResponse } from '@vercel/node';

const MP_API = 'https://api.mercadopago.com';
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// Dica: ative logs na Vercel (ou use sua própria persistência)
async function fetchPayment(id: string) {
  const r = await fetch(`${MP_API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Erro ao consultar pagamento ${id}: ${r.status} ${t}`);
  }
  return r.json();
}

export default async function webhook(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    // o MP pode chamar em GET para ver se está vivo
    return res.status(200).send('ok');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Opcional: validar assinatura (x-signature, x-request-id, idempotency)
    // const signature = req.headers['x-signature'];
    // const topic = req.headers['x-topic'] || req.query.topic;
    // Implementar HMAC/sha256 conforme docs se necessário (recomendado em produção)

    const body: any = req.body || {};

    // Webhooks do MP chegam em formatos variados. Trate os dois principais:
    // 1) Quando vem via query `topic=payment&id=...`
    // 2) Quando vem JSON com `type: "payment", data: { id: "..." }`
    let topic = (req.query.topic || body.topic || body.type || '').toString();
    let paymentId =
      (req.query.id as string) ||
      (body.data && body.data.id) ||
      (body.resource && body.resource.split('/').pop()) ||
      '';

    // Log inicial (ajuda muito no diagnóstico)
    console.log('[MP-WEBHOOK] topic:', topic, 'paymentId:', paymentId, 'body:', JSON.stringify(body));

    // Se for de pagamento e tivermos ID, consultar detalhes
    if (topic === 'payment' && paymentId) {
      try {
        const payment = await fetchPayment(paymentId);
        console.log('[MP-WEBHOOK] payment status:', payment.status, 'status_detail:', payment.status_detail);

        // TODO: aqui você pode:
        // - associar ao lead (use external_reference da preferência)
        // - enviar WhatsApp/Email
        // - marcar “aprovado” no seu banco
        // Exemplo de log com external_reference, order_id etc:
        console.log('[MP-WEBHOOK] external_reference:', payment.external_reference, 'order:', payment.order?.id);

      } catch (e) {
        console.error('[MP-WEBHOOK] erro consultando pagamento:', e);
      }
    }

    // Sempre responda rápido 200 OK
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[MP-WEBHOOK] erro geral:', err);
    return res.status(200).json({ ok: true }); // ainda respondemos 200 para não derrubar retries
  }
}
