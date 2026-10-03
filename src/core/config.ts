export const CONFIG = {
  GITHUB: {
    CLIENT_ID: 'YOUR_CLIENT_ID_HERE', // <-- Yaha apni Client ID dalein
    CLIENT_SECRET: 'YOUR_CLIENT_SECRET_HERE', // <-- Yaha apna Client Secret dalein
    AUTHORIZE_URL: 'https://github.com/login/oauth/authorize',
    ACCESS_TOKEN_URL: 'https://github.com/login/oauth/access_token',
    USER_API_URL: 'https://api.github.com/user',
    REPOS_API_URL: 'https://api.github.com/user/repos',
    SCOPES: ['repo']
  },
  STORAGE_KEYS: {
    AUTH_TOKEN: 'coderelay_token',
    USERNAME: 'coderelay_username',
    SELECTED_REPO: 'coderelay_repo',
    CUSTOM_FOLDER: 'coderelay_folder_structure',
    SYNC_ENABLED: 'coderelay_sync_enabled',
    STATS: 'coderelay_stats'
  }
} as const;

