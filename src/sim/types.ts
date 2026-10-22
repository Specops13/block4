export type ScenarioId = "train" | "grid" | "test" | "lab";

export type OutcomeId =
  | "exploded"
  | "train_ok"
  | "train_partial"
  | "shutdown"
  | "tripped"
  | "test_clean"
  | "test_dirty"
  | "aborted"
  | "shift_end";

export type Tone = "info" | "warn" | "alarm" | "ok";

export type LogLine = {
  id: number;
  t: number;
  from: string;
  text: string;
  tone: Tone;
};

export type Sample = {
  t: number;
  n: number;
  rho: number;
  rod: number;
  voidF: number;
  tip: number;
  xe: number;
  orm: number;
};

export type State = {
  scenario: ScenarioId;
  phase: "run" | "over";
  outcome: OutcomeId | null;
  /** Sim seconds (scaled). */
  t: number;
  /** Wall seconds the shift has actually been running. */
  realT: number;
  /** Neutron power relative to 3200 MWt. */
  n: number;
  /** Delayed-neutron precursor concentration. */
  c: number;
  /** Iodine-135, 1 = equilibrium at full power. */
  I: number;
  /** Xenon-135, 1 = equilibrium at full power. */
  X: number;
  /** Fuel temperature, °C. */
  tf: number;
  /** Channel void fraction 0..1. */
  voidF: number;
  /** Control-rod insertion 0 = out, 1 = in. */
  rod: number;
  pumps: boolean[];
  coast: number;
  steam: number;
  rundown: boolean;
  rundownT: number;
  scram: boolean;
  scramT: number;
  /** Why a scram started, for the debrief. */
  scramReason: string;
  jammed: boolean;
  eccs: boolean;
  tripArmed: boolean;
  auto: boolean;
  setpoint: number;
  autoBlocked: boolean;
  kick: number;
  fuelDamage: number;
  overT: number;
  tripAcc: number;
  exploded: boolean;
  mwh: number;
  mwhE: number;
  minOrm: number;
  sawPower: boolean;
  sawPump: boolean;
  peakN: number;
  peakTip: number;
  peakVoidRho: number;
  minRod: number;
  ormLowT: number;
  scale: number;
  held: boolean;
  calm: number;
  /** Bench mode: coefficients and holds, and the run does not end on a scram. */
  lab: boolean;
  /** 1 = RBMK void coefficient. Negative flips the sign. */
  voidScale: number;
  /** 1 = nominal Doppler. 0 removes it. */
  dopplerScale: number;
  /** 1 = graphite displacers. 0 removes the tip. */
  tipScale: number;
  pinXenon: boolean;
  pinFuel: boolean;
  pinVoid: boolean;
  xenonHold: number;
  iodineHold: number;
  fuelHold: number;
  voidHold: number;
  /** >0 replaces pump-derived flow. 1 = six pumps at nominal coast. */
  flowSet: number;
  /** Lab rods drive toward this insertion. 0 = out, 1 = in. */
  rodTarget: number;
  log: LogLine[];
  logSeq: number;
  fired: string[];
  nextEvent: number;
  eventIdx: number;
  pendingPump: number;
  pumpDeadline: number;
  hist: Sample[];
  histAcc: number;
};

export type Levels = {
  /** -1 withdraw, +1 insert, 0 hold. */
  rod: -1 | 0 | 1;
  timeScale: number;
};

export type Parts = {
  excess: number;
  rod: number;
  tip: number;
  void: number;
  xenon: number;
  doppler: number;
  total: number;
};

export type Derived = {
  parts: Parts;
  dollars: number;
  orm: number;
  flow: number;
  pumpsOn: number;
  mw: number;
  mwe: number;
  period: number | null;
  voidF: number;
  tf: number;
  xenon: number;
  alarms: Alarm[];
};

export type Alarm = {
  id: string;
  text: string;
  severe: boolean;
};
