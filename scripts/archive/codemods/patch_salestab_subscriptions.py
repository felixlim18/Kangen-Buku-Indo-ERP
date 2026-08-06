import re

with open('src/components/SalesTab.tsx', 'r') as f:
    content = f.read()

# Add state variables
target_state = r"const \[inventories, setInventories\] = useState<InventoryRecord\[\]>\(\[\]\);"
replacement_state = r"""const [inventories, setInventories] = useState<InventoryRecord[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [damagedRecords, setDamagedRecords] = useState<any[]>([]);"""
content = re.sub(target_state, replacement_state, content)

# Add imports for getCurrentKontrolStokForBook
target_imports = r"import \{ confirmSalesOrderTransaction, reverseSalesOrderTransaction, revertCompletedSalesOrderToShipped \} from '\.\./lib/db-helpers';"
replacement_imports = r"""import { confirmSalesOrderTransaction, reverseSalesOrderTransaction, revertCompletedSalesOrderToShipped } from '../lib/db-helpers';
import { getCurrentKontrolStokForBook } from '../lib/inventory-utils';"""
content = re.sub(target_imports, replacement_imports, content)

# Add subscriptions inside useEffect
target_sub = r"""    const unsubInv = onSnapshot\(collection\(db, 'inventory'\), \(snap\) => \{
      const iList: InventoryRecord\[\] = \[\];
      snap\.forEach\(\(d\) => iList\.push\(d\.data\(\) as InventoryRecord\)\);
      setInventories\(iList\);
    \}\);"""
replacement_sub = r"""    const unsubInv = onSnapshot(collection(db, 'inventory'), (snap) => {
      const iList: InventoryRecord[] = [];
      snap.forEach((d) => iList.push(d.data() as InventoryRecord));
      setInventories(iList);
    });

    const unsubLedger = onSnapshot(collection(db, 'inventoryLedger'), (snap) => {
      const lList: any[] = [];
      snap.forEach((d) => lList.push(d.data()));
      setLedgerEntries(lList);
    });

    const unsubPurchase = onSnapshot(collection(db, 'purchaseOrders'), (snap) => {
      const pList: any[] = [];
      snap.forEach((d) => pList.push({ id: d.id, ...d.data() }));
      setPurchaseOrders(pList);
    });

    const unsubDamaged = onSnapshot(collection(db, 'damagedStock'), (snap) => {
      const dList: any[] = [];
      snap.forEach((d) => dList.push(d.data()));
      setDamagedRecords(dList);
    });"""
content = re.sub(target_sub, replacement_sub, content)

# Add unsubscriptions to the cleanup function
target_unsub = r"return \(\) => \{\s*unsubPartners\(\);\s*unsubOrders\(\);\s*unsubBooks\(\);\s*unsubInv\(\);\s*unsubConfigs\(\);\s*\};"
replacement_unsub = r"""return () => {
      unsubPartners();
      unsubOrders();
      unsubBooks();
      unsubInv();
      unsubConfigs();
      unsubLedger();
      unsubPurchase();
      unsubDamaged();
    };"""
content = re.sub(target_unsub, replacement_unsub, content)

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(content)
