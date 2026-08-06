require('ignore-styles');
require('@babel/register')({
  presets: ['@babel/preset-env', '@babel/preset-react', '@babel/preset-typescript'],
  extensions: ['.ts', '.tsx']
});
const React = require('react');
const { renderToString } = require('react-dom/server');
try {
  const { PurchasesTab } = require('./src/components/PurchasesTab.tsx');
  // We can't easily mock everything, but we can check if it parses and evaluates.
  console.log("Parses fine");
} catch (e) {
  console.error(e);
}
