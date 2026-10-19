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
   * Extracts source code from Monaco Editor, CodeMirror, or DOM lines on CodeChef.
   */
  private getCodeFromDOM(): string | null {
    // 1. Monaco Editor (standard in modern CodeChef IDE)
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

    // 2. CodeMirror Editor
    const codeMirrorEl = document.querySelector('.CodeMirror') as any;
    if (codeMirrorEl && codeMirrorEl.CodeMirror) {
      const val = codeMirrorEl.CodeMirror.getValue();
      if (val && val.trim().length > 0) {
        return val;
      }
    }

    // 3. Ace Editor
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

    // 4. Fallback DOM code lines
    const lines = document.querySelectorAll('.view-line, .ace_line');
    if (lines && lines.length > 0) {
      const result: string[] = [];
      lines.forEach(l => result.push(l.textContent || ''));
      return result.join('\n');
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
   * Processes a CodeChef submission and packages the payload.
   */
  async processSubmission(submissionId: string | number): Promise<SubmissionResult | null> {
    console.log('[CodeRelay CodeChef] Processing submission ID:', submissionId);

    // 0.5s pause to ensure editor and result are settled
    await new Promise(r => setTimeout(r, 500));

    const meta = this.getProblemMeta();
    const code = this.getCodeFromDOM();

    if (!code) {
      console.warn('[CodeRelay CodeChef] Could not extract source code');
      return {
        accepted: false,
        statusDisplay: 'No code found'
      };
    }

    const lang = this.getLanguage();
    const markdownContent = this.htmlToMarkdown(meta.contentHtml);
    const problemUrl = window.location.href;

    const descriptionMarkdown = `# [${meta.problemCode} - ${meta.title}](${problemUrl})

![Difficulty: ${meta.difficulty}](https://img.shields.io/badge/Difficulty-${meta.difficulty}-orange)

## Problem Description
${markdownContent}
`;

    const payload: SubmissionPayload = {
      platform: 'codechef',
      problemId: meta.problemCode,
      problemSlug: meta.problemCode.toLowerCase(),
      title: `${meta.problemCode} - ${meta.title}`,
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
