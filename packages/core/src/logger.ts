/**
 * A logger with no framework behind it.
 *
 * Replaces NestJS's Logger so this package runs anywhere — a serverless function, a long-lived
 * Node server, or a test — without dragging a web framework along with the scheduling engine.
 */
export class Logger {
  constructor(private readonly context: string) {}

  log(message: string): void {
    console.log(`[${this.context}] ${message}`);
  }

  warn(message: string): void {
    console.warn(`[${this.context}] ${message}`);
  }

  error(message: string, detail?: unknown): void {
    console.error(`[${this.context}] ${message}`, detail ?? '');
  }
}
