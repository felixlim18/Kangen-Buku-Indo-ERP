const fs = require('fs');
let code = fs.readFileSync('src/components/FreightInTab.tsx', 'utf8');

const regex = /useEffect\(\(\) => \{\s*\/\/ Listen to Freight In\s*const unsubFreightIn = onSnapshot[\s\S]*?\}, \[\]\);/;

const replacement = `useEffect(() => {
    const loadData = async () => {
      try {
        const [freightSnap, journalSnap, poSnap, coaSnap] = await Promise.all([
          getDocs(collection(db, 'freightIn')),
          getDocs(collection(db, 'journalEntries')),
          getDocs(collection(db, 'purchaseOrders')),
          getDocs(collection(db, 'coa'))
        ]);
        
        // Freight In
        const list = [];
        freightSnap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const dateA = a.date?.seconds || 0;
          const dateB = b.date?.seconds || 0;
          return dateB - dateA;
        });
        setFreightInList(list);

        // Journal Entries
        const jList = [];
        journalSnap.forEach(d => jList.push({ id: d.id, ...d.data() }));
        setJournalEntries(jList);

        // Purchase Orders
        const poList = [];
        poSnap.forEach((d) => poList.push({ id: d.id, ...d.data() }));
        setPurchaseOrders(poList);
        
        // COA
        const cList = [];
        coaSnap.forEach((d) => cList.push({ id: d.id, ...d.data() }));
        setAccounts(cList);

      } catch (err) {
        if (String(err).includes('quota') || String(err).includes('Quota')) {
           console.warn('Quota exceeded while fetching FreightInTab data');
        } else {
           console.error('Error fetching data for FreightInTab:', err);
        }
      }
    };

    loadData();
  }, []);`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/FreightInTab.tsx', code);
console.log('Fixed FreightInTab useEffect');
