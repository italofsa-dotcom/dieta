// /api/mp-webhook.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const MP_API = 'https://api.mercadopago.com';
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE_NAME || 'Vendas';

// ⚙️ Configuração do banco MySQL (do seu cPanel)
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'figa2041_dieta_user',
  password: process.env.DB_PASS || 'SENHA_AQUI',
  database: process.env.DB_NAME || 'figa2041_dieta',
};

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'sales.json');

async function fetchPayment(id: string) {
  const r = await fetch(`${MP_API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
  });
  if (!r.ok) throw new Error('MP fetch payment failed: ' + r.status);
  return r.json();
}

async function updateMySQLStatus(externalRef: string, status: string) {
  try {
    const conn = await mysql.createConnection(DB_CONFIG);
    const [rows] = await conn.execute(
      'UPDATE leads SET status = ? WHERE ref = ?',
      [status, externalRef]
    );
    await conn.end();
    console.log('[mp-webhook] MySQL atualizado:', externalRef, status);
    return rows;
  } catch (err) {
    console.error('[mp-webhook] erro ao atualizar MySQL:', err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.status(200).send('ok');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body: any = req.body || {};
    let topic = (req.query.topic || body.topic || body.type || '').toString();
    let paymentId = (req.query.id as string) || (body.data && body.data.id) || (body.resource && body.resource.split('/').pop()) || '';

    console.log('[mp-webhook] incoming', topic, paymentId);

    if ((topic === 'payment' || body.type === 'payment') && paymentId) {
      try {
        const payment = await fetchPayment(paymentId);
        const ext = payment.external_reference || '';
        const status = payment.status; // approved, pending, rejected...

        // 🔄 Atualiza MySQL
        if (ext && status) await updateMySQLStatus(ext, status);

        // 🔄 (mantém Airtable e backup local)
        // ... seu código atual de Airtable e JSON pode permanecer aqui ...

        return res.status(200).json({ ok: true });
      } catch (e: any) {
        console.error('[mp-webhook] fetch/payment error', e);
        return res.status(200).json({ ok: true });
      }
    }

    console.log('[mp-webhook] unhandled:', JSON.stringify(body).slice(0, 500));
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[mp-webhook] error', err);
    return res.status(200).json({ ok: true });
  }
}
