import { BaseAdapter, SubmissionResult } from './base-adapter';
import { ProblemDifficulty, SubmissionPayload } from '../core/types';

const CF_LANGUAGE_EXTENSIONS: Record<string, string> = {
  'c++': 'cpp',
  'cpp': 'cpp',
  'gnu c++': 'cpp',
  'clang++': 'cpp',
  'c#': 'cs',
  'csharp': 'cs',
  'c': 'c',
  'gnu c': 'c',
  'java': 'java',
  'kotlin': 'kt',
  'python': 'py',
  'pypy': 'py',
  'rust': 'rs',
  'go': 'go',
  'golang': 'go',
  'javascript': 'js',
  'node': 'js',
  'typescript': 'ts',
  'ruby': 'rb',
  'php': 'php',
  'haskell': 'hs',
  'ocaml': 'ml',
  'scala': 'scala',
  'pascal': 'pas'
};

export class CodeforcesAdapter implements BaseAdapter {
  platform = 'codeforces' as const;

  /**
   * Identifies whether the current page belongs to Codeforces.
   */
  canHandle(url: string): boolean {
    return url.includes('codeforces.com');
  }

  /**
   * Converts Codeforces HTML problem statement into clean Markdown.
   */
  private htmlToMarkdown(html: string): string {
    return html
      .replace(/<span class="tex-span">([\s\S]*?)<\/span>/gi, '$$$1$$')
      .replace(/<span class="tex-font-style-tt">([\s\S]*?)<\/span>/gi, '`$1`')
      .replace(/<span class="tex-font-style-bf">([\s\S]*?)<\/span>/gi, '**$1**')
      .replace(/<span class="tex-font-style-it">([\s\S]*?)<\/span>/gi, '*$1*')
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, text) => {
        const clean = text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
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
   * Extracts source code from Codeforces textarea, submission views, or editor.
   */
  private getCodeFromDOM(): string | null {
    // 1. Submission page source code: <pre id="program-source-text">
    const preSource = document.querySelector('#program-source-text, .program-source, pre.prettyprint');
    if (preSource && preSource.textContent?.trim()) {
      return preSource.textContent.trim();
    }

    // 2. Submit form textarea: <textarea name="source" id="sourceCodeText">
    const textarea = document.querySelector('textarea#sourceCodeText, textarea[name="source"]') as HTMLTextAreaElement;
    if (textarea && textarea.value?.trim()) {
      return textarea.value.trim();
    }

    // 3. Ace Editor or Monaco Editor if active on Codeforces
    const aceGlobal = (window as any).ace;
    if (aceGlobal && aceGlobal.edit) {
      const aceElement = document.querySelector('.ace_editor');
      if (aceElement) {
        try {
          const val = aceGlobal.edit(aceElement).getValue();
          if (val && val.trim().length > 0) return val;
        } catch {}
      }
    }

    return null;
  }

  /**
   * Resolves problem code, title, tags, rating and description from Codeforces DOM.
   */
  private getProblemMeta() {
    // URL pattern: /contest/1800/problem/A or /problemset/problem/1800/A or /gym/100000/problem/A
    const pathname = window.location.pathname;
    const contestMatch = pathname.match(/(?:contest|problemset\/problem|gym)\/(\d+)(?:\/problem)?\/([A-Za-z0-9]+)/);

    const contestId = contestMatch ? contestMatch[1] : '';
    const index = contestMatch ? contestMatch[2].toUpperCase() : '';
    const problemId = contestId && index ? `${contestId}${index}` : 'CF-PROBLEM';

    // Title
    const titleEl = document.querySelector('.problem-statement .header .title');
    let title = titleEl?.textContent?.trim() || `${problemId}`;

    // Remove leading index from title if present (e.g. 'A. Is It a Cat?' -> 'Is It a Cat?')
    const cleanTitle = title.replace(/^[A-Za-z0-9]+\.\s*/, '');
    const problemSlug = `${problemId}-${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.replace(/-+$/, '');

    // Tags & Rating from sidebar
    const tagEls = Array.from(document.querySelectorAll('.tag-box'));
    const tags: string[] = [];
    let rating = 0;

    tagEls.forEach(el => {
      const txt = (el.textContent || '').trim();
      if (txt.startsWith('*')) {
        const r = parseInt(txt.slice(1), 10);
        if (!isNaN(r)) rating = r;
      } else if (txt.length > 0) {
        tags.push(txt);
      }
    });

    // Difficulty mapping based on Codeforces rating
    const difficulty: ProblemDifficulty = rating > 0
      ? (rating < 1400 ? 'Easy' : rating < 1900 ? 'Medium' : 'Hard')
      : 'Medium';

    // Limits
    const timeLimitEl = document.querySelector('.problem-statement .time-limit');
    const memoryLimitEl = document.querySelector('.problem-statement .memory-limit');
    const timeLimit = timeLimitEl?.textContent?.replace('time limit per test', '').trim() || '';
    const memoryLimit = memoryLimitEl?.textContent?.replace('memory limit per test', '').trim() || '';

    // Problem Description HTML sections
    const statementEl = document.querySelector('.problem-statement');
    let contentHtml = '';

    if (statementEl) {
      // Collect description body, input-spec, output-spec, sample-tests, note
      const parts: string[] = [];
      const bodyDiv = statementEl.children[1];
      if (bodyDiv) parts.push(bodyDiv.innerHTML);

      const inputSpec = statementEl.querySelector('.input-specification');
      if (inputSpec) parts.push(inputSpec.innerHTML);

      const outputSpec = statementEl.querySelector('.output-specification');
      if (outputSpec) parts.push(outputSpec.innerHTML);

      const samples = statementEl.querySelector('.sample-tests');
      if (samples) parts.push(samples.innerHTML);

      const note = statementEl.querySelector('.note');
      if (note) parts.push(note.innerHTML);

      contentHtml = parts.join('\n<hr/>\n');
    }

    return {
      problemId,
      problemSlug,
      title: `${problemId} - ${cleanTitle}`,
      difficulty,
      rating,
      tags,
      timeLimit,
      memoryLimit,
      contentHtml
    };
  }

  /**
   * Detects programming language on Codeforces page.
   */
  private getLanguage(): { name: string; extension: string } {
    const langSelect = document.querySelector('select[name="programTypeId"]') as HTMLSelectElement;
    let langRaw = '';

    if (langSelect && langSelect.selectedIndex >= 0) {
      langRaw = langSelect.options[langSelect.selectedIndex]?.text?.toLowerCase() || '';
    }

    if (!langRaw) {
      const cell = document.querySelector('.status-frame-datatable td[data-lang]');
      langRaw = (cell?.textContent || 'GNU C++').toLowerCase();
    }

    let ext = 'cpp';
    for (const [key, val] of Object.entries(CF_LANGUAGE_EXTENSIONS)) {
      if (langRaw.includes(key)) {
        ext = val;
        break;
      }
    }

    return { name: langRaw.trim().toUpperCase() || 'C++', extension: ext };
  }

  /**
   * Processes a Codeforces submission.
   */
  async processSubmission(submissionId: string | number, capturedCode?: string | null): Promise<SubmissionResult | null> {
    console.log('[CodeRelay Codeforces] Processing submission with ID:', submissionId);

    // Give DOM 0.5s to settle
    await new Promise(r => setTimeout(r, 500));

    const meta = this.getProblemMeta();
    const code = capturedCode?.trim() ? capturedCode : this.getCodeFromDOM();

    if (!code) {
      console.warn('[CodeRelay Codeforces] Could not extract source code');
      return {
        accepted: false,
        statusDisplay: 'No code found'
      };
    }

    const lang = this.getLanguage();
    const markdownContent = this.htmlToMarkdown(meta.contentHtml);
    const problemUrl = window.location.href;
    const diffColor = meta.difficulty === 'Easy' ? 'brightgreen' : meta.difficulty === 'Medium' ? 'orange' : 'red';

    let descriptionMarkdown = `# [${meta.title}](${problemUrl})\n\n`;
    descriptionMarkdown += `![Difficulty: ${meta.difficulty}](https://img.shields.io/badge/Difficulty-${meta.difficulty}-${diffColor})`;

    if (meta.rating > 0) {
      descriptionMarkdown += ` ![Rating: ${meta.rating}](https://img.shields.io/badge/Rating-${meta.rating}-blue)`;
    }
    descriptionMarkdown += '\n\n';

    if (meta.timeLimit || meta.memoryLimit) {
      descriptionMarkdown += '## Constraints\n';
      if (meta.timeLimit) descriptionMarkdown += `- **Time Limit**: ${meta.timeLimit}\n`;
      if (meta.memoryLimit) descriptionMarkdown += `- **Memory Limit**: ${meta.memoryLimit}\n`;
      descriptionMarkdown += '\n';
    }

    if (meta.tags.length > 0) {
      const tagBadges = meta.tags.map(t => `\`${t}\``).join(' ');
      descriptionMarkdown += `## Tags\n${tagBadges}\n\n`;
    }

    descriptionMarkdown += `## Problem Description\n${markdownContent}\n`;

    const payload: SubmissionPayload = {
      platform: 'codeforces',
      problemId: meta.problemId,
      problemSlug: meta.problemSlug,
      title: meta.title,
      difficulty: meta.difficulty,
      language: lang.name,
      extension: lang.extension,
      code,
      tags: meta.tags,
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
