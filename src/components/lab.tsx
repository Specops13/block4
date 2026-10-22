import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { CoreCanvas } from "@/components/core-canvas";
import { DeskSound } from "@/lib/sound";
import {
  BETA,
  commandScram,
  derive,
  dollars,
  step,
  T_REF,
} from "@/sim/physics";
import {
  createLab,
  FREE_LESSON,
  LESSONS,
  lessonStatus,
  type ExperimentId,
  type Lesson,
  type Origin,
} from "@/sim/lab";
import type { Levels, Parts, State } from "@/sim/types";

const WARPS = [
  { id: 1, label: "1×" },
  { id: 60, label: "1 min/s" },
  { id: 300, label: "5 min/s" },
  { id: 1200, label: "20 min/s" },
] as const;

type Controls = {
  rodTarget: number;
  flow: number;
  pinVoid: boolean;
  voidHold: number;
  pinFuel: boolean;
  fuelHold: number;
  pinXenon: boolean;
  xenonHold: number;
  iodineHold: number;
  voidScale: number;
  dopplerScale: number;
  tipScale: number;
  trip: boolean;
  timeScale: number;
};

function controlsFrom(s: State, timeScale = 1): Controls {
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
    timeScale,
  };
}

function applyControls(s: State, c: Controls): void {
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

function signed(value: number): string {
  const abs = Math.abs(value);
  const text = abs >= 10 ? abs.toFixed(1) : abs.toFixed(2);
  if (value > 0.0005) return `+${text}$`;
  if (value < -0.0005) return `−${text}$`;
  return "0.00$";
}

function periodText(period: number | null): string {
  if (period === null || !Number.isFinite(period)) return "steady";
  const mag = Math.abs(period);
  if (mag > 400) return "steady";
  const secs = mag >= 10 ? mag.toFixed(0) : mag.toFixed(1);
  return period > 0 ? `rising ${secs} s` : `falling ${secs} s`;
}

function lessonOf(id: ExperimentId): Lesson {
  return LESSONS.find((lesson) => lesson.id === id) ?? FREE_LESSON;
}

export function Lab() {
  const sim = useRef<State | null>(null);
  if (sim.current === null) sim.current = createLab("raise");
  const levels = useRef<Levels>({ rod: 0, timeScale: 1 });
  const origin = useRef<Origin>({ x: sim.current.X, n: sim.current.n });
  const audio = useRef<DeskSound | null>(null);
  const [controls, setControls] = useState<Controls>(() => controlsFrom(sim.current as State));
  const [lesson, setLesson] = useState<ExperimentId>("raise");
  const [seen, setSeen] = useState<ExperimentId[]>([]);
  const [frame, setFrame] = useState(0);
  const [muted, setMuted] = useState(false);
  const [reduced, setReduced] = useState(false);

  const plant = sim.current as State;
  const view = derive(plant);
  const status = lessonStatus(lesson, plant, origin.current);
  const copy = lessonOf(lesson);

  useEffect(() => {
    if (status !== "met") return;
    setSeen((prev) => (prev.includes(lesson) ? prev : [...prev, lesson]));
  }, [status, lesson]);

  useEffect(() => {
    audio.current = new DeskSound();
    const stored = window.localStorage.getItem("block4-lab-mute");
    if (stored === "1") {
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
      orm: () => (sim.current ? sim.current.rod * 211 : 0),
      exploded: () => Boolean(sim.current?.exploded),
      screen: () => "lab",
      lesson: () => lesson,
    };
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("pointerdown", unlock);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [lesson]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      const wall = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = sim.current;
      if (s && !document.hidden && s.phase === "run") {
        step(s, levels.current, wall);
        const severe = derive(s).alarms.some((alarm) => alarm.severe);
        audio.current?.update(s, severe);
      }
      acc += wall;
      if (acc > 0.1) {
        acc = 0;
        setFrame((n) => (n + 1) % 100000);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const s = sim.current;
      if (!s || s.scram || s.exploded) return;
      const next = Math.max(0, Math.min(1, s.rodTarget + (e.key === "ArrowDown" ? 0.02 : -0.02)));
      s.rodTarget = next;
      setControls((c) => ({ ...c, rodTarget: next }));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function commit(partial: Partial<Controls>) {
    const s = sim.current;
    if (!s) return;
    let next = partial;
    if (partial.pinVoid === true) next = { ...next, voidHold: s.voidF };
    if (partial.pinFuel === true) next = { ...next, fuelHold: s.tf };
    if (partial.pinXenon === true) next = { ...next, xenonHold: s.X, iodineHold: s.I };
    if (next.timeScale !== undefined) levels.current.timeScale = next.timeScale;
    setControls((c) => {
      const merged = { ...c, ...next };
      applyControls(s, merged);
      return merged;
    });
  }

  function mount(id: ExperimentId, warp: number) {
    const s = createLab(id);
    sim.current = s;
    origin.current = { x: s.X, n: s.n };
    levels.current = { rod: 0, timeScale: warp };
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
    origin.current = { x: s.X, n: s.n };
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

  return (
    <div className="lab" data-frame={frame}>
      <header className="lab-head">
        <div>
          <p className="kicker">RBMK-1000 · one energy group</p>
          <h1>Reactor lab</h1>
        </div>
        <div className="top-actions">
          <button type="button" className="icon-btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button type="button" className="text-btn" data-testid="nominal" onClick={() => mount("free", 1)}>
            Nominal core
          </button>
        </div>
      </header>

      <nav className="chips" aria-label="Lessons">
        {LESSONS.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`experiment-${item.id}`}
            className={chipClass(lesson === item.id, seen.includes(item.id))}
            onClick={() => mount(item.id, item.id === "xenon" ? 1200 : 1)}
          >
            {item.step} {item.title}
          </button>
        ))}
        <button
          type="button"
          data-testid="experiment-free"
          className={chipClass(lesson === "free", false)}
          onClick={() => setLesson("free")}
        >
          Free bench
        </button>
      </nav>

      <div className="lab-grid">
        <article className="panel lesson" data-testid="lesson">
          <p className="kicker">{lesson === "free" ? "No script" : `Lesson ${copy.step}`}</p>
          <h2>{copy.title}</h2>
          <p>{copy.body}</p>
          <p className="task">{copy.task}</p>
          {lesson !== "free" ? (
            <p className={status === "met" ? "status met" : "status"} data-testid="status">
              {status === "met"
                ? "Seen. Stay here, open the next lesson, or switch to the free bench — it keeps this core."
                : status === "lost"
                  ? "The chain went prompt and the model stopped. Reload the lesson, or restore a critical core with the same coefficients."
                  : "Not yet."}
            </p>
          ) : (
            <p className="status">The free bench does not reload the core. Nominal core does.</p>
          )}
          <div className="debrief-actions">
            <button type="button" className="text-btn" data-testid="reload" onClick={() => mount(lesson, lesson === "xenon" ? 1200 : 1)}>
              Reload lesson
            </button>
            {plant.exploded ? (
              <button type="button" className="text-btn" data-testid="restore" onClick={restore}>
                Critical core
              </button>
            ) : null}
          </div>
        </article>

        <section className="lab-core">
          {plant.exploded ? (
            <p className="banner" role="status">
              Power ran away. Prompt neutrons, then void. The equations stop when the core is no longer a core.
            </p>
          ) : null}
          <div className="lab-stage">
            <CoreCanvas plant={sim} reduced={reduced} />
          </div>
          <div className="lab-readouts">
            <Readout
              label="Power"
              testId="power"
              value={`${Math.round(plant.n * 3200).toLocaleString("en-US")} MW`}
              alarm={plant.n > 1.08}
            />
            <Readout
              label="Period"
              testId="period"
              value={periodText(view.period)}
              alarm={view.period !== null && view.period > 0 && view.period < 10}
            />
            <Readout
              label="Reactivity"
              testId="reactivity"
              value={signed(view.dollars)}
              alarm={view.dollars > 0.5}
              ok={view.dollars < -0.05}
            />
            <Readout label="ORM" testId="orm" value={view.orm.toFixed(0)} alarm={view.orm < 15} />
          </div>
          <p className="note">
            ORM is rod insertion times 211. Fifteen was the operating floor. Under about 8, a scram
            starts in the high-flux bottom, where the graphite tips add reactivity.
          </p>
          <div className="terms">
            <Term label="Excess" value={view.parts.excess} hint="Fixed so a nominal full-power core, with equilibrium xenon, is critical near 24% insertion." />
            <Term label="Rods" value={view.parts.rod} hint={rodHint(plant, view.parts)} />
            <Term label="Graphite tip" value={view.parts.tip} hint={tipHint(plant, view.parts)} />
            <Term label="Void" value={view.parts.void} hint={voidHint(plant, view.parts)} />
            <Term label="Xenon" value={view.parts.xenon} hint={xenonHint(plant, view.parts)} />
            <Term label="Doppler" value={view.parts.doppler} hint={dopplerHint(plant, view.parts)} />
          </div>
          <History plant={sim} />
          <p className="fine">
            Poison clock {hours(plant.t)}
            {plant.held && controls.timeScale > 1 ? " · held at real time while the core is unstable" : ""}
            . Rods, boiling, and neutrons stay in real time. Xenon and iodine use the clock.
          </p>
        </section>

        <section className="lab-side">
          <div className="panel controls">
            <h3>Rods</h3>
            <Slider
              id="rod-slider"
              label="Insertion"
              display={`${Math.round(controls.rodTarget * 100)}% target · ${Math.round(plant.rod * 100)}% in the core`}
              min={0}
              max={1}
              step={0.005}
              value={controls.rodTarget}
              disabled={rodLocked}
              onChange={(rodTarget) => commit({ rodTarget })}
            />
            <p className="note">Out (0%) adds reactivity. In (100%) adds boron. Arrow up withdraws, arrow down inserts, unless a slider is focused.</p>
            <div className="switch-row">
              <button type="button" className="text-btn danger" data-testid="az5" disabled={plant.exploded || plant.scram} onClick={() => {
                audio.current?.unlock();
                const s = sim.current;
                if (!s || s.exploded || s.phase !== "run") return;
                commandScram(s, "AZ-5. Rods driving in.");
              }}>
                AZ-5
              </button>
              {plant.scram && !plant.exploded ? (
                <button
                  type="button"
                  className="text-btn"
                  data-testid="release-az5"
                  onClick={() => {
                    const s = sim.current;
                    if (!s) return;
                    s.scram = false;
                    s.scramT = 0;
                  }}
                >
                  Release rods
                </button>
              ) : null}
            </div>
            <label className="checkline">
              <input
                type="checkbox"
                data-testid="trip"
                checked={controls.trip}
                onChange={(e) => commit({ trip: e.target.checked })}
              />
              Automatic trip armed
            </label>
            <p className="note">
              The trip is AZ-5 by instrument: about +0.6$ or 116% power, held for a third of a second. It does not change how the rods enter.
            </p>
          </div>

          <div className="panel controls">
            <h3>Coolant</h3>
            <Slider
              id="flow-slider"
              label="Flow"
              display={`${controls.flow.toFixed(2)}× nominal`}
              min={0.2}
              max={1.5}
              step={0.01}
              value={controls.flow}
              disabled={plant.exploded}
              onChange={(flow) => commit({ flow })}
            />
            <label className="checkline">
              <input
                type="checkbox"
                data-testid="pin-void"
                checked={controls.pinVoid}
                onChange={(e) => commit({ pinVoid: e.target.checked })}
              />
              Hold void fraction
            </label>
            <Slider
              id="void-slider"
              label="Void"
              display={`${Math.round(voidShown * 100)}% steam`}
              min={0}
              max={0.95}
              step={0.01}
              value={voidShown}
              disabled={!controls.pinVoid || plant.exploded}
              onChange={(voidHold) => commit({ voidHold })}
            />
            <p className="note">
              {controls.pinVoid
                ? "Void is frozen, so flow only changes fuel temperature."
                : "Void follows power and flow. Less flow, or more power, boils the channels."}
            </p>
          </div>

          <div className="panel controls">
            <h3>Fuel</h3>
            <label className="checkline">
              <input
                type="checkbox"
                data-testid="pin-fuel"
                checked={controls.pinFuel}
                onChange={(e) => commit({ pinFuel: e.target.checked })}
              />
              Hold fuel temperature
            </label>
            <Slider
              id="fuel-slider"
              label="Temperature"
              display={`${Math.round(fuelShown)}°C`}
              min={250}
              max={1600}
              step={5}
              value={fuelShown}
              disabled={!controls.pinFuel || plant.exploded}
              onChange={(fuelHold) => commit({ fuelHold })}
            />
            <p className="note">
              Reference is {Math.round(T_REF)}°C at full power and nominal flow. Hotter than that, Doppler is negative.
            </p>
          </div>

          <div className="panel controls">
            <h3>Xenon and iodine</h3>
            <div className="scale-row" role="group" aria-label="Poison clock">
              {WARPS.map((warp) => (
                <button
                  key={warp.id}
                  type="button"
                  data-testid={`warp-${warp.id}`}
                  className={controls.timeScale === warp.id ? "scale-btn on" : "scale-btn"}
                  onClick={() => commit({ timeScale: warp.id })}
                >
                  {warp.label}
                </button>
              ))}
            </div>
            <label className="checkline">
              <input
                type="checkbox"
                data-testid="pin-xenon"
                checked={controls.pinXenon}
                onChange={(e) => commit({ pinXenon: e.target.checked })}
              />
              Hold xenon and iodine
            </label>
            <Slider
              id="xenon-slider"
              label="Xenon"
              display={`${xenonShown.toFixed(2)} × full-power equilibrium`}
              min={0}
              max={3.5}
              step={0.01}
              value={xenonShown}
              disabled={!controls.pinXenon || plant.exploded}
              onChange={(xenonHold) => commit({ xenonHold })}
            />
            <Slider
              id="iodine-slider"
              label="Iodine"
              display={iodineShown.toFixed(2)}
              min={0}
              max={3.5}
              step={0.01}
              value={iodineShown}
              disabled={!controls.pinXenon || plant.exploded}
              onChange={(iodineHold) => commit({ iodineHold })}
            />
            <p className="note">
              {controls.pinXenon
                ? "Both poisons are fixed. The clock still runs, but they do not follow it."
                : "Iodine tracks power. Xenon is fed by iodine and burned by neutrons."}
            </p>
          </div>

          <div className="panel controls">
            <h3>Coefficients</h3>
            <Slider
              id="void-scale"
              label="Void coefficient"
              display={scaleLabel(controls.voidScale, "RBMK")}
              min={-1.5}
              max={2}
              step={0.05}
              value={controls.voidScale}
              disabled={plant.exploded}
              onChange={(voidScale) => commit({ voidScale })}
            />
            <Slider
              id="doppler-scale"
              label="Doppler"
              display={scaleLabel(controls.dopplerScale, "nominal")}
              min={0}
              max={2}
              step={0.05}
              value={controls.dopplerScale}
              disabled={plant.exploded}
              onChange={(dopplerScale) => commit({ dopplerScale })}
            />
            <Slider
              id="tip-scale"
              label="Graphite tips"
              display={scaleLabel(controls.tipScale, "fitted")}
              min={0}
              max={2}
              step={0.05}
              value={controls.tipScale}
              disabled={plant.exploded}
              onChange={(tipScale) => commit({ tipScale })}
            />
            <p className="note">
              1 is this RBMK. 0 removes the effect. A negative void coefficient is the sign of a water-moderated core: boiling then reduces reactivity.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function chipClass(on: boolean, seen: boolean): string {
  if (on) return "chip on";
  if (seen) return "chip seen";
  return "chip";
}

function hours(seconds: number): string {
  return `${(seconds / 3600).toFixed(2)} h`;
}

function scaleLabel(value: number, nominal: string): string {
  if (Math.abs(value) < 0.001) return "0 — off";
  if (Math.abs(value - 1) < 0.001) return `1.00× ${nominal}`;
  return `${value.toFixed(2)}×`;
}

function rodHint(s: State, parts: Parts): string {
  if (s.rod < 0.12) return "Boron has not reached the fuel yet. Worth here is only the graphite tip.";
  if (s.rod < 0.85) return `Boron is in the core, worth ${signed(dollars(parts.rod))}. The first part of the bank is the gentle regulating range.`;
  return "The last of the stroke is the shutdown worth. It is there to cover a cold, xenon-free core, not to be a regulating band.";
}

function tipHint(s: State, parts: Parts): string {
  if (s.tipScale === 0) return "Tips are off. Insertion cannot add reactivity on the way in.";
  if (parts.tip > 0.0004) {
    return "The displacer is crossing the lower water column. That graphite moderates better than the water it replaces, so this part of a scram adds reactivity.";
  }
  if (s.rod <= 0.001) return "Rods are fully out. The next motion downward puts graphite in before boron.";
  return "Tips are clear of the flux peak. Only boron is changing rod worth.";
}

function voidHint(s: State, parts: Parts): string {
  const sign =
    s.voidScale < 0
      ? "The coefficient is negative, so extra steam removes reactivity."
      : s.voidScale === 0
        ? "The void coefficient is off."
        : "The coefficient is positive, so extra steam adds reactivity.";
  return `Channels are ${Math.round(s.voidF * 100)}% steam, worth ${signed(dollars(parts.void))}. ${sign}`;
}

function xenonHint(s: State, parts: Parts): string {
  return `Xenon is ${s.X.toFixed(2)} times its full-power equilibrium, worth ${signed(dollars(parts.xenon))}. Iodine is ${s.I.toFixed(2)} and becomes xenon when it decays.`;
}

function dopplerHint(s: State, parts: Parts): string {
  const side = s.tf >= T_REF ? "above" : "below";
  return `Fuel is ${Math.round(s.tf)}°C, ${side} the ${Math.round(T_REF)}°C reference, worth ${signed(dollars(parts.doppler))}. Hotter fuel captures more neutrons in uranium-238.`;
}

function Readout({
  label,
  value,
  testId,
  alarm,
  ok,
}: {
  label: string;
  value: string;
  testId: string;
  alarm?: boolean;
  ok?: boolean;
}) {
  const tone = alarm ? "num alarm" : ok ? "num ok" : "num";
  return (
    <div>
      <div className="label">{label}</div>
      <div className={tone} data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

function Term({ label, value, hint }: { label: string; value: number; hint: string }) {
  const d = dollars(value);
  const mag = Math.min(1, Math.abs(d) / 3);
  const pos = d >= 0;
  return (
    <div className="term">
      <div className="term-top">
        <span>{label}</span>
        <b>{signed(d)}</b>
      </div>
      <span className="track">
        <span
          className={pos ? "fill pos" : "fill neg"}
          style={{ width: `${mag * 50}%`, left: pos ? "50%" : `${50 - mag * 50}%` }}
        />
      </span>
      <p className="note">{hint}</p>
    </div>
  );
}

function Slider({
  id,
  label,
  display,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="slider">
      <div className="slider-top">
        <label htmlFor={id}>{label}</label>
        <span>{display}</span>
      </div>
      <input
        id={id}
        data-testid={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : min}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function History({ plant }: { plant: { current: State | null } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
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
          const plot = (pick: (i: number) => number, color: string) => {
            ctx.beginPath();
            ctx.strokeStyle = color;
            hist.forEach((_sample, i) => {
              const x = (i / (hist.length - 1)) * w;
              const y = h * (0.5 - pick(i) * 0.42);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            });
            ctx.stroke();
          };
          plot((i) => Math.max(-1.2, Math.min(1.2, hist[i].n - 0.2)), amber);
          plot((i) => Math.max(-1.2, Math.min(1.2, hist[i].rho / BETA / 2)), alarm);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [plant]);
  return (
    <div className="history-wrap">
      <div className="label">Recent power and reactivity</div>
      <canvas ref={ref} className="history" aria-hidden="true" />
    </div>
  );
}

declare global {
  interface Window {
    __block4?: {
      ready: boolean;
      power: () => number;
      orm: () => number;
      exploded: () => boolean;
      screen: () => string;
      lesson: () => string;
    };
  }
}
