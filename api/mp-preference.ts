// /api/mp-preference.ts
declare const process: any;

const MP_API = 'https://api.mercadopago.com';
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// 🔹 Função que cria o lead no servidor PHP e retorna o "ref"
async function createLeadAndGetRef(body: any) {
  try {
    const leadPayload = {
      name: body.customer_name || '',
      email: body.customer_email || '',
      phone: body.customer_whatsapp || '',
      diet_title: body.titulo || '',
      secret: '2a8e5cda3b49e2f6f72dc0d4a1f9f83e9c0fda8b2f7a3e1c4d6b9e7f5a2c1d8e', // mesmo LEAD_TOKEN do config.php
    };

    console.log('[mp-preference] Enviando leadPayload:', leadPayload);

    const response = await fetch('https://italomelo.com/server/save_lead.php', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(leadPayload),
    });

    const data = await response.json();
    console.log('[mp-preference] Retorno do PHP:', data);

    if (data && data.ok && data.ref) {
      console.log('[mp-preference] Lead criado no PHP com sucesso:', data.ref);
      return data.ref;
    } else {
      console.warn('[mp-preference] Erro ao criar lead no PHP:', data);
      return 'ref-' + Date.now();
    }
  } catch (err) {
    console.error('[mp-preference] Erro ao comunicar com o PHP:', err);
    return 'ref-' + Date.now();
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });
  if (!ACCESS_TOKEN)
    return res.status(500).json({ error: 'MP_ACCESS_TOKEN ausente' });

  try {
    const {
      valor = 9.9,
      titulo = 'Plano de Dieta Completo',
      customer_name = '',
      customer_email = '',
      customer_whatsapp = '',
      external_reference = '',
    } = req.body || {};

    // 🔹 Define a referência final
    const extRef =
      typeof external_reference === 'string' && external_reference.trim()
        ? external_reference.trim()
        : await createLeadAndGetRef(req.body);

    // 🔹 Detecta se é uma venda de upsell
    const isUpsell = extRef.startsWith('ref-upsell');

    // 🔹 Define as URLs de retorno conforme o tipo de compra
    const back_urls = {
      success: isUpsell
        ? 'https://dietapronta.online/approved-upsell'
        : 'https://dietapronta.online/approved',
      failure: 'https://dietapronta.online/failure',
      pending: 'https://dietapronta.online/pending',
    };

    // 🔹 Corpo da preferência Mercado Pago
    const prefBody = {
      items: [
        {
          title: String(titulo),
          quantity: 1,
          unit_price: Number(valor),
          currency_id: 'BRL',
        },
      ],
      back_urls,
      auto_return: 'approved',
      notification_url: 'https://dietapronta.online/api/mp-webhook',
      external_reference: extRef,
      payer: {
        name: customer_name || undefined,
        email: customer_email || undefined,
      },
    };

    console.log(
      `[mp-preference] Criando preferência para ${
        isUpsell ? 'UPSELL' : 'DIETA'
      }:`,
      extRef
    );

    const resp = await fetch(`${MP_API}/checkout/preferences`, {
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

    console.log('[mp-preference] Preferência criada com sucesso:', data.id);

    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,
      external_reference: extRef,
    });
  } catch (err: any) {
    console.error('[mp-preference] Erro geral:', err);
    return res
      .status(500)
      .json({ error: 'Erro interno ao criar preferência de pagamento' });
  }
}
