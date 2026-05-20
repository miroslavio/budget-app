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
  const headers = ['Goal Name', 'Target Amount', 'Current Saved', 'Monthly Contribution', 'Target Date', 'Owner', 'Status'];
  return generateCsv(
    headers,
    goals.map((goal) => ({
      'Goal Name': goal.name,
      'Target Amount': penceToPounds(goal.target_amount_pence).toFixed(2),
      'Current Saved': penceToPounds(goal.current_saved_amount_pence).toFixed(2),
      'Monthly Contribution': penceToPounds(goal.monthly_contribution_pence).toFixed(2),
      'Target Date': goal.target_date || '',
      Owner: goal.owner_type,
      Status: goal.status
    }))
  );
}

export function summaryCsv(summary) {
  return generateCsv(
    ['Metric', 'Amount'],
    [
      { Metric: 'Planned income', Amount: penceToPounds(summary.plannedIncomePence).toFixed(2) },
      { Metric: 'Planned expenses', Amount: penceToPounds(summary.plannedExpensePence).toFixed(2) },
      { Metric: 'Planned savings', Amount: penceToPounds(summary.plannedSavingsPence).toFixed(2) },
      { Metric: 'Planned surplus / deficit', Amount: penceToPounds(summary.plannedSurplusPence).toFixed(2) }
    ]
  );
}

function csvCell(value) {
  const string = String(value ?? '');
  if (/[",\n\r]/.test(string)) return `"${string.replace(/"/g, '""')}"`;
  return string;
}
