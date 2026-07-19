import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface CodexSessionSummary {
  readonly id: string;
  readonly label: string;
  readonly updatedAt: string;
}

const THREAD_ID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function normalizeCodexThreadId(value: string): string {
  const trimmed = value.trim();
  const matches = [...trimmed.matchAll(new RegExp(THREAD_ID.source, "gi"))];
  return matches.length ? matches[matches.length - 1]![1]! : trimmed;
}

function codexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function projectNameFromCwd(cwd: string): string {
  const cleaned = cwd.replace(/^\\\\\?\\/, "").replace(/[\\/]+$/, "").trim();
  if (!cleaned || /[\\/]Temp[\\/]/i.test(cleaned) && /reframe-codex/i.test(cleaned)) return "";
  return path.basename(cleaned);
}

function shortTitle(...parts: string[]): string {
  for (const part of parts) {
    const title = cleanThreadTitle(part);
    if (title && title.length <= 80) return title;
  }
  const fallback = cleanThreadTitle(parts.find((part) => part.trim()) ?? "");
  return fallback.length > 80 ? fallback.slice(0, 77) + "…" : fallback;
}

function cleanThreadTitle(value: string): string {
  return value.split(/\r?\n/)[0]!
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function formatLabel(title: string, id: string, updatedAt: string, project = ""): string {
  const name = cleanThreadTitle(title) || (id.length > 12 ? id.slice(0, 8) + "…" : id);
  const parts = [project, name].filter(Boolean);
  const head = parts.join(" · ");
  if (!updatedAt) return head.slice(0, 120);
  const date = new Date(updatedAt);
  const stamp = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return stamp ? `${head} · ${stamp}`.slice(0, 120) : head.slice(0, 120);
}

function labelQuality(label: string): number {
  if (/^[0-9a-f]{8}…/i.test(label)) return 0;
  const parts = label.split(" · ");
  const title = parts.length > 1 ? parts.slice(0, -1).join(" · ") : label;
  let score = parts.length > 1 ? 2 : 1;
  if (title.length > 80) score -= 3;
  else if (title.length <= 50) score += 1;
  return score;
}

function combineLabels(preferred: string, enrichment: string): string {
  const preferredParts = preferred.split(" · ");
  const enrichmentParts = enrichment.split(" · ");
  if (preferredParts.length >= 2 && enrichmentParts.length >= 3) {
    const project = enrichmentParts[0]!;
    const title = preferredParts[0]!;
    const date = preferredParts[preferredParts.length - 1]!;
    if (project && title && project !== title && !preferred.includes(project) && !/reframe-codex/i.test(project)) {
      return [project, title, date].join(" · ").slice(0, 120);
    }
  }
  if (labelQuality(preferred) >= labelQuality(enrichment)) return preferred;
  return enrichment;
}

function mergeSession(merged: Map<string, CodexSessionSummary>, session: CodexSessionSummary): void {
  const existing = merged.get(session.id);
  if (!existing) {
    merged.set(session.id, session);
    return;
  }
  const newer = session.updatedAt.localeCompare(existing.updatedAt) > 0;
  const preferred = labelQuality(session.label) >= labelQuality(existing.label) ? session.label : existing.label;
  const other = preferred === session.label ? existing.label : session.label;
  merged.set(session.id, {
    id: session.id,
    label: combineLabels(preferred, other),
    updatedAt: newer ? session.updatedAt : existing.updatedAt,
  });
}

function sqliteTimestamp(row: Record<string, unknown>): string {
  const ms = Number(row.recency_at_ms ?? row.updated_at_ms);
  if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  const seconds = Number(row.recency_at ?? row.updated_at);
  if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString();
  return new Date(0).toISOString();
}

async function readGlobalThreadDescriptions(home: string): Promise<Map<string, string>> {
  const descriptions = new Map<string, string>();
  try {
    const raw = await readFile(path.join(home, ".codex-global-state.json"), "utf8");
    const state = JSON.parse(raw) as Record<string, unknown>;
    const atom = state["electron-persisted-atom-state"];
    if (!atom || typeof atom !== "object") return descriptions;
    const record = (atom as Record<string, unknown>)["thread-descriptions-v1"];
    if (!record || typeof record !== "object") return descriptions;
    for (const [id, text] of Object.entries(record as Record<string, unknown>)) {
      if (typeof text === "string" && text.trim()) descriptions.set(normalizeCodexThreadId(id), cleanThreadTitle(text));
    }
  } catch { /* ponytail: optional desktop metadata */ }
  return descriptions;
}

async function readSessionIndex(home: string, limit: number, descriptions: Map<string, string>): Promise<CodexSessionSummary[]> {
  const indexPath = path.join(home, "session_index.jsonl");
  try {
    const raw = await readFile(indexPath, "utf8");
    const sessions: CodexSessionSummary[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const value = JSON.parse(line) as Record<string, unknown>;
        const id = normalizeCodexThreadId(String(value.id ?? ""));
        if (!id) continue;
        const name = shortTitle(String(value.thread_name ?? ""), descriptions.get(id) ?? "", String(value.title ?? value.name ?? ""));
        const updatedAt = String(value.updated_at ?? value.updatedAt ?? new Date(0).toISOString());
        sessions.push({ id, label: formatLabel(name, id, updatedAt), updatedAt });
      } catch { /* skip malformed index line */ }
    }
    return sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, limit);
  } catch {
    return [];
  }
}

async function projectFromRollout(rolloutPath: string): Promise<string> {
  try {
    const raw = (await readFile(rolloutPath, "utf8")).split(/\r?\n/)[0] ?? "";
    const value = JSON.parse(raw) as Record<string, unknown>;
    const payload = value.payload;
    if (payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).cwd === "string") {
      return projectNameFromCwd(String((payload as Record<string, unknown>).cwd));
    }
  } catch { /* ponytail: optional rollout cwd */ }
  return "";
}

async function readSqliteThreads(home: string, limit: number, descriptions: Map<string, string>): Promise<CodexSessionSummary[]> {
  let files: string[];
  try {
    files = (await readdir(home)).filter((name) => /^state_\d+\.sqlite$/i.test(name));
  } catch {
    return [];
  }
  if (!files.length) return [];
  files.sort((left, right) => Number(right.match(/(\d+)/)?.[1] ?? 0) - Number(left.match(/(\d+)/)?.[1] ?? 0));
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(path.join(home, files[0]!), { readOnly: true });
    const rows = db.prepare(`
      SELECT id, title, first_user_message, preview, cwd, rollout_path, updated_at, updated_at_ms, recency_at, recency_at_ms
      FROM threads
      WHERE COALESCE(archived, 0) = 0
      ORDER BY COALESCE(recency_at_ms, updated_at_ms, recency_at, updated_at) DESC
      LIMIT ?
    `).all(limit) as Record<string, unknown>[];
    const sessions: CodexSessionSummary[] = [];
    for (const row of rows) {
      const id = normalizeCodexThreadId(String(row.id ?? ""));
      let project = projectNameFromCwd(String(row.cwd ?? ""));
      if (!project) project = await projectFromRollout(String(row.rollout_path ?? ""));
      const name = shortTitle(descriptions.get(id) ?? "", String(row.title ?? ""), String(row.preview ?? ""), String(row.first_user_message ?? ""));
      const updatedAt = sqliteTimestamp(row);
      sessions.push({ id, label: formatLabel(name, id, updatedAt, project), updatedAt });
    }
    return sessions.filter((session) => session.id);
  } catch {
    return [];
  }
}

function titleFromRollout(raw: string): { readonly title: string; readonly project: string } {
  let project = "";
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines.slice(0, 24)) {
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      const payload = value.payload;
      if (value.type === "session_meta" && payload && typeof payload === "object") {
        const meta = payload as Record<string, unknown>;
        if (!project && typeof meta.cwd === "string") project = projectNameFromCwd(meta.cwd);
        const title = meta.title ?? meta.thread_name ?? meta.name;
        if (typeof title === "string" && title.trim()) return { title: shortTitle(title), project };
      }
      if (value.type === "response_item" && payload && typeof payload === "object") {
        const item = payload as Record<string, unknown>;
        if (item.role === "user" && Array.isArray(item.content)) {
          for (const part of item.content) {
            if (part && typeof part === "object" && (part as Record<string, unknown>).type === "input_text") {
              const text = String((part as Record<string, unknown>).text ?? "").trim();
              if (text && !text.startsWith("<")) return { title: shortTitle(text), project };
            }
          }
        }
      }
      const text = value.title ?? value.summary ?? value.name ?? value.thread_name;
      if (typeof text === "string" && text.trim()) return { title: shortTitle(text), project };
      const content = value.content ?? value.message ?? value.text;
      if (typeof content === "string" && content.trim()) return { title: shortTitle(content), project };
    } catch { /* ponytail: best-effort title from jsonl */ }
  }
  return { title: "", project };
}

function idFromRolloutFilename(name: string): string {
  const stem = name.replace(/\.jsonl?$/i, "");
  return normalizeCodexThreadId(stem);
}

async function scanSessionFiles(root: string, limit: number): Promise<CodexSessionSummary[]> {
  const sessions: CodexSessionSummary[] = [];
  async function walk(directory: string): Promise<void> {
    if (sessions.length >= limit) return;
    let entries: { name: string; isDirectory: () => boolean }[];
    try {
      entries = await readdir(directory, { withFileTypes: true }) as { name: string; isDirectory: () => boolean }[];
    } catch {
      return;
    }
    for (const entry of entries) {
      if (sessions.length >= limit) return;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const rolloutPath = path.join(fullPath, "rollout.json");
        try {
          const info = await stat(rolloutPath);
          const id = normalizeCodexThreadId(entry.name);
          const raw = (await readFile(rolloutPath, "utf8")).slice(0, 32_768);
          const rollout = titleFromRollout(raw);
          sessions.push({ id, label: formatLabel(rollout.title, id, info.mtime.toISOString(), rollout.project), updatedAt: info.mtime.toISOString() });
          continue;
        } catch { /* not a session directory */ }
        await walk(fullPath);
        continue;
      }
      if (!/\.jsonl?$/i.test(entry.name)) continue;
      const id = idFromRolloutFilename(entry.name);
      if (!id || !THREAD_ID.test(id)) continue;
      try {
        const info = await stat(fullPath);
        const raw = (await readFile(fullPath, "utf8")).slice(0, 32_768);
        const rollout = titleFromRollout(raw);
        sessions.push({ id, label: formatLabel(rollout.title, id, info.mtime.toISOString(), rollout.project), updatedAt: info.mtime.toISOString() });
      } catch { /* skip unreadable session */ }
    }
  }
  await walk(root);
  return sessions;
}

export async function listCodexSessions(limit = 40): Promise<readonly CodexSessionSummary[]> {
  const home = codexHome();
  const descriptions = await readGlobalThreadDescriptions(home);
  const merged = new Map<string, CodexSessionSummary>();
  const sources = [
    await readSessionIndex(home, limit, descriptions),
    await readSqliteThreads(home, limit, descriptions),
    await scanSessionFiles(path.join(home, "sessions"), limit),
  ];
  for (const sessions of sources) {
    for (const session of sessions) mergeSession(merged, session);
  }
  return [...merged.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, limit);
}
