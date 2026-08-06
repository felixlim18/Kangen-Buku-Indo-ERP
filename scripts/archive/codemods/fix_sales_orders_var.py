import re

with open('src/components/SalesTab.tsx', 'r') as f:
    content = f.read()

# Replace `salesOrders` with `orders` when passed to getCurrentKontrolStokForBook
content = content.replace('salesOrders, damagedRecords);', 'orders, damagedRecords);')

# Replace `salesOrders={salesOrders}` with `salesOrders={orders}` in BulkProcessModal props
content = content.replace('salesOrders={salesOrders}', 'salesOrders={orders}')

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(content)
