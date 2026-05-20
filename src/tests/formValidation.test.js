import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormValidator, FormValidationError } from '../utils/formValidation.js';

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
