import re

with open('src/components/PurchasesTab.tsx', 'r') as f:
    content = f.read()

# Replace Math.round in unitLandedCents calculation
old1 = "const unitLandedCents = Math.round(item.pricePerItem - diskon_per_unit_cents + freight_per_unit_cents);"
new1 = "const unitLandedCents = item.pricePerItem - diskon_per_unit_cents + freight_per_unit_cents;"

# It appears twice, so we just do a simple replace
if old1 in content:
    content = content.replace(old1, new1)
else:
    print("Could not find old1")

# Also replace nextAvgCost = ... toDecimalPlaces(0 ...
old2 = "nextAvgCost = prevValDecimal.plus(recValDecimal).div(prevEnding + qtyRecNum).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();"
new2 = "nextAvgCost = prevValDecimal.plus(recValDecimal).div(prevEnding + qtyRecNum).toNumber();"

if old2 in content:
    content = content.replace(old2, new2)
else:
    print("Could not find old2")

with open('src/components/PurchasesTab.tsx', 'w') as f:
    f.write(content)
