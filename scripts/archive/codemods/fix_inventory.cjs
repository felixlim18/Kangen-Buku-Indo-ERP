const fs = require('fs');
let code = fs.readFileSync('src/components/InventoryTab.tsx', 'utf8');

const regex = /useEffect\(\(\) => \{\s*\/\/ 1\. Listen to Catalog[\s\S]*?\}, \[\]\);/;

const replacement = `useEffect(() => {
    const loadData = async () => {
      try {
        const [catSnap, invSnap, ledgerSnap, damagedSnap] = await Promise.all([
          getDocs(collection(db, 'catalog')),
          getDocs(collection(db, 'inventory')),
          getDocs(collection(db, 'inventoryLedger')),
          getDocs(collection(db, 'damagedStock'))
        ]);
        
        // Catalog
        const bList = [];
        catSnap.forEach((d) => bList.push({ id: d.id, ...d.data() }));
        setBooks(bList);

        // Inventory
        const iList = [];
        invSnap.forEach((d) => iList.push(d.data()));
        setInventoryList(iList);

        // Ledger
        const lList = [];
        ledgerSnap.forEach((d) => lList.push(d.data()));
        setLedgerEntries(lList);
        
        // Damaged
        const dList = [];
        damagedSnap.forEach((d) => dList.push(d.data()));
        setDamagedRecords(dList);

      } catch (err) {
        if (String(err).includes('quota') || String(err).includes('Quota')) {
           console.warn('Quota exceeded while fetching InventoryTab data');
        } else {
           console.error('Error fetching data for InventoryTab:', err);
        }
      }
    };

    loadData();
  }, []);`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/InventoryTab.tsx', code);
console.log('Fixed InventoryTab useEffect');
