// /api/mp-webhook.ts
// Webhook do Mercado Pago integrado ao painel PHP do italomelo.com
// Recebe notificações de pagamento, busca o status e atualiza o banco via update_status.php

declare const process: any; // evita erro de tipagem no TypeScript

export default async function handler(req: any, res: any) {
  console.log("=== Mercado Pago Webhook Recebido ===");

  // Permite apenas POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Corpo enviado pelo Mercado Pago
    const body: any = req.body || {};
    console.log("Body recebido:", body);

    // Captura o ID do pagamento (varia conforme o tipo de notificação)
    const topic = body.type || req.query.topic || "sem topic";
    const paymentId =
      body.data?.id || req.query.id || body.resource?.split("/").pop() || null;

    console.log("Topic:", topic, "PaymentID:", paymentId);

    // Se não veio um ID, encerra
    if (!paymentId) {
      console.log("❌ Nenhum ID de pagamento recebido");
      return res.status(200).json({ ok: true, msg: "sem id" });
    }

    // Busca os detalhes do pagamento no Mercado Pago
    const paymentResp = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN || ""}`,
        },
      }
    );

    if (!paymentResp.ok) {
      console.log("❌ Erro ao buscar pagamento:", paymentResp.status);
      return res
        .status(200)
        .json({ ok: true, msg: "erro ao buscar pagamento" });
    }

    const payment = await paymentResp.json();
    console.log("✅ Pagamento recebido:", payment);

    const ref = payment.external_reference || "";
    const status = payment.status || "desconhecido";

    // Log para debug
    console.log(`[mp-webhook] Atualizando status '${status}' para ref '${ref}'`);

    // Envia para o servidor PHP (italomelo.com)
    const phpResp = await fetch(
      "https://italomelo.com/server/update_status.php",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref, status }),
      }
    );

    const retornoPHP = await phpResp.text();
    console.log("🔁 Retorno do update_status.php:", retornoPHP);

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("🔥 ERRO no webhook:", err);
    return res.status(200).json({ ok: true });
  }
}
