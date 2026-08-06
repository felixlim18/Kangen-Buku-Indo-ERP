import re

with open('src/components/PurchasesTab.tsx', 'r') as f:
    content = f.read()

# Remove Math.round from totalNTDVal and platPrice calculations
content = content.replace("const totalNTDVal = Math.round(platStr * currentFXRate);", "const totalNTDVal = platStr * currentFXRate;")
content = content.replace("const totalNTDVal = Math.round(platPrice * currentFXRate);", "const totalNTDVal = platPrice * currentFXRate;")
content = content.replace("const platPrice = currentFXRate > 0 ? Math.round(ntdPrice / currentFXRate) : 0;", "const platPrice = currentFXRate > 0 ? (ntdPrice / currentFXRate) : 0;")
content = content.replace("const platPrice = currentFXRate > 0 ? Math.round(totalNTDVal / currentFXRate) : 0;", "const platPrice = currentFXRate > 0 ? (totalNTDVal / currentFXRate) : 0;")

# Replace formatNumber for price fields
content = content.replace("item.priceNTDStr = formatNumber(totalNTDVal);", "item.priceNTDStr = totalNTDVal.toLocaleString('en-US', {maximumFractionDigits: 4});")
content = content.replace("item.pricePlatformStr = formatNumber(platPrice);", "item.pricePlatformStr = platPrice.toLocaleString('en-US', {maximumFractionDigits: 4});")
content = content.replace("qtyReceivedThisTime: formatNumber(remaining),", "qtyReceivedThisTime: remaining.toLocaleString('en-US', {maximumFractionDigits: 4}),")

# Write it back
with open('src/components/PurchasesTab.tsx', 'w') as f:
    f.write(content)

