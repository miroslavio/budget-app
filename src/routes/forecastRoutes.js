import { findHouseholdById } from '../repositories/householdRepository.js';
import { listActiveBudgetItems } from '../repositories/budgetItemRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { buildMonthlyForecast } from '../services/forecastService.js';
import { savingsGoalsAsBudgetItems } from '../services/savingsService.js';
import { currentMonth, monthLabel } from '../utils/dates.js';
import { formatCurrency, formatSignedCurrency, page } from '../views/html.js';
import { cashflowForecastChart } from '../views/charts.js';
import { html } from '../http/response.js';
import { ensureAuthenticated } from './helpers.js';

export function registerForecastRoutes(router, db) {
  router.get('/forecast', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const household = findHouseholdById(db, ctx.user.household_id);
    const startMonth = ctx.query.get('start_month') || currentMonth();
    const months = Math.min(36, Math.max(1, Number(ctx.query.get('months') || 12)));
    const items = [...listActiveBudgetItems(db, household.id), ...savingsGoalsAsBudgetItems(listSavingsGoals(db, household.id))];
    const forecast = buildMonthlyForecast({
      items,
      startMonth,
      months,
      openingBalancePence: household.opening_balance_pence
    });

    html(
      ctx.res,
      page(ctx, {
        title: 'Forecast',
        wide: true,
        body: `<section class="page-title">
          <div>
            <p class="eyebrow">Future cashflow</p>
            <h1>Monthly forecast</h1>
            <p>Forecast uses active recurring income, expenses, and savings contributions.</p>
          </div>
          <form method="get" action="/forecast" class="inline-form">
            <label>Start <input type="month" name="start_month" value="${startMonth}"></label>
            <label>Months <input type="number" name="months" min="1" max="36" value="${months}"></label>
            <button>Update</button>
          </form>
        </section>
        <section class="card chart-card">
          <div class="card-heading">
            <div>
              <h2>Projected balance and monthly movement</h2>
              <p class="hint">This is better than a waterfall for a rolling household forecast: the bars show each month’s surplus or deficit, and the line shows whether the closing balance is trending safely.</p>
            </div>
          </div>
          ${cashflowForecastChart(forecast)}
        </section>
        <section class="card">
          <table>
            <thead><tr><th>Month</th><th>Opening balance</th><th>Income</th><th>Expenses</th><th>Savings</th><th>Net movement</th><th>Closing balance</th></tr></thead>
            <tbody>${forecast
              .map(
                (row) => `<tr>
                  <td>${monthLabel(row.month)}</td>
                  <td>${formatCurrency(row.openingBalancePence)}</td>
                  <td>${formatCurrency(row.expectedIncomePence)}</td>
                  <td>${formatCurrency(row.expectedExpensesPence)}</td>
                  <td>${formatCurrency(row.expectedSavingsPence)}</td>
                  <td>${formatSignedCurrency(row.netMovementPence)}</td>
                  <td>${formatCurrency(row.closingBalancePence)}</td>
                </tr>`
              )
              .join('')}</tbody>
          </table>
        </section>`
      })
    );
  });
}
