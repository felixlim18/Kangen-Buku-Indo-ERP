import re

with open('src/components/SalesTab.tsx', 'r') as f:
    content = f.read()

# 1. Update the table header in SalesTab.tsx
content = content.replace(
    '<tr className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-400 text-xs font-semibold uppercase border-b border-neutral-200 dark:border-neutral-800 whitespace-nowrap">',
    '<tr className="bg-[#f1f6fc] text-[#5f6b7d] text-xs font-semibold uppercase border-b border-neutral-200 dark:border-neutral-800 whitespace-nowrap">'
)

# 2. Update the "Proses" button color
# Old: style={{ backgroundColor: '#02a077' }}
content = content.replace(
    "style={{ backgroundColor: '#02a077' }}",
    "style={{ backgroundColor: '#2b5a9e' }}"
)

# 3. Update the "Cancel" button color
# Old: className="w-24 h-7 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider bg-[#ec003f] hover:bg-rose-700 text-white rounded-lg transition cursor-pointer text-center flex items-center justify-center shadow-xs whitespace-nowrap"
content = content.replace(
    'className="w-24 h-7 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider bg-[#ec003f] hover:bg-rose-700 text-white rounded-lg transition cursor-pointer text-center flex items-center justify-center shadow-xs whitespace-nowrap"',
    'className="w-24 h-7 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white rounded-lg transition cursor-pointer text-center flex items-center justify-center shadow-xs whitespace-nowrap hover:opacity-90" style={{ backgroundColor: \'#b0473d\' }}'
)

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(content)

print("SalesTab patched")
