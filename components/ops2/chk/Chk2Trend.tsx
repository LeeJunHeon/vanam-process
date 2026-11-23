"use client";

// 챔버K v2 추세(W-10, 운전 탭 공정 중) — 압력 / 밸브 위치(W-11) / 파워 / 히터 온도 그래프(시간축 같이). 히터 TC2 의 목표선 = SV2. 실선 = 지금 값, 점선 = 목표(바뀐 목표는 계단).
// 기간 15분·1시간 = stream state 를 브라우저에 쌓은 것(useChk2 trend — 화면을 연 뒤부터), 공정 전체 = 그 run 의 1분 요약(평균).
// 글자는 그래프 안에 두지 않는다(Chk2SummaryChart 규칙): 마지막 값은 오른쪽 띠에 지시선으로, 눈금은 왼쪽·아래 띠, 범례는 위 띠.
// 한 그래프 = 단위 하나(두 축 그래프는 쓰지 않는다). 색은 정해진 순서(값과 그 목표는 같은 색 — 목표는 점선).
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { FS, FSPX, Card, Empty, Tabs } from "./kit";
import type { TrendPt } from "./useChk2";
import type { SummaryRow } from "./Chk2SummaryChart";

const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#6250d6"];
const H = 132, TOP = 22, BOTTOM = 20, LEFT = 52, RIGHT = 124;
const kstHm = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour12: false, hour: "2-digit", minute: "2-digit" });
const hm = (t: number) => kstHm.format(new Date(t)).replace(/^24/, "00");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

type Line = { key: string; label: string; color: string; dashed?: boolean; pts: { t: number; v: number | null }[]; unit: string };
type Range = "15m" | "1h" | "run";

function niceStep(span: number, n: number): number {
  const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 240].map((m) => m * 60_000);
function spread(want: number[], gap: number, lo: number, hi: number): number[] {
  const idx = want.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = new Array<number>(want.length);
  let prev = -Infinity;
  for (const o of idx) { const y = Math.max(o.y, prev + gap, lo); out[o.i] = y; prev = y; }
  const over = prev - hi;
  if (over > 0) for (let i = 0; i < out.length; i++) out[i] = Math.max(lo, out[i] - over);
  // 아래 끝을 넘어 전체를 끌어올릴 때 맨 위가 lo 에 걸리면 그 아래 라벨만 올라와 간격이 무너진다(위·아래 양쪽에 라벨 쌍 — 2026-11-19).
  // 그럴 때만: 위→아래로 간격을 벌린 값에서 아래→위로 한 번 더 맞춘다(뒤에서부터 y[i] = min(y[i], y[i+1] − 간격), 맨 아래는 hi).
  // 띠에 다 들어가는 한(layoutTrendLabels 가 먼저 확인) 모든 간격이 지켜지고 맨 위도 lo 아래로 가지 않는다. 겹침이 없던 결과는 그대로(챔버K HTML 같음).
  if (idx.every((o, k) => k === 0 || out[o.i] - out[idx[k - 1].i] >= gap - 1e-9)) return out;
  const ys: number[] = [];
  prev = -Infinity;
  for (const o of idx) { prev = Math.max(o.y, prev + gap, lo); ys.push(prev); }
  for (let k = ys.length - 1; k >= 0; k--) ys[k] = Math.min(ys[k], k === ys.length - 1 ? hi : ys[k + 1] - gap);
  idx.forEach((o, k) => { out[o.i] = Math.max(lo, ys[k]); });
  return out;
}
// 오른쪽 라벨 — 글자 줄 높이(FSPX.small 의 1.25 배)에 여유 1 px 를 더한 간격으로 띄운다(예전 14 px 는 12 px 글자의 줄 높이 15 px 보다 좁아
// 지금 값과 목표가 같으면 '20' 과 '20 목표' 가 겹쳤다 — 2026-11-19). 원래 이 간격 이상 떨어져 있던 라벨은 자리가 그대로다.
// 띠(그림 위 TOP+2 ~ 그림 아래 TOP+ph) 안에 다 못 들어가면 ① 같은 선의 지금 값·목표가 같은 글이면 한 줄로 합치고('20 · 목표 20')
// ② 그래도 모자라면 띠를 그림 아래(시간 눈금 줄 높이까지 — 오른쪽 띠라 눈금 글자와 겹치지 않음)로, ③ 그래도 모자라면 그림 높이를 늘린다.
export const LABEL_LINE = Math.ceil(FSPX.small * 1.25);
export const LABEL_GAP = LABEL_LINE + 1;
export type TrendLabelIn = { y: number; text: string; group: string; dashed: boolean };
export type TrendLabel = { y: number; text: string; dashed: boolean; members: number[] };
export function layoutTrendLabels(items: (TrendLabelIn | null)[], lo: number, hi: number, height: number): { labels: TrendLabel[]; height: number } {
  let labs: TrendLabel[] = [];
  items.forEach((it, i) => { if (it) labs.push({ y: it.y, text: it.dashed ? `${it.text} 목표` : it.text, dashed: it.dashed, members: [i] }); });
  const fits = (n: number, a: number, b: number) => n <= 1 || (n - 1) * LABEL_GAP <= b - a;
  if (!fits(labs.length, lo, hi)) {                       // ① 같은 선의 지금 값·목표가 같은 글이면 한 줄로
    const merged: TrendLabel[] = [];
    for (const l of labs) {
      const it = items[l.members[0]]!;
      const pair = merged.find((m) => {
        const a = items[m.members[0]]!;
        return m.members.length === 1 && a.group === it.group && a.dashed !== it.dashed && a.text === it.text;
      });
      if (pair) {
        pair.members.push(l.members[0]);
        pair.text = `${it.text} · 목표 ${it.text}`;
        pair.dashed = false;
        pair.y = Math.min(pair.y, l.y);
      } else merged.push({ ...l, members: [...l.members] });
    }
    labs = merged;
  }
  const top = lo;
  let bottom = hi, h = height;
  if (!fits(labs.length, top, bottom)) bottom = Math.max(bottom, height - Math.ceil(LABEL_LINE / 2));   // ② 띠를 아래로
  if (!fits(labs.length, top, bottom)) {                  // ③ 그림 높이를 늘린다
    const need = (labs.length - 1) * LABEL_GAP - (bottom - top);
    bottom += need;
    h = height + need;
  }
  const ys = spread(labs.map((l) => l.y), LABEL_GAP, top, bottom);
  return { labels: labs.map((l, i) => ({ ...l, y: ys[i] })), height: h };
}
const fmt = (v: number) => String(Number(v.toPrecision(4)));

function Panel({ title, unit, lines, t0, t1, width, hover, setHover }: {
  title: string; unit: string; lines: Line[]; t0: number; t1: number; width: number; hover: number | null; setHover: (t: number | null) => void;
}) {
  const vals = lines.flatMap((l) => l.pts.map((p) => p.v)).filter((v): v is number => v !== null);
  let hi = vals.length ? Math.max(...vals) : 1;
  if (hi <= 0) hi = 1;
  const step = niceStep(hi, 4);
  hi = Math.ceil(hi / step) * step;
  const pw = Math.max(40, width - LEFT - RIGHT), ph = H - TOP - BOTTOM;
  const x = (t: number) => LEFT + ((t - t0) / Math.max(1, t1 - t0)) * pw;
  const y = (v: number) => TOP + ph - (Math.max(0, v) / hi) * ph;
  const yTicks: number[] = [];
  for (let v = 0; v <= hi + step / 2; v += step) yTicks.push(v);
  const tStep = TIME_STEPS.find((s) => (t1 - t0) / s <= 6) ?? TIME_STEPS[TIME_STEPS.length - 1];
  const xTicks: number[] = [];
  for (let t = Math.ceil(t0 / tStep) * tStep; t <= t1; t += tStep) xTicks.push(t);
  // 선 — 빈 값·90 s 넘는 틈에서 끊는다. 목표(점선)는 계단
  const path = (l: Line) => {
    let d = "", prev: { t: number; v: number } | null = null;
    for (const p of l.pts) {
      if (p.v === null || p.t < t0 || p.t > t1) { prev = null; continue; }
      if (!prev || p.t - prev.t > 90_000) d += `M${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      else d += l.dashed ? `H${x(p.t).toFixed(1)}V${y(p.v).toFixed(1)}` : `L${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      prev = { t: p.t, v: p.v };
    }
    return d;
  };
  const lastPts = lines.map((l) => [...l.pts].reverse().find((p) => p.v !== null && p.t >= t0 && p.t <= t1) ?? null);
  const lay = layoutTrendLabels(lastPts.map((p, k) => (p ? { y: y(p.v as number), text: fmt(p.v as number), group: lines[k].color, dashed: !!lines[k].dashed } : null)),
    TOP + 2, TOP + ph, H);
  const labOf = new Map<number, TrendLabel>();
  for (const l of lay.labels) for (const m of l.members) labOf.set(m, l);
  const near = (l: Line, t: number) => {
    let best: { t: number; v: number | null } | null = null;
    for (const p of l.pts) if (p.t <= t && (!best || p.t > best.t)) best = p;
    return best && t - best.t < 120_000 ? best.v : null;
  };
  return (
    <svg width={width} height={lay.height} role="img" aria-label={`${title} 추세(${unit})`}
      onPointerLeave={() => setHover(null)}
      onPointerMove={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const px = e.clientX - r.left;
        setHover(px < LEFT || px > LEFT + pw ? null : t0 + ((px - LEFT) / pw) * (t1 - t0));
      }}>
      <text x={LEFT} y={12} fontSize={FSPX.body} fontWeight={700} fill="#1B1F24">{title}<tspan fontWeight={400} fill="#5B6470"> ({unit})</tspan></text>
      {lines.reduce<{ x: number; el: ReactElement[] }>((acc, l) => {
        const w = 18 + [...l.label].reduce((n, c) => n + (c.charCodeAt(0) > 0x2000 ? 10 : 6), 0);
        acc.el.push(
          <g key={l.key} transform={`translate(${acc.x},4)`}>
            <line x1={0} x2={12} y1={5} y2={5} stroke={l.color} strokeWidth={2} strokeDasharray={l.dashed ? "3 2" : undefined} />
            <text x={16} y={9} fontSize={FSPX.small} fill="#5B6470">{l.label}</text>
          </g>);
        acc.x += w + 10;
        return acc;
      }, { x: LEFT + 110, el: [] }).el}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={LEFT} x2={LEFT + pw} y1={y(v)} y2={y(v)} stroke="#E3E6EA" />
          <text x={LEFT - 6} y={y(v) + 3.5} fontSize={FSPX.small} fill="#5B6470" textAnchor="end">{fmt(v)}</text>
        </g>
      ))}
      <line x1={LEFT} x2={LEFT + pw} y1={TOP + ph} y2={TOP + ph} stroke="#C9CED6" />
      {xTicks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={TOP + ph} y2={TOP + ph + 4} stroke="#C9CED6" />
          <text x={x(t)} y={TOP + ph + 15} fontSize={FSPX.small} fill="#5B6470" textAnchor="middle">{hm(t)}</text>
        </g>
      ))}
      {lines.map((l) => (
        <path key={l.key} d={path(l)} fill="none" stroke={l.color} strokeWidth={l.dashed ? 1.5 : 2} strokeLinejoin="round" strokeLinecap="round"
          strokeDasharray={l.dashed ? "4 3" : undefined} opacity={l.dashed ? 0.85 : 1} />
      ))}
      {lastPts.map((p, k) => {
        const lab = labOf.get(k);
        if (!p || !lab) return null;
        const first = lab.members[0] === k;                // 합친 라벨은 글 하나 + 선마다 지시선
        return (
          <g key={lines[k].key}>
            <polyline fill="none" stroke="#C9CED6" strokeWidth={1}
              points={`${x(p.t) + 3},${y(p.v as number)} ${LEFT + pw + 8},${y(p.v as number)} ${LEFT + pw + 16},${lab.y}`} />
            {first && (
              <text x={LEFT + pw + 20} y={lab.y + 3.5} fontSize={FSPX.small} fill={lab.dashed ? "#5B6470" : "#133A7C"} fontWeight={lab.dashed ? 400 : 700}>
                {lab.members.length > 1 ? lab.text : <>{fmt(p.v as number)}{lines[k].dashed ? " 목표" : ""}</>}
              </text>
            )}
          </g>
        );
      })}
      {hover !== null && (
        <g>
          <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={TOP + ph} stroke="#5B6470" strokeDasharray="2 2" />
          <title>{`${hm(hover)} — ${lines.map((l) => `${l.label} ${near(l, hover) ?? "—"}`).join(" · ")}`}</title>
        </g>
      )}
      <rect x={LEFT} y={TOP} width={pw} height={ph} fill="transparent" />
    </svg>
  );
}

/** 그래프 하나 — 제목·단위·선([값 열, 이름, 목표 열]). 챔버12 화면은 자기 열로 만든 목록을 defs 로 넘긴다 */
export type TrendDef = { title: string; unit: string; lines: [string, string, string | null][] };
const trendDefs = (pressureTarget: string): TrendDef[] => [
  // 압력 목표선 = pressureTarget(묶음 16 은 선택된 설정점의 값 mfc.sp_sel_mtorr, 옛 장비는 mfc.sp_mtorr)
  { title: "압력", unit: "mTorr", lines: [["mfc.pressure_mtorr", "챔버 압력", pressureTarget]] },
  // 밸브 위치(묶음 15) — 압력과 단위가 달라 그림을 따로(한 그래프 = 단위 하나), 압력 바로 아래
  { title: "밸브 위치", unit: "%", lines: [["mfc.valve_pct", "MFC 밸브 위치", null]] },
  { title: "파워", unit: "W", lines: [["dc.p", "DC Power", "dc.set_w"], ["rf.fwd_w", "RF Power", "rf.set_w"], ["rfp.fwd_w", "RF Pulse", "rfp.set_w"]] },
  { title: "히터 온도", unit: "°C", lines: [["heater.pv", "TC1", "heater.sv"], ["heater.pv2", "TC2", "heater.sv2"]] },
];

export default function Chk2Trend({ trend, equipment, runId, local, nowMs, pressureTarget = "mfc.sp_mtorr", defs, title = "추세" }: {
  trend: TrendPt[]; equipment: string; runId: string | null; local: boolean; nowMs: number; pressureTarget?: string;
  defs?: TrendDef[];          // 없으면 챔버K 그래프(압력·밸브 위치·파워·히터) — 챔버12 는 챔버별 열(값이 바뀌지 않게 메모해서)
  title?: string;
}) {
  const TREND_DEFS = useMemo(() => defs ?? trendDefs(pressureTarget), [defs, pressureTarget]);
  const [range, setRange] = useState<Range>("15m");
  const [rows, setRows] = useState<SummaryRow[] | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(300, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 공정 전체 — 그 run 의 1분 요약(1분마다 다시)
  useEffect(() => {
    if (range !== "run" || !runId || local) return;
    let off = false;
    const load = async () => {
      const r = await fetch(`/api/ops2/${encodeURIComponent(equipment)}/runs/${encodeURIComponent(runId)}`, { cache: "no-store" }).catch(() => null);
      if (r?.ok && !off) setRows(((await r.json()).summaries ?? []) as SummaryRow[]);
    };
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => { off = true; clearInterval(t); };
  }, [range, runId, equipment, local]);

  const pts: { t: number; v: Record<string, number | null> }[] = useMemo(() => {
    if (range !== "run") return trend;
    return (rows ?? []).map((r) => {
      const v: Record<string, number | null> = {};
      for (const d of TREND_DEFS) for (const [a, , b] of d.lines) for (const c of [a, b]) {
        if (!c) continue;
        const s = isObj(r.stats) ? r.stats[c] : null;
        v[c] = isObj(s) && typeof s.mean === "number" ? s.mean : isObj(s) && typeof s.last === "number" ? s.last : null;
      }
      return { t: (Date.parse(r.fromTs) + Date.parse(r.toTs)) / 2, v };
    });
  }, [range, rows, trend, TREND_DEFS]);

  const lastT = pts.length ? pts[pts.length - 1].t : nowMs;
  const t1 = range === "run" ? lastT : Math.max(lastT, trend.length ? trend[trend.length - 1].t : lastT);
  const t0 = range === "15m" ? t1 - 15 * 60_000 : range === "1h" ? t1 - 3600_000 : pts.length ? pts[0].t : t1 - 60_000;
  const panels = TREND_DEFS.map((d) => {
    const lines: Line[] = [];
    d.lines.forEach(([a, label, b], i) => {
      const color = SERIES[i % SERIES.length];
      const ap = pts.map((p) => ({ t: p.t, v: p.v[a] ?? null }));
      const bp = b ? pts.map((p) => ({ t: p.t, v: p.v[b] ?? null })) : [];
      const used = ap.some((p) => (p.v ?? 0) > 0) || bp.some((p) => (p.v ?? 0) > 0);
      if (!used) return;
      lines.push({ key: a, label, color, pts: ap, unit: d.unit });
      if (b && bp.some((p) => p.v !== null)) lines.push({ key: b, label: `${label} 목표`, color, dashed: true, pts: bp, unit: d.unit });
    });
    return { ...d, lines };
  }).filter((p) => p.lines.length > 0);

  const tabs: { key: Range; label: string }[] = [{ key: "15m", label: "15분" }, { key: "1h", label: "1시간" },
    ...(!local && runId ? [{ key: "run" as Range, label: "공정 전체" }] : [])];
  return (
    <Card title={title} right={<div className="w-56"><Tabs small tabs={tabs} value={range} onChange={setRange} /></div>}>
      <div ref={box} className="min-w-0">
        {range !== "run" && <p className={`mb-1 ${FS.small} text-[#5B6470]`}>이 화면을 연 뒤부터 쌓은 값입니다(2초 간격).</p>}
        {range === "run" && rows === null ? <Empty>1분 요약을 읽는 중…</Empty>
          : !panels.length ? <Empty>그릴 값이 없습니다. 이번 공정이 쓰는 압력·파워·히터 값이 들어오면 그립니다</Empty>
          : panels.map((p) => <Panel key={p.title} title={p.title} unit={p.unit} lines={p.lines} t0={t0} t1={t1} width={width} hover={hover} setHover={setHover} />)}
      </div>
    </Card>
  );
}
