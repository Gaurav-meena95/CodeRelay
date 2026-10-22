import { LeetCodeAdapter } from '../adapters/leetcode';
import { GfgAdapter } from '../adapters/gfg';
import { CodeChefAdapter } from '../adapters/codechef';
import { CodeforcesAdapter } from '../adapters/codeforces';
import { LeetCodeUI } from '../adapters/leetcode-ui';
import { BaseAdapter } from '../adapters/base-adapter';

const adapters: BaseAdapter[] = [
  new LeetCodeAdapter(),
  new GfgAdapter(),
  new CodeChefAdapter(),
  new CodeforcesAdapter()
];

let lastSubmissionId: string | number | null = null;

/**
 * Requests editor source code from the MAIN page context via CustomEvent bridge.
 */
async function queryMainWorldCode(): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 250);

    function handler(e: Event) {
      const detail = (e as CustomEvent).detail;
      cleanup();
      resolve(detail?.code || null);
    }

    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener('codeRelayCodeResponse', handler);
    }

    window.addEventListener('codeRelayCodeResponse', handler);
    window.dispatchEvent(new CustomEvent('codeRelayRequestCode'));
  });
}

let isProcessingSubmission = false;
let lastProcessedSubId: string | number | null = null;
let lastProcessedTime = 0;

/**
 * Handles submission processing and sends payload to background service worker.
 */
async function handleSubmission(adapter: BaseAdapter, submissionId: string | number, capturedCode?: string | null) {
  // Prevent duplicate concurrent executions or rapid duplicate events
  if (isProcessingSubmission) {
    console.log('[CodeRelay Content] Already processing a submission, skipping duplicate.');
    return;
  }

  if (lastProcessedSubId === submissionId && Date.now() - lastProcessedTime < 5000) {
    console.log('[CodeRelay Content] Duplicate submission event ignored:', submissionId);
    return;
  }

  // Guard against invalidated extension context (e.g. extension reloaded without page refresh)
  if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) {
    console.warn('[CodeRelay Content] Extension context was reloaded. Please refresh this tab.');
    LeetCodeUI.setState('error', 'Please refresh page');
    return;
  }

  isProcessingSubmission = true;
  lastProcessedSubId = submissionId;
  lastProcessedTime = Date.now();

  console.log(`[CodeRelay Content] Handling ${adapter.platform.toUpperCase()} submission ID:`, submissionId);
  LeetCodeUI.setState('loading', 'Pushing...');

  try {
    let finalCode = capturedCode;
    if (!finalCode) {
      finalCode = await queryMainWorldCode();
    }

    const result = await adapter.processSubmission(submissionId, finalCode);

    if (!result) {
      console.warn('[CodeRelay Content] Could not retrieve submission result');
      LeetCodeUI.setState('error', 'Details failed');
      return;
    }

    if (!result.accepted) {
      console.log('[CodeRelay Content] Submission not accepted:', result.statusDisplay);
      LeetCodeUI.setState('error', result.statusDisplay || 'Wrong Answer');
      return;
    }

    if (result.payload) {
      console.log('[CodeRelay Content] Sending submission to background for GitHub sync...');
      try {
        chrome.runtime.sendMessage(
          {
            type: 'SYNC_SUBMISSION',
            payload: result.payload
          },
          (response) => {
            if (chrome?.runtime?.lastError) {
              console.error('[CodeRelay Content] Chrome runtime error:', chrome.runtime.lastError.message);
              LeetCodeUI.setState('error', 'Please refresh page');
              return;
            }
            console.log('[CodeRelay Content] Background commit response:', response);
            if (response?.success) {
              LeetCodeUI.setState('success', 'Pushed');
            } else {
              console.error('[CodeRelay Content] GitHub Sync Error:', response?.error);
              LeetCodeUI.setState('error', response?.error || 'Push Failed');
            }
          }
        );
      } catch (sendErr: any) {
        console.error('[CodeRelay Content] SendMessage failed:', sendErr);
        LeetCodeUI.setState('error', 'Please refresh page');
      }
    }
  } catch (err: any) {
    console.error('[CodeRelay Content] Exception while processing submission:', err);
    LeetCodeUI.setState('error', err.message || 'Error');
  } finally {
    isProcessingSubmission = false;
  }
}

/**
 * Initializes listeners for intercepted submission events and sets up UI injection.
 */
function initContentScript() {
  console.log('[CodeRelay] Content script initialized on:', window.location.href);

  const currentUrl = window.location.href;
  const activeAdapter = adapters.find(adapter => adapter.canHandle(currentUrl));

  if (!activeAdapter) {
    return;
  }

  // Inject the Push button periodically to survive SPA navigation
  const tryInject = () => {
    if (activeAdapter.canHandle(window.location.href)) {
      LeetCodeUI.injectButton(() => {
        if (lastSubmissionId) {
          handleSubmission(activeAdapter, lastSubmissionId);
        } else {
          // Allow direct push of current editor content on any platform
          handleSubmission(activeAdapter, Date.now());
        }
      });
    }
  };

  tryInject();
  setInterval(tryInject, 1500);

  // Common event handler for submission events
  const onSubmissionEvent = (event: Event) => {
    const customEvent = event as CustomEvent<{ platform: string; submissionId: string | number; code?: string | null }>;
    const { platform, submissionId, code } = customEvent.detail || {};

    if (!submissionId) {
      return;
    }

    console.log('[CodeRelay] Caught submission event:', platform, submissionId, 'HasCode:', !!code);
    lastSubmissionId = submissionId;

    const targetAdapter = adapters.find(a => a.platform === platform) || activeAdapter;
    handleSubmission(targetAdapter, submissionId, code);
  };

  // DOM observer fallback for LeetCode, GFG, CodeChef, and Codeforces success verdicts
  let alreadySynced = false;
  const observer = new MutationObserver(() => {
    const text = document.body?.innerText || '';
    const lcResultEl = document.querySelector('[data-e2e-locator="submission-result"]');
    const hasLeetCodeAccepted = !!lcResultEl && (lcResultEl.textContent?.includes('Accepted') || false);
    const hasCfAccepted = !!document.querySelector('.verdict-accepted, [class*="verdict-accepted"]');

    const isSuccess = hasLeetCodeAccepted ||
                      hasCfAccepted ||
                      text.includes('Problem Solved Successfully') ||
                      text.includes('Correct Answer') ||
                      text.includes('100 pts');

    if (isSuccess && !alreadySynced) {
      alreadySynced = true;
      console.log(`[CodeRelay ${activeAdapter.platform.toUpperCase()}] Detected submission success in DOM!`);
      queryMainWorldCode().then(code => {
        handleSubmission(activeAdapter, lastSubmissionId || Date.now(), code);
      });
      setTimeout(() => {
        alreadySynced = false;
      }, 12000);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('codeRelaySubmission', onSubmissionEvent);
}

initContentScript();
