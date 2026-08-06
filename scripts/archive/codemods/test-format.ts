const formatLocal = (cents: number) => {
  const value = cents / 100;
  const formatted = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
  return (value < 0 ? '-' : '') + 'NT$' + formatted;
};
console.log(formatLocal(59900));
console.log(formatLocal(69954));
