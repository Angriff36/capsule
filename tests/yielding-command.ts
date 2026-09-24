import { spawn } from "node:child_process";

export interface YieldingCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Starts a command and waits without freezing the test worker.
 * A frozen worker cannot answer Vitest, so a passing test still
 * fails the run after 60 seconds (issue #398).
 */
export class YieldingCommand {
  static run(
    command: string,
    args: readonly string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
  ): Promise<YieldingCommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout.push(chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr.push(chunk);
      });
      child.on("error", reject);
      child.on("close", (status) => {
        resolve({
          status,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      });
    });
  }
}
