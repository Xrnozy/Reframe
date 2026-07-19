import { randomBytes } from "node:crypto";
import net, { type Socket } from "node:net";

export interface RawHandshakeOptions {
  readonly origin?: string;
  readonly host?: string;
  readonly protocols?: readonly string[];
  readonly connectHost?: string;
}

export interface RawHandshakeResult {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly client?: RawWebSocketClient;
}

function clientFrame(opcode: number, payload: Buffer): Buffer {
  const mask = randomBytes(4);
  let header: Buffer;
  if (payload.length < 126) header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
  else if (payload.length <= 65_535) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  const masked = Buffer.allocUnsafe(payload.length);
  for (let index = 0; index < payload.length; index += 1) masked[index] = payload[index]! ^ mask[index % 4]!;
  return Buffer.concat([header, mask, masked]);
}

export class RawWebSocketClient {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly messages: string[] = [];
  private readonly messageWaiters: Array<(value: string) => void> = [];
  private closeResult: { code: number; reason: string } | undefined;
  private readonly closeWaiters: Array<(value: { code: number; reason: string }) => void> = [];

  constructor(readonly socket: Socket, head = Buffer.alloc(0)) {
    socket.on("data", (chunk: Buffer) => this.accept(chunk));
    socket.once("close", () => this.finishClose(this.closeResult ?? { code: 1006, reason: "socket closed" }));
    if (head.length) this.accept(head);
  }

  private accept(chunk: Buffer): void {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (this.buffer.length >= 2) {
      const opcode = this.buffer[0]! & 0x0f;
      let length = this.buffer[1]! & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      if (this.buffer.length < offset + length) return;
      const payload = this.buffer.subarray(offset, offset + length);
      this.buffer = this.buffer.subarray(offset + length);
      if (opcode === 1) {
        const value = payload.toString("utf8");
        const waiter = this.messageWaiters.shift();
        if (waiter) waiter(value); else this.messages.push(value);
      } else if (opcode === 8) {
        const result = payload.length >= 2 ? { code: payload.readUInt16BE(0), reason: payload.subarray(2).toString("utf8") } : { code: 1005, reason: "" };
        this.finishClose(result);
      } else if (opcode === 9) {
        this.socket.write(clientFrame(10, payload));
      }
    }
  }

  private finishClose(value: { code: number; reason: string }): void {
    if (!this.closeResult) this.closeResult = value;
    for (const waiter of this.closeWaiters.splice(0)) waiter(this.closeResult);
  }

  sendText(value: string): void { this.socket.write(clientFrame(1, Buffer.from(value))); }
  sendJson(value: unknown): void { this.sendText(JSON.stringify(value)); }
  async sendMany(values: readonly unknown[]): Promise<void> {
    const body = Buffer.concat(values.map((value) => clientFrame(1, Buffer.from(JSON.stringify(value)))));
    if (!this.socket.write(body)) await new Promise<void>((resolve) => this.socket.once("drain", resolve));
  }
  sendOversizedDeclared(length: number): void {
    const header = Buffer.allocUnsafe(14);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(length), 2);
    randomBytes(4).copy(header, 10);
    this.socket.write(header);
  }
  nextText(timeoutMs = 2_000): Promise<string> {
    const existing = this.messages.shift();
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket message timeout")), timeoutMs);
      this.messageWaiters.push((value) => { clearTimeout(timer); resolve(value); });
    });
  }
  async nextJson<T = Record<string, unknown>>(timeoutMs = 2_000): Promise<T> { return JSON.parse(await this.nextText(timeoutMs)) as T; }
  waitForClose(timeoutMs = 2_000): Promise<{ code: number; reason: string }> {
    if (this.closeResult) return Promise.resolve(this.closeResult);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket close timeout")), timeoutMs);
      this.closeWaiters.push((value) => { clearTimeout(timer); resolve(value); });
    });
  }
  close(): void {
    if (!this.socket.destroyed) {
      this.socket.write(clientFrame(8, Buffer.from([0x03, 0xe8])));
      this.socket.destroy();
    }
  }
}

export async function rawWebSocketHandshake(urlInput: string, options: RawHandshakeOptions = {}): Promise<RawHandshakeResult> {
  const url = new URL(urlInput);
  const connectHost = options.connectHost ?? url.hostname.replace(/^\[|\]$/g, "");
  const port = Number(url.port);
  const socket = net.connect({ host: connectHost, port });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  const key = randomBytes(16).toString("base64");
  const headers = [
    `GET ${url.pathname}${url.search} HTTP/1.1`,
    `Host: ${options.host ?? url.host}`,
    "Connection: Upgrade",
    "Upgrade: websocket",
    "Sec-WebSocket-Version: 13",
    `Sec-WebSocket-Key: ${key}`,
    ...(options.origin ? [`Origin: ${options.origin}`] : []),
    ...(options.protocols?.length ? [`Sec-WebSocket-Protocol: ${options.protocols.join(", ")}`] : []),
    "",
    "",
  ];
  socket.write(headers.join("\r\n"));
  return await new Promise<RawHandshakeResult>((resolve, reject) => {
    let buffer: Buffer = Buffer.alloc(0);
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("WebSocket handshake timeout")); }, 2_000);
    const onData = (chunk: Buffer) => {
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
      const boundary = buffer.indexOf("\r\n\r\n");
      if (boundary < 0) return;
      const headerText = buffer.subarray(0, boundary).toString("utf8");
      const lines = headerText.split("\r\n");
      const status = Number(lines[0]?.split(" ")[1]);
      const parsedHeaders: Record<string, string> = {};
      for (const line of lines.slice(1)) {
        const separator = line.indexOf(":");
        if (separator > 0) parsedHeaders[line.slice(0, separator).toLowerCase()] = line.slice(separator + 1).trim();
      }
      const start = boundary + 4;
      const length = Number(parsedHeaders["content-length"] ?? 0);
      if (buffer.length < start + length) return;
      clearTimeout(timer);
      socket.off("data", onData);
      const body = buffer.subarray(start, start + length).toString("utf8");
      const head = buffer.subarray(start + length);
      if (status === 101) resolve({ status, headers: parsedHeaders, body, client: new RawWebSocketClient(socket, head) });
      else { socket.destroy(); resolve({ status, headers: parsedHeaders, body }); }
    };
    socket.on("data", onData);
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

