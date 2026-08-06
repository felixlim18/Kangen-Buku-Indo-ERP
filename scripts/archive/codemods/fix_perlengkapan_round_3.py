import re

with open('src/components/PerlengkapanTab.tsx', 'r') as f:
    content = f.read()

content = content.replace("restoredAvgPrice = Math.round((totalNTD / Math.abs(diffQty)) * 10000) / 10000;", "restoredAvgPrice = totalNTD / Math.abs(diffQty);")

with open('src/components/PerlengkapanTab.tsx', 'w') as f:
    f.write(content)
