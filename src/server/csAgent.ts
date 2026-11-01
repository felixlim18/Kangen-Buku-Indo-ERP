// Agent AI balas chat pelanggan di LINE OA "Kangenbukuindo CS" (channel terpisah dari bot ERP).
//
// Mode DRAFT: pelanggan chat ke bot CS -> Gemini menyusun balasan dari katalog (harga & stok) dan
// riwayat chat -> owner menerima draft lewat bot ERP (settings/line.ownerUserId) dengan tombol
// ✅ Kirim / ✏️ Ubah / ❌ Abaikan -> baru setelah "Kirim" balasan di-push ke pelanggan lewat bot CS.
// Tidak ada pesan yang sampai ke pelanggan tanpa persetujuan owner.
//
// Kredensial: LINE_CS_CHANNEL_SECRET & LINE_CS_CHANNEL_ACCESS_TOKEN (npm run line-cs:setup).
// Info toko untuk AI (ongkir, cara bayar, jam buka, dll) diisi bebas di settings/csAgent.storeInfo.
// Data: lineCsChats/{lineUserId} (riwayat), lineCsDrafts/{id} (draft), lineCsSessions/{ownerId} (mode ubah).

import crypto from 'crypto';
import { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { getDb, isAdminConfigured, Timestamp } from './firestore-admin';
import { getPhysicalOnHandStockForBook } from '../lib/inventory-utils';

type LineMessage = { type: string; [key: string]: any };

const AGENT_MODELS = ['gemini-3.6-flash', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite'];
const HISTORY_LIMIT = 12;              // pesan terakhir yang disimpan & dikirim ke AI
const MAX_CANDIDATE_BOOKS = 12;
const EDIT_TTL_MS = 15 * 60 * 1000;

const db = () => getDb();
const csToken = () => (process.env.LINE_CS_CHANNEL_ACCESS_TOKEN || '').trim();
const fmtNTD = (cents: number) => `NT$ ${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const tsMs = (v: any): number => (v && typeof v.toMillis === 'function' ? v.toMillis() : 0);
const text = (t: string): LineMessage => ({ type: 'text', text: t.slice(0, 5000) });

async function pushLine(token: string, to: string, messages: LineMessage[]) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) throw new Error(`Gagal push LINE (${res.status}): ${await res.text()}`);
}

// Token & ID owner di bot ERP (sama dengan shipAgent.ts).
async function ownerTarget(): Promise<{ token: string; ownerId: string }> {
  const s = (await db().doc('settings/line').get()).data() || {};
  return {
    token: String(process.env.LINE_CHANNEL_ACCESS_TOKEN || s.channelAccessToken || '').trim(),
    ownerId: String(s.ownerUserId || '').trim(),
  };
}

async function customerName(userId: string): Promise<string> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, { headers: { Authorization: `Bearer ${csToken()}` } });
    if (res.ok) return (await res.json() as any).displayName || 'Pelanggan';
  } catch { /* nama tidak wajib */ }
  return 'Pelanggan';
}

// ---- Katalog: buku yang relevan dengan chat, lengkap dengan harga & stok -------------------------

const STOPWORDS = new Set(('ada ini itu yang dan atau mau ingin beli pesan order buku novel kak kakak min admin halo hai '
  + 'tolong bisa apa berapa harga stok ready masih ya dong nya saya aku untuk dari dengan judul karya terima kasih').split(' '));

const tokensOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9一-鿿\s]/g, ' ').split(/\s+/)
  .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

export async function findCandidateBooks(chatText: string) {
  const tokens = [...new Set(tokensOf(chatText))];
  if (!tokens.length) return [];
  const books = (await db().collection('catalog').get()).docs
    .map((d) => ({ id: d.id, ...d.data() } as any))
    .filter((b) => b.isActive !== false);
  const scored = books.map((b) => {
    const hay = `${b.bookNameLower || String(b.bookName || '').toLowerCase()} ${String(b.author || '').toLowerCase()}`;
    return { b, score: tokens.filter((t) => hay.includes(t)).length };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATE_BOOKS);
  if (!scored.length) return [];

  // Stok siap jual = stok fisik (sama dengan badge "Stok Siap") dikurangi qty di SO Pending.
  const [inv, ledger, pos, sos, damaged] = await Promise.all(
    ['inventory', 'inventoryLedger', 'purchaseOrders', 'salesOrders', 'damagedStock'].map((c) => db().collection(c).get()),
  );
  const invList = inv.docs.map((d) => d.data());
  const ledgerList = ledger.docs.map((d) => d.data());
  const poList = pos.docs.map((d) => ({ id: d.id, ...d.data() }));
  const soList = sos.docs.map((d) => d.data());
  const damagedList = damaged.docs.map((d) => d.data());
  const pendingQty = (bookId: string) => soList
    .filter((so: any) => (!so.status || so.status === 'draft') && !so.isDraft)
    .flatMap((so: any) => so.items || [])
    .filter((it: any) => it.bookId === bookId && !it.markedTertinggal && !it.markedRefund)
    .reduce((n: number, it: any) => n + (it.qty || 0), 0);

  return scored.map(({ b }) => ({
    judul: b.bookName,
    penulis: b.author || '',
    harga: b.generalPrice ? fmtNTD(b.generalPrice) : 'belum ada harga',
    // Angka stok tidak diberikan ke AI supaya tidak diumbar ke pelanggan; owner tetap menyetujui tiap balasan.
    stok: getPhysicalOnHandStockForBook(b.id, invList, ledgerList, poList, soList, damagedList) - pendingQty(b.id) > 0 ? 'ready' : 'kosong',
  }));
}

// ---- Gemini -------------------------------------------------------------------------------------

export interface CsDraft { balasan: string; perluOwner?: boolean; catatanOwner?: string }

export async function draftReply(history: Array<{ from: 'pelanggan' | 'toko'; text: string }>, books: any[], storeInfo: string): Promise<CsDraft> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY belum dikonfigurasi di server.');
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `Anda customer service toko buku "KangenBukuIndo" di Taiwan yang menjual buku-buku Indonesia.
Pelanggan umumnya orang Indonesia di Taiwan. Tulis balasan untuk pesan TERAKHIR pelanggan, dengan konteks riwayat chat.

Gaya: Bahasa Indonesia santai tapi sopan (panggil "Kak"), singkat seperti chat LINE (maks ~5 kalimat), boleh 1-2 emoji.
Kalau pelanggan menulis bahasa lain (Mandarin/Inggris), balas dengan bahasa itu.

Data katalog yang cocok dengan chat (harga dalam NT$, stok ready = bisa langsung dikirim):
${books.length ? JSON.stringify(books) : '(tidak ada buku yang cocok dengan kata kunci chat)'}

Info toko dari owner:
${storeInfo.trim() || '(belum diisi)'}

Aturan:
- HANYA pakai harga, stok, dan info toko di atas. JANGAN mengarang harga, stok, ongkir, waktu kirim, diskon, atau kebijakan.
- stok kosong -> bilang stok sedang kosong dan tawarkan untuk dicek/di-PO-kan admin.
- Pelanggan mau pesan -> konfirmasi judul, jumlah, dan total harga buku, lalu minta data pengiriman sesuai info toko.
- Buku tidak ada di data -> minta judul/penulis yang lebih lengkap, atau bilang admin akan cek dulu.
- Pertanyaan status pesanan, pembayaran, komplain, retur, atau apa pun yang tidak ada datanya -> jawab sopan bahwa admin akan cek, dan set perluOwner = true.
- Jawab dengan SATU objek JSON: {"balasan": string, "perluOwner": boolean, "catatanOwner": string}
  catatanOwner = catatan singkat untuk owner (mis. apa yang perlu dicek), kosongkan jika tidak ada.`;

  const transcript = history.map((h) => `${h.from === 'pelanggan' ? 'Pelanggan' : 'Toko'}: ${h.text}`).join('\n');
  let response: any;
  let lastErr: any;
  for (const model of AGENT_MODELS) {
    try {
      response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: `RIWAYAT CHAT:\n${transcript}` }] }],
        config: { systemInstruction, temperature: 0.3, responseMimeType: 'application/json', abortSignal: AbortSignal.timeout(20000) },
      });
      break;
    } catch (e: any) {
      lastErr = e;
      console.warn(`Gemini ${model} gagal (${e.status || e.name}), coba model berikutnya.`);
    }
  }
  if (!response) throw new Error(`Gemini sedang tidak tersedia. (${lastErr?.status || lastErr?.message})`);
  let parsed = JSON.parse(response.text || '{}');
  if (Array.isArray(parsed)) parsed = parsed[0] || {};
  return {
    balasan: String(parsed.balasan || '').trim(),
    perluOwner: parsed.perluOwner === true,
    catatanOwner: String(parsed.catatanOwner || '').trim(),
  };
}

// ---- Card draft untuk owner ---------------------------------------------------------------------

const draftButtons = (id: string) => ({
  items: [
    { type: 'action', action: { type: 'postback', label: '✅ Kirim', data: `cs:send:${id}`, displayText: 'Kirim' } },
    { type: 'action', action: { type: 'postback', label: '✏️ Ubah', data: `cs:edit:${id}`, displayText: 'Ubah' } },
    { type: 'action', action: { type: 'postback', label: '❌ Abaikan', data: `cs:skip:${id}`, displayText: 'Abaikan' } },
  ],
});

const draftMessage = (id: string, d: any): LineMessage => ({
  ...text(`💬 Chat CS dari ${d.customerName}:\n"${d.customerText}"\n\n🤖 Draft balasan:\n${d.reply}`
    + (d.ownerNote ? `\n\n📝 ${d.ownerNote}` : '')),
  quickReply: draftButtons(id),
});

// ---- Webhook bot CS -----------------------------------------------------------------------------

async function handleCustomerEvent(event: any) {
  const userId: string = event.source?.userId;
  if (!userId || event.type !== 'message') return;
  const { token, ownerId } = await ownerTarget();
  if (!token || !ownerId) throw new Error('Bot ERP / ownerUserId belum diatur di Pengaturan -> Integrasi LINE.');

  const name = await customerName(userId);
  const msg = event.message || {};
  if (msg.type !== 'text') {
    // Stiker/foto/dll tidak dibuatkan draft, cukup dikabari supaya owner balas manual.
    await pushLine(token, ownerId, [text(`💬 ${name} mengirim ${msg.type} di LINE CS. Balas manual lewat aplikasi LINE Official Account.`)]);
    return;
  }

  const customerText = String(msg.text || '').trim();
  const chatRef = db().doc(`lineCsChats/${userId}`);
  const chat = (await chatRef.get()).data() || {};
  const history = [...(chat.history || []), { from: 'pelanggan', text: customerText }].slice(-HISTORY_LIMIT);
  await chatRef.set({ lineUserId: userId, customerName: name, history, updatedAt: Timestamp.now() }, { merge: true });

  const recentCustomerText = history.filter((h: any) => h.from === 'pelanggan').slice(-3).map((h: any) => h.text).join(' ');
  const [books, settings] = await Promise.all([findCandidateBooks(recentCustomerText), db().doc('settings/csAgent').get()]);
  const storeInfo = String(settings.data()?.storeInfo || '');

  let draft: CsDraft;
  try {
    draft = await draftReply(history, books, storeInfo);
  } catch (e: any) {
    await pushLine(token, ownerId, [text(`💬 Chat CS dari ${name}:\n"${customerText}"\n\n⚠️ AI gagal membuat draft (${e.message}). Balas manual ya.`)]);
    return;
  }

  // Draft lama pelanggan ini yang belum diputuskan dianggap usang (draft baru sudah memuat konteksnya).
  const old = await db().collection('lineCsDrafts').where('lineUserId', '==', userId).where('status', '==', 'pending').get();
  await Promise.all(old.docs.map((d) => d.ref.update({ status: 'superseded' })));

  const ref = db().collection('lineCsDrafts').doc();
  const data = {
    lineUserId: userId, customerName: name, customerText, reply: draft.balasan,
    ownerNote: draft.catatanOwner || (draft.perluOwner ? 'Perlu dicek owner.' : ''),
    status: 'pending', createdAt: Timestamp.now(),
  };
  await ref.set(data);
  await pushLine(token, ownerId, [draftMessage(ref.id, data)]);
}

export async function lineCsWebhookHandler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(200).send('LINE CS Webhook Endpoint Ready');
  const signature = String(req.headers['x-line-signature'] || '');
  const secret = process.env.LINE_CS_CHANNEL_SECRET || '';
  const rawBody: Buffer | undefined = (req as any).rawBody;
  if (!secret || !signature || !rawBody) return res.status(401).json({ error: 'Signature LINE tidak valid.' });
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(signature, 'base64');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return res.status(401).json({ error: 'Signature LINE tidak valid.' });
  }
  if (!isAdminConfigured()) return res.status(200).json({ status: 'ok', warning: 'Firestore belum dikonfigurasi.' });

  for (const event of req.body?.events || []) {
    try {
      await handleCustomerEvent(event);
    } catch (e: any) {
      console.error('Error in CS agent:', e);
    }
  }
  return res.status(200).json({ status: 'ok' });
}

// ---- Keputusan owner (dipanggil dari webhook bot ERP, line.ts) ----------------------------------

const sessionRef = (ownerId: string) => db().doc(`lineCsSessions/${ownerId}`);

async function sendDraft(id: string, ownerId: string): Promise<string> {
  const ref = db().doc(`lineCsDrafts/${id}`);
  const d = (await ref.get()).data();
  if (!d) return 'Draft tidak ditemukan.';
  if (d.status !== 'pending') return `Draft ini sudah ${d.status === 'sent' ? 'terkirim' : d.status === 'superseded' ? 'diganti draft yang lebih baru' : 'diabaikan'}.`;
  if (!csToken()) return '⚠️ LINE_CS_CHANNEL_ACCESS_TOKEN belum diatur di server.';
  const reply: string = d.reply;
  await pushLine(csToken(), d.lineUserId, [text(reply)]);
  await ref.update({ status: 'sent', sentReply: reply, sentBy: ownerId, sentAt: Timestamp.now() });
  const chatRef = db().doc(`lineCsChats/${d.lineUserId}`);
  const chat = (await chatRef.get()).data() || {};
  await chatRef.set({ history: [...(chat.history || []), { from: 'toko', text: reply }].slice(-HISTORY_LIMIT), updatedAt: Timestamp.now() }, { merge: true });
  return `✅ Terkirim ke ${d.customerName}.`;
}

// Mengembalikan null kalau event bukan urusan agent CS (diteruskan ke agent lain).
export async function handleCsOwnerEvent(event: any): Promise<LineMessage[] | null> {
  const ownerId: string = event.source.userId;

  if (event.type === 'postback') {
    const data = String(event.postback?.data || '');
    if (!data.startsWith('cs:')) return null;
    const [, action, id] = data.split(':');
    if (action === 'send') { await sessionRef(ownerId).delete(); return [text(await sendDraft(id, ownerId).catch((e) => `Gagal: ${e.message}`))]; }
    if (action === 'skip') {
      await sessionRef(ownerId).delete();
      await db().doc(`lineCsDrafts/${id}`).update({ status: 'skipped' }).catch(() => {});
      return [text('Draft diabaikan. Balas manual lewat aplikasi LINE Official Account kalau perlu.')];
    }
    if (action === 'edit') {
      await sessionRef(ownerId).set({ draftId: id, updatedAt: Timestamp.now() });
      return [text('Ketik balasan yang mau dikirim ke pelanggan (atau "batal").')];
    }
    return [];
  }

  if (event.type !== 'message' || event.message?.type !== 'text') return null;
  const session = (await sessionRef(ownerId).get()).data();
  if (!session || Date.now() - tsMs(session.updatedAt) > EDIT_TTL_MS) return null;
  const msg = String(event.message.text || '').trim();
  if (/^(batal|cancel)$/i.test(msg)) {
    await sessionRef(ownerId).delete();
    return [text('Ubah dibatalkan. Draft masih bisa dikirim lewat tombol di atas.')];
  }
  const ref = db().doc(`lineCsDrafts/${session.draftId}`);
  const d = (await ref.get()).data();
  await sessionRef(ownerId).delete();
  if (!d || d.status !== 'pending') return [text('Draft ini sudah tidak aktif.')];
  await ref.update({ reply: msg, editedAt: Timestamp.now() });
  return [draftMessage(session.draftId, { ...d, reply: msg })];
}
