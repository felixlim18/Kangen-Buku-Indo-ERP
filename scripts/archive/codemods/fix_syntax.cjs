const fs = require('fs');

function fixFile(file, colls) {
  let code = fs.readFileSync(file, 'utf8');

  for (const coll of colls) {
    // We want to find:
    // } catch (err) {
    //    if (String(err).includes('Quota') || String(err).includes('quota')) {
    //      console.warn('Firebase quota exceeded (snapshot)');
    //    } else {
    //      console.error('Snapshot error:', err);
    //    }
    //  }
    // };
    // fetchcatalog();
    //
    // AND replace it with:
    // }, (err) => {
    //   if (String(err).includes('Quota')...) ...
    // });
    
    // Actually, a simpler way is to regex match `} catch (err) { [anything] }; fetchXYZ();`
    const regex = new RegExp(`\\} catch \\(err\\) \\{[\\s\\S]*?\\}\\s*\\};\\s*fetch${coll}\\(\\);`, 'g');
    
    code = code.replace(regex, (match) => {
       // Extract the inner body of the catch
       const bodyMatch = match.match(/\} catch \(err\) \{([\s\S]*)\}\s*\};\s*fetch/);
       if (bodyMatch) {
         return `}, (err) => {${bodyMatch[1]}});`;
       }
       return match;
    });
  }

  fs.writeFileSync(file, code);
  console.log('Fixed syntax in', file);
}

fixFile('src/components/InventoryTab.tsx', ['catalog', 'inventory']);
fixFile('src/components/PurchasesTab.tsx', ['platforms', 'purchaseOrders', 'catalog', 'freightIn', 'journalEntries']);
fixFile('src/components/SalesTab.tsx', ['platforms', 'catalog', 'inventory', 'salesOrders', 'journalEntries']);
fixFile('src/components/FreightInTab.tsx', ['freightIn', 'journalEntries', 'purchaseOrders', 'coa']);

