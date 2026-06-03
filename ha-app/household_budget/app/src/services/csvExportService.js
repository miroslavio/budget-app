import { penceToPounds } from '../utils/money.js';

export function generateCsv(headers, rows) {
  return [headers.join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))].join('\n');
}

export function budgetItemsCsv(items) {
  const headers = [
    'Name',
    'Type',
    'Category',
    'Owner',
    'Amount',
    'Frequency',
    'Monthly Equivalent',
    'Start Date',
    'End Date',
    'Active'
  ];
  return generateCsv(
    headers,
    items.map((item) => ({
      Name: item.name,
      Type: item.item_type,
      Category: item.category_name || '',
      Owner: item.owner_type,
      Amount: penceToPounds(item.amount_pence).toFixed(2),
      Frequency: item.frequency,
      'Monthly Equivalent': penceToPounds(item.monthly_equivalent_pence).toFixed(2),
      'Start Date': item.start_date,
      'End Date': item.end_date || '',
      Active: item.is_active ? 'Yes' : 'No'
    }))
  );
}

export function plannedSpendingCsv(rows) {
  const headers = [
    'Name',
    'Category',
    'Type',
    'Owner / Split',
    'Frequency',
    'Planned Monthly',
    'Start Date',
    'End Date',
    'Status',
    'Counted In Plan',
    'Notes'
  ];
  return generateCsv(
    headers,
    rows.map((row) => ({
      Name: row.name,
      Category: row.categoryName || '',
      Type: row.typeLabel,
      'Owner / Split': row.ownerLabel,
      Frequency: row.frequencyLabel,
      'Planned Monthly': penceToPounds(row.plannedMonthlyPence || 0).toFixed(2),
      'Start Date': row.startDate || '',
      'End Date': row.endDate || '',
      Status: row.status || '',
      'Counted In Plan': row.countedInPlan ? 'Yes' : 'No',
      Notes: row.notes || ''
    }))
  );
}

export function transactionsCsv(transactions) {
  const headers = ['Date', 'Description', 'Amount', 'Type', 'Category', 'Owner', 'Source', 'Notes'];
  return generateCsv(
    headers,
    transactions.map((transaction) => ({
      Date: transaction.transaction_date,
      Description: transaction.description,
      Amount: penceToPounds(transaction.amount_pence).toFixed(2),
      Type: transaction.type,
      Category: transaction.category_name || '',
      Owner: transaction.owner_type,
      Source: transaction.source,
      Notes: transaction.notes || ''
    }))
  );
}

export function savingsGoalsCsv(goals) {
  const headers = [
    'Goal Name',
    'Tracking Mode',
    'Goal Type',
    'Target Amount',
    'Current Saved',
    'Monthly Additions',
    'Projected At Target Date',
    'Shortfall / Surplus',
    'Target Date',
    'Owner',
    'Linked Pots',
    'Status',
    'Notes'
  ];
  return generateCsv(
    headers,
    goals.map((goal) => ({
      'Goal Name': goal.name,
      'Tracking Mode': goal.metrics?.trackingMode === 'linked_pots' ? 'Linked pots' : 'Manual',
      'Goal Type': goal.goal_type || 'general',
      'Target Amount': penceToPounds(goal.target_amount_pence).toFixed(2),
      'Current Saved': penceToPounds(goal.metrics?.currentSavedPence ?? goal.current_saved_amount_pence ?? 0).toFixed(2),
      'Monthly Additions': penceToPounds(goal.metrics?.monthlyAdditionsPence ?? goal.monthly_contribution_pence ?? 0).toFixed(2),
      'Projected At Target Date': goal.metrics?.projectedValueAtTargetDatePence == null ? '' : penceToPounds(goal.metrics.projectedValueAtTargetDatePence).toFixed(2),
      'Shortfall / Surplus': goal.metrics?.projectedShortfallSurplusPence == null ? '' : penceToPounds(goal.metrics.projectedShortfallSurplusPence).toFixed(2),
      'Target Date': goal.target_date || '',
      Owner: goal.owner_type,
      'Linked Pots': goal.linkedAccounts?.map((account) => account.name).join(', ') || '',
      Status: goal.metrics?.statusLabel || goal.status,
      Notes: goal.notes || ''
    }))
  );
}

export function summaryCsv(summary) {
  return generateCsv(
    ['Metric', 'Amount'],
    [
      { Metric: 'Planned income', Amount: penceToPounds(summary.plannedIncomePence).toFixed(2) },
      { Metric: 'Planned spending', Amount: penceToPounds(summary.plannedExpensePence).toFixed(2) },
      { Metric: 'Planned savings', Amount: penceToPounds(summary.plannedSavingsPence).toFixed(2) },
      { Metric: 'Available after plan', Amount: penceToPounds(summary.plannedSurplusPence).toFixed(2) }
    ]
  );
}

function csvCell(value) {
  const string = String(value ?? '');
  if (/[",\n\r]/.test(string)) return `"${string.replace(/"/g, '""')}"`;
  return string;
}
