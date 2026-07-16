/**
 * Fast staged/workspace secret scan for pre-commit and local gates.
 * Looks for known secret prefixes and private-key markers in text files.
 */
export class SecretScan {
  private static readonly patterns: readonly { name: string; regex: RegExp }[] =
    [
      { name: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
      { name: "github-pat", regex: /\bghp_[A-Za-z0-9]{36}\b/ },
      { name: "github-oauth", regex: /\bgho_[A-Za-z0-9]{36}\b/ },
      { name: "slack-token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
      {
        name: "private-key",
        regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      },
      {
        name: "clerk-secret",
        regex: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/,
      },
      {
        name: "generic-api-key-assignment",
        regex:
          /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\b\s*[:=]\s*['"][^'"]{16,}['"]/i,
      },
    ];

  private static readonly skipPathFragments = [
    "node_modules/",
    "dist/",
    ".artifacts/",
    "graphify-out/",
    "bun.lock",
    "package-lock.json",
    ".env.example",
    "scripts/SecretScan.ts",
    "scripts/check-secrets.ts",
  ] as const;

  constructor(private readonly fixtureAllowlist: readonly string[] = []) {}

  shouldScanPath(path: string): boolean {
    const normalized = path.replaceAll("\\", "/");
    if (
      SecretScan.skipPathFragments.some((fragment) =>
        normalized.includes(fragment),
      )
    ) {
      return false;
    }
    if (this.fixtureAllowlist.some((allowed) => normalized.endsWith(allowed))) {
      return false;
    }
    return true;
  }

  findFindings(
    path: string,
    content: string,
  ): { path: string; name: string; line: number }[] {
    if (!this.shouldScanPath(path)) return [];
    const findings: { path: string; name: string; line: number }[] = [];
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      for (const pattern of SecretScan.patterns) {
        if (pattern.regex.test(line)) {
          findings.push({ path, name: pattern.name, line: index + 1 });
        }
      }
    }
    return findings;
  }
}
