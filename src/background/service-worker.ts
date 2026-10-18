import { GitHubService } from '../core/github';
import { storage } from '../core/storage';
import { SubmissionPayload } from '../core/types';

/**
 * Handles extension installation and launches onboarding if unconfigured.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const token = await storage.getAuthToken();
    const repo = await storage.getSelectedRepo();

    if (!token || !repo) {
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/welcome/welcome.html')
      });
    }
  }
});

/**
 * Temporarily displays a status badge on the extension icon.
 */
function showStatusBadge(text: string, color: string) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });

  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 5000);
}

/**
 * Central message broker handling submission sync and status queries.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SYNC_SUBMISSION') {
    const payload = message.payload as SubmissionPayload;
    console.log('[CodeRelay Background] Received submission payload for:', payload.title, payload.platform);

    GitHubService.syncSubmission(payload)
      .then(result => {
        console.log('[CodeRelay Background] GitHub sync result:', result);
        if (result.success) {
          showStatusBadge('✓', '#10b981');
        } else {
          showStatusBadge('!', '#ef4444');
        }
        sendResponse(result);
      })
      .catch(err => {
        console.error('[CodeRelay Background] Error during syncSubmission:', err);
        showStatusBadge('!', '#ef4444');
        sendResponse({ success: false, error: err.message });
      });

    return true;
  }

  if (message.type === 'TEST_CONNECTION') {
    storage.getAuthToken()
      .then(async token => {
        if (!token) {
          return sendResponse({ success: false, error: 'No token found' });
        }
        const user = await GitHubService.getUser(token);
        sendResponse({ success: true, user });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });

    return true;
  }

  return false;
});
