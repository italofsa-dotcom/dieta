// /api/mp-preference-upsell.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const MP_API = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// 🔐 Servidor PHP
const LEAD_URL = "https://italomelo.com/server/save_lead.php";
const LEAD_TOKEN =
  "2a8e5cda3b49e2f6f72dc0d4a1f9f83e9c0fda8b2f7a3e1c4d6b9e7f5a2c1d8e";

function log(tag: string, data: any) {
  console.log(
    `[mp-preference-upsell] ${tag}:`,
    typeof data === "object" ? JSON.stringify(data) : data
  );
}

// ===========================================================
// 🔹 Criar lead no PHP
// ===========================================================
async function createLeadInPHP(payload: any) {
  try {
    const response = await fetch(LEAD_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    log("Retorno PHP", data);
    return data;

  } catch (err: any) {
    log("Erro ao comunicar com PHP", err.message || err);
    return { ok: false, error: "erro_comunicacao_php" };
  }
}

// ===========================================================
// 🔹 Handler principal
// ===========================================================
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!ACCESS_TOKEN) {
    return res.status(500).json({ error: "MP_ACCESS_TOKEN ausente" });
  }

  try {
    const bodyData: any = req.body || {};
    log("Body recebido", bodyData);

    const {
      valor = 9.9,
      customer_name = "",
      customer_email = "",
      customer_whatsapp = "",
      parent_reference = "",
      external_reference = "", // 🔥 Novo: recebendo REF do frontend
    } = bodyData;

    // ===========================================================
    // 🔹 REF ÚNICO — Agora respeita o REF enviado pelo frontend
    // ===========================================================
    const upsellRef =
      external_reference && external_reference.trim().length > 0
        ? external_reference.trim()
        : "upsell-" +
          Date.now() +
          "-" +
          Math.random().toString(36).slice(2, 8);

    log("Ref upsell DEFINIDO", upsellRef);

    // ===========================================================
    // 🔹 Passo 1 — Criar lead do Upsell
    // ===========================================================
    const leadPayload = {
      ref: upsellRef,
      name: customer_name,
      email: customer_email,
      phone: customer_whatsapp,

      diet_title: "200 Receitas Saudáveis",
      body_type: "Upsell",

      amount: Number(valor),
      order_type: "upsell",

      // 🔥 STATUS correto
      status: "pending",

      parent_ref: parent_reference || null,
      secret: LEAD_TOKEN,
    };

    const leadResp = await createLeadInPHP(leadPayload);
    log("Lead UPSell criado", leadResp);

    // ===========================================================
    // 🔹 SAFE MODE — REF sempre salvo sem risco de extravio
    // ===========================================================
    const safeMeta = {
      ref: upsellRef,
      parent_reference,
      name: customer_name,
      email: customer_email,
      phone: customer_whatsapp,
      amount: valor,
      order_type: "upsell",
    };

    const externalRefSafe =
      `${upsellRef}##${Buffer.from(JSON.stringify(safeMeta)).toString(
        "base64"
      )}`;

    // ===========================================================
    // 🔹 Passo 2 — Criar preferência Mercado Pago
    // ===========================================================
    const prefBody = {
      items: [
        {
          title: "200 Receitas Saudáveis",
          quantity: 1,
          unit_price: Number(valor),
          currency_id: "BRL",
        },
      ],

      payment_methods: {
        excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
        installments: 1,
      },

      back_urls: {
        success: "https://dietapronta.online/approved-upsell",
        failure: "https://dietapronta.online/upsell-falhou",
        pending: "https://dietapronta.online/upsell-pendente",
      },

      auto_return: "approved",
      notification_url: "https://dietapronta.online/api/mp-webhook",

      // 🔥 Agora o Mercado Pago recebe SEMPRE a mesma REF do admin
      external_reference: externalRefSafe,

      payer: {
        name: customer_name || "Cliente",
        email: customer_email || "cliente@suaempresa.com",
        identification: {
          type: "CPF",
          number: "00000000000", // Necessário para PIX
        },
      },

      metadata: {
        ref: upsellRef,
        safe_data: safeMeta,
        order_type: "upsell",
        parent_reference,
        customer_whatsapp,
      },
    };

    const resp = await fetch(`${MP_API}/checkout/preferences`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(prefBody),
    });

    const data = await resp.json();
    log("Preferência Mercado Pago", data);

    if (!resp.ok) {
      return res.status(resp.status).json({ error: data });
    }

    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,
      external_reference: upsellRef, // 🔥 volta REF correto
      order_type: "upsell",
    });

  } catch (err: any) {
    console.error("[mp-preference-upsell] Erro geral:", err);
    return res
      .status(500)
      .json({ error: "Erro interno ao criar preferência do upsell" });
  }
}
