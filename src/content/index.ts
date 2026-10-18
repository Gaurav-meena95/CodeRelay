import { LeetCodeAdapter } from '../adapters/leetcode';
import { BaseAdapter } from '../adapters/base-adapter';

const adapters: BaseAdapter[] = [
  new LeetCodeAdapter()
];

/**
 * Initializes listeners for intercepted submission events on online judges.
 */
function initContentScript() {
  const currentUrl = window.location.href;
  const activeAdapter = adapters.find(adapter => adapter.canHandle(currentUrl));

  if (!activeAdapter) {
    return;
  }

  window.addEventListener('codeRelaySubmission', async (event: Event) => {
    const customEvent = event as CustomEvent<{ platform: string; submissionId: string | number }>;
    const { submissionId } = customEvent.detail || {};

    if (!submissionId) {
      return;
    }

    try {
      const payload = await activeAdapter.processSubmission(submissionId);

      if (payload) {
        chrome.runtime.sendMessage({
          type: 'SYNC_SUBMISSION',
          payload
        });
      }
    } catch {
      // Gracefully handle scraping or network exceptions
    }
  });
}

initContentScript();
