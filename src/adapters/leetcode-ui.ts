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
        gap: 6px !important;
        padding: 4px 10px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        background: rgba(255, 255, 255, 0.08) !important;
        color: #eff1f6 !important;
        border: 1px solid rgba(255, 255, 255, 0.16) !important;
        margin-right: 8px !important;
        margin-left: 8px !important;
        z-index: 10 !important;
        line-height: 1.2 !important;
      }
      #${this.BUTTON_ID}:hover {
        background: rgba(255, 255, 255, 0.18) !important;
        border-color: rgba(255, 255, 255, 0.3) !important;
      }
      #${this.BUTTON_ID}.coderelay-success {
        border-color: #10b981 !important;
        color: #10b981 !important;
        background: rgba(16, 185, 129, 0.16) !important;
      }
      #${this.BUTTON_ID}.coderelay-error {
        border-color: #ef4444 !important;
        color: #ef4444 !important;
        background: rgba(239, 68, 68, 0.16) !important;
      }
      .${this.SPINNER_ID} {
        width: 12px !important;
        height: 12px !important;
        border: 2px solid transparent !important;
        border-top-color: #38bdf8 !important;
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
   * Injects the Push button into LeetCode's code editor toolbar.
   */
  static injectButton(onClick: () => void) {
    if (document.getElementById(this.BUTTON_ID)) {
      return;
    }

    this.injectStyles();

    // Priority 1: Toolbar right-side actions (.ml-auto or buttons container)
    const rightActions = document.querySelector('.ml-auto, [class*="ml-auto"]');
    if (rightActions) {
      const btn = this.createButtonElement(onClick);
      rightActions.prepend(btn);
      return;
    }

    // Priority 2: GeeksforGeeks Submit or Compile Button
    const allButtons = Array.from(document.querySelectorAll('button'));
    const gfgActionBtn = allButtons.find(b => {
      const txt = (b.textContent || '').trim().toLowerCase();
      return txt === 'submit' || txt === 'compile & run' || txt === 'compile';
    });
    if (gfgActionBtn && gfgActionBtn.parentElement) {
      const btn = this.createButtonElement(onClick);
      gfgActionBtn.parentElement.insertBefore(btn, gfgActionBtn);
      return;
    }

    // Priority 2b: GeeksforGeeks Compiler Bar / Toolbar Container
    const gfgBar = document.querySelector('[class*="compiler_actions"], [class*="compile_run"], .compiler-button-wrapper, [class*="problem-tab__actions"], .problems_header_content__title');
    if (gfgBar) {
      const btn = this.createButtonElement(onClick);
      gfgBar.appendChild(btn);
      return;
    }

    // Priority 3: Next to language picker (LeetCode or GFG)
    const langPicker = document.querySelector('button[id^="headlessui-listbox-button"], .select-language, [class*="language-select"]');
    if (langPicker && langPicker.parentElement) {
      const btn = this.createButtonElement(onClick);
      langPicker.parentElement.appendChild(btn);
      return;
    }

    // Priority 4: Note button or settings icon
    const noteBtn = document.querySelector('button[aria-label="Save note"]') || document.querySelector('button[aria-label="Shortcuts"]');
    if (noteBtn && noteBtn.parentElement) {
      const btn = this.createButtonElement(onClick);
      noteBtn.parentElement.prepend(btn);
      return;
    }
  }

  private static createButtonElement(onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.id = this.BUTTON_ID;
    btn.title = 'CodeRelay: Click to push solution to GitHub';
    btn.innerHTML = `
      <span id="coderelay-icon">⚡</span>
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
