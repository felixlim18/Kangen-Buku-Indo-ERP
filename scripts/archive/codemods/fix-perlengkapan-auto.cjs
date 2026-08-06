const fs = require('fs');
let code = fs.readFileSync('src/lib/journalAuto.ts', 'utf8');

// Insert new auto accounts
code = code.replace(
  "  BEBAN_LAIN_LAIN: { code: '5500', name: 'Beban Lain-lain', type: 'Expenses', subType: 'Beban Operasional', systemKey: 'beban_kerugian_pembelian' },",
  "  BEBAN_LAIN_LAIN: { code: '5500', name: 'Beban Lain-lain', type: 'Expenses', subType: 'Beban Operasional', systemKey: 'beban_kerugian_pembelian' },\n  PERLENGKAPAN: { code: '1130', name: 'Perlengkapan', type: 'Assets', subType: 'Aset Lancar', systemKey: 'perlengkapan' },\n  BEBAN_PERLENGKAPAN: { code: '5220', name: 'Beban Perlengkapan Packing', type: 'Expenses', subType: 'Beban Operasional', systemKey: 'beban_perlengkapan' },"
);

fs.writeFileSync('src/lib/journalAuto.ts', code);
