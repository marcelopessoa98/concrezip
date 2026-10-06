import type { LogEntry } from "../types";

type Listener = (entries: readonly LogEntry[]) => void;

class Logger {
  private entries: LogEntry[] = [];
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.entries);
    return () => this.listeners.delete(listener);
  }

  info(message: string): void {
    this.add(message, "info");
  }

  warning(message: string): void {
    this.add(message, "warning");
  }

  error(message: string): void {
    this.add(message, "error");
  }

  clear(): void {
    this.entries = [];
    this.emit();
  }

  private add(message: string, level: LogEntry["level"]): void {
    this.entries.push({
      time: new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" }).format(new Date()),
      message,
      level,
    });
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.entries);
  }
}

export const logger = new Logger();
