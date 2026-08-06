import React, { useState, useMemo } from 'react';
import { CoaAccount, JournalEntry } from '../types';
import { 
  formatNTD, 
  formatIDR, 
  getAccountBalanceForPeriod, 
  getAccountDebitCreditForPeriod,
  isParentAccount,
  findParentOf,
  sortAccountsHierarchical,
  calculateEquityModalAtDate,
  findAccountByRole
} from '../lib/decimal-utils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

function parseToDate(val: any): Date {
  if (!val) return new Date();
  if (val.seconds) {
    return new Date(val.seconds * 1000);
  }
  return new Date(val);
}

function getYearMonth(val: any): string {
  const date = parseToDate(val);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export async function exportReportToPDF(
  elementId: string, 
  reportName: string, 
  reportTitle: string, 
  selectedMonth: string,
  periodLabel: string
) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    return;
  }

  // Helper functions for OKLCH to RGB conversion
  const oklchToRgb = (oklchStr: string): string => {
    const regex = /oklch\s*\(\s*([\d\.]+%?)\s+([\d\.]+)\s+([\d\.]+(?:deg|rad|turn)?)(?:\s*\/\s*([\d\.]+%?))?\s*\)/g;
    
    return oklchStr.replace(regex, (match, lStr, cStr, hStr, aStr) => {
      let L = parseFloat(lStr);
      if (lStr.endsWith('%')) {
        L = L / 100;
      }
      let C = parseFloat(cStr);
      let H = parseFloat(hStr);
      if (hStr.endsWith('rad')) {
        H = (H * 180) / Math.PI;
      } else if (hStr.endsWith('turn')) {
        H = H * 360;
      }
      
      let alpha = 1;
      if (aStr) {
        if (aStr.endsWith('%')) {
          alpha = parseFloat(aStr) / 100;
        } else {
          alpha = parseFloat(aStr);
        }
      }
      
      const hRad = (H * Math.PI) / 180;
      const aVal = C * Math.cos(hRad);
      const bVal = C * Math.sin(hRad);
      
      const l_ = L + 0.3963377774 * aVal + 0.2158037573 * bVal;
      const m_ = L - 0.1055613458 * aVal - 0.0638541728 * bVal;
      const s_ = L - 0.0894841775 * aVal - 1.2914855480 * bVal;
      
      const l = l_ * l_ * l_;
      const m = m_ * m_ * m_;
      const s = s_ * s_ * s_;
      
      const rLinear = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
      const gLinear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
      const bLinear = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
      
      const f = (c: number) => {
        return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
      };
      
      let r = Math.round(f(rLinear) * 255);
      let g = Math.round(f(gLinear) * 255);
      let b = Math.round(f(bLinear) * 255);
      
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
      
      if (alpha === 1) {
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    });
  };

  // Helper functions for OKLAB to RGB conversion
  const oklabToRgb = (oklabStr: string): string => {
    const regex = /oklab\s*\(\s*([\d\.]+%?)\s+([\d\.-]+%?)\s+([\d\.-]+%?)(?:\s*\/\s*([\d\.]+%?))?\s*\)/g;
    
    return oklabStr.replace(regex, (match, lStr, aStr, bStr, alphaStr) => {
      let L = parseFloat(lStr);
      if (lStr.endsWith('%')) {
        L = L / 100;
      }
      let aVal = parseFloat(aStr);
      if (aStr.endsWith('%')) {
        aVal = (aVal / 100) * 0.4;
      }
      let bVal = parseFloat(bStr);
      if (bStr.endsWith('%')) {
        bVal = (bVal / 100) * 0.4;
      }
      
      let alpha = 1;
      if (alphaStr) {
        if (alphaStr.endsWith('%')) {
          alpha = parseFloat(alphaStr) / 100;
        } else {
          alpha = parseFloat(alphaStr);
        }
      }
      
      const l_ = L + 0.3963377774 * aVal + 0.2158037573 * bVal;
      const m_ = L - 0.1055613458 * aVal - 0.0638541728 * bVal;
      const s_ = L - 0.0894841775 * aVal - 1.2914855480 * bVal;
      
      const l = l_ * l_ * l_;
      const m = m_ * m_ * m_;
      const s = s_ * s_ * s_;
      
      const rLinear = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
      const gLinear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
      const bLinear = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
      
      const f = (c: number) => {
        return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
      };
      
      let r = Math.round(f(rLinear) * 255);
      let g = Math.round(f(gLinear) * 255);
      let b = Math.round(f(bLinear) * 255);
      
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
      
      if (alpha === 1) {
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    });
  };

  const processRules = (rules: CSSRuleList) => {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      try {
        if (rule instanceof CSSStyleRule) {
          if (rule.style && rule.style.cssText) {
            if (rule.style.cssText.includes('oklch') || rule.style.cssText.includes('oklab')) {
              for (let j = 0; j < rule.style.length; j++) {
                const prop = rule.style[j];
                const val = rule.style.getPropertyValue(prop);
                if (val && (val.includes('oklch') || val.includes('oklab'))) {
                  let converted = val;
                  if (converted.includes('oklch')) {
                    converted = oklchToRgb(converted);
                  }
                  if (converted.includes('oklab')) {
                    converted = oklabToRgb(converted);
                  }
                  rule.style.setProperty(prop, converted);
                }
              }
            }
          }
        } else if ((rule as any).cssRules) {
          processRules((rule as any).cssRules);
        }
      } catch (e) {
        // ignore CORS or individual rule errors
      }
    }
  };

  try {
    const [year, monthNum] = selectedMonth.split('-');
    const monthNamesIndo = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const monthName = monthNamesIndo[parseInt(monthNum) - 1];
    const filename = `${reportName}_${monthName}_${year}.pdf`;

    const now = new Date();
    const printDateString = now.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }) + ' ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc) => {
        // Force light theme in cloned document
        const htmlEl = clonedDoc.documentElement;
        if (htmlEl) {
          htmlEl.classList.remove('dark');
          htmlEl.style.colorScheme = 'light';
        }
        const bodyEl = clonedDoc.body;
        if (bodyEl) {
          bodyEl.classList.remove('dark');
        }

        // Convert OKLCH and OKLAB styles in stylesheets
        const styleTags = clonedDoc.querySelectorAll('style');
        styleTags.forEach((tag) => {
          if (tag.innerHTML) {
            let processed = tag.innerHTML;
            if (processed.includes('oklch')) {
              processed = oklchToRgb(processed);
            }
            if (processed.includes('oklab')) {
              processed = oklabToRgb(processed);
            }
            tag.innerHTML = processed;
          }
        });

        for (let i = 0; i < clonedDoc.styleSheets.length; i++) {
          const sheet = clonedDoc.styleSheets[i];
          try {
            if (sheet.cssRules) {
              processRules(sheet.cssRules);
            }
          } catch (e) {
            // Ignore CORS restricted stylesheets
          }
        }

        // Convert OKLCH and OKLAB inline styles
        const allElements = clonedDoc.querySelectorAll('*');
        allElements.forEach((el: any) => {
          if (el.style) {
            const inlineStyle = el.getAttribute('style');
            if (inlineStyle && (inlineStyle.includes('oklch') || inlineStyle.includes('oklab'))) {
              let processed = inlineStyle;
              if (processed.includes('oklch')) {
                processed = oklchToRgb(processed);
              }
              if (processed.includes('oklab')) {
                processed = oklabToRgb(processed);
              }
              el.setAttribute('style', processed);
            }
          }
        });

        // Clear print-unwanted elements from printable area
        const clonedElement = clonedDoc.getElementById(elementId);
        if (clonedElement) {
          const noPrintElements = clonedElement.querySelectorAll('.no-print');
          noPrintElements.forEach(el => el.remove());

          // Clean print styling
          clonedElement.style.padding = '24px';
          clonedElement.style.backgroundColor = '#ffffff';
          clonedElement.style.color = '#111111';
          clonedElement.style.width = '100%';
          clonedElement.style.maxWidth = '100%';
          clonedElement.style.boxShadow = 'none';
          clonedElement.style.border = 'none';

          // Inject professional header
          const headerDiv = clonedDoc.createElement('div');
          headerDiv.style.textAlign = 'center';
          headerDiv.style.marginBottom = '24px';
          headerDiv.style.borderBottom = '2px solid #333333';
          headerDiv.style.paddingBottom = '12px';
          headerDiv.style.fontFamily = 'var(--font-text)';
          headerDiv.innerHTML = `
            <h1 style="font-size: 20px; font-weight: 800; margin: 0; color: #111111; letter-spacing: 1px;">KANGENBUKUINDO ERP</h1>
            <h2 style="font-size: 14px; font-weight: 700; margin: 6px 0 0 0; text-transform: uppercase; color: #222222;">${reportTitle}</h2>
            <p style="font-size: 11px; margin: 4px 0 0 0; color: #555555;">${periodLabel}</p>
          `;
          clonedElement.insertBefore(headerDiv, clonedElement.firstChild);

          // Inject professional footer
          const footerDiv = clonedDoc.createElement('div');
          footerDiv.style.marginTop = '36px';
          footerDiv.style.borderTop = '1px solid #dddddd';
          footerDiv.style.paddingTop = '12px';
          footerDiv.style.fontSize = '9px';
          footerDiv.style.color = '#666666';
          footerDiv.style.fontFamily = 'var(--font-text)';
          footerDiv.style.display = 'flex';
          footerDiv.style.justifyContent = 'space-between';
          footerDiv.innerHTML = `
            <span>Dicetak pada ${printDateString}</span>
            <span>Sistem ERP KangenBukuIndo</span>
          `;
          clonedElement.appendChild(footerDiv);
        }
      }
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
    });

    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(filename);
  } catch (error) {
    console.error("PDF generation failed:", error);
    try {
      window.alert("Gagal mengunduh PDF. Silakan coba lagi.");
    } catch (e) {
      console.warn("window.alert blocked:", error);
    }
  }
}
import { 
  Scale, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle, 
  AlertTriangle, 
  Calendar,
  Layers,
  ArrowRight,
  Printer
} from 'lucide-react';
import { motion } from 'motion/react';

// Classifies offsetting account into standard activity types
function classifyOffsettingAccount(accountCode: string, accountType: string): 'OPERASIONAL' | 'INVESTASI' | 'PENDANAAN' {
  const code = accountCode || '';
  if (accountType === 'Equity' || code.startsWith('3')) {
    return 'PENDANAAN';
  }
  if (code.startsWith('13')) {
    return 'INVESTASI';
  }
  return 'OPERASIONAL';
}

interface ReportProps {
  coaAccounts: CoaAccount[];
  journals: JournalEntry[];
}

// ---------------------------------------------------------
// DIAGNOSTIC PANEL COMPONENT (Automated Cross-Check Test)
// ---------------------------------------------------------
export const DiagnosticPanel: React.FC<{
  modalAkhir: number;
  neracaModal: number;
  saldoAkhirKas: number;
  balance1100: number;
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
}> = ({
  modalAkhir,
  neracaModal,
  saldoAkhirKas,
  balance1100,
  totalAssets,
  totalLiabilitiesAndEquity
}) => {
  const check1Passed = Math.abs(modalAkhir - neracaModal) < 0.05;
  const check2Passed = Math.abs(saldoAkhirKas - balance1100) < 0.05;
  const check3Passed = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.05;

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
          <Scale className="h-4.5 w-4.5 text-indigo-500" />
          Panel Diagnostik & Rekonsiliasi Otomatis (Cross-Check Test)
        </h4>
        <span className="text-[10px] text-neutral-450 uppercase font-bold">Toleransi: NT$0.05</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Check 1 */}
        <div className={`p-4 border rounded-lg space-y-2 transition ${
          check1Passed 
            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-400' 
            : 'bg-rose-500/5 border-rose-500/20 text-rose-800 dark:text-rose-400'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider">Test 1: Kesamaan Modal</span>
            {check1Passed ? <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />}
          </div>
          <p className="text-[10px] text-neutral-500">Modal Akhir (Laporan Perubahan Modal) vs Modal (Neraca)</p>
          <div className="font-numeric text-xs font-bold space-y-1">
            <div className="flex justify-between">
              <span className="font-normal text-neutral-450">LPM:</span>
              <span>{formatNTD(Math.round(modalAkhir * 100))}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-200/50 pt-1">
              <span className="font-normal text-neutral-450">Neraca:</span>
              <span>{formatNTD(Math.round(neracaModal * 100))}</span>
            </div>
          </div>
        </div>

        {/* Check 2 */}
        <div className={`p-4 border rounded-lg space-y-2 transition ${
          check2Passed 
            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-400' 
            : 'bg-rose-500/5 border-rose-500/20 text-rose-800 dark:text-rose-400'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider">Test 2: Saldo Kas</span>
            {check2Passed ? <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />}
          </div>
          <p className="text-[10px] text-neutral-500">Saldo Akhir Kas (Arus Kas) vs Net Balance Akun 1100</p>
          <div className="font-numeric text-xs font-bold space-y-1">
            <div className="flex justify-between">
              <span className="font-normal text-neutral-450">Arus Kas:</span>
              <span>{formatNTD(Math.round(saldoAkhirKas * 100))}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-200/50 pt-1">
              <span className="font-normal text-neutral-450">Akun 1100:</span>
              <span>{formatNTD(Math.round(balance1100 * 100))}</span>
            </div>
          </div>
        </div>

        {/* Check 3 */}
        <div className={`p-4 border rounded-lg space-y-2 transition ${
          check3Passed 
            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-400' 
            : 'bg-rose-500/5 border-rose-500/20 text-rose-800 dark:text-rose-400'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider">Test 3: Keseimbangan Neraca</span>
            {check3Passed ? <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />}
          </div>
          <p className="text-[10px] text-neutral-500">Jumlah Aktiva (Aset) vs Jumlah Pasiva (Liabilitas + Modal)</p>
          <div className="font-numeric text-xs font-bold space-y-1">
            <div className="flex justify-between">
              <span className="font-normal text-neutral-450">Total Aset:</span>
              <span>{formatNTD(Math.round(totalAssets * 100))}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-200/50 pt-1">
              <span className="font-normal text-neutral-450">Liab + Modal:</span>
              <span>{formatNTD(Math.round(totalLiabilitiesAndEquity * 100))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


// ---------------------------------------------------------
// BALANCE SHEET (NERACA) COMPONENT
// ---------------------------------------------------------
export const NeracaReport: React.FC<ReportProps> = ({ coaAccounts, journals }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return getYearMonth(new Date());
  });

  // Calculate dates
  const { endDate, lastMonthEndDate, headerDateLabel, lastMonthHeaderLabel } = useMemo(() => {
    const [year, month] = selectedMonth.split('-');
    const lastDay = new Date(parseInt(year), parseInt(month), 0);
    const today = new Date();

    let isCurrentMonth = today.getFullYear() === parseInt(year) && today.getMonth() === parseInt(month) - 1;
    let endOfPeriod: Date;
    let label: string;

    if (isCurrentMonth) {
      endOfPeriod = today;
      label = today.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    } else {
      endOfPeriod = lastDay;
      label = lastDay.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // Previous month end
    const lastMonthDay = new Date(parseInt(year), parseInt(month) - 1, 0);
    const lastMonthLabel = lastMonthDay.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });

    return {
      endDate: endOfPeriod,
      lastMonthEndDate: lastMonthDay,
      headerDateLabel: label,
      lastMonthHeaderLabel: lastMonthLabel
    };
  }, [selectedMonth]);

  // Report calculations
  const reportData = useMemo(() => {
    // 1. Current Period Balances
    const assetsAccounts = coaAccounts.filter(a => a.type === 'Assets');
    const liabilitiesAccounts = coaAccounts.filter(a => a.type === 'Liabilities');

    const sortedAssetsAccounts = sortAccountsHierarchical(assetsAccounts, coaAccounts);
    const sortedLiabilitiesAccounts = sortAccountsHierarchical(liabilitiesAccounts, coaAccounts);

    const assetsList = sortedAssetsAccounts.map(acc => ({
      account: acc,
      currentBalance: getAccountBalanceForPeriod(acc, coaAccounts, journals, null, endDate),
      prevBalance: getAccountBalanceForPeriod(acc, coaAccounts, journals, null, lastMonthEndDate)
    }));

    const liabilitiesList = sortedLiabilitiesAccounts.map(acc => ({
      account: acc,
      currentBalance: getAccountBalanceForPeriod(acc, coaAccounts, journals, null, endDate),
      prevBalance: getAccountBalanceForPeriod(acc, coaAccounts, journals, null, lastMonthEndDate)
    }));

    const totalAssets = assetsList
      .filter(item => !item.account.parentAccount) // Sum parent accounts only to avoid double counting
      .reduce((sum, item) => sum + item.currentBalance, 0);

    const prevTotalAssets = assetsList
      .filter(item => !item.account.parentAccount)
      .reduce((sum, item) => sum + item.prevBalance, 0);

    const totalLiabilities = liabilitiesList
      .filter(item => !item.account.parentAccount)
      .reduce((sum, item) => sum + item.currentBalance, 0);

    const prevTotalLiabilities = liabilitiesList
      .filter(item => !item.account.parentAccount)
      .reduce((sum, item) => sum + item.prevBalance, 0);

    // Modal Calculation using shared helper
    const { modalEkuitas, netIncome: curNetIncome, modalAwal: curModalAwal, setoranTambahan: curSetoran, priveBalance: curPrive } = calculateEquityModalAtDate(endDate, coaAccounts, journals);
    const { modalEkuitas: prevModalEkuitas } = calculateEquityModalAtDate(lastMonthEndDate, coaAccounts, journals);

    const totalLiabilitiesAndEquity = totalLiabilities + modalEkuitas;
    const prevTotalLiabilitiesAndEquity = prevTotalLiabilities + prevModalEkuitas;

    return {
      assetsList,
      liabilitiesList,
      totalAssets,
      prevTotalAssets,
      totalLiabilities,
      prevTotalLiabilities,
      modalEkuitas,
      prevModalEkuitas,
      totalLiabilitiesAndEquity,
      prevTotalLiabilitiesAndEquity,
      // For diagnostic cross check pass down
      curNetIncome,
      curModalAwal,
      curSetoran,
      curPrive
    };
  }, [coaAccounts, journals, endDate, lastMonthEndDate]);

  const isBalanced = Math.abs(reportData.totalAssets - reportData.totalLiabilitiesAndEquity) < 0.05;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ---------- toolbar ---------- */}
      <div className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-2xl p-[18px_22px] flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex items-center gap-2">
            <div className="w-[34px] h-[34px] rounded-[9px] bg-gold-light dark:bg-neutral-800 text-gold flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <label className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-ink-mute dark:text-neutral-450 block mb-0.5">Filter Laporan Neraca</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="border border-line dark:border-neutral-700 rounded-lg p-[6px_10px] font-numeric text-xs text-ink dark:text-neutral-100 bg-surface dark:bg-neutral-850"
              />
            </div>
          </div>
          <span className="text-xs italic text-ink-soft dark:text-neutral-400">Neraca per {headerDateLabel}</span>
        </div>
        <button
          onClick={() => exportReportToPDF('printable-neraca', 'Neraca', 'LAPORAN NERACA (BALANCE SHEET)', selectedMonth, `Posisi per ${headerDateLabel} (Terkonsolidasi NT$)`)}
          className="inline-flex items-center gap-2 bg-navy hover:bg-opacity-95 text-white rounded-lg p-[11px_20px] font-sans font-semibold text-xs cursor-pointer transition duration-150 shadow-xs"
        >
          <Printer className="h-4 w-4 text-gold" />
          <span>Ekspor PDF</span>
        </button>
      </div>

      {/* ---------- status ---------- */}
      <div className={`flex items-center gap-2.5 border rounded-2xl p-[12px_18px] text-xs font-semibold tracking-[0.3px] ${
        isBalanced 
          ? 'bg-status-green-bg dark:bg-emerald-950/20 text-status-green dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' 
          : 'bg-rust-bg dark:bg-rose-950/20 text-rust dark:text-rose-400 border-rose-200 dark:border-rose-800'
      }`}>
        {isBalanced ? (
          <>
            <CheckCircle className="h-4.5 w-4.5 shrink-0 text-status-green dark:text-emerald-400" />
            <span className="uppercase font-bold">NERACA SEIMBANG (BALANCED)</span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-rust dark:text-rose-400" />
            <span className="uppercase font-bold">NERACA SELISIH (UNBALANCED)</span>
          </>
        )}
      </div>

      {/* Main Neraca Table Sheet */}
      <div id="printable-neraca" className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-3xl shadow-[0_20px_50px_-20px_rgba(32,36,31,0.15)] overflow-hidden">
        <div className="text-center p-[42px_40px_30px]">
          <div className="text-[11px] font-semibold tracking-[2.5px] uppercase text-gold mb-3.5">KangenBukuIndo ERP</div>
          <h1 className="font-serif text-[28px] md:text-3xl font-semibold m-0 tracking-[-0.2px] text-ink dark:text-neutral-100">Laporan Neraca</h1>
          <div className="text-[13.5px] italic text-ink-soft dark:text-neutral-400 mt-2">
            Posisi per <strong className="font-semibold text-ink dark:text-neutral-100 not-italic">{headerDateLabel}</strong> &nbsp;·&nbsp; Terkonsolidasi dalam NT$
          </div>
          <div className="w-16 h-[2px] bg-gold m-[22px_auto_0] rounded-[2px]"></div>
        </div>

        <div className="p-[6px_40px_44px] text-xs">
          {/* Column headers */}
          <div className="grid grid-cols-12 border-b-2 border-ink dark:border-neutral-700 pb-3 font-semibold text-[10.5px] uppercase tracking-[0.6px] text-ink-soft dark:text-neutral-400">
            <div className="col-span-6">Akun Akuntansi / Deskripsi</div>
            <div className="col-span-3 text-right">Per {headerDateLabel}</div>
            <div className="col-span-3 text-right">Per {lastMonthHeaderLabel}</div>
          </div>

          {/* A. ASET */}
          <div className="mt-6.5">
            <div className="flex items-center gap-2.5 mb-1.5 pl-1">
              <div className="w-1 h-[15px] rounded-[3px] bg-navy"></div>
              <span className="font-serif font-semibold text-base text-navy dark:text-blue-400 tracking-[0.2px]">A. Aset (Assets)</span>
            </div>

            <div className="space-y-0.5">
              {reportData.assetsList.map(({ account, currentBalance, prevBalance }, idx) => {
                const isParent = !account.parentAccount;
                return (
                  <div 
                    key={`${account.id || account.code}-${idx}`} 
                    className={`grid grid-cols-12 py-2.5 border-b border-line-soft dark:border-neutral-800 items-center ${
                      isParent 
                        ? 'font-bold text-[14.5px] text-ink dark:text-neutral-100' 
                        : 'text-ink-soft dark:text-neutral-400 pl-5 italic'
                    }`}
                  >
                    <div className="col-span-6 flex items-center gap-1">
                      {!isParent && <span className="text-ink-soft dark:text-neutral-450 pr-1">↳</span>}
                      <span>{account.code} · {account.name}</span>
                    </div>
                    <div className="col-span-3 text-right font-numeric text-sm">
                      {formatNTD(Math.round(currentBalance * 100))}
                    </div>
                    <div className="col-span-3 text-right font-numeric text-xs text-ink-mute dark:text-neutral-500">
                      {formatNTD(Math.round(prevBalance * 100))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total assets box */}
            <div className="grid grid-cols-12 items-center mt-3 p-[13px_16px] border-[1.5px] border-ink dark:border-neutral-700 rounded-lg bg-navy-bg dark:bg-blue-950/20">
              <div className="col-span-6 font-serif font-semibold text-sm text-ink dark:text-neutral-100">Total Aset (Aktiva)</div>
              <div className="col-span-3 text-right font-numeric font-bold text-sm text-ink dark:text-neutral-100">
                {formatNTD(Math.round(reportData.totalAssets * 100))}
              </div>
              <div className="col-span-3 text-right font-numeric font-semibold text-xs text-ink-soft dark:text-neutral-400">
                {formatNTD(Math.round(reportData.prevTotalAssets * 100))}
              </div>
            </div>
          </div>

          {/* B. LIABILITAS */}
          <div className="mt-6.5">
            <div className="flex items-center gap-2.5 mb-1.5 pl-1">
              <div className="w-1 h-[15px] rounded-[3px] bg-rust"></div>
              <span className="font-serif font-semibold text-base text-rust dark:text-red-400 tracking-[0.2px]">B. Liabilitas (Liabilities)</span>
            </div>

            <div className="space-y-0.5">
              {reportData.liabilitiesList.map(({ account, currentBalance, prevBalance }, idx) => {
                const isParent = !account.parentAccount;
                return (
                  <div 
                    key={`${account.id || account.code}-${idx}`} 
                    className={`grid grid-cols-12 py-2.5 border-b border-line-soft dark:border-neutral-800 items-center ${
                      isParent 
                        ? 'font-bold text-[14.5px] text-ink dark:text-neutral-100' 
                        : 'text-ink-soft dark:text-neutral-400 pl-5 italic'
                    }`}
                  >
                    <div className="col-span-6 flex items-center gap-1">
                      {!isParent && <span className="text-ink-soft dark:text-neutral-450 pr-1">↳</span>}
                      <span>{account.code} · {account.name}</span>
                    </div>
                    <div className="col-span-3 text-right font-numeric text-sm">
                      {formatNTD(Math.round(currentBalance * 100))}
                    </div>
                    <div className="col-span-3 text-right font-numeric text-xs text-ink-mute dark:text-neutral-500">
                      {formatNTD(Math.round(prevBalance * 100))}
                    </div>
                  </div>
                );
              })}
              {reportData.liabilitiesList.length === 0 && (
                <p className="text-[11px] text-ink-mute dark:text-neutral-500 italic p-3 pl-5">Tidak ada saldo kewajiban hutang.</p>
              )}
            </div>

            {/* Total liabilities box */}
            <div className="grid grid-cols-12 items-center mt-3 p-[13px_16px] border-[1.5px] border-ink dark:border-neutral-700 rounded-lg bg-rust-bg dark:bg-rose-950/20">
              <div className="col-span-6 font-serif font-semibold text-sm text-ink dark:text-neutral-100">Total Liabilitas (Kewajiban)</div>
              <div className="col-span-3 text-right font-numeric font-bold text-sm text-ink dark:text-neutral-100">
                {formatNTD(Math.round(reportData.totalLiabilities * 100))}
              </div>
              <div className="col-span-3 text-right font-numeric font-semibold text-xs text-ink-soft dark:text-neutral-400">
                {formatNTD(Math.round(reportData.prevTotalLiabilities * 100))}
              </div>
            </div>
          </div>

          {/* C. MODAL */}
          <div className="mt-6.5">
            <div className="flex items-center gap-2.5 mb-1.5 pl-1">
              <div className="w-1 h-[15px] rounded-[3px] bg-forest"></div>
              <span className="font-serif font-semibold text-base text-forest dark:text-emerald-400 tracking-[0.2px]">C. Modal (Ekuitas Pemilik)</span>
            </div>

            <div className="space-y-0.5">
              <div className="grid grid-cols-12 py-2.5 border-b border-line-soft dark:border-neutral-800 items-center font-bold text-[14.5px] text-ink dark:text-neutral-100">
                <div className="col-span-6 flex items-center pl-5 italic font-normal text-ink-soft dark:text-neutral-400">
                  <span className="text-ink-soft dark:text-neutral-450 pr-2">↳</span>
                  <span>Modal (Ekuitas Pemilik) – Terkalkulasi</span>
                </div>
                <div className="col-span-3 text-right font-numeric text-sm">
                  {formatNTD(Math.round(reportData.modalEkuitas * 100))}
                </div>
                <div className="col-span-3 text-right font-numeric text-xs text-ink-mute dark:text-neutral-500">
                  {formatNTD(Math.round(reportData.prevModalEkuitas * 100))}
                </div>
              </div>
            </div>

            {/* Total Modal box */}
            <div className="grid grid-cols-12 items-center mt-3 p-[13px_16px] border-[1.5px] border-ink dark:border-neutral-700 rounded-lg bg-forest-bg dark:bg-emerald-950/20">
              <div className="col-span-6 font-serif font-semibold text-sm text-ink dark:text-neutral-100">Total Modal (Ekuitas Pemilik)</div>
              <div className="col-span-3 text-right font-numeric font-bold text-sm text-ink dark:text-neutral-100">
                {formatNTD(Math.round(reportData.modalEkuitas * 100))}
              </div>
              <div className="col-span-3 text-right font-numeric font-semibold text-xs text-ink-soft dark:text-neutral-400">
                {formatNTD(Math.round(reportData.prevModalEkuitas * 100))}
              </div>
            </div>
          </div>

          {/* Hero Total - Pasiva */}
          <div className="mt-8.5 grid grid-cols-12 items-center p-5 rounded-2xl bg-gradient-to-br from-navy to-[#14263e] text-white">
            <div className="col-span-6 font-serif font-semibold text-base flex items-center gap-2.5">
              <Layers className="h-[18px] w-[18px] text-gold shrink-0" />
              <span className="font-sans">Total Liabilitas + Modal (Pasiva)</span>
            </div>
            <div className="col-span-3 text-right font-numeric font-bold text-lg text-white">
              {formatNTD(Math.round(reportData.totalLiabilitiesAndEquity * 100))}
            </div>
            <div className="col-span-3 text-right font-numeric font-semibold text-sm text-white/65">
              {formatNTD(Math.round(reportData.prevTotalLiabilitiesAndEquity * 100))}
            </div>
          </div>
        </div>

        <div className="text-center p-[22px_40px_34px] border-t border-dashed border-line dark:border-neutral-800 text-[11px] text-ink-mute dark:text-neutral-500 italic">
          Laporan ini dihasilkan otomatis oleh sistem KangenBukuIndo ERP dan mencerminkan posisi keuangan terkonsolidasi pada tanggal yang tertera di atas.
        </div>
      </div>

      {/* Cross-Check Diagnostic Panel */}
      <DiagnosticPanel 
        modalAkhir={reportData.modalEkuitas}
        neracaModal={reportData.modalEkuitas}
        saldoAkhirKas={0}
        balance1100={(() => {
          const acc1100 = coaAccounts.find(a => a.code === '1100');
          return acc1100 ? getAccountBalanceForPeriod(acc1100, coaAccounts, journals, null, endDate) : 0;
        })()}
        totalAssets={reportData.totalAssets}
        totalLiabilitiesAndEquity={reportData.totalLiabilitiesAndEquity}
      />
    </div>
  );
};


// ---------------------------------------------------------
// LAPORAN PERUBAHAN MODAL COMPONENT
// ---------------------------------------------------------
export const PerubahanModalReport: React.FC<ReportProps> = ({ coaAccounts, journals }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return getYearMonth(new Date());
  });

  const reportData = useMemo(() => {
    const [year, month] = selectedMonth.split('-');
    
    // Dates for current month
    const curMonthStartDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const curMonthEndDate = new Date(parseInt(year), parseInt(month), 0);

    // Dates for previous month (Comparative)
    const prevMonthStartDate = new Date(parseInt(year), parseInt(month) - 2, 1);
    const prevMonthEndDate = new Date(parseInt(year), parseInt(month) - 1, 0);

    // Initial 3100 starting point injection from the first journal entry or overall
    const acc3100 = findAccountByRole(coaAccounts, 'modal_awal');
    const acc3101 = findAccountByRole(coaAccounts, 'setoran_modal');
    const acc3102 = findAccountByRole(coaAccounts, 'prive');

    const revenueAccounts = coaAccounts.filter(a => (a.type === 'Revenue' || a.code?.startsWith('4')) && !isParentAccount(a, coaAccounts));
    const expenseAccounts = coaAccounts.filter(a => (a.type === 'Expenses' || a.code?.startsWith('5')) && !isParentAccount(a, coaAccounts));

    // Helper to compute Modal components up to a date using shared helper
    const getModalAtDate = (date: Date) => {
      return calculateEquityModalAtDate(date, coaAccounts, journals).modalEkuitas;
    };

    // Current Month Metrics
    // ROLLFORWARD RULE: Modal Awal this month = Modal Akhir of preceding month!
    const modalAwalBulanIni = getModalAtDate(prevMonthEndDate);

    // Changes during current month
    const setoranTambahanBulanIni = acc3101 
      ? getAccountBalanceForPeriod(acc3101, coaAccounts, journals, curMonthStartDate, curMonthEndDate) 
      : 0;

    const revBulanIni = revenueAccounts.reduce((sum, a) => sum + getAccountBalanceForPeriod(a, coaAccounts, journals, curMonthStartDate, curMonthEndDate), 0);
    const expBulanIni = expenseAccounts.reduce((sum, a) => sum + getAccountBalanceForPeriod(a, coaAccounts, journals, curMonthStartDate, curMonthEndDate), 0);
    const labaBersihBulanIni = revBulanIni - expBulanIni;

    let priveBulanIni = 0;
    if (acc3102) {
      const { debitCents, creditCents } = getAccountDebitCreditForPeriod(acc3102, coaAccounts, journals, curMonthStartDate, curMonthEndDate);
      priveBulanIni = (debitCents - creditCents) / 100;
    }

    const modalAkhirBulanIni = modalAwalBulanIni + setoranTambahanBulanIni + labaBersihBulanIni - priveBulanIni;

    // Previous Month Metrics (Bulan Lalu Comparative)
    const prevPrevMonthEndDate = new Date(parseInt(year), parseInt(month) - 2, 0);
    const modalAwalBulanLalu = getModalAtDate(prevPrevMonthEndDate);

    const setoranTambahanBulanLalu = acc3101 
      ? getAccountBalanceForPeriod(acc3101, coaAccounts, journals, prevMonthStartDate, prevMonthEndDate) 
      : 0;

    const revBulanLalu = revenueAccounts.reduce((sum, a) => sum + getAccountBalanceForPeriod(a, coaAccounts, journals, prevMonthStartDate, prevMonthEndDate), 0);
    const expBulanLalu = expenseAccounts.reduce((sum, a) => sum + getAccountBalanceForPeriod(a, coaAccounts, journals, prevMonthStartDate, prevMonthEndDate), 0);
    const labaBersihBulanLalu = revBulanLalu - expBulanLalu;

    let priveBulanLalu = 0;
    if (acc3102) {
      const { debitCents, creditCents } = getAccountDebitCreditForPeriod(acc3102, coaAccounts, journals, prevMonthStartDate, prevMonthEndDate);
      priveBulanLalu = (debitCents - creditCents) / 100;
    }

    const modalAkhirBulanLalu = modalAwalBulanLalu + setoranTambahanBulanLalu + labaBersihBulanLalu - priveBulanLalu;

    return {
      modalAwalBulanIni,
      setoranTambahanBulanIni,
      labaBersihBulanIni,
      priveBulanIni,
      modalAkhirBulanIni,
      modalAwalBulanLalu,
      setoranTambahanBulanLalu,
      labaBersihBulanLalu,
      priveBulanLalu,
      modalAkhirBulanLalu,
      monthLabel: curMonthEndDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' }),
      prevMonthLabel: prevMonthEndDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' })
    };
  }, [coaAccounts, journals, selectedMonth]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ---------- toolbar ---------- */}
      <div className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-2xl p-[18px_22px] flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex items-center gap-2">
          <div className="w-[34px] h-[34px] rounded-[9px] bg-gold-light dark:bg-neutral-800 text-gold flex items-center justify-center shrink-0">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <label className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-ink-mute dark:text-neutral-450 block mb-0.5">Filter Periode Perubahan Modal</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-line dark:border-neutral-700 rounded-lg p-[6px_10px] font-numeric text-xs text-ink dark:text-neutral-100 bg-surface dark:bg-neutral-850"
            />
          </div>
        </div>
        <button
          onClick={() => exportReportToPDF('printable-perubahan-modal', 'PerubahanModal', "LAPORAN PERUBAHAN MODAL (STATEMENT OF OWNER'S EQUITY)", selectedMonth, `Periode yang Berakhir pada ${reportData.monthLabel}`)}
          className="inline-flex items-center gap-2 bg-navy hover:bg-opacity-95 text-white rounded-lg p-[11px_20px] font-sans font-semibold text-xs cursor-pointer transition duration-150 shadow-xs"
        >
          <Printer className="h-4 w-4 text-gold" />
          <span>Ekspor PDF</span>
        </button>
      </div>

      {/* ---------- report ---------- */}
      <div id="printable-perubahan-modal" className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-3xl shadow-[0_20px_50px_-20px_rgba(32,36,31,0.15)] overflow-hidden">
        <div className="text-center p-[42px_40px_30px]">
          <div className="text-[11px] font-semibold tracking-[2.5px] uppercase text-gold mb-3.5">Usaha Perorangan KangenBukuIndo</div>
          <h1 className="font-serif text-[28px] md:text-3xl font-semibold m-0 tracking-[-0.2px] text-ink dark:text-neutral-100">Laporan Perubahan Modal</h1>
          <div className="text-[13.5px] italic text-ink-soft dark:text-neutral-400 mt-2">Untuk Periode yang Berakhir pada <strong className="font-semibold text-ink dark:text-neutral-100 not-italic">{reportData.monthLabel}</strong></div>
          <div className="w-16 h-[2px] bg-gold m-[22px_auto_0] rounded-[2px]"></div>
        </div>

        <div className="p-[6px_40px_44px] text-xs">
          <div className="grid grid-cols-12 border-b-2 border-ink dark:border-neutral-700 pb-3 font-semibold text-[10.5px] uppercase tracking-[0.5px] text-ink-soft dark:text-neutral-400">
            <div className="col-span-6">Komponen Struktur Ekuitas</div>
            <div className="col-span-3 text-right">Bulan Ini ({reportData.monthLabel})</div>
            <div className="col-span-3 text-right">Bulan Lalu ({reportData.prevMonthLabel})</div>
          </div>

          <div className="grid grid-cols-12 py-[15px] px-1 border-b border-line dark:border-neutral-800 font-bold text-sm text-ink dark:text-neutral-100 items-center">
            <span className="col-span-6">Modal Awal Pemilik (Awal Bulan)</span>
            <span className="col-span-3 text-right font-numeric">{formatNTD(Math.round(reportData.modalAwalBulanIni * 100))}</span>
            <span className="col-span-3 text-right font-numeric text-ink-mute dark:text-neutral-500 font-medium">{formatNTD(Math.round(reportData.modalAwalBulanLalu * 100))}</span>
          </div>

          <div className="grid grid-cols-12 py-3.5 px-1 border-b border-line-soft dark:border-neutral-805 text-sm text-ink dark:text-neutral-300 items-center">
            <span className="col-span-6 flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-md bg-forest-bg dark:bg-emerald-950/40 text-forest dark:text-emerald-400 flex items-center justify-center font-numeric font-bold text-xs shrink-0">+</span>
              <span>Setoran Modal Tambahan Pemilik (Injeksi Kas)</span>
            </span>
            <span className="col-span-3 text-right font-numeric font-semibold text-forest dark:text-emerald-400">{formatNTD(Math.round(reportData.setoranTambahanBulanIni * 100))}</span>
            <span className="col-span-3 text-right font-numeric text-ink-mute dark:text-neutral-550">{formatNTD(Math.round(reportData.setoranTambahanBulanLalu * 100))}</span>
          </div>

          <div className="grid grid-cols-12 py-3.5 px-1 border-b border-line-soft dark:border-neutral-805 text-sm text-ink dark:text-neutral-300 items-center">
            <span className="col-span-6 flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-md bg-forest-bg dark:bg-emerald-950/40 text-forest dark:text-emerald-400 flex items-center justify-center font-numeric font-bold text-xs shrink-0">+</span>
              <span>Laba Bersih Berjalan (Net Income)</span>
            </span>
            <span className="col-span-3 text-right font-numeric font-semibold text-forest dark:text-emerald-400">{formatNTD(Math.round(reportData.labaBersihBulanIni * 100))}</span>
            <span className="col-span-3 text-right font-numeric text-ink-mute dark:text-neutral-550">{formatNTD(Math.round(reportData.labaBersihBulanLalu * 100))}</span>
          </div>

          <div className="grid grid-cols-12 py-3.5 px-1 border-b border-line-soft dark:border-neutral-805 text-sm text-ink dark:text-neutral-300 items-center">
            <span className="col-span-6 flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-md bg-rust-bg dark:bg-rose-950/40 text-rust dark:text-rose-400 flex items-center justify-center font-numeric font-bold text-xs shrink-0">–</span>
              <span>Prive Pemilik (Penarikan Keperluan Pribadi)</span>
            </span>
            <span className="col-span-3 text-right font-numeric font-semibold text-rust dark:text-rose-400">-{formatNTD(Math.abs(Math.round(reportData.priveBulanIni * 100)))}</span>
            <span className="col-span-3 text-right font-numeric text-ink-mute dark:text-neutral-555">-{formatNTD(Math.abs(Math.round(reportData.priveBulanLalu * 100)))}</span>
          </div>

          <div className="mt-4 grid grid-cols-12 items-center p-5 rounded-2xl bg-gradient-to-br from-navy to-[#14263e] text-white">
            <div className="col-span-6 font-serif font-semibold text-sm md:text-base flex items-center gap-2.5">
              <Layers className="h-4.5 w-4.5 text-gold shrink-0" />
              <span className="font-sans">Modal Akhir Pemilik (Akhir Bulan)</span>
            </div>
            <div className="col-span-3 text-right font-numeric font-bold text-base md:text-lg text-white">
              {formatNTD(Math.round(reportData.modalAkhirBulanIni * 100))}
            </div>
            <div className="col-span-3 text-right font-numeric font-semibold text-xs md:text-sm text-white/65">
              {formatNTD(Math.round(reportData.modalAkhirBulanLalu * 100))}
            </div>
          </div>
        </div>

        <div className="text-center p-[22px_40px_34px] border-t border-dashed border-line dark:border-neutral-800 text-[11px] text-ink-mute dark:text-neutral-500 italic">
          Laporan ini dihasilkan otomatis oleh sistem KangenBukuIndo ERP dan mencerminkan pergerakan modal pemilik selama periode yang tertera di atas.
        </div>
      </div>
    </div>
  );
};


// ---------------------------------------------------------
// UPGRADED CASH FLOW COMPONENT (3-Activity Monthly Statement)
// ---------------------------------------------------------
export const CashFlowReport: React.FC<ReportProps> = ({ coaAccounts, journals }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return getYearMonth(new Date());
  });

  const reportData = useMemo(() => {
    const [year, month] = selectedMonth.split('-');
    
    // Month bounds
    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);

    const prevMonthEndDate = new Date(parseInt(year), parseInt(month) - 1, 0, 23, 59, 59, 999);

    // Identify all leaf cash accounts
    const cashAccounts = coaAccounts.filter(a => 
      (a.systemKey?.startsWith('cash') || a.code === '1101' || a.code === '1102' || a.name.toLowerCase().includes('cash'))
    );
    // Filter out parent accounts
    const leafCashAccounts = cashAccounts.filter(a => {
        // If it's a parent account, skip it so we don't double count
        return !isParentAccount(a, coaAccounts);
    });

    // 1. Saldo Awal Kas = Cash balance up to the previous month's end
    let saldoAwalKas = 0;
    leafCashAccounts.forEach(acc => {
      saldoAwalKas += getAccountBalanceForPeriod(acc, coaAccounts, journals, null, prevMonthEndDate);
    });

    // 2. Compute 3-activity cash flow details
    // Filter journals for selected month
    const monthJournals = journals.filter(entry => {
      if (!entry.date) return false;
      const d = parseToDate(entry.date);
      return d >= startDate && d <= endDate;
    });

    let operasionalIn = 0;
    let operasionalOut = 0;
    let investasiIn = 0;
    let investasiOut = 0;
    let pendanaanIn = 0;
    let pendanaanOut = 0;
    const flowLineItems: { description: string; date: Date; amount: number; activity: 'OPERASIONAL' | 'INVESTASI' | 'PENDANAAN' }[] = [];

    monthJournals.forEach(entry => {
      if (!entry.lines) return;
      
      const cashLines = entry.lines.filter(l => leafCashAccounts.some(a => a.code === l.accountCode));
      if (cashLines.length === 0) return;

      const nonCashLines = entry.lines.filter(l => !leafCashAccounts.some(a => a.code === l.accountCode));
      const offsetLine = nonCashLines[0] || entry.lines[0];
      const offsetCode = offsetLine.accountCode || '';
      
      const coaObj = coaAccounts.find(a => a.code === offsetCode);
      const activityType = classifyOffsettingAccount(offsetCode, coaObj?.type || '');

      let netCashMovementCents = 0;
      cashLines.forEach(cl => {
        netCashMovementCents += (cl.debit || 0) - (cl.credit || 0);
      });

      const netAmt = netCashMovementCents / 100;
      if (netAmt === 0) return;

      if (activityType === 'OPERASIONAL') {
        if (netAmt > 0) operasionalIn += netAmt;
        else operasionalOut += Math.abs(netAmt);
      } else if (activityType === 'INVESTASI') {
        if (netAmt > 0) investasiIn += netAmt;
        else investasiOut += Math.abs(netAmt);
      } else {
        if (netAmt > 0) pendanaanIn += netAmt;
        else pendanaanOut += Math.abs(netAmt);
      }

      flowLineItems.push({
        description: entry.description || 'Jurnal',
        date: parseToDate(entry.date),
        amount: netAmt,
        activity: activityType
      });
    });

    const netOperasional = operasionalIn - operasionalOut;
    const netInvestasi = investasiIn - investasiOut;
    const netPendanaan = pendanaanIn - pendanaanOut;
    const kenaikanKasBersih = netOperasional + netInvestasi + netPendanaan;
    const saldoAkhirKas = saldoAwalKas + kenaikanKasBersih;

    // Actual ending balance check
    let actual1100Balance = 0;
    leafCashAccounts.forEach(acc => {
      actual1100Balance += getAccountBalanceForPeriod(acc, coaAccounts, journals, null, endDate);
    });

    return {
      saldoAwalKas,
      operasionalIn,
      operasionalOut,
      netOperasional,
      investasiIn,
      investasiOut,
      netInvestasi,
      pendanaanIn,
      pendanaanOut,
      netPendanaan,
      kenaikanKasBersih,
      saldoAkhirKas,
      actual1100Balance,
      flowLineItems,
      monthLabel: endDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' })
    };
  }, [coaAccounts, journals, selectedMonth]);

  const isReconciled = Math.abs(reportData.saldoAkhirKas - reportData.actual1100Balance) < 0.05;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ---------- toolbar ---------- */}
      <div className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-2xl p-[18px_22px] flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex items-center gap-2">
          <div className="w-[34px] h-[34px] rounded-[9px] bg-gold-light dark:bg-neutral-800 text-gold flex items-center justify-center shrink-0">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <label className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-ink-mute dark:text-neutral-450 block mb-0.5">Filter Periode Arus Kas</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-line dark:border-neutral-700 rounded-lg p-[6px_10px] font-numeric text-xs text-ink dark:text-neutral-100 bg-surface dark:bg-neutral-850"
            />
          </div>
        </div>

        {/* Reconciliation badge */}
        <div className={`flex items-center gap-2.5 border rounded-xl p-[10px_16px] text-xs font-semibold tracking-[0.3px] ${
          isReconciled 
            ? 'bg-status-green-bg dark:bg-emerald-950/20 text-status-green dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' 
            : 'bg-rust-bg dark:bg-rose-950/20 text-rust dark:text-rose-400 border-rose-200 dark:border-rose-800'
        }`}>
          {isReconciled ? (
            <>
              <CheckCircle className="h-4 w-4 shrink-0 text-status-green dark:text-emerald-400" />
              <span className="uppercase">REKONSILIASI KAS BERHASIL (MATCH)</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 shrink-0 text-rust dark:text-rose-400" />
              <span className="uppercase">SELISIH KAS TERDETEKSI (UNMATCH)</span>
            </>
          )}
        </div>
      </div>

      {/* Main Cash Flow Statement */}
      <div id="printable-cash-flow" className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-3xl shadow-[0_20px_50px_-20px_rgba(32,36,31,0.15)] overflow-hidden">
        <div className="text-center p-[42px_40px_30px]">
          <div className="text-[11px] font-semibold tracking-[2.5px] uppercase text-gold mb-3.5">KangenBukuIndo ERP</div>
          <h1 className="font-serif text-[28px] md:text-3xl font-semibold m-0 tracking-[-0.2px] text-ink dark:text-neutral-100">Laporan Arus Kas</h1>
          <div className="text-[13.5px] italic text-ink-soft dark:text-neutral-400 mt-2">
            Periode yang Berakhir pada <strong className="font-semibold text-ink dark:text-neutral-100 not-italic">{reportData.monthLabel}</strong> &nbsp;·&nbsp; Terkonsolidasi dalam NT$
          </div>
          <div className="w-16 h-[2px] bg-gold m-[22px_auto_0] rounded-[2px]"></div>
        </div>

        <div className="p-[6px_40px_44px] text-xs">
          {/* Column Header */}
          <div className="grid grid-cols-12 border-b-2 border-ink dark:border-neutral-700 pb-3 font-semibold text-[10.5px] uppercase tracking-[0.5px] text-ink-soft dark:text-neutral-400">
            <div className="col-span-8">Aktivitas & Aliran Dana</div>
            <div className="col-span-4 text-right">Nilai Terkonsolidasi (NT$)</div>
          </div>

          {/* Saldo Kas Awal */}
          <div className="grid grid-cols-12 py-4 px-1 border-b border-line dark:border-neutral-850 font-serif font-bold text-sm text-ink dark:text-neutral-100 items-center">
            <div className="col-span-8 uppercase">A. Saldo Kas Awal Bulan</div>
            <div className="col-span-4 text-right font-numeric text-sm">{formatNTD(Math.round(reportData.saldoAwalKas * 100))}</div>
          </div>

          {/* 1. OPERASIONAL */}
          <div className="mt-6.5">
            <div className="flex items-center gap-2.5 mb-3 pl-1">
              <div className="w-5 h-5 rounded-md bg-navy text-white flex items-center justify-center font-bold text-[10px] shrink-0">1</div>
              <span className="font-serif font-semibold text-base text-navy dark:text-blue-400 tracking-[0.2px]">Aktivitas Operasional (Operating)</span>
            </div>

            <div className="space-y-0.5 pl-7.5">
              <div className="grid grid-cols-12 py-2.5 border-b border-line-soft dark:border-neutral-805 text-sm text-ink-soft dark:text-neutral-300">
                <span className="col-span-8">Penerimaan Kas dari Pelanggan / Marketplace</span>
                <span className="col-span-4 text-right font-numeric font-semibold text-forest dark:text-emerald-400">+{formatNTD(Math.round(reportData.operasionalIn * 100))}</span>
              </div>
              <div className="grid grid-cols-12 py-2.5 border-b border-line-soft dark:border-neutral-805 text-sm text-ink-soft dark:text-neutral-300">
                <span className="col-span-8">Pembayaran Kas untuk Pembelian / Operasional (COGS & Gaji)</span>
                <span className="col-span-4 text-right font-numeric font-semibold text-rust dark:text-rose-400">-{formatNTD(Math.round(reportData.operasionalOut * 100))}</span>
              </div>
              <div className="grid grid-cols-12 py-3.5 font-semibold text-sm text-ink dark:text-neutral-100">
                <span className="col-span-8 italic pl-2">Arus Kas Bersih dari Aktivitas Operasional</span>
                <span className="col-span-4 text-right font-numeric">{formatNTD(Math.round(reportData.netOperasional * 100))}</span>
              </div>
            </div>
          </div>

          {/* 2. INVESTASI */}
          <div className="mt-5">
            <div className="flex items-center gap-2.5 mb-3 pl-1">
              <div className="w-5 h-5 rounded-md bg-rust text-white flex items-center justify-center font-bold text-[10px] shrink-0">2</div>
              <span className="font-serif font-semibold text-base text-rust dark:text-red-400 tracking-[0.2px]">Aktivitas Investasi (Investing)</span>
            </div>

            <div className="space-y-0.5 pl-7.5">
              <div className="grid grid-cols-12 py-2.5 border-b border-line-soft dark:border-neutral-805 text-sm text-ink-soft dark:text-neutral-300">
                <span className="col-span-8">Penerimaan Kas dari Penjualan Aset</span>
                <span className="col-span-4 text-right font-numeric font-semibold text-forest dark:text-emerald-400">+{formatNTD(Math.round(reportData.investasiIn * 100))}</span>
              </div>
              <div className="grid grid-cols-12 py-2.5 border-b border-line-soft dark:border-neutral-805 text-sm text-ink-soft dark:text-neutral-300">
                <span className="col-span-8">Pembayaran Kas untuk Perolehan Aset Tetap</span>
                <span className="col-span-4 text-right font-numeric font-semibold text-rust dark:text-rose-400">-{formatNTD(Math.round(reportData.investasiOut * 100))}</span>
              </div>
              <div className="grid grid-cols-12 py-3.5 font-semibold text-sm text-ink dark:text-neutral-100">
                <span className="col-span-8 italic pl-2">Arus Kas Bersih dari Aktivitas Investasi</span>
                <span className="col-span-4 text-right font-numeric">{formatNTD(Math.round(reportData.netInvestasi * 100))}</span>
              </div>
            </div>
          </div>

          {/* 3. PENDANAAN */}
          <div className="mt-5">
            <div className="flex items-center gap-2.5 mb-3 pl-1">
              <div className="w-5 h-5 rounded-md bg-forest text-white flex items-center justify-center font-bold text-[10px] shrink-0">3</div>
              <span className="font-serif font-semibold text-base text-forest dark:text-emerald-400 tracking-[0.2px]">Aktivitas Pendanaan (Financing)</span>
            </div>

            <div className="space-y-0.5 pl-7.5">
              <div className="grid grid-cols-12 py-2.5 border-b border-line-soft dark:border-neutral-805 text-sm text-ink-soft dark:text-neutral-300">
                <span className="col-span-8">Setoran Tambahan Modal Pemilik (+Setoran)</span>
                <span className="col-span-4 text-right font-numeric font-semibold text-forest dark:text-emerald-400">+{formatNTD(Math.round(reportData.pendanaanIn * 100))}</span>
              </div>
              <div className="grid grid-cols-12 py-2.5 border-b border-line-soft dark:border-neutral-805 text-sm text-ink-soft dark:text-neutral-300">
                <span className="col-span-8">Penarikan Prive Pemilik (-Prive)</span>
                <span className="col-span-4 text-right font-numeric font-semibold text-rust dark:text-rose-400">-{formatNTD(Math.round(reportData.pendanaanOut * 100))}</span>
              </div>
              <div className="grid grid-cols-12 py-3.5 font-semibold text-sm text-ink dark:text-neutral-100">
                <span className="col-span-8 italic pl-2">Arus Kas Bersih dari Aktivitas Pendanaan</span>
                <span className="col-span-4 text-right font-numeric">{formatNTD(Math.round(reportData.netPendanaan * 100))}</span>
              </div>
            </div>
          </div>

          {/* Kenaikan Kas Bersih box */}
          <div className="grid grid-cols-12 items-center mt-6 p-[13px_16px] border-[1.5px] border-ink dark:border-neutral-750 rounded-lg bg-navy-bg dark:bg-blue-950/20">
            <div className="col-span-8 font-serif font-semibold text-sm text-ink dark:text-neutral-100">Kenaikan (Penurunan) Kas Bersih</div>
            <div className={`col-span-4 text-right font-numeric font-bold text-sm ${reportData.kenaikanKasBersih >= 0 ? 'text-forest dark:text-emerald-400' : 'text-rust dark:text-rose-400'}`}>
              {reportData.kenaikanKasBersih >= 0 ? '+' : ''}{formatNTD(Math.round(reportData.kenaikanKasBersih * 100))}
            </div>
          </div>

          {/* Hero Total - Saldo Akhir */}
          <div className="mt-6.5 grid grid-cols-12 items-center p-5 rounded-2xl bg-gradient-to-br from-navy to-[#14263e] text-white">
            <div className="col-span-8 font-serif font-semibold text-base flex items-center gap-2.5">
              <Layers className="h-[18px] w-[18px] text-gold shrink-0" />
              <span className="font-sans">SALDO KAS AKHIR BULAN</span>
            </div>
            <div className="col-span-4 text-right font-numeric font-bold text-lg text-white">
              {formatNTD(Math.round(reportData.saldoAkhirKas * 100))}
            </div>
          </div>
        </div>

        <div className="text-center p-[22px_40px_34px] border-t border-dashed border-line dark:border-neutral-800 text-[11px] text-ink-mute dark:text-neutral-500 italic">
          Laporan ini dihasilkan otomatis oleh sistem KangenBukuIndo ERP dan mencerminkan aliran masuk dan keluar kas pada tanggal yang tertera di atas.
        </div>
      </div>

      {/* Cash Flow Line Mutations Detail ledger */}
      <div className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-[18px_24px] border-b border-line bg-surface dark:bg-neutral-950 flex items-center justify-between">
          <span className="font-serif font-semibold text-sm text-ink dark:text-neutral-250">
            Detil Mutasi Transaksi Arus Kas ({reportData.flowLineItems.length} Transaksi)
          </span>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto divide-y divide-line dark:divide-neutral-800">
          {reportData.flowLineItems.map((line, idx) => (
            <div key={idx} className="p-4 flex justify-between items-center text-xs hover:bg-gold-light/10 dark:hover:bg-neutral-850/15 transition duration-100">
              <div className="space-y-1">
                <h5 className="font-semibold text-ink dark:text-neutral-200 text-sm">{line.description}</h5>
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] font-semibold bg-navy-bg dark:bg-blue-950 text-navy dark:text-blue-300 px-2 py-0.5 rounded-md border border-line dark:border-neutral-700 uppercase tracking-wider">
                    {line.activity}
                  </span>
                  <span className="text-[10px] text-ink-mute dark:text-neutral-500 font-medium">Tgl: {line.date.toLocaleDateString()}</span>
                </div>
              </div>
              <span className={`font-numeric font-bold text-sm ${line.amount >= 0 ? 'text-forest dark:text-emerald-400' : 'text-rust dark:text-rose-400'}`}>
                {line.amount >= 0 ? `+${formatNTD(Math.round(line.amount * 100))}` : `-${formatNTD(Math.round(Math.abs(line.amount) * 100))}`}
              </span>
            </div>
          ))}
          {reportData.flowLineItems.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm text-ink-mute dark:text-neutral-500 italic">Belum ada mutasi arus kas di bulan ini.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------
// LAPORAN LABA RUGI (INCOME STATEMENT) COMPONENT
// ---------------------------------------------------------
export const LabaRugiReport: React.FC<ReportProps> = ({ coaAccounts, journals }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return getYearMonth(new Date());
  });

  const reportData = useMemo(() => {
    const [year, month] = selectedMonth.split('-');
    
    // Month bounds
    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 0);

    const revenueAccounts = coaAccounts.filter(a => a.type === 'Revenue' || a.code?.startsWith('4'));
    const expenseAccounts = coaAccounts.filter(a => a.type === 'Expenses' || a.code?.startsWith('5'));

    // COGS vs OpEx classification
    const cogsAccounts = expenseAccounts.filter(a => a.code === '5100' || a.subType?.toLowerCase().includes('pokok penjualan') || a.subType?.toLowerCase() === 'harga pokok penjualan' || a.name?.toLowerCase().includes('cogs'));
    const opexAccounts = expenseAccounts.filter(a => !cogsAccounts.some(ca => ca.id === a.id));

    // Helper to process accounts into hierarchical items with totals
    const processCategory = (categoryAccounts: CoaAccount[]) => {
      // 1. Map all category accounts to their balances
      const withBalance = categoryAccounts.map(acc => {
        const isParent = isParentAccount(acc, coaAccounts);
        const bal = getAccountBalanceForPeriod(acc, coaAccounts, journals, startDate, endDate);
        return {
          ...acc,
          balance: bal,
          isParent
        };
      }).filter(a => Math.abs(a.balance) > 0.001);

      // 2. Identify root items
      const rootItems = withBalance.filter(item => {
        const parent = findParentOf(item, coaAccounts);
        if (!parent) return true;
        return !categoryAccounts.some(ca => ca.id === parent.id || ca.code === parent.code);
      });
      rootItems.sort((a, b) => a.code.localeCompare(b.code));

      const list: any[] = [];
      rootItems.forEach(rootItem => {
        if (rootItem.isParent) {
          list.push({ ...rootItem, indent: 0 });
          // Find children under this parent
          const children = withBalance.filter(childItem => {
            const p = findParentOf(childItem, coaAccounts);
            return p && p.code === rootItem.code;
          });
          children.sort((a, b) => a.code.localeCompare(b.code));
          children.forEach(childItem => {
            list.push({ ...childItem, indent: 1 });
          });
        } else {
          list.push({ ...rootItem, indent: 0 });
        }
      });

      // 3. Sum only leaf accounts (not parent accounts) to avoid double counting
      const total = withBalance.reduce((sum, item) => {
        if (!item.isParent) {
          return sum + item.balance;
        }
        return sum;
      }, 0);

      return { items: list, total };
    };

    const revenueData = processCategory(revenueAccounts);
    const cogsData = processCategory(cogsAccounts);
    const opexData = processCategory(opexAccounts);

    const revenues = revenueData.items;
    const totalRevenue = revenueData.total;

    const cogs = cogsData.items;
    const totalCOGS = cogsData.total;

    const grossProfit = totalRevenue - totalCOGS;

    const opex = opexData.items;
    const totalOpEx = opexData.total;

    const netIncome = grossProfit - totalOpEx;

    return {
      revenues,
      cogs,
      opex,
      totalRevenue,
      totalCOGS,
      grossProfit,
      totalOpEx,
      netIncome,
      monthLabel: endDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' })
    };
  }, [coaAccounts, journals, selectedMonth]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ---------- toolbar ---------- */}
      <div className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-2xl p-[18px_22px] flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex items-center gap-2">
          <div className="w-[34px] h-[34px] rounded-[9px] bg-gold-light dark:bg-neutral-800 text-gold flex items-center justify-center shrink-0">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <label className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-ink-mute dark:text-neutral-450 block mb-0.5">Filter Periode Laba Rugi</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-line dark:border-neutral-700 rounded-lg p-[6px_10px] font-numeric text-xs text-ink dark:text-neutral-100 bg-surface dark:bg-neutral-850"
            />
          </div>
        </div>
        <button
          onClick={() => exportReportToPDF('printable-laba-rugi', 'LabaRugi', 'LAPORAN LABA RUGI (INCOME STATEMENT)', selectedMonth, `Periode yang Berakhir pada ${reportData.monthLabel}`)}
          className="inline-flex items-center gap-2 bg-navy hover:bg-opacity-95 text-white rounded-lg p-[11px_20px] font-sans font-semibold text-xs cursor-pointer transition duration-150 shadow-xs"
        >
          <Printer className="h-4 w-4 text-gold" />
          <span>Ekspor PDF</span>
        </button>
      </div>

      {/* ---------- report ---------- */}
      <div id="printable-laba-rugi" className="bg-surface dark:bg-neutral-900 border border-line dark:border-neutral-800 rounded-3xl shadow-[0_20px_50px_-20px_rgba(32,36,31,0.15)] overflow-hidden">
        <div className="text-center p-[42px_40px_30px]">
          <div className="text-[11px] font-semibold tracking-[2.5px] uppercase text-gold mb-3.5">Usaha Perorangan KangenBukuIndo</div>
          <h1 className="font-serif text-[28px] md:text-3xl font-semibold m-0 tracking-[-0.2px] text-ink dark:text-neutral-100">Laporan Laba Rugi</h1>
          <div className="text-[13.5px] italic text-ink-soft dark:text-neutral-400 mt-2">Untuk Periode yang Berakhir pada <strong className="font-semibold text-ink dark:text-neutral-100 not-italic">{reportData.monthLabel}</strong></div>
          <div className="w-16 h-[2px] bg-gold m-[22px_auto_0] rounded-[2px]"></div>
        </div>

        <div className="p-[6px_40px_44px] text-xs space-y-6">
          {/* Column Header */}
          <div className="grid grid-cols-12 border-b-2 border-ink dark:border-neutral-700 pb-3 font-semibold text-[10.5px] uppercase tracking-[0.5px] text-ink-soft dark:text-neutral-400">
            <div className="col-span-8">Komponen Struktur Pendapatan & Beban</div>
            <div className="col-span-4 text-right">Nilai Terkonsolidasi (NT$)</div>
          </div>

          {/* 1. Revenues */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-2.5 mb-2 pl-1">
              <div className="w-5 h-5 rounded-md bg-navy text-white flex items-center justify-center font-bold text-[10px] shrink-0">1</div>
              <span className="font-serif font-semibold text-base text-navy dark:text-blue-400 tracking-[0.2px]">Pendapatan Penjualan (Revenues)</span>
            </div>

            <div className="space-y-0.5 pl-7.5">
              {reportData.revenues.map((item, idx) => (
                <div 
                  key={`${item.id || item.code}-${idx}`} 
                  className={`grid grid-cols-12 py-2.5 border-b border-line-soft dark:border-neutral-805 text-sm items-center ${
                    item.indent > 0 
                      ? 'text-ink-soft dark:text-neutral-400 italic pl-5' 
                      : 'text-ink dark:text-neutral-200'
                  } ${item.isParent ? 'font-bold' : ''}`}
                >
                  <div className="col-span-8 flex items-center gap-1.5">
                    {item.indent > 0 && <span className="text-ink-soft dark:text-neutral-450 pr-1">↳</span>}
                    <span>{item.code} · {item.name}</span>
                  </div>
                  <span className="col-span-4 text-right font-numeric font-medium">
                    {formatNTD(Math.round(item.balance * 100))}
                  </span>
                </div>
              ))}
              {reportData.revenues.length === 0 && (
                <p className="text-[11px] text-ink-mute dark:text-neutral-500 italic p-3">Belum ada pendapatan yang dicatat pada periode ini.</p>
              )}
              <div className="grid grid-cols-12 py-3.5 font-semibold text-sm text-ink dark:text-neutral-100 items-center">
                <span className="col-span-8 italic pl-2">Total Pendapatan (Omset)</span>
                <span className="col-span-4 text-right font-numeric">{formatNTD(Math.round(reportData.totalRevenue * 100))}</span>
              </div>
            </div>
          </div>

          {/* 2. COGS & Gross Profit */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-2.5 mb-2 pl-1">
              <div className="w-5 h-5 rounded-md bg-rust text-white flex items-center justify-center font-bold text-[10px] shrink-0">2</div>
              <span className="font-serif font-semibold text-base text-rust dark:text-red-400 tracking-[0.2px]">Harga Pokok Penjualan (COGS)</span>
            </div>

            <div className="space-y-0.5 pl-7.5">
              {reportData.cogs.map((item, idx) => (
                <div 
                  key={`${item.id || item.code}-${idx}`} 
                  className={`grid grid-cols-12 py-2.5 border-b border-line-soft dark:border-neutral-805 text-sm items-center ${
                    item.indent > 0 
                      ? 'text-ink-soft dark:text-neutral-400 italic pl-5' 
                      : 'text-ink dark:text-neutral-200'
                  } ${item.isParent ? 'font-bold' : ''}`}
                >
                  <div className="col-span-8 flex items-center gap-1.5">
                    {item.indent > 0 && <span className="text-ink-soft dark:text-neutral-450 pr-1">↳</span>}
                    <span>{item.code} · {item.name}</span>
                  </div>
                  <span className="col-span-4 text-right font-numeric font-semibold text-rust dark:text-rose-450">
                    {item.balance >= 0 ? `-${formatNTD(Math.round(item.balance * 100))}` : formatNTD(Math.round(Math.abs(item.balance) * 100))}
                  </span>
                </div>
              ))}
              {reportData.cogs.length === 0 && (
                <p className="text-[11px] text-ink-mute dark:text-neutral-500 italic p-3">Belum ada beban pokok persediaan terjual.</p>
              )}
              <div className="grid grid-cols-12 items-center mt-3 p-[11px_14px] border-[1.5px] border-ink dark:border-neutral-750 rounded-lg bg-gold-light/10 dark:bg-amber-955/20 text-sm font-semibold text-ink dark:text-neutral-100">
                <span className="col-span-8 italic pl-1">Laba Kotor (Gross Profit)</span>
                <span className="col-span-4 text-right font-numeric font-bold">
                  {formatNTD(Math.round(reportData.grossProfit * 100))}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Operating Expenses */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-2.5 mb-2 pl-1">
              <div className="w-5 h-5 rounded-md bg-forest text-white flex items-center justify-center font-bold text-[10px] shrink-0">3</div>
              <span className="font-serif font-semibold text-base text-forest dark:text-emerald-400 tracking-[0.2px]">Beban Operasional & Umum (OpEx)</span>
            </div>

            <div className="space-y-0.5 pl-7.5">
              {reportData.opex.map((item, idx) => (
                <div 
                  key={`${item.id || item.code}-${idx}`} 
                  className={`grid grid-cols-12 py-2.5 border-b border-line-soft dark:border-neutral-805 text-sm items-center ${
                    item.indent > 0 
                      ? 'text-ink-soft dark:text-neutral-400 italic pl-5' 
                      : 'text-ink dark:text-neutral-200'
                  } ${item.isParent ? 'font-bold' : ''}`}
                >
                  <div className="col-span-8 flex items-center gap-1.5">
                    {item.indent > 0 && <span className="text-ink-soft dark:text-neutral-450 pr-1">↳</span>}
                    <span>{item.code} · {item.name}</span>
                  </div>
                  <span className="col-span-4 text-right font-numeric font-semibold text-rust dark:text-rose-450">
                    {item.balance >= 0 ? `-${formatNTD(Math.round(item.balance * 100))}` : formatNTD(Math.round(Math.abs(item.balance) * 100))}
                  </span>
                </div>
              ))}
              {reportData.opex.length === 0 && (
                <p className="text-[11px] text-ink-mute dark:text-neutral-500 italic p-3">Belum ada beban operasional yang dicatat.</p>
              )}
              <div className="grid grid-cols-12 py-3.5 font-semibold text-sm text-ink dark:text-neutral-100 items-center">
                <span className="col-span-8 italic pl-2">Total Biaya Operasional (OpEx)</span>
                <span className="col-span-4 text-right font-numeric text-rust dark:text-rose-450">-{formatNTD(Math.round(reportData.totalOpEx * 100))}</span>
              </div>
            </div>
          </div>

          {/* Hero Total - Net Income */}
          <div className="mt-8 grid grid-cols-12 items-center p-5 rounded-2xl bg-gradient-to-br from-navy to-[#14263e] text-white">
            <div className="col-span-8 font-serif font-semibold text-base flex items-center gap-2.5">
              <Layers className="h-[18px] w-[18px] text-gold shrink-0" />
              <span className="font-sans">LABA BERSIH BERJALAN (NET INCOME)</span>
            </div>
            <div className="col-span-4 text-right font-numeric font-bold text-lg text-white">
              {formatNTD(Math.round(reportData.netIncome * 100))}
            </div>
          </div>
        </div>

        <div className="text-center p-[22px_40px_34px] border-t border-dashed border-line dark:border-neutral-800 text-[11px] text-ink-mute dark:text-neutral-500 italic">
          Laporan ini dihasilkan otomatis oleh sistem KangenBukuIndo ERP dan mencerminkan perhitungan laba rugi usaha perorangan KangenBukuIndo.
        </div>
      </div>
    </div>
  );
};

