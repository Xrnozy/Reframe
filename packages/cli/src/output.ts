import { frameworkLabel, stackLimitations, type ProjectFramework } from "@reframe/dev-server";

export interface Output {
  stdout(message: string): void;
  stderr(message: string): void;
}

export const processOutput: Output = {
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message),
};

export function readyMessage(url: string, browserOpened: boolean): string {
  return `Reframe\n\n✓ Reframe Dev Server started\n${browserOpened ? "✓ Browser opened" : "⚠ Browser did not open"}\n\nReframe is running at:\n${url}\n\nPress Ctrl+C to stop.\n`;
}

export function projectReadyMessage(
  project: { framework: ProjectFramework; styling: string; packageManager: string | null; command: { executable: string; args: readonly string[] } | null; confidence?: "high" | "medium" | "low" },
  projectUrl: string,
  browserOpened: boolean,
  runtime?: { url: string; ownership: boolean },
): string {
  const framework = frameworkLabel(project.framework);
  const command = project.command ? [project.command.executable, ...project.command.args].join(" ") : "Reframe static server";
  const limitations = stackLimitations(project.framework, project.styling as "plain-css" | "css-modules" | "tailwind" | "unknown");
  const runtimeLine = runtime?.ownership === false
    ? `✓ Attached to existing development server at ${runtime.url}`
    : `✓ Development server started at ${runtime?.url ?? projectUrl}`;
  const limitationBlock = limitations.length ? `\nLimitations:\n${limitations.map((item) => `- ${item}`).join("\n")}\n` : "";
  const confidenceLine = project.confidence && project.confidence !== "high" ? `⚠ Detection confidence: ${project.confidence}\n` : "";
  return `Reframe\n\n✓ Project detected: ${framework}\n✓ Styling detected: ${project.styling}\n✓ Package manager: ${project.packageManager ?? "none"}\n✓ Development command: ${command}\n${confidenceLine}${runtimeLine}\n✓ Reframe Dev Server started\n${browserOpened ? "✓ Browser opened" : "⚠ Browser did not open"}\n${limitationBlock}\nPress Ctrl+C to stop.\n`;
}
