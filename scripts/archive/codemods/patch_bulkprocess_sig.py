import re

with open('src/components/BulkProcessModal.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    'export const BulkProcessModal: React.FC<BulkProcessModalProps> = ({ isOpen, onClose, menungguOrders }) => {',
    'export const BulkProcessModal: React.FC<BulkProcessModalProps> = ({ isOpen, onClose, menungguOrders, inventories }) => {'
)

with open('src/components/BulkProcessModal.tsx', 'w') as f:
    f.write(content)
