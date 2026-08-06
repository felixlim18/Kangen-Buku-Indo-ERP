const fs = require('fs');

function fix(file, replacements) {
  let code = fs.readFileSync(file, 'utf8');
  for (const {from, to} of replacements) {
    code = code.split(from).join(to);
  }
  fs.writeFileSync(file, code);
}

fix('src/components/PurchasesTab.tsx', [
  {
    from: `              createdAt: Timestamp.now()
              
      }
        
          }
          await batch.commit();`,
    to: `              createdAt: Timestamp.now()
            });
          }
          await batch.commit();`
  },
  {
    from: `        return dateB - dateA;
        
      }
        
      setPurchaseOrders`,
    to: `        return dateB - dateA;
      });
      setPurchaseOrders`
  },
  {
    from: `        return dateB - dateA; // reverse chronological by default
        
      }
        
      setJournals(list);`,
    to: `        return dateB - dateA; // reverse chronological by default
      });
      setJournals(list);`
  }
]);

console.log('Fixed some syntax');
