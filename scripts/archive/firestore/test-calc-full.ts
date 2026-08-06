import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
    const cSnap = await getDocs(collection(db, 'coa'));
    const coaAccounts = cSnap.docs.map(d => ({id: d.id, ...d.data()}));
    
    fs.writeFileSync('coa.json', JSON.stringify(coaAccounts, null, 2));
    
    const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

    const cashAccounts = coaAccounts.filter(a => 
      (a.systemKey?.startsWith('cash') || a.code === '1101' || a.code === '1102' || a.name.toLowerCase().includes('cash'))
    );
    const leafCashAccounts = cashAccounts.filter(a => {
        return !coaAccounts.some(child => child.parentAccount === `${a.code} - ${a.name}`);
    });
    
    console.log("Leaf cash accounts:", leafCashAccounts.map(a => a.code + " " + a.name));

    const targetYear = 2026;
    const targetMonth = 7;
    const startDate = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
    const prevMonthEndDate = new Date(targetYear, targetMonth - 1, 0, 23, 59, 59, 999);

    function parseToDate(val: any): Date {
      if (!val) return new Date();
      if (val.seconds) {
        return new Date(val.seconds * 1000);
      }
      return new Date(val);
    }

    let actualBalance = 0;
    let prevBalance = 0;

    journals.forEach(entry => {
        let entryDate = parseToDate(entry.date);
        let noDate = !entry.date;
        let endCompare = new Date(endDate);
        endCompare.setHours(23, 59, 59, 999);
        let prevCompare = new Date(prevMonthEndDate);
        prevCompare.setHours(23, 59, 59, 999);
        
        let isUpToEnd = noDate || entryDate <= endCompare;
        let isUpToPrev = noDate || entryDate <= prevCompare;
        
        let netCash = 0;
        if (entry.lines) {
            entry.lines.forEach(l => {
                if (leafCashAccounts.some(a => a.code === l.accountCode)) {
                    netCash += (l.debit || 0) - (l.credit || 0);
                }
            });
        }
        
        if (isUpToEnd) {
            actualBalance += netCash;
        }
        if (isUpToPrev) {
            prevBalance += netCash;
        }
    });

    let monthNet = 0;
    journals.forEach(entry => {
        if (!entry.date) return;
        let d = parseToDate(entry.date);
        if (d >= startDate && d <= endDate) {
            if (entry.lines) {
                entry.lines.forEach(l => {
                    if (leafCashAccounts.some(a => a.code === l.accountCode)) {
                        monthNet += (l.debit || 0) - (l.credit || 0);
                    }
                });
            }
        }
    });

    console.log("actualBalance:", actualBalance / 100);
    console.log("prevBalance:", prevBalance / 100);
    console.log("monthNet:", monthNet / 100);
    console.log("diff actual vs calculated:", (actualBalance - (prevBalance + monthNet)) / 100);
    process.exit(0);
}
run().catch(console.error);
