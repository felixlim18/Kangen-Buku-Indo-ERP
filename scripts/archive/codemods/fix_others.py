import re

with open('src/components/SalesTab.tsx', 'r') as f:
    sales = f.read()

# Fix viewingOrderDetail
target1 = """                          {it.bookCover ? (
                            <div className="h-12 w-9 bg-neutral-100 rounded overflow-hidden flex-shrink-0 flex items-center justify-center border border-neutral-200 dark:border-neutral-800">
                              <img referrerPolicy="no-referrer" src={it.bookCover} alt="" className="h-full w-full object-contain" />
                            </div>
                          ) : (
                            <div className="h-12 w-9 bg-neutral-200 dark:bg-neutral-800 rounded flex-shrink-0 flex items-center justify-center font-numeric text-[8px] text-neutral-500">
                              NO IMG
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="font-bold text-neutral-800 dark:text-neutral-100 truncate" title={it.bookName}>
                                {it.bookName}
                              </p>"""

replacement1 = """                          {it.bookCover ? (
                            <div 
                              className="h-12 w-9 bg-neutral-100 rounded overflow-hidden flex-shrink-0 flex items-center justify-center border border-neutral-200 dark:border-neutral-800 cursor-pointer hover:opacity-80 transition"
                              onClick={(e) => { e.stopPropagation(); setPreviewImage({ url: it.bookCover!, title: it.bookName }); }}
                            >
                              <img referrerPolicy="no-referrer" src={it.bookCover} alt="" className="h-full w-full object-contain" />
                            </div>
                          ) : (
                            <div className="h-12 w-9 bg-neutral-200 dark:bg-neutral-800 rounded flex-shrink-0 flex items-center justify-center font-numeric text-[8px] text-neutral-500">
                              NO IMG
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <TruncatedTooltip content={it.bookName} className="font-bold text-neutral-800 dark:text-neutral-100">
                                {it.bookName}
                              </TruncatedTooltip>"""

if target1 in sales:
    sales = sales.replace(target1, replacement1)
    print("Replaced target1")
else:
    print("Target1 not found")

# Fix hoveredOrder
target2 = """                {b.bookCover ? (
                  <div className="h-9 w-7 bg-neutral-100 rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                    <img referrerPolicy="no-referrer" src={b.bookCover} alt="" className="h-full w-full object-contain" />
                  </div>
                ) : (
                  <div className="h-9 w-7 bg-neutral-200 rounded flex-shrink-0 flex items-center justify-center font-numeric text-[8px] text-neutral-500">
                    NO IMG
                  </div>
                )}
                <div className="flex-1 min-w-0 select-text">
                  <p className="font-medium text-neutral-800 dark:text-neutral-200 truncate select-text" title={b.bookName}>
                    {b.bookName}
                  </p>"""

replacement2 = """                {b.bookCover ? (
                  <div 
                    className="h-9 w-7 bg-neutral-100 rounded overflow-hidden flex-shrink-0 flex items-center justify-center cursor-pointer hover:opacity-80 transition"
                    onClick={(e) => { e.stopPropagation(); setPreviewImage({ url: b.bookCover!, title: b.bookName }); }}
                  >
                    <img referrerPolicy="no-referrer" src={b.bookCover} alt="" className="h-full w-full object-contain" />
                  </div>
                ) : (
                  <div className="h-9 w-7 bg-neutral-200 rounded flex-shrink-0 flex items-center justify-center font-numeric text-[8px] text-neutral-500">
                    NO IMG
                  </div>
                )}
                <div className="flex-1 min-w-0 select-text">
                  <TruncatedTooltip content={b.bookName} className="font-medium text-neutral-800 dark:text-neutral-200 select-text">
                    {b.bookName}
                  </TruncatedTooltip>"""

if target2 in sales:
    sales = sales.replace(target2, replacement2)
    print("Replaced target2")
else:
    print("Target2 not found")

# Fix selectedOrderForProses
target3 = """                        {it.bookCover ? (
                          <img 
                            src={it.bookCover} 
                            alt={it.bookName} 
                            referrerPolicy="no-referrer"
                            className="w-10 h-12 object-cover rounded border border-neutral-200 dark:border-neutral-800 shrink-0" 
                          />
                        ) : (
                          <div className="w-10 h-12 bg-neutral-100 dark:bg-neutral-800 rounded flex items-center justify-center shrink-0 border border-neutral-200 dark:border-neutral-800">
                            <BookOpen className="h-4 w-4 text-neutral-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-neutral-800 dark:text-neutral-200 text-xs truncate">
                            {it.bookName}
                          </p>"""

replacement3 = """                        {it.bookCover ? (
                          <img 
                            src={it.bookCover} 
                            alt={it.bookName} 
                            referrerPolicy="no-referrer"
                            className="w-10 h-12 object-cover rounded border border-neutral-200 dark:border-neutral-800 shrink-0 cursor-pointer hover:opacity-80 transition" 
                            onClick={(e) => { e.stopPropagation(); setPreviewImage({ url: it.bookCover!, title: it.bookName }); }}
                          />
                        ) : (
                          <div className="w-10 h-12 bg-neutral-100 dark:bg-neutral-800 rounded flex items-center justify-center shrink-0 border border-neutral-200 dark:border-neutral-800">
                            <BookOpen className="h-4 w-4 text-neutral-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <TruncatedTooltip content={it.bookName} className="font-bold text-neutral-800 dark:text-neutral-200 text-xs">
                            {it.bookName}
                          </TruncatedTooltip>"""

if target3 in sales:
    sales = sales.replace(target3, replacement3)
    print("Replaced target3")
else:
    print("Target3 not found")


with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(sales)
