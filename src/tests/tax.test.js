import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateIncomeTax } from '../services/incomeTaxService.js';
import { calculateEmployeeNationalInsurance } from '../services/nationalInsuranceService.js';
import { calculateStudentLoanRepayments } from '../services/studentLoanService.js';
import { estimateTakeHomePay } from '../services/takeHomePayService.js';
import { loadTaxRules } from '../services/taxRulesService.js';

test('income tax uses personal allowance and basic rate band from rules', () => {
  const rules = loadTaxRules('2026-2027');
  const result = calculateIncomeTax(5000000, rules.incomeTax);
  assert.equal(result.personalAllowancePence, 1257000);
  assert.equal(result.incomeTaxPence, 748600);
});

test('employee National Insurance uses annual primary threshold and upper earnings limit', () => {
  const rules = loadTaxRules('2026-2027');
  const result = calculateEmployeeNationalInsurance(5000000, rules.nationalInsurance);
  assert.equal(result.nationalInsurancePence, 299440);
});

test('student loan uses lowest selected undergraduate threshold and separate postgraduate loan', () => {
  const rules = loadTaxRules('2026-2027');
  const result = calculateStudentLoanRepayments(
    {
      annualLoanablePayPence: 3840000,
      studentLoanPlans: ['plan_1', 'plan_2'],
      hasPostgraduateLoan: true
    },
    rules.studentLoans
  );

  assert.equal(result.studentLoanRepaymentPence, 103500);
  assert.equal(result.postgraduateLoanRepaymentPence, 104400);
});

test('take-home pay estimate returns annual and monthly net values with deductions', () => {
  const result = estimateTakeHomePay({
    grossAnnualSalaryPence: 4500000,
    taxYear: '2026-2027',
    pensionContributionType: 'percentage',
    pensionContributionValue: 5,
    pensionContributionTaxTreatment: 'pre_tax',
    studentLoanPlans: ['plan_2'],
    hasPostgraduateLoan: false,
    otherPreTaxDeductionsPence: 0,
    otherPostTaxDeductionsPence: 0
  });

  assert.equal(result.estimatedIncomeTaxPence > 0, true);
  assert.equal(result.estimatedNationalInsurancePence > 0, true);
  assert.equal(result.estimatedStudentLoanRepaymentPence > 0, true);
  assert.equal(result.estimatedNetMonthlyIncomePence, Math.round(result.estimatedNetAnnualIncomePence / 12));
});
