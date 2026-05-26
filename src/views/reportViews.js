import { savingsGoalProgress } from '../services/savingsService.js';
import { escapeHtml, formatCurrency, movementStat, ownerLabel, page, signedValueLabel, varianceLabel } from './html.js';

export function renderReportsPage(ctx, { month, calendarYear, taxYear, range, planned, actual, variance, breakdown, goals, estimates, members = [] }) {
  return page(ctx, {
    title: 'Reports',
    wide: true,
    body: `<section class="page-title">
      <div>
        <h1>Reports</h1>
        <p class="page-context">Compare your plan, actuals, savings progress, and tax-year totals across the periods that matter.</p>
      </div>
      <form method="get" action="/reports" class="inline-form">
        <label>Month <input type="month" name="month" value="${escapeHtml(month)}"></label>
        <label>Calendar year <input name="calendar_year" inputmode="numeric" value="${escapeHtml(calendarYear)}"></label>
        <label>Tax year <input name="tax_year" value="${escapeHtml(taxYear)}"></label>
        <button>View</button>
      </form>
    </section>

    <section class="grid two">
      <div class="card">
        <h2>Selected period budget report</h2>
        <table><tbody>
          <tr><th>Planned income</th><td>${formatCurrency(planned.plannedIncomePence)}</td></tr>
          <tr><th>Planned expenses</th><td>${formatCurrency(planned.plannedExpensePence)}</td></tr>
          <tr><th>Planned savings</th><td>${formatCurrency(planned.plannedSavingsPence)}</td></tr>
          <tr><th>Planned surplus / deficit</th><td>${signedValueLabel(planned.plannedSurplusPence)}</td></tr>
        </tbody></table>
      </div>
      <div class="card">
        <h2>Planned versus actual</h2>
        <table><tbody>
          <tr><th>Income variance</th><td>${varianceLabel(variance.incomeVariancePence, 'income')}</td></tr>
          <tr><th>Expense variance</th><td>${varianceLabel(variance.expenseVariancePence, 'expense')}</td></tr>
          <tr><th>Savings variance</th><td>${varianceLabel(variance.savingsVariancePence, 'savings')}</td></tr>
          <tr><th>Surplus variance</th><td>${varianceLabel(variance.surplusVariancePence, 'surplus')}</td></tr>
        </tbody></table>
      </div>
    </section>

    <section class="card">
      <h2>Selected range actual summary: ${escapeHtml(range.label)}</h2>
      <div class="grid four">
        <div class="stat good"><span>Actual income</span><strong>${formatCurrency(actual.actualIncomePence)}</strong></div>
        <div class="stat"><span>Actual expenses</span><strong>${formatCurrency(actual.actualExpensePence)}</strong></div>
        <div class="stat"><span>Actual savings</span><strong>${formatCurrency(actual.actualSavingsPence)}</strong></div>
        ${movementStat('Actual monthly movement', actual.actualSurplusPence)}
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h2>Category budget tracking</h2>
        ${categoryTable(breakdown)}
      </div>
      <div class="card">
        <h2>Person / household ownership breakdown</h2>
        ${ownerTable(planned, actual, members)}
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h2>Savings progress report</h2>
        ${savingsTable(goals)}
      </div>
      <div class="card">
        <h2>Take-home pay estimate breakdown</h2>
        ${estimateTable(estimates)}
      </div>
    </section>`
  });
}

function categoryTable(rows) {
  if (!rows.length) return '<p class="empty">No category data yet.</p>';
  return `<table>
    <thead><tr><th>Category</th><th>Budget target</th><th>Recurring plan</th><th>Actual expenses</th><th>Budget variance</th></tr></thead>
    <tbody>${rows
      .map(
        (row) => `<tr>
          <td>${escapeHtml(row.category)}</td>
          <td>${row.budgetPence ? formatCurrency(row.budgetPence) : '—'}</td>
          <td>${formatCurrency(row.plannedExpensePence)}</td>
          <td>${formatCurrency(row.actualExpensePence)}</td>
          <td>${varianceLabel(row.budgetVariancePence, 'budget')}</td>
        </tr>`
      )
      .join('')}</tbody>
  </table>`;
}

function ownerTable(planned, actual, members) {
  return `<table>
    <thead><tr><th>Owner</th><th>Planned expenses</th><th>Actual expenses</th><th>Planned savings</th><th>Actual savings</th></tr></thead>
    <tbody>${Object.keys(planned.byOwner)
      .map(
        (owner) => `<tr>
          <td>${escapeHtml(ownerLabel(owner, members))}</td>
          <td>${formatCurrency(planned.byOwner[owner].expense)}</td>
          <td>${formatCurrency(actual.byOwner[owner].expense)}</td>
          <td>${formatCurrency(planned.byOwner[owner].savings)}</td>
          <td>${formatCurrency(actual.byOwner[owner].savings)}</td>
        </tr>`
      )
      .join('')}</tbody>
  </table>`;
}

function savingsTable(goals) {
  if (!goals.length) return '<p class="empty">No savings goals yet.</p>';
  return `<table>
    <thead><tr><th>Goal</th><th>Progress</th><th>Remaining</th><th>On track</th></tr></thead>
    <tbody>${goals
      .map((goal) => {
        const progress = savingsGoalProgress(goal);
        return `<tr><td>${escapeHtml(goal.name)}</td><td>${progress.progressPercentage}%</td><td>${formatCurrency(progress.remainingPence)}</td><td>${progress.onTrack === null ? 'No target date' : progress.onTrack ? 'Yes' : 'No'}</td></tr>`;
      })
      .join('')}</tbody>
  </table>`;
}

function estimateTable(estimates) {
  if (!estimates.length) return '<p class="empty">No estimated take-home pay items yet.</p>';
  return `<table>
    <thead><tr><th>Income item</th><th>Tax year</th><th>Gross salary</th><th>Income Tax</th><th>National Insurance</th><th>Student loan</th><th>Postgraduate Loan</th><th>Net monthly</th></tr></thead>
    <tbody>${estimates
      .map(
        (estimate) => `<tr>
          <td>${escapeHtml(estimate.budget_item_name || 'Estimate')}</td>
          <td>${escapeHtml(estimate.tax_year)}</td>
          <td>${formatCurrency(estimate.gross_annual_salary_pence)}</td>
          <td>${formatCurrency(estimate.estimated_income_tax_pence)}</td>
          <td>${formatCurrency(estimate.estimated_national_insurance_pence)}</td>
          <td>${formatCurrency(estimate.estimated_student_loan_repayment_pence)}</td>
          <td>${formatCurrency(estimate.estimated_postgraduate_loan_repayment_pence)}</td>
          <td>${formatCurrency(estimate.estimated_net_monthly_income_pence)}</td>
        </tr>`
      )
      .join('')}</tbody>
  </table>`;
}
