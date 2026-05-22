function toggleConditionalSections(root = document) {
  const controllers = root.querySelectorAll('[data-controls]');
  controllers.forEach((controller) => {
    const update = () => {
      const currentValue = controller.type === 'checkbox' ? (controller.checked ? 'checked' : 'unchecked') : controller.value;
      const targets = root.querySelectorAll(`[data-controlled-by="${controller.name}"]`);
      targets.forEach((target) => {
        const expected = String(target.dataset.showWhen || '').split('|');
        const visible = expected.includes(currentValue);
        target.hidden = !visible;
        target.querySelectorAll('input, select, textarea').forEach((field) => {
          if (field.dataset.requiredWhenVisible === 'true') {
            field.required = visible;
          }
        });
      });
    };

    controller.addEventListener('change', update);
    controller.addEventListener('input', update);
    update();
  });
}

function wireDetailsActions(root = document) {
  root.querySelectorAll('[data-close-details]').forEach((button) => {
    button.addEventListener('click', () => {
      const details = button.closest('details');
      if (details) details.open = false;
    });
  });
}

function wireEnterSubmit(root = document) {
  root.querySelectorAll('form[data-submit-on-enter]').forEach((form) => {
    form.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      const field = event.target;
      if (!(field instanceof HTMLElement)) return;
      if (!['INPUT', 'SELECT'].includes(field.tagName)) return;

      event.preventDefault();
      const submitter = form.querySelector('button[type="submit"], input[type="submit"]');
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit(submitter || undefined);
      } else if (submitter instanceof HTMLElement) {
        submitter.click();
      }
    });
  });
}

function wireAutoSubmit(root = document) {
  root.querySelectorAll('form[data-submit-on-change]').forEach((form) => {
    form.addEventListener('change', (event) => {
      const field = event.target;
      if (!(field instanceof HTMLElement)) return;
      if (!['SELECT', 'INPUT'].includes(field.tagName)) return;
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit();
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  refreshConditionalSections();
  wireDetailsActions();
  wireEnterSubmit();
  wireAutoSubmit();
  wireNumberInputs();
  wireSplitSliders();
  wireTransactionCategorySelects();
  wireConfirmActions();
  wireModals();
  wireMobileNav();
});

function refreshConditionalSections(root = document) {
  toggleConditionalSections(root);
}

function wireModals(root = document) {
  root.querySelectorAll('[data-open-modal]').forEach((button) => {
    button.addEventListener('click', () => {
      const dialog = document.getElementById(button.dataset.openModal);
      if (!dialog || typeof dialog.showModal !== 'function') return;

      if (button.dataset.resetModal === 'true') {
        dialog.querySelectorAll('form').forEach((form) => form.reset());
      }

      Object.entries(button.dataset)
        .filter(([key]) => key.startsWith('fill'))
        .forEach(([key, value]) => {
          const fieldKey = key.slice(4);
          const normalisedKey = fieldKey.slice(0, 1).toLowerCase() + fieldKey.slice(1);
          const field = dialog.querySelector(`[data-modal-field="${normalisedKey}"]`);
          if (field instanceof HTMLInputElement && field.type === 'checkbox') {
            field.checked = value === 'true' || value === '1' || value === 'checked' || value === 'on';
          } else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
            field.value = value;
          }
        });

      refreshConditionalSections(dialog);
      wireNumberInputs(dialog);
      wireSplitSliders(dialog);
      wireTransactionCategorySelects(dialog);
      dialog.showModal();
    });
  });

  root.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => {
      const dialog = button.closest('dialog');
      if (dialog) dialog.close();
    });
  });

  root.querySelectorAll('dialog[data-modal]').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
}

function wireConfirmActions(root = document) {
  root.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      const message = form.dataset.confirm;
      if (!message) return;
      if (!window.confirm(message)) {
        event.preventDefault();
      }
    });
  });
}

function wireNumberInputs(root = document) {
  root.querySelectorAll('input[data-number-input]').forEach((input) => {
    if (!(input instanceof HTMLInputElement) || input.dataset.numberBound === 'true') return;
    input.dataset.numberBound = 'true';

    const sanitise = () => {
      const decimals = Number(input.dataset.decimals || '2');
      const allowNegative = input.dataset.allowNegative === 'true';
      const raw = String(input.value || '').replace(/,/g, '.');
      let result = '';
      let hasDecimal = false;
      let decimalCount = 0;

      for (let index = 0; index < raw.length; index += 1) {
        const character = raw[index];

        if (character >= '0' && character <= '9') {
          if (!hasDecimal) {
            result += character;
          } else if (decimalCount < decimals) {
            result += character;
            decimalCount += 1;
          }
          continue;
        }

        if (character === '.' && decimals > 0 && !hasDecimal) {
          result += character;
          hasDecimal = true;
          continue;
        }

        if (character === '-' && allowNegative && index === 0 && !result.includes('-')) {
          result = `-${result}`;
        }
      }

      if (result !== input.value) input.value = result;
      input.setCustomValidity('');
    };

    input.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const allowedKeys = ['Backspace', 'Tab', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'];
      if (allowedKeys.includes(event.key)) return;

      const decimals = Number(input.dataset.decimals || '2');
      const allowNegative = input.dataset.allowNegative === 'true';
      const selectionStart = input.selectionStart ?? 0;
      const selectionEnd = input.selectionEnd ?? 0;
      const currentValue = input.value || '';

      if (/^\d$/.test(event.key)) return;

      if (event.key === '.' && decimals > 0) {
        const nextValue = currentValue.slice(0, selectionStart) + '.' + currentValue.slice(selectionEnd);
        if (nextValue.split('.').length <= 2) return;
      }

      if (event.key === '-' && allowNegative && selectionStart === 0 && !currentValue.includes('-')) return;

      event.preventDefault();
    });

    input.addEventListener('input', sanitise);
    input.addEventListener('paste', () => window.setTimeout(sanitise, 0));
    sanitise();
  });
}

function wireSplitSliders(root = document) {
  root.querySelectorAll('[data-split-slider]').forEach((slider) => {
    if (!(slider instanceof HTMLInputElement)) return;
    const container = slider.closest('.split-slider-card');
    if (!(container instanceof HTMLElement)) return;

    const secondaryInput = container.querySelector('[data-split-secondary-input]');
    const primaryOutput = container.querySelector('[data-split-primary-output]');
    const secondaryOutput = container.querySelector('[data-split-secondary-output]');

    const sync = () => {
      let primary = Number(slider.value || '50');
      if (!Number.isFinite(primary)) primary = 50;
      primary = Math.min(100, Math.max(0, Math.round(primary * 100) / 100));
      const secondary = Math.round((100 - primary) * 100) / 100;

      slider.value = String(primary);
      slider.style.setProperty('--split-value', `${primary}%`);
      if (secondaryInput instanceof HTMLInputElement) secondaryInput.value = String(secondary);
      if (primaryOutput instanceof HTMLElement) primaryOutput.textContent = formatSplitPercent(primary);
      if (secondaryOutput instanceof HTMLElement) secondaryOutput.textContent = formatSplitPercent(secondary);
    };

    if (slider.dataset.splitBound !== 'true') {
      slider.dataset.splitBound = 'true';
      slider.addEventListener('input', sync);
      slider.addEventListener('change', sync);
    }

    sync();
  });
}

function formatSplitPercent(value) {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}%`;
  return `${String(rounded).replace(/(?:\\.0+|(\\.\\d+?)0+)$/, '$1')}%`;
}

function wireTransactionCategorySelects(root = document) {
  root.querySelectorAll('select[data-transaction-category-select]').forEach((select) => {
    if (!(select instanceof HTMLSelectElement)) return;
    const form = select.closest('form');
    const typeSelect = form?.querySelector('select[name="type"]');
    if (!(typeSelect instanceof HTMLSelectElement)) return;

    const allowedKindsForType = (type) => {
      if (type === 'income') return ['income'];
      if (type === 'savings') return ['savings'];
      return ['expense', 'debt'];
    };

    const update = () => {
      const allowedKinds = allowedKindsForType(typeSelect.value);
      let selectedStillVisible = false;

      [...select.options].forEach((option) => {
        const kind = option.dataset.kind || '';
        const isPlaceholder = !option.value;
        const visible = isPlaceholder || allowedKinds.includes(kind);
        option.hidden = !visible;
        option.disabled = !visible;
        if (visible && option.value === select.value) selectedStillVisible = true;
      });

      if (!selectedStillVisible) {
        const firstVisible = [...select.options].find((option) => !option.disabled);
        select.value = firstVisible?.value || '';
      }
    };

    if (select.dataset.transactionCategoryBound !== 'true') {
      select.dataset.transactionCategoryBound = 'true';
      typeSelect.addEventListener('change', update);
      typeSelect.addEventListener('input', update);
    }

    update();
  });
}

function wireMobileNav(root = document) {
  const nav = root.querySelector('.site-nav');
  const toggle = root.querySelector('[data-mobile-nav-toggle]');
  const panel = root.querySelector('[data-mobile-nav-panel]');
  if (!(nav instanceof HTMLElement) || !(toggle instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return;

  const closeNav = () => {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  };

  const openNav = () => {
    nav.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
  };

  toggle.addEventListener('click', () => {
    if (nav.classList.contains('is-open')) {
      closeNav();
    } else {
      openNav();
    }
  });

  panel.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeNav);
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Node)) return;
    if (!nav.contains(event.target)) closeNav();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeNav();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeNav();
  });
}
