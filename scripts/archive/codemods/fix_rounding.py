import re

# 1. Update parseCommasToNumber in PurchasesTab
with open('src/components/PurchasesTab.tsx', 'r') as f:
    content = f.read()

content = content.replace("return parseInt(clean, 10) || 0;", "return parseFloat(clean) || 0;")

# 2. Fix the line change handlers that use Math.round(totalNTDVal / numQty)
content = content.replace("item.pricePerItemStr = formatNumber(Math.round(totalNTDVal / (numQty || 1)));", "item.pricePerItemStr = (totalNTDVal / (numQty || 1)).toLocaleString('en-US', {maximumFractionDigits: 4});")
content = content.replace("item.pricePerItemStr = formatNumber(Math.round(totalNTDVal / numQty));", "item.pricePerItemStr = (totalNTDVal / numQty).toLocaleString('en-US', {maximumFractionDigits: 4});")
content = content.replace("item.pricePerItemStr = formatNumber(Math.round(ntdPrice / numQty));", "item.pricePerItemStr = (ntdPrice / numQty).toLocaleString('en-US', {maximumFractionDigits: 4});")

# 3. Handle replace(/\D/g, '') because \D removes decimals!
# We should change it to replace(/[^\d.-]/g, '')
content = content.replace("const clean = val.replace(/\D/g, '');", "const clean = val.replace(/[^\\d.-]/g, '');")
content = content.replace("const cleanQty = val.replace(/\D/g, '');", "const cleanQty = val.replace(/[^\\d.-]/g, '');")
# Update parseInt to parseFloat for these handlers
content = content.replace("const numQty = cleanQty ? parseInt(cleanQty, 10) : 1;", "const numQty = cleanQty ? parseFloat(cleanQty) : 1;")
content = content.replace("const platPrice = clean ? parseInt(clean, 10) : 0;", "const platPrice = clean ? parseFloat(clean) : 0;")
content = content.replace("const ntdPrice = clean ? parseInt(clean, 10) : 0;", "const ntdPrice = clean ? parseFloat(clean) : 0;")
content = content.replace("const perItemPrice = clean ? parseInt(clean, 10) : 0;", "const perItemPrice = clean ? parseFloat(clean) : 0;")

# 4. Handle qtyReceivedThisTime parsing, though qty is usually integer, best to keep float if needed, but the parsing replacement above covers it.

with open('src/components/PurchasesTab.tsx', 'w') as f:
    f.write(content)
