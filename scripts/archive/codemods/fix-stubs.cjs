const fs = require('fs');
let content = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

content = content.replace("const parsePoDateToString = (date: any) => '';", 
`const formatToHTMLDateImpl = (date: any) => {
    if (!date) return '';
    try {
      if (date instanceof Date) return date.toISOString().split('T')[0];
      if (date.seconds) return new Date(date.seconds * 1000).toISOString().split('T')[0];
      return new Date(date).toISOString().split('T')[0];
    } catch { return ''; }
  };
  const parsePoDateToString = (date: any) => formatToHTMLDateImpl(date);`);

content = content.replace("const convertStringToTimestamp = (str: any) => Timestamp.now();",
`const convertStringToTimestamp = (str: any) => {
    if (!str) return Timestamp.now();
    try {
      const d = new Date(str);
      return Timestamp.fromDate(d);
    } catch { return Timestamp.now(); }
  };`);
  
content = content.replace("const formatToHTMLDate = (date: any) => '';",
`const formatToHTMLDate = (date: any) => formatToHTMLDateImpl(date);`);

fs.writeFileSync('src/components/PurchasesTab.tsx', content);
