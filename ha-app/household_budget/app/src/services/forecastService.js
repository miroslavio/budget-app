import { addMonths } from '../utils/dates.js';
import { plannedMonthlySummary } from './budgetService.js';

export function spendableHouseholdBalancePence(accounts = []) {
  return accounts.reduce((sum, account) => {
    if (!Number(account.is_active ?? 1)) return sum;
    if (!Number(account.available_for_household_cashflow || 0)) return sum;
    return sum + Number(account.current_balance_pence || 0);
  }, 0);
}

export function deriveForecastStartingBalance({ accounts = [], adjustmentPence = 0 } = {}) {
  return spendableHouseholdBalancePence(accounts) + Number(adjustmentPence || 0);
}

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
