export type ShutdownSignal = "SIGINT" | "SIGTERM";

export interface SignalTarget {
  on(event: ShutdownSignal, listener: () => void): unknown;
  off(event: ShutdownSignal, listener: () => void): unknown;
}

export function installSignalHandlers(target: SignalTarget, shutdown: () => void, force = shutdown, forceAfterMs = 1_500): () => void {
  let firstSignalAt: number | undefined;
  const handler = () => {
    const now = performance.now();
    if (firstSignalAt !== undefined && now - firstSignalAt >= forceAfterMs) force();
    else {
      firstSignalAt ??= now;
      shutdown();
    }
  };
  target.on("SIGINT", handler);
  target.on("SIGTERM", handler);
  return () => {
    target.off("SIGINT", handler);
    target.off("SIGTERM", handler);
  };
}
