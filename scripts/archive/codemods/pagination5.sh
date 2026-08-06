awk '
/Tidak ada buku yang cocok dengan pencarian Anda./ {
    print
    next
}
/<\/div>/ {
    if (++count == 1 && prev_line ~ /Tidak ada/) {
        print
        next
    }
}
{
    if (NR == 1344) {
        print "            </div>"
        print "            {totalPagesKontrol > 1 && ("
        print "              <div className=\"flex items-center justify-between px-4 py-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800\">"
        print "                <div className=\"text-sm text-neutral-500\">"
        print "                  Menampilkan {Math.min((currentPageKontrol - 1) * 50 + 1, sortedBooksList.length)} - {Math.min(currentPageKontrol * 50, sortedBooksList.length)} dari {sortedBooksList.length} Barang"
        print "                </div>"
        print "                <div className=\"flex gap-2\">"
        print "                  <button disabled={currentPageKontrol === 1} onClick={() => setCurrentPageKontrol(p => p - 1)} className=\"px-3 py-1 border border-neutral-200 dark:border-neutral-700 rounded text-sm disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition text-neutral-700 dark:text-neutral-300\">Prev</button>"
        print "                  <button disabled={currentPageKontrol === totalPagesKontrol} onClick={() => setCurrentPageKontrol(p => p + 1)} className=\"px-3 py-1 border border-neutral-200 dark:border-neutral-700 rounded text-sm disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition text-neutral-700 dark:text-neutral-300\">Next</button>"
        print "                </div>"
        print "              </div>"
        print "            )}"
    } else {
        print
    }
}
' src/components/InventoryTab.tsx > temp.tsx && mv temp.tsx src/components/InventoryTab.tsx
