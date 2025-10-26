// /api/mp-preference.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch'; // se necessário no seu ambiente

const MP_API = 'https://api.mercadopago.com';
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// Airtable config (opcional)
const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE_NAME || 'Vendas';

// Local fallback file
import fs from 'fs';
import path from 'path';
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'sales.json');

async function saveRecordToAirtable(record: any) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AIRTABLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: record })
  });
  const data = await r.json();
  if (!r.ok) throw new Error('Airtable error: ' + JSON.stringify(data));
  return data;
}

function ensureLocalDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]), 'utf8');
}

function saveRecordLocal(record: any) {
  ensureLocalDir();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const arr = JSON.parse(raw || '[]');
  arr.push(record);
  fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8');
  return record;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ACCESS_TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN ausente' });

  const { valor = 9.9, titulo = 'Plano de Dieta Completo', external_reference, customer_name, customer_email, customer_whatsapp } = req.body || {};

  if (!external_reference || typeof external_reference !== 'string') {
    return res.status(400).json({ error: 'external_reference obrigatório' });
  }

  try {
    // 1) cria preferência no Mercado Pago
    const prefBody = {
      items: [{ title: String(titulo), quantity: 1, unit_price: Number(valor), currency_id: 'BRL' }],
      back_urls: {
        success: 'https://dietapronta.online/approved',
        failure: 'https://dietapronta.online/failure',
        pending: 'https://dietapronta.online/pending'
      },
      auto_return: 'approved',
      notification_url: 'https://dietapronta.online/api/mp-webhook',
      external_reference
    };

    const resp = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(prefBody)
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error('MP preference error:', data);
      return res.status(resp.status).json({ error: data });
    }

    // 2) registra a venda (preliminar) na Airtable ou local
    const now = new Date().toISOString();
    const record = {
      external_reference,
      mp_preference_id: data.id,
      init_point: data.init_point || '',
      customer_name: customer_name || '',
      customer_email: customer_email || '',
      customer_whatsapp: customer_whatsapp || '',
      amount: Number(valor),
      status: 'created',
      created_at: now,
      updated_at: now
    };

    let saved = record;
    if (AIRTABLE_KEY && AIRTABLE_BASE) {
      try { const at = await saveRecordToAirtable(record); saved = { ...record, airtable_id: at.id }; }
      catch (e) { console.error('Airtable save failed, fallback to local', e); saveRecordLocal(record); }
    } else {
      saveRecordLocal(record);
    }

    return res.status(200).json({ id: data.id, init_point: data.init_point, external_reference, saved });
  } catch (err:any) {
    console.error('mp-preference err', err);
    return res.status(500).json({ error: 'Erro interno ao criar preferência' });
  }
}
