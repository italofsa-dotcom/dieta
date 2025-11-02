// /api/mp-preference.ts
declare const process: any;
import fs from "fs";
import path from "path";

const MP_API = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// Caminho do arquivo de log local (na Vercel isso grava no /tmp)
const LOG_PATH = path.join("/tmp", "mp_preference_log.txt");

// Função auxiliar para gravar log
function logToFile(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (err) {
    console.error("Erro ao gravar log temporário:", err);
  }
  console.log(line);
}

// 🔹 Função que cria o lead no servidor PHP e retorna o "ref"
async function createLeadAndGetRef(body: any) {
  try {
    const leadPayload = {
      name: body.customer_name || "",
      email: body.customer_email || "",
      phone: body.customer_whatsapp || "",
      diet_title: body.titulo || "",
      secret:
        "2a8e5cda3b49e2f6f72dc0d4a1f9f83e9c0fda8b2f7a3e1c4d6b9e7f5a2c1d8e",
    };

    logToFile("[mp-preference] Enviando leadPayload: " + JSON.stringify(leadPayload));

    const response = await fetch("https://italomelo.com/server/save_lead.php", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(leadPayload),
    });

    const data = await response.json();
    logToFile("[mp-preference] Retorno do PHP: " + JSON.stringify(data));

    if (data && data.ok && data.ref) {
      logToFile(`[mp-preference] Lead criado com sucesso: ${data.ref}`);
      return data.ref;
    } else {
      logToFile("[mp-preference] Erro ao criar lead: " + JSON.stringify(data));
      return "ref-" + Date.now();
    }
  } catch (err: any) {
    logToFile("[mp-preference] Erro comunicação PHP: " + err.message);
    return "ref-" + Date.now();
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  if (!ACCESS_TOKEN)
    return res.status(500).json({ error: "MP_ACCESS_TOKEN ausente" });

  try {
    const {
      valor = 9.9,
      titulo = "Plano de Dieta Completo",
      customer_name = "",
      customer_email = "",
      customer_whatsapp = "",
    } = req.body || {};

    // 🔹 Passo 1: cria o lead e obtém o mesmo ref do banco
    const ref = await createLeadAndGetRef(req.body);

    // 🔹 Passo 2: cria a preferência do Mercado Pago
    const prefBody = {
      items: [
        {
          title: String(titulo),
          quantity: 1,
          unit_price: Number(valor),
          currency_id: "BRL",
        },
      ],
      back_urls: {
        success: "https://dietapronta.online/approved",
        failure: "https://dietapronta.online/failure",
        pending: "https://dietapronta.online/pending",
      },
      auto_return: "approved",
      notification_url: "https://dietapronta.online/api/mp-webhook",
      external_reference: ref,
      payer: {
        name: customer_name || "Cliente DietaPronta",
        email:
          customer_email && customer_email.includes("@")
            ? customer_email
            : `cliente_${ref}@dietapronta.online`,
      },
      payment_methods: {
        installments: 1,
        excluded_payment_types: [{ id: "ticket" }],
      },
      purpose: "wallet_purchase",
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

    if (!resp.ok) {
      logToFile("MP preference error: " + JSON.stringify(data));
      return res.status(resp.status).json({ error: data });
    }

    logToFile(`[mp-preference] Preferência criada com sucesso: ${data.id}`);
    logToFile(
      `[mp-preference] init_point: ${data.init_point} | ref: ${ref} | valor: ${valor} | email: ${customer_email}`
    );

    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,
      external_reference: ref,
    });
  } catch (err: any) {
    logToFile("[mp-preference] Erro geral: " + err.message);
    return res
      .status(500)
      .json({ error: "Erro interno ao criar preferência de pagamento" });
  }
}
