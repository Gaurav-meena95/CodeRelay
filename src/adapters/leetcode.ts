import { BaseAdapter } from './base-adapter';
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

export class LeetCodeAdapter implements BaseAdapter {
  platform = 'leetcode' as const;

  /**
   * Identifies whether the current page belongs to LeetCode.
   */
  canHandle(url: string): boolean {
    return url.includes('leetcode.com') || url.includes('leetcode.cn');
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

    return `# [${problemFrontendId}. ${title}](${problemUrl})

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
   * Queries LeetCode GraphQL API to obtain submission details and formats the payload.
   */
  async processSubmission(submissionId: string | number): Promise<SubmissionPayload | null> {
    const isCN = window.location.hostname.includes('leetcode.cn');
    const endpoint = isCN ? 'https://leetcode.cn/graphql/' : 'https://leetcode.com/graphql/';

    const query = `
      query submissionDetails($submissionId: Int!) {
        submissionDetails(submissionId: $submissionId) {
          runtimeDisplay
          memoryDisplay
          code
          timestamp
          statusCode
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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        variables: { submissionId: Number(submissionId) },
        operationName: 'submissionDetails'
      })
    });

    if (!response.ok) {
      throw new Error(`LeetCode GraphQL call failed: ${response.status}`);
    }

    const json = await response.json();
    const details = json?.data?.submissionDetails;

    if (!details) {
      return null;
    }

    // Only process accepted submissions (statusCode 10 is Accepted)
    if (details.statusCode !== 10) {
      return null;
    }

    const langKey = (details.lang?.name || '').toLowerCase();
    const extension = LANGUAGE_EXTENSIONS[langKey] || 'txt';
    const difficulty = (details.question?.difficulty || 'Unknown') as ProblemDifficulty;
    const tags = (details.topicTags || []).map((t: any) => t.name);

    const descriptionMarkdown = this.buildReadme(
      details.question.title,
      details.question.questionFrontendId || details.question.questionId,
      details.question.titleSlug,
      difficulty,
      details.runtimeDisplay || 'N/A',
      details.memoryDisplay || 'N/A',
      tags,
      details.question.content || ''
    );

    return {
      platform: 'leetcode',
      problemId: details.question.questionFrontendId || details.question.questionId,
      problemSlug: details.question.titleSlug,
      title: details.question.title,
      difficulty,
      language: details.lang?.verboseName || details.lang?.name || 'Unknown',
      extension,
      code: details.code,
      runtime: details.runtimeDisplay,
      memory: details.memoryDisplay,
      tags,
      descriptionMarkdown,
      timestamp: details.timestamp ? details.timestamp * 1000 : Date.now()
    };
  }
}
