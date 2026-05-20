import { addMonths } from '../utils/dates.js';
import { plannedMonthlySummary } from './budgetService.js';

export function buildMonthlyForecast({ items, startMonth, months = 12, openingBalancePence = 0 }) {
  const forecast = [];
  let opening = Number(openingBalancePence || 0);

  for (let index = 0; index < months; index += 1) {
    const month = addMonths(startMonth, index);
    const planned = plannedMonthlySummary(items, month);
    const netMovementPence = planned.plannedIncomePence - planned.plannedExpensePence - planned.plannedSavingsPence;
    const closingBalancePence = opening + netMovementPence;
    forecast.push({
      month,
      openingBalancePence: opening,
      expectedIncomePence: planned.plannedIncomePence,
      expectedExpensesPence: planned.plannedExpensePence,
      expectedSavingsPence: planned.plannedSavingsPence,
      netMovementPence,
      closingBalancePence
    });
    opening = closingBalancePence;
  }

  return forecast;
}
