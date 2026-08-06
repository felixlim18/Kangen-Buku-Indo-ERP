const fs = require('fs');

let code = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

// The block to replace:
const regex = /useEffect\(\(\) => \{\s*\/\/ Platform Seeding and Listeners\s*const unsubPlatforms = onSnapshot[\s\S]*?\}, \[\]\);/;

const replacement = `useEffect(() => {
    const loadData = async () => {
      try {
        const [platSnap, poSnap, catSnap, freightSnap, journalSnap] = await Promise.all([
          getDocs(collection(db, 'platforms')),
          getDocs(collection(db, 'purchaseOrders')),
          getDocs(collection(db, 'catalog')),
          getDocs(collection(db, 'freightIn')),
          getDocs(collection(db, 'journalEntries'))
        ]);
        
        // Platforms
        const platList = [];
        platSnap.forEach((d) => platList.push({ id: d.id, ...d.data() }));
        setPlatforms(platList);

        // Purchase Orders
        const pList = [];
        poSnap.forEach((d) => pList.push({ id: d.id, ...d.data() }));
        const sorted = pList.sort((a, b) => {
          const dateA = a.purchaseDate?.seconds || 0;
          const dateB = b.purchaseDate?.seconds || 0;
          return dateB - dateA;
        });
        setPurchaseOrders(sanitizePurchaseOrders(sorted));

        // Catalog
        const bList = [];
        catSnap.forEach((d) => bList.push({ id: d.id, ...d.data() }));
        setBooks(bList);

        // Freight In
        const fList = [];
        freightSnap.forEach((d) => fList.push({ id: d.id, ...d.data() }));
        setFreightInList(fList);

        // Journal Entries
        const jList = [];
        journalSnap.forEach((d) => jList.push({ id: d.id, ...d.data() }));
        setJournalEntries(jList);

      } catch (err) {
        if (String(err).includes('quota') || String(err).includes('Quota')) {
           console.warn('Quota exceeded while fetching PurchasesTab data');
        } else {
           console.error('Error fetching data for PurchasesTab:', err);
        }
      }
    };

    loadData();
  }, []);`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/PurchasesTab.tsx', code);
console.log('Fixed PurchasesTab useEffect');
