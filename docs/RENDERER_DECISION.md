# Renderer 3D proof decision

Date: 2026-09-27  
Scope: Mission 14, vertical proof only.

## Decision

Use the browser's native WebGL 1 API for the proof renderer. The repository has no rendering package dependency, and its current presentation boundary already accepts detached `createRenderViewModel` snapshots. Native WebGL adds no package install or lockfile change and is broadly available in current desktop and mobile browsers. WebGPU is not selected for this small proof because it has a less uniform browser/mobile availability surface and would require a second backend path before this project needs it.

`WebGL3DRenderer` draws low-poly shaded spheres using a small shared sphere mesh and two shaders. It loads the catalogued `master.webp` celestial artwork as projected sphere textures, with a flat-color fallback if a texture cannot load. It maps canonical star/planet records and orbit fields from the view model into temporary presentation coordinates; it does not store entity records, evolve orbits, or write to Core. Camera zoom and both pan axes are read from the same view model. Existing WASD/zoom input remains owned by the application, and screen-space pan directions now match the legacy renderer. The main loop sends one immutable view model to both renderers.

## Rollout and fallback

The 3D proof is opt-in from **Mais → Renderer 3D · testar**. The Canvas 2D `LegacyRenderer` remains initialized and receives the same snapshot; only the selected renderer draws each frame. Choosing the legacy mode returns to it immediately. If WebGL initialization or frame drawing throws, the view switches back to the legacy renderer. A WebGL context loss also returns to legacy mode.

The proof draws modeled `cosmic.star` and `cosmic.terrestrial-planet` entities only while a system/region is active, so it never mixes distinct coordinate systems. In a fresh empty Genesis universe the status tells the player to create or open a system containing those entities; the proof does not seed or mutate the universe to produce a screenshot.

## Performance instrumentation

While 3D mode is active, the status readout samples every 30 renderer frames and reports:

- observed frame cadence (FPS) over that 30-frame window;
- average JavaScript CPU time spent submitting each render pass;
- WebGL drawing-buffer dimensions after a device-pixel-ratio cap of 1.5;
- modeled body count.

The counters support quick desktop and narrow/mobile-viewport checks without adding telemetry or a dependency. CPU submission time does not include GPU completion time. A viewport check should be made at desktop size and at a narrow mobile size (for example, 390 × 844 CSS pixels); record the actual device/browser and readout before comparing hardware.

Automated lifecycle verification uses a mocked WebGL context at 1366 × 768 and 390 × 844, checking draw-buffer resize, metric production, and disposal. The current execution environment has no local Chromium/Playwright installation, and its remote browser cannot reach the local development server, so this change does not claim a measured physical desktop or phone result. The on-device readout remains the source for that check.

## Known limits

This is a proof, not a migration: no 3D picking, orbit paths, dynamic shadows, starfield, or replacement of 2D interactions are included. Planet and star appearance uses existing pre-rendered catalog artwork projected onto the sphere surface; it is not a generated equirectangular map. Orbits are positioned from the view model's simulation time and orbital fields; physics remains unchanged. The proof needs a system containing a star and a planet to show both body types. Hardware-specific GPU timing and long-session device coverage remain outstanding.
