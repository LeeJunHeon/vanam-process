"use client";

// 챔버12 RGA·OES 그래프 — v1 controller/graph_controller.py(update_rga_plot 170-258 · update_oes_plot 260-346 · reset 348-395) 자리.
// RGA: 장비 rga data 사건(드라이버 v2/ch12/drivers/rga_link.py — {mass_axis, pressures, meta}, 스캔마다 1번)의 마지막 것을 그린다.
//   v1 축: x 'Atomic Mass' 0~65(눈금 14, '%d'), y 'Partial Pressure' 로그축 1e-11~1e-5 Torr('%.0e'), 빨간 점(6)+빨간 세로선(바닥→값).
//   비유한값·x 범위 밖·y≤0 점은 버리고, 점이 없으면 그리지 않는다(마지막 그림 유지).
// OES: 장비 state.spectra[챔버](링크가 v1 거르기·OES_PLOT_MIN_INTERVAL_S 0.5 s 쓰로틀·512점 솎기 — drivers/oes_spectrum.py — 를 한 것,
//   허브가 마지막 것만 둔다). v1 축: x 'Wavelength (nm)' 100~1200(100 간격 눈금), y 'Intensity' 0~16000(눈금 9, '%d'), 빨간 선 굵기 1.
//   유효 점 2개 미만이면 그리지 않음(빈 축).
// 지우기(v1 그대로): 공정 시작·끝(graph.reset — 그 챔버 run_start·run_end 뒤의 값만), RGA 스캔 시작(clear_rga_plot — '[RGA] 스캔 시작'
//   상태 사건 뒤의 값만), OES 측정 시작(clear_oes_plot — 장비가 state.spectra 를 비움). 지운 뒤에도 빈 축은 보인다(v1 위젯은 늘 있음).
import { Card } from "../chk/kit";
import type { FeedItem } from "../chk/useChk2";
import type { Ch12State } from "./types";

export const RGA_X = [0, 65] as const;
export const RGA_Y = [1e-11, 1e-5] as const;
export const OES_X = [100, 1200] as const;
export const OES_Y = [0, 16000] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** 마지막 rga data 사건의 유효 점(v1 규칙) — 없거나 그 뒤에 지우는 계기(공정 시작·끝, 스캔 시작)가 있으면 null */
export function rgaPoints(feed: FeedItem[], ch: string): { x: number; y: number }[] | null {
  for (let i = feed.length - 1; i >= 0; i--) {
    const it = feed[i];
    const d = it.data as Obj;
    if ((it.type === "run_start" || it.type === "run_end") && d.chamber === ch) return null;      // v1 graph.reset
    const c = isObj(d.context) ? d.context : null;
    if (it.type !== "event" || !c || c.source !== "rga" || c.chamber !== ch) continue;
    if (c.kind === "status" && typeof d.message === "string" && d.message.startsWith("[RGA] 스캔 시작")) return null;  // clear_rga_plot
    if (c.kind !== "data") continue;
    const cd = isObj(c.data) ? c.data : {};
    const xs = Array.isArray(cd.mass_axis) ? cd.mass_axis : [], ys = Array.isArray(cd.pressures) ? cd.pressures : [];
    const pts = xs.map((x, k) => ({ x: Number(x), y: Number(ys[k]) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= RGA_X[0] && p.x <= RGA_X[1] && p.y > 0);
    return pts.length ? pts : null;
  }
  return null;
}

/** state.spectra[ch] 의 유효 점(v1 update_oes_plot 거르기 — 비유한·x 범위 밖 버림, x 정렬, 2점 미만 null) */
export function oesPoints(st: Ch12State | null, ch: string): { x: number; y: number }[] | null {
  const sp = (st as (Ch12State & { spectra?: Record<string, unknown> }) | null)?.spectra?.[ch];
  if (!isObj(sp) || !Array.isArray(sp.x) || !Array.isArray(sp.y)) return null;
  const ys = sp.y as unknown[];
  const n = Math.min(sp.x.length, ys.length);
  const pts = (sp.x as unknown[]).slice(0, n).map((x, k) => ({ x: Number(x), y: Number(ys[k]) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= OES_X[0] && p.x <= OES_X[1])
    .sort((a, b) => a.x - b.x);
  return pts.length >= 2 ? pts : null;
}

const W = 520, H = 220, ML = 56, MR = 14, MT = 12, MB = 34;
const sx = (x: number) => ML + ((x - RGA_X[0]) / (RGA_X[1] - RGA_X[0])) * (W - ML - MR);
const sy = (y: number) => {
  const l = Math.log10(Math.min(Math.max(y, RGA_Y[0]), RGA_Y[1]));
  return MT + ((Math.log10(RGA_Y[1]) - l) / (Math.log10(RGA_Y[1]) - Math.log10(RGA_Y[0]))) * (H - MT - MB);
};
const ox = (x: number) => ML + ((x - OES_X[0]) / (OES_X[1] - OES_X[0])) * (W - ML - MR);
const oy = (y: number) => MT + ((OES_Y[1] - Math.min(Math.max(y, OES_Y[0]), OES_Y[1])) / (OES_Y[1] - OES_Y[0])) * (H - MT - MB);

function Axes({ xt, yt, xl, yl, xs, ys }: {
  xt: { v: number; t: string }[]; yt: { v: number; t: string }[]; xl: string; yl: string; xs: (x: number) => number; ys: (y: number) => number;
}) {
  return (
    <>
      {yt.map((e) => (
        <g key={`y${e.v}`}>
          <line x1={ML} x2={W - MR} y1={ys(e.v)} y2={ys(e.v)} stroke="#e5e7eb" />
          <text x={ML - 4} y={ys(e.v) + 3} textAnchor="end" fontSize="9" fill="#374151">{e.t}</text>
        </g>
      ))}
      {xt.map((e) => (
        <g key={`x${e.v}`}>
          <line x1={xs(e.v)} x2={xs(e.v)} y1={MT} y2={H - MB} stroke="#f3f4f6" />
          <text x={xs(e.v)} y={H - MB + 12} textAnchor="middle" fontSize="9" fill="#374151">{e.t}</text>
        </g>
      ))}
      <line x1={ML} x2={ML} y1={MT} y2={H - MB} stroke="#111827" />
      <line x1={ML} x2={W - MR} y1={H - MB} y2={H - MB} stroke="#111827" />
      <text x={(ML + W - MR) / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="#111827">{xl}</text>
      <text x={10} y={(MT + H - MB) / 2} textAnchor="middle" fontSize="9" fill="#111827"
        transform={`rotate(-90 10 ${(MT + H - MB) / 2})`}>{yl}</text>
    </>
  );
}

export function RgaChart({ feed, ch }: { feed: FeedItem[]; ch: string }) {
  const pts = rgaPoints(feed, ch);
  if (!pts) return null;
  const xt = Array.from({ length: 14 }, (_, k) => Math.round((k * (RGA_X[1] - RGA_X[0])) / 13)).map((v) => ({ v, t: String(v) }));
  const yt = [-11, -10, -9, -8, -7, -6, -5].map((e) => ({ v: 10 ** e, t: `1e${e}` }));
  return (
    <Card title="RGA">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="RGA Partial Pressure">
        <Axes xt={xt} yt={yt} xl="Atomic Mass" yl="Partial Pressure" xs={sx} ys={sy} />
        {pts.map((p, k) => (
          <g key={k}>
            <line x1={sx(p.x)} x2={sx(p.x)} y1={sy(RGA_Y[0])} y2={sy(p.y)} stroke="#dc2626" />
            <circle cx={sx(p.x)} cy={sy(p.y)} r="3" fill="#dc2626" />
          </g>
        ))}
      </svg>
    </Card>
  );
}

/** OES 스펙트럼(빈 축은 늘 — v1 위젯) */
export function OesChart({ st, ch }: { st: Ch12State | null; ch: string }) {
  const pts = oesPoints(st, ch);
  const xt = Array.from({ length: 12 }, (_, k) => 100 + k * 100).map((v) => ({ v, t: String(v) }));
  const yt = Array.from({ length: 9 }, (_, k) => k * 2000).map((v) => ({ v, t: String(v) }));
  const path = pts ? pts.map((p, k) => `${k ? "L" : "M"}${ox(p.x).toFixed(1)} ${oy(p.y).toFixed(1)}`).join("") : "";
  return (
    <Card title="OES" right={<span className="text-[10px] text-gray-400">{pts ? `${pts.length}점` : "값 없음"}</span>}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="OES Intensity">
        <Axes xt={xt} yt={yt} xl="Wavelength (nm)" yl="Intensity" xs={ox} ys={oy} />
        {pts && <path d={path} fill="none" stroke="#dc2626" strokeWidth="1" data-oes-line="" />}
      </svg>
    </Card>
  );
}

/** RGA 옆 OES — 챔버 칸에 함께(RGA 는 값이 있을 때만, OES 는 빈 축도) */
export function Spectra({ feed, st, ch }: { feed: FeedItem[]; st: Ch12State | null; ch: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
      <RgaChart feed={feed} ch={ch} />
      <OesChart st={st} ch={ch} />
    </div>
  );
}
