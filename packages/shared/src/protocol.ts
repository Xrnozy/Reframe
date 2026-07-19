export const REFRAME_PROTOCOL_VERSION = 1 as const;
export const REFRAME_PROTOCOL_NAME = "reframe.v1" as const;
export const REFRAME_MAX_MESSAGE_BYTES = 32 * 1024;

export type ProtocolErrorCode =
  | "AUTH_INVALID"
  | "CONNECTION_UNAVAILABLE"
  | "HEARTBEAT_TIMEOUT"
  | "HOST_INVALID"
  | "MESSAGE_DIRECTION_INVALID"
  | "MESSAGE_MALFORMED"
  | "MESSAGE_SCHEMA_INVALID"
  | "MESSAGE_TOO_LARGE"
  | "MESSAGE_UNKNOWN"
  | "ORIGIN_INVALID"
  | "PROJECT_INVALID"
  | "PROTOCOL_VERSION_UNSUPPORTED"
  | "RATE_LIMITED"
  | "SELECTION_STALE";

interface MessageBase {
  type: string;
  protocol: typeof REFRAME_PROTOCOL_VERSION;
  correlationId: string;
  sessionId: string;
}

export interface ClientReadyMessage extends MessageBase {
  type: "client:ready";
  projectId: string;
  url: string;
  route: string;
  viewport: { width: number; height: number };
}

export interface PingMessage extends MessageBase { type: "ping" }
export interface PongMessage extends MessageBase { type: "pong" }
export interface SelectionChangedMessage extends MessageBase {
  type: "selection:changed";
  selectionId: string | null;
  generation: number;
}
export interface PreviewChangedMessage extends MessageBase {
  type: "preview:changed";
  selectionId: string;
  proposalId: string;
  generation: number;
  width: number;
}

export interface ElementFingerprint {
  tag: string;
  id: string | null;
  classes: string[];
  text: string;
  parent: { tag: string; id: string | null; classes: string[] } | null;
  route: string;
  viewport: { width: number; height: number };
}

export interface OriginalWidthContext {
  inlineWidthPresent: boolean;
  inlineWidth: string;
  inlineWidthPriority: "" | "important";
  computedWidth: number;
  inlineHeightPresent: boolean;
  inlineHeight: string;
  inlineHeightPriority: "" | "important";
  computedHeight: number;
  text: string;
  boxSizing: "border-box" | "content-box";
  rect: { x: number; y: number; width: number; height: number };
  styles?: Record<string, string>;
}

export interface EditApplyMessage extends MessageBase {
  type: "edit:apply";
  selectionId: string;
  proposalId: string;
  tabId: string;
  generation: number;
  width: number;
  height: number;
  previewText: string | null;
  previewStyles?: Record<string, string> | null;
  fingerprint: ElementFingerprint;
  original: OriginalWidthContext;
  breakpoint: string | null;
  sharedImpactAccepted: boolean;
  overlapAccepted: boolean;
}
export interface LegacyEditApplyMessage extends MessageBase {
  type: "edit:apply";
  selectionId: string;
  proposalId: string;
  generation: number;
  width: number;
}
export interface EditCancelMessage extends MessageBase {
  type: "edit:cancel";
  proposalId: string;
}

export interface EditVerificationMessage extends MessageBase {
  type: "edit:verification";
  selectionId: string;
  proposalId: string;
  tabId: string;
  generation: number;
  ok: boolean;
  renderedWidth: number;
  renderedHeight: number;
  pageErrors: string[];
}

export interface MappingRequestMessage extends MessageBase {
  type: "mapping:request";
  selectionId: string;
  generation: number;
  currentWidth: number;
  width: number;
  currentHeight: number;
  height: number;
  previewText: string | null;
  previewStyles?: Record<string, string> | null;
  originalStyles?: Record<string, string>;
  fingerprint: ElementFingerprint;
  breakpoint: string | null;
  sharedImpactAccepted: boolean;
}
export interface HistoryRequestMessage extends MessageBase { type: "history:request"; route?: string; viewport?: { width: number; height: number } }
export interface HistoryRestoreMessage extends MessageBase { type: "history:restore" }
export interface AiGenerateMessage extends MessageBase {
  type: "ai:generate";
  selectionId: string;
  generation: number;
  generationId: string;
  instruction: string;
  referencePlanId?: string;
  conversationId?: string;
}
export interface AiActionMessage extends MessageBase {
  type: "ai:action";
  generationId: string;
  action: "accept" | "refine" | "compare" | "reject" | "stop" | "dismiss";
  instruction: string;
}

export interface AnnotationListMessage extends MessageBase { type: "annotation:list"; route: string; checkpointId: string | null }
export interface AnnotationCreateMessage extends MessageBase { type: "annotation:create"; author: string; component: string; fingerprint: ElementFingerprint; source: { path: string; line: number; endLine: number; evidence: string }; route: string; viewport: { width: number; height: number }; comment: string; highlight: { x: number; y: number; width: number; height: number } | null; relatedCheckpoint: string | null; relatedDesignDna: string | null; anchorConfidence: "exact" | "probable" }
export interface AnnotationActionMessage extends MessageBase { type: "annotation:action"; annotationId: string; action: "resolve" | "reopen" | "promote"; confirmed: boolean }

export type ClientMessage = ClientReadyMessage | PingMessage | PongMessage | SelectionChangedMessage | PreviewChangedMessage | EditApplyMessage | LegacyEditApplyMessage | EditCancelMessage | EditVerificationMessage | MappingRequestMessage | HistoryRequestMessage | HistoryRestoreMessage | AiGenerateMessage | AiActionMessage | AnnotationListMessage | AnnotationCreateMessage | AnnotationActionMessage;

export interface ServerReadyMessage extends MessageBase {
  type: "server:ready";
  connectionId: string;
  project: { id: string; name: string; framework: string };
  capabilities: { canExplore: boolean; canWriteSource: boolean };
  currentState: "idle";
}

export interface ServerErrorMessage extends MessageBase {
  type: "server:error";
  code: ProtocolErrorCode;
}

export interface EditAcceptedMessage extends MessageBase {
  type: "edit:accepted";
  selectionId: string;
  proposalId: string;
  tabId: string;
  generation: number;
  checkpointId?: string;
  visualComplete?: boolean;
}

export interface MappingResultMessage extends MessageBase {
  type: "mapping:result";
  selectionId: string;
  generation: number;
  confidence: "exact" | "probable" | "ambiguous" | "not-mapped";
  evidence: string;
  candidates: Array<{ path: string; evidence: string; line: number }>;
  requiresImpactApproval: boolean;
}

export interface EditResultMessage extends MessageBase {
  type: "edit:result";
  selectionId: string;
  proposalId: string;
  tabId: string;
  generation: number;
  status: "rejected" | "rolled-back" | "critical";
  code: string;
}

export interface EditVerifyMessage extends MessageBase {
  type: "edit:verify";
  selectionId: string;
  proposalId: string;
  tabId: string;
  generation: number;
  width: number;
  height?: number | null;
  timeoutMs: number;
  recovery: boolean;
}
export interface HistoryStateMessage extends MessageBase {
  type: "history:state";
  currentId: string | null;
  previousId: string | null;
  canRestore: boolean;
  visualComplete: boolean;
  gitAvailable: boolean;
  dirty: boolean;
  incomplete: string[];
  checkpoints: Array<{ id: string; parentId: string | null; kind: "edit" | "safety"; createdAt: string; valid: boolean; visualComplete: boolean; files: string[]; route?: string; viewport?: { width: number; height: number }; promptSummary?: string; verification?: "passed" | "unavailable"; error?: string }>;
  comparison: { checkpointId: string; stage: "before" | "after"; kind: "page" | "component"; status: "captured" | "unavailable" | "failed" | "excluded" | "corrupt"; error?: string; route: string; viewport: { width: number; height: number }; exactRoute: boolean; exactViewport: boolean; imagePath?: string } | null;
}
export interface HistoryResultMessage extends MessageBase {
  type: "history:result";
  status: "applied" | "rejected";
  code: string;
  currentId: string | null;
}
export interface AiStateMessage extends MessageBase {
  type: "ai:state";
  generationId: string;
  status: "generating" | "review" | "accepted" | "rejected" | "stopped" | "failed" | "compared";
  code: string;
  changedFiles: string[];
  packetFiles: string[];
  packetBytes: number;
  lineage: string[];
}
export interface AnnotationWire { id: string; author: string; createdAt: string; updatedAt: string; component: string; fingerprint: ElementFingerprint; source: { path: string; line: number; endLine: number; snippet: string; hash: string; evidence: string }; resolvedSource: { path: string; line: number; endLine: number; snippet: string; hash: string; evidence: string } | null; route: string; viewport: { width: number; height: number }; comment: string; highlight: { x: number; y: number; width: number; height: number } | null; status: "open" | "resolved"; relatedCheckpoint: string | null; relatedDesignDna: string | null; anchorConfidence: "exact" | "probable"; resolution: "exact" | "relocated" | "orphaned" | "ambiguous" | "conflict"; checkpointRelationship: "current" | "related" | "other" }
export interface AnnotationStateMessage extends MessageBase { type: "annotation:state"; annotations: AnnotationWire[]; issues: Array<{ file: string; id: string | null; resolution: "orphaned" | "ambiguous" | "conflict" | "invalid" | "unsupported"; error: string }>; parsedFiles: number; renderedForRoute: number }
export interface AnnotationResultMessage extends MessageBase { type: "annotation:result"; status: "applied" | "rejected"; code: string; annotationId: string | null; proposalId: string | null }

export type ServerMessage = ServerReadyMessage | ServerErrorMessage | EditAcceptedMessage | MappingResultMessage | EditResultMessage | EditVerifyMessage | HistoryStateMessage | HistoryResultMessage | AiStateMessage | AnnotationStateMessage | AnnotationResultMessage | PingMessage | PongMessage;

export type MessageValidation = { ok: true; value: ClientMessage } | { ok: false; code: ProtocolErrorCode };

const clientTypes = new Set(["client:ready", "ping", "pong", "selection:changed", "preview:changed", "edit:apply", "edit:cancel", "edit:verification", "mapping:request", "history:request", "history:restore", "ai:generate", "ai:action", "annotation:list", "annotation:create", "annotation:action"]);
const serverOnlyTypes = new Set(["server:ready", "server:error", "edit:accepted", "mapping:result", "edit:result", "edit:verify", "history:state", "history:result", "ai:state", "annotation:state", "annotation:result"]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function width(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 10_000;
}

function finite(value: unknown, limit = 1_000_000): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max && !value.includes("\0");
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 16 && value.every((item) => boundedText(item, 128));
}

function elementSummary(value: unknown): boolean {
  return record(value) && exact(value, ["tag", "id", "classes"]) && boundedText(value.tag, 32) && /^[a-z][a-z0-9-]*$/i.test(value.tag) && (value.id === null || boundedText(value.id, 128)) && stringList(value.classes);
}

function fingerprint(value: unknown): value is ElementFingerprint {
  return record(value) && exact(value, ["tag", "id", "classes", "text", "parent", "route", "viewport"]) && elementSummary({ tag: value.tag, id: value.id, classes: value.classes }) && boundedText(value.text, 256) && (value.parent === null || elementSummary(value.parent)) && safeRoute(value.route) && record(value.viewport) && exact(value.viewport, ["width", "height"]) && integer(value.viewport.width) && integer(value.viewport.height) && value.viewport.width <= 100_000 && value.viewport.height <= 100_000;
}

function styleMap(value: unknown): value is Record<string, string> | null | undefined {
  if (value === undefined || value === null) return true;
  if (!record(value)) return false;
  return Object.entries(value).every(([key, item]) => typeof key === "string" && key.length <= 64 && typeof item === "string" && item.length <= 256);
}

function originalWidth(value: unknown): value is OriginalWidthContext {
  if (!record(value) || !["inlineWidthPresent", "inlineWidth", "inlineWidthPriority", "computedWidth", "inlineHeightPresent", "inlineHeight", "inlineHeightPriority", "computedHeight", "text", "boxSizing", "rect"].every((key) => key in value) || typeof value.inlineWidthPresent !== "boolean" || !boundedText(value.inlineWidth, 256) || (value.inlineWidthPriority !== "" && value.inlineWidthPriority !== "important") || !finite(value.computedWidth, 10_000) || typeof value.inlineHeightPresent !== "boolean" || !boundedText(value.inlineHeight, 256) || (value.inlineHeightPriority !== "" && value.inlineHeightPriority !== "important") || !finite(value.computedHeight, 10_000) || !boundedText(value.text, 4_096) || (value.boxSizing !== "border-box" && value.boxSizing !== "content-box") || !record(value.rect) || !exact(value.rect, ["x", "y", "width", "height"])) return false;
  if (!styleMap((value as { styles?: Record<string, string> }).styles)) return false;
  return finite(value.rect.x) && finite(value.rect.y) && finite(value.rect.width, 100_000) && finite(value.rect.height, 100_000) && value.rect.width > 0 && value.rect.height > 0;
}

function base(value: Record<string, unknown>, context: { sessionId: string }): boolean {
  return value.protocol === REFRAME_PROTOCOL_VERSION && identifier(value.correlationId) && value.sessionId === context.sessionId;
}

function safeRoute(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && value.length <= 2_048 && !value.includes("\\") && !value.includes("\0") && !value.split(/[/?#]/).includes("..");
}

function safeRelativePath(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 2_048 && !value.includes("\\") && !value.includes("\0") && !value.startsWith("/") && !/^[a-z]:/i.test(value) && value.split("/").every((part) => part && part !== "." && part !== ".."); }
function annotationId(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function nullableText(value: unknown, max: number): value is string | null { return value === null || boundedText(value, max); }
function annotationHighlight(value: unknown): boolean { return value === null || (record(value) && exact(value, ["x", "y", "width", "height"]) && finite(value.x, 1) && finite(value.y, 1) && finite(value.width, 1) && finite(value.height, 1) && value.x >= 0 && value.y >= 0 && value.width > 0 && value.height > 0); }

function sameOriginUrl(value: unknown, origin: string): value is string {
  if (typeof value !== "string" || value.length > 4_096) return false;
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateClientMessage(value: unknown, context: { sessionId: string; projectId: string; origin: string }): MessageValidation {
  if (!record(value) || typeof value.type !== "string") return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
  if (serverOnlyTypes.has(value.type)) return { ok: false, code: "MESSAGE_DIRECTION_INVALID" };
  if (!clientTypes.has(value.type)) return { ok: false, code: "MESSAGE_UNKNOWN" };
  if (value.protocol !== REFRAME_PROTOCOL_VERSION) return { ok: false, code: "PROTOCOL_VERSION_UNSUPPORTED" };
  if (!base(value, context)) return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };

  switch (value.type) {
    case "client:ready": {
      if (!exact(value, ["type", "protocol", "correlationId", "sessionId", "projectId", "url", "route", "viewport"]) || !identifier(value.projectId) || !sameOriginUrl(value.url, context.origin) || !safeRoute(value.route) || !record(value.viewport) || !exact(value.viewport, ["width", "height"]) || !integer(value.viewport.width) || !integer(value.viewport.height) || value.viewport.width > 100_000 || value.viewport.height > 100_000) return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      if (value.projectId !== context.projectId) return { ok: false, code: "PROJECT_INVALID" };
      break;
    }
    case "ping":
    case "pong":
    case "history:restore":
      if (!exact(value, ["type", "protocol", "correlationId", "sessionId"])) return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      break;
    case "history:request":
      if (exact(value, ["type", "protocol", "correlationId", "sessionId"])) break;
      if (!exact(value, ["type", "protocol", "correlationId", "sessionId", "route", "viewport"]) || !safeRoute(value.route) || !record(value.viewport) || !exact(value.viewport, ["width", "height"]) || !integer(value.viewport.width) || !integer(value.viewport.height) || value.viewport.width > 100_000 || value.viewport.height > 100_000) return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      break;
    case "selection:changed":
      if (!exact(value, ["type", "protocol", "correlationId", "sessionId", "selectionId", "generation"]) || (value.selectionId !== null && !identifier(value.selectionId)) || !integer(value.generation)) return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      break;
    case "preview:changed":
      if (!exact(value, ["type", "protocol", "correlationId", "sessionId", "selectionId", "proposalId", "generation", "width"]) || !identifier(value.selectionId) || !identifier(value.proposalId) || !integer(value.generation) || !width(value.width)) return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      break;
    case "edit:apply":
      if (exact(value, ["type", "protocol", "correlationId", "sessionId", "selectionId", "proposalId", "generation", "width"])) {
        if (!identifier(value.selectionId) || !identifier(value.proposalId) || !integer(value.generation) || !width(value.width)) return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
        break;
      }
      if (!["type", "protocol", "correlationId", "sessionId", "selectionId", "proposalId", "tabId", "generation", "width", "height", "previewText", "fingerprint", "original", "breakpoint", "sharedImpactAccepted", "overlapAccepted"].every((key) => key in value) || !identifier(value.selectionId) || !identifier(value.proposalId) || !identifier(value.tabId) || !integer(value.generation) || !width(value.width) || !width(value.height) || (value.previewText !== null && !boundedText(value.previewText, 4_096)) || !styleMap(value.previewStyles) || !fingerprint(value.fingerprint) || !originalWidth(value.original) || (value.breakpoint !== null && !identifier(value.breakpoint)) || typeof value.sharedImpactAccepted !== "boolean" || typeof value.overlapAccepted !== "boolean") return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      break;
    case "edit:cancel":
      if (!exact(value, ["type", "protocol", "correlationId", "sessionId", "proposalId"]) || !identifier(value.proposalId)) return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      break;
    case "edit:verification":
      if (!exact(value, ["type", "protocol", "correlationId", "sessionId", "selectionId", "proposalId", "tabId", "generation", "ok", "renderedWidth", "renderedHeight", "pageErrors"]) || !identifier(value.selectionId) || !identifier(value.proposalId) || !identifier(value.tabId) || !integer(value.generation) || typeof value.ok !== "boolean" || !finite(value.renderedWidth, 10_000) || !finite(value.renderedHeight, 10_000) || !stringList(value.pageErrors)) return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      break;
    case "mapping:request":
      if (!["type", "protocol", "correlationId", "sessionId", "selectionId", "generation", "currentWidth", "width", "currentHeight", "height", "previewText", "fingerprint", "breakpoint", "sharedImpactAccepted"].every((key) => key in value) || !identifier(value.selectionId) || !integer(value.generation) || !width(value.currentWidth) || !width(value.width) || !width(value.currentHeight) || !width(value.height) || (value.previewText !== null && !boundedText(value.previewText, 4_096)) || !styleMap(value.previewStyles) || !fingerprint(value.fingerprint) || (value.breakpoint !== null && !identifier(value.breakpoint)) || typeof value.sharedImpactAccepted !== "boolean") return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      break;
    case "ai:generate":
      if (!(exact(value, ["type", "protocol", "correlationId", "sessionId", "selectionId", "generation", "generationId", "instruction"]) || exact(value, ["type", "protocol", "correlationId", "sessionId", "selectionId", "generation", "generationId", "instruction", "referencePlanId"]) || exact(value, ["type", "protocol", "correlationId", "sessionId", "selectionId", "generation", "generationId", "instruction", "conversationId"]) || exact(value, ["type", "protocol", "correlationId", "sessionId", "selectionId", "generation", "generationId", "instruction", "referencePlanId", "conversationId"])) || !identifier(value.selectionId) || !integer(value.generation) || !identifier(value.generationId) || !boundedText(value.instruction, 2_000) || !value.instruction.trim() || (value.referencePlanId !== undefined && !identifier(value.referencePlanId)) || (value.conversationId !== undefined && !boundedText(value.conversationId, 256))) return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      break;
    case "ai:action":
      if (!exact(value, ["type", "protocol", "correlationId", "sessionId", "generationId", "action", "instruction"]) || !identifier(value.generationId) || !["accept", "refine", "compare", "reject", "stop", "dismiss"].includes(String(value.action)) || !boundedText(value.instruction, 2_000) || (value.action === "refine" && !value.instruction.trim())) return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      break;
    case "annotation:list":
      if (!exact(value, ["type", "protocol", "correlationId", "sessionId", "route", "checkpointId"]) || !safeRoute(value.route) || !nullableText(value.checkpointId, 128)) return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      break;
    case "annotation:create":
      if (!exact(value, ["type", "protocol", "correlationId", "sessionId", "author", "component", "fingerprint", "source", "route", "viewport", "comment", "highlight", "relatedCheckpoint", "relatedDesignDna", "anchorConfidence"]) || !boundedText(value.author, 128) || !value.author || !boundedText(value.component, 256) || !value.component || !fingerprint(value.fingerprint) || !record(value.source) || !exact(value.source, ["path", "line", "endLine", "evidence"]) || !safeRelativePath(value.source.path) || !integer(value.source.line) || value.source.line < 1 || !integer(value.source.endLine) || value.source.endLine < value.source.line || !boundedText(value.source.evidence, 1_024) || !value.source.evidence || !safeRoute(value.route) || !record(value.viewport) || !exact(value.viewport, ["width", "height"]) || !integer(value.viewport.width) || !integer(value.viewport.height) || value.viewport.width < 1 || value.viewport.height < 1 || !boundedText(value.comment, 4_096) || !value.comment || !annotationHighlight(value.highlight) || !nullableText(value.relatedCheckpoint, 128) || !nullableText(value.relatedDesignDna, 128) || !["exact", "probable"].includes(String(value.anchorConfidence))) return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      break;
    case "annotation:action":
      if (!exact(value, ["type", "protocol", "correlationId", "sessionId", "annotationId", "action", "confirmed"]) || !annotationId(value.annotationId) || !["resolve", "reopen", "promote"].includes(String(value.action)) || typeof value.confirmed !== "boolean") return { ok: false, code: "MESSAGE_SCHEMA_INVALID" };
      break;
  }
  return { ok: true, value: value as unknown as ClientMessage };
}
