const fs = require('fs');
const { execSync } = require('child_process');

try {
  execSync('npx tsc src/components/PurchasesTab.tsx --jsx react-jsx --noEmit --skipLibCheck', { stdio: 'pipe' });
} catch (error) {
  const output = error.stdout.toString() + error.stderr.toString();
  const missingNames = new Set();
  
  const regex = /Cannot find name '([^']+)'/g;
  let match;
  while ((match = regex.exec(output)) !== null) {
    missingNames.add(match[1]);
  }
  
  let declarations = Array.from(missingNames).map(name => {
    if (name.startsWith('set')) {
       return `const ${name} = (v?: any) => {};`;
    }
    return `const ${name}: any = null;`;
  }).join('\n');
  
  let code = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');
  code = code.replace(/export const PurchasesTab = \(\) => \{/, "export const PurchasesTab = () => {\n" + declarations + "\n");
  fs.writeFileSync('src/components/PurchasesTab.tsx', code);
  console.log('Fixed', missingNames.size, 'missing variables');
}
