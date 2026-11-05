import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

interface ConnectionFile {
  connectionId: string;
  cursor?: string;
}

/**
 * The connection id and read cursor, kept on disk so a restart resumes the
 * same Switch connection instead of replaying or skipping events.
 * Moves into Postgres with spec 02.
 */
export class ConnectionStore {
  private readonly file: string;
  private data: ConnectionFile;
  private timer: NodeJS.Timeout | null = null;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "connection.json");
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, "utf8")) as ConnectionFile;
    } catch {
      this.data = { connectionId: randomUUID() };
      this.flush();
    }
  }

  get connectionId(): string {
    return this.data.connectionId;
  }

  get cursor(): string | undefined {
    return this.data.cursor;
  }

  setCursor(cursor: string): void {
    this.data.cursor = cursor;
    // Debounced: the folder may sit under OneDrive, which dislikes rapid rewrites.
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 1000);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}
