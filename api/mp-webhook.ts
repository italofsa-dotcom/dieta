// /api/mp-webhook.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "fs";
import path from "path";

const MP_API = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// Diretórios temporários (não persistem entre execuções na Vercel)
const DATA_DIR = path.join("/tmp");
const LOG_FILE = path.join(DATA_DIR, "mp_webhook_log.txt");
const PROCESSED_FILE = path.join(DATA_DIR, "processed_refs.json");

// === Função de log ===
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
  console.log(line);
}

// === Consulta pagamento na API do Mercado Pago ===
async function fetchPayment(id: string) {
  const url = `${MP_API}/v1/payments/${id}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!r.ok) throw new Error("Falha ao buscar pagamento: " + r.status);
  return r.json();
}

// === Consulta merchant_order e obtém o primeiro pagamento ===
async function fetchMerchantOrder(id: string) {
  const url = `${MP_API}/merchant_orders/${id}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!r.ok) throw new Error("Falha ao buscar merchant_order: " + r.status);
  const order = await r.json();
  const paymentId = order.payments && order.payments.length > 0 ? order.payments[0].id : null;
  return { order, paymentId };
}

// === Atualiza status no servidor PHP ===
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
  } catch (err: any) {
    log(`[update_status.php] erro: ${err.message}`);
  }
}

// === Controle de duplicados ===
function alreadyProcessed(paymentId: string): boolean {
  try {
    if (fs.existsSync(PROCESSED_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf8"));
      if (data.includes(paymentId)) return true;
    }
  } catch {}
  return false;
}

function markProcessed(paymentId: string) {
  try {
    let data: string[] = [];
    if (fs.existsSync(PROCESSED_FILE)) {
      data = JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf8"));
    }
    data.push(paymentId);
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify(data.slice(-500)), "utf8");
  } catch {}
}

// === Handler principal ===
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") return res.status(200).send("ok");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body: any = req.body || {};
    const topic = (req.query.topic || body.topic || body.type || "").toString();
    let paymentId =
      (req.query.id as string) ||
      (body.data && body.data.id) ||
      (body.resource && body.resource.split("/").pop()) ||
      "";

    log(`[mp-webhook] Recebido: topic=${topic}, id=${paymentId}`);

    // ================================================
    // 🔹 Caso 1 — Notificação de pagamento direto
    // ================================================
    if (topic === "payment" || body.type === "payment") {
      if (!paymentId) {
        log("[mp-webhook] Falha: paymentId ausente.");
        return res.status(200).json({ ok: true });
      }

      if (alreadyProcessed(paymentId)) {
        log(`[mp-webhook] Ignorando duplicado ${paymentId}`);
        return res.status(200).json({ ok: true, duplicate: true });
      }
      markProcessed(paymentId);

      const payment = await fetchPayment(paymentId);
      const ref = payment.external_reference || "";
      const status = payment.status || "unknown";
      log(`[mp-webhook] Payment: ${paymentId} -> ${status}, ref=${ref}`);

      if (ref && status) {
        await updateLocalStatus(ref, status);
      }
      return res.status(200).json({ ok: true });
    }

    // ================================================
    // 🔹 Caso 2 — Notificação de merchant_order (fallback)
    // ================================================
    if (topic === "merchant_order" || body.type === "merchant_order") {
      const merchantId = paymentId || (body.resource && body.resource.split("/").pop()) || "";
      if (!merchantId) {
        log("[mp-webhook] merchant_order sem id");
        return res.status(200).json({ ok: true });
      }

      log(`[mp-webhook] Fallback merchant_order ${merchantId}`);

      // Busca merchant_order -> obtém payment -> busca status real
      const { order, paymentId: pId } = await fetchMerchantOrder(merchantId);
      if (!pId) {
        log(`[mp-webhook] Nenhum pagamento vinculado à merchant_order ${merchantId}`);
        return res.status(200).json({ ok: true });
      }

      if (alreadyProcessed(pId)) {
        log(`[mp-webhook] Ignorando duplicado ${pId}`);
        return res.status(200).json({ ok: true });
      }
      markProcessed(pId);

      const payment = await fetchPayment(pId);
      const ref = payment.external_reference || "";
      const status = payment.status || "unknown";
      log(`[mp-webhook] (merchant_order) Pagamento ${pId} -> ${status}, ref=${ref}`);

      if (ref && status) {
        await updateLocalStatus(ref, status);
      }

      return res.status(200).json({ ok: true });
    }

    // ================================================
    // 🔹 Outros tipos (ignorar)
    // ================================================
    log(`[mp-webhook] Ignorado tipo: ${topic}`);
    return res.status(200).json({ ok: true, ignored: topic });

  } catch (err: any) {
    log(`[mp-webhook] Erro geral: ${err.message}`);
    return res.status(200).json({ ok: true });
  }
}
