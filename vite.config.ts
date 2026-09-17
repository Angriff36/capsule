import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv, normalizePath, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

const MARKITDOWN_MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MARKITDOWN_MAX_OUTPUT_BYTES = 512 * 1024;
const MARKITDOWN_TIMEOUT_MS = 45_000;

async function readRequestBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      request.destroy();
      throw new Error("Request body is too large.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function runMarkItDown(input: Buffer): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "capsule-markitdown-"));
  const inputPath = join(tempDir, "attachment.pdf");
  await writeFile(inputPath, input);

  try {
    return await new Promise((resolve, reject) => {
      const child = spawn("markitdown", [inputPath], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const output: Buffer[] = [];
      let outputBytes = 0;
      let errorOutput = "";
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;

      const finish = (error: Error | null, text?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve(text ?? "");
      };
      timeout = setTimeout(() => {
        child.kill();
        finish(new Error("MarkItDown timed out."));
      }, MARKITDOWN_TIMEOUT_MS);

      child.stdout.on("data", (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > MARKITDOWN_MAX_OUTPUT_BYTES) {
          child.kill();
          finish(new Error("MarkItDown output is too large."));
          return;
        }
        output.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (errorOutput.length < 4_000) errorOutput += chunk.toString("utf8");
      });
      child.on("error", (error) => finish(error));
      child.on("close", (code) => {
        if (settled) return;
        if (code !== 0) {
          finish(
            new Error(
              errorOutput.trim() ||
                `MarkItDown exited with code ${code ?? "unknown"}.`,
            ),
          );
          return;
        }
        finish(null, Buffer.concat(output).toString("utf8"));
      });
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/** Dev-only HTTP bridge for a globally installed Microsoft MarkItDown CLI. */
function markItDownDev(): Plugin {
  return {
    name: "capsule-markitdown-dev",
    configureServer(server) {
      server.middlewares.use(
        "/api/assistant/markitdown",
        async (request, response) => {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.setHeader("Allow", "POST");
            response.end();
            return;
          }
          try {
            const input = await readRequestBody(
              request,
              MARKITDOWN_MAX_INPUT_BYTES,
            );
            const markdown = await runMarkItDown(input);
            response.statusCode = 200;
            response.setHeader("Content-Type", "text/markdown; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(markdown);
          } catch (error) {
            response.statusCode =
              error instanceof Error &&
              error.message === "Request body is too large."
                ? 413
                : 503;
            response.setHeader(
              "Content-Type",
              "application/json; charset=utf-8",
            );
            response.end(
              JSON.stringify({
                error:
                  error instanceof Error
                    ? error.message
                    : "MarkItDown is unavailable.",
              }),
            );
          }
        },
      );
    },
  };
}

/**
 * Dev-only twin of api/manifest/[...path].ts (the Vercel function): serves
 * the API-key command gateway on the Vite host so a remote agent can be
 * tried against the local backend. Same handler, same contract.
 */
function apiKeyGatewayDev(env: Record<string, string>): Plugin {
  return {
    name: "capsule-api-key-gateway-dev",
    configureServer(server) {
      server.middlewares.use("/api/manifest", async (req, res, next) => {
        if (!env.CLERK_SECRET_KEY) return next();
        const { createApiKeyGateway, createClerkApiKeyGatewayDeps } =
          await server.ssrLoadModule("./src/agent/CapsuleApiKeyGateway.ts");
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = Buffer.concat(chunks);
        const url = `http://${req.headers.host}/api/manifest${req.url ?? ""}`;
        const response: Response = await createApiKeyGateway(
          createClerkApiKeyGatewayDeps(env),
        )(
          new Request(url, {
            method: req.method,
            headers: Object.entries(req.headers).flatMap(([k, v]) =>
              typeof v === "string" ? [[k, v] as [string, string]] : [],
            ),
            body: body.length > 0 ? body : undefined,
          }),
        );
        res.statusCode = response.status;
        res.setHeader(
          "Content-Type",
          response.headers.get("content-type") ?? "application/json",
        );
        res.end(await response.text());
      });
    },
  };
}

/**
 * Watch ignores: Vite defaults watch the whole repo. Edits under docs/,
 * .gitattributes, .pw-verify/, etc. were triggering full client page reloads
 * ("constantly refreshing"). Only source that can affect the app bundle
 * should invalidate the client.
 */
const watchIgnored = [
  "**/.git/**",
  "**/.artifacts/**",
  "**/.aboardai/**",
  "**/.builder/**",
  "**/.pw-verify/**",
  "**/.playwright-mcp/**",
  // Ignore child worktrees, not this checkout when it lives inside one.
  `${normalizePath(fileURLToPath(new URL("./.loop-worktrees", import.meta.url)))}/**`,
  "**/docs/**",
  "**/diagrams/**",
  "**/output/**",
  "**/generated/**",
  "**/scripts/**",
  "**/convex/lib/**",
  "**/package.json",
  "**/.gitattributes",
  "**/.gitignore",
  "**/PRODUCT-BACKLOG.md",
  "**/loop-ledger.json",
  "**/loop-run-log.md",
  "**/AGENTS.md",
  "**/CLAUDE.md",
];

export default defineConfig(({ mode }) => ({
  // host: true → listen on 0.0.0.0 so both http://localhost:7811 and
  // http://127.0.0.1:7811 work. Pinning only 127.0.0.1 broke "localhost";
  // pinning nothing on Windows sometimes bound ::1 only.
  server: {
    host: true,
    port: 7811,
    strictPort: true,
    watch: { ignored: watchIgnored },
  },
  preview: {
    host: true,
    port: 7811,
    strictPort: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    apiKeyGatewayDev(loadEnv(mode, process.cwd(), "")),
    markItDownDev(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Each worker loads the generated Convex runtime. Oversubscribing large
    // machines adds contention and makes otherwise fast proofs time out.
    maxWorkers: Math.min(8, availableParallelism()),
    include: ["tests/**/*.test.ts"],
    environmentMatchGlobs: [["tests/proofs/**", "edge-runtime"]],
    server: { deps: { inline: ["convex-test"] } },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: ".artifacts/coverage",
      include: ["src/app/auth/**", "src/app/navigation/**"],
      thresholds: {
        // Ratchet only upward. Measured 2026-07-16 on membership + nav catalog.
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 100,
      },
    },
  },
}));
