import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) {
    return res.status(500).json({ error: 'ACCESS_TOKEN ausente no ambiente' });
  }

  // Agora recebemos external_reference do frontend
  const {
    valor = 9.9,
    titulo = 'Plano de Dieta Completo',
    external_reference
  } = req.body || {};

  if (!external_reference || typeof external_reference !== 'string') {
    return res.status(400).json({ error: 'external_reference ausente' });
  }

  try {
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
        success: 'https://dietapronta.online/approved',
        failure: 'https://dietapronta.online/failure',
        pending: 'https://dietapronta.online/pending',
      },
      auto_return: 'approved',
      notification_url: 'https://dietapronta.online/api/mp-webhook',
      external_reference, // <- repassamos o ref único
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
      console.error('MP preference error:', data);
      return res.status(resp.status).json({ error: data });
    }

    // Retorna também o external_reference para debug e o init_point como fallback
    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,
      external_reference
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno ao criar preferência' });
  }
}
