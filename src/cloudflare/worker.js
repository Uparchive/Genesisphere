import { createGenesisEngine } from "../game-engine.js";
import { SIMULATION_MS_PER_REAL_MS, TimeEngine } from "../core/time-engine.js";
import { createGravitySystem } from "../systems/stellar/orbital-collisions.js";

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const ALARM_MS = 60_000;
const MAX_SIM_STEP_MS = 60_000;
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
    const objectId = env.UNIVERSES.idFromName(identity.uid);
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
    if (!value || value.version !== 1 || !Number.isFinite(value.simulationTime) || value.simulationTime < 0 || !value.world || !Array.isArray(value.world.entities) || !value.gravity) return json({ error: "invalid_snapshot" }, 400, cors);
    const response = await object.fetch("https://universe.internal/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
    return new Response(response.body, { status: response.status, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
  }
};

export class UniverseDO {
  constructor(ctx) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS universe_state (id INTEGER PRIMARY KEY CHECK (id = 1), snapshot TEXT NOT NULL, simulation_time REAL NOT NULL, processed_wall_ms REAL NOT NULL, active_until_ms REAL NOT NULL)");
  }

  current() { return this.sql.exec("SELECT snapshot, simulation_time, processed_wall_ms, active_until_ms FROM universe_state WHERE id = 1").toArray()[0] || null; }

  async fetch(request) {
    if (new URL(request.url).pathname !== "/state") return json({ error: "not_found" }, 404);
    if (request.method === "GET") {
      const row = this.current();
      return json({ snapshot: row ? JSON.parse(row.snapshot) : null });
    }
    if (request.method !== "PUT") return json({ error: "method_not_allowed" }, 405);
    const value = await request.json();
    const now = Date.now();
    const snapshot = JSON.stringify(value);
    this.sql.exec("INSERT INTO universe_state (id, snapshot, simulation_time, processed_wall_ms, active_until_ms) VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot, simulation_time = excluded.simulation_time, processed_wall_ms = excluded.processed_wall_ms, active_until_ms = excluded.active_until_ms", snapshot, value.simulationTime, now, now + ACTIVE_LEASE_MS);
    await this.ctx.storage.setAlarm(now + ALARM_MS);
    return json({ saved: true });
  }

  async alarm() {
    const row = this.current();
    if (!row) return;
    const now = Date.now();
    if (now < row.active_until_ms) {
      await this.ctx.storage.setAlarm(Math.max(row.active_until_ms, now + ALARM_MS));
      return;
    }
    const elapsed = Math.max(0, now - row.processed_wall_ms);
    if (!elapsed) { await this.ctx.storage.setAlarm(now + ALARM_MS); return; }
    const snapshot = JSON.parse(row.snapshot);
    const timeScale = Number.isFinite(snapshot.timeScale) && snapshot.timeScale > 0
      ? Math.max(.1, Math.min(64, snapshot.timeScale))
      : 1;
    const rate = snapshot.paused ? 0 : SIMULATION_MS_PER_REAL_MS * timeScale;
    if (rate === 0) {
      this.sql.exec("UPDATE universe_state SET processed_wall_ms = ? WHERE id = 1", now);
      await this.ctx.storage.setAlarm(now + ALARM_MS);
      return;
    }
    const processed = Math.min(elapsed, MAX_SIM_STEP_MS / rate);
    const engine = createGenesisEngine({ empty: false });
    engine.world.restore(snapshot.world);
    const gravity = createGravitySystem(engine, undefined, { maxStepsPerUpdate: 4096 });
    gravity.restore(snapshot.gravity);
    const clock = new TimeEngine({
      simulationTime: Number(row.simulation_time),
      realTime: Number(row.processed_wall_ms),
      timeScale
    });
    const advancement = clock.advance(processed);
    const simulationTime = advancement.simulationTime;
    gravity.update(simulationTime);
    const next = { ...snapshot, simulationTime, world: engine.world.snapshot(), gravity: gravity.snapshot() };
    const processedWall = advancement.realTime;
    this.sql.exec("UPDATE universe_state SET snapshot = ?, simulation_time = ?, processed_wall_ms = ? WHERE id = 1", JSON.stringify(next), simulationTime, processedWall);
    const behind = now - processedWall;
    await this.ctx.storage.setAlarm(behind > 0 ? now + 1_000 : now + ALARM_MS);
  }
}
