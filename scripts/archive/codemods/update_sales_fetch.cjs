const fs = require('fs');
let code = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

// Replace the getDocs block for salesOrders
// Actually, it's easier to add a new useEffect for salesOrders and remove it from loadData

code = code.replace(
  "          partnersSnap,\n          salesSnap,\n          catSnap,",
  "          partnersSnap,\n          catSnap,"
);

code = code.replace(
  "          getDocs(collection(db, 'partners')),\n          getDocs(collection(db, 'salesOrders')),\n          getDocs(collection(db, 'catalog')),",
  "          getDocs(collection(db, 'partners')),\n          getDocs(collection(db, 'catalog')),"
);

code = code.replace(
`        const oList = [];
        salesSnap.forEach((d) => oList.push({ id: d.id, ...d.data() }));
        setOrders(oList.sort((a, b) => {
          const dateDiff = getOrderDateMs(b) - getOrderDateMs(a);
          if (dateDiff !== 0) return dateDiff;
          const codeA = a.orderCode || '';
          const codeB = b.orderCode || '';
          return codeB.localeCompare(codeA);
        }));
`,
""
);

const onSnapshotEffect = `  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'salesOrders'), (snap) => {
      const oList: any[] = [];
      snap.forEach((d) => oList.push({ id: d.id, ...d.data() }));
      setOrders(oList.sort((a, b) => {
        const dateDiff = getOrderDateMs(b) - getOrderDateMs(a);
        if (dateDiff !== 0) return dateDiff;
        const codeA = a.orderCode || '';
        const codeB = b.orderCode || '';
        return codeB.localeCompare(codeA);
      }));
    });
    return () => unsub();
  }, []);

`;

// Insert the new useEffect right before loadData's useEffect
code = code.replace(
  "  useEffect(() => {\n    const loadData = async () => {",
  onSnapshotEffect + "  useEffect(() => {\n    const loadData = async () => {"
);

fs.writeFileSync('src/components/SalesTab.tsx', code);
