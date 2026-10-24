// Input susulan gaji Januari-September 2026: total Rp9.345.000 dibagi 9 (owner, 24/10/2026), dibayar dari
// rekening Rupiah (1102). Format sama dengan tab Gaji & Payroll (FinancialTab.handleSavePayroll): dokumen
// payroll + jurnal D 5120 Beban Gaji / K 1102 Cash Rupiah + cashFlow outflow, konversi Rp -> NTD memakai
// faktor tab itu (FALLBACK_NTD_PER_IDR). Rp1.038.333 x 8 + Rp1.038.336 (September) = Rp9.345.000.
// Tanggal bayar: hari terakhir tiap bulan. Berhenti kalau sudah ada payroll untuk periode-periode ini.
//
//   npx tsx scripts/add-payroll-jan-sep-2026.ts            (dry-run)
//   npx tsx scripts/add-payroll-jan-sep-2026.ts --apply    (menulis)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { FALLBACK_NTD_PER_IDR } from '../src/lib/exchangeRateConstants';

const sa = JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json', 'utf8'));
const db = getFirestore(initializeApp({ credential: cert(sa), projectId: 'gen-lang-client-0501656267' }), 'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const APPLY = process.argv.includes('--apply');
const TOTAL_IDR = 9_345_000;
const MONTHS = 9;
const PAYEE = 'Karyawan';
const NOTE = 'Input susulan gaji Jan-Sep 2026 (total Rp9.345.000 dibagi 9)';

(async () => {
  console.log(APPLY ? '*** MODE: APPLY ***\n' : '*** MODE: DRY-RUN (tidak menulis apa pun) ***\n');
  const base = Math.floor(TOTAL_IDR / MONTHS);
  const plan = Array.from({ length: MONTHS }, (_, i) => {
    const m = i + 1;
    const period = `2026-${String(m).padStart(2, '0')}`;
    const lastDay = new Date(2026, m, 0).getDate();
    const payDate = `${period}-${String(lastDay).padStart(2, '0')}`;
    const amount = i === MONTHS - 1 ? TOTAL_IDR - base * (MONTHS - 1) : base;
    return { period, payDate, amount, ntdCents: Math.round(amount * 0.17801) };
  });

  const existing = (await db.collection('payroll').get()).docs.filter((d) => plan.some((p) => p.period === d.data().period));
  const [pc] = await Promise.all([db.collection('periodClosings').get()]);
  const closed = new Set(pc.docs.filter((d) => d.data().status === 'Ditutup').map((d) => d.id));
  const blocked = plan.filter((p) => closed.has(p.period));
  if (existing.length || blocked.length) {
    console.log(`BERHENTI: payroll sudah ada untuk ${existing.map((d) => d.data().period).join(', ') || '-'}; periode ditutup: ${blocked.map((p) => p.period).join(', ') || '-'}`);
    process.exit(1);
  }

  plan.forEach((p) => console.log(`  ${p.period}  bayar ${p.payDate}  Rp${p.amount.toLocaleString('id-ID')}  = NT$${(p.ntdCents / 100).toFixed(2)}`));
  console.log(`  Total Rp${plan.reduce((a, p) => a + p.amount, 0).toLocaleString('id-ID')} = NT$${(plan.reduce((a, p) => a + p.ntdCents, 0) / 100).toFixed(2)}`);
  if (!APPLY) { console.log('\nDry-run selesai. Jalankan dengan --apply untuk menulis.'); process.exit(0); }

  for (const p of plan) {
    const yymmdd = p.payDate.slice(2).replace(/-/g, '');
    const counter = db.collection('counters').doc(`JURNAL_${yymmdd}`);
    const seq = await db.runTransaction(async (t) => {
      const s = await t.get(counter);
      const v = (s.exists ? s.data()!.value : 0) + 1;
      t.set(counter, { value: v }, { merge: true });
      return v;
    });
    const journalId = `JU${yymmdd}${String(seq).padStart(4, '0')}`;
    const payrollRef = db.collection('payroll').doc();
    const cfRef = db.collection('cashFlow').doc();
    const ts = Timestamp.fromDate(new Date(p.payDate));
    const batch = db.batch();
    batch.set(payrollRef, { id: payrollRef.id, payee: PAYEE, period: p.period, currency: 'IDR', amount: p.amount, paidAt: ts, notes: NOTE, journalId, cashflowId: cfRef.id });
    batch.set(cfRef, {
      id: cfRef.id, date: ts, ledger: 'IDR', direction: 'outflow', category: 'payroll', amount: p.amount, amountNTD: p.amount * 0.17801,
      fxRateUsed: FALLBACK_NTD_PER_IDR, refType: 'payroll', refId: payrollRef.id, description: `Payroll Salary Gaji ${PAYEE} untuk Periode ${p.period}`, createdAt: Timestamp.now(),
    });
    batch.set(db.collection('journalEntries').doc(journalId), {
      id: journalId, date: ts, description: `Penggajian Gaji ${PAYEE} untuk Periode ${p.period}`,
      lines: [
        { account: 'Beban Gaji', accountCode: '5120', debit: p.ntdCents, credit: 0, originalCurrency: 'IDR', originalDebitIDR: p.amount, originalCreditIDR: 0 },
        { account: 'Cash Rupiah', accountCode: '1102', debit: 0, credit: p.ntdCents, originalCurrency: 'IDR', originalDebitIDR: 0, originalCreditIDR: p.amount },
      ],
      refType: 'payroll', refId: payrollRef.id, isAuto: true, createdAt: Timestamp.now(),
    });
    await batch.commit();
    console.log(`  ${p.period}: payroll ${payrollRef.id}, jurnal ${journalId}`);
  }
  console.log('Selesai.');
  process.exit(0);
})();
