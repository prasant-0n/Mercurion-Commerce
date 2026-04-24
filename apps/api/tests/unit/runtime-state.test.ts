import { describe, expect, it } from "vitest";

import { RuntimeState } from "../../src/shared/runtime/runtime-state";

describe("RuntimeState", () => {
  it("tracks readiness and shutdown transitions", () => {
    const runtimeState = new RuntimeState();

    const initialSnapshot = runtimeState.snapshot();
    expect(initialSnapshot.isReady).toBe(false);
    expect(initialSnapshot.isShuttingDown).toBe(false);
    expect(initialSnapshot.uptimeMs).toBeGreaterThanOrEqual(0);

    runtimeState.markReady();

    const readySnapshot = runtimeState.snapshot();
    expect(readySnapshot.isReady).toBe(true);
    expect(readySnapshot.isShuttingDown).toBe(false);

    runtimeState.markShuttingDown();

    const shutdownSnapshot = runtimeState.snapshot();
    expect(shutdownSnapshot.isReady).toBe(false);
    expect(shutdownSnapshot.isShuttingDown).toBe(true);
  });
});
