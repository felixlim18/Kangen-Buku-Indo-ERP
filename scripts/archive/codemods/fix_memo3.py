import re

with open('src/components/InventoryTab.tsx', 'r') as f:
    content = f.read()

# Replace getInventoryLedgerBalance
old = """  const getInventoryLedgerBalance = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const endOfMonth = new Date(year, month, 1); // Next month start, exclusive

    let totalDebit = 0;
    let totalCredit = 0;

    journals.forEach((entry) => {
      const entryDate = entry.date?.toDate 
        ? entry.date.toDate() 
        : new Date(entry.date?.seconds * 1000 || entry.date);

      if (entryDate >= endOfMonth) return; // filter entries past selected month

      entry.lines?.forEach((line) => {
        const codeClean = (line.accountCode || '').trim();
        const nameLower = (line.account || '').trim().toLowerCase();
        if (
          codeClean === '1201' || 
          nameLower === 'inventory on hand' ||
          codeClean === '1202' ||
          nameLower === 'inventory in delivery'
        ) {
          totalDebit += line.debit || 0;
          totalCredit += line.credit || 0;
        }
      });
    });

    return (totalDebit - totalCredit) / 100; // cents to standard dollars
  };

  const dbInventoryBalance = getInventoryLedgerBalance();
  const reconciliationMismatch = Math.abs(reportValuationSum - dbInventoryBalance);
  const hasMismatch = reconciliationMismatch > 0.05; // toleransi rounding kecil"""

new = """  const { dbInventoryBalance, reconciliationMismatch, hasMismatch } = React.useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const endOfMonth = new Date(year, month, 1); // Next month start, exclusive

    let totalDebit = 0;
    let totalCredit = 0;

    journals.forEach((entry) => {
      const entryDate = entry.date?.toDate 
        ? entry.date.toDate() 
        : new Date(entry.date?.seconds * 1000 || entry.date);

      if (entryDate >= endOfMonth) return; // filter entries past selected month

      entry.lines?.forEach((line) => {
        const codeClean = (line.accountCode || '').trim();
        const nameLower = (line.account || '').trim().toLowerCase();
        if (
          codeClean === '1201' || 
          nameLower === 'inventory on hand' ||
          codeClean === '1202' ||
          nameLower === 'inventory in delivery'
        ) {
          totalDebit += line.debit || 0;
          totalCredit += line.credit || 0;
        }
      });
    });

    const balance = (totalDebit - totalCredit) / 100; // cents to standard dollars
    const mismatchAmt = Math.abs(reportValuationSum - balance);
    const has = mismatchAmt > 0.05; // toleransi rounding kecil
    return { dbInventoryBalance: balance, reconciliationMismatch: mismatchAmt, hasMismatch: has };
  }, [journals, selectedMonth, reportValuationSum]);"""

if old in content:
    content = content.replace(old, new)
else:
    print("Could not find getInventoryLedgerBalance block")

with open('src/components/InventoryTab.tsx', 'w') as f:
    f.write(content)
