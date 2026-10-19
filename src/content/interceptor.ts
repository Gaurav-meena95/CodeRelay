/**
 * Intercepts network calls in the page context to capture submission triggers across LeetCode and GFG.
 */
(function initCodeRelayInterceptor() {
  const originalFetch = window.fetch;

  function getEditorCode(): string | null {
    try {
      // 1. Monaco Editor (CodeChef, LeetCode)
      const monaco = (window as any).monaco;
      if (monaco?.editor) {
        if (typeof monaco.editor.getEditors === 'function') {
          const editors = monaco.editor.getEditors();
          for (const ed of editors) {
            const val = ed.getValue?.();
            if (val && val.trim().length > 0) return val;
          }
        }
        if (typeof monaco.editor.getModels === 'function') {
          const models = monaco.editor.getModels();
          for (const m of models) {
            const val = m.getValue?.();
            const uri = m.uri?.toString() || '';
            if (val && val.trim().length > 0 && !uri.includes('schema') && !uri.includes('internal')) {
              return val;
            }
          }
        }
      }

      // 2. Ace Editor (GFG)
      const ace = (window as any).ace;
      if (ace?.edit) {
        const aceElement = document.querySelector('.ace_editor');
        if (aceElement) {
          const ed = ace.edit(aceElement);
          const val = ed.getValue?.();
          if (val && val.trim().length > 0) return val;
        }
      }

      // 3. CodeMirror
      const cmEl = document.querySelector('.CodeMirror') as any;
      if (cmEl?.CodeMirror?.getValue) {
        const val = cmEl.CodeMirror.getValue();
        if (val && val.trim().length > 0) return val;
      }
    } catch (err) {
      console.warn('[CodeRelay Interceptor] Error capturing page editor code:', err);
    }
    return null;
  }

  function dispatchSubmission(submissionId: string | number, platform = 'leetcode') {
    const code = getEditorCode();
    console.log(`[CodeRelay Interceptor] Captured ${platform.toUpperCase()} Submission ID:`, submissionId, 'HasCode:', !!code);
    const detail = { platform, submissionId, code };
    window.dispatchEvent(new CustomEvent('codeRelaySubmission', { detail }));
    document.dispatchEvent(new CustomEvent('codeRelaySubmission', { detail }));
  }

  window.addEventListener('codeRelayRequestCode', () => {
    const code = getEditorCode();
    window.dispatchEvent(new CustomEvent('codeRelayCodeResponse', { detail: { code } }));
  });

  window.fetch = async function (...args) {
    const [resource, options] = args;
    const url = typeof resource === 'string' ? resource : resource instanceof Request ? resource.url : '';

    const response = await originalFetch.apply(this, args);

    // 1. LeetCode Submissions
    if (url.includes('/problems/') && url.includes('/submit/')) {
      try {
        const cloned = response.clone();
        const data = await cloned.json();
        const subId = data?.submission_id || data?.submissionId;
        if (subId) {
          dispatchSubmission(subId, 'leetcode');
        }
      } catch (err) {
        console.error('[CodeRelay Interceptor] Failed to parse LeetCode submit response:', err);
      }
    }

    // 2. LeetCode GraphQL Mutations
    if (url.includes('/graphql/') && options?.method === 'POST') {
      try {
        const body = JSON.parse(options?.body as string || '{}');
        if (body.operationName === 'submitQuestion' || body.operationName === 'submit') {
          const cloned = response.clone();
          const data = await cloned.json();
          const subId = data?.data?.submitQuestion?.submissionId || data?.data?.submissionId;
          if (subId) {
            dispatchSubmission(subId, 'leetcode');
          }
        }
      } catch {}
    }

    // 3. GeeksforGeeks Submissions
    if (url.includes('geeksforgeeks.org') && (url.includes('/submit') || url.includes('/compile') || url.includes('/problems/'))) {
      try {
        const cloned = response.clone();
        const data = await cloned.json();
        if (data?.status === 'SUCCESS' || data?.message?.includes('Successfully') || data?.submission_id || data?.sub_id) {
          dispatchSubmission(data?.submission_id || data?.sub_id || Date.now(), 'gfg');
        }
      } catch {}
    }

    // 4. CodeChef Submissions
    if (url.includes('codechef.com') && (url.includes('/submit') || url.includes('/run') || url.includes('/api/'))) {
      try {
        const cloned = response.clone();
        const data = await cloned.json();
        if (data?.status === 'SUCCESS' || data?.result === 'SUCCESS' || data?.submission_id || data?.upstatus) {
          dispatchSubmission(data?.submission_id || Date.now(), 'codechef');
        }
      } catch {}
    }

    return response;
  };

  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
    (this as any)._coderelay_url = url.toString();
    return originalXHROpen.apply(this, [method, url, ...rest] as any);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      const url: string = (this as any)._coderelay_url || '';

      if (url.includes('/problems/') && url.includes('/submit/')) {
        try {
          const data = JSON.parse(this.responseText);
          const subId = data?.submission_id || data?.submissionId;
          if (subId) {
            dispatchSubmission(subId, 'leetcode');
          }
        } catch {}
      }

      if (url.includes('geeksforgeeks.org') && (url.includes('/submit') || url.includes('/compile'))) {
        try {
          const data = JSON.parse(this.responseText);
          if (data?.status === 'SUCCESS' || data?.message?.includes('Successfully') || data?.submission_id || data?.sub_id) {
            dispatchSubmission(data?.submission_id || data?.sub_id || Date.now(), 'gfg');
          }
        } catch {}
      }

      if (url.includes('codechef.com') && (url.includes('/submit') || url.includes('/run') || url.includes('/api/'))) {
        try {
          const data = JSON.parse(this.responseText);
          if (data?.status === 'SUCCESS' || data?.result === 'SUCCESS' || data?.submission_id || data?.upstatus) {
            dispatchSubmission(data?.submission_id || Date.now(), 'codechef');
          }
        } catch {}
      }
    });

    return originalXHRSend.apply(this, args as any);
  };

  console.log('[CodeRelay] Network interceptor installed in page context');
})();
