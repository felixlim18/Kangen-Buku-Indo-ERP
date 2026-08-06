awk '
{
    if (NR == 1493) {
        print "              </table>"
        print "            </div>"
        print "            {totalPagesMonthly > 1 && ("
        print "              <div className=\"flex items-center justify-between px-4 py-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 rounded-b-[18px]\">"
        print "                <div className=\"text-sm text-neutral-500\">"
        print "                  Menampilkan {Math.min((currentPageMonthly - 1) * 50 + 1, filteredReportRows.length)} - {Math.min(currentPageMonthly * 50, filteredReportRows.length)} dari {filteredReportRows.length} Barang"
        print "                </div>"
        print "                <div className=\"flex gap-2\">"
        print "                  <button disabled={currentPageMonthly === 1} onClick={() => setCurrentPageMonthly(p => p - 1)} className=\"px-3 py-1 border border-neutral-200 dark:border-neutral-700 rounded text-sm disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition text-neutral-700 dark:text-neutral-300\">Prev</button>"
        print "                  <button disabled={currentPageMonthly === totalPagesMonthly} onClick={() => setCurrentPageMonthly(p => p + 1)} className=\"px-3 py-1 border border-neutral-200 dark:border-neutral-700 rounded text-sm disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition text-neutral-700 dark:text-neutral-300\">Next</button>"
        print "                </div>"
        print "              </div>"
        print "            )}"
    } else if (NR == 1494) {
        // Skip the original </div> if it was right after </table>
        // Wait, I need to know exactly what is on line 1494 before I skip it.
    }
}
'
