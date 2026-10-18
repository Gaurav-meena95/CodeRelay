import { LeetCodeAdapter } from '../adapters/leetcode';
import { LeetCodeUI } from '../adapters/leetcode-ui';
import { BaseAdapter } from '../adapters/base-adapter';

const adapters: BaseAdapter[] = [
  new LeetCodeAdapter()
];

let lastSubmissionId: string | number | null = null;

/**
 * Handles submission processing and sends payload to background service worker.
 */
async function handleSubmission(adapter: BaseAdapter, submissionId: string | number) {
  console.log('[CodeRelay Content] Handling submission ID:', submissionId);
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
          LeetCodeUI.setState('error', 'Submit first');
        }
      });
    }
  };

  tryInject();
  setInterval(tryInject, 1500);

  // Common event handler for submission events
  const onSubmissionEvent = (event: Event) => {
    const customEvent = event as CustomEvent<{ platform: string; submissionId: string | number }>;
    const { submissionId } = customEvent.detail || {};

    if (!submissionId) {
      return;
    }

    console.log('[CodeRelay] Caught submission event with ID:', submissionId);
    lastSubmissionId = submissionId;
    handleSubmission(activeAdapter, submissionId);
  };

  window.addEventListener('codeRelaySubmission', onSubmissionEvent);
  document.addEventListener('codeRelaySubmission', onSubmissionEvent);
}

initContentScript();
