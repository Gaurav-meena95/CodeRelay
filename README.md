# 🚀 CodeRelay

> **Relay your solutions to GitHub, anywhere you code.**

CodeRelay is a modern, modular Manifest V3 Chrome Extension built with TypeScript and Vite. It automatically syncs your accepted coding solutions from online judges directly to your GitHub repository in a clean, organized hierarchy.

---

## 🌟 Supported Platforms (In Progress)
- [x] **LeetCode** (`leetcode.com` / `leetcode.cn`)
- [ ] **GeeksforGeeks**
- [ ] **Codeforces**
- [ ] **CodeChef**

---

## 🛠️ Tech Stack
- **Language**: TypeScript (`strict: true`)
- **Bundler**: Vite
- **Platform**: Chrome Extensions Manifest V3
- **Sync Engine**: GitHub REST API (v3)

---

## 📁 Repository Structure
```text
CodeRelay/
├── src/
│   ├── core/
│   │   ├── config.ts       # App & OAuth configurations
│   │   ├── types.ts        # Universal submission payloads
│   │   └── github.ts       # GitHub REST commit engine
│   ├── adapters/           # Modular platform scrapers
│   ├── background/         # Service worker & message broker
│   ├── popup/              # Glassmorphic extension popup UI
│   └── welcome/            # Onboarding & Repo setup
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Development Mode (Watch)
```bash
npm run dev
```

### 3. Build for Production
```bash
npm run build
```

---

## 🔒 Security Note
Never commit your raw GitHub OAuth Client Secrets or Personal Access Tokens to public repositories. Use environment variables or secure extension storage.
