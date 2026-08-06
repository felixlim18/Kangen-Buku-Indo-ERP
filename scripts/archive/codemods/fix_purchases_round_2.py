import re

with open('src/components/PurchasesTab.tsx', 'r') as f:
    content = f.read()

content = content.replace("setPoDiscount(String(Math.round(usdDiscount * 100) / 100));", "setPoDiscount(String(usdDiscount));")
content = content.replace("setPoDiscount(String(Math.round(diffVal * 100) / 100))", "setPoDiscount(String(diffVal))")
content = content.replace("const formattedPlatPrice = poCurrency === 'IDR' ? Math.round(adjustedPricePlatform) : Math.round(adjustedPricePlatform * 100) / 100;", "const formattedPlatPrice = poCurrency === 'IDR' ? Math.round(adjustedPricePlatform) : adjustedPricePlatform;")

with open('src/components/PurchasesTab.tsx', 'w') as f:
    f.write(content)
