"use client";

// 챔버K v2 공정 기록 — 1분 요약 그래프(ops2_summary). SVG 를 직접 그린다(새 의존성 없이).
// 단위가 같은 값끼리 작은 그래프 하나(축 하나 — 두 축 그래프는 쓰지 않는다). 값은 필드의 summary 방식(mean·max·min·last).
// 글자는 그래프 안에 두지 않는다: 범례는 위 띠, 마지막 값은 오른쪽 띠(겹치면 아래위로 비켜 놓고 지시선으로 선 끝과 잇는다),
// 축 눈금은 왼쪽·아래 띠. 품질(quality okRatio)이 1 이 아닌 구간은 선을 옅게(점선) + 배경을 회색으로. 시간축은 KST.
// 구간 사이가 90 s 넘게 비면 선을 끊는다(프로그램 재시작 등). 마우스를 올리면 세로선과 그 분의 값(모든 선).
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtValue, type FieldDef } from "./types";

export type SummaryRow = { fromTs: string; toTs: string; rowCount: number; stats: unknown; quality: unknown };
export type PickField = FieldDef & { block: string };

// 기준 팔레트(dataviz reference palette — 밝은 화면) 1~8 번, 정해진 순서로만
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const H = 150, TOP = 24, BOTTOM = 22, LEFT = 56, RIGHT = 132;
const GAP_MS = 90_000;

const kstHm = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour12: false, hour: "2-digit", minute: "2-digit" });
const hm = (t: number) => kstHm.format(new Date(t)).replace(/^24/, "00");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

type Pt = { t: number; v: number | null; ok: boolean };

function series(rows: SummaryRow[], f: PickField): Pt[] {
  const how = f.summary && ["mean", "max", "min", "last"].includes(f.summary) ? f.summary : "mean";
  return rows.map((r) => {
    const s = isObj(r.stats) ? r.stats[f.column] : null;
    const v = isObj(s) && typeof s[how] === "number" ? (s[how] as number) : null;
    const q = isObj(r.quality) ? (r.quality[f.ownQuality ? f.column : f.block] ?? r.quality[f.block]) : null;
    const ok = !isObj(q) || q.okRatio === undefined || q.okRatio === 1;
    const t = (Date.parse(r.fromTs) + Date.parse(r.toTs)) / 2;
    return { t, v, ok };
  });
}

/** 10.5px 글자 폭 어림(한글 넓게) — 범례를 나란히 놓을 때 */
const textWidth = (t: string) => [...t].reduce((n, c) => n + (c.charCodeAt(0) > 0x2000 ? 10.5 : 6.2), 0);

function niceStep(span: number, n: number): number {
  const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 240, 480].map((m) => m * 60_000);

/** 오른쪽 띠 글자 자리 — 원하는 y 순서대로, 최소 간격만큼 비켜 놓는다(띠 안에서) */
function spread(want: number[], gap: number, lo: number, hi: number): number[] {
  const idx = want.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = new Array<number>(want.length);
  let prev = -Infinity;
  for (const o of idx) {
    const y = Math.max(o.y, prev + gap, lo);
    out[o.i] = y;
    prev = y;
  }
  const over = prev - hi;                              // 아래로 넘치면 전체를 위로
  if (over > 0) for (let i = 0; i < out.length; i++) out[i] = Math.max(lo, out[i] - over);
  return out;
}

function Panel({ rows, fields, colors, width, t0, t1, hover, setHover }: {
  rows: SummaryRow[]; fields: PickField[]; colors: string[]; width: number; t0: number; t1: number;
  hover: number | null; setHover: (i: number | null) => void;
}) {
  const unit = fields[0].unit;
  const data = fields.map((f) => series(rows, f));
  const vals = data.flat().map((p) => p.v).filter((v): v is number => v !== null && Number.isFinite(v));
  const log = unit === "Torr" && vals.length > 0 && vals.every((v) => v > 0);
  const tr = (v: number) => (log ? Math.log10(v) : v);
  let lo = vals.length ? Math.min(...vals.map(tr)) : 0, hi = vals.length ? Math.max(...vals.map(tr)) : 1;
  if (!log) lo = Math.min(lo, 0);
  if (hi - lo < 1e-12) hi = lo + (log ? 1 : Math.abs(lo) || 1);
  const step = log ? 1 : niceStep(hi - lo, 4);
  if (log) { lo = Math.floor(lo); hi = Math.ceil(hi); } else { lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step; }
  const pw = Math.max(40, width - LEFT - RIGHT), ph = H - TOP - BOTTOM;
  const x = (t: number) => LEFT + ((t - t0) / Math.max(1, t1 - t0)) * pw;
  const y = (v: number) => TOP + ph - ((tr(v) - lo) / (hi - lo)) * ph;
  const yTicks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) yTicks.push(v);
  const tStep = TIME_STEPS.find((s) => (t1 - t0) / s <= 6) ?? TIME_STEPS[TIME_STEPS.length - 1];
  const xTicks: number[] = [];
  for (let t = Math.ceil(t0 / tStep) * tStep; t <= t1; t += tStep) xTicks.push(t);
  const fmtTick = (v: number) => (log ? `1e${v}` : String(Number(v.toPrecision(6))));

  // 품질이 ok 아닌 구간 — 값이 있는 선 중 하나라도(값이 없는 선 — 꺼진 장비 — 은 배경을 칠하지 않고 범례에 "값 없음")
  const badBands = rows.map((r, i) => ({ r, bad: data.some((d) => d[i].v !== null && !d[i].ok) })).filter((b) => b.bad)
    .map((b) => ({ x0: x(Date.parse(b.r.fromTs)), x1: x(Date.parse(b.r.toTs)) }));

  // 선 조각 — 빈 값·90 s 넘는 틈에서 끊고, 품질이 다르면 조각을 나눈다
  const segs = data.map((d) => {
    const out: { ok: boolean; pts: Pt[] }[] = [];
    let cur: { ok: boolean; pts: Pt[] } | null = null;
    d.forEach((p, i) => {
      if (p.v === null) { cur = null; return; }
      const prev = i > 0 ? d[i - 1] : null;
      const gap = !prev || prev.v === null || p.t - prev.t > GAP_MS;
      if (gap || !cur || cur.ok !== p.ok) {
        const start: Pt[] = !gap && cur && prev ? [prev] : [];
        cur = { ok: p.ok, pts: [...start, p] };
        out.push(cur);
      } else cur.pts.push(p);
    });
    return out;
  });
  const lastPts = data.map((d) => [...d].reverse().find((p) => p.v !== null) ?? null);
  const legend = fields.reduce<{ x: number; text: string }[]>((acc, f) => {
    const empty = !data[acc.length].some((p) => p.v !== null);
    const text = `${f.label}${f.summary && f.summary !== "mean" ? `(${f.summary})` : ""}${empty ? " — 값 없음" : ""}`;
    const prev = acc[acc.length - 1];
    return [...acc, { x: prev ? prev.x + 26 + textWidth(prev.text) : LEFT, text }];
  }, []);
  const labY = spread(lastPts.map((p) => (p ? y(p.v as number) : TOP + ph / 2)), 13, TOP + 4, TOP + ph);

  return (
    <svg width={width} height={H} role="img" aria-label={`${fields.map((f) => f.label).join(", ")} (${unit || "단위 없음"}) 1분 요약`}
      onPointerLeave={() => setHover(null)}
      onPointerMove={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const px = e.clientX - r.left;
        if (px < LEFT || px > LEFT + pw) return setHover(null);
        let best = -1, bd = Infinity;
        rows.forEach((row, i) => {
          const dx = Math.abs(x((Date.parse(row.fromTs) + Date.parse(row.toTs)) / 2) - px);
          if (dx < bd) { bd = dx; best = i; }
        });
        setHover(best >= 0 ? best : null);
      }}>
      {/* 위 띠: 범례 */}
      {legend.map((l, k) => (
        <g key={fields[k].column} transform={`translate(${l.x},6)`}>
          <rect width={10} height={3} y={5} rx={1.5} fill={colors[k]} />
          <text x={14} y={10} fontSize={10.5} fill="#52514e">{l.text}</text>
        </g>
      ))}
      <text x={LEFT - 6} y={14} fontSize={10} fill="#8a8984" textAnchor="end">{unit || "단위 없음"}{log ? " 로그" : ""}</text>
      {/* 품질 구간 */}
      {badBands.map((b, i) => <rect key={i} x={b.x0} y={TOP} width={Math.max(1, b.x1 - b.x0)} height={ph} fill="#e9e8e4" />)}
      {/* 격자·축 */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={LEFT} x2={LEFT + pw} y1={TOP + ph - ((v - lo) / (hi - lo)) * ph} y2={TOP + ph - ((v - lo) / (hi - lo)) * ph}
            stroke="#ecebe7" strokeWidth={1} />
          <text x={LEFT - 6} y={TOP + ph - ((v - lo) / (hi - lo)) * ph + 3.5} fontSize={10} fill="#8a8984" textAnchor="end">{fmtTick(v)}</text>
        </g>
      ))}
      <line x1={LEFT} x2={LEFT + pw} y1={TOP + ph} y2={TOP + ph} stroke="#c9c8c2" />
      {xTicks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={TOP + ph} y2={TOP + ph + 4} stroke="#c9c8c2" />
          <text x={x(t)} y={TOP + ph + 15} fontSize={10} fill="#8a8984" textAnchor="middle">{hm(t)}</text>
        </g>
      ))}
      {/* 선 */}
      {segs.map((ss, k) => ss.map((s, j) => (
        s.pts.length === 1
          ? <circle key={`${k}-${j}`} cx={x(s.pts[0].t)} cy={y(s.pts[0].v as number)} r={3} fill={colors[k]} opacity={s.ok ? 1 : 0.35} />
          : <polyline key={`${k}-${j}`} fill="none" stroke={colors[k]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={s.ok ? undefined : "4 3"} opacity={s.ok ? 1 : 0.35}
              points={s.pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v as number).toFixed(1)}`).join(" ")} />
      )))}
      {/* 오른쪽 띠: 마지막 값 + 지시선 */}
      {lastPts.map((p, k) => p && (
        <g key={fields[k].column}>
          <polyline fill="none" stroke="#c9c8c2" strokeWidth={1}
            points={`${x(p.t) + 3},${y(p.v as number)} ${LEFT + pw + 8},${y(p.v as number)} ${LEFT + pw + 16},${labY[k]}`} />
          <circle cx={LEFT + pw + 20} cy={labY[k]} r={2.5} fill={colors[k]} />
          <text x={LEFT + pw + 26} y={labY[k] + 3.5} fontSize={10.5} fill="#2b2a28">
            {fmtValue(p.v, fields[k].fmt) || String(p.v)}
          </text>
        </g>
      ))}
      {/* 세로선 */}
      {hover !== null && rows[hover] && (
        <line x1={x((Date.parse(rows[hover].fromTs) + Date.parse(rows[hover].toTs)) / 2)}
          x2={x((Date.parse(rows[hover].fromTs) + Date.parse(rows[hover].toTs)) / 2)} y1={TOP} y2={TOP + ph}
          stroke="#52514e" strokeWidth={1} strokeDasharray="2 2" />
      )}
      {/* 넓은 맞힘 영역 */}
      <rect x={LEFT} y={TOP} width={pw} height={ph} fill="transparent" />
    </svg>
  );
}

export default function Chk2SummaryChart({ rows, fields, t0, t1 }: { rows: SummaryRow[]; fields: PickField[]; t0: number; t1: number }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(320, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 단위별 작은 그래프 — 색은 그 단위 안에서 고른 순서(정해진 팔레트 순서)
  const groups = useMemo(() => {
    const m = new Map<string, PickField[]>();
    for (const f of fields) m.set(f.unit, [...(m.get(f.unit) ?? []), f]);
    return [...m.values()];
  }, [fields]);
  const span0 = rows.length ? Math.min(t0, Date.parse(rows[0].fromTs)) : t0;
  const span1 = rows.length ? Math.max(t1, Date.parse(rows[rows.length - 1].toTs)) : t1;
  const hr = hover !== null ? rows[hover] : null;

  return (
    <div ref={box} className="relative w-full">
      {!rows.length ? <p className="py-6 text-center text-xs text-gray-400">이 공정의 1분 요약이 없습니다</p>
        : !fields.length ? <p className="py-6 text-center text-xs text-gray-400">필드를 고르세요</p>
        : groups.map((g) => (
          <Panel key={g[0].unit} rows={rows} fields={g} colors={g.map((_, k) => SERIES[k % SERIES.length])} width={width}
            t0={span0} t1={span1} hover={hover} setHover={setHover} />
        ))}
      {hr && (
        <div className="pointer-events-none absolute right-2 top-0 z-10 rounded-lg border border-gray-200 bg-white/95 px-2 py-1 text-[11px] shadow-sm">
          <p className="text-gray-500">{hm(Date.parse(hr.fromTs))}~{hm(Date.parse(hr.toTs))} KST · {hr.rowCount}행</p>
          {groups.flatMap((g) => g.map((f, k) => {
            const p = series([hr], f)[0];
            return (
              <p key={f.column} className="flex items-center gap-1.5">
                <span className="inline-block h-[3px] w-2.5 rounded" style={{ background: SERIES[k % SERIES.length] }} />
                <b className="tabular-nums text-gray-900">{p.v === null ? "—" : fmtValue(p.v, f.fmt) || String(p.v)}</b>
                <span className="text-gray-500">{f.unit} {f.label}{p.ok ? "" : " · 품질 ok 아님"}</span>
              </p>
            );
          }))}
        </div>
      )}
    </div>
  );
}
