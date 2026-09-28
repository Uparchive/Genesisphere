import test from "node:test";
import assert from "node:assert/strict";
import {createGenesisEngine} from "../src/game-engine.js";

test("placing a planet preserves the chosen point as its orbital phase",()=>{
  const engine=createGenesisEngine();
  const system=engine.world.byType("cosmic.star-system")[0];
  const star=engine.usePower("CREATE_STAR",{systemId:system.id,templateId:"star.g-type"});
  const phaseRadians=1.2345;
  const result=engine.usePower("CREATE_PLANET",{
    systemId:system.id,parentStarId:star.id,templateId:"planet.terrestrial",
    semiMajorAxisAU:1.7,eccentricity:0,phaseRadians,periodDays:365.25*Math.sqrt(1.7**3)
  });
  assert.equal(result.planet.orbit.phaseRadians,phaseRadians);
  assert.equal(result.orbit.phaseRadians,phaseRadians);
});
