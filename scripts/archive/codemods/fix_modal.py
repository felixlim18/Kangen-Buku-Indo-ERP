import re

with open('src/components/SalesTab.tsx', 'r') as f:
    sales = f.read()

target1 = """              <div className="pt-10 text-center text-[10px] text-neutral-400 italic">
                Terima kasih atas pesanan Anda. Hubungi kami bila ada ketidaksesuaian barang.
              </div>
            </div>
          </div>
        </div>
        );
      })()}"""

replacement1 = """              <div className="pt-10 text-center text-[10px] text-neutral-400 italic">
                Terima kasih atas pesanan Anda. Hubungi kami bila ada ketidaksesuaian barang.
              </div>
            </div>
          </div>
        </div>
      )}"""

if target1 in sales:
    sales = sales.replace(target1, replacement1)
    print("Fixed target1")
else:
    print("Target1 not found")

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(sales)
