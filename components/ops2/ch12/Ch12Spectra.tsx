"use client";

// 챔버12 RGA 그래프 — v1 controller/graph_controller.py update_rga_plot(50-102·170-258) 자리. 장비 rga data 사건(드라이버
// v2/ch12/drivers/rga_link.py — {mass_axis, pressures, meta}, 스캔마다 1번)의 마지막 것을 그린다.
// v1 축: x 'Atomic Mass' 0~65(눈금 14, '%d'), y 'Partial Pressure' 로그축 1e-11~1e-5 Torr('%.0e'), 빨간 점(6)+빨간 세로선(바닥→값).
// 비유한값·x 범위 밖·y≤0 점은 버리고, 점이 없으면 그리지 않는다(마지막 그림 유지 — 여기서는 '값 없음').
// OES 스펙트럼 그래프는 장비가 스펙트럼을 웹으로 보내지 않아 없다(전수 목록 UI-098 결정 후보).
import { Card } from "../chk/kit";
import type { FeedItem } from "../chk/useChk2";

export const RGA_X = [0, 65] as const;
export const RGA_Y = [1e-11, 1e-5] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** 마지막 rga data 사건의 유효 점(v1 규칙) — 없으면 null */
export function rgaPoints(feed: FeedItem[], ch: string): { x: number; y: number }[] | null {
  for (let i = feed.length - 1; i >= 0; i--) {
    const d = feed[i].data as Obj;
    const c = isObj(d.context) ? d.context : null;
    if (feed[i].type !== "event" || !c || c.source !== "rga" || c.kind !== "data" || c.chamber !== ch) continue;
    const cd = isObj(c.data) ? c.data : {};
    const xs = Array.isArray(cd.mass_axis) ? cd.mass_axis : [], ys = Array.isArray(cd.pressures) ? cd.pressures : [];
    const pts = xs.map((x, k) => ({ x: Number(x), y: Number(ys[k]) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= RGA_X[0] && p.x <= RGA_X[1] && p.y > 0);
    return pts.length ? pts : null;
  }
  return null;
}

const W = 520, H = 220, ML = 56, MR = 14, MT = 12, MB = 34;
const sx = (x: number) => ML + ((x - RGA_X[0]) / (RGA_X[1] - RGA_X[0])) * (W - ML - MR);
const sy = (y: number) => {
  const l = Math.log10(Math.min(Math.max(y, RGA_Y[0]), RGA_Y[1]));
  return MT + ((Math.log10(RGA_Y[1]) - l) / (Math.log10(RGA_Y[1]) - Math.log10(RGA_Y[0]))) * (H - MT - MB);
};

export function RgaChart({ feed, ch }: { feed: FeedItem[]; ch: string }) {
  const pts = rgaPoints(feed, ch);
  if (!pts) return null;
  const xt = Array.from({ length: 14 }, (_, k) => Math.round((k * (RGA_X[1] - RGA_X[0])) / 13));
  const yt = [-11, -10, -9, -8, -7, -6, -5];
  return (
    <Card title="RGA">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="RGA Partial Pressure">
        {yt.map((e) => (
          <g key={e}>
            <line x1={ML} x2={W - MR} y1={sy(10 ** e)} y2={sy(10 ** e)} stroke="#e5e7eb" />
            <text x={ML - 4} y={sy(10 ** e) + 3} textAnchor="end" fontSize="9" fill="#374151">{`1e${e}`}</text>
          </g>
        ))}
        {xt.map((x) => (
          <text key={x} x={sx(x)} y={H - MB + 12} textAnchor="middle" fontSize="9" fill="#374151">{x}</text>
        ))}
        <line x1={ML} x2={ML} y1={MT} y2={H - MB} stroke="#111827" />
        <line x1={ML} x2={W - MR} y1={H - MB} y2={H - MB} stroke="#111827" />
        {pts.map((p, k) => (
          <g key={k}>
            <line x1={sx(p.x)} x2={sx(p.x)} y1={sy(RGA_Y[0])} y2={sy(p.y)} stroke="#dc2626" />
            <circle cx={sx(p.x)} cy={sy(p.y)} r="3" fill="#dc2626" />
          </g>
        ))}
        <text x={(ML + W - MR) / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="#111827">Atomic Mass</text>
        <text x={10} y={(MT + H - MB) / 2} textAnchor="middle" fontSize="9" fill="#111827"
          transform={`rotate(-90 10 ${(MT + H - MB) / 2})`}>Partial Pressure</text>
      </svg>
    </Card>
  );
}
