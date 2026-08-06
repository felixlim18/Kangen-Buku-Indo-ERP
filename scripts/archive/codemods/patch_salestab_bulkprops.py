import re

with open('src/components/SalesTab.tsx', 'r') as f:
    content = f.read()

target = r'''        <BulkProcessModal 
           isOpen=\{isBulkProcessOpen\} 
           onClose=\{\(\) => setIsBulkProcessOpen\(false\)\} 
           menungguOrders=\{searchedOrders\.filter\(o => o\.status === 'draft'\)\} 
        />'''

replacement = r'''        <BulkProcessModal 
           isOpen={isBulkProcessOpen} 
           onClose={() => setIsBulkProcessOpen(false)} 
           menungguOrders={searchedOrders.filter(o => o.status === 'draft')} 
           inventories={inventories}
        />'''

if target in content:
    content = content.replace(target, replacement)
elif re.search(target, content):
    content = re.sub(target, replacement, content)
else:
    # Try simpler replace
    target2 = "menungguOrders={searchedOrders.filter(o => o.status === 'draft')} \n        />"
    replacement2 = "menungguOrders={searchedOrders.filter(o => o.status === 'draft')} \n           inventories={inventories}\n        />"
    content = content.replace(target2, replacement2)

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(content)
