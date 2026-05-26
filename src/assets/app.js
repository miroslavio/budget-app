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

function wireViewToggles(root = document) {
  root.querySelectorAll('[data-view-toggle-group]').forEach((group) => {
    const buttons = [...group.querySelectorAll('[data-view-toggle][data-view-value]')];
    if (!buttons.length) return;

    const targetName = buttons[0].getAttribute('data-view-toggle');
    if (!targetName) return;

    const panels = [...root.querySelectorAll(`[data-view-panel="${targetName}"][data-view-value]`)];
    if (!panels.length) return;

    const activate = (value) => {
      buttons.forEach((button) => {
        const isActive = button.getAttribute('data-view-value') === value;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      panels.forEach((panel) => {
        panel.hidden = panel.getAttribute('data-view-value') !== value;
      });
    };

    buttons.forEach((button) => {
      if (button.dataset.viewToggleBound === 'true') return;
      button.dataset.viewToggleBound = 'true';
      button.addEventListener('click', () => activate(button.getAttribute('data-view-value') || ''));
    });

    const defaultButton = buttons.find((button) => button.classList.contains('active')) || buttons[0];
    activate(defaultButton.getAttribute('data-view-value') || '');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  refreshConditionalSections();
  wireDetailsActions();
  wireEnterSubmit();
  wireAutoSubmit();
  wireViewToggles();
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
          const arrayField = dialog.querySelector(`[data-modal-field-array="${normalisedKey}"]`);
          if (!field && arrayField instanceof HTMLElement) {
            const selectedValues = new Set(String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean));
            arrayField.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
              if (checkbox instanceof HTMLInputElement) {
                checkbox.checked = selectedValues.has(checkbox.value);
              }
            });
            return;
          }
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

    input.addEventListener(
      'wheel',
      (event) => {
        if (document.activeElement !== input) return;

        event.preventDefault();
        input.blur();
        scrollWheelTarget(input, event.deltaX, event.deltaY);
      },
      { passive: false }
    );

    input.addEventListener('input', sanitise);
    input.addEventListener('paste', () => window.setTimeout(sanitise, 0));
    sanitise();
  });
}

function scrollWheelTarget(input, deltaX, deltaY) {
  const container = findScrollableAncestor(input);
  if (container) {
    container.scrollBy({ left: deltaX, top: deltaY, behavior: 'auto' });
    return;
  }

  window.scrollBy({ left: deltaX, top: deltaY, behavior: 'auto' });
}

function findScrollableAncestor(element) {
  let current = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const canScrollY = /(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight;
    const canScrollX = /(auto|scroll)/.test(style.overflowX) && current.scrollWidth > current.clientWidth;
    if (canScrollY || canScrollX) return current;
    current = current.parentElement;
  }
  return null;
}

function wireSplitSliders(root = document) {
  root.querySelectorAll('[data-split-slider]').forEach((slider) => {
    if (!(slider instanceof HTMLInputElement)) return;
    const container = slider.closest('.split-slider-card');
    if (!(container instanceof HTMLElement)) return;

    const secondaryInput = container.querySelector('[data-split-secondary-input]');
    const primaryOutput = container.querySelector('[data-split-primary-output]');
    const secondaryOutput = container.querySelector('[data-split-secondary-output]');
    const primaryAmount = container.querySelector('[data-split-primary-amount]');
    const secondaryAmount = container.querySelector('[data-split-secondary-amount]');
    const amountInput = slider.form?.querySelector('[data-split-amount-source]');

    const sync = () => {
      let primary = Number(slider.value || '50');
      if (!Number.isFinite(primary)) primary = 50;
      primary = Math.min(100, Math.max(0, Math.round(primary * 100) / 100));
      const secondary = Math.round((100 - primary) * 100) / 100;
      const totalAmount = amountInput instanceof HTMLInputElement ? Number.parseFloat(String(amountInput.value || '0').replace(/,/g, '.')) || 0 : 0;
      const primaryAmountValue = totalAmount * (primary / 100);
      const secondaryAmountValue = totalAmount * (secondary / 100);

      slider.value = String(primary);
      slider.style.setProperty('--split-value', `${primary}%`);
      if (secondaryInput instanceof HTMLInputElement) secondaryInput.value = String(secondary);
      if (primaryOutput instanceof HTMLElement) primaryOutput.textContent = formatSplitPercent(primary);
      if (secondaryOutput instanceof HTMLElement) secondaryOutput.textContent = formatSplitPercent(secondary);
      if (primaryAmount instanceof HTMLElement) primaryAmount.textContent = formatSplitCurrency(primaryAmountValue);
      if (secondaryAmount instanceof HTMLElement) secondaryAmount.textContent = formatSplitCurrency(secondaryAmountValue);
    };

    if (slider.dataset.splitBound !== 'true') {
      slider.dataset.splitBound = 'true';
      slider.addEventListener('input', sync);
      slider.addEventListener('change', sync);
      if (amountInput instanceof HTMLInputElement) {
        amountInput.addEventListener('input', sync);
        amountInput.addEventListener('change', sync);
      }
    }

    sync();
  });
}

function formatSplitPercent(value) {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}%`;
  return `${String(rounded).replace(/(?:\\.0+|(\\.\\d+?)0+)$/, '$1')}%`;
}

function formatSplitCurrency(value) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function wireTransactionCategorySelects(root = document) {
  root.querySelectorAll('select[data-transaction-category-select]').forEach((select) => {
    if (!(select instanceof HTMLSelectElement)) return;
    const group = select.closest('[data-transaction-category-group]');
    const form = select.closest('form');
    const typeSelect = group?.querySelector('[data-transaction-type-select]') || form?.querySelector('[data-transaction-type-select]');
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
