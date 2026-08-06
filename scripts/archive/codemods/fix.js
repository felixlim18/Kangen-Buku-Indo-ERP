const fs = require('fs');
let content = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

const oldAlert = "safeAlert(`Stok fisik belum mencukupi untuk memproses order ini:\n\n${insufficientItemsList.map(it => `- ${it.name} (Tersedia ${it.stock}, Butuh ${it.needed})`).join('\n')}\n\nOrder harus menunggu barang masuk sebelum bisa diproses.`);"

// Just replace the block safely using regex to match that block
const fixedAlert = "safeAlert(`Stok fisik belum mencukupi untuk memproses order ini:\\n\\n${insufficientItemsList.map(it => `- ${it.name} (Tersedia ${it.stock}, Butuh ${it.needed})`).join('\\n')}\\n\\nOrder harus menunggu barang masuk sebelum bisa diproses.`);"

content = content.replace(/safeAlert\(`Stok fisik[^;]+;\n/, fixedAlert + '\n');
fs.writeFileSync('src/components/SalesTab.tsx', content);
