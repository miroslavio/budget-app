import { roundPence } from '../utils/money.js';

export function calculateEmployeeNationalInsurance(annualNiablePayPence, rules) {
  const niRules = rules.class1Employee;
  const gross = Math.max(0, Number(annualNiablePayPence || 0));
  const primaryThreshold = niRules.primaryThreshold * 100;
  const upperEarningsLimit = niRules.upperEarningsLimit * 100;

  const mainBandPay = Math.max(0, Math.min(gross, upperEarningsLimit) - primaryThreshold);
  const additionalBandPay = Math.max(0, gross - upperEarningsLimit);

  const mainContribution = mainBandPay * niRules.mainRate;
  const additionalContribution = additionalBandPay * niRules.additionalRate;

  return {
    nationalInsurancePence: roundPence(mainContribution + additionalContribution),
    breakdown: [
      {
        name: 'Main Class 1 employee National Insurance',
        taxablePence: roundPence(mainBandPay),
        contributionPence: roundPence(mainContribution),
        rate: niRules.mainRate
      },
      {
        name: 'Additional Class 1 employee National Insurance',
        taxablePence: roundPence(additionalBandPay),
        contributionPence: roundPence(additionalContribution),
        rate: niRules.additionalRate
      }
    ]
  };
}
