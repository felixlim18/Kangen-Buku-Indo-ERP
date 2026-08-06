const fs = require('fs');

function replaceLines(file, start, end, newContent) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const before = lines.slice(0, start - 1);
  const after = lines.slice(end);
  const newLines = before.concat(newContent.split('\n')).concat(after);
  fs.writeFileSync(file, newLines.join('\n'));
}

const salesContent = `  useEffect(() => {
    const loadData = async () => {
      try {
        const [
          partnersSnap,
          salesSnap,
          catSnap,
          invSnap,
          ledgerSnap,
          poSnap,
          damagedSnap
        ] = await Promise.all([
          getDocs(collection(db, 'partners')),
          getDocs(collection(db, 'salesOrders')),
          getDocs(collection(db, 'catalog')),
          getDocs(collection(db, 'inventory')),
          getDocs(collection(db, 'inventoryLedger')),
          getDocs(collection(db, 'purchaseOrders')),
          getDocs(collection(db, 'damagedStock'))
        ]);
        
        const pList = [];
        partnersSnap.forEach((d) => pList.push({ id: d.id, ...d.data() }));
        setPartners(pList);

        const oList = [];
        salesSnap.forEach((d) => oList.push({ id: d.id, ...d.data() }));
        setOrders(oList.sort((a, b) => {
          const dateDiff = getOrderDateMs(b) - getOrderDateMs(a);
          if (dateDiff !== 0) return dateDiff;
          const codeA = a.orderCode || '';
          const codeB = b.orderCode || '';
          return codeB.localeCompare(codeA);
        }));

        const bList = [];
        catSnap.forEach((d) => {
          const item = d.data();
          if (item.isActive) {
            bList.push({ id: d.id, ...item });
          }
        });
        setBooks(bList);

        const iList = [];
        invSnap.forEach((d) => iList.push(d.data()));
        setInventories(iList);

        const lList = [];
        ledgerSnap.forEach((d) => lList.push(d.data()));
        setLedgerEntries(lList);

        const poList = [];
        poSnap.forEach((d) => poList.push({ id: d.id, ...d.data() }));
        setPurchaseOrders(poList);

        const dList = [];
        damagedSnap.forEach((d) => dList.push(d.data()));
        setDamagedRecords(dList);

      } catch (err) {
        if (String(err).includes('quota') || String(err).includes('Quota')) {
           console.warn('Quota exceeded while fetching SalesTab data');
        } else {
           console.error('Error fetching data for SalesTab:', err);
        }
      }
    };
    loadData();
  }, []);`;

replaceLines('src/components/SalesTab.tsx', 798, 909, salesContent);
console.log('Replaced SalesTab');
