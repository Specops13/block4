import { useEffect, useRef } from "react";
import { bottomPeak, derive } from "@/sim/physics";
import type { State } from "@/sim/types";

type Bit = { x: number; y: number; vx: number; vy: number; s: number; a: number };

type Props = {
  plant: { current: State | null };
  reduced: boolean;
};

export function CoreCanvas({ plant, reduced }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bits = useRef<Bit[]>([]);
  const sawBoom = useRef(false);

  useEffect(() => {
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
    const loop = (now: number) => {
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

  return <canvas ref={ref} className="core-canvas" aria-hidden="true" />;
}

function cssColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: State,
  now: number,
  reduced: boolean,
  bits: Bit[],
  sawBoom: { current: boolean },
) {
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
    if (!reduced) {
      for (let i = 0; i < 48; i++) {
        bits.push({
          x: w * 0.38,
          y: h * 0.45,
          vx: (Math.random() - 0.5) * 280,
          vy: (Math.random() - 0.8) * 240,
          s: 2 + Math.random() * 6,
          a: 1,
        });
      }
    }
  }
  if (!boom) sawBoom.current = false;

  const pad = 10;
  const traceH = h < 260 ? 28 : h < 360 ? 40 : 52;
  const fluxW = w < 420 ? 28 : 46;
  const coreX = pad;
  const coreY = h < 260 ? 16 : 22;
  const coreW = Math.max(40, w - fluxW - pad * 3);
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
  const gx = coreX + inset;
  const gy = coreY + inset + 8;
  const gw = coreW - inset * 2;
  const gh = coreH - inset * 2 - 12;

  const cols = 14;
  const rows = 10;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gx + (c * gw) / cols;
      const y = gy + (r * gh) / rows;
      const hot = heat * (0.45 + 0.55 * (r / rows));
      ctx.fillStyle = boom
        ? `rgba(180, 50, 32, ${0.35 + 0.4 * ((r * c) % 3) / 3})`
        : `rgba(${70 + hot * 140}, ${64 + hot * 20}, ${42}, 0.9)`;
      ctx.fillRect(x + 1, y + 1, gw / cols - 2, gh / rows - 2);
    }
  }

  const nCh = 9;
  for (let i = 0; i < nCh; i++) {
    const cx = gx + ((i + 0.5) * gw) / nCh;
    const rod = i % 3 === 1;
    const tubeW = Math.max(4, gw / nCh * 0.28);
    ctx.fillStyle = "rgba(8, 10, 8, 0.72)";
    ctx.fillRect(cx - tubeW / 2, gy, tubeW, gh);

    if (!rod) {
      const bubbles = Math.round(2 + s.voidF * 7);
      for (let b = 0; b < bubbles; b++) {
        const speed = reduced ? 0 : 36 + (i % 4) * 10;
        const phase = ((now / 1000) * speed + b * 37 + i * 18) % gh;
        const y = gy + gh - phase;
        ctx.beginPath();
        ctx.fillStyle = `rgba(231, 226, 212, ${0.15 + s.voidF * 0.45})`;
        ctx.arc(cx, y, Math.max(1.2, tubeW * 0.22), 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const absH = gh * 0.62;
      const dispH = gh * 0.34;
      const absBottom = gy + s.rod * gh * 0.92;
      const absTop = absBottom - absH;
      ctx.fillStyle = boom ? alarm : "#1a1c18";
      ctx.fillRect(cx - tubeW * 0.7, Math.max(gy - 16, absTop), tubeW * 1.4, Math.max(0, absBottom - Math.max(gy - 16, absTop)));
      const dispTop = absBottom + gh * 0.04;
      ctx.fillStyle = "#6d6452";
      const visTop = Math.max(gy, dispTop);
      const visBot = Math.min(gy + gh, dispTop + dispH);
      if (visBot > visTop) ctx.fillRect(cx - tubeW * 0.55, visTop, tubeW * 1.1, visBot - visTop);
      if (s.rod < 0.12) {
        ctx.fillStyle = "rgba(231, 226, 212, 0.28)";
        ctx.fillRect(cx - tubeW / 2 + 1, gy + gh * 0.78, tubeW - 2, gh * 0.22);
      }
      ctx.fillStyle = dim;
      ctx.fillRect(cx - 3, coreY + 2, 6, 8);
    }
  }

  if (s.rod < 0.12 && !boom) {
    ctx.fillStyle = alarm;
    ctx.font = "600 11px 'Barlow Condensed', sans-serif";
    ctx.fillText("WATER COLUMN UNDER TIPS", gx, gy + gh + 11);
  }

  const fx = coreX + coreW + 8;
  const samples = 28;
  let maxF = 0.001;
  const fluxes: number[] = [];
  for (let i = 0; i < samples; i++) {
    const y = i / (samples - 1);
    const mid = Math.sin(Math.PI * (1 - y) * 0.92 + 0.12);
    const bot = Math.exp(-((y - 0.8) ** 2) / 0.018);
    const f = Math.max(0, mid * (1 - Math.min(bp, 2) * 0.08) + bot * bp * 0.7);
    fluxes.push(f);
    if (f > maxF) maxF = f;
  }
  for (let i = 0; i < samples; i++) {
    const y = gy + (i * gh) / samples;
    const mag = fluxes[i] / maxF;
    ctx.fillStyle = boom ? alarm : amber;
    ctx.globalAlpha = 0.25 + mag * 0.75;
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
    const tw = w - pad * 2;
    const th = traceH - 24;
    ctx.strokeStyle = line;
    ctx.strokeRect(x0, y0, tw, th);
    ctx.beginPath();
    const cap = Math.max(1.2, ...hist.map((p) => p.n));
    hist.forEach((p, i) => {
      const x = x0 + (i / (hist.length - 1)) * tw;
      const y = y0 + th - (Math.min(p.n, cap) / cap) * th;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = d.dollars > 0.4 ? alarm : amber;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  if (boom) {
    const age = reduced ? 1 : Math.min(1, bits.reduce((m, b) => Math.max(m, b.a), 0));
    ctx.fillStyle = `rgba(255, 244, 230, ${0.55 * age})`;
    ctx.fillRect(0, 0, w, h);
    for (const b of bits) {
      b.x += (b.vx * 16) / 1000;
      b.y += (b.vy * 16) / 1000;
      b.vy += 40 / 60;
      b.a *= 0.985;
      ctx.globalAlpha = Math.max(0, b.a);
      ctx.fillStyle = alarm;
      ctx.fillRect(b.x, b.y, b.s, b.s * 0.6);
    }
    ctx.globalAlpha = 1;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
