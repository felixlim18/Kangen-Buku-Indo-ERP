import re

with open('src/lib/decimal-utils.ts', 'r') as f:
    content = f.read()

new_func = """export function formatNTD(cents: number): string {
  if (isNaN(cents) || cents === undefined || cents === null) cents = 0;
  const value = new Decimal(cents).div(100).toNumber();
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(absValue);
  return isNegative ? `-NT$ ${formatted}` : `NT$ ${formatted}`;
}

export function formatNTDExact(cents: number): string {
  if (isNaN(cents) || cents === undefined || cents === null) cents = 0;
  const value = new Decimal(cents).div(100).toNumber();
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(absValue);
  return isNegative ? `-NT$ ${formatted}` : `NT$ ${formatted}`;
}"""

old_func = """export function formatNTD(cents: number): string {
  if (isNaN(cents) || cents === undefined || cents === null) cents = 0;
  const value = new Decimal(cents).div(100).toNumber();
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(absValue);
  return isNegative ? `-NT$ ${formatted}` : `NT$ ${formatted}`;
}"""

if old_func in content:
    content = content.replace(old_func, new_func)
else:
    print("Could not find formatNTD")

with open('src/lib/decimal-utils.ts', 'w') as f:
    f.write(content)
