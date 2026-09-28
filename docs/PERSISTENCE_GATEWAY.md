# Persistence Gateway

Application and Core code use the `PersistenceRepository` contract (`load` and `save`) instead of knowing a remote storage provider. `InMemoryPersistenceRepository` provides isolated user/universe scopes for tests. The authenticated UI uses `CloudflarePersistenceRepository`, which obtains the current Firebase ID token and sends the universe key separately from the snapshot.

The Worker derives ownership only from the verified Firebase token. The client never supplies an owner ID to select remote data; the adapter also rejects a requested user scope that does not match the signed-in Firebase UID. The `default` universe keeps the original Durable Object name so existing saves remain available. Other universe IDs receive separate user-scoped Durable Objects.

Each remote save carries an expected revision and operation ID. A repeated latest operation is acknowledged idempotently. A stale revision returns HTTP 409 with the current revision and does not overwrite the stored snapshot. Save failures do not mutate the in-memory Core state. Legacy clients sending an unwrapped snapshot remain accepted with last-write-wins behavior during rollout.
