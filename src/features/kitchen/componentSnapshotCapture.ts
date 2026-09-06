export const SNAPSHOT_CAPTURE_WARNING =
  "The before-version could not be captured. The requested change will still be attempted.";

export async function captureBeforeChange(
  capture: () => Promise<unknown>,
  warn: (message: string) => void,
): Promise<boolean> {
  try {
    await capture();
    return true;
  } catch {
    warn(SNAPSHOT_CAPTURE_WARNING);
    return false;
  }
}
