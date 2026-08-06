import re

with open('src/lib/db-helpers.ts', 'r') as f:
    content = f.read()

content = content.replace('endingStock = inv.endingStock;', 'endingStock = inv.endingStock || 0;')
content = content.replace('totalPurchased = inv.totalPurchased;', 'totalPurchased = inv.totalPurchased || 0;')
content = content.replace('totalDispatched = inv.totalDispatched;', 'totalDispatched = inv.totalDispatched || 0;')

with open('src/lib/db-helpers.ts', 'w') as f:
    f.write(content)
