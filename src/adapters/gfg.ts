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

    // 3. Fallback: DOM text contents in code lines
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
   * Extracts problem title, slug, and difficulty from the page DOM.
   */
  private getProblemMeta() {
    // Title
    const titleEl = document.querySelector('[class*="problem_title"], .problems_header_content__title, .problem-tab__name, h3.font-weight-bold');
    let title = titleEl?.textContent?.trim() || '';

    // Slug from URL: /problems/subarray-with-given-sum-1587115621/1
    const match = window.location.pathname.match(/\/problems\/([^/]+)/);
    const problemSlug = match ? match[1] : title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    if (!title) {
      title = problemSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    // Difficulty
    const diffEl = document.querySelector('.problem-tab__difficulty, [class*="difficulty"], [class*="badge"]');
    const diffText = (diffEl?.textContent?.trim() || 'Medium').toLowerCase();
    const difficulty: ProblemDifficulty = diffText.includes('easy') ? 'Easy' :
                                         diffText.includes('hard') ? 'Hard' :
                                         diffText.includes('basic') || diffText.includes('school') ? 'Easy' : 'Medium';

    // Description HTML
    const descEl = document.querySelector('.problem-statement, [class*="problem-statement"], .problems_problem_content');
    const contentHtml = descEl?.innerHTML || '';

    return { title, problemSlug, difficulty, contentHtml };
  }

  /**
   * Processes a GeeksforGeeks submission.
   */
  async processSubmission(submissionId: string | number, capturedCode?: string | null): Promise<SubmissionResult | null> {
    console.log('[CodeRelay GFG] Processing submission with ID:', submissionId);

    // Give GFG results 0.5s to settle into the DOM
    await new Promise(r => setTimeout(r, 500));

    const meta = this.getProblemMeta();
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

    const markdownContent = this.htmlToMarkdown(meta.contentHtml);
    const problemUrl = window.location.href;

    const descriptionMarkdown = `# [${meta.title}](${problemUrl})

![Difficulty: ${meta.difficulty}](https://img.shields.io/badge/Difficulty-${meta.difficulty}-orange)

## Problem Description
${markdownContent}
`;

    const payload: SubmissionPayload = {
      platform: 'gfg',
      problemId: '',
      problemSlug: meta.problemSlug,
      title: meta.title,
      difficulty: meta.difficulty,
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
