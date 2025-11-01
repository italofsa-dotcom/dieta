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
      secret: '2a8e5cda3b49e2f6f72dc0d4a1f9f83e9c0fda8b2f7a3e1c4d6b9e7f5a2c1d8e', // 🔑 mesmo LEAD_TOKEN do config.php
    };

    console.log('[mp-preference] Enviando leadPayload:', leadPayload);

    const response = await fetch('https://italomelo.com/server/save_lead.php', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json', // garante envio em JSON puro
      },
      body: JSON.stringify(leadPayload),
    });

    const data = await response.json();
    console.log('[mp-preference] Retorno do PHP:', data);

    // Se o PHP responder com sucesso, retorna o ref; senão gera fallback
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
    } = req.body || {};

    // 🔹 Passo 1: cria o lead no servidor PHP e obtém o mesmo ref do banco
    const ref = await createLeadAndGetRef(req.body);

    // 🔹 Passo 2: cria a preferência do Mercado Pago usando o mesmo ref
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
      external_reference: ref, // ✅ mesmo ref do banco
      payer: {
        name: customer_name || undefined,
        email: customer_email || undefined,
      },
    };

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

    // 🔹 Retorna os dados da preferência e o ref sincronizado
    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,
      external_reference: ref,
    });
  } catch (err: any) {
    console.error('[mp-preference] Erro geral:', err);
    return res
      .status(500)
      .json({ error: 'Erro interno ao criar preferência de pagamento' });
  }
}
