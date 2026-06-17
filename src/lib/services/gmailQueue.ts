export const DELAY_MS = 1500;
export const MAX_PER_MINUTE = 40; // enforced by DELAY_MS (60s / 40 = 1.5s per email)

export function gmailDelay(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, DELAY_MS));
}
