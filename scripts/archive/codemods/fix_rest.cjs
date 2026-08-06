const fs = require('fs');

function fix(file) {
  let code = fs.readFileSync(file, 'utf8');

  // Replace bad bracket patterns injected by patch_heavy.cjs
  // It looks like:
  // } catch (err) { console.error(err); } }; fetchXYZ();
  
  const regex = /\} catch \(err\) \{\s*console\.error\(err\);\s*\}\s*\};\s*fetch\w+\(\);/g;
  
  code = code.replace(regex, "});");
  
  // also fix the Quota error blocks
  const regex2 = /\} catch \(err\) \{\s*if \(String\(err\)\.includes\("Quota"\) \|\| String\(err\)\.includes\("quota"\)\) \{\s*console\.warn\("Firebase quota exceeded \(snapshot\)"\);\s*\} else \{\s*console\.error\("Snapshot error:", err\);\s*\}\s*\}\s*\};\s*fetch\w+\(\);/g;
  
  code = code.replace(regex2, "});");
  
  fs.writeFileSync(file, code);
}

fix('src/components/FreightInTab.tsx');
fix('src/components/SalesTab.tsx');
console.log('Fixed FreightIn and Sales');
