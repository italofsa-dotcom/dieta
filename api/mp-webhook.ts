// /api/mp-webhook.ts
declare const process: any;

export default async function handler(req: any, res: any) {
  console.log("=== Mercado Pago Webhook Recebido ===");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body: any = req.body || {};
    console.log("Body recebido:", body);

    let topic = body.topic || body.type || "sem topic";
    let id = body.data?.id || body.id || body.resource?.split("/").pop();

    console.log("Tipo de evento:", topic, "ID:", id);

    if (!id) {
      console.log("❌ Nenhum ID encontrado");
      return res.status(200).json({ ok: true });
    }

    let paymentData: any = null;

    if (topic === "payment") {
      // 🔹 Busca direta por pagamento
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN || ""}` },
      });
      if (!r.ok) throw new Error(`Erro ao buscar pagamento: ${r.status}`);
      paymentData = await r.json();
    } else if (topic === "merchant_order") {
      // 🔹 Busca ordem e extrai o pagamento de dentro
      const r = await fetch(`https://api.mercadopago.com/merchant_orders/${id}`, {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN || ""}` },
      });
      if (!r.ok) throw new Error(`Erro ao buscar ordem: ${r.status}`);
      const order = await r.json();
      console.log("🧾 Ordem recebida:", order);

      if (order.payments && order.payments.length > 0) {
        const paymentId = order.payments[0].id;
        console.log("🔹 ID do pagamento encontrado:", paymentId);

        const p = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN || ""}` },
        });
        if (!p.ok) throw new Error(`Erro ao buscar pagamento da ordem: ${p.status}`);
        paymentData = await p.json();
      } else {
        console.log("❌ Nenhum pagamento encontrado dentro da ordem");
      }
    }

    if (!paymentData) {
      console.log("❌ Nenhum dado de pagamento obtido");
      return res.status(200).json({ ok: true });
    }

    const ref = paymentData.external_reference || "";
    const status = paymentData.status || "desconhecido";

    console.log(`[mp-webhook] Atualizando status '${status}' para ref '${ref}'`);

    // Envia para o servidor PHP
    const phpResp = await fetch("https://italomelo.com/server/update_status.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, status }),
    });

    const retornoPHP = await phpResp.text();
    console.log("🔁 Retorno do update_status.php:", retornoPHP);

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("🔥 ERRO no webhook:", err);
    return res.status(200).json({ ok: true });
  }
}
