import re

with open('src/components/PerlengkapanTab.tsx', 'r') as f:
    content = f.read()

# Replace Math.round(t * 100) / 100 with t in formatInputWithCommas
old_total_1 = "setTotalRaw(t > 0 ? formatInputWithCommas(String(Math.round(t * 100) / 100)) : '');"
new_total_1 = "setTotalRaw(t > 0 ? formatInputWithCommas(String(t)) : '');"
content = content.replace(old_total_1, new_total_1)

old_total_2 = "setTotalRaw(formatInputWithCommas(String(Math.round(t * 100) / 100)));"
new_total_2 = "setTotalRaw(formatInputWithCommas(String(t)));"
content = content.replace(old_total_2, new_total_2)

with open('src/components/PerlengkapanTab.tsx', 'w') as f:
    f.write(content)
