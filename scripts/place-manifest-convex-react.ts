/**
 * Convex projection writes react hooks under convex/src/lib when output is
 * `convex/`. Capsule authors import from src/lib/manifest-convex-react.ts.
 * Move the generated file into place and drop the nested convex/src tree.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const generated = path.join(
  root,
  "convex",
  "src",
  "lib",
  "manifest-convex-react.ts",
);
const targetDir = path.join(root, "src", "lib");
const target = path.join(targetDir, "manifest-convex-react.ts");

if (!existsSync(generated)) {
  console.error(
    `place-manifest-convex-react: missing generated file at ${generated}`,
  );
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
copyFileSync(generated, target);
rmSync(path.join(root, "convex", "src"), { recursive: true, force: true });
rmSync(path.join(root, "convex", "generation.manifest.json"), {
  force: true,
});
console.log(
  `place-manifest-convex-react: wrote ${path.relative(root, target)}`,
);
