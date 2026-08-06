import re

with open('src/components/SalesTab.tsx', 'r') as f:
    code = f.read()

# 1. Extract and remove the old exportSalesToCSV and downloadCSVTemplate
pattern = re.compile(r'  const downloadCSVTemplate = \(\) => \{.*?\};\n\n  const exportSalesToCSV = \(\) => \{.*?\};\n', re.DOTALL)
if pattern.search(code):
    print("Found old functions!")
    code = pattern.sub('', code)
else:
    print("Could not find old functions using regex.")
    # Let's try finding them individually
    p1 = re.compile(r'  const downloadCSVTemplate = \(\) => \{.*?\};\n', re.DOTALL)
    p2 = re.compile(r'  const exportSalesToCSV = \(\) => \{.*?\};\n', re.DOTALL)
    if p1.search(code) and p2.search(code):
        code = p1.sub('', code)
        code = p2.sub('', code)
        print("Found and removed individually.")

# 2. Define the new functions
new_funcs = """
  const downloadCSVTemplate = () => {
    const headers = [
      'Kode Order',
      'Tanggal Order (YYYY-MM-DD)',
      'Nama Pemesan',
      'Nama Platform',
      'Sumber Order',
      'Channel',
      'Toko/Platform',
      'Metode Pembayaran',
      'Logistik',
      'Detail Pengiriman',
      'No. Resi',
      'No. Pesanan',
      'Daftar Item (BookName:Qty;BookName:Qty)',
      'Subtotal (NT$)',
      'Diskon (NT$)',
      'Total (NT$)',
      'Status (draft/confirmed/shipped/completed/cancelled)',
      'Catatan Pelanggan'
    ].join(',');
    const row1 = [
      '#S2607141',
      '2026-07-14',
      'Budi',
      'Budi_Shopee',
      'Marketplace',
      'Shopee',
      'Shopee - BukuIndo',
      'COD',
      '7-11',
      'Toko 7-11 Cabang X',
      'RESI-12345',
      'ORD12345',
      'Laskar Pelangi:1;Bumi Manusia:2',
      '1050',
      '50',
      '1000',
      'draft',
      'Tolong dibungkus rapi'
    ].map(v => `"${v}"`).join(',');
    
    const csvContent = "\\uFEFF" + [headers, row1].join("\\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "template_sales_orders.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportSalesToCSV = () => {
    const headers = [
      'Kode Order',
      'Tanggal Order',
      'Nama Pemesan',
      'Nama Platform',
      'Sumber Order',
      'Channel',
      'Toko/Platform',
      'Metode Pembayaran',
      'Logistik',
      'Detail Pengiriman',
      'No. Resi',
      'No. Pesanan',
      'Daftar Item',
      'Subtotal (NT$)',
      'Diskon (NT$)',
      'Total (NT$)',
      'Status',
      'Catatan Pelanggan'
    ].join(',');

    const rows = searchedOrders.map(order => {
      const itemsStr = (order.items || []).map(i => `${i.bookName}:${i.qty}`).join('; ');
      return [
        order.orderCode || '',
        order.orderDate?.toDate ? order.orderDate.toDate().toLocaleString() : '',
        order.customerName || '',
        order.customerPlatformName || '',
        order.orderType || '',
        order.platformChannel || '',
        order.platformOrder || '',
        order.paymentMethod || '',
        order.pickupLogistics || '',
        order.pickupDetails || '',
        order.shipment?.shippingNumber || '',
        order.orderNumber || '',
        itemsStr,
        (order.subtotal / 100).toString(),
        (order.discount / 100).toString(),
        (order.totalPrice / 100).toString(),
        order.status || '',
        order.customerNote || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = "\\uFEFF" + [headers, ...rows].join("\\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sales_orders_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
"""

# Insert new functions after paginatedOrders
target_insert = "const paginatedOrders = searchedOrders.slice(startIndex, startIndex + itemsPerPage);"
if target_insert in code:
    code = code.replace(target_insert, target_insert + "\n" + new_funcs)
    print("Inserted new functions successfully.")
else:
    print("Could not find insertion point!")

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(code)

