import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDirector } from "./director.ts";
import {
  BETA,
  clockOf,
  commandRundown,
  commandScram,
  createState,
  derive,
  equilibrate,
  flowOf,
  reactivity,
  step,
  targetFuel,
  targetVoid,
} from "./physics.ts";
import type { Levels, State } from "./types.ts";
import { createLab } from "./lab.ts";

function run(s: State, lv: Levels, seconds: number, hz = 30): void {
  const dt = 1 / hz;
  const frames = Math.round(seconds * hz);
  for (let i = 0; i < frames; i++) {
    step(s, lv, dt);
    applyDirector(s);
    if (s.phase === "over") return;
  }
}

test("nominal grid holds power", () => {
  const s = createState("grid");
  const n0 = s.n;
  const orm0 = derive(s).orm;
  assert.ok(Math.abs(reactivity(s, s.rod).total) < 0.0015, `not critical ${reactivity(s, s.rod).total}`);
  run(s, { rod: 0, timeScale: 1 }, 20);
  assert.equal(s.exploded, false);
  assert.ok(s.n > n0 * 0.9 && s.n < n0 * 1.1, `n drifted ${s.n}`);
  assert.ok(Math.abs(derive(s).orm - orm0) < 8, `orm moved ${derive(s).orm} from ${orm0}`);
});

test("safe AZ-5 from nominal shuts down", () => {
  const s = createState("grid");
  run(s, { rod: 0, timeScale: 1 }, 2);
  commandScram(s);
  run(s, { rod: 0, timeScale: 1 }, 25);
  assert.equal(s.exploded, false);
  assert.ok(s.n < 0.08, `power still ${s.n}`);
  assert.equal(s.outcome === "shutdown" || s.outcome === "tripped" || s.phase === "over", true);
});

test("training core starts subcritical and can be raised", () => {
  const s = createState("train");
  const rho0 = reactivity(s, s.rod).total;
  assert.ok(rho0 < -0.0008, `expected subcritical, rho ${rho0}`);
  const dt = 1 / 30;
  for (let i = 0; i < 30 * 30; i++) {
    const rho = reactivity(s, s.rod).total / BETA;
    const dir = s.n < 0.28 && rho < 0.38 ? -1 : 0;
    step(s, { rod: dir as -1 | 0 | 1, timeScale: 1 }, dt);
    applyDirector(s);
    if (s.exploded || s.n > 0.32) break;
  }
  assert.equal(s.exploded, false);
  assert.ok(
    s.peakN > 0.2,
    `power did not rise n=${s.n} peak=${s.peakN} rod=${s.rod.toFixed(3)} outcome=${s.outcome}`,
  );
});

test("holding withdraw with the trip armed does not destroy the core", () => {
  const s = createState("train");
  run(s, { rod: -1, timeScale: 1 }, 18);
  assert.equal(s.exploded, false, `exploded peak ${s.peakN}`);
});

test("AZ-5 from the xenon well can destroy the core", () => {
  const s = createState("test");
  s.pumps = [true, true, true, true, true, true, true, true];
  s.auto = false;
  s.tripArmed = false;
  s.eccs = false;
  s.kick = 0;
  s.n = 0.08;
  let armed: { X: number; rod: number } | null = null;
  for (let xi = 0; xi <= 50 && !armed; xi++) {
    s.X = 0.85 + xi * 0.02;
    s.I = Math.max(s.X, 1);
    equilibrate(s, 0.025);
    const orm = s.rod * 211;
    const here = reactivity(s, s.rod).total / BETA;
    const deeper = reactivity(s, Math.min(0.14, s.rod + 0.045)).total / BETA;
    if (orm < 14 && Math.abs(here) < 0.2 && deeper > here + 0.7) {
      armed = { X: s.X, rod: s.rod };
    }
  }
  assert.ok(armed, "no positive-scram geometry in range");
  s.X = armed!.X;
  s.I = Math.max(s.X, 1.2);
  equilibrate(s, 0.04);
  s.c = (s.n * BETA) / (0.0005 * 0.08);
  const d = derive(s);
  commandScram(s);
  const trace: string[] = [];
  const dt = 1 / 40;
  for (let i = 0; i < 40 * 16; i++) {
    step(s, { rod: 0, timeScale: 1 }, dt);
    if (i % 10 === 0) {
      const p = reactivity(s, s.rod);
      trace.push(
        `t=${s.t.toFixed(2)} n=${s.n.toFixed(3)} rod=${s.rod.toFixed(3)} orm=${(s.rod * 211).toFixed(1)} $=${(p.total / BETA).toFixed(2)} tip=${(p.tip / BETA).toFixed(2)} void$=${(p.void / BETA).toFixed(2)}`,
      );
    }
    if (s.exploded) break;
  }
  assert.ok(
    s.exploded || s.peakN > 6,
    `expected excursion orm=${d.orm.toFixed(1)} X=${armed!.X.toFixed(2)} peak=${s.peakN.toFixed(2)} exploded=${s.exploded}\n${trace.join("\n")}`,
  );
});

test("healthy rundown with trip armed does not explode", () => {
  const s = createState("test");
  // Hold a sane power with rods still in.
  assert.ok(derive(s).orm > 15, `started thin ${derive(s).orm}`);
  commandRundown(s);
  run(s, { rod: 0, timeScale: 1 }, 30);
  assert.equal(s.exploded, false, `exploded peak ${s.peakN}`);
  assert.ok(s.scram, "trip should have fired");
});

test("clock formats", () => {
  const s = createState("test");
  assert.equal(clockOf(s), "01:10:00");
});

test("targets are nominal at full power", () => {
  assert.ok(Math.abs(targetFuel(1, 1) - 610) < 2);
  assert.ok(Math.abs(targetVoid(1, 1, 0) - 0.15) < 0.02);
  const s = createState("grid");
  assert.ok(flowOf(s) > 0.9 && flowOf(s) < 1.1);
});

test("holding xenon ignores the poison clock", () => {
  const s = createLab("xenon");
  s.pinXenon = true;
  s.xenonHold = 0.4;
  s.iodineHold = 0.5;
  run(s, { rod: 0, timeScale: 300 }, 8);
  assert.ok(Math.abs(s.X - 0.4) < 0.02, `xenon moved ${s.X}`);
  assert.ok(Math.abs(s.I - 0.5) < 0.02, `iodine moved ${s.I}`);
});

test("a negative void coefficient flips the boiling term", () => {
  const s = createLab("void");
  s.voidF = 0.55;
  s.voidScale = 1;
  const pos = reactivity(s, s.rod).void;
  s.voidScale = -1;
  const neg = reactivity(s, s.rod).void;
  assert.ok(pos > 0, `expected positive void ${pos}`);
  assert.ok(neg < 0, `expected negative void ${neg}`);
  assert.ok(Math.abs(pos + neg) < 1e-9);
});

test("a lab scram does not end the bench", () => {
  const s = createLab("safe");
  assert.ok(s.rod > 0.16, `stocked rod ${s.rod}`);
  commandScram(s);
  run(s, { rod: 0, timeScale: 1 }, 30);
  assert.equal(s.exploded, false);
  assert.equal(s.phase, "run");
  assert.ok(s.n < 0.08, `power ${s.n}`);
});

test("xenon climbs after a power cut when the clock is fast", () => {
  const s = createLab("xenon");
  const x0 = s.X;
  s.rodTarget = Math.min(1, s.rod + 0.28);
  run(s, { rod: 0, timeScale: 1200 }, 18);
  assert.ok(s.X > x0 + 0.2, `xenon ${s.X} from ${x0}, n=${s.n.toFixed(3)}`);
});

test("AZ-5 from the lab xenon well can destroy the core", () => {
  const s = createLab("well");
  s.tripArmed = false;
  const d = derive(s);
  assert.ok(d.orm < 15, `orm ${d.orm} rod ${s.rod}`);
  commandScram(s);
  run(s, { rod: 0, timeScale: 1 }, 16);
  assert.ok(
    s.exploded || s.peakN > 6,
    `expected excursion orm=${d.orm.toFixed(1)} X=${s.X.toFixed(2)} peak=${s.peakN.toFixed(2)} exploded=${s.exploded}`,
  );
});
