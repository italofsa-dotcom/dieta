// /api/mp-preference.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MP_API = 'https://api.mercadopago.com';
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// PHP Server
const LEAD_URL = 'https://italomelo.com/server/save_lead.php';
const LEAD_TOKEN = '2a8e5cda3b49e2f6f72dc0d4a1f9f83e9c0fda8b2f7a3e1c4d6b9e7f5a2c1d8e';

function log(tag: string, data: any) {
  console.log(`[mp-preference] ${tag}:`, typeof data === "object" ? JSON.stringify(data) : data);
}

// ===========================================================
// 🔹 Cria lead no PHP (rápido, sem travar MP)
// ===========================================================
async function createLeadInPHP(payload: any) {
  try {
    const response = await fetch(LEAD_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    log("Retorno PHP", data);
    return data;

  } catch (err: any) {
    log("Erro PHP", err.message);
    return { ok: false, error: "erro_comunicacao_php" };
  }
}

// ===========================================================
// 🔹 Handler
// ===========================================================
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

    // ==============================
    // REF obrigatório
    // ==============================
    const extRef = external_reference?.trim();
    if (!extRef) {
      return res.status(400).json({ error: "external_reference ausente" });
    }

    // ==============================
    // Diet title final
    // ==============================
    const finalDietTitle = diet_title?.trim() || titulo;

    // ===========================================================
    // 🔹 Criação de LEAD
    // ===========================================================
    createLeadInPHP({
      ref: extRef,
      name: customer_name,
      email: customer_email,
      phone: customer_whatsapp,
      diet_title: finalDietTitle,
      body_type: body_type || "Não informado",
      imc_value: imc_value || "",
      imc_label: imc_label || "",
      amount: valor,
      secret: LEAD_TOKEN
    });

    // ===========================================================
    // 🔹 External Reference Segura
    // ===========================================================
    const safeMeta = {
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

    const externalRefSafe =
      `${extRef}##${Buffer.from(JSON.stringify(safeMeta)).toString("base64")}`;

    // ===========================================================
    // 🔹 PAYER — FIX DO PIX
    // ===========================================================
    const payerBlock: any = {
      name: customer_name || "Cliente",
      email: customer_email || "cliente@sistema.com",
      identification: {
        type: "CPF",
        number: "00000000000" // CPF genérico válido
      }
    };

    // Remove campos vazios (PIX odeia isso)
    if (!payerBlock.email) delete payerBlock.email;

    // ===========================================================
    // 🔹 Preference Mercado Pago
    // ===========================================================
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

      external_reference: externalRefSafe,
      payer: payerBlock,

      metadata: {
        ref: extRef,
        safe_data: safeMeta,
        order_type: "main_diet"
      }
    };

    // ===========================================================
    // 🔹 Envio ao Mercado Pago
    // ===========================================================
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
