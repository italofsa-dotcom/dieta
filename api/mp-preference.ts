// /api/mp-preference.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

// 🔑 Configurações
const MP_API = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const LEAD_URL = "https://italomelo.com/server/save_lead.php";
const LEAD_TOKEN =
  "2a8e5cda3b49e2f6f72dc0d4a1f9f83e9c0fda8b2f7a3e1c4d6b9e7f5a2c1d8e";

function log(tag: string, data: any) {
  console.log(
    `[mp-preference] ${tag}:`,
    typeof data === "object" ? JSON.stringify(data) : data
  );
}

// ===========================================================
// 🔹 Função auxiliar: cria lead no PHP (com timeout seguro)
// ===========================================================
async function createLeadInPHP(payload: any) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // ⏳ Timeout 5s

    const response = await fetch(LEAD_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await response.json().catch(() => null);
    log("Retorno PHP", data);
    return data || { ok: false, error: "json_invalid" };
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
      titulo = "Plano de Dieta Completo",
      external_reference,
      customer_name = "",
      customer_email = "",
      customer_whatsapp = "",
      diet_title = "",
      body_type = "",
      imc_value = "",
      imc_label = "",
    } = bodyData;

    if (!external_reference) {
      return res.status(400).json({ error: "external_reference ausente" });
    }

    const extRef = external_reference.trim();

    const finalDietTitle =
      diet_title?.trim() || titulo || "Plano de Dieta Completo";

    // ===========================================================
    // 🔹 Passo 1: criar lead (NÃO TRAVA mais)
    // ===========================================================
    const leadPayload = {
      ref: extRef,
      name: customer_name,
      email: customer_email,
      phone: customer_whatsapp,
      diet_title: finalDietTitle,
      body_type: body_type || "Não informado",
      imc_value: imc_value || "",
      imc_label: imc_label || "",
      amount: valor,
      secret: LEAD_TOKEN,
    };

    createLeadInPHP(leadPayload); // ⚡ Não usamos "await" para não travar nada

    // ===========================================================
    // 🔹 Passo 2: montar referência segura
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
      amount: valor,
    };

    const externalRefSafe = `${extRef}##${Buffer.from(
      JSON.stringify(safeMeta)
    ).toString("base64")}`;

    // ===========================================================
    // 🔹 Passo 3: montar preferência Mercado Pago
    // ===========================================================
    const prefBody = {
      items: [
        {
          title: finalDietTitle,
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
        success: "https://dietapronta.online/approved",
        failure: "https://dietapronta.online/failure",
        pending: "https://dietapronta.online/pending",
      },

      auto_return: "approved",
      notification_url: "https://dietapronta.online/api/mp-webhook",

      external_reference: externalRefSafe,

      payer: {
        name: customer_name || undefined,
        email: customer_email || undefined,
      },

      metadata: {
        ref: extRef,
        safe_data: safeMeta,
        order_type: "main_diet",
        diet_title: finalDietTitle,
        body_type,
        imc_value,
        imc_label,
        customer_whatsapp,
      },
    };

    // ===========================================================
    // 🔹 Passo 4: criar preferência (com timeout seguro)
    // ===========================================================
    const mpController = new AbortController();
    const mpTimeout = setTimeout(() => mpController.abort(), 8000); // ⏳ 8s

    const resp = await fetch(`${MP_API}/checkout/preferences`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(prefBody),
      signal: mpController.signal,
    });

    clearTimeout(mpTimeout);

    const data = await resp.json().catch(() => null);
    log("Resposta Mercado Pago", data);

    if (!resp.ok) {
      return res.status(500).json({ error: "erro_mercado_pago", data });
    }

    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,
      external_reference: extRef,
      diet_title: finalDietTitle,
    });
  } catch (err: any) {
    log("Erro geral", err.message);
    return res.status(500).json({ error: "Erro interno" });
  }
}
