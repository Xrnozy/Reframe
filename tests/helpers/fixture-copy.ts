import { cp, mkdtemp, realpath, rm, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateFixture, type FixtureManifest } from "./fixture-manifest.js";
import { reservePort, type PortReservation } from "./port-probe.js";

export interface FixtureCopy {
  readonly root: string;
  readonly port: number;
  readonly manifest: FixtureManifest;
  releasePort(): Promise<void>;
  cleanup(): Promise<void>;
}

export interface FixtureCopyOptions {
  baseDirectory?: string;
  beforeFinalize?: (copyRoot: string) => Promise<void>;
}

async function removeFixture(root: string): Promise<void> {
  const nodeModules = path.join(root, "node_modules");
  await rm(path.join(nodeModules, ".vite"), { recursive: true, force: true, maxRetries: 30, retryDelay: 50 });
  await rmdir(nodeModules).catch(() => undefined);
  await rm(root, { recursive: true, force: true, maxRetries: 30, retryDelay: 50 });
}

export async function createFixtureCopy(templateRoot: string, options: FixtureCopyOptions = {}): Promise<FixtureCopy> {
  await validateFixture(templateRoot);
  const base = options.baseDirectory ?? os.tmpdir();
  const root = await realpath(await mkdtemp(path.join(base, "reframe phase0 \u00fc-")));
  let reservation: PortReservation | undefined;
  try {
    await cp(templateRoot, root, { recursive: true, force: false, preserveTimestamps: true });
    await options.beforeFinalize?.(root);
    const manifest = await validateFixture(root);
    reservation = await reservePort();
    let cleaned = false;
    return {
      root,
      port: reservation.port,
      manifest,
      releasePort: () => reservation!.release(),
      async cleanup() {
        if (cleaned) return;
        cleaned = true;
        await reservation!.release();
        await removeFixture(root);
      },
    };
  } catch (error) {
    await reservation?.release().catch(() => undefined);
    await removeFixture(root).catch(() => undefined);
    throw error;
  }
}
