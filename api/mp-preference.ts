// /api/mp-preference.ts
declare const process: any;
import fs from "fs";
import path from "path";

const MP_API = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// Caminho do log local (na Vercel grava em /tmp)
const LOG_PATH = path.join("/tmp", "mp_preference_log.txt");

// 🔹 Função auxiliar para log
function logToFile(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_PATH, line); } catch (err) { console.error("Log error:", err); }
  console.log(line);
}

// 🔹 Cria ou atualiza lead no servidor PHP
async function ensureLeadExists(ref: string, body: any) {
  try {
    const leadPayload = {
      name: body.customer_name || "",
      email: body.customer_email || "",
      phone: body.customer_whatsapp || "",
      diet_title: body.titulo || "",
      external_reference: ref,
      secret: "2a8e5cda3b49e2f6f72dc0d4a1f9f83e9c0fda8b2f7a3e1c4d6b9e7f5a2c1d8e",
    };

    logToFile(`[mp-preference] Enviando leadPayload ao PHP: ${JSON.stringify(leadPayload)}`);

    const r = await fetch("https://italomelo.com/server/save_lead.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leadPayload),
    });

    const data = await r.json();
    logToFile(`[mp-preference] Retorno do save_lead.php: ${JSON.stringify(data)}`);
    if (data && data.ok) return true;

    logToFile("[mp-preference] Falha ao salvar lead: " + JSON.stringify(data));
    return false;
  } catch (err: any) {
    logToFile("[mp-preference] Erro ao comunicar com save_lead.php: " + err.message);
    return false;
  }
}

// 🔹 Gera ref único
function genRef() {
  return "ref-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!ACCESS_TOKEN) return res.status(500).json({ error: "MP_ACCESS_TOKEN ausente" });

  try {
    const {
      valor = 9.9,
      titulo = "Plano de Dieta Completo",
      external_reference,
      customer_name = "",
      customer_email = "",
      customer_whatsapp = "",
    } = req.body || {};

    // 🔹 Garante ref sincronizado
    const ref = (typeof external_reference === "string" && external_reference.trim())
      ? external_reference.trim()
      : genRef();

    // 🔹 Cria o lead no banco antes do pagamento
    await ensureLeadExists(ref, req.body);

    // 🔹 Monta corpo da preferência
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
      auto_return: "all",
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
    };

    // 🔹 Cria preferência no Mercado Pago
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
      logToFile("[mp-preference] Erro ao criar preferência: " + JSON.stringify(data));
      return res.status(resp.status).json({ error: data });
    }

    logToFile(`[mp-preference] Preferência criada: ${data.id}, ref: ${ref}`);

    // 🔹 Retorna dados ao frontend
    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,
      external_reference: ref,
    });
  } catch (err: any) {
    logToFile("[mp-preference] Erro geral: " + err.message);
    return res.status(500).json({ error: "Erro interno ao criar preferência de pagamento" });
  }
}
