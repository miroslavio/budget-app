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

export function buildMonthlyForecast({ items, startMonth, months = 12, openingBalancePence = 0, scenario = {} }) {
  const forecast = [];
  let opening = Number(openingBalancePence || 0);
  const scenarioStartMonth = scenario.startMonth || startMonth;
  const scenarioDuration = Math.max(1, Number(scenario.durationMonths || months || 1));

  for (let index = 0; index < months; index += 1) {
    const month = addMonths(startMonth, index);
    const planned = plannedMonthlySummary(items, month);
    const scenarioActive = isScenarioActive(month, scenarioStartMonth, scenarioDuration);
    const oneOffMonth = month === scenarioStartMonth;
    const annualCostItems = planned.activeItems.filter(
      (item) => item.item_type === 'expense' && item.frequency === 'yearly' && Number(item.monthly_equivalent_pence || 0) > 0
    );
    const percentageIncomeAdjustmentPence = scenarioActive
      ? Math.round(planned.plannedIncomePence * (Number(scenario.incomeAdjustmentPercent || 0) / 100))
      : 0;
    const expectedIncomePence = Math.max(
      0,
      planned.plannedIncomePence +
        (scenarioActive ? Number(scenario.incomeAdjustmentPence || 0) : 0) +
        percentageIncomeAdjustmentPence +
        (oneOffMonth ? Number(scenario.oneOffIncomePence || 0) : 0)
    );
    const expectedExpensesPence = Math.max(
      0,
      planned.plannedExpensePence +
        (scenarioActive ? Number(scenario.spendingAdjustmentPence || 0) : 0) +
        (oneOffMonth ? Number(scenario.oneOffCostPence || 0) : 0)
    );
    const expectedSavingsPence = Math.max(0, planned.plannedSavingsPence + (scenarioActive ? Number(scenario.savingsAdjustmentPence || 0) : 0));
    const netMovementPence = expectedIncomePence - expectedExpensesPence - expectedSavingsPence;
    const closingBalancePence = opening + netMovementPence;
    forecast.push({
      month,
      openingBalancePence: opening,
      expectedIncomePence,
      expectedExpensesPence,
      expectedSavingsPence,
      netMovementPence,
      closingBalancePence,
      scenarioActive,
      annualCostItems: annualCostItems.map((item) => ({
        name: item.name,
        monthlyEquivalentPence: Number(item.monthly_equivalent_pence || 0)
      })),
      oneOffCostPence: oneOffMonth ? Number(scenario.oneOffCostPence || 0) : 0,
      oneOffIncomePence: oneOffMonth ? Number(scenario.oneOffIncomePence || 0) : 0,
      scenarioIncomeAdjustmentPence: scenarioActive ? Number(scenario.incomeAdjustmentPence || 0) + percentageIncomeAdjustmentPence : 0,
      scenarioSpendingAdjustmentPence: scenarioActive ? Number(scenario.spendingAdjustmentPence || 0) : 0,
      scenarioSavingsAdjustmentPence: scenarioActive ? Number(scenario.savingsAdjustmentPence || 0) : 0
    });
    opening = closingBalancePence;
  }

  return forecast;
}

function isScenarioActive(month, startMonth, durationMonths) {
  for (let offset = 0; offset < durationMonths; offset += 1) {
    if (addMonths(startMonth, offset) === month) return true;
  }
  return false;
}
