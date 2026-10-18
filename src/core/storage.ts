import { CONFIG } from './config';
import { PlatformStats, SupportedPlatform } from './types';

export interface StorageData {
  [CONFIG.STORAGE_KEYS.AUTH_TOKEN]?: string;
  [CONFIG.STORAGE_KEYS.USERNAME]?: string;
  [CONFIG.STORAGE_KEYS.SELECTED_REPO]?: string;
  [CONFIG.STORAGE_KEYS.CUSTOM_FOLDER]?: string;
  [CONFIG.STORAGE_KEYS.SYNC_ENABLED]?: boolean;
  [CONFIG.STORAGE_KEYS.STATS]?: PlatformStats;
  coderelay_shas?: Record<string, Record<string, string>>; // { [problemSlug]: { [fileName]: sha } }
}

const DEFAULT_STATS: PlatformStats = {
  leetcode: 0,
  gfg: 0,
  codeforces: 0,
  codechef: 0,
  total: 0
};

export const storage = {
  /**
   * Retrieves the stored GitHub access token or PAT
   */
  async getAuthToken(): Promise<string | null> {
    const data = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.AUTH_TOKEN);
    return data[CONFIG.STORAGE_KEYS.AUTH_TOKEN] || null;
  },

  /**
   * Saves the GitHub access token
   */
  async setAuthToken(token: string): Promise<void> {
    await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.AUTH_TOKEN]: token });
  },

  /**
   * Retrieves the logged-in GitHub username
   */
  async getUsername(): Promise<string | null> {
    const data = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.USERNAME);
    return data[CONFIG.STORAGE_KEYS.USERNAME] || null;
  },

  /**
   * Saves the logged-in GitHub username
   */
  async setUsername(username: string): Promise<void> {
    await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.USERNAME]: username });
  },

  /**
   * Retrieves the user's selected repository (e.g. "username/leetcode-solutions")
   */
  async getSelectedRepo(): Promise<string | null> {
    const data = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.SELECTED_REPO);
    return data[CONFIG.STORAGE_KEYS.SELECTED_REPO] || null;
  },

  /**
   * Saves the chosen target repository
   */
  async setSelectedRepo(repoFullName: string): Promise<void> {
    await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.SELECTED_REPO]: repoFullName });
  },

  /**
   * Checks whether automatic sync is enabled by the user
   */
  async isSyncEnabled(): Promise<boolean> {
    const data = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.SYNC_ENABLED);
    // Defaults to true if not explicitly set
    return data[CONFIG.STORAGE_KEYS.SYNC_ENABLED] !== false;
  },

  /**
   * Toggles automatic sync on or off
   */
  async setSyncEnabled(enabled: boolean): Promise<void> {
    await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.SYNC_ENABLED]: enabled });
  },

  /**
   * Retrieves sync statistics across all platforms
   */
  async getStats(): Promise<PlatformStats> {
    const data = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.STATS);
    return data[CONFIG.STORAGE_KEYS.STATS] || { ...DEFAULT_STATS };
  },

  /**
   * Increments the problem solved count for a specific platform
   */
  async incrementPlatformStat(platform: SupportedPlatform): Promise<PlatformStats> {
    const currentStats = await this.getStats();
    currentStats[platform] = (currentStats[platform] || 0) + 1;
    currentStats.total = (currentStats.total || 0) + 1;

    await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.STATS]: currentStats });
    return currentStats;
  },

  /**
   * Gets the cached GitHub commit SHA of a file to allow updating without 409 conflict
   */
  async getFileSha(problemSlug: string, fileName: string): Promise<string | null> {
    const data = await chrome.storage.local.get('coderelay_shas');
    const shas = data.coderelay_shas || {};
    return shas[problemSlug]?.[fileName] || null;
  },

  /**
   * Saves or updates the GitHub file SHA after a successful commit
   */
  async setFileSha(problemSlug: string, fileName: string, sha: string): Promise<void> {
    const data = await chrome.storage.local.get('coderelay_shas');
    const shas = data.coderelay_shas || {};
    if (!shas[problemSlug]) {
      shas[problemSlug] = {};
    }
    shas[problemSlug][fileName] = sha;
    await chrome.storage.local.set({ coderelay_shas: shas });
  },

  /**
   * Clears all session data (used for logout)
   */
  async clearAll(): Promise<void> {
    await chrome.storage.local.clear();
  }
};
