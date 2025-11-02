// /api/mp-webhook.ts
declare const process: any;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN || ""}`,
        },
      });
      if (!r.ok) throw new Error(`Erro ao buscar pagamento: ${r.status}`);
      paymentData = await r.json();
    } else if (topic === "merchant_order") {
      // 🔹 Busca merchant_order e tenta achar o pagamento real dentro
      let attempt = 0;
      let order: any = null;

      while (attempt < 3) {
        attempt++;
        console.log(`Tentativa ${attempt}: buscando merchant_order ${id}`);

        const r = await fetch(
          `https://api.mercadopago.com/merchant_orders/${id}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN || ""}`,
            },
          }
        );

        if (!r.ok)
          throw new Error(`Erro ao buscar ordem: ${r.status}`);
        order = await r.json();

        if (order.payments && order.payments.length > 0) break;
        console.log("⚠️ Nenhum pagamento ainda vinculado, aguardando 5s...");
        await sleep(5000);
      }

      if (order && order.payments && order.payments.length > 0) {
        const paymentId = order.payments[0].id;
        console.log("🔹 ID do pagamento encontrado:", paymentId);

        const p = await fetch(
          `https://api.mercadopago.com/v1/payments/${paymentId}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN || ""}`,
            },
          }
        );
        if (!p.ok)
          throw new Error(`Erro ao buscar pagamento da ordem: ${p.status}`);
        paymentData = await p.json();
      } else {
        console.log("❌ Nenhum pagamento encontrado dentro da ordem após tentativas");
      }
    }

    if (!paymentData) {
      console.log("❌ Nenhum dado de pagamento obtido");
      return res.status(200).json({ ok: true });
    }

    const ref = paymentData.external_reference || "";
    const status = paymentData.status || "desconhecido";

    console.log(`[mp-webhook] Atualizando status '${status}' para ref '${ref}'`);

    // ----------------------------------------------
    // 🧩 Envio compatível com hospedagem PHP (form-data)
    // ----------------------------------------------
    const formData = new URLSearchParams();
    formData.append("ref", ref);
    formData.append("status", status);

    const phpResp = await fetch("https://italomelo.com/server/update_status.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const retornoPHP = await phpResp.text();
    console.log("🔁 Retorno do update_status.php:", retornoPHP);

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("🔥 ERRO no webhook:", err);
    return res.status(200).json({ ok: true });
  }
}
