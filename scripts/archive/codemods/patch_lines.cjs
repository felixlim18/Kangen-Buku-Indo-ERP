const fs = require('fs');

function replaceLines(file, start, end, newContent) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const before = lines.slice(0, start - 1);
  const after = lines.slice(end);
  const newLines = before.concat(newContent.split('\n')).concat(after);
  fs.writeFileSync(file, newLines.join('\n'));
}

const freightContent = `  // 1. Initial Listeners
  useEffect(() => {
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
        setFreightList(list);

        // Journal Entries
        const jList = [];
        journalSnap.forEach(d => jList.push({ id: d.id, ...d.data() }));
        setJournalEntries(jList);

        // Purchase Orders
        const poList = [];
        poSnap.forEach((d) => poList.push({ id: d.id, ...d.data() }));
        setPurchaseOrders(sanitizePurchaseOrders(poList));
        
        // COA
        const cList = [];
        coaSnap.forEach((d) => cList.push({ id: d.id, ...d.data() }));
        setAccounts(cList);
        setLoading(false);
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

replaceLines('src/components/FreightInTab.tsx', 517, 569, freightContent);
console.log('Replaced FreightInTab');
