import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormValidator, FormValidationError } from '../utils/formValidation.js';
import { optionalMoney, requireDecimal, requireMoney } from '../utils/validation.js';

test('form validator collects field-level money and text errors', () => {
  const validator = createFormValidator({
    name: '',
    amount: '-1'
  });

  validator.requireText('name', 'Name');
  validator.money('amount', 'Amount', { positive: true });

  assert.throws(
    () => validator.finish(),
    (error) => {
      assert.equal(error instanceof FormValidationError, true);
      assert.deepEqual(error.fieldErrors, {
        name: 'Name is required.',
        amount: 'Amount must be greater than zero.'
      });
      return true;
    }
  );
});

test('money helpers enforce GBP format and positivity rules', () => {
  assert.equal(requireMoney('12.50', 'Amount'), 1250);
  assert.equal(optionalMoney('-5.00', 'Opening balance', { allowNegative: true, minPence: null }), -500);
  assert.throws(() => requireMoney('abc', 'Amount'), /Amount must be a valid GBP amount\./);
  assert.throws(() => requireMoney('0', 'Amount'), /Amount must be greater than zero\./);
});

test('decimal helper enforces numeric ranges', () => {
  assert.equal(requireDecimal('4.5', 'Rate', { min: 0, max: 10 }), 4.5);
  assert.throws(() => requireDecimal('twelve', 'Rate', { min: 0, max: 10 }), /Rate must be a valid number\./);
  assert.throws(() => requireDecimal('15', 'Rate', { min: 0, max: 10 }), /Rate must be between 0 and 10\./);
});
