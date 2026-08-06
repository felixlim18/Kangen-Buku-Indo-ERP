import fs from 'fs';
let content = fs.readFileSync('src/components/FinancialTab.tsx', 'utf8');

content = content.replace(
  `    const unsubP = onSnapshot(collection(db, 'payroll'), (snap) => {
      const pList: Payroll[] = [];
      snap.forEach((d) => pList.push({ id: d.id, ...d.data() } as Payroll));
      setPayrolls(pList);
    });`,
  `    let unsubP = () => {};
    if (profile?.role === 'owner') {
      unsubP = onSnapshot(collection(db, 'payroll'), (snap) => {
        const pList: Payroll[] = [];
        snap.forEach((d) => pList.push({ id: d.id, ...d.data() } as Payroll));
        setPayrolls(pList);
      }, (err) => {
         console.error('Payroll error:', err);
      });
    }`
);

fs.writeFileSync('src/components/FinancialTab.tsx', content);
