import type { ElementFingerprint } from "./protocol.js";

/** ponytail: djb2 — sync-safe in browser + Node; upgrade path is SHA-256 in shared if collisions matter */
export function fingerprintHash(fingerprint: Pick<ElementFingerprint, "tag" | "id" | "classes" | "route">): string {
  const payload = JSON.stringify({ tag: fingerprint.tag, id: fingerprint.id, classes: [...fingerprint.classes].sort(), route: fingerprint.route });
  let hash = 5381;
  for (let index = 0; index < payload.length; index += 1) hash = ((hash << 5) + hash) ^ payload.charCodeAt(index);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
