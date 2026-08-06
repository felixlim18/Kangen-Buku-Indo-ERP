import re

with open('src/components/InventoryTab.tsx', 'r') as f:
    content = f.read()

# Remove Math.round from currentAverageCost
old1 = """      if (event.type === 'purchase_received') {
        runningStock += event.qtyDelta;
        runningValueCents += event.cost;
        if (runningStock > 0) {
          currentAverageCost = Math.round(runningValueCents / runningStock);
        } else {
          currentAverageCost = 0;
        }
      } 
      else if (event.type === 'freight_capitalized') {
        runningValueCents += event.freightAllocatedCents;
        if (runningStock > 0) {
          currentAverageCost = Math.round(runningValueCents / runningStock);
        } else {
          currentAverageCost = 0;
        }
      }"""

new1 = """      if (event.type === 'purchase_received') {
        runningStock += event.qtyDelta;
        runningValueCents += event.cost;
        if (runningStock > 0) {
          currentAverageCost = runningValueCents / runningStock;
        } else {
          currentAverageCost = 0;
        }
      } 
      else if (event.type === 'freight_capitalized') {
        runningValueCents += event.freightAllocatedCents;
        if (runningStock > 0) {
          currentAverageCost = runningValueCents / runningStock;
        } else {
          currentAverageCost = 0;
        }
      }"""

if old1 in content:
    content = content.replace(old1, new1)
else:
    print("Could not find old1")

# Use formatNTDExact for hargaRataRata display
content = content.replace("{formatNTD(hargaRataRata)}", "{formatNTDExact(hargaRataRata)}")
content = content.replace("import { formatNTD } from '../lib/decimal-utils';", "import { formatNTD, formatNTDExact } from '../lib/decimal-utils';")

with open('src/components/InventoryTab.tsx', 'w') as f:
    f.write(content)
