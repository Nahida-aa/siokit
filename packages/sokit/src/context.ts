/**
 * Interface for the execution context in a web worker or similar environment.
 */
export interface ExecutionContext {
  /**
   * Extends the lifetime of the event callback until the promise is settled.
   *
   * @param promise - A promise to wait for.
   */
  waitUntil(promise: Promise<unknown>): void
  /**
   * Allows the event to be passed through to subsequent event listeners.
   */
  passThroughOnException(): void
  /**
   * For compatibility with Wrangler 4.x.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: any
  /**
   * For compatibility with Wrangler 4.x.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exports?: any
}