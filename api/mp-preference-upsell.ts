// /api/mp-preference-upsell.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const MP_API = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// 🔐 PHP Lead Server
const LEAD_URL = "https://italomelo.com/server/save_lead.php";
const LEAD_TOKEN = "2a8e5cda3b49e2f6f72dc0d4a1f9f83e9c0fda8b2f7a3e1c4d6b9e7f5a2c1d8e";

function log(tag: string, data: any) {
  console.log(
    `[mp-preference-upsell] ${tag}:`,
    typeof data === "object" ? JSON.stringify(data) : data
  );
}

// ====================================================================
// 🔹 Envia LEAD para o PHP
// ====================================================================
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
    log("Erro ao comunicar com PHP", err.message || err);
    return { ok: false, error: "erro_comunicacao_php" };
  }
}

// ====================================================================
// 🔹 Handler principal
// ====================================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!ACCESS_TOKEN) {
    return res.status(500).json({ error: "MP_ACCESS_TOKEN ausente" });
  }

  try {
    const { valor = 9.9, customer_name = "", customer_email = "", customer_whatsapp = "", parent_reference = "" } = req.body;
    log("Body recebido", req.body);

    // ------------------------------------------------------------
    // 🔹 REF única gerada pelo backend
    // ------------------------------------------------------------
    const upsellRef =
      "upsell-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

    log("GERANDO REF:", upsellRef);

    // ------------------------------------------------------------
    // 🔹 Cria LEAD no PHP
    // ------------------------------------------------------------
    await createLeadInPHP({
      ref: upsellRef,
      name: customer_name,
      email: customer_email,
      phone: customer_whatsapp,

      diet_title: "200 Receitas Saudáveis",
      body_type: "Upsell",

      amount: Number(valor),
      order_type: "upsell",
      status: "pending",
      parent_ref: parent_reference || null,
      secret: LEAD_TOKEN
    });

    // ------------------------------------------------------------
    // 🔹 SAFE MODE — ref codificada pra evitar erro no mobile
    // ------------------------------------------------------------
    const safeMeta = {
      ref: upsellRef,
      parent_ref: parent_reference || "",
      name: customer_name,
      email: customer_email,
      phone: customer_whatsapp,
      amount: Number(valor)
    };

    const externalRefSafe =
      `${upsellRef}##${Buffer.from(JSON.stringify(safeMeta)).toString("base64")}`;

    // ------------------------------------------------------------
    // 🔹 Criar preferência no Mercado Pago
    // ------------------------------------------------------------
    const prefBody = {
      items: [
        {
          title: "200 Receitas Saudáveis",
          quantity: 1,
          unit_price: Number(valor),
          currency_id: "BRL"
        }
      ],

      // 🔥 CORRETO — igual ao pre-pagamento
      payment_methods: {
        excluded_payment_types: [
          { id: "ticket" },
          { id: "atm" }
        ],
        installments: 1
      },

      back_urls: {
        success: "https://dietapronta.online/approved-upsell",
        failure: "https://dietapronta.online/upsell-falhou",
        pending: "https://dietapronta.online/upsell-pendente"
      },

      auto_return: "approved",

      notification_url: "https://dietapronta.online/api/mp-webhook",

      // REF 100% segura
      external_reference: externalRefSafe,

      // 🔥 CORREÇÃO ESSENCIAL PARA PIX FUNCIONAR
      payer: {
        name: customer_name || "Cliente",
        email: customer_email || "cliente@suaempresa.com",
        identification: {
          type: "CPF",
          number: "00000000000"
        }
      },

      metadata: {
        ref: upsellRef,
        safe_data: safeMeta,
        order_type: "upsell",
        parent_reference,
        customer_whatsapp
      }
    };

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
      external_reference: upsellRef,
      init_point: data.init_point,
      order_type: "upsell"
    });

  } catch (err: any) {
    console.error("[mp-preference-upsell] Erro geral:", err);
    return res.status(500).json({ error: "Erro interno ao criar preferência do upsell" });
  }
}
