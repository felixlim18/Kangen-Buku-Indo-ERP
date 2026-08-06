const fs = require('fs');
const acorn = require('acorn');
const tsPlugin = require('acorn-typescript');

const code = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

try {
  acorn.Parser.extend(tsPlugin()).parse(code, {
    sourceType: 'module',
    ecmaVersion: 2020,
    locations: true
  });
  console.log("Parsed successfully");
} catch (e) {
  console.error(e.message);
  console.error("Line:", e.loc?.line, "Col:", e.loc?.column);
}
