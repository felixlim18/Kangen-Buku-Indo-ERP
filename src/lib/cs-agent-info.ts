// Topik pengetahuan toko untuk agent AI CS (settings/csAgent.info). Dipakai server (csAgent.ts, prompt)
// dan formulir "Pengetahuan toko" di CsAiTab.tsx.
export const CS_INFO_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'pengiriman', label: 'Pengiriman & ongkir', hint: 'Mis. 7-11 店到店 NT$60, FamilyMart NT$60, 宅配 NT$100. Gratis ongkir di atas NT$1000?' },
  { key: 'pembayaran', label: 'Pembayaran', hint: 'COD / transfer. Rekening tujuan (boleh disebut AI?), batas waktu transfer.' },
  { key: 'waktuProses', label: 'Waktu proses & jadwal kirim', hint: 'Mis. stok ready dikirim 1-2 hari kerja, pengiriman Senin-Sabtu.' },
  { key: 'preOrder', label: 'Stok kosong / PO dari Indonesia', hint: 'Bisa PO? Berapa lama? Perlu DP? Jadwal kargo?' },
  { key: 'harga', label: 'Harga, reseller, diskon & nego', hint: 'Harga reseller & syaratnya? Boleh nego/diskon (maks berapa) atau selalu ditolak?' },
  { key: 'promo', label: 'Promo yang sedang berjalan', hint: 'Bundling, member, promo bulan ini. Kosongkan kalau tidak ada.' },
  { key: 'retur', label: 'Retur & komplain', hint: 'Buku rusak, salah kirim, telat: kebijakannya apa?' },
  { key: 'jamOperasional', label: 'Jam operasional admin', hint: 'Mis. 10:00-21:00. Apa yang dikatakan AI di luar jam ini?' },
  { key: 'gaya', label: 'Gaya bicara & nama bot', hint: 'Panggil "Kak"? Emoji? Nama bot (mis. "Mimin KBI")? Mengaku AI kalau ditanya?' },
  { key: 'larangan', label: 'Yang tidak boleh dijawab / dijanjikan', hint: 'Mis. jangan janji tanggal tiba, jangan bahas politik.' },
  { key: 'luarTaiwan', label: 'Pelanggan di luar Taiwan', hint: 'Pelanggan dari Indonesia/negara lain: dilayani atau tidak?' },
  { key: 'dataPesanan', label: 'Data wajib untuk pesanan', hint: 'Mis. nama penerima, HP Taiwan, nama/nomor toko 7-11, COD/transfer.' },
  { key: 'lainnya', label: 'Lain-lain', hint: 'Info lain yang sering ditanya pelanggan.' },
];
