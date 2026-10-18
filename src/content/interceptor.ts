/**
 * Intercepts network calls in the page context to capture submission triggers.
 */
(function initCodeRelayInterceptor() {
  const originalFetch = window.fetch;

  function dispatchSubmission(submissionId: string | number) {
    console.log('[CodeRelay Interceptor] Captured Submission ID:', submissionId);
    const detail = { platform: 'leetcode', submissionId };
    window.dispatchEvent(new CustomEvent('codeRelaySubmission', { detail }));
    document.dispatchEvent(new CustomEvent('codeRelaySubmission', { detail }));
  }

  window.fetch = async function (...args) {
    const [resource, options] = args;
    const url = typeof resource === 'string' ? resource : resource instanceof Request ? resource.url : '';

    const response = await originalFetch.apply(this, args);

    if (url.includes('/problems/') && url.includes('/submit/')) {
      try {
        const cloned = response.clone();
        const data = await cloned.json();
        if (data?.submission_id) {
          dispatchSubmission(data.submission_id);
        }
      } catch (err) {
        console.error('[CodeRelay Interceptor] Failed to parse submit response:', err);
      }
    }

    // Also support GraphQL submission mutations
    if (url.includes('/graphql/') && options?.method === 'POST') {
      try {
        const body = JSON.parse(options?.body as string || '{}');
        if (body.operationName === 'submitQuestion' || body.operationName === 'submit') {
          const cloned = response.clone();
          const data = await cloned.json();
          const subId = data?.data?.submitQuestion?.submissionId || data?.data?.submissionId;
          if (subId) {
            dispatchSubmission(subId);
          }
        }
      } catch {
        // Ignore non-json GraphQL payloads
      }
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
          if (data?.submission_id) {
            dispatchSubmission(data.submission_id);
          }
        } catch {
          // Ignore invalid JSON
        }
      }
    });

    return originalXHRSend.apply(this, args as any);
  };

  console.log('[CodeRelay] Network interceptor installed in page context');
})();
