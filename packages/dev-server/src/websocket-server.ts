import { REFRAME_MAX_MESSAGE_BYTES, REFRAME_PROTOCOL_NAME, REFRAME_PROTOCOL_VERSION, validateClientMessage, type AiActionMessage, type AiGenerateMessage, type AnnotationActionMessage, type AnnotationCreateMessage, type AnnotationListMessage, type AnnotationStateMessage, type ClientMessage, type EditApplyMessage, type EditVerificationMessage, type HistoryRequestMessage, type HistoryStateMessage, type MappingRequestMessage, type ProtocolErrorCode, type ServerErrorMessage, type ServerMessage, type ServerReadyMessage } from "@reframe/shared";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { TextDecoder } from "node:util";

export interface ReframeProjectConnectionInfo {
  readonly id: string;
  readonly name: string;
  readonly framework: string;
  readonly capabilities: { readonly canExplore: boolean; readonly canWriteSource: boolean };
}

export interface ConnectionDiagnostics {
  readonly activeConnections: number;
  readonly acceptedConnections: number;
  readonly closedConnections: number;
  readonly routedMessages: number;
  readonly rejectedMessages: number;
  readonly rateLimitedMessages: number;
  readonly acceptedProposals: number;
  readonly connectionIds: readonly string[];
  readonly routedByConnection: Readonly<Record<string, number>>;
  readonly routedByType: Readonly<Record<string, number>>;
}

export interface ReframeConnectionOptions {
  readonly sessionId: string;
  readonly token: string;
  readonly project: ReframeProjectConnectionInfo;
  readonly available?: boolean;
  readonly heartbeatIntervalMs?: number;
  readonly heartbeatTimeoutMs?: number;
  readonly verificationTimeoutMs?: number;
  readonly logCode?: (code: ProtocolErrorCode) => void;
  readonly onMappingRequest?: (request: Readonly<MappingRequestMessage>) => MappingResponse | Promise<MappingResponse>;
  readonly onEditProposal?: (proposal: Readonly<EditApplyMessage>, verifyInBrowser: (width: number, recovery?: boolean, height?: number) => Promise<boolean>) => EditProposalResponse | void | Promise<EditProposalResponse | void>;
  readonly onHistoryState?: (request: Readonly<HistoryRequestMessage>) => HistoryStateResponse | Promise<HistoryStateResponse>;
  readonly onHistoryRestore?: () => HistoryRestoreResponse | Promise<HistoryRestoreResponse>;
  readonly onAiGenerate?: (message: Readonly<AiGenerateMessage>, mapping: Readonly<MappingRequestMessage>, result: Readonly<MappingResponse>) => AiStateResponse | Promise<AiStateResponse>;
  readonly onAiAction?: (message: Readonly<AiActionMessage>) => AiStateResponse | Promise<AiStateResponse>;
  readonly onAnnotationList?: (message: Readonly<AnnotationListMessage>) => AnnotationStateResponse | Promise<AnnotationStateResponse>;
  readonly onAnnotationCreate?: (message: Readonly<AnnotationCreateMessage>) => AnnotationActionResponse | Promise<AnnotationActionResponse>;
  readonly onAnnotationAction?: (message: Readonly<AnnotationActionMessage>) => AnnotationActionResponse | Promise<AnnotationActionResponse>;
}

export interface MappingResponse {
  readonly confidence: "exact" | "probable" | "ambiguous" | "not-mapped";
  readonly evidence: string;
  readonly candidates: ReadonlyArray<{ readonly path: string; readonly evidence: string; readonly line: number }>;
  readonly requiresImpactApproval: boolean;
}

export interface EditProposalResponse {
  readonly status: "applied" | "rejected" | "rolled-back" | "critical";
  readonly code: string;
  readonly checkpointId?: string;
  readonly visualComplete?: boolean;
}

export interface HistoryStateResponse {
  readonly currentId: string | null;
  readonly previousId: string | null;
  readonly canRestore: boolean;
  readonly visualComplete: boolean;
  readonly gitAvailable: boolean;
  readonly dirty: boolean;
  readonly incomplete: readonly string[];
  readonly checkpoints?: HistoryStateMessage["checkpoints"];
  readonly comparison?: HistoryStateMessage["comparison"];
}

export interface HistoryRestoreResponse { readonly currentId: string | null }
export interface AiStateResponse { readonly generationId: string; readonly status: "generating" | "review" | "accepted" | "rejected" | "stopped" | "failed" | "compared"; readonly code?: string; readonly changedFiles?: readonly string[]; readonly packetFiles?: readonly string[]; readonly packetBytes?: number; readonly lineage?: readonly string[] }
export interface AnnotationStateResponse { readonly annotations: AnnotationStateMessage["annotations"]; readonly issues: AnnotationStateMessage["issues"]; readonly parsedFiles: number; readonly renderedForRoute: number }
export interface AnnotationActionResponse { readonly annotationId: string | null; readonly proposalId?: string | null }

export interface ReframeConnectionServer {
  configure(origins: readonly string[], hosts: readonly string[]): void;
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void;
  setAvailable(available: boolean): void;
  setPongEnabled(enabled: boolean): void;
  publishAnnotations(state: AnnotationStateResponse): void;
  diagnostics(): ConnectionDiagnostics;
  close(): void;
}

const decoder = new TextDecoder("utf-8", { fatal: true });
const closeCode: Readonly<Record<ProtocolErrorCode, number>> = {
  AUTH_INVALID: 4401,
  CONNECTION_UNAVAILABLE: 1012,
  HEARTBEAT_TIMEOUT: 4408,
  HOST_INVALID: 4403,
  MESSAGE_DIRECTION_INVALID: 4405,
  MESSAGE_MALFORMED: 4400,
  MESSAGE_SCHEMA_INVALID: 4400,
  MESSAGE_TOO_LARGE: 1009,
  MESSAGE_UNKNOWN: 4404,
  ORIGIN_INVALID: 4403,
  PROJECT_INVALID: 4403,
  PROTOCOL_VERSION_UNSUPPORTED: 4406,
  RATE_LIMITED: 4409,
  SELECTION_STALE: 4409,
};

function immutable<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
  }
  return value;
}

function frame(opcode: number, payload: Buffer): Buffer {
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]);
  const header = Buffer.allocUnsafe(4);
  header[0] = 0x80 | opcode;
  header[1] = 126;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase().split("%")[0];
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "::ffff:127.0.0.1";
}

function rejectUpgrade(socket: Duplex, status: number, code: ProtocolErrorCode, log?: (code: ProtocolErrorCode) => void): void {
  log?.(code);
  const body = code;
  socket.end(`HTTP/1.1 ${status} ${status === 426 ? "Upgrade Required" : status === 503 ? "Service Unavailable" : "Forbidden"}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(body)}\r\nX-Reframe-Error: ${code}\r\n\r\n${body}`);
}

export function createReframeConnectionServer(options: ReframeConnectionOptions): ReframeConnectionServer {
  const peers = new Map<string, Peer>();
  const origins = new Set<string>();
  const hosts = new Set<string>();
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 1_000;
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 2_500;
  const verificationTimeoutMs = options.verificationTimeoutMs ?? 10_000;
  let available = options.available ?? true;
  let pongEnabled = true;
  let acceptedConnections = 0;
  let closedConnections = 0;
  let routedMessages = 0;
  let rejectedMessages = 0;
  let rateLimitedMessages = 0;
  let acceptedProposals = 0;
  let lastAnnotationFingerprint = "";
  const routedByConnection: Record<string, number> = {};
  const routedByType: Record<string, number> = {};

  const log = (code: ProtocolErrorCode) => options.logCode?.(code);

  class Peer {
    private buffer: Buffer = Buffer.alloc(0);
    private closed = false;
    private ready = false;
    private heartbeat: NodeJS.Timeout | undefined;
    private awaitingServerPong: { correlationId: string; deadline: number } | undefined;
    private previewWindowStarted = 0;
    private previewCount = 0;
    private selectionId: string | null = null;
    private generation = 0;
    private mapping: { request: MappingRequestMessage; result: MappingResponse } | undefined;
    private readonly proposalIds = new Set<string>();
    private verification: { proposalId: string; selectionId: string; tabId: string; generation: number; width: number; height?: number; timer: NodeJS.Timeout; resolve: (ok: boolean) => void } | undefined;

    constructor(readonly id: string, private readonly socket: Duplex, readonly origin: string) {
      socket.on("data", (chunk: Buffer) => this.accept(chunk));
      socket.once("error", () => this.finish());
      socket.once("close", () => this.finish());
    }

    accept(chunk: Buffer): void {
      if (this.closed || chunk.length === 0) return;
      this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
      while (this.buffer.length >= 2 && !this.closed) {
        const first = this.buffer[0]!;
        const second = this.buffer[1]!;
        const final = (first & 0x80) !== 0;
        const opcode = first & 0x0f;
        const masked = (second & 0x80) !== 0;
        let length = second & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (this.buffer.length < 4) return;
          length = this.buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (this.buffer.length < 10) return;
          const large = this.buffer.readBigUInt64BE(2);
          if (large > BigInt(REFRAME_MAX_MESSAGE_BYTES)) return this.fail("MESSAGE_TOO_LARGE");
          length = Number(large);
          offset = 10;
        }
        if (!final || (first & 0x70) !== 0 || !masked || length > REFRAME_MAX_MESSAGE_BYTES || (opcode >= 8 && length > 125)) return this.fail(length > REFRAME_MAX_MESSAGE_BYTES ? "MESSAGE_TOO_LARGE" : "MESSAGE_MALFORMED");
        if (this.buffer.length < offset + 4 + length) return;
        const mask = this.buffer.subarray(offset, offset + 4);
        offset += 4;
        const payload = Buffer.allocUnsafe(length);
        for (let index = 0; index < length; index += 1) payload[index] = this.buffer[offset + index]! ^ mask[index % 4]!;
        this.buffer = this.buffer.subarray(offset + length);
        if (opcode === 8) return this.close(1000, "");
        if (opcode === 9) { this.socket.write(frame(10, payload)); continue; }
        if (opcode === 10) continue;
        if (opcode !== 1) return this.fail("MESSAGE_MALFORMED");
        let text: string;
        try { text = decoder.decode(payload); }
        catch { return this.fail("MESSAGE_MALFORMED"); }
        void route(this, text);
      }
    }

    isReady(): boolean { return this.ready; }
    markReady(): void {
      this.ready = true;
      this.heartbeat = setInterval(() => {
        if (this.awaitingServerPong && Date.now() > this.awaitingServerPong.deadline) return this.fail("HEARTBEAT_TIMEOUT");
        if (this.awaitingServerPong) return;
        const correlationId = `server_${randomBytes(8).toString("hex")}`;
        this.awaitingServerPong = { correlationId, deadline: Date.now() + heartbeatTimeoutMs };
        this.send({ type: "ping", protocol: REFRAME_PROTOCOL_VERSION, correlationId, sessionId: options.sessionId });
      }, heartbeatIntervalMs);
      this.heartbeat.unref?.();
    }

    receivePong(correlationId: string): void {
      if (this.awaitingServerPong?.correlationId === correlationId) this.awaitingServerPong = undefined;
    }

    allowPreview(): boolean {
      const now = Date.now();
      if (now - this.previewWindowStarted >= 1_000) { this.previewWindowStarted = now; this.previewCount = 0; }
      this.previewCount += 1;
      return this.previewCount <= 100;
    }

    updateSelection(selectionId: string | null, generation: number): void {
      this.selectionId = selectionId;
      this.generation = generation;
      this.mapping = undefined;
    }

    accepts(proposal: EditApplyMessage): boolean {
      if (this.selectionId !== proposal.selectionId || this.generation !== proposal.generation || this.proposalIds.has(proposal.proposalId)) return false;
      this.proposalIds.add(proposal.proposalId);
      return true;
    }

    matchesSelection(selectionId: string, generation: number): boolean {
      return this.selectionId === selectionId && this.generation === generation;
    }

    rememberMapping(request: MappingRequestMessage, result: MappingResponse): void { this.mapping = { request, result }; }
    exactMapping(): { request: MappingRequestMessage; result: MappingResponse } | undefined { return this.mapping?.result.confidence === "exact" ? this.mapping : undefined; }
    mappedMapping(): { request: MappingRequestMessage; result: MappingResponse } | undefined { return this.mapping && ["exact", "probable"].includes(this.mapping.result.confidence) ? this.mapping : undefined; }

    verify(proposal: EditApplyMessage, width: number, recovery = false, height?: number): Promise<boolean> {
      if (this.closed || this.verification) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          if (this.verification?.proposalId === proposal.proposalId) this.verification = undefined;
          resolve(false);
        }, verificationTimeoutMs);
        this.verification = { proposalId: proposal.proposalId, selectionId: proposal.selectionId, tabId: proposal.tabId, generation: proposal.generation, width, height, timer, resolve };
        this.send({ type: "edit:verify", protocol: REFRAME_PROTOCOL_VERSION, correlationId: `verify_${randomBytes(8).toString("hex")}`, sessionId: options.sessionId, selectionId: proposal.selectionId, proposalId: proposal.proposalId, tabId: proposal.tabId, generation: proposal.generation, width, ...(height === undefined ? {} : { height }), timeoutMs: verificationTimeoutMs, recovery });
      });
    }

    receiveVerification(message: EditVerificationMessage): void {
      const pending = this.verification;
      if (!pending || pending.proposalId !== message.proposalId || pending.selectionId !== message.selectionId || pending.tabId !== message.tabId || pending.generation !== message.generation) return;
      clearTimeout(pending.timer);
      this.verification = undefined;
      const widthOk = Math.abs(message.renderedWidth - pending.width) <= 1;
      const heightOk = pending.height === undefined || Math.abs(message.renderedHeight - pending.height) <= 1;
      pending.resolve(message.ok && message.pageErrors.length === 0 && widthOk && heightOk);
    }

    send(message: ServerMessage): void {
      if (!this.closed) this.socket.write(frame(1, Buffer.from(JSON.stringify(message))));
    }

    fail(code: ProtocolErrorCode, correlationId = "error"): void {
      rejectedMessages += 1;
      log(code);
      const message: ServerErrorMessage = { type: "server:error", protocol: REFRAME_PROTOCOL_VERSION, correlationId, sessionId: options.sessionId, code };
      this.send(message);
      this.close(closeCode[code], code);
    }

    close(code: number, reason: string): void {
      if (this.closed) return;
      this.closed = true;
      if (this.heartbeat) clearInterval(this.heartbeat);
      const reasonBytes = Buffer.from(reason).subarray(0, 123);
      const payload = Buffer.allocUnsafe(2 + reasonBytes.length);
      payload.writeUInt16BE(code, 0);
      reasonBytes.copy(payload, 2);
      this.socket.end(frame(8, payload));
      this.finish();
    }

    private finish(): void {
      if (peers.delete(this.id)) closedConnections += 1;
      if (this.heartbeat) clearInterval(this.heartbeat);
      if (this.verification) {
        clearTimeout(this.verification.timer);
        this.verification.resolve(false);
        this.verification = undefined;
      }
      this.closed = true;
    }
  }

  function count(peer: Peer, message: ClientMessage): void {
    routedMessages += 1;
    routedByConnection[peer.id] = (routedByConnection[peer.id] ?? 0) + 1;
    routedByType[message.type] = (routedByType[message.type] ?? 0) + 1;
  }

  async function route(peer: Peer, raw: string): Promise<void> {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { return peer.fail("MESSAGE_MALFORMED"); }
    const result = validateClientMessage(parsed, { sessionId: options.sessionId, projectId: options.project.id, origin: peer.origin });
    if (!result.ok) return peer.fail(result.code, typeof parsed === "object" && parsed && "correlationId" in parsed && typeof parsed.correlationId === "string" ? parsed.correlationId : "error");
    const message = result.value;
    if (!peer.isReady() && message.type !== "client:ready") return peer.fail("MESSAGE_DIRECTION_INVALID", message.correlationId);
    if (peer.isReady() && message.type === "client:ready") return peer.fail("MESSAGE_DIRECTION_INVALID", message.correlationId);
    if (message.type === "preview:changed" && !peer.allowPreview()) { rateLimitedMessages += 1; return; }
    count(peer, message);
    if (message.type === "client:ready") {
      peer.markReady();
      const ready: ServerReadyMessage = {
        type: "server:ready",
        protocol: REFRAME_PROTOCOL_VERSION,
        correlationId: message.correlationId,
        sessionId: options.sessionId,
        connectionId: peer.id,
        project: { id: options.project.id, name: options.project.name, framework: options.project.framework },
        capabilities: options.project.capabilities,
        currentState: "idle",
      };
      peer.send(ready);
    } else if (message.type === "ping" && pongEnabled) {
      peer.send({ type: "pong", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId });
    } else if (message.type === "pong") {
      peer.receivePong(message.correlationId);
    } else if (message.type === "selection:changed") {
      peer.updateSelection(message.selectionId, message.generation);
    } else if (message.type === "edit:verification") {
      peer.receiveVerification(message);
    } else if (message.type === "mapping:request") {
      if (!peer.matchesSelection(message.selectionId, message.generation)) return peer.fail("SELECTION_STALE", message.correlationId);
      let mapped: MappingResponse;
      try {
        mapped = await options.onMappingRequest?.(message) ?? { confidence: "exact", evidence: "Preview proposal is locally eligible", candidates: [], requiresImpactApproval: false };
      } catch (error) {
        mapped = { confidence: "not-mapped", evidence: error instanceof Error ? error.message : String(error), candidates: [], requiresImpactApproval: false };
      }
      if (!peer.matchesSelection(message.selectionId, message.generation)) return;
      peer.rememberMapping(message, mapped);
      peer.send({ type: "mapping:result", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, selectionId: message.selectionId, generation: message.generation, confidence: mapped.confidence, evidence: mapped.evidence.slice(0, 1_024), candidates: mapped.candidates.slice(0, 16).map((candidate) => ({ path: candidate.path.slice(0, 2_048), evidence: candidate.evidence.slice(0, 512), line: candidate.line })), requiresImpactApproval: mapped.requiresImpactApproval });
    } else if (message.type === "ai:generate") {
      const mapping = peer.mappedMapping();
      let state: AiStateResponse;
      try {
        if (!peer.matchesSelection(message.selectionId, message.generation) || !mapping) throw new Error("AI_EXACT_MAPPING_REQUIRED");
        state = await options.onAiGenerate?.(message, mapping.request, mapping.result) ?? { generationId: message.generationId, status: "failed", code: "PROVIDER_UNAVAILABLE" };
      } catch (error) { state = { generationId: message.generationId, status: "failed", code: error instanceof Error ? error.message : String(error) }; }
      peer.send({ type: "ai:state", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, generationId: state.generationId, status: state.status, code: (state.code ?? "").slice(0, 1_024), changedFiles: [...(state.changedFiles ?? [])].slice(0, 4), packetFiles: [...(state.packetFiles ?? [])].slice(0, 4), packetBytes: state.packetBytes ?? 0, lineage: [...(state.lineage ?? [])].slice(0, 32) });
    } else if (message.type === "ai:action") {
      let state: AiStateResponse;
      try { state = await options.onAiAction?.(message) ?? { generationId: message.generationId, status: "failed", code: "PROVIDER_UNAVAILABLE" }; }
      catch (error) { state = { generationId: message.generationId, status: "failed", code: error instanceof Error ? error.message : String(error) }; }
      peer.send({ type: "ai:state", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, generationId: state.generationId, status: state.status, code: (state.code ?? "").slice(0, 1_024), changedFiles: [...(state.changedFiles ?? [])].slice(0, 4), packetFiles: [...(state.packetFiles ?? [])].slice(0, 4), packetBytes: state.packetBytes ?? 0, lineage: [...(state.lineage ?? [])].slice(0, 32) });
    } else if (message.type === "annotation:list") {
      try { const state = await options.onAnnotationList?.(message) ?? { annotations: [], issues: [], parsedFiles: 0, renderedForRoute: 0 }; peer.send({ type: "annotation:state", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, annotations: state.annotations.slice(0, 1_000), issues: state.issues.slice(0, 1_000), parsedFiles: state.parsedFiles, renderedForRoute: state.renderedForRoute }); }
      catch (error) { peer.send({ type: "annotation:result", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, status: "rejected", code: (error instanceof Error ? error.message : String(error)).slice(0, 1_024), annotationId: null, proposalId: null }); }
    } else if (message.type === "annotation:create" || message.type === "annotation:action") {
      try { const result = message.type === "annotation:create" ? await options.onAnnotationCreate?.(message) : await options.onAnnotationAction?.(message); if (!result) throw new Error("ANNOTATION_UNAVAILABLE"); peer.send({ type: "annotation:result", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, status: "applied", code: message.type === "annotation:create" ? "ANNOTATION_CREATED" : message.action === "promote" ? "DESIGN_DNA_PROPOSAL_CREATED" : `ANNOTATION_${message.action.toUpperCase()}D`, annotationId: result.annotationId, proposalId: result.proposalId ?? null }); }
      catch (error) { peer.send({ type: "annotation:result", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, status: "rejected", code: (error instanceof Error ? error.message : String(error)).slice(0, 1_024), annotationId: "annotationId" in message ? message.annotationId : null, proposalId: null }); }
    } else if (message.type === "history:request") {
      try {
        const state = await options.onHistoryState?.(message) ?? { currentId: null, previousId: null, canRestore: false, visualComplete: false, gitAvailable: false, dirty: false, incomplete: [], checkpoints: [], comparison: null };
        peer.send({ type: "history:state", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, ...state, incomplete: [...state.incomplete].slice(0, 16), checkpoints: (state.checkpoints ?? []).slice(-120), comparison: state.comparison ?? null });
      } catch (error) {
        peer.send({ type: "history:result", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, status: "rejected", code: (error instanceof Error ? error.message : String(error)).slice(0, 1_024), currentId: null });
      }
    } else if (message.type === "history:restore") {
      try {
        const restored = await options.onHistoryRestore?.();
        if (!restored) throw new Error("HISTORY_UNAVAILABLE");
        peer.send({ type: "history:result", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, status: "applied", code: "RESTORE_APPLIED", currentId: restored.currentId });
      } catch (error) {
        peer.send({ type: "history:result", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, status: "rejected", code: (error instanceof Error ? error.message : String(error)).slice(0, 1_024), currentId: null });
      }
    } else if (message.type === "edit:apply" && "fingerprint" in message) {
      if (!peer.accepts(message)) return peer.fail("SELECTION_STALE", message.correlationId);
      const proposal = immutable(structuredClone(message));
      let outcome: EditProposalResponse | void;
      try {
        outcome = await options.onEditProposal?.(proposal, (width, recovery, height) => peer.verify(proposal, width, recovery, height));
        if (outcome && typeof outcome === "object" && outcome.status !== "applied") {
          peer.send({ type: "edit:result", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, selectionId: message.selectionId, proposalId: message.proposalId, tabId: message.tabId, generation: message.generation, status: outcome.status, code: outcome.code.slice(0, 1_024) });
          return;
        }
      } catch (error) {
        peer.send({ type: "edit:result", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, selectionId: message.selectionId, proposalId: message.proposalId, tabId: message.tabId, generation: message.generation, status: "rejected", code: (error instanceof Error ? error.message : String(error)).slice(0, 1_024) });
        return;
      }
      acceptedProposals += 1;
      peer.send({ type: "edit:accepted", protocol: REFRAME_PROTOCOL_VERSION, correlationId: message.correlationId, sessionId: options.sessionId, selectionId: message.selectionId, proposalId: message.proposalId, tabId: message.tabId, generation: message.generation, checkpointId: outcome?.checkpointId, visualComplete: outcome?.visualComplete });
    }
  }

  return {
    configure(nextOrigins, nextHosts) {
      origins.clear();
      hosts.clear();
      for (const origin of nextOrigins) origins.add(origin);
      for (const host of nextHosts) hosts.add(host.toLowerCase());
    },
    handleUpgrade(request, socket, head) {
      if (!available) return rejectUpgrade(socket, 503, "CONNECTION_UNAVAILABLE", log);
      const remote = request.socket.remoteAddress;
      if (!isLoopbackAddress(remote)) return rejectUpgrade(socket, 403, "HOST_INVALID", log);
      const host = String(request.headers.host ?? "").toLowerCase();
      if (!hosts.has(host)) return rejectUpgrade(socket, 403, "HOST_INVALID", log);
      const origin = String(request.headers.origin ?? "");
      if (!origins.has(origin)) return rejectUpgrade(socket, 403, "ORIGIN_INVALID", log);
      const protocols = String(request.headers["sec-websocket-protocol"] ?? "").split(",").map((value) => value.trim());
      if (!protocols.includes(REFRAME_PROTOCOL_NAME)) return rejectUpgrade(socket, 426, "PROTOCOL_VERSION_UNSUPPORTED", log);
      const token = protocols.find((value) => value.startsWith("reframe.token."))?.slice("reframe.token.".length) ?? "";
      const session = protocols.find((value) => value.startsWith("reframe.session."))?.slice("reframe.session.".length) ?? "";
      const project = protocols.find((value) => value.startsWith("reframe.project."))?.slice("reframe.project.".length) ?? "";
      if (!safeEqual(token, options.token)) return rejectUpgrade(socket, 403, "AUTH_INVALID", log);
      if (session !== options.sessionId || project !== options.project.id) return rejectUpgrade(socket, 403, "PROJECT_INVALID", log);
      const key = request.headers["sec-websocket-key"];
      if (request.method !== "GET" || request.headers.upgrade?.toLowerCase() !== "websocket" || request.headers["sec-websocket-version"] !== "13" || typeof key !== "string" || Buffer.from(key, "base64").length !== 16) return rejectUpgrade(socket, 403, "AUTH_INVALID", log);
      const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: ${REFRAME_PROTOCOL_NAME}\r\n\r\n`);
      const id = randomBytes(12).toString("base64url");
      const peer = new Peer(id, socket, origin);
      peers.set(id, peer);
      acceptedConnections += 1;
      if (head.length) peer.accept(head);
    },
    setAvailable(next) {
      available = next;
      if (!next) for (const peer of [...peers.values()]) peer.close(1012, "CONNECTION_UNAVAILABLE");
    },
    setPongEnabled(enabled) { pongEnabled = enabled; },
    publishAnnotations(state) {
      // ponytail: file watcher can fire twice; skip identical annotation snapshots
      const fingerprint = `${state.parsedFiles}:${state.renderedForRoute}:${state.annotations.map((item) => item.id + ":" + item.status).join(",")}`;
      if (fingerprint === lastAnnotationFingerprint) return;
      lastAnnotationFingerprint = fingerprint;
      for (const peer of peers.values()) if (peer.isReady()) peer.send({ type: "annotation:state", protocol: REFRAME_PROTOCOL_VERSION, correlationId: `annotation_${randomBytes(8).toString("hex")}`, sessionId: options.sessionId, annotations: state.annotations.slice(0, 1_000), issues: state.issues.slice(0, 1_000), parsedFiles: state.parsedFiles, renderedForRoute: state.renderedForRoute });
    },
    diagnostics() {
      return Object.freeze({
        activeConnections: peers.size,
        acceptedConnections,
        closedConnections,
        routedMessages,
        rejectedMessages,
        rateLimitedMessages,
        acceptedProposals,
        connectionIds: Object.freeze([...peers.keys()].sort()),
        routedByConnection: Object.freeze({ ...routedByConnection }),
        routedByType: Object.freeze({ ...routedByType }),
      });
    },
    close() {
      available = false;
      for (const peer of [...peers.values()]) peer.close(1001, "SERVER_SHUTDOWN");
    },
  };
}
