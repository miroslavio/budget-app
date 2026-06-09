import { findHouseholdById } from '../repositories/householdRepository.js';
import { updateHouseholdSettings } from '../repositories/householdRepository.js';
import { listActiveBudgetItems } from '../repositories/budgetItemRepository.js';
import { listSavingsAccounts } from '../repositories/savingsAccountRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { buildMonthlyForecast, deriveForecastStartingBalance, spendableHouseholdBalancePence } from '../services/forecastService.js';
import { plannedSavingsBudgetItems } from '../services/savingsService.js';
import { currentMonth, monthLabel } from '../utils/dates.js';
import { escapeHtml, formatCurrency, formatSignedCurrency, moneyInputValue, page, csrfField } from '../views/html.js';
import { decimalInputAttrs, moneyInputAttrs } from '../views/forms.js';
import { cashflowForecastChart } from '../views/charts.js';
import { html } from '../http/response.js';
import { optionalMoney } from '../utils/validation.js';
import { ensureAuthenticated, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerForecastRoutes(router, db) {
  router.get('/forecast', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const household = findHouseholdById(db, ctx.user.household_id);
    const startMonth = ctx.query.get('start_month') || currentMonth();
    const months = Math.min(36, Math.max(1, Number(ctx.query.get('months') || 12)));
    const goals = listSavingsGoals(db, household.id);
    const savingsAccounts = listSavingsAccounts(db, household.id, { activeOnly: true });
    const items = [...listActiveBudgetItems(db, household.id), ...plannedSavingsBudgetItems({ goals, accounts: savingsAccounts })];
    const forecastAdjustmentPence = resolveForecastAdjustment(ctx.query.get('adjustment'), household.forecast_adjustment_pence);
    const scenario = forecastScenarioFromQuery(ctx.query, { startMonth, months });
    const spendableBalancePence = spendableHouseholdBalancePence(savingsAccounts);
    const startingBalancePence = deriveForecastStartingBalance({
      accounts: savingsAccounts,
      adjustmentPence: forecastAdjustmentPence
    });
    const forecast = buildMonthlyForecast({
      items,
      startMonth,
      months,
      openingBalancePence: startingBalancePence,
      scenario
    });
    const hasForecastData = forecast.some((row) => row.expectedIncomePence > 0 || row.expectedExpensesPence > 0 || row.expectedSavingsPence > 0);
    const summary = forecastSummary(forecast, { forecastAdjustmentPence });
    const savingsContributionsMonthlyPence = forecast.length ? Math.round(forecast.reduce((sum, row) => sum + Number(row.expectedSavingsPence || 0), 0) / forecast.length) : 0;

    html(
      ctx.res,
      page(ctx, {
        title: 'Forecast',
        wide: true,
        body: `<div class="forecast-layout">
        <section class="page-title">
          <div>
            <h1>Forecast</h1>
          </div>
          <form method="get" action="/forecast" class="inline-form">
            <label>Start <input type="month" name="start_month" value="${startMonth}" required></label>
            <label>Months <input name="months" value="${months}" ${decimalInputAttrs({ required: true, min: '1', max: '36', decimals: 0, step: '1' })}></label>
            <button>Update</button>
          </form>
        </section>
        <section class="card forecast-start-card">
          <div class="grid three compact">
            <div class="stat">
              <span>Spendable accounts total</span>
              <strong>${formatCurrency(spendableBalancePence)}</strong>
            </div>
            <div class="stat">
              <span>Forecast adjustment</span>
              <strong>${formatSignedCurrency(forecastAdjustmentPence)}</strong>
            </div>
            <div class="stat">
              <span>Starting point used</span>
              <strong>${formatCurrency(startingBalancePence)}</strong>
            </div>
          </div>
          <form method="post" action="/forecast/adjustment" class="inline-form top-gap">
            ${csrfField(ctx)}
            <input type="hidden" name="start_month" value="${escapeHtml(startMonth)}">
            <input type="hidden" name="months" value="${months}">
            <label>Forecast adjustment <input name="forecast_adjustment" value="${moneyInputValue(forecastAdjustmentPence)}" ${moneyInputAttrs({ allowNegative: true, min: null })}></label>
            <button>Save adjustment</button>
          </form>
        </section>
        ${hasForecastData ? `${forecastSummaryCards(summary)}
        ${cashflowForecastCard(forecast)}
        ${forecastWhatIfPanel({ startMonth, months, scenario })}
        ${forecastSavingsNote(savingsContributionsMonthlyPence)}
        ${forecastAssumptionsPanel(startMonth)}` : `<section class="card plan-empty-state">
          <h2>No cashflow forecast yet</h2>
          <p>Create income and spending items in Budget Plan to generate your household cashflow forecast.</p>
        </section>`}
        </div>`
      })
    );
  });

  router.post('/forecast/adjustment', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const household = findHouseholdById(db, ctx.user.household_id);
      updateHouseholdSettings(db, ctx.user.household_id, {
        name: household.name,
        openingBalancePence: household.opening_balance_pence,
        forecastAdjustmentPence: optionalMoney(ctx.body.forecast_adjustment, 'Forecast adjustment', { allowNegative: true, minPence: null }),
        skipPlannedSavings: household.skip_planned_savings
      });
      const startMonth = ctx.body.start_month || currentMonth();
      const months = Math.min(36, Math.max(1, Number(ctx.body.months || 12)));
      redirectWithSuccess(ctx.res, `/forecast?start_month=${encodeURIComponent(startMonth)}&months=${encodeURIComponent(String(months))}`, 'Forecast adjustment saved.');
    } catch (error) {
      redirectWithError(ctx.res, '/forecast', error);
    }
  });
}

function cashflowForecastCard(forecast) {
  return `<section class="card chart-card">
    <div class="card-heading">
      <div>
        <h2>Cashflow forecast</h2>
        <p class="hint">Shows whether your spendable household cash is expected to hold up over the selected period.</p>
      </div>
      <div class="period-pills view-toggle-pills" data-view-toggle-group="forecast-cashflow-detail">
        <button type="button" class="period-pill active" data-view-toggle="forecast-cashflow-detail" data-view-value="chart" aria-pressed="true">Chart</button>
        <button type="button" class="period-pill" data-view-toggle="forecast-cashflow-detail" data-view-value="table" aria-pressed="false">Table</button>
      </div>
    </div>
    <div data-view-panel="forecast-cashflow-detail" data-view-value="chart" class="view-panel">
      ${cashflowForecastChart(forecast)}
    </div>
    <div data-view-panel="forecast-cashflow-detail" data-view-value="table" class="view-panel" hidden>
      <table class="data-table">
        <thead><tr><th>Month</th><th>Opening balance</th><th>Planned income</th><th>Planned spending</th><th>Planned savings</th><th>Net movement</th><th>Closing balance</th></tr></thead>
        <tbody>${forecast
          .map(
            (row) => `<tr>
              <td>${monthLabel(row.month)}</td>
              <td>${formatCurrency(row.openingBalancePence)}</td>
              <td>${formatCurrency(row.expectedIncomePence)}</td>
              <td>${formatCurrency(row.expectedExpensesPence)}</td>
              <td>${formatCurrency(row.expectedSavingsPence)}</td>
              <td class="${forecastMovementClass(row.netMovementPence)}">${formatSignedCurrency(row.netMovementPence)}</td>
              <td>${formatCurrency(row.closingBalancePence)}</td>
            </tr>`
          )
          .join('')}</tbody>
      </table>
    </div>
  </section>`;
}

function forecastSummary(forecast, { forecastAdjustmentPence = 0 } = {}) {
  if (!forecast.length) {
    return {
      startMonth: '',
      openingBalancePence: 0,
      forecastAdjustmentPence,
      averageMonthlyMovementPence: 0,
      projectedClosingBalancePence: 0,
      lowestProjectedBalancePence: 0,
      lowestProjectedBalanceMonth: '',
      negativeMovementMonths: 0,
      monthsBelowZero: 0,
      averageIncomePence: 0,
      averageOutgoingsPence: 0
    };
  }

  const totalNetMovementPence = forecast.reduce((sum, row) => sum + row.netMovementPence, 0);
  const totalIncomePence = forecast.reduce((sum, row) => sum + row.expectedIncomePence, 0);
  const totalOutgoingsPence = forecast.reduce((sum, row) => sum + row.expectedExpensesPence + row.expectedSavingsPence, 0);
  const lowestRow = forecast.reduce((lowest, row) => (row.closingBalancePence < lowest.closingBalancePence ? row : lowest), forecast[0]);
  return {
    startMonth: forecast[0].month,
    openingBalancePence: forecast[0].openingBalancePence,
    forecastAdjustmentPence,
    averageMonthlyMovementPence: Math.round(totalNetMovementPence / forecast.length),
    projectedClosingBalancePence: forecast.at(-1)?.closingBalancePence || forecast[0].openingBalancePence,
    lowestProjectedBalancePence: lowestRow.closingBalancePence,
    lowestProjectedBalanceMonth: lowestRow.month,
    negativeMovementMonths: forecast.filter((row) => row.netMovementPence < 0).length,
    monthsBelowZero: forecast.filter((row) => row.closingBalancePence < 0).length,
    averageIncomePence: Math.round(totalIncomePence / forecast.length),
    averageOutgoingsPence: Math.round(totalOutgoingsPence / forecast.length)
  };
}

function forecastSummaryCards(summary) {
  return `<section class="grid forecast-summary-grid">
    <div class="stat">
      <span>Spendable starting balance</span>
      <strong>${formatCurrency(summary.openingBalancePence)}</strong>
      <small class="plan-stat-note">${summary.startMonth ? `Start of ${escapeHtml(monthLabel(summary.startMonth))}` : ''}${summary.forecastAdjustmentPence ? ` · Includes ${formatSignedCurrency(summary.forecastAdjustmentPence)} adjustment` : ''}</small>
    </div>
    <div class="stat ${summary.averageMonthlyMovementPence < 0 ? 'bad' : summary.averageMonthlyMovementPence > 0 ? 'good' : ''}">
      <span>Average monthly surplus / deficit</span>
      <strong>${formatSignedCurrency(summary.averageMonthlyMovementPence)}</strong>
    </div>
    <div class="stat">
      <span>Monthly income</span>
      <strong>${formatCurrency(summary.averageIncomePence)}</strong>
    </div>
    <div class="stat">
      <span>Monthly outgoings</span>
      <strong>${formatCurrency(summary.averageOutgoingsPence)}</strong>
    </div>
    <div class="stat ${summary.lowestProjectedBalancePence < 0 ? 'bad' : ''}">
      <span>Lowest projected balance</span>
      <strong>${formatCurrency(summary.lowestProjectedBalancePence)}</strong>
      <small class="plan-stat-note">${summary.lowestProjectedBalanceMonth ? `Tightest month: ${escapeHtml(monthLabel(summary.lowestProjectedBalanceMonth))}` : ''}</small>
    </div>
    <div class="stat ${summary.monthsBelowZero > 0 ? 'bad' : 'good'}">
      <span>Months below zero</span>
      <strong>${summary.monthsBelowZero}</strong>
    </div>
  </section>`;
}

function forecastMovementClass(netMovementPence) {
  if (netMovementPence < 0) return 'forecast-movement negative';
  if (netMovementPence > 0) return 'forecast-movement positive';
  return 'forecast-movement';
}

function forecastWhatIfPanel({ startMonth, months, scenario }) {
  return `<section class="card forecast-scenario-card">
    <div class="card-heading">
      <div>
        <h2>What-if scenario</h2>
        <p class="hint">Temporarily adjust the forecast without changing your saved Budget Plan.</p>
      </div>
    </div>
    <div class="button-list scenario-preset-list">
      ${scenarioPreset('Income drops 10%', { startMonth, months, income_adjustment: '-10%' })}
      ${scenarioPreset('Spending +£100/month', { startMonth, months, spending_adjustment: '100' })}
      ${scenarioPreset('Savings -£100/month', { startMonth, months, savings_adjustment: '-100' })}
      ${scenarioPreset('£500 one-off cost', { startMonth, months, one_off_cost: '500' })}
      ${scenarioPreset('Mortgage +£200/month', { startMonth, months, spending_adjustment: '200' })}
      <a class="secondary button" href="/forecast?start_month=${encodeURIComponent(startMonth)}&months=${encodeURIComponent(String(months))}">Clear scenario</a>
    </div>
    <form method="get" action="/forecast" class="grid three compact forecast-scenario-form">
      <input type="hidden" name="start_month" value="${escapeHtml(startMonth)}">
      <input type="hidden" name="months" value="${months}">
      <label>Income adjustment / month <input name="income_adjustment" value="${moneyInputValue(scenario.incomeAdjustmentPence)}" ${moneyInputAttrs({ allowNegative: true, min: null })}></label>
      <label>Spending adjustment / month <input name="spending_adjustment" value="${moneyInputValue(scenario.spendingAdjustmentPence)}" ${moneyInputAttrs({ allowNegative: true, min: null })}></label>
      <label>Savings adjustment / month <input name="savings_adjustment" value="${moneyInputValue(scenario.savingsAdjustmentPence)}" ${moneyInputAttrs({ allowNegative: true, min: null })}></label>
      <label>One-off cost <input name="one_off_cost" value="${moneyInputValue(scenario.oneOffCostPence)}" ${moneyInputAttrs({ allowNegative: false, min: '0' })}></label>
      <label>One-off income <input name="one_off_income" value="${moneyInputValue(scenario.oneOffIncomePence)}" ${moneyInputAttrs({ allowNegative: false, min: '0' })}></label>
      <label>Scenario start <input type="month" name="scenario_start_month" value="${escapeHtml(scenario.startMonth || startMonth)}"></label>
      <label>Duration months <input name="scenario_duration" value="${scenario.durationMonths || months}" ${decimalInputAttrs({ min: '1', max: '120', decimals: 0, step: '1' })}></label>
      <div class="form-actions"><button>Run scenario</button></div>
    </form>
  </section>`;
}

function scenarioPreset(label, params) {
  const search = new URLSearchParams({
    start_month: params.startMonth,
    months: String(params.months),
    scenario_start_month: params.startMonth,
    scenario_duration: String(params.months)
  });
  if (params.income_adjustment === '-10%') {
    search.set('income_adjustment_percent', '-10');
  } else if (params.income_adjustment) {
    search.set('income_adjustment', params.income_adjustment);
  }
  if (params.spending_adjustment) search.set('spending_adjustment', params.spending_adjustment);
  if (params.savings_adjustment) search.set('savings_adjustment', params.savings_adjustment);
  if (params.one_off_cost) search.set('one_off_cost', params.one_off_cost);
  if (params.one_off_income) search.set('one_off_income', params.one_off_income);
  return `<a class="secondary button" href="/forecast?${search.toString()}">${escapeHtml(label)}</a>`;
}

function forecastSavingsNote(savingsContributionsMonthlyPence) {
  return `<section class="card">
    <h2>Savings in cashflow</h2>
    <p>Savings contributions included in cashflow: <strong>${formatCurrency(savingsContributionsMonthlyPence)}/month</strong>.</p>
    <p class="hint">Long-term growth, investment returns, and pension projections live in <a href="/savings">Savings & goals</a>.</p>
  </section>`;
}

function forecastAssumptionsPanel(startMonth) {
  return `<details class="card">
    <summary><strong>Forecast assumptions</strong></summary>
    <ul class="bullet-list top-gap">
      <li>Forecast starts from ${escapeHtml(monthLabel(startMonth))}.</li>
      <li>Uses your current Budget Plan for planned income, spending, and savings.</li>
      <li>Planned savings are treated as cash outflows from spendable household cash.</li>
      <li>Annual costs are included through the monthly planning amounts currently used by Budget Plan.</li>
      <li>Actual transactions are excluded from this forecast.</li>
      <li>Investment growth and pension growth are excluded from spendable cash and shown in Savings & goals.</li>
    </ul>
  </details>`;
}

function forecastScenarioFromQuery(query, { startMonth, months }) {
  const incomeAdjustmentPercent = Number(query.get('income_adjustment_percent') || 0);
  const incomeAdjustmentPence = incomeAdjustmentPercent
    ? 0
    : optionalForecastMoney(query.get('income_adjustment'));
  return {
    incomeAdjustmentPence,
    incomeAdjustmentPercent,
    spendingAdjustmentPence: optionalForecastMoney(query.get('spending_adjustment')),
    savingsAdjustmentPence: optionalForecastMoney(query.get('savings_adjustment')),
    oneOffCostPence: optionalForecastMoney(query.get('one_off_cost')),
    oneOffIncomePence: optionalForecastMoney(query.get('one_off_income')),
    startMonth: query.get('scenario_start_month') || startMonth,
    durationMonths: Math.min(120, Math.max(1, Number(query.get('scenario_duration') || months || 1)))
  };
}

function optionalForecastMoney(value) {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  try {
    return optionalMoney(value, 'Scenario amount', { allowNegative: true, minPence: null });
  } catch {
    return 0;
  }
}

function resolveForecastAdjustment(queryValue, savedForecastAdjustmentPence) {
  if (queryValue === null || queryValue === undefined || String(queryValue).trim() === '') {
    return Number(savedForecastAdjustmentPence || 0);
  }

  try {
    return optionalMoney(queryValue, 'Forecast adjustment', { allowNegative: true, minPence: null });
  } catch {
    return Number(savedForecastAdjustmentPence || 0);
  }
}
