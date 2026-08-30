import { useMemo, useState } from "react";
import type { Bar } from "@/lib/market/types";
import { fmtCurrency, fmtDate } from "@/lib/market/math";
import { cn } from "@/lib/utils";

function downsample(bars: Bar[], max = 90): Bar[] {
  if (bars.length <= max) return bars;
  const step = bars.length / max;
  const out: Bar[] = [];
  for (let i = 0; i < max; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    const slice = bars.slice(start, end);
    if (!slice.length) continue;
    out.push({
      t: slice[slice.length - 1].t,
      o: slice[0].o,
      c: slice[slice.length - 1].c,
      h: Math.max(...slice.map((b) => b.h)),
      l: Math.min(...slice.map((b) => b.l)),
      v: slice.reduce((s, b) => s + b.v, 0),
    });
  }
  return out;
}

export function CandleChart({ bars, className }: { bars: Bar[]; className?: string }) {
  const data = useMemo(() => downsample(bars), [bars]);
  const [active, setActive] = useState<number | null>(null);

  if (data.length < 2) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl bg-surface text-sm text-muted">
        No chart data for this period.
      </div>
    );
  }

  const padL = 8;
  const padR = 8;
  const padT = 16;
  const candleH = 168;
  const volH = 36;
  const gap = 10;
  const width = 640;
  const height = padT + candleH + gap + volH + 8;
  const lows = data.map((b) => b.l);
  const highs = data.map((b) => b.h);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = max - min || 1;
  const maxV = Math.max(...data.map((b) => b.v), 1);
  const slot = (width - padL - padR) / data.length;
  const bodyW = Math.max(1.6, Math.min(7, slot * 0.62));

  const y = (price: number) => padT + ((max - price) / span) * candleH;
  const x = (i: number) => padL + slot * i + slot / 2;

  const idx = active ?? data.length - 1;
  const bar = data[idx];

  return (
    <div className={cn("rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]", className)}>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-subtle">{fmtDate(bar.t)}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            <span>
              O <span className="tabular text-fg">{fmtCurrency(bar.o)}</span>
            </span>
            <span>
              H <span className="tabular text-fg">{fmtCurrency(bar.h)}</span>
            </span>
            <span>
              L <span className="tabular text-fg">{fmtCurrency(bar.l)}</span>
            </span>
            <span>
              C <span className="tabular text-fg">{fmtCurrency(bar.c)}</span>
            </span>
          </div>
        </div>
        <span className={cn("tabular text-sm", bar.c >= bar.o ? "text-up" : "text-down")}>
          {bar.c >= bar.o ? "+" : ""}
          {(((bar.c - bar.o) / bar.o) * 100).toFixed(2)}%
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full touch-pan-y"
        role="img"
        aria-label="Candlestick chart"
        onPointerLeave={() => setActive(null)}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * width;
          const i = Math.min(data.length - 1, Math.max(0, Math.floor((px - padL) / slot)));
          setActive(i);
        }}
      >
        {[0, 0.5, 1].map((p) => {
          const py = padT + candleH * p;
          const label = max - span * p;
          return (
            <g key={p}>
              <line x1={padL} x2={width - padR} y1={py} y2={py} stroke="currentColor" className="text-border" />
              <text x={width - 4} y={py - 3} textAnchor="end" className="fill-subtle" fontSize="10">
                {label.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </text>
            </g>
          );
        })}
        {data.map((b, i) => {
          const cx = x(i);
          const up = b.c >= b.o;
          const top = y(Math.max(b.o, b.c));
          const bot = y(Math.min(b.o, b.c));
          const body = Math.max(1, bot - top);
          const volY = padT + candleH + gap;
          const vh = (b.v / maxV) * volH;
          const on = i === idx;
          return (
            <g key={b.t}>
              <line
                x1={cx}
                x2={cx}
                y1={y(b.h)}
                y2={y(b.l)}
                stroke={up ? "#4eae7a" : "#d15c5c"}
                strokeWidth={on ? 1.6 : 1}
              />
              <rect
                x={cx - bodyW / 2}
                y={top}
                width={bodyW}
                height={body}
                fill={up ? "#4eae7a" : "#d15c5c"}
                opacity={on ? 1 : 0.88}
              />
              <rect
                x={cx - bodyW / 2}
                y={volY + volH - vh}
                width={bodyW}
                height={vh}
                fill={up ? "#4eae7a" : "#d15c5c"}
                opacity={0.35}
              />
            </g>
          );
        })}
        {active != null && (
          <line x1={x(idx)} x2={x(idx)} y1={padT} y2={height - 4} stroke="#c5cdd6" strokeOpacity={0.35} />
        )}
      </svg>
    </div>
  );
}
