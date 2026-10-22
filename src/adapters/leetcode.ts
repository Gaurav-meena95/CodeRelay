import { BaseAdapter, SubmissionResult } from './base-adapter';
import { ProblemDifficulty, SubmissionPayload } from '../core/types';

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  csharp: 'cs',
  'c#': 'cs',
  java: 'java',
  python: 'py',
  python3: 'py',
  javascript: 'js',
  typescript: 'ts',
  golang: 'go',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  kotlin: 'kt',
  swift: 'swift',
  scala: 'scala',
  php: 'php',
  mysql: 'sql',
  mssql: 'sql',
  oracle: 'sql',
  postgresql: 'sql',
  bash: 'sh',
  dart: 'dart'
};

const STATUS_MAP: Record<number, string> = {
  10: 'Accepted',
  11: 'Wrong Answer',
  12: 'Memory Limit',
  13: 'Output Limit',
  14: 'Time Limit',
  15: 'Memory Limit',
  16: 'Compile Error',
  20: 'Compile Error',
  21: 'Runtime Error'
};

export class LeetCodeAdapter implements BaseAdapter {
  platform = 'leetcode' as const;

  /**
   * Identifies whether the current page belongs to LeetCode.
   */
  canHandle(url: string): boolean {
    return url.includes('leetcode.com') || url.includes('leetcode.cn');
  }

  /**
   * Extracts csrf token from document.cookie for authenticated GraphQL requests.
   */
  private getCsrfToken(): string | null {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : null;
  }

  /**
   * Extracts the problem slug from URL pathname (/problems/{slug}/...).
   */
  private getProblemSlug(): string {
    const match = window.location.pathname.match(/\/problems\/([^/]+)/);
    return match ? match[1] : '';
  }

  /**
   * Reads selected programming language and extension from editor toolbar DOM.
   */
  private getSelectedLanguage(): { name: string; ext: string } {
    const langBtn = document.querySelector(
      'button[id^="headlessui-listbox-button"], [data-cy="lang-select"], [class*="select-language"]'
    );
    const text = (langBtn?.textContent || '').trim();
    const lower = text.toLowerCase();

    for (const [key, ext] of Object.entries(LANGUAGE_EXTENSIONS)) {
      if (lower === key || lower.startsWith(key) || lower.includes(key)) {
        return { name: text || key, ext };
      }
    }
    return { name: text || 'Python3', ext: 'py' };
  }

  /**
   * Converts raw HTML problem description to clean Markdown formatting.
   */
  private htmlToMarkdown(html: string): string {
    return html
      .replace(/<pre>[\s\S]*?<\/pre>/gi, match => {
        const text = match.replace(/<\/?pre>/gi, '').replace(/<\/?code>/gi, '');
        return `\n\`\`\`\n${text.trim()}\n\`\`\`\n`;
      })
      .replace(/<code>(.*?)<\/code>/gi, '`$1`')
      .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i>(.*?)<\/i>/gi, '*$1*')
      .replace(/<p>/gi, '\n\n')
      .replace(/<\/p>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<ul>/gi, '\n')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  /**
   * Generates formatted README markdown containing stats, problem link and description.
   */
  private buildReadme(
    title: string,
    problemFrontendId: string,
    slug: string,
    difficulty: string,
    runtime: string,
    memory: string,
    tags: string[],
    contentHtml: string
  ): string {
    const problemUrl = `https://leetcode.com/problems/${slug}/`;
    const difficultyColor = difficulty === 'Easy' ? 'brightgreen' : difficulty === 'Medium' ? 'orange' : 'red';
    const tagBadges = tags.map(t => `\`${t}\``).join(' ');
    const markdownContent = this.htmlToMarkdown(contentHtml);

    return `# [${problemFrontendId ? `${problemFrontendId}. ` : ''}${title}](${problemUrl})

![Difficulty: ${difficulty}](https://img.shields.io/badge/Difficulty-${difficulty}-${difficultyColor})

## Performance
- **Runtime**: ${runtime}
- **Memory**: ${memory}

${tags.length > 0 ? `## Tags\n${tagBadges}\n` : ''}
## Problem Description
${markdownContent}
`;
  }

  /**
   * Polls LeetCode native judging check endpoint (/submissions/detail/{id}/check/).
   */
  private async pollCheckEndpoint(submissionId: number | string): Promise<any> {
    const isCN = window.location.hostname.includes('leetcode.cn');
    const baseUrl = isCN ? 'https://leetcode.cn' : 'https://leetcode.com';
    const checkUrl = `${baseUrl}/submissions/detail/${submissionId}/check/`;

    for (let attempt = 1; attempt <= 15; attempt++) {
      try {
        const response = await fetch(checkUrl, {
          method: 'GET',
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`[CodeRelay LeetCode] Poll attempt ${attempt} state:`, data?.state, data?.status_msg);

          if (data?.state === 'SUCCESS') {
            return data;
          }
        }
      } catch (err) {
        console.warn(`[CodeRelay LeetCode] Check poll attempt ${attempt} failed:`, err);
      }

      await new Promise(r => setTimeout(r, 1000));
    }
    return null;
  }

  /**
   * Fetches submission details from LeetCode GraphQL with csrf verification.
   */
  private async fetchDetailsGraphQL(submissionId: number | string): Promise<any> {
    const isCN = window.location.hostname.includes('leetcode.cn');
    const endpoint = isCN ? 'https://leetcode.cn/graphql/' : 'https://leetcode.com/graphql/';
    const subNum = Number(submissionId);
    if (isNaN(subNum) || subNum <= 0 || subNum > 2147483647) {
      return null;
    }

    const query = `
      query submissionDetails($submissionId: Int!) {
        submissionDetails(submissionId: $submissionId) {
          runtimeDisplay
          memoryDisplay
          code
          timestamp
          statusCode
          statusDisplay
          lang {
            name
            verboseName
          }
          question {
            questionId
            questionFrontendId
            title
            titleSlug
            content
            difficulty
          }
          topicTags {
            name
            slug
          }
        }
      }
    `;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    const csrf = this.getCsrfToken();
    if (csrf) {
      headers['x-csrftoken'] = csrf;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          query,
          variables: { submissionId: isCN ? submissionId.toString() : subNum },
          operationName: 'submissionDetails'
        })
      });

      if (!response.ok) return null;
      const json = await response.json();
      return json?.data?.submissionDetails || json?.data?.submissionDetail || null;
    } catch {
      return null;
    }
  }

  /**
   * Fetches public problem statement, difficulty, and tags without requiring auth or csrf.
   */
  private async fetchProblemBySlug(titleSlug: string): Promise<any> {
    const isCN = window.location.hostname.includes('leetcode.cn');
    const endpoint = isCN ? 'https://leetcode.cn/graphql/' : 'https://leetcode.com/graphql/';

    const query = `
      query questionData($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          questionId
          questionFrontendId
          title
          titleSlug
          content
          difficulty
          topicTags {
            name
            slug
          }
        }
      }
    `;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { titleSlug },
          operationName: 'questionData'
        })
      });

      if (!response.ok) return null;
      const json = await response.json();
      return json?.data?.question || null;
    } catch {
      return null;
    }
  }

  /**
   * Processes submission result and compiles payload for GitHub sync.
   */
  async processSubmission(submissionId: string | number, capturedCode?: string | null): Promise<SubmissionResult | null> {
    const subNum = Number(submissionId);
    const slug = this.getProblemSlug();
    const isRealSubId = !isNaN(subNum) && subNum > 0 && subNum < 2000000000;

    let checkResult: any = null;
    let gqlDetails: any = null;

    if (isRealSubId) {
      console.log('[CodeRelay LeetCode] Polling check endpoint for submission ID:', subNum);
      checkResult = await this.pollCheckEndpoint(subNum);

      if (!checkResult) {
        // Fallback to GraphQL
        gqlDetails = await this.fetchDetailsGraphQL(subNum);
      }
    }

    // Determine verdict
    const statusMsg = checkResult?.status_msg || gqlDetails?.statusDisplay || (checkResult?.status_code === 10 || gqlDetails?.statusCode === 10 ? 'Accepted' : null);
    const isAccepted = statusMsg === 'Accepted' || checkResult?.status_code === 10 || gqlDetails?.statusCode === 10;

    // If it was an intercepted submission and explicitly rejected (e.g. Wrong Answer, Compile Error):
    if (isRealSubId && !isAccepted && (checkResult || gqlDetails)) {
      const display = statusMsg || STATUS_MAP[checkResult?.status_code || gqlDetails?.statusCode] || 'Wrong Answer';
      console.log('[CodeRelay LeetCode] Submission not accepted:', display);
      return {
        accepted: false,
        statusDisplay: display
      };
    }

    // Short buffer for accepted auto-sync
    if (isAccepted) {
      await new Promise(r => setTimeout(r, 500));
    }

    // Retrieve question data (from GraphQL details or public question API)
    let questionData = gqlDetails?.question || (slug ? await this.fetchProblemBySlug(slug) : null);
    const title = questionData?.title || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const problemId = questionData?.questionFrontendId || questionData?.questionId || '';
    const difficulty = (questionData?.difficulty || 'Medium') as ProblemDifficulty;
    const tags = (questionData?.topicTags || []).map((t: any) => t.name);
    const content = questionData?.content || '';

    // Final source code
    const finalCode = capturedCode?.trim() || checkResult?.code || gqlDetails?.code || '';
    if (!finalCode) {
      console.warn('[CodeRelay LeetCode] No code captured');
      return {
        accepted: false,
        statusDisplay: 'No code found'
      };
    }

    const langInfo = this.getSelectedLanguage();
    const runtime = checkResult?.status_runtime || gqlDetails?.runtimeDisplay || 'N/A';
    const memory = checkResult?.status_memory || gqlDetails?.memoryDisplay || 'N/A';

    const descriptionMarkdown = this.buildReadme(
      title,
      problemId,
      slug,
      difficulty,
      runtime,
      memory,
      tags,
      content
    );

    const payload: SubmissionPayload = {
      platform: 'leetcode',
      problemId,
      problemSlug: slug,
      title,
      difficulty,
      language: gqlDetails?.lang?.verboseName || gqlDetails?.lang?.name || langInfo.name,
      extension: gqlDetails?.lang?.name ? (LANGUAGE_EXTENSIONS[gqlDetails.lang.name.toLowerCase()] || langInfo.ext) : langInfo.ext,
      code: finalCode,
      runtime,
      memory,
      tags,
      descriptionMarkdown,
      timestamp: Date.now()
    };

    return {
      accepted: true,
      statusDisplay: 'Accepted',
      payload
    };
  }
}
