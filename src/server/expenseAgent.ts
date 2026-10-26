// Agent LINE untuk mencatat Freight In & Beban Lain-lain.
//
// Alur: user kirim teks / foto struk -> Gemini mengekstrak datanya -> agent
// membalas DRAFT -> user tekan "Simpan" (atau ketik "ya") -> baru ditulis ke
// freightIn / bebanLainnya + journalEntries, dengan bentuk data yang sama
// persis seperti form di FreightInTab.tsx & BebanLainnyaTab.tsx.
//
// Hanya ID LINE yang terdaftar di settings/line (ownerUserId atau
// expenseAgentUserIds) yang boleh memakai agent. Satu draft aktif per user,
// disimpan di lineExpenseDrafts/{lineUserId}.

import { GoogleGenAI } from '@google/genai';
import type { Transaction } from 'firebase-admin/firestore';
import { getDb, getNextJournalId, Timestamp } from './firestore-admin';
import { FALLBACK_NTD_PER_IDR } from '../lib/exchangeRateConstants';

// Sama dengan AUTO_ACCOUNTS di src/lib/journalAuto.ts (modul itu memakai SDK klien).
const ACC_FREIGHT_IN = { code: '1120', name: 'Freight-in Dalam Kapitalisasi' };
const ACC_CASH_NTD = { code: '1101', name: 'Cash: NTD' };
const ACC_CASH_RUPIAH = { code: '1102', name: 'Cash: Rupiah' };
const ACC_BEBAN_LAIN = {
  code: '5500', name: 'Beban Lain-lain', type: 'Expenses', subType: 'Beban Operasional',
  systemKey: 'beban_kerugian_pembelian',
};

// Sama dengan CATEGORIES di BebanLainnyaTab.tsx. 'piutang' sengaja tidak ada:
// piutang tak tertagih punya alur write-off sendiri di tab Piutang.
const KATEGORI_BEBAN: Record<string, string> = {
  admin: 'Biaya Admin Bank',
  csr: 'Sumbangan & CSR',
  pajak: 'Pajak & Retribusi',
  lain: 'Lain-lain',
};

export interface ExpenseDraft {
  jenis: 'freight_in' | 'beban_lainnya' | 'tidak_jelas';
  tanggal?: string;          // YYYY-MM-DD
  // Freight In (selalu IDR, dibayar dari Cash: Rupiah)
  freightCode?: string;
  totalKg?: number;
  totalBiayaIDR?: number;
  // Beban Lain-lain
  kategori?: string;
  keterangan?: string;
  currency?: 'NTD' | 'IDR';
  amount?: number;
  dibayarViaCode?: string;
  // Kurs override dari user (Rp per NT$1); kosong = kurs live
  kursRpPerNtd?: number;
  pertanyaan?: string;       // hal yang AI belum yakin
}

const AGENT_MODELS = ['gemini-flash-lite-latest', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];

const db = () => getDb();

// ---- Akses ------------------------------------------------------------------

export async function isExpenseAgentUser(lineUserId: string): Promise<boolean> {
  const s = (await db().doc('settings/line').get()).data() || {};
  const allowed: string[] = [s.ownerUserId, ...(Array.isArray(s.expenseAgentUserIds) ? s.expenseAgentUserIds : [])];
  return allowed.filter(Boolean).map((x) => String(x).trim()).includes(lineUserId);
}

// ---- Helper -----------------------------------------------------------------

const todayTaipei = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
const fmtIDR = (v: number) => `Rp ${Math.round(v).toLocaleString('id-ID')}`;
const fmtNTD = (v: number) => `NT$ ${v.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// NTD per 1 IDR, sumber yang sama dengan PurchasesTab (open.er-api.com).
async function fetchNtdPerIdr(): Promise<number> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/IDR', { signal: AbortSignal.timeout(5000) });
    const data: any = await res.json();
    const rate = data?.rates?.TWD ?? data?.rates?.NTD;
    if (typeof rate === 'number' && rate > 0) return rate;
  } catch (e) {
    console.warn('Gagal mengambil kurs IDR live, pakai fallback:', e);
  }
  return FALLBACK_NTD_PER_IDR;
}

async function listCashAccounts(): Promise<Array<{ code: string; name: string }>> {
  // Filter sama dengan pilihan "Dibayar via" di BebanLainnyaTab.tsx.
  const snap = await db().collection('coa').get();
  const accs: Array<{ code: string; name: string }> = [];
  snap.forEach((d) => {
    const a = d.data();
    if (!a.code || !a.name) return;
    if ((String(a.code).startsWith('110') && a.code !== '1100') || a.type === 'Kas & Bank' || String(a.name).toLowerCase().includes('bank')) {
      accs.push({ code: String(a.code), name: String(a.name) });
    }
  });
  return accs.sort((a, b) => a.code.localeCompare(b.code));
}

async function isPeriodClosed(tanggal: string): Promise<boolean> {
  return (await db().doc(`periodClosings/${tanggal.slice(0, 7)}`).get()).exists;
}

// ---- Ekstraksi dengan Gemini --------------------------------------------------

// Angka dari model bisa berupa string ("850.000", "12,5", "85rb", "1,5 jt"). Dinormalisasi di sini,
// bukan lewat responseSchema: dengan schema, model lite kadang menghasilkan angka rusak (1.84e51).
export function parseAmount(v: any): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  let s = v.toLowerCase().replace(/rp|nt\$|ntd|twd|idr|元|kg|\s/g, '');
  let mult = 1;
  if (/(jt|juta)$/.test(s)) { mult = 1e6; s = s.replace(/(jt|juta)$/, ''); }
  else if (/(rb|ribu|k)$/.test(s)) { mult = 1e3; s = s.replace(/(rb|ribu|k)$/, ''); }
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');      // 1.165.800 / 1.234,5
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');                       // 1,165,800
  else s = s.replace(',', '.');                                                                // 12,5
  const n = parseFloat(s) * mult;
  return Number.isFinite(n) ? n : undefined;
}

const JSON_SHAPE = `{"jenis": "freight_in" | "beban_lainnya" | "tidak_jelas", "tanggal": "YYYY-MM-DD", "freightCode": string,
 "totalKg": number, "totalBiayaIDR": number, "kategori": string, "keterangan": string, "currency": "NTD" | "IDR",
 "amount": number, "dibayarViaCode": string, "kursRpPerNtd": number, "pertanyaan": string}`;

export async function extractDraft(
  input: { text?: string; image?: { mimeType: string; base64: string } },
  previous: ExpenseDraft | null,
  cashAccounts: Array<{ code: string; name: string }>,
): Promise<ExpenseDraft> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY belum dikonfigurasi di server.');
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `Anda asisten pembukuan toko buku "KangenBukuIndo" (Taiwan, belanja dari Indonesia).
Tugas: baca pesan/foto struk dari owner lalu jawab dengan SATU objek JSON (bukan array), bentuk:
${JSON_SHAPE}
Field yang tidak ada di pesan/struk dihilangkan dari JSON.

Jenis transaksi:
1. "freight_in": ongkos kirim/kargo/forwarder BUKU DARI INDONESIA KE TAIWAN (biaya masuk persediaan).
   Isi: freightCode (nomor resi/kode pengiriman forwarder, persis seperti tertulis), totalKg (berat kg),
   totalBiayaIDR (total biaya dalam Rupiah, angka bulat), tanggal.
   Pada label/resi forwarder (mis. Abang Express): freightCode = nomor resi di bawah barcode,
   totalBiayaIDR = "Total Payment Charge" / total bayar (BUKAN "Custom Value" / nilai barang / asuransi),
   totalKg = "Total Charge Weight" (jika tidak ada, "Actual Weight"), tanggal = tanggal order/kirim.
   Freight In selalu dibayar dari Cash Rupiah dengan kurs otomatis: jangan tanyakan kurs atau akun pembayaran.
2. "beban_lainnya": biaya lain - admin bank, sumbangan/CSR, pajak/retribusi, atau lain-lain.
   Isi: kategori (${Object.entries(KATEGORI_BEBAN).map(([k, v]) => `${k}=${v}`).join(', ')}),
   keterangan (singkat), currency (NTD untuk NT$/TWD/元, IDR untuk Rp), amount (angka, tanpa pemisah ribuan),
   dibayarViaCode (kode akun kas/bank dari daftar di bawah; kosongkan jika tidak disebut), tanggal.
3. "tidak_jelas": bukan transaksi di atas, atau tidak bisa dipastikan.

Akun kas/bank yang tersedia: ${cashAccounts.map((a) => `${a.code}=${a.name}`).join('; ') || '-'}

Aturan:
- Hari ini ${todayTaipei()} (Asia/Taipei). Tanggal tidak disebut -> pakai hari ini. "kemarin" dst dihitung dari hari ini.
- Angka Indonesia: "85.000" = 85000, "1,5 jt" = 1500000, "85rb" = 85000.
- Jika user menyebut kurs ("kurs 520"), isi kursRpPerNtd.
- JANGAN mengarang angka. Field WAJIB yang tidak diketahui dikosongkan, dan tulis di "pertanyaan" apa yang perlu ditanyakan (Bahasa Indonesia, singkat).
  Jika semua field wajib sudah ada, JANGAN isi "pertanyaan". Kurs dan akun pembayaran bukan field wajib.
- "kategori" diisi salah satu kunci: ${Object.keys(KATEGORI_BEBAN).join(', ')}.
- Jika ada DRAFT SEBELUMNYA, pesan baru adalah koreksi/tambahan untuk draft itu: pertahankan field lama kecuali diubah user.
  TAPI jika pesan baru jelas transaksi LAIN (jenis/barang/nominal baru yang lengkap), abaikan draft lama dan isi dari pesan baru saja.`;

  const parts: any[] = [];
  if (previous) parts.push({ text: `DRAFT SEBELUMNYA:\n${JSON.stringify(previous)}` });
  if (input.image) parts.push({ inlineData: { mimeType: input.image.mimeType, data: input.image.base64 } });
  parts.push({ text: input.text?.trim() || '(foto struk terlampir)' });

  // Model lite paling cepat (~1-2 dtk). Kalau sibuk (503/429) atau macet, pindah ke model berikutnya.
  let response: any;
  let lastErr: any;
  for (const model of AGENT_MODELS) {
    try {
      response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction,
          temperature: 0,
          responseMimeType: 'application/json',
          abortSignal: AbortSignal.timeout(15000),
        },
      });
      break;
    } catch (e: any) {
      lastErr = e;
      console.warn(`Gemini ${model} gagal (${e.status || e.name}), coba model berikutnya.`);
    }
  }
  if (!response) throw new Error(`Gemini sedang tidak tersedia, coba lagi sebentar. (${lastErr?.status || lastErr?.message})`);
  let parsed = JSON.parse(response.text || '{}');
  if (Array.isArray(parsed)) parsed = parsed[0] || {};
  // Buang null/string kosong supaya validasi "field kosong" konsisten.
  const draft: any = {};
  for (const [k, v] of Object.entries(parsed)) if (v !== null && v !== '') draft[k] = v;
  for (const k of ['totalKg', 'totalBiayaIDR', 'amount', 'kursRpPerNtd']) {
    if (k in draft) { const n = parseAmount(draft[k]); if (n === undefined || n <= 0) delete draft[k]; else draft[k] = n; }
  }
  if (typeof draft.currency === 'string') draft.currency = /idr|rp/i.test(draft.currency) ? 'IDR' : /nt|twd/i.test(draft.currency) ? 'NTD' : undefined;
  if (!['freight_in', 'beban_lainnya', 'tidak_jelas'].includes(draft.jenis)) draft.jenis = 'tidak_jelas';
  if (draft.jenis === 'beban_lainnya' && !KATEGORI_BEBAN[draft.kategori]) {
    // Model sering menulis label ("Biaya Admin Bank") atau tidak mengisi; tebak dari kata kunci.
    const hint = `${draft.kategori || ''} ${draft.keterangan || ''}`.toLowerCase();
    draft.kategori = /admin|bank/.test(hint) ? 'admin' : /csr|sumbang|donasi/.test(hint) ? 'csr' : /pajak|retribusi|pph|ppn|bea/.test(hint) ? 'pajak' : 'lain';
  }
  // Tanggal tidak disebut = hari ini (model sering lupa mengisinya).
  if (draft.jenis !== 'tidak_jelas' && !/^\d{4}-\d{2}-\d{2}$/.test(draft.tanggal || '')) draft.tanggal = (previous?.jenis === draft.jenis && previous.tanggal) || todayTaipei();
  return draft as ExpenseDraft;
}

// ---- Validasi & tampilan draft ---------------------------------------------

export function missingFields(d: ExpenseDraft, cashAccounts: Array<{ code: string }>): string[] {
  const miss: string[] = [];
  if (!d.tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(d.tanggal)) miss.push('tanggal');
  if (d.jenis === 'freight_in') {
    if (!d.freightCode?.trim()) miss.push('kode/no. resi Freight-In');
    if (!(Number(d.totalKg) > 0)) miss.push('berat (kg)');
    if (!(Number(d.totalBiayaIDR) > 0)) miss.push('total biaya (Rp)');
  } else if (d.jenis === 'beban_lainnya') {
    if (!d.kategori || !KATEGORI_BEBAN[d.kategori]) miss.push('kategori');
    if (!d.keterangan?.trim()) miss.push('keterangan');
    if (!d.currency) miss.push('mata uang (NT$ / Rp)');
    if (!(Number(d.amount) > 0)) miss.push('nominal');
    if (d.dibayarViaCode && !cashAccounts.some((a) => a.code === d.dibayarViaCode)) miss.push('akun pembayaran (kode tidak dikenal)');
  } else {
    miss.push('jenis transaksi (Freight In atau Beban Lain-lain)');
  }
  return miss;
}

const paidViaFor = (d: ExpenseDraft, cashAccounts: Array<{ code: string; name: string }>) =>
  cashAccounts.find((a) => a.code === d.dibayarViaCode) || (d.currency === 'IDR' ? ACC_CASH_RUPIAH : ACC_CASH_NTD);

export function formatDraft(d: ExpenseDraft, ntdPerIdr: number, cashAccounts: Array<{ code: string; name: string }>): string {
  const rpPerNtd = d.kursRpPerNtd || 1 / ntdPerIdr;
  const lines: string[] = [];
  if (d.jenis === 'freight_in') {
    const biaya = Number(d.totalBiayaIDR) || 0;
    lines.push('🚚 DRAFT FREIGHT IN');
    lines.push(`Tanggal  : ${d.tanggal || '?'}`);
    lines.push(`Kode     : ${d.freightCode || '?'}`);
    lines.push(`Berat    : ${d.totalKg ?? '?'} kg`);
    lines.push(`Biaya    : ${d.totalBiayaIDR !== undefined ? fmtIDR(biaya) : '?'}`);
    if (d.totalKg && biaya) lines.push(`Rate/kg  : ${fmtIDR(biaya / Number(d.totalKg))}`);
    lines.push(`≈ ${fmtNTD(biaya / rpPerNtd)} (kurs Rp ${Math.round(rpPerNtd)}/NT$)`);
    lines.push('');
    lines.push(`Jurnal: Dr ${ACC_FREIGHT_IN.code} ${ACC_FREIGHT_IN.name}`);
    lines.push(`        Cr ${ACC_CASH_RUPIAH.code} ${ACC_CASH_RUPIAH.name}`);
  } else if (d.jenis === 'beban_lainnya') {
    const via = paidViaFor(d, cashAccounts);
    const amt = Number(d.amount) || 0;
    lines.push('🧾 DRAFT BEBAN LAIN-LAIN');
    lines.push(`Tanggal  : ${d.tanggal || '?'}`);
    lines.push(`Kategori : ${(d.kategori && KATEGORI_BEBAN[d.kategori]) || '?'}`);
    lines.push(`Ket.     : ${d.keterangan || '?'}`);
    lines.push(`Nominal  : ${d.currency === 'IDR' ? fmtIDR(amt) : d.currency === 'NTD' ? fmtNTD(amt) : '?'}`);
    if (d.currency === 'IDR') lines.push(`≈ ${fmtNTD(amt / rpPerNtd)} (kurs Rp ${Math.round(rpPerNtd)}/NT$)`);
    lines.push(`Dibayar  : ${via.code} ${via.name}`);
    lines.push('');
    lines.push(`Jurnal: Dr ${ACC_BEBAN_LAIN.code} ${ACC_BEBAN_LAIN.name}`);
    lines.push(`        Cr ${via.code} ${via.name}`);
  } else {
    lines.push('🤔 Saya belum bisa menentukan ini transaksi apa.');
  }
  return lines.join('\n');
}

// ---- Posting ke ERP -----------------------------------------------------------

async function ensureBebanLainAccount() {
  const coa = db().collection('coa');
  if (!(await coa.where('systemKey', '==', ACC_BEBAN_LAIN.systemKey).limit(1).get()).empty) return;
  const byCode = await coa.where('code', '==', ACC_BEBAN_LAIN.code).limit(1).get();
  if (!byCode.empty) {
    await byCode.docs[0].ref.update({ systemKey: ACC_BEBAN_LAIN.systemKey });
    return;
  }
  const ref = coa.doc();
  await ref.set({
    id: ref.id, code: ACC_BEBAN_LAIN.code, name: ACC_BEBAN_LAIN.name, type: ACC_BEBAN_LAIN.type,
    subType: ACC_BEBAN_LAIN.subType, systemKey: ACC_BEBAN_LAIN.systemKey, isActive: true, createdAt: Timestamp.now(),
  });
}

// Menulis transaksi + jurnal + menandai draft 'posted' dalam SATU transaksi,
// jadi tombol Simpan yang ditekan dua kali tidak membuat jurnal ganda.
// Mengembalikan teks konfirmasi untuk user.
export async function postDraft(lineUserId: string, rev: number | null): Promise<string> {
  const draftRef = db().doc(`lineExpenseDrafts/${lineUserId}`);
  const snap = await draftRef.get();
  const stored = snap.data();
  if (!stored || stored.status !== 'pending') return 'Tidak ada draft yang menunggu konfirmasi.';
  if (rev !== null && stored.rev !== rev) return 'Draft ini sudah diubah. Silakan cek draft terbaru lalu tekan Simpan di sana.';

  const d: ExpenseDraft = stored.draft;
  const cashAccounts = await listCashAccounts();
  const miss = missingFields(d, cashAccounts);
  if (miss.length) return `Draft belum lengkap: ${miss.join(', ')}.`;
  if (await isPeriodClosed(d.tanggal!)) return `Periode ${d.tanggal!.slice(0, 7)} sudah ditutup. Transaksi tidak bisa dicatat.`;

  const ntdPerIdr = d.kursRpPerNtd ? 1 / d.kursRpPerNtd : stored.ntdPerIdr || FALLBACK_NTD_PER_IDR;
  const source = { createdVia: 'line_agent', lineUserId };

  const markPosted = (t: Transaction, extra: Record<string, any>) => {
    t.update(draftRef, { status: 'posted', postedAt: Timestamp.now(), ...extra });
  };
  const assertStillPending = async (t: Transaction) => {
    const cur = (await t.get(draftRef)).data();
    if (!cur || cur.status !== 'pending' || cur.rev !== stored.rev) throw new Error('Draft sudah diproses.');
  };

  if (d.jenis === 'freight_in') {
    // Sama dengan handleAddFreight di FreightInTab.tsx.
    const code = d.freightCode!.trim();
    // Cek duplikat sebelum mengambil nomor jurnal, supaya nomor JU tidak terbuang.
    if ((await db().doc(`freightIn/${code}`).get()).exists) return `Gagal menyimpan: Kode Freight-In "${code}" sudah terdaftar.`;
    const kg = Number(d.totalKg);
    const cost = Number(d.totalBiayaIDR);
    const dateObj = new Date(`${d.tanggal}T12:00:00`);
    const yymmdd = d.tanggal!.slice(2).replace(/-/g, '');
    const dayStart = new Date(`${d.tanggal}T00:00:00`);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const sameDay = await db().collection('freightIn')
      .where('createdAt', '>=', Timestamp.fromDate(dayStart))
      .where('createdAt', '<', Timestamp.fromDate(dayEnd)).count().get();
    const docNo = `FI${yymmdd}${String(sameDay.data().count + 1).padStart(2, '0')}`;
    const amountNTD = cost * ntdPerIdr;
    const amountNTDCents = Math.round(amountNTD * 100);
    const amountIDR = Math.round(cost);
    const journalId = await getNextJournalId(dateObj.toISOString());
    const freightRef = db().doc(`freightIn/${code}`);
    const journalRef = db().doc(`journalEntries/${journalId}`);
    const dateTs = Timestamp.fromDate(dateObj);

    try {
      await db().runTransaction(async (t) => {
        await assertStillPending(t);
        if ((await t.get(freightRef)).exists) throw new Error(`Kode Freight-In "${code}" sudah terdaftar.`);
        if ((await t.get(journalRef)).exists) throw new Error(`Nomor jurnal ${journalId} sudah dipakai, coba Simpan lagi.`);
        t.set(freightRef, {
          id: code, freightCode: code, ratePerKg: kg > 0 ? cost / kg : 0, totalKg: kg, exchangeRate: ntdPerIdr,
          docNo, createdAt: dateTs, inputAt: Timestamp.now(), status: 'sudah_dijurnal',
          totalHargaPengiriman: cost, totalHargaPengirimanNTD: amountNTD, sudahDijurnal: true, journalId, ...source,
        });
        t.set(journalRef, {
          id: journalId, date: dateTs, description: `${docNo} - Pembayaran Freight-in`, refType: 'System',
          refId: code, freightCode: code, createdAt: Timestamp.now(), ...source,
          lines: [
            { account: ACC_FREIGHT_IN.name, accountCode: ACC_FREIGHT_IN.code, debit: amountNTDCents, credit: 0,
              originalCurrency: 'IDR', originalDebitIDR: amountIDR, originalCreditIDR: 0 },
            { account: ACC_CASH_RUPIAH.name, accountCode: ACC_CASH_RUPIAH.code, debit: 0, credit: amountNTDCents,
              originalCurrency: 'IDR', originalDebitIDR: 0, originalCreditIDR: amountIDR },
          ],
        });
        markPosted(t, { refCollection: 'freightIn', refId: code, journalId });
      });
    } catch (e: any) {
      return `Gagal menyimpan: ${e.message}`;
    }
    return `✅ Freight In ${docNo} (${code}) tersimpan.\n${fmtIDR(cost)} ≈ ${fmtNTD(amountNTD)}\nJurnal: ${journalId}`;
  }

  // Beban Lain-lain - sama dengan handleSubmit di BebanLainnyaTab.tsx.
  await ensureBebanLainAccount();
  const via = paidViaFor(d, cashAccounts);
  const amount = Number(d.amount);
  const isIdr = d.currency === 'IDR';
  const amountNTDCents = isIdr ? Math.round(amount * ntdPerIdr * 100) : Math.round(amount * 100);
  const journalId = await getNextJournalId(d.tanggal!);
  const journalRef = db().doc(`journalEntries/${journalId}`);
  const bebanRef = db().collection('bebanLainnya').doc();
  const creditLine: any = { account: via.name, accountCode: via.code, debit: 0, credit: amountNTDCents };
  if (isIdr) { creditLine.originalCurrency = 'IDR'; creditLine.originalCreditIDR = amount; }

  try {
    await db().runTransaction(async (t) => {
      await assertStillPending(t);
      if ((await t.get(journalRef)).exists) throw new Error(`Nomor jurnal ${journalId} sudah dipakai, coba Simpan lagi.`);
      t.set(journalRef, {
        id: journalId, date: Timestamp.fromDate(new Date(d.tanggal!)),
        description: `Beban Lain-lain (${KATEGORI_BEBAN[d.kategori!]}): ${d.keterangan}`,
        lines: [
          { account: ACC_BEBAN_LAIN.name, accountCode: ACC_BEBAN_LAIN.code, debit: amountNTDCents, credit: 0 },
          creditLine,
        ],
        refType: 'beban_lainnya', refId: bebanRef.id, updatedAt: Timestamp.now(), createdAt: Timestamp.now(), ...source,
      });
      t.set(bebanRef, {
        tanggal: d.tanggal, kategori: d.kategori, keterangan: d.keterangan, dibayarViaCode: via.code,
        dibayarViaName: via.name, currency: d.currency, amount, amountNTD: amountNTDCents,
        exchangeRate: isIdr ? ntdPerIdr : 1, journalId, createdAt: Timestamp.now(), ...source,
      });
      markPosted(t, { refCollection: 'bebanLainnya', refId: bebanRef.id, journalId });
    });
  } catch (e: any) {
    return `Gagal menyimpan: ${e.message}`;
  }
  return `✅ Beban Lain-lain tersimpan.\n${d.keterangan}: ${isIdr ? fmtIDR(amount) : fmtNTD(amount)} (${fmtNTD(amountNTDCents / 100)})\nJurnal: ${journalId}`;
}

// ---- Entry point dari webhook ---------------------------------------------

type LineMessage = { type: string; [key: string]: any };

const CONFIRM_WORDS = /^(ya|y|ok|oke|simpan|save|benar|betul)[.!]*$/i;
const CANCEL_WORDS = /^(batal|cancel|tidak|hapus)[.!]*$/i;
const HELP_TEXT = `🤖 Agent Pencatat Biaya

Kirim teks atau foto struk, contoh:
• "freight resi JNT123 12,5 kg Rp 850.000"
• "admin bank 15 NT kemarin"
• "pajak retribusi Rp 50rb via 1102"

Saya balas dengan draft. Tekan ✅ Simpan untuk mencatat, ❌ Batal untuk membuang, atau kirim koreksi ("berat 13 kg").`;

async function downloadLineImage(messageId: string, token: string) {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gagal mengunduh foto dari LINE (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { mimeType: res.headers.get('content-type') || 'image/jpeg', base64: buf.toString('base64') };
}

const confirmQuickReply = (rev: number) => ({
  items: [
    { type: 'action', action: { type: 'postback', label: '✅ Simpan', data: `expense:confirm:${rev}`, displayText: 'Simpan' } },
    { type: 'action', action: { type: 'postback', label: '❌ Batal', data: 'expense:cancel', displayText: 'Batal' } },
  ],
});

async function cancelDraft(lineUserId: string): Promise<string> {
  const ref = db().doc(`lineExpenseDrafts/${lineUserId}`);
  const cur = (await ref.get()).data();
  if (!cur || cur.status !== 'pending') return 'Tidak ada draft yang aktif.';
  await ref.update({ status: 'cancelled', cancelledAt: Timestamp.now() });
  return '🗑️ Draft dibatalkan.';
}

// Memproses satu event LINE dari user yang berhak. Mengembalikan pesan balasan.
export async function handleExpenseAgentEvent(event: any, accessToken: string): Promise<LineMessage[]> {
  const lineUserId: string = event.source.userId;
  const draftRef = db().doc(`lineExpenseDrafts/${lineUserId}`);

  if (event.type === 'postback') {
    const data = String(event.postback?.data || '');
    if (data.startsWith('expense:confirm:')) {
      return [{ type: 'text', text: await postDraft(lineUserId, Number(data.split(':')[2])) }];
    }
    if (data === 'expense:cancel') return [{ type: 'text', text: await cancelDraft(lineUserId) }];
    return [];
  }

  if (event.type === 'follow') return [{ type: 'text', text: HELP_TEXT }];
  if (event.type !== 'message') return [];

  const msg = event.message || {};
  const text: string = msg.type === 'text' ? String(msg.text || '').trim() : '';
  if (msg.type !== 'text' && msg.type !== 'image') {
    return [{ type: 'text', text: 'Kirim teks atau foto struk ya.' }];
  }
  if (/^(help|bantuan|\?|menu)$/i.test(text)) return [{ type: 'text', text: HELP_TEXT }];

  const stored = (await draftRef.get()).data();
  const pending = stored?.status === 'pending' ? stored : null;
  if (text && CONFIRM_WORDS.test(text)) {
    return [{ type: 'text', text: pending ? await postDraft(lineUserId, null) : 'Tidak ada draft yang menunggu konfirmasi.' }];
  }
  if (text && CANCEL_WORDS.test(text)) return [{ type: 'text', text: await cancelDraft(lineUserId) }];

  const [cashAccounts, ntdPerIdr] = await Promise.all([listCashAccounts(), fetchNtdPerIdr()]);
  const image = msg.type === 'image' ? await downloadLineImage(msg.id, accessToken) : undefined;
  const draft = await extractDraft({ text, image }, pending?.draft || null, cashAccounts);

  if (draft.jenis === 'tidak_jelas' && !pending) {
    return [{ type: 'text', text: `${draft.pertanyaan || 'Maaf, saya tidak menemukan transaksi Freight In atau beban di pesan ini.'}\n\nKetik "help" untuk contoh.` }];
  }

  const rev = (stored?.rev || 0) + 1;
  await draftRef.set({
    status: 'pending', rev, draft, ntdPerIdr, lineUserId,
    updatedAt: Timestamp.now(), ...(pending ? {} : { createdAt: Timestamp.now() }),
  }, { merge: !!pending });

  const miss = missingFields(draft, cashAccounts);
  let body = formatDraft(draft, ntdPerIdr, cashAccounts);
  if (miss.length) {
    body += `\n\n⚠️ Masih kurang: ${miss.join(', ')}.`;
    if (draft.pertanyaan) body += `\n${draft.pertanyaan}`;
    body += '\nBalas dengan data yang kurang, atau ketik "batal".';
    return [{ type: 'text', text: body }];
  }
  if (draft.pertanyaan) body += `\n\nℹ️ ${draft.pertanyaan}`;
  body += '\n\nSudah benar? Tekan ✅ Simpan, atau kirim koreksi.';
  return [{ type: 'text', text: body, quickReply: confirmQuickReply(rev) }];
}
