import { createServer, type Server } from "node:http";
export { detectProject, detectProjectStack, defaultPortForFramework, frameworkLabel, packageManagerCommand, parseDevCommand, ProjectError, proxyFramework, stackLimitations, type DetectProjectOptions, type PackageManager, type ProjectCommand, type ProjectDescriptor, type ProjectFramework, type ProjectStack, type ProjectStyling } from "./project.js";
export { attachProject, resolveDevServer, startProject, COMMON_DEV_PORTS, DEFAULT_DEV_SERVER_DEADLINE_MS, findRunningDevServer, type ProjectRuntime, type ProjectRuntimeOptions, type SpawnVector } from "./project-runtime.js";
export { createProjectProxy, type ProjectProxy, type ProjectProxyOptions } from "./proxy.js";
export { createReferenceService, ReferenceError, REFERENCE_CHARACTERISTICS, REFERENCE_PACKET_BUDGET, type ReferenceService, type ReferenceDescriptor, type ReferenceKind, type ReferenceCharacteristic, type BrandTreatment, type AdaptationPlan, type AdaptationPlanInput, type ReferencePacketContext } from "./references.js";
export { createReframeConnectionServer, isLoopbackAddress, type AnnotationActionResponse, type AnnotationStateResponse, type ConnectionDiagnostics, type EditProposalResponse, type MappingResponse, type ReframeConnectionOptions, type ReframeConnectionServer, type ReframeProjectConnectionInfo } from "./websocket-server.js";
export { createSourceEditor, injectReactViteSourceMetadata, injectVanillaSourceMetadata, resolveProjectPath, type EditPlan, type EditResult, type MappingCandidate, type MappingConfidence, type MappingResult, type SourceEditorOptions, type StylingMode, type TransactionOperations, type WidthEditRequest } from "./source-editor.js";
export { fingerprintHash } from "@reframe/shared";
export { createHistoryStore, type CheckpointInput, type CheckpointMetadata, type CheckpointSummary, type GitSnapshot, type HistoryFileInput, type HistoryPreflight, type HistoryState, type HistoryStoreOptions, type ScreenshotCapture, type ScreenshotRecord, type ScreenshotStage } from "./history.js";
export { buildElementContextPacket, createAiEditRunner, createCodexCliProvider, createFakeCodexProvider, createOpenAiCodexProvider, validateAiProposal, AiEditError, DEFAULT_AI_PROVIDER_DEADLINE_MS, resolveAiProviderDeadlineMs, type AiEditRunner, type AiEditRunnerOptions, type AiProposal, type AiProvider, type ContextPacket, type ContextPacketInput, type ReviewState } from "./ai-edit.js";
export { analyzeDesignDna, designDnaStatus, persistDesignDna, readDesignDna, reviewDesignDna, selectDesignDnaContext, updateAgentsDesignSection, type DesignCategory, type DesignComponent, type DesignDnaContext, type DesignDnaPreview, type DesignEvidence, type DesignFinding, type DesignReviewStatus } from "./design-dna.js";
export { createDraftStore, type EditDraft } from "./drafts.js";
export { createSnapshotStore } from "./snapshots.js";

export const REFRAME_HOST = "127.0.0.1";
export const REFRAME_PORT = 4400;

export const WELCOME_TEXT = [
  "Reframe",
  "Your visual development environment is running.",
  "Project detection is not available yet.",
];

const welcomeHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reframe</title></head>
  <body><main><h1>${WELCOME_TEXT[0]}</h1><p>${WELCOME_TEXT[1]}</p><p>${WELCOME_TEXT[2]}</p></main></body>
</html>`;

export interface WelcomeServer {
  readonly server: Server;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

export function createWelcomeServer(): WelcomeServer {
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end('{"status":"ok"}');
      return;
    }
    if (request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(welcomeHtml);
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  return {
    server,
    async listen(port = REFRAME_PORT) {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server.once("error", onError);
        server.listen(port, REFRAME_HOST, () => {
          server.off("error", onError);
          resolve();
        });
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("HTTP server has no TCP address");
      return address.port;
    },
    async close() {
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
