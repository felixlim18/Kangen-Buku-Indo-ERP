const fs = require('fs');
let content = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

const salesTabStart = `export const SalesTab: React.FC = () => {`;
const hookToAdd = `\n  const [isMobileScreen, setIsMobileScreen] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);\n`;

if (content.includes(salesTabStart)) {
  content = content.replace(salesTabStart, salesTabStart + hookToAdd);
  fs.writeFileSync('src/components/SalesTab.tsx', content);
  console.log('isMobileScreen hook added');
} else {
  console.log('Failed to add hook');
}
