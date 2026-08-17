const fs = require('fs');
let content = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

// 1. Hide Masthead Card
content = content.replace(
  '<div className="bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 rounded-[14px] p-5 sm:p-6 shadow-xs mb-2">',
  '<div className="hidden md:block bg-white dark:bg-neutral-900 border border-[#E7E1D2] dark:border-neutral-800 rounded-[14px] p-5 sm:p-6 shadow-xs mb-2">'
);

// 2. Fix Search Bar Height
content = content.replace(
  '<div className="relative flex-1 flex items-center bg-white dark:bg-neutral-800/60 border border-[#E7E1D2] dark:border-neutral-700/60 rounded-[8px] px-3 py-1.5 focus-within:border-[#2b5a9e] focus-within:ring-2 focus-within:ring-[#2b5a9e]/10 transition">',
  '<div className="relative flex-1 flex items-center h-10 bg-white dark:bg-neutral-800/60 border border-[#E7E1D2] dark:border-neutral-700/60 rounded-[8px] px-3 focus-within:border-[#2b5a9e] focus-within:ring-2 focus-within:ring-[#2b5a9e]/10 transition">'
);
content = content.replace(
  /className="w-full bg-transparent border-none outline-none font-\['Lexend'\] text-\[13px\] text-\[#0d1117\] dark:text-white placeholder-\[#9ca3af\] h-7"/g,
  'className="w-full bg-transparent border-none outline-none font-[\'Lexend\'] text-[13px] text-[#0d1117] dark:text-white placeholder-[#9ca3af] h-full"'
);

// 3. Fix Filter Chips Styling
// Replace `border rounded-[11px] p-3` with `rounded-[8px] p-2`
// Replace `border-[#0d1117] dark:border-white shadow-sm` with `bg-[#f1f5f9] dark:bg-neutral-800 shadow-sm border-transparent`
// Actually, since they asked to remove border entirely, we can remove the border classes.
content = content.replace(/bg-white dark:bg-neutral-900 border rounded-\[11px\] p-3 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none/g, 
  'bg-white dark:bg-neutral-900 rounded-[8px] p-2 text-left transition duration-150 relative overflow-hidden cursor-pointer select-none border border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800');

content = content.replace(/\? 'border-\[#0d1117\] dark:border-white shadow-sm'/g, "? 'bg-[#e2e8f0] dark:bg-neutral-800 shadow-sm border-transparent'");
content = content.replace(/\? 'border-\[#f0a952\] bg-\[#fef8f0\] dark:bg-neutral-800'/g, "? 'bg-[#fef8f0] dark:bg-neutral-800 shadow-sm'");
content = content.replace(/\? 'border-\[#6366f1\] bg-\[#eef2ff\] dark:bg-neutral-800'/g, "? 'bg-[#eef2ff] dark:bg-neutral-800 shadow-sm'");
content = content.replace(/\? 'border-\[#1d6fa5\] bg-\[#e8f2f9\] dark:bg-neutral-800'/g, "? 'bg-[#e8f2f9] dark:bg-neutral-800 shadow-sm'");
content = content.replace(/\? 'border-\[#a8323b\] bg-\[#fbecec\] dark:bg-neutral-800'/g, "? 'bg-[#fbecec] dark:bg-neutral-800 shadow-sm'");
content = content.replace(/\? 'border-\[#4fbb8c\] bg-\[#eafaf1\] dark:bg-neutral-800'/g, "? 'bg-[#eafaf1] dark:bg-neutral-800 shadow-sm'");
content = content.replace(/\? 'border-\[#5b6472\] bg-\[#f1f2f4\] dark:bg-neutral-800'/g, "? 'bg-[#f1f2f4] dark:bg-neutral-800 shadow-sm'");

// Also remove the unselected border classes
content = content.replace(/: 'border-\[#E7E1D2\] dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'/g, ": ''");

// Reduce font sizes inside chips
content = content.replace(/text-\[12\.5px\] font-semibold/g, 'text-[10px] font-semibold');
content = content.replace(/text-\[11\.5px\] font-semibold/g, 'text-[10px] font-semibold');
content = content.replace(/font-bold text-\[24px\] leading-none/g, 'font-bold text-[18px] leading-none');
content = content.replace(/font-bold text-\[21px\] leading-none/g, 'font-bold text-[16px] leading-none');

fs.writeFileSync('src/components/SalesTab.tsx', content);
console.log('Fixed SalesTab.tsx layout issues!');
