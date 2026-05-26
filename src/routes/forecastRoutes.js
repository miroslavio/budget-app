import { findHouseholdById } from '../repositories/householdRepository.js';
import { listActiveBudgetItems } from '../repositories/budgetItemRepository.js';
import { listSavingsAccounts } from '../repositories/savingsAccountRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { buildMonthlyForecast } from '../services/forecastService.js';
import { buildSavingsProjection } from '../services/savingsAccountService.js';
import { plannedSavingsBudgetItems } from '../services/savingsService.js';
import { currentMonth, monthLabel } from '../utils/dates.js';
import { formatCurrency, formatSignedCurrency, page } from '../views/html.js';
import { decimalInputAttrs } from '../views/forms.js';
import { cashflowForecastChart, savingsProjectionChart } from '../views/charts.js';
import { html } from '../http/response.js';
import { ensureAuthenticated } from './helpers.js';

export function registerForecastRoutes(router, db) {
  router.get('/forecast', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const household = findHouseholdById(db, ctx.user.household_id);
    const startMonth = ctx.query.get('start_month') || currentMonth();
    const months = Math.min(36, Math.max(1, Number(ctx.query.get('months') || 12)));
    const goals = listSavingsGoals(db, household.id);
    const savingsAccounts = listSavingsAccounts(db, household.id, { activeOnly: true });
    const items = [...listActiveBudgetItems(db, household.id), ...plannedSavingsBudgetItems({ goals, accounts: savingsAccounts })];
    const forecast = buildMonthlyForecast({
      items,
      startMonth,
      months,
      openingBalancePence: household.opening_balance_pence
    });
    const savingsProjection = buildSavingsProjection(savingsAccounts, { startMonth, months });

    html(
      ctx.res,
      page(ctx, {
        title: 'Forecast',
        wide: true,
        body: `<section class="page-title">
          <div>
            <h1>Forecast</h1>
            <p class="page-context">See what your current plan suggests for the months ahead.</p>
          </div>
          <form method="get" action="/forecast" class="inline-form">
            <label>Start <input type="month" name="start_month" value="${startMonth}" required></label>
            <label>Months <input name="months" value="${months}" ${decimalInputAttrs({ required: true, min: '1', max: '36', decimals: 0, step: '1' })}></label>
            <button>Update</button>
          </form>
        </section>
        <section class="card chart-card">
          <div class="card-heading">
            <div>
              <h2>Projected balance and monthly movement</h2>
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
        </section>
        <section class="card chart-card">
          <div class="card-heading">
            <div>
              <h2>Projected savings and investment pots</h2>
              <p class="hint">Separate from cashflow: this projects tracked pot balances using current balances, personal contributions, employer pension top-ups, optional LISA bonuses, and projected annual rates.</p>
            </div>
          </div>
          ${savingsProjectionChart(savingsProjection, { emptyMessage: 'Add an account or pot in Savings to start projecting balances here.' })}
        </section>
        <section class="card">
          <table class="data-table">
            <thead><tr><th>Pot</th><th>Current balance</th><th>Personal monthly</th><th>Extra additions</th><th>Projected growth / interest</th><th>Projected closing balance</th></tr></thead>
            <tbody>${savingsProjection.accounts.length ? savingsProjection.accounts.map((account) => `<tr>
              <td>${account.name}</td>
              <td>${formatCurrency(account.currentBalancePence)}</td>
              <td>${formatCurrency(account.monthlyContributionPence)}</td>
              <td>${projectionAdditionsLabel(account)}</td>
              <td>${formatCurrency(account.totalGrowthPence)}</td>
              <td>${formatCurrency(account.projectedBalancePence)}</td>
            </tr>`).join('') : '<tr><td colspan="6" class="empty">No savings accounts or pots are currently included in projections.</td></tr>'}</tbody>
          </table>
        </section>`
      })
    );
  });
}

function projectionAdditionsLabel(account) {
  const extras = [];
  if (Number(account.employerMonthlyContributionPence || 0) > 0) {
    extras.push(`Employer ${formatCurrency(account.employerMonthlyContributionPence)}/month`);
  }
  if (Number(account.totalBonusPence || 0) > 0) {
    extras.push(`LISA bonus ${formatCurrency(account.totalBonusPence)} over forecast`);
  }
  return extras.length ? extras.join(' · ') : '—';
}
