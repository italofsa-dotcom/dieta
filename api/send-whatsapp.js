export default async function handler(req, res) {
  const { phone, message } = req.body;

  const INSTANCE_ID = "123456"; // coloque o seu
  const TOKEN = "a1b2c3d4-5678-90ef-1234-567890abcdef"; // coloque o seu

  try {
    const response = await fetch(
      `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}/send-text`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message }),
      }
    );

    const result = await response.json();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
