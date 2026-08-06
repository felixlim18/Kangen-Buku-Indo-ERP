const SEVERITY_RANK = { minus: 0, menipis: 1, habis: 2, aman: 3 };
const data = [
  { stok: 0, stokDiorder: 0, stokDikirim: 0, status: 'habis' },
  { stok: 5, stokDiorder: 0, stokDikirim: 0, status: 'aman' },
  { stok: 0, stokDiorder: 5, stokDikirim: 0, status: 'habis' },
  { stok: -2, stokDiorder: 0, stokDikirim: 0, status: 'minus' },
  { stok: 0, stokDiorder: 0, stokDikirim: 3, status: 'habis' },
  { stok: 10, stokDiorder: 2, stokDikirim: 1, status: 'aman' }
];

data.sort((a, b) => {
  // Try to put minus at top
  const ra = a.stok < 0 ? 0 : 1;
  const rb = b.stok < 0 ? 0 : 1;
  if (ra !== rb) return ra - rb;
  
  if (b.stok !== a.stok) return b.stok - a.stok;
  if (b.stokDiorder !== a.stokDiorder) return b.stokDiorder - a.stokDiorder;
  if (b.stokDikirim !== a.stokDikirim) return b.stokDikirim - a.stokDikirim;
  return 0;
});

console.log(data);
