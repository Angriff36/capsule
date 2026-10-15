import { spawn } from "node:child_process";

export type CheckTask = {
  id: string;
  argv: string[];
  skip?: { skip: true; reason: string };
};

export type CheckWave = {
  name: string;
  serial?: boolean;
  tasks: CheckTask[];
};

export class CheckWaveRunner {
  constructor(private readonly root: string) {}

  async runWave(wave: CheckWave): Promise<number> {
    const skipped = wave.tasks.filter((task) => task.skip?.skip === true);
    const running = wave.tasks.filter((task) => task.skip?.skip !== true);
    for (const task of skipped) {
      console.log(`check: ${task.skip?.reason}`);
    }
    if (running.length === 0) {
      console.log(`check: ${wave.name} — nothing to run`);
      return 0;
    }
    console.log(
      `check: ${wave.name} — ${running.map((task) => task.id).join(", ")}`,
    );
    if (wave.serial) {
      for (const task of running) {
        const code = await this.runTask(task);
        if (code !== 0) {
          console.error(
            `check: ${wave.name} failed: ${task.id} (exit ${code})`,
          );
          return code;
        }
      }
      return 0;
    }
    const codes = await Promise.all(running.map((task) => this.runTask(task)));
    const failed = running.flatMap((task, index) =>
      codes[index] === 0 ? [] : [`${task.id} (exit ${codes[index]})`],
    );
    if (failed.length === 0) return 0;
    console.error(`check: ${wave.name} failed: ${failed.join(", ")}`);
    return codes.find((code) => code !== 0) ?? 1;
  }

  private runTask(task: CheckTask): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn("bun", task.argv, {
        cwd: this.root,
        stdio: "inherit",
        env: process.env,
      });
      child.on("error", (error) => {
        console.error(`check: ${task.id} failed to start: ${error.message}`);
        resolve(1);
      });
      child.on("exit", (code) => resolve(code ?? 1));
    });
  }
}
