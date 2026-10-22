import type { Derived, Levels, OutcomeId, Parts, ScenarioId, State, Tone } from "./types.ts";

/** Delayed-neutron fraction, RBMK-1000 order. */
export const BETA = 0.0054;
/** Prompt-neutron generation time, s. */
export const LAMBDA_PROMPT = 0.0005;
/** One-group precursor decay, 1/s. */
export const PRECURSOR = 0.08;

const LAMBDA_I = 2.93e-5;
const LAMBDA_X = 2.09e-5;
/** Neutron burnout of xenon at full power. Several times decay, as in a power reactor. */
const SIGMA_PHI = 8.4e-5;
/** Share of xenon production that comes through iodine. The rest is direct yield. */
const XE_VIA_I = 0.95;
const XE_PROD = LAMBDA_X + SIGMA_PHI;

/** Boron starts after the displacer has crossed the lower core. */
const BORON_START = 0.12;
/** Gentle regulating worth across the first 80% of boron travel, Δk. */
const GENTLE = 0.0175;
/** Extra shutdown worth in the last of the stroke, Δk. */
const TEETH = 0.042;
const KNEE = 0.8;
const XE_WORTH = 0.03;
const DOPPLER = 6.4e-6;
/** Peak tip worth at bottom-peak = 1. */
const TIP_AMP = 0.0056;

export const RODS = 211;
const MIN_N = 0.0015;
const NOM_ROD = 0.24;

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function pumpsOn(s: Pick<State, "pumps">): number {
  let n = 0;
  for (const p of s.pumps) if (p) n += 1;
  return n;
}

export function flowOf(s: Pick<State, "pumps" | "coast">): number {
  return (pumpsOn(s) / 6) * s.coast;
}

/** Lab `flowSet` overrides the pump bank. Zero means use the pumps. */
export function plantFlow(s: Pick<State, "pumps" | "coast" | "flowSet">): number {
  return s.flowSet > 0 ? s.flowSet : flowOf(s);
}

export function targetFuel(n: number, flow: number): number {
  const r = Math.max(n, 0) / Math.max(flow, 0.22);
  return 265 + 345 * Math.pow(Math.max(r, 0), 0.72);
}

export function targetVoid(n: number, flow: number, kick: number): number {
  const ratio = Math.max(n, 0) / Math.max(flow, 0.16);
  return clamp(0.02 + 0.13 * Math.pow(ratio, 1.35) + kick, 0, 0.96);
}

export const T_REF = targetFuel(1, 1);
export const VOID_REF = targetVoid(1, 1, 0);

function rodLinear(rod: number): number {
  const x = clamp((rod - BORON_START) / (1 - BORON_START), 0, 1);
  if (x <= KNEE) return (-GENTLE * x) / KNEE;
  const u = (x - KNEE) / (1 - KNEE);
  return -GENTLE - TEETH * u;
}

/** Positive only while the lower water column is being displaced. */
function tipShape(rod: number): number {
  if (rod <= 0 || rod >= 0.16) return 0;
  return Math.sin(Math.PI * (rod / 0.16));
}

/** >1 when the flux sits in the lower core — withdrawn rods, heavy xenon. */
export function bottomPeak(rod: number, xenon: number): number {
  const xe = clamp((xenon - 0.45) / 0.9, 0, 1.45);
  const out = clamp((0.13 - rod) / 0.13, 0, 1);
  return clamp(0.22 + 1.15 * out + 1.05 * out * xe + 0.2 * xe, 0.15, 2.6);
}

function voidCoeff(n: number): number {
  const low = clamp((0.42 - n) / 0.42, 0, 1);
  return 0.008 + 0.042 * low;
}

let excessCache = Number.NaN;

export function excessReactivity(): number {
  if (Number.isFinite(excessCache)) return excessCache;
  const linear = rodLinear(NOM_ROD);
  const xenon = -XE_WORTH * 1;
  excessCache = -(linear + xenon);
  return excessCache;
}

export function reactivity(
  s: Pick<State, "n" | "X" | "tf" | "voidF" | "voidScale" | "dopplerScale" | "tipScale">,
  rod: number,
): Parts {
  const bp = bottomPeak(rod, s.X);
  const rodLinearW = rodLinear(rod);
  const tip = TIP_AMP * s.tipScale * bp * tipShape(rod);
  const xenon = -XE_WORTH * s.X;
  const doppler = -DOPPLER * s.dopplerScale * (s.tf - T_REF);
  const vr = voidCoeff(s.n) * s.voidScale * (s.voidF - VOID_REF);
  const excess = excessReactivity();
  return {
    excess,
    rod: rodLinearW,
    tip,
    void: vr,
    xenon,
    doppler,
    total: excess + rodLinearW + tip + vr + xenon + doppler,
  };
}

export function ormOf(rod: number): number {
  return rod * RODS;
}

function precursorEq(n: number): number {
  return (n * BETA) / (LAMBDA_PROMPT * PRECURSOR);
}

export function derive(s: State): Derived {
  const parts = reactivity(s, s.rod);
  const flow = plantFlow(s);
  const dollars = parts.total / BETA;
  let period: number | null = null;
  if (s.n > MIN_N * 1.2) {
    const rho = parts.total;
    if (rho > BETA) period = LAMBDA_PROMPT / (rho - BETA);
    else if (Math.abs(rho) > 2e-5) {
      const asym = (BETA - rho) / (PRECURSOR * rho);
      if (Math.abs(asym) < 900) period = asym;
    }
  }
  const orm = ormOf(s.rod);
  const alarms = collectAlarms(s, parts, orm, period);
  return {
    parts,
    dollars,
    orm,
    flow,
    pumpsOn: pumpsOn(s),
    mw: s.n * 3200,
    mwe: s.n * s.steam * 1000,
    period,
    voidF: s.voidF,
    tf: s.tf,
    xenon: s.X,
    alarms,
  };
}

function collectAlarms(
  s: State,
  parts: Parts,
  orm: number,
  period: number | null,
): Derived["alarms"] {
  const list: Derived["alarms"] = [];
  if (s.exploded) {
    list.push({ id: "boom", text: "CORE DISASSEMBLY", severe: true });
    return list;
  }
  if (orm < 8) {
    list.push({
      id: "orm",
      text: "ORM BELOW 8 — GRAPHITE TIPS DOMINATE A SCRAM",
      severe: true,
    });
  } else if (orm < 15) {
    list.push({ id: "orm", text: "ORM BELOW 15-ROD MINIMUM", severe: true });
  }
  if (period !== null && period > 0 && period < 20 && s.n > 0.04) {
    list.push({
      id: "period",
      text: `REACTOR PERIOD ${period.toFixed(0)} s`,
      severe: period < 8,
    });
  }
  if (s.n > 1.08) {
    list.push({ id: "power", text: "POWER ABOVE 108%", severe: s.n > 1.18 });
  }
  if (s.voidF > 0.38) {
    list.push({
      id: "void",
      text: "CHANNEL VOID HIGH — POSITIVE REACTIVITY",
      severe: s.voidF > 0.55,
    });
  }
  if (s.tf > 1050) {
    list.push({ id: "tf", text: "FUEL TEMPERATURE HIGH", severe: s.tf > 1400 });
  }
  if (s.lab) {
    if (plantFlow(s) < 0.45) {
      list.push({ id: "pumps", text: "COOLANT FLOW LOW", severe: plantFlow(s) < 0.3 });
    }
    if (!s.tripArmed) list.push({ id: "trip", text: "AUTOMATIC TRIP OFF", severe: false });
  } else if (pumpsOn(s) <= 3) {
    list.push({ id: "pumps", text: "CIRCULATION LOW", severe: pumpsOn(s) <= 2 });
  }
  if (!s.lab && !s.eccs) list.push({ id: "eccs", text: "ECCS ISOLATED", severe: false });
  if (!s.lab && !s.tripArmed) list.push({ id: "trip", text: "TURBINE-TRIP SCRAM BLOCKED", severe: false });
  if (!s.lab && s.auto && s.autoBlocked) {
    list.push({ id: "ar", text: "AUTOMATIC REGULATOR HOLDING AT ORM 15", severe: true });
  }
  if (!s.lab && s.rundown) list.push({ id: "run", text: "TURBINE RUNDOWN — PUMPS ON INERTIA", severe: false });
  if (parts.tip > 0.0015) {
    list.push({ id: "tip", text: "GRAPHITE DISPLACERS ADDING REACTIVITY", severe: true });
  }
  return list;
}

export function pushLog(s: State, from: string, text: string, tone: Tone): void {
  s.logSeq += 1;
  s.log.push({ id: s.logSeq, t: s.t, from, text, tone });
  if (s.log.length > 40) s.log.splice(0, s.log.length - 40);
}

function blank(scenario: ScenarioId): State {
  return {
    scenario,
    phase: "run",
    outcome: null,
    t: 0,
    realT: 0,
    n: 1,
    c: precursorEq(1),
    I: 1,
    X: 1,
    tf: T_REF,
    voidF: VOID_REF,
    rod: NOM_ROD,
    pumps: [true, true, true, true, true, true, false, false],
    coast: 1,
    steam: 1,
    rundown: false,
    rundownT: 0,
    scram: false,
    scramT: 0,
    scramReason: "",
    jammed: false,
    eccs: true,
    tripArmed: true,
    auto: false,
    setpoint: 1,
    autoBlocked: false,
    kick: 0,
    fuelDamage: 0,
    overT: 0,
    tripAcc: 0,
    exploded: false,
    mwh: 0,
    mwhE: 0,
    minOrm: 80,
    sawPower: false,
    sawPump: false,
    peakN: 1,
    peakTip: 0,
    peakVoidRho: 0,
    minRod: 1,
    ormLowT: 0,
    scale: 1,
    held: false,
    calm: 10,
    lab: false,
    voidScale: 1,
    dopplerScale: 1,
    tipScale: 1,
    pinXenon: false,
    pinFuel: false,
    pinVoid: false,
    xenonHold: 1,
    iodineHold: 1,
    fuelHold: T_REF,
    voidHold: VOID_REF,
    flowSet: 0,
    rodTarget: NOM_ROD,
    log: [],
    logSeq: 0,
    fired: [],
    nextEvent: 1e9,
    eventIdx: 0,
    pendingPump: -1,
    pumpDeadline: 1e9,
    hist: [],
    histAcc: 0,
  };
}

export function equilibrate(s: State, guess: number): void {
  const flow = Math.max(plantFlow(s), 0.2);
  s.tf = targetFuel(s.n, flow);
  s.voidF = targetVoid(s.n, flow, s.kick);
  s.rod = solveRod(s, guess);
  balancePrecursors(s);
  s.minOrm = ormOf(s.rod);
  s.minRod = s.rod;
  s.peakN = s.n;
}

export function balancePrecursors(s: State): void {
  s.c = precursorEq(s.n);
}

export function solveRod(s: State, guess: number): number {
  let best = guess;
  let bestAbs = Infinity;
  let bestDist = Infinity;
  for (let i = 0; i <= 240; i++) {
    const r = i / 240;
    const rho = reactivity(s, r).total;
    const a = Math.abs(rho);
    const dist = Math.abs(r - guess);
    const betterRho = a < bestAbs - 8e-6;
    const tie = Math.abs(a - bestAbs) <= 8e-6 && dist < bestDist;
    if (betterRho || tie) {
      best = r;
      bestAbs = a;
      bestDist = dist;
    }
  }
  return best;
}

export function createState(scenario: ScenarioId): State {
  const s = blank(scenario);
  if (scenario === "grid") {
    s.auto = true;
    s.setpoint = 1;
    s.nextEvent = 0;
    equilibrate(s, NOM_ROD);
    pushLog(
      s,
      "DISPATCH",
      "Unit 4 on the line at nominal. Hold the night. Call if ORM moves.",
      "info",
    );
  } else if (scenario === "test") {
    s.n = 0.22;
    s.I = 1.65;
    s.X = 1.16;
    s.auto = false;
    s.setpoint = 700 / 3200;
    s.c = precursorEq(s.n);
    equilibrate(s, 0.12);
    pushLog(
      s,
      "DYATLOV",
      "Power is already at 700. Hold it for the rundown. Xenon is still climbing from the day's full-power run.",
      "warn",
    );
    pushLog(
      s,
      "SKALA",
      "Fifteen rod-equivalents is the floor. The regulator will not cross it. If you cannot hold 700 without crossing it, raise power and burn xenon out — or abort.",
      "info",
    );
  } else {
    s.n = 0.1;
    s.I = 0.78;
    s.X = 0.7;
    s.auto = false;
    s.setpoint = 0.35;
    s.tf = targetFuel(0.1, 1);
    s.voidF = targetVoid(0.1, 1, 0);
    s.rod = solveRod(s, 0.35);
    s.rod = clamp(s.rod + 0.05, 0, 1);
    s.n = 0.1;
    s.c = precursorEq(0.1);
    s.minOrm = ormOf(s.rod);
    s.minRod = s.rod;
    s.peakN = s.n;
    pushLog(
      s,
      "INSTRUCTOR",
      "Low power, slightly subcritical. Withdraw until the period is near 20 seconds, then release. Level off around 1000 MW, disturb a pump, and scram while ORM is still healthy.",
      "info",
    );
  }
  return s;
}

function finish(s: State, outcome: OutcomeId): void {
  if (s.phase === "over") return;
  s.phase = "over";
  s.outcome = outcome;
}

export function commandScram(s: State, reason = "AZ-5 pressed at the desk."): void {
  if (s.phase !== "run" || s.scram || s.exploded) return;
  s.scram = true;
  s.scramReason = reason;
  pushLog(s, "AZ-5", reason, "alarm");
}

export function commandRundown(s: State): void {
  if (s.phase !== "run" || s.rundown || s.exploded) return;
  if (s.scenario === "train") {
    pushLog(s, "INSTRUCTOR", "No rundown on the trainer. Learn the desk first.", "warn");
    return;
  }
  s.rundown = true;
  s.rundownT = 0;
  if (s.tripArmed) {
    commandScram(s, "Turbine stop valves closed. Trip is armed — rods driving in.");
  } else {
    pushLog(
      s,
      "TURBINE",
      "Stop valves closing. Main pumps are on rundown inertia only. The reactor trip from those valves is blocked.",
      "warn",
    );
  }
}

export function commandPump(s: State, index: number): void {
  if (s.phase !== "run" || s.exploded) return;
  if (index < 0 || index > 7) return;
  s.pumps[index] = !s.pumps[index];
  s.sawPump = true;
  pushLog(
    s,
    "MCP",
    `Main circulation pump ${index + 1} ${s.pumps[index] ? "on" : "off"}.`,
    "info",
  );
  if (s.pendingPump === index && !s.pumps[index]) s.pendingPump = -1;
}

export function commandEccs(s: State, armed: boolean): void {
  if (s.phase !== "run") return;
  s.eccs = armed;
  pushLog(
    s,
    "ECCS",
    armed ? "Emergency core cooling armed." : "ECCS isolated from the circuit.",
    armed ? "ok" : "warn",
  );
}

export function commandTrip(s: State, armed: boolean): void {
  if (s.phase !== "run") return;
  s.tripArmed = armed;
  pushLog(
    s,
    "AZ",
    armed
      ? "Turbine-trip scram restored."
      : "Scram from turbine stop-valves is blocked.",
    armed ? "ok" : "alarm",
  );
}

export function commandAuto(s: State, on: boolean): void {
  if (s.phase !== "run") return;
  s.auto = on;
  pushLog(s, "AR", on ? "Automatic power regulator on." : "Automatic regulator off. Rods are manual.", "info");
}

export function commandSetpoint(s: State, mwFrac: number): void {
  s.setpoint = clamp(mwFrac, 0.05, 1.15);
}

export function commandAbort(s: State): void {
  if (s.phase !== "run" || s.exploded) return;
  if (s.rundown) {
    pushLog(s, "DESK", "Rundown already started — AZ-5 is the abort.", "warn");
    return;
  }
  pushLog(s, "AKIMOV", "Test cancelled. The shift chief can be angry from outside the biological shield.", "ok");
  finish(s, "aborted");
}

export function commandEndShift(s: State): void {
  if (s.phase !== "run" || s.exploded) return;
  if (s.scenario === "train") {
    const ok = s.sawPower && s.sawPump && s.scram && s.minOrm >= 15 && s.n < 0.08;
    finish(s, ok ? "train_ok" : "train_partial");
    return;
  }
  finish(s, "shift_end");
}

function moveRods(s: State, lv: Levels, h: number): void {
  if (s.jammed || s.exploded) return;
  if (s.scram) {
    s.rod += h / 18;
  } else if (s.lab) {
    const max = 0.034 * h;
    s.rod += clamp(s.rodTarget - s.rod, -max, max);
  } else if (lv.rod !== 0) {
    s.rod += lv.rod * 0.034 * h;
  } else if (s.auto) {
    const err = (s.n - s.setpoint) / Math.max(s.setpoint, 0.08);
    if (err < -0.025) {
      if (ormOf(s.rod) <= 15.15) s.autoBlocked = true;
      else s.rod += clamp(err, -1, 1) * 0.034 * h;
    } else if (err > 0.025) {
      s.rod += clamp(err, -1, 1) * 0.034 * h;
    }
  }
  s.rod = clamp(s.rod, 0, 1);
}

function substep(s: State, lv: Levels, h: number, warp: number): void {
  moveRods(s, lv, h);

  if (s.rundown) {
    s.rundownT += h;
    s.steam = clamp(1 - s.rundownT / 2.4, 0, 1);
    const hold = 5;
    s.coast = s.rundownT < hold ? 1 : Math.exp(-(s.rundownT - hold) / 30);
  }

  const flow = plantFlow(s);
  const voidTarget = targetVoid(s.n, flow, s.kick);
  const fuelTarget = targetFuel(s.n, flow);
  if (s.pinVoid) s.voidF = clamp(s.voidHold, 0, 0.96);
  else s.voidF += (voidTarget - s.voidF) * (1 - Math.exp(-h / 2.3));
  if (s.pinFuel) s.tf = clamp(s.fuelHold, 200, 2400);
  else s.tf += (fuelTarget - s.tf) * (1 - Math.exp(-h / 6.5));
  s.kick *= Math.exp(-h / 14);

  const xh = h * warp;
  if (s.pinXenon) {
    s.X = clamp(s.xenonHold, 0, 4);
    s.I = clamp(s.iodineHold, 0, 4);
  } else {
    s.I = Math.max(0, s.I + LAMBDA_I * (s.n - s.I) * xh);
    const produced = (1 - XE_VIA_I) * XE_PROD * s.n + XE_VIA_I * XE_PROD * s.I;
    s.X = Math.max(0, s.X + (produced - LAMBDA_X * s.X - SIGMA_PHI * s.n * s.X) * xh);
    s.X = Math.min(s.X, 4);
  }

  const parts = reactivity(s, s.rod);
  const nOld = s.n;
  const prompt = (parts.total - BETA) / LAMBDA_PROMPT;
  const delayed = (PRECURSOR * s.c) / Math.max(nOld, 1e-8);
  const inv = prompt + delayed;
  if (!Number.isFinite(inv)) {
    s.exploded = true;
    s.n = 200;
    return;
  }
  s.n = Math.max(MIN_N, nOld * Math.exp(clamp(inv, -70, 70) * h));
  const drive = (BETA / LAMBDA_PROMPT) * (0.5 * (nOld + s.n));
  const decay = Math.exp(-PRECURSOR * h);
  s.c = s.c * decay + (drive / PRECURSOR) * (1 - decay);

  if (s.n > 32) s.overT += h;
  else s.overT = Math.max(0, s.overT - h);
  if (s.voidF > 0.84 && s.n > 0.45) s.fuelDamage += h * (0.05 + s.n * 0.015);
  if (s.tf > 1700) s.fuelDamage += ((s.tf - 1700) / 2800) * h;
  if (!s.eccs && pumpsOn(s) <= 2 && s.n > 0.3) s.fuelDamage += h * 0.02;
  if (s.n > 40) s.fuelDamage += (s.n - 40) * h * 0.05;

  if (s.n > 120 || s.overT > 0.85 || s.fuelDamage >= 1) {
    s.exploded = true;
    s.n = Math.min(s.n, 400);
    s.jammed = true;
  }
  if (s.fuelDamage > 0.7 || s.n > 50) s.jammed = true;

  const orm = ormOf(s.rod);
  if (orm < s.minOrm) s.minOrm = orm;
  if (s.rod < s.minRod) s.minRod = s.rod;
  if (s.n > s.peakN) s.peakN = s.n;
  if (parts.tip > s.peakTip) s.peakTip = parts.tip;
  if (parts.void > s.peakVoidRho) s.peakVoidRho = parts.void;
  if (orm < 15) s.ormLowT += xh;
  if (s.n > 0.32) s.sawPower = true;

  s.mwh += (s.n * 3200 * xh) / 3600;
  s.mwhE += (s.n * s.steam * 1000 * xh) / 3600;

  if (s.scram) s.scramT += h;

  if (s.tripArmed && !s.scram && !s.exploded) {
    const dollarsNow = parts.total / BETA;
    const bad = dollarsNow > 0.58 || s.n > 1.16;
    if (bad) s.tripAcc += h;
    else s.tripAcc = Math.max(0, s.tripAcc - h * 0.5);
    if (!s.lab && pumpsOn(s) <= 2 && s.n > 0.2) {
      commandScram(s, "Low-circulation trip. Rods driving in.");
    } else if (s.tripAcc > 0.32) {
      commandScram(
        s,
        dollarsNow > 0.58
          ? "Reactivity trip. Rods driving in."
          : "High-power trip. Rods driving in.",
      );
    }
  }

  s.t += xh;
}

function pickH(s: State, remaining: number): number {
  const rho = reactivity(s, s.rod).total;
  const prompt = (rho - BETA) / LAMBDA_PROMPT;
  if (s.scram || s.rundown || rho > BETA * 0.4 || s.n > 1.35 || Math.abs(prompt) > 6) {
    const h = 0.16 / (Math.abs(prompt) + 3);
    return Math.min(remaining, clamp(h, 0.001, 0.02));
  }
  return Math.min(remaining, 0.2);
}

function unstable(s: State, wall: number): boolean {
  if (s.scram || s.rundown || s.exploded) return true;
  const rho = reactivity(s, s.rod).total;
  const hot = s.lab
    ? rho > BETA * 0.35 || s.n > 1.12
    : rho > BETA * 0.28 || rho < -0.012 || s.n > 1.12;
  if (hot) s.calm = 0;
  else s.calm += wall;
  return hot || s.calm < 1.4;
}

export function step(s: State, lv: Levels, frameDt: number): void {
  const wall = clamp(frameDt, 0, 0.05);
  if (s.phase !== "run") return;
  s.realT += wall;
  s.autoBlocked = false;
  const hot = unstable(s, wall);
  const requested = lv.timeScale;
  const warp = requested <= 0 ? 0 : hot ? 1 : requested;
  s.scale = warp;
  s.held = hot && requested > 1.05;
  if (requested <= 0) return;

  let remaining = wall;
  let guard = 0;
  while (remaining > 1e-5 && guard++ < 80 && s.phase === "run") {
    const h = pickH(s, remaining);
    substep(s, lv, h, warp);
    remaining -= h;
    if (s.exploded) break;
  }

  s.histAcc += wall;
  if (s.histAcc >= 0.16) {
    s.histAcc = 0;
    const p = reactivity(s, s.rod);
    s.hist.push({
      t: s.t,
      n: s.n,
      rho: p.total,
      rod: s.rod,
      voidF: s.voidF,
      tip: p.tip,
      xe: s.X,
      orm: ormOf(s.rod),
    });
    if (s.hist.length > 160) s.hist.splice(0, s.hist.length - 160);
  }

  if (s.exploded) {
    s.jammed = true;
    pushLog(s, "UNIT 4", "Power excursion. The core is no longer intact.", "alarm");
    finish(s, "exploded");
    return;
  }

  if (
    !s.lab &&
    s.scram &&
    s.scramT > 8 &&
    s.rod > 0.55 &&
    s.n < 0.045 &&
    s.fuelDamage < 0.5
  ) {
    if (s.scenario === "train") {
      finish(s, s.sawPower && s.sawPump && s.minOrm >= 15 ? "train_ok" : "train_partial");
    } else if (s.scenario === "test") {
      if (!s.rundown) finish(s, "shutdown");
      else finish(s, s.minOrm < 15 || !s.eccs ? "test_dirty" : "test_clean");
    } else if (s.scramReason.startsWith("AZ-5 pressed")) {
      finish(s, "shutdown");
    } else {
      finish(s, "tripped");
    }
    return;
  }

  if (
    s.scenario === "test" &&
    s.rundown &&
    s.rundownT > 52 &&
    s.n < 1.3 &&
    s.fuelDamage < 0.35 &&
    !s.scram
  ) {
    finish(s, s.minOrm < 14.8 || !s.eccs ? "test_dirty" : "test_clean");
  }
}

export function dollars(rho: number): number {
  return rho / BETA;
}

export function formatClock(baseSec: number, t: number): string {
  let sec = Math.floor(baseSec + Math.max(0, t));
  sec = ((sec % 86400) + 86400) % 86400;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function clockOf(s: State): string {
  const base = s.scenario === "test" ? 70 * 60 : s.scenario === "grid" ? 22 * 3600 : 0;
  return formatClock(base, s.t);
}

export function dateLabel(s: State): string {
  if (s.scenario === "test") return "26 APR 1986";
  if (s.scenario === "grid") return "25 APR 1986";
  return "TRAINER";
}
