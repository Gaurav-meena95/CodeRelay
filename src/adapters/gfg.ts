import { BaseAdapter, SubmissionResult } from './base-adapter';
import { ProblemDifficulty, SubmissionPayload } from '../core/types';

const GFG_LANGUAGE_EXTENSIONS: Record<string, string> = {
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  java: 'java',
  python: 'py',
  python3: 'py',
  javascript: 'js',
  csharp: 'cs',
  'c#': 'cs'
};

interface GfgApiResponse {
  results?: {
    problem_name?: string;
    difficulty?: string;
    problem_level_text?: string;
    problem_question?: string;
    tags?: {
      topic_tags?: string[];
      company_tags?: string[];
    };
  };
}

export class GfgAdapter implements BaseAdapter {
  platform = 'gfg' as const;

  /**
   * Identifies whether the current page belongs to GeeksforGeeks.
   */
  canHandle(url: string): boolean {
    return url.includes('geeksforgeeks.org');
  }

  /**
   * Converts GFG problem description HTML into clean Markdown.
   */
  private htmlToMarkdown(html: string): string {
    return html
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, text) => {
        const clean = text.replace(/<[^>]+>/g, '').trim();
        return `\n\`\`\`\n${clean}\n\`\`\`\n`;
      })
      .replace(/<code>(.*?)<\/code>/gi, '`$1`')
      .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i>(.*?)<\/i>/gi, '*$1*')
      .replace(/<p[^>]*>/gi, '\n\n')
      .replace(/<\/p>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&le;/g, '<=')
      .replace(/&ge;/g, '>=')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();
  }

  /**
   * Extracts current source code from GFG's Ace or Monaco editor.
   */
  private getCodeFromDOM(): string | null {
    // 1. Ace Editor
    const aceGlobal = (window as any).ace;
    if (aceGlobal && aceGlobal.edit) {
      const aceElement = document.querySelector('.ace_editor');
      if (aceElement) {
        try {
          const editor = aceGlobal.edit(aceElement);
          const val = editor.getValue();
          if (val && val.trim().length > 0) {
            return val;
          }
        } catch {}
      }
    }

    // 2. Monaco Editor
    const monacoGlobal = (window as any).monaco;
    if (monacoGlobal?.editor?.getModels) {
      const models = monacoGlobal.editor.getModels();
      if (models && models.length > 0) {
        const val = models[0].getValue();
        if (val && val.trim().length > 0) {
          return val;
        }
      }
    }

    // 3. Fallback: DOM text contents in code lines excluding autocomplete popups
    const codeLines = document.querySelectorAll('.ace_editor .ace_line, .monaco-editor .lines-content .view-lines .view-line');
    if (codeLines && codeLines.length > 0) {
      const lines: string[] = [];
      codeLines.forEach(l => {
        if (l.closest('.ace_autocomplete, .suggest-widget, .monaco-list, .parameter-hints-widget')) {
          return;
        }
        lines.push(l.textContent || '');
      });
      if (lines.length > 0) {
        return lines.join('\n');
      }
    }

    return null;
  }

  /**
   * Normalizes raw difficulty string to standard ProblemDifficulty.
   */
  private normalizeDifficulty(diffRaw?: string): ProblemDifficulty {
    const text = (diffRaw || '').toLowerCase();
    if (text.includes('hard')) return 'Hard';
    if (text.includes('medium')) return 'Medium';
    return 'Easy';
  }

  /**
   * Fetches problem details directly from GFG practice API.
   */
  private async fetchProblemFromApi(slug: string): Promise<GfgApiResponse['results'] | null> {
    try {
      const apiUrl = `https://practiceapi.geeksforgeeks.org/api/v1/problems/${slug}/`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        return null;
      }
      const data: GfgApiResponse = await response.json();
      return data?.results || null;
    } catch (err) {
      console.warn('[CodeRelay GFG] Failed to fetch problem from GFG API:', err);
      return null;
    }
  }

  /**
   * Extracts problem metadata from DOM as fallback.
   */
  private getProblemMetaFromDOM(slug: string) {
    const titleEl = document.querySelector(
      '[class*="problems_header_content__title"], [class*="problem-title"], [class*="problem_title"], h1, h3.font-weight-bold'
    );
    let title = titleEl?.textContent?.trim() || '';

    if (!title) {
      // Strip trailing numeric suffixes (e.g., 'palindrome-string0817' -> 'Palindrome String')
      const cleanSlug = slug.replace(/[-_]?\d+$/, '');
      title = cleanSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    const diffEl = document.querySelector('.problem-tab__difficulty, [class*="difficulty"], [class*="badge"]');
    const difficulty = this.normalizeDifficulty(diffEl?.textContent?.trim());

    const descEl = document.querySelector(
      '[class*="problems_problem_content"], [class*="problem-statement"], [class*="problems_content"], [class*="problemDescription"]'
    );
    const contentHtml = descEl?.innerHTML || '';

    return { title, difficulty, contentHtml, topicTags: [] as string[], companyTags: [] as string[] };
  }

  /**
   * Processes a GeeksforGeeks submission.
   */
  async processSubmission(submissionId: string | number, capturedCode?: string | null): Promise<SubmissionResult | null> {
    console.log('[CodeRelay GFG] Processing submission with ID:', submissionId);

    // Give GFG results 0.5s to settle into the DOM
    await new Promise(r => setTimeout(r, 500));

    // Extract slug from URL: /problems/palindrome-string0817/1
    const match = window.location.pathname.match(/\/problems\/([^/]+)/);
    const problemSlug = match ? match[1] : 'problem';

    // 1. Primary: Fetch problem details from GFG API
    const apiData = await this.fetchProblemFromApi(problemSlug);

    let title: string;
    let difficulty: ProblemDifficulty;
    let contentHtml: string;
    let topicTags: string[] = [];
    let companyTags: string[] = [];

    if (apiData && (apiData.problem_name || apiData.problem_question)) {
      title = apiData.problem_name || problemSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      difficulty = this.normalizeDifficulty(apiData.difficulty || apiData.problem_level_text);
      contentHtml = apiData.problem_question || '';
      topicTags = apiData.tags?.topic_tags || [];
      companyTags = apiData.tags?.company_tags || [];
    } else {
      // 2. Fallback: Parse from page DOM
      const domMeta = this.getProblemMetaFromDOM(problemSlug);
      title = domMeta.title;
      difficulty = domMeta.difficulty;
      contentHtml = domMeta.contentHtml;
    }

    const code = capturedCode?.trim() ? capturedCode : this.getCodeFromDOM();

    if (!code) {
      console.warn('[CodeRelay GFG] Could not extract source code from editor');
      return {
        accepted: false,
        statusDisplay: 'No code found'
      };
    }

    // Detect language from UI or default to cpp
    const langPicker = document.querySelector('.select-language, [class*="language-select"], [class*="divider-text"]');
    const langName = (langPicker?.textContent?.trim() || 'C++').toLowerCase();
    const extension = GFG_LANGUAGE_EXTENSIONS[langName] || 'cpp';

    const markdownContent = this.htmlToMarkdown(contentHtml);
    const problemUrl = window.location.href;
    const diffColor = difficulty === 'Easy' ? 'brightgreen' : difficulty === 'Medium' ? 'orange' : 'red';

    let descriptionMarkdown = `# [${title}](${problemUrl})\n\n`;
    descriptionMarkdown += `![Difficulty: ${difficulty}](https://img.shields.io/badge/Difficulty-${difficulty}-${diffColor})\n\n`;

    if (topicTags.length > 0) {
      const topicBadges = topicTags.map(t => `\`${t}\``).join(' ');
      descriptionMarkdown += `## Topic Tags\n${topicBadges}\n\n`;
    }

    if (companyTags.length > 0) {
      const companyBadges = companyTags.map(c => `\`${c}\``).join(' ');
      descriptionMarkdown += `## Company Tags\n${companyBadges}\n\n`;
    }

    descriptionMarkdown += `## Problem Description\n${markdownContent}\n`;

    const payload: SubmissionPayload = {
      platform: 'gfg',
      problemId: '',
      problemSlug,
      title,
      difficulty,
      language: langName.toUpperCase(),
      extension,
      code,
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
