import { LeetCodeAdapter } from '../adapters/leetcode';
import { LeetCodeUI } from '../adapters/leetcode-ui';
import { BaseAdapter } from '../adapters/base-adapter';

const adapters: BaseAdapter[] = [
  new LeetCodeAdapter()
];

let lastSubmissionId: string | number | null = null;

/**
 * Handles submission processing and updates the Push button visual indicator.
 */
async function handleSubmission(adapter: BaseAdapter, submissionId: string | number) {
  LeetCodeUI.setState('loading', 'Pushing...');

  try {
    const result = await adapter.processSubmission(submissionId);

    if (!result) {
      LeetCodeUI.setState('error', 'Failed');
      return;
    }

    if (!result.accepted) {
      // Wrong answer, TLE, Compile Error -> Show red cross
      LeetCodeUI.setState('error', result.statusDisplay || 'Failed');
      return;
    }

    if (result.payload) {
      chrome.runtime.sendMessage(
        {
          type: 'SYNC_SUBMISSION',
          payload: result.payload
        },
        (response) => {
          if (response?.success) {
            // Correct and synced to GitHub -> Show green tick!
            LeetCodeUI.setState('success', 'Pushed');
          } else {
            LeetCodeUI.setState('error', 'Push Failed');
          }
        }
      );
    }
  } catch {
    LeetCodeUI.setState('error', 'Error');
  }
}

/**
 * Initializes listeners for intercepted submission events and sets up UI injection.
 */
function initContentScript() {
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

  // Listen for submission events triggered by the interceptor
  window.addEventListener('codeRelaySubmission', async (event: Event) => {
    const customEvent = event as CustomEvent<{ platform: string; submissionId: string | number }>;
    const { submissionId } = customEvent.detail || {};

    if (!submissionId) {
      return;
    }

    lastSubmissionId = submissionId;
    handleSubmission(activeAdapter, submissionId);
  });
}

initContentScript();
