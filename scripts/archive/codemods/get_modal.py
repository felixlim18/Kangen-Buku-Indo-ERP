import re

with open('src/components/SalesTab.tsx', 'r') as f:
    sales = f.read()

start_index = sales.find('{isProsesConfirmOpen && selectedOrderForProses && (')
if start_index == -1:
    print("Start not found")
else:
    end_index = sales.find('{/* Camera Scanner Interstitial Layer Overlay */}', start_index)
    if end_index == -1:
        print("End not found")
    else:
        print(sales[start_index:end_index])
