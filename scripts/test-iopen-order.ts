// Uji aturan Auto Order iOPEN (src/lib/iopen-order.ts + extension iopen-order-plan.js).
// Jalankan: npx tsx scripts/test-iopen-order.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { iopenReceiverName, iopenPhone, iopenStore, iopenAmount, isIopenOrderCandidate, isIopenManualCandidate } from '../src/lib/iopen-order';

runInThisContext(readFileSync(new URL('../extensions chrome/shopee-auto-ship/iopen-order-plan.js', import.meta.url), 'utf8'));
const planIopenItems = (globalThis as any).planIopenItems as (p: any[], amount: number) => any[] | null;

let failed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`✗ ${name}\n  ${e.message}`);
  }
};

test('nama', () => {
  assert.equal(iopenReceiverName('BAGUS RIYAWAN'), 'BAGUS');
  assert.equal(iopenReceiverName('M. Handi'), 'HANDI');
  assert.equal(iopenReceiverName('m.  handi saputra'), 'HANDI');
  assert.equal(iopenReceiverName('ANA'), 'ANAA');
  assert.equal(iopenReceiverName('Al'), 'ALLL');
  assert.equal(iopenReceiverName("NUR'AINI"), 'NURAIN');
  assert.equal(iopenReceiverName('BAKIYATUSSOLIHA'), 'BAKIYA');
  assert.equal(iopenReceiverName('Bakiyatus Soliha'), 'BAKIYA');
  assert.equal(iopenReceiverName('RIYAWAN'), 'RIYAWA');
  assert.equal(iopenReceiverName('ANDIKA'), 'ANDIKA');
  assert.equal(iopenReceiverName('林治昇'), '林治昇');
  assert.equal(iopenReceiverName('王'), '王');
  assert.throws(() => iopenReceiverName(''));
  assert.throws(() => iopenReceiverName('M.'));
  assert.throws(() => iopenReceiverName('林 ANA'));
});

test('telepon', () => {
  assert.equal(iopenPhone('0912345678'), '0912345678');
  assert.equal(iopenPhone('0912-345-678'), '0912345678');
  assert.equal(iopenPhone('+886 912 345 678'), '0912345678');
  assert.equal(iopenPhone('886912345678'), '0912345678');
  assert.equal(iopenPhone('912345678'), '0912345678');
  assert.throws(() => iopenPhone('08123456789'));
  assert.throws(() => iopenPhone('091234567'));
  assert.throws(() => iopenPhone(''));
  assert.throws(() => iopenPhone('0212345678'));
});

test('toko', () => {
  assert.deepEqual(iopenStore('268659'), { id: '268659', names: [] });
  assert.deepEqual(iopenStore('彌海門市'), { id: undefined, names: ['彌海'] });
  assert.deepEqual(iopenStore('彌海店'), { id: undefined, names: ['彌海店', '彌海'] });
  assert.deepEqual(iopenStore('268659 彌海門市'), { id: '268659', names: ['彌海'] });
  assert.deepEqual(iopenStore('268659 彌海店'), { id: '268659', names: ['彌海店', '彌海'] });
  assert.deepEqual(iopenStore('彌海店 268659'), { id: '268659', names: ['彌海店', '彌海'] });
  assert.deepEqual(iopenStore('新店門市'), { id: undefined, names: ['新店'] });
  assert.deepEqual(iopenStore('7-11 彌海門市 (268659)'), { id: '268659', names: ['彌海'] });
  assert.throws(() => iopenStore(''));
  assert.throws(() => iopenStore('Toko dekat rumah'));
  assert.throws(() => iopenStore('268659 123456'));
  assert.throws(() => iopenStore('12345'));
});

test('total', () => {
  assert.equal(iopenAmount({ subtotal: 57000, discount: 0 }), 570);
  assert.equal(iopenAmount({ subtotal: 60000, discount: 3000 }), 570);
  assert.throws(() => iopenAmount({ subtotal: 57050, discount: 0 }));
  assert.throws(() => iopenAmount({ subtotal: 0, discount: 0 }));
});

test('syarat SO', () => {
  const so = { buyerType: 'langsung', pickupLogistics: '7-Eleven', paymentMethod: 'COD', orderNumber: '', status: 'draft' };
  assert.equal(isIopenOrderCandidate(so), true);
  assert.equal(isIopenOrderCandidate({ ...so, isDraft: true }), true);
  assert.equal(isIopenOrderCandidate({ ...so, pickupLogistics: '7-11' }), true);
  assert.equal(isIopenOrderCandidate({ ...so, orderNumber: ' 503510398 ' }), false);
  // tombol manual: Nomor Order boleh sudah terisi (diganti), syarat lain tetap
  assert.equal(isIopenManualCandidate({ ...so, orderNumber: '503510398' }), true);
  assert.equal(isIopenManualCandidate({ ...so, orderNumber: '503510398', paymentMethod: 'Transfer' }), false);
  assert.equal(isIopenManualCandidate({ ...so, orderNumber: '503510398', status: 'shipped' }), false);
  assert.equal(isIopenOrderCandidate({ ...so, paymentMethod: 'Transfer' }), false);
  assert.equal(isIopenOrderCandidate({ ...so, pickupLogistics: 'FamilyMart' }), false);
  assert.equal(isIopenOrderCandidate({ ...so, buyerType: 'reseller' }), false);
  assert.equal(isIopenOrderCandidate({ ...so, buyerType: 'marketplace' }), false);
  assert.equal(isIopenOrderCandidate({ ...so, status: 'confirmed' }), false);
  assert.equal(isIopenOrderCandidate({ ...so, status: 'cancelled' }), false);
});

// Katalog toko iOPEN per 2026-11-01 (harga, stok)
const CATALOG = [
  [430, 36], [599, 83], [700, 8], [400, 92], [350, 68], [4, 522], [550, 24], [700, 45], [750, 37], [500, 0],
  [700, 41], [300, 182], [150, 49], [630, 75], [530, 16], [450, 93], [1750, 100], [1299, 95], [230, 99], [330, 97],
  [730, 90], [470, 2], [370, 84], [570, 22], [600, 87], [670, 55], [650, 100], [770, 96], [800, 100], [830, 94],
  [850, 100], [870, 100], [270, 89], [900, 86], [250, 93],
].map(([price, stock], i) => ({ no: `P${i}`, name: `Produk ${i}`, price, stock }));

const total = (items: any[]) => items.reduce((s, it) => s + it.price * it.qty, 0);
const count = (items: any[]) => items.reduce((s, it) => s + it.qty, 0);

test('kombinasi: tepat, paling sedikit, tidak melebihi stok', () => {
  for (const amount of [570, 4000, 1, 3, 4, 8, 151, 999, 1234, 2599, 12345, 20000]) {
    const items = planIopenItems(CATALOG, amount);
    if (amount < 4 || amount % 2 === 1 && amount < 599) {
      // 1..3 tidak mungkin; ganjil kecil hanya mungkin lewat 599/1299
      if (items) assert.equal(total(items), amount);
      continue;
    }
    assert.ok(items, `tidak ada kombinasi untuk ${amount}`);
    assert.equal(total(items!), amount, `total ${amount}`);
    for (const it of items!) assert.ok(it.qty <= CATALOG.find((p) => p.no === it.no)!.stock, `stok ${it.no}`);
  }
  assert.equal(count(planIopenItems(CATALOG, 570)!), 1);
  assert.equal(count(planIopenItems(CATALOG, 1300)!), 2);
  assert.equal(planIopenItems(CATALOG, 3), null);
  assert.equal(planIopenItems(CATALOG, 0), null);
});

test('kombinasi: produk stok 0 tidak dipakai, stok dibatasi', () => {
  const items = planIopenItems([{ no: 'A', name: 'A', price: 500, stock: 0 }, { no: 'B', name: 'B', price: 250, stock: 3 }], 500);
  assert.deepEqual(items, [{ no: 'B', name: 'B', price: 250, qty: 2 }]);
  assert.equal(planIopenItems([{ no: 'B', name: 'B', price: 250, stock: 3 }], 1000), null);
});

test('kombinasi: total besar cepat', () => {
  const t = Date.now();
  const items = planIopenItems(CATALOG, 49999);
  assert.ok(items && total(items) === 49999);
  assert.ok(Date.now() - t < 3000, `${Date.now() - t} ms`);
});

if (failed) {
  console.log(`\n${failed} gagal`);
  process.exit(1);
}
console.log('\nSemua lulus');
