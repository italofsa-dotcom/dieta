// /api/admin/sales.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';
const DATA_FILE = path.join(process.cwd(), 'data', 'sales.json');

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

function basicAuth(req: VercelRequest) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const b = Buffer.from(h.split(' ')[1], 'base64').toString('utf8');
  const [u,p] = b.split(':');
  return (u === ADMIN_USER && p === ADMIN_PASS);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ADMIN_USER || !ADMIN_PASS) return res.status(500).json({ error: 'ADMIN_USER/ADMIN_PASS não configurados' });

  if (!basicAuth(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin area"');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Se Airtable configurado, preferível retornar de lá (opcional implementar)
  // Aqui: lemos arquivo local criado pelo webhook/mp-preference
  if (!fs.existsSync(DATA_FILE)) return res.status(200).json([]);
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const arr = JSON.parse(raw || '[]');
  // opcional: ordenar por created_at desc
  arr.sort((a:any,b:any) => (b.created_at || '').localeCompare(a.created_at || ''));
  return res.status(200).json(arr);
}
