import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { canBind, reservePort } from "../helpers/port-probe.js";
import { startManagedProcess, startViteDemo, type ManagedProcess } from "../helpers/process-harness.js";
import { projectRoot } from "../helpers/paths.js";

function processExists(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

describe("Phase 0 real process and readiness harness", () => {
  test("P0-06 cleanup after a thrown test kills the entire process tree, releases its port, and retains diagnostics", async () => {
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "reframe leak evidence ü "));
    const childPidFile = path.join(temporaryRoot, "child.pid");
    const parentScript = path.join(projectRoot, "tests", "fixtures", "processes", "leaky-parent.mjs");
    const managed = await startManagedProcess({
      executable: process.execPath,
      args: [parentScript, String(port), childPidFile],
      cwd: projectRoot,
      readyUrl: `http://127.0.0.1:${port}/`,
      port,
    });
    const childPid = Number(await readFile(childPidFile, "utf8"));
    let observedFailure = "";
    try { throw new Error("intentional harness body failure"); }
    catch (error) { observedFailure = String(error); }
    finally { await managed.stop(); }
    expect(observedFailure).toContain("intentional harness body failure");
    expect(managed.stdout.join("")).toContain("child-ready");
    expect(processExists(childPid)).toBe(false);
    expect(await canBind(port)).toBe(true);
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  test("P0-09 real Vanilla and React Vite process trees reach HTTP readiness and release ports after stop", async () => {
    const vanillaPort = await reservePort();
    const reactPort = await reservePort();
    await Promise.all([vanillaPort.release(), reactPort.release()]);
    const servers: ManagedProcess[] = [];
    try {
      servers.push(await startViteDemo(path.join(projectRoot, "demo", "vanilla-demo"), vanillaPort.port));
      servers.push(await startViteDemo(path.join(projectRoot, "demo", "react-demo"), reactPort.port));
      const [vanillaResponse, reactResponse] = await Promise.all([
        fetch(`http://127.0.0.1:${vanillaPort.port}/`),
        fetch(`http://127.0.0.1:${reactPort.port}/`),
      ]);
      expect(vanillaResponse.status).toBe(200);
      expect(await vanillaResponse.text()).toContain("Reframe Vanilla Demo");
      expect(reactResponse.status).toBe(200);
      expect(await reactResponse.text()).toContain("Reframe React Demo");
      expect(servers.every((server) => server.pid > 0)).toBe(true);
    } finally {
      await Promise.all(servers.map((server) => server.stop()));
    }
    expect(await canBind(vanillaPort.port)).toBe(true);
    expect(await canBind(reactPort.port)).toBe(true);
  });
});
