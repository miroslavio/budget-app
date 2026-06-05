export function createIncomeEstimate(db, estimate) {
  const result = db
    .prepare(
      `INSERT INTO income_estimates (
        household_id, budget_item_id, gross_annual_salary_pence, pay_frequency, tax_year,
        pension_scheme_type, pension_contribution_method, pension_contribution_type, pension_contribution_value, pension_contribution_tax_treatment,
        other_pre_tax_deductions_pence, other_post_tax_deductions_pence, student_loan_plans_json,
        has_postgraduate_loan, estimated_income_tax_pence, estimated_national_insurance_pence,
        estimated_student_loan_repayment_pence, estimated_postgraduate_loan_repayment_pence,
        pension_contribution_pence, estimated_other_deductions_pence,
        estimated_net_monthly_income_pence, estimated_net_annual_income_pence,
        linked_savings_account_id, employer_pension_contribution_type, employer_pension_contribution_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      estimate.householdId,
      estimate.budgetItemId || null,
      estimate.grossAnnualSalaryPence,
      estimate.payFrequency,
      estimate.taxYear,
      estimate.pensionSchemeType || 'defined_contribution',
      estimate.pensionContributionMethod || 'salary_sacrifice',
      estimate.pensionContributionType,
      estimate.pensionContributionValue,
      estimate.pensionContributionTaxTreatment,
      estimate.otherPreTaxDeductionsPence,
      estimate.otherPostTaxDeductionsPence,
      JSON.stringify(estimate.studentLoanPlans || []),
      estimate.hasPostgraduateLoan ? 1 : 0,
      estimate.estimatedIncomeTaxPence,
      estimate.estimatedNationalInsurancePence,
      estimate.estimatedStudentLoanRepaymentPence,
      estimate.estimatedPostgraduateLoanRepaymentPence,
      estimate.pensionContributionPence,
      estimate.estimatedOtherDeductionsPence,
      estimate.estimatedNetMonthlyIncomePence,
      estimate.estimatedNetAnnualIncomePence,
      estimate.linkedSavingsAccountId || null,
      estimate.employerPensionContributionType || 'none',
      estimate.employerPensionContributionValue || 0
    );
  return findIncomeEstimateById(db, estimate.householdId, result.lastInsertRowid);
}

export function attachEstimateToBudgetItem(db, householdId, estimateId, budgetItemId) {
  db.prepare('UPDATE income_estimates SET budget_item_id = ? WHERE household_id = ? AND id = ?').run(
    budgetItemId,
    householdId,
    estimateId
  );
}

export function updateIncomeEstimate(db, estimate) {
  db.prepare(
    `UPDATE income_estimates
     SET gross_annual_salary_pence = ?, pay_frequency = ?, tax_year = ?,
         pension_scheme_type = ?, pension_contribution_method = ?, pension_contribution_type = ?, pension_contribution_value = ?, pension_contribution_tax_treatment = ?,
         other_pre_tax_deductions_pence = ?, other_post_tax_deductions_pence = ?, student_loan_plans_json = ?,
         has_postgraduate_loan = ?, estimated_income_tax_pence = ?, estimated_national_insurance_pence = ?,
         estimated_student_loan_repayment_pence = ?, estimated_postgraduate_loan_repayment_pence = ?,
         pension_contribution_pence = ?, estimated_other_deductions_pence = ?,
         estimated_net_monthly_income_pence = ?, estimated_net_annual_income_pence = ?,
         linked_savings_account_id = ?, employer_pension_contribution_type = ?, employer_pension_contribution_value = ?
     WHERE household_id = ? AND id = ?`
  ).run(
    estimate.grossAnnualSalaryPence,
    estimate.payFrequency,
    estimate.taxYear,
    estimate.pensionSchemeType || 'defined_contribution',
    estimate.pensionContributionMethod || 'salary_sacrifice',
    estimate.pensionContributionType,
    estimate.pensionContributionValue,
    estimate.pensionContributionTaxTreatment,
    estimate.otherPreTaxDeductionsPence,
    estimate.otherPostTaxDeductionsPence,
    JSON.stringify(estimate.studentLoanPlans || []),
    estimate.hasPostgraduateLoan ? 1 : 0,
    estimate.estimatedIncomeTaxPence,
    estimate.estimatedNationalInsurancePence,
    estimate.estimatedStudentLoanRepaymentPence,
    estimate.estimatedPostgraduateLoanRepaymentPence,
    estimate.pensionContributionPence,
    estimate.estimatedOtherDeductionsPence,
    estimate.estimatedNetMonthlyIncomePence,
    estimate.estimatedNetAnnualIncomePence,
    estimate.linkedSavingsAccountId || null,
    estimate.employerPensionContributionType || 'none',
    estimate.employerPensionContributionValue || 0,
    estimate.householdId,
    estimate.id
  );
  return findIncomeEstimateById(db, estimate.householdId, estimate.id);
}

export function deleteIncomeEstimate(db, householdId, id) {
  db.prepare('DELETE FROM income_estimates WHERE household_id = ? AND id = ?').run(householdId, id);
}

export function findIncomeEstimateById(db, householdId, id) {
  return db.prepare('SELECT * FROM income_estimates WHERE household_id = ? AND id = ?').get(householdId, id);
}

export function listIncomeEstimates(db, householdId) {
  return db
    .prepare(
      `SELECT income_estimates.*, budget_items.name AS budget_item_name
       FROM income_estimates
       LEFT JOIN budget_items ON budget_items.id = income_estimates.budget_item_id
       WHERE income_estimates.household_id = ?
       ORDER BY income_estimates.created_at DESC`
    )
    .all(householdId);
}
