const fs = require('fs');
const babel = require('@babel/core');

const code = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');
try {
  babel.parseSync(code, {
    presets: ["@babel/preset-typescript", "@babel/preset-react"],
    filename: "PurchasesTab.tsx"
  });
  console.log("Babel parsed successfully");
} catch (e) {
  console.error(e.message);
}
