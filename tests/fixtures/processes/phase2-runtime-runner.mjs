import { pathToFileURL } from "node:url";

const [modulePath, root, deadlineText] = process.argv.slice(2);
if (!modulePath || !root) throw new Error("module path and project root are required");
const { detectProject, startProject } = await import(pathToFileURL(modulePath).href);
const descriptor = await detectProject(root);
const progress = [];
const viteBin = process.env.REFRAME_TEST_VITE_BIN;
const runtime = await startProject(descriptor, {
  deadlineMs: Number(deadlineText ?? 10_000),
  onProgress: (message) => progress.push(message),
  resolveCommand: viteBin ? () => ({ executable: process.execPath, args: [viteBin, "--host", "127.0.0.1"] }) : undefined,
});
try {
  const response = await fetch(runtime.url);
  process.stdout.write(`${JSON.stringify({ descriptor, url: runtime.url, command: runtime.command, status: response.status, body: await response.text(), progress })}\n`);
} finally {
  await runtime.stop();
}
