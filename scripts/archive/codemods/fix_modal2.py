import re

with open('src/components/SalesTab.tsx', 'r') as f:
    sales = f.read()

target2 = """                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Camera Scanner Interstitial Layer Overlay */}"""

replacement2 = """                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Camera Scanner Interstitial Layer Overlay */}"""

if target2 in sales:
    sales = sales.replace(target2, replacement2)
    print("Fixed target2")
else:
    print("Target2 not found")

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(sales)
