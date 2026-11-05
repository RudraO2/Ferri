export interface RoomLine {
  id: string;
  senderId: string;
  sender: string;
  body: string;
  timestamp: number;
  fromFerri: boolean;
}

/**
 * Recent messages per room, kept in memory from the event stream. The first
 * time a room is seen, it is filled once from Switch (`read_context`).
 */
export class RoomHistory {
  private readonly rooms = new Map<string, RoomLine[]>();
  private readonly loading = new Map<string, Promise<void>>();

  constructor(
    private readonly load: (roomId: string) => Promise<RoomLine[]>,
    private readonly max = 40,
  ) {}

  async ensure(roomId: string): Promise<void> {
    if (this.rooms.has(roomId)) return;
    let p = this.loading.get(roomId);
    if (!p) {
      p = this.load(roomId)
        .catch(() => [] as RoomLine[])
        .then((lines) => {
          const merged = this.rooms.get(roomId) ?? [];
          this.rooms.set(roomId, merged);
          for (const l of lines) this.push(roomId, l);
        })
        .finally(() => this.loading.delete(roomId));
      this.loading.set(roomId, p);
    }
    await p;
  }

  push(roomId: string, line: RoomLine): void {
    const list = this.rooms.get(roomId) ?? [];
    if (list.some((l) => l.id === line.id)) return;
    list.push(line);
    list.sort((a, b) => a.timestamp - b.timestamp);
    if (list.length > this.max) list.splice(0, list.length - this.max);
    this.rooms.set(roomId, list);
  }

  /** Lines before a message, oldest first. */
  before(roomId: string, messageId: string, n = 12): RoomLine[] {
    const list = this.rooms.get(roomId) ?? [];
    const i = list.findIndex((l) => l.id === messageId);
    return (i < 0 ? list : list.slice(0, i)).slice(-n);
  }

  /** Lines after a message, oldest first. */
  after(roomId: string, messageId: string): RoomLine[] {
    const list = this.rooms.get(roomId) ?? [];
    const i = list.findIndex((l) => l.id === messageId);
    return i < 0 ? [] : list.slice(i + 1);
  }
}
