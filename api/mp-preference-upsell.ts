// /api/mp-preference-upsell.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const MP_API = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// 🔐 Dados do servidor PHP
const LEAD_URL = "https://italomelo.com/server/save_lead.php";
const LEAD_TOKEN = "2a8e5cda3b49e2f6f72dc0d4a1f9f83e9c0fda8b2f7a3e1c4d6b9e7f5a2c1d8e";

function log(tag: string, data: any) {
  console.log(
    `[mp-preference-upsell] ${tag}:`,
    typeof data === "object" ? JSON.stringify(data) : data
  );
}

// ===========================================================
// 🔹 Função auxiliar: cria lead no servidor PHP
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
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
      titulo = "200 Receitas Saudáveis",
      external_reference,
      customer_name = "",
      customer_email = "",
      customer_whatsapp = "",
      diet_title = "Upsell - 200 Receitas",
      body_type = "",
    } = bodyData;

    // ✅ Cria novo ref exclusivo do upsell
    const upsellRef =
      external_reference && external_reference.trim()
        ? external_reference.trim()
        : "ref-upsell-" +
          Date.now() +
          "-" +
          Math.random().toString(36).slice(2, 8);

    log("Ref upsell gerado", upsellRef);

    // ===========================================================
    // 🔹 Passo 1: grava lead do upsell
    // ===========================================================
    const leadPayload = {
      ref: upsellRef,
      name: customer_name,
      email: customer_email,

      // 🔥 Garante criação de novo registro SEM mexer no PHP
      phone: customer_whatsapp ? customer_whatsapp + "-upsell" : "",

      diet_title: "200 Receitas Saudáveis",
      body_type: "Upsell",
      amount: Number(valor) || 9.9,

      // Mantém fluxo natural do webhook/polling
      status: "pending",

      secret: LEAD_TOKEN,
    };

    const leadResponse = await createLeadInPHP(leadPayload);
    if (!leadResponse.ok) {
      log("Falha ao criar lead no PHP", leadResponse.error || "sem detalhes");
    } else {
      log("Lead upsell criado com sucesso", leadResponse.ref);
    }

    // ===========================================================
    // 🔹 Passo 2: cria a preferência no Mercado Pago
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
      back_urls: {
        success: "https://dietapronta.online/approved-upsell",
        failure: "https://dietapronta.online/upsell-falhou",
        pending: "https://dietapronta.online/upsell-pendente",
      },
      auto_return: "approved",
      notification_url: "https://dietapronta.online/api/mp-webhook",
      external_reference: upsellRef,
      payer: {
        name: customer_name || undefined,
        email: customer_email || undefined,
      },
      metadata: {
        order_type: "upsell",
        parent_ref: external_reference || null,
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
    log("Resposta Mercado Pago", data);

    if (!resp.ok) {
      return res.status(resp.status).json({ error: data });
    }

    // ✅ Preferência criada com sucesso
    log("Preferência UPSell criada", { id: data.id, ref: upsellRef });

    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,
      external_reference: upsellRef,
    });
  } catch (err: any) {
    console.error("[mp-preference-upsell] Erro geral:", err);
    return res
      .status(500)
      .json({ error: "Erro interno ao criar preferência do upsell" });
  }
}
