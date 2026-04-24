export class RuntimeState {
  readonly startedAt = new Date();

  #isReady = false;
  #isShuttingDown = false;

  markReady() {
    this.#isReady = true;
  }

  markShuttingDown() {
    this.#isReady = false;
    this.#isShuttingDown = true;
  }

  snapshot() {
    return {
      isReady: this.#isReady,
      isShuttingDown: this.#isShuttingDown,
      startedAt: this.startedAt.toISOString(),
      uptimeMs: Date.now() - this.startedAt.getTime()
    };
  }
}
