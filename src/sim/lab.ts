import {
  BETA,
  balancePrecursors,
  clamp,
  createState,
  derive,
  equilibrate,
  reactivity,
  solveRod,
  targetFuel,
  targetVoid,
} from "./physics.ts";
import type { State } from "./types.ts";

export type ExperimentId = "raise" | "void" | "xenon" | "safe" | "well" | "free";

export type Lesson = {
  id: ExperimentId;
  step: string;
  title: string;
  body: string;
  task: string;
};

export const LESSONS: Lesson[] = [
  {
    id: "raise",
    step: "1",
    title: "Rods and the period",
    body: "Power follows the neutron balance. Reactivity in dollars is the surplus divided by β, the delayed-neutron fraction (about 0.0054). Under 1$ the rise is paced by delayed neutrons and takes seconds. Past 1$ the chain runs on prompt neutrons.",
    task: "Move insertion down — rods out — until the period is positive and power passes about 800 MW. Let go before the period collapses toward a second. With the trip armed, the rods will drive themselves in if you don’t.",
  },
  {
    id: "void",
    step: "2",
    title: "Boiling and Doppler",
    body: "This core is over-moderated. Graphite already slows the neutrons, and water in the channels absorbs more than it moderates, so steam adds reactivity. That void coefficient is stronger at low power. Hot fuel does the opposite: Doppler broadening of uranium-238 resonances removes neutrons.",
    task: "Lower coolant flow and watch the void term go positive while fuel temperature pulls back. Then set the void coefficient below zero and boil again. A water-moderated reactor has that sign, and steam would then shut the power down.",
  },
  {
    id: "xenon",
    step: "3",
    title: "The iodine well",
    body: "Iodine-135 builds at power and decays, with a 6.6-hour half-life, into xenon-135. Xenon absorbs neutrons strongly, then burns out or decays (9.2 hours). After a power cut, iodine keeps feeding xenon while burnup falls, so absorption rises for hours. Withdrawing rods to hold power spends the operating reactivity margin.",
    task: "Insert rods until power is under about 400 MW. The poison clock on this lesson starts at 20 min/s. Xenon should rise as iodine keeps decaying and the neutrons that were burning it are gone. The clock drops to real time if the core runs away.",
  },
  {
    id: "safe",
    step: "4",
    title: "AZ-5 from a stocked core",
    body: "Each rod is a graphite displacer with boron above it. From a partly inserted bank the boron is already near the fuel. Driving the rest in adds absorber. The tip bump stays small because the flux is not piled at the bottom of the core.",
    task: "Press AZ-5. Power should fall. The automatic trip is the same rod motion, started by the instruments instead of the button.",
  },
  {
    id: "well",
    step: "5",
    title: "AZ-5 from the xenon well",
    body: "With the bank nearly out, the bottom of the core is water. The graphite tip enters first and moderates better than the water it displaces, so the first seconds of a scram add reactivity. Xenon has pushed the flux downward, which makes that tip worth more. Extra power boils water, and the positive void coefficient adds still more before the boron arrives. One energy group cannot draw the real core — it shows the sign and the race.",
    task: "Press AZ-5 and watch the tip term, then the void term. Disarming the trip does not change that motion. The rods are the excursion. This is the geometry at the start of 26 April 1986.",
  },
];

export const FREE_LESSON: Lesson = {
  id: "free",
  step: "—",
  title: "Free bench",
  body: "Nothing here is scored. Holds freeze one variable so its coefficient is the only thing moving. The multipliers are the design of the core: 1 is this RBMK, 0 removes the effect, and a negative void coefficient is the pressurized-water sign.",
  task: "Try the well again with the graphite tip at 0, then at 1. Or pin the void and sweep only the coefficient.",
};

function fresh(): State {
  const s = createState("grid");
  s.lab = true;
  s.scenario = "lab";
  s.auto = false;
  s.outcome = null;
  s.phase = "run";
  s.exploded = false;
  s.scram = false;
  s.scramT = 0;
  s.jammed = false;
  s.fuelDamage = 0;
  s.overT = 0;
  s.tripAcc = 0;
  s.tripArmed = true;
  s.flowSet = 1;
  s.voidScale = 1;
  s.dopplerScale = 1;
  s.tipScale = 1;
  s.pinFuel = false;
  s.pinVoid = false;
  s.pinXenon = false;
  s.kick = 0;
  s.log = [];
  s.hist = [];
  s.fired = [];
  s.t = 0;
  s.realT = 0;
  return s;
}

function syncHolds(s: State): void {
  s.rodTarget = s.rod;
  s.xenonHold = s.X;
  s.iodineHold = s.I;
  s.fuelHold = s.tf;
  s.voidHold = s.voidF;
  s.peakN = s.n;
  s.peakTip = 0;
  s.peakVoidRho = 0;
  s.minOrm = s.rod * 211;
  s.minRod = s.rod;
}

/** Critical at low power with the bank a little too far in. */
function armRaise(s: State): void {
  s.n = 0.1;
  s.I = 0.72;
  s.X = 0.62;
  s.tf = targetFuel(0.1, 1);
  s.voidF = targetVoid(0.1, 1, 0);
  s.rod = clamp(solveRod(s, 0.45) + 0.02, 0, 1);
  balancePrecursors(s);
}

function armPower(s: State, n: number, iodine: number, xenon: number, guess: number): void {
  s.n = n;
  s.I = iodine;
  s.X = xenon;
  equilibrate(s, guess);
}

/**
 * Low power, xenon deep, rods nearly out — inserting a little adds reactivity.
 * Same search the unit test uses.
 */
export function armWell(s: State): boolean {
  s.n = 0.08;
  s.flowSet = 1;
  s.kick = 0;
  let found = false;
  for (let xi = 0; xi <= 50 && !found; xi++) {
    s.X = 0.85 + xi * 0.02;
    s.I = Math.max(s.X, 1);
    equilibrate(s, 0.025);
    const orm = s.rod * 211;
    const here = reactivity(s, s.rod).total / BETA;
    const deeper = reactivity(s, Math.min(0.14, s.rod + 0.045)).total / BETA;
    if (orm < 14 && Math.abs(here) < 0.2 && deeper > here + 0.7) found = true;
  }
  s.I = Math.max(s.X, 1.2);
  equilibrate(s, 0.04);
  return found;
}

export function createLab(id: ExperimentId): State {
  const s = fresh();
  if (id === "raise") armRaise(s);
  else if (id === "void") armPower(s, 0.5, 0.7, 0.72, 0.32);
  else if (id === "xenon") armPower(s, 1, 1, 1, 0.24);
  else if (id === "safe") armPower(s, 0.62, 1, 1, 0.4);
  else if (id === "well") armWell(s);
  else armPower(s, 1, 1, 1, 0.24);
  syncHolds(s);
  return s;
}

export type Origin = { x: number; n: number };

export function lessonStatus(
  id: ExperimentId,
  s: State,
  origin: Origin,
): "pending" | "met" | "lost" {
  if (id === "free") return "pending";
  const dollars = derive(s).parts.void / BETA;
  if (id === "raise") {
    if (s.exploded) return "lost";
    if (s.n > 0.25) return "met";
  }
  if (id === "void") {
    if (dollars > 0.25) return "met";
    if (s.voidScale < 0 && s.voidF > 0.2 && dollars < -0.05) return "met";
  }
  if (id === "xenon") {
    if (s.X > origin.x + 0.15) return "met";
  }
  if (id === "safe") {
    if (s.exploded) return "lost";
    if (s.scram && s.n < 0.06 && s.peakTip < 0.0025) return "met";
  }
  if (id === "well") {
    if (s.scram || s.exploded) {
      if (s.exploded || s.peakN > origin.n * 2 || s.peakTip > 0.002) return "met";
    }
  }
  return "pending";
}
