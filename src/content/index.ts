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
const processedSubmissions = new Set<string | number>();
let lastProcessedTime = 0;

/**
 * Handles submission processing and sends payload to background service worker.
 */
async function handleSubmission(adapter: BaseAdapter, submissionId: string | number, capturedCode?: string | null) {
  // Prevent duplicate concurrent executions
  if (isProcessingSubmission) {
    console.log('[CodeRelay Content] Already processing a submission, skipping duplicate.');
    return;
  }

  // Strictly prevent re-processing an already handled submission ID
  if (processedSubmissions.has(submissionId)) {
    console.log('[CodeRelay Content] Submission ID already handled, skipping:', submissionId);
    return;
  }

  // Guard against rapid repetitive triggers within 2 seconds
  if (Date.now() - lastProcessedTime < 2000) {
    console.log('[CodeRelay Content] Rapid trigger debounced:', submissionId);
    return;
  }

  // Guard against invalidated extension context (e.g. extension reloaded without page refresh)
  if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) {
    console.warn('[CodeRelay Content] Extension context was reloaded. Please refresh this tab.');
    LeetCodeUI.setState('error', 'Please refresh page');
    return;
  }

  isProcessingSubmission = true;
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

    // Submission was evaluated and is NOT Accepted (e.g. Wrong Answer, Compile Error, TLE)
    if (!result.accepted) {
      processedSubmissions.add(submissionId);
      console.log('[CodeRelay Content] Submission NOT accepted:', result.statusDisplay);
      LeetCodeUI.setState('error', result.statusDisplay || 'Not Accepted');
      return;
    }

    if (result.payload) {
      console.log('[CodeRelay Content] Submission verified ACCEPTED. Sending to background for GitHub sync...');
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
              processedSubmissions.add(submissionId);
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

  let currentUrl = window.location.href;
  const activeAdapter = adapters.find(adapter => adapter.canHandle(currentUrl));

  if (!activeAdapter) {
    return;
  }

  // Inject the Push button periodically to survive SPA navigation
  const tryInject = () => {
    if (activeAdapter.canHandle(window.location.href)) {
      LeetCodeUI.injectButton(() => {
        if (lastSubmissionId && !processedSubmissions.has(lastSubmissionId)) {
          handleSubmission(activeAdapter, lastSubmissionId);
        } else {
          // Manual push of current editor content
          handleSubmission(activeAdapter, `manual_${Date.now()}`);
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

  // DOM observer fallback ONLY for non-LeetCode platforms (GFG, CodeChef, Codeforces)
  // LeetCode uses 100% reliable network interception and must NOT be triggered by generic DOM changes.
  let alreadySynced = false;
  if (activeAdapter.platform !== 'leetcode') {
    const observer = new MutationObserver(() => {
      const text = document.body?.innerText || '';
      const hasCfAccepted = !!document.querySelector('.verdict-accepted, [class*="verdict-accepted"]');

      const isSuccess = hasCfAccepted ||
                        text.includes('Problem Solved Successfully') ||
                        text.includes('Correct Answer') ||
                        text.includes('100 pts');

      if (isSuccess && !alreadySynced) {
        alreadySynced = true;
        console.log(`[CodeRelay ${activeAdapter.platform.toUpperCase()}] Detected submission success in DOM!`);
        queryMainWorldCode().then(code => {
          handleSubmission(activeAdapter, lastSubmissionId || `dom_${Date.now()}`, code);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Watch for SPA URL navigation to reset problem-specific sync states
  setInterval(() => {
    if (window.location.href !== currentUrl) {
      console.log('[CodeRelay] SPA navigation detected from', currentUrl, 'to', window.location.href);
      currentUrl = window.location.href;
      lastSubmissionId = null;
      alreadySynced = false;
    }
  }, 1000);

  window.addEventListener('codeRelaySubmission', onSubmissionEvent);
}

initContentScript();
