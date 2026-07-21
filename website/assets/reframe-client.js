(() => {
const sanitizeFigmaLayerClass = function sanitizeFigmaLayerClass(name, index) {
    const base = String(name || "layer")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
        .slice(0, 48) || "layer";
    return index > 0 ? `${base}-${index + 1}` : base;
};
const cleanFigmaCssProperties = function cleanFigmaCssProperties(css) {
    return String(css || "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("/*") && !BOILERPLATE_PROPS.test(line))
        .join("\n")
        .trim();
};
const splitFigmaCssBlocks = function splitFigmaCssBlocks(text) {
    const source = String(text || "");
    const comments = [];
    const re = /\/\*\s*([^*]+?)\s*\*\//g;
    let match;
    while ((match = re.exec(source)) !== null) {
        comments.push({ name: match[1].trim(), start: match.index, end: match.index + match[0].length });
    }
    const blocks = [];
    for (let i = 0; i < comments.length; i += 1) {
        const comment = comments[i];
        if (IGNORED_LAYER_COMMENTS.test(comment.name))
            continue;
        let end = source.length;
        for (let j = i + 1; j < comments.length; j += 1) {
            if (!IGNORED_LAYER_COMMENTS.test(comments[j].name)) {
                end = comments[j].start;
                break;
            }
        }
        const css = cleanFigmaCssProperties(source.slice(comment.end, end));
        if (!css || !FIGMA_CSS_PROP.test(css))
            continue;
        blocks.push({ name: comment.name, css });
    }
    return blocks;
};
const isFigmaCssExport = function isFigmaCssExport(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed || /^<[a-z!?]/i.test(trimmed))
        return false;
    if (splitFigmaCssBlocks(trimmed).length >= 2)
        return true;
    // ponytail: noisy Auto layout comments can leave <2 parsed blocks — fall back on comment/property heuristics
    const comments = [...trimmed.matchAll(/\/\*\s*([^*]+?)\s*\*\//g)];
    const layerComments = comments.filter((match) => !IGNORED_LAYER_COMMENTS.test(match[1].trim()));
    const propLines = (trimmed.match(/^\s*[\w-]+\s*:/gm) || []).length;
    const hasFigmaNoise = comments.some((match) => IGNORED_LAYER_COMMENTS.test(match[1].trim()));
    return layerComments.length >= 2 && propLines >= 4 && (hasFigmaNoise || /\bposition\s*:/i.test(trimmed));
};
const parseFigmaCssExport = function parseFigmaCssExport(text) {
    const blocks = splitFigmaCssBlocks(text);
    if (!blocks.length) {
        return { html: "", css: "", layerCount: 0 };
    }
    const classNames = usedClassNames(blocks);
    const rules = [];
    const layers = [];
    let rootWidth = "";
    let rootHeight = "";
    blocks.forEach((block, index) => {
        const className = `figma-layer--${classNames[index]}`;
        const safeName = block.name.replace(/"/g, "'");
        rules.push(`.${className} {\n${block.css}\n}`);
        layers.push(`<div class="figma-layer ${className}" data-figma-layer="${safeName}"></div>`);
        if (!index) {
            const width = block.css.match(/(?:^|\n)\s*width:\s*([^;]+)/i)?.[1]?.trim();
            const height = block.css.match(/(?:^|\n)\s*height:\s*([^;]+)/i)?.[1]?.trim();
            if (width)
                rootWidth = width;
            if (height)
                rootHeight = height;
        }
    });
    const rootStyle = [
        "position:relative",
        "box-sizing:border-box",
        rootWidth ? `width:${rootWidth}` : "width:100%",
        rootHeight ? `min-height:${rootHeight}` : "",
        "max-width:100%",
        "overflow:hidden",
    ].filter(Boolean).join(";");
    const html = `<div class="reframe-figma-import" style="${rootStyle}">${layers.join("")}</div>`;
    const css = [
        ".reframe-figma-import { position: relative; max-width: 100%; }",
        ".reframe-figma-import .figma-layer { box-sizing: border-box; }",
        ...rules,
    ].join("\n");
    return { html, css, layerCount: blocks.length };
};
  const PROTOCOL = 1;
  const PROTOCOL_NAME = "reframe.v1";
  const script = document.currentScript;
  let session = script?.dataset.reframeSession;
  const proxyOriginInput = script?.dataset.reframeProxyOrigin;
  let projectId = script?.dataset.reframeProjectId;
  let token = script?.dataset.reframeToken;
  let wsPath = script?.dataset.reframeWsPath;
  const standalone = script?.dataset.reframeStandalone === "true";
  const showcaseMode = script?.dataset.reframeShowcase === "true";
  const proxyOrigin = proxyOriginInput || location.origin;
  if (!standalone && !showcaseMode) {
    if (!session || !projectId || !token || !wsPath || proxyOrigin !== location.origin || new URL(script.src).origin !== location.origin) return;
  } else {
    session = session || "website-showcase";
    projectId = projectId || "website-showcase";
    token = token || "standalone";
    wsPath = wsPath || "/.reframe/demo/ws";
  }
  const reframeBasePath = standalone || showcaseMode ? "/.reframe/demo" : new URL(script.src).pathname.replace(/\/client\.js$/, "");
  script.removeAttribute("data-reframe-token");

  const number = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
  const heartbeatMs = number(script.dataset.reframeHeartbeatMs, 1000);
  const heartbeatTimeoutMs = number(script.dataset.reframeHeartbeatTimeoutMs, 2500);
  const reconnectBaseMs = number(script.dataset.reframeReconnectBaseMs, 100);
  const reconnectMaxMs = number(script.dataset.reframeReconnectMaxMs, 2000);
  const socketUrl = new URL(wsPath, proxyOrigin);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
  const protocols = [PROTOCOL_NAME, "reframe.token." + token, "reframe.session." + session, "reframe.project." + projectId];

  const key = Symbol.for("reframe.browser-client");
  const existing = window[key];
  if (existing?.session === session && existing.host?.isConnected && existing.state === "connected" && existing.socket?.readyState === WebSocket.OPEN) {
    existing.requestHistory?.();
    return;
  }
  existing?.teardown?.();

  const debugLog = (location, message, data, hypothesisId) => { fetch("http://127.0.0.1:7806/ingest/66c96c05-4cb0-408b-81c6-eab24553ad12", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "591489" }, body: JSON.stringify({ sessionId: "591489", location, message, data, hypothesisId, timestamp: Date.now() }) }).catch(() => {}); };
  const debugMode = script?.dataset.reframeDebug === "true" || new URL(location.href).searchParams.has("reframeDebug");
  const refreshStylesheets = () => { for (const link of document.querySelectorAll('link[rel~="stylesheet"]')) { const fresh = new URL(link.href, location.href); fresh.searchParams.set("reframe", String(Date.now())); link.href = fresh.href; } };
  const savedPageOffset = { html: "", body: "" };
  const applyPageOffset = () => {};
  const restorePageOffset = () => {
    document.documentElement.style.paddingTop = savedPageOffset.html;
    if (document.body) document.body.style.paddingTop = savedPageOffset.body;
  };

  const host = document.createElement("div");
  host.id = "reframe-root";
  host.dataset.reframeRoot = "";
  host.dataset.reframeSession = session;
  host.dataset.reframeState = "connecting";
  host.style.pointerEvents = "none";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.width = "100%";
  host.style.height = "100%";
  host.style.zIndex = "2147483000";
  if (showcaseMode) host.style.pointerEvents = "none";
  const showcasePanelCss = showcaseMode ? '.layers-panel,.design-panel,.ai-panel.figma-sidebar,.history-dialog{transition:transform .48s ease,opacity .48s ease}.layers-panel.showcase-panel-closing{transform:translateX(-18px);opacity:0}.design-panel.showcase-panel-closing,.ai-panel.figma-sidebar.showcase-panel-closing{transform:translateX(18px);opacity:0}.history-dialog.showcase-panel-closing{transform:translateY(18px);opacity:0}.annotation-dialog{width:min(300px,calc(100vw - 24px))}.ai-attachments[hidden],.annotation-form[hidden]{display:none!important}' : '';

  const root = host.attachShadow({ mode: "open" });
  const css = ':host{all:initial!important;position:fixed!important;inset:0!important;display:block!important;pointer-events:none!important;z-index:2147483000!important}*{box-sizing:border-box}.chip,.pill{pointer-events:auto;background:#1c1c1e;border-radius:999px;box-shadow:0 8px 32px rgb(0 0 0/.38),0 0 0 1px rgb(255 255 255/.08);color:#f5f5f7}.panel{pointer-events:none;background:#1c1c1e;border-radius:14px;box-shadow:0 8px 32px rgb(0 0 0/.38),0 0 0 1px rgb(255 255 255/.08);color:#f5f5f7}.panel .button,.panel .panel-input{pointer-events:auto}.chrome{position:fixed;top:12px;left:12px;right:12px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;pointer-events:none;z-index:2147483004;min-height:44px}.status-chip{align-items:center;display:inline-flex;flex-wrap:nowrap;gap:4px;height:38px;max-width:calc(100vw - 24px);overflow-x:auto;overflow-y:hidden;padding:4px 8px 4px 10px;pointer-events:auto;position:relative;z-index:1;scrollbar-width:none;-webkit-overflow-scrolling:touch}.status-chip::-webkit-scrollbar{display:none}.status-chip .button{flex-shrink:0}.status-chip .toolbar-divider{align-self:center;background:rgb(255 255 255/.12);flex-shrink:0;height:22px;margin:0 2px;width:1px}.status-chip[data-reframe-collapsed="true"] .toolbar-divider{display:none}.brand-mini{align-items:center;background:linear-gradient(135deg,#7c3aed,#5b45d6);border-radius:8px;color:#fff;display:inline-flex;font:800 11px/1 system-ui;height:22px;justify-content:center;width:22px}.toast{background:#1c1c1ee6;border-radius:10px;color:#e5e7eb;font:500 12px/1.35 system-ui;max-width:min(420px,50vw);padding:8px 12px;pointer-events:none}.context-pill{align-items:center;display:inline-flex;gap:2px;height:42px;padding:4px;position:fixed;z-index:2147483003}.pill-divider{background:rgb(255 255 255/.12);height:18px;margin:0 2px;width:1px}.dot{background:#f59e0b;border-radius:50%;height:8px;margin:0 2px;width:8px}:host([data-reframe-state="connected"]) .dot{background:#22c55e}:host([data-reframe-state="disconnected"]) .dot,:host([data-reframe-state="failed"]) .dot{background:#ef4444}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.button{all:unset;align-items:center;border-radius:999px;color:#f5f5f7;cursor:pointer;display:inline-flex;font:600 12px/1 system-ui;justify-content:center;white-space:nowrap}.button.icon{flex:0 0 32px;height:32px;line-height:0;min-width:32px;overflow:hidden;padding:0;position:relative;width:32px}.button.icon svg{display:block;flex-shrink:0;height:18px;pointer-events:none;width:18px}.button.icon svg *{vector-effect:non-scaling-stroke}.button:hover,.button[aria-pressed="true"]{background:rgb(255 255 255/.12)}.button:focus-visible,.handle:focus-visible,.annotation-pin:focus-visible{outline:2px solid #a78bfa;outline-offset:2px}.button[aria-disabled="true"],.button:disabled{cursor:not-allowed;opacity:.45}.badge{align-items:center;background:#7c3aed;border-radius:999px;color:#fff;display:inline-flex;font:700 9px/1 system-ui;height:14px;justify-content:center;min-width:14px;padding:0 3px;position:absolute;right:0;top:0}.outline{border:none;display:block;overflow:visible;pointer-events:none;position:fixed}.outline-border{position:absolute;inset:0;border:2px solid #8b5cf6;border-radius:4px;box-shadow:0 0 0 1px rgb(139 92 246/.25);pointer-events:none}.outline.hover{z-index:2147483001}.outline.selected{z-index:2147483005}.outline.hover .outline-border{border-style:dashed}.outline[hidden],.panel[hidden],.ai-panel[hidden],.context-pill[hidden],.more-menu[hidden],.time-overlay[hidden],.history-dialog[hidden],.annotation-dialog[hidden],.reference-dialog[hidden]{display:none}.tag{background:#7c3aed;border-radius:6px;color:#fff;font:600 11px/1.2 system-ui;padding:3px 6px;position:absolute;left:-2px;top:-24px;white-space:nowrap;z-index:1}.tag.tag-below{top:auto;bottom:-24px}.handle{all:unset;background:#8b5cf6;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgb(0 0 0/.25);cursor:ew-resize;height:12px;pointer-events:auto;position:absolute;right:-8px;top:calc(50% - 8px);width:12px}.handle-bottom{bottom:-8px;left:calc(50% - 8px);right:auto;top:auto;cursor:ns-resize}.handle-move{left:calc(50% - 8px);right:auto;top:-8px;cursor:move}.edit-toolbar{flex-wrap:wrap;gap:4px;padding:6px 8px}.edit-toolbar-section{align-items:center;display:inline-flex;flex-wrap:nowrap;gap:4px;pointer-events:auto}.panel-divider{align-self:stretch;background:rgb(255 255 255/.12);flex-shrink:0;margin:4px 2px;width:1px}.layout-panel{gap:4px;padding:0}.layout-panel .layout-field{align-items:center;display:inline-flex;font:500 11px/1 system-ui;gap:4px}.layout-panel .layout-input{width:52px}.layout-radius-field{display:none}.panel{align-items:center;border-radius:14px;display:flex;flex-wrap:nowrap;font:500 12px/1.2 system-ui;gap:6px;max-width:calc(100vw - 24px);padding:6px 8px;position:fixed;z-index:2147483002}.panel-metrics{color:#a1a1aa;display:inline-flex;font:500 10px/1 ui-monospace,monospace;gap:6px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.panel-input{background:rgb(255 255 255/.06);border:1px solid rgb(255 255 255/.12);border-radius:8px;color:#fff;flex:1;font:12px/1.35 system-ui;min-width:80px;padding:5px 8px}.panel-hint,.mapping,.temporary{display:none}.panel.in-design-panel .panel-hint,.panel.in-design-panel .mapping,.panel.in-design-panel .temporary{display:revert}.ai-chat-label{color:#a1a1aa;display:grid;font:11px/1.3 system-ui;gap:4px}.ai-chat-picker{position:relative;width:100%}.ai-chat-trigger{align-items:center;background:rgb(255 255 255/.06);border:1px solid rgb(255 255 255/.12);border-radius:8px;color:#fff;cursor:pointer;display:flex;font:12px/1.35 system-ui;gap:8px;justify-content:space-between;min-width:0;padding:6px 8px;text-align:left;width:100%}.ai-chat-trigger:hover,.ai-chat-trigger[aria-expanded="true"]{background:rgb(255 255 255/.1);border-color:rgb(255 255 255/.18)}.ai-chat-trigger-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ai-chat-chevron{color:#a1a1aa;flex-shrink:0;font-size:10px;line-height:1;transition:transform .15s}.ai-chat-trigger[aria-expanded="true"] .ai-chat-chevron{transform:rotate(180deg)}.ai-chat-menu{background:#2a2a2e;border:1px solid rgb(255 255 255/.12);border-radius:10px;box-shadow:0 12px 32px rgb(0 0 0/.45);left:0;list-style:none;margin:4px 0 0;max-height:240px;overflow:auto;padding:4px;position:absolute;right:0;z-index:2}.ai-chat-menu[hidden]{display:none}.ai-chat-option{align-items:center;border-radius:8px;color:#f5f5f7;cursor:pointer;display:flex;font:12px/1.35 system-ui;gap:8px;padding:8px 10px;text-align:left;width:100%}.ai-chat-option:hover,.ai-chat-option[aria-selected="true"]{background:rgb(124 58 237/.2)}.ai-chat-option[aria-selected="true"]{color:#ddd6fe}.ai-panel.figma-sidebar{align-items:stretch;background:#1e1e1e;border:1px solid rgb(255 255 255/.08);border-radius:12px;box-shadow:0 8px 32px rgb(0 0 0/.38);color:#f5f5f7;display:flex;flex-direction:column;gap:0;height:min(720px,calc(100vh - 80px));max-height:calc(100vh - 80px);overflow:hidden;padding:0;pointer-events:auto;position:fixed;right:12px;top:68px;width:min(400px,calc(100vw - 88px));z-index:2147483004}.ai-panel-head{border-bottom:1px solid rgb(255 255 255/.08);flex-shrink:0}.ai-panel-scroll{display:grid;flex:1 1 auto;gap:10px;min-height:0;overflow:auto;padding:10px;scrollbar-color:rgb(255 255 255/.15) transparent;scrollbar-width:thin}.ai-panel-scroll::-webkit-scrollbar{width:6px}.ai-panel-scroll::-webkit-scrollbar-thumb{background:rgb(255 255 255/.15);border-radius:3px}.ai-panel-footer{border-top:1px solid rgb(255 255 255/.08);flex-shrink:0;padding:10px}.ai-panel .ai-generate-btn{background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:12px;font:700 13px/1 system-ui;justify-content:center;margin:0;padding:11px 16px;width:100%}.ai-panel .ai-generate-btn:hover{background:linear-gradient(135deg,#8b5cf6,#7c3aed)}.ai-attachments{display:flex;flex-wrap:wrap;gap:6px}.ai-attachment-chip{align-items:center;background:rgb(255 255 255/.05);border:1px solid rgb(255 255 255/.1);border-radius:10px;display:inline-flex;gap:8px;max-width:100%;padding:6px 8px}.ai-attachment-chip img{border-radius:6px;height:40px;object-fit:cover;width:40px}.ai-attachment-name{color:#d4d4d8;flex:1;font:500 11px/1.3 ui-monospace,monospace;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ai-attachment-clear{background:rgb(239 68 68/.18);border-radius:999px;color:#fca5a5;font:600 11px/1 system-ui;padding:4px 8px}.ai-reference-section{background:rgb(255 255 255/.02);border:1px solid rgb(255 255 255/.08);border-radius:12px;padding:0 10px}.ai-reference-section>summary{color:#a1a1aa;cursor:pointer;font:600 11px/1 system-ui;letter-spacing:.04em;list-style:none;padding:10px 0;text-transform:uppercase}.ai-reference-section>summary::-webkit-details-marker{display:none}.ai-reference-body{display:grid;gap:10px;padding:0 0 12px}.ai-panel .reference-section{background:rgb(255 255 255/.03);border:1px solid rgb(255 255 255/.08);border-radius:12px;display:grid;gap:10px;padding:12px}.ai-panel .reference-actions{display:grid;gap:8px}.ai-panel .reference-primary,.ai-panel .reference-secondary{width:100%}.ai-panel .reference-plan{max-height:160px}.ai-chat-label,.ai-session-id-label{color:#a1a1aa;display:grid;font:11px/1.3 system-ui;gap:4px;width:100%}.ai-session-id-input{background:rgb(255 255 255/.06);border:1px solid rgb(255 255 255/.12);border-radius:8px;color:#fff;font:12px/1.35 system-ui;min-width:0;padding:6px 8px;width:100%}.ai-status{color:#c4b5fd;font:11px/1.35 system-ui;word-break:break-word}.ai-status[data-reframe-ai-warning="true"]{color:#fbbf24}.ai-prompt,.annotation-input,.reference-input{background:rgb(255 255 255/.06);border:1px solid rgb(255 255 255/.12);border-radius:10px;color:#fff;font:12px/1.35 system-ui;padding:8px}.ai-prompt{min-height:52px;resize:vertical;width:100%}.ai-actions{display:flex;flex-wrap:wrap;gap:4px}.ai-generate-btn{align-self:flex-end;border-radius:10px;margin-top:4px;padding:6px 12px}.mapping{color:#c4b5fd;font:600 11px/1.2 system-ui;min-width:52px}.temporary{color:#fbbf24;font:600 11px/1.2 system-ui}.more-menu{background:#1c1c1e;border-radius:12px;box-shadow:0 12px 40px rgb(0 0 0/.45);display:grid;gap:2px;min-width:160px;padding:6px;pointer-events:auto;position:fixed;z-index:2147483006}.more-item{all:unset;border-radius:8px;color:#f5f5f7;cursor:pointer;font:500 12px/1.35 system-ui;padding:8px 10px;text-align:left}.more-item:hover{background:rgb(255 255 255/.1)}.time-overlay{align-items:center;background:#111827;display:flex;inset:0;justify-content:center;pointer-events:none;position:fixed}.time-overlay img{height:100%;object-fit:contain;width:100%}.source-compare{inset:0;pointer-events:auto;position:fixed;z-index:2147482997}.source-compare[hidden]{display:none}.source-compare iframe{border:0;clip-path:inset(0 calc(100% - var(--compare-pos,50%)) 0 0);height:100%;inset:0;position:fixed;width:100%;z-index:2147482998}.source-compare-handle{background:#a78bfa;bottom:0;box-shadow:0 0 0 1px rgb(255 255 255/.35);cursor:ew-resize;left:var(--compare-pos,50%);pointer-events:auto;position:fixed;top:0;transform:translateX(-50%);width:4px;z-index:2147483000}.source-compare-label{background:#111827dd;border-radius:8px;color:#fff;font:700 12px/1.3 system-ui;left:12px;padding:8px 10px;pointer-events:none;position:absolute;top:12px;z-index:2147483001}.time-label{background:#111827dd;border-radius:8px;color:#fff;font:700 13px/1.3 system-ui;left:12px;padding:8px 10px;position:absolute;top:12px}.history-dialog,.annotation-dialog,.reference-dialog{background:#1e1e1e;border:1px solid rgb(255 255 255/.08);border-radius:10px;box-shadow:0 12px 40px rgb(0 0 0/.5);color:#ccc;display:flex;flex-direction:column;font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif;max-height:calc(100vh - 48px);min-height:0;overflow:hidden;padding:0;pointer-events:auto;position:fixed;right:12px;top:58px;width:min(520px,calc(100vw - 24px));z-index:2147483004}.history-head{align-items:center;border-bottom:1px solid rgb(255 255 255/.06);display:flex;justify-content:space-between;padding:10px 12px}.annotation-head,.reference-head{align-items:center;display:flex;justify-content:space-between}.annotation-dialog{padding:12px 12px 10px}.history-head h2,.annotation-head h2,.reference-head h2{color:#e0e0e0;font-size:13px;font-weight:600;margin:0}.annotation-list{display:flex;flex-direction:column;gap:8px;margin-top:10px;overflow:auto}.annotation-item{background:rgb(255 255 255/.05);border:1px solid rgb(255 255 255/.08);border-radius:10px;padding:9px}.annotation-item p{margin:3px 0}.history-toolbar{align-items:center;border-bottom:1px solid rgb(255 255 255/.06);display:flex;flex-wrap:wrap;gap:8px 12px;justify-content:space-between;margin:0;padding:8px 12px}.history-meta-row{align-items:center;display:flex;flex:1 1 auto;flex-wrap:wrap;gap:4px 8px;min-width:0}.history-meta-sep{color:#52525b}.history-actions{align-items:center;display:inline-flex;flex-shrink:0;gap:4px}.history-tool-btn{border-radius:8px;height:28px;min-width:28px;width:28px}.history-tool-btn svg{height:14px;width:14px}.history-restore-toolbar{background:rgb(124 58 237/.16);border-radius:8px;color:#ddd6fe;font:600 11px/1 system-ui;padding:6px 10px}.history-restore-toolbar:hover:not(:disabled){background:rgb(124 58 237/.28)}.history-restore-toolbar:disabled{opacity:.45}.history-graph-panel{background:#1e1e1e;display:flex;flex:1 1 auto;flex-direction:column;min-height:0}.history-graph-header{align-items:center;background:#1e1e1e;border-bottom:1px solid rgb(255 255 255/.06);color:#858585;display:flex;font-size:11px;font-weight:500;gap:6px;letter-spacing:.02em;padding:8px 12px;position:sticky;top:0;z-index:2}.history-graph-label{color:#a1a1aa}.history-graph-count{background:rgb(255 255 255/.06);border-radius:999px;color:#d4d4d8;font:600 10px/1 system-ui;margin-left:auto;padding:2px 7px}.history-list.history-graph{display:flex;flex:1 1 auto;flex-direction:column;gap:0;max-height:min(480px,56vh);min-height:8rem;overflow:auto;position:relative;scrollbar-color:rgb(255 255 255/.12) transparent;scrollbar-width:thin}.history-list.history-graph::-webkit-scrollbar{width:6px}.history-list.history-graph::-webkit-scrollbar-thumb{background:rgb(255 255 255/.12);border-radius:3px}.history-row.history-item{align-items:center;background:transparent;border-bottom:1px solid rgb(255 255 255/.04);border-radius:0;cursor:pointer;display:grid;gap:0;grid-template-columns:32px minmax(0,1fr) auto;margin:0;min-height:46px;padding:0;position:relative;z-index:1}.history-row:hover{background:rgb(255 255 255/.04)!important}.history-row[aria-selected="true"]{background:rgb(78 158 255/.1)!important}.history-row.is-current{background:rgb(124 58 237/.08)!important}.history-row.is-current[aria-selected="true"]{background:rgb(124 58 237/.14)!important}.history-row[aria-disabled="true"]{opacity:.5}.history-row.is-current .history-summary{color:#f4f4f5;font-weight:500}.history-row.is-current .history-hash{color:#c4b5fd}.history-graph-col{align-self:stretch;flex-shrink:0;min-height:46px;position:relative;width:32px}.history-graph-svg{left:0;pointer-events:none;position:absolute;top:0;width:32px;z-index:1}.history-graph-line{fill:none;opacity:.9;stroke-linecap:round;stroke-width:2.5}.history-graph-dot{stroke:#1e1e1e;stroke-width:2}.history-graph-dot.is-head{stroke:#1e1e1e;stroke-width:2.5}.history-graph-dot-ring{fill:#1e1e1e;stroke-width:2}.history-body{display:grid;gap:2px;min-width:0;overflow:hidden;padding:7px 8px 7px 0}.history-message{align-items:center;color:#d4d4d4;display:flex;font-size:12px;gap:6px;line-height:1.3;min-width:0;overflow:hidden}.history-sep{color:#52525b;flex-shrink:0;font-size:11px}.history-summary{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-hash{color:#858585;flex-shrink:0;font:500 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:-.02em}.history-branch-pill{align-items:center;background:var(--pill-bg,rgb(78 158 255/.16));border-radius:999px;color:var(--pill-fg,#79b8ff);display:inline-flex;flex-shrink:0;font:600 9px/1 system-ui;gap:3px;padding:2px 6px}.history-branch-pill.head{background:rgb(177 128 215/.2);color:#d8b4fe}.history-branch-pill.safety{background:rgb(232 145 45/.16);color:#f0b070}.history-branch-pill.invalid{background:rgb(239 68 68/.14);color:#fca5a5}.history-branch-pill svg{display:block;height:9px;opacity:.9;width:9px}.history-detail{color:#71717a;font-size:10px;line-height:1.35;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-detail-muted{color:#6e6e6e;font-size:10px;word-break:break-word}.history-current-badge{background:rgb(45 184 166/.18);border-radius:999px;color:#5eead4;flex-shrink:0;font:700 8px/1 system-ui;letter-spacing:.04em;padding:2px 6px;text-transform:uppercase}.history-row-actions{align-items:center;align-self:stretch;display:flex;flex-shrink:0;justify-content:flex-end;margin:0;padding:0 8px 0 4px}.history-restore-btn{background:transparent;border-radius:6px;color:#a1a1aa;flex-shrink:0;font:500 11px/1 system-ui;padding:4px 8px}.history-restore-btn:hover{background:rgb(255 255 255/.08);color:#e4e4e7}.history-row:hover .history-restore-btn{color:#ddd6fe}.history-meta,.annotation-meta{color:#a1a1aa;font-size:11px;margin:0}.annotation-form,.reference-form{display:grid;gap:12px;margin-top:12px;overflow:auto}.annotation-form label{display:grid;gap:3px}.reference-dialog{width:min(560px,calc(100vw - 24px));padding:18px}.reference-section{background:rgb(255 255 255/.03);border:1px solid rgb(255 255 255/.08);border-radius:12px;display:grid;gap:10px;padding:12px}.reference-section-title{color:#e4e4e7;font:700 11px/1 system-ui;letter-spacing:.06em;margin:0;text-transform:uppercase}.reference-field{color:#d4d4d8;display:grid;font:500 12px/1.35 system-ui;gap:5px}.reference-field.reference-check{align-items:center}.reference-fieldset{border:0;margin:0;padding:0}.reference-choices{display:grid;grid-template-columns:1fr 1fr;gap:8px}.reference-choices label{align-items:center;background:rgb(255 255 255/.04);border:1px solid rgb(255 255 255/.08);border-radius:10px;color:#f5f5f7;display:flex;font:500 12px/1.35 system-ui;gap:8px;margin:0;padding:8px 10px}.reference-dropzone{align-items:center;background:rgb(255 255 255/.04);border:1.5px dashed rgb(255 255 255/.18);border-radius:12px;cursor:pointer;display:grid;gap:8px;justify-items:center;min-height:132px;outline:none;padding:16px;text-align:center;transition:border-color .15s,background .15s}.reference-dropzone:focus-visible,.reference-dropzone.is-dragover{border-color:#a78bfa;background:rgb(124 58 237/.1)}.reference-file-input{display:none}.reference-dropzone-text{color:#a1a1aa;font:500 13px/1.4 system-ui;margin:0;max-width:280px}.reference-dropzone-icon{font-size:24px;line-height:1}.reference-choose-file{background:rgb(255 255 255/.08);border-radius:999px;padding:7px 14px}.reference-preview{display:grid;gap:8px;justify-items:center;width:100%}.reference-preview-img{border-radius:10px;box-shadow:0 4px 16px rgb(0 0 0/.35);max-height:160px;max-width:100%;object-fit:contain}.reference-preview-meta{align-items:center;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;width:100%}.reference-preview-name{color:#d4d4d8;font:500 11px/1.3 ui-monospace,monospace;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.reference-clear-file{background:rgb(239 68 68/.18);border-radius:999px;color:#fca5a5;padding:6px 12px}.reference-advanced{background:rgb(255 255 255/.02);border:1px solid rgb(255 255 255/.06);border-radius:10px;padding:0 10px}.reference-advanced-toggle{color:#a1a1aa;cursor:pointer;font:600 11px/1 system-ui;letter-spacing:.04em;list-style:none;padding:10px 0;text-transform:uppercase}.reference-advanced-toggle::-webkit-details-marker{display:none}.reference-advanced-body{display:grid;gap:10px;padding:0 0 12px}.reference-actions{display:grid;gap:8px}.reference-primary{background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:12px;font:700 13px/1 system-ui;justify-content:center;padding:11px 16px;text-align:center;width:100%}.reference-primary:hover{background:linear-gradient(135deg,#8b5cf6,#7c3aed)}.reference-secondary{background:rgb(255 255 255/.06);border:1px solid rgb(255 255 255/.1);border-radius:12px;justify-content:center;padding:10px 16px;text-align:center;width:100%}.reference-secondary:disabled{background:rgb(255 255 255/.03);border-color:rgb(255 255 255/.06);color:#71717a;opacity:1}.reference-plan{background:rgb(255 255 255/.05);border:1px solid rgb(255 255 255/.08);border-radius:10px;font:11px/1.35 ui-monospace,monospace;margin:0;max-height:200px;overflow:auto;padding:10px;white-space:pre-wrap}.reference-status{color:#c4b5fd;font-size:12px;line-height:1.4}.annotation-layer{inset:0;pointer-events:none;position:fixed}.annotation-image-wrap{pointer-events:auto;position:fixed;touch-action:none;z-index:2147483000}.annotation-image-wrap img{display:block;height:100%;max-width:none;pointer-events:none;width:100%}.annotation-image-wrap.selected{outline:2px solid #a78bfa;outline-offset:2px}.annotation-image-handle{all:unset;background:#a78bfa;border:2px solid #fff;border-radius:50%;cursor:nwse-resize;height:10px;pointer-events:auto;position:absolute;width:10px}.annotation-image-handle.se{bottom:-5px;right:-5px}.annotation-image-delete{all:unset;background:#ef4444;border-radius:6px;color:#fff;cursor:pointer;font:700 10px/1 system-ui;padding:4px 6px;pointer-events:auto;position:absolute;right:-4px;top:-22px}.comment-tools{align-items:center;display:inline-flex;gap:2px;pointer-events:auto}.annotation-image-handle.nw{top:-5px;left:-5px;cursor:nwse-resize}.annotation-image-handle.ne{top:-5px;right:-5px;cursor:nesw-resize}.annotation-image-handle.sw{bottom:-5px;left:-5px;cursor:nesw-resize}.annotation-image-handle.n{top:-5px;left:calc(50% - 5px);cursor:ns-resize}.annotation-image-handle.s{bottom:-5px;left:calc(50% - 5px);cursor:ns-resize}.annotation-image-handle.w{left:-5px;top:calc(50% - 5px);cursor:ew-resize}.annotation-image-handle.e{right:-5px;top:calc(50% - 5px);cursor:ew-resize}.annotation-layer[data-reframe-annotations-hidden="true"]{display:none}.annotation-pin{all:unset;background:#7c3aed;border:2px solid white;border-radius:50%;color:#fff;cursor:pointer;font:700 11px/20px system-ui;height:20px;pointer-events:auto;position:fixed;text-align:center;width:20px}.annotation-element-outline{border:2px dashed #c4b5fd;background:#7c3aed12;border-radius:4px;pointer-events:none;position:fixed}.annotation-highlight{border:2px solid #a78bfa;background:#7c3aed18;pointer-events:none;position:fixed}.annotation-item-header{align-items:center;display:flex;gap:8px;justify-content:space-between;margin-bottom:4px}.annotation-item-title{font-size:13px;font-weight:600;margin:0}.annotation-status{border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.03em;padding:2px 7px;text-transform:uppercase}.annotation-status.open{background:#7c3aed33;color:#ddd6fe}.annotation-status.resolved{background:#22c55e33;color:#86efac}.annotation-item-comment{color:#f5f5f7;font-size:13px;line-height:1.45;margin:6px 0}.annotation-item-highlight{align-items:center;color:#c4b5fd;display:inline-flex;font-size:10px;font-weight:600;gap:4px;letter-spacing:.02em;margin-top:2px;text-transform:uppercase}.annotation-item-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.annotation-dialog-summary{color:#a1a1aa;font-size:11px;margin:4px 0 0}.annotation-card{background:rgb(255 255 255/.04);border:1px solid rgb(255 255 255/.1);border-radius:14px;display:grid;gap:10px;padding:12px}.annotation-card-head{align-items:flex-start;display:flex;gap:10px;justify-content:space-between}.annotation-chip{align-items:center;background:rgb(124 58 237/.2);border-radius:999px;color:#ddd6fe;display:inline-flex;font:600 10px/1 system-ui;gap:4px;max-width:160px;overflow:hidden;padding:4px 8px;text-overflow:ellipsis;white-space:nowrap}.annotation-time{color:#71717a;font-size:11px}.format-panel{gap:4px;padding:0}.format-panel .button,.format-panel .format-input,.format-panel .format-select{pointer-events:auto}.format-input{width:52px}.format-select{max-width:108px}.format-advanced{display:none!important}.format-color{height:28px;padding:2px;width:36px}.heatmap-layer{inset:0;pointer-events:none;position:fixed;z-index:2147482999}.heatmap-cell{opacity:.55;position:fixed}.annoint-layer{inset:0;pointer-events:none;position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483001}.annoint-svg{display:block;height:100%;pointer-events:none;position:fixed;top:0;left:0;width:100vw;height:100vh}.annoint-tools{align-items:center;display:inline-flex;gap:2px;pointer-events:auto}.chrome-hit-zone{position:fixed;top:12px;left:12px;width:44px;height:44px;pointer-events:none;z-index:0}.chrome[data-reframe-chrome-visible="false"] .chrome-hit-zone{pointer-events:auto;z-index:2147483005}.chrome[data-reframe-chrome-visible="true"] .chrome-hit-zone{pointer-events:none;z-index:0}.chrome .status-chip .button,.chrome .status-chip .toolbar-divider{pointer-events:auto}.chrome-hit-zone::after{content:"";position:absolute;top:50%;left:50%;width:8px;height:8px;border-radius:50%;background:rgb(124 58 237/.55);box-shadow:0 0 10px rgb(124 58 237/.35);opacity:0;transform:translate(-50%,-50%);pointer-events:none}.chrome .status-chip,.chrome .toast{opacity:0;transform:translateY(-8px);pointer-events:none;visibility:hidden;transition:opacity .2s ease,transform .2s ease,visibility .2s}.chrome[data-reframe-chrome-visible="true"] .status-chip,.chrome[data-reframe-chrome-visible="true"] .toast{opacity:1;transform:translateY(0);visibility:visible}.chrome[data-reframe-chrome-visible="true"] .status-chip{pointer-events:auto;z-index:2}.chrome[data-reframe-minimal-ui="true"] .brand-mini,.chrome[data-reframe-minimal-ui="true"] .toast,.chrome[data-reframe-minimal-ui="true"] .dot{display:none!important}.status-chip[data-reframe-collapsed="true"]{min-width:44px;min-height:44px;justify-content:center;padding:6px;pointer-events:auto}.status-chip[data-reframe-collapsed="true"] .button[data-reframe-collapse]{width:44px;height:44px}.status-chip[data-reframe-collapsed="true"] .button:not([data-reframe-collapse]),.status-chip[data-reframe-collapsed="true"] .dot,.status-chip[data-reframe-collapsed="true"] .brand-mini{display:none}.context-pill .button{flex-shrink:0}.context-pill.compact{height:38px;padding:3px}.panel-input[data-reframe-text]{display:none!important}.panel.in-design-panel .panel-input[data-reframe-text],.design-panel .panel-input[data-reframe-text]{display:block!important;width:100%}.panel-input.reframe-text-off{display:none!important}.design-section{border:none;border-bottom:1px solid rgb(255 255 255/.06);border-radius:0;margin-bottom:0;overflow:visible}.design-section>summary{align-items:center;background:transparent;border-radius:6px;color:#e4e4e7;cursor:pointer;display:flex;font:500 12px/1.3 system-ui;gap:4px;justify-content:space-between;letter-spacing:0;list-style:none;margin:0 4px;min-height:28px;padding:4px 8px;position:sticky;top:0;z-index:2}.design-section>summary:hover{background:rgb(255 255 255/.06)}.design-section-title{color:inherit;flex:1;font:inherit}.design-section>summary .layers-toggle{cursor:default;pointer-events:none}.design-section[open]>summary{color:#f5f5f7}.design-section>summary::-webkit-details-marker{display:none}.design-section-hint{color:#71717a;font:400 11px/1.4 system-ui;margin:0 0 4px}.design-section-body{display:grid;gap:8px;min-width:0;overflow-x:hidden;padding:0 8px 8px}.design-field{align-items:stretch;color:#d4d4d8;display:grid;font:500 11px/1.35 system-ui;gap:4px;grid-template-columns:1fr;min-width:0;width:100%}.design-field-label{color:#a1a1aa;font:500 11px/1.3 system-ui}.design-field input,.design-field .design-picker,.design-field .design-unit{width:100%}.design-subsection{display:grid;gap:6px;min-width:0;width:100%}.design-subsection-label{color:#e4e4e7;font:500 12px/1.3 system-ui}.design-grid-2{display:grid;gap:8px;grid-template-columns:1fr 1fr;min-width:0;width:100%}.design-grid-2>*,.design-grid-4>*{min-width:0}.design-spacing-block{display:grid;gap:6px;min-width:0;width:100%}.design-spacing-head{align-items:center;display:flex;gap:8px;justify-content:space-between;width:100%}.design-spacing-title{color:#e4e4e7;flex:1;font:500 12px/1.3 system-ui;min-width:0}.design-spacing-actions{align-items:center;display:inline-flex;flex-shrink:0;gap:4px}.design-spacing-uniform{min-width:0;width:100%}.design-spacing-link{background:rgb(255 255 255/.06);border-radius:6px;color:#c4b5fd;flex-shrink:0;font:600 10px/1 system-ui;min-height:24px;min-width:24px;padding:4px 8px}.design-spacing-link[aria-pressed="true"]{background:rgb(124 58 237/.2)}.design-spacing-sides{display:grid;gap:8px;width:100%}.design-layout-grid{display:grid;gap:12px;width:100%}.design-panel .layout-panel{display:contents}.design-panel .layout-field{align-items:stretch;display:flex;flex-direction:column;gap:4px;width:100%}.design-grid-4{display:grid;gap:6px;grid-template-columns:1fr 1fr;min-width:0;width:100%}.design-flex-controls{display:grid;gap:6px;width:100%}.design-flex-controls[hidden]{display:none!important}.design-icon-group{align-items:center;display:inline-flex;gap:2px;width:100%}.design-icon-btn{align-items:center;border-radius:6px;color:#e4e4e7;display:inline-flex;flex:1;font:500 12px/1.3 system-ui;height:28px;justify-content:center;min-height:28px;min-width:0;padding:4px 8px}.design-icon-btn[aria-pressed="true"]{background:rgb(124 58 237/.25);color:#ddd6fe}.design-essential-text[hidden]{display:none!important}.design-panel-tab{background:#1c1c1e;border:1px solid rgb(255 255 255/.08);border-radius:10px 0 0 10px;border-right:0;box-shadow:0 8px 32px rgb(0 0 0/.38);color:#e4e4e7;font:600 11px/1 system-ui;letter-spacing:.04em;padding:10px 6px;pointer-events:auto;position:fixed;right:0;top:50%;transform:translateY(-50%);writing-mode:vertical-rl;z-index:2147483003}.design-panel-tab[hidden]{display:none}.design-panel .panel-input,.design-panel .ai-chat-trigger,.design-panel .design-unit-trigger{max-width:100%;min-height:28px;min-width:0;padding:6px 10px}.design-picker,.design-picker .ai-chat-trigger{width:100%}.design-unit-picker{flex-shrink:0;position:relative}.design-unit-trigger{align-items:center;background:rgb(255 255 255/.06);border:1px solid rgb(255 255 255/.12);border-radius:8px;color:#fff;cursor:pointer;display:inline-flex;font:600 10px/1 system-ui;justify-content:center;min-height:28px;min-width:32px;padding:4px 4px}.design-unit-trigger:hover,.design-unit-trigger[aria-expanded="true"]{background:rgb(255 255 255/.1);border-color:rgb(255 255 255/.18)}.design-unit-menu{left:auto;min-width:72px;right:0}.design-format-panel{display:flex;flex-wrap:wrap;gap:8px;width:100%}.design-panel-scroll{scrollbar-color:rgb(255 255 255/.15) transparent;scrollbar-width:thin}.design-panel-scroll::-webkit-scrollbar{width:6px}.design-panel-scroll::-webkit-scrollbar-thumb{background:rgb(255 255 255/.15);border-radius:3px}.design-unit{align-items:center;display:grid;gap:4px;grid-template-columns:1fr minmax(32px,40px);min-width:0;width:100%}.design-unit-input{min-width:0;width:100%}.design-unit-select{font:500 11px/1 system-ui;padding:4px}.design-panel .layout-radius-field,.design-panel .format-advanced{display:inline-flex!important}.design-panel .edit-toolbar{flex-direction:column;align-items:stretch;gap:6px;max-width:100%;padding:8px}.design-panel .panel{gap:6px;padding:8px}.design-layout-xywh{display:contents}.design-field{gap:4px}.design-section{margin-bottom:0}.design-panel .panel-actions-divider{display:none}.design-panel .panel-metrics{display:inline-flex}.figma-rail{align-items:center;background:#1c1c1e;border-radius:12px;box-shadow:0 8px 32px rgb(0 0 0/.38),0 0 0 1px rgb(255 255 255/.08);display:flex;flex-direction:column;gap:2px;left:12px;padding:6px;pointer-events:auto;position:fixed;top:68px;z-index:2147483004}.figma-rail .button.icon{border-radius:8px;height:36px;width:36px}.figma-rail .button.icon[aria-pressed="true"]{background:rgb(124 58 237/.35);box-shadow:inset 0 0 0 1px rgb(167 139 250/.5)}.figma-rail-divider{background:rgb(255 255 255/.12);height:1px;margin:4px 2px;width:28px}.figma-sidebar{background:#1c1c1e;border:1px solid rgb(255 255 255/.08);border-radius:12px;box-shadow:0 8px 32px rgb(0 0 0/.38);color:#f5f5f7;display:flex;flex-direction:column;font:500 12px/1.35 system-ui;height:calc(100vh - 80px);max-height:calc(100vh - 80px);min-height:0;overflow:hidden;pointer-events:auto;position:fixed;top:68px;z-index:2147483003}.figma-sidebar[hidden]{display:none}.figma-sidebar-head{align-items:center;border-bottom:1px solid rgb(255 255 255/.08);color:#a1a1aa;display:flex;font:600 10px/1 system-ui;justify-content:space-between;letter-spacing:.06em;padding:10px 12px;text-transform:uppercase}.figma-sidebar-body{flex:1 1 auto;min-height:0;overflow:auto;padding:8px}.layers-panel{background:#1e1e1e;border-color:rgb(255 255 255/.06);height:auto;left:64px;max-height:calc(100vh - 100px);min-width:300px;max-width:420px;overflow:hidden;position:relative;width:min(340px,calc(100vw - 88px))}.layers-head{align-items:center;gap:6px;min-height:32px;padding:6px 8px}.layers-head-actions{align-items:center;display:inline-flex;flex-shrink:0;gap:0;margin-left:auto}.layers-head-icon-btn{border-radius:6px;color:#a1a1aa;flex-shrink:0;height:24px!important;min-width:24px!important;opacity:.85;width:24px!important}.layers-head-icon-btn svg{height:14px;width:14px}.layers-head-icon-btn:hover{background:rgb(255 255 255/.08);color:#e4e4e7;opacity:1}.layers-resize-handle{bottom:0;cursor:ew-resize;position:absolute;right:0;top:0;width:6px;z-index:2}.layers-head .layers-title{color:#f5f5f7;font:600 12px/1 system-ui;letter-spacing:0;text-transform:none}.layers-collapse-btn{flex-shrink:0;height:24px!important;min-width:24px!important;opacity:.7;width:24px!important}.layers-collapse-btn:hover{opacity:1}.layers-collapse-btn svg{height:14px;width:14px}.layers-search-wrap{border-bottom:1px solid rgb(255 255 255/.06);padding:6px 8px}.layers-search{background:#2a2a2e;border:1px solid rgb(255 255 255/.08);border-radius:8px;color:#f5f5f7;font:500 12px/1.35 system-ui;padding:6px 10px;width:100%}.layers-search::placeholder{color:#71717a}.layers-search:focus{border-color:rgb(139 92 246/.45);box-shadow:0 0 0 2px rgb(139 92 246/.12);outline:none}.layers-scroll{flex:1 1 auto;min-height:0;overflow-x:hidden;overflow-y:auto;padding:2px 0 0;position:relative;scrollbar-color:rgb(255 255 255/.15) transparent;scrollbar-width:thin}.layers-scroll::-webkit-scrollbar{width:6px}.layers-scroll::-webkit-scrollbar-thumb{background:rgb(255 255 255/.15);border-radius:3px}.layers-tree{display:flex;flex-direction:column;gap:0;padding:0 2px 2px;position:relative}.layers-group{display:flex;flex-direction:column}.layers-row{align-items:center;border-radius:6px;color:#e4e4e7;cursor:pointer;display:flex;gap:1px;min-height:24px;padding:2px 4px 2px calc(2px + var(--layer-depth,0)*8px);position:relative;transition:background .12s}.layers-row:hover{background:rgb(255 255 255/.06)}.layers-row.selected{background:rgb(124 58 237/.18);color:#f5f5f7}.layers-row.selected::before{background:#8b5cf6;border-radius:1px;bottom:4px;content:"";left:2px;position:absolute;top:4px;width:2px}.layers-toggle{align-items:center;background:transparent;border:0;border-radius:3px;color:#71717a;cursor:pointer;display:inline-flex;flex-shrink:0;height:14px;justify-content:center;padding:0;width:14px}.layers-toggle:hover{background:rgb(255 255 255/.08);color:#d4d4d8}.layers-toggle svg{display:block;height:10px;pointer-events:none;transition:transform .15s;width:10px}.layers-toggle:not(.expanded) svg{transform:rotate(-90deg)}.layers-toggle-spacer{flex-shrink:0;width:14px}.layers-icon{align-items:center;border-radius:3px;display:inline-flex;flex-shrink:0;font:700 7px/1 system-ui;height:12px;justify-content:center;width:12px}.layers-icon-frame{background:rgb(59 130 246/.18);color:#93c5fd}.layers-icon-frame::before{content:"#";font-size:10px}.layers-icon-text{background:rgb(34 197 94/.15);color:#86efac}.layers-icon-text::before{content:"T"}.layers-icon-heading{background:rgb(168 85 247/.18);color:#d8b4fe}.layers-icon-heading::before{content:"H"}.layers-icon-image{background:rgb(244 114 182/.15);color:#f9a8d4}.layers-icon-image::before{content:"◻";font-size:8px}.layers-icon-button{background:rgb(251 191 36/.15);color:#fcd34d}.layers-icon-button::before{content:"▣";font-size:8px}.layers-icon-input{background:rgb(148 163 184/.15);color:#cbd5e1}.layers-icon-input::before{content:"In";font-size:7px;letter-spacing:-.02em}.layers-name{flex:1;font:500 12px/1.3 system-ui;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.layers-tag{color:#71717a;flex-shrink:0;font:500 9px/1 ui-monospace,monospace;max-width:48px;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .15s;white-space:nowrap}.layers-row:hover .layers-tag,.layers-row.selected .layers-tag{opacity:1}.layers-row.selected .layers-tag{color:#a78bfa}.layers-row.is-hidden .layers-icon,.layers-row.is-hidden .layers-name{opacity:.45}.layers-row.is-locked .layers-name{color:#a1a1aa}.layers-row.is-dragging{opacity:.55;pointer-events:none}.layers-drop-indicator{background:#8b5cf6;border-radius:1px;box-shadow:0 0 6px rgb(139 92 246/.55);height:2px;left:4px;margin:0;pointer-events:none;position:absolute;right:4px;z-index:3}.layers-drag-handle{align-items:center;background:transparent;border:0;color:#52525b;cursor:grab;display:inline-flex;flex-shrink:0;height:14px;justify-content:center;opacity:0;padding:0;pointer-events:auto;touch-action:none;width:8px}.layers-row:hover .layers-drag-handle,.layers-row.selected .layers-drag-handle,.layers-row:focus-within .layers-drag-handle{opacity:1}.layers-drag-handle:active{cursor:grabbing}.layers-drag-handle svg{display:block;height:10px;pointer-events:none;width:6px}.layers-actions{align-items:center;display:inline-flex;flex-shrink:0;gap:1px;margin-left:2px;opacity:0}.layers-row:hover .layers-actions,.layers-row.selected .layers-actions,.layers-actions:focus-within{opacity:1}.layers-action{align-items:center;background:transparent;border:0;border-radius:3px;color:#71717a;cursor:pointer;display:inline-flex;flex-shrink:0;height:16px;justify-content:center;padding:0;width:16px}.layers-action:hover{background:rgb(255 255 255/.08);color:#e4e4e7}.layers-action[aria-pressed="true"]{color:#a78bfa}.layers-action.is-on{color:#fcd34d}.layers-action svg{display:block;height:10px;pointer-events:none;width:10px}.layers-tree.is-dragging .layers-row{cursor:grabbing}.layers-tree.is-dragging .layers-row:not(.is-dragging){pointer-events:auto}.layers-children{border-left:1px solid rgb(255 255 255/.07);margin:0;padding:0}.layers-empty{color:#71717a;font:500 12px/1.4 system-ui;padding:12px;text-align:center}.design-panel{right:12px;width:280px}.figma-sidebar.design-panel{background:#1e1e1e;border-color:rgb(255 255 255/.06)}.design-element-type{color:#71717a;flex:1;font:500 11px/1 system-ui;margin-right:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize;white-space:nowrap}.design-panel .figma-sidebar-body{background:transparent;padding:0}.design-panel .panel{background:transparent;border-radius:0;box-shadow:none;gap:0;max-width:100%;min-width:0;overflow-x:hidden;padding:0;pointer-events:auto;position:static;width:100%}.design-compact-row{align-items:end;display:grid;gap:8px;grid-template-columns:1fr 1fr;min-width:0;width:100%}.design-compact-row>.design-field{min-width:0}.design-wh-row{align-items:end;display:grid;gap:8px;grid-template-columns:1fr 1fr;min-width:0;width:100%}.design-position-align{display:grid;gap:2px;grid-template-columns:repeat(6,1fr);margin-bottom:2px;width:100%}.design-align-btn{align-items:center;background:transparent;border-radius:6px;color:#e4e4e7;display:inline-flex;flex:1;font:500 12px/1.3 system-ui;height:28px;justify-content:center;min-height:28px;min-width:0;padding:4px 8px}.design-align-btn:hover{background:rgb(255 255 255/.06)}.design-fill-row{align-items:center;display:grid;gap:8px;grid-template-columns:32px 1fr;min-width:0;width:100%}.design-fill-swatch{height:28px;min-height:28px;padding:2px;width:32px}.design-hex-input{font:500 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;min-width:0;text-transform:uppercase}.design-type-style-row{align-items:center;display:flex;flex-wrap:wrap;gap:2px;width:100%}.design-type-style-row .button.icon{flex:0 0 28px;height:28px;min-width:28px;width:28px}.design-type-style-row .format-color{flex:0 0 32px;height:28px;width:32px}.design-type-weight-size{align-items:end}.design-action-bar{align-items:center;border-top:1px solid rgb(255 255 255/.06);display:flex;flex-wrap:wrap;gap:6px;padding:6px 8px}.design-panel .panel-input,.design-panel .ai-chat-trigger,.design-panel .design-unit-trigger{background:#2a2a2e;border:1px solid rgb(255 255 255/.08);border-radius:8px;box-shadow:none;color:#f5f5f7;font:500 12px/1.35 system-ui}.design-panel .panel-input:focus,.design-panel .ai-chat-trigger:focus,.design-panel .design-unit-trigger:focus{border-color:rgb(139 92 246/.45);box-shadow:0 0 0 2px rgb(139 92 246/.12);outline:none}.design-panel .layout-input{text-align:left}.design-section[hidden]{display:none!important}.design-panel .edit-toolbar-section{flex-wrap:wrap;width:100%}.design-panel .panel-input[data-reframe-text]{display:block!important;width:100%}.design-position{display:grid;gap:6px;grid-template-columns:1fr 1fr;margin-bottom:8px}.design-position .layout-field{width:100%}.design-position .layout-input{width:100%}.figma-zoom{align-items:center;background:#1c1c1e;border-radius:999px;bottom:16px;box-shadow:0 8px 32px rgb(0 0 0/.38),0 0 0 1px rgb(255 255 255/.08);display:inline-flex;gap:2px;left:50%;padding:4px 6px;pointer-events:auto;position:fixed;transform:translateX(-50%);z-index:2147483004}.figma-zoom .button.icon{border-radius:8px;height:32px;min-width:32px;width:32px}.figma-zoom-label{color:#a1a1aa;font:600 11px/1 ui-monospace,monospace;min-width:44px;text-align:center}:host([data-reframe-tool="hand"]){cursor:grab}:host([data-reframe-tool="hand"][data-reframe-panning="true"]){cursor:grabbing}.chrome{transition:transform .22s ease}:host([data-reframe-ui-peek="true"]) .chrome{transform:translate(56px,56px)}.element-history-dialog{width:min(440px,calc(100vw - 24px))}.element-history-target{color:#a1a1aa;font-size:11px;margin:0;padding:0 12px 8px}.element-history-list{display:flex;flex-direction:column;gap:6px;max-height:min(50vh,360px);overflow:auto;padding:8px 12px 12px;scrollbar-color:rgb(255 255 255/.12) transparent;scrollbar-width:thin}.element-history-row{align-items:center;border-bottom:1px solid rgb(255 255 255/.04);display:grid;gap:0;grid-template-columns:minmax(0,1fr) auto;min-height:46px;padding:0 8px}.element-history-row:hover{background:rgb(255 255 255/.04)}.element-history-row.is-current{background:rgb(124 58 237/.08)}.element-history-row.is-invalid{opacity:.55}.element-history-summary{display:grid;gap:2px;min-width:0;overflow:hidden;padding:7px 0}.element-history-summary strong{color:#e0e0e0;display:block;font-size:12px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.element-history-detail{color:#71717a;font-size:10px;line-height:1.35;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}';
  if ("adoptedStyleSheets" in root && "replaceSync" in CSSStyleSheet.prototype) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css + showcasePanelCss + '.button[hidden],.comment-tools[hidden]{display:none!important}.mapping.showcase-pulse{animation:showcase-pulse .8s ease 2}@keyframes showcase-pulse{0%,100%{color:#c4b5fd;transform:scale(1)}50%{color:#fff;transform:scale(1.08)}}.showcase-flash{position:fixed;inset:0;background:rgba(124,58,237,.18);opacity:0;pointer-events:none;transition:opacity .12s ease;z-index:2147482996}.showcase-code-split{position:fixed;inset:12px 12px 12px 44%;display:grid;grid-template-columns:1fr 1fr;gap:0;background:#0d0d0f;border:1px solid rgb(255 255 255/.1);border-radius:12px;box-shadow:0 12px 40px rgb(0 0 0/.5);overflow:hidden;pointer-events:none;z-index:2147482995}.showcase-code-pane{background:#0d0d0f;border-right:1px solid rgb(255 255 255/.08);display:flex;flex-direction:column;min-width:0}.showcase-code-tab{background:#1a1a1c;border-bottom:1px solid rgb(255 255 255/.08);color:#e4e4e7;font:600 11px/1 ui-monospace,monospace;padding:8px 12px}.showcase-code-pre{color:#a8a8b0;flex:1;font:11px/1.6 ui-monospace,monospace;margin:0;overflow:auto;padding:12px}.showcase-code-line{display:block;white-space:pre}.showcase-diff-add{background:rgba(34,197,94,.15);color:#4ade80}.showcase-diff-remove{background:rgba(239,68,68,.12);color:#f87171}.showcase-code-preview{background:linear-gradient(180deg,#fafbff,#f4f6fb)}.showcase-comment-pin{align-items:center;background:#7c3aed;border:2px solid #fff;border-radius:50% 50% 50% 0;color:#fff;display:flex;font:700 11px/1 system-ui;height:22px;justify-content:center;pointer-events:none;position:fixed;transform:rotate(-45deg);width:22px;z-index:2147483006}.showcase-comment-bubble{background:#fff;border-radius:10px;box-shadow:0 8px 24px rgb(0 0 0/.2);color:#141a24;font:500 12px/1.4 system-ui;max-width:200px;padding:8px 12px;pointer-events:none;position:fixed;transform:translate(-50%,0);z-index:2147483006}.showcase-collab-chip{align-items:center;background:#fff;border-radius:999px;box-shadow:0 4px 16px rgb(0 0 0/.15);color:#141a24;display:inline-flex;font:600 11px/1 system-ui;gap:6px;padding:6px 12px;pointer-events:none;position:fixed;right:16px;top:64px;z-index:2147483006}.showcase-collab-avatar{align-items:center;background:#5b45d6;border-radius:50%;color:#fff;display:inline-flex;font:700 10px/1 system-ui;height:20px;justify-content:center;width:20px}[hidden].showcase-flash,[hidden].showcase-code-split,[hidden].showcase-comment-pin,[hidden].showcase-comment-bubble,[hidden].showcase-collab-chip{display:none!important}');
    root.adoptedStyleSheets = [sheet];
  } else {
    const style = document.createElement("style");
    style.textContent = css + showcasePanelCss + '.button[hidden],.comment-tools[hidden]{display:none!important}.mapping.showcase-pulse{animation:showcase-pulse .8s ease 2}@keyframes showcase-pulse{0%,100%{color:#c4b5fd;transform:scale(1)}50%{color:#fff;transform:scale(1.08)}}.showcase-flash{position:fixed;inset:0;background:rgba(124,58,237,.18);opacity:0;pointer-events:none;transition:opacity .12s ease;z-index:2147482996}.showcase-code-split{position:fixed;inset:12px 12px 12px 44%;display:grid;grid-template-columns:1fr 1fr;gap:0;background:#0d0d0f;border:1px solid rgb(255 255 255/.1);border-radius:12px;box-shadow:0 12px 40px rgb(0 0 0/.5);overflow:hidden;pointer-events:none;z-index:2147482995}.showcase-code-pane{background:#0d0d0f;border-right:1px solid rgb(255 255 255/.08);display:flex;flex-direction:column;min-width:0}.showcase-code-tab{background:#1a1a1c;border-bottom:1px solid rgb(255 255 255/.08);color:#e4e4e7;font:600 11px/1 ui-monospace,monospace;padding:8px 12px}.showcase-code-pre{color:#a8a8b0;flex:1;font:11px/1.6 ui-monospace,monospace;margin:0;overflow:auto;padding:12px}.showcase-code-line{display:block;white-space:pre}.showcase-diff-add{background:rgba(34,197,94,.15);color:#4ade80}.showcase-diff-remove{background:rgba(239,68,68,.12);color:#f87171}.showcase-code-preview{background:linear-gradient(180deg,#fafbff,#f4f6fb)}.showcase-comment-pin{align-items:center;background:#7c3aed;border:2px solid #fff;border-radius:50% 50% 50% 0;color:#fff;display:flex;font:700 11px/1 system-ui;height:22px;justify-content:center;pointer-events:none;position:fixed;transform:rotate(-45deg);width:22px;z-index:2147483006}.showcase-comment-bubble{background:#fff;border-radius:10px;box-shadow:0 8px 24px rgb(0 0 0/.2);color:#141a24;font:500 12px/1.4 system-ui;max-width:200px;padding:8px 12px;pointer-events:none;position:fixed;transform:translate(-50%,0);z-index:2147483006}.showcase-collab-chip{align-items:center;background:#fff;border-radius:999px;box-shadow:0 4px 16px rgb(0 0 0/.15);color:#141a24;display:inline-flex;font:600 11px/1 system-ui;gap:6px;padding:6px 12px;pointer-events:none;position:fixed;right:16px;top:64px;z-index:2147483006}.showcase-collab-avatar{align-items:center;background:#5b45d6;border-radius:50%;color:#fff;display:inline-flex;font:700 10px/1 system-ui;height:20px;justify-content:center;width:20px}[hidden].showcase-flash,[hidden].showcase-code-split,[hidden].showcase-comment-pin,[hidden].showcase-comment-bubble,[hidden].showcase-collab-chip{display:none!important}';
    root.append(style);
  }
  const template = document.createElement("template");
  template.innerHTML = '<div class="chrome" role="toolbar" aria-label="Reframe" data-reframe-chrome-visible="false"><div class="chrome-hit-zone" data-reframe-chrome-hit aria-label="Show Reframe toolbar"></div><div class="chip status-chip" role="status" title="Connecting"><span class="brand-mini brand" aria-hidden="true">R</span><span class="dot" aria-hidden="true"></span><span class="sr-only" data-reframe-state-label>Connecting</span><button class="button icon" type="button" data-reframe-exit aria-label="Exit"></button><button class="button icon" type="button" data-reframe-test hidden aria-label="Test Connection"></button></div><span class="toast" data-reframe-diagnostic aria-live="polite"></span></div><div class="pill context-pill compact" data-reframe-context role="group" aria-label="Element actions" hidden></div><div class="more-menu" data-reframe-more-menu hidden role="menu"></div><div class="outline hover" data-reframe-hover hidden><span class="outline-border" aria-hidden="true"></span><span class="tag" data-reframe-hover-label></span></div><div class="outline selected" data-reframe-selected hidden><span class="outline-border" aria-hidden="true"></span><span class="tag" data-reframe-selected-label></span><button class="handle handle-move" type="button" aria-label="Move element" data-reframe-handle-move></button><button class="handle" type="button" aria-label="Resize width" data-reframe-handle></button><button class="handle handle-bottom" type="button" aria-label="Resize height" data-reframe-handle-height></button></div><div class="panel edit-toolbar" data-reframe-panel hidden><div class="edit-toolbar-section layout-panel" data-reframe-layout-panel><label class="layout-field">X<input class="panel-input layout-input" data-reframe-layout-x type="number" aria-label="X px"></label><label class="layout-field">Y<input class="panel-input layout-input" data-reframe-layout-y type="number" aria-label="Y px"></label><label class="layout-field">W<input class="panel-input layout-input" data-reframe-layout-width type="number" min="1" max="10000" aria-label="Width px"></label><label class="layout-field">H<input class="panel-input layout-input" data-reframe-layout-height type="number" min="1" max="10000" aria-label="Height px"></label><label class="layout-field layout-radius-field">R<input class="panel-input layout-input" data-reframe-layout-radius type="number" min="0" max="999" aria-label="Border radius px"></label></div><span class="panel-divider" data-reframe-format-divider aria-hidden="true"></span><div class="edit-toolbar-section format-panel" data-reframe-format-panel hidden><select class="panel-input format-select" data-reframe-format-font aria-label="Font family"><option value="inherit">Font</option><option value="Arial, sans-serif">Arial</option><option value="Georgia, serif">Georgia</option><option value="system-ui, sans-serif">System</option><option value="monospace">Mono</option></select><button class="button icon format-advanced" type="button" data-reframe-format-smaller aria-label="Decrease font size" hidden>A-</button><button class="button icon format-advanced" type="button" data-reframe-format-larger aria-label="Increase font size" hidden>A+</button><input class="panel-input format-color format-advanced" data-reframe-format-color type="color" aria-label="Text color" value="#f5f5f7" hidden><button class="button icon" type="button" data-reframe-format-bold aria-label="Bold" aria-pressed="false"><strong>B</strong></button><button class="button icon" type="button" data-reframe-format-italic aria-label="Italic" aria-pressed="false"><em>I</em></button><button class="button icon" type="button" data-reframe-format-underline aria-label="Underline" aria-pressed="false"><u>U</u></button><button class="button icon format-advanced" type="button" data-reframe-format-align-left aria-label="Align left" aria-pressed="false" hidden>L</button><button class="button icon format-advanced" type="button" data-reframe-format-align-center aria-label="Align center" aria-pressed="false" hidden>C</button><button class="button icon format-advanced" type="button" data-reframe-format-align-right aria-label="Align right" aria-pressed="false" hidden>R</button></div><span class="panel-divider panel-actions-divider" aria-hidden="true"></span><span class="panel-metrics" data-reframe-metrics hidden><span data-reframe-width></span><span data-reframe-height></span></span><input class="panel-input" data-reframe-text maxlength="4096" placeholder="Edit text" hidden><button class="button icon" type="button" data-reframe-apply aria-label="Save to source"></button><button class="button icon" type="button" data-reframe-cancel aria-label="Deselect"></button><span class="mapping" data-reframe-mapping>Mapping…</span><span class="panel-hint" data-reframe-panel-hint></span><button class="button" type="button" data-reframe-impact hidden>Allow shared edit</button><button class="button" type="button" data-reframe-overlap hidden>Save resize safely</button><span class="temporary" data-reframe-temporary hidden>Temporary preview</span></div>';
  const moreMenu = template.content.querySelector("[data-reframe-more-menu]");
  const historyMenuButton = document.createElement("button");
  historyMenuButton.className = "button icon";
  historyMenuButton.type = "button";
  historyMenuButton.dataset.reframeHistoryBtn = "";
  historyMenuButton.setAttribute("aria-expanded", "false");
  historyMenuButton.setAttribute("aria-label", "Visual history");
  historyMenuButton.title = "Visual history";
  const commentsButton = document.createElement("button");
  commentsButton.className = "button icon";
  commentsButton.type = "button";
  commentsButton.dataset.reframeComments = "";
  commentsButton.setAttribute("aria-expanded", "false");
  commentsButton.setAttribute("aria-label", "Add comment");
  commentsButton.title = "Add comment";
  const contextHistoryButton = document.createElement("button");
  contextHistoryButton.className = "button icon";
  contextHistoryButton.type = "button";
  contextHistoryButton.dataset.reframeContextHistory = "";
  contextHistoryButton.setAttribute("aria-label", "Element history");
  contextHistoryButton.title = "Element history";
  const contextMoreButton = document.createElement("button");
  contextMoreButton.className = "button icon";
  contextMoreButton.type = "button";
  contextMoreButton.dataset.reframeContextMore = "";
  contextMoreButton.setAttribute("aria-haspopup", "menu");
  contextMoreButton.setAttribute("aria-expanded", "false");
  contextMoreButton.setAttribute("aria-label", "More actions");
  contextMoreButton.title = "More actions";
  const moreButtonEl = document.createElement("button");
  moreButtonEl.className = "button icon";
  moreButtonEl.type = "button";
  moreButtonEl.dataset.reframeMore = "";
  moreButtonEl.setAttribute("aria-haspopup", "menu");
  moreButtonEl.setAttribute("aria-expanded", "false");
  moreButtonEl.setAttribute("aria-label", "More actions");
  const generateButton = document.createElement("button");
  generateButton.className = "button icon";
  generateButton.type = "button";
  generateButton.dataset.reframeGenerate = "";
  generateButton.setAttribute("aria-label", "Generate");
  generateButton.title = "Generate with AI";
  const contextMoreMenu = document.createElement("div");
  contextMoreMenu.className = "more-menu";
  contextMoreMenu.dataset.reframeContextMoreMenu = "";
  contextMoreMenu.hidden = true;
  contextMoreMenu.setAttribute("role", "menu");
  const toolbarLayersButton = document.createElement("button");
  toolbarLayersButton.className = "button icon";
  toolbarLayersButton.type = "button";
  toolbarLayersButton.dataset.reframeToolbarLayers = "";
  toolbarLayersButton.setAttribute("aria-pressed", "true");
  toolbarLayersButton.setAttribute("aria-label", "Layers panel");
  toolbarLayersButton.title = "Layers";
  const toolbarDesignButton = document.createElement("button");
  toolbarDesignButton.className = "button icon";
  toolbarDesignButton.type = "button";
  toolbarDesignButton.dataset.reframeToolbarDesign = "";
  toolbarDesignButton.setAttribute("aria-pressed", "true");
  toolbarDesignButton.setAttribute("aria-label", "Design panel");
  toolbarDesignButton.title = "Design";
  const referenceButton = document.createElement("button");
  referenceButton.className = "button icon";
  referenceButton.type = "button";
  referenceButton.dataset.reframeReference = "";
  referenceButton.setAttribute("aria-expanded", "false");
  referenceButton.setAttribute("aria-label", "Reference adaptation");
  referenceButton.title = "Reference adaptation";
  const toolbarDivider = () => { const divider = document.createElement("span"); divider.className = "toolbar-divider"; divider.setAttribute("aria-hidden", "true"); return divider; };
  const toolbarDividerPrimary = toolbarDivider();
  const toolbarDividerEdit = toolbarDivider();
  const toolbarDividerActions = toolbarDivider();
  const aiPanelTemplate = document.createElement("template");
  aiPanelTemplate.innerHTML = '<div class="ai-panel figma-sidebar" data-reframe-ai-panel hidden role="dialog" aria-labelledby="reframe-ai-title"><div class="figma-sidebar-head layers-head ai-panel-head"><span class="layers-title" id="reframe-ai-title">Generate</span><div class="layers-head-actions"><button class="button icon layers-collapse-btn" type="button" data-reframe-ai-close aria-label="Close generate panel"></button></div></div><div class="figma-sidebar-body ai-panel-scroll" data-reframe-no-tool-shortcuts><label class="ai-chat-label">Codex task<div class="ai-chat-picker" data-reframe-codex-chat><button type="button" class="ai-chat-trigger" data-reframe-codex-chat-trigger aria-haspopup="listbox" aria-expanded="false"><span class="ai-chat-trigger-label" data-reframe-codex-chat-label>New local Codex task</span><span class="ai-chat-chevron" aria-hidden="true">▾</span></button><ul class="ai-chat-menu" data-reframe-codex-chat-menu hidden role="listbox" aria-label="Codex tasks"></ul></div></label><label class="ai-session-id-label">Or paste task ID<input class="ai-session-id-input" data-reframe-codex-session-id data-reframe-no-tool-shortcuts placeholder="019dbf28-411e-70a0-91f1-26a965601e16" spellcheck="false"></label><textarea class="ai-prompt" data-reframe-ai-prompt data-reframe-no-tool-shortcuts placeholder="Describe the visual change you want." rows="4"></textarea><div class="ai-attachments" data-reframe-ai-attachments hidden><div class="ai-attachment-chip" data-reframe-ai-attachment-chip><img data-reframe-ai-attachment-img alt="Pasted reference"><span class="ai-attachment-name" data-reframe-ai-attachment-name>Pasted image</span><button class="button ai-attachment-clear" type="button" data-reframe-ai-attachment-clear>Remove</button></div></div><details class="ai-reference-section" data-reframe-reference-dialog><summary>Reference adaptation</summary><div class="ai-reference-body"><form class="reference-form" data-reframe-reference-form><section class="reference-section"><h3 class="reference-section-title">Source</h3><label class="reference-field">Reference type<div class="ai-chat-picker" data-reframe-reference-kind-picker><input type="hidden" data-reframe-reference-kind value="screenshot"><button type="button" class="ai-chat-trigger" data-reframe-reference-kind-trigger aria-haspopup="listbox" aria-expanded="false"><span class="ai-chat-trigger-label" data-reframe-reference-kind-label>Screenshot</span><span class="ai-chat-chevron" aria-hidden="true">▾</span></button><ul class="ai-chat-menu" data-reframe-reference-kind-menu hidden role="listbox" aria-label="Reference type"><li class="ai-chat-option" role="option" data-reframe-picker-value="screenshot" aria-selected="true">Screenshot</li><li class="ai-chat-option" role="option" data-reframe-picker-value="site-screenshot">Another-site screenshot</li><li class="ai-chat-option" role="option" data-reframe-picker-value="hand-drawn">Hand-drawn mockup</li><li class="ai-chat-option" role="option" data-reframe-picker-value="markdown">Markdown design specification</li><li class="ai-chat-option" role="option" data-reframe-picker-value="figma-export">Figma JSON export</li><li class="ai-chat-option" role="option" data-reframe-picker-value="design-dna">Approved Design DNA reference</li></ul></div></label><div class="reference-source-panel" data-reframe-reference-source-panel><div class="reference-dropzone" data-reframe-reference-dropzone tabindex="0" role="button" aria-label="Paste or drop reference file"><input class="reference-file-input" type="file" data-reframe-reference-file accept="image/png"><div class="reference-dropzone-empty" data-reframe-reference-dropzone-empty><span class="reference-dropzone-icon" aria-hidden="true">📋</span><p class="reference-dropzone-text" data-reframe-reference-dropzone-text>Paste image (Ctrl+V) or drop file here</p><button class="button reference-choose-file" type="button" data-reframe-reference-choose>Choose file</button></div><div class="reference-preview" data-reframe-reference-preview hidden><img class="reference-preview-img" data-reframe-reference-preview-img alt="Reference preview"><div class="reference-preview-meta"><span class="reference-preview-name" data-reframe-reference-preview-name></span><button class="button reference-clear-file" type="button" data-reframe-reference-clear-file>Remove</button></div></div></div></div></section><details class="reference-advanced" data-reframe-reference-advanced><summary class="reference-advanced-toggle">Advanced</summary><div class="reference-advanced-body"><label class="reference-field">Approved DNA reference ID (DNA option only)<input class="reference-input" data-reframe-reference-dna-id maxlength="128"></label><label class="reference-field">Approved DNA version (DNA option only)<input class="reference-input" data-reframe-reference-dna-version maxlength="128"></label><label class="reference-field">Provenance<input class="reference-input" data-reframe-reference-provenance maxlength="500" value="User supplied reference" required></label><label class="reference-field reference-check"><span><input type="checkbox" data-reframe-reference-persist> Keep sanitized reference in .reframe/references</span></label></div></details><section class="reference-section"><h3 class="reference-section-title">Borrow</h3><fieldset class="reference-fieldset"><legend class="sr-only">Borrow only these characteristics</legend><div class="reference-choices" data-reframe-reference-choices><label><input type="checkbox" value="page-structure"> Page structure</label><label><input type="checkbox" value="component-arrangement"> Component arrangement</label><label><input type="checkbox" value="colors"> Colors</label><label><input type="checkbox" value="typography"> Typography</label><label><input type="checkbox" value="interaction-behavior"> Interaction behavior</label><label><input type="checkbox" value="content-density"> Content density</label><label><input type="checkbox" value="navigation-pattern"> Navigation pattern</label><label><input type="checkbox" value="responsive-behavior"> Responsive behavior</label></div></fieldset></section><section class="reference-section"><h3 class="reference-section-title">Options</h3><label class="reference-field">Brand treatment<div class="ai-chat-picker" data-reframe-reference-brand-picker><input type="hidden" data-reframe-reference-brand value="preserve"><button type="button" class="ai-chat-trigger" data-reframe-reference-brand-trigger aria-haspopup="listbox" aria-expanded="false"><span class="ai-chat-trigger-label" data-reframe-reference-brand-label>Preserve this project&apos;s Design DNA</span><span class="ai-chat-chevron" aria-hidden="true">▾</span></button><ul class="ai-chat-menu" data-reframe-reference-brand-menu hidden role="listbox" aria-label="Brand treatment"><li class="ai-chat-option" role="option" data-reframe-picker-value="preserve" aria-selected="true">Preserve this project&apos;s Design DNA</li><li class="ai-chat-option" role="option" data-reframe-picker-value="blend">Blend both designs</li><li class="ai-chat-option" role="option" data-reframe-picker-value="follow">Follow the reference closely</li></ul></div></label><label class="reference-field">Placement<input class="reference-input" data-reframe-reference-placement maxlength="500" placeholder="Select an element on the page first" required></label><label class="reference-field reference-check" data-reframe-reference-unknown-row><span><input type="checkbox" data-reframe-reference-unknown> Confirm evidence/assumptions for <span data-reframe-reference-unknown-target>selected target</span></span></label></section><div class="reference-actions"><button class="button reference-primary" type="submit" data-reframe-reference-build>Build adaptation plan</button><button class="button reference-secondary" type="button" data-reframe-reference-freeze disabled>Approve and freeze plan</button></div><span class="reference-status" data-reframe-reference-status>Select an exactly mapped target first.</span><pre class="reference-plan" data-reframe-reference-plan hidden></pre></form></div></details><span class="ai-status" data-reframe-ai-status>Choose a Codex task, then Generate</span><div class="ai-actions"><button class="button icon" data-reframe-ai-accept hidden aria-label="Accept"></button><button class="button icon" data-reframe-ai-refine hidden aria-label="Refine"></button><button class="button icon" data-reframe-ai-compare hidden aria-label="Compare"></button><button class="button icon" data-reframe-ai-reject hidden aria-label="Reject"></button><button class="button icon" data-reframe-ai-dismiss hidden aria-label="Dismiss"></button><button class="button icon" data-reframe-ai-stop hidden aria-label="Stop"></button></div></div><div class="ai-panel-footer"><button class="button ai-generate-btn" type="button" data-reframe-ai-generate data-reframe-no-tool-shortcuts>Generate</button></div></div>';
  template.content.append(aiPanelTemplate.content.cloneNode(true));
  const timeTemplate = document.createElement("template");
  timeTemplate.innerHTML = '<div class="time-overlay" data-reframe-time-overlay role="img" aria-label="Previous design comparison" hidden><img data-reframe-time-image alt="Previous design screenshot"><span class="time-label" data-reframe-time-label aria-live="polite">Previous</span></div><div class="source-compare" data-reframe-source-compare hidden><iframe data-reframe-compare-iframe title="Before design"></iframe><div class="source-compare-handle" data-reframe-compare-handle role="slider" aria-label="Compare before and after" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" tabindex="0"></div><span class="source-compare-label" data-reframe-compare-label>Drag to compare · Esc to close</span></div><section class="history-dialog" data-reframe-history-dialog role="dialog" aria-modal="true" aria-labelledby="reframe-history-title" hidden><div class="history-head"><h2 id="reframe-history-title">Visual history</h2><button class="button icon layers-collapse-btn" type="button" data-reframe-history-close aria-label="Close visual history" title="Close"></button></div><div class="history-toolbar"><div class="history-meta-row"><span class="history-meta" data-reframe-previous>Previous: original</span><span class="history-meta history-meta-sep" aria-hidden="true">·</span><span class="history-meta" data-reframe-current>Current: working tree</span></div><div class="history-actions"><button class="button icon history-tool-btn" type="button" data-reframe-time aria-expanded="false" aria-label="Hold to view previous" title="Hold to view previous"></button><button class="button icon history-tool-btn" type="button" data-reframe-source-compare-toggle aria-label="Compare source" title="Compare source"></button><button class="button history-restore-toolbar" type="button" data-reframe-restore disabled aria-disabled="true">Restore Previous</button></div></div><div class="history-graph-panel"><div class="history-graph-header"><span class="history-graph-label">Checkpoints</span><span class="history-graph-count" data-reframe-history-count></span></div><div class="history-list history-graph" data-reframe-history-list></div></div></section><section class="history-dialog element-history-dialog" data-reframe-element-history-dialog role="dialog" aria-modal="true" aria-labelledby="reframe-element-history-title" hidden><div class="history-head"><h2 id="reframe-element-history-title">Element history</h2><button class="button" type="button" data-reframe-element-history-close aria-label="Close element history">Close</button></div><p class="element-history-target" data-reframe-element-history-target></p><div class="element-history-list" data-reframe-element-history-list></div></section>';
  template.content.append(timeTemplate.content.cloneNode(true));
  const annotationTemplate = document.createElement("template");
  annotationTemplate.innerHTML = '<div class="annotation-layer" data-reframe-annotation-layer aria-hidden="true"></div><section class="annotation-dialog" data-reframe-annotation-dialog role="dialog" aria-modal="true" aria-labelledby="reframe-annotation-title" hidden><div class="annotation-head"><div><h2 id="reframe-annotation-title">Comments</h2><p class="annotation-dialog-summary" data-reframe-annotation-summary></p></div><button class="button" type="button" data-reframe-annotation-close aria-label="Close comments">Close</button></div><form class="annotation-form" data-reframe-annotation-form hidden><label>Author<input class="annotation-input" data-reframe-annotation-author maxlength="128" value="Local reviewer"></label><label>Comment<textarea class="annotation-input" data-reframe-annotation-comment maxlength="4096" required></textarea></label><label><span><input type="checkbox" data-reframe-annotation-highlight checked> Highlight selected element</span></label><button class="button" type="submit" data-reframe-annotation-save>Save pin</button></form><div class="annotation-list" data-reframe-annotation-list></div></section>';
  template.content.append(annotationTemplate.content.cloneNode(true));
  const formatTemplate = document.createElement("template");
  formatTemplate.innerHTML = '<div class="heatmap-layer" data-reframe-heatmap-layer hidden></div><div class="annoint-layer" data-reframe-annoint-layer hidden><svg class="annoint-svg" data-reframe-annoint-svg xmlns="http://www.w3.org/2000/svg"></svg></div>';
  template.content.append(formatTemplate.content.cloneNode(true));
  const figmaTemplate = document.createElement("template");
  figmaTemplate.innerHTML = '<nav class="figma-rail" data-reframe-tool-rail role="toolbar" aria-label="Figma tools"><button class="button icon" type="button" data-reframe-tool="select" aria-pressed="false" aria-label="Move / Select (V)" title="Move / Select (V)"></button><button class="button icon" type="button" data-reframe-tool="hand" aria-pressed="false" aria-label="Hand / Pan (H)" title="Hand / Pan (H)"></button><button class="button icon" type="button" data-reframe-tool="comment" aria-pressed="false" aria-label="Comment (C)" title="Comment (C)"></button><button class="button icon" type="button" data-reframe-tool="text" aria-pressed="false" aria-label="Text (T)" title="Text (T)"></button><span class="figma-rail-divider" aria-hidden="true"></span><button class="button icon" type="button" data-reframe-paste-figma aria-label="Paste from Figma" title="Paste from Figma — Copy as PNG or Copy as CSS"></button><span class="figma-rail-divider" aria-hidden="true"></span><button class="button icon" type="button" data-reframe-layers-toggle aria-pressed="true" aria-label="Toggle layers panel" title="Layers"></button><button class="button icon" type="button" data-reframe-design-toggle aria-pressed="true" aria-label="Toggle design panel" title="Design"></button></nav><aside class="figma-sidebar layers-panel" data-reframe-layers-panel aria-label="Layers"><div class="figma-sidebar-head layers-head"><span class="layers-title">Layers</span><div class="layers-head-actions"><button class="button icon layers-head-icon-btn" type="button" data-reframe-layers-expand-all title="Expand all layers" aria-label="Expand all layers"></button><button class="button icon layers-head-icon-btn" type="button" data-reframe-layers-collapse-all title="Collapse all layers" aria-label="Collapse all layers"></button><button class="button icon layers-collapse-btn" type="button" data-reframe-layers-collapse aria-label="Collapse layers panel" title="Collapse panel"></button></div></div><div class="layers-search-wrap"><input class="layers-search" type="search" placeholder="Search layers" data-reframe-layers-search data-reframe-no-tool-shortcuts autocomplete="off" spellcheck="false"></div><div class="figma-sidebar-body layers-scroll"><div class="layers-tree" data-reframe-layers-tree role="tree"></div></div><div class="layers-resize-handle" data-reframe-layers-resize aria-hidden="true"></div></aside><aside class="figma-sidebar design-panel" data-reframe-design-panel hidden aria-label="Design"><div class="figma-sidebar-head layers-head"><span class="layers-title">Design</span><span class="design-element-type" data-reframe-design-element-type>Frame</span><div class="layers-head-actions"><button class="button icon layers-collapse-btn" type="button" data-reframe-design-collapse aria-label="Collapse design panel" title="Collapse panel"></button></div></div><div class="figma-sidebar-body" data-reframe-design-body data-reframe-no-tool-shortcuts></div></aside><button class="button design-panel-tab" type="button" data-reframe-design-tab hidden aria-label="Open design panel" title="Design">Design</button><div class="figma-zoom" data-reframe-zoom-controls role="group" aria-label="Zoom"><button class="button icon" type="button" data-reframe-zoom-out aria-label="Zoom out">−</button><span class="figma-zoom-label" data-reframe-zoom-label>100%</span><button class="button icon" type="button" data-reframe-zoom-in aria-label="Zoom in">+</button><button class="button icon" type="button" data-reframe-zoom-fit aria-label="Fit to screen" title="Fit">⤢</button></div>';
  template.content.append(figmaTemplate.content.cloneNode(true));
  root.append(template.content.cloneNode(true));
  const contextPillEl = root.querySelector("[data-reframe-context]");
  contextPillEl?.prepend(generateButton, contextHistoryButton, commentsButton, contextMoreButton);
  contextPillEl?.insertAdjacentElement("afterend", contextMoreMenu);
  const chrome = root.querySelector(".chrome");
  const chromeHitZone = root.querySelector("[data-reframe-chrome-hit]");
  const statusChip = root.querySelector(".status-chip");
  const collapseButton = document.createElement("button");
  collapseButton.className = "button icon";
  collapseButton.type = "button";
  collapseButton.dataset.reframeCollapse = "";
  collapseButton.setAttribute("aria-expanded", "true");
  collapseButton.setAttribute("aria-label", "Collapse toolbar");
  const commentTools = document.createElement("span");
  commentTools.className = "comment-tools";
  commentTools.hidden = true;
  commentTools.dataset.reframeCommentTools = "";
  const commentUndo = document.createElement("button");
  commentUndo.className = "button icon";
  commentUndo.type = "button";
  commentUndo.dataset.reframeCommentUndo = "";
  commentUndo.setAttribute("aria-label", "Undo");
  commentUndo.disabled = true;
  const commentRedo = document.createElement("button");
  commentRedo.className = "button icon";
  commentRedo.type = "button";
  commentRedo.dataset.reframeCommentRedo = "";
  commentRedo.setAttribute("aria-label", "Redo");
  commentRedo.disabled = true;
  commentTools.append(commentUndo, commentRedo);
  const editTools = document.createElement("span");
  editTools.className = "comment-tools";
  editTools.hidden = true;
  editTools.dataset.reframeEditTools = "";
  const editUndo = document.createElement("button");
  editUndo.className = "button icon";
  editUndo.type = "button";
  editUndo.dataset.reframeEditUndo = "";
  editUndo.setAttribute("aria-label", "Undo edit");
  editUndo.disabled = true;
  const editRedo = document.createElement("button");
  editRedo.className = "button icon";
  editRedo.type = "button";
  editRedo.dataset.reframeEditRedo = "";
  editRedo.setAttribute("aria-label", "Redo edit");
  editRedo.disabled = true;
  const editDelete = document.createElement("button");
  editDelete.className = "button icon";
  editDelete.type = "button";
  editDelete.dataset.reframeEditDelete = "";
  editDelete.setAttribute("aria-label", "Delete or hide selection");
  editTools.append(editUndo, editRedo, editDelete);
  const aiReviewButton = document.createElement("button");
  aiReviewButton.className = "button icon";
  aiReviewButton.type = "button";
  aiReviewButton.hidden = true;
  aiReviewButton.dataset.reframeAiReview = "";
  aiReviewButton.setAttribute("aria-label", "Review pending AI edit");
  const heatmapToggle = document.createElement("button");
  heatmapToggle.className = "button icon";
  heatmapToggle.type = "button";
  heatmapToggle.dataset.reframeHeatmap = "";
  heatmapToggle.setAttribute("aria-pressed", "false");
  heatmapToggle.setAttribute("aria-label", "UX heatmap");
  heatmapToggle.hidden = true;
  const commentModeToggle = document.createElement("button");
  commentModeToggle.className = "button icon";
  commentModeToggle.type = "button";
  commentModeToggle.dataset.reframeComment = "";
  commentModeToggle.dataset.reframeAnnotate = "";
  commentModeToggle.setAttribute("aria-pressed", "false");
  commentModeToggle.setAttribute("aria-label", "Comment mode");
  commentModeToggle.hidden = true;
  const annotationsToggle = document.createElement("button");
  annotationsToggle.className = "button icon";
  annotationsToggle.type = "button";
  annotationsToggle.dataset.reframeAnnotationsToggle = "";
  annotationsToggle.setAttribute("aria-pressed", "true");
  annotationsToggle.setAttribute("aria-label", "Hide annotation overlays");
  annotationsToggle.hidden = true;
  const reorderStatusToolbar = () => {
    if (!statusChip) return;
    const brand = statusChip.querySelector(".brand-mini");
    const dot = statusChip.querySelector(".dot");
    const state = statusChip.querySelector("[data-reframe-state-label]");
    const exit = root.querySelector("[data-reframe-exit]");
    const test = root.querySelector("[data-reframe-test]");
    for (const node of [collapseButton, brand, dot, state, toolbarDividerPrimary, toolbarLayersButton, historyMenuButton, toolbarDesignButton, referenceButton, toolbarDividerEdit, editTools, commentTools, aiReviewButton, toolbarDividerActions, moreButtonEl, exit, test]) if (node) statusChip.append(node);
  };
  reorderStatusToolbar();

  const stateLabel = root.querySelector("[data-reframe-state-label]");
  const diagnostic = root.querySelector("[data-reframe-diagnostic]");
  const testConnection = root.querySelector("[data-reframe-test]");
  const comments = root.querySelector("[data-reframe-comments]");
  const reference = root.querySelector("[data-reframe-reference]");
  const exit = root.querySelector("[data-reframe-exit]");
  const previousLabel = root.querySelector("[data-reframe-previous]");
  const currentLabel = root.querySelector("[data-reframe-current]");
  const restore = root.querySelector("[data-reframe-restore]");
  const time = root.querySelector("[data-reframe-time]");
  const timeOverlay = root.querySelector("[data-reframe-time-overlay]");
  const timeImage = root.querySelector("[data-reframe-time-image]");
  const timeLabel = root.querySelector("[data-reframe-time-label]");
  const sourceCompareOverlay = root.querySelector("[data-reframe-source-compare]");
  const sourceCompareIframe = root.querySelector("[data-reframe-compare-iframe]");
  const sourceCompareHandle = root.querySelector("[data-reframe-compare-handle]");
  const sourceCompareLabel = root.querySelector("[data-reframe-compare-label]");
  const sourceCompareToggle = root.querySelector("[data-reframe-source-compare-toggle]");
  const historyDialog = root.querySelector("[data-reframe-history-dialog]");
  const historyList = root.querySelector("[data-reframe-history-list]");
  const historyCount = root.querySelector("[data-reframe-history-count]");
  const historyClose = root.querySelector("[data-reframe-history-close]");
  const elementHistoryDialog = root.querySelector("[data-reframe-element-history-dialog]");
  const elementHistoryList = root.querySelector("[data-reframe-element-history-list]");
  const elementHistoryTarget = root.querySelector("[data-reframe-element-history-target]");
  const elementHistoryClose = root.querySelector("[data-reframe-element-history-close]");
  const annotationLayer = root.querySelector("[data-reframe-annotation-layer]");
  const annotationDialog = root.querySelector("[data-reframe-annotation-dialog]");
  const annotationClose = root.querySelector("[data-reframe-annotation-close]");
  const annotationForm = root.querySelector("[data-reframe-annotation-form]");
  const annotationAuthor = root.querySelector("[data-reframe-annotation-author]");
  const annotationComment = root.querySelector("[data-reframe-annotation-comment]");
  const annotationHighlight = root.querySelector("[data-reframe-annotation-highlight]");
  const annotationList = root.querySelector("[data-reframe-annotation-list]");
  const annotationSummary = root.querySelector("[data-reframe-annotation-summary]");
  const hoverOutline = root.querySelector("[data-reframe-hover]");
  const hoverLabel = root.querySelector("[data-reframe-hover-label]");
  const selectedOutline = root.querySelector("[data-reframe-selected]");
  const selectedLabel = root.querySelector("[data-reframe-selected-label]");
  const handle = root.querySelector("[data-reframe-handle]");
  const handleHeight = root.querySelector("[data-reframe-handle-height]");
  const handleMove = root.querySelector("[data-reframe-handle-move]");
  const panel = root.querySelector("[data-reframe-panel]");
  const widthLabel = root.querySelector("[data-reframe-width]");
  const heightLabel = root.querySelector("[data-reframe-height]");
  const metrics = root.querySelector("[data-reframe-metrics]");
  const textInput = root.querySelector("[data-reframe-text]");
  const panelHint = root.querySelector("[data-reframe-panel-hint]");
  const temporaryLabel = root.querySelector("[data-reframe-temporary]");
  const mappingLabel = root.querySelector("[data-reframe-mapping]");
  const impact = root.querySelector("[data-reframe-impact]");
  const overlap = root.querySelector("[data-reframe-overlap]");
  const apply = root.querySelector("[data-reframe-apply]");
  const cancel = root.querySelector("[data-reframe-cancel]");
  const generate = root.querySelector("[data-reframe-generate]");
  const aiPanel = root.querySelector("[data-reframe-ai-panel]");
  const aiChat = root.querySelector("[data-reframe-codex-chat]");
  const aiChatTrigger = root.querySelector("[data-reframe-codex-chat-trigger]");
  const aiChatMenu = root.querySelector("[data-reframe-codex-chat-menu]");
  const aiChatLabel = root.querySelector("[data-reframe-codex-chat-label]");
  const aiSessionId = root.querySelector("[data-reframe-codex-session-id]");
  const aiPrompt = root.querySelector("[data-reframe-ai-prompt]");
  const aiGenerate = root.querySelector("[data-reframe-ai-generate]");
  const aiClose = root.querySelector("[data-reframe-ai-close]");
  const aiAttachments = root.querySelector("[data-reframe-ai-attachments]");
  const aiAttachmentImg = root.querySelector("[data-reframe-ai-attachment-img]");
  const aiAttachmentName = root.querySelector("[data-reframe-ai-attachment-name]");
  const aiAttachmentClear = root.querySelector("[data-reframe-ai-attachment-clear]");
  const aiStatus = root.querySelector("[data-reframe-ai-status]");
  const aiAccept = root.querySelector("[data-reframe-ai-accept]");
  const aiRefine = root.querySelector("[data-reframe-ai-refine]");
  const aiCompare = root.querySelector("[data-reframe-ai-compare]");
  const aiReject = root.querySelector("[data-reframe-ai-reject]");
  const aiDismiss = root.querySelector("[data-reframe-ai-dismiss]");
  const aiStop = root.querySelector("[data-reframe-ai-stop]");
  const referenceDialog = root.querySelector("[data-reframe-reference-dialog]");
  const referenceClose = root.querySelector("[data-reframe-reference-close]");
  const referenceForm = root.querySelector("[data-reframe-reference-form]");
  const referenceKind = root.querySelector("[data-reframe-reference-kind]");
  const referenceKindPicker = root.querySelector("[data-reframe-reference-kind-picker]");
  const referenceKindTrigger = root.querySelector("[data-reframe-reference-kind-trigger]");
  const referenceKindMenu = root.querySelector("[data-reframe-reference-kind-menu]");
  const referenceKindLabel = root.querySelector("[data-reframe-reference-kind-label]");
  const referenceFile = root.querySelector("[data-reframe-reference-file]");
  const referenceDnaId = root.querySelector("[data-reframe-reference-dna-id]");
  const referenceDnaVersion = root.querySelector("[data-reframe-reference-dna-version]");
  const referenceProvenance = root.querySelector("[data-reframe-reference-provenance]");
  const referencePersist = root.querySelector("[data-reframe-reference-persist]");
  const referenceChoices = root.querySelector("[data-reframe-reference-choices]");
  const referenceBrand = root.querySelector("[data-reframe-reference-brand]");
  const referenceBrandPicker = root.querySelector("[data-reframe-reference-brand-picker]");
  const referenceBrandTrigger = root.querySelector("[data-reframe-reference-brand-trigger]");
  const referenceBrandMenu = root.querySelector("[data-reframe-reference-brand-menu]");
  const referenceBrandLabel = root.querySelector("[data-reframe-reference-brand-label]");
  const referencePlacement = root.querySelector("[data-reframe-reference-placement]");
  const referenceUnknown = root.querySelector("[data-reframe-reference-unknown]");
  const referenceUnknownTarget = root.querySelector("[data-reframe-reference-unknown-target]");
  const referenceFreeze = root.querySelector("[data-reframe-reference-freeze]");
  const referenceStatus = root.querySelector("[data-reframe-reference-status]");
  const referencePlan = root.querySelector("[data-reframe-reference-plan]");
  const referenceDropzone = root.querySelector("[data-reframe-reference-dropzone]");
  const referenceChoose = root.querySelector("[data-reframe-reference-choose]");
  const referenceClearFile = root.querySelector("[data-reframe-reference-clear-file]");
  const referencePreview = root.querySelector("[data-reframe-reference-preview]");
  const referencePreviewImg = root.querySelector("[data-reframe-reference-preview-img]");
  const referencePreviewName = root.querySelector("[data-reframe-reference-preview-name]");
  const referenceDropzoneText = root.querySelector("[data-reframe-reference-dropzone-text]");
  const referenceDropzoneEmpty = root.querySelector("[data-reframe-reference-dropzone-empty]");
  const referenceSourcePanel = root.querySelector("[data-reframe-reference-source-panel]");
  const historyButton = historyMenuButton;
  const contextBar = root.querySelector("[data-reframe-context]");
  const formatDivider = root.querySelector("[data-reframe-format-divider]");
  const moreMenuEl = root.querySelector("[data-reframe-more-menu]");
  const contextMoreMenuEl = root.querySelector("[data-reframe-context-more-menu]");
  const formatPanel = root.querySelector("[data-reframe-format-panel]");
  const layoutPanel = root.querySelector("[data-reframe-layout-panel]");
  const layoutWidth = root.querySelector("[data-reframe-layout-width]");
  const layoutHeight = root.querySelector("[data-reframe-layout-height]");
  const layoutX = root.querySelector("[data-reframe-layout-x]");
  const layoutY = root.querySelector("[data-reframe-layout-y]");
  const layoutRadius = root.querySelector("[data-reframe-layout-radius]");
  const designFill = document.createElement("input");
  designFill.type = "color";
  designFill.className = "panel-input format-color";
  designFill.dataset.reframeDesignFill = "";
  designFill.setAttribute("aria-label", "Fill color");
  const designFillHex = document.createElement("input");
  designFillHex.type = "text";
  designFillHex.className = "panel-input design-hex-input";
  designFillHex.dataset.reframeDesignFillHex = "";
  designFillHex.setAttribute("aria-label", "Fill hex");
  designFillHex.maxLength = 7;
  designFillHex.spellcheck = false;
  const designOpacity = document.createElement("input");
  designOpacity.type = "number";
  designOpacity.min = "0";
  designOpacity.max = "100";
  designOpacity.className = "panel-input layout-input";
  designOpacity.dataset.reframeDesignOpacity = "";
  designOpacity.setAttribute("aria-label", "Opacity percent");
  const designBorderWidth = document.createElement("input");
  designBorderWidth.type = "number";
  designBorderWidth.min = "0";
  designBorderWidth.max = "32";
  designBorderWidth.className = "panel-input layout-input";
  designBorderWidth.dataset.reframeDesignBorderWidth = "";
  designBorderWidth.setAttribute("aria-label", "Border width px");
  const designBorderColor = document.createElement("input");
  designBorderColor.type = "color";
  designBorderColor.className = "panel-input format-color";
  designBorderColor.dataset.reframeDesignBorderColor = "";
  designBorderColor.setAttribute("aria-label", "Border color");
  const designFontSize = document.createElement("input");
  designFontSize.type = "number";
  designFontSize.min = "8";
  designFontSize.max = "96";
  designFontSize.className = "panel-input layout-input";
  designFontSize.dataset.reframeDesignFontSize = "";
  designFontSize.setAttribute("aria-label", "Font size px");
  const designLineHeight = document.createElement("input");
  designLineHeight.type = "number";
  designLineHeight.min = "0.5";
  designLineHeight.max = "3";
  designLineHeight.step = "0.05";
  designLineHeight.className = "panel-input layout-input";
  designLineHeight.dataset.reframeDesignLineHeight = "";
  designLineHeight.setAttribute("aria-label", "Line height");
  const designLetterSpacing = document.createElement("input");
  designLetterSpacing.type = "number";
  designLetterSpacing.min = "-5";
  designLetterSpacing.max = "20";
  designLetterSpacing.step = "0.1";
  designLetterSpacing.className = "panel-input layout-input";
  designLetterSpacing.dataset.reframeDesignLetterSpacing = "";
  designLetterSpacing.setAttribute("aria-label", "Letter spacing px");
  const designShadowX = document.createElement("input");
  designShadowX.type = "number";
  designShadowX.className = "panel-input layout-input";
  designShadowX.dataset.reframeDesignShadowX = "";
  designShadowX.setAttribute("aria-label", "Shadow X");
  const designShadowY = document.createElement("input");
  designShadowY.type = "number";
  designShadowY.className = "panel-input layout-input";
  designShadowY.dataset.reframeDesignShadowY = "";
  designShadowY.setAttribute("aria-label", "Shadow Y");
  const designShadowBlur = document.createElement("input");
  designShadowBlur.type = "number";
  designShadowBlur.min = "0";
  designShadowBlur.className = "panel-input layout-input";
  designShadowBlur.dataset.reframeDesignShadowBlur = "";
  designShadowBlur.setAttribute("aria-label", "Shadow blur");
  const designShadowColor = document.createElement("input");
  designShadowColor.type = "color";
  designShadowColor.className = "panel-input format-color";
  designShadowColor.dataset.reframeDesignShadowColor = "";
  designShadowColor.setAttribute("aria-label", "Shadow color");
  const designTranslateX = document.createElement("input");
  designTranslateX.type = "number";
  designTranslateX.className = "panel-input layout-input";
  designTranslateX.dataset.reframeDesignTranslateX = "";
  designTranslateX.setAttribute("aria-label", "Translate X");
  const designTranslateY = document.createElement("input");
  designTranslateY.type = "number";
  designTranslateY.className = "panel-input layout-input";
  designTranslateY.dataset.reframeDesignTranslateY = "";
  designTranslateY.setAttribute("aria-label", "Translate Y");
  let openDesignPickerMenu;
  const closeDesignPickers = () => { if (!openDesignPickerMenu) return; openDesignPickerMenu.menu.hidden = true; openDesignPickerMenu.trigger?.setAttribute("aria-expanded", "false"); openDesignPickerMenu = undefined; };
  const designPickerLabel = (options, value) => options.find(([entry]) => entry === value)?.[1] || options.find(([entry]) => entry === "")?.[1] || value || "Default";
  const setDesignPicker = (input, menu, labelEl, value, options) => { if (!input) return; input.value = value; if (labelEl) labelEl.textContent = designPickerLabel(options, value); if (menu) for (const item of menu.querySelectorAll(".ai-chat-option")) item.setAttribute("aria-selected", item.dataset.reframePickerValue === value ? "true" : "false"); };
  const createDesignSelect = (options, aria) => {
    const wrap = document.createElement("div");
    wrap.className = "ai-chat-picker design-picker";
    const input = document.createElement("input");
    input.type = "hidden";
    input.setAttribute("aria-label", aria);
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "ai-chat-trigger design-picker-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const labelEl = document.createElement("span");
    labelEl.className = "ai-chat-trigger-label";
    const chevron = document.createElement("span");
    chevron.className = "ai-chat-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▾";
    trigger.append(labelEl, chevron);
    const menu = document.createElement("ul");
    menu.className = "ai-chat-menu design-picker-menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", aria);
    for (const [value, text] of options) {
      const item = document.createElement("li");
      item.className = "ai-chat-option";
      item.setAttribute("role", "option");
      item.dataset.reframePickerValue = value;
      item.textContent = text;
      menu.append(item);
    }
    setDesignPicker(input, menu, labelEl, options[0]?.[0] ?? "", options);
    wrap.append(input, trigger, menu);
    input._designPicker = { wrap, trigger, menu, labelEl, options };
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = menu.hidden;
      closeDesignPickers();
      closeReferencePickers?.();
      closeCodexChatMenu?.();
      menu.hidden = !next;
      trigger.setAttribute("aria-expanded", next ? "true" : "false");
      openDesignPickerMenu = next ? { menu, trigger } : undefined;
    });
    menu.addEventListener("click", (event) => {
      const option = event.target?.closest?.(".ai-chat-option");
      if (!option) return;
      setDesignPicker(input, menu, labelEl, option.dataset.reframePickerValue ?? "", options);
      input.dispatchEvent(new Event("change", { bubbles: true }));
      closeDesignPickers();
    });
    return input;
  };
  const UNIT_OPTIONS = ["px", "%", "rem", "auto"];
  const setDesignUnitPicker = (input, menu, labelEl, value) => { if (!input) return; input.value = value; if (labelEl) labelEl.textContent = value; if (menu) for (const item of menu.querySelectorAll(".design-unit-option")) item.setAttribute("aria-selected", item.dataset.reframePickerValue === value ? "true" : "false"); };
  const createDesignUnitPicker = (aria) => {
    const wrap = document.createElement("div");
    wrap.className = "design-unit-picker ai-chat-picker";
    const input = document.createElement("input");
    input.type = "hidden";
    input.value = "px";
    input.setAttribute("aria-label", aria);
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "design-unit-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const labelEl = document.createElement("span");
    labelEl.textContent = "px";
    trigger.append(labelEl);
    const menu = document.createElement("ul");
    menu.className = "ai-chat-menu design-unit-menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    for (const value of UNIT_OPTIONS) {
      const item = document.createElement("li");
      item.className = "ai-chat-option design-unit-option";
      item.setAttribute("role", "option");
      item.dataset.reframePickerValue = value;
      item.textContent = value;
      menu.append(item);
    }
    wrap.append(input, trigger, menu);
    input._designUnitPicker = { wrap, trigger, menu, labelEl };
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = menu.hidden;
      closeDesignPickers();
      closeReferencePickers?.();
      closeCodexChatMenu?.();
      menu.hidden = !next;
      trigger.setAttribute("aria-expanded", next ? "true" : "false");
      openDesignPickerMenu = next ? { menu, trigger } : undefined;
    });
    menu.addEventListener("click", (event) => {
      const option = event.target?.closest?.(".design-unit-option");
      if (!option) return;
      setDesignUnitPicker(input, menu, labelEl, option.dataset.reframePickerValue ?? "px");
      input.dispatchEvent(new Event("change", { bubbles: true }));
      closeDesignPickers();
    });
    return input;
  };
  const designUnit = (aria) => { const wrap = document.createElement("span"); wrap.className = "design-unit"; const input = document.createElement("input"); input.type = "number"; input.className = "panel-input layout-input design-unit-input"; input.setAttribute("aria-label", aria); const unit = createDesignUnitPicker(aria + " unit"); wrap.append(input, unit._designUnitPicker.wrap); return { wrap, input, unit, property: "" }; };
  const designDisplay = createDesignSelect([["", "Default"], ["block", "Block"], ["flex", "Flex"], ["grid", "Grid"], ["inline", "Inline"], ["inline-block", "Inline block"], ["none", "Hidden"]], "Display");
  designDisplay.dataset.reframeDesignDisplay = "";
  const designFlexDirection = createDesignSelect([["", "Default"], ["row", "Row"], ["column", "Column"], ["row-reverse", "Row rev"], ["column-reverse", "Col rev"]], "Stack direction");
  designFlexDirection.dataset.reframeDesignFlexDirection = "";
  const createAlignButtonGroup = (aria, datasetAttr, options) => {
    const wrap = document.createElement("div");
    wrap.className = "design-icon-group";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", aria);
    const input = document.createElement("input");
    input.type = "hidden";
    input.setAttribute("aria-label", aria);
    input.dataset[datasetAttr] = "";
    const buttons = [];
    for (const [value, tip, mark] of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "button design-icon-btn";
      btn.dataset.reframeAlignValue = value;
      btn.setAttribute("aria-label", tip);
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = mark;
      btn.addEventListener("click", () => {
        for (const b of buttons) b.setAttribute("aria-pressed", "false");
        btn.setAttribute("aria-pressed", "true");
        input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      buttons.push(btn);
      wrap.append(btn);
    }
    wrap.prepend(input);
    input._alignSync = (value) => {
      const normalized = value || "";
      input.value = normalized;
      for (const btn of buttons) btn.setAttribute("aria-pressed", String(btn.dataset.reframeAlignValue === normalized));
    };
    input._alignWrap = wrap;
    return input;
  };
  const designJustify = createAlignButtonGroup("Horizontal alignment", "reframeDesignJustify", [["flex-start", "Align start", "⬅"], ["center", "Align center", "⬌"], ["flex-end", "Align end", "➡"]]);
  const designAlign = createAlignButtonGroup("Vertical alignment", "reframeDesignAlign", [["flex-start", "Align start", "⬆"], ["center", "Align center", "▬"], ["flex-end", "Align end", "⬇"]]);
  const designGap = designUnit("Gap"); designGap.property = "gap"; designGap.input.dataset.reframeDesignGap = "";
  const designPadT = designUnit("Padding top"); designPadT.property = "padding-top"; designPadT.input.dataset.reframeDesignPadT = "";
  const designPadR = designUnit("Padding right"); designPadR.property = "padding-right"; designPadR.input.dataset.reframeDesignPadR = "";
  const designPadB = designUnit("Padding bottom"); designPadB.property = "padding-bottom"; designPadB.input.dataset.reframeDesignPadB = "";
  const designPadL = designUnit("Padding left"); designPadL.property = "padding-left"; designPadL.input.dataset.reframeDesignPadL = "";
  const designMarT = designUnit("Margin top"); designMarT.property = "margin-top"; designMarT.input.dataset.reframeDesignMarT = "";
  const designMarR = designUnit("Margin right"); designMarR.property = "margin-right"; designMarR.input.dataset.reframeDesignMarR = "";
  const designMarB = designUnit("Margin bottom"); designMarB.property = "margin-bottom"; designMarB.input.dataset.reframeDesignMarB = "";
  const designMarL = designUnit("Margin left"); designMarL.property = "margin-left"; designMarL.input.dataset.reframeDesignMarL = "";
  const designPosition = createDesignSelect([["", "Default"], ["static", "Normal flow"], ["relative", "Relative"], ["absolute", "Absolute"], ["fixed", "Fixed to screen"], ["sticky", "Sticky"]], "Position");
  designPosition.dataset.reframeDesignPosition = "";
  const designTop = designUnit("Top"); designTop.property = "top"; designTop.input.dataset.reframeDesignTop = "";
  const designRight = designUnit("Right"); designRight.property = "right"; designRight.input.dataset.reframeDesignRight = "";
  const designBottom = designUnit("Bottom"); designBottom.property = "bottom"; designBottom.input.dataset.reframeDesignBottom = "";
  const designLeft = designUnit("Left"); designLeft.property = "left"; designLeft.input.dataset.reframeDesignLeft = "";
  const designZ = document.createElement("input"); designZ.type = "number"; designZ.className = "panel-input layout-input"; designZ.dataset.reframeDesignZ = ""; designZ.setAttribute("aria-label", "Z-index");
  const designOverflow = createDesignSelect([["", "Default"], ["visible", "Visible"], ["hidden", "Hidden"], ["auto", "Auto scroll"], ["scroll", "Always scroll"]], "Overflow");
  designOverflow.dataset.reframeDesignOverflow = "";
  const designTextTransform = createDesignSelect([["", "Default"], ["none", "Normal"], ["uppercase", "ALL CAPS"], ["lowercase", "all lowercase"], ["capitalize", "Capitalize Words"]], "Text transform");
  designTextTransform.dataset.reframeDesignTextTransform = "";
  const designTextDecoration = createDesignSelect([["", "Default"], ["none", "None"], ["underline", "Underline"], ["line-through", "Strikethrough"], ["overline", "Overline"]], "Text decoration");
  designTextDecoration.dataset.reframeDesignTextDecoration = "";
  const designBgImage = document.createElement("input"); designBgImage.type = "text"; designBgImage.className = "panel-input"; designBgImage.placeholder = "url(...) or none"; designBgImage.dataset.reframeDesignBgImage = ""; designBgImage.setAttribute("aria-label", "Background image URL");
  const designOutline = document.createElement("input"); designOutline.type = "text"; designOutline.className = "panel-input"; designOutline.placeholder = "e.g. 2px solid #fff"; designOutline.dataset.reframeDesignOutline = ""; designOutline.setAttribute("aria-label", "Outline");
  const designMinW = designUnit("Min width"); designMinW.property = "min-width"; designMinW.input.dataset.reframeDesignMinW = "";
  const designMaxW = designUnit("Max width"); designMaxW.property = "max-width"; designMaxW.input.dataset.reframeDesignMaxW = "";
  const designMinH = designUnit("Min height"); designMinH.property = "min-height"; designMinH.input.dataset.reframeDesignMinH = "";
  const designMaxH = designUnit("Max height"); designMaxH.property = "max-height"; designMaxH.input.dataset.reframeDesignMaxH = "";
  const designBlur = document.createElement("input"); designBlur.type = "number"; designBlur.min = "0"; designBlur.max = "64"; designBlur.className = "panel-input layout-input"; designBlur.dataset.reframeDesignBlur = ""; designBlur.setAttribute("aria-label", "Blur px");
  const designUnits = [designGap, designPadT, designPadR, designPadB, designPadL, designMarT, designMarR, designMarB, designMarL, designTop, designRight, designBottom, designLeft, designMinW, designMaxW, designMinH, designMaxH];
  const parseStyleValue = (value) => { const raw = String(value || "").trim(); if (!raw || raw === "auto" || raw === "none" || raw === "normal") return { num: "", unit: raw || "auto" }; const match = raw.match(/^(-?\d*\.?\d+)(px|%|rem|em|vh|vw)?$/); if (!match) return { num: "", unit: "px" }; return { num: match[1], unit: match[2] || "px" }; };
  const styleValueFromUnit = (input, unitSelect) => { const num = String(input.value || "").trim(); const unit = unitSelect.value || "px"; if (!num) return unit === "auto" ? "auto" : ""; if (unit === "auto") return "auto"; return num + unit; };
  const syncUnitField = (field, styles, computed, property) => { const parsed = parseStyleValue(styles[property] || computed.getPropertyValue(property)); field.input.value = parsed.num; setDesignUnitPicker(field.unit, field.unit._designUnitPicker?.menu, field.unit._designUnitPicker?.labelEl, ["px", "%", "rem", "auto"].includes(parsed.unit) ? parsed.unit : "px"); };
  const designControlNode = (control) => control?._alignWrap || control?._designPicker?.wrap || control?.wrap || control;
  const designField = (label, control) => { const field = document.createElement("label"); field.className = "design-field"; const labelEl = document.createElement("span"); labelEl.className = "design-field-label"; labelEl.textContent = label; field.append(labelEl, designControlNode(control)); return field; };
  const designSectionHint = (text) => { const hint = document.createElement("p"); hint.className = "design-section-hint"; hint.textContent = text; return hint; };
  const chevronDownSvg = () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const designSection = (title, hint, open = false) => {
    const section = document.createElement("details");
    section.className = "design-section";
    if (open) section.open = true;
    const summary = document.createElement("summary");
    const titleEl = document.createElement("span");
    titleEl.className = "design-section-title";
    titleEl.textContent = title;
    const toggle = document.createElement("span");
    toggle.className = "layers-toggle" + (open ? " expanded" : "");
    toggle.setAttribute("aria-hidden", "true");
    toggle.innerHTML = chevronDownSvg();
    summary.append(titleEl, toggle);
    section.addEventListener("toggle", () => { toggle.classList.toggle("expanded", section.open); });
    section.append(summary);
    const body = document.createElement("div");
    body.className = "design-section-body";
    if (hint) body.append(designSectionHint(hint));
    section.append(body);
    return { section, body };
  };
  const designCompactRow = (...nodes) => { const row = document.createElement("div"); row.className = "design-compact-row"; for (const node of nodes) if (node) row.append(node); return row; };
  const layoutFieldFrom = (selector) => layoutPanel?.querySelector(selector)?.closest(".layout-field") || null;
  let designPadSides, designMarSides, designPadLink, designMarLink, designPadUniform, designMarUniform, designFlexControls, designEssentialText, typeSection, positionSection, layoutSection, appearanceSection, fillSection, strokeSection;
  const setupLayoutLabels = () => {
    if (!layoutPanel) return;
    layoutPanel.className = "layout-panel design-layout-xywh";
    const relabel = (selector, label, aria) => {
      const input = layoutPanel.querySelector(selector);
      const field = input?.closest(".layout-field");
      if (!field || !input) return input;
      field.replaceChildren();
      const labelEl = document.createElement("span");
      labelEl.className = "design-field-label";
      labelEl.textContent = label;
      field.append(labelEl, input);
      if (aria) input.setAttribute("aria-label", aria);
      return input;
    };
    relabel("[data-reframe-layout-x]", "X", "Horizontal position (px)");
    relabel("[data-reframe-layout-y]", "Y", "Vertical position (px)");
    relabel("[data-reframe-layout-width]", "W", "Width (px)");
    relabel("[data-reframe-layout-height]", "H", "Height (px)");
  };
  const createSpacingBlock = (title, uniformAria, sides) => {
    const block = document.createElement("div");
    block.className = "design-spacing-block";
    const head = document.createElement("div");
    head.className = "design-spacing-head";
    const headTitle = document.createElement("span");
    headTitle.className = "design-spacing-title";
    headTitle.textContent = title;
    const linkBtn = document.createElement("button");
    linkBtn.type = "button";
    linkBtn.className = "design-spacing-link button";
    linkBtn.setAttribute("aria-pressed", "true");
    linkBtn.setAttribute("aria-label", "Link all sides");
    linkBtn.title = "Link all sides";
    linkBtn.textContent = "⛓";
    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "layers-toggle button";
    expandBtn.setAttribute("aria-label", "Edit per side");
    expandBtn.title = "Per side";
    expandBtn.innerHTML = chevronDownSvg();
    const actions = document.createElement("div");
    actions.className = "design-spacing-actions";
    actions.append(linkBtn, expandBtn);
    head.append(headTitle, actions);
    const uniform = designUnit(uniformAria);
    const uniformRow = document.createElement("div");
    uniformRow.className = "design-spacing-uniform";
    uniformRow.append(uniform.wrap);
    const sidesWrap = document.createElement("div");
    sidesWrap.className = "design-spacing-sides design-grid-4";
    sidesWrap.hidden = true;
    const sideLabels = ["T", "R", "B", "L"];
    for (let i = 0; i < sides.length; i++) sidesWrap.append(designField(sideLabels[i], sides[i].wrap));
    const applyUniform = () => {
      const val = styleValueFromUnit(uniform.input, uniform.unit);
      const parsed = parseStyleValue(val);
      for (const side of sides) {
        side.input.value = parsed.num;
        setDesignUnitPicker(side.unit, side.unit._designUnitPicker?.menu, side.unit._designUnitPicker?.labelEl, ["px", "%", "rem", "auto"].includes(parsed.unit) ? parsed.unit : "px");
        if (active) setPreviewStyle(side.property, val);
      }
    };
    linkBtn.addEventListener("click", () => {
      const linked = linkBtn.getAttribute("aria-pressed") === "true";
      if (linked) { linkBtn.setAttribute("aria-pressed", "false"); linkBtn.title = "Unlink sides"; applyUniform(); }
      else { linkBtn.setAttribute("aria-pressed", "true"); linkBtn.title = "Link all sides"; sidesWrap.hidden = true; applyUniform(); }
    });
    expandBtn.addEventListener("click", () => { sidesWrap.hidden = !sidesWrap.hidden; expandBtn.classList.toggle("expanded", !sidesWrap.hidden); });
    uniform.input.addEventListener("change", () => { if (linkBtn.getAttribute("aria-pressed") === "true") applyUniform(); });
    uniform.unit.addEventListener("change", () => { if (linkBtn.getAttribute("aria-pressed") === "true") applyUniform(); });
    block.append(head, uniformRow, sidesWrap);
    return { block, uniform, sidesWrap, linkBtn };
  };
  const syncSpacingUniform = (fields, uniform, sidesEl, linkBtn) => {
    const parsed = fields.map((field) => parseStyleValue(styleValueFromUnit(field.input, field.unit)));
    const allSame = parsed.length > 0 && parsed.every((entry) => entry.num === parsed[0].num && entry.unit === parsed[0].unit);
    if (allSame) {
      uniform.input.value = parsed[0].num;
      setDesignUnitPicker(uniform.unit, uniform.unit._designUnitPicker?.menu, uniform.unit._designUnitPicker?.labelEl, ["px", "%", "rem", "auto"].includes(parsed[0].unit) ? parsed[0].unit : "px");
      if (sidesEl) sidesEl.hidden = true;
      if (linkBtn) { linkBtn.setAttribute("aria-pressed", "true"); linkBtn.title = "Link all sides"; }
    } else {
      if (sidesEl) sidesEl.hidden = false;
      if (linkBtn) { linkBtn.setAttribute("aria-pressed", "false"); linkBtn.title = "Unlink sides"; }
    }
  };
  const alignElementInParent = (horizontal, vertical) => {
    if (!active) return;
    const parent = active.element.offsetParent instanceof HTMLElement ? active.element.offsetParent : document.body;
    const parentRect = parent.getBoundingClientRect();
    const rect = active.element.getBoundingClientRect();
    const tx = active.previewTranslate?.x || 0;
    const ty = active.previewTranslate?.y || 0;
    const baseLeft = rect.left - tx;
    const baseTop = rect.top - ty;
    let targetLeft = baseLeft;
    let targetTop = baseTop;
    if (horizontal === "left") targetLeft = parentRect.left;
    else if (horizontal === "center") targetLeft = parentRect.left + (parentRect.width - rect.width) / 2;
    else if (horizontal === "right") targetLeft = parentRect.right - rect.width;
    if (vertical === "top") targetTop = parentRect.top;
    else if (vertical === "center") targetTop = parentRect.top + (parentRect.height - rect.height) / 2;
    else if (vertical === "bottom") targetTop = parentRect.bottom - rect.height;
    active.previewTranslate = { x: (active.previewTranslate?.x || 0) + (targetLeft - baseLeft), y: (active.previewTranslate?.y || 0) + (targetTop - baseTop) };
    applyPreviewTransform(active);
    syncTranslateToPreviewStyles();
    cacheDraft();
    scheduleAutosave();
    queueMapping();
    updateApplyState();
    scheduleGeometry();
    pushEditHistory();
  };
  const createPositionAlignRow = () => {
    const wrap = document.createElement("div");
    wrap.className = "design-position-align";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Align in parent");
    const specs = [
      ["left", "Align left", "⬅", () => alignElementInParent("left", null)],
      ["h-center", "Align horizontal center", "⬌", () => alignElementInParent("center", null)],
      ["right", "Align right", "➡", () => alignElementInParent("right", null)],
      ["top", "Align top", "⬆", () => alignElementInParent(null, "top")],
      ["v-center", "Align vertical center", "▬", () => alignElementInParent(null, "center")],
      ["bottom", "Align bottom", "⬇", () => alignElementInParent(null, "bottom")],
    ];
    for (const [, tip, mark, action] of specs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "button design-align-btn";
      btn.setAttribute("aria-label", tip);
      btn.title = tip;
      btn.textContent = mark;
      btn.addEventListener("click", action);
      wrap.append(btn);
    }
    return wrap;
  };
  const initDesignPanel = () => {
    if (!panel || panel.dataset.reframeDesignInit) return;
    panel.dataset.reframeDesignInit = "1";
    setupLayoutLabels();
    const xyGrid = document.createElement("div");
    xyGrid.className = "design-grid-2";
    const xField = layoutFieldFrom("[data-reframe-layout-x]");
    const yField = layoutFieldFrom("[data-reframe-layout-y]");
    if (xField) xyGrid.append(xField);
    if (yField) xyGrid.append(yField);
    const whGrid = document.createElement("div");
    whGrid.className = "design-wh-row";
    const wField = layoutFieldFrom("[data-reframe-layout-width]");
    const hField = layoutFieldFrom("[data-reframe-layout-height]");
    if (wField) whGrid.append(wField);
    if (hField) whGrid.append(hField);
    const positionResult = designSection("Position", null, true);
    positionSection = positionResult.section;
    positionResult.body.append(createPositionAlignRow(), xyGrid);
    const layoutResult = designSection("Layout", null, true);
    layoutSection = layoutResult.section;
    const layoutBody = layoutResult.body;
    layoutBody.append(whGrid, designField("Display", designDisplay));
    designFlexControls = document.createElement("div");
    designFlexControls.className = "design-flex-controls";
    designFlexControls.dataset.reframeDesignFlexControls = "";
    designFlexControls.hidden = true;
    designFlexControls.append(designField("Direction", designFlexDirection), designField("Justify", designJustify._alignWrap), designField("Align", designAlign._alignWrap), designField("Gap", designGap.wrap));
    layoutBody.append(designFlexControls);
    const padBlock = createSpacingBlock("Padding", "Padding all sides", [designPadT, designPadR, designPadB, designPadL]);
    designPadUniform = padBlock.uniform;
    designPadSides = padBlock.sidesWrap;
    designPadLink = padBlock.linkBtn;
    layoutBody.append(padBlock.block);
    const marBlock = createSpacingBlock("Margin", "Margin all sides", [designMarT, designMarR, designMarB, designMarL]);
    designMarUniform = marBlock.uniform;
    designMarSides = marBlock.sidesWrap;
    designMarLink = marBlock.linkBtn;
    layoutBody.append(marBlock.block);
    const offsetWrap = document.createElement("div");
    offsetWrap.className = "design-subsection";
    const offsetLabel = document.createElement("span");
    offsetLabel.className = "design-subsection-label";
    offsetLabel.textContent = "Offsets";
    const offsetGrid = document.createElement("div");
    offsetGrid.className = "design-grid-4";
    offsetGrid.append(designField("Top", designTop.wrap), designField("Right", designRight.wrap), designField("Bottom", designBottom.wrap), designField("Left", designLeft.wrap));
    offsetWrap.append(offsetLabel, offsetGrid);
    const sizeGrid = document.createElement("div");
    sizeGrid.className = "design-grid-2";
    sizeGrid.append(designField("Min W", designMinW.wrap), designField("Max W", designMaxW.wrap), designField("Min H", designMinH.wrap), designField("Max H", designMaxH.wrap));
    layoutBody.append(designField("Position", designPosition), offsetWrap, designField("Z-index", designZ), designField("Overflow", designOverflow), sizeGrid);
    const appearanceResult = designSection("Appearance", null, true);
    appearanceSection = appearanceResult.section;
    if (layoutRadius) appearanceResult.body.append(designCompactRow(designField("Opacity", designOpacity), designField("Radius", layoutRadius)));
    else appearanceResult.body.append(designField("Opacity", designOpacity));
    const fillResult = designSection("Fill", null, true);
    fillSection = fillResult.section;
    const fillRow = document.createElement("div");
    fillRow.className = "design-fill-row";
    designFill.classList.add("design-fill-swatch");
    fillRow.append(designFill, designFillHex);
    fillResult.body.append(fillRow);
    const typeResult = designSection("Typography", null, false);
    typeSection = typeResult.section;
    const typeBody = typeResult.body;
    if (formatPanel) {
      formatPanel.hidden = false;
      formatPanel.classList.add("design-format-panel");
      const oldFont = formatPanel.querySelector("[data-reframe-format-font]");
      if (oldFont?.tagName === "SELECT") {
        const fontPicker = createDesignSelect([["inherit", "Default font"], ["Arial, sans-serif", "Arial"], ["Georgia, serif", "Georgia"], ["system-ui, sans-serif", "System"], ["monospace", "Monospace"]], "Font family");
        fontPicker.dataset.reframeFormatFont = "";
        oldFont.replaceWith(designField("Font", fontPicker));
      }
      for (const advanced of formatPanel.querySelectorAll(".format-advanced")) advanced.hidden = false;
      const fontField = formatPanel.querySelector(".design-field");
      if (fontField) typeBody.append(fontField);
      const weightSizeRow = document.createElement("div");
      weightSizeRow.className = "design-compact-row design-type-weight-size";
      const typeBold = formatPanel.querySelector("[data-reframe-format-bold]");
      if (typeBold) weightSizeRow.append(typeBold);
      weightSizeRow.append(designField("Size", designFontSize));
      typeBody.append(weightSizeRow);
      const styleRow = document.createElement("div");
      styleRow.className = "design-type-style-row";
      for (const selector of ["[data-reframe-format-italic]", "[data-reframe-format-underline]", "[data-reframe-format-align-left]", "[data-reframe-format-align-center]", "[data-reframe-format-align-right]", "[data-reframe-format-color]", "[data-reframe-format-smaller]", "[data-reframe-format-larger]"]) {
        const btn = formatPanel.querySelector(selector);
        if (btn) styleRow.append(btn);
      }
      typeBody.append(styleRow, designCompactRow(designField("Line height", designLineHeight), designField("Letter spacing", designLetterSpacing)), designField("Transform", designTextTransform), designField("Decoration", designTextDecoration));
      formatPanel.hidden = true;
    } else {
      typeBody.append(designField("Size", designFontSize), designField("Line height", designLineHeight), designField("Letter spacing", designLetterSpacing), designField("Transform", designTextTransform), designField("Decoration", designTextDecoration));
    }
    if (textInput) { designEssentialText = designField("Text", textInput); designEssentialText.classList.add("design-essential-text"); typeBody.append(designEssentialText); }
    const strokeResult = designSection("Stroke", null, false);
    strokeSection = strokeResult.section;
    strokeResult.body.append(designCompactRow(designField("Width", designBorderWidth), designField("Color", designBorderColor)));
    const { section: effectsSection, body: effectsBody } = designSection("Effects", null, false);
    effectsBody.append(designField("Shadow X", designShadowX), designField("Shadow Y", designShadowY), designCompactRow(designField("Blur", designShadowBlur), designField("Color", designShadowColor)), designField("Filter blur", designBlur), designCompactRow(designField("Move X", designTranslateX), designField("Move Y", designTranslateY)), designField("Bg image", designBgImage), designField("Outline", designOutline));
    const actions = panel.querySelector(".panel-actions-divider")?.parentElement;
    const metrics = panel.querySelector("[data-reframe-metrics]");
    const mapping = panel.querySelector("[data-reframe-mapping]");
    const hint = panel.querySelector("[data-reframe-panel-hint]");
    const impactBtn = panel.querySelector("[data-reframe-impact]");
    const overlapBtn = panel.querySelector("[data-reframe-overlap]");
    const temporary = panel.querySelector("[data-reframe-temporary]");
    const actionBar = document.createElement("div");
    actionBar.className = "design-action-bar";
    for (const node of [metrics, mapping, hint, impactBtn, overlapBtn, temporary].filter(Boolean)) actionBar.append(node);
    panel.replaceChildren(positionSection, layoutSection, appearanceSection, fillSection, typeSection, strokeSection, effectsSection, actionBar);
    if (formatDivider) formatDivider.remove();
    if (actions && actions !== panel) actions.remove();
    if (layoutPanel) layoutPanel.hidden = true;
  };
  initDesignPanel();
  const formatFont = root.querySelector("[data-reframe-format-font]");
  const formatColor = root.querySelector("[data-reframe-format-color]");
  const formatBold = root.querySelector("[data-reframe-format-bold]");
  const formatItalic = root.querySelector("[data-reframe-format-italic]");
  const formatUnderline = root.querySelector("[data-reframe-format-underline]");
  const formatAlignLeft = root.querySelector("[data-reframe-format-align-left]");
  const formatAlignCenter = root.querySelector("[data-reframe-format-align-center]");
  const formatAlignRight = root.querySelector("[data-reframe-format-align-right]");
  const formatSmaller = root.querySelector("[data-reframe-format-smaller]");
  const formatLarger = root.querySelector("[data-reframe-format-larger]");
  const heatmapLayer = root.querySelector("[data-reframe-heatmap-layer]");
  const annointLayer = root.querySelector("[data-reframe-annoint-layer]");
  const annointSvg = root.querySelector("[data-reframe-annoint-svg]");
  const toolRail = root.querySelector("[data-reframe-tool-rail]");
  const toolButtons = [...root.querySelectorAll("[data-reframe-tool]")];
  const layersPanel = root.querySelector("[data-reframe-layers-panel]");
  const layersTree = root.querySelector("[data-reframe-layers-tree]");
  const layersToggle = root.querySelector("[data-reframe-layers-toggle]");
  const layersCollapse = root.querySelector("[data-reframe-layers-collapse]");
  const layersSearch = root.querySelector("[data-reframe-layers-search]");
  const layersExpandAll = root.querySelector("[data-reframe-layers-expand-all]");
  const layersCollapseAll = root.querySelector("[data-reframe-layers-collapse-all]");
  const layersResize = root.querySelector("[data-reframe-layers-resize]");
  const pasteFigmaButton = root.querySelector("[data-reframe-paste-figma]");
  const designPanel = root.querySelector("[data-reframe-design-panel]");
  const designBody = root.querySelector("[data-reframe-design-body]");
  const designCollapse = root.querySelector("[data-reframe-design-collapse]");
  const designToggle = root.querySelector("[data-reframe-design-toggle]");
  const designTab = root.querySelector("[data-reframe-design-tab]");
  const designElementType = root.querySelector("[data-reframe-design-element-type]");
  const zoomOut = root.querySelector("[data-reframe-zoom-out]");
  const zoomIn = root.querySelector("[data-reframe-zoom-in]");
  const zoomFit = root.querySelector("[data-reframe-zoom-fit]");
  const zoomLabel = root.querySelector("[data-reframe-zoom-label]");
  if (designBody && panel) { designBody.classList.add("design-panel-scroll"); designBody.append(panel); panel.classList.add("in-design-panel"); }
  const lucide = (body) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + "</svg>";
  const ICONS = {
    test: lucide('<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'),
    select: lucide('<path d="m3 3 7.07 17.49 2.51-7.39L21 11.07z"/>'),
    history: lucide('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>'),
    comments: lucide('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6"/><path d="M9 10h6"/>'),
    annotationsVisible: lucide('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
    annotationsHidden: lucide('<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>'),
    reference: lucide('<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/>'),
    generate: lucide('<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>'),
    exit: lucide('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>'),
    apply: lucide('<path d="M20 6 9 17l-5-5"/>'),
    cancel: lucide('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    close: lucide('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    accept: lucide('<path d="M20 6 9 17l-5-5"/>'),
    reject: lucide('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    refine: lucide('<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>'),
    compare: lucide('<rect width="8" height="14" x="3" y="5" rx="1"/><rect width="8" height="10" x="13" y="7" rx="1"/>'),
    stop: lucide('<rect width="10" height="10" x="7" y="7" rx="1"/>'),
    aiReview: lucide('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z"/><path d="m9 14 2 2 4-4"/>'),
    more: lucide('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
    collapse: lucide('<path d="m18 15-6-6-6 6"/>'),
    expand: lucide('<path d="m6 9 6 6 6-6"/>'),
    heatmap: lucide('<path d="M12 2c1 3 2.5 3.5 3.5 4.5S17 10 17 12s-1 3.5-1.5 5.5S13 21 12 22c-1-1-2.5-3.5-3.5-5.5S7 14 7 12s1-3.5 1.5-5.5S11 5 12 2Z"/>'),
    undo: lucide('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>'),
    redo: lucide('<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>'),
    trash: lucide('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>'),
    hand: lucide('<path d="M18 11.5V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1.4"/><path d="M14 10V8a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 9.9V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v5"/><path d="M6 14a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8 2 2 0 1 1 4 0"/>'),
    text: lucide('<path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/>'),
    layers: lucide('<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>'),
    paste: lucide('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
    chevronLeft: lucide('<path d="m15 18-6-6 6-6"/>'),
    chevronRight: lucide('<path d="m9 18 6-6-6-6"/>'),
    design: lucide('<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>'),
    lock: lucide('<rect width="14" height="10" x="5" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    unlock: lucide('<rect width="14" height="10" x="5" y="11" rx="2"/><path d="M12 17v-4"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'),
    eye: lucide('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: lucide('<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>'),
    grip: lucide('<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>'),
  };
  const iconify = (button, name, label) => { if (!button) return; button.classList.add("icon"); if (label) button.setAttribute("aria-label", label); button.innerHTML = ICONS[name] || ""; };
  const commentsBadge = document.createElement("span");
  commentsBadge.className = "badge";
  commentsBadge.hidden = true;
  iconify(testConnection, "test", "Test Connection");
  iconify(historyButton, "history", "Visual history");
  iconify(contextHistoryButton, "history", "Element history");
  iconify(comments, "comments", "Add comment");
  iconify(contextMoreButton, "more", "More actions");
  iconify(generateButton, "generate", "Generate");
  comments?.append(commentsBadge);
  iconify(annotationsToggle, "annotationsVisible", "Hide annotation overlays");
  const moreButton = root.querySelector("[data-reframe-more]");
  iconify(moreButton, "more", "More actions");
  iconify(collapseButton, "collapse", "Collapse toolbar");
  iconify(toolbarLayersButton, "layers", "Layers panel");
  iconify(toolbarDesignButton, "design", "Design panel");
  iconify(reference, "reference", "Reference adaptation");
  iconify(heatmapToggle, "heatmap", "UX heatmap");
  iconify(aiReviewButton, "aiReview", "Review pending AI edit");
  iconify(commentModeToggle, "comments", "Comment mode");
  iconify(commentUndo, "undo", "Undo");
  iconify(commentRedo, "redo", "Redo");
  iconify(editUndo, "undo", "Undo edit");
  iconify(editRedo, "redo", "Redo edit");
  iconify(editDelete, "trash", "Delete or hide selection");
  iconify(exit, "exit", "Exit");
  iconify(apply, "apply", "Save");
  iconify(cancel, "cancel", "Deselect");
  iconify(historyClose, "close", "Close visual history");
  iconify(time, "eye", "Hold to view previous");
  iconify(sourceCompareToggle, "compare", "Compare source");
  iconify(annotationClose, "close", "Close comments");
  iconify(aiAccept, "accept", "Accept");
  iconify(aiRefine, "refine", "Refine");
  iconify(aiCompare, "compare", "Compare");
  iconify(aiReject, "reject", "Reject");
  iconify(aiDismiss, "close", "Dismiss");
  iconify(aiStop, "stop", "Stop");
  iconify(aiClose, "close", "Close generate panel");
  for (const button of toolButtons) iconify(button, button.dataset.reframeTool === "select" ? "select" : button.dataset.reframeTool === "hand" ? "hand" : button.dataset.reframeTool === "comment" ? "comments" : "text", button.getAttribute("aria-label"));
  iconify(layersToggle, "layers", "Toggle layers panel");
  iconify(layersExpandAll, "expand", "Expand all layers");
  iconify(layersCollapseAll, "collapse", "Collapse all layers");
  iconify(layersCollapse, "chevronLeft", "Collapse layers panel");
  iconify(designToggle, "design", "Toggle design panel");
  iconify(designCollapse, "chevronRight", "Collapse design panel");
  iconify(pasteFigmaButton, "paste", "Paste from Figma — Copy as PNG or Copy as CSS");
  if (moreMenuEl) {
    const addMoreItem = (label, action) => { const item = document.createElement("button"); item.type = "button"; item.className = "more-item"; item.textContent = label; item.dataset.reframeMoreAction = action; moreMenuEl.append(item); };
    addMoreItem("Comments", "comments");
    addMoreItem("Annotation overlays", "annotations");
    addMoreItem("Paste from Figma", "paste-figma");
    addMoreItem("UX heatmap", "heatmap");
    if (debugMode) addMoreItem("Test connection", "test");
  }
  if (contextMoreMenuEl) {
    const addContextMoreItem = (label, action) => { const item = document.createElement("button"); item.type = "button"; item.className = "more-item"; item.textContent = label; item.dataset.reframeContextMoreAction = action; contextMoreMenuEl.append(item); };
    addContextMoreItem("Save to source", "apply");
    addContextMoreItem("Deselect", "deselect");
    addContextMoreItem("Reference adaptation", "reference");
  }
  const closeMoreMenu = () => { if (moreMenuEl) moreMenuEl.hidden = true; moreButton?.setAttribute("aria-expanded", "false"); };
  const closeContextMoreMenu = () => { if (contextMoreMenuEl) contextMoreMenuEl.hidden = true; contextMoreButton?.setAttribute("aria-expanded", "false"); };
  const positionMoreMenu = () => {
    if (!moreMenuEl || !moreButton || moreMenuEl.hidden) return;
    const rect = moreButton.getBoundingClientRect();
    const menuWidth = moreMenuEl.offsetWidth || 160;
    const menuHeight = moreMenuEl.offsetHeight || 1;
    const gap = 8;
    let left = rect.right - menuWidth;
    let top = rect.bottom + gap;
    if (top + menuHeight > innerHeight - 12) top = rect.top - menuHeight - gap;
    left = Math.max(12, Math.min(innerWidth - menuWidth - 12, left));
    top = Math.max(12, Math.min(innerHeight - menuHeight - 12, top));
    moreMenuEl.style.left = left + "px";
    moreMenuEl.style.top = top + "px";
  };
  const toggleMoreMenu = () => {
    if (!moreMenuEl || !moreButton) return;
    const next = moreMenuEl.hidden;
    closeContextMoreMenu();
    moreMenuEl.hidden = !next;
    moreButton.setAttribute("aria-expanded", String(next));
    if (next) positionMoreMenu();
  };
  const positionContextMoreMenu = () => {
    if (!contextMoreMenuEl || !contextMoreButton || contextMoreMenuEl.hidden) return;
    const rect = contextMoreButton.getBoundingClientRect();
    const menuWidth = contextMoreMenuEl.offsetWidth || 160;
    const menuHeight = contextMoreMenuEl.offsetHeight || 1;
    const gap = 8;
    let left = rect.right - menuWidth;
    let top = rect.bottom + gap;
    if (top + menuHeight > innerHeight - 12) top = rect.top - menuHeight - gap;
    left = Math.max(12, Math.min(innerWidth - menuWidth - 12, left));
    top = Math.max(12, Math.min(innerHeight - menuHeight - 12, top));
    contextMoreMenuEl.style.left = left + "px";
    contextMoreMenuEl.style.top = top + "px";
  };
  const toggleContextMoreMenu = () => {
    if (!contextMoreMenuEl || !contextMoreButton) return;
    const next = contextMoreMenuEl.hidden;
    closeMoreMenu();
    contextMoreMenuEl.hidden = !next;
    contextMoreButton.setAttribute("aria-expanded", String(next));
    if (next) positionContextMoreMenu();
  };
  if (!debugMode && testConnection) testConnection.hidden = true;
  let state = "connecting";
  let connectionId;
  let socket;
  let reconnectTimer;
  let attempts = 0;
  let disposed = false;
  const pending = new Map();
  let selectMode = false;
  let activeTool = "select";
  let canvasZoom = 1;
  let panDrag;
  let layersPanelVisible = true;
  let designPanelVisible = true;
  if (showcaseMode) {
    layersPanelVisible = false;
    designPanelVisible = false;
  }
  let showcaseUiActive = false;
  let showcaseTarget;
  let layersPanelWidth = 340;
  let layersSearchQuery = "";
  const layersCollapsed = new Set();
  const layerRowElements = new WeakMap();
  let layerDrag;
  let layerDropIndicator;
  let layersTreePending;
  let suppressLayerRowClick;
  let generation = 0;
  let active;
  let applyTimer;
  let autosaveTimer;
  let autosaveMode = false;
  const AUTOSAVE_MS = 2000;
  let codexSessionsLoaded = false;
  let aiChatValue = "";
  let aiChatSelectedLabel = "New local Codex task";
  let hoverTarget;
  let hoverFrame;
  let geometryFrame;
  let layersTreeFrame;
  let chromeMoveFrame;
  let previewFrame;
  let lastPreviewSent = 0;
  let drag;
  let aiReview;
  let referenceDraft;
  let referencePendingFile;
  let referencePreviewUrl;
  let frozenReferencePlanId;
  let aiAttachedImage;
  let aiAttachmentPreviewUrl;
  let historyState = { currentId: null, previousId: null, canRestore: false, visualComplete: false, gitAvailable: false, dirty: false, incomplete: [], checkpoints: [], comparison: null };
  let timeHold;
  let suppressHistoryClick = false;
  let historyFocus;
  let elementHistoryFocus;
  let selectedHistoryId;
  let annotationFocus;
  let annotationFrame;
  let annotationState = { annotations: [], issues: [], parsedFiles: 0, renderedForRoute: 0 };
  let annotationsVisible = true;
  try { annotationsVisible = sessionStorage.getItem("reframe.annotations.visible") !== "false"; } catch { /* ponytail: session preference is optional */ }
  let toolbarCollapsed = false;
  try { toolbarCollapsed = sessionStorage.getItem("reframe.toolbar.collapsed") === "true"; } catch { /* ponytail: session preference is optional */ }
  let chromeVisible = false;
  let chromeHideTimer;
  const CHROME_PROXIMITY = 80;
  const CHROME_HIDE_DELAY_MS = 5000;
  const PEEK_HOTZONE = 56;
  let uiPeeking = false;
  let heatmapVisible = false;
  let commentMode = false;
  let lastPointer = { x: innerWidth / 2, y: innerHeight / 2 };
  let annointTool = "pen";
  let annointDraft = { strokes: [], texts: [] };
  let draftTimer;
  let mappingTimer;
  let comparePos = 50;
  let compareDrag;
  const draftsEndpoint = reframeBasePath + "/drafts";
  const snapshotsEndpoint = reframeBasePath + "/snapshots";
  const ensureAnnointId = () => { if (!annointId) annointId = crypto.randomUUID(); return annointId; };
  let annointPointer;
  let commentPointer;
  let selectedImageId;
  let imageDrag;
  const imageMigrated = new Set();
  const IMAGE_DEFAULT_MAX_WIDTH = 400;
  const IMAGE_MIN_SIZE = 40;
  const defaultImageDimensions = (naturalWidth, naturalHeight) => {
    const maxWidth = Math.min(IMAGE_DEFAULT_MAX_WIDTH, (innerWidth * 0.4) / canvasZoom);
    if (!naturalWidth || !naturalHeight) return { width: maxWidth, height: Math.round(maxWidth * 0.75) };
    const scale = Math.min(1, maxWidth / naturalWidth);
    return { width: Math.max(IMAGE_MIN_SIZE / canvasZoom, Math.round(naturalWidth * scale)), height: Math.max(IMAGE_MIN_SIZE / canvasZoom, Math.round(naturalHeight * scale)) };
  };
  const viewportToPage = (vx, vy) => [(vx + scrollX) / canvasZoom, (vy + scrollY) / canvasZoom];
  const pageToViewport = (px, py) => [px * canvasZoom - scrollX, py * canvasZoom - scrollY];
  const migrateImagePosition = (position) => {
    if (!position || position.coordSpace === "page") return position;
    const [px, py] = viewportToPage(position.x, position.y);
    return { ...position, x: px, y: py, width: position.width / canvasZoom, height: position.height / canvasZoom, coordSpace: "page" };
  };
  const imagePlacement = (stored, naturalWidth, naturalHeight, anchorPageX, anchorPageY) => {
    const normalized = stored?.coordSpace === "page" ? stored : stored ? migrateImagePosition(stored) : null;
    const dims = normalized?.width && normalized?.height ? { width: normalized.width, height: normalized.height } : defaultImageDimensions(naturalWidth, naturalHeight);
    const pageW = innerWidth / canvasZoom;
    const pageH = innerHeight / canvasZoom;
    const x = normalized?.x ?? Math.max(8 / canvasZoom, Math.min(pageW - dims.width - 8 / canvasZoom, (anchorPageX ?? pageW / 2) - dims.width / 2));
    const y = normalized?.y ?? Math.max(56 / canvasZoom, Math.min(pageH - dims.height - 8 / canvasZoom, (anchorPageY ?? pageH / 2) - dims.height / 2));
    return { x, y, width: dims.width, height: dims.height, coordSpace: "page" };
  };
  const readImageDimensions = (file) => new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => { resolve({ width: probe.naturalWidth, height: probe.naturalHeight }); URL.revokeObjectURL(url); };
    probe.onerror = () => { resolve({ width: 0, height: 0 }); URL.revokeObjectURL(url); };
    probe.src = url;
  });
  let commentHistory = [];
  let commentHistoryIndex = -1;
  let editHistory = [];
  let editHistoryIndex = -1;
  let editHistoryTimer;
  let editHistorySuspended = false;
  let commentPersistTimer;
  const COMMENT_PERSIST_MS = 400;
  const EDIT_HISTORY_MS = 300;
  const TEXT_STYLE_KEYS = ["font-family", "font-size", "color", "font-weight", "font-style", "text-decoration", "text-align", "line-height", "letter-spacing", "text-transform"];
  const LAYOUT_STYLE_KEYS = ["border-radius", "transform", "background-color", "background-image", "opacity", "border-width", "border-color", "border-style", "box-shadow", "outline", "display", "visibility", "flex-direction", "justify-content", "align-items", "gap", "padding-top", "padding-right", "padding-bottom", "padding-left", "margin-top", "margin-right", "margin-bottom", "margin-left", "position", "top", "right", "bottom", "left", "z-index", "overflow", "min-width", "max-width", "min-height", "max-height", "filter"];
  const PREVIEW_STYLE_KEYS = [...TEXT_STYLE_KEYS, ...LAYOUT_STYLE_KEYS];
  const fingerprintKey = (value) => { const payload = JSON.stringify({ tag: value.tag, id: value.id, classes: [...value.classes].sort(), route: value.route }); let hash = 5381; for (let index = 0; index < payload.length; index += 1) hash = ((hash << 5) + hash) ^ payload.charCodeAt(index); return (hash >>> 0).toString(16).padStart(8, "0"); };
  const setElementText = (element, value) => { if (!element) return; const kids = [...element.childNodes]; const onlyText = kids.length <= 1 && kids.every((node) => node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR")); if (onlyText) { element.textContent = value; return; } const textNode = kids.find((node) => node.nodeType === Node.TEXT_NODE); if (textNode) textNode.textContent = value; else element.insertBefore(document.createTextNode(value), element.firstChild); };
  const readElementText = (element) => (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  const translateChanged = (selection) => Boolean(selection?.previewTranslate?.x || selection?.previewTranslate?.y);
  const transformPreviewValue = (selection) => {
    if (!selection?.previewTranslate) return "";
    const { x, y } = selection.previewTranslate;
    const base = (selection.original.styles?.transform || "").trim();
    if (!x && !y) return base && base !== "none" ? base : "";
    if (!base || base === "none") return "translate(" + x + "px, " + y + "px)";
    return base + " translate(" + x + "px, " + y + "px)";
  };
  const syncTranslateToPreviewStyles = (selection = active) => {
    if (!selection) return;
    const next = transformPreviewValue(selection);
    const previous = selection.original.styles?.transform ?? "";
    if (next === previous && !translateChanged(selection)) delete selection.previewStyles.transform;
    else if (next) selection.previewStyles = { ...selection.previewStyles, transform: next };
    else delete selection.previewStyles.transform;
  };
  const styleSnapshot = (element) => { const computed = getComputedStyle(element); const styles = {}; for (const key of PREVIEW_STYLE_KEYS) styles[key] = element.style.getPropertyValue(key) || computed.getPropertyValue(key); return styles; };
  const applyPreviewStyles = (selection) => { if (!selection?.element) return; for (const [key, value] of Object.entries(selection.previewStyles || {})) selection.element.style.setProperty(key, value); };
  const restorePreviewStyles = (selection) => { if (!selection?.element) return; for (const key of PREVIEW_STYLE_KEYS) { const original = selection.original.styles?.[key] ?? ""; if (original) selection.element.style.setProperty(key, original); else selection.element.style.removeProperty(key); } };
  const applyPreviewTransform = (selection) => { if (!selection?.element || !selection.previewTranslate) return; const value = transformPreviewValue(selection); if (value) selection.element.style.setProperty("transform", value); else selection.element.style.removeProperty("transform"); };
  const restorePreviewTransform = (selection) => { if (!selection?.element) return; if (selection.original.inlineTransformPresent) selection.element.style.setProperty("transform", selection.original.inlineTransform, selection.original.inlineTransformPriority); else selection.element.style.removeProperty("transform"); };
  const parsePx = (value, fallback = 0) => { const parsed = Number.parseFloat(String(value || "")); return Number.isFinite(parsed) ? parsed : fallback; };
  const syncGenerateButton = () => {
    const btn = generate || generateButton;
    if (!btn) return;
    const mapped = Boolean(active && ["exact", "probable"].includes(active.mappingConfidence));
    btn.disabled = !mapped;
    btn.setAttribute("aria-disabled", String(!mapped));
    if (!active) btn.title = "Generate with AI";
    else if (active.mappingConfidence === "pending") btn.title = "Mapping source…";
    else if (mapped) btn.title = "Generate with AI";
    else btn.title = "Element is not mapped to source yet";
  };
  const syncDesignPanel = () => {
    if (!active) return;
    syncLayoutInputs();
    const computed = getComputedStyle(active.element);
    const styles = active.previewStyles || {};
    const px = (value, fallback = 0) => { const parsed = Number.parseFloat(String(value || "")); return Number.isFinite(parsed) ? parsed : fallback; };
    if (designFill) designFill.value = rgbToHex(styles["background-color"] || computed.backgroundColor);
    if (designFillHex) designFillHex.value = designFill.value;
    if (designOpacity) designOpacity.value = String(Math.round((px(styles.opacity || computed.opacity, 1)) * 100));
    if (designBorderWidth) designBorderWidth.value = String(Math.round(px(styles["border-width"] || computed.borderTopWidth)));
    if (designBorderColor) designBorderColor.value = rgbToHex(styles["border-color"] || computed.borderTopColor);
    if (designFontSize) designFontSize.value = String(Math.round(px(styles["font-size"] || computed.fontSize, 16)));
    if (designLineHeight) designLineHeight.value = String(Math.round((px(styles["line-height"], 0) || (computed.lineHeight.endsWith("px") ? px(computed.lineHeight) / px(computed.fontSize, 16) : 1.2)) * 100) / 100);
    if (designLetterSpacing) designLetterSpacing.value = String(px(styles["letter-spacing"] || computed.letterSpacing));
    const shadow = (styles["box-shadow"] || computed.boxShadow || "none").split(/\s+/);
    if (designShadowX) designShadowX.value = shadow[0] === "none" ? "0" : String(parsePx(shadow[0]));
    if (designShadowY) designShadowY.value = shadow[0] === "none" ? "0" : String(parsePx(shadow[1]));
    if (designShadowBlur) designShadowBlur.value = shadow[0] === "none" ? "0" : String(parsePx(shadow[2]));
    if (designShadowColor) designShadowColor.value = shadow[0] === "none" ? "#000000" : rgbToHex(shadow.slice(3).join(" ") || "#000000");
    if (designTranslateX) designTranslateX.value = String(active.previewTranslate?.x || 0);
    if (designTranslateY) designTranslateY.value = String(active.previewTranslate?.y || 0);
    const syncDesignSelect = (control, value) => { if (!control) return; if (control._alignSync) control._alignSync(value); else if (control._designPicker) setDesignPicker(control, control._designPicker.menu, control._designPicker.labelEl, value, control._designPicker.options); else control.value = value; };
    syncDesignSelect(designDisplay, styles.display || computed.display || "");
    const displayVal = String(styles.display || computed.display || "").toLowerCase();
    if (designFlexControls) designFlexControls.hidden = displayVal !== "flex" && displayVal !== "inline-flex";
    syncDesignSelect(designFlexDirection, styles["flex-direction"] || computed.flexDirection || "");
    syncDesignSelect(designJustify, styles["justify-content"] || computed.justifyContent || "");
    syncDesignSelect(designAlign, styles["align-items"] || computed.alignItems || "");
    for (const field of designUnits) syncUnitField(field, styles, computed, field.property);
    syncDesignSelect(designPosition, styles.position || computed.position || "");
    if (designZ) designZ.value = String(parsePx(styles["z-index"] || computed.zIndex, 0));
    syncDesignSelect(designOverflow, styles.overflow || computed.overflow || "");
    syncDesignSelect(designTextTransform, styles["text-transform"] || computed.textTransform || "");
    syncDesignSelect(designTextDecoration, styles["text-decoration-line"] || styles["text-decoration"] || computed.textDecorationLine || computed.textDecoration || "");
    if (designPadUniform) syncSpacingUniform([designPadT, designPadR, designPadB, designPadL], designPadUniform, designPadSides, designPadLink);
    if (designMarUniform) syncSpacingUniform([designMarT, designMarR, designMarB, designMarL], designMarUniform, designMarSides, designMarLink);
    if (designBgImage) designBgImage.value = (styles["background-image"] || computed.backgroundImage || "").replace(/^url\(["']?|["']?\)$/g, "");
    if (designOutline) designOutline.value = styles.outline || computed.outline || "";
    const blurMatch = String(styles.filter || computed.filter || "").match(/blur\(([^)]+)\)/);
    if (designBlur) designBlur.value = blurMatch ? String(parsePx(blurMatch[1])) : "0";
    if (formatColor) formatColor.value = rgbToHex(styles.color || computed.color);
    if (textInput) { textInput.hidden = false; textInput.value = active.previewText; }
    const showText = isTextElement(active.element);
    if (designEssentialText) designEssentialText.hidden = !showText;
    if (typeSection) { typeSection.hidden = !showText; if (showText) typeSection.open = true; }
    if (designElementType) designElementType.textContent = elementTypeLabel(active.element);
  };
  const rgbToHex = (value) => { const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i); if (!match) return value?.startsWith("#") ? value : "#000000"; const hex = (n) => Number(n).toString(16).padStart(2, "0"); return "#" + hex(match[1]) + hex(match[2]) + hex(match[3]); };
  const syncLayoutInputs = () => {
    if (!active) return;
    if (layoutWidth) layoutWidth.value = String(active.previewWidth);
    if (layoutHeight) layoutHeight.value = String(active.previewHeight);
    if (layoutRadius) layoutRadius.value = String(Math.round(parsePx(active.previewStyles["border-radius"] || getComputedStyle(active.element).borderTopLeftRadius)));
    const rect = active.element.getBoundingClientRect();
    const tx = active.previewTranslate?.x || 0;
    const ty = active.previewTranslate?.y || 0;
    if (layoutX) layoutX.value = String(Math.round(rect.left - tx));
    if (layoutY) layoutY.value = String(Math.round(rect.top - ty));
  };
  const syncEditToolbar = () => {
    const showcaseHasSelection = showcaseMode && showcaseUiActive;
    if (commentTools) commentTools.hidden = !commentMode;
    if (editTools) editTools.hidden = commentMode || (!active && !showcaseHasSelection) || !selectMode;
    syncEditUndoButtons();
    syncGenerateButton();
    if (!active && !showcaseHasSelection) return;
    const element = active?.element || showcaseTarget;
    const showFormat = !commentMode && element && isTextElement(element);
    if (formatPanel && !panel?.classList.contains("in-design-panel")) formatPanel.hidden = !showFormat;
    if (formatDivider) formatDivider.hidden = !showFormat;
    if (contextBar) contextBar.hidden = commentMode || (!active && !showcaseHasSelection) || !selectMode;
    if (designPanel) designPanel.hidden = commentMode || (!active && !showcaseHasSelection) || !designPanelVisible;
    if (designTab) designTab.hidden = commentMode || (!active && !showcaseHasSelection) || designPanelVisible;
    if (textInput) { textInput.hidden = false; textInput.classList.toggle("reframe-text-off", !showFormat && activeTool !== "text"); }
    if (active) syncDesignPanel();
    else if (showcaseHasSelection && designElementType && showcaseTarget) designElementType.textContent = elementTypeLabel(showcaseTarget);
  };
  const syncToolUi = () => {
    host.dataset.reframeTool = activeTool;
    for (const button of toolButtons) button.setAttribute("aria-pressed", String(button.dataset.reframeTool === activeTool));
    if (commentModeToggle) commentModeToggle.setAttribute("aria-pressed", String(commentMode));
    if (layersPanel) { layersPanel.hidden = !layersPanelVisible; layersPanel.style.width = layersPanelWidth + "px"; }
    if (layersToggle) layersToggle.setAttribute("aria-pressed", String(layersPanelVisible));
    if (toolbarLayersButton) toolbarLayersButton.setAttribute("aria-pressed", String(layersPanelVisible));
    if (designToggle) designToggle.setAttribute("aria-pressed", String(designPanelVisible));
    if (toolbarDesignButton) toolbarDesignButton.setAttribute("aria-pressed", String(designPanelVisible && Boolean(active || (showcaseMode && showcaseUiActive))));
    if (zoomLabel) zoomLabel.textContent = Math.round(canvasZoom * 100) + "%";
  };
  const setActiveTool = (tool) => {
    if (active?.applying && tool !== activeTool) { explain("Saving… press Deselect to cancel"); return; }
    if (tool === "comment") { if (!commentMode) enterCommentMode(); activeTool = "comment"; syncToolUi(); return; }
    if (commentMode) exitCommentMode();
    activeTool = tool;
    selectMode = tool === "select" || tool === "text";
    if (tool !== "select") clearUiPeek();
    if (!selectMode) { hideHover(); if (active) clearSelection("Tool changed; temporary preview discarded"); }
    syncEditToolbar();
    syncToolUi();
    if (tool === "hand") explain("Hand tool: drag to pan");
    else if (tool === "text") explain("Text tool: click text to edit");
    else if (tool === "select") explain("Select tool: click elements to edit");
  };
  const toggleLayersPanel = () => { layersPanelVisible = !layersPanelVisible; syncToolUi(); if (layersPanelVisible) scheduleLayersTree(); };
  const hideDesignPanel = () => { if (!designPanelVisible) return; designPanelVisible = false; syncEditToolbar(); syncToolUi(); scheduleGeometry(); };
  const expandAllLayers = () => { layersCollapsed.clear(); renderLayersTree(); };
  const collapseAllLayers = () => {
    const walk = (parent) => { for (const child of layerChildren(parent)) { if (layerChildren(child).length) layersCollapsed.add(child); walk(child); } };
    walk(document.body);
    renderLayersTree();
  };
  const insertionContainer = () => {
    const target = active?.element?.isConnected ? active.element : document.body;
    if (target !== document.body && getComputedStyle(target).position === "static") target.style.position = "relative";
    return target;
  };
  const insertionFingerprint = () => active?.fingerprint ? fingerprintKey(active.fingerprint) : null;
  // ponytail: layers tree always starts at body — insertionContainer is paste-only, never the tree root
  const layersTreeRoot = () => document.body;
  const layerSkip = (element) => { const tag = element.tagName.toLowerCase(); return ["script", "style", "link", "meta", "noscript", "head", "html", "body"].includes(tag) || element.id === "reframe-root" || element.closest?.("#reframe-root"); };
  const layerChildren = (parent) => [...parent.children].filter((child) => child instanceof HTMLElement && !layerSkip(child));
  const revealLayerPath = (element) => {
    if (!element?.isConnected) return;
    let node = element.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      layersCollapsed.delete(node);
      node = node.parentElement;
    }
  };
  const layerTypeFor = (element) => {
    const tag = element.tagName.toLowerCase();
    if (["img", "picture", "svg", "video", "canvas"].includes(tag)) return "image";
    if (tag === "button" || element.getAttribute("role") === "button") return "button";
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (["p", "span", "label", "a", "em", "strong", "small", "i", "b", "time"].includes(tag)) return "text";
    if (["input", "textarea", "select"].includes(tag)) return "input";
    return "frame";
  };
  const elementTypeLabel = (element) => ({ image: "Image", button: "Button", heading: "Heading", text: "Text", input: "Input", frame: "Frame" })[layerTypeFor(element)] || "Frame";
  const layerDisplayName = (element) => element.id || element.getAttribute("data-reframe-component") || element.classList[0] || element.tagName.toLowerCase();
  const isLayerLocked = (element) => {
    if (!element || !(element instanceof HTMLElement)) return false;
    let node = element;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.hasAttribute("data-reframe-locked")) return true;
      node = node.parentElement;
    }
    return false;
  };
  const isLayerHidden = (element) => {
    if (!element) return false;
    if (element.hasAttribute("data-reframe-hidden")) return true;
    const inline = element.style.getPropertyValue("visibility");
    if (inline === "hidden") return true;
    return getComputedStyle(element).visibility === "hidden";
  };
  const syncLayerHiddenPreview = (element, hidden) => {
    if (active?.element !== element) return;
    if (hidden) active.previewStyles = { ...active.previewStyles, visibility: "hidden" };
    else {
      const next = { ...active.previewStyles };
      delete next.visibility;
      active.previewStyles = next;
      const original = active.original.styles?.visibility ?? "";
      if (original) element.style.setProperty("visibility", original);
      else element.style.removeProperty("visibility");
    }
    cacheDraft();
    scheduleAutosave();
    queueMapping();
    updateApplyState();
  };
  const setLayerHidden = (element, hidden) => {
    if (!element?.isConnected) return;
    if (hidden) {
      element.setAttribute("data-reframe-hidden", "");
      element.style.setProperty("visibility", "hidden");
    } else {
      element.removeAttribute("data-reframe-hidden");
      if (element.style.getPropertyValue("visibility") === "hidden") element.style.removeProperty("visibility");
    }
    syncLayerHiddenPreview(element, hidden);
    if (active?.element === element) pushEditHistory();
    renderLayersTree();
    scheduleGeometry();
  };
  const toggleLayerHidden = (element) => { setLayerHidden(element, !isLayerHidden(element)); explain(isLayerHidden(element) ? "Layer hidden" : "Layer visible"); };
  const setLayerLocked = (element, locked) => {
    if (!element?.isConnected) return;
    if (locked) element.setAttribute("data-reframe-locked", "");
    else element.removeAttribute("data-reframe-locked");
    if (locked && active?.element && (active.element === element || active.element.contains(element) || element.contains(active.element))) clearSelection("Locked layer — selection cleared", true, false);
    renderLayersTree();
    explain(locked ? "Layer locked" : "Layer unlocked");
  };
  const toggleLayerLocked = (element) => setLayerLocked(element, !element.hasAttribute("data-reframe-locked"));
  const clearLayerDrag = () => {
    if (layerDrag?.handle?.hasPointerCapture?.(layerDrag.pointerId)) layerDrag.handle.releasePointerCapture(layerDrag.pointerId);
    if (layerDrag?.row) layerDrag.row.classList.remove("is-dragging");
    layerDrag = undefined;
    if (layerDropIndicator) layerDropIndicator.hidden = true;
    layersTree?.classList.remove("is-dragging");
    document.removeEventListener("pointermove", onLayerDragMove, true);
    document.removeEventListener("pointerup", onLayerDragEnd, true);
    document.removeEventListener("pointercancel", onLayerDragEnd, true);
    if (layersTreePending) { layersTreePending = false; renderLayersTree(); }
  };
  const reorderLayerSibling = (dragged, target, position) => {
    if (!dragged?.isConnected || !target?.isConnected || dragged === target) return false;
    const parent = dragged.parentElement;
    if (!parent || target.parentElement !== parent) return false;
    const ref = position === "before" ? target : target.nextElementSibling;
    if (ref === dragged) return false;
    parent.insertBefore(dragged, ref);
    return true;
  };
  const layerRowFromEvent = (event) => {
    const path = event.composedPath?.() || [];
    for (const node of path) {
      if (node instanceof HTMLElement && node.classList?.contains("layers-row")) return node;
    }
    return null;
  };
  const showLayerDropIndicator = (row, position) => {
    if (!layerDropIndicator || !row || !layersTree) return;
    const treeRect = layersTree.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    layerDropIndicator.hidden = false;
    layerDropIndicator.style.left = "4px";
    layerDropIndicator.style.right = "4px";
    layerDropIndicator.style.top = (position === "before" ? rowRect.top : rowRect.bottom) - treeRect.top + layersTree.scrollTop + "px";
  };
  const onLayerDragMove = (event) => {
    if (!layerDrag || layerDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    layerDrag.moved = true;
    const row = layerRowFromEvent(event);
    if (!row) { if (layerDropIndicator) layerDropIndicator.hidden = true; layerDrag.target = undefined; return; }
    const targetElement = layerRowElements.get(row);
    if (!targetElement || targetElement.parentElement !== layerDrag.parent || targetElement === layerDrag.element) {
      if (layerDropIndicator) layerDropIndicator.hidden = true;
      layerDrag.target = undefined;
      return;
    }
    const rect = row.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    layerDrag.target = targetElement;
    layerDrag.position = position;
    showLayerDropIndicator(row, position);
  };
  const onLayerDragEnd = (event) => {
    if (!layerDrag || layerDrag.pointerId !== event.pointerId) return;
    const dragged = layerDrag.element;
    const target = layerDrag.target;
    const position = layerDrag.position;
    const moved = layerDrag.moved;
    clearLayerDrag();
    if (moved) suppressLayerRowClick = true;
    if (dragged?.isConnected && target?.isConnected && reorderLayerSibling(dragged, target, position)) {
      renderLayersTree();
      scheduleGeometry();
      explain("Layer reordered — preview until saved to source");
    }
  };
  const onLayerDragStart = (event, element, row, handle) => {
    if (event.button !== 0 || !element?.isConnected) return;
    event.preventDefault();
    event.stopPropagation();
    layerDrag = { element, parent: element.parentElement, row, handle, pointerId: event.pointerId, target: undefined, position: "before", moved: false };
    row.classList.add("is-dragging");
    layersTree?.classList.add("is-dragging");
    if (!layerDropIndicator && layersTree) {
      layerDropIndicator = document.createElement("div");
      layerDropIndicator.className = "layers-drop-indicator";
      layerDropIndicator.hidden = true;
      layersTree.append(layerDropIndicator);
    }
    handle.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", onLayerDragMove, true);
    document.addEventListener("pointerup", onLayerDragEnd, true);
    document.addEventListener("pointercancel", onLayerDragEnd, true);
  };
  const layerMatchesSearch = (element, query) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return labelFor(element).toLowerCase().includes(q) || layerDisplayName(element).toLowerCase().includes(q);
  };
  const subtreeMatchesSearch = (element, query, depth) => {
    if (!query) return true;
    if (layerMatchesSearch(element, query)) return true;
    return layerChildren(element).some((child) => subtreeMatchesSearch(child, query, depth + 1));
  };
  const createLayerRow = (element, depth) => {
    const hidden = isLayerHidden(element);
    const locked = element.hasAttribute("data-reframe-locked");
    const row = document.createElement("div");
    row.className = "layers-row" + (active?.element === element ? " selected" : "") + (hidden ? " is-hidden" : "") + (locked ? " is-locked" : "");
    row.style.setProperty("--layer-depth", String(depth));
    row.setAttribute("role", "treeitem");
    row.dataset.reframeLayerRow = "";
    if (hidden) row.dataset.reframeLayerHidden = "true";
    if (locked) row.dataset.reframeLayerLocked = "true";
    layerRowElements.set(row, element);
    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "layers-drag-handle";
    dragHandle.setAttribute("aria-label", "Drag to reorder layer");
    dragHandle.title = "Drag to reorder";
    dragHandle.innerHTML = ICONS.grip;
    dragHandle.addEventListener("pointerdown", (event) => onLayerDragStart(event, element, row, dragHandle));
    dragHandle.addEventListener("click", (event) => event.stopPropagation());
    row.append(dragHandle);
    const kids = layerChildren(element);
    const hasKids = kids.length > 0;
    const expanded = layersSearchQuery.trim() ? true : !layersCollapsed.has(element);
    if (hasKids) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "layers-toggle" + (expanded ? " expanded" : "");
      toggle.setAttribute("aria-label", expanded ? "Collapse layer" : "Expand layer");
      toggle.innerHTML = ICONS.expand;
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        if (layersCollapsed.has(element)) layersCollapsed.delete(element);
        else layersCollapsed.add(element);
        renderLayersTree();
      });
      row.append(toggle);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "layers-toggle-spacer";
      spacer.setAttribute("aria-hidden", "true");
      row.append(spacer);
    }
    const icon = document.createElement("span");
    icon.className = "layers-icon layers-icon-" + layerTypeFor(element);
    icon.setAttribute("aria-hidden", "true");
    row.append(icon);
    const name = document.createElement("span");
    name.className = "layers-name";
    const displayName = layerDisplayName(element);
    name.textContent = displayName;
    name.title = displayName;
    row.title = displayName + " · " + element.tagName.toLowerCase();
    row.append(name);
    const tag = document.createElement("span");
    tag.className = "layers-tag";
    const tagName = element.tagName.toLowerCase();
    tag.textContent = tagName;
    tag.title = tagName;
    row.append(tag);
    const actions = document.createElement("span");
    actions.className = "layers-actions";
    const lockBtn = document.createElement("button");
    lockBtn.type = "button";
    lockBtn.className = "layers-action" + (locked ? " is-on" : "");
    lockBtn.dataset.reframeLayerLock = "";
    lockBtn.setAttribute("aria-label", locked ? "Unlock layer" : "Lock layer");
    lockBtn.setAttribute("aria-pressed", String(locked));
    lockBtn.title = locked ? "Unlock layer" : "Lock layer";
    lockBtn.innerHTML = locked ? ICONS.lock : ICONS.unlock;
    lockBtn.addEventListener("click", (event) => { event.stopPropagation(); toggleLayerLocked(element); });
    const eyeBtn = document.createElement("button");
    eyeBtn.type = "button";
    eyeBtn.className = "layers-action" + (hidden ? " is-on" : "");
    eyeBtn.dataset.reframeLayerVisibility = "";
    eyeBtn.setAttribute("aria-label", hidden ? "Show layer" : "Hide layer");
    eyeBtn.setAttribute("aria-pressed", String(hidden));
    eyeBtn.title = hidden ? "Show layer" : "Hide layer";
    eyeBtn.innerHTML = hidden ? ICONS.eyeOff : ICONS.eye;
    eyeBtn.addEventListener("click", (event) => { event.stopPropagation(); toggleLayerHidden(element); });
    actions.append(lockBtn, eyeBtn);
    row.append(actions);
    row.addEventListener("click", () => {
      if (suppressLayerRowClick) { suppressLayerRowClick = false; return; }
      selectLayerElement(element);
    });
    return row;
  };
  const scheduleLayersTree = () => {
    if (!layersPanelVisible || !layersTree || layersTreeFrame) return;
    layersTreeFrame = requestAnimationFrame(() => {
      layersTreeFrame = undefined;
      renderLayersTree();
    });
  };
  const renderLayersTree = () => {
    if (!layersTree) return;
    if (layerDrag) { layersTreePending = true; return; }
    layersTreePending = false;
    layersTree.replaceChildren();
    const rootEl = layersTreeRoot();
    if (!rootEl) return;
    if (layersSearch) layersSearchQuery = layersSearch.value;
    if (active?.element?.isConnected) revealLayerPath(active.element);
    const query = layersSearchQuery.trim();
    let count = 0;
    const appendNodes = (parent, container, depth) => {
      for (const child of layerChildren(parent)) {
        const kids = layerChildren(child);
        if (query && !subtreeMatchesSearch(child, query, depth)) continue;
        const wrapper = document.createElement("div");
        wrapper.className = "layers-group";
        wrapper.append(createLayerRow(child, depth));
        const hasKids = kids.length > 0;
        const expanded = query ? true : !layersCollapsed.has(child);
        if (hasKids && expanded) {
          const nested = document.createElement("div");
          nested.className = "layers-children";
          nested.setAttribute("role", "group");
          appendNodes(child, nested, depth + 1);
          if (nested.childNodes.length) wrapper.append(nested);
        }
        container.append(wrapper);
        count += 1;
      }
    };
    appendNodes(rootEl, layersTree, 0);
    if (!count) {
      const empty = document.createElement("div");
      empty.className = "layers-empty";
      empty.textContent = query ? "No layers match your search" : "No layers to show";
      layersTree.append(empty);
    }
  };
  const selectLayerElement = (element) => {
    if (!element?.isConnected) return;
    if (isLayerLocked(element)) { explain("Layer is locked"); return; }
    if (!selectMode) setActiveTool("select");
    choose(element);
    element.scrollIntoView({ block: "nearest", behavior: "smooth" });
    scheduleLayersTree();
  };
  const applyCanvasZoom = () => {
    // ponytail: scale body only so #reframe-root UI stays viewport-fixed; annoints convert page coords on render
    const page = document.body;
    if (!page) return;
    if (canvasZoom === 1) { page.style.transform = ""; page.style.transformOrigin = ""; }
    else { page.style.transformOrigin = "0 0"; page.style.transform = "scale(" + canvasZoom + ")"; }
    document.documentElement.style.transform = "";
    document.documentElement.style.transformOrigin = "";
    syncToolUi();
    scheduleGeometry();
    scheduleAnnotations();
    renderAnnoints();
  };
  const setCanvasZoom = (value, anchorX, anchorY) => {
    const next = Math.min(3, Math.max(0.25, Math.round(value * 100) / 100));
    const prev = canvasZoom;
    if (next === prev) return;
    const ax = anchorX ?? innerWidth / 2;
    const ay = anchorY ?? innerHeight / 2;
    const ratio = next / prev;
    canvasZoom = next;
    applyCanvasZoom();
    if (prev !== 1 || next !== 1) {
      const sx = scrollX + (ax / prev - ax / next);
      const sy = scrollY + (ay / prev - ay / next);
      scrollTo(sx, sy);
    }
  };
  const fitCanvasZoom = () => { canvasZoom = 1; applyCanvasZoom(); scrollTo(0, 0); explain("Fit to screen"); };
  const onPanPointerDown = (event) => {
    if (activeTool !== "hand" || event.button !== 0) return;
    const path = event.composedPath?.() || [];
    if (path.includes(host)) return;
    panDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollX, scrollY };
    host.dataset.reframePanning = "true";
    document.addEventListener("pointermove", onPanPointerMove, true);
    document.addEventListener("pointerup", onPanPointerUp, true);
    document.addEventListener("pointercancel", onPanPointerUp, true);
    event.preventDefault();
  };
  const onPanPointerMove = (event) => {
    if (!panDrag || panDrag.pointerId !== event.pointerId) return;
    scrollTo(panDrag.scrollX - (event.clientX - panDrag.x), panDrag.scrollY - (event.clientY - panDrag.y));
  };
  const onPanPointerUp = (event) => {
    if (!panDrag || panDrag.pointerId !== event.pointerId) return;
    panDrag = undefined;
    host.dataset.reframePanning = "false";
    document.removeEventListener("pointermove", onPanPointerMove, true);
    document.removeEventListener("pointerup", onPanPointerUp, true);
    document.removeEventListener("pointercancel", onPanPointerUp, true);
  };
  const stylesChanged = (selection) => selection && Object.entries(selection.previewStyles || {}).some(([key, value]) => value !== (selection.original.styles?.[key] ?? ""));
  const relativeTime = (value) => { const delta = Date.now() - Date.parse(value); if (!Number.isFinite(delta)) return value; if (delta < 60_000) return "just now"; if (delta < 3_600_000) return Math.floor(delta / 60_000) + "m ago"; if (delta < 86_400_000) return Math.floor(delta / 3_600_000) + "h ago"; return Math.floor(delta / 86_400_000) + "d ago"; };
  const isTextElement = (element) => { const tag = element.tagName.toLowerCase(); return ["p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "a", "button", "label", "li", "td", "th", "strong", "em", "small"].includes(tag) || Boolean((element.innerText || element.textContent || "").trim()); };
  const annointEndpoint = reframeBasePath + "/annoints";
  const annotationImagesEndpoint = reframeBasePath + "/annotation-images";
  const insertionsEndpoint = reframeBasePath + "/insertions";
  const insertionsJsonEndpoint = reframeBasePath + "/insertions.json";
  const annointRoute = () => location.pathname || "/";
  const annointRouteCandidates = () => { const pathname = annointRoute(); const full = route(); const candidates = [pathname]; if (full !== pathname) candidates.push(full); if (pathname.endsWith("/index.html")) { const parent = pathname.slice(0, -"/index.html".length) || "/"; if (!candidates.includes(parent)) candidates.push(parent); } return candidates; };
  const annointFetch = async (suffix, options = {}) => { const response = await fetch(annointEndpoint + suffix, { ...options, cache: "no-store", credentials: "same-origin", headers: { Authorization: "Bearer " + token, ...(options.headers || {}) } }); const value = await response.json().catch(() => ({})); if (!response.ok) throw new Error(value.code || "ANNOINT_REQUEST_FAILED"); return value; };
  const draftFetch = async (suffix, options = {}) => { const response = await fetch(draftsEndpoint + suffix, { ...options, cache: "no-store", credentials: "same-origin", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(options.headers || {}) } }); if (response.status === 204) return null; const value = await response.json().catch(() => ({})); if (!response.ok) throw new Error(value.code || "DRAFT_REQUEST_FAILED"); return value; };
  const ensureSessionSnapshot = async () => { try { await fetch(snapshotsEndpoint, { method: "POST", cache: "no-store", credentials: "same-origin", headers: { Authorization: "Bearer " + token } }); } catch { /* ponytail: compare still works with history screenshots */ } };
  const cacheDraft = () => {
    if (!active) return;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      draftTimer = undefined;
      void draftFetch("", { method: "PUT", body: JSON.stringify({ route: route(), selectionId: active.selectionId, fingerprint: active.fingerprint, previewWidth: active.previewWidth, previewHeight: active.previewHeight, previewText: active.previewText, previewStyles: active.previewStyles, previewTranslate: active.previewTranslate }) }).catch(() => undefined);
    }, 400);
  };
  const clearDraftCache = () => { if (draftTimer) { clearTimeout(draftTimer); draftTimer = undefined; } void draftFetch("?route=" + encodeURIComponent(route()), { method: "DELETE" }).catch(() => undefined); };
  const restoreDraftCache = async () => {
    try {
      const value = await draftFetch("?route=" + encodeURIComponent(route()));
      const draft = value?.draft;
      if (!draft || !active) return;
      if (draft.fingerprint?.id && active.fingerprint.id && draft.fingerprint.id !== active.fingerprint.id) return;
      active.previewWidth = draft.previewWidth;
      active.previewHeight = draft.previewHeight;
      active.previewText = draft.previewText;
      active.previewStyles = { ...draft.previewStyles };
      active.previewTranslate = { ...draft.previewTranslate };
      active.element.style.setProperty("width", active.previewWidth + "px", "important");
      active.element.style.setProperty("height", active.previewHeight + "px", "important");
      setElementText(active.element, active.previewText);
      applyPreviewStyles(active);
      applyPreviewTransform(active);
      if (textInput) textInput.value = active.previewText;
      syncLayoutInputs();
      scheduleGeometry();
      queueMapping();
      updateApplyState();
    } catch { /* ponytail: draft restore is optional */ }
  };
  const markAnnointPage = (value) => ({ ...value, coordSpace: "page" });
  const saveAnnoints = async () => { try { const saved = await annointFetch("/" + ensureAnnointId(), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ route: annointRoute(), viewport: { width: innerWidth, height: innerHeight }, strokes: annointDraft.strokes.map(markAnnointPage), texts: annointDraft.texts.map(markAnnointPage) }) }); if (saved?.id) annointId = saved.id; debugLog("browser-client:saveAnnoints", "annoints saved", { id: annointId, route: annointRoute(), strokes: annointDraft.strokes.length, texts: annointDraft.texts.length }, "H8"); } catch (error) { debugLog("browser-client:saveAnnoints", "annoints save failed", { code: error?.message || "ANNOINT_REQUEST_FAILED" }, "H8"); explain("Could not save annoints"); } };
  const routeImages = () => annotationState.annotations.filter((item) => item.route === route() && item.kind === "image" && item.status === "open").map((item) => ({ id: item.id, position: { ...item.position } }));
  const commentSnapshot = () => ({ strokes: JSON.parse(JSON.stringify(annointDraft.strokes)), texts: JSON.parse(JSON.stringify(annointDraft.texts)), images: routeImages() });
  const syncCommentUndoButtons = () => { if (commentUndo) { commentUndo.disabled = commentHistoryIndex <= 0; commentUndo.setAttribute("aria-disabled", String(commentUndo.disabled)); } if (commentRedo) { commentRedo.disabled = commentHistoryIndex >= commentHistory.length - 1; commentRedo.setAttribute("aria-disabled", String(commentRedo.disabled)); } };
  const pushCommentHistory = () => { const snap = commentSnapshot(); const prev = commentHistory[commentHistoryIndex]; if (prev && JSON.stringify(prev) === JSON.stringify(snap)) return; commentHistory = commentHistory.slice(0, commentHistoryIndex + 1); commentHistory.push(snap); commentHistoryIndex = commentHistory.length - 1; if (commentHistory.length > 100) { commentHistory.shift(); commentHistoryIndex -= 1; } syncCommentUndoButtons(); };
  const restoreCommentSnapshot = (snap) => { annointDraft = { strokes: JSON.parse(JSON.stringify(snap.strokes)), texts: JSON.parse(JSON.stringify(snap.texts)) }; renderAnnoints(); for (const image of snap.images) { const current = annotationState.annotations.find((item) => item.id === image.id); if (current?.position && JSON.stringify(current.position) !== JSON.stringify(image.position)) void updateImageAnnotation(image.id, image.position, true); } for (const current of annotationState.annotations.filter((item) => item.kind === "image" && item.route === route())) { if (!snap.images.some((image) => image.id === current.id)) void deleteImageAnnotation(current.id, true); } };
  const scheduleCommentPersist = () => { if (commentPersistTimer) clearTimeout(commentPersistTimer); commentPersistTimer = setTimeout(() => { commentPersistTimer = undefined; void saveAnnoints(); }, COMMENT_PERSIST_MS); };
  const updateImageAnnotation = async (id, position, silent = false) => { try { const response = await fetch(annotationImagesEndpoint + "/" + id, { method: "PUT", cache: "no-store", credentials: "same-origin", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ position }) }); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).code || "ANNOTATION_IMAGE_UPDATE_FAILED"); const local = annotationState.annotations.find((item) => item.id === id); if (local) local.position = { ...position }; if (!silent) scheduleAnnotations(); } catch { if (!silent) explain("Could not save image annotation"); } };
  const deleteImageAnnotation = async (id, silent = false) => { try { const response = await fetch(annotationImagesEndpoint + "/" + id, { method: "DELETE", cache: "no-store", credentials: "same-origin", headers: { Authorization: "Bearer " + token } }); if (!response.ok && response.status !== 204) throw new Error("ANNOTATION_IMAGE_DELETE_FAILED"); annotationState.annotations = annotationState.annotations.filter((item) => item.id !== id); if (selectedImageId === id) selectedImageId = undefined; if (!silent) { scheduleAnnotations(); requestAnnotations(); } } catch { if (!silent) explain("Could not delete image annotation"); } };
  const undoComment = () => { if (commentHistoryIndex <= 0) return; commentHistoryIndex -= 1; restoreCommentSnapshot(commentHistory[commentHistoryIndex]); syncCommentUndoButtons(); scheduleCommentPersist(); explain("Undo"); };
  const redoComment = () => { if (commentHistoryIndex >= commentHistory.length - 1) return; commentHistoryIndex += 1; restoreCommentSnapshot(commentHistory[commentHistoryIndex]); syncCommentUndoButtons(); scheduleCommentPersist(); explain("Redo"); };
  const editSnapshot = () => {
    if (!active?.element) return null;
    return {
      previewWidth: active.previewWidth,
      previewHeight: active.previewHeight,
      previewText: active.previewText,
      previewStyles: { ...active.previewStyles },
      previewTranslate: { x: active.previewTranslate?.x || 0, y: active.previewTranslate?.y || 0 },
    };
  };
  const syncEditUndoButtons = () => {
    if (editUndo) { editUndo.disabled = editHistoryIndex <= 0; editUndo.setAttribute("aria-disabled", String(editUndo.disabled)); }
    if (editRedo) { editRedo.disabled = editHistoryIndex >= editHistory.length - 1; editRedo.setAttribute("aria-disabled", String(editRedo.disabled)); }
  };
  const resetEditHistory = (seed = false) => {
    if (editHistoryTimer) { clearTimeout(editHistoryTimer); editHistoryTimer = undefined; }
    editHistory = [];
    editHistoryIndex = -1;
    if (seed) {
      const snap = editSnapshot();
      if (snap) { editHistory = [snap]; editHistoryIndex = 0; }
    }
    syncEditUndoButtons();
  };
  const editSnapshotsEqual = (a, b) => {
    if (!a || !b) return false;
    if (a.previewWidth !== b.previewWidth || a.previewHeight !== b.previewHeight || a.previewText !== b.previewText) return false;
    if ((a.previewTranslate?.x || 0) !== (b.previewTranslate?.x || 0) || (a.previewTranslate?.y || 0) !== (b.previewTranslate?.y || 0)) return false;
    for (const key of PREVIEW_STYLE_KEYS) {
      if ((a.previewStyles?.[key] ?? "") !== (b.previewStyles?.[key] ?? "")) return false;
    }
    return true;
  };
  const pushEditHistory = () => {
    if (editHistorySuspended || !active?.element?.isConnected) return;
    const snap = editSnapshot();
    if (!snap) return;
    const prev = editHistory[editHistoryIndex];
    if (prev && editSnapshotsEqual(prev, snap)) return;
    editHistory = editHistory.slice(0, editHistoryIndex + 1);
    editHistory.push(snap);
    editHistoryIndex = editHistory.length - 1;
    if (editHistory.length > 100) { editHistory.shift(); editHistoryIndex -= 1; }
    syncEditUndoButtons();
  };
  const scheduleEditHistory = () => {
    if (editHistoryTimer) clearTimeout(editHistoryTimer);
    editHistoryTimer = setTimeout(() => { editHistoryTimer = undefined; pushEditHistory(); }, EDIT_HISTORY_MS);
  };
  const restoreEditSnapshot = (snap) => {
    if (!snap || !active?.element?.isConnected) return;
    editHistorySuspended = true;
    try {
      active.previewWidth = snap.previewWidth;
      active.previewHeight = snap.previewHeight;
      active.previewText = snap.previewText;
      active.previewStyles = { ...snap.previewStyles };
      active.previewTranslate = { x: snap.previewTranslate.x, y: snap.previewTranslate.y };
      active.element.style.setProperty("width", snap.previewWidth + "px", "important");
      active.element.style.setProperty("height", snap.previewHeight + "px", "important");
      setElementText(active.element, snap.previewText);
      for (const key of PREVIEW_STYLE_KEYS) {
        const value = snap.previewStyles[key];
        if (value) active.element.style.setProperty(key, value);
        else {
          const original = active.original.styles?.[key] ?? "";
          if (original) active.element.style.setProperty(key, original);
          else active.element.style.removeProperty(key);
        }
      }
      applyPreviewTransform(active);
      if (active.element) {
        if (snap.previewStyles.visibility === "hidden") active.element.setAttribute("data-reframe-hidden", "");
        else active.element.removeAttribute("data-reframe-hidden");
      }
      if (textInput) textInput.value = snap.previewText;
      syncLayoutInputs();
      syncDesignPanel();
      scheduleGeometry();
      cacheDraft();
      scheduleAutosave();
      queueMapping();
      updateApplyState();
    } finally {
      editHistorySuspended = false;
    }
  };
  const undoEdit = () => { if (editHistoryIndex <= 0 || !active) return; editHistoryIndex -= 1; restoreEditSnapshot(editHistory[editHistoryIndex]); syncEditUndoButtons(); explain("Undo"); };
  const redoEdit = () => { if (editHistoryIndex >= editHistory.length - 1 || !active) return; editHistoryIndex += 1; restoreEditSnapshot(editHistory[editHistoryIndex]); syncEditUndoButtons(); explain("Redo"); };
  const deleteInsertion = async (id) => {
    const response = await fetch(insertionsEndpoint + "/" + id, { method: "DELETE", cache: "no-store", credentials: "same-origin", headers: { Authorization: "Bearer " + token } });
    if (!response.ok && response.status !== 204) throw new Error("INSERTION_DELETE_FAILED");
  };
  const deleteSelected = () => {
    if (!active?.element?.isConnected) return;
    const insertionRoot = active.element.closest("[data-reframe-insertion]") || (active.element.hasAttribute("data-reframe-insertion") ? active.element : null);
    const insertionId = insertionRoot?.getAttribute("data-reframe-insertion-id") || insertionRoot?.getAttribute("data-reframe-insertion");
    if (insertionId && insertionRoot) {
      pushEditHistory();
      const node = insertionRoot;
      void deleteInsertion(insertionId).then(() => {
        node.remove();
        renderLayersTree();
        resetEditHistory();
        clearSelection("Pasted element deleted", false);
        explain("Deleted");
      }).catch(() => explain("Could not delete pasted element"));
      return;
    }
    pushEditHistory();
    setPreviewStyle("display", "none");
    pushEditHistory();
    explain("Hidden — Save to persist, or Undo");
  };
  const annointHasContent = () => annointDraft.strokes.length > 0 || annointDraft.texts.length > 0;
  const annointPagePoint = (event) => viewportToPage(event.clientX, event.clientY);
  const migrateAnnointStroke = (stroke) => {
    if (stroke.coordSpace === "page") return stroke;
    if (stroke.tool === "circle" && stroke.cx !== undefined) {
      const [cx, cy] = viewportToPage(stroke.cx, stroke.cy);
      return { ...stroke, cx, cy, r: (stroke.r || 24) / canvasZoom, coordSpace: "page" };
    }
    return { ...stroke, points: stroke.points?.map(([x, y]) => viewportToPage(x, y)) || [], coordSpace: "page" };
  };
  const migrateAnnointText = (node) => {
    if (node.coordSpace === "page") return node;
    const [x, y] = viewportToPage(node.x, node.y);
    return { ...node, x, y, coordSpace: "page" };
  };
  const migrateAnnointDraft = (draft) => ({ strokes: (draft.strokes || []).map(migrateAnnointStroke), texts: (draft.texts || []).map(migrateAnnointText) });
  const syncAnnointSvgViewport = () => { if (!annointSvg) return; annointSvg.setAttribute("viewBox", "0 0 " + innerWidth + " " + innerHeight); annointSvg.setAttribute("width", String(innerWidth)); annointSvg.setAttribute("height", String(innerHeight)); };
  const syncAnnointLayer = () => { if (!annointLayer) return; const show = annotationsVisible && (commentMode || annointHasContent()); annointLayer.hidden = !show; annointLayer.setAttribute("data-reframe-annoint-active", String(commentMode)); };
  let annointScrollFrame;
  const syncAnnointScroll = () => { if (!annointHasContent() && !commentPointer) return; if (!annointScrollFrame) annointScrollFrame = requestAnimationFrame(() => { annointScrollFrame = undefined; renderAnnoints(); }); };
  const loadAnnoints = async () => { const routes = annointRouteCandidates(); debugLog("browser-client:loadAnnoints", "loading annoints", { routes }, "H1"); try { let current; let matchedRoute; for (const currentRoute of routes) { const value = await annointFetch("?route=" + encodeURIComponent(currentRoute)); current = (value.annoints || [])[0]; if (current) { matchedRoute = currentRoute; break; } } debugLog("browser-client:loadAnnoints", "annoints loaded", { routes, matchedRoute, id: current?.id, strokes: current?.strokes?.length ?? 0, texts: current?.texts?.length ?? 0 }, "H1"); if (!current) { annointId = undefined; annointDraft = { strokes: [], texts: [] }; renderAnnoints(); return; } annointId = current.id; annointDraft = migrateAnnointDraft({ strokes: current.strokes || [], texts: current.texts || [] }); renderAnnoints(); } catch (error) { debugLog("browser-client:loadAnnoints", "annoints load failed", { routes, code: error?.message || "ANNOINT_REQUEST_FAILED" }, "H1"); } };
  const renderAnnoints = () => { if (!annointSvg) return; syncAnnointSvgViewport(); annointSvg.replaceChildren(); syncAnnointLayer(); if (!annotationsVisible) return; for (const stroke of annointDraft.strokes) { if (stroke.tool === "circle" && stroke.cx !== undefined) { const [cx, cy] = pageToViewport(stroke.cx, stroke.cy); const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle"); circle.setAttribute("cx", String(cx)); circle.setAttribute("cy", String(cy)); circle.setAttribute("r", String((stroke.r || 24) * canvasZoom)); circle.setAttribute("stroke", stroke.color || "#f59e0b"); circle.setAttribute("stroke-width", String((stroke.width || 2) * canvasZoom)); circle.setAttribute("fill", "none"); annointSvg.append(circle); } else if (stroke.points?.length) { const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", "M" + stroke.points.map(([x, y]) => { const [vx, vy] = pageToViewport(x, y); return vx + " " + vy; }).join(" L")); path.setAttribute("stroke", stroke.color || "#f59e0b"); path.setAttribute("stroke-width", String((stroke.width || 2) * canvasZoom)); path.setAttribute("fill", "none"); annointSvg.append(path); } } for (const node of annointDraft.texts) { const [x, y] = pageToViewport(node.x, node.y); const text = document.createElementNS("http://www.w3.org/2000/svg", "text"); text.setAttribute("x", String(x)); text.setAttribute("y", String(y)); text.setAttribute("fill", node.color || "#f5f5f7"); text.setAttribute("font-size", String((node.fontSize || 16) * canvasZoom)); text.textContent = node.text; annointSvg.append(text); } };
  const renderHeatmap = () => { if (!heatmapLayer) return; heatmapLayer.replaceChildren(); if (!heatmapVisible) { heatmapLayer.hidden = true; return; } heatmapLayer.hidden = false; const cols = 12; const rows = 8; const cellW = innerWidth / cols; const cellH = innerHeight / rows; const counts = Array.from({ length: cols * rows }, () => 0); const interactive = [...document.querySelectorAll("a,button,input,select,textarea,[role=button],[onclick]")].filter((element) => element instanceof HTMLElement && !host.contains(element)); for (const element of interactive) { const rect = element.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) continue; const weight = rect.width * rect.height < 2_500 ? 2 : 1; const col = Math.min(cols - 1, Math.max(0, Math.floor((rect.left + rect.width / 2) / cellW))); const row = Math.min(rows - 1, Math.max(0, Math.floor((rect.top + rect.height / 2) / cellH))); counts[row * cols + col] += weight; } const max = Math.max(1, ...counts); for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) { const score = counts[row * cols + col] / max; if (!score) continue; const cell = document.createElement("div"); cell.className = "heatmap-cell"; cell.style.left = col * cellW + "px"; cell.style.top = row * cellH + "px"; cell.style.width = cellW + "px"; cell.style.height = cellH + "px"; cell.style.background = score > .66 ? "rgba(239,68,68,.35)" : score > .33 ? "rgba(245,158,11,.28)" : "rgba(34,197,94,.22)"; heatmapLayer.append(cell); } };
  const isInPeekHotzone = (x, y) => x >= 0 && y >= 0 && x <= PEEK_HOTZONE && y <= PEEK_HOTZONE;
  const peekChromeRects = () => {
    const rects = [];
    if (chrome) rects.push(chrome.getBoundingClientRect());
    if (toolRail && !toolRail.hidden) rects.push(toolRail.getBoundingClientRect());
    if (layersPanel && !layersPanel.hidden) rects.push(layersPanel.getBoundingClientRect());
    return rects;
  };
  const isPointerInPeekChrome = (x, y) => peekChromeRects().some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  const syncUiPeek = () => { host.dataset.reframeUiPeek = uiPeeking ? "true" : "false"; if (uiPeeking) scheduleGeometry(); };
  const clearUiPeek = () => { if (!uiPeeking) return; uiPeeking = false; syncUiPeek(); };
  const updateUiPeek = (event) => {
    if (activeTool !== "select" || commentMode) { clearUiPeek(); return; }
    const { clientX: x, clientY: y } = event;
    const inHotzone = isInPeekHotzone(x, y);
    const inChrome = isPointerInPeekChrome(x, y);
    if (uiPeeking) { if (!inHotzone || inChrome) clearUiPeek(); return; }
    if (inHotzone && !inChrome) { uiPeeking = true; syncUiPeek(); }
  };
  const syncMinimalUi = () => { if (!chrome) return; chrome.dataset.reframeMinimalUi = String(toolbarCollapsed); };
  const syncChromeVisibility = () => { if (!chrome) return; chrome.dataset.reframeChromeVisible = String(chromeVisible); };
  const clearChromeHideTimer = () => { if (chromeHideTimer) { clearTimeout(chromeHideTimer); chromeHideTimer = undefined; } };
  const isNearChromeHotspot = (x, y) => x >= 0 && y >= 0 && x <= CHROME_PROXIMITY && y <= CHROME_PROXIMITY;
  const shouldKeepChromeVisible = () => !toolbarCollapsed;
  const isPointerOverChrome = (event) => (event.composedPath?.() || [event.target]).some((node) => node === chrome || node === chromeHitZone || node === statusChip || node === collapseButton);
  const showChrome = () => { if (chromeVisible) return; chromeVisible = true; syncChromeVisibility(); };
  const hideChrome = () => { if (shouldKeepChromeVisible() || !chromeVisible) return; chromeVisible = false; syncChromeVisibility(); };
  const scheduleHideChrome = () => { if (shouldKeepChromeVisible()) return; clearChromeHideTimer(); chromeHideTimer = setTimeout(() => { if (shouldKeepChromeVisible() || !chromeVisible) return; hideChrome(); }, CHROME_HIDE_DELAY_MS); };
  const onChromePointerMove = (event) => { if (shouldKeepChromeVisible()) return; if (isNearChromeHotspot(event.clientX, event.clientY) || isPointerOverChrome(event)) { showChrome(); clearChromeHideTimer(); return; } if (chromeVisible) scheduleHideChrome(); };
  const flushChromePointerMove = () => {
    chromeMoveFrame = undefined;
    onChromePointerMove({ clientX: lastPointer.x, clientY: lastPointer.y, composedPath: () => [] });
  };
  const onGlobalPointerMove = (event) => {
    lastPointer = { x: event.clientX, y: event.clientY };
    onDocumentPointerMove(event);
    updateUiPeek(event);
    if (shouldKeepChromeVisible()) return;
    if (!chromeMoveFrame) chromeMoveFrame = requestAnimationFrame(flushChromePointerMove);
  };
  const onChromePointerLeave = (event) => { if (shouldKeepChromeVisible() || !chromeVisible || isPointerOverChrome(event)) return; scheduleHideChrome(); };
  const onChromePointerEnter = () => { if (shouldKeepChromeVisible()) return; showChrome(); clearChromeHideTimer(); };
  const onChromePointerDown = () => { if (shouldKeepChromeVisible()) return; showChrome(); clearChromeHideTimer(); };
  const onChromeFocusIn = () => { if (shouldKeepChromeVisible()) return; showChrome(); clearChromeHideTimer(); };
  const onChromeHitZoneClick = (event) => { event.stopPropagation(); showChrome(); clearChromeHideTimer(); if (toolbarCollapsed) toggleToolbarCollapsed(); };
  const syncToolbarCollapsed = () => { if (!statusChip || !collapseButton) return; statusChip.dataset.reframeCollapsed = String(toolbarCollapsed); collapseButton.setAttribute("aria-expanded", String(!toolbarCollapsed)); collapseButton.setAttribute("aria-label", toolbarCollapsed ? "Expand toolbar" : "Collapse toolbar"); iconify(collapseButton, toolbarCollapsed ? "expand" : "collapse", toolbarCollapsed ? "Expand toolbar" : "Collapse toolbar"); syncMinimalUi(); if (toolbarCollapsed) { showChrome(); scheduleHideChrome(); } else { showChrome(); clearChromeHideTimer(); } };
  const toggleToolbarCollapsed = () => { toolbarCollapsed = !toolbarCollapsed; try { sessionStorage.setItem("reframe.toolbar.collapsed", String(toolbarCollapsed)); } catch { /* ponytail: session preference is optional */ } syncToolbarCollapsed(); };
  const toggleHeatmap = () => { heatmapVisible = !heatmapVisible; if (heatmapToggle) { heatmapToggle.setAttribute("aria-pressed", String(heatmapVisible)); heatmapToggle.setAttribute("aria-label", heatmapVisible ? "Hide UX heatmap" : "Show UX heatmap"); } renderHeatmap(); };
  const syncCommentModeUi = () => { if (!commentMode || !active) return; if (panel) panel.hidden = true; if (contextBar) contextBar.hidden = true; if (aiPanel && !(aiReview?.status === "review" || aiReview?.status === "generating")) aiPanel.hidden = true; };
  const exitCommentMode = () => { if (!commentMode) return; commentMode = false; commentPointer = undefined; annointPointer = undefined; selectedImageId = undefined; endCommentPointerTracking(); endImageDrag(); if (commentModeToggle) { commentModeToggle.setAttribute("aria-pressed", "false"); commentModeToggle.setAttribute("aria-label", "Comment mode"); } if (activeTool === "comment") activeTool = "select"; selectMode = activeTool === "select" || activeTool === "text"; syncAnnointLayer(); syncEditToolbar(); syncToolUi(); };
  const enterCommentMode = () => { if (commentMode) return; commentMode = true; clearUiPeek(); activeTool = "comment"; if (selectMode) { selectMode = false; hideHover(); } if (active) void flushAutosave().then(() => clearSelection("Comment mode — selection cleared", false)); if (commentModeToggle) { commentModeToggle.setAttribute("aria-pressed", "true"); commentModeToggle.setAttribute("aria-label", "Exit comment mode"); } commentHistory = [commentSnapshot()]; commentHistoryIndex = 0; syncCommentUndoButtons(); syncAnnointLayer(); syncEditToolbar(); syncToolUi(); void loadAnnoints(); explain("Comment mode: draw · paste image · Ctrl+Z undo"); };
  const toggleCommentMode = () => { if (commentMode) exitCommentMode(); else enterCommentMode(); };
  const pinCommentAt = (event) => { const result = candidateFrom(event); if (!result.element) { explain(result.reason || "Click a page element to add a comment"); return; } if (active?.element !== result.element) { if (active) void flushAutosave().then(() => { clearSelection("Previous preview saved", false); choose(result.element); syncCommentModeUi(); openAnnotations(true); }); else { choose(result.element); syncCommentModeUi(); openAnnotations(true); } return; } syncCommentModeUi(); openAnnotations(true); };
  const screenshotCache = new Map();
  let currentRoute = location.pathname + location.search + location.hash;
  const performanceMetrics = { hover: [], preview: [], timeMachine: [], historyList: [] };
  const pageErrors = [];
  const rememberError = (value) => {
    pageErrors.push(String(value || "PAGE_ERROR").slice(0, 128));
    if (pageErrors.length > 16) pageErrors.shift();
  };
  const onPageError = (event) => rememberError(event.message || event.error?.message);
  const onUnhandledRejection = (event) => rememberError(event.reason?.message || event.reason);
  const recordMetric = (name, started) => {
    const values = performanceMetrics[name];
    values.push(performance.now() - started);
    if (values.length > 1000) values.shift();
  };

  const correlation = (prefix) => prefix + "_" + crypto.randomUUID().replaceAll("-", "");
  const tabId = correlation("tab");
  const setState = (next) => {
    state = next;
    host.dataset.reframeState = next;
    const label = next[0].toUpperCase() + next.slice(1);
    if (stateLabel) stateLabel.textContent = label;
    stateLabel?.closest(".status-chip")?.setAttribute("title", label);
    if (temporaryLabel) temporaryLabel.hidden = next === "connected";
    updateApplyState();
    renderHistory();
  };
  const clearPending = () => {
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear();
  };
  const send = (message) => {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  };
  const base = (type, correlationId) => ({ type, protocol: PROTOCOL, correlationId, sessionId: session });
  let historyRetryTimer;
  let historyRequestTimer;
  let annotationRequestTimer;
  const requestHistory = () => send({ ...base("history:request", correlation("history")), route: route(), viewport: { width: innerWidth, height: innerHeight } });
  const scheduleHistoryRequest = () => {
    if (historyRequestTimer) clearTimeout(historyRequestTimer);
    historyRequestTimer = setTimeout(() => { historyRequestTimer = undefined; requestHistory(); }, 250);
  };
  const requestAnnotations = () => send({ ...base("annotation:list", correlation("annotation")), route: route(), checkpointId: historyState.currentId });
  const scheduleAnnotationRequest = () => {
    if (annotationRequestTimer) clearTimeout(annotationRequestTimer);
    annotationRequestTimer = setTimeout(() => { annotationRequestTimer = undefined; requestAnnotations(); }, 200);
  };
  const scheduleHistoryRetry = () => {
    if (historyRetryTimer) clearTimeout(historyRetryTimer);
    historyRetryTimer = undefined;
    historyRetryTimer = setTimeout(() => {
      historyRetryTimer = undefined;
      if (disposed || state !== "connected") return;
      if (!historyState.checkpoints.length) requestHistory();
    }, 400);
  };
  const FIGMA_PASTE_HINT = "Figma native copy won't paste as a design. Use Right-click → Copy/Paste as → Copy as PNG (full look) or Copy as CSS (editable layers), then Ctrl+V.";
  const FIGMA_NO_STYLE_HINT = "This paste has no styling. In Figma use Copy as PNG or Copy as CSS, then Ctrl+V.";
  const FIGMA_PASTE_OK = "Pasted from clipboard";
  const PASTE_STYLE_THRESHOLD = 10;
  const PASTE_IMAGE_MAX_VP = 0.9;
  const TOOL_SHORTCUT_FIELD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
  const isToolShortcutField = (node) => {
    if (!node || !(node instanceof Element)) return false;
    if (node.closest?.("[data-reframe-no-tool-shortcuts]")) return true;
    if (TOOL_SHORTCUT_FIELD_TAGS.has(node.tagName)) return true;
    return node instanceof HTMLElement && node.isContentEditable;
  };
  const eventDeepTarget = (event) => {
    const path = event.composedPath?.();
    if (path?.length) return path[0];
    return event.target;
  };
  const focusedShadowField = () => {
    if (document.activeElement !== host) return null;
    const focused = root.activeElement;
    return isToolShortcutField(focused) ? focused : null;
  };
  const blocksToolShortcuts = (event) => {
    const deep = eventDeepTarget(event);
    if (isToolShortcutField(deep)) return true;
    if (isToolShortcutField(event.target)) return true;
    return Boolean(focusedShadowField());
  };
  const pasteEditableTarget = (target) => isToolShortcutField(target);
  const clipboardImageFrom = (clipboardData) => {
    if (!clipboardData) return null;
    for (const item of clipboardData.items || []) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file && (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name || ""))) return file;
    }
    return [...(clipboardData.files || [])].find((file) => file && file.type.startsWith("image/")) || null;
  };
  const clipboardHasFigmaNative = (clipboardData) => Boolean(clipboardData?.types && [...clipboardData.types].some((type) => /figma/i.test(type)));
  const looksLikeHtml = (text) => /<(?:html|body|div|span|svg|table|section|article|p|h[1-6]|ul|ol|li|header|footer|nav|main|img)\b/i.test(text);
  const clipboardFigmaCssText = (clipboardData) => {
    if (!clipboardData) return null;
    const types = new Set([...(clipboardData.types || [])]);
    const candidates = [];
    if (types.has("text/css")) candidates.push(clipboardData.getData("text/css"));
    candidates.push(clipboardData.getData("text/plain"));
    if (types.has("text/html")) candidates.push(clipboardData.getData("text/html"));
    for (const raw of candidates) {
      const text = raw?.trim();
      if (text && isFigmaCssExport(text)) return text;
    }
    return null;
  };
  const clipboardHasPasteable = (clipboardData) => {
    if (!clipboardData) return false;
    if (clipboardImageFrom(clipboardData)) return true;
    if (clipboardFigmaCssText(clipboardData)) return true;
    const types = new Set([...(clipboardData.types || [])]);
    if (types.has("text/html") || types.has("image/svg+xml") || types.has("text/css")) return true;
    const plain = clipboardData.getData("text/plain")?.trim();
    return Boolean(plain && (/^<svg[\s>]/i.test(plain) || looksLikeHtml(plain)));
  };
  const insertionTargetIsContainer = () => {
    const target = active?.element?.isConnected ? active.element : null;
    return Boolean(target && target !== document.body && target !== document.documentElement);
  };
  const wrapPastedCard = (node) => {
    const card = document.createElement("div");
    card.className = "reframe-pasted-card";
    card.dataset.reframePaste = "card";
    card.style.cssText = "display:block;max-width:100%;";
    card.append(node);
    return card;
  };
  const wrapPasteRoot = (html) => {
    const root = document.createElement("div");
    root.className = "reframe-paste-root";
    root.innerHTML = html;
    root.style.cssText = "display:block;max-width:100%;position:relative;isolation:isolate;";
    return root;
  };
  const showFigmaPasteOneTimeHint = () => {
    try {
      if (sessionStorage.getItem("reframe.figma-paste-hint")) return;
      sessionStorage.setItem("reframe.figma-paste-hint", "1");
      explain("Tip: In Figma use Copy as PNG (full look) or Copy as CSS (editable layers). Native Ctrl+C only copies unstyled text.");
    } catch { /* ponytail: session preference is optional */ }
  };

  const savePastedImage = async (file) => {
    const id = crypto.randomUUID();
    const natural = await readImageDimensions(file);
    const anchorX = lastPointer.x || innerWidth / 2;
    const anchorY = lastPointer.y || innerHeight / 2;
    const [anchorPageX, anchorPageY] = viewportToPage(anchorX, anchorY);
    const position = imagePlacement(null, natural.width, natural.height, anchorPageX, anchorPageY);
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
    try {
      const response = await fetch(annotationImagesEndpoint + "/" + id, { method: "PUT", cache: "no-store", credentials: "same-origin", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ route: route(), viewport: { width: innerWidth, height: innerHeight }, position, dataUrl }) });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.code || "ANNOTATION_IMAGE_SAVE_FAILED");
      const imageId = value.id || id;
      annotationState.annotations = [...annotationState.annotations, { id: imageId, kind: "image", route: route(), position: { ...position }, status: "open", imagePath: value.imagePath, resolution: "exact", checkpointRelationship: "current" }];
      debugLog("browser-client:savePastedImage", "image annotation saved", { id: value.id || id, route: route(), position }, "H11");
      scheduleAnnotations();
      explain("Image pasted");
      pushCommentHistory();
      requestAnnotations();
    } catch (error) {
      debugLog("browser-client:savePastedImage", "image annotation failed", { code: error?.message || "ANNOTATION_IMAGE_SAVE_FAILED" }, "H11");
      explain("Could not save pasted image");
    }
  };
  // ponytail: native Figma Ctrl+C does not expose DOM/HTML to the browser clipboard — Copy as PNG/CSS/SVG or export plugins are required.
  const sanitizeCssText = (value) => String(value || "")
    .replace(/@import\b[^;]*/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/behavior\s*:/gi, "")
    .replace(/url\s*\(\s*['"]?\s*javascript:/gi, "url(")
    .replace(/-moz-binding\s*:/gi, "");
  const countStyledElements = (html) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    let count = 0;
    const visual = /(?:background|border|display\s*:\s*(?:flex|grid|inline-flex|inline-grid)|flex-|grid-|color|font|padding|margin|width|height|border-radius|gap|align|justify|box-shadow|opacity)/i;
    for (const style of host.querySelectorAll("style")) {
      const text = sanitizeCssText(style.textContent).trim();
      if (text) count += Math.max(1, (text.match(/\{/g) || []).length);
    }
    for (const node of host.querySelectorAll("[style]")) {
      const inline = sanitizeCssText(node.getAttribute("style")).trim();
      if (inline && visual.test(inline)) count += 1;
    }
    for (const node of host.querySelectorAll("svg, img")) count += 1;
    return count;
  };
  const htmlHasNoStyling = (html) => countStyledElements(html) < 1;
  const htmlPrefersImagePaste = (html) => countStyledElements(html) < PASTE_STYLE_THRESHOLD;
  const sanitizeHtml = (html) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script, iframe, object, embed, link[rel=stylesheet], meta").forEach((node) => node.remove());
    for (const style of doc.querySelectorAll("style")) style.textContent = sanitizeCssText(style.textContent);
    for (const node of doc.querySelectorAll("*")) {
      for (const attr of [...node.attributes]) {
        if (/^on/i.test(attr.name) || attr.name === "srcdoc") node.removeAttribute(attr.name);
        if (attr.name === "href" && /^\s*javascript:/i.test(attr.value)) node.removeAttribute(attr.name);
        if (attr.name === "style") {
          const clean = sanitizeCssText(attr.value).trim();
          if (clean) node.setAttribute("style", clean);
          else node.removeAttribute("style");
        }
      }
    }
    return doc.body.innerHTML.trim();
  };
  const persistInsertion = async (id, type, html, dataUrl) => {
    const response = await fetch(insertionsEndpoint + "/" + id, { method: "PUT", cache: "no-store", credentials: "same-origin", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ route: route(), type, html, containerFingerprint: insertionFingerprint(), dataUrl }) });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.code || "INSERTION_SAVE_FAILED");
    return value;
  };
  const fileToDataUrl = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
  const insertDomNode = async (node, type, dataUrl) => {
    const id = crypto.randomUUID();
    node.setAttribute("data-reframe-insertion", id);
    node.setAttribute("data-reframe-insertion-id", id);
    const container = insertionContainer();
    container.appendChild(node);
    await persistInsertion(id, type, node.outerHTML, dataUrl);
    renderLayersTree();
    choose(node);
    explain(FIGMA_PASTE_OK);
    return node;
  };
  const pasteImageDimensions = (naturalWidth, naturalHeight) => {
    const maxWidth = Math.max(IMAGE_MIN_SIZE, innerWidth * PASTE_IMAGE_MAX_VP);
    if (!naturalWidth || !naturalHeight) return { width: maxWidth, height: Math.round(maxWidth * 0.75) };
    const scale = Math.min(1, maxWidth / naturalWidth);
    return { width: Math.max(IMAGE_MIN_SIZE, Math.round(naturalWidth * scale)), height: Math.max(IMAGE_MIN_SIZE, Math.round(naturalHeight * scale)) };
  };
  const pasteImagePlacement = (naturalWidth, naturalHeight) => {
    const dims = pasteImageDimensions(naturalWidth, naturalHeight);
    const x = Math.max(8, Math.round((innerWidth - dims.width) / 2));
    const y = Math.max(56, Math.round((innerHeight - dims.height) / 2));
    return { x, y, width: dims.width, height: dims.height };
  };
  const insertPastedImageDom = async (file) => {
    const natural = await readImageDimensions(file);
    const dataUrl = await fileToDataUrl(file);
    const img = document.createElement("img");
    img.alt = "Pasted design from Figma";
    img.src = dataUrl;
    if (insertionTargetIsContainer()) {
      const dims = pasteImageDimensions(natural.width, natural.height);
      img.style.cssText = "display:block;width:100%;max-width:min(90vw," + dims.width + "px);height:auto;margin:0 auto;";
      const card = wrapPastedCard(img);
      card.classList.add("reframe-pasted-design");
      card.style.cssText += "margin:0 auto;max-width:min(90vw," + dims.width + "px);box-shadow:0 8px 32px rgb(0 0 0/.18);border-radius:8px;outline:1px dashed rgb(139 92 246/.45);";
      await insertDomNode(card, "image", dataUrl);
      explain("Pasted Figma PNG");
      return;
    }
    const position = pasteImagePlacement(natural.width, natural.height);
    const wrap = document.createElement("div");
    wrap.className = "reframe-pasted-card reframe-pasted-design";
    wrap.dataset.reframePaste = "card";
    wrap.style.cssText = "position:absolute;left:" + position.x + "px;top:" + position.y + "px;width:" + position.width + "px;height:" + position.height + "px;z-index:10;display:block;box-shadow:0 8px 32px rgb(0 0 0/.18);border-radius:8px;outline:1px dashed rgb(139 92 246/.45);";
    img.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;border-radius:8px;";
    wrap.append(img);
    await insertDomNode(wrap, "image", dataUrl);
    explain("Pasted Figma PNG");
  };
  const insertFigmaCssSnippet = async (text) => {
    const parsed = parseFigmaCssExport(text);
    if (!parsed.layerCount) throw new Error("FIGMA_CSS_EMPTY");
    const snippet = "<style>" + sanitizeCssText(parsed.css) + "</style>" + parsed.html;
    await insertDomNode(wrapPasteRoot(snippet), "html");
    explain("Pasted Figma CSS (" + parsed.layerCount + " layers)");
  };
  const insertHtmlSnippet = async (html) => {
    const clean = sanitizeHtml(html);
    if (!clean) throw new Error("INSERTION_HTML_EMPTY");
    if (htmlHasNoStyling(clean)) {
      explain(FIGMA_NO_STYLE_HINT);
      throw new Error("INSERTION_HTML_UNSTYLED");
    }
    await insertDomNode(wrapPasteRoot(clean), "html");
  };
  const insertSvgSnippet = async (svgText) => {
    const clean = sanitizeHtml(svgText);
    const host = document.createElement("div");
    host.innerHTML = clean;
    const svg = host.querySelector("svg") || host.firstElementChild;
    if (!svg || svg.tagName?.toLowerCase() !== "svg") throw new Error("INSERTION_SVG_INVALID");
    if (!svg.getAttribute("width") && !svg.getAttribute("height")) {
      const viewBox = svg.getAttribute("viewBox");
      if (viewBox) {
        const parts = viewBox.trim().split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
          svg.setAttribute("width", String(parts[2]));
          svg.setAttribute("height", String(parts[3]));
        }
      }
    }
    svg.style.maxWidth = "100%";
    svg.style.height = "auto";
    svg.style.display = "block";
    await insertDomNode(wrapPastedCard(svg), "svg");
  };
  const clipboardSvgTextAsync = async (clipboardData) => {
    if (!clipboardData) return null;
    const plain = clipboardData.getData("text/plain")?.trim();
    if (plain && /^<svg[\s>]/i.test(plain)) return plain;
    const html = clipboardData.getData("text/html")?.trim();
    if (html && /<svg[\s>]/i.test(html)) return html;
    for (const item of clipboardData.items || []) {
      if (item.type !== "image/svg+xml") continue;
      const text = await new Promise((resolve) => { try { item.getAsString(resolve); } catch { resolve(""); } });
      if (text?.trim()) return text.trim();
    }
    return null;
  };
  const clipboardHtml = (clipboardData) => {
    if (!clipboardData) return null;
    const html = clipboardData.getData("text/html")?.trim();
    if (!html || html === clipboardData.getData("text/plain")?.trim()) return null;
    return html;
  };
  const pasteHtmlOrPreferImage = async (html, file) => {
    const clean = sanitizeHtml(html);
    if (!clean) return false;
    if (file && htmlPrefersImagePaste(clean)) {
      await insertPastedImageDom(file);
      return true;
    }
    if (htmlHasNoStyling(clean)) {
      if (file) { await insertPastedImageDom(file); return true; }
      explain(FIGMA_NO_STYLE_HINT);
      return false;
    }
    await insertDomNode(wrapPasteRoot(clean), "html");
    explain(FIGMA_PASTE_OK);
    return true;
  };
  const pasteFromClipboard = async (clipboardData) => {
    if (!selectMode) setActiveTool("select");
    const figmaCssText = clipboardFigmaCssText(clipboardData);
    if (figmaCssText) { await insertFigmaCssSnippet(figmaCssText); return true; }
    if (clipboardHasFigmaNative(clipboardData) && !clipboardHasPasteable(clipboardData)) {
      explain(FIGMA_PASTE_HINT);
      return false;
    }
    const file = clipboardImageFrom(clipboardData);
    const html = clipboardHtml(clipboardData);
    if (html && await pasteHtmlOrPreferImage(html, file)) return true;
    const svgText = await clipboardSvgTextAsync(clipboardData);
    if (svgText) { await insertSvgSnippet(svgText); return true; }
    if (file) { await insertPastedImageDom(file); return true; }
    const plain = clipboardData.getData("text/plain")?.trim();
    if (plain) {
      if (isFigmaCssExport(plain)) { await insertFigmaCssSnippet(plain); return true; }
      if (/^<svg[\s>]/i.test(plain)) { await insertSvgSnippet(plain); return true; }
      if (looksLikeHtml(plain)) {
        if (await pasteHtmlOrPreferImage(plain, file)) return true;
      }
    }
    explain(FIGMA_PASTE_HINT);
    return false;
  };
  const pasteFromClipboardItems = async (items) => {
    for (const item of items) {
      for (const type of ["text/css", "text/plain"]) {
        if (!item.types.includes(type)) continue;
        const text = (await (await item.getType(type)).text()).trim();
        if (text && isFigmaCssExport(text)) { await insertFigmaCssSnippet(text); return true; }
      }
    }
    let html = "";
    let imageBlob = null;
    let imageType = "image/png";
    for (const item of items) {
      if (!html && item.types.includes("text/html")) html = await (await item.getType("text/html")).text();
      if (!imageBlob) {
        for (const type of item.types) {
          if (!type.startsWith("image/") || type === "image/svg+xml") continue;
          imageBlob = await item.getType(type);
          imageType = type;
          break;
        }
      }
    }
    if (html.trim()) {
      const file = imageBlob ? new File([imageBlob], "paste." + (imageType.split("/")[1] || "png"), { type: imageType }) : null;
      if (await pasteHtmlOrPreferImage(html, file)) return true;
    }
    for (const item of items) {
      if (!item.types.includes("image/svg+xml")) continue;
      const svg = await (await item.getType("image/svg+xml")).text();
      if (svg.trim()) { await insertSvgSnippet(svg); return true; }
    }
    if (imageBlob) {
      const ext = imageType.split("/")[1] || "png";
      await insertPastedImageDom(new File([imageBlob], "paste." + ext, { type: imageType }));
      return true;
    }
    for (const item of items) {
      if (!item.types.includes("text/plain")) continue;
      const plain = (await (await item.getType("text/plain")).text()).trim();
      if (isFigmaCssExport(plain)) { await insertFigmaCssSnippet(plain); return true; }
      if (/^<svg[\s>]/i.test(plain)) { await insertSvgSnippet(plain); return true; }
      if (looksLikeHtml(plain) && await pasteHtmlOrPreferImage(plain, null)) return true;
    }
    return false;
  };
  const triggerPasteFromFigma = async () => {
    showFigmaPasteOneTimeHint();
    if (!selectMode) setActiveTool("select");
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        if (items.length && await pasteFromClipboardItems(items)) return;
      }
    } catch { /* ponytail: clipboard.read needs a user gesture and permission */ }
    explain(FIGMA_PASTE_HINT);
  };
  const onPasteContent = (event) => {
    if (referenceDialog && !referenceDialog.hidden) return;
    if (blocksToolShortcuts(event)) return;
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;
    if (commentMode) {
      const file = clipboardImageFrom(clipboardData);
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      void savePastedImage(file);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void pasteFromClipboard(clipboardData).catch(() => explain(FIGMA_PASTE_HINT));
  };
  const onAnnotatePaste = (event) => onPasteContent(event);
  const closeAnnotations = () => { if (!annotationDialog || annotationDialog.hidden) return; annotationDialog.hidden = true; comments?.setAttribute("aria-expanded", "false"); annotationFocus?.focus?.(); annotationFocus = undefined; };
  const formatAnnotationDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); };
  const syncAnnotationsToggle = () => { if (!annotationsToggle) return; annotationsToggle.setAttribute("aria-pressed", String(annotationsVisible)); annotationsToggle.setAttribute("aria-label", annotationsVisible ? "Hide annotation overlays" : "Show annotation overlays"); iconify(annotationsToggle, annotationsVisible ? "annotationsVisible" : "annotationsHidden", annotationsVisible ? "Hide annotation overlays" : "Show annotation overlays"); annotationLayer?.setAttribute("data-reframe-annotations-hidden", annotationsVisible ? "false" : "true"); };
  const toggleAnnotationsVisible = () => { annotationsVisible = !annotationsVisible; try { sessionStorage.setItem("reframe.annotations.visible", String(annotationsVisible)); } catch { /* ponytail: session preference is optional */ } syncAnnotationsToggle(); if (!annotationsVisible) closeAnnotations(); scheduleAnnotations(); renderAnnoints(); };
  const annotationAction = (annotation, action) => { const confirmed = action !== "promote" || confirm("Create a separate Design DNA proposal from this comment? Design DNA will not change until Phase 9 review accepts it."); if (!confirmed) return; send({ ...base("annotation:action", correlation("annotation")), annotationId: annotation.id, action, confirmed }); };
  const placeAnnotationOverlay = (layer, className, rect, highlight) => { const box = document.createElement("div"); box.className = className; if (highlight) { box.style.left = rect.left + highlight.x * rect.width + "px"; box.style.top = rect.top + highlight.y * rect.height + "px"; box.style.width = highlight.width * rect.width + "px"; box.style.height = highlight.height * rect.height + "px"; } else { box.style.left = Math.max(0, rect.left) + "px"; box.style.top = Math.max(0, rect.top) + "px"; box.style.width = Math.max(0, rect.width) + "px"; box.style.height = Math.max(0, rect.height) + "px"; } layer.append(box); };
  const renderAnnotationList = () => {
    if (!annotationList) return; annotationList.replaceChildren(); const current = annotationState.annotations.filter((item) => item.route === route());
    if (annotationSummary) annotationSummary.textContent = current.length + " on this route · " + annotationState.parsedFiles + " saved in project";
    for (const annotation of current) {
      const item = document.createElement("article"); item.className = "annotation-item annotation-card";
      const header = document.createElement("div"); header.className = "annotation-card-head";
      const left = document.createElement("div");
      const chip = document.createElement("span"); chip.className = "annotation-chip"; chip.textContent = annotation.component;
      const title = document.createElement("p"); title.className = "annotation-item-title"; title.textContent = annotation.author;
      const time = document.createElement("span"); time.className = "annotation-time"; time.textContent = relativeTime(annotation.createdAt);
      left.append(chip, title, time);
      const status = document.createElement("span"); status.className = "annotation-status " + annotation.status; status.textContent = annotation.status;
      header.append(left, status);
      const meta = document.createElement("p"); meta.className = "annotation-meta"; meta.textContent = annotation.source.path + ":" + annotation.source.line + (annotation.checkpointRelationship === "other" ? " · another checkpoint" : "");
      const content = document.createElement("p"); content.className = "annotation-item-comment"; content.textContent = annotation.comment;
      const anchor = document.createElement("p"); anchor.className = "annotation-item-highlight"; anchor.textContent = annotation.highlight ? "● Highlighted on page" : "● Anchored to element";
      const actions = document.createElement("div"); actions.className = "annotation-item-actions";
      const toggle = document.createElement("button"); toggle.className = "button"; toggle.type = "button"; toggle.textContent = annotation.status === "resolved" ? "Reopen" : "Resolve"; toggle.addEventListener("click", () => annotationAction(annotation, annotation.status === "resolved" ? "reopen" : "resolve"), { once: true });
      const promote = document.createElement("button"); promote.className = "button"; promote.type = "button"; promote.textContent = "Propose Design DNA rule"; promote.addEventListener("click", () => annotationAction(annotation, "promote"), { once: true });
      actions.append(toggle, promote); item.append(header, meta, content, anchor, actions); annotationList.append(item);
    }
    for (const issue of annotationState.issues) { const item = document.createElement("article"); item.className = "annotation-item"; const title = document.createElement("strong"); title.textContent = "Needs review · " + issue.resolution; const detail = document.createElement("p"); detail.textContent = issue.file + " · " + issue.error; item.append(title, detail); annotationList.append(item); }
    if (!current.length && !annotationState.issues.length) { const empty = document.createElement("p"); empty.textContent = "No comments for this route."; annotationList.append(empty); }
  };
  const renderAnnotations = () => {
    annotationFrame = undefined; if (!annotationLayer) return; annotationLayer.replaceChildren(); let visible = 0;
    for (const annotation of annotationState.annotations) {
      if (annotation.route !== route() || annotation.status !== "open" || annotation.checkpointRelationship === "other" || !["exact", "relocated"].includes(annotation.resolution)) continue;
      if (annotation.kind === "image" && annotation.position && annotation.imagePath) {
        visible += 1; if (!annotationsVisible) continue;
        const wrap = document.createElement("div");
        wrap.className = "annotation-image-wrap" + (selectedImageId === annotation.id && commentMode ? " selected" : "");
        const stored = migrateImagePosition(annotation.position);
        const width = stored.width || defaultImageDimensions().width;
        const height = stored.height || defaultImageDimensions().height;
        const [vx, vy] = pageToViewport(stored.x, stored.y);
        wrap.style.left = Math.max(0, vx) + "px";
        wrap.style.top = Math.max(0, vy) + "px";
        wrap.style.width = width * canvasZoom + "px";
        wrap.style.height = height * canvasZoom + "px";
        wrap.dataset.reframeImageId = annotation.id;
        const img = document.createElement("img");
        img.alt = "Pasted annotation image";
        img.style.objectFit = "contain";
        const applyLoadedDimensions = (naturalWidth, naturalHeight) => {
          if (!stored.width || !stored.height) {
            const next = imagePlacement(stored, naturalWidth, naturalHeight);
            const item = annotationState.annotations.find((entry) => entry.id === annotation.id);
            if (item) item.position = next;
            const [nextVx, nextVy] = pageToViewport(next.x, next.y);
            wrap.style.left = nextVx + "px";
            wrap.style.top = nextVy + "px";
            wrap.style.width = next.width * canvasZoom + "px";
            wrap.style.height = next.height * canvasZoom + "px";
            if (!imageMigrated.has(annotation.id)) {
              imageMigrated.add(annotation.id);
              void updateImageAnnotation(annotation.id, next, true);
            }
          }
        };
        void fetch(annotationImagesEndpoint + "/" + annotation.id, { cache: "no-store", credentials: "same-origin", headers: { Authorization: "Bearer " + token } }).then((response) => response.ok ? response.blob() : null).then((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          img.onload = () => { applyLoadedDimensions(img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); };
          img.src = url;
        });
        wrap.append(img);
        if (commentMode) {
          wrap.style.pointerEvents = "auto";
          wrap.addEventListener("pointerdown", (event) => onImagePointerDown(event, annotation.id), { capture: true });
          if (selectedImageId === annotation.id) {
            const del = document.createElement("button");
            del.className = "annotation-image-delete";
            del.type = "button";
            del.textContent = "Delete";
            del.setAttribute("aria-label", "Delete pasted image");
            del.addEventListener("click", (event) => { event.stopPropagation(); pushCommentHistory(); void deleteImageAnnotation(annotation.id).then(() => pushCommentHistory()); }, { once: true });
            wrap.append(del);
            for (const handleName of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
              const handle = document.createElement("button");
              handle.className = "annotation-image-handle " + handleName;
              handle.type = "button";
              handle.setAttribute("aria-label", "Resize image");
              handle.addEventListener("pointerdown", (event) => onImageResizeDown(event, annotation.id, handleName), { capture: true });
              wrap.append(handle);
            }
          }
        }
        annotationLayer.append(wrap);
        continue;
      }
      const element = findFingerprint(annotation.fingerprint); if (!element) continue; visible += 1; if (!annotationsVisible) continue; const rect = element.getBoundingClientRect(); placeAnnotationOverlay(annotationLayer, "annotation-element-outline", rect); if (annotation.highlight) placeAnnotationOverlay(annotationLayer, "annotation-highlight", rect, annotation.highlight); const pin = document.createElement("button"); pin.className = "annotation-pin"; pin.type = "button"; pin.textContent = String(visible); pin.setAttribute("aria-label", "Open comment by " + annotation.author + " on " + annotation.component); pin.style.left = Math.max(0, Math.min(innerWidth - 22, rect.right - 10)) + "px"; pin.style.top = Math.max(12, Math.min(innerHeight - 22, rect.top - 10)) + "px"; pin.addEventListener("click", () => { openAnnotations(false); }, { once: true }); annotationLayer.append(pin);
    }
    if (comments) { comments.setAttribute("aria-label", "Comments (" + visible + ")"); if (commentsBadge) { commentsBadge.textContent = visible > 0 ? String(visible) : ""; commentsBadge.hidden = visible === 0; } }
    if (annotationDialog && !annotationDialog.hidden) renderAnnotationList();
  };
  const scheduleAnnotations = () => {
    if (!annotationsVisible && !commentMode) return;
    if (!annotationFrame) annotationFrame = requestAnimationFrame(renderAnnotations);
  };
  const openAnnotations = (compose = true) => { if (!annotationDialog) return; annotationFocus = root.activeElement; annotationDialog.hidden = false; comments?.setAttribute("aria-expanded", "true"); const canCompose = Boolean(compose && active && ["exact", "probable"].includes(active.mappingConfidence) && active.mappingSource); if (annotationForm) annotationForm.hidden = !canCompose; renderAnnotationList(); (canCompose ? annotationComment : annotationClose)?.focus?.(); if (compose && !canCompose) explain("Select an exactly mapped element before adding a comment"); };
  const onAnnotationSubmit = (event) => { event.preventDefault(); if (!active?.mappingSource || !["exact", "probable"].includes(active.mappingConfidence)) return explain("Exact or probable source mapping is required"); const author = annotationAuthor?.value.trim(); const comment = annotationComment?.value.trim(); if (!author || !comment) return explain("Author and comment are required"); const sent = send({ ...base("annotation:create", correlation("annotation")), author, component: active.element.getAttribute("data-reframe-component") || labelFor(active.element), fingerprint: active.fingerprint, source: { path: active.mappingSource.path, line: active.mappingSource.line, endLine: active.mappingSource.line, evidence: active.mappingSource.evidence }, route: route(), viewport: { width: innerWidth, height: innerHeight }, comment, highlight: annotationHighlight?.checked ? { x: 0, y: 0, width: 1, height: 1 } : null, relatedCheckpoint: historyState.currentId, relatedDesignDna: null, anchorConfidence: active.mappingConfidence }); if (!sent) explain("Disconnected — comment draft was kept for retry"); else explain("Saving comment…"); };

  const explain = (text) => {
    if (diagnostic) diagnostic.textContent = text;
    if (panelHint) panelHint.textContent = text;
  };
  const aiErrorText = (code) => {
    if (code === "PROVIDER_AUTH_MISSING") return "Run codex login, then try Generate again";
    if (code === "PROVIDER_CLI_UNAVAILABLE") return "Install Codex (app or CLI) or set REFRAME_AI_PROVIDER=api";
    if (code?.startsWith("PROVIDER_CLI_FAILED:")) return code.slice("PROVIDER_CLI_FAILED:".length).trim();
    if (code === "AI_EXACT_MAPPING_REQUIRED") return "Select an exactly mapped element before Generate";
    if (code === "PROVIDER_TIMEOUT") return "Codex timed out — it may still be working in the app. Check your Codex task, try a shorter prompt, or start a New chat";
    if (code === "DESIGN_DNA_CONFLICT") return "Proposal uses colors outside approved Design DNA — Accept anyway, refine the prompt, or update Design DNA";
    if (code === "REVIEW_UNAVAILABLE") return "This AI edit is no longer available — dismiss and generate again";
    if (code === "REVIEW_RESTORE_FAILED") return "Pending edit data is missing — dismiss and generate again to create a new review";
    if (code === "REVIEW_SOURCE_STALE") return "Source files changed since this edit — dismiss and generate again";
    if (code === "REVIEW_ALREADY_HANDLED") return "This edit was already accepted or rejected — dismiss to continue";
    return code || "Generation failed";
  };
  const aiReviewRecoverable = (message) => ["REVIEW_UNAVAILABLE", "REVIEW_RESTORE_FAILED", "REVIEW_SOURCE_STALE", "REVIEW_ALREADY_HANDLED"].includes(message.code);
  const aiStatusText = (message) => {
    if (message.status === "failed") return aiErrorText(message.code);
    if (message.status === "review") {
      const files = message.changedFiles?.length ? message.changedFiles.join(", ") : message.packetFiles?.join(", ") || "source";
      if (message.code === "DESIGN_DNA_CONFLICT") return "Ready to review — " + aiErrorText(message.code) + " · changed " + files;
      return "Ready to review — Accept saves to history, Reject undoes · changed " + files;
    }
    if (message.status === "generating") return "Generating in Codex… open the Codex app to watch your prompt and response";
    return message.status + (message.code ? ": " + message.code : "") + (message.packetFiles?.length ? " · packet " + message.packetFiles.join(", ") + " (" + message.packetBytes + " bytes)" : "");
  };
  const syncAiReviewIndicator = () => {
    const pending = aiReview?.status === "review" || aiReview?.status === "generating";
    const showIndicator = pending && aiPanel?.hidden;
    if (!aiReviewButton) return;
    aiReviewButton.hidden = !showIndicator;
    const files = aiReview?.changedFiles?.length ? aiReview.changedFiles.join(", ") : aiReview?.packetFiles?.join(", ") || "";
    const label = showIndicator ? "Review pending AI edit" + (files ? " · " + files : "") : "Review pending AI edit";
    aiReviewButton.title = label;
    aiReviewButton.setAttribute("aria-label", label);
  };
  const clearAiReview = () => {
    aiReview = undefined;
    syncAiReviewIndicator();
    if (aiStatus) aiStatus.textContent = "Choose a Codex task, then Generate";
    for (const button of [aiAccept, aiRefine, aiCompare, aiReject, aiDismiss]) { if (button) { button.hidden = true; button.disabled = true; } }
    if (aiStop) aiStop.hidden = true;
    if (aiGenerate) aiGenerate.hidden = false;
    scheduleGeometry();
  };
  const applyAiState = (message, options = {}) => {
    aiReview = message;
    if (options.openPanel !== false) openAiPanel();
    else syncAiReviewIndicator();
    const recoverable = message.status === "failed" && aiReviewRecoverable(message);
    if (aiStatus) {
      aiStatus.textContent = aiStatusText(message);
      aiStatus.dataset.reframeAiWarning = message.status === "review" && message.code === "DESIGN_DNA_CONFLICT" ? "true" : "false";
    }
    const reviewing = message.status === "review" || message.status === "compared";
    if (message.status === "review" && message.changedFiles?.some((file) => /\.css$/i.test(file))) refreshStylesheets();
    if (message.status === "review") {
      if (options.openPanel === false) {
        const files = message.changedFiles?.length ? message.changedFiles.join(", ") : message.packetFiles?.join(", ") || "";
        explain("Pending AI edit — click Review in the toolbar" + (files ? " · " + files : ""));
      } else explain("AI changes ready — use Accept or Reject in the panel");
    }
    if (recoverable) explain(aiErrorText(message.code) + " — Dismiss or Generate again");
    else if (message.status === "failed") explain(aiErrorText(message.code));
    if (message.status === "compared" && message.code === "COMPARE_READY") void showAiComparison(message.generationId);
    for (const button of [aiAccept, aiRefine, aiCompare, aiReject]) { if (button) { button.hidden = !reviewing; button.disabled = !reviewing; } }
    if (aiDismiss) { aiDismiss.hidden = !recoverable; aiDismiss.disabled = !recoverable; }
    if (aiStop) aiStop.hidden = message.status !== "generating";
    if (aiGenerate) aiGenerate.hidden = message.status === "generating" || reviewing;
    if (["accepted", "rejected", "stopped"].includes(message.status)) {
      if (message.status === "accepted") requestHistory();
      if ((message.status === "rejected" || message.status === "stopped") && message.code !== "REVIEW_DISMISSED") setTimeout(() => location.reload(), 50);
      clearAiReview();
    }
    scheduleGeometry();
  };
  const mappingWritable = (selection) => {
    if (!selection) return false;
    if (selection.mappingConfidence === "exact") return true;
    if (selection.mappingConfidence === "probable" && selection.sharedImpactAccepted) return true;
    if (selection.mappingConfidence === "pending" && selection.mappingSource && (selection.stableMappingConfidence === "exact" || (selection.stableMappingConfidence === "probable" && selection.sharedImpactAccepted))) return true;
    return false;
  };
  const usesOverridesPath = (selection) => {
    if (!selection) return false;
    if (selection.mappingConfidence === "not-mapped" || selection.mappingConfidence === "ambiguous" || selection.mappingConfidence === "pending") return true;
    if (selection.mappingConfidence === "probable" && selection.mappingRequiresImpact && !selection.sharedImpactAccepted) return true;
    return false;
  };
  const overrideSaveMessage = (autosave) => autosave ? "Autosaved to .reframe/overrides.css (unmapped element)" : "Saved to .reframe/overrides.css (unmapped element)";
  const promotionSaveMessage = (autosave) => autosave ? "Autosaved to project source (promoted class)" : "Saved to project source (promoted class)";
  const applySourcePromotion = () => {
    if (!active?.element || !active.fingerprint) return;
    if (!active.fingerprint.id) {
      const className = "reframe-mapped-" + fingerprintKey(active.fingerprint);
      active.element.classList.add(className);
      if (!active.fingerprint.classes.includes(className)) active.fingerprint.classes = [...active.fingerprint.classes, className];
    }
    active.mappingConfidence = "exact";
  };
  const mappingStatusMessage = (confidence, evidence, requiresImpact) => {
    if (confidence === "exact") return evidence;
    if (confidence === "probable" && requiresImpact) return evidence;
    if (confidence === "not-mapped" || confidence === "ambiguous" || confidence === "pending") return "No source mapping — edits save to .reframe/overrides.css";
    return evidence;
  };
  const applyDisabledReason = () => {
    if (!active) return "";
    if (active.applying) return "Saving…";
    if (state !== "connected") return "Not connected";
    if (active.overlapBlocked) return "Source changed outside Reframe";
    const widthChanged = active.previewWidth !== Math.round(active.original.computedWidth);
    const heightChanged = active.previewHeight !== Math.round(active.original.computedHeight);
    const textChanged = active.previewText !== active.original.text;
    const styleChanged = stylesChanged(active);
    const moved = translateChanged(active);
    if (!widthChanged && !heightChanged && !textChanged && !styleChanged && !moved) return "Resize or edit text first";
    if (usesOverridesPath(active)) return "";
    if (active.mappingConfidence === "pending") return "Refreshing source mapping…";
    if (active.mappingConfidence === "probable" && active.mappingRequiresImpact && !active.sharedImpactAccepted) return "Allow shared edit first";
    if (!mappingWritable(active)) return "Mapping unavailable";
    return "";
  };
  const onReferenceKindChange = () => { clearReferenceFile(); syncReferenceSourceUI(); };
  const closeReferenceKindMenu = () => { if (!referenceKindMenu || !referenceKindTrigger) return; referenceKindMenu.hidden = true; referenceKindTrigger.setAttribute("aria-expanded", "false"); };
  const closeReferenceBrandMenu = () => { if (!referenceBrandMenu || !referenceBrandTrigger) return; referenceBrandMenu.hidden = true; referenceBrandTrigger.setAttribute("aria-expanded", "false"); };
  const closeReferencePickers = () => { closeReferenceKindMenu(); closeReferenceBrandMenu(); };
  const setReferencePicker = (input, menu, label, value, labelText) => {
    if (!input) return;
    input.value = value;
    if (label && labelText) label.textContent = labelText;
    if (menu) for (const item of menu.querySelectorAll(".ai-chat-option")) item.setAttribute("aria-selected", item.dataset.reframePickerValue === value ? "true" : "false");
  };
  const onReferencePickerMenuClick = (event, input, menu, label, afterChange) => {
    const option = event.target?.closest?.(".ai-chat-option");
    if (!option || !input) return;
    setReferencePicker(input, menu, label, option.dataset.reframePickerValue ?? "", option.textContent?.trim() || "");
    input.dispatchEvent(new Event("change", { bubbles: true }));
    afterChange?.();
    closeReferencePickers();
  };
  const toggleReferencePickerMenu = (menu, trigger) => {
    if (!menu || !trigger) return;
    const next = menu.hidden;
    closeReferencePickers();
    closeDesignPickers();
    closeCodexChatMenu();
    menu.hidden = !next;
    trigger.setAttribute("aria-expanded", next ? "true" : "false");
  };
  const onReferenceFileChange = () => { const file = referenceFile?.files?.[0]; if (file) void setReferenceFile(file); };
  const onReferenceChoose = (event) => { event.preventDefault(); event.stopPropagation(); referenceFile?.click(); };
  const onReferenceClear = (event) => { event.preventDefault(); event.stopPropagation(); clearReferenceFile(); };
  const onReferenceDropzoneClick = (event) => { if (event.target.closest("[data-reframe-reference-clear-file]") || event.target.closest("[data-reframe-reference-choose]")) return; if (referencePreview && !referencePreview.hidden && event.target.closest("[data-reframe-reference-preview]")) return; referenceFile?.click(); };
  const referenceImageKinds = new Set(["screenshot", "site-screenshot", "hand-drawn"]);
  const isReferenceImageKind = () => referenceImageKinds.has(referenceKind?.value);
  const revokeReferencePreview = () => { if (referencePreviewUrl) { URL.revokeObjectURL(referencePreviewUrl); referencePreviewUrl = undefined; } };
  const syncReferenceFilePreview = (file) => {
    if (!referencePreview || !referenceDropzoneEmpty) return;
    if (!file) { referencePreview.hidden = true; referenceDropzoneEmpty.hidden = false; referencePreviewImg?.removeAttribute("src"); if (referencePreviewName) referencePreviewName.textContent = ""; revokeReferencePreview(); return; }
    referenceDropzoneEmpty.hidden = true; referencePreview.hidden = false;
    if (referencePreviewName) referencePreviewName.textContent = file.name;
    if (referencePreviewImg && isReferenceImageKind()) { revokeReferencePreview(); referencePreviewUrl = URL.createObjectURL(file); referencePreviewImg.src = referencePreviewUrl; }
  };
  const normalizeReferenceImageFile = async (file) => {
    const baseName = file.name && /\.png$/i.test(file.name) ? file.name : "reference.png";
    if (file.type === "image/png") return file.name.endsWith(".png") ? file : new File([file], baseName, { type: "image/png" });
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => { const el = new Image(); el.onload = () => resolve(el); el.onerror = () => reject(new Error("REFERENCE_IMAGE_INVALID")); el.src = objectUrl; });
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext("2d")?.drawImage(image, 0, 0);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("REFERENCE_IMAGE_INVALID")), "image/png"));
      return new File([blob], baseName, { type: "image/png" });
    } finally { URL.revokeObjectURL(objectUrl); }
  };
  const setReferenceFile = async (file) => {
    if (!file) return;
    try { referencePendingFile = isReferenceImageKind() ? await normalizeReferenceImageFile(file) : file; if (referenceFile) referenceFile.value = ""; syncReferenceFilePreview(referencePendingFile); resetReferencePlan(); if (referenceStatus && active?.mappingConfidence === "exact") referenceStatus.textContent = "Reference ready — choose borrowing characteristics."; }
    catch (error) { if (referenceStatus) referenceStatus.textContent = "Rejected: " + (error?.message || error); }
  };
  const clearReferenceFile = () => { referencePendingFile = undefined; if (referenceFile) referenceFile.value = ""; syncReferenceFilePreview(undefined); resetReferencePlan(); };
  const getReferenceFile = () => referencePendingFile || referenceFile?.files?.[0];
  const syncReferencePlacementUI = () => {
    if (!referencePlacement) return;
    if (!active?.element?.isConnected) {
      referencePlacement.value = "";
      referencePlacement.disabled = true;
      referencePlacement.readOnly = true;
      referencePlacement.placeholder = "Select an element on the page first";
      if (referenceUnknown) referenceUnknown.disabled = true;
      if (referenceUnknownTarget) referenceUnknownTarget.textContent = "selected target";
      return;
    }
    const description = placementDescriptionFor(active.element, active.mappingConfidence);
    referencePlacement.value = description;
    referencePlacement.disabled = false;
    referencePlacement.readOnly = false;
    referencePlacement.placeholder = "Selected element on this page";
    if (referenceUnknown) referenceUnknown.disabled = false;
    if (referenceUnknownTarget) referenceUnknownTarget.textContent = description;
  };
  const syncReferenceSourceUI = () => {
    const usesDna = referenceKind?.value === "design-dna";
    if (referenceSourcePanel) referenceSourcePanel.hidden = usesDna;
    if (!referenceFile) return;
    if (usesDna) { clearReferenceFile(); return; }
    if (isReferenceImageKind()) { referenceFile.accept = "image/png"; if (referenceDropzoneText) referenceDropzoneText.textContent = "Paste image (Ctrl+V) or drop file here"; }
    else if (referenceKind?.value === "markdown") { referenceFile.accept = ".md,.markdown,.txt"; if (referenceDropzoneText) referenceDropzoneText.textContent = "Drop a Markdown file here or choose one"; }
    else if (referenceKind?.value === "figma-export") { referenceFile.accept = ".json,application/json"; if (referenceDropzoneText) referenceDropzoneText.textContent = "Drop a Figma JSON export or choose one"; }
  };
  const closeAiPanel = () => { if (!aiPanel || aiPanel.hidden) return; closeCodexChatMenu(); closeReferencePickers(); aiPanel.hidden = true; reference?.setAttribute("aria-expanded", "false"); scheduleGeometry(); };
  const revokeAiAttachmentPreview = () => { if (aiAttachmentPreviewUrl) { URL.revokeObjectURL(aiAttachmentPreviewUrl); aiAttachmentPreviewUrl = undefined; } };
  const syncAiAttachmentPreview = (file) => {
    if (!aiAttachments) return;
    if (!file) { aiAttachments.hidden = true; aiAttachedImage = undefined; if (aiAttachmentImg) aiAttachmentImg.removeAttribute("src"); if (aiAttachmentName) aiAttachmentName.textContent = ""; revokeAiAttachmentPreview(); return; }
    aiAttachments.hidden = false;
    if (aiAttachmentName) aiAttachmentName.textContent = file.name || "Pasted image";
    if (aiAttachmentImg) { revokeAiAttachmentPreview(); aiAttachmentPreviewUrl = URL.createObjectURL(file); aiAttachmentImg.src = aiAttachmentPreviewUrl; }
  };
  const setAiAttachedImage = async (file) => {
    if (!file) return;
    try { aiAttachedImage = await normalizeReferenceImageFile(file); syncAiAttachmentPreview(aiAttachedImage); if (aiStatus && !aiReview) aiStatus.textContent = "Image attached — click Generate when ready"; }
    catch (error) { if (aiStatus) aiStatus.textContent = "Rejected image: " + (error?.message || error); }
  };
  const clearAiAttachedImage = () => syncAiAttachmentPreview(undefined);
  const uploadAiAttachment = async (file) => {
    const id = correlation("attachment");
    const response = await fetch(reframeBasePath + "/ai/attachment/" + id, { method: "PUT", headers: { Authorization: "Bearer " + token, "Content-Type": "image/png" }, body: file, cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("IMAGE_ATTACHMENT_UPLOAD_FAILED");
    return id;
  };
  const onAiPanelPaste = (event) => {
    if (!aiPanel || aiPanel.hidden) return;
    const file = [...(event.clipboardData?.items || [])].map((item) => item.getAsFile()).find((item) => item && item.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault(); event.stopPropagation();
    void setAiAttachedImage(file);
  };
  const onReferencePaste = (event) => {
    if (!aiPanel || aiPanel.hidden || !referenceDialog?.open || referenceKind?.value === "design-dna" || !isReferenceImageKind()) return;
    const file = [...(event.clipboardData?.items || [])].map((item) => item.getAsFile()).find((item) => item && item.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault(); event.stopPropagation();
    void setReferenceFile(file);
  };
  const onReferenceDrop = (event) => {
    if (!aiPanel || aiPanel.hidden || !referenceDialog?.open || referenceKind?.value === "design-dna") return;
    event.preventDefault(); referenceDropzone?.classList.remove("is-dragover");
    const file = [...(event.dataTransfer?.files || [])][0];
    if (!file) return;
    void setReferenceFile(file);
  };
  const onReferenceDragOver = (event) => { if (!aiPanel || aiPanel.hidden || !referenceDialog?.open || referenceKind?.value === "design-dna") return; event.preventDefault(); referenceDropzone?.classList.add("is-dragover"); };
  const onReferenceDragLeave = () => referenceDropzone?.classList.remove("is-dragover");
  const referenceEndpoint = reframeBasePath + "/reference";
  const referenceFetch = async (suffix, options = {}) => {
    const response = await fetch(referenceEndpoint + suffix, { ...options, cache: "no-store", credentials: "same-origin", headers: { Authorization: "Bearer " + token, ...(options.headers || {}) } });
    const value = await response.json().catch(() => ({ code: "REFERENCE_RESPONSE_INVALID" }));
    if (!response.ok) throw new Error(value.code || "REFERENCE_REQUEST_FAILED"); return value;
  };
  const closeReference = () => { if (!referenceDialog) return; referenceDialog.open = false; closeReferencePickers(); reference?.setAttribute("aria-expanded", "false"); };
  const openReference = () => { openAiPanel(); if (!referenceDialog) return; referenceDialog.open = true; reference?.setAttribute("aria-expanded", "true"); syncReferenceSourceUI(); syncReferencePlacementUI(); if (referenceStatus) referenceStatus.textContent = active?.mappingConfidence === "exact" && active.mappingSource ? "Choose a reference and explicit borrowing characteristics." : active?.element?.isConnected ? "Waiting for exact source mapping on the selected target." : "Select an element on the page first."; (active?.mappingSource ? referenceDropzone || referenceFile : aiClose)?.focus?.(); };
  const resetReferencePlan = () => { referenceDraft = undefined; frozenReferencePlanId = undefined; if (referenceFreeze) referenceFreeze.disabled = true; if (referencePlan) { referencePlan.hidden = true; referencePlan.textContent = ""; } };
  const buildReferencePlan = async (event) => {
    event.preventDefault(); resetReferencePlan();
    if (!(active?.referenceSource || active?.mappingSource) || active.mappingConfidence !== "exact") { if (referenceStatus) referenceStatus.textContent = "Missing target/placement: select an exactly mapped element."; return; }
    const file = getReferenceFile(); const borrowed = [...(referenceChoices?.querySelectorAll('input[type="checkbox"]:checked') || [])].map((input) => input.value); const usesDna = referenceKind?.value === "design-dna";
    const placement = referencePlacement?.value.trim() || placementDescriptionFor(active.element, active.mappingConfidence);
    const missing = []; if (!usesDna && !file) missing.push("reference file"); if (usesDna && (!referenceDnaId?.value.trim() || !referenceDnaVersion?.value.trim())) missing.push("approved DNA ID/version"); if (!borrowed.length) missing.push("borrowing choice"); if (!referenceBrand?.value) missing.push("brand treatment"); if (!placement) missing.push("target placement"); if (missing.length) { if (referenceStatus) referenceStatus.textContent = "Missing: " + missing.join(", "); return; }
    if (referenceStatus) referenceStatus.textContent = "Sanitizing and analyzing reference…";
    try {
      const descriptor = usesDna ? await referenceFetch("/dna", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: referenceDnaId.value.trim(), version: referenceDnaVersion.value.trim(), provenance: referenceProvenance.value.trim() }) }) : await referenceFetch("", { method: "POST", headers: { "Content-Type": referenceKind.value === "markdown" ? (file.type === "text/plain" ? "text/plain" : "text/markdown") : referenceKind.value === "figma-export" ? "application/json" : "image/png", "X-Reframe-Reference-Kind": referenceKind.value, "X-Reframe-Filename": file.name, "X-Reframe-Provenance": referenceProvenance.value.trim(), "X-Reframe-Persist": String(referencePersist.checked) }, body: file });
      const referenceSource = active.referenceSource || active.mappingSource;
      referenceDraft = await referenceFetch("/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referenceId: descriptor.id, target: { route: route(), sourcePath: referenceSource.path, placement }, borrowed, brand: referenceBrand.value, reuse: active.element.getAttribute("data-reframe-component") ? [active.element.getAttribute("data-reframe-component")] : [], newComponents: [], expectedFiles: [referenceSource.path], confirmUnknown: referenceUnknown.checked }) });
      if (referencePlan) { referencePlan.hidden = false; referencePlan.textContent = JSON.stringify({ borrowed: referenceDraft.borrowed, preserved: referenceDraft.preserved, brand: referenceDraft.brand, target: referenceDraft.target, reuse: referenceDraft.reuse, newComponents: referenceDraft.newComponents, expectedFiles: referenceDraft.expectedFiles, responsiveAssumptions: referenceDraft.responsiveAssumptions, uncertainties: referenceDraft.uncertainties, prohibitedCopy: referenceDraft.prohibitedCopy, verificationViewports: referenceDraft.verificationViewports }, null, 2); }
      if (referenceFreeze) referenceFreeze.disabled = false; if (referenceStatus) referenceStatus.textContent = "Review the complete plan, then approve and freeze it.";
    } catch (error) { if (referenceStatus) referenceStatus.textContent = "Rejected: " + (error?.message || error); }
  };
  const freezeReferencePlan = async () => {
    if (!referenceDraft?.id) return;
    try { const frozen = await referenceFetch("/freeze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: referenceDraft.id }) }); frozenReferencePlanId = frozen.id; referenceDraft = frozen; if (referenceFreeze) referenceFreeze.disabled = true; if (referenceStatus) referenceStatus.textContent = "Plan frozen: " + frozen.hash.slice(0, 12) + ". Close this panel, enter a prompt, and click Generate."; }
    catch (error) { if (referenceStatus) referenceStatus.textContent = "Cannot freeze: " + (error?.message || error); }
  };
  const comparisonText = (comparison) => {
    if (!comparison) return "Previous unavailable — no checkpoint";
    if (comparison.status !== "captured") return "Previous unavailable — " + (comparison.error || comparison.status);
    if (!comparison.exactRoute) return "Previous · route mismatch: " + comparison.route + " vs " + route();
    if (!comparison.exactViewport) return "Previous · viewport mismatch: " + comparison.viewport.width + "×" + comparison.viewport.height + " vs " + innerWidth + "×" + innerHeight;
    return "Previous · " + comparison.route + " · " + comparison.viewport.width + "×" + comparison.viewport.height;
  };
  const showAiComparison = async (generationId) => { if (!timeOverlay || !timeImage || !timeLabel) return; closeComparison(); timeHold = { started: performance.now(), ai: true }; timeOverlay.hidden = false; timeLabel.textContent = "Before reference adaptation — press Escape to close"; const response = await fetch(reframeBasePath + "/ai/" + generationId + "/before", { headers: { Authorization: "Bearer " + token }, cache: "no-store", credentials: "same-origin" }); if (!response.ok || response.headers.get("content-type") !== "image/png") { timeLabel.textContent = "Before screenshot unavailable"; return; } const url = URL.createObjectURL(await response.blob()); screenshotCache.set("ai:" + generationId, url); timeImage.src = url; };
  const screenshot = async (comparison) => {
    if (!comparison?.imagePath || comparison.status !== "captured") throw new Error(comparison?.error || "SCREENSHOT_UNAVAILABLE");
    if (screenshotCache.has(comparison.imagePath)) return screenshotCache.get(comparison.imagePath);
    const response = await fetch(comparison.imagePath, { headers: { Authorization: "Bearer " + token }, cache: "no-store", credentials: "same-origin" });
    if (!response.ok || response.headers.get("content-type") !== "image/png") throw new Error("SCREENSHOT_UNAVAILABLE");
    const url = URL.createObjectURL(await response.blob()); const image = new Image(); image.src = url;
    try { await image.decode(); } catch (error) { URL.revokeObjectURL(url); throw error; }
    screenshotCache.set(comparison.imagePath, url);
    while (screenshotCache.size > 3) { const [oldPath, oldUrl] = screenshotCache.entries().next().value; screenshotCache.delete(oldPath); URL.revokeObjectURL(oldUrl); }
    return url;
  };
  const preloadPrevious = () => { const comparison = historyState.comparison; if (comparison?.status === "captured") (window.requestIdleCallback ?? ((callback) => setTimeout(callback, 0)))(() => void screenshot(comparison).catch(() => undefined), { timeout: 500 }); };
  const closeComparison = () => { timeHold = undefined; if (timeOverlay) timeOverlay.hidden = true; if (timeImage) timeImage.removeAttribute("src"); time?.setAttribute("aria-pressed", "false"); };
  const syncCompareUi = () => {
    if (!sourceCompareOverlay) return;
    sourceCompareOverlay.style.setProperty("--compare-pos", comparePos + "%");
    sourceCompareHandle?.setAttribute("aria-valuenow", String(Math.round(comparePos)));
    if (sourceCompareLabel) sourceCompareLabel.textContent = comparePos <= 50 ? "Before (left) · current (right)" : "Before (left) · current (right) · drag handle";
  };
  const closeSourceCompare = () => { compareDrag = undefined; if (sourceCompareOverlay) sourceCompareOverlay.hidden = true; if (sourceCompareIframe) sourceCompareIframe.removeAttribute("src"); sourceCompareToggle?.setAttribute("aria-pressed", "false"); };
  const openSourceCompare = async () => {
    if (!sourceCompareOverlay || !sourceCompareIframe) return;
    closeComparison();
    await ensureSessionSnapshot();
    const compareUrl = new URL(location.href);
    compareUrl.searchParams.set("reframe_snapshot", "session");
    sourceCompareIframe.src = compareUrl.href;
    sourceCompareOverlay.hidden = false;
    comparePos = 50;
    syncCompareUi();
    sourceCompareToggle?.setAttribute("aria-pressed", "true");
    explain("Compare mode: drag the divider · Esc to close");
  };
  const onComparePointerMove = (event) => {
    if (!compareDrag) return;
    comparePos = Math.max(8, Math.min(92, (event.clientX / innerWidth) * 100));
    syncCompareUi();
  };
  const onComparePointerUp = (event) => {
    if (!compareDrag || compareDrag.pointerId !== event.pointerId) return;
    sourceCompareHandle?.releasePointerCapture?.(event.pointerId);
    compareDrag = undefined;
    document.removeEventListener("pointermove", onComparePointerMove, true);
    document.removeEventListener("pointerup", onComparePointerUp, true);
    document.removeEventListener("pointercancel", onComparePointerUp, true);
  };
  const onCompareHandleDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    compareDrag = { pointerId: event.pointerId };
    sourceCompareHandle?.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", onComparePointerMove, true);
    document.addEventListener("pointerup", onComparePointerUp, true);
    document.addEventListener("pointercancel", onComparePointerUp, true);
  };
  const toggleSourceCompare = () => { if (sourceCompareOverlay && !sourceCompareOverlay.hidden) closeSourceCompare(); else void openSourceCompare(); };
  const showComparison = async () => {
    const started = performance.now(); const hold = timeHold; const comparison = historyState.comparison;
    if (!hold || !timeOverlay || !timeLabel) return;
    timeOverlay.hidden = false; timeLabel.textContent = comparisonText(comparison); time?.setAttribute("aria-pressed", "true");
    if (comparison?.status !== "captured") return;
    try { const url = await screenshot(comparison); if (timeHold !== hold) return; timeImage.src = url; recordMetric("timeMachine", started); }
    catch { if (timeHold === hold) { timeLabel.textContent = "Previous unavailable — corrupt or missing screenshot"; timeImage.removeAttribute("src"); } }
  };
  const startTimeHold = (pointerId) => { if (timeHold) return Promise.resolve(); timeHold = { started: performance.now(), pointerId }; if (pointerId !== undefined) try { time?.setPointerCapture?.(pointerId); } catch { /* synthetic/ended touch pointer */ } return showComparison(); };
  const endTimeHold = (pointerId) => { if (!timeHold || (pointerId !== undefined && timeHold.pointerId !== undefined && timeHold.pointerId !== pointerId)) return; suppressHistoryClick = performance.now() - timeHold.started >= 250; if (pointerId !== undefined) try { if (time?.hasPointerCapture?.(pointerId)) time.releasePointerCapture(pointerId); } catch { /* capture already lost */ } closeComparison(); };
  const closeHistory = () => { if (!historyDialog || historyDialog.hidden) return; historyDialog.hidden = true; historyButton?.setAttribute("aria-expanded", "false"); historyFocus?.focus?.(); historyFocus = undefined; };
  const closeElementHistory = () => { if (!elementHistoryDialog || elementHistoryDialog.hidden) return; elementHistoryDialog.hidden = true; elementHistoryFocus?.focus?.(); elementHistoryFocus = undefined; };
  const closeExclusivePanels = (except) => {
    if (except !== "history") closeHistory();
    if (except !== "element-history") closeElementHistory();
    if (except !== "ai") closeAiPanel();
    if (except !== "design") hideDesignPanel();
  };
  const toggleDesignPanel = () => {
    if (!designPanelVisible) closeExclusivePanels("design");
    designPanelVisible = !designPanelVisible;
    syncEditToolbar();
    syncToolUi();
    scheduleGeometry();
  };
  const HISTORY_LANE_COLORS = ["#4e9eff", "#e8912d", "#b180d7", "#2db8a6", "#ce9178"];
  const HISTORY_GRAPH_W = 32;
  const HISTORY_ROW_H = 46;
  const historyLaneX = (lane, maxLane) => {
    const pad = 10;
    if (maxLane <= 0) return HISTORY_GRAPH_W / 2;
    return pad + ((HISTORY_GRAPH_W - pad * 2) / maxLane) * lane;
  };
  const historyBranchIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm0 4.5a2.5 2.5 0 0 0-1.76 1A2.5 2.5 0 0 0 4 13.5V7zM12 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM8 6h2a2 2 0 1 1 0 4H8"/></svg>';
  const historyHeadIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm-5 11.5a5 5 0 0 1 10 0v.5H3z"/></svg>';
  const formatHistoryTime = (value) => { try { return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return value || ""; } };
  const historyMetaLine = (checkpoint, isInvalid) => {
    if (isInvalid) return "Restore blocked";
    const parts = [checkpoint.route || "route unavailable", checkpoint.viewport ? checkpoint.viewport.width + "×" + checkpoint.viewport.height : "viewport unavailable", checkpoint.verification || "verification unavailable"];
    if (checkpoint.files.length) parts.push(checkpoint.files.join(", "));
    parts.push(formatHistoryTime(checkpoint.createdAt));
    return parts.join(" · ");
  };
  const assignHistoryLanes = (checkpoints, currentId) => {
    const byId = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
    const lanes = new Map();
    let walk = currentId;
    while (walk && byId.has(walk)) { lanes.set(walk, 0); walk = byId.get(walk).parentId; }
    for (const checkpoint of checkpoints) {
      if (lanes.has(checkpoint.id)) continue;
      const parentLane = checkpoint.parentId ? (lanes.get(checkpoint.parentId) ?? 0) : 0;
      lanes.set(checkpoint.id, parentLane + 1);
    }
    return lanes;
  };
  const historyGraphPath = (x1, y1, x2, y2) => {
    if (Math.abs(x1 - x2) < 0.5) return "M " + x1 + " " + y1 + " L " + x2 + " " + y2;
    const mid = (y1 + y2) / 2;
    return "M " + x1 + " " + y1 + " C " + x1 + " " + mid + ", " + x2 + " " + mid + ", " + x2 + " " + y2;
  };
  const historyAncestors = (currentId, checkpoints) => {
    const byId = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
    const ancestors = new Set();
    for (let walk = currentId; walk && byId.has(walk); walk = byId.get(walk).parentId) ancestors.add(walk);
    return ancestors;
  };
  const normalizeHistoryPath = (value) => String(value || "").replace(/\\/g, "/");
  const elementHistorySourcePath = () => normalizeHistoryPath(active?.mappingSource?.path);
  const checkpointTouchesSource = (checkpoint, sourcePath) => sourcePath && checkpoint.files.some((file) => normalizeHistoryPath(file) === sourcePath);
  const restoreCheckpoint = (checkpointId, label = "checkpoint") => {
    if (state !== "connected") return false;
    if (!checkpointId) return explain("No checkpoint available to restore"), false;
    const checkpoint = historyState.checkpoints.find((item) => item.id === checkpointId);
    if (!checkpoint?.valid) return explain("Restore blocked for unavailable checkpoint"), false;
    if (checkpointId === historyState.currentId && !historyState.canRestore) return explain("No checkpoint available to restore"), false;
    if (!historyAncestors(historyState.currentId, historyState.checkpoints).has(checkpointId)) return explain("Restore blocked: checkpoint is not on the current branch"), false;
    const prompt = checkpointId === historyState.currentId ? "Restore the previous Reframe checkpoint? Unrelated work will be preserved." : "Restore this Reframe checkpoint? Later edits on this branch will be rolled back. Unrelated work will be preserved.";
    if (!confirm(prompt)) return false;
    if (active && !clearSelection("Selection cleared before restore")) return false;
    if (restore) restore.disabled = true;
    explain("Restoring " + label + "…");
    const payload = base("history:restore", correlation("restore"));
    if (checkpointId) payload.checkpointId = checkpointId;
    return send(payload);
  };
  const renderHistoryList = () => {
    if (!historyList) return;
    const started = performance.now();
    historyList.replaceChildren();
    const checkpoints = [...historyState.checkpoints].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    if (historyCount) historyCount.textContent = String(checkpoints.length);
    if (!checkpoints.length) {
      const empty = document.createElement("p");
      empty.className = "history-detail";
      empty.textContent = "No checkpoints yet.";
      historyList.append(empty);
      recordMetric("historyList", started);
      return;
    }
    const lanes = assignHistoryLanes(checkpoints, historyState.currentId);
    const reachable = historyAncestors(historyState.currentId, checkpoints);
    const indexById = new Map(checkpoints.map((checkpoint, index) => [checkpoint.id, index]));
    const layout = checkpoints.map((checkpoint, index) => {
      const lane = lanes.get(checkpoint.id) ?? 0;
      return { checkpoint, lane, index, y: index * HISTORY_ROW_H + HISTORY_ROW_H / 2 };
    });
    const maxLane = Math.max(0, ...layout.map((node) => node.lane));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("history-graph-svg");
    svg.setAttribute("width", String(HISTORY_GRAPH_W));
    svg.setAttribute("height", String(Math.max(HISTORY_ROW_H, layout.length * HISTORY_ROW_H)));
    svg.setAttribute("aria-hidden", "true");
    for (const node of layout) {
      const parentIndex = node.checkpoint.parentId ? indexById.get(node.checkpoint.parentId) : undefined;
      if (parentIndex === undefined) continue;
      const parent = layout[parentIndex];
      const x1 = historyLaneX(node.lane, maxLane);
      const x2 = historyLaneX(parent.lane, maxLane);
      const laneColor = HISTORY_LANE_COLORS[node.lane % HISTORY_LANE_COLORS.length];
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("history-graph-line");
      path.setAttribute("d", historyGraphPath(x1, node.y, x2, parent.y));
      path.setAttribute("stroke", laneColor);
      svg.append(path);
    }
    for (const node of layout) {
      const checkpoint = node.checkpoint;
      const isCurrent = checkpoint.id === historyState.currentId;
      const cx = historyLaneX(node.lane, maxLane);
      const laneColor = HISTORY_LANE_COLORS[node.lane % HISTORY_LANE_COLORS.length];
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      if (isCurrent) {
        const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        ring.classList.add("history-graph-dot-ring");
        ring.setAttribute("cx", String(cx));
        ring.setAttribute("cy", String(node.y));
        ring.setAttribute("r", "6");
        ring.setAttribute("stroke", laneColor);
        group.append(ring);
      }
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.classList.add("history-graph-dot", ...(isCurrent ? ["is-head"] : []));
      dot.setAttribute("cx", String(cx));
      dot.setAttribute("cy", String(node.y));
      dot.setAttribute("r", isCurrent ? "4" : "3.5");
      dot.setAttribute("fill", laneColor);
      group.append(dot);
      svg.append(group);
    }
    historyList.append(svg);
    for (const node of layout) {
      const checkpoint = node.checkpoint;
      const isCurrent = checkpoint.id === historyState.currentId;
      const isInvalid = !checkpoint.valid;
      const laneColor = HISTORY_LANE_COLORS[node.lane % HISTORY_LANE_COLORS.length];
      const item = document.createElement("article");
      item.className = "history-row history-item" + (isCurrent ? " is-current" : "") + (isInvalid ? " is-invalid" : "");
      item.setAttribute("aria-disabled", String(isInvalid));
      if (selectedHistoryId === checkpoint.id) item.setAttribute("aria-selected", "true");
      item.style.setProperty("--lane-color", laneColor);
      const graphCol = document.createElement("div");
      graphCol.className = "history-graph-col";
      graphCol.setAttribute("aria-hidden", "true");
      const body = document.createElement("div");
      body.className = "history-body";
      const message = document.createElement("div");
      message.className = "history-message";
      const hash = document.createElement("span");
      hash.className = "history-hash";
      hash.textContent = checkpoint.id.slice(0, 8);
      message.append(hash);
      const hashSep = document.createElement("span");
      hashSep.className = "history-sep";
      hashSep.textContent = "·";
      message.append(hashSep);
      const summary = document.createElement("span");
      summary.className = "history-summary";
      summary.textContent = isInvalid ? "Unavailable/corrupt · " + (checkpoint.error || "validation failed") : (checkpoint.promptSummary || "No prompt recorded");
      message.append(summary);
      if (isCurrent) {
        const badge = document.createElement("span");
        badge.className = "history-current-badge";
        badge.textContent = "Current";
        message.append(badge);
      }
      const headPill = document.createElement("span");
      headPill.className = "history-branch-pill" + (isCurrent ? " head" : "");
      headPill.innerHTML = historyHeadIcon + (isCurrent ? "HEAD" : "checkpoint");
      message.append(headPill);
      if (checkpoint.kind === "safety") {
        const safetyPill = document.createElement("span");
        safetyPill.className = "history-branch-pill safety";
        safetyPill.innerHTML = historyBranchIcon + "safety";
        message.append(safetyPill);
      }
      if (checkpoint.route) {
        const routePill = document.createElement("span");
        routePill.className = "history-branch-pill";
        routePill.style.setProperty("--pill-bg", "color-mix(in srgb, " + laneColor + " 18%, transparent)");
        routePill.style.setProperty("--pill-fg", laneColor);
        routePill.innerHTML = historyBranchIcon + checkpoint.route.slice(0, 24);
        message.append(routePill);
      }
      if (isInvalid) {
        const invalidPill = document.createElement("span");
        invalidPill.className = "history-branch-pill invalid";
        invalidPill.textContent = "corrupt";
        message.append(invalidPill);
      }
      body.append(message);
      const detail = document.createElement("div");
      detail.className = "history-detail";
      detail.textContent = historyMetaLine(checkpoint, isInvalid);
      body.append(detail);
      item.append(graphCol, body);
      if (checkpoint.valid && reachable.has(checkpoint.id) && state === "connected") {
        const actions = document.createElement("div");
        actions.className = "history-row-actions";
        const button = document.createElement("button");
        button.className = "button history-restore-btn";
        button.type = "button";
        button.textContent = "Restore";
        button.addEventListener("click", (event) => { event.stopPropagation(); restoreCheckpoint(checkpoint.id, isCurrent ? "previous checkpoint" : "checkpoint"); });
        actions.append(button);
        item.append(actions);
      }
      item.addEventListener("click", () => {
        selectedHistoryId = checkpoint.id;
        historyList.querySelectorAll(".history-row").forEach((row) => row.removeAttribute("aria-selected"));
        item.setAttribute("aria-selected", "true");
      });
      historyList.append(item);
    }
    recordMetric("historyList", started);
  };
  const renderElementHistoryList = () => {
    if (!elementHistoryList) return;
    elementHistoryList.replaceChildren();
    const sourcePath = elementHistorySourcePath();
    if (elementHistoryTarget) elementHistoryTarget.textContent = sourcePath ? "Source file: " + sourcePath : "Select a mapped element to see file-specific history.";
    const checkpoints = [...historyState.checkpoints].filter((checkpoint) => checkpointTouchesSource(checkpoint, sourcePath)).sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    if (!checkpoints.length) {
      const empty = document.createElement("p");
      empty.className = "history-detail";
      empty.textContent = sourcePath ? "No checkpoints touched this element's source file yet." : "No mapped source file for the current selection.";
      elementHistoryList.append(empty);
      return;
    }
    const reachable = historyAncestors(historyState.currentId, historyState.checkpoints);
    for (const checkpoint of checkpoints) {
      const isCurrent = checkpoint.id === historyState.currentId;
      const isInvalid = !checkpoint.valid;
      const row = document.createElement("article");
      row.className = "element-history-row" + (isCurrent ? " is-current" : "") + (isInvalid ? " is-invalid" : "");
      const summary = document.createElement("div");
      summary.className = "element-history-summary";
      const title = document.createElement("strong");
      title.textContent = (isInvalid ? "Unavailable" : (checkpoint.promptSummary || "Edit")) + (isCurrent ? " · Current" : "");
      summary.append(title);
      const detail = document.createElement("div");
      detail.className = "element-history-detail";
      detail.textContent = checkpoint.id.slice(0, 8) + " · " + formatHistoryTime(checkpoint.createdAt) + " · " + (checkpoint.verification || "verification unavailable");
      summary.append(detail);
      row.append(summary);
      if (checkpoint.valid && reachable.has(checkpoint.id) && state === "connected") {
        const actions = document.createElement("div");
        actions.className = "history-row-actions";
        const button = document.createElement("button");
        button.className = "button history-restore-btn";
        button.type = "button";
        button.textContent = "Restore";
        button.addEventListener("click", (event) => { event.stopPropagation(); restoreCheckpoint(checkpoint.id, isCurrent ? "previous checkpoint" : "checkpoint"); });
        actions.append(button);
        row.append(actions);
      }
      elementHistoryList.append(row);
    }
  };
  const openHistory = () => {
    if (!historyDialog) return;
    closeExclusivePanels("history");
    historyFocus = root.activeElement;
    renderHistoryList();
    historyDialog.hidden = false;
    historyButton?.setAttribute("aria-expanded", "true");
    historyClose?.focus();
    requestHistory();
    // #region agent log
    debugLog("browser-client:openHistory", "history opened", { checkpointCount: historyState.checkpoints.length, currentId: historyState.currentId, dialogHidden: historyDialog.hidden, listChildCount: historyList?.childElementCount ?? 0 }, "H9");
    // #endregion
  };
  const onHistoryButtonClick = (event) => { event.stopPropagation(); openHistory(); };
  const onElementHistoryButtonClick = (event) => { event.stopPropagation(); openElementHistory(); };
  const renderHistory = () => {
    if (previousLabel) previousLabel.textContent = "Previous: " + (historyState.previousId ? historyState.previousId.slice(0, 8) : "original");
    if (currentLabel) currentLabel.textContent = "Current: " + (historyState.currentId ? historyState.currentId.slice(0, 8) : "working tree") + (!historyState.gitAvailable ? " · no Git" : historyState.dirty ? " · dirty preserved" : "");
    if (restore) { restore.disabled = !historyState.canRestore || state !== "connected"; restore.setAttribute("aria-disabled", String(restore.disabled)); }
    if (historyDialog && !historyDialog.hidden) renderHistoryList();
    if (elementHistoryDialog && !elementHistoryDialog.hidden) renderElementHistoryList();
  };
  const openElementHistory = () => {
    if (!elementHistoryDialog) return;
    if (!active?.mappingSource?.path) return explain("Select a mapped element to view element history");
    closeExclusivePanels("element-history");
    elementHistoryFocus = root.activeElement;
    renderElementHistoryList();
    elementHistoryDialog.hidden = false;
    elementHistoryClose?.focus();
    requestHistory();
  };
  const restorePrevious = () => restoreCheckpoint(historyState.currentId, "previous checkpoint");
  const labelFor = (element) => element.tagName.toLowerCase() + (element.id ? "#" + element.id : element.classList.length ? "." + [...element.classList].slice(0, 2).join(".") : "");
  const placementDescriptionFor = (element, confidence) => {
    const component = element.getAttribute("data-reframe-component");
    let selector = labelFor(element);
    const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    const snippet = text.slice(0, 48);
    if (snippet && /^h[1-6]$/.test(element.tagName.toLowerCase())) selector += ' "' + snippet + (text.length > 48 ? "…" : "") + '"';
    else if (snippet && !element.id && !element.classList.length) selector += ' "' + snippet + (text.length > 48 ? "…" : "") + '"';
    const base = component ? component + " · " + selector : selector;
    const confidenceLabel = confidence === "pending" ? "mapping…" : confidence === "not-mapped" ? "not mapped" : confidence === "ambiguous" ? "ambiguous" : confidence;
    return confidenceLabel ? base + " · " + confidenceLabel + " mapping" : base;
  };
  const boundedClasses = (element) => [...element.classList].slice(0, 16).map((value) => value.slice(0, 128));
  const summary = (element) => ({ tag: element.tagName.toLowerCase(), id: element.id ? element.id.slice(0, 128) : null, classes: boundedClasses(element) });
  const route = () => location.pathname + location.search + location.hash;
  const fingerprint = (element) => ({
    ...summary(element),
    text: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 256),
    parent: element.parentElement ? summary(element.parentElement) : null,
    route: route(),
    viewport: { width: innerWidth, height: innerHeight },
  });
  const findFingerprint = (value) => {
    if (value.id) return document.getElementById(value.id) || undefined;
    const matches = [...document.querySelectorAll(value.tag)].filter((element) => element instanceof HTMLElement && value.classes.every((name) => element.classList.contains(name)));
    if (matches.length === 1) return matches[0];
    const text = matches.filter((element) => (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 256) === value.text);
    return text.length === 1 ? text[0] : undefined;
  };
  const looksLikeDirectoryListingPage = () => {
    const title = document.title.toLowerCase();
    if (title.includes("index of") || title.includes("directory listing")) return true;
    const sample = (document.body?.innerText || "").slice(0, 4_000).toLowerCase();
    return sample.includes("parent directory") && (sample.includes("node_modules") || sample.includes("packages") || sample.includes("readme.md"));
  };
  const selectionBlockedReason = (tag, baseReason) => {
    if (tag === "body" && looksLikeDirectoryListingPage()) return "Folder listing detected — run Reframe from your app directory (e.g. demo/vanilla-demo), not the repo root";
    if (tag === "body") return "Page background is not selectable — click a card, button, or heading inside the page";
    if (tag === "html") return "Page root is not selectable — click an element inside the page";
    return baseReason || (tag + " elements are not selectable");
  };
  const warnDirectoryListingPage = () => { if (looksLikeDirectoryListingPage()) explain("Folder listing detected — cd into your project (e.g. demo/vanilla-demo) and run reframe there"); };
  const candidateFrom = (event) => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    if (path.includes(host)) return { element: null, reason: "Reframe controls are not selectable" };
    const elements = path.filter((item) => item instanceof HTMLElement);
    const element = elements.find((item) => item.hasAttribute("data-reframe-component") || item.hasAttribute("data-reframe-source-id") || item.hasAttribute("data-reframe-edit-target") || item.id || item.classList.length) ?? elements[0];
    if (!element) return { element: null, reason: "This target is unsupported" };
    if (isLayerLocked(element)) return { element: null, reason: "Locked layer — unlock it in the Layers panel or pick another element" };
    const tag = element.tagName.toLowerCase();
    if (["html", "body", "head", "script", "style", "link", "meta", "canvas", "iframe"].includes(tag)) return { element: null, reason: selectionBlockedReason(tag, tag + " elements are not selectable") };
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || rect.width <= 0 || rect.height <= 0) return { element: null, reason: "Hidden or zero-size element — show the layer or click a visible element" };
    return { element, reason: "" };
  };
  const OUTLINE_TAG_HEIGHT = 24;
  const outlineTagMinTop = () => (chrome?.getAttribute("data-reframe-chrome-visible") === "true" ? 56 : 8);
  const outlineSidebarClip = (rect) => {
    let left = 0;
    let right = 0;
    const addLeftClip = (edgeRight) => {
      if (rect.right > edgeRight && rect.left < edgeRight) left = Math.max(left, edgeRight - rect.left);
    };
    const addRightClip = (edgeLeft) => {
      if (rect.left < edgeLeft && rect.right > edgeLeft) right = Math.max(right, rect.right - edgeLeft);
    };
    if (toolRail && !toolRail.hidden) addLeftClip(toolRail.getBoundingClientRect().right);
    if (layersPanel && !layersPanel.hidden) addLeftClip(layersPanel.getBoundingClientRect().right);
    if (designPanel && !designPanel.hidden) addRightClip(designPanel.getBoundingClientRect().left);
    else if (designTab && !designTab.hidden) addRightClip(designTab.getBoundingClientRect().left);
    return left || right ? "inset(0 " + right + "px 0 " + left + "px)" : "";
  };
  const getOutlineTagPlacement = (rect) => {
    const minTop = outlineTagMinTop();
    const roomAbove = rect.top - minTop;
    const roomBelow = innerHeight - rect.bottom;
    const placeBelow = roomAbove < OUTLINE_TAG_HEIGHT && roomBelow >= OUTLINE_TAG_HEIGHT;
    const placeInside = roomAbove < OUTLINE_TAG_HEIGHT && roomBelow < OUTLINE_TAG_HEIGHT;
    return { placeBelow, placeInside, placeAbove: !placeBelow && !placeInside };
  };
  const placeOutlineTag = (outline, rect) => {
    const tag = outline.querySelector(".tag");
    if (!tag) return;
    const { placeBelow, placeInside } = getOutlineTagPlacement(rect);
    tag.classList.toggle("tag-below", placeBelow);
    if (placeInside) {
      tag.style.top = "2px";
      tag.style.bottom = "auto";
    } else {
      tag.style.removeProperty("top");
      tag.style.removeProperty("bottom");
    }
  };
  const placeContextBar = (rect, outline) => {
    if (!contextBar || contextBar.hidden) return;
    const gap = 10;
    const chromeTop = 56;
    const pillWidth = contextBar.offsetWidth || 40;
    const pillHeight = contextBar.offsetHeight || 38;
    const clampLeft = (width, preferredLeft) => Math.max(12, Math.min(innerWidth - width - 12, preferredLeft));
    const preferredLeft = rect.left + rect.width / 2 - pillWidth / 2;
    contextBar.style.left = clampLeft(pillWidth, preferredLeft) + "px";
    const { placeAbove } = getOutlineTagPlacement(rect);
    let aboveTop = rect.top - pillHeight - gap;
    if (placeAbove) aboveTop = rect.top - pillHeight - OUTLINE_TAG_HEIGHT - gap * 2;
    if (outline && placeAbove) {
      const tag = outline.querySelector(".tag");
      if (tag) {
        const tagRect = tag.getBoundingClientRect();
        if (tagRect.height > 0 && aboveTop + pillHeight + gap > tagRect.top) aboveTop = tagRect.top - gap - pillHeight;
      }
    }
    contextBar.style.top = (aboveTop >= chromeTop ? aboveTop : rect.bottom + gap) + "px";
  };
  const placeOutline = (outline, rect) => {
    outline.style.left = rect.left + "px";
    outline.style.top = rect.top + "px";
    outline.style.width = Math.max(0, rect.width) + "px";
    outline.style.height = Math.max(0, rect.height) + "px";
    placeOutlineTag(outline, rect);
    const clip = outlineSidebarClip(rect);
    const border = outline.querySelector(".outline-border");
    if (border) {
      border.style.clipPath = clip;
      if (!clip) border.style.removeProperty("clip-path");
    }
    outline.style.removeProperty("clip-path");
  };
  const updateApplyState = () => {
    if (!apply) return;
    const widthChanged = Boolean(active && active.previewWidth !== Math.round(active.original.computedWidth));
    const heightChanged = Boolean(active && active.previewHeight !== Math.round(active.original.computedHeight));
    const textChanged = Boolean(active && active.previewText !== active.original.text);
    const styleChanged = Boolean(active && stylesChanged(active));
    const moved = Boolean(active && translateChanged(active));
    const hasChanges = widthChanged || heightChanged || textChanged || styleChanged || moved;
    const enabled = Boolean(active && !active.overlapBlocked && hasChanges && active.element.isConnected && state === "connected" && !active.applying);
    apply.setAttribute("aria-disabled", String(!enabled));
    apply.disabled = !enabled;
    if (metrics) metrics.hidden = !hasChanges;
    if (widthLabel && hasChanges) widthLabel.textContent = widthChanged ? Math.round(active.original.computedWidth) + "px → " + Math.round(active.previewWidth) + "px" : "";
    if (heightLabel && hasChanges) heightLabel.textContent = heightChanged ? Math.round(active.original.computedHeight) + "px → " + Math.round(active.previewHeight) + "px" : "";
    const reason = applyDisabledReason();
    if (diagnostic && active) {
      if (active.applying) diagnostic.textContent = autosaveMode ? "Saving…" : "Saving…";
      else if (hasChanges && usesOverridesPath(active) && state === "connected" && !active.overlapBlocked) diagnostic.textContent = "Unsaved — saves to .reframe/overrides.css";
      else if (reason && (state !== "connected" || active.overlapBlocked || (active.mappingConfidence === "pending" && !usesOverridesPath(active)))) diagnostic.textContent = reason;
    }
    syncGenerateButton();
  };
  const positionAiPanel = () => {
    if (!aiPanel || aiPanel.hidden) return;
    aiPanel.style.height = "min(720px, calc(100vh - 80px))";
    aiPanel.style.maxHeight = "calc(100vh - 80px)";
  };
  const updateGeometry = () => {
    geometryFrame = undefined;
    if (hoverTarget?.isConnected && hoverOutline) placeOutline(hoverOutline, hoverTarget.getBoundingClientRect());
    positionAiPanel();
    positionMoreMenu();
    positionContextMoreMenu();
    if (!active?.element?.isConnected) {
      if (showcaseMode && showcaseUiActive && showcaseTarget?.isConnected) showcasePlaceSelection();
      return;
    }
    const rect = active.element.getBoundingClientRect();
    if (selectedOutline) placeOutline(selectedOutline, rect);
    placeContextBar(rect, selectedOutline);
    const gap = 10;
    const chromeTop = 56;
    const clampLeft = (width, preferredLeft) => Math.max(12, Math.min(innerWidth - width - 12, preferredLeft));
    if (panel && !panel.hidden) {
      if (designPanel && !designPanel.hidden) {
        panel.style.left = "";
        panel.style.top = "";
        panel.style.width = "";
      } else {
        const panelWidth = Math.min(560, innerWidth - 24);
        const panelHeight = panel.offsetHeight || 44;
        const belowTop = rect.bottom + gap;
        panel.style.width = panelWidth + "px";
        panel.style.left = clampLeft(panelWidth, rect.left) + "px";
        panel.style.top = (belowTop + panelHeight < innerHeight ? belowTop : Math.max(chromeTop, rect.top - panelHeight - gap)) + "px";
      }
    }
    if (widthLabel || heightLabel || metrics) {
      const widthChanged = active.previewWidth !== Math.round(active.original.computedWidth);
      const heightChanged = active.previewHeight !== Math.round(active.original.computedHeight);
      if (widthLabel && widthChanged) widthLabel.textContent = Math.round(active.original.computedWidth) + "px → " + Math.round(active.previewWidth) + "px";
      if (heightLabel && heightChanged) heightLabel.textContent = Math.round(active.original.computedHeight) + "px → " + Math.round(active.previewHeight) + "px";
      if (metrics) metrics.hidden = !(widthChanged || heightChanged);
    }
    updateApplyState();
  };
  const scheduleGeometry = () => { if (!geometryFrame) geometryFrame = requestAnimationFrame(updateGeometry); };
  const restorePreview = (selection) => {
    if (!selection?.element?.isConnected) return;
    if (selection.original.inlineWidthPresent) selection.element.style.setProperty("width", selection.original.inlineWidth, selection.original.inlineWidthPriority);
    else selection.element.style.removeProperty("width");
    if (selection.original.inlineHeightPresent) selection.element.style.setProperty("height", selection.original.inlineHeight, selection.original.inlineHeightPriority);
    else selection.element.style.removeProperty("height");
    if (selection.previewText !== selection.original.text) setElementText(selection.element, selection.original.text);
    restorePreviewStyles(selection);
    restorePreviewTransform(selection);
  };
  const restoreWidth = restorePreview;
  const hideHover = () => {
    hoverTarget = undefined;
    if (hoverOutline) hoverOutline.hidden = true;
  };
  const requestMapping = () => {
    if (!active) return false;
    if (!["exact", "probable"].includes(active.mappingConfidence)) active.mappingConfidence = "pending";
    else active.stableMappingConfidence = active.mappingConfidence;
    if (mappingLabel) mappingLabel.textContent = active.mappingConfidence === "pending" ? "Mapping…" : active.mappingConfidence;
    syncReferencePlacementUI();
    if (impact) impact.hidden = true;
    if (overlap) overlap.hidden = true;
    active.overlapAccepted = false;
    active.overlapBlocked = false;
    updateApplyState();
    syncTranslateToPreviewStyles();
    return send({ ...base("mapping:request", correlation("mapping")), selectionId: active.selectionId, generation: active.generation, currentWidth: Math.round(active.original.computedWidth), width: active.previewWidth, currentHeight: Math.round(active.original.computedHeight), height: active.previewHeight, previewText: active.previewText === active.original.text ? null : active.previewText, previewStyles: stylesChanged(active) || translateChanged(active) ? active.previewStyles : null, originalStyles: active.original.styles, fingerprint: active.fingerprint, breakpoint: active.breakpoint, sharedImpactAccepted: active.sharedImpactAccepted });
  };
  const queueMapping = () => {
    if (mappingTimer) clearTimeout(mappingTimer);
    mappingTimer = setTimeout(() => { mappingTimer = undefined; requestMapping(); }, 250);
  };
  const clearSelection = (reason = "Selection cleared", restore = true, notify = true, force = false) => {
    if (!force && active?.applying) { explain("Saving… press Deselect again to cancel"); return false; }
    if (!force && (aiReview?.status === "review" || aiReview?.status === "generating")) { explain("Accept, Reject, or Stop the generated edit first"); return false; }
    if (force && active?.applying) {
      active.applying = false;
      if (applyTimer) { clearTimeout(applyTimer); applyTimer = undefined; }
      if (active.proposalId) send({ ...base("edit:cancel", correlation("cancel")), proposalId: active.proposalId });
    }
    const previous = active;
    active = undefined;
    drag = undefined;
    if (previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame = undefined;
    if (restore) restorePreview(previous);
    if (previous?.element && !previous.element.hasAttribute("data-reframe-component")) previous.element.removeAttribute("data-reframe-source");
    previous?.element?.removeAttribute("data-reframe-style-owner");
    previous?.element?.removeAttribute("data-reframe-reused");
    if (selectedOutline) selectedOutline.hidden = true;
    if (contextBar) contextBar.hidden = true;
    if (comments) comments.hidden = true;
    if (panel) panel.hidden = true;
    if (designPanel) designPanel.hidden = true;
    if (designTab) designTab.hidden = true;
    if (aiPanel) aiPanel.hidden = true;
    if (overlap) overlap.hidden = true;
    syncReferencePlacementUI();
    generation += 1;
    if (notify) {
      if (previous?.proposalId) send({ ...base("edit:cancel", correlation("cancel")), proposalId: previous.proposalId });
      send({ ...base("selection:changed", correlation("selection")), selectionId: null, generation });
    }
    explain(reason);
    resetEditHistory();
    updateApplyState();
    scheduleLayersTree();
    syncEditToolbar();
    return true;
  };
  const choose = (element) => {
    if (active?.applying) { explain("Saving… press Deselect to cancel"); return; }
    if (active?.overlapBlocked) { explain("Click Save resize safely or Cancel"); return; }
    if (active?.element === element) return;
    if (active) {
      if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = undefined; }
      const switchSelection = () => {
        if (active?.element === element) return;
        clearSelection("Previous preview saved", false, false);
        chooseElement(element);
      };
      if (hasPendingChanges()) void flushAutosave().then(switchSelection);
      else switchSelection();
      return;
    }
    chooseElement(element);
  };
  const chooseElement = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    generation += 1;
    const inlineWidthPresent = Array.from({ length: element.style.length }, (_, index) => element.style.item(index)).includes("width");
    const inlineHeightPresent = Array.from({ length: element.style.length }, (_, index) => element.style.item(index)).includes("height");
    const inlineTransformPresent = Array.from({ length: element.style.length }, (_, index) => element.style.item(index)).includes("transform");
    const elementText = readElementText(element);
    const fpKey = fingerprintKey(fingerprint(element));
    element.setAttribute("data-reframe-fingerprint", fpKey);
    const originalStyles = styleSnapshot(element);
    active = {
      element,
      selectionId: correlation("selection"),
      proposalId: correlation("proposal"),
      generation,
      previewWidth: Math.min(10_000, Math.max(1, Math.round(rect.width))),
      previewHeight: Math.min(10_000, Math.max(1, Math.round(rect.height))),
      previewText: elementText,
      previewStyles: { ...originalStyles },
      previewTranslate: { x: 0, y: 0 },
      mappingConfidence: "pending",
      mappingRequiresImpact: false,
      breakpoint: null,
      sharedImpactAccepted: false,
      overlapAccepted: false,
      overlapBlocked: false,
      fingerprint: fingerprint(element),
      original: {
        inlineWidthPresent,
        inlineWidth: element.style.getPropertyValue("width"),
        inlineWidthPriority: element.style.getPropertyPriority("width"),
        computedWidth: rect.width,
        inlineHeightPresent,
        inlineHeight: element.style.getPropertyValue("height"),
        inlineHeightPriority: element.style.getPropertyPriority("height"),
        computedHeight: rect.height,
        text: elementText,
        styles: originalStyles,
        inlineTransformPresent,
        inlineTransform: element.style.getPropertyValue("transform"),
        inlineTransformPriority: element.style.getPropertyPriority("transform"),
        boxSizing: style.boxSizing === "content-box" ? "content-box" : "border-box",
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      },
    };
    if (textInput) textInput.value = elementText;
    hideHover();
    if (selectedLabel) selectedLabel.textContent = labelFor(element);
    syncReferencePlacementUI();
    if (selectedOutline) selectedOutline.hidden = false;
    if (contextBar) contextBar.hidden = commentMode;
    if (panel) panel.hidden = commentMode;
    syncLayoutInputs();
    syncEditToolbar();
    syncGenerateButton();
    if (!formatPanel?.hidden && formatFont) { const fontValue = active.previewStyles["font-family"] || "inherit"; if (formatFont._designPicker) setDesignPicker(formatFont, formatFont._designPicker.menu, formatFont._designPicker.labelEl, fontValue || "inherit", formatFont._designPicker.options); else formatFont.value = fontValue || "inherit"; }
    send({ ...base("selection:changed", correlation("selection")), selectionId: active.selectionId, generation: active.generation });
    requestMapping();
    void ensureSessionSnapshot();
    resetEditHistory(true);
    explain("Selected " + labelFor(element) + " — Ctrl+Z undo · Delete to hide");
    updateGeometry();
    scheduleLayersTree();
  };
  const showHover = (element) => {
    if (element === active?.element || element === hoverTarget) return;
    hoverTarget = element;
    if (hoverLabel) hoverLabel.textContent = labelFor(element);
    if (hoverOutline) hoverOutline.hidden = false;
    scheduleGeometry();
  };
  const onDocumentPointerMove = (event) => {
    if (!selectMode || drag || activeTool === "hand") return;
    const path = event.composedPath();
    if (hoverFrame) cancelAnimationFrame(hoverFrame);
    hoverFrame = requestAnimationFrame(() => {
      const started = performance.now();
      hoverFrame = undefined;
      const result = candidateFrom({ target: event.target, composedPath: () => path });
      if (result.element) showHover(result.element); else hideHover();
      recordMetric("hover", started);
    });
  };
  const focusTextInput = () => { if (!textInput || !active || !isTextElement(active.element)) return; textInput.hidden = false; textInput.classList.remove("reframe-text-off"); textInput.focus(); textInput.select?.(); };
  const onDocumentDblClick = (event) => {
    if (!selectMode || activeTool !== "text") return;
    const path = event.composedPath?.() || [];
    if (path.includes(host)) return;
    const result = candidateFrom(event);
    if (!result.element || !isTextElement(result.element)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    choose(result.element);
    focusTextInput();
  };
  const onDocumentClick = (event) => {
    if (!moreMenuEl?.hidden && !event.composedPath?.().some((node) => node === moreMenuEl || node === moreButton)) closeMoreMenu();
    if (!contextMoreMenuEl?.hidden && !event.composedPath?.().some((node) => node === contextMoreMenuEl || node === contextMoreButton)) closeContextMoreMenu();
    if (!referenceKindMenu?.hidden && !event.composedPath?.().some((node) => node === referenceKindMenu || node === referenceKindTrigger || node === referenceKindPicker)) closeReferenceKindMenu();
    if (!referenceBrandMenu?.hidden && !event.composedPath?.().some((node) => node === referenceBrandMenu || node === referenceBrandTrigger || node === referenceBrandPicker)) closeReferenceBrandMenu();
    if (!aiChatMenu?.hidden && !event.composedPath?.().some((node) => node === aiChatMenu || node === aiChatTrigger || node === aiChat)) closeCodexChatMenu();
    if (openDesignPickerMenu && !event.composedPath?.().some((node) => node === openDesignPickerMenu.menu || node === openDesignPickerMenu.trigger || node?.contains?.(openDesignPickerMenu.menu) || node?.contains?.(openDesignPickerMenu.trigger))) closeDesignPickers();
    if (!selectMode) {
      if (activeTool === "hand") explain("Hand tool (H): drag to pan — press V or click Move in the tool rail to select elements");
      return;
    }
    const path = event.composedPath?.() || [];
    if (path.includes(host)) return;
    const result = candidateFrom(event);
    if (!result.element) { explain(result.reason || "Could not select that target"); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    choose(result.element);
    if (activeTool === "text" && textInput && isTextElement(result.element)) focusTextInput();
  };
  const previewWidth = (value) => {
    if (!active?.element.isConnected || !Number.isFinite(value)) return false;
    const clamped = Math.round(Math.min(10_000, Math.max(1, value)));
    active.element.style.setProperty("width", clamped + "px", "important");
    const actual = active.element.getBoundingClientRect().width;
    if (!Number.isFinite(actual) || actual <= 0) { restorePreview(active); return false; }
    active.previewWidth = Math.min(10_000, Math.max(1, Math.round(actual)));
    syncLayoutInputs();
    const now = performance.now();
    if (now - lastPreviewSent >= 100) {
      lastPreviewSent = now;
    }
    cacheDraft();
    scheduleAutosave();
    scheduleGeometry();
    updateApplyState();
    return true;
  };
  const previewHeight = (value) => {
    if (!active?.element.isConnected || !Number.isFinite(value)) return false;
    const clamped = Math.round(Math.min(10_000, Math.max(1, value)));
    active.element.style.setProperty("height", clamped + "px", "important");
    const actual = active.element.getBoundingClientRect().height;
    if (!Number.isFinite(actual) || actual <= 0) { restorePreview(active); return false; }
    active.previewHeight = Math.min(10_000, Math.max(1, Math.round(actual)));
    syncLayoutInputs();
    cacheDraft();
    scheduleAutosave();
    scheduleGeometry();
    updateApplyState();
    return true;
  };
  const queueHeightPreview = (value) => {
    if (previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => { previewFrame = undefined; previewHeight(value); });
  };
  const onTextInput = () => {
    if (!active || !textInput) return;
    const next = textInput.value;
    active.previewText = next;
    setElementText(active.element, next);
    scheduleGeometry();
    cacheDraft();
    scheduleAutosave();
    queueMapping();
    updateApplyState();
    scheduleEditHistory();
  };
  const setPreviewStyle = (property, value) => {
    if (!active) return;
    active.previewStyles = { ...active.previewStyles, [property]: value };
    active.element.style.setProperty(property, value);
    if (property === "font-weight") formatBold?.setAttribute("aria-pressed", String(Number.parseInt(value, 10) >= 700 || value === "bold"));
    if (property === "font-style") formatItalic?.setAttribute("aria-pressed", String(value === "italic"));
    if (property === "text-decoration") formatUnderline?.setAttribute("aria-pressed", String(value.includes("underline")));
    if (property === "text-align") {
      for (const button of [formatAlignLeft, formatAlignCenter, formatAlignRight]) button?.setAttribute("aria-pressed", "false");
      if (value === "left") formatAlignLeft?.setAttribute("aria-pressed", "true");
      if (value === "center") formatAlignCenter?.setAttribute("aria-pressed", "true");
      if (value === "right") formatAlignRight?.setAttribute("aria-pressed", "true");
    }
    scheduleGeometry();
    cacheDraft();
    scheduleAutosave();
    queueMapping();
    updateApplyState();
    if (property === "border-radius") syncLayoutInputs();
    scheduleEditHistory();
  };
  const bumpFontSize = (delta) => {
    if (!active) return;
    const current = Number.parseFloat(active.previewStyles["font-size"] || getComputedStyle(active.element).fontSize) || 16;
    setPreviewStyle("font-size", Math.max(8, Math.min(96, Math.round(current + delta))) + "px");
  };
  const queuePreview = (value) => {
    if (previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => { const started = performance.now(); previewFrame = undefined; previewWidth(value); recordMetric("preview", started); });
  };
  const onHandleMoveDown = (event) => {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = active.element.getBoundingClientRect();
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startWidth: active.previewWidth, startHeight: active.previewHeight, axis: "move", startTranslateX: active.previewTranslate?.x || 0, startTranslateY: active.previewTranslate?.y || 0, grabOffsetX: event.clientX - (rect.left + rect.width / 2), grabOffsetY: event.clientY - (rect.top + rect.height / 2), baseCenterX: rect.left + rect.width / 2, baseCenterY: rect.top + rect.height / 2 };
    // #region agent log
    debugLog("browser-client:moveDrag", "move pointerdown", { x: event.clientX, y: event.clientY, startTranslateX: drag.startTranslateX, startTranslateY: drag.startTranslateY }, "H10");
    // #endregion
    handleMove?.setPointerCapture?.(event.pointerId);
    startDocumentDrag();
  };
  const onHandleDown = (event) => {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startWidth: active.previewWidth, startHeight: active.previewHeight, axis: "width" };
    handle.setPointerCapture?.(event.pointerId);
    startDocumentDrag();
  };
  const onHandleHeightDown = (event) => {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startWidth: active.previewWidth, startHeight: active.previewHeight, axis: "height" };
    handleHeight?.setPointerCapture?.(event.pointerId);
    startDocumentDrag();
  };
  const onDragPointerMove = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.axis === "move") {
      const centerX = event.clientX - drag.grabOffsetX;
      const centerY = event.clientY - drag.grabOffsetY;
      active.previewTranslate = { x: drag.startTranslateX + (centerX - drag.baseCenterX), y: drag.startTranslateY + (centerY - drag.baseCenterY) };
      applyPreviewTransform(active);
      scheduleGeometry();
      return;
    }
    if (drag.axis === "height") queueHeightPreview(drag.startHeight + event.clientY - drag.startY);
    else queuePreview(drag.startWidth + event.clientX - drag.startX);
  };
  const onDragPointerUp = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const handleEl = drag.axis === "move" ? handleMove : drag.axis === "height" ? handleHeight : handle;
    handleEl?.releasePointerCapture?.(event.pointerId);
    if (drag.axis === "move") {
      // #region agent log
      debugLog("browser-client:moveDrag", "move pointerup", { translateX: active.previewTranslate?.x, translateY: active.previewTranslate?.y }, "H10");
      // #endregion
      syncTranslateToPreviewStyles();
      cacheDraft();
      scheduleAutosave();
      queueMapping();
      updateApplyState();
      pushEditHistory();
    } else if (drag.axis === "width" || drag.axis === "height") {
      cacheDraft();
      scheduleAutosave();
      queueMapping();
      updateApplyState();
      pushEditHistory();
    }
    drag = undefined;
    endDocumentDrag();
    scheduleGeometry();
  };
  const startDocumentDrag = () => {
    document.addEventListener("pointermove", onDragPointerMove, true);
    document.addEventListener("pointerup", onDragPointerUp, true);
    document.addEventListener("pointercancel", onDragPointerUp, true);
  };
  const endDocumentDrag = () => {
    document.removeEventListener("pointermove", onDragPointerMove, true);
    document.removeEventListener("pointerup", onDragPointerUp, true);
    document.removeEventListener("pointercancel", onDragPointerUp, true);
  };
  const onDesignFillInput = () => { if (!active) return; setPreviewStyle("background-color", designFill.value); if (designFillHex) designFillHex.value = designFill.value; };
  const onDesignFillHexInput = () => {
    if (!active || !designFillHex) return;
    const hex = designFillHex.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) { designFill.value = hex; onDesignFillInput(); }
  };
  const onDesignOpacityInput = () => { if (!active) return; setPreviewStyle("opacity", String(Math.max(0, Math.min(100, Number(designOpacity.value) || 0)) / 100)); };
  const onDesignBorderWidthInput = () => { if (!active) return; const width = Math.max(0, Math.round(Number(designBorderWidth.value) || 0)); setPreviewStyle("border-width", width ? width + "px" : ""); setPreviewStyle("border-style", width ? "solid" : ""); };
  const onDesignBorderColorInput = () => { if (!active) return; setPreviewStyle("border-color", designBorderColor.value); };
  const onDesignFontSizeInput = () => { if (!active) return; setPreviewStyle("font-size", Math.max(8, Math.min(96, Math.round(Number(designFontSize.value) || 16))) + "px"); };
  const onDesignLineHeightInput = () => { if (!active) return; const value = Number(designLineHeight.value); if (!Number.isFinite(value)) return; setPreviewStyle("line-height", String(value)); };
  const onDesignLetterSpacingInput = () => { if (!active) return; setPreviewStyle("letter-spacing", (Number(designLetterSpacing.value) || 0) + "px"); };
  const onDesignShadowInput = () => {
    if (!active) return;
    const x = Number(designShadowX?.value) || 0;
    const y = Number(designShadowY?.value) || 0;
    const blur = Math.max(0, Number(designShadowBlur?.value) || 0);
    const color = designShadowColor?.value || "#000000";
    if (!x && !y && !blur) setPreviewStyle("box-shadow", "");
    else setPreviewStyle("box-shadow", x + "px " + y + "px " + blur + "px " + color);
  };
  const onDesignTranslateInput = () => {
    if (!active) return;
    active.previewTranslate = { x: Number(designTranslateX?.value) || 0, y: Number(designTranslateY?.value) || 0 };
    applyPreviewTransform(active);
    syncTranslateToPreviewStyles();
    cacheDraft();
    scheduleAutosave();
    queueMapping();
    updateApplyState();
    scheduleGeometry();
  };
  const onDesignSelectInput = (property, control) => () => { if (!active || !control) return; setPreviewStyle(property, control.value); };
  const onDesignUnitInput = (field) => () => { if (!active || !field?.property) return; setPreviewStyle(field.property, styleValueFromUnit(field.input, field.unit)); };
  const onDesignZInput = () => { if (!active) return; const value = Number(designZ.value); setPreviewStyle("z-index", Number.isFinite(value) ? String(value) : ""); };
  const onDesignBgImageInput = () => { if (!active) return; const raw = designBgImage.value.trim(); setPreviewStyle("background-image", raw ? (raw.startsWith("url(") ? raw : "url(" + raw + ")") : ""); };
  const onDesignOutlineInput = () => { if (!active) return; setPreviewStyle("outline", designOutline.value.trim()); };
  const onDesignBlurInput = () => { if (!active) return; const blur = Math.max(0, Number(designBlur.value) || 0); setPreviewStyle("filter", blur ? "blur(" + blur + "px)" : ""); };
  let layersResizeDrag;
  const onLayersResizeDown = (event) => {
    if (!layersPanel || event.button !== 0) return;
    event.preventDefault();
    layersResizeDrag = { pointerId: event.pointerId, startX: event.clientX, startWidth: layersPanelWidth };
    layersResize?.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", onLayersResizeMove, true);
    document.addEventListener("pointerup", onLayersResizeUp, true);
    document.addEventListener("pointercancel", onLayersResizeUp, true);
  };
  const onLayersResizeMove = (event) => {
    if (!layersResizeDrag || layersResizeDrag.pointerId !== event.pointerId) return;
    layersPanelWidth = Math.min(420, Math.max(280, Math.round(layersResizeDrag.startWidth + (event.clientX - layersResizeDrag.startX))));
    if (layersPanel) layersPanel.style.width = layersPanelWidth + "px";
  };
  const onLayersResizeUp = (event) => {
    if (!layersResizeDrag || layersResizeDrag.pointerId !== event.pointerId) return;
    layersResize?.releasePointerCapture?.(event.pointerId);
    layersResizeDrag = undefined;
    document.removeEventListener("pointermove", onLayersResizeMove, true);
    document.removeEventListener("pointerup", onLayersResizeUp, true);
    document.removeEventListener("pointercancel", onLayersResizeUp, true);
  };
  const onLayoutWidthInput = () => { if (!active || !layoutWidth) return; previewWidth(Number(layoutWidth.value)); cacheDraft(); pushEditHistory(); };
  const onLayoutHeightInput = () => { if (!active || !layoutHeight) return; previewHeight(Number(layoutHeight.value)); cacheDraft(); pushEditHistory(); };
  const onLayoutRadiusInput = () => { if (!active || !layoutRadius) return; setPreviewStyle("border-radius", Math.max(0, Math.min(999, Math.round(Number(layoutRadius.value) || 0))) + "px"); pushEditHistory(); };
  const onLayoutPositionInput = () => {
    if (!active || !layoutX || !layoutY) return;
    const rect = active.element.getBoundingClientRect();
    const tx = active.previewTranslate?.x || 0;
    const ty = active.previewTranslate?.y || 0;
    const baseLeft = rect.left - tx;
    const baseTop = rect.top - ty;
    const nextX = Number(layoutX.value);
    const nextY = Number(layoutY.value);
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;
    active.previewTranslate = { x: (active.previewTranslate?.x || 0) + (nextX - baseLeft), y: (active.previewTranslate?.y || 0) + (nextY - baseTop) };
    applyPreviewTransform(active);
    syncTranslateToPreviewStyles();
    cacheDraft();
    scheduleAutosave();
    queueMapping();
    updateApplyState();
    scheduleGeometry();
    pushEditHistory();
  };
  const onKeyDown = (event) => {
    const inField = blocksToolShortcuts(event);
    const toolShortcutBlocked = inField || event.ctrlKey || event.metaKey || event.altKey;
    if (!toolShortcutBlocked) {
      const key = event.key.toLowerCase();
      if (key === "v") { event.preventDefault(); setActiveTool("select"); return; }
      if (key === "h") { event.preventDefault(); setActiveTool("hand"); return; }
      if (key === "c") { event.preventDefault(); setActiveTool("comment"); return; }
      if (key === "t") { event.preventDefault(); setActiveTool("text"); return; }
      if (key === "d" && event.shiftKey && active && !commentMode) { event.preventDefault(); toggleDesignPanel(); return; }
    }
    if (commentMode && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); undoComment(); return; }
    if (commentMode && (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "z" && event.shiftKey || event.key.toLowerCase() === "y")) { event.preventDefault(); redoComment(); return; }
    if (!commentMode && selectMode && active && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey && !inField) { event.preventDefault(); undoEdit(); return; }
    if (!commentMode && selectMode && active && (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "z" && event.shiftKey || event.key.toLowerCase() === "y") && !inField) { event.preventDefault(); redoEdit(); return; }
    if (commentMode && event.key === "Delete" && selectedImageId) { event.preventDefault(); pushCommentHistory(); void deleteImageAnnotation(selectedImageId).then(() => pushCommentHistory()); return; }
    if (!commentMode && selectMode && active && event.key === "Delete" && !inField) { event.preventDefault(); deleteSelected(); return; }
    if (event.key === "Escape" && aiPanel && !aiPanel.hidden && !inField) { event.preventDefault(); closeAiPanel(); return; }
    if (event.key === "Escape" && referenceKindMenu && !referenceKindMenu.hidden) { event.preventDefault(); closeReferenceKindMenu(); return; }
    if (event.key === "Escape" && referenceBrandMenu && !referenceBrandMenu.hidden) { event.preventDefault(); closeReferenceBrandMenu(); return; }
    if (event.key === "Escape" && aiChatMenu && !aiChatMenu.hidden) { event.preventDefault(); closeCodexChatMenu(); return; }
    if (event.key === "Escape" && openDesignPickerMenu) { event.preventDefault(); closeDesignPickers(); return; }
    if (event.key === "Escape" && sourceCompareOverlay && !sourceCompareOverlay.hidden) { event.preventDefault(); closeSourceCompare(); return; }
    if (event.key === "Escape" && commentMode) { event.preventDefault(); exitCommentMode(); return; }
    if (event.key === "Escape" && (!timeOverlay?.hidden || !historyDialog?.hidden || !elementHistoryDialog?.hidden || !annotationDialog?.hidden)) { event.preventDefault(); closeComparison(); closeSourceCompare(); closeHistory(); closeElementHistory(); closeAnnotations(); return; }
    if (event.currentTarget === time && event.key === " " && !event.repeat) { event.preventDefault(); startTimeHold(); return; }
    if (selectMode && event.key === "Escape" && active) { event.preventDefault(); clearSelection(active.applying ? "Apply cancelled" : "Temporary resize cancelled", true, true, Boolean(active.applying)); }
  };
  const onTimeKeyUp = (event) => { if (event.key === " ") { event.preventDefault(); endTimeHold(); } };
  const onTimePointerDown = (event) => { if (event.button !== 0) return; startTimeHold(event.pointerId); };
  const onTimePointerUp = (event) => endTimeHold(event.pointerId);
  const onTimeClick = (event) => { if (suppressHistoryClick) { suppressHistoryClick = false; event.preventDefault(); return; } openHistory(); };
  const cancelTimeMachine = () => { closeComparison(); closeSourceCompare(); closeHistory(); closeElementHistory(); };
  const onToolbarDesignClick = () => { if (!active) { explain("Select an element to open the design panel"); return; } toggleDesignPanel(); };
  const hasPendingChanges = () => {
    if (!active) return false;
    const widthChanged = active.previewWidth !== Math.round(active.original.computedWidth);
    const heightChanged = active.previewHeight !== Math.round(active.original.computedHeight);
    const textChanged = active.previewText !== active.original.text;
    return widthChanged || heightChanged || textChanged || stylesChanged(active) || translateChanged(active);
  };
  const commitSavedPreview = (message = "Saved") => {
    if (!active?.element.isConnected) return;
    const rect = active.element.getBoundingClientRect();
    active.original = {
      ...active.original,
      inlineWidthPresent: Array.from({ length: active.element.style.length }, (_, index) => active.element.style.item(index)).includes("width") || active.previewWidth !== Math.round(active.original.computedWidth),
      inlineWidth: active.element.style.getPropertyValue("width") || active.original.inlineWidth,
      inlineWidthPriority: active.element.style.getPropertyPriority("width") || active.original.inlineWidthPriority,
      computedWidth: rect.width,
      inlineHeightPresent: Array.from({ length: active.element.style.length }, (_, index) => active.element.style.item(index)).includes("height") || active.previewHeight !== Math.round(active.original.computedHeight),
      inlineHeight: active.element.style.getPropertyValue("height") || active.original.inlineHeight,
      inlineHeightPriority: active.element.style.getPropertyPriority("height") || active.original.inlineHeightPriority,
      computedHeight: rect.height,
      text: active.previewText,
      styles: { ...active.previewStyles },
      inlineTransformPresent: Array.from({ length: active.element.style.length }, (_, index) => active.element.style.item(index)).includes("transform"),
      inlineTransform: active.element.style.getPropertyValue("transform"),
      inlineTransformPriority: active.element.style.getPropertyPriority("transform"),
    };
    active.previewTranslate = { x: 0, y: 0 };
    active.previewWidth = Math.round(rect.width);
    active.previewHeight = Math.round(rect.height);
    syncLayoutInputs();
    explain(message);
    updateApplyState();
  };
  const scheduleAutosave = () => {
    if (!active || active.applying || active.overlapBlocked) return;
    if (!hasPendingChanges()) return;
    if (!usesOverridesPath(active) && !mappingWritable(active)) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (diagnostic && active && !active.applying) diagnostic.textContent = usesOverridesPath(active) ? "Unsaved — saves to .reframe/overrides.css" : "Unsaved changes";
    autosaveTimer = setTimeout(() => { autosaveTimer = undefined; commitChanges({ autosave: true }); }, AUTOSAVE_MS);
  };
  const flushAutosave = async () => {
    if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = undefined; }
    if (!active || !hasPendingChanges() || active.applying) return;
    commitChanges({ autosave: true });
    while (active?.applying) await new Promise((resolve) => setTimeout(resolve, 50));
  };
  const commitChanges = ({ autosave = false } = {}) => {
    if (!active || active.applying) return;
    if (!hasPendingChanges()) return;
    const overridesPath = usesOverridesPath(active);
    if (overridesPath && state !== "connected") {
      if (commitInlinePreview()) explain(autosave ? "Saved" : "Saved");
      return;
    }
    if (!overridesPath && !mappingWritable(active)) return;
    autosaveMode = autosave;
    active.proposalId = correlation("proposal");
    active.applying = true;
    pageErrors.length = 0;
    updateApplyState();
    syncTranslateToPreviewStyles();
    if (translateChanged(active)) {
      const transform = transformPreviewValue(active);
      if (transform) active.previewStyles = { ...active.previewStyles, transform };
    }
    const sent = send({ ...base("edit:apply", correlation("apply")), selectionId: active.selectionId, proposalId: active.proposalId, tabId, generation: active.generation, width: active.previewWidth, height: active.previewHeight, previewText: active.previewText === active.original.text ? null : active.previewText, previewStyles: stylesChanged(active) || translateChanged(active) ? active.previewStyles : null, fingerprint: active.fingerprint, original: active.original, breakpoint: active.breakpoint, sharedImpactAccepted: active.sharedImpactAccepted, overlapAccepted: active.overlapAccepted });
    if (!sent) { active.applying = false; autosaveMode = false; explain("Disconnected — preview is temporary"); updateApplyState(); return; }
    explain(autosave ? (overridesPath ? "Autosaving to .reframe/overrides.css…" : "Autosaving…") : (overridesPath ? "Saving to .reframe/overrides.css…" : "Saving to source…"));
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      if (!active?.applying) return;
      active.applying = false;
      autosaveMode = false;
      explain("Save timed out — press Deselect to continue");
      updateApplyState();
    }, 45_000);
  };
  const commitInlinePreview = () => {
    if (!active?.element.isConnected) return false;
    const widthChanged = active.previewWidth !== Math.round(active.original.computedWidth);
    const heightChanged = active.previewHeight !== Math.round(active.original.computedHeight);
    const textChanged = active.previewText !== active.original.text;
    syncTranslateToPreviewStyles();
    const styleChanged = stylesChanged(active);
    if (!widthChanged && !heightChanged && !textChanged && !styleChanged) return false;
    if (widthChanged) active.element.style.setProperty("width", active.previewWidth + "px", "important");
    if (heightChanged) active.element.style.setProperty("height", active.previewHeight + "px", "important");
    if (textChanged) setElementText(active.element, active.previewText);
    if (styleChanged) applyPreviewStyles(active);
    else applyPreviewTransform(active);
    const rect = active.element.getBoundingClientRect();
    active.original = {
      ...active.original,
      inlineWidthPresent: widthChanged || active.original.inlineWidthPresent,
      inlineWidth: widthChanged ? active.previewWidth + "px" : active.original.inlineWidth,
      inlineWidthPriority: widthChanged ? "important" : active.original.inlineWidthPriority,
      computedWidth: rect.width,
      inlineHeightPresent: heightChanged || active.original.inlineHeightPresent,
      inlineHeight: heightChanged ? active.previewHeight + "px" : active.original.inlineHeight,
      inlineHeightPriority: heightChanged ? "important" : active.original.inlineHeightPriority,
      computedHeight: rect.height,
      text: active.previewText,
      styles: { ...active.previewStyles },
    };
    active.previewTranslate = { x: 0, y: 0 };
    active.previewWidth = Math.round(rect.width);
    active.previewHeight = Math.round(rect.height);
    active.mappingConfidence = "not-mapped";
    explain("Saved inline preview (no source mapping)");
    syncReferencePlacementUI();
    updateApplyState();
    return true;
  };
  const applyProposal = () => {
    if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = undefined; }
    if (active?.applying) return;
    updateApplyState();
    if (!active || !hasPendingChanges()) return;
    commitChanges({ autosave: false });
  };
  const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const verifyTarget = (selection) => {
    if (!selection?.element) return null;
    if (selection.element.id) return selection.element;
    const parentId = selection.fingerprint?.parent?.id;
    if (parentId) {
      const parent = document.getElementById(parentId);
      if (parent) return parent;
    }
    return selection.element;
  };
  const verifyRendered = async (message) => {
    const respond = (ok, renderedWidth, renderedHeight, errors = pageErrors.slice()) => {
      send({ ...base("edit:verification", message.correlationId), selectionId: message.selectionId, proposalId: message.proposalId, tabId, generation: message.generation, ok, renderedWidth, renderedHeight, pageErrors: errors });
    };
    if (!active || message.selectionId !== active.selectionId || message.tabId !== tabId || message.generation !== active.generation) {
      respond(false, 0, 0, ["SELECTION_MISMATCH"]);
      return;
    }
    // #region agent log
    debugLog("browser-client:verifyRendered", "verify start", { recovery: Boolean(message.recovery), width: message.width }, "H6");
    // #endregion
    if (!message.recovery) {
      refreshStylesheets();
      await waitForPaint();
    }
    const expectedWidth = active.previewWidth;
    const verifyHeight = message.height != null;
    const expectedHeight = verifyHeight ? message.height : active.previewHeight;
    restorePreview(active);
    if (message.recovery) {
      pageErrors.length = 0;
      for (const link of document.querySelectorAll('link[rel~="stylesheet"]')) {
        const fresh = new URL(link.href, location.href);
        fresh.searchParams.set("reframe-recovery", String(Date.now()));
        link.href = fresh.href;
      }
      await waitForPaint();
    }
    const target = verifyTarget(active);
    if (!target?.isConnected) {
      respond(false, 0, 0, ["VERIFY_TARGET_MISSING"]);
      return;
    }
    let verifyEl = target;
    let stableFrames = 0;
    let renderedWidth = 0;
    let renderedHeight = 0;
    const deadline = performance.now() + Math.max(1, message.timeoutMs - 50);
    while (performance.now() < deadline) {
      if (!verifyEl.isConnected) {
        const replacement = verifyTarget(active);
        if (replacement) verifyEl = replacement;
      }
      const overlay = document.querySelector("vite-error-overlay");
      if (overlay && !pageErrors.includes("VITE_ERROR_OVERLAY")) rememberError("VITE_ERROR_OVERLAY");
      if (verifyEl.isConnected) {
        const rect = verifyEl.getBoundingClientRect();
        renderedWidth = rect.width;
        renderedHeight = rect.height;
        const widthOk = Math.abs(Math.round(renderedWidth) - Math.round(message.width)) <= 1;
        const heightOk = !verifyHeight || Math.abs(Math.round(renderedHeight) - expectedHeight) <= 1;
        const dimensionOk = widthOk && heightOk;
        stableFrames = dimensionOk ? stableFrames + 1 : 0;
        if (stableFrames >= 2) break;
      }
      await new Promise(requestAnimationFrame);
    }
    respond(stableFrames >= 2 && pageErrors.length === 0, renderedWidth, renderedHeight);
  };
  const onRouteChange = () => {
    const next = route();
    if (next === currentRoute) return;
    currentRoute = next;
    hideHover();
    if (active) clearSelection("Route changed; reselect the element");
    closeComparison(); closeHistory(); closeElementHistory(); closeAnnotations(); commentPointer = undefined; endCommentPointerTracking(); annointId = undefined; annointDraft = { strokes: [], texts: [] }; annointPointer = undefined; requestHistory(); requestAnnotations(); scheduleAnnotations(); void loadAnnoints();
  };
  const sendPing = (kind) => {
    const id = correlation(kind);
    if (!send(base("ping", id))) return false;
    if (kind === "test" && diagnostic) diagnostic.textContent = "Waiting " + id;
    const timer = setTimeout(() => {
      pending.delete(id);
      if (disposed) return;
      setState("disconnected");
      socket?.close(4408, "HEARTBEAT_TIMEOUT");
    }, heartbeatTimeoutMs);
    pending.set(id, timer);
    return true;
  };
  const scheduleReconnect = () => {
    if (disposed || reconnectTimer) return;
    setState("disconnected");
    const delay = Math.min(reconnectMaxMs, reconnectBaseMs * 2 ** Math.min(attempts, 6));
    attempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      setState(attempts > 8 ? "failed" : "reconnecting");
      connect();
    }, delay + Math.floor(delay * Math.random() * .2));
  };
  const onMessage = (event) => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (!message || message.protocol !== PROTOCOL || message.sessionId !== session || typeof message.correlationId !== "string") return;
    if (message.type === "server:ready" && message.project?.id === projectId && typeof message.connectionId === "string") {
      connectionId = message.connectionId;
      if (active) { send({ ...base("selection:changed", correlation("selection")), selectionId: active.selectionId, generation: active.generation }); queueMapping(); }
      sendPing("ready");
      void ensureSessionSnapshot();
      requestHistory();
      scheduleHistoryRetry();
      requestAnnotations();
      void loadAnnoints();
      void loadPendingAiReview();
      warnDirectoryListingPage();
      if (!active && selectMode) explain("Click an element to select · V select · H pan");
    } else if (message.type === "ping") {
      send(base("pong", message.correlationId));
    } else if (message.type === "pong") {
      const timer = pending.get(message.correlationId);
      if (timer) { clearTimeout(timer); pending.delete(message.correlationId); }
      attempts = 0;
      setState("connected");
      if (message.correlationId.startsWith("test_") && diagnostic) diagnostic.textContent = "Pong " + message.correlationId;
    } else if (message.type === "server:error") {
      if (diagnostic) diagnostic.textContent = message.code;
    } else if (message.type === "edit:verify") {
      void verifyRendered(message);
    } else if (message.type === "mapping:result" && active && message.selectionId === active.selectionId && message.generation === active.generation) {
      active.mappingConfidence = message.confidence;
      active.stableMappingConfidence = message.confidence;
      active.mappingEvidence = message.evidence;
      active.mappingRequiresImpact = Boolean(message.requiresImpactApproval);
      if (mappingLabel) mappingLabel.textContent = message.confidence;
      if (impact) impact.hidden = !message.requiresImpactApproval || active.sharedImpactAccepted;
      const candidate = message.candidates?.[0];
      active.mappingSource = candidate;
      if (!active.element.hasAttribute("data-reframe-component")) {
        if (candidate) active.element.setAttribute("data-reframe-source", candidate.path + ":" + candidate.line);
        else active.element.removeAttribute("data-reframe-source");
      }
      const styleOwner = message.candidates?.find((item) => /\.css$/i.test(item.path)) ?? message.candidates?.find((item) => !item.evidence.startsWith("React component "));
      active.referenceSource = styleOwner ?? candidate;
      if (styleOwner) active.element.setAttribute("data-reframe-style-owner", styleOwner.path + ":" + styleOwner.line);
      else active.element.removeAttribute("data-reframe-style-owner");
      active.element.setAttribute("data-reframe-reused", String(Boolean(message.requiresImpactApproval || active.sharedImpactAccepted)));
      explain(mappingStatusMessage(message.confidence, message.evidence, Boolean(message.requiresImpactApproval)));
      syncReferencePlacementUI();
      syncGenerateButton();
      updateApplyState();
    } else if (message.type === "ai:state") {
      applyAiState(message);
    } else if (message.type === "edit:result" && active && message.tabId === tabId) {
      // #region agent log
      debugLog("browser-client:edit:result", "apply rejected", { status: message.status, code: message.code }, "H3");
      // #endregion
      if (message.proposalId !== active.proposalId) {
        if (active.applying) { active.applying = false; autosaveMode = false; updateApplyState(); }
        return;
      }
      if (applyTimer) { clearTimeout(applyTimer); applyTimer = undefined; }
      active.applying = false;
      autosaveMode = false;
      active.proposalId = correlation("proposal");
      if (message.selectionId !== active.selectionId || message.generation !== active.generation) { updateApplyState(); return; }
      if (message.status === "critical") {
        active.mappingConfidence = "not-mapped";
        restorePreview(active);
        syncReferencePlacementUI();
      } else if (message.code === "FILE_STALE") {
        active.mappingConfidence = "pending";
        requestMapping();
      } else if (message.code === "NO_CHANGES" && active.element.isConnected) {
        const rect = active.element.getBoundingClientRect();
        active.original = { ...active.original, computedWidth: rect.width, computedHeight: rect.height };
        active.previewWidth = Math.round(rect.width);
        active.previewHeight = Math.round(rect.height);
        explain("Source already matches this preview");
      } else if (message.code === "STYLE_UNMAPPED" || /No unique static|Multiple .* owners remain/i.test(message.code || "")) {
        explain("Saved to .reframe/overrides.css (unmapped element)");
      } else if (message.code === "CHECKPOINT_MISSING") {
        explain("Apply failed: history checkpoint was not created — retry or reselect");
      } else if (message.code?.startsWith("VERIFICATION_FAILED") || message.status === "rolled-back") {
        explain("Apply rolled back: rendered size did not match preview — adjust and retry");
      } else if (message.code?.startsWith("USER_CHANGE_OVERLAP:")) {
        active.overlapBlocked = true;
        if (overlap) overlap.hidden = false;
        explain("Source changed outside Reframe — click Save resize safely");
        updateApplyState();
        return;
      }
      explain(message.status + ": " + message.code + " — retry or reselect");
      updateApplyState();
    } else if (message.type === "edit:accepted") {
      // #region agent log
      debugLog("browser-client:edit:accepted", "apply accepted", { checkpointId: message.checkpointId, visualComplete: message.visualComplete, proposalId: message.proposalId, selectionId: message.selectionId }, "H4");
      // #endregion
      const ours = Boolean(active && message.proposalId === active.proposalId && message.selectionId === active.selectionId && message.generation === active.generation);
      if (applyTimer) { clearTimeout(applyTimer); applyTimer = undefined; }
      const overridesLink = document.querySelector('link[data-reframe-overrides]');
      if (overridesLink) { const fresh = new URL(overridesLink.href, location.href); fresh.searchParams.set("reframe", String(Date.now())); overridesLink.href = fresh.href; }
      // ponytail: full stylesheet reload only when preview styles changed; width/height/text skips re-fetching every CSS file
      if (ours && (stylesChanged(active) || message.code === "SOURCE_CLASS_PROMOTED")) refreshStylesheets();
      if (!message.checkpointId) {
        if (ours) {
          active.applying = false;
          const wasAutosave = autosaveMode;
          autosaveMode = false;
          clearDraftCache();
          if (message.code === "SOURCE_CLASS_PROMOTED") {
            applySourcePromotion();
            commitSavedPreview(promotionSaveMessage(wasAutosave));
          } else {
            const saved = usesOverridesPath(active) ? overrideSaveMessage(wasAutosave) : (wasAutosave ? "Autosaved" : "Saved to .reframe/overrides");
            commitSavedPreview(saved);
          }
        } else if (active?.applying && message.proposalId === active.proposalId) {
          active.applying = false;
          autosaveMode = false;
          updateApplyState();
        }
        requestHistory();
        return;
      }
      if (ours) {
        active.applying = false;
        active.overlapBlocked = false;
        active.overlapAccepted = false;
        if (overlap) overlap.hidden = true;
        clearDraftCache();
        historyState = { ...historyState, canRestore: true };
        if (autosaveMode) {
          autosaveMode = false;
          commitSavedPreview(usesOverridesPath(active) ? overrideSaveMessage(true) : "Autosaved");
        } else {
          const savedMessage = message.visualComplete === false ? "Saved to source; visual history degraded" : (message.checkpointId ? "Saved to source" : overrideSaveMessage(false));
          commitSavedPreview(savedMessage);
        }
      } else if (active?.applying && message.proposalId === active.proposalId) {
        active.applying = false;
        autosaveMode = false;
        updateApplyState();
      }
      requestHistory();
    } else if (message.type === "history:state") {
      historyState = { currentId: message.currentId, previousId: message.previousId, canRestore: message.canRestore, visualComplete: message.visualComplete, gitAvailable: message.gitAvailable, dirty: message.dirty, incomplete: message.incomplete || [], checkpoints: message.checkpoints || [], comparison: message.comparison || null };
      if (!historyState.checkpoints.length && state === "connected") scheduleHistoryRetry();
      renderHistory();
      // #region agent log
      if (!historyDialog?.hidden) debugLog("browser-client:history:state", "history refreshed while open", { checkpointCount: historyState.checkpoints.length, currentId: historyState.currentId }, "H9");
      // #endregion
      preloadPrevious();
      if (historyState.incomplete.length) explain("Incomplete history detected; source was not changed. Remove .tmp entries after review.");
      scheduleAnnotationRequest();
    } else if (message.type === "history:result") {
      if (message.status === "applied") { explain("Checkpoint restored; reloading page"); setTimeout(() => location.reload(), 50); }
      else { explain("Restore rejected: " + message.code); requestHistory(); }
    } else if (message.type === "annotation:state") {
      annotationState = { annotations: message.annotations || [], issues: message.issues || [], parsedFiles: message.parsedFiles || 0, renderedForRoute: message.renderedForRoute || 0 }; renderAnnotationList(); scheduleAnnotations();
    } else if (message.type === "annotation:result") {
      if (message.status === "applied") { if (message.code === "ANNOTATION_CREATED" && annotationComment) annotationComment.value = ""; explain(message.code); requestAnnotations(); }
      else explain(message.code + " — comment draft was kept for retry");
    }
  };
  const standaloneAnnotations = [];
  const standaloneCheckpoints = [
    { id: "cp-demo-1", parentId: null, createdAt: Date.now() - 900000, valid: true, promptSummary: "Initial session", verification: "verified", route: "/demo/app.html", kind: "edit", files: ["demo/app.html"] },
    { id: "cp-demo-2", parentId: "cp-demo-1", createdAt: Date.now() - 120000, valid: true, promptSummary: "Styled primary CTA", verification: "verified", route: "/demo/app.html", kind: "edit", files: ["demo/style.css"] },
  ];
  let standaloneCheckpointSeq = 2;
  const dispatchStandalone = (message) => onMessage({ data: JSON.stringify(message) });
  const handleStandaloneOutbound = (message) => {
    const cid = message.correlationId;
    const reply = { protocol: PROTOCOL, sessionId: session, correlationId: cid };
    if (message.type === "client:ready") {
      dispatchStandalone({ ...reply, type: "server:ready", project: { id: projectId }, connectionId: "standalone-demo" });
    } else if (message.type === "ping") {
      dispatchStandalone({ ...reply, type: "pong" });
    } else if (message.type === "mapping:request") {
      dispatchStandalone({ ...reply, type: "mapping:result", selectionId: message.selectionId, generation: message.generation, confidence: "exact", evidence: "Demo mapping — element id matched in demo/app.html", candidates: [{ path: "demo/app.html", line: 24, evidence: "id selector" }, { path: "demo/style.css", line: 88, evidence: "stylesheet rule" }], requiresImpactApproval: false });
    } else if (message.type === "edit:apply") {
      standaloneCheckpointSeq += 1;
      const cpId = "cp-demo-" + standaloneCheckpointSeq;
      const parentId = standaloneCheckpoints[standaloneCheckpoints.length - 1]?.id ?? null;
      standaloneCheckpoints.push({ id: cpId, parentId, createdAt: Date.now(), valid: true, promptSummary: "Visual edit applied", verification: "verified", route: route(), kind: "edit", files: ["demo/style.css"] });
      dispatchStandalone({ ...reply, type: "edit:accepted", selectionId: message.selectionId, proposalId: message.proposalId, generation: message.generation, tabId: message.tabId, checkpointId: cpId, visualComplete: true, code: "STANDALONE_PREVIEW" });
    } else if (message.type === "history:request") {
      const current = standaloneCheckpoints[standaloneCheckpoints.length - 1];
      const previous = standaloneCheckpoints.length > 1 ? standaloneCheckpoints[standaloneCheckpoints.length - 2] : null;
      dispatchStandalone({ type: "history:state", protocol: PROTOCOL, correlationId: cid, sessionId: session, currentId: current?.id ?? null, previousId: previous?.id ?? null, canRestore: standaloneCheckpoints.length > 1, visualComplete: true, gitAvailable: false, dirty: false, incomplete: [], checkpoints: standaloneCheckpoints.slice(-120), comparison: null });
    } else if (message.type === "history:restore") {
      dispatchStandalone({ ...reply, type: "history:result", status: "applied", code: "RESTORED" });
    } else if (message.type === "annotation:list") {
      dispatchStandalone({ type: "annotation:state", protocol: PROTOCOL, correlationId: cid, sessionId: session, annotations: standaloneAnnotations.slice(), issues: [], parsedFiles: 0, renderedForRoute: 0 });
    } else if (message.type === "annotation:create") {
      standaloneAnnotations.push({ id: "ann-" + Date.now(), author: message.author, comment: message.comment, status: "open", route: route(), component: message.component });
      dispatchStandalone({ ...reply, type: "annotation:result", status: "applied", code: "ANNOTATION_CREATED" });
      dispatchStandalone({ type: "annotation:state", protocol: PROTOCOL, correlationId: cid, sessionId: session, annotations: standaloneAnnotations.slice(), issues: [], parsedFiles: 0, renderedForRoute: 0 });
    } else if (message.type === "ai:generate") {
      dispatchStandalone({ type: "ai:state", protocol: PROTOCOL, correlationId: cid, sessionId: session, phase: "complete", generationId: message.generationId || cid, message: "Website demo mode — run npx reframe locally for real Codex edits.", proposal: null });
    }
  };
  const connect = () => {
    if (disposed) return;
    if (standalone) {
      if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
      if (attempts === 0) setState("connecting");
      const current = { readyState: WebSocket.CONNECTING, _open: null, _message: null };
      current.send = (raw) => { try { handleStandaloneOutbound(JSON.parse(raw)); } catch {} };
      current.close = () => { current.readyState = WebSocket.CLOSED; };
      current.addEventListener = (type, fn) => {
        if (type === "open") current._open = fn;
        if (type === "message") current._message = fn;
      };
      socket = current;
      current.addEventListener("message", onMessage);
      setTimeout(() => {
        if (current !== socket || disposed) return;
        current.readyState = WebSocket.OPEN;
        current._open?.();
        send({ ...base("client:ready", correlation("ready")), projectId, url: location.href, route: location.pathname + location.search + location.hash, viewport: { width: innerWidth, height: innerHeight } });
      }, 30);
      return;
    }
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    if (attempts === 0) setState("connecting");
    const current = new WebSocket(socketUrl, protocols);
    socket = current;
    current.addEventListener("open", () => {
      if (current !== socket || disposed) return;
      send({ ...base("client:ready", correlation("ready")), projectId, url: location.href, route: location.pathname + location.search + location.hash, viewport: { width: innerWidth, height: innerHeight } });
    });
    current.addEventListener("message", onMessage);
    current.addEventListener("close", () => {
      if (current !== socket) return;
      socket = undefined;
      connectionId = undefined;
      clearPending();
      updateApplyState();
      scheduleReconnect();
    });
    current.addEventListener("error", () => { if (current === socket && current.readyState === WebSocket.OPEN) current.close(); });
  };
  const heartbeat = setInterval(() => { if (state === "connected" && pending.size === 0) sendPing("heartbeat"); }, heartbeatMs);
  const test = () => { if (!sendPing("test")) { attempts = 0; connect(); } };
  const openComments = () => openAnnotations(true);
  const openCommentsList = () => openAnnotations(false);
  const codexSessionsEndpoint = reframeBasePath + "/codex/sessions";
  const closeCodexChatMenu = () => {
    if (!aiChatMenu || !aiChatTrigger) return;
    aiChatMenu.hidden = true;
    aiChatTrigger.setAttribute("aria-expanded", "false");
  };
  const setCodexChatSelection = (value, label) => {
    aiChatValue = value;
    aiChatSelectedLabel = label;
    if (aiChatLabel) aiChatLabel.textContent = label;
    if (aiChatMenu) {
      for (const item of aiChatMenu.querySelectorAll(".ai-chat-option")) {
        item.setAttribute("aria-selected", item.dataset.reframeCodexChatValue === value ? "true" : "false");
      }
    }
  };
  const renderCodexChatOptions = (sessions, selected) => {
    if (!aiChatMenu) return;
    aiChatMenu.replaceChildren();
    const addOption = (value, label) => {
      const item = document.createElement("li");
      item.className = "ai-chat-option";
      item.role = "option";
      item.dataset.reframeCodexChatValue = value;
      item.title = label;
      item.textContent = label;
      item.setAttribute("aria-selected", value === selected ? "true" : "false");
      aiChatMenu.append(item);
    };
    addOption("", "New local Codex task");
    for (const session of sessions) addOption(session.id, session.label || session.id);
    const match = sessions.find((session) => session.id === selected);
    setCodexChatSelection(selected, match ? (match.label || match.id) : (selected ? selected.slice(0, 8) + "…" : "New local Codex task"));
  };
  const loadCodexSessions = async () => {
    if (!aiChatMenu) return;
    try {
      const response = await fetch(codexSessionsEndpoint, { headers: { Authorization: "Bearer " + token }, cache: "no-store", credentials: "same-origin", referrerPolicy: "same-origin" });
      const value = await response.json().catch(() => ({}));
      const selected = aiChatValue;
      const pasted = aiSessionId?.value.trim() ?? "";
      const sessions = response.ok ? (value.sessions || []) : [];
      renderCodexChatOptions(sessions, selected);
      codexSessionsLoaded = true;
      if (aiStatus && !aiReview) {
        if (!response.ok) aiStatus.textContent = "Could not load Codex tasks — paste a task ID from the Codex app";
        else aiStatus.textContent = sessions.length
          ? "Pick a Codex task or paste a task ID, then click Generate in the panel"
          : "No Codex tasks found — create one in the Codex app (~/.codex) or paste a task ID";
        aiStatus.dataset.reframeAiWarning = "false";
      }
      if (!sessions.length && pasted && aiSessionId) aiSessionId.focus();
    } catch {
      if (aiStatus) {
        aiStatus.textContent = "Could not list local Codex tasks — paste a task ID or start a new task";
        aiStatus.dataset.reframeAiWarning = "false";
      }
    }
  };
  const loadPendingAiReview = async () => {
    if (aiReview) return;
    try {
      const response = await fetch(reframeBasePath + "/ai/pending", { headers: { Authorization: "Bearer " + token }, cache: "no-store", credentials: "same-origin" });
      if (!response.ok) return;
      const value = await response.json().catch(() => ({ reviews: [] }));
      const pending = (value.reviews || []).find((item) => item?.status === "review" || (item?.status === "failed" && aiReviewRecoverable(item)));
      if (!pending) return;
      applyAiState(pending, { openPanel: false });
    } catch { /* pending review is optional */ }
  };
  const openPendingAiReview = () => {
    if (!aiReview) return;
    openAiPanel();
    if (aiStatus) aiStatus.textContent = aiStatusText(aiReview);
    explain("AI changes ready — use Accept or Reject in the panel");
  };
  const openAiPanel = () => {
    closeExclusivePanels("ai");
    if (aiPanel) aiPanel.hidden = false;
    syncAiReviewIndicator();
    void loadCodexSessions();
    scheduleGeometry();
  };
  const openAiPromptPanel = () => {
    if (!active) { explain("Select an element before Generate"); return; }
    if (!["exact", "probable"].includes(active.mappingConfidence)) { explain(generate?.title || "Select a mapped element before Generate"); return; }
    openAiPanel();
    generate?.blur();
    if (aiStatus && !aiReview) aiStatus.textContent = "Enter a prompt, then click Generate in the panel";
    if (aiGenerate) aiGenerate.hidden = aiReview?.status === "generating" || aiReview?.status === "review";
    aiPrompt?.focus();
  };
  const submitAiGenerate = async () => {
    if (!active) { explain("Select an element before Generate"); return; }
    if (!["exact", "probable"].includes(active.mappingConfidence)) { explain(generate?.title || "Select a mapped element before Generate"); return; }
    const instruction = aiPrompt?.value.trim() ?? "";
    if (!instruction) { if (aiStatus) aiStatus.textContent = "Enter a prompt, then click Generate in the panel"; aiPrompt?.focus(); return; }
    openAiPanel();
    const generationId = correlation("generation");
    const conversationId = aiChatValue.trim() || aiSessionId?.value.trim() || undefined;
    const taskLabel = !conversationId
      ? "new ephemeral task"
      : aiChatValue === conversationId
        ? (aiChatSelectedLabel || conversationId.slice(0, 8) + "…")
        : conversationId.slice(0, 8) + "…";
    aiReview = { generationId, status: "generating" };
    if (aiStatus) {
      aiStatus.textContent = conversationId
        ? 'Sending to Codex task "' + taskLabel + '" - open the Codex app to watch progress'
        : "Sending to a new ephemeral Codex task - pick an existing task to continue one in the Codex app";
    }
    if (aiStop) aiStop.hidden = false;
    if (aiGenerate) aiGenerate.hidden = true;
    for (const button of [aiAccept, aiRefine, aiCompare, aiReject, aiDismiss]) if (button) button.hidden = true;
    let imageAttachmentId;
    if (aiAttachedImage) {
      try { imageAttachmentId = await uploadAiAttachment(aiAttachedImage); }
      catch (error) { if (aiStatus) aiStatus.textContent = "Could not upload pasted image: " + (error?.message || error); aiReview = undefined; if (aiGenerate) aiGenerate.hidden = false; return; }
    }
    send({ ...base("ai:generate", correlation("ai")), selectionId: active.selectionId, generation: active.generation, generationId, instruction, ...(conversationId ? { conversationId } : {}), ...(frozenReferencePlanId ? { referencePlanId: frozenReferencePlanId } : {}), ...(imageAttachmentId ? { imageAttachmentId } : {}) });
    scheduleGeometry();
  };
  const onAiPromptKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const aiAction = (action) => {
    if (!aiReview?.generationId) return;
    send({ ...base("ai:action", correlation("ai")), generationId: aiReview.generationId, action, instruction: action === "refine" ? aiPrompt.value.trim() : "" });
    if (aiStatus) aiStatus.textContent = action + " in progress";
  };
  const dismissAi = () => {
    if (!aiReview?.generationId) return clearAiReview();
    send({ ...base("ai:action", correlation("ai")), generationId: aiReview.generationId, action: "dismiss", instruction: "" });
    if (aiStatus) aiStatus.textContent = "Dismissing…";
  };
  const acceptAi = () => aiAction("accept");
  const refineAi = () => aiAction("refine");
  const compareAi = () => aiAction("compare");
  const rejectAi = () => aiAction("reject");
  const stopAi = () => aiAction("stop");
  const observer = new MutationObserver(() => {
    if (active && !active.element.isConnected && !active.applying) clearSelection("Selected element was removed; reselect", false);
    if (hoverTarget && !hoverTarget.isConnected) hideHover();
    // ponytail: skip annotation pass when overlays are hidden
    if (annotationsVisible || commentMode) scheduleAnnotations();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  history.pushState = function(...args) { const result = originalPushState.apply(this, args); onRouteChange(); return result; };
  history.replaceState = function(...args) { const result = originalReplaceState.apply(this, args); onRouteChange(); return result; };
  const teardown = () => {
    if (disposed) return;
    disposed = true;
    clearInterval(heartbeat);
    clearTimeout(reconnectTimer);
    if (applyTimer) clearTimeout(applyTimer);
    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (commentPersistTimer) clearTimeout(commentPersistTimer);
    if (historyRetryTimer) clearTimeout(historyRetryTimer);
    endImageDrag();
    clearLayerDrag();
    if (hoverFrame) cancelAnimationFrame(hoverFrame);
    if (geometryFrame) cancelAnimationFrame(geometryFrame);
    if (layersTreeFrame) cancelAnimationFrame(layersTreeFrame);
    if (chromeMoveFrame) cancelAnimationFrame(chromeMoveFrame);
    if (previewFrame) cancelAnimationFrame(previewFrame);
    if (annotationFrame) cancelAnimationFrame(annotationFrame);
    if (annointScrollFrame) cancelAnimationFrame(annointScrollFrame);
    if (historyRequestTimer) clearTimeout(historyRequestTimer);
    if (annotationRequestTimer) clearTimeout(annotationRequestTimer);
    clearPending();
    observer.disconnect();
    removeEventListener("error", onPageError);
    removeEventListener("unhandledrejection", onUnhandledRejection);
    restorePreview(active);
    canvasZoom = 1;
    document.documentElement.style.transform = "";
    document.documentElement.style.transformOrigin = "";
    if (document.body) { document.body.style.transform = ""; document.body.style.transformOrigin = ""; }
    if (active?.element && !active.element.hasAttribute("data-reframe-component")) active.element.removeAttribute("data-reframe-source");
    active?.element?.removeAttribute("data-reframe-style-owner");
    active?.element?.removeAttribute("data-reframe-reused");
    testConnection?.removeEventListener("click", test);
    annotationsToggle?.removeEventListener("click", toggleAnnotationsVisible);
    commentModeToggle?.removeEventListener("click", toggleCommentMode);
    commentUndo?.removeEventListener("click", undoComment);
    commentRedo?.removeEventListener("click", redoComment);
    editUndo?.removeEventListener("click", undoEdit);
    editRedo?.removeEventListener("click", redoEdit);
    editDelete?.removeEventListener("click", deleteSelected);
    comments?.removeEventListener("click", openComments);
    reference?.removeEventListener("click", openReference);
    aiClose?.removeEventListener("click", closeAiPanel);
    referenceForm?.removeEventListener("submit", buildReferencePlan);
    referenceFreeze?.removeEventListener("click", freezeReferencePlan);
    referenceKind?.removeEventListener("change", onReferenceKindChange);
    referenceFile?.removeEventListener("change", onReferenceFileChange);
    referenceChoose?.removeEventListener("click", onReferenceChoose);
    referenceClearFile?.removeEventListener("click", onReferenceClear);
    referenceDropzone?.removeEventListener("click", onReferenceDropzoneClick);
    referenceDialog?.removeEventListener("paste", onReferencePaste);
    referenceDropzone?.removeEventListener("paste", onReferencePaste);
    referenceDropzone?.removeEventListener("drop", onReferenceDrop);
    referenceDropzone?.removeEventListener("dragover", onReferenceDragOver);
    referenceDropzone?.removeEventListener("dragleave", onReferenceDragLeave);
    revokeReferencePreview();
    apply?.removeEventListener("click", applyProposal);
    impact?.removeEventListener("click", acceptImpact);
    overlap?.removeEventListener("click", acceptOverlap);
    generate?.removeEventListener("click", onToolbarGenerateClick);
    aiGenerate?.removeEventListener("click", onAiGenerateClick);
    aiAttachmentClear?.removeEventListener("click", clearAiAttachedImage);
    document.removeEventListener("paste", onAiPanelPaste, true);
    aiPrompt?.removeEventListener("keydown", onAiPromptKeyDown);
    aiReviewButton?.removeEventListener("click", openPendingAiReview);
    aiAccept?.removeEventListener("click", acceptAi);
    aiRefine?.removeEventListener("click", refineAi);
    aiCompare?.removeEventListener("click", compareAi);
    aiReject?.removeEventListener("click", rejectAi);
    aiDismiss?.removeEventListener("click", dismissAi);
    aiStop?.removeEventListener("click", stopAi);
    handle?.removeEventListener("pointerdown", onHandleDown);
    handleHeight?.removeEventListener("pointerdown", onHandleHeightDown);
    handleMove?.removeEventListener("pointerdown", onHandleMoveDown);
    endDocumentDrag();
    textInput?.removeEventListener("input", onTextInput);
    historyButton?.removeEventListener("click", onHistoryButtonClick);
    contextHistoryButton?.removeEventListener("click", onElementHistoryButtonClick);
    if (chromeHideTimer) clearTimeout(chromeHideTimer);
    document.removeEventListener("pointermove", onGlobalPointerMove, true);
    chrome?.removeEventListener("pointerleave", onChromePointerLeave, true);
    chromeHitZone?.removeEventListener("pointerenter", onChromePointerEnter);
    chromeHitZone?.removeEventListener("pointermove", onChromePointerEnter);
    chromeHitZone?.removeEventListener("pointerdown", onChromePointerDown);
    chromeHitZone?.removeEventListener("click", onChromeHitZoneClick);
    statusChip?.removeEventListener("pointerenter", onChromePointerEnter);
    statusChip?.removeEventListener("pointerdown", onChromePointerDown);
    chrome?.removeEventListener("focusin", onChromeFocusIn);
    endCommentPointerTracking();
    document.removeEventListener("pointerdown", onCommentPointerDown, true);
    document.removeEventListener("pointerdown", onPanPointerDown, true);
    onPanPointerUp({ pointerId: panDrag?.pointerId ?? -1 });
    removeEventListener("resize", scheduleHistoryRequest);
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("dblclick", onDocumentDblClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("paste", onAnnotatePaste, true);
    removeEventListener("scroll", scheduleGeometry, true);
    removeEventListener("resize", scheduleGeometry);
    removeEventListener("resize", scheduleHistoryRequest);
    removeEventListener("scroll", scheduleAnnotations, true);
    removeEventListener("scroll", syncAnnointScroll, true);
    removeEventListener("resize", scheduleAnnotations);
    removeEventListener("popstate", onRouteChange);
    removeEventListener("hashchange", onRouteChange);
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    exit?.removeEventListener("click", teardown);
    restore?.removeEventListener("click", restorePrevious);
    time?.removeEventListener("pointerdown", onTimePointerDown);
    time?.removeEventListener("pointerup", onTimePointerUp);
    time?.removeEventListener("pointercancel", onTimePointerUp);
    time?.removeEventListener("lostpointercapture", onTimePointerUp);
    time?.removeEventListener("click", onTimeClick);
    time?.removeEventListener("keydown", onKeyDown);
    time?.removeEventListener("keyup", onTimeKeyUp);
    historyClose?.removeEventListener("click", closeHistory);
    elementHistoryClose?.removeEventListener("click", closeElementHistory);
    annotationClose?.removeEventListener("click", closeAnnotations);
    annotationForm?.removeEventListener("submit", onAnnotationSubmit);
    removeEventListener("blur", cancelTimeMachine);
    document.removeEventListener("visibilitychange", cancelTimeMachine);
    closeComparison(); closeHistory(); closeElementHistory(); closeAnnotations(); closeReference(); closeAiPanel(); revokeAiAttachmentPreview(); annotationLayer?.replaceChildren(); for (const url of screenshotCache.values()) URL.revokeObjectURL(url); screenshotCache.clear();
    restorePageOffset();
    removeEventListener("pagehide", teardown);
    socket?.close(1000, "EXIT");
    host.remove();
    if (window[key]?.host === host) delete window[key];
  };
  const cancelSelection = () => { if (active) clearSelection(active.applying ? "Apply cancelled" : "Selection cleared", true, true, Boolean(active.applying)); };
  const acceptImpact = () => {
    if (!active) return;
    active.sharedImpactAccepted = true;
    requestMapping();
  };
  const acceptOverlap = () => {
    if (!active?.overlapBlocked) return;
    active.overlapAccepted = true;
    active.overlapBlocked = false;
    active.proposalId = correlation("proposal");
    if (overlap) overlap.hidden = true;
    updateApplyState();
    applyProposal();
  };
  const COMMENT_DRAG_THRESHOLD = 4;
  const endImageDrag = () => { document.removeEventListener("pointermove", onImagePointerMove, true); document.removeEventListener("pointerup", onImagePointerUp, true); document.removeEventListener("pointercancel", onImagePointerUp, true); imageDrag = undefined; };
  const imagePosition = (id) => { const item = annotationState.annotations.find((entry) => entry.id === id); return item?.position ? migrateImagePosition({ ...item.position }) : null; };
  const setImagePosition = (id, position) => { const item = annotationState.annotations.find((entry) => entry.id === id); if (item) item.position = { ...position }; scheduleAnnotations(); };
  const resizeImagePosition = (start, handle, dx, dy, lockAspect) => {
    let { x, y, width, height } = start;
    const minSize = IMAGE_MIN_SIZE / canvasZoom;
    const ratio = start.width / start.height;
    if (handle.includes("e")) width = Math.max(minSize, start.width + dx);
    if (handle.includes("w")) { width = Math.max(minSize, start.width - dx); x = start.x + start.width - width; }
    if (handle.includes("s")) height = Math.max(minSize, start.height + dy);
    if (handle.includes("n")) { height = Math.max(minSize, start.height - dy); y = start.y + start.height - height; }
    if (lockAspect) {
      if (handle === "e" || handle === "w") height = Math.max(minSize, Math.round(width / ratio));
      else if (handle === "n" || handle === "s") width = Math.max(minSize, Math.round(height * ratio));
      else if (handle.includes("e")) height = Math.max(minSize, Math.round(width / ratio));
      else height = Math.max(minSize, Math.round(width / ratio));
      if (handle.includes("w")) x = start.x + start.width - width;
      if (handle.includes("n")) y = start.y + start.height - height;
    }
    return { x, y, width, height, coordSpace: "page" };
  };
  const onImagePointerMove = (event) => {
    if (!imageDrag || imageDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = (event.clientX - imageDrag.startX) / canvasZoom;
    const dy = (event.clientY - imageDrag.startY) / canvasZoom;
    if (imageDrag.mode === "move") {
      setImagePosition(imageDrag.id, { ...imageDrag.startPosition, x: imageDrag.startPosition.x + dx, y: imageDrag.startPosition.y + dy, width: imageDrag.startPosition.width, height: imageDrag.startPosition.height, coordSpace: "page" });
    } else {
      setImagePosition(imageDrag.id, resizeImagePosition(imageDrag.startPosition, imageDrag.handle, dx, dy, !event.shiftKey));
    }
  };
  const onImagePointerUp = (event) => {
    if (!imageDrag || imageDrag.pointerId !== event.pointerId) return;
    endImageDrag();
    const position = imagePosition(imageDrag.id);
    if (position) { pushCommentHistory(); void updateImageAnnotation(imageDrag.id, position); }
  };
  const onImagePointerDown = (event, id) => {
    if (!commentMode || event.button !== 0 || event.target?.classList?.contains("annotation-image-handle")) return;
    event.preventDefault();
    event.stopPropagation();
    selectedImageId = id;
    const position = imagePosition(id);
    if (!position) return;
    const dims = imagePlacement(position, position.width, position.height);
    imageDrag = { pointerId: event.pointerId, id, mode: "move", startX: event.clientX, startY: event.clientY, startPosition: dims };
    scheduleAnnotations();
    document.addEventListener("pointermove", onImagePointerMove, true);
    document.addEventListener("pointerup", onImagePointerUp, true);
    document.addEventListener("pointercancel", onImagePointerUp, true);
  };
  const onImageResizeDown = (event, id, handle) => {
    if (!commentMode || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    selectedImageId = id;
    const position = imagePosition(id);
    if (!position) return;
    const dims = imagePlacement(position, position.width, position.height);
    imageDrag = { pointerId: event.pointerId, id, mode: "resize", handle, startX: event.clientX, startY: event.clientY, startPosition: dims };
    document.addEventListener("pointermove", onImagePointerMove, true);
    document.addEventListener("pointerup", onImagePointerUp, true);
    document.addEventListener("pointercancel", onImagePointerUp, true);
  };
  const endCommentPointerTracking = () => { document.removeEventListener("pointermove", onCommentPointerMove, true); document.removeEventListener("pointerup", onCommentPointerUp, true); document.removeEventListener("pointercancel", onCommentPointerUp, true); };
  const onCommentPointerMove = (event) => {
    if (!commentPointer || commentPointer.pointerId !== event.pointerId) return;
    const dx = event.clientX - commentPointer.x;
    const dy = event.clientY - commentPointer.y;
    if (!commentPointer.moved && Math.hypot(dx, dy) < COMMENT_DRAG_THRESHOLD) return;
    commentPointer.moved = true;
    annointPointer = commentPointer;
    const point = annointPagePoint(event);
    if (commentPointer.tool === "pen") commentPointer.points.push(point);
    else { const cdx = point[0] - commentPointer.start[0]; const cdy = point[1] - commentPointer.start[1]; commentPointer.r = Math.max(8 / canvasZoom, Math.hypot(cdx, cdy)); commentPointer.cx = commentPointer.start[0]; commentPointer.cy = commentPointer.start[1]; }
    renderAnnoints();
  };
  const onCommentPointerUp = (event) => {
    if (!commentPointer || commentPointer.pointerId !== event.pointerId) return;
    endCommentPointerTracking();
    if (commentPointer.moved) {
      if (commentPointer.tool === "circle") annointDraft.strokes.push(markAnnointPage({ tool: "circle", color: commentPointer.color, width: commentPointer.width, cx: commentPointer.cx, cy: commentPointer.cy, r: commentPointer.r }));
      else annointDraft.strokes.push(markAnnointPage({ tool: "pen", color: commentPointer.color, width: commentPointer.width, points: commentPointer.points }));
      pushCommentHistory();
      void saveAnnoints();
    } else pinCommentAt(event);
    commentPointer = undefined;
    annointPointer = undefined;
    renderAnnoints();
  };
  const onCommentPointerDown = (event) => {
    if (!commentMode || event.button !== 0) return;
    const path = event.composedPath?.() || [];
    if (path.includes(host)) return;
    if (path.some((node) => node instanceof HTMLElement && node.classList?.contains("annotation-image-wrap"))) return;
    selectedImageId = undefined;
    scheduleAnnotations();
    if (event.altKey) {
      event.preventDefault();
      const text = prompt("Annotation text");
      if (text) { const [x, y] = annointPagePoint(event); annointDraft.texts.push(markAnnointPage({ x, y, text, color: "#f5f5f7", fontSize: 16 })); renderAnnoints(); pushCommentHistory(); void saveAnnoints(); }
      return;
    }
    event.preventDefault();
    const start = annointPagePoint(event);
    commentPointer = { pointerId: event.pointerId, x: start[0], y: start[1], moved: false, tool: event.shiftKey ? "circle" : "pen", color: "#f59e0b", width: 2, points: [start], start };
    document.addEventListener("pointermove", onCommentPointerMove, true);
    document.addEventListener("pointerup", onCommentPointerUp, true);
    document.addEventListener("pointercancel", onCommentPointerUp, true);
  };
  testConnection?.addEventListener("click", test);
  annotationsToggle?.addEventListener("click", toggleAnnotationsVisible);
  collapseButton?.addEventListener("click", toggleToolbarCollapsed);
  heatmapToggle?.addEventListener("click", toggleHeatmap);
  commentModeToggle?.addEventListener("click", toggleCommentMode);
  commentUndo?.addEventListener("click", undoComment);
  commentRedo?.addEventListener("click", redoComment);
  editUndo?.addEventListener("click", undoEdit);
  editRedo?.addEventListener("click", redoEdit);
  editDelete?.addEventListener("click", deleteSelected);
  comments?.addEventListener("click", openComments);
  reference?.addEventListener("click", openReference);
  aiClose?.addEventListener("click", closeAiPanel);
  referenceForm?.addEventListener("submit", buildReferencePlan);
  referenceFreeze?.addEventListener("click", freezeReferencePlan);
  referenceKind?.addEventListener("change", onReferenceKindChange);
  referenceKindTrigger?.addEventListener("click", (event) => { event.stopPropagation(); toggleReferencePickerMenu(referenceKindMenu, referenceKindTrigger); });
  referenceKindMenu?.addEventListener("click", (event) => onReferencePickerMenuClick(event, referenceKind, referenceKindMenu, referenceKindLabel));
  referenceBrandTrigger?.addEventListener("click", (event) => { event.stopPropagation(); toggleReferencePickerMenu(referenceBrandMenu, referenceBrandTrigger); });
  referenceBrandMenu?.addEventListener("click", (event) => onReferencePickerMenuClick(event, referenceBrand, referenceBrandMenu, referenceBrandLabel));
  referenceFile?.addEventListener("change", onReferenceFileChange);
  referenceChoose?.addEventListener("click", onReferenceChoose);
  referenceClearFile?.addEventListener("click", onReferenceClear);
  referenceDropzone?.addEventListener("click", onReferenceDropzoneClick);
  referenceDialog?.addEventListener("paste", onReferencePaste);
  referenceDropzone?.addEventListener("paste", onReferencePaste);
  referenceDropzone?.addEventListener("drop", onReferenceDrop);
  referenceDropzone?.addEventListener("dragover", onReferenceDragOver);
  referenceDropzone?.addEventListener("dragleave", onReferenceDragLeave);
  syncReferenceSourceUI();
  syncReferencePlacementUI();
  apply?.addEventListener("click", applyProposal);
  impact?.addEventListener("click", acceptImpact);
  overlap?.addEventListener("click", acceptOverlap);
  cancel?.addEventListener("click", cancelSelection);
  const onToolbarGenerateClick = () => { openAiPromptPanel(); };
  const onAiGenerateClick = () => { void submitAiGenerate(); };
  generate?.addEventListener("click", onToolbarGenerateClick);
  generateButton?.addEventListener("click", onToolbarGenerateClick);
  aiGenerate?.addEventListener("click", onAiGenerateClick);
  aiAttachmentClear?.addEventListener("click", clearAiAttachedImage);
  document.addEventListener("paste", onAiPanelPaste, true);
  aiPrompt?.addEventListener("keydown", onAiPromptKeyDown);
  aiReviewButton?.addEventListener("click", openPendingAiReview);
  aiAccept?.addEventListener("click", acceptAi);
  aiRefine?.addEventListener("click", refineAi);
  aiCompare?.addEventListener("click", compareAi);
  aiReject?.addEventListener("click", rejectAi);
  aiDismiss?.addEventListener("click", dismissAi);
  aiStop?.addEventListener("click", stopAi);
  aiChatTrigger?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!aiChatMenu || !aiChatTrigger) return;
    const next = aiChatMenu.hidden;
    closeMoreMenu();
    closeReferencePickers();
    closeDesignPickers();
    aiChatMenu.hidden = !next;
    aiChatTrigger.setAttribute("aria-expanded", next ? "true" : "false");
  });
  aiChatMenu?.addEventListener("click", (event) => {
    const option = event.target?.closest?.(".ai-chat-option");
    if (!option) return;
    setCodexChatSelection(option.dataset.reframeCodexChatValue ?? "", option.textContent?.trim() || "New local Codex task");
    closeCodexChatMenu();
  });
  handleMove?.addEventListener("pointerdown", onHandleMoveDown);
  handle?.addEventListener("pointerdown", onHandleDown);
  handleHeight?.addEventListener("pointerdown", onHandleHeightDown);
  layoutWidth?.addEventListener("change", onLayoutWidthInput);
  layoutHeight?.addEventListener("change", onLayoutHeightInput);
  layoutX?.addEventListener("change", onLayoutPositionInput);
  layoutY?.addEventListener("change", onLayoutPositionInput);
  layoutRadius?.addEventListener("change", onLayoutRadiusInput);
  designFill?.addEventListener("input", onDesignFillInput);
  designFillHex?.addEventListener("change", onDesignFillHexInput);
  designOpacity?.addEventListener("change", onDesignOpacityInput);
  designBorderWidth?.addEventListener("change", onDesignBorderWidthInput);
  designBorderColor?.addEventListener("input", onDesignBorderColorInput);
  designFontSize?.addEventListener("change", onDesignFontSizeInput);
  designLineHeight?.addEventListener("change", onDesignLineHeightInput);
  designLetterSpacing?.addEventListener("change", onDesignLetterSpacingInput);
  designShadowX?.addEventListener("change", onDesignShadowInput);
  designShadowY?.addEventListener("change", onDesignShadowInput);
  designShadowBlur?.addEventListener("change", onDesignShadowInput);
  designShadowColor?.addEventListener("input", onDesignShadowInput);
  designTranslateX?.addEventListener("change", onDesignTranslateInput);
  designTranslateY?.addEventListener("change", onDesignTranslateInput);
  designDisplay?.addEventListener("change", () => { onDesignSelectInput("display", designDisplay)(); if (active && designFlexControls) { const displayVal = String(active.previewStyles.display || getComputedStyle(active.element).display || "").toLowerCase(); designFlexControls.hidden = displayVal !== "flex" && displayVal !== "inline-flex"; } });
  designFlexDirection?.addEventListener("change", onDesignSelectInput("flex-direction", designFlexDirection));
  designJustify?.addEventListener("change", onDesignSelectInput("justify-content", designJustify));
  designAlign?.addEventListener("change", onDesignSelectInput("align-items", designAlign));
  designPosition?.addEventListener("change", onDesignSelectInput("position", designPosition));
  designOverflow?.addEventListener("change", onDesignSelectInput("overflow", designOverflow));
  designTextTransform?.addEventListener("change", onDesignSelectInput("text-transform", designTextTransform));
  designTextDecoration?.addEventListener("change", onDesignSelectInput("text-decoration", designTextDecoration));
  designZ?.addEventListener("change", onDesignZInput);
  designBgImage?.addEventListener("change", onDesignBgImageInput);
  designOutline?.addEventListener("change", onDesignOutlineInput);
  designBlur?.addEventListener("change", onDesignBlurInput);
  for (const field of designUnits) {
    field.input.addEventListener("change", onDesignUnitInput(field));
    field.unit.addEventListener("change", onDesignUnitInput(field));
  }
  for (const button of toolButtons) button.addEventListener("click", () => setActiveTool(button.dataset.reframeTool));
  toolbarLayersButton?.addEventListener("click", toggleLayersPanel);
  toolbarDesignButton?.addEventListener("click", onToolbarDesignClick);
  layersToggle?.addEventListener("click", toggleLayersPanel);
  layersCollapse?.addEventListener("click", toggleLayersPanel);
  designToggle?.addEventListener("click", toggleDesignPanel);
  designCollapse?.addEventListener("click", toggleDesignPanel);
  designTab?.addEventListener("click", toggleDesignPanel);
  layersExpandAll?.addEventListener("click", expandAllLayers);
  layersCollapseAll?.addEventListener("click", collapseAllLayers);
  layersResize?.addEventListener("pointerdown", onLayersResizeDown);
  pasteFigmaButton?.addEventListener("click", () => { void triggerPasteFromFigma(); });
  layersSearch?.addEventListener("input", () => { layersSearchQuery = layersSearch.value; scheduleLayersTree(); });
  zoomOut?.addEventListener("click", () => setCanvasZoom(canvasZoom - 0.1, lastPointer.x, lastPointer.y));
  zoomIn?.addEventListener("click", () => setCanvasZoom(canvasZoom + 0.1, lastPointer.x, lastPointer.y));
  zoomFit?.addEventListener("click", fitCanvasZoom);
  document.addEventListener("pointerdown", onPanPointerDown, true);
  textInput?.addEventListener("input", onTextInput);
  formatFont?.addEventListener("change", () => setPreviewStyle("font-family", formatFont.value === "inherit" ? "" : formatFont.value));
  formatColor?.addEventListener("input", () => setPreviewStyle("color", formatColor.value));
  formatSmaller?.addEventListener("click", () => bumpFontSize(-1));
  formatLarger?.addEventListener("click", () => bumpFontSize(1));
  formatBold?.addEventListener("click", () => setPreviewStyle("font-weight", formatBold?.getAttribute("aria-pressed") === "true" ? "400" : "700"));
  formatItalic?.addEventListener("click", () => setPreviewStyle("font-style", formatItalic?.getAttribute("aria-pressed") === "true" ? "normal" : "italic"));
  formatUnderline?.addEventListener("click", () => setPreviewStyle("text-decoration", formatUnderline?.getAttribute("aria-pressed") === "true" ? "none" : "underline"));
  formatAlignLeft?.addEventListener("click", () => setPreviewStyle("text-align", "left"));
  formatAlignCenter?.addEventListener("click", () => setPreviewStyle("text-align", "center"));
  formatAlignRight?.addEventListener("click", () => setPreviewStyle("text-align", "right"));
  document.addEventListener("pointerdown", onCommentPointerDown, true);
  historyButton?.addEventListener("click", onHistoryButtonClick);
  contextHistoryButton?.addEventListener("click", onElementHistoryButtonClick);
  contextMoreButton?.addEventListener("click", (event) => { event.stopPropagation(); toggleContextMoreMenu(); });
  moreButton?.addEventListener("click", (event) => { event.stopPropagation(); toggleMoreMenu(); });
  moreMenuEl?.addEventListener("click", (event) => {
    const action = event.target?.closest?.("[data-reframe-more-action]")?.dataset?.reframeMoreAction;
    if (action === "comments") { closeMoreMenu(); openComments(); }
    if (action === "annotations") { closeMoreMenu(); toggleAnnotationsVisible(); }
    if (action === "heatmap") { closeMoreMenu(); toggleHeatmap(); }
    if (action === "paste-figma") { closeMoreMenu(); void triggerPasteFromFigma(); }
    if (action === "test") { closeMoreMenu(); test(); }
  });
  contextMoreMenuEl?.addEventListener("click", (event) => {
    const action = event.target?.closest?.("[data-reframe-context-more-action]")?.dataset?.reframeContextMoreAction;
    if (action === "apply") { closeContextMoreMenu(); applyProposal(); }
    if (action === "deselect") { closeContextMoreMenu(); cancelSelection(); }
    if (action === "reference") { closeContextMoreMenu(); openReference(); }
  });
  chromeHitZone?.addEventListener("pointerenter", onChromePointerEnter);
  chromeHitZone?.addEventListener("pointermove", onChromePointerEnter);
  chromeHitZone?.addEventListener("pointerdown", onChromePointerDown);
  chromeHitZone?.addEventListener("click", onChromeHitZoneClick);
  statusChip?.addEventListener("pointerenter", onChromePointerEnter);
  statusChip?.addEventListener("pointerdown", onChromePointerDown);
  chrome?.addEventListener("focusin", onChromeFocusIn);
  chrome?.addEventListener("pointerleave", onChromePointerLeave, true);
  document.addEventListener("pointermove", onGlobalPointerMove, true);
  window.addEventListener("paste", onAnnotatePaste, true);
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("dblclick", onDocumentDblClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  addEventListener("error", onPageError);
  addEventListener("unhandledrejection", onUnhandledRejection);
  addEventListener("scroll", scheduleGeometry, true);
  addEventListener("resize", scheduleGeometry);
  addEventListener("resize", scheduleHistoryRequest);
  addEventListener("scroll", scheduleAnnotations, true);
  addEventListener("scroll", syncAnnointScroll, true);
  addEventListener("resize", scheduleAnnotations);
  addEventListener("resize", () => { if (heatmapVisible) renderHeatmap(); renderAnnoints(); });
  addEventListener("popstate", onRouteChange);
  addEventListener("hashchange", onRouteChange);
  exit?.addEventListener("click", teardown);
  restore?.addEventListener("click", restorePrevious);
  time?.addEventListener("pointerdown", onTimePointerDown);
  time?.addEventListener("pointerup", onTimePointerUp);
  time?.addEventListener("pointercancel", onTimePointerUp);
  time?.addEventListener("lostpointercapture", onTimePointerUp);
  time?.addEventListener("click", onTimeClick);
  sourceCompareToggle?.addEventListener("click", toggleSourceCompare);
  sourceCompareHandle?.addEventListener("pointerdown", onCompareHandleDown);
  time?.addEventListener("keydown", onKeyDown);
  time?.addEventListener("keyup", onTimeKeyUp);
  historyClose?.addEventListener("click", closeHistory);
  elementHistoryClose?.addEventListener("click", closeElementHistory);
  annotationClose?.addEventListener("click", closeAnnotations);
  annotationForm?.addEventListener("submit", onAnnotationSubmit);
  addEventListener("blur", cancelTimeMachine);
  document.addEventListener("visibilitychange", cancelTimeMachine);
  addEventListener("pagehide", teardown, { once: true });
  addEventListener("pageshow", () => { if (!disposed && state === "connected") { requestHistory(); scheduleHistoryRetry(); } });
  const showcaseDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const SHOWCASE_PANEL_MS = 520;
  let showcaseEpoch = 0;
  const showcaseHistoryIso = (ms) => new Date(ms).toISOString();
  const seedShowcaseHistory = () => {
    const now = Date.now();
    const vp = { width: innerWidth, height: innerHeight };
    const path = route();
    historyState.checkpoints = [
      { id: "4c81e2a", parentId: null, createdAt: showcaseHistoryIso(now - 1800000), valid: true, promptSummary: "Resize Start building CTA", verification: "passed", route: path, kind: "edit", files: ["demo/style.css"], viewport: vp },
      { id: "8f3b1d6", parentId: "4c81e2a", createdAt: showcaseHistoryIso(now - 900000), valid: true, promptSummary: "Adjust CTA fill and corners", verification: "passed", route: path, kind: "edit", files: ["demo/style.css"], viewport: vp },
      { id: "d72a9f4", parentId: "8f3b1d6", createdAt: showcaseHistoryIso(now - 15000), valid: true, promptSummary: "Codex: add CTA spacing and shadow", verification: "passed", route: path, kind: "ai", files: ["demo/style.css"], viewport: vp },
    ];
    historyState.currentId = "d72a9f4";
    historyState.previousId = "8f3b1d6";
    historyState.canRestore = true;
    historyState.visualComplete = true;
    renderHistory();
  };
  const showcaseRectFor = () => {
    if (!showcaseTarget) return null;
    return showcaseTarget.getBoundingClientRect();
  };
  const showcaseAnnotationId = "showcase-cta-note";
  const showcasePlaceSelection = () => {
    const rect = showcaseRectFor();
    if (!rect || !selectedOutline) return;
    placeOutline(selectedOutline, rect);
    placeContextBar(rect, selectedOutline);
  };
  const showcaseClearSelection = () => {
    showcaseUiActive = false;
    showcaseTarget = undefined;
    if (selectedOutline) selectedOutline.hidden = true;
    if (contextBar) contextBar.hidden = true;
    if (panel) panel.hidden = true;
    syncEditToolbar();
  };
  const showcaseShowSelection = async (selector, tag = "demo/style.css:75") => {
    const el = document.querySelector(selector);
    if (!el) return;
    showcaseUiActive = true;
    showcaseTarget = el;
    if (commentMode) exitCommentMode();
    activeTool = "select";
    selectMode = true;
    syncToolUi();
    if (selectedLabel) selectedLabel.textContent = tag;
    if (selectedOutline) selectedOutline.hidden = false;
    if (mappingLabel) mappingLabel.textContent = "exact";
    if (panel) panel.hidden = false;
    if (contextBar) contextBar.hidden = false;
    revealLayerPath(el);
    syncEditToolbar();
    showcasePlaceSelection();
    scheduleLayersTree();
    await showcaseDelay(520);
  };
  const initShowcaseUi = () => {
    setState("connected");
    connectionId = "showcase-ui";
    chromeVisible = false;
    toolbarCollapsed = false;
    syncToolbarCollapsed();
    syncChromeVisibility();
    seedShowcaseHistory();
    renderLayersTree();
  };
  const hideShowcaseOverlays = () => {
    closeAnnotations();
    annotationState.annotations = annotationState.annotations.filter((item) => item.id !== showcaseAnnotationId);
    scheduleAnnotations();
    mappingLabel?.classList.remove("showcase-pulse");
    if (commentMode) exitCommentMode();
  };
  const showcaseAnimateCloseEl = async (el) => {
    if (!el || el.hidden) return;
    const epoch = showcaseEpoch;
    el.classList.add("showcase-panel-closing");
    await showcaseDelay(SHOWCASE_PANEL_MS);
    if (epoch !== showcaseEpoch) { el.classList.remove("showcase-panel-closing"); return; }
    el.hidden = true;
    el.classList.remove("showcase-panel-closing");
  };
  const showcaseAnimateOpenEl = async (el) => {
    if (!el || !el.hidden) return;
    el.classList.add("showcase-panel-closing");
    el.hidden = false;
    requestAnimationFrame(() => { el.classList.remove("showcase-panel-closing"); });
    await showcaseDelay(SHOWCASE_PANEL_MS);
  };
  const showcaseCloseLayersPanel = async () => {
    if (!layersPanelVisible) return;
    layersPanelVisible = false;
    syncToolUi();
    await showcaseAnimateCloseEl(layersPanel);
  };
  const showcaseOpenLayersPanel = async () => {
    if (layersPanelVisible) return;
    layersPanelVisible = true;
    syncToolUi();
    scheduleLayersTree();
    await showcaseAnimateOpenEl(layersPanel);
  };
  const showcaseCloseDesignPanel = async () => {
    if (!designPanelVisible) return;
    designPanelVisible = false;
    syncEditToolbar();
    syncToolUi();
    scheduleGeometry();
    await showcaseAnimateCloseEl(designPanel);
  };
  const showcaseOpenDesignPanel = async () => {
    if (designPanelVisible) return;
    closeExclusivePanels("design");
    designPanelVisible = true;
    syncEditToolbar();
    syncToolUi();
    scheduleGeometry();
    await showcaseAnimateOpenEl(designPanel);
  };
  const showcaseCloseAiPanel = async () => {
    if (!aiPanel || aiPanel.hidden) return;
    closeCodexChatMenu();
    closeReferencePickers();
    await showcaseAnimateCloseEl(aiPanel);
    reference?.setAttribute("aria-expanded", "false");
    scheduleGeometry();
  };
  const showcaseOpenAiPanel = async (epoch = showcaseEpoch) => {
    if (epoch !== showcaseEpoch || !aiPanel || !aiPanel.hidden) return;
    closeExclusivePanels("ai");
    if (epoch !== showcaseEpoch) return;
    await showcaseAnimateOpenEl(aiPanel);
    reference?.setAttribute("aria-expanded", "false");
    scheduleGeometry();
  };
  const showcaseCloseHistoryPanel = async () => {
    if (!historyDialog || historyDialog.hidden) return;
    await showcaseAnimateCloseEl(historyDialog);
    historyButton?.setAttribute("aria-expanded", "false");
    historyFocus = undefined;
  };
  const showcaseOpenHistoryPanel = async () => {
    if (!historyDialog) return;
    closeExclusivePanels("history");
    renderHistoryList();
    await showcaseAnimateOpenEl(historyDialog);
    historyButton?.setAttribute("aria-expanded", "true");
  };
  const showcaseSceneCloseMap = {
    2: ["design", "ai", "history", "comments"],
    3: ["design", "ai", "history", "comments", "layers"],
    4: ["ai", "history", "comments", "layers"],
    5: ["design", "history", "comments", "layers"],
    6: ["design", "ai", "history", "comments", "layers"],
    7: ["design", "ai", "history", "layers", "comments"],
    8: ["design", "ai", "history", "layers", "comments"],
    9: ["design", "ai", "comments", "layers"],
  };
  const showcaseClosePanelKey = async (key) => {
    if (key === "design") await showcaseCloseDesignPanel();
    else if (key === "ai") await showcaseCloseAiPanel();
    else if (key === "history") await showcaseCloseHistoryPanel();
    else if (key === "layers") await showcaseCloseLayersPanel();
    else if (key === "comments") hideShowcaseOverlays();
  };
  const showcase = showcaseMode ? {
    revealChrome: async () => { showChrome(); await showcaseDelay(560); },
    openLayers: async () => { await showcaseOpenLayersPanel(); await showcaseDelay(120); },
    select: showcaseShowSelection,
    resize: async (delta = 64) => {
      const epoch = showcaseEpoch;
      if (!showcaseTarget) return;
      showcaseTarget.style.removeProperty("width");
      const base = showcaseTarget.getBoundingClientRect();
      const steps = 18;
      for (let i = 1; i <= steps; i++) {
        if (epoch !== showcaseEpoch) return;
        const width = base.width + (delta * i) / steps;
        showcaseTarget.style.width = width + "px";
        if (layoutWidth) layoutWidth.value = String(Math.round(width));
        showcasePlaceSelection();
        await showcaseDelay(40);
      }
    },
    openDesign: async () => {
      if (!showcaseUiActive) await showcaseShowSelection("#rf-cta");
      await showcaseOpenDesignPanel();
      await showcaseDelay(120);
    },
    fillColor: async (hex = "#6d28d9") => {
      if (!showcaseUiActive) await showcaseShowSelection("#rf-cta");
      if (designFill) designFill.value = hex;
      if (designFillHex) designFillHex.value = hex;
      await showcaseDelay(380);
    },
    setRoundedCorners: async () => {
      const el = showcaseTarget || document.querySelector("#rf-cta");
      if (el) {
        el.style.borderRadius = "20px";
        el.style.boxShadow = "0 10px 28px rgba(124, 58, 237, 0.35)";
      }
      if (layoutRadius) layoutRadius.value = "20";
      await showcaseDelay(420);
    },
    typeGenerate: async (text = "Give this CTA more spacing and a soft shadow") => {
      const epoch = showcaseEpoch;
      if (!showcaseUiActive) await showcaseShowSelection("#rf-cta");
      await showcaseOpenAiPanel(epoch);
      if (epoch !== showcaseEpoch) return;
      if (aiPrompt) {
        aiPrompt.value = "";
        for (const ch of text) {
          if (epoch !== showcaseEpoch) return;
          aiPrompt.value += ch;
          await showcaseDelay(28);
        }
      }
      if (aiStatus) aiStatus.textContent = "Context ready · Button · demo/style.css:75 · Design DNA attached";
      await showcaseDelay(760);
    },
    showReview: async () => {
      const epoch = showcaseEpoch;
      await showcaseOpenAiPanel(epoch);
      if (epoch !== showcaseEpoch) return;
      clearAiAttachedImage();
      if (aiPrompt) aiPrompt.value = "Give this CTA more spacing and a soft shadow";
      if (aiStatus) aiStatus.textContent = "Ready to review · demo/style.css · CTA spacing and shadow";
      for (const button of [aiAccept, aiRefine, aiCompare, aiReject]) {
        if (button) { button.hidden = false; button.disabled = false; }
      }
      if (aiGenerate) aiGenerate.hidden = true;
      const scroll = aiPanel?.querySelector(".ai-panel-scroll");
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
      await showcaseDelay(520);
    },
    approveReview: async () => {
      await showcaseCloseAiPanel();
      clearAiReview();
      explain("Codex proposal accepted · writing source next");
    },
    hotReload: async () => {
      await showcaseCloseAiPanel();
      clearAiReview();
      const el = document.querySelector("#rf-cta");
      if (showcaseTarget !== el) await showcaseShowSelection("#rf-cta", "demo/style.css:75");
      if (el) {
        el.style.borderRadius = "20px";
        el.style.boxShadow = "0 8px 24px rgba(124, 58, 237, 0.35)";
      }
      if (layoutRadius) layoutRadius.value = "20";
      if (showcaseUiActive) showcasePlaceSelection();
      explain("Saved to demo/style.css · hot reload verified");
      await showcaseDelay(520);
    },
    openComments: async () => {
      const epoch = showcaseEpoch;
      if (!chromeVisible) showChrome();
      const selectionReady = showcaseShowSelection("#rf-cta", "demo/style.css:75");
      if (epoch !== showcaseEpoch) return;
      await selectionReady;
      if (epoch !== showcaseEpoch) return;
      const el = document.querySelector("#rf-cta");
      if (!el) return;
      const note = {
        id: showcaseAnnotationId,
        author: "Local reviewer",
        component: "Primary CTA",
        createdAt: new Date().toISOString(),
        status: "open",
        route: route(),
        resolution: "exact",
        checkpointRelationship: "current",
        fingerprint: fingerprint(el),
        source: { path: "demo/style.css", line: 75 },
        comment: "Check the CTA contrast before release",
        highlight: { x: 0, y: 0, width: 1, height: 1 },
      };
      annotationState = { annotations: [note], issues: [], parsedFiles: 1, renderedForRoute: 1 };
      annotationsVisible = true;
      syncAnnotationsToggle();
      showcaseClearSelection();
      scheduleAnnotations();
      openAnnotations(false);
      explain("Annotation is anchored to demo/style.css:75 and ready to share through Git");
      await showcaseDelay(580);
    },
    openHistory: async () => {
      const epoch = showcaseEpoch;
      if (!showcaseUiActive) await showcaseShowSelection("#rf-cta");
      if (epoch !== showcaseEpoch) return;
      seedShowcaseHistory();
      await showcaseOpenHistoryPanel();
      await showcaseDelay(120);
    },
    closeExclusiveForScene: async (scene) => {
      showcaseEpoch += 1;
      const epoch = showcaseEpoch;
      explain("");
      const keys = showcaseSceneCloseMap[scene] || [];
      await Promise.all(keys.map(showcaseClosePanelKey));
      if (epoch !== showcaseEpoch) return;
      await showcaseDelay(140);
    },
    closeAllPanels: async () => {
      await showcaseCloseDesignPanel();
      await showcaseCloseAiPanel();
      await showcaseCloseHistoryPanel();
      await showcaseCloseLayersPanel();
      hideShowcaseOverlays();
      await showcaseDelay(140);
    },
    seedHistory: async () => { seedShowcaseHistory(); await showcaseDelay(80); },
    reset: async () => {
      showcaseEpoch += 1;
      clearAiReview();
      hideShowcaseOverlays();
      showcaseClearSelection();
      closeHistory();
      closeAnnotations();
      closeAiPanel();
      hideDesignPanel();
      if (layersPanelVisible) toggleLayersPanel();
      chromeVisible = false;
      syncChromeVisibility();
      const cta = document.querySelector("#rf-cta");
      if (cta instanceof HTMLElement) {
        cta.style.borderRadius = "";
        cta.style.boxShadow = "";
        cta.style.removeProperty("width");
        cta.style.removeProperty("background");
      }
      await showcaseDelay(220);
    },
  } : undefined;
  window[key] = { session, tabId, host, teardown, previewWidth, clearSelection, restorePrevious, restoreCheckpoint, requestHistory, showPrevious: () => startTimeHold(), hidePrevious: () => endTimeHold(), openComments, openCommentsList, openReference, openHistory, openElementHistory, requestAnnotations, performanceMetrics, showcase, get referenceState() { return { draft: referenceDraft, frozenPlanId: frozenReferencePlanId, open: Boolean(referenceDialog?.open) || !aiPanel?.hidden }; }, get annotationState() { return { ...annotationState }; }, get annotationsVisible() { return annotationsVisible; }, get historyState() { return { ...historyState }; }, get timeMachineState() { return { holding: Boolean(timeHold), overlayVisible: !timeOverlay?.hidden, historyOpen: !historyDialog?.hidden, elementHistoryOpen: !elementHistoryDialog?.hidden, cacheSize: screenshotCache.size }; }, get state() { return state; }, get selectMode() { return selectMode; }, get commentMode() { return commentMode; }, get activeTool() { return activeTool; }, get canvasZoom() { return canvasZoom; }, get generation() { return generation; }, get selection() { return active ? { selectionId: active.selectionId, proposalId: active.proposalId, generation: active.generation, width: active.previewWidth, mappingConfidence: active.mappingConfidence, label: labelFor(active.element) } : null; }, get connectionId() { return connectionId; }, get socket() { return socket; } };
  document.documentElement.append(host);
  applyPageOffset();
  syncAnnotationsToggle();
  syncAnnointLayer();
  syncToolbarCollapsed();
  syncMinimalUi();
  syncChromeVisibility();
  syncGenerateButton();
  activeTool = "select";
  selectMode = true;
  syncToolUi();
  if (!showcaseMode) explain("Click an element to select · V select · H pan");
  renderLayersTree();
  if (showcaseMode) initShowcaseUi();
  else { void loadAnnoints(); connect(); }
})();