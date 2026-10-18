import { SubmissionPayload } from './types';
import { storage } from './storage';

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string;
  html_url: string;
}

export interface CommitResult {
  success: boolean;
  commitUrl?: string;
  error?: string;
}

/**
 * Encodes UTF-8 strings into Base64 supporting emojis and special characters.
 */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class GitHubService {
  private static BASE_URL = 'https://api.github.com';

  /**
   * Generates standard GitHub API request headers.
   */
  private static getHeaders(token: string): HeadersInit {
    const auth = token.startsWith('ghp_') ? `token ${token}` : `Bearer ${token}`;
    return {
      Authorization: auth,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Fetches authenticated user details to verify token validity.
   */
  static async getUser(token: string): Promise<GitHubUser> {
    const response = await fetch(`${this.BASE_URL}/user`, {
      headers: this.getHeaders(token)
    });

    if (!response.ok) {
      throw new Error(`GitHub Auth Failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetches list of repositories accessible by the user.
   */
  static async getUserRepos(token: string): Promise<GitHubRepo[]> {
    const response = await fetch(`${this.BASE_URL}/user/repos?sort=updated&per_page=100`, {
      headers: this.getHeaders(token)
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch repositories: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Retrieves SHA of an existing file in the repository to prevent 409 conflict.
   */
  static async getFileSha(token: string, repoFullName: string, filePath: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.BASE_URL}/repos/${repoFullName}/contents/${filePath}`, {
        headers: this.getHeaders(token)
      });

      if (response.status === 200) {
        const data = await response.json();
        return data.sha || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Commits or updates a file directly via GitHub REST API.
   */
  static async commitFile(
    token: string,
    repoFullName: string,
    filePath: string,
    content: string,
    commitMessage: string,
    existingSha?: string | null
  ): Promise<{ sha: string; html_url?: string }> {
    const contentBase64 = utf8ToBase64(content);

    let sha = existingSha;
    if (!sha) {
      sha = await this.getFileSha(token, repoFullName, filePath);
    }

    const payload: { message: string; content: string; sha?: string } = {
      message: commitMessage,
      content: contentBase64
    };

    if (sha) {
      payload.sha = sha;
    }

    const response = await fetch(`${this.BASE_URL}/repos/${repoFullName}/contents/${filePath}`, {
      method: 'PUT',
      headers: this.getHeaders(token),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Commit failed with status ${response.status}`);
    }

    const result = await response.json();
    return {
      sha: result.content.sha,
      html_url: result.commit?.html_url
    };
  }

  /**
   * Orchestrates committing both the solution code file and problem README.md.
   */
  static async syncSubmission(payload: SubmissionPayload): Promise<CommitResult> {
    const token = await storage.getAuthToken();
    if (!token) {
      return { success: false, error: 'GitHub token not found' };
    }

    const repoFullName = await storage.getSelectedRepo();
    if (!repoFullName) {
      return { success: false, error: 'Target repository not selected' };
    }

    const isEnabled = await storage.isSyncEnabled();
    if (!isEnabled) {
      return { success: false, error: 'Sync is disabled in settings' };
    }

    const platformFolder = payload.platform === 'leetcode' ? 'LeetCode' :
                           payload.platform === 'gfg' ? 'GeeksforGeeks' :
                           payload.platform === 'codeforces' ? 'Codeforces' : 'CodeChef';

    const problemFolder = `${platformFolder}/${payload.problemId ? `${payload.problemId}-` : ''}${payload.problemSlug}`;
    const codeFileName = `Solution.${payload.extension}`;
    const codeFilePath = `${problemFolder}/${codeFileName}`;
    const readmeFilePath = `${problemFolder}/README.md`;

    try {
      const cachedCodeSha = await storage.getFileSha(payload.problemSlug, codeFileName);
      const codeCommitMsg = `Sync solution: ${payload.title} [${payload.difficulty}] (${payload.runtime || ''}) - CodeRelay`;

      const codeResult = await this.commitFile(
        token,
        repoFullName,
        codeFilePath,
        payload.code,
        codeCommitMsg,
        cachedCodeSha
      );

      await storage.setFileSha(payload.problemSlug, codeFileName, codeResult.sha);

      const cachedReadmeSha = await storage.getFileSha(payload.problemSlug, 'README.md');
      const readmeCommitMsg = `Add README: ${payload.title} - CodeRelay`;

      const readmeResult = await this.commitFile(
        token,
        repoFullName,
        readmeFilePath,
        payload.descriptionMarkdown,
        readmeCommitMsg,
        cachedReadmeSha
      );

      await storage.setFileSha(payload.problemSlug, 'README.md', readmeResult.sha);
      await storage.incrementPlatformStat(payload.platform);

      return {
        success: true,
        commitUrl: codeResult.html_url
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Commit operation failed'
      };
    }
  }
}
