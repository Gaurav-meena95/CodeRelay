import { BaseAdapter, SubmissionResult } from './base-adapter';
import { ProblemDifficulty, SubmissionPayload } from '../core/types';

const CC_LANGUAGE_EXTENSIONS: Record<string, string> = {
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  'c++14': 'cpp',
  'c++17': 'cpp',
  'c++20': 'cpp',
  java: 'java',
  python: 'py',
  python3: 'py',
  'py 3': 'py',
  pypy: 'py',
  pypy3: 'py',
  javascript: 'js',
  node: 'js',
  csharp: 'cs',
  'c#': 'cs',
  rust: 'rs',
  go: 'go',
  golang: 'go',
  kotlin: 'kt',
  swift: 'swift',
  ruby: 'rb'
};

export class CodeChefAdapter implements BaseAdapter {
  platform = 'codechef' as const;

  /**
   * Identifies whether the current page belongs to CodeChef.
   */
  canHandle(url: string): boolean {
    return url.includes('codechef.com');
  }

  /**
   * Converts CodeChef HTML problem description into clean Markdown.
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
      .replace(/<p>/gi, '\n\n')
      .replace(/<\/p>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  /**
   * Extracts source code from DOM lines on CodeChef, filtering out autocomplete popups.
   */
  private getCodeFromDOM(): string | null {
    // 1. Monaco Editor (lines-content strictly inside .view-lines, excluding suggestions)
    const monacoLines = document.querySelectorAll('.monaco-editor .lines-content .view-lines .view-line');
    if (monacoLines && monacoLines.length > 0) {
      const lines: string[] = [];
      monacoLines.forEach(l => {
        if (l.closest('.suggest-widget, .monaco-list, .parameter-hints-widget, .hover-widgets, .monaco-editor-hover')) {
          return;
        }
        lines.push(l.textContent || '');
      });
      if (lines.length > 0) {
        return lines.join('\n');
      }
    }

    // 2. CodeMirror Editor
    const codeMirrorEl = document.querySelector('.CodeMirror') as any;
    if (codeMirrorEl && codeMirrorEl.CodeMirror) {
      const val = codeMirrorEl.CodeMirror.getValue();
      if (val && val.trim().length > 0) {
        return val;
      }
    }

    // 3. Ace Editor
    const aceLines = document.querySelectorAll('.ace_editor .ace_line');
    if (aceLines && aceLines.length > 0) {
      const lines: string[] = [];
      aceLines.forEach(l => {
        if (l.closest('.ace_autocomplete, .ace_tooltip')) {
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
   * Extracts problem code, title, difficulty and description from CodeChef page.
   */
  private getProblemMeta() {
    // Problem Code & Title from URL or page: /problems/START01
    const match = window.location.pathname.match(/\/problems\/([^/?]+)/);
    const problemCode = match ? match[1].toUpperCase() : 'PROBLEM';

    const titleEl = document.querySelector('h1, [class*="problem-title"], [class*="ProblemTitle"]');
    const title = titleEl?.textContent?.trim() || problemCode;

    // Difficulty / Rating
    const diffEl = document.querySelector('[class*="difficulty"], [class*="Difficulty"], [class*="rating"]');
    const diffText = (diffEl?.textContent?.trim() || 'Medium').toLowerCase();
    const difficulty: ProblemDifficulty = diffText.includes('easy') || diffText.includes('beginner') ? 'Easy' :
                                         diffText.includes('hard') ? 'Hard' : 'Medium';

    // Problem Statement HTML
    const descEl = document.querySelector('.problem-statement, #problem-statement, [class*="problem-statement"], [class*="problem_description"]');
    const contentHtml = descEl?.innerHTML || '';

    return { problemCode, title, difficulty, contentHtml };
  }

  /**
   * Detects the chosen programming language on CodeChef.
   */
  private getLanguage(): { name: string; extension: string } {
    const langEl = document.querySelector('[class*="language-select"], [id*="language"], [class*="LanguageSelect"]');
    const langRaw = (langEl?.textContent?.trim() || 'C++').toLowerCase();

    let ext = 'cpp';
    for (const [key, val] of Object.entries(CC_LANGUAGE_EXTENSIONS)) {
      if (langRaw.includes(key)) {
        ext = val;
        break;
      }
    }

    return { name: langRaw.toUpperCase(), extension: ext };
  }

  /**
   * Fetches problem statement from CodeChef practice API if DOM statement is empty.
   */
  private async fetchProblemFromApi(code: string): Promise<{ title?: string; body?: string } | null> {
    try {
      const response = await fetch(`https://www.codechef.com/api/contests/PRACTICE/problems/${code}`);
      if (!response.ok) return null;
      const data = await response.json();
      return {
        title: data?.problem_name,
        body: data?.body
      };
    } catch {
      return null;
    }
  }

  /**
   * Processes a CodeChef submission and packages the payload.
   */
  async processSubmission(submissionId: string | number, capturedCode?: string | null): Promise<SubmissionResult | null> {
    console.log('[CodeRelay CodeChef] Processing submission ID:', submissionId);

    // 0.5s pause to ensure editor and result are settled
    await new Promise(r => setTimeout(r, 500));

    // Strict Rule: ONLY push if CodeChef verdict is confirmed Accepted ("100 pts" or "Correct Answer")
    const pageText = document.body?.innerText || '';
    const isAccepted = pageText.includes('100 pts') || pageText.includes('Correct Answer') || !!document.querySelector('.verdict-accepted, [class*="verdict-accepted"], .tick');
    if (!isAccepted) {
      console.log('[CodeRelay CodeChef] Submission is NOT accepted yet. Push blocked.');
      return {
        accepted: false,
        statusDisplay: 'Not Accepted'
      };
    }

    const meta = this.getProblemMeta();
    let title = meta.title;
    let contentHtml = meta.contentHtml;

    if (!contentHtml) {
      const apiData = await this.fetchProblemFromApi(meta.problemCode);
      if (apiData) {
        if (apiData.title) title = `${meta.problemCode} - ${apiData.title}`;
        if (apiData.body) contentHtml = apiData.body;
      }
    }

    const code = capturedCode?.trim() ? capturedCode : this.getCodeFromDOM();

    if (!code) {
      console.warn('[CodeRelay CodeChef] Could not extract source code');
      return {
        accepted: false,
        statusDisplay: 'No code found'
      };
    }

    const lang = this.getLanguage();
    const markdownContent = this.htmlToMarkdown(contentHtml);
    const problemUrl = window.location.href;

    const descriptionMarkdown = `# [${title}](${problemUrl})

![Difficulty: ${meta.difficulty}](https://img.shields.io/badge/Difficulty-${meta.difficulty}-orange)

## Problem Description
${markdownContent}
`;

    const payload: SubmissionPayload = {
      platform: 'codechef',
      problemId: meta.problemCode,
      problemSlug: meta.problemCode.toLowerCase(),
      title,
      difficulty: meta.difficulty,
      language: lang.name,
      extension: lang.extension,
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
