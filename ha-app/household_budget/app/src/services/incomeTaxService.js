import { roundPence } from '../utils/money.js';

export function calculateIncomeTax(annualTaxablePayBeforeAllowancePence, incomeTaxRules) {
  const gross = Math.max(0, Number(annualTaxablePayBeforeAllowancePence || 0));
  const personalAllowance = calculatePersonalAllowance(gross, incomeTaxRules);
  const taxableIncome = Math.max(0, gross - personalAllowance);

  let remaining = taxableIncome;
  let previousLimit = 0;
  let tax = 0;
  const breakdown = [];

  for (const band of incomeTaxRules.bands) {
    const upperLimit = band.upTo === null ? Infinity : band.upTo * 100;
    const bandWidth = upperLimit === Infinity ? remaining : Math.max(0, upperLimit - previousLimit);
    const taxableInBand = Math.min(remaining, bandWidth);
    const bandTax = taxableInBand * band.rate;
    tax += bandTax;
    breakdown.push({
      name: band.name,
      taxablePence: roundPence(taxableInBand),
      taxPence: roundPence(bandTax),
      rate: band.rate
    });
    remaining -= taxableInBand;
    previousLimit = upperLimit;
    if (remaining <= 0) break;
  }

  return {
    personalAllowancePence: roundPence(personalAllowance),
    taxableIncomePence: roundPence(taxableIncome),
    incomeTaxPence: roundPence(tax),
    breakdown
  };
}

export function calculatePersonalAllowance(adjustedNetIncomePence, incomeTaxRules) {
  const allowance = incomeTaxRules.personalAllowance * 100;
  const taperStarts = incomeTaxRules.personalAllowanceTaperStarts * 100;
  if (adjustedNetIncomePence <= taperStarts) return allowance;
  const taper = (adjustedNetIncomePence - taperStarts) * incomeTaxRules.personalAllowanceTaperRate;
  return Math.max(0, allowance - taper);
}
