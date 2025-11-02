// /api/mp-webhook.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "fs";
import path from "path";

const MP_API = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// Diretórios temporários da Vercel (não persistem entre deploys)
const DATA_DIR = path.join("/tmp");
const PROCESSED_FILE = path.join(DATA_DIR, "processed_refs.json");
const LOG_FILE = path.join(DATA_DIR, "mp_webhook_log.txt");

// === Função auxiliar para log ===
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
  console.log(line);
}

// === Busca detalhes do pagamento ===
async function fetchPayment(id: string) {
  const r = await fetch(`${MP_API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!r.ok) throw new Error("MP fetch payment failed: " + r.status);
  return r.json();
}

// === Atualiza o status no banco PHP ===
async function updateLocalStatus(ref: string, status: string) {
  try {
    const resp = await fetch("https://italomelo.com/server/update_status.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, status }),
    });
    const text = await resp.text();
    log(`[update_status.php] ${text}`);
    return text;
  } catch (e: any) {
    log("[update_status.php] erro: " + e.message);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") return res.status(200).send("ok");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const body: any = req.body || {};
    const topic = (req.query.topic || body.topic || body.type || "").toString();
    let paymentId =
      (req.query.id as string) ||
      (body.data && body.data.id) ||
      (body.resource && body.resource.split("/").pop()) ||
      "";

    log(`[mp-webhook] Recebido: topic=${topic} id=${paymentId}`);

    // ================================================
    // ✅ Ignora notificações que não sejam de "payment"
    // ================================================
    if (topic !== "payment" && body.type !== "payment") {
      log(`[mp-webhook] Ignorado tipo não-payment: ${topic}`);
      return res.status(200).json({ ok: true, ignored: topic });
    }

    // ================================================
    // ✅ Evita processar notificações duplicadas
    // ================================================
    let processed: string[] = [];
    try {
      if (fs.existsSync(PROCESSED_FILE)) {
        processed = JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf8"));
      }
    } catch {}

    if (processed.includes(paymentId)) {
      log(`[mp-webhook] Ignorando duplicado ${paymentId}`);
      return res.status(200).json({ ok: true, duplicate: true });
    }

    // Marca como processado (mantém últimos 500)
    processed.push(paymentId);
    try {
      fs.writeFileSync(
        PROCESSED_FILE,
        JSON.stringify(processed.slice(-500)),
        "utf8"
      );
    } catch {}

    // ================================================
    // 🔍 Busca detalhes do pagamento no Mercado Pago
    // ================================================
    if (!paymentId) {
      log("[mp-webhook] Nenhum paymentId encontrado no payload.");
      return res.status(200).json({ ok: true });
    }

    const payment = await fetchPayment(paymentId);
    const ref = payment.external_reference || "";
    const status = payment.status; // approved, pending, rejected...
    const detail = payment.status_detail;
    const amount = payment.transaction_amount;
    const payerEmail = payment.payer?.email || "";
    const method = payment.payment_method_id || "";

    log(
      `[mp-webhook] Pagamento ${paymentId} -> status=${status}, ref=${ref}, valor=${amount}, email=${payerEmail}, metodo=${method}`
    );

    // ================================================
    // 🔄 Atualiza status no painel PHP
    // ================================================
    if (ref && status) {
      const response = await updateLocalStatus(ref, status);
      log(
        `[mp-webhook] Atualizando status '${status}' para ref '${ref}' => ${response}`
      );
    } else {
      log("[mp-webhook] Falha: sem ref ou status válido no pagamento.");
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    log(`[mp-webhook] Erro geral: ${err.message}`);
    return res.status(200).json({ ok: true });
  }
}
