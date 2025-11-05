// /api/mp-preference.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

// 🔑 Configurações
const MP_API = 'https://api.mercadopago.com';
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

function log(tag: string, data: any) {
  console.log(`[mp-preference] ${tag}:`, typeof data === 'object' ? JSON.stringify(data) : data);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ACCESS_TOKEN) {
    return res.status(500).json({ error: 'MP_ACCESS_TOKEN ausente' });
  }

  try {
    // ✅ Em funções Node da Vercel, o body já vem pronto
    const bodyData: any = req.body || {};
    log('Body recebido', bodyData);

    const {
      valor = 9.9,
      titulo = 'Plano de Dieta Completo',
      external_reference,
      customer_name = '',
      customer_email = '',
      customer_whatsapp = '',
      diet_title = '',
      body_type = '',
      imc_value = '',
      imc_label = ''
    } = bodyData;

    // ✅ Usa o mesmo ref que veio do frontend
    const extRef = external_reference && external_reference.trim()
      ? external_reference.trim()
      : null;

    if (!extRef) {
      log('Erro', 'external_reference ausente');
      return res.status(400).json({ error: 'external_reference ausente' });
    }

    log('Recebido ref', extRef);

    // 🔹 Cria corpo da preferência de pagamento
    const prefBody = {
      items: [
        {
          title: String(titulo),
          quantity: 1,
          unit_price: Number(valor),
          currency_id: 'BRL'
        }
      ],
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
      },
      metadata: {
        diet_title,
        body_type,
        imc_value,
        imc_label,
        customer_whatsapp
      }
    };

    // 🔹 Cria a preferência no Mercado Pago
    const resp = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(prefBody)
    });

    const data = await resp.json();
    log('Resposta MP', data);

    if (!resp.ok) {
      log('Erro Mercado Pago', data);
      return res.status(resp.status).json({ error: data });
    }

    // ✅ Log sucesso
    log('Preferência criada com sucesso', {
      id: data.id,
      external_reference: extRef
    });

    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,
      external_reference: extRef
    });
  } catch (err: any) {
    console.error('[mp-preference] Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno ao criar preferência de pagamento' });
  }
}
