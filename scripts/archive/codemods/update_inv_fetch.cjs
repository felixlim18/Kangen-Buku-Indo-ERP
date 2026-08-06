const fs = require('fs');
let code = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

code = code.replace(
  "          catSnap,\n          invSnap,\n          ledgerSnap,",
  "          catSnap,\n          ledgerSnap,"
);

code = code.replace(
  "          getDocs(collection(db, 'catalog')),\n          getDocs(collection(db, 'inventory')),\n          getDocs(collection(db, 'inventoryLedger')),",
  "          getDocs(collection(db, 'catalog')),\n          getDocs(collection(db, 'inventoryLedger')),"
);

code = code.replace(
`        const iList = [];
        invSnap.forEach((d) => iList.push(d.data()));
        setInventories(iList);
`,
""
);

const onSnapshotEffect = `  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventory'), (snap) => {
      const iList: any[] = [];
      snap.forEach((d) => iList.push(d.data()));
      setInventories(iList);
    });
    return () => unsub();
  }, []);

`;

code = code.replace(
  "  useEffect(() => {\n    const unsub = onSnapshot(collection(db, 'salesOrders')",
  onSnapshotEffect + "  useEffect(() => {\n    const unsub = onSnapshot(collection(db, 'salesOrders')"
);

fs.writeFileSync('src/components/SalesTab.tsx', code);
