import { createGenesisEngine } from "../game-engine.js";
import { TimeEngine } from "../core/time-engine.js";
import { MAX_OFFLINE_SIMULATION_STEP_MS, planOfflineCatchUp } from "../core/offline-catch-up.js";
import { createGravitySystem } from "../systems/physics/physics-engine.js";
import { deserializeUniverseSnapshot, migrateUniverseSnapshot, serializeUniverseSnapshot, validateUniverseSnapshot } from "../core/persistence.js";

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const ALARM_MS = 60_000;
const ACTIVE_LEASE_MS = 90_000;
const MAX_SAVE_BYTES = 2_000_000;
let jwksCache;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

async function readJsonLimited(request, maximumBytes) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing JSON body");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) { await reader.cancel(); throw new RangeError("Snapshot too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

async function signingKeys() {
  if (jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;
  const response = await fetch(JWKS_URL, { cf: { cacheTtl: 21_600, cacheEverything: true } });
  if (!response.ok) throw new Error("Firebase signing keys unavailable");
  const data = await response.json();
  jwksCache = { keys: data.keys, expiresAt: Date.now() + 21_600_000 };
  return data.keys;
}

export async function verifyFirebaseIdToken(token, projectId, now = Date.now()) {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || !projectId) throw new Error("Invalid token");
  const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Invalid token algorithm");
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` || !claims.sub || claims.sub.length > 128) throw new Error("Invalid token audience");
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds || !Number.isFinite(claims.iat) || claims.iat > nowSeconds + 300) throw new Error("Expired token");
  const jwk = (await signingKeys()).find(key => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Unknown Firebase signing key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error("Invalid token signature");
  return { uid: claims.sub, email: typeof claims.email === "string" ? claims.email.slice(0, 254) : null };
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  return origin && allowed.includes(origin)
    ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "Authorization, Content-Type", "access-control-max-age": "86400", vary: "Origin" }
    : null;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
    const url = new URL(request.url);
    if (url.pathname !== "/api/v1/world") return json({ error: "not_found" }, 404, cors || {});
    if (!cors) return json({ error: "origin_not_allowed" }, 403);
    if (!env.UNIVERSES || !env.FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID === "REPLACE_ME") return json({ error: "server_not_configured" }, 503, cors);
    if (request.method !== "GET" && request.method !== "PUT") return json({ error: "method_not_allowed" }, 405, { ...cors, allow: "GET, PUT, OPTIONS" });
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    let identity;
    try { identity = await verifyFirebaseIdToken(token, env.FIREBASE_PROJECT_ID); }
    catch { return json({ error: "unauthorized" }, 401, cors); }
    const universeId = url.searchParams.get("universeId") || "default";
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(universeId)) return json({ error: "invalid_universe_id" }, 400, cors);
    // Keep the original Durable Object name for the default save so existing users retain it.
    const objectId = env.UNIVERSES.idFromName(universeId === "default" ? identity.uid : `${identity.uid}:${universeId}`);
    const object = env.UNIVERSES.get(objectId);
    if (request.method === "GET") {
      const response = await object.fetch("https://universe.internal/state", { method: "GET" });
      return new Response(response.body, { status: response.status, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
    }
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_SAVE_BYTES) return json({ error: "snapshot_too_large" }, 413, cors);
    let value;
    try { value = await readJsonLimited(request, MAX_SAVE_BYTES); }
    catch (error) { return error instanceof RangeError ? json({ error: "snapshot_too_large" }, 413, cors) : json({ error: "invalid_json" }, 400, cors); }
    const wrapped = value && typeof value === "object" && Object.hasOwn(value, "snapshot");
    let snapshot;
    try { snapshot = validateUniverseSnapshot(migrateUniverseSnapshot(wrapped ? value.snapshot : value)); }
    catch { return json({ error: "invalid_snapshot" }, 400, cors); }
    const write = wrapped ? {
      snapshot,
      expectedRevision: value.expectedRevision,
      operationId: value.operationId
    } : { snapshot, legacy: true };
    const response = await object.fetch("https://universe.internal/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(write) });
    return new Response(response.body, { status: response.status, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
  }
};

export class UniverseDO {
  constructor(ctx) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS universe_state (id INTEGER PRIMARY KEY CHECK (id = 1), snapshot TEXT NOT NULL, simulation_time REAL NOT NULL, processed_wall_ms REAL NOT NULL, active_until_ms REAL NOT NULL)");
    try { this.sql.exec("ALTER TABLE universe_state ADD COLUMN revision INTEGER NOT NULL DEFAULT 0"); } catch {}
    try { this.sql.exec("ALTER TABLE universe_state ADD COLUMN operation_id TEXT"); } catch {}
    try { this.sql.exec("ALTER TABLE universe_state ADD COLUMN previous_snapshot TEXT"); } catch {}
  }

  current() { return this.sql.exec("SELECT snapshot, previous_snapshot, simulation_time, processed_wall_ms, active_until_ms, revision, operation_id FROM universe_state WHERE id = 1").toArray()[0] || null; }

  async fetch(request) {
    if (new URL(request.url).pathname !== "/state") return json({ error: "not_found" }, 404);
    if (request.method === "GET") {
      const row = this.current();
      if (!row) return json({ snapshot: null, revision: 0 });
      try { return json({ snapshot: validateUniverseSnapshot(migrateUniverseSnapshot(JSON.parse(row.snapshot))), revision: Number(row.revision) || 0 }); }
      catch {
        try { return json({ snapshot: validateUniverseSnapshot(migrateUniverseSnapshot(JSON.parse(row.previous_snapshot))), revision: Number(row.revision) || 0, recovered: true }); }
        catch { return json({ error: "invalid_snapshot" }, 500); }
      }
    }
    if (request.method !== "PUT") return json({ error: "method_not_allowed" }, 405);
    let value;
    let payload;
    try { payload = await request.json(); value = validateUniverseSnapshot(migrateUniverseSnapshot(payload?.snapshot)); }
    catch { return json({ error: "invalid_snapshot" }, 400); }
    const legacy = payload?.legacy === true;
    const expectedRevision = legacy ? undefined : payload?.expectedRevision;
    const operationId = legacy ? null : payload?.operationId;
    if (!legacy && (!Number.isInteger(expectedRevision) || expectedRevision < 0 || typeof operationId !== "string" || !operationId.trim() || operationId.length > 128)) return json({ error: "invalid_write_metadata" }, 400);
    const current = this.current();
    const currentRevision = Number(current?.revision) || 0;
    if (operationId && current?.operation_id === operationId) return json({ saved: true, revision: currentRevision, idempotent: true });
    if (!legacy && currentRevision !== expectedRevision) return json({ error: "revision_conflict", currentRevision }, 409);
    let previousSnapshot = current?.snapshot || null;
    try { if (previousSnapshot) validateUniverseSnapshot(migrateUniverseSnapshot(JSON.parse(previousSnapshot))); }
    catch {
      try {
        validateUniverseSnapshot(migrateUniverseSnapshot(JSON.parse(current?.previous_snapshot)));
        previousSnapshot = current.previous_snapshot;
      } catch { previousSnapshot = null; }
    }
    const now = Date.now();
    const snapshot = JSON.stringify(value);
    const revision = currentRevision + 1;
    this.sql.exec("INSERT INTO universe_state (id, snapshot, previous_snapshot, simulation_time, processed_wall_ms, active_until_ms, revision, operation_id) VALUES (1, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET previous_snapshot = excluded.previous_snapshot, snapshot = excluded.snapshot, simulation_time = excluded.simulation_time, processed_wall_ms = excluded.processed_wall_ms, active_until_ms = excluded.active_until_ms, revision = excluded.revision, operation_id = excluded.operation_id", snapshot, previousSnapshot, value.simulationTime, now, now + ACTIVE_LEASE_MS, revision, operationId);
    await this.ctx.storage.setAlarm(now + ALARM_MS);
    return json({ saved: true, revision, idempotent: false });
  }

  async alarm() {
    const row = this.current();
    if (!row) return;
    const now = Date.now();
    if (!Number.isFinite(row.active_until_ms) || !Number.isFinite(now)) throw new Error("Invalid persisted activity clock");
    if (now < row.active_until_ms) {
      await this.ctx.storage.setAlarm(Math.max(row.active_until_ms, now + ALARM_MS));
      return;
    }

    const snapshot = deserializeUniverseSnapshot(JSON.parse(row.snapshot));
    const plan = planOfflineCatchUp({
      now,
      processedWallMs: Number(row.processed_wall_ms),
      simulationTime: Number(row.simulation_time),
      snapshotSimulationTime: snapshot.simulationTime,
      timeScale: snapshot.timeScale,
      paused: snapshot.paused,
      maxSimulationStepMs: MAX_OFFLINE_SIMULATION_STEP_MS
    });
    if (plan.processedRealMs === 0) {
      await this.ctx.storage.setAlarm(now + ALARM_MS);
      return;
    }

    let nextSnapshot = row.snapshot;
    if (plan.simulationDeltaMs > 0) {
      const engine = createGenesisEngine({ empty: false });
      engine.world.restore(snapshot.world);
      const gravity = createGravitySystem(engine, undefined, { maxStepsPerUpdate: 4096 });
      gravity.restore(snapshot.gravity);
      gravity.update(plan.simulationTime);
      nextSnapshot = JSON.stringify(serializeUniverseSnapshot({
        ...snapshot,
        simulationTime: plan.simulationTime,
        world: engine.world.snapshot(),
        gravity: gravity.snapshot()
      }));
    }

    // Persist the matching snapshot and wall cursor together. A retried alarm
    // resumes after this cursor, so an offline interval cannot be applied twice.
    this.sql.exec("UPDATE universe_state SET previous_snapshot = snapshot, snapshot = ?, simulation_time = ?, processed_wall_ms = ? WHERE id = 1", nextSnapshot, plan.simulationTime, plan.processedWallMs);
    await this.ctx.storage.setAlarm(plan.remainingWallMs > 0 ? now + 1_000 : now + ALARM_MS);
  }
}
