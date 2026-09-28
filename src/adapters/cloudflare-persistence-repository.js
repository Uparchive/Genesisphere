import { PersistenceRepository, persistenceScopeKey } from "../core/persistence-repository.js";
import { migrateUniverseSnapshot, validateUniverseSnapshot } from "../core/persistence.js";

/** HTTP adapter for the authenticated Cloudflare Worker persistence API. */
export class CloudflarePersistenceRepository extends PersistenceRepository {
  constructor({ baseUrl, getCurrentUser, fetchImpl = globalThis.fetch }) {
    super();
    if (typeof baseUrl !== "string" || !baseUrl.trim()) throw new TypeError("baseUrl is required");
    if (typeof getCurrentUser !== "function") throw new TypeError("getCurrentUser is required");
    if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
    this.endpoint = `${baseUrl.replace(/\/$/, "")}/api/v1/world`;
    this.getCurrentUser = getCurrentUser;
    this.fetchImpl = fetchImpl;
  }

  async #request(method, { userId, universeId, snapshot, expectedRevision, operationId } = {}) {
    persistenceScopeKey(userId, universeId);
    const user = this.getCurrentUser();
    if (!user || user.uid !== userId) {
      const error = new Error("The requested persistence scope does not match the signed-in user");
      error.code = "PERSISTENCE_IDENTITY_MISMATCH";
      throw error;
    }
    const token = await user.getIdToken();
    const url = new URL(this.endpoint);
    url.searchParams.set("universeId", universeId);
    const body = method === "PUT" ? { snapshot: validateUniverseSnapshot(migrateUniverseSnapshot(snapshot)), expectedRevision, operationId } : undefined;
    const response = await this.fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const value = await response.json();
    if (!response.ok) {
      const error = new Error(response.status === 401 ? "Your session has expired" : response.status === 409 ? "Persistence revision conflict" : "Unable to access the saved universe");
      error.code = response.status === 409 ? "PERSISTENCE_CONFLICT" : value.error || "PERSISTENCE_REQUEST_FAILED";
      if (Number.isInteger(value.currentRevision)) error.currentRevision = value.currentRevision;
      throw error;
    }
    if (method === "GET" && value.snapshot) value.snapshot = validateUniverseSnapshot(migrateUniverseSnapshot(value.snapshot));
    return value;
  }

  load(scope) { return this.#request("GET", scope); }
  save(request) { return this.#request("PUT", request); }
}
