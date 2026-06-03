import { parsePoundsToPence } from './money.js';

export class FormValidationError extends Error {
  constructor(message, fieldErrors) {
    super(message);
    this.name = 'FormValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export function createFormValidator(fields) {
  const errors = {};

  return {
    requireText(name, label, { maxLength = 255 } = {}) {
      const value = String(fields[name] || '').trim();
      if (!value) {
        errors[name] = `${label} is required.`;
        return '';
      }
      if (value.length > maxLength) {
        errors[name] = `${label} must be ${maxLength} characters or fewer.`;
        return '';
      }
      return value;
    },

    money(name, label, { positive = false } = {}) {
      try {
        const value = parsePoundsToPence(fields[name]);
        if (positive && value <= 0) {
          errors[name] = `${label} must be greater than zero.`;
          return 0;
        }
        return value;
      } catch {
        errors[name] = `${label} must be a valid amount in pounds and pence.`;
        return 0;
      }
    },

    choice(name, label, choices) {
      const value = fields[name];
      if (!choices.includes(value)) {
        errors[name] = `${label} is invalid.`;
        return choices[0];
      }
      return value;
    },

    optionalText(name, { maxLength = 1000 } = {}) {
      const value = String(fields[name] || '').trim();
      if (value.length > maxLength) {
        errors[name] = `Value must be ${maxLength} characters or fewer.`;
        return null;
      }
      return value || null;
    },

    finish(message = 'Check the highlighted fields.') {
      if (Object.keys(errors).length) {
        throw new FormValidationError(message, errors);
      }
    },

    errors
  };
}
