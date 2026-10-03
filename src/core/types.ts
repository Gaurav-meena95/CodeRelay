export type SupportedPlatform = 'leetcode' | 'gfg' | 'codeforces' | 'codechef';

export type ProblemDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Unknown';

export interface SubmissionPayload {
  platform: SupportedPlatform;
  problemId: string;
  problemSlug: string;
  title: string;
  difficulty: ProblemDifficulty;
  language: string;
  extension: string;
  code: string;
  runtime?: string;
  memory?: string;
  tags?: string[];
  descriptionMarkdown: string;
  notes?: string;
  timestamp: number;
}

export interface PlatformStats {
  leetcode: number;
  gfg: number;
  codeforces: number;
  codechef: number;
  total: number;
}
