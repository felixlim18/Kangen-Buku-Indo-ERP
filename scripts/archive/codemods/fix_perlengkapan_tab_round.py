import re

with open('src/components/PerlengkapanTab.tsx', 'r') as f:
    content = f.read()

# Replace Math.round(x * 10000) / 10000
content = re.sub(r'Math\.round\(([^ *]+) \* 10000\) / 10000', r'\1', content)

# Replace toFixed(2) with formatting allowing more decimals
content = content.replace('item.avgPrice.toFixed(2)', 'item.avgPrice.toLocaleString(\'en-US\', {minimumFractionDigits: 2, maximumFractionDigits: 6})')
content = content.replace('adjustingItem.avgPrice.toFixed(2)', 'adjustingItem.avgPrice.toLocaleString(\'en-US\', {minimumFractionDigits: 2, maximumFractionDigits: 6})')

with open('src/components/PerlengkapanTab.tsx', 'w') as f:
    f.write(content)
