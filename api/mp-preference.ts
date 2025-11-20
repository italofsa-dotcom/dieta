// /api/mp-preference.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

// 🔑 Configurações
const MP_API = 'https://api.mercadopago.com';
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const LEAD_URL = 'https://italomelo.com/server/save_lead.php';
const LEAD_TOKEN = '2a8e5cda3b49e2f6f72dc0d4a1f9f83e9c0fda8b2f7a3e1c4d6b9e7f5a2c1d8e';

function log(tag: string, data: any) {
  console.log(`[mp-preference] ${tag}:`, typeof data === 'object' ? JSON.stringify(data) : data);
}

// ===========================================================
// 🔹 Função auxiliar: cria o lead no servidor PHP
// ===========================================================
async function createLeadInPHP(payload: any) {
  try {
    const response = await fetch(LEAD_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    log('Retorno PHP', data);
    return data;
  } catch (err: any) {
    log('Erro ao comunicar com PHP', err.message || err);
    return { ok: false, error: 'erro_comunicacao_php' };
  }
}

// ===========================================================
// 🔹 Handler principal
// ===========================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ACCESS_TOKEN) {
    return res.status(500).json({ error: 'MP_ACCESS_TOKEN ausente' });
  }

  try {
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

    // ✅ Determina nome final da dieta (prioriza resultado do quiz)
    const finalDietTitle =
      diet_title && diet_title.trim().length > 0
        ? diet_title.trim()
        : titulo || 'Plano de Dieta Completo';

    // ✅ Usa o mesmo ref vindo do frontend
    const extRef = external_reference && external_reference.trim()
      ? external_reference.trim()
      : null;

    if (!extRef) {
      log('Erro', 'external_reference ausente');
      return res.status(400).json({ error: 'external_reference ausente' });
    }

    // ===========================================================
    // 🔹 Passo 1: criar o lead no PHP antes da preferência
    // ===========================================================
    const leadPayload = {
      ref: extRef,
      name: customer_name,
      email: customer_email,
      phone: customer_whatsapp,
      // ✅ grava corretamente tipo de dieta do quiz
      diet_title: finalDietTitle,
      body_type: body_type || 'Não informado',
      imc_value: imc_value || '',
      imc_label: imc_label || '',
      amount: valor, // 💰 novo campo
      secret: LEAD_TOKEN
    };

    log('Enviando leadPayload', leadPayload);
    const leadResponse = await createLeadInPHP(leadPayload);

    if (!leadResponse.ok) {
      log('Falha ao criar lead', leadResponse.error || 'sem detalhes');
    } else {
      log('Lead criado com sucesso no PHP', leadResponse.ref);
    }

 // ===========================================================
// 🔹 Passo 2: criar preferência Mercado Pago
// ===========================================================

// Cria um bloco seguro que SEMPRE chega no webhook
const safeMeta = {
  ref: extRef,
  name: customer_name,
  email: customer_email,
  phone: customer_whatsapp,
  diet_title: finalDietTitle,
  body_type: body_type || "",
  imc_value: imc_value || "",
  imc_label: imc_label || "",
  amount: valor
};

// external_reference sempre chega 100% — mobile safe
const externalRefSafe = `${extRef}##${Buffer.from(JSON.stringify(safeMeta)).toString("base64")}`;

const prefBody = {
  items: [
    {
      title: finalDietTitle,
      quantity: 1,
      unit_price: Number(valor),
      currency_id: 'BRL'
    }
  ],

  payment_methods: {
    excluded_payment_types: [
      { id: 'ticket' },
      { id: 'atm' }
    ],
    installments: 1
  },

  back_urls: {
    success: 'https://dietapronta.online/approved',
    failure: 'https://dietapronta.online/failure',
    pending: 'https://dietapronta.online/pending'
  },

  auto_return: 'approved',
  notification_url: 'https://dietapronta.online/api/mp-webhook',

  // 👇 SAFE VERSION
  external_reference: externalRefSafe,

  payer: {
    name: customer_name || undefined,
    email: customer_email || undefined
  },

  metadata: {
    ref: extRef, // NOVO ✔ GARANTE IDENTIFICAÇÃO DO LEAD
    safe_data: safeMeta, // Back-up dos dados completos
    order_type: 'main_diet',
    diet_title: finalDietTitle,
    body_type,
    imc_value,
    imc_label,
    customer_whatsapp
  }
};

