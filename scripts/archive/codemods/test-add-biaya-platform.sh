#!/bin/bash
sed -i '/BEBAN_HADIAH_PELANGGAN: { code/a \  BEBAN_PLATFORM: { code: '"'"'5320'"'"', name: '"'"'Biaya Platform'"'"', type: '"'"'Expenses'"'"', subType: '"'"'Beban Operasional'"'"', systemKey: '"'"'beban_platform'"'"' },' src/lib/journalAuto.ts
