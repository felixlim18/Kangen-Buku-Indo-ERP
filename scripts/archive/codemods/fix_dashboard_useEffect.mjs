import fs from 'fs';
let content = fs.readFileSync('src/components/DashboardTab.tsx', 'utf8');

const regex = /  useEffect\(\(\) => \{[\s\S]*?return \(\) => \{[\s\S]*?\}\;\n  \}, \[profile\]\);/m;

const newEffect = `  useEffect(() => {
    let unsubBooks = () => {};
    let unsubOrders = () => {};
    let unsubInv = () => {};
    let unsubPO = () => {};
    let unsubLedger = () => {};
    let unsubDamaged = () => {};
    let unsubCf = () => {};
    let unsubCoa = () => {};
    let unsubJ = () => {};

    if (hasPerm('catalog')) {
      unsubBooks = onSnapshot(collection(db, 'catalog'), (snap) => {
        const bList: Book[] = [];
        snap.forEach((d) => bList.push({ id: d.id, ...d.data() } as Book));
        setBooks(bList);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'catalog'));
    }

    if (hasPerm('sales')) {
      unsubOrders = onSnapshot(collection(db, 'salesOrders'), (snap) => {
        const oList: SalesOrder[] = [];
        snap.forEach((d) => oList.push({ id: d.id, ...d.data() } as SalesOrder));
        setOrders(oList);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'salesOrders'));
    }

    if (hasPerm('inventory')) {
      unsubInv = onSnapshot(collection(db, 'inventory'), (snap) => {
        const iList: InventoryRecord[] = [];
        snap.forEach((d) => iList.push(d.data() as InventoryRecord));
        setInventories(iList);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'inventory'));
      
      unsubLedger = onSnapshot(collection(db, 'inventoryLedger'), (snap) => {
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setLedgerEntries(list);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'inventoryLedger'));
      
      unsubDamaged = onSnapshot(collection(db, 'damagedStock'), (snap) => {
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setDamagedRecords(list);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'damagedStock'));
    }

    if (hasPerm('purchases')) {
      unsubPO = onSnapshot(collection(db, 'purchaseOrders'), (snap) => {
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setPurchaseOrders(list);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'purchaseOrders'));
    }

    if (profile?.role === 'owner') {
      unsubCf = onSnapshot(collection(db, 'cashFlow'), (snap) => {
        const cfList: CashFlowEntry[] = [];
        snap.forEach((d) => cfList.push(d.data() as CashFlowEntry));
        setCashflows(cfList);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'cashFlow'));

      unsubCoa = onSnapshot(collection(db, 'coa'), (snap) => {
        const list: CoaAccount[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as CoaAccount));
        setCoaAccounts(list);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'coa'));

      unsubJ = onSnapshot(collection(db, 'journalEntries'), (snap) => {
        const list: JournalEntry[] = [];
        snap.forEach((d) => list.push(d.data() as JournalEntry));
        setJournals(list);
      }, (err) => handleFirestoreError(err, OperationType.GET, 'journalEntries'));
    }

    return () => {
      unsubBooks();
      unsubOrders();
      unsubInv();
      unsubPO();
      unsubLedger();
      unsubDamaged();
      unsubCf();
      unsubCoa();
      unsubJ();
    };
  }, [profile]);`;

content = content.replace(regex, newEffect);
fs.writeFileSync('src/components/DashboardTab.tsx', content);
