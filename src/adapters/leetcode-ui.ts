/**
 * Manages the Push button and status indicators (spinner, green tick, red cross) inside LeetCode.
 */
export class LeetCodeUI {
  private static BUTTON_ID = 'coderelay-push-btn';
  private static SPINNER_ID = 'coderelay-spinner';
  private static statusTimeout: any = null;

  /**
   * Injects CSS styles for the button, spinner, and checkmark.
   */
  static injectStyles() {
    if (document.getElementById('coderelay-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'coderelay-styles';
    style.textContent = `
      #${this.BUTTON_ID} {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        height: 32px !important;
        padding: 0 12px !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        font-family: inherit !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        background: rgba(255, 255, 255, 0.08) !important;
        color: #eff1f6 !important;
        border: 1px solid rgba(255, 255, 255, 0.16) !important;
        margin-left: 8px !important;
        margin-right: 0 !important;
        z-index: 10 !important;
        line-height: 1 !important;
        box-sizing: border-box !important;
        user-select: none !important;
        vertical-align: middle !important;
        white-space: nowrap !important;
      }
      #${this.BUTTON_ID}:hover {
        background: rgba(255, 255, 255, 0.16) !important;
        border-color: rgba(255, 255, 255, 0.28) !important;
        color: #ffffff !important;
      }
      #${this.BUTTON_ID}:active {
        transform: scale(0.97) !important;
      }
      #${this.BUTTON_ID}.coderelay-success {
        border-color: rgba(16, 185, 129, 0.4) !important;
        color: #10b981 !important;
        background: rgba(16, 185, 129, 0.12) !important;
      }
      #${this.BUTTON_ID}.coderelay-error {
        border-color: rgba(239, 68, 68, 0.4) !important;
        color: #ef4444 !important;
        background: rgba(239, 68, 68, 0.12) !important;
      }
      #${this.BUTTON_ID}.coderelay-loading {
        border-color: rgba(56, 189, 248, 0.4) !important;
        color: #38bdf8 !important;
        background: rgba(56, 189, 248, 0.12) !important;
      }
      .${this.SPINNER_ID} {
        width: 14px !important;
        height: 14px !important;
        border: 2px solid transparent !important;
        border-top-color: currentColor !important;
        border-radius: 50% !important;
        animation: coderelay-spin 0.8s linear infinite !important;
        display: inline-block !important;
      }
      @keyframes coderelay-spin {
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Injects the Push button into LeetCode or other platform code editor toolbar.
   */
  static injectButton(onClick: () => void) {
    if (document.getElementById(this.BUTTON_ID)) {
      return;
    }

    this.injectStyles();

    // Priority 1: LeetCode Submit Button -> inject directly AFTER Submit button to preserve Run/Submit pairing
    const leetCodeSubmit = document.querySelector(
      '[data-e2e-locator="console-submit-button"], button[data-cy="submit-code-btn"]'
    );
    if (leetCodeSubmit) {
      const btn = this.createButtonElement(onClick);
      leetCodeSubmit.insertAdjacentElement('afterend', btn);
      return;
    }

    // Priority 2: GFG / CodeChef / Codeforces Submit or Run Button
    const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"], input.submit'));
    const actionBtn = allButtons.find(b => {
      const txt = (b.textContent || (b as HTMLInputElement).value || '').trim().toLowerCase();
      return txt === 'submit' || txt === 'compile & run' || txt === 'compile' || txt === 'run';
    });
    if (actionBtn && actionBtn.parentElement) {
      const btn = this.createButtonElement(onClick);
      // Place after action button so Run & Submit remain visually grouped
      actionBtn.insertAdjacentElement('afterend', btn);
      return;
    }

    // Priority 3: GFG / CodeChef Compiler Bar / IDE Header / Codeforces Header
    const actionToolbar = document.querySelector(
      '[class*="compiler_actions"], [class*="compile_run"], .compiler-button-wrapper, [class*="problem-tab__actions"], [class*="ide-header"], [class*="editor-actions"], .problems_header_content__title, .problem-statement .header .title'
    );
    if (actionToolbar) {
      const btn = this.createButtonElement(onClick);
      actionToolbar.appendChild(btn);
      return;
    }

    // Priority 4: Toolbar right-side actions (.ml-auto or buttons container)
    const rightActions = document.querySelector('.ml-auto, [class*="ml-auto"]');
    if (rightActions) {
      const btn = this.createButtonElement(onClick);
      rightActions.prepend(btn);
      return;
    }

    // Priority 5: Next to language picker (LeetCode or GFG)
    const langPicker = document.querySelector('button[id^="headlessui-listbox-button"], .select-language, [class*="language-select"]');
    if (langPicker && langPicker.parentElement) {
      const btn = this.createButtonElement(onClick);
      langPicker.parentElement.appendChild(btn);
      return;
    }
  }

  private static createButtonElement(onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = this.BUTTON_ID;
    btn.title = 'CodeRelay: Click to push solution to GitHub';
    btn.innerHTML = `
      <span id="coderelay-icon" style="display:inline-flex;align-items:center;">⚡</span>
      <span id="coderelay-text">Push</span>
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });

    return btn;
  }

  /**
   * Sets the visual state of the Push button.
   */
  static setState(state: 'idle' | 'loading' | 'success' | 'error', text?: string) {
    const btn = document.getElementById(this.BUTTON_ID);
    if (!btn) {
      return;
    }

    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout);
      this.statusTimeout = null;
    }

    const iconSpan = btn.querySelector('#coderelay-icon') as HTMLElement;
    const textSpan = btn.querySelector('#coderelay-text') as HTMLElement;

    btn.className = '';

    if (state === 'loading') {
      btn.style.pointerEvents = 'none';
      iconSpan.innerHTML = `<div class="${this.SPINNER_ID}"></div>`;
      textSpan.textContent = text || 'Pushing...';
    } else if (state === 'success') {
      btn.classList.add('coderelay-success');
      btn.style.pointerEvents = 'auto';
      // Green checkmark
      iconSpan.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      textSpan.textContent = text || 'Pushed';

      this.statusTimeout = setTimeout(() => {
        this.setState('idle');
      }, 5000);
    } else if (state === 'error') {
      btn.classList.add('coderelay-error');
      btn.style.pointerEvents = 'auto';
      // Red cross
      iconSpan.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
      textSpan.textContent = text || 'Failed';

      this.statusTimeout = setTimeout(() => {
        this.setState('idle');
      }, 5000);
    } else {
      btn.style.pointerEvents = 'auto';
      iconSpan.textContent = '⚡';
      textSpan.textContent = 'Push';
    }
  }
}
