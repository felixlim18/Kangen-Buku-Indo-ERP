const fs = require('fs');
let content = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

const missing3 = `
  const html5QrCodeRef = useRef<any>(null);
  const [startDate, setStartDate] = useState<any>(null);
  const [endDate, setEndDate] = useState<any>(null);
  const pageSize = 50;
  const parsePoDateToString = (date: any) => '';
  const convertStringToTimestamp = (str: any) => Timestamp.now();
  const [poPresetLabel, setPoPresetLabel] = useState('Semua');
  const [activeTab, setActiveTab] = useState('orders');
  const setCsvPlatformId = (id: any) => {};
  const formatToHTMLDate = (date: any) => '';
  const [trackingNumberInputs, setTrackingNumberInputs] = useState<any>({});
  const handleSaveTrackingNumber = async (po: any, val: any) => {};
`;

content = content.replace('const [poStatusFilter, _setPoStatusFilter] = useState(\'all\');', missing3 + '\n  const [poStatusFilter, _setPoStatusFilter] = useState(\'all\');');

fs.writeFileSync('src/components/PurchasesTab.tsx', content);
