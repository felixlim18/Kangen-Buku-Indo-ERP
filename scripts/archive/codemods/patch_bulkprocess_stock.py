import re

with open('src/components/BulkProcessModal.tsx', 'r') as f:
    content = f.read()

target1 = r"""interface BulkProcessModalProps \{
  isOpen: boolean;
  onClose: \(\) => void;
  menungguOrders: SalesOrder\[\];
  inventories: any\[\];
\}"""
replacement1 = r"""interface BulkProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  menungguOrders: SalesOrder[];
  inventories: any[];
  ledgerEntries: any[];
  purchaseOrders: any[];
  salesOrders: any[];
  damagedRecords: any[];
}"""
content = re.sub(target1, replacement1, content)

target2 = r"import \{ confirmSalesOrderTransaction \} from '\.\./lib/db-helpers';"
replacement2 = r"""import { confirmSalesOrderTransaction } from '../lib/db-helpers';
import { getCurrentKontrolStokForBook } from '../lib/inventory-utils';"""
content = re.sub(target2, replacement2, content)

target3 = r"export const BulkProcessModal: React\.FC<BulkProcessModalProps> = \(\{ isOpen, onClose, menungguOrders, inventories \}\) => \{"
replacement3 = r"export const BulkProcessModal: React.FC<BulkProcessModalProps> = ({ isOpen, onClose, menungguOrders, inventories, ledgerEntries, purchaseOrders, salesOrders, damagedRecords }) => {"
content = re.sub(target3, replacement3, content)

target4 = r"""    const localStockMap = new Map<string, number>\(\);
    for \(const inv of inventories\) \{
      localStockMap\.set\(inv\.bookId, inv\.endingStock \|\| 0\);
    \}"""
replacement4 = r"""    const localStockMap = new Map<string, number>();
    for (const inv of inventories) {
      const avail = getCurrentKontrolStokForBook(inv.bookId, inventories, ledgerEntries, purchaseOrders, salesOrders, damagedRecords);
      localStockMap.set(inv.bookId, avail);
    }"""
content = re.sub(target4, replacement4, content)

with open('src/components/BulkProcessModal.tsx', 'w') as f:
    f.write(content)
