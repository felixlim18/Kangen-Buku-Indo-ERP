import fs from 'fs';
let content = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

content = content.replace(
  /\{\[\n                  \{ id: 'coa', label: 'Bagan Akun \/ CoA' \},\n                  \{ id: 'journal', label: 'Akun Jurnal' \},\n                  \{ id: 'ledger-summary', label: 'Ledger Summary' \},\n                  \{ id: 'trial-balance', label: 'Trial Balance' \},\n                  \{ id: 'closing', label: 'Tutup Periode' \}\n                \]\.map\(\(sub\)/g,
  "{[\n                  { id: 'coa', label: 'Bagan Akun / CoA' },\n                  { id: 'journal', label: 'Akun Jurnal' },\n                  { id: 'ledger-summary', label: 'Ledger Summary' },\n                  { id: 'trial-balance', label: 'Trial Balance' },\n                  { id: 'closing', label: 'Tutup Periode' }\n                ].filter(sub => hasPerm(sub.id)).map((sub)"
);

fs.writeFileSync('src/components/Sidebar.tsx', content);
