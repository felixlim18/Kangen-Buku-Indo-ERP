import re

with open('src/components/BulkProcessModal.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    'menungguOrders: SalesOrder[];',
    'menungguOrders: SalesOrder[];\n  inventories: any[];'
)

with open('src/components/BulkProcessModal.tsx', 'w') as f:
    f.write(content)
