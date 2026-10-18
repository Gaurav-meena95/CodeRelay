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
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 8px;
        font-size: 12px;
        font-weight: 500;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        background: rgba(255, 255, 255, 0.08);
        color: #eff1f6;
        border: 1px solid rgba(255, 255, 255, 0.12);
        margin-right: 6px;
      }
      #${this.BUTTON_ID}:hover {
        background: rgba(255, 255, 255, 0.15);
      }
      #${this.BUTTON_ID}.coderelay-success {
        border-color: #10b981;
        color: #10b981;
        background: rgba(16, 185, 129, 0.12);
      }
      #${this.BUTTON_ID}.coderelay-error {
        border-color: #ef4444;
        color: #ef4444;
        background: rgba(239, 68, 68, 0.12);
      }
      .${this.SPINNER_ID} {
        width: 13px;
        height: 13px;
        border: 2px solid transparent;
        border-top-color: #38bdf8;
        border-radius: 50%;
        animation: coderelay-spin 0.8s linear infinite;
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

    // Look for target toolbar containers across various LeetCode versions
    const selectors = [
      'button[aria-label="Save note"]',
      'button[id^="headlessui-listbox-button"]',
      '.ml-auto',
      '[class*="ml-auto"]',
      'div[class*="flex items-center gap-1"]'
    ];

    let targetContainer: HTMLElement | null = null;

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        if (el.tagName === 'BUTTON') {
          targetContainer = el.parentElement as HTMLElement;
        } else {
          targetContainer = el as HTMLElement;
        }
        break;
      }
    }

    if (!targetContainer) {
      return;
    }

    const btn = document.createElement('button');
    btn.id = this.BUTTON_ID;
    btn.title = 'CodeRelay: Click to sync with GitHub';
    btn.innerHTML = `
      <span id="coderelay-icon">⚡</span>
      <span id="coderelay-text">Push</span>
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      onClick();
    });

    targetContainer.prepend(btn);
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
      }, 4500);
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
      }, 4500);
    } else {
      btn.style.pointerEvents = 'auto';
      iconSpan.textContent = '⚡';
      textSpan.textContent = 'Push';
    }
  }
}
