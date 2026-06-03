import { taxYearForDate, taxYearRange } from '../utils/dates.js';

export { taxYearForDate, taxYearRange };

export function buildTaxYearOptions(startYear = 2025, count = 3) {
  return Array.from({ length: count }, (_, index) => {
    const year = startYear + index;
    return `${year}-${year + 1}`;
  });
}
