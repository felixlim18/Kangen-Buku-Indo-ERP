import re

with open('src/components/InventoryTab.tsx', 'r') as f:
    content = f.read()

# Replace reportRows
old = "const reportRows = books.map((book) => {"
new = "const reportRows = React.useMemo(() => books.map((book) => {"
content = content.replace(old, new)

old_end = """    };
  });

  // Calculate overall"""
new_end = """    };
  }), [books, inventoryList, ledgerEntries, purchaseOrders, salesOrders, damagedRecords, selectedMonth]);

  // Calculate overall"""
content = content.replace(old_end, new_end)

with open('src/components/InventoryTab.tsx', 'w') as f:
    f.write(content)
