const fs = require('fs');
let code = fs.readFileSync('src/components/JournalTab.tsx', 'utf8');

// Replace onSnapshot with getDocs logic
// It looks like:
// const unsubAccounts = onSnapshot(collection(db, 'coa'), (snap) => { ... }, err => { ... });
// We'll replace it by wrapping inside a fetch function.

// But wait, there are simpler ways. Let's just create a `loadData` function inside the useEffect.

code = code.replace(/const unsubAccounts = onSnapshot\(collection\(db, 'coa'\), \(snap\) => \{([\s\S]*?)\}, \(error\) => \{([\s\S]*?)\}\);/g, `
    const fetchAccounts = async () => {
      try {
        const snap = await getDocs(collection(db, 'coa'));
        $1
      } catch (error) {
        $2
      }
    };
    fetchAccounts();
`);

code = code.replace(/const unsubPos = onSnapshot\(collection\(db, 'purchaseOrders'\), \(snap\) => \{([\s\S]*?)\}, err => \{([\s\S]*?)\}\);/g, `
    const fetchPos = async () => {
      try {
        const snap = await getDocs(collection(db, 'purchaseOrders'));
        $1
      } catch (err) {
        $2
      }
    };
    fetchPos();
`);

code = code.replace(/const unsubFreightIn = onSnapshot\(collection\(db, 'freightIn'\), \(snap\) => \{([\s\S]*?)\}, err => \{([\s\S]*?)\}\);/g, `
    const fetchFreightIn = async () => {
      try {
        const snap = await getDocs(collection(db, 'freightIn'));
        $1
      } catch (err) {
        $2
      }
    };
    fetchFreightIn();
`);

code = code.replace(/const unsubJournals = onSnapshot\(collection\(db, 'journalEntries'\), \(snap\) => \{([\s\S]*?)\}, \(error\) => \{([\s\S]*?)\}\);/g, `
    const fetchJournals = async () => {
      try {
        const snap = await getDocs(collection(db, 'journalEntries'));
        $1
      } catch (error) {
        $2
      }
    };
    fetchJournals();
`);

code = code.replace(/const unsubClosings = onSnapshot\(collection\(db, 'periodClosings'\), \(snap\) => \{([\s\S]*?)\}, \(error\) => \{([\s\S]*?)\}\);/g, `
    const fetchClosings = async () => {
      try {
        const snap = await getDocs(collection(db, 'periodClosings'));
        $1
      } catch (error) {
        $2
      }
    };
    fetchClosings();
`);

// Remove the unsub calls in the cleanup
code = code.replace(/unsubAccounts\(\);/g, '');
code = code.replace(/unsubPos\(\);/g, '');
code = code.replace(/unsubFreightIn\(\);/g, '');
code = code.replace(/unsubJournals\(\);/g, '');
code = code.replace(/unsubClosings\(\);/g, '');

fs.writeFileSync('src/components/JournalTab.tsx', code);
console.log('Patched JournalTab');
