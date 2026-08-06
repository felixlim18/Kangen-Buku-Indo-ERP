import re

with open('src/components/InventoryTab.tsx', 'r') as f:
    content = f.read()

old_regex = re.compile(r'let sortedBooksList = \[\.\.\.allBooksWithStock\]\.sort\(\(a, b\) => \{.*?if \(searchTerm\) \{\s*sortedBooksList = sortedBooksList\.filter\(b => b\.bookName\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\)\);\s*\}', re.DOTALL)

new_sort = """const sortedBooksList = React.useMemo(() => {
    let list = [...allBooksWithStock].sort((a, b) => {
      // 1. Minus stock always at the top
      const raMinus = a.stok < 0 ? 0 : 1;
      const rbMinus = b.stok < 0 ? 0 : 1;
      if (raMinus !== rbMinus) return raMinus - rbMinus;

      // 2. If Stok, Stok Diorder, and Stok Dikirim are ALL 0, push to bottom
      const raEmpty = (a.stok === 0 && a.stokDiorder === 0 && a.stokDikirim === 0) ? 1 : 0;
      const rbEmpty = (b.stok === 0 && b.stokDiorder === 0 && b.stokDikirim === 0) ? 1 : 0;
      if (raEmpty !== rbEmpty) return raEmpty - rbEmpty;

      // 3. Sort by Stok (Z-A / highest first)
      if (b.stok !== a.stok) return b.stok - a.stok;

      // 4. Sort by Stok Diorder (Z-A / highest first)
      if (b.stokDiorder !== a.stokDiorder) return b.stokDiorder - a.stokDiorder;

      // 5. Sort by Stok Dikirim (Z-A / highest first)
      if (b.stokDikirim !== a.stokDikirim) return b.stokDikirim - a.stokDikirim;

      // 6. Fallback alphabetical
      return (a.bookName || '').localeCompare(b.bookName || '');
    });

    if (filterStock === 'minus') {
      list = list.filter(b => b.status === 'minus');
    }

    if (searchTerm) {
      list = list.filter(b => b.bookName.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    return list;
  }, [allBooksWithStock, filterStock, searchTerm]);"""

if old_regex.search(content):
    content = old_regex.sub(new_sort, content, count=1)
else:
    print("Could not find regex")

with open('src/components/InventoryTab.tsx', 'w') as f:
    f.write(content)
