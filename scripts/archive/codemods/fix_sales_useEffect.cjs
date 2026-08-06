const fs = require('fs');
let code = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

const regex = /useEffect\(\(\) => \{\s*\/\/ Platform Seeding and Listeners\s*const unsubPlatforms = onSnapshot[\s\S]*?\}, \[\]\);/;

const replacement = `useEffect(() => {
    const loadData = async () => {
      try {
        const [platSnap, salesSnap, catSnap, invSnap, journalSnap] = await Promise.all([
          getDocs(collection(db, 'platforms')),
          getDocs(collection(db, 'salesOrders')),
          getDocs(collection(db, 'catalog')),
          getDocs(collection(db, 'inventory')),
          getDocs(collection(db, 'journalEntries'))
        ]);
        
        // Platforms
        const platList = [];
        platSnap.forEach((d) => platList.push({ id: d.id, ...d.data() }));
        setPlatforms(platList);

        // Sales Orders
        const sList = [];
        salesSnap.forEach((d) => sList.push({ id: d.id, ...d.data() }));
        const sorted = sList.sort((a, b) => {
          const dateA = a.salesDate?.seconds || 0;
          const dateB = b.salesDate?.seconds || 0;
          if (dateA !== dateB) return dateB - dateA;
          const codeA = a.orderCode || '';
          const codeB = b.orderCode || '';
          return codeB.localeCompare(codeA);
        });
        setSalesOrders(sorted);

        // Catalog
        const bList = [];
        catSnap.forEach((d) => {
          const item = d.data();
          if (item.isActive) {
            bList.push({ id: d.id, ...item });
          }
        });
        setBooks(bList);

        // Inventory
        const iList = [];
        invSnap.forEach((d) => iList.push(d.data()));
        setInventories(iList);

        // Journal Entries
        const jList = [];
        journalSnap.forEach((d) => jList.push(d.data()));
        setJournalEntries(jList);

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

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/SalesTab.tsx', code);
console.log('Fixed SalesTab useEffect');
