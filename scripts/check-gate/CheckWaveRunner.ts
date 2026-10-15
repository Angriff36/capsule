import { spawn } from "node:child_process";

export type CheckTask = {
  id: string;
  argv?: string[];
  /** Sequential bun argv lists (proof emit then proof check). */
  steps?: string[][];
  env?: Record<string, string>;
  skip?: { skip: true; reason: string };
};

export type CheckWave = {
  name: string;
  serial?: boolean;
  /** Cap overlapping jobs. Wave 2 uses 2 so coverage never shares two Vite builds. */
  maxConcurrent?: number;
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
    if (wave.serial) return this.runSerial(wave.name, running);
    const limit = wave.maxConcurrent ?? running.length;
    return this.runParallel(wave.name, running, limit);
  }

  private async runSerial(name: string, running: CheckTask[]): Promise<number> {
    for (const task of running) {
      const code = await this.runTask(task);
      if (code !== 0) {
        console.error(`check: ${name} failed: ${task.id} (exit ${code})`);
        return code;
      }
    }
    return 0;
  }

  private async runParallel(
    name: string,
    running: CheckTask[],
    limit: number,
  ): Promise<number> {
    const codes: number[] = Array.from({ length: running.length }, () => 0);
    let next = 0;
    const workers = Math.max(1, Math.min(limit, running.length));
    const runWorker = async () => {
      while (true) {
        const index = next;
        next += 1;
        if (index >= running.length) return;
        const task = running[index];
        if (!task) return;
        codes[index] = await this.runTask(task);
      }
    };
    await Promise.all(Array.from({ length: workers }, () => runWorker()));
    const failed = running.flatMap((task, index) =>
      codes[index] === 0 ? [] : [`${task.id} (exit ${codes[index]})`],
    );
    if (failed.length === 0) return 0;
    console.error(`check: ${name} failed: ${failed.join(", ")}`);
    return codes.find((code) => code !== 0) ?? 1;
  }

  private async runTask(task: CheckTask): Promise<number> {
    const steps = task.steps ?? (task.argv ? [task.argv] : []);
    if (steps.length === 0) {
      console.error(`check: ${task.id} has no command`);
      return 1;
    }
    for (const argv of steps) {
      const code = await this.spawnBun(task.id, argv, task.env);
      if (code !== 0) return code;
    }
    return 0;
  }

  private spawnBun(
    id: string,
    argv: string[],
    extraEnv?: Record<string, string>,
  ): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn("bun", argv, {
        cwd: this.root,
        stdio: "inherit",
        env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
      });
      child.on("error", (error) => {
        console.error(`check: ${id} failed to start: ${error.message}`);
        resolve(1);
      });
      child.on("exit", (code) => resolve(code ?? 1));
    });
  }
}
