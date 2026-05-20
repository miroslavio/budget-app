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
  toggleConditionalSections();
  wireDetailsActions();
  wireEnterSubmit();
  wireAutoSubmit();
  wireModals();
});

function wireModals(root = document) {
  root.querySelectorAll('[data-open-modal]').forEach((button) => {
    button.addEventListener('click', () => {
      const dialog = document.getElementById(button.dataset.openModal);
      if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
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
