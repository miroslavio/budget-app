export function parsePoundsToPence(value) {
  if (value === null || value === undefined || value === '') return 0;
  const normalised = String(value).replace(/[£,\s]/g, '');
  if (!/^-?\d+(\.\d{0,2})?$/.test(normalised)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  return Math.round(Number(normalised) * 100);
}

export function penceToPounds(pence) {
  return Number((Number(pence || 0) / 100).toFixed(2));
}

export function formatCurrency(pence) {
  const value = Number(pence || 0) / 100;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP'
  }).format(value);
}

export function formatSignedCurrency(pence) {
  const value = Number(pence || 0);
  if (value === 0) return formatCurrency(0);
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`;
}

export function roundPence(value) {
  return Math.round(Number(value || 0));
}
