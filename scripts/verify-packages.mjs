import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), "jev-package-verification-"));
const packages = [
  ["core", "jev-router-core"],
  ["ai-sdk", "jev-ai-sdk-router"],
  ["typesafe", "jev-typesafe-router"],
  ["langgraph", "jev-langgraph-router"],
];

try {
  const tarballs = [];
  for (const [directory, name] of packages) {
    const packageJson = JSON.parse(
      await readFile(join(root, "packages", directory, "package.json"), "utf8"),
    );
    execFileSync(
      "pnpm",
      ["--dir", `packages/${directory}`, "pack", "--pack-destination", temporary],
      {
        cwd: root,
        stdio: "pipe",
      },
    );
    const tarball = join(temporary, `${name}-${packageJson.version}.tgz`);
    const entries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).split("\n");
    for (const required of [
      "package/LICENSE",
      "package/README.md",
      "package/dist/index.js",
      "package/dist/index.d.ts",
    ]) {
      if (!entries.includes(required)) throw new Error(`${name} tarball is missing ${required}`);
    }
    tarballs.push(tarball);
  }

  const consumer = join(temporary, "consumer");
  await mkdir(consumer);
  execFileSync(
    "npm",
    [
      "install",
      "--prefix",
      consumer,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...tarballs,
      "@langchain/langgraph@1.4.17",
      "@typesafe-ai/sdk@0.6.0",
      "ai@7.0.110",
    ],
    { cwd: root, stdio: "pipe" },
  );
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import { createJevRouter } from "jev-langgraph-router"; import { createJevEvaluator } from "jev-ai-sdk-router"; import { createTypeSafeEvaluator } from "jev-typesafe-router"; if (typeof createJevEvaluator !== "function" || typeof createTypeSafeEvaluator !== "function") throw new Error("adapter import failed"); const router = createJevRouter({ routes: { answer: "answer", human: "review" }, selectState: state => state.message, evaluator: { evaluate: async () => ({ route: "answer", probability: 1 }) }, fallback: "human" }); if (await router({ message: "hello" }, {}) !== "answer") throw new Error("packed router failed");',
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  console.log("All package tarballs contain licenses and work in a clean consumer install.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
