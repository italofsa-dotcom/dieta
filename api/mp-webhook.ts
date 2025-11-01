// /api/mp-webhook.ts
// import fetch from 'node-fetch';

export default async function handler(req: any, res: any) {
  console.log("=== Mercado Pago Webhook Recebido ===");
  console.log("Headers:", req.headers);
  console.log("Query:", req.query);
  console.log("Body:", req.body);

import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';

const MP_API = 'https://api.mercadopago.com';
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN; // use seu token real do Mercado Pago

async function fetchPayment(id: string) {
  const r = await fetch(`${MP_API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
  });
  if (!r.ok) throw new Error('Erro ao buscar pagamento: ' + r.status);
  return r.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("=== Mercado Pago Webhook Recebido ===");
  console.log("Headers:", req.headers);
  console.log("Query:", req.query);
  console.log("Body:", req.body);

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body: any = req.body || {};
    const topic = body.type || req.query.topic || "sem topic";
    const paymentId = body.data?.id || req.query.id || null;

    console.log("Topic:", topic, "PaymentID:", paymentId);

    if (!paymentId) {
      console.log("❌ Nenhum ID de pagamento recebido");
      return res.status(200).json({ ok: true, msg: "sem id" });
    }

    const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });

    if (!r.ok) {
      console.log("❌ Falha ao buscar pagamento:", r.status);
      return res.status(200).json({ ok: true, msg: "erro ao buscar pagamento" });
    }

    const payment = await r.json();
    console.log("✅ Pagamento recebido:", payment);

    const ref = payment.external_reference || "";
    const status = payment.status || "desconhecido";

    // envia para o servidor PHP
    const response = await fetch("https://italomelo.com/server/update_status.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, status })
    });

    console.log("🔁 update_status.php retornou:", await response.text());

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("🔥 ERRO no webhook:", err);
    return res.status(200).json({ ok: true });
  }
}
