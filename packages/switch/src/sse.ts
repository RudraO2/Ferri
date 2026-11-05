import type { SseFrame } from "./types.ts";

/**
 * Incremental parser for a text/event-stream body.
 * Feed it decoded text chunks; it returns every complete frame.
 * Comment lines (":keepalive") are dropped, as the spec says.
 */
export class SseParser {
  private buffer = "";
  private id: string | undefined;
  private event = "message";
  private data: string[] = [];

  push(chunk: string): SseFrame[] {
    this.buffer += chunk;
    const frames: SseFrame[] = [];
    let newline: number;
    while ((newline = this.buffer.search(/\r\n|\r|\n/)) !== -1) {
      // A lone "\r" at the end may be the first half of a "\r\n" split across chunks.
      if (newline === this.buffer.length - 1 && this.buffer.endsWith("\r")) break;
      const line = this.buffer.slice(0, newline);
      const sepLength = this.buffer.startsWith("\r\n", newline) ? 2 : 1;
      this.buffer = this.buffer.slice(newline + sepLength);
      const frame = this.line(line);
      if (frame) frames.push(frame);
    }
    return frames;
  }

  private line(line: string): SseFrame | null {
    if (line === "") {
      if (this.data.length === 0) {
        this.event = "message";
        return null;
      }
      const frame: SseFrame = { event: this.event, data: this.data.join("\n") };
      if (this.id !== undefined) frame.id = this.id;
      this.data = [];
      this.event = "message";
      this.id = undefined;
      return frame;
    }
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.data.push(value);
    else if (field === "event") this.event = value;
    else if (field === "id") this.id = value;
    return null;
  }
}
