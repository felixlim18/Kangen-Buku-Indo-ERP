import re

with open('src/components/PurchasesTab.tsx', 'r') as f:
    content = f.read()

# 1. Add lastScanMatchFieldRef
ref_str = "const scanStepRef = useRef(1);\n  scanStepRef.current = scanStep;"
new_ref_str = ref_str + "\n  const lastScanMatchFieldRef = useRef<'code' | 'id' | 'order' | 'tracking' | null>(null);"

if ref_str in content and "lastScanMatchFieldRef" not in content:
    content = content.replace(ref_str, new_ref_str)

# 2. Rewrite handleProcessScannedCode matching
old_match = """    // Find PO whose code or id matches cleanCode
    const matchedPo = purchaseOrders.find(po => {
      const poCode = (po.purchaseCode || "").trim().replace(/^#/, '').toUpperCase();
      const poId = (po.id || "").trim().toUpperCase();
      return poCode === cleanCode || poId === cleanCode;
    });"""

new_match = """    // Find PO whose code or id matches cleanCode
    let matchType: 'code' | 'id' | 'order' | 'tracking' | null = null;
    const matchedPo = purchaseOrders.find(po => {
      const poCode = (po.purchaseCode || "").trim().replace(/^#/, '').toUpperCase();
      const poId = (po.id || "").trim().toUpperCase();
      const poOrderNum = (po.supplierOrderNumber || "").trim().toUpperCase();
      const poTrackNum = (po.supplierTrackingNumber || "").trim().toUpperCase();

      if (poCode === cleanCode) { matchType = 'code'; return true; }
      if (poId === cleanCode) { matchType = 'id'; return true; }
      if (poOrderNum === cleanCode) { matchType = 'order'; return true; }
      if (poTrackNum === cleanCode) { matchType = 'tracking'; return true; }
      return false;
    });"""

if old_match in content:
    content = content.replace(old_match, new_match)
else:
    print("old_match not found")

# 3. Rewrite matchedPo if-block logic to set the ref
old_already_added = """      // Check if already in scanned pos
      const isAlreadyAdded = scannedPosRef.current.some(entry => entry.id === matchedPo.id);"""

new_already_added = """      lastScanMatchFieldRef.current = matchType;
      // Check if already in scanned pos
      const isAlreadyAdded = scannedPosRef.current.some(entry => entry.id === matchedPo.id);"""

if old_already_added in content:
    content = content.replace(old_already_added, new_already_added)
else:
    print("old_already_added not found")

# 4. Rewrite the else block
old_else = """      setScanErrorToast(`Purchase Order Number not found: "${scannedText}"`);
      setTimeout(() => setScanErrorToast(null), 5000);
      alert(`Purchase Order Number not found: "${scannedText}"`);
    }"""

new_else = """      // Not found in any PO.
      // If we have an active expanded PO in the bulk receive screen, assign this barcode to it.
      if (expandedScannedPoId) {
        const activePo = purchaseOrders.find(po => po.id === expandedScannedPoId);
        if (activePo) {
          const isUpdatingOrder = lastScanMatchFieldRef.current === 'tracking';
          const updateField = isUpdatingOrder ? 'supplierOrderNumber' : 'supplierTrackingNumber';
          const fieldLabel = isUpdatingOrder ? 'Nomor Order' : 'Nomor Resi';

          updateDoc(doc(db, 'purchaseOrders', activePo.id), {
            [updateField]: cleanCode
          }).catch(e => console.error(e));

          setScannedPos(prev => prev.map(entry => {
            if (entry.id === activePo.id) {
              return {
                ...entry,
                po: { ...entry.po, [updateField]: cleanCode }
              };
            }
            return entry;
          }));

          setScanSuccessToast(`${fieldLabel} untuk PO #${activePo.purchaseCode || activePo.id} diupdate menjadi "${cleanCode}"`);
          setTimeout(() => setScanSuccessToast(null), 4000);
          playScanSuccessBeep();
          return;
        }
      }

      setScanErrorToast(`Purchase Order Number not found: "${scannedText}"`);
      setTimeout(() => setScanErrorToast(null), 5000);
      alert(`Purchase Order Number not found: "${scannedText}"`);
    }"""

if old_else in content:
    content = content.replace(old_else, new_else)
else:
    print("old_else not found")


with open('src/components/PurchasesTab.tsx', 'w') as f:
    f.write(content)

