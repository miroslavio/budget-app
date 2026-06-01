export function createBudgetItem(db, item) {
  const result = db
    .prepare(
      `INSERT INTO budget_items (
        household_id, name, item_type, category_id, owner_type, amount_pence, frequency,
        monthly_equivalent_pence, start_date, end_date, notes, is_active, split_type,
        person_a_percentage, person_b_percentage, income_entry_mode, income_estimate_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      item.householdId,
      item.name,
      item.itemType,
      item.categoryId,
      item.ownerType,
      item.amountPence,
      item.frequency,
      item.monthlyEquivalentPence,
      item.startDate,
      item.endDate,
      item.notes,
      item.isActive ? 1 : 0,
      item.splitType,
      item.personAPercentage,
      item.personBPercentage,
      item.incomeEntryMode,
      item.incomeEstimateId || null,
      item.createdBy
    );
  return findBudgetItemById(db, item.householdId, result.lastInsertRowid);
}

export function updateBudgetItem(db, item) {
  db.prepare(
    `UPDATE budget_items
     SET name = ?, item_type = ?, category_id = ?, owner_type = ?, amount_pence = ?, frequency = ?,
         monthly_equivalent_pence = ?, start_date = ?, end_date = ?, notes = ?, is_active = ?, split_type = ?,
         person_a_percentage = ?, person_b_percentage = ?, income_entry_mode = ?, income_estimate_id = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE household_id = ? AND id = ?`
  ).run(
    item.name,
    item.itemType,
    item.categoryId,
    item.ownerType,
    item.amountPence,
    item.frequency,
    item.monthlyEquivalentPence,
    item.startDate,
    item.endDate,
    item.notes,
    item.isActive ? 1 : 0,
    item.splitType,
    item.personAPercentage,
    item.personBPercentage,
    item.incomeEntryMode,
    item.incomeEstimateId || null,
    item.householdId,
    item.id
  );
  return findBudgetItemById(db, item.householdId, item.id);
}

export function updateBudgetItemIncomeEstimate(db, householdId, itemId, incomeEstimateId) {
  db.prepare('UPDATE budget_items SET income_estimate_id = ?, updated_at = CURRENT_TIMESTAMP WHERE household_id = ? AND id = ?').run(
    incomeEstimateId,
    householdId,
    itemId
  );
}

export function findBudgetItemById(db, householdId, id) {
  return db
    .prepare(
      `SELECT budget_items.*, categories.name AS category_name, categories.kind AS category_kind,
              income_estimates.gross_annual_salary_pence AS estimate_gross_annual_salary_pence,
              income_estimates.pay_frequency AS estimate_pay_frequency,
              income_estimates.tax_year AS estimate_tax_year,
              income_estimates.pension_contribution_type AS estimate_pension_contribution_type,
              income_estimates.pension_contribution_value AS estimate_pension_contribution_value,
              income_estimates.pension_contribution_tax_treatment AS estimate_pension_contribution_tax_treatment,
              income_estimates.other_pre_tax_deductions_pence AS estimate_other_pre_tax_deductions_pence,
              income_estimates.other_post_tax_deductions_pence AS estimate_other_post_tax_deductions_pence,
              income_estimates.student_loan_plans_json AS estimate_student_loan_plans_json,
              income_estimates.has_postgraduate_loan AS estimate_has_postgraduate_loan,
              income_estimates.estimated_income_tax_pence AS estimate_income_tax_pence,
              income_estimates.estimated_national_insurance_pence AS estimate_national_insurance_pence,
              income_estimates.estimated_student_loan_repayment_pence AS estimate_student_loan_repayment_pence,
              income_estimates.estimated_postgraduate_loan_repayment_pence AS estimate_postgraduate_loan_repayment_pence,
              income_estimates.pension_contribution_pence AS estimate_pension_contribution_pence,
              income_estimates.estimated_other_deductions_pence AS estimate_other_deductions_pence,
              income_estimates.estimated_net_monthly_income_pence AS estimate_net_monthly_income_pence,
              income_estimates.estimated_net_annual_income_pence AS estimate_net_annual_income_pence,
              income_estimates.linked_savings_account_id AS estimate_linked_savings_account_id,
              income_estimates.employer_pension_contribution_type AS estimate_employer_pension_contribution_type,
              income_estimates.employer_pension_contribution_value AS estimate_employer_pension_contribution_value
       FROM budget_items
       LEFT JOIN categories ON categories.id = budget_items.category_id
       LEFT JOIN income_estimates ON income_estimates.id = budget_items.income_estimate_id
       WHERE budget_items.household_id = ? AND budget_items.id = ?`
    )
    .get(householdId, id);
}

export function listBudgetItems(db, householdId, itemType = null) {
  const sql =
    `SELECT budget_items.*, categories.name AS category_name, categories.kind AS category_kind,
            income_estimates.gross_annual_salary_pence AS estimate_gross_annual_salary_pence,
            income_estimates.pay_frequency AS estimate_pay_frequency,
            income_estimates.tax_year AS estimate_tax_year,
            income_estimates.pension_contribution_type AS estimate_pension_contribution_type,
            income_estimates.pension_contribution_value AS estimate_pension_contribution_value,
            income_estimates.pension_contribution_tax_treatment AS estimate_pension_contribution_tax_treatment,
            income_estimates.other_pre_tax_deductions_pence AS estimate_other_pre_tax_deductions_pence,
            income_estimates.other_post_tax_deductions_pence AS estimate_other_post_tax_deductions_pence,
            income_estimates.student_loan_plans_json AS estimate_student_loan_plans_json,
            income_estimates.has_postgraduate_loan AS estimate_has_postgraduate_loan,
            income_estimates.estimated_income_tax_pence AS estimate_income_tax_pence,
            income_estimates.estimated_national_insurance_pence AS estimate_national_insurance_pence,
            income_estimates.estimated_student_loan_repayment_pence AS estimate_student_loan_repayment_pence,
            income_estimates.estimated_postgraduate_loan_repayment_pence AS estimate_postgraduate_loan_repayment_pence,
            income_estimates.pension_contribution_pence AS estimate_pension_contribution_pence,
            income_estimates.estimated_other_deductions_pence AS estimate_other_deductions_pence,
            income_estimates.estimated_net_monthly_income_pence AS estimate_net_monthly_income_pence,
            income_estimates.estimated_net_annual_income_pence AS estimate_net_annual_income_pence,
            income_estimates.linked_savings_account_id AS estimate_linked_savings_account_id,
            income_estimates.employer_pension_contribution_type AS estimate_employer_pension_contribution_type,
            income_estimates.employer_pension_contribution_value AS estimate_employer_pension_contribution_value
     FROM budget_items
     LEFT JOIN categories ON categories.id = budget_items.category_id
     LEFT JOIN income_estimates ON income_estimates.id = budget_items.income_estimate_id
     WHERE budget_items.household_id = ? ${itemType ? 'AND budget_items.item_type = ?' : ''}
     ORDER BY budget_items.is_active DESC, budget_items.item_type, budget_items.name`;
  const statement = db.prepare(sql);
  return itemType ? statement.all(householdId, itemType) : statement.all(householdId);
}

export function listActiveBudgetItems(db, householdId) {
  return db
    .prepare(
      `SELECT budget_items.*, categories.name AS category_name, categories.kind AS category_kind,
              income_estimates.gross_annual_salary_pence AS estimate_gross_annual_salary_pence,
              income_estimates.pay_frequency AS estimate_pay_frequency,
              income_estimates.tax_year AS estimate_tax_year,
              income_estimates.pension_contribution_type AS estimate_pension_contribution_type,
              income_estimates.pension_contribution_value AS estimate_pension_contribution_value,
              income_estimates.pension_contribution_tax_treatment AS estimate_pension_contribution_tax_treatment,
              income_estimates.other_pre_tax_deductions_pence AS estimate_other_pre_tax_deductions_pence,
              income_estimates.other_post_tax_deductions_pence AS estimate_other_post_tax_deductions_pence,
              income_estimates.student_loan_plans_json AS estimate_student_loan_plans_json,
              income_estimates.has_postgraduate_loan AS estimate_has_postgraduate_loan,
              income_estimates.estimated_income_tax_pence AS estimate_income_tax_pence,
              income_estimates.estimated_national_insurance_pence AS estimate_national_insurance_pence,
              income_estimates.estimated_student_loan_repayment_pence AS estimate_student_loan_repayment_pence,
              income_estimates.estimated_postgraduate_loan_repayment_pence AS estimate_postgraduate_loan_repayment_pence,
              income_estimates.pension_contribution_pence AS estimate_pension_contribution_pence,
              income_estimates.estimated_other_deductions_pence AS estimate_other_deductions_pence,
              income_estimates.estimated_net_monthly_income_pence AS estimate_net_monthly_income_pence,
              income_estimates.estimated_net_annual_income_pence AS estimate_net_annual_income_pence,
              income_estimates.linked_savings_account_id AS estimate_linked_savings_account_id,
              income_estimates.employer_pension_contribution_type AS estimate_employer_pension_contribution_type,
              income_estimates.employer_pension_contribution_value AS estimate_employer_pension_contribution_value
       FROM budget_items
       LEFT JOIN categories ON categories.id = budget_items.category_id
       LEFT JOIN income_estimates ON income_estimates.id = budget_items.income_estimate_id
       WHERE budget_items.household_id = ? AND budget_items.is_active = 1
       ORDER BY budget_items.item_type, budget_items.name`
    )
    .all(householdId);
}

export function setBudgetItemActive(db, householdId, id, isActive) {
  db.prepare('UPDATE budget_items SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE household_id = ? AND id = ?').run(
    isActive ? 1 : 0,
    householdId,
    id
  );
}

export function deleteBudgetItem(db, householdId, id) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM income_estimates WHERE household_id = ? AND budget_item_id = ?').run(householdId, id);
    db.prepare('DELETE FROM budget_items WHERE household_id = ? AND id = ?').run(householdId, id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
