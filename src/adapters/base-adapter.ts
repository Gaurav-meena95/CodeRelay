import { SubmissionPayload, SupportedPlatform } from '../core/types';

export interface BaseAdapter {
  platform: SupportedPlatform;

  /**
   * Checks whether the current URL belongs to this platform.
   */
  canHandle(url: string): boolean;

  /**
   * Extracts and normalizes submission data into standard SubmissionPayload.
   */
  processSubmission(submissionId: string | number): Promise<SubmissionPayload | null>;
}
