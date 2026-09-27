# Renderer 3D proof decision

Date: 2026-09-27  
Scope: Missions 14–15, opt-in structural integration.

## Decision

Use the browser's native WebGL 1 API for the proof renderer. The repository has no rendering package dependency, and its current presentation boundary already accepts detached `createRenderViewModel` snapshots. Native WebGL adds no package install or lockfile change and is broadly available in current desktop and mobile browsers. WebGPU is not selected for this small proof because it has a less uniform browser/mobile availability surface and would require a second backend path before this project needs it.

`WebGL3DRenderer` draws the top-level star systems in the universe view and stars, planets, black holes, and asteroids in a system view. It maps the universe camera center through `SpatialCoordinateSystem.worldDelta`, while system-local astronomical positions remain in AU. The focused-planet details view is also represented from the selected Core entity. A projected-size LOD chooses one of three shared sphere meshes, and bodies outside the viewport are skipped. Planets receive a light direction from their parent star; stars remain emissive. The renderer loads catalogued `master.webp` artwork as transient sphere textures and uses a flat-color fallback if a texture cannot load.

The renderer consumes only immutable view-model snapshots and creates no canonical entities. The app updates the snapshot each frame, so Core creation, removal, and updates are reflected without a separate renderer-owned entity registry. Renderer restart reuses a newly supplied snapshot. 3D picking projects the rendered bodies and returns only an `EntityId`; the application resolves that id against Core before applying existing navigation or focus behavior. Camera position, zoom, pan, selected id, and optional textures remain presentation state/resources. WASD and zoom input stay in the application and feed the next snapshot.

## Rollout and fallback

The 3D proof is opt-in from **Mais → Renderer 3D · testar**. The Canvas 2D `LegacyRenderer` remains initialized and receives the same snapshot; only the selected renderer draws each frame. Choosing the legacy mode returns to it immediately. If WebGL initialization or frame drawing throws, the view switches back to the legacy renderer. A WebGL context loss also returns to legacy mode.

The renderer draws only entities in the active scene and does not mix universe units with astronomical units. In a fresh empty Genesis universe, the top-level Genesis system is visible; no extra entities are seeded for rendering.

## Performance instrumentation

While 3D mode is active, the status readout samples every 30 renderer frames and reports:

- observed frame cadence (FPS) over that 30-frame window;
- average JavaScript CPU time spent submitting each render pass;
- WebGL drawing-buffer dimensions after a device-pixel-ratio cap of 1.5;
- modeled body count.

The counters support quick desktop and narrow/mobile-viewport checks without adding telemetry or a dependency. CPU submission time does not include GPU completion time. A viewport check should be made at desktop size and at a narrow mobile size (for example, 390 × 844 CSS pixels); record the actual device/browser and readout before comparing hardware.

Automated lifecycle verification uses a mocked WebGL context at 1366 × 768 and 390 × 844, checking draw-buffer resize, metric production, and disposal. Unit tests also check scene projection, snapshot creation/removal, picking by id, and renderer restart. The metrics are a software smoke check; this repository execution does not claim a measured physical phone GPU result. The on-device readout remains the source for hardware comparison.

## Known limits

The renderer remains opt-in, with 2D as the fallback and owner of placement/gameplay controls. Black holes and asteroids currently use simple sphere approximations; collision transients, orbit paths, dynamic shadows, and full migration of 2D interactions are outside this integration. Planet and star artwork uses existing catalog images projected onto sphere UVs, not generated equirectangular maps. Hardware-specific GPU timing and long-session phone coverage remain outstanding.
