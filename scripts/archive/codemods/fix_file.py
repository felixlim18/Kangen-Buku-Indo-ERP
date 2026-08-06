import re

with open('src/components/InventoryTab.tsx', 'r') as f:
    content = f.read()

# Fix the dangling )} and malformed pagination in Monthly tab (first table)
pattern = re.compile(r'(\s*</table>\s*)(?:\{totalPagesMonthly > 1 \\\&\\\& \(\n)?\s*<div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800">\s*<div className="text-sm text-neutral-500">\s*Menampilkan \{Math\.min\(\(currentPageMonthly - 1\) \* 50 \+ 1, filteredReportRows\.length\)\} - \{Math\.min\(currentPageMonthly \* 50, filteredReportRows\.length\)\} dari \{filteredReportRows\.length\} Barang\s*</div>\s*<div className="flex gap-2">\s*<button[^>]*>Prev</button>\s*<button[^>]*>Next</button>\s*</div>\s*</div>\s*\)\}')

# Oh wait, let's just find the table end and replace whatever follows it until the next div
