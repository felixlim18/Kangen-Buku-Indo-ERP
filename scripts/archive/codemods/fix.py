import re

with open('src/components/SalesTab.tsx', 'r') as f:
    content = f.read()

target = r"safeAlert\(`Stok fisik belum mencukupi untuk memproses order ini:[\s\S]*?Order harus menunggu barang masuk sebelum bisa diproses\.`\);"

replacement = r"safeAlert(`Stok fisik belum mencukupi untuk memproses order ini:\\n\\n${insufficientItemsList.map(it => `- ${it.name} (Tersedia ${it.stock}, Butuh ${it.needed})`).join('\\n')}\\n\\nOrder harus menunggu barang masuk sebelum bisa diproses.`);"

content = re.sub(target, replacement, content)

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(content)
