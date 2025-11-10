export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const data = req.body;

  // Exemplo: responder automaticamente
  if (data.message && data.message.text) {
    console.log("📩 Mensagem recebida:", data.message.text);
  }

  // Confirma que recebeu o webhook
  res.status(200).json({ status: 'ok' });
}
