import { LeetCodeAdapter } from '../adapters/leetcode';
import { GfgAdapter } from '../adapters/gfg';
import { LeetCodeUI } from '../adapters/leetcode-ui';
import { BaseAdapter } from '../adapters/base-adapter';

const adapters: BaseAdapter[] = [
  new LeetCodeAdapter(),
  new GfgAdapter()
];

let lastSubmissionId: string | number | null = null;

/**
 * Handles submission processing and sends payload to background service worker.
 */
async function handleSubmission(adapter: BaseAdapter, submissionId: string | number) {
  console.log(`[CodeRelay Content] Handling ${adapter.platform.toUpperCase()} submission ID:`, submissionId);
  LeetCodeUI.setState('loading', 'Pushing...');

  try {
    const result = await adapter.processSubmission(submissionId);

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
      chrome.runtime.sendMessage(
        {
          type: 'SYNC_SUBMISSION',
          payload: result.payload
        },
        (response) => {
          console.log('[CodeRelay Content] Background commit response:', response);
          if (response?.success) {
            LeetCodeUI.setState('success', 'Pushed');
          } else {
            console.error('[CodeRelay Content] GitHub Sync Error:', response?.error);
            LeetCodeUI.setState('error', response?.error || 'Push Failed');
          }
        }
      );
    }
  } catch (err: any) {
    console.error('[CodeRelay Content] Exception while processing submission:', err);
    LeetCodeUI.setState('error', err.message || 'Error');
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
          // On GFG or LeetCode, allow direct push of current editor content
          handleSubmission(activeAdapter, Date.now());
        }
      });
    }
  };

  tryInject();
  setInterval(tryInject, 1500);

  // Common event handler for submission events
  const onSubmissionEvent = (event: Event) => {
    const customEvent = event as CustomEvent<{ platform: string; submissionId: string | number }>;
    const { platform, submissionId } = customEvent.detail || {};

    if (!submissionId) {
      return;
    }

    console.log('[CodeRelay] Caught submission event:', platform, submissionId);
    lastSubmissionId = submissionId;

    const targetAdapter = adapters.find(a => a.platform === platform) || activeAdapter;
    handleSubmission(targetAdapter, submissionId);
  };

  // DOM observer fallback for GFG success banner
  if (activeAdapter.platform === 'gfg') {
    let alreadySynced = false;
    const observer = new MutationObserver(() => {
      const text = document.body?.innerText || '';
      if (text.includes('Problem Solved Successfully') || text.includes('Correct Answer')) {
        if (!alreadySynced) {
          alreadySynced = true;
          console.log('[CodeRelay GFG] Detected Problem Solved Successfully banner in DOM!');
          handleSubmission(activeAdapter, Date.now());
          setTimeout(() => {
            alreadySynced = false;
          }, 12000);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.addEventListener('codeRelaySubmission', onSubmissionEvent);
  document.addEventListener('codeRelaySubmission', onSubmissionEvent);
}

initContentScript();
