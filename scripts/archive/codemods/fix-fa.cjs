const fs = require('fs');
let code = fs.readFileSync('src/components/FixedAssetsTab.tsx', 'utf8');

code = code.replace(
  "              id: '1301',\n              code: '1301',\n              name: 'Akumulasi Penyusutan',\n              type: 'Assets',\n              subType: 'Aset Tidak Lancar',\n              parentAccount: '1300 - Aset Tetap',\n              isActive: true,\n              description: 'Akumulasi penyusutan aset tetap (contra-asset)',\n              createdAt: Timestamp.now(),\n              systemKey: 'aset_tetap',",
  "              id: '1301',\n              code: '1301',\n              name: 'Akumulasi Penyusutan',\n              type: 'Assets',\n              subType: 'Aset Tidak Lancar',\n              parentAccount: '1300 - Aset Tetap',\n              isActive: true,\n              description: 'Akumulasi penyusutan aset tetap (contra-asset)',\n              createdAt: Timestamp.now(),\n              systemKey: 'akumulasi_penyusutan',"
);

code = code.replace(
  "              id: '5200',\n              code: '5200',\n              name: 'Beban Penyusutan',\n              type: 'Expenses',\n              subType: 'Beban Operasional',\n              isActive: true,\n              description: 'Akun utama untuk beban penyusutan operasional',\n              createdAt: Timestamp.now(),\n              systemKey: 'aset_tetap',",
  "              id: '5200',\n              code: '5200',\n              name: 'Beban Penyusutan',\n              type: 'Expenses',\n              subType: 'Beban Operasional',\n              isActive: true,\n              description: 'Akun utama untuk beban penyusutan operasional',\n              createdAt: Timestamp.now(),\n              systemKey: 'beban_penyusutan',"
);

fs.writeFileSync('src/components/FixedAssetsTab.tsx', code);
