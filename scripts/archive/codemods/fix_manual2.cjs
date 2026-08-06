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
    from: `    }
  }, (err) => {
    console.error(\`Failed to ensure account \${name} exists:\`, err);
  }
};
import { `,
    to: `    }
  } catch (err) {
    console.error(\`Failed to ensure account \${name} exists:\`, err);
  }
};
import { `
  },
  {
    from: `              currency: s.currency,
              createdAt: Timestamp.now()
              
      }
        
          }
          await batch.commit();`,
    to: `              currency: s.currency,
              createdAt: Timestamp.now()
            });
          }
          await batch.commit();`
  },
  {
    from: `        return dateB - dateA;
        
      }
        
      setPurchaseOrders(sanitizePurchaseOrders(sorted));`,
    to: `        return dateB - dateA;
      });
      setPurchaseOrders(sanitizePurchaseOrders(sorted));`
  },
  {
    from: `              updatedAt: Timestamp.now()
              
      }
        
          }
          await batch.commit();`,
    to: `              updatedAt: Timestamp.now()
            });
          }
          await batch.commit();`
  },
  {
    from: `      setFreightInList(list);
      
      } catch (err) {
          
      handleFirestoreError(error, OperationType.LIST, 'freightIn');
      
      });`,
    to: `      setFreightInList(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'freightIn');
    });`
  },
  {
    from: `      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() 
      }
        
      });
      setJournalEntries(list);`,
    to: `      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setJournalEntries(list);`
  }
]);

console.log('Fixed some more syntax in PurchasesTab');
