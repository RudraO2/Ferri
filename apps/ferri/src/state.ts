import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getState, setState, type Db } from "@ferri/db";

interface ConnectionState {
  connectionId: string;
  cursor?: string;
}

const KEY = "switch_connection";

/**
 * The Switch connection id and read cursor, kept in Postgres so a restart
 * resumes the same connection instead of replaying or skipping events.
 * Spec 01 kept them in `.ferri-state/connection.json`; that file is imported once.
 */
export class ConnectionStore {
  private timer: NodeJS.Timeout | null = null;
  private writing: Promise<void> = Promise.resolve();

  private constructor(
    private readonly db: Db,
    private data: ConnectionState,
  ) {}

  static async open(db: Db, legacyDir: string): Promise<ConnectionStore> {
    let data = await getState<ConnectionState>(db, KEY);
    if (!data) {
      const legacy = path.join(legacyDir, "connection.json");
      try {
        data = JSON.parse(fs.readFileSync(legacy, "utf8")) as ConnectionState;
      } catch {
        data = { connectionId: randomUUID() };
      }
      await setState(db, KEY, data);
    }
    return new ConnectionStore(db, data);
  }

  get connectionId(): string {
    return this.data.connectionId;
  }

  get cursor(): string | undefined {
    return this.data.cursor;
  }

  setCursor(cursor: string): void {
    this.data.cursor = cursor;
    // Debounced: one write per second at most, however busy the stream is.
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), 1000);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const snapshot = { ...this.data };
    this.writing = this.writing.then(() => setState(this.db, KEY, snapshot)).catch(() => {});
    await this.writing;
  }
}
