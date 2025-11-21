import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "fs";
import path from "path";

const MP_API = "https://api.mercadopago.com";
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const DATA_DIR = "/tmp";
const LOG_FILE = path.join(DATA_DIR, "mp_webhook_log.txt");

// =============================================================
// 🔥 Função de conversão Google Ads (Server-side)
// =============================================================
async function sendGoogleAdsConversion(value: number, currency: string = "BRL") {
  const conversionId = "17661147688";
  const conversionLabel = "q7jPCMKArLQbEKj0vuVB";

  const url =
    `https://www.googleadservices.com/pagead/conversion/${conversionId}/?` +
    `label=${conversionLabel}&value=${encodeURIComponent(value)}` +
    `&currency=${encodeURIComponent(currency)}&guid=ON&script=0`;

  try {
    const resp = await fetch(url);
    const text = await resp.text();

    const logPath = path.join(DATA_DIR, "google_ads_log.txt");
    fs.appendFileSync(
      logPath,
      `[${new Date().toISOString()}] Google Ads Conversion Sent → ${url} | resp=${text}\n`
    );
  } catch (e: any) {
    const logPath = path.join(DATA_DIR, "google_ads_log.txt");
    fs.appendFileSync(
      logPath,
      `[${new Date().toISOString()}] ERRO Google Ads → ${e.message}\n`
    );
  }
}

// ========== LOG UTIL ==========
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
  console.log(line);
}

// ========== FUNÇÕES DE CONSULTA ==========
async function fetchPayment(id: string) {
  const r = await fetch(`${MP_API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!r.ok) throw new Error(`fetchPayment ${r.status}`);
  return r.json();
}

async function fetchMerchantOrder(id: string) {
  const r = await fetch(`${MP_API}/merchant_orders/${id}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!r.ok) throw new Error(`fetchMerchantOrder ${r.status}`);
  const order = await r.json();
  const paymentId = order.payments?.[0]?.id || null;
  return { order, paymentId };
}

async function updateLocalStatus(ref: string, status: string) {
  try {
    const resp = await fetch("https://italomelo.com/server/update_status.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, status }),
    });
    const text = await resp.text();
    log(`[update_status.php] ${text}`);
  } catch (e: any) {
    log(`[update_status.php] erro: ${e.message}`);
  }
}

// ========== RECHECAGEM ==========
async function recheckPayment(paymentId: string, ref: string, delaySec: number) {
  log(`[recheck] aguardando ${delaySec}s para reconsultar ${paymentId}`);
  await new Promise((r) => setTimeout(r, delaySec * 1000));

  try {
    const payment = await fetchPayment(paymentId);
    const status = payment.status || "unknown";
    log(`[recheck] pagamento ${paymentId} após ${delaySec}s -> ${status}`);

    if (status === "approved") {
      await updateLocalStatus(ref, status);
      log(`[recheck] ✅ confirmado e atualizado (${ref})`);

      // 🚀 Envia conversão Google Ads
      const value = payment.transaction_amount || 0;
      await sendGoogleAdsConversion(value);
    }
  } catch (e: any) {
    log(`[recheck] erro ao reconsultar: ${e.message}`);
  }
}

// =============================================================
// 🔥 NORMALIZA external_reference
// =============================================================
function extractRef(extRefRaw: string = "") {
  if (!extRefRaw) return { ref: "", extra: null };

  if (extRefRaw.includes("##")) {
    const [ref, extra] = extRefRaw.split("##");
    log(`[mp-webhook] external_reference expandido -> ref=${ref}`);
    return { ref, extra };
  }

  return { ref: extRefRaw, extra: null };
}

// =============================================================
// HANDLER PRINCIPAL
// =============================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") return res.status(200).send("ok");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body: any = req.body || {};
    const topic = (req.query.topic || body.topic || body.type || "").toString();

    let id =
      (req.query.id as string) ||
      (body.data && body.data.id) ||
      (body.resource && body.resource.split("/").pop()) ||
      "";

    log(`[mp-webhook] Recebido: topic=${topic} id=${id}`);

    // =============================================================
    // === CASO 1: payment ===
    // =============================================================
    if (topic === "payment" || body.type === "payment") {
      const payment = await fetchPayment(id);

      const extRefRaw = payment.external_reference || "";
      const { ref } = extractRef(extRefRaw);

      const status = payment.status || "unknown";
      log(`[mp-webhook] Payment ${id} -> status=${status}, ref=${ref}`);

      if (ref && status) {
        await updateLocalStatus(ref, status);

        // 🚀 Se aprovado → Envia conversão Google Ads
        if (status === "approved") {
          const value = payment.transaction_amount || 0;
          await sendGoogleAdsConversion(value);
        }

        if (status === "pending") {
          recheckPayment(id, ref, 30);
          recheckPayment(id, ref, 60);
        }
      }

      return res.status(200).json({ ok: true });
    }

    // =============================================================
    // === CASO 2: merchant_order ===
    // =============================================================
    if (topic === "merchant_order" || body.type === "merchant_order") {
      const merchantId =
        id || (body.resource && body.resource.split("/").pop()) || "";

      if (!merchantId) {
        log("[mp-webhook] merchant_order sem id");
        return res.status(200).json({ ok: true });
      }

      const { paymentId } = await fetchMerchantOrder(merchantId);

      if (!paymentId) {
        log(`[mp-webhook] Nenhum pagamento vinculado à merchant_order ${merchantId}`);
        return res.status(200).json({ ok: true });
      }

      const payment = await fetchPayment(paymentId);

      const extRefRaw = payment.external_reference || "";
      const { ref } = extractRef(extRefRaw);

      const status = payment.status || "unknown";
      log(`[mp-webhook] merchant_order → pag ${paymentId} -> ${status}, ref=${ref}`);

      if (ref && status) {
        await updateLocalStatus(ref, status);

        // 🚀 Se aprovado → Envia conversão Google Ads
        if (status === "approved") {
          const value = payment.transaction_amount || 0;
          await sendGoogleAdsConversion(value);
        }

        if (status === "pending") {
          recheckPayment(paymentId, ref, 30);
          recheckPayment(paymentId, ref, 60);
        }
      }

      return res.status(200).json({ ok: true });
    }

    // =============================================================
    // IGNORADOS
    // =============================================================
    log(`[mp-webhook] Ignorado topic/type: ${topic}`);
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    log(`[mp-webhook] ERRO GERAL: ${e.message}`);
    return res.status(200).json({ ok: true });
  }
}
