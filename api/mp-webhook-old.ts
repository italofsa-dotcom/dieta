// /api/mp-webhook.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const MP_API = 'https://api.mercadopago.com';
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE_NAME || 'Vendas';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'sales.json');

async function fetchPayment(id: string) {
  const r = await fetch(`${MP_API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
  });
  if (!r.ok) throw new Error('MP fetch payment failed: ' + r.status);
  return r.json();
}

async function updateAirtableByExternalRef(extRef: string, updates: any) {
  // Airtable: precisamos buscar o registro e então atualizar
  const urlSearch = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}?filterByFormula=${encodeURIComponent(`{external_reference}='${extRef}'`)}`;
  const r1 = await fetch(urlSearch, { headers: { Authorization: `Bearer ${AIRTABLE_KEY}` } });
  const body = await r1.json();
  if (!r1.ok) throw new Error('Airtable search failed: ' + JSON.stringify(body));
  if (!body.records || body.records.length === 0) return null;

  const rec = body.records[0];
  const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}/${rec.id}`;
  const ru = await fetch(updateUrl, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: updates })
  });
  const updated = await ru.json();
  if (!ru.ok) throw new Error('Airtable update failed: ' + JSON.stringify(updated));
  return updated;
}

function ensureLocalDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]), 'utf8'); }
function updateLocalByExternalRef(extRef: string, updates: any) {
  ensureLocalDir();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const arr = JSON.parse(raw || '[]');
  let found = false;
  const now = new Date().toISOString();
  for (let i=0;i<arr.length;i++){
    if (arr[i].external_reference === extRef) {
      arr[i] = { ...arr[i], ...updates, updated_at: now };
      found = true; break;
    }
  }
  if (!found) {
    // se não achou, cria um novo
    arr.push({ external_reference: extRef, ...updates, created_at: now, updated_at: now });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8');
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.status(200).send('ok');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body:any = req.body || {};
    // O Mercado Pago pode enviar vários formatos; capturamos o payment id / external reference
    let topic = (req.query.topic || body.topic || body.type || '').toString();
    let paymentId = (req.query.id as string) || (body.data && body.data.id) || (body.resource && body.resource.split('/').pop()) || '';

    console.log('[mp-webhook] incoming', topic, paymentId, body);

    if ((topic === 'payment' || body.type === 'payment') && paymentId) {
      try {
        const payment = await fetchPayment(paymentId);
        const ext = payment.external_reference || '';
        const status = payment.status; // approved, pending, rejected...
        const status_detail = payment.status_detail;
        const date_approved = payment.date_approved || null;
        const amount = payment.transaction_amount || payment.order?.total_amount || null;
        const payer = payment.payer || {};

        const updates:any = {
          status,
          status_detail: status_detail || '',
          date_approved: date_approved || '',
          amount: amount || 0,
          payer_email: (payer.email || '').toString(),
          payer_phone: (payer.phone && payer.phone.number) ? payer.phone.number : (payer.phone && payer.phone.area_code ? payer.phone.area_code + payer.phone.number : '')
        };

        if (AIRTABLE_KEY && AIRTABLE_BASE) {
          try {
            const up = await updateAirtableByExternalRef(ext, updates);
            console.log('[mp-webhook] airtable updated', up && up.id);
          } catch (e:any) {
            console.error('[mp-webhook] airtable update failed', e);
            updateLocalByExternalRef(ext, { ...updates });
          }
        } else {
          updateLocalByExternalRef(ext, updates);
        }

        // Responde rápido
        return res.status(200).json({ ok: true });
      } catch (e:any) {
        console.error('[mp-webhook] fetch/payment error', e);
        return res.status(200).json({ ok: true }); // responder 200 para evitar re-trys massivos
      }
    }

    // Se formato diferente, apenas loga e 200
    console.log('[mp-webhook] unhandled:', JSON.stringify(body).slice(0,500));
    return res.status(200).json({ ok: true });
  } catch (err:any) {
    console.error('[mp-webhook] error', err);
    return res.status(200).json({ ok: true });
  }
}
