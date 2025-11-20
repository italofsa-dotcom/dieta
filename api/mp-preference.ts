// /api/mp-preference.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MP_API = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

const LEAD_URL = "https://italomelo.com/server/save_lead.php";
const LEAD_TOKEN = "2a8e5cda3b49e2f6f72dc0d4a1f9f83e9c0fda8b2f7a3e1c4d6b9e7f5a2c1d8e";

function log(tag: string, data: any) {
  console.log(`[mp-preference] ${tag}:`, typeof data === "object" ? JSON.stringify(data) : data);
}

// ======================================================
// CREATE LEAD IN PHP
// ======================================================
async function createLeadInPHP(payload: any) {
  try {
    const r = await fetch(LEAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await r.json();
    log("Retorno PHP", data);
    return data;

  } catch (err: any) {
    log("Erro PHP", err.message);
    return { ok: false };
  }
}

// ======================================================
// MAIN HANDLER
// ======================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!ACCESS_TOKEN) {
    return res.status(500).json({ error: "MP_ACCESS_TOKEN ausente" });
  }

  try {
    const body: any = req.body || {};
    log("Body recebido", body);

    const {
      valor = 9.9,
      titulo = "Plano de Dieta Completo",
      external_reference,
      customer_name = "",
      customer_email = "",
      customer_whatsapp = "",
      diet_title = "",
      body_type = "",
      imc_value = "",
      imc_label = ""
    } = body;

    // REF
    const extRef = external_reference?.trim();
    if (!extRef) {
      return res.status(400).json({ error: "external_reference ausente" });
    }

    // DIET TITLE
    const finalDietTitle = diet_title?.trim() || titulo;

    // ======================================================
    // CREATE LEAD (NON BLOCKING)
    // ======================================================
    createLeadInPHP({
      ref: extRef,
      name: customer_name,
      email: customer_email,
      phone: customer_whatsapp,
      diet_title: finalDietTitle,
      body_type,
      imc_value,
      imc_label,
      amount: valor,
      secret: LEAD_TOKEN
    });

    // ======================================================
    // SAFE DATA → usado no webhook
    // ======================================================
    const safeData = {
      ref: extRef,
      name: customer_name,
      email: customer_email,
      phone: customer_whatsapp,
      diet_title: finalDietTitle,
      body_type,
      imc_value,
      imc_label,
      amount: valor
    };

    // ======================================================
    // MERCADO PAGO PREFERENCES
    // ======================================================
    const prefBody = {
      items: [
        {
          title: finalDietTitle,
          quantity: 1,
          unit_price: Number(valor),
          currency_id: "BRL"
        }
      ],

      payment_methods: {
        excluded_payment_types: [
          { id: "ticket" },
          { id: "atm" }
        ],
        installments: 1
      },

      back_urls: {
        success: "https://dietapronta.online/approved",
        failure: "https://dietapronta.online/failure",
        pending: "https://dietapronta.online/pending"
      },

      auto_return: "approved",
      notification_url: "https://dietapronta.online/api/mp-webhook",

      // EXTERNAL REF → ORIGINAL (FUNCIONA)
      external_reference: extRef,

      // PAYER → sem CPF, sem campos vazios (PIX FUNCIONA)
      payer: {
        name: customer_name || undefined,
        email: customer_email || undefined
      },

      metadata: {
        order_type: "main_diet",
        safe_data: safeData
      }
    };

    // SEND TO MP
    const resp = await fetch(`${MP_API}/checkout/preferences`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(prefBody)
    });

    const data = await resp.json();
    log("Resposta Mercado Pago", data);

    if (!resp.ok) {
      return res.status(resp.status).json({ error: data });
    }

    // SUCCESS
    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,
      external_reference: extRef
    });

  } catch (err: any) {
    log("Erro geral", err.message);
    return res.status(500).json({ error: "Erro interno ao criar preferência" });
  }
}
