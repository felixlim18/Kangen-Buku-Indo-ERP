import re

with open('src/components/SalesTab.tsx', 'r') as f:
    sales = f.read()

sales = sales.replace("{formatNTD(it.lineTotal).replace('\\n', '')}", "{formatNTD(it.lineTotal).replace(' ', '')}")

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(sales)
