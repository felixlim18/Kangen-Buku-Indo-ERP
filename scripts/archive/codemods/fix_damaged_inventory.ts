        // 3. Fix damagedStock zero value bug
        const inventorySnap = await getDocs(collection(db, 'inventory'));
        const inventoryMap = new Map();
        inventorySnap.forEach(doc => inventoryMap.set(doc.id, doc.data()));

        for (const dDoc of damagedSnap.docs) {
          const d = dDoc.data() as any;
          let needsFix = false;
          let newUnitCost = d.unitCost || 0;
          let newTotalCost = d.totalCost || 0;
          let newNotes = d.notes || d.note || '';
          let newAdjustmentType = d.adjustmentType || 'Barang Rusak';

          if (d.totalLossNTD !== undefined && d.totalLossNTD > 0 && newTotalCost === 0) {
              newTotalCost = d.totalLossNTD;
              newUnitCost = d.landedCostNTD || (d.qty > 0 ? d.totalLossNTD / d.qty : 0);
              needsFix = true;
          }

          if (newTotalCost === 0 && d.qty > 0) {
              // Need to find moving average cost from inventory
              const inv = inventoryMap.get(d.bookId);
              if (inv) {
                  newUnitCost = inv.movingAverageCost || 0;
                  newTotalCost = newUnitCost * d.qty;
                  needsFix = true;
              }
          }
          
          if (!d.adjustmentType || !d.notes) needsFix = true;

          if (needsFix) {
              batch.update(dDoc.ref, {
                  unitCost: newUnitCost,
                  totalCost: newTotalCost,
                  notes: newNotes,
                  adjustmentType: newAdjustmentType,
                  landedCostNTD: deleteField(),
                  totalLossNTD: deleteField(),
                  note: deleteField()
              });
              
              // Also update ledger
              const ledgerRef = doc(db, 'inventoryLedger', `LEDGER-${dDoc.id}`);
              // In writeBatch we should use set with merge if we don't know if it exists, but ledger must exist. 
              // We can just use update. But to be safe if ledger doesn't exist, maybe do nothing?
              // Let's assume it exists. Wait, if it doesn't exist update will fail. So we can't just update.
              // Actually, I can just update DamagedStock, and the next journalsSnap logic will pick up the new damagedList object!
          }
        }
