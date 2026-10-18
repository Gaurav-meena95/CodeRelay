import { storage } from '../core/storage';
import { GitHubService, GitHubRepo } from '../core/github';

/**
 * Orchestrates token validation, repository listing and onboarding flow.
 */
function initWelcomePage() {
  const stepAuth = document.getElementById('step-auth')!;
  const stepRepo = document.getElementById('step-repo')!;
  const stepComplete = document.getElementById('step-complete')!;

  const tokenInput = document.getElementById('token-input') as HTMLInputElement;
  const btnVerifyToken = document.getElementById('btn-verify-token')!;
  const authError = document.getElementById('auth-error')!;

  const connectedAvatar = document.getElementById('connected-avatar') as HTMLImageElement;
  const connectedUsername = document.getElementById('connected-username')!;
  const btnSwitchAccount = document.getElementById('btn-switch-account')!;

  const repoSelect = document.getElementById('repo-select') as HTMLSelectElement;
  const customRepoInput = document.getElementById('custom-repo-input') as HTMLInputElement;
  const btnSaveRepo = document.getElementById('btn-save-repo')!;
  const repoError = document.getElementById('repo-error')!;
  const btnClose = document.getElementById('btn-close')!;

  let currentToken = '';

  // Check if token already exists in storage
  storage.getAuthToken().then(existingToken => {
    if (existingToken) {
      currentToken = existingToken;
      loadRepoStep(existingToken);
    }
  });

  /**
   * Validates token with GitHub API and transitions to repository selection step.
   */
  async function loadRepoStep(token: string) {
    authError.classList.add('hidden');
    btnVerifyToken.textContent = 'Verifying...';

    try {
      const user = await GitHubService.getUser(token);
      await storage.setAuthToken(token);
      await storage.setUsername(user.login);

      connectedAvatar.src = user.avatar_url;
      connectedUsername.textContent = user.login;

      // Populate repositories
      const repos = await GitHubService.getUserRepos(token);
      repoSelect.innerHTML = '<option value="">-- Choose a repository --</option>';

      repos.forEach((r: GitHubRepo) => {
        const option = document.createElement('option');
        option.value = r.full_name;
        option.textContent = `${r.name} ${r.private ? '(Private)' : '(Public)'}`;
        repoSelect.appendChild(option);
      });

      const existingRepo = await storage.getSelectedRepo();
      if (existingRepo) {
        repoSelect.value = existingRepo;
      }

      stepAuth.classList.add('hidden');
      stepRepo.classList.remove('hidden');
    } catch (err: any) {
      authError.textContent = err.message || 'Invalid GitHub token. Please verify scopes and token value.';
      authError.classList.remove('hidden');
    } finally {
      btnVerifyToken.textContent = 'Connect';
    }
  }

  btnVerifyToken.addEventListener('click', () => {
    const val = tokenInput.value.trim();
    if (!val) {
      authError.textContent = 'Please enter a GitHub token.';
      authError.classList.remove('hidden');
      return;
    }
    currentToken = val;
    loadRepoStep(val);
  });

  btnSwitchAccount.addEventListener('click', async () => {
    await storage.clearAll();
    tokenInput.value = '';
    stepRepo.classList.add('hidden');
    stepAuth.classList.remove('hidden');
  });

  btnSaveRepo.addEventListener('click', async () => {
    repoError.classList.add('hidden');

    const selected = repoSelect.value || customRepoInput.value.trim();
    if (!selected || !selected.includes('/')) {
      repoError.textContent = 'Please select a repository or enter owner/repo-name.';
      repoError.classList.remove('hidden');
      return;
    }

    await storage.setSelectedRepo(selected);
    await storage.setSyncEnabled(true);

    stepRepo.classList.add('hidden');
    stepComplete.classList.remove('hidden');
  });

  btnClose.addEventListener('click', () => {
    window.close();
  });
}

document.addEventListener('DOMContentLoaded', initWelcomePage);
