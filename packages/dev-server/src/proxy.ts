import { BROWSER_CLIENT_SOURCE } from "@reframe/browser-client";
import type { EditApplyMessage, MappingRequestMessage, ProtocolErrorCode } from "@reframe/shared";
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createServer, request as httpRequest, type IncomingHttpHeaders, type OutgoingHttpHeaders, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { brotliCompress, brotliDecompress, deflate, inflate, gzip, gunzip } from "node:zlib";
import { createReframeConnectionServer, type ConnectionDiagnostics, type EditProposalResponse, type MappingResponse, type ReframeProjectConnectionInfo } from "./websocket-server.js";
import { createSourceEditor, injectVanillaSourceMetadata, type EditPlan } from "./source-editor.js";
import { createHistoryStore, type HistoryStoreOptions } from "./history.js";
import { createAiEditRunner, type AiProvider, type ReviewState } from "./ai-edit.js";
import { readDesignDna, selectDesignDnaContext } from "./design-dna.js";
import { createAnnotationStore, type AnnotationState } from "./annotations.js";
import { createAnnointStore, isAnnointId } from "./annoints.js";
import { createDraftStore } from "./drafts.js";
import { createReferenceService, type AdaptationPlanInput, type ReferenceKind } from "./references.js";
import { createSnapshotStore } from "./snapshots.js";
import { listCodexSessions } from "./codex-sessions.js";
import { createInsertionStore } from "./insertions.js";

const MAX_TRANSFORM_BYTES = 16 * 1024 * 1024;

export interface ProjectProxy {
  readonly server: Server;
  readonly session: string;
  readonly clientPath: string;
  readonly webSocketPath: string;
  readonly projectId: string;
  readonly ipv6Available: boolean;
  listen(port?: number): Promise<{ port: number; url: string }>;
  setConnectionsAvailable(available: boolean): void;
  setConnectionPongEnabled(enabled: boolean): void;
  connectionDiagnostics(): ConnectionDiagnostics;
  close(): Promise<void>;
}

export interface ProjectProxyOptions {
  session?: string;
  clientSource?: string;
  connectionToken?: string;
  connectionsInitiallyAvailable?: boolean;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  logConnectionCode?: (code: ProtocolErrorCode) => void;
  projectRoot?: string;
  verificationTimeoutMs?: number;
  verifyEdit?: (plan: EditPlan) => boolean | Promise<boolean>;
  captureHistoryScreenshot?: HistoryStoreOptions["captureScreenshot"];
  allowHistoryScreenshot?: HistoryStoreOptions["allowScreenshot"];
  historyScreenshotTimeoutMs?: number;
  aiProvider?: AiProvider;
  aiProviderDeadlineMs?: number;
  verifyResponsive?: (route: string, viewports: readonly number[]) => Promise<readonly { readonly width: number; readonly passed: boolean; readonly findings: readonly string[] }[]>;
  onMappingRequest?: (request: Readonly<MappingRequestMessage>) => MappingResponse | Promise<MappingResponse>;
  onEditProposal?: (proposal: Readonly<EditApplyMessage>) => EditProposalResponse | void | Promise<EditProposalResponse | void>;
  project?: Partial<ReframeProjectConnectionInfo> & Pick<ReframeProjectConnectionInfo, "name" | "framework" | "capabilities">;
}

function transformBuffer(input: Buffer, transform: typeof gzip): Promise<Buffer> {
  return new Promise((resolve, reject) => transform(input, (error, output) => error ? reject(error) : resolve(output)));
}

async function decode(body: Buffer, encoding: string): Promise<Buffer> {
  if (!encoding || encoding === "identity") return body;
  if (encoding === "gzip") return transformBuffer(body, gunzip);
  if (encoding === "deflate") return transformBuffer(body, inflate);
  if (encoding === "br") return transformBuffer(body, brotliDecompress);
  throw new Error(`unsupported content encoding: ${encoding}`);
}

async function encode(body: Buffer, encoding: string): Promise<Buffer> {
  if (!encoding || encoding === "identity") return body;
  if (encoding === "gzip") return transformBuffer(body, gzip);
  if (encoding === "deflate") return transformBuffer(body, deflate);
  if (encoding === "br") return transformBuffer(body, brotliCompress);
  throw new Error(`unsupported content encoding: ${encoding}`);
}

function injectHtml(html: string, bootstrap: string): string {
  const stripped = html.replace(/<script\b[^>]*\bdata-reframe-bootstrap\b[^>]*>\s*<\/script>\s*/gi, "");
  const lower = stripped.toLowerCase();
  const body = lower.lastIndexOf("</body>");
  if (body >= 0) return `${stripped.slice(0, body)}${bootstrap}${stripped.slice(body)}`;
  const document = lower.lastIndexOf("</html>");
  if (document >= 0) return `${stripped.slice(0, document)}${bootstrap}${stripped.slice(document)}`;
  return `${stripped}${bootstrap}`;
}

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
}

function proxyHeaders(headers: IncomingHttpHeaders, upstream: URL, proxyOrigin: string): IncomingHttpHeaders {
  const result = { ...headers, host: upstream.host };
  if (originOf(headers.origin) === proxyOrigin) result.origin = upstream.origin;
  if (originOf(headers.referer) === proxyOrigin) {
    const referer = new URL(headers.referer!);
    result.referer = `${upstream.origin}${referer.pathname}${referer.search}${referer.hash}`;
  }
  return result;
}

function responseHeaders(headers: IncomingHttpHeaders, upstream: URL, proxyOrigin: string): OutgoingHttpHeaders {
  const result: OutgoingHttpHeaders = { ...headers };
  const location = headers.location;
  if (location?.startsWith(upstream.origin)) result.location = `${proxyOrigin}${location.slice(upstream.origin.length)}`;
  const cookies = headers["set-cookie"];
  if (cookies) result["set-cookie"] = cookies.map((cookie) => cookie.replace(/;\s*Domain=[^;]+/gi, ""));
  return result;
}

function navigation(headers: IncomingHttpHeaders): boolean {
  const destination = headers["sec-fetch-dest"];
  if (destination !== undefined) return destination === "document" || destination === "iframe";
  return String(headers.accept ?? "").toLowerCase().includes("text/html");
}

function viteSourcePath(requestUrl: string | undefined): string | null {
  if (!requestUrl) return null;
  try {
    const pathname = decodeURIComponent(new URL(requestUrl, "http://reframe.local").pathname);
    if (pathname.startsWith("/@") || pathname.startsWith("/node_modules/") || pathname.startsWith("/.reframe/")) return null;
    const relative = pathname.replace(/^\/+/, "");
    return /\.(?:jsx|js)$/.test(relative) ? relative : null;
  } catch {
    return null;
  }
}

function snapshotRelativePath(pathname: string): string | null {
  const decoded = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (!decoded || decoded.startsWith("@") || decoded.startsWith("node_modules/") || decoded.startsWith(".reframe/")) return null;
  if (/\.(?:css|html|js|jsx)$/i.test(decoded)) return decoded;
  if (!decoded || decoded.endsWith("/")) return "index.html";
  return null;
}

function snapshotContentType(relative: string): string {
  if (relative.endsWith(".css")) return "text/css; charset=utf-8";
  if (relative.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/javascript; charset=utf-8";
}

function snapshotModeActive(request: import("node:http").IncomingMessage, localRequest: URL): boolean {
  if (localRequest.searchParams.get("reframe_snapshot") === "session") return true;
  return String(request.headers.cookie ?? "").split(";").some((part) => part.trim() === "reframe_snapshot=session");
}

function writeUpgrade(socket: Duplex, statusCode: number, statusMessage: string, headers: IncomingHttpHeaders): void {
  socket.write(`HTTP/1.1 ${statusCode} ${statusMessage}\r\n`);
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) socket.write(`${name}: ${item}\r\n`);
  }
  socket.write("\r\n");
}

function requestBody(request: import("node:http").IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => { const chunks: Buffer[] = []; let size = 0; request.on("data", (chunk: Buffer) => { size += chunk.length; if (size > limit) { reject(new Error("REFERENCE_SIZE_EXCEEDED")); request.destroy(); } else chunks.push(chunk); }); request.once("end", () => resolve(Buffer.concat(chunks))); request.once("error", reject); });
}

export function createProjectProxy(upstreamInput: string, options: ProjectProxyOptions = {}): ProjectProxy {
  const upstream = new URL(upstreamInput);
  if (upstream.protocol !== "http:") throw new Error(`Only local HTTP upstreams are supported: ${upstreamInput}`);
  const session = options.session ?? randomBytes(24).toString("base64url");
  const token = options.connectionToken ?? randomBytes(32).toString("base64url");
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) throw new Error("Connection token must be at least 32 base64url characters");
  const project: ReframeProjectConnectionInfo = Object.freeze({
    id: options.project?.id ?? randomBytes(12).toString("base64url"),
    name: options.project?.name ?? "Reframe project",
    framework: options.project?.framework ?? "unknown",
    capabilities: options.project?.capabilities ?? { canExplore: false, canWriteSource: false },
  });
  const clientPath = `/.reframe/${session}/client.js`;
  const healthPath = `/.reframe/${session}/health`;
  const webSocketPath = `/.reframe/${session}/ws`;
  const historyImagePath = `/.reframe/${session}/history`;
  const referencePath = `/.reframe/${session}/reference`;
  const aiComparisonPath = `/.reframe/${session}/ai`;
  const codexSessionsPath = `/.reframe/${session}/codex/sessions`;
  const annointsPath = `/.reframe/${session}/annoints`;
  const draftsPath = `/.reframe/${session}/drafts`;
  const overridesCssPath = `/.reframe/${session}/overrides.css`;
  const overridesJsonPath = `/.reframe/${session}/overrides.json`;
  const snapshotsPath = `/.reframe/${session}/snapshots`;
  const annotationImagesPath = `/.reframe/${session}/annotation-images`;
  const insertionsPath = `/.reframe/${session}/insertions`;
  const insertionsJsonPath = `/.reframe/${session}/insertions.json`;
  const sockets = new Set<Duplex>();
  const verifyRoute = options.verifyEdit ?? (async (plan: EditPlan) => {
    const response = await fetch(new URL(plan.route, upstream), { signal: AbortSignal.timeout(2_000) });
    await response.arrayBuffer();
    return response.ok;
  });
  const history = options.projectRoot ? createHistoryStore({
    projectRoot: options.projectRoot,
    captureScreenshot: options.captureHistoryScreenshot,
    allowScreenshot: options.allowHistoryScreenshot,
    screenshotTimeoutMs: options.historyScreenshotTimeoutMs,
    verifyRestore: async (metadata) => {
      const response = await fetch(new URL(metadata.edit.route, upstream), { signal: AbortSignal.timeout(2_000) });
      await response.arrayBuffer();
      return response.ok;
    },
  }) : undefined;
  const sourceEditor = options.projectRoot ? createSourceEditor({
    projectRoot: options.projectRoot,
    framework: project.framework,
    verificationTimeoutMs: options.verificationTimeoutMs,
    verify: verifyRoute,
    history,
  }) : undefined;
  const aiRunner = options.projectRoot ? createAiEditRunner({
    projectRoot: options.projectRoot,
    provider: options.aiProvider,
    providerDeadlineMs: options.aiProviderDeadlineMs,
    history,
    verify: async () => {
      const response = await fetch(new URL("/", upstream), { signal: AbortSignal.timeout(2_000) });
      await response.arrayBuffer();
      return response.ok;
    },
    verifyResponsive: options.verifyResponsive,
  }) : undefined;
  const annotations = options.projectRoot ? createAnnotationStore(options.projectRoot) : undefined;
  const annoints = options.projectRoot ? createAnnointStore(options.projectRoot) : undefined;
  const drafts = options.projectRoot ? createDraftStore({ projectRoot: options.projectRoot }) : undefined;
  const snapshots = options.projectRoot ? createSnapshotStore({ projectRoot: options.projectRoot }) : undefined;
  const references = options.projectRoot ? createReferenceService({ projectRoot: options.projectRoot }) : undefined;
  const insertions = options.projectRoot ? createInsertionStore(options.projectRoot) : undefined;
  const aiState = (state: ReviewState) => ({ generationId: state.generationId, status: state.status, code: state.code ?? "", changedFiles: state.changedFiles, packetFiles: state.packetPreview.files, packetBytes: state.packetPreview.bytes, lineage: state.lineage });
  if (aiRunner) void aiRunner.restorePendingReviews().catch(() => undefined);
  const annotationState = (state: AnnotationState) => ({ annotations: state.annotations.flatMap((view) => view.annotation ? [{ ...view.annotation, resolvedSource: view.resolvedSource, resolution: view.resolution as "exact" | "relocated" | "orphaned" | "ambiguous" | "conflict", checkpointRelationship: view.checkpointRelationship }] : []), issues: state.issues.map((view) => ({ file: view.file, id: view.annotation?.id ?? null, resolution: (view.resolution === "exact" || view.resolution === "relocated" ? "invalid" : view.resolution) as "orphaned" | "ambiguous" | "conflict" | "invalid" | "unsupported", error: view.error ?? `ANNOTATION_${view.resolution.toUpperCase()}` })), parsedFiles: state.parsedFiles, renderedForRoute: state.renderedForRoute });
  const connections = createReframeConnectionServer({
    sessionId: session,
    token,
    project,
    available: options.connectionsInitiallyAvailable,
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    heartbeatTimeoutMs: options.heartbeatTimeoutMs,
    verificationTimeoutMs: options.verificationTimeoutMs,
    logCode: options.logConnectionCode,
    onMappingRequest: options.onMappingRequest ?? (sourceEditor ? (request) => sourceEditor.mapEdit({ fingerprint: request.fingerprint, currentWidth: Math.round(request.currentWidth), width: request.width, currentHeight: Math.round(request.currentHeight ?? request.height ?? 0), height: request.height, previewText: request.previewText, originalText: request.fingerprint.text, previewStyles: request.previewStyles, originalStyles: request.originalStyles, breakpoint: request.breakpoint, sharedImpactAccepted: request.sharedImpactAccepted }) : undefined),
    onEditProposal: sourceEditor ? async (proposal, verifyInBrowser) => {
      await snapshots?.ensureSessionSnapshot();
      const originalHeight = Math.round(proposal.original.computedHeight ?? proposal.height);
      const heightChanged = Math.abs(proposal.height - originalHeight) > 1;
      const result = await sourceEditor.applyEdit({ fingerprint: proposal.fingerprint, currentWidth: Math.round(proposal.original.computedWidth), width: proposal.width, currentHeight: originalHeight, height: proposal.height, previewText: proposal.previewText, originalText: proposal.original.text, previewStyles: proposal.previewStyles, originalStyles: proposal.original.styles, breakpoint: proposal.breakpoint, sharedImpactAccepted: proposal.sharedImpactAccepted, overlapAccepted: proposal.overlapAccepted }, async (plan, state) => {
        const rollback = state === "rollback";
        const verifyHeight = rollback || heightChanged;
        return Boolean(await verifyRoute(plan)) && await verifyInBrowser(rollback ? Math.round(proposal.original.computedWidth) : proposal.width, rollback, verifyHeight ? (rollback ? originalHeight : proposal.height) : undefined);
      });
      // #region agent log
      try { const { appendFile } = await import("node:fs/promises"); await appendFile("debug-591489.log", JSON.stringify({ sessionId: "591489", location: "proxy:onEditProposal", message: "applyEdit result", data: { status: result.status, code: result.code, checkpointId: result.checkpointId, width: proposal.width, height: proposal.height, hasText: Boolean(proposal.previewText) }, hypothesisId: "H5", timestamp: Date.now() }) + "\n"); } catch {}
      // #endregion
      if (result.status === "applied" && history && !result.checkpointId && result.code !== "OVERRIDE_APPLIED") return { status: "rejected", code: "CHECKPOINT_MISSING", checkpointId: undefined, visualComplete: false };
      if (result.status === "applied") await options.onEditProposal?.(proposal);
      return { status: result.status, code: result.code, checkpointId: result.checkpointId, visualComplete: result.visualComplete };
    } : options.onEditProposal,
    onHistoryState: history ? async (request) => {
      const state = await history.state();
      const current = state.checkpoints.find((checkpoint) => checkpoint.id === state.currentId);
      const route = request.route ?? current?.route ?? "/"; const viewport = request.viewport ?? current?.viewport ?? { width: 0, height: 0 };
      const byId = new Map(state.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint])); const ancestors = []; const seen = new Set<string>(); let ancestorId = current?.parentId;
      while (ancestorId && !seen.has(ancestorId)) { seen.add(ancestorId); const checkpoint = byId.get(ancestorId); if (!checkpoint) break; ancestors.push(checkpoint); ancestorId = checkpoint.parentId; }
      const prior = current?.valid && current.route === route && current.screenshots?.before.page ? current : ancestors.find((checkpoint) => checkpoint.valid && checkpoint.route === route && checkpoint.screenshots?.after.page) ?? (current?.valid && current.screenshots?.before.page ? current : ancestors.find((checkpoint) => checkpoint.valid && checkpoint.screenshots?.after.page));
      const stage = prior?.id === state.currentId ? "before" as const : "after" as const; const screenshot = prior?.screenshots?.[stage].page;
      const comparison = prior && prior.route && prior.viewport && screenshot ? { checkpointId: prior.id, stage, kind: "page" as const, status: screenshot.status, error: screenshot.error, route: prior.route, viewport: prior.viewport, exactRoute: prior.route === route, exactViewport: prior.viewport.width === viewport.width && prior.viewport.height === viewport.height, imagePath: screenshot.status === "captured" ? `${historyImagePath}/${prior.id}/${stage}/page` : undefined } : null;
      const checkpoints = state.checkpoints.map(({ screenshots: _screenshots, ...checkpoint }) => ({ ...checkpoint, files: [...checkpoint.files].slice(0, 16), promptSummary: checkpoint.promptSummary?.slice(0, 160), error: checkpoint.error?.slice(0, 160) }));
      return { currentId: state.currentId, previousId: current?.parentId ?? null, canRestore: Boolean(state.currentId && current?.valid), visualComplete: current?.visualComplete ?? false, gitAvailable: state.gitAvailable, dirty: state.dirty, incomplete: state.incomplete, checkpoints, comparison };
    } : undefined,
    onHistoryRestore: history ? async () => {
      const result = await history.restorePrevious();
      return { currentId: result.currentId };
    } : undefined,
    onAiGenerate: aiRunner ? async (message, mapping, result) => {
      const candidate = result.candidates.find((item) => /\.css$/i.test(item.path)) ?? result.candidates[0];
      if (!candidate) throw new Error("AI_EXACT_SOURCE_REQUIRED");
      const taskLabel = message.conversationId?.trim() || "new ephemeral task";
      const promptPreview = message.instruction.length > 80 ? `${message.instruction.slice(0, 77)}…` : message.instruction;
      console.log(`[reframe] AI generate → Codex task ${taskLabel}: "${promptPreview}"`);
      const stylingMethod = /\.jsx$/i.test(candidate.path) ? "tailwind" : /\.module\.css$/i.test(candidate.path) ? "css-module" : project.framework === "react" ? "react-css" : "vanilla-css";
      const dna = await readDesignDna(options.projectRoot!).catch(() => undefined); const designDna = dna ? selectDesignDnaContext(dna, { sourcePath: candidate.path }) : undefined;
      const reference = message.referencePlanId ? references?.packet(message.referencePlanId) : undefined;
      return aiState(await aiRunner.generate({ projectRoot: options.projectRoot!, fingerprint: mapping.fingerprint, sourcePath: candidate.path, framework: project.framework === "react" ? "react" : "vanilla", stylingMethod, instruction: message.instruction, classes: mapping.fingerprint.classes, screenshots: { selected: "excluded", surrounding: "excluded", fullPage: "excluded", blurredRegions: 0 }, generationId: message.generationId, conversationId: message.conversationId, designDna, reference, validateReferenceProposal: message.referencePlanId ? (values) => references!.copyGuard(message.referencePlanId!, values) : undefined }));
    } : undefined,
    onAiAction: aiRunner ? async (message) => {
      if (message.action === "accept") return aiState(await aiRunner.accept(message.generationId));
      if (message.action === "reject") return aiState(await aiRunner.reject(message.generationId));
      if (message.action === "stop") return aiState(await aiRunner.stop(message.generationId));
      if (message.action === "dismiss") return aiState(await aiRunner.dismiss(message.generationId));
      if (message.action === "refine") return aiState(await aiRunner.refine(message.generationId, message.instruction));
      await aiRunner.compare(message.generationId);
      const state = aiRunner.state(message.generationId);
      if (!state) throw new Error("REVIEW_UNAVAILABLE");
      return { ...aiState(state), status: "compared" as const, code: "COMPARE_READY" };
    } : undefined,
    onAnnotationList: annotations ? async (message) => annotationState(await annotations.load({ route: message.route, checkpointId: message.checkpointId })) : undefined,
    onAnnotationCreate: annotations ? async (message) => ({ annotationId: (await annotations.create(message)).id }) : undefined,
    onAnnotationAction: annotations ? async (message) => message.action === "promote" ? { annotationId: message.annotationId, proposalId: (await annotations.promote(message.annotationId, message.confirmed)).id } : { annotationId: (await annotations.update(message.annotationId, message.action)).id } : undefined,
  });
  let stopAnnotationWatcher: (() => void) | undefined; const annotationWatcher = annotations?.subscribe((state) => connections.publishAnnotations(annotationState(state))).then((stop) => { stopAnnotationWatcher = stop; }).catch(() => undefined);
  let ipv6Server: Server | undefined;
  let hasIpv6 = false;
  let proxyOrigin = "";

  const server = createServer((request, response) => {
    if (request.url === healthPath) {
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
      response.end('{"status":"ok"}');
      return;
    }
    if (request.url === clientPath) {
      const validReferer = request.headers.referer === undefined || originOf(request.headers.referer) === proxyOrigin;
      if (request.method !== "GET" || !validReferer) {
        response.writeHead(403, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
        return;
      }
      const source = options.clientSource ?? BROWSER_CLIENT_SOURCE;
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(source),
        "Content-Type": "text/javascript; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(source);
      return;
    }
    const localRequest = new URL(request.url ?? "/", "http://reframe.local");
    if (localRequest.pathname === referencePath || localRequest.pathname === `${referencePath}/plan` || localRequest.pathname === `${referencePath}/freeze` || localRequest.pathname === `${referencePath}/dna`) {
      const allowed = request.method === "POST" && request.headers.authorization === `Bearer ${token}` && originOf(request.headers.referer) === proxyOrigin && references;
      if (!allowed) { response.writeHead(403, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end('{"code":"REFERENCE_AUTH_INVALID"}'); return; }
      void requestBody(request, 8 * 1024 * 1024).then(async (body) => {
        let result: unknown;
        if (localRequest.pathname === referencePath) {
          const kind = String(request.headers["x-reframe-reference-kind"] ?? "") as ReferenceKind;
          if (!["screenshot", "figma-export", "hand-drawn", "site-screenshot", "markdown"].includes(kind)) throw new Error("REFERENCE_KIND_UNSUPPORTED");
          result = await references!.intake({ kind: kind as Exclude<ReferenceKind, "design-dna">, filename: String(request.headers["x-reframe-filename"] ?? "reference"), mime: String(request.headers["content-type"] ?? "application/octet-stream").split(";")[0]!, bytes: body, provenance: String(request.headers["x-reframe-provenance"] ?? "User supplied"), persist: request.headers["x-reframe-persist"] === "true" });
        } else {
          const value = JSON.parse(body.toString("utf8"));
          if (localRequest.pathname === `${referencePath}/plan`) { const planInput = value as AdaptationPlanInput; const loaded = await readDesignDna(options.projectRoot!).then((dna) => selectDesignDnaContext(dna, { sourcePath: planInput.target?.sourcePath })).catch(() => undefined); result = references!.createPlan({ ...planInput, designDna: loaded }); }
          else if (localRequest.pathname === `${referencePath}/freeze`) result = references!.freeze(String(value.planId ?? ""));
          else { const dna = await readDesignDna(options.projectRoot!); result = await references!.approvedDna({ id: String(value.id ?? ""), version: String(value.version ?? ""), provenance: String(value.provenance ?? "Approved Design DNA reference"), designDna: selectDesignDnaContext(dna, {}) }); }
        }
        const json = JSON.stringify(result); response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json), "X-Content-Type-Options": "nosniff" }); response.end(json);
      }).catch((error) => { if (!response.headersSent) response.writeHead(400, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error) })); });
      return;
    }
    if (localRequest.pathname === codexSessionsPath) {
      const requestOrigin = originOf(request.headers.referer) ?? originOf(request.headers.origin);
      const allowed = request.method === "GET" && request.headers.authorization === `Bearer ${token}` && requestOrigin === proxyOrigin;
      if (!allowed) { response.writeHead(403, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end('{"code":"CODEX_SESSIONS_AUTH_INVALID"}'); return; }
      void listCodexSessions().then((sessions) => {
        console.log(`[reframe] codex sessions: ${sessions.length} from ${process.env.CODEX_HOME || "~/.codex"}`);
        const json = JSON.stringify({ sessions });
        response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json), "X-Content-Type-Options": "nosniff" });
        response.end(json);
      }).catch((error) => {
        response.writeHead(500, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error), sessions: [] }));
      });
      return;
    }
    if (localRequest.pathname === insertionsJsonPath || localRequest.pathname === insertionsPath || localRequest.pathname.startsWith(`${insertionsPath}/`)) {
      const requestOrigin = originOf(request.headers.referer) ?? originOf(request.headers.origin);
      if (request.method === "GET" && localRequest.pathname === insertionsJsonPath && insertions) {
        const routeValue = localRequest.searchParams.get("route") ?? undefined;
        void insertions.list(routeValue).then((items) => {
          const json = JSON.stringify({ insertions: items });
          response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json), "X-Content-Type-Options": "nosniff" });
          response.end(json);
        }).catch((error) => { response.writeHead(500, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error) })); });
        return;
      }
      if (request.method === "GET" && localRequest.pathname.startsWith(`${insertionsPath}/`) && localRequest.pathname.endsWith(".png") && insertions) {
        const rawId = localRequest.pathname.slice(insertionsPath.length + 1).replace(/\.png$/, "").toLowerCase();
        if (!rawId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(rawId)) { response.writeHead(404); response.end(); return; }
        void insertions.readImage(rawId).then((bytes) => {
          response.writeHead(200, { "Cache-Control": "private, max-age=0, no-store", "Content-Length": bytes.length, "Content-Type": "image/png", "X-Content-Type-Options": "nosniff" });
          response.end(bytes);
        }).catch(() => { if (!response.headersSent) { response.writeHead(404); response.end(); } });
        return;
      }
      const allowed = request.headers.authorization === `Bearer ${token}` && requestOrigin === proxyOrigin && insertions;
      if (!allowed) { response.writeHead(403, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end('{"code":"INSERTION_AUTH_INVALID"}'); return; }
      if (request.method === "PUT" && localRequest.pathname.startsWith(`${insertionsPath}/`)) {
        void requestBody(request, 8 * 1024 * 1024).then(async (body) => {
          const rawId = localRequest.pathname.slice(insertionsPath.length + 1).split("/")[0]?.toLowerCase();
          if (!rawId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(rawId)) throw new Error("INSERTION_ID_INVALID");
          const value = JSON.parse(body.toString("utf8"));
          const routeValue = String(value.route ?? "/");
          const type = String(value.type ?? "html");
          const html = String(value.html ?? "");
          if (!html || !["html", "image", "svg"].includes(type)) throw new Error("INSERTION_DRAFT_INVALID");
          const saved = await insertions.save({ id: rawId, route: routeValue, type: type as "html" | "image" | "svg", html, containerFingerprint: typeof value.containerFingerprint === "string" ? value.containerFingerprint : null, dataUrl: typeof value.dataUrl === "string" ? value.dataUrl : undefined });
          const json = JSON.stringify({ id: saved.id, imagePath: saved.imagePath });
          response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json), "X-Content-Type-Options": "nosniff" });
          response.end(json);
        }).catch((error) => { if (!response.headersSent) response.writeHead(400, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error) })); });
        return;
      }
      if (request.method === "DELETE" && localRequest.pathname.startsWith(`${insertionsPath}/`)) {
        const rawId = localRequest.pathname.slice(insertionsPath.length + 1).split("/")[0]?.toLowerCase();
        if (!rawId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(rawId)) { response.writeHead(404); response.end(); return; }
        void insertions.remove(rawId).then(() => {
          response.writeHead(204, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
          response.end();
        }).catch((error) => { if (!response.headersSent) response.writeHead(400, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error) })); });
        return;
      }
      response.writeHead(405, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
      response.end('{"code":"INSERTION_METHOD_UNSUPPORTED"}');
      return;
    }
    if (localRequest.pathname === annotationImagesPath || localRequest.pathname.startsWith(`${annotationImagesPath}/`)) {
      const requestOrigin = originOf(request.headers.referer) ?? originOf(request.headers.origin);
      const allowed = request.headers.authorization === `Bearer ${token}` && requestOrigin === proxyOrigin && annotations;
      if (!allowed) { response.writeHead(403, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end('{"code":"ANNOTATION_IMAGE_AUTH_INVALID"}'); return; }
      if (request.method === "PUT" && localRequest.pathname.startsWith(`${annotationImagesPath}/`)) {
        void requestBody(request, 8 * 1024 * 1024).then(async (body) => {
          const rawId = localRequest.pathname.slice(annotationImagesPath.length + 1).split("/")[0]?.toLowerCase();
          if (!rawId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(rawId)) throw new Error("ANNOTATION_ID_INVALID");
          const value = JSON.parse(body.toString("utf8"));
          const position = value.position;
          if (position && typeof position.x === "number" && typeof position.y === "number" && !value.dataUrl) {
            const saved = await annotations!.updateImage(rawId, { position });
            const json = JSON.stringify({ id: saved.id });
            response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json), "X-Content-Type-Options": "nosniff" });
            response.end(json);
            return;
          }
          const routeValue = String(value.route ?? "/");
          const viewport = value.viewport;
          if (!position || typeof position.x !== "number" || typeof position.y !== "number" || !viewport || typeof viewport.width !== "number" || typeof viewport.height !== "number") throw new Error("ANNOTATION_IMAGE_DRAFT_INVALID");
          const imageBytes = Buffer.from(String(value.dataUrl ?? "").replace(/^data:image\/\w+;base64,/, ""), "base64");
          const imagePath = await annotations!.saveImage(rawId, imageBytes);
          const saved = await annotations!.createImage({ id: rawId, route: routeValue, viewport, position, imagePath, author: typeof value.author === "string" ? value.author : undefined });
          const json = JSON.stringify({ id: saved.id, imagePath });
          response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json), "X-Content-Type-Options": "nosniff" });
          response.end(json);
        }).catch((error) => { if (!response.headersSent) response.writeHead(400, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error) })); });
        return;
      }
      if (request.method === "DELETE" && localRequest.pathname.startsWith(`${annotationImagesPath}/`)) {
        const rawId = localRequest.pathname.slice(annotationImagesPath.length + 1).split("/")[0]?.toLowerCase();
        if (!rawId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(rawId)) { response.writeHead(404); response.end(); return; }
        void annotations!.deleteImage(rawId).then(() => {
          response.writeHead(204, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
          response.end();
        }).catch((error) => { if (!response.headersSent) response.writeHead(400, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error) })); });
        return;
      }
      if (request.method === "GET" && localRequest.pathname.startsWith(`${annotationImagesPath}/`)) {
        const rawId = localRequest.pathname.slice(annotationImagesPath.length + 1).split("/")[0]?.toLowerCase();
        if (!rawId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(rawId)) { response.writeHead(404); response.end(); return; }
        void annotations!.readImage(rawId).then((bytes) => {
          response.writeHead(200, { "Cache-Control": "private, max-age=0, no-store", "Content-Length": bytes.length, "Content-Type": "image/png", "X-Content-Type-Options": "nosniff" });
          response.end(bytes);
        }).catch(() => { if (!response.headersSent) { response.writeHead(404); response.end(); } });
        return;
      }
      response.writeHead(405, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
      response.end('{"code":"ANNOTATION_IMAGE_METHOD_UNSUPPORTED"}');
      return;
    }
    if (localRequest.pathname === annointsPath || localRequest.pathname.startsWith(`${annointsPath}/`)) {
      const allowed = request.headers.authorization === `Bearer ${token}` && originOf(request.headers.referer) === proxyOrigin && annoints;
      if (!allowed) { response.writeHead(403, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end('{"code":"ANNOINT_AUTH_INVALID"}'); return; }
      if (request.method === "GET" && localRequest.pathname === annointsPath) {
        void annoints!.load({ route: localRequest.searchParams.get("route") ?? undefined }).then((items) => {
          const json = JSON.stringify({ annoints: items });
          response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json), "X-Content-Type-Options": "nosniff" });
          response.end(json);
        }).catch((error) => { response.writeHead(500, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error) })); });
        return;
      }
      if (request.method === "PUT" && localRequest.pathname.startsWith(`${annointsPath}/`)) {
        void requestBody(request, 2 * 1024 * 1024).then(async (body) => {
          const rawId = localRequest.pathname.slice(annointsPath.length + 1).split("/")[0];
          const id = rawId && isAnnointId(rawId) ? rawId.toLowerCase() : undefined;
          const value = JSON.parse(body.toString("utf8"));
          const viewport = value.viewport;
          if (!viewport || typeof viewport.width !== "number" || typeof viewport.height !== "number" || viewport.width <= 0 || viewport.height <= 0) throw new Error("ANNOINT_VIEWPORT_INVALID");
          const saved = await annoints!.save({ ...(id ? { id } : {}), route: String(value.route ?? "/"), viewport, strokes: value.strokes ?? [], texts: value.texts ?? [] });
          const json = JSON.stringify(saved);
          response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json), "X-Content-Type-Options": "nosniff" });
          response.end(json);
        }).catch((error) => { if (!response.headersSent) response.writeHead(400, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error) })); });
        return;
      }
      response.writeHead(405, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
      response.end('{"code":"ANNOINT_METHOD_UNSUPPORTED"}');
      return;
    }
    if (localRequest.pathname === overridesCssPath || localRequest.pathname === overridesJsonPath) {
      if (request.method !== "GET" || !options.projectRoot) { response.writeHead(405, { "Cache-Control": "no-store" }); response.end(); return; }
      const target = path.join(options.projectRoot, ".reframe", localRequest.pathname.endsWith(".json") ? "overrides.json" : "overrides.css");
      void readFile(target).then((body) => {
        response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": localRequest.pathname.endsWith(".json") ? "application/json; charset=utf-8" : "text/css; charset=utf-8", "Content-Length": body.length, "X-Content-Type-Options": "nosniff" });
        response.end(body);
      }).catch(() => {
        if (localRequest.pathname.endsWith(".json")) { response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end("{}"); }
        else { response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "text/css; charset=utf-8" }); response.end(""); }
      });
      return;
    }
    if (localRequest.pathname === draftsPath || localRequest.pathname.startsWith(`${draftsPath}/`)) {
      const allowed = request.headers.authorization === `Bearer ${token}` && originOf(request.headers.referer) === proxyOrigin && drafts;
      if (!allowed) { response.writeHead(403, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end('{"code":"DRAFT_AUTH_INVALID"}'); return; }
      if (request.method === "GET" && localRequest.pathname === draftsPath) {
        const routeValue = localRequest.searchParams.get("route") ?? "/";
        void drafts!.load(routeValue).then((draft) => {
          const json = JSON.stringify({ draft });
          response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json), "X-Content-Type-Options": "nosniff" });
          response.end(json);
        }).catch((error) => { response.writeHead(500, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error) })); });
        return;
      }
      if (request.method === "PUT" && localRequest.pathname === draftsPath) {
        void requestBody(request, 512 * 1024).then(async (body) => {
          const value = JSON.parse(body.toString("utf8"));
          const saved = await drafts!.save(value);
          const json = JSON.stringify(saved);
          response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json), "X-Content-Type-Options": "nosniff" });
          response.end(json);
        }).catch((error) => { if (!response.headersSent) response.writeHead(400, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error) })); });
        return;
      }
      if (request.method === "DELETE" && localRequest.pathname === draftsPath) {
        void drafts!.clear(localRequest.searchParams.get("route") ?? "/").then(() => {
          response.writeHead(204, { "Cache-Control": "no-store" });
          response.end();
        });
        return;
      }
      response.writeHead(405, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
      response.end('{"code":"DRAFT_METHOD_UNSUPPORTED"}');
      return;
    }
    if (localRequest.pathname === snapshotsPath) {
      const allowed = request.method === "POST" && request.headers.authorization === `Bearer ${token}` && originOf(request.headers.referer) === proxyOrigin && snapshots;
      if (!allowed) { response.writeHead(403, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end('{"code":"SNAPSHOT_AUTH_INVALID"}'); return; }
      void snapshots!.ensureSessionSnapshot().then((value) => {
        const json = JSON.stringify(value);
        response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json), "X-Content-Type-Options": "nosniff" });
        response.end(json);
      }).catch((error) => { response.writeHead(500, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error) })); });
      return;
    }
    if (localRequest.pathname === aiComparisonPath || localRequest.pathname === `${aiComparisonPath}/pending`) {
      const allowed = request.method === "GET" && request.headers.authorization === `Bearer ${token}` && originOf(request.headers.referer) === proxyOrigin && aiRunner;
      if (!allowed) { response.writeHead(403, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" }); response.end("Forbidden"); return; }
      if (localRequest.pathname === `${aiComparisonPath}/pending`) {
        void (async () => {
          const restored = await aiRunner!.restorePendingReviews();
          const reviews = restored.map((state) => aiState(state));
          const seen = new Set(reviews.map((item) => item.generationId));
          if (options.projectRoot) {
            const directory = path.join(options.projectRoot, ".reframe", "generations");
            try {
              for (const entry of await readdir(directory, { withFileTypes: true })) {
                if (!entry.isDirectory() || seen.has(entry.name)) continue;
                try {
                  const status = JSON.parse(await readFile(path.join(directory, entry.name, "status.json"), "utf8")) as { status?: string; files?: string[]; lineage?: string[] };
                  if (status.status !== "review") continue;
                  let code = "REVIEW_RESTORE_FAILED";
                  try {
                    await readFile(path.join(directory, entry.name, "review.json"), "utf8");
                    code = "REVIEW_SOURCE_STALE";
                  } catch { /* review.json missing — cannot restore */ }
                  reviews.push({ generationId: entry.name, status: "failed", code, changedFiles: [...(status.files ?? [])].slice(0, 4), packetFiles: [...(status.files ?? [])].slice(0, 4), packetBytes: 0, lineage: [...(status.lineage ?? [])].slice(0, 32) });
                } catch { /* skip malformed generation artifacts */ }
              }
            } catch { /* no generations directory yet */ }
          }
          const json = JSON.stringify({ reviews });
          response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json), "X-Content-Type-Options": "nosniff" });
          response.end(json);
        })().catch((error) => {
          response.writeHead(500, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error), reviews: [] }));
        });
        return;
      }
    }
    if (localRequest.pathname.startsWith(`${aiComparisonPath}/`)) {
      const [generationId, stage, extra] = localRequest.pathname.slice(aiComparisonPath.length + 1).split("/"); const allowed = request.method === "GET" && request.headers.authorization === `Bearer ${token}` && originOf(request.headers.referer) === proxyOrigin && /^[A-Za-z0-9_-]{1,128}$/.test(generationId ?? "") && stage === "before" && !extra && aiRunner;
      if (!allowed) { response.writeHead(403, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" }); response.end("Forbidden"); return; }
      void aiRunner!.comparisonScreenshot(generationId!).then((bytes) => { response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "image/png", "Content-Length": bytes.byteLength, "X-Content-Type-Options": "nosniff" }); response.end(bytes); }).catch((error) => { response.writeHead(410, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ code: error instanceof Error ? error.message : String(error) })); }); return;
    }
    const historyRequest = localRequest;
    if (historyRequest.pathname.startsWith(`${historyImagePath}/`)) {
      const [checkpointId, stage, kind, extra] = historyRequest.pathname.slice(historyImagePath.length + 1).split("/");
      const allowed = request.method === "GET" && request.headers.authorization === `Bearer ${token}` && originOf(request.headers.referer) === proxyOrigin && /^[A-Za-z0-9_-]{1,128}$/.test(checkpointId ?? "") && (stage === "before" || stage === "after") && (kind === "page" || kind === "component") && !extra && history;
      if (!allowed) { response.writeHead(403, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" }); response.end("Forbidden"); return; }
      void history!.readScreenshot(checkpointId!, stage, kind).then(({ record, bytes }) => {
        if (record.status !== "captured" || !bytes) { response.writeHead(410, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ status: record.status, error: record.error ?? "SCREENSHOT_UNAVAILABLE" })); return; }
        response.writeHead(200, { "Cache-Control": "private, max-age=0, no-store", "Content-Length": bytes.length, "Content-Security-Policy": "default-src 'none'", "Content-Type": "image/png", "X-Content-Type-Options": "nosniff" }); response.end(bytes);
      }).catch((error) => { if (!response.headersSent) response.writeHead(410, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ status: "corrupt", error: error instanceof Error ? error.message : String(error) })); });
      return;
    }

    if (snapshots && snapshotModeActive(request, localRequest)) {
      const relative = snapshotRelativePath(localRequest.pathname);
      if (relative) {
        void snapshots.readSnapshot(relative).then((bytes) => {
          if (!bytes) {
            if (!response.headersSent) response.writeHead(404, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
            response.end("Snapshot file unavailable");
            return;
          }
          const headers: OutgoingHttpHeaders = { "Cache-Control": "no-store", "Content-Type": snapshotContentType(relative), "Content-Length": bytes.length, "X-Content-Type-Options": "nosniff" };
          if (localRequest.searchParams.get("reframe_snapshot") === "session") headers["set-cookie"] = "reframe_snapshot=session; Path=/; SameSite=Lax";
          response.writeHead(200, headers);
          response.end(bytes);
        }).catch((error) => {
          if (!response.headersSent) response.writeHead(500, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
          response.end(error instanceof Error ? error.message : String(error));
        });
        return;
      }
    }

    const upstreamRequest = httpRequest({
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      method: request.method,
      path: request.url,
      headers: proxyHeaders(request.headers, upstream, proxyOrigin),
    }, (upstreamResponse) => {
      const status = upstreamResponse.statusCode ?? 502;
      const headers = responseHeaders(upstreamResponse.headers, upstream, proxyOrigin);
      const contentType = String(upstreamResponse.headers["content-type"] ?? "").toLowerCase();
      const encoding = String(upstreamResponse.headers["content-encoding"] ?? "identity").toLowerCase();
      const responseIsSupported = request.method === "GET" && status >= 200 && status < 300 && ["identity", "gzip", "deflate", "br"].includes(encoding);
      const htmlEligible = responseIsSupported && contentType.startsWith("text/html") && navigation(request.headers);
      const reactSourcePath = responseIsSupported && project.framework === "react" && sourceEditor && /(?:java|ecma)script/.test(contentType) ? viteSourcePath(request.url) : null;
      const eligible = htmlEligible || Boolean(reactSourcePath);
      if (!eligible) {
        response.writeHead(status, headers);
        upstreamResponse.pipe(response);
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      upstreamResponse.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_TRANSFORM_BYTES) upstreamRequest.destroy(new Error(`Transformable response exceeds ${MAX_TRANSFORM_BYTES} bytes`));
        else chunks.push(chunk);
      });
      upstreamResponse.once("end", async () => {
        try {
          const decoded = await decode(Buffer.concat(chunks), encoding);
          let transformed: string;
          if (reactSourcePath && sourceEditor) {
            transformed = await sourceEditor.injectReactMetadata(reactSourcePath, decoded.toString("utf8"));
          } else {
            const bootstrap = `<link rel="stylesheet" href="${overridesCssPath}" data-reframe-overrides><script data-reframe-overrides-text>(function(){fetch("${overridesJsonPath}").then(function(r){return r.ok?r.json():{}}).then(function(entries){for(var hash in entries){var entry=entries[hash];if(!entry||!entry.fingerprint)continue;var fp=entry.fingerprint;var el=fp.id?document.getElementById(fp.id):null;if(!el&&fp.classes&&fp.classes.length){var matches=[].slice.call(document.querySelectorAll(fp.tag)).filter(function(node){return fp.classes.every(function(name){return node.classList.contains(name)})});if(matches.length===1)el=matches[0];else if(fp.text){var textMatches=matches.filter(function(node){return(node.innerText||node.textContent||"").replace(/\\s+/g," ").trim().slice(0,256)===fp.text});if(textMatches.length===1)el=textMatches[0]}}if(!el)continue;el.setAttribute("data-reframe-fingerprint",hash);if(typeof entry.text==="string")el.textContent=entry.text}}).catch(function(){})})()</script><script data-reframe-insertions>(function(){fetch("${insertionsJsonPath}?route="+encodeURIComponent(location.pathname||"/")).then(function(r){return r.ok?r.json():{insertions:[]}}).then(function(payload){var items=payload.insertions||[];for(var i=0;i<items.length;i++){var item=items[i];if(!item||!item.html||document.querySelector('[data-reframe-insertion="'+item.id+'"],[data-reframe-insertion-id="'+item.id+'"]'))continue;var host=document.createElement("div");host.innerHTML=item.html;var node=host.firstElementChild;if(!node)continue;node.setAttribute("data-reframe-insertion",item.id);node.setAttribute("data-reframe-insertion-id",item.id);if(item.type==="image"&&item.imagePath){var img=node.tagName==="IMG"?node:node.querySelector("img");if(img)img.src="${insertionsPath}/"+item.id+".png"}var container=document.body;if(item.containerFingerprint){var match=document.querySelector('[data-reframe-fingerprint="'+item.containerFingerprint+'"]');if(match)container=match}if(getComputedStyle(container).position==="static")container.style.position="relative";container.appendChild(node)}}).catch(function(){})})()</script><script data-reframe-bootstrap data-reframe-session="${session}" data-reframe-proxy-origin="${proxyOrigin}" data-reframe-project-id="${project.id}" data-reframe-token="${token}" data-reframe-ws-path="${webSocketPath}" data-reframe-heartbeat-ms="${options.heartbeatIntervalMs ?? 1_000}" data-reframe-heartbeat-timeout-ms="${options.heartbeatTimeoutMs ?? 2_500}" data-reframe-reconnect-base-ms="${options.reconnectBaseMs ?? 100}" data-reframe-reconnect-max-ms="${options.reconnectMaxMs ?? 2_000}" src="${clientPath}" defer></script>`;
            const html = project.framework === "vanilla" && sourceEditor ? injectVanillaSourceMetadata(decoded.toString("utf8")) : decoded.toString("utf8");
            transformed = injectHtml(html, bootstrap);
          }
          const injected = await encode(Buffer.from(transformed), encoding);
          delete headers["content-length"];
          delete headers.etag;
          delete headers["content-md5"];
          delete headers["transfer-encoding"];
          headers["content-length"] = injected.length;
          headers[reactSourcePath ? "x-reframe-source-metadata" : "x-reframe-injected"] = "1";
          response.writeHead(status, headers);
          response.end(injected);
        } catch (error) {
          if (!response.headersSent) response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
          response.end(`REFRAME_PROXY_ERROR: ${String(error)}`);
        }
      });
    });
    upstreamRequest.once("error", (error) => {
      if (!response.headersSent) response.writeHead(502, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
      response.end(`UPSTREAM_UNAVAILABLE: ${String(error)}`);
    });
    request.pipe(upstreamRequest);
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (request, socket, head) => {
    if (request.url === webSocketPath) {
      connections.handleUpgrade(request, socket, head);
      return;
    }
    const upstreamRequest = httpRequest({
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      method: request.method,
      path: request.url,
      headers: proxyHeaders(request.headers, upstream, proxyOrigin),
    });
    upstreamRequest.once("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
      sockets.add(upstreamSocket);
      upstreamSocket.once("close", () => sockets.delete(upstreamSocket));
      writeUpgrade(socket, upstreamResponse.statusCode ?? 101, upstreamResponse.statusMessage ?? "Switching Protocols", upstreamResponse.headers);
      if (head.length) upstreamSocket.write(head);
      if (upstreamHead.length) socket.write(upstreamHead);
      socket.pipe(upstreamSocket).pipe(socket);
    });
    upstreamRequest.once("response", () => socket.destroy());
    upstreamRequest.once("error", () => socket.destroy());
    upstreamRequest.end();
  });

  return {
    server,
    session,
    clientPath,
    webSocketPath,
    projectId: project.id,
    get ipv6Available() { return hasIpv6; },
    async listen(port = 0) {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolve(); });
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Proxy has no TCP address");
      proxyOrigin = `http://127.0.0.1:${address.port}`;
      const ipv6Origin = `http://[::1]:${address.port}`;
      connections.configure([proxyOrigin, ipv6Origin], [`127.0.0.1:${address.port}`, `[::1]:${address.port}`]);
      ipv6Server = createServer((_request, response) => response.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"));
      ipv6Server.on("upgrade", (request, socket, head) => {
        if (request.url === webSocketPath) connections.handleUpgrade(request, socket, head);
        else socket.destroy();
      });
      hasIpv6 = await new Promise<boolean>((resolve) => {
        const onError = () => resolve(false);
        ipv6Server!.once("error", onError);
        ipv6Server!.listen({ port: address.port, host: "::1", ipv6Only: true }, () => {
          ipv6Server!.off("error", onError);
          resolve(true);
        });
      });
      return { port: address.port, url: `${proxyOrigin}/` };
    },
    setConnectionsAvailable(available) { connections.setAvailable(available); },
    setConnectionPongEnabled(enabled) { connections.setPongEnabled(enabled); },
    connectionDiagnostics() { return connections.diagnostics(); },
    async close() {
      await aiRunner?.close();
      await references?.close();
      await annotationWatcher; stopAnnotationWatcher?.(); await annotations?.close();
      connections.close();
      for (const socket of sockets) socket.destroy();
      if (ipv6Server?.listening) await new Promise<void>((resolve) => ipv6Server!.close(() => resolve()));
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
