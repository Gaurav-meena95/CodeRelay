import { storage } from '../core/storage';
import { GitHubService } from '../core/github';

/**
 * Initializes popup dashboard state, statistics and event listeners.
 */
async function initPopup() {
  const authState = document.getElementById('auth-state')!;
  const dashboardState = document.getElementById('dashboard-state')!;
  const connectionBadge = document.getElementById('connection-badge')!;

  const token = await storage.getAuthToken();
  const repo = await storage.getSelectedRepo();

  if (!token || !repo) {
    authState.classList.remove('hidden');
    dashboardState.classList.add('hidden');
    connectionBadge.textContent = 'Disconnected';
    connectionBadge.className = 'badge badge-disconnected';

    document.getElementById('btn-get-started')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html') });
    });
    return;
  }

  authState.classList.add('hidden');
  dashboardState.classList.remove('hidden');
  connectionBadge.textContent = 'Connected';
  connectionBadge.className = 'badge badge-connected';

  // Load User and Repo details
  const repoLink = document.getElementById('repo-link') as HTMLAnchorElement;
  repoLink.textContent = repo;
  repoLink.href = `https://github.com/${repo}`;

  try {
    const user = await GitHubService.getUser(token);
    const avatar = document.getElementById('user-avatar') as HTMLImageElement;
    const userName = document.getElementById('user-name')!;
    avatar.src = user.avatar_url;
    userName.textContent = user.login;
  } catch {
    // If token is invalid or rate limited, fallback gracefully
  }

  // Load and bind sync toggle
  const syncToggle = document.getElementById('sync-toggle') as HTMLInputElement;
  syncToggle.checked = await storage.isSyncEnabled();
  syncToggle.addEventListener('change', async () => {
    await storage.setSyncEnabled(syncToggle.checked);
  });

  // Load Statistics
  const stats = await storage.getStats();
  document.getElementById('stat-total')!.textContent = String(stats.total);
  document.getElementById('stat-leetcode')!.textContent = String(stats.leetcode);
  document.getElementById('stat-gfg')!.textContent = String(stats.gfg);
  document.getElementById('stat-cf')!.textContent = String(stats.codeforces);

  // Settings & Unlink actions
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html') });
  });

  document.getElementById('btn-unlink')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to disconnect CodeRelay from GitHub?')) {
      await storage.clearAll();
      window.location.reload();
    }
  });
}

document.addEventListener('DOMContentLoaded', initPopup);
