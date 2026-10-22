import { dollars, ormOf, pushLog, reactivity } from "./physics.ts";
import type { State } from "./types.ts";

function once(s: State, id: string): boolean {
  if (s.fired.includes(id)) return false;
  s.fired.push(id);
  return true;
}

export function applyDirector(s: State): void {
  if (s.phase !== "run") return;
  if (s.scenario === "train") directTrain(s);
  else if (s.scenario === "test") directTest(s);
  else if (s.scenario === "grid") directGrid(s);

  if (s.pendingPump >= 0 && s.t >= s.pumpDeadline) {
    const i = s.pendingPump;
    s.pendingPump = -1;
    if (s.pumps[i]) {
      s.pumps[i] = false;
      s.sawPump = true;
      pushLog(s, "MCP", `Pump ${i + 1} tripped on bearing temperature. Flow is down.`, "alarm");
    }
  }
}

function directTrain(s: State): void {
  if (s.sawPower && once(s, "pwr")) {
    pushLog(s, "INSTRUCTOR", "Critical and producing. Trim the rods — or arm the regulator — and hold it.", "ok");
  }
  if (s.sawPump && once(s, "pmp")) {
    pushLog(
      s,
      "INSTRUCTOR",
      "Watch the void when flow moves. In this reactor, steam in the channels adds reactivity.",
      "info",
    );
  }
  const orm = ormOf(s.rod);
  if (orm < 15 && once(s, "orm")) {
    pushLog(
      s,
      "INSTRUCTOR",
      "That is below the fifteen-rod floor. A scram from here can insert the graphite tips before the boron. Drive rods in.",
      "alarm",
    );
  }
}

function directTest(s: State): void {
  const orm = ormOf(s.rod);
  if (s.realT > 8 && s.n < 0.16 && orm > 15 && !s.rundown && once(s, "sag")) {
    pushLog(
      s,
      "SIUR",
      "Power is sagging under xenon. Withdraw and you eat the margin. Raise power and the poison burns out.",
      "warn",
    );
  }
  if (s.realT > 6 && s.n > 0.3 && !s.rundown && once(s, "up")) {
    pushLog(s, "DYATLOV", "That is above the test card. He wants 700. The core does not have to agree.", "warn");
  }
  if (s.n < 0.12 && s.n > 0.03 && once(s, "well")) {
    pushLog(
      s,
      "DYATLOV",
      "You fell into the well. Raise power. Pull rods if you have to — the test is still on.",
      "alarm",
    );
  }
  if (orm < 15 && once(s, "orm")) {
    pushLog(
      s,
      "SKALA",
      "Operating reactivity margin below 15 rods. This alarm is slow in the real plant. Believe it anyway.",
      "alarm",
    );
  }
  if (orm < 8 && once(s, "orm8")) {
    pushLog(
      s,
      "SIUR",
      "Rods are nearly out. AZ-5 from this geometry displaces water with graphite in the lower core before the absorbers arrive.",
      "alarm",
    );
  }
  const pumps = s.pumps.filter(Boolean).length;
  if (pumps >= 8 && once(s, "p8")) {
    pushLog(
      s,
      "MCP",
      "All eight pumps are running. Extra flow is collapsing the void — power will sag unless rods come out to match.",
      "warn",
    );
  }
  if (!s.eccs && once(s, "eccs")) {
    pushLog(s, "ECCS", "Emergency cooling isolated, per the test program.", "warn");
  }
  if (!s.tripArmed && once(s, "blk")) {
    pushLog(
      s,
      "AZ",
      "Turbine-valve scram blocked. Closing the stops will not protect you.",
      "alarm",
    );
  }
  if (s.autoBlocked && once(s, "hold")) {
    pushLog(
      s,
      "AR",
      "Regulator will not withdraw past 15 rods. Below that is a manual decision.",
      "warn",
    );
  }
  if (!s.autoBlocked) {
    const i = s.fired.indexOf("hold");
    if (i >= 0 && orm > 18) s.fired.splice(i, 1);
  }
  if (s.rundown && s.rundownT > 8 && s.n > 0.35 && once(s, "rise")) {
    const d = dollars(reactivity(s, s.rod).total);
    if (d > 0.15) {
      pushLog(s, "SIUR", "Power is climbing on the rundown. Voids are growing as the pumps slow.", "alarm");
    }
  }
}

function directGrid(s: State): void {
  if (s.autoBlocked && once(s, "hold")) {
    pushLog(s, "AR", "Regulator is holding at the 15-rod floor. Raise the setpoint or wait for xenon to burn.", "warn");
  }
  if (!s.autoBlocked && ormOf(s.rod) > 18) {
    const i = s.fired.indexOf("hold");
    if (i >= 0) s.fired.splice(i, 1);
  }

  const gap = 26 * Math.max(1, s.scale);
  if (s.nextEvent <= 0) s.nextEvent = s.t + gap;
  if (s.t < s.nextEvent || s.rundown || s.scram) return;

  const kind = s.eventIdx % 3;
  s.eventIdx += 1;
  s.nextEvent = s.t + gap * (1.15 + (s.eventIdx % 3) * 0.25);

  if (kind === 0) {
    pushLog(
      s,
      "DISPATCH",
      "Night valley. Take the unit to about 70% and hold until we call.",
      "info",
    );
  } else if (kind === 1) {
    const idx = s.pumps.findIndex(Boolean);
    const i = idx >= 0 ? Math.min(7, idx + 2) : 3;
    s.pendingPump = i;
    s.pumpDeadline = s.t + 18 * Math.max(1, s.scale);
    pushLog(
      s,
      "MCP",
      `Pump ${i + 1} bearing temperature is climbing. Trip it before it trips itself.`,
      "warn",
    );
  } else {
    s.kick = Math.max(s.kick, 0.07);
    pushLog(
      s,
      "FEEDWATER",
      "Feedwater temperature just stepped up. Expect more boiling in the channels.",
      "warn",
    );
  }
}
