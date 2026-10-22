import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as Volume2, t as VolumeX } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-DuFUmHKm.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/** Delayed-neutron fraction, RBMK-1000 order. */
var BETA = .0054;
/** Prompt-neutron generation time, s. */
var LAMBDA_PROMPT = 5e-4;
/** One-group precursor decay, 1/s. */
var PRECURSOR = .08;
var LAMBDA_I = 293e-7;
var LAMBDA_X = 209e-7;
/** Neutron burnout of xenon at full power. Several times decay, as in a power reactor. */
var SIGMA_PHI = 84e-6;
/** Share of xenon production that comes through iodine. The rest is direct yield. */
var XE_VIA_I = .95;
var XE_PROD = 1049e-7;
/** Boron starts after the displacer has crossed the lower core. */
var BORON_START = .12;
/** Extra shutdown worth in the last of the stroke, Δk. */
var TEETH = .042;
var KNEE = .8;
/** Peak tip worth at bottom-peak = 1. */
var TIP_AMP = .0056;
var MIN_N = .0015;
var NOM_ROD = .24;
function clamp(v, a, b) {
	return Math.max(a, Math.min(b, v));
}
function pumpsOn(s) {
	let n = 0;
	for (const p of s.pumps) if (p) n += 1;
	return n;
}
function flowOf(s) {
	return pumpsOn(s) / 6 * s.coast;
}
/** Lab `flowSet` overrides the pump bank. Zero means use the pumps. */
function plantFlow(s) {
	return s.flowSet > 0 ? s.flowSet : flowOf(s);
}
function targetFuel(n, flow) {
	const r = Math.max(n, 0) / Math.max(flow, .22);
	return 265 + 345 * Math.pow(Math.max(r, 0), .72);
}
function targetVoid(n, flow, kick) {
	const ratio = Math.max(n, 0) / Math.max(flow, .16);
	return clamp(.02 + .13 * Math.pow(ratio, 1.35) + kick, 0, .96);
}
var T_REF = targetFuel(1, 1);
var VOID_REF = targetVoid(1, 1, 0);
function rodLinear(rod) {
	const x = clamp((rod - BORON_START) / .88, 0, 1);
	if (x <= KNEE) return -.0175 * x / KNEE;
	return -.0175 - TEETH * ((x - KNEE) / .19999999999999996);
}
/** Positive only while the lower water column is being displaced. */
function tipShape(rod) {
	if (rod <= 0 || rod >= .16) return 0;
	return Math.sin(Math.PI * (rod / .16));
}
/** >1 when the flux sits in the lower core — withdrawn rods, heavy xenon. */
function bottomPeak(rod, xenon) {
	const xe = clamp((xenon - .45) / .9, 0, 1.45);
	const out = clamp((.13 - rod) / .13, 0, 1);
	return clamp(.22 + 1.15 * out + 1.05 * out * xe + .2 * xe, .15, 2.6);
}
function voidCoeff(n) {
	return .008 + .042 * clamp((.42 - n) / .42, 0, 1);
}
var excessCache = NaN;
function excessReactivity() {
	if (Number.isFinite(excessCache)) return excessCache;
	excessCache = -(rodLinear(NOM_ROD) + -.03);
	return excessCache;
}
function reactivity(s, rod) {
	const bp = bottomPeak(rod, s.X);
	const rodLinearW = rodLinear(rod);
	const tip = TIP_AMP * s.tipScale * bp * tipShape(rod);
	const xenon = -.03 * s.X;
	const doppler = -64e-7 * s.dopplerScale * (s.tf - T_REF);
	const vr = voidCoeff(s.n) * s.voidScale * (s.voidF - VOID_REF);
	const excess = excessReactivity();
	return {
		excess,
		rod: rodLinearW,
		tip,
		void: vr,
		xenon,
		doppler,
		total: excess + rodLinearW + tip + vr + xenon + doppler
	};
}
function ormOf(rod) {
	return rod * 211;
}
function precursorEq(n) {
	return n * BETA / (LAMBDA_PROMPT * PRECURSOR);
}
function derive(s) {
	const parts = reactivity(s, s.rod);
	const flow = plantFlow(s);
	const dollars = parts.total / BETA;
	let period = null;
	if (s.n > MIN_N * 1.2) {
		const rho = parts.total;
		if (rho > .0054) period = LAMBDA_PROMPT / (rho - BETA);
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
		mwe: s.n * s.steam * 1e3,
		period,
		voidF: s.voidF,
		tf: s.tf,
		xenon: s.X,
		alarms
	};
}
function collectAlarms(s, parts, orm, period) {
	const list = [];
	if (s.exploded) {
		list.push({
			id: "boom",
			text: "CORE DISASSEMBLY",
			severe: true
		});
		return list;
	}
	if (orm < 8) list.push({
		id: "orm",
		text: "ORM BELOW 8 — GRAPHITE TIPS DOMINATE A SCRAM",
		severe: true
	});
	else if (orm < 15) list.push({
		id: "orm",
		text: "ORM BELOW 15-ROD MINIMUM",
		severe: true
	});
	if (period !== null && period > 0 && period < 20 && s.n > .04) list.push({
		id: "period",
		text: `REACTOR PERIOD ${period.toFixed(0)} s`,
		severe: period < 8
	});
	if (s.n > 1.08) list.push({
		id: "power",
		text: "POWER ABOVE 108%",
		severe: s.n > 1.18
	});
	if (s.voidF > .38) list.push({
		id: "void",
		text: "CHANNEL VOID HIGH — POSITIVE REACTIVITY",
		severe: s.voidF > .55
	});
	if (s.tf > 1050) list.push({
		id: "tf",
		text: "FUEL TEMPERATURE HIGH",
		severe: s.tf > 1400
	});
	if (s.lab) {
		if (plantFlow(s) < .45) list.push({
			id: "pumps",
			text: "COOLANT FLOW LOW",
			severe: plantFlow(s) < .3
		});
		if (!s.tripArmed) list.push({
			id: "trip",
			text: "AUTOMATIC TRIP OFF",
			severe: false
		});
	} else if (pumpsOn(s) <= 3) list.push({
		id: "pumps",
		text: "CIRCULATION LOW",
		severe: pumpsOn(s) <= 2
	});
	if (!s.lab && !s.eccs) list.push({
		id: "eccs",
		text: "ECCS ISOLATED",
		severe: false
	});
	if (!s.lab && !s.tripArmed) list.push({
		id: "trip",
		text: "TURBINE-TRIP SCRAM BLOCKED",
		severe: false
	});
	if (!s.lab && s.auto && s.autoBlocked) list.push({
		id: "ar",
		text: "AUTOMATIC REGULATOR HOLDING AT ORM 15",
		severe: true
	});
	if (!s.lab && s.rundown) list.push({
		id: "run",
		text: "TURBINE RUNDOWN — PUMPS ON INERTIA",
		severe: false
	});
	if (parts.tip > .0015) list.push({
		id: "tip",
		text: "GRAPHITE DISPLACERS ADDING REACTIVITY",
		severe: true
	});
	return list;
}
function pushLog(s, from, text, tone) {
	s.logSeq += 1;
	s.log.push({
		id: s.logSeq,
		t: s.t,
		from,
		text,
		tone
	});
	if (s.log.length > 40) s.log.splice(0, s.log.length - 40);
}
function blank(scenario) {
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
		pumps: [
			true,
			true,
			true,
			true,
			true,
			true,
			false,
			false
		],
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
		histAcc: 0
	};
}
function equilibrate(s, guess) {
	const flow = Math.max(plantFlow(s), .2);
	s.tf = targetFuel(s.n, flow);
	s.voidF = targetVoid(s.n, flow, s.kick);
	s.rod = solveRod(s, guess);
	balancePrecursors(s);
	s.minOrm = ormOf(s.rod);
	s.minRod = s.rod;
	s.peakN = s.n;
}
function balancePrecursors(s) {
	s.c = precursorEq(s.n);
}
function solveRod(s, guess) {
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
function createState(scenario) {
	const s = blank(scenario);
	if (scenario === "grid") {
		s.auto = true;
		s.setpoint = 1;
		s.nextEvent = 0;
		equilibrate(s, NOM_ROD);
		pushLog(s, "DISPATCH", "Unit 4 on the line at nominal. Hold the night. Call if ORM moves.", "info");
	} else if (scenario === "test") {
		s.n = .22;
		s.I = 1.65;
		s.X = 1.16;
		s.auto = false;
		s.setpoint = 700 / 3200;
		s.c = precursorEq(s.n);
		equilibrate(s, .12);
		pushLog(s, "DYATLOV", "Power is already at 700. Hold it for the rundown. Xenon is still climbing from the day's full-power run.", "warn");
		pushLog(s, "SKALA", "Fifteen rod-equivalents is the floor. The regulator will not cross it. If you cannot hold 700 without crossing it, raise power and burn xenon out — or abort.", "info");
	} else {
		s.n = .1;
		s.I = .78;
		s.X = .7;
		s.auto = false;
		s.setpoint = .35;
		s.tf = targetFuel(.1, 1);
		s.voidF = targetVoid(.1, 1, 0);
		s.rod = solveRod(s, .35);
		s.rod = clamp(s.rod + .05, 0, 1);
		s.n = .1;
		s.c = precursorEq(.1);
		s.minOrm = ormOf(s.rod);
		s.minRod = s.rod;
		s.peakN = s.n;
		pushLog(s, "INSTRUCTOR", "Low power, slightly subcritical. Withdraw until the period is near 20 seconds, then release. Level off around 1000 MW, disturb a pump, and scram while ORM is still healthy.", "info");
	}
	return s;
}
function finish(s, outcome) {
	if (s.phase === "over") return;
	s.phase = "over";
	s.outcome = outcome;
}
function commandScram(s, reason = "AZ-5 pressed at the desk.") {
	if (s.phase !== "run" || s.scram || s.exploded) return;
	s.scram = true;
	s.scramReason = reason;
	pushLog(s, "AZ-5", reason, "alarm");
}
function moveRods(s, lv, h) {
	if (s.jammed || s.exploded) return;
	if (s.scram) s.rod += h / 18;
	else if (s.lab) {
		const max = .034 * h;
		s.rod += clamp(s.rodTarget - s.rod, -max, max);
	} else if (lv.rod !== 0) s.rod += lv.rod * .034 * h;
	else if (s.auto) {
		const err = (s.n - s.setpoint) / Math.max(s.setpoint, .08);
		if (err < -.025) {
			if (ormOf(s.rod) <= 15.15) s.autoBlocked = true;
			else s.rod += clamp(err, -1, 1) * .034 * h;
		} else if (err > .025) s.rod += clamp(err, -1, 1) * .034 * h;
	}
	s.rod = clamp(s.rod, 0, 1);
}
function substep(s, lv, h, warp) {
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
	if (s.pinVoid) s.voidF = clamp(s.voidHold, 0, .96);
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
		const produced = .050000000000000044 * XE_PROD * s.n + XE_VIA_I * XE_PROD * s.I;
		s.X = Math.max(0, s.X + (produced - LAMBDA_X * s.X - SIGMA_PHI * s.n * s.X) * xh);
		s.X = Math.min(s.X, 4);
	}
	const parts = reactivity(s, s.rod);
	const nOld = s.n;
	const inv = (parts.total - BETA) / LAMBDA_PROMPT + PRECURSOR * s.c / Math.max(nOld, 1e-8);
	if (!Number.isFinite(inv)) {
		s.exploded = true;
		s.n = 200;
		return;
	}
	s.n = Math.max(MIN_N, nOld * Math.exp(clamp(inv, -70, 70) * h));
	const drive = BETA / LAMBDA_PROMPT * (.5 * (nOld + s.n));
	const decay = Math.exp(-.08 * h);
	s.c = s.c * decay + drive / PRECURSOR * (1 - decay);
	if (s.n > 32) s.overT += h;
	else s.overT = Math.max(0, s.overT - h);
	if (s.voidF > .84 && s.n > .45) s.fuelDamage += h * (.05 + s.n * .015);
	if (s.tf > 1700) s.fuelDamage += (s.tf - 1700) / 2800 * h;
	if (!s.eccs && pumpsOn(s) <= 2 && s.n > .3) s.fuelDamage += h * .02;
	if (s.n > 40) s.fuelDamage += (s.n - 40) * h * .05;
	if (s.n > 120 || s.overT > .85 || s.fuelDamage >= 1) {
		s.exploded = true;
		s.n = Math.min(s.n, 400);
		s.jammed = true;
	}
	if (s.fuelDamage > .7 || s.n > 50) s.jammed = true;
	const orm = ormOf(s.rod);
	if (orm < s.minOrm) s.minOrm = orm;
	if (s.rod < s.minRod) s.minRod = s.rod;
	if (s.n > s.peakN) s.peakN = s.n;
	if (parts.tip > s.peakTip) s.peakTip = parts.tip;
	if (parts.void > s.peakVoidRho) s.peakVoidRho = parts.void;
	if (orm < 15) s.ormLowT += xh;
	if (s.n > .32) s.sawPower = true;
	s.mwh += s.n * 3200 * xh / 3600;
	s.mwhE += s.n * s.steam * 1e3 * xh / 3600;
	if (s.scram) s.scramT += h;
	if (s.tripArmed && !s.scram && !s.exploded) {
		const dollarsNow = parts.total / BETA;
		if (dollarsNow > .58 || s.n > 1.16) s.tripAcc += h;
		else s.tripAcc = Math.max(0, s.tripAcc - h * .5);
		if (!s.lab && pumpsOn(s) <= 2 && s.n > .2) commandScram(s, "Low-circulation trip. Rods driving in.");
		else if (s.tripAcc > .32) commandScram(s, dollarsNow > .58 ? "Reactivity trip. Rods driving in." : "High-power trip. Rods driving in.");
	}
	s.t += xh;
}
function pickH(s, remaining) {
	const rho = reactivity(s, s.rod).total;
	const prompt = (rho - BETA) / LAMBDA_PROMPT;
	if (s.scram || s.rundown || rho > .00216 || s.n > 1.35 || Math.abs(prompt) > 6) {
		const h = .16 / (Math.abs(prompt) + 3);
		return Math.min(remaining, clamp(h, .001, .02));
	}
	return Math.min(remaining, .2);
}
function unstable(s, wall) {
	if (s.scram || s.rundown || s.exploded) return true;
	const rho = reactivity(s, s.rod).total;
	const hot = s.lab ? rho > .00189 || s.n > 1.12 : rho > .0054 * .28 || rho < -.012 || s.n > 1.12;
	if (hot) s.calm = 0;
	else s.calm += wall;
	return hot || s.calm < 1.4;
}
function step(s, lv, frameDt) {
	const wall = clamp(frameDt, 0, .05);
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
	if (s.histAcc >= .16) {
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
			orm: ormOf(s.rod)
		});
		if (s.hist.length > 160) s.hist.splice(0, s.hist.length - 160);
	}
	if (s.exploded) {
		s.jammed = true;
		pushLog(s, "UNIT 4", "Power excursion. The core is no longer intact.", "alarm");
		finish(s, "exploded");
		return;
	}
	if (!s.lab && s.scram && s.scramT > 8 && s.rod > .55 && s.n < .045 && s.fuelDamage < .5) {
		if (s.scenario === "train") finish(s, s.sawPower && s.sawPump && s.minOrm >= 15 ? "train_ok" : "train_partial");
		else if (s.scenario === "test") {
			if (!s.rundown) finish(s, "shutdown");
			else finish(s, s.minOrm < 15 || !s.eccs ? "test_dirty" : "test_clean");
		} else if (s.scramReason.startsWith("AZ-5 pressed")) finish(s, "shutdown");
		else finish(s, "tripped");
		return;
	}
	if (s.scenario === "test" && s.rundown && s.rundownT > 52 && s.n < 1.3 && s.fuelDamage < .35 && !s.scram) finish(s, s.minOrm < 14.8 || !s.eccs ? "test_dirty" : "test_clean");
}
function dollars(rho) {
	return rho / BETA;
}
function CoreCanvas({ plant, reduced }) {
	const ref = (0, import_react.useRef)(null);
	const bits = (0, import_react.useRef)([]);
	const sawBoom = (0, import_react.useRef)(false);
	(0, import_react.useEffect)(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const parent = canvas.parentElement;
		if (!parent) return;
		let raf = 0;
		const ro = new ResizeObserver(() => {
			const w = parent.clientWidth;
			const h = parent.clientHeight;
			const dpr = Math.min(2, window.devicePixelRatio || 1);
			canvas.width = Math.max(1, Math.floor(w * dpr));
			canvas.height = Math.max(1, Math.floor(h * dpr));
		});
		ro.observe(parent);
		const loop = (now) => {
			const ctx = canvas.getContext("2d");
			const s = plant.current;
			if (ctx && s && canvas.width > 2 && canvas.height > 2) {
				const dpr = canvas.width / Math.max(1, parent.clientWidth);
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
				draw(ctx, parent.clientWidth, parent.clientHeight, s, now, reduced, bits.current, sawBoom);
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	}, [plant, reduced]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
		ref,
		className: "core-canvas",
		"aria-hidden": "true"
	});
}
function cssColor(name, fallback) {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
function draw(ctx, w, h, s, now, reduced, bits, sawBoom) {
	const dim = cssColor("--color-dim", "#8e937f");
	const amber = cssColor("--color-amber", "#e6a322");
	const alarm = cssColor("--color-alarm", "#d94b3a");
	const line = cssColor("--color-line", "#3c4636");
	const bg = cssColor("--color-bg", "#10140f");
	ctx.clearRect(0, 0, w, h);
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, w, h);
	const d = derive(s);
	const bp = bottomPeak(s.rod, s.X);
	const heat = Math.min(1, Math.max(0, (s.tf - 280) / 1100));
	const boom = s.exploded ? 1 : 0;
	if (boom && !sawBoom.current) {
		sawBoom.current = true;
		bits.length = 0;
		if (!reduced) for (let i = 0; i < 48; i++) bits.push({
			x: w * .38,
			y: h * .45,
			vx: (Math.random() - .5) * 280,
			vy: (Math.random() - .8) * 240,
			s: 2 + Math.random() * 6,
			a: 1
		});
	}
	if (!boom) sawBoom.current = false;
	const pad = 10;
	const traceH = h < 260 ? 28 : h < 360 ? 40 : 52;
	const fluxW = w < 420 ? 28 : 46;
	const coreX = pad;
	const coreY = h < 260 ? 16 : 22;
	const coreW = Math.max(40, w - fluxW - 30);
	const coreH = Math.max(40, h - coreY - traceH - 16);
	ctx.font = "600 12px 'Barlow Condensed', 'Arial Narrow', sans-serif";
	ctx.fillStyle = dim;
	ctx.fillText("CORE SECTION  ·  RBMK-1000", pad, 16);
	ctx.fillStyle = dim;
	ctx.textAlign = "right";
	ctx.fillText(bp > 1.4 ? "FLUX BOTTOM-PEAKED" : "FLUX", w - pad, 16);
	ctx.textAlign = "left";
	roundRect(ctx, coreX, coreY, coreW, coreH, 6);
	ctx.fillStyle = "#141910";
	ctx.fill();
	ctx.strokeStyle = line;
	ctx.stroke();
	const inset = 10;
	const gx = 20;
	const gy = coreY + inset + 8;
	const gw = coreW - 20;
	const gh = coreH - 20 - 12;
	const cols = 14;
	const rows = 10;
	for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
		const x = gx + c * gw / cols;
		const y = gy + r * gh / rows;
		const hot = heat * (.45 + .55 * (r / rows));
		ctx.fillStyle = boom ? `rgba(180, 50, 32, ${.35 + .4 * (r * c % 3) / 3})` : `rgba(${70 + hot * 140}, ${64 + hot * 20}, 42, 0.9)`;
		ctx.fillRect(x + 1, y + 1, gw / cols - 2, gh / rows - 2);
	}
	const nCh = 9;
	for (let i = 0; i < nCh; i++) {
		const cx = gx + (i + .5) * gw / nCh;
		const rod = i % 3 === 1;
		const tubeW = Math.max(4, gw / nCh * .28);
		ctx.fillStyle = "rgba(8, 10, 8, 0.72)";
		ctx.fillRect(cx - tubeW / 2, gy, tubeW, gh);
		if (!rod) {
			const bubbles = Math.round(2 + s.voidF * 7);
			for (let b = 0; b < bubbles; b++) {
				const speed = reduced ? 0 : 36 + i % 4 * 10;
				const phase = (now / 1e3 * speed + b * 37 + i * 18) % gh;
				const y = gy + gh - phase;
				ctx.beginPath();
				ctx.fillStyle = `rgba(231, 226, 212, ${.15 + s.voidF * .45})`;
				ctx.arc(cx, y, Math.max(1.2, tubeW * .22), 0, Math.PI * 2);
				ctx.fill();
			}
		} else {
			const absH = gh * .62;
			const dispH = gh * .34;
			const absBottom = gy + s.rod * gh * .92;
			const absTop = absBottom - absH;
			ctx.fillStyle = boom ? alarm : "#1a1c18";
			ctx.fillRect(cx - tubeW * .7, Math.max(gy - 16, absTop), tubeW * 1.4, Math.max(0, absBottom - Math.max(gy - 16, absTop)));
			const dispTop = absBottom + gh * .04;
			ctx.fillStyle = "#6d6452";
			const visTop = Math.max(gy, dispTop);
			const visBot = Math.min(gy + gh, dispTop + dispH);
			if (visBot > visTop) ctx.fillRect(cx - tubeW * .55, visTop, tubeW * 1.1, visBot - visTop);
			if (s.rod < .12) {
				ctx.fillStyle = "rgba(231, 226, 212, 0.28)";
				ctx.fillRect(cx - tubeW / 2 + 1, gy + gh * .78, tubeW - 2, gh * .22);
			}
			ctx.fillStyle = dim;
			ctx.fillRect(cx - 3, coreY + 2, 6, 8);
		}
	}
	if (s.rod < .12 && !boom) {
		ctx.fillStyle = alarm;
		ctx.font = "600 11px 'Barlow Condensed', sans-serif";
		ctx.fillText("WATER COLUMN UNDER TIPS", gx, gy + gh + 11);
	}
	const fx = coreX + coreW + 8;
	const samples = 28;
	let maxF = .001;
	const fluxes = [];
	for (let i = 0; i < samples; i++) {
		const y = i / 27;
		const mid = Math.sin(Math.PI * (1 - y) * .92 + .12);
		const bot = Math.exp(-((y - .8) ** 2) / .018);
		const f = Math.max(0, mid * (1 - Math.min(bp, 2) * .08) + bot * bp * .7);
		fluxes.push(f);
		if (f > maxF) maxF = f;
	}
	for (let i = 0; i < samples; i++) {
		const y = gy + i * gh / samples;
		const mag = fluxes[i] / maxF;
		ctx.fillStyle = boom ? alarm : amber;
		ctx.globalAlpha = .25 + mag * .75;
		ctx.fillRect(fx, y, Math.max(2, (fluxW - 10) * mag), gh / samples - 1);
	}
	ctx.globalAlpha = 1;
	const tx = pad;
	const ty = h - traceH;
	ctx.fillStyle = dim;
	ctx.font = "600 11px 'Barlow Condensed', sans-serif";
	ctx.fillText("THERMAL POWER", tx, ty + 12);
	const hist = s.hist;
	if (hist.length > 1) {
		const x0 = tx;
		const y0 = ty + 18;
		const tw = w - 20;
		const th = traceH - 24;
		ctx.strokeStyle = line;
		ctx.strokeRect(x0, y0, tw, th);
		ctx.beginPath();
		const cap = Math.max(1.2, ...hist.map((p) => p.n));
		hist.forEach((p, i) => {
			const x = x0 + i / (hist.length - 1) * tw;
			const y = y0 + th - Math.min(p.n, cap) / cap * th;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
		ctx.strokeStyle = d.dollars > .4 ? alarm : amber;
		ctx.lineWidth = 1.5;
		ctx.stroke();
		ctx.lineWidth = 1;
	}
	if (boom) {
		ctx.fillStyle = `rgba(255, 244, 230, ${.55 * (reduced ? 1 : Math.min(1, bits.reduce((m, b) => Math.max(m, b.a), 0)))})`;
		ctx.fillRect(0, 0, w, h);
		for (const b of bits) {
			b.x += b.vx * 16 / 1e3;
			b.y += b.vy * 16 / 1e3;
			b.vy += 40 / 60;
			b.a *= .985;
			ctx.globalAlpha = Math.max(0, b.a);
			ctx.fillStyle = alarm;
			ctx.fillRect(b.x, b.y, b.s, b.s * .6);
		}
		ctx.globalAlpha = 1;
	}
}
function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}
var DeskSound = class {
	ctx = null;
	master = null;
	humGain = null;
	alarmGain = null;
	noise = null;
	boomed = false;
	muted = false;
	unlock() {
		const Ctx = window.AudioContext || window.webkitAudioContext;
		if (!Ctx) return;
		if (!this.ctx) {
			const ctx = new Ctx();
			this.ctx = ctx;
			const master = ctx.createGain();
			master.gain.value = .85;
			master.connect(ctx.destination);
			this.master = master;
			const humGain = ctx.createGain();
			humGain.gain.value = 0;
			humGain.connect(master);
			this.humGain = humGain;
			const low = ctx.createOscillator();
			low.type = "sine";
			low.frequency.value = 48;
			low.connect(humGain);
			const mid = ctx.createOscillator();
			mid.type = "triangle";
			mid.frequency.value = 96;
			const midGain = ctx.createGain();
			midGain.gain.value = .22;
			mid.connect(midGain);
			midGain.connect(humGain);
			low.start();
			mid.start();
			const alarm = ctx.createOscillator();
			alarm.type = "square";
			alarm.frequency.value = 620;
			const alarmGain = ctx.createGain();
			alarmGain.gain.value = 0;
			alarm.connect(alarmGain);
			alarmGain.connect(master);
			alarm.start();
			this.alarmGain = alarmGain;
			const samples = ctx.sampleRate;
			const buffer = ctx.createBuffer(1, samples, samples);
			const data = buffer.getChannelData(0);
			for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
			this.noise = buffer;
		}
		if (this.ctx.state === "suspended") this.ctx.resume();
	}
	setMuted(muted) {
		this.muted = muted;
		if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : .85, this.ctx.currentTime, .03);
	}
	update(s, severe) {
		if (!this.ctx || !this.humGain || !this.alarmGain) return;
		const now = this.ctx.currentTime;
		const pumps = s.pumps.filter(Boolean).length;
		const hum = this.muted ? 0 : Math.min(.16, .02 + pumps * .01 + s.n * s.steam * .05);
		this.humGain.gain.setTargetAtTime(hum, now, .08);
		const pulse = severe && !this.muted ? Math.abs(Math.sin(s.realT * 7)) * .035 : 0;
		this.alarmGain.gain.setTargetAtTime(pulse, now, .02);
		if (!this.muted && s.n > .02) {
			const rate = Math.min(40, s.n * 14);
			if (Math.random() < rate / 60) this.blip(900 + Math.random() * 800, .012, .02);
		}
		if (s.exploded && !this.boomed) {
			this.boomed = true;
			this.boom();
		}
		if (!s.exploded) this.boomed = false;
	}
	click() {
		this.blip(160 + Math.random() * 50, .045, .04);
	}
	blip(freq, dur, gain) {
		if (!this.ctx || !this.master || this.muted) return;
		const ctx = this.ctx;
		const osc = ctx.createOscillator();
		const amp = ctx.createGain();
		osc.type = "square";
		osc.frequency.value = freq;
		amp.gain.setValueAtTime(gain, ctx.currentTime);
		amp.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + dur);
		osc.connect(amp);
		amp.connect(this.master);
		osc.start();
		osc.stop(ctx.currentTime + dur + .02);
	}
	boom() {
		if (!this.ctx || !this.master || !this.noise || this.muted) return;
		const ctx = this.ctx;
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 400;
		const amp = ctx.createGain();
		amp.gain.setValueAtTime(.5, ctx.currentTime);
		amp.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + 1.4);
		src.connect(filter);
		filter.connect(amp);
		amp.connect(this.master);
		src.start();
		const osc = ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.setValueAtTime(90, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(28, ctx.currentTime + 1);
		const og = ctx.createGain();
		og.gain.setValueAtTime(.4, ctx.currentTime);
		og.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + 1.2);
		osc.connect(og);
		og.connect(this.master);
		osc.start();
		osc.stop(ctx.currentTime + 1.3);
	}
};
var LESSONS = [
	{
		id: "raise",
		step: "1",
		title: "Rods and the period",
		body: "Power follows the neutron balance. Reactivity in dollars is the surplus divided by β, the delayed-neutron fraction (about 0.0054). Under 1$ the rise is paced by delayed neutrons and takes seconds. Past 1$ the chain runs on prompt neutrons.",
		task: "Move insertion down — rods out — until the period is positive and power passes about 800 MW. Let go before the period collapses toward a second. With the trip armed, the rods will drive themselves in if you don’t."
	},
	{
		id: "void",
		step: "2",
		title: "Boiling and Doppler",
		body: "This core is over-moderated. Graphite already slows the neutrons, and water in the channels absorbs more than it moderates, so steam adds reactivity. That void coefficient is stronger at low power. Hot fuel does the opposite: Doppler broadening of uranium-238 resonances removes neutrons.",
		task: "Lower coolant flow and watch the void term go positive while fuel temperature pulls back. Then set the void coefficient below zero and boil again. A water-moderated reactor has that sign, and steam would then shut the power down."
	},
	{
		id: "xenon",
		step: "3",
		title: "The iodine well",
		body: "Iodine-135 builds at power and decays, with a 6.6-hour half-life, into xenon-135. Xenon absorbs neutrons strongly, then burns out or decays (9.2 hours). After a power cut, iodine keeps feeding xenon while burnup falls, so absorption rises for hours. Withdrawing rods to hold power spends the operating reactivity margin.",
		task: "Insert rods until power is under about 400 MW. The poison clock on this lesson starts at 20 min/s. Xenon should rise as iodine keeps decaying and the neutrons that were burning it are gone. The clock drops to real time if the core runs away."
	},
	{
		id: "safe",
		step: "4",
		title: "AZ-5 from a stocked core",
		body: "Each rod is a graphite displacer with boron above it. From a partly inserted bank the boron is already near the fuel. Driving the rest in adds absorber. The tip bump stays small because the flux is not piled at the bottom of the core.",
		task: "Press AZ-5. Power should fall. The automatic trip is the same rod motion, started by the instruments instead of the button."
	},
	{
		id: "well",
		step: "5",
		title: "AZ-5 from the xenon well",
		body: "With the bank nearly out, the bottom of the core is water. The graphite tip enters first and moderates better than the water it displaces, so the first seconds of a scram add reactivity. Xenon has pushed the flux downward, which makes that tip worth more. Extra power boils water, and the positive void coefficient adds still more before the boron arrives. One energy group cannot draw the real core — it shows the sign and the race.",
		task: "Press AZ-5 and watch the tip term, then the void term. Disarming the trip does not change that motion. The rods are the excursion. This is the geometry at the start of 26 April 1986."
	}
];
var FREE_LESSON = {
	id: "free",
	step: "—",
	title: "Free bench",
	body: "Nothing here is scored. Holds freeze one variable so its coefficient is the only thing moving. The multipliers are the design of the core: 1 is this RBMK, 0 removes the effect, and a negative void coefficient is the pressurized-water sign.",
	task: "Try the well again with the graphite tip at 0, then at 1. Or pin the void and sweep only the coefficient."
};
function fresh() {
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
function syncHolds(s) {
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
function armRaise(s) {
	s.n = .1;
	s.I = .72;
	s.X = .62;
	s.tf = targetFuel(.1, 1);
	s.voidF = targetVoid(.1, 1, 0);
	s.rod = clamp(solveRod(s, .45) + .02, 0, 1);
	balancePrecursors(s);
}
function armPower(s, n, iodine, xenon, guess) {
	s.n = n;
	s.I = iodine;
	s.X = xenon;
	equilibrate(s, guess);
}
/**
* Low power, xenon deep, rods nearly out — inserting a little adds reactivity.
* Same search the unit test uses.
*/
function armWell(s) {
	s.n = .08;
	s.flowSet = 1;
	s.kick = 0;
	let found = false;
	for (let xi = 0; xi <= 50 && !found; xi++) {
		s.X = .85 + xi * .02;
		s.I = Math.max(s.X, 1);
		equilibrate(s, .025);
		const orm = s.rod * 211;
		const here = reactivity(s, s.rod).total / BETA;
		const deeper = reactivity(s, Math.min(.14, s.rod + .045)).total / BETA;
		if (orm < 14 && Math.abs(here) < .2 && deeper > here + .7) found = true;
	}
	s.I = Math.max(s.X, 1.2);
	equilibrate(s, .04);
	return found;
}
function createLab(id) {
	const s = fresh();
	if (id === "raise") armRaise(s);
	else if (id === "void") armPower(s, .5, .7, .72, .32);
	else if (id === "xenon") armPower(s, 1, 1, 1, .24);
	else if (id === "safe") armPower(s, .62, 1, 1, .4);
	else if (id === "well") armWell(s);
	else armPower(s, 1, 1, 1, .24);
	syncHolds(s);
	return s;
}
function lessonStatus(id, s, origin) {
	if (id === "free") return "pending";
	const dollars = derive(s).parts.void / BETA;
	if (id === "raise") {
		if (s.exploded) return "lost";
		if (s.n > .25) return "met";
	}
	if (id === "void") {
		if (dollars > .25) return "met";
		if (s.voidScale < 0 && s.voidF > .2 && dollars < -.05) return "met";
	}
	if (id === "xenon") {
		if (s.X > origin.x + .15) return "met";
	}
	if (id === "safe") {
		if (s.exploded) return "lost";
		if (s.scram && s.n < .06 && s.peakTip < .0025) return "met";
	}
	if (id === "well") {
		if (s.scram || s.exploded) {
			if (s.exploded || s.peakN > origin.n * 2 || s.peakTip > .002) return "met";
		}
	}
	return "pending";
}
var WARPS = [
	{
		id: 1,
		label: "1×"
	},
	{
		id: 60,
		label: "1 min/s"
	},
	{
		id: 300,
		label: "5 min/s"
	},
	{
		id: 1200,
		label: "20 min/s"
	}
];
function controlsFrom(s, timeScale = 1) {
	return {
		rodTarget: s.rodTarget,
		flow: s.flowSet > 0 ? s.flowSet : 1,
		pinVoid: s.pinVoid,
		voidHold: s.pinVoid ? s.voidHold : s.voidF,
		pinFuel: s.pinFuel,
		fuelHold: s.pinFuel ? s.fuelHold : s.tf,
		pinXenon: s.pinXenon,
		xenonHold: s.pinXenon ? s.xenonHold : s.X,
		iodineHold: s.pinXenon ? s.iodineHold : s.I,
		voidScale: s.voidScale,
		dopplerScale: s.dopplerScale,
		tipScale: s.tipScale,
		trip: s.tripArmed,
		timeScale
	};
}
function applyControls(s, c) {
	s.rodTarget = c.rodTarget;
	s.flowSet = c.flow;
	s.pinVoid = c.pinVoid;
	s.voidHold = c.voidHold;
	s.pinFuel = c.pinFuel;
	s.fuelHold = c.fuelHold;
	s.pinXenon = c.pinXenon;
	s.xenonHold = c.xenonHold;
	s.iodineHold = c.iodineHold;
	s.voidScale = c.voidScale;
	s.dopplerScale = c.dopplerScale;
	s.tipScale = c.tipScale;
	s.tripArmed = c.trip;
}
function signed(value) {
	const abs = Math.abs(value);
	const text = abs >= 10 ? abs.toFixed(1) : abs.toFixed(2);
	if (value > 5e-4) return `+${text}$`;
	if (value < -5e-4) return `−${text}$`;
	return "0.00$";
}
function periodText(period) {
	if (period === null || !Number.isFinite(period)) return "steady";
	const mag = Math.abs(period);
	if (mag > 400) return "steady";
	const secs = mag >= 10 ? mag.toFixed(0) : mag.toFixed(1);
	return period > 0 ? `rising ${secs} s` : `falling ${secs} s`;
}
function lessonOf(id) {
	return LESSONS.find((lesson) => lesson.id === id) ?? FREE_LESSON;
}
function Lab() {
	const sim = (0, import_react.useRef)(null);
	if (sim.current === null) sim.current = createLab("raise");
	const levels = (0, import_react.useRef)({
		rod: 0,
		timeScale: 1
	});
	const origin = (0, import_react.useRef)({
		x: sim.current.X,
		n: sim.current.n
	});
	const audio = (0, import_react.useRef)(null);
	const [controls, setControls] = (0, import_react.useState)(() => controlsFrom(sim.current));
	const [lesson, setLesson] = (0, import_react.useState)("raise");
	const [seen, setSeen] = (0, import_react.useState)([]);
	const [frame, setFrame] = (0, import_react.useState)(0);
	const [muted, setMuted] = (0, import_react.useState)(false);
	const [reduced, setReduced] = (0, import_react.useState)(false);
	const plant = sim.current;
	const view = derive(plant);
	const status = lessonStatus(lesson, plant, origin.current);
	const copy = lessonOf(lesson);
	(0, import_react.useEffect)(() => {
		if (status !== "met") return;
		setSeen((prev) => prev.includes(lesson) ? prev : [...prev, lesson]);
	}, [status, lesson]);
	(0, import_react.useEffect)(() => {
		audio.current = new DeskSound();
		if (window.localStorage.getItem("block4-lab-mute") === "1") {
			setMuted(true);
			audio.current.setMuted(true);
		}
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReduced(mq.matches);
		const onMq = () => setReduced(mq.matches);
		mq.addEventListener("change", onMq);
		const unlock = () => audio.current?.unlock();
		window.addEventListener("pointerdown", unlock);
		const onVis = () => {
			if (document.visibilityState === "visible") audio.current?.unlock();
		};
		document.addEventListener("visibilitychange", onVis);
		window.__block4 = {
			ready: true,
			power: () => sim.current?.n ?? 0,
			orm: () => sim.current ? sim.current.rod * 211 : 0,
			exploded: () => Boolean(sim.current?.exploded),
			screen: () => "lab",
			lesson: () => lesson
		};
		return () => {
			mq.removeEventListener("change", onMq);
			window.removeEventListener("pointerdown", unlock);
			document.removeEventListener("visibilitychange", onVis);
		};
	}, [lesson]);
	(0, import_react.useEffect)(() => {
		let raf = 0;
		let last = performance.now();
		let acc = 0;
		const tick = (now) => {
			const wall = Math.min(.05, (now - last) / 1e3);
			last = now;
			const s = sim.current;
			if (s && !document.hidden && s.phase === "run") {
				step(s, levels.current, wall);
				const severe = derive(s).alarms.some((alarm) => alarm.severe);
				audio.current?.update(s, severe);
			}
			acc += wall;
			if (acc > .1) {
				acc = 0;
				setFrame((n) => (n + 1) % 1e5);
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		const onKey = (e) => {
			const tag = e.target?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
			if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
			e.preventDefault();
			const s = sim.current;
			if (!s || s.scram || s.exploded) return;
			const next = Math.max(0, Math.min(1, s.rodTarget + (e.key === "ArrowDown" ? .02 : -.02)));
			s.rodTarget = next;
			setControls((c) => ({
				...c,
				rodTarget: next
			}));
		};
		window.addEventListener("keydown", onKey);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("keydown", onKey);
		};
	}, []);
	function commit(partial) {
		const s = sim.current;
		if (!s) return;
		let next = partial;
		if (partial.pinVoid === true) next = {
			...next,
			voidHold: s.voidF
		};
		if (partial.pinFuel === true) next = {
			...next,
			fuelHold: s.tf
		};
		if (partial.pinXenon === true) next = {
			...next,
			xenonHold: s.X,
			iodineHold: s.I
		};
		if (next.timeScale !== void 0) levels.current.timeScale = next.timeScale;
		setControls((c) => {
			const merged = {
				...c,
				...next
			};
			applyControls(s, merged);
			return merged;
		});
	}
	function mount(id, warp) {
		const s = createLab(id);
		sim.current = s;
		origin.current = {
			x: s.X,
			n: s.n
		};
		levels.current = {
			rod: 0,
			timeScale: warp
		};
		setLesson(id);
		setControls(controlsFrom(s, warp));
	}
	function restore() {
		const prev = sim.current;
		const s = createLab("free");
		if (prev) {
			s.voidScale = prev.voidScale;
			s.dopplerScale = prev.dopplerScale;
			s.tipScale = prev.tipScale;
		}
		sim.current = s;
		origin.current = {
			x: s.X,
			n: s.n
		};
		levels.current.timeScale = 1;
		setControls(controlsFrom(s, 1));
	}
	function toggleMute() {
		const next = !muted;
		setMuted(next);
		audio.current?.unlock();
		audio.current?.setMuted(next);
		window.localStorage.setItem("block4-lab-mute", next ? "1" : "0");
	}
	const rodLocked = plant.scram || plant.exploded;
	const voidShown = controls.pinVoid ? controls.voidHold : plant.voidF;
	const fuelShown = controls.pinFuel ? controls.fuelHold : plant.tf;
	const xenonShown = controls.pinXenon ? controls.xenonHold : plant.X;
	const iodineShown = controls.pinXenon ? controls.iodineHold : plant.I;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "lab",
		"data-frame": frame,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "lab-head",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "kicker",
					children: "RBMK-1000 · one energy group"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "Reactor lab" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "top-actions",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "icon-btn",
						onClick: toggleMute,
						"aria-label": muted ? "Unmute" : "Mute",
						children: muted ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VolumeX, { size: 18 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, { size: 18 })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "text-btn",
						"data-testid": "nominal",
						onClick: () => mount("free", 1),
						children: "Nominal core"
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
				className: "chips",
				"aria-label": "Lessons",
				children: [LESSONS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					"data-testid": `experiment-${item.id}`,
					className: chipClass(lesson === item.id, seen.includes(item.id)),
					onClick: () => mount(item.id, item.id === "xenon" ? 1200 : 1),
					children: [
						item.step,
						" ",
						item.title
					]
				}, item.id)), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					"data-testid": "experiment-free",
					className: chipClass(lesson === "free", false),
					onClick: () => setLesson("free"),
					children: "Free bench"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "lab-grid",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
						className: "panel lesson",
						"data-testid": "lesson",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "kicker",
								children: lesson === "free" ? "No script" : `Lesson ${copy.step}`
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: copy.title }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: copy.body }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "task",
								children: copy.task
							}),
							lesson !== "free" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: status === "met" ? "status met" : "status",
								"data-testid": "status",
								children: status === "met" ? "Seen. Stay here, open the next lesson, or switch to the free bench — it keeps this core." : status === "lost" ? "The chain went prompt and the model stopped. Reload the lesson, or restore a critical core with the same coefficients." : "Not yet."
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "status",
								children: "The free bench does not reload the core. Nominal core does."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "debrief-actions",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "text-btn",
									"data-testid": "reload",
									onClick: () => mount(lesson, lesson === "xenon" ? 1200 : 1),
									children: "Reload lesson"
								}), plant.exploded ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "text-btn",
									"data-testid": "restore",
									onClick: restore,
									children: "Critical core"
								}) : null]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "lab-core",
						children: [
							plant.exploded ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "banner",
								role: "status",
								children: "Power ran away. Prompt neutrons, then void. The equations stop when the core is no longer a core."
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "lab-stage",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CoreCanvas, {
									plant: sim,
									reduced
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "lab-readouts",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Readout, {
										label: "Power",
										testId: "power",
										value: `${Math.round(plant.n * 3200).toLocaleString("en-US")} MW`,
										alarm: plant.n > 1.08
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Readout, {
										label: "Period",
										testId: "period",
										value: periodText(view.period),
										alarm: view.period !== null && view.period > 0 && view.period < 10
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Readout, {
										label: "Reactivity",
										testId: "reactivity",
										value: signed(view.dollars),
										alarm: view.dollars > .5,
										ok: view.dollars < -.05
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Readout, {
										label: "ORM",
										testId: "orm",
										value: view.orm.toFixed(0),
										alarm: view.orm < 15
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "note",
								children: "ORM is rod insertion times 211. Fifteen was the operating floor. Under about 8, a scram starts in the high-flux bottom, where the graphite tips add reactivity."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "terms",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Term, {
										label: "Excess",
										value: view.parts.excess,
										hint: "Fixed so a nominal full-power core, with equilibrium xenon, is critical near 24% insertion."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Term, {
										label: "Rods",
										value: view.parts.rod,
										hint: rodHint(plant, view.parts)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Term, {
										label: "Graphite tip",
										value: view.parts.tip,
										hint: tipHint(plant, view.parts)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Term, {
										label: "Void",
										value: view.parts.void,
										hint: voidHint(plant, view.parts)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Term, {
										label: "Xenon",
										value: view.parts.xenon,
										hint: xenonHint(plant, view.parts)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Term, {
										label: "Doppler",
										value: view.parts.doppler,
										hint: dopplerHint(plant, view.parts)
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(History, { plant: sim }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "fine",
								children: [
									"Poison clock ",
									hours(plant.t),
									plant.held && controls.timeScale > 1 ? " · held at real time while the core is unstable" : "",
									". Rods, boiling, and neutrons stay in real time. Xenon and iodine use the clock."
								]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "lab-side",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "panel controls",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Rods" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
										id: "rod-slider",
										label: "Insertion",
										display: `${Math.round(controls.rodTarget * 100)}% target · ${Math.round(plant.rod * 100)}% in the core`,
										min: 0,
										max: 1,
										step: .005,
										value: controls.rodTarget,
										disabled: rodLocked,
										onChange: (rodTarget) => commit({ rodTarget })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "note",
										children: "Out (0%) adds reactivity. In (100%) adds boron. Arrow up withdraws, arrow down inserts, unless a slider is focused."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "switch-row",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											className: "text-btn danger",
											"data-testid": "az5",
											disabled: plant.exploded || plant.scram,
											onClick: () => {
												audio.current?.unlock();
												const s = sim.current;
												if (!s || s.exploded || s.phase !== "run") return;
												commandScram(s, "AZ-5. Rods driving in.");
											},
											children: "AZ-5"
										}), plant.scram && !plant.exploded ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											className: "text-btn",
											"data-testid": "release-az5",
											onClick: () => {
												const s = sim.current;
												if (!s) return;
												s.scram = false;
												s.scramT = 0;
											},
											children: "Release rods"
										}) : null]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "checkline",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											type: "checkbox",
											"data-testid": "trip",
											checked: controls.trip,
											onChange: (e) => commit({ trip: e.target.checked })
										}), "Automatic trip armed"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "note",
										children: "The trip is AZ-5 by instrument: about +0.6$ or 116% power, held for a third of a second. It does not change how the rods enter."
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "panel controls",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Coolant" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
										id: "flow-slider",
										label: "Flow",
										display: `${controls.flow.toFixed(2)}× nominal`,
										min: .2,
										max: 1.5,
										step: .01,
										value: controls.flow,
										disabled: plant.exploded,
										onChange: (flow) => commit({ flow })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "checkline",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											type: "checkbox",
											"data-testid": "pin-void",
											checked: controls.pinVoid,
											onChange: (e) => commit({ pinVoid: e.target.checked })
										}), "Hold void fraction"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
										id: "void-slider",
										label: "Void",
										display: `${Math.round(voidShown * 100)}% steam`,
										min: 0,
										max: .95,
										step: .01,
										value: voidShown,
										disabled: !controls.pinVoid || plant.exploded,
										onChange: (voidHold) => commit({ voidHold })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "note",
										children: controls.pinVoid ? "Void is frozen, so flow only changes fuel temperature." : "Void follows power and flow. Less flow, or more power, boils the channels."
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "panel controls",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Fuel" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "checkline",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											type: "checkbox",
											"data-testid": "pin-fuel",
											checked: controls.pinFuel,
											onChange: (e) => commit({ pinFuel: e.target.checked })
										}), "Hold fuel temperature"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
										id: "fuel-slider",
										label: "Temperature",
										display: `${Math.round(fuelShown)}°C`,
										min: 250,
										max: 1600,
										step: 5,
										value: fuelShown,
										disabled: !controls.pinFuel || plant.exploded,
										onChange: (fuelHold) => commit({ fuelHold })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "note",
										children: [
											"Reference is ",
											Math.round(T_REF),
											"°C at full power and nominal flow. Hotter than that, Doppler is negative."
										]
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "panel controls",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Xenon and iodine" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "scale-row",
										role: "group",
										"aria-label": "Poison clock",
										children: WARPS.map((warp) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											"data-testid": `warp-${warp.id}`,
											className: controls.timeScale === warp.id ? "scale-btn on" : "scale-btn",
											onClick: () => commit({ timeScale: warp.id }),
											children: warp.label
										}, warp.id))
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "checkline",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											type: "checkbox",
											"data-testid": "pin-xenon",
											checked: controls.pinXenon,
											onChange: (e) => commit({ pinXenon: e.target.checked })
										}), "Hold xenon and iodine"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
										id: "xenon-slider",
										label: "Xenon",
										display: `${xenonShown.toFixed(2)} × full-power equilibrium`,
										min: 0,
										max: 3.5,
										step: .01,
										value: xenonShown,
										disabled: !controls.pinXenon || plant.exploded,
										onChange: (xenonHold) => commit({ xenonHold })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
										id: "iodine-slider",
										label: "Iodine",
										display: iodineShown.toFixed(2),
										min: 0,
										max: 3.5,
										step: .01,
										value: iodineShown,
										disabled: !controls.pinXenon || plant.exploded,
										onChange: (iodineHold) => commit({ iodineHold })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "note",
										children: controls.pinXenon ? "Both poisons are fixed. The clock still runs, but they do not follow it." : "Iodine tracks power. Xenon is fed by iodine and burned by neutrons."
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "panel controls",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Coefficients" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
										id: "void-scale",
										label: "Void coefficient",
										display: scaleLabel(controls.voidScale, "RBMK"),
										min: -1.5,
										max: 2,
										step: .05,
										value: controls.voidScale,
										disabled: plant.exploded,
										onChange: (voidScale) => commit({ voidScale })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
										id: "doppler-scale",
										label: "Doppler",
										display: scaleLabel(controls.dopplerScale, "nominal"),
										min: 0,
										max: 2,
										step: .05,
										value: controls.dopplerScale,
										disabled: plant.exploded,
										onChange: (dopplerScale) => commit({ dopplerScale })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
										id: "tip-scale",
										label: "Graphite tips",
										display: scaleLabel(controls.tipScale, "fitted"),
										min: 0,
										max: 2,
										step: .05,
										value: controls.tipScale,
										disabled: plant.exploded,
										onChange: (tipScale) => commit({ tipScale })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "note",
										children: "1 is this RBMK. 0 removes the effect. A negative void coefficient is the sign of a water-moderated core: boiling then reduces reactivity."
									})
								]
							})
						]
					})
				]
			})
		]
	});
}
function chipClass(on, seen) {
	if (on) return "chip on";
	if (seen) return "chip seen";
	return "chip";
}
function hours(seconds) {
	return `${(seconds / 3600).toFixed(2)} h`;
}
function scaleLabel(value, nominal) {
	if (Math.abs(value) < .001) return "0 — off";
	if (Math.abs(value - 1) < .001) return `1.00× ${nominal}`;
	return `${value.toFixed(2)}×`;
}
function rodHint(s, parts) {
	if (s.rod < .12) return "Boron has not reached the fuel yet. Worth here is only the graphite tip.";
	if (s.rod < .85) return `Boron is in the core, worth ${signed(dollars(parts.rod))}. The first part of the bank is the gentle regulating range.`;
	return "The last of the stroke is the shutdown worth. It is there to cover a cold, xenon-free core, not to be a regulating band.";
}
function tipHint(s, parts) {
	if (s.tipScale === 0) return "Tips are off. Insertion cannot add reactivity on the way in.";
	if (parts.tip > 4e-4) return "The displacer is crossing the lower water column. That graphite moderates better than the water it replaces, so this part of a scram adds reactivity.";
	if (s.rod <= .001) return "Rods are fully out. The next motion downward puts graphite in before boron.";
	return "Tips are clear of the flux peak. Only boron is changing rod worth.";
}
function voidHint(s, parts) {
	const sign = s.voidScale < 0 ? "The coefficient is negative, so extra steam removes reactivity." : s.voidScale === 0 ? "The void coefficient is off." : "The coefficient is positive, so extra steam adds reactivity.";
	return `Channels are ${Math.round(s.voidF * 100)}% steam, worth ${signed(dollars(parts.void))}. ${sign}`;
}
function xenonHint(s, parts) {
	return `Xenon is ${s.X.toFixed(2)} times its full-power equilibrium, worth ${signed(dollars(parts.xenon))}. Iodine is ${s.I.toFixed(2)} and becomes xenon when it decays.`;
}
function dopplerHint(s, parts) {
	const side = s.tf >= T_REF ? "above" : "below";
	return `Fuel is ${Math.round(s.tf)}°C, ${side} the ${Math.round(T_REF)}°C reference, worth ${signed(dollars(parts.doppler))}. Hotter fuel captures more neutrons in uranium-238.`;
}
function Readout({ label, value, testId, alarm, ok }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "label",
		children: label
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: alarm ? "num alarm" : ok ? "num ok" : "num",
		"data-testid": testId,
		children: value
	})] });
}
function Term({ label, value, hint }) {
	const d = dollars(value);
	const mag = Math.min(1, Math.abs(d) / 3);
	const pos = d >= 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "term",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "term-top",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: signed(d) })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "track",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: pos ? "fill pos" : "fill neg",
					style: {
						width: `${mag * 50}%`,
						left: pos ? "50%" : `${50 - mag * 50}%`
					}
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "note",
				children: hint
			})
		]
	});
}
function Slider({ id, label, display, min, max, step, value, disabled, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "slider",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "slider-top",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
				htmlFor: id,
				children: label
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: display })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			id,
			"data-testid": id,
			type: "range",
			min,
			max,
			step,
			value: Number.isFinite(value) ? value : min,
			disabled,
			onChange: (e) => onChange(Number(e.target.value))
		})]
	});
}
function History({ plant }) {
	const ref = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		const canvas = ref.current;
		if (!canvas) return;
		let raf = 0;
		const draw = () => {
			const ctx = canvas.getContext("2d");
			const s = plant.current;
			const parent = canvas.parentElement;
			if (ctx && s && parent) {
				const w = parent.clientWidth;
				const h = canvas.clientHeight || 72;
				const dpr = Math.min(2, window.devicePixelRatio || 1);
				const pw = Math.max(1, Math.floor(w * dpr));
				const ph = Math.max(1, Math.floor(h * dpr));
				if (canvas.width !== pw || canvas.height !== ph) {
					canvas.width = pw;
					canvas.height = ph;
				}
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
				const style = getComputedStyle(document.documentElement);
				const bg = style.getPropertyValue("--color-bg").trim() || "#10140f";
				const dim = style.getPropertyValue("--color-line").trim() || "#3c4636";
				const amber = style.getPropertyValue("--color-amber").trim() || "#e6a322";
				const alarm = style.getPropertyValue("--color-alarm").trim() || "#d94b3a";
				ctx.fillStyle = bg;
				ctx.fillRect(0, 0, w, h);
				ctx.strokeStyle = dim;
				ctx.beginPath();
				ctx.moveTo(0, h / 2);
				ctx.lineTo(w, h / 2);
				ctx.stroke();
				const hist = s.hist;
				if (hist.length > 1) {
					const plot = (pick, color) => {
						ctx.beginPath();
						ctx.strokeStyle = color;
						hist.forEach((_sample, i) => {
							const x = i / (hist.length - 1) * w;
							const y = h * (.5 - pick(i) * .42);
							if (i === 0) ctx.moveTo(x, y);
							else ctx.lineTo(x, y);
						});
						ctx.stroke();
					};
					plot((i) => Math.max(-1.2, Math.min(1.2, hist[i].n - .2)), amber);
					plot((i) => Math.max(-1.2, Math.min(1.2, hist[i].rho / BETA / 2)), alarm);
				}
			}
			raf = requestAnimationFrame(draw);
		};
		raf = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(raf);
	}, [plant]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "history-wrap",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "label",
			children: "Recent power and reactivity"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
			ref,
			className: "history",
			"aria-hidden": "true"
		})]
	});
}
var SplitComponent = Lab;
//#endregion
export { SplitComponent as component };
