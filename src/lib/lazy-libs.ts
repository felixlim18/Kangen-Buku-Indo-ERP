// Loader on-demand untuk library berat yang cuma dipakai saat export/import file.
//
// Kalau di-import statis, ExcelJS (~1.3 MB), jsPDF (~390 kB), html2canvas (~200 kB)
// dan xlsx ikut terunduh begitu tab dibuka, padahal mayoritas sesi tidak pernah
// menekan tombol export sama sekali. Dengan dynamic import, biayanya baru muncul
// saat tombolnya benar-benar ditekan.
//
// Browser meng-cache modul yang sudah dimuat, jadi pemanggilan kedua kali instan.

export const loadXLSX = () => import('xlsx');

export const loadExcelJS = () => import('exceljs').then((m) => m.default);

export const loadJsPDF = () => import('jspdf').then((m) => m.default);

export const loadHtml2Canvas = () => import('html2canvas').then((m) => m.default);
