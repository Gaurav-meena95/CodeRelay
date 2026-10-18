/**
 * Intercepts network calls in the page context to capture submission triggers.
 */
(function initCodeRelayInterceptor() {
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const [resource] = args;
    const url = typeof resource === 'string' ? resource : resource instanceof Request ? resource.url : '';

    const response = await originalFetch.apply(this, args);

    if (url.includes('/problems/') && url.includes('/submit/')) {
      try {
        const cloned = response.clone();
        const data = await cloned.json();

        if (data?.submission_id) {
          window.dispatchEvent(
            new CustomEvent('codeRelaySubmission', {
              detail: {
                platform: 'leetcode',
                submissionId: data.submission_id
              }
            })
          );
        }
      } catch {
        // Fallback silently if response is not JSON
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
            window.dispatchEvent(
              new CustomEvent('codeRelaySubmission', {
                detail: {
                  platform: 'leetcode',
                  submissionId: data.submission_id
                }
              })
            );
          }
        } catch {
          // Ignore invalid JSON responses
        }
      }
    });

    return originalXHRSend.apply(this, args as any);
  };
})();
