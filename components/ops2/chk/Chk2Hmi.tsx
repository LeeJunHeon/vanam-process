"use client";

// 챔버K v2 HMI 탭 — 계통도(W-10b 다시 정리). 그림(SVG) + 맨 오른쪽 세로 '값' 패널(HTML).
//   그림: 왼쪽 가스 줄(Ar·O₂ MFC 상자 실제/설정 sccm → 차단밸브 → 챔버) · 가운데 챔버 · 오른쪽 Vent · 아래 배기(MV → Turbo → FV → Rotary,
//   RV 우회). 챔버 안에는 구조만(Gun1·Gun2·셔터 S1·S2·Main 셔터·기판 히터 자리) + 짧은 상태 글. 숫자 값은 제자리에:
//   MFC 상자 = 실제/설정, 챔버 옆 작은 상자 = 챔버 압력, 챔버 벽 게이지 기호 → 이온 게이지 상자 = 이온·A·B, 기판 히터 자리 = TC1 크게·TC2·목표·제어 방식.
//   패널: 파워(DC Power·RF Power·RF Pulse — 값·출력 상태·사용 안 함), 유틸리티 램프, 이오나이저(켜기/끄기·구동·점등·수명 초과), MV 인터록.
// 그림은 탭 폭을 채우고(비율 유지), 글자는 kit 글자 체계 px 그대로(그림 배율을 재서 글자 크기를 되돌림 — 화면 폭이 달라도 14px·12px).
// 기호는 2D 평면: 밸브 = 나비(모두 같은 크기), 펌프 = 원(같은 크기), 셔터 = 막대. 켜짐·열림 = 진회색 채움, 꺼짐·닫힘 = 흰 바탕 테두리.
//   배관 선 굵기 하나 — 그 구간을 여닫는 밸브·펌프가 켜진 구간만 진회색. 전환 중 = 파란 점선 + '전환 중'(10 s — 부르는 쪽 pending).
//   이상만 주의색 + 아이콘(이온 게이지 연결 안 됨 등·이오나이저 수명 초과). 인터록 비트는 켜짐/꺼짐 표시만.
// 노드 이름 아래 지금 상태 글. 누를 수 있는 노드는 마우스를 올리면 테두리 강조 + 손가락 커서, 누를 수 없으면 기본 커서.
// 누르면 확인창 → PLC_BUTTON(도어·Vent 는 위험 문구). 키보드 Tab·Enter·Space, 노드마다 aria-label.
//   잠기면(권한·bench·PLC 값 오래됨·끊김·로컬 화면) 누르지 못하고 이유를 그림 위 한 줄에 — PLC 값이 오래되면 그림 전체를 흐리게.
// 노드 상태 = snapshot plc.<addr>(묶음 plcButtons addr — 이오나이저만 target 과 다르다: ion_remote_on).
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { Btn, Card, Chip, Dot, FS, FSPX, StateBox, T, type Ask } from "./kit";
import { fieldText } from "./text";
import type { Bundle, FieldDef, Link } from "./types";

const DANGER = new Set(["vent", "door_up", "door_down"]);
const FONT = "Pretendard, system-ui, sans-serif";
const VB_W = 1100, VB_H = 560;

type Props = {
  bundle: Bundle | null;
  snapshot?: Record<string, unknown>;
  links?: Record<string, Link>;            // 장비 블록 품질(파워 '사용 안 함')
  plcOk: boolean;                          // PLC 값을 믿을 수 있음(나이 기준)
  lockOf: (target: string) => string | null;   // PLC 버튼 잠금 이유(권한·bench·끊김·결과 기다림·PLC 오래됨)
  pending: Record<string, boolean>;        // target → 바라는 값(전환 중)
  onAsk: (a: Ask) => void;
  note: string;                            // 그림 위 한 줄(잠금 이유·안내)
  viewOnly: boolean;                       // 노트북 로컬 화면 — 보기만
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const f5 = (v: number | null) => (v === null ? "—" : String(Number(v.toPrecision(5))));

const MAX_SCALE = 1.12;
/** 그림 배율(그려진 폭 / viewBox 폭) — 글자를 px 그대로 두려고 잰다. 넓은 화면에서는 배율을 MAX_SCALE 로 묶고(세로로 너무 길지 않게)
 *  남는 폭(spread — 그림 단위, 한쪽)만큼 왼쪽 가스 줄·오른쪽 Vent·이온 게이지를 바깥으로 벌려 탭 폭을 채운다 */
function useScale() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [v, setV] = useState({ s: 1, spread: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const s0 = w / VB_W;
      setV(s0 <= MAX_SCALE ? { s: Math.max(0.5, s0), spread: 0 } : { s: MAX_SCALE, spread: Math.round((w / MAX_SCALE - VB_W) / 2) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, v.s, v.spread] as const;
}

export default function Chk2Hmi({ bundle, snapshot: snap, links, plcOk, lockOf, pending, onAsk, note, viewOnly }: Props) {
  const [wrap, scale, P] = useScale();
  const px = (n: number) => n / scale;     // 화면 px → 그림 단위
  const buttons = bundle?.plcButtons ?? [];
  const btn = (t: string) => buttons.find((b) => b.target === t);
  const raw = (t: string) => snap?.[`plc.${btn(t)?.addr ?? t}`];
  const on = (t: string) => plcOk && raw(t) === true;
  const wait = (t: string) => plcOk && pending[t] !== undefined && pending[t] !== (raw(t) === true);
  const why = (t: string) => (viewOnly ? "보기만 — PLC 버튼은 웹에서만" : !btn(t) ? "장비 정의에 없는 버튼" : lockOf(t));
  const press = (t: string) => {
    const b = btn(t);
    if (!b || why(t)) return;
    const want = !(raw(t) === true);
    onAsk({ kind: "PLC_BUTTON", label: b.label, detail: want ? "→ 켜기·열기" : "→ 끄기·닫기", args: { target: t, on: want },
            danger: DANGER.has(t), plc: { target: t, want } });
  };
  const keys = (t: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); press(t); }
  };
  /** 지금 상태 글 — 밸브·셔터·도어 = 열림/닫힘, 펌프 = 켜짐/꺼짐 */
  const stateWord = (t: string, kind: "open" | "run") =>
    !plcOk ? "—" : wait(t) ? "전환 중" : on(t) ? (kind === "open" ? "열림" : "켜짐") : (kind === "open" ? "닫힘" : "꺼짐");
  /** 누를 수 있는 노드 묶음(키보드·aria·마우스 올리면 테두리 강조) */
  const node = (t: string, label: string, kind: "open" | "run", children: ReactNode) => {
    const w = why(t);
    const state = stateWord(t, kind);
    return (
      <g role="button" tabIndex={w ? -1 : 0} aria-disabled={!!w} aria-label={`${label} — ${state}${w ? ` (잠김: ${w})` : " — 눌러서 바꾸기"}`}
        onClick={() => press(t)} onKeyDown={keys(t)} style={{ cursor: w ? "default" : "pointer", outline: "none" }}
        className={w ? "" : "[&:focus-visible>.ring]:opacity-100 [&:hover>.ring]:opacity-100"}>
        <title>{`${btn(t)?.label ?? label} · ${state}${w ? ` · 잠김: ${w}` : ""}`}</title>
        {children}
      </g>
    );
  };
  const fill = (t: string) => (on(t) ? T.on : "#FFFFFF");
  const stroke = (t: string) => (wait(t) ? T.primary : on(t) ? T.on : T.off);
  const dash = (t: string) => (wait(t) ? "4 3" : undefined);
  const ink = (t: string) => (on(t) ? "#FFFFFF" : T.text);
  const stateFill = (t: string) => (wait(t) ? T.primary : T.muted);
  const label = (x: number, y: number, name: string, anchor: "start" | "middle" | "end" = "middle", color: string = T.text) => (
    <text x={x} y={y} textAnchor={anchor} fontSize={px(FSPX.body)} fontWeight={700} fill={color} fontFamily={FONT}>{name}</text>
  );
  const small = (x: number, y: number, text: string, anchor: "start" | "middle" | "end" = "middle", color: string = T.muted) => (
    <text x={x} y={y} textAnchor={anchor} fontSize={px(FSPX.small)} fill={color} fontFamily={FONT}>{text}</text>
  );
  /** 이름 + 아래 상태 글(글자 높이만큼 아래로) */
  const named = (x: number, y: number, t: string, name: string, kind: "open" | "run", anchor: "start" | "middle" | "end" = "middle") => (
    <>{label(x, y, name, anchor)}{small(x, y + px(16), stateWord(t, kind), anchor, stateFill(t))}</>
  );

  /** 나비 밸브 — (x, y) 가운데, 모두 같은 크기. vertical 이면 세로 배관. 이름 자리는 side */
  const valve = (t: string, x: number, y: number, name: string, vertical = false, side: "below" | "right" | "above" = "below") => {
    const [lx, ly, anchor] = side === "right" ? [x + 24, y - 2, "start" as const] : side === "above" ? [x, y - 20 - px(18), "middle" as const] : [x, y + 22 + px(12), "middle" as const];
    return node(t, name, "open", <>
      <rect className="ring" x={x - 20} y={y - 20} width={40} height={40} rx={8} fill="none" stroke={T.primary} strokeWidth={2} opacity={0} />
      <path d={vertical ? `M${x - 10},${y - 14} L${x + 10},${y + 14} L${x - 10},${y + 14} L${x + 10},${y - 14} Z`
        : `M${x - 14},${y - 10} L${x + 14},${y + 10} L${x + 14},${y - 10} L${x - 14},${y + 10} Z`}
        fill={fill(t)} stroke={stroke(t)} strokeWidth={2} strokeDasharray={dash(t)} strokeLinejoin="round" />
      {named(lx, ly, t, name, "open", anchor)}
    </>);
  };
  /** 펌프 — 원(같은 크기) 안 삼각형(펌프 기호), 이름·상태 글은 원 아래 */
  const pump = (t: string, x: number, y: number, name: string) => (
    node(t, name, "run", <>
      <circle className="ring" cx={x} cy={y} r={29} fill="none" stroke={T.primary} strokeWidth={2} opacity={0} />
      <circle cx={x} cy={y} r={24} fill={fill(t)} stroke={stroke(t)} strokeWidth={2} strokeDasharray={dash(t)} />
      <path d={`M${x - 9},${y - 13} L${x + 13},${y} L${x - 9},${y + 13} Z`} fill="none" stroke={ink(t)} strokeWidth={2} strokeLinejoin="round" />
      {named(x, y + 24 + px(16), t, name, "run")}
    </>)
  );
  /** 셔터 — 막대, 아래 이름·상태 */
  const shutter = (t: string, x: number, y: number, w: number, name: string) => (
    node(t, name, "open", <>
      <rect className="ring" x={x - 5} y={y - 6} width={w + 10} height={22} rx={6} fill="none" stroke={T.primary} strokeWidth={2} opacity={0} />
      <rect x={x} y={y} width={w} height={10} rx={3} fill={fill(t)} stroke={stroke(t)} strokeWidth={2} strokeDasharray={dash(t)} />
      <text x={x + w / 2} y={y + 12 + px(15)} textAnchor="middle" fontSize={px(FSPX.body)} fontFamily={FONT}>
        <tspan fontWeight={700} fill={T.text}>{name}</tspan>
        <tspan fontSize={px(FSPX.small)} fill={stateFill(t)}> {stateWord(t, "open")}</tspan>
      </text>
    </>)
  );
  /** 도어 버튼 — 사각, 안에 이름 + 상태 */
  const door = (t: string, x: number, y: number, name: string) => (
    node(t, name, "open", <>
      <rect className="ring" x={x - 4} y={y - 4} width={118} height={54} rx={10} fill="none" stroke={T.primary} strokeWidth={2} opacity={0} />
      <rect x={x} y={y} width={110} height={46} rx={8} fill={fill(t)} stroke={stroke(t)} strokeWidth={2} strokeDasharray={dash(t)} />
      <text x={x + 55} y={y + 21} textAnchor="middle" fontSize={px(FSPX.body)} fontWeight={700} fill={ink(t)} fontFamily={FONT}>{name}</text>
      <text x={x + 55} y={y + 21 + px(16)} textAnchor="middle" fontSize={px(FSPX.small)} fill={on(t) ? "#FFFFFF" : stateFill(t)} fontFamily={FONT}>
        {stateWord(t, "run")}
      </text>
    </>)
  );
  const pipe = (d: string, live: boolean) => (
    <path d={d} fill="none" stroke={live ? T.on : T.pipe} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
  );
  const fieldOf = (col: string): FieldDef | undefined => bundle?.snapshot?.blocks?.flatMap((b) => b.fields).find((f) => f.column === col);
  /** 값 하나 — 값(남색)·단위(12px), 값이 없으면 상태 이름(이상만 주의색 + ⚠) */
  const valTxt = (col: string) => {
    const f = fieldOf(col);
    if (!f) return { text: "—", unit: "", color: T.off };
    const t = fieldText(f, snap?.[col], snap, bundle?.snapshot?.blocks);
    if (t.text) return { text: t.text, unit: f.unit, color: T.value };
    if (t.alt) return { text: t.warn ? `⚠ ${t.alt}` : t.alt, unit: "", color: t.warn ? T.warn : T.text };
    return { text: "—", unit: "", color: T.off };
  };
  /** 상자 안 라벨 — 값 한 줄(라벨 왼쪽 보조색, 값 오른쪽 끝) */
  const kv = (x: number, x2: number, y: number, name: string, col: string, size = FSPX.body) => {
    const v = valTxt(col);
    return (
      <g>
        <text x={x} y={y} fontSize={px(FSPX.body)} fill={T.muted} fontFamily={FONT}>{name}</text>
        <text x={x2} y={y} textAnchor="end" fontFamily={FONT}>
          <tspan fontSize={px(size)} fontWeight={700} fill={v.color}>{v.text}</tspan>
          {v.unit && <tspan fontSize={px(FSPX.small)} fill={T.muted}> {v.unit}</tspan>}
        </text>
      </g>
    );
  };
  const box = (x: number, y: number, w: number, h: number, title: string, children: ReactNode, tone: "white" | "grey" = "white") => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={tone === "white" ? "#FFFFFF" : "#F5F6F8"} stroke={T.border} strokeWidth={1.5} />
      <text x={x + 12} y={y + 8 + px(14)} fontSize={px(FSPX.body)} fontWeight={700} fill={T.text} fontFamily={FONT}>{title}</text>
      {children}
    </g>
  );
  const mfcBox = (x: number, y: number, name: string, act: string, set: string) => box(x, y, 190, 8 + px(14) + px(22) + px(12), `${name} MFC`, (
    <text x={x + 12} y={y + 8 + px(14) + px(22)} fontFamily={FONT}>
      <tspan fontSize={px(15)} fontWeight={700} fill={T.value}>{f5(num(snap?.[act]))}</tspan>
      <tspan fontSize={px(FSPX.body)} fill={T.muted}> / {f5(num(snap?.[set]))}</tspan>
      <tspan fontSize={px(FSPX.small)} fill={T.muted}> sccm</tspan>
    </text>
  ));
  const casc = fieldOf("heater.casc_state"), mode = fieldOf("heater.ctrl_mode");
  const cs = snap?.["heater.casc_state"], cm = snap?.["heater.ctrl_mode"];
  const ctrl = typeof cs === "string" && cs && cs !== "idle" ? casc?.enumLabels?.[cs] ?? cs
    : typeof cm === "string" && cm ? mode?.enumLabels?.[cm] ?? cm : "—";
  const tc1 = valTxt("heater.pv"), tc2 = valTxt("heater.pv2");
  // 묶음 15 — tc2(TC2 단독 제어): TC1 은 기록, 편차는 TC2 − SV2. TC2 PID 두 모드(tc2·cascade)에서 TC2 아래 TC2 목표(SV2)
  const tc2Only = cm === "tc2", tc2Pid = cm === "tc2" || cm === "cascade";
  const hSv = valTxt("heater.sv"), hSv2 = valTxt("heater.sv2");
  const hDev = tc2Only && num(snap?.["heater.pv2"]) !== null && num(snap?.["heater.sv2"]) !== null
    ? (num(snap?.["heater.pv2"]) as number) - (num(snap?.["heater.sv2"]) as number) : null;
  /** 히터 온도 한 칸 — 이름(작게, 옆에 붙임말) · 값(TC1·TC2 같은 크기) · 아래 작은 줄 */
  const tcCell = (x: number, y: number, name: string, tag: string, v: { text: string; unit: string; color: string }, under: string) => (
    <g>
      <text x={x} y={y + px(16)} fontFamily={FONT}>
        <tspan fontSize={px(FSPX.body)} fill={T.muted}>{name}</tspan>
        {tag && <tspan fontSize={px(FSPX.small)} fill={T.muted}> · {tag}</tspan>}
      </text>
      <text x={x} y={y + px(40)} fontFamily={FONT}>
        <tspan fontSize={px(FSPX.title)} fontWeight={700} fill={v.color}>{v.text}</tspan>
        {v.unit && <tspan fontSize={px(FSPX.small)} fill={T.muted}> {v.unit}</tspan>}
      </text>
      {under && <text x={x} y={y + px(58)} fontSize={px(FSPX.small)} fill={T.muted} fontFamily={FONT}>{under}</text>}
    </g>
  );

  // 그림 좌표(viewBox 1100 × 560) — 챔버 430~730 × 66~400. 상자 높이는 글자(px)에 맞춘다 — 기판 히터는 챔버 바닥에 붙임
  const CX = 580;
  const HY = Math.max(240, 392 - (px(20) + px(98) + px(14)));
  const IGH = 8 + px(14) + px(74) + px(14);
  return (
    <Card title="계통도" right={<span className={`flex items-center gap-1 ${FS.small} ${note.includes("잠금") ? "font-semibold text-[#B54708]" : "text-[#5B6470]"}`}>
      {note.includes("잠금") && <Lock size={12} />}{note}</span>}>
      <div className={`@container ${plcOk ? "" : "opacity-50"}`}>
        <div className="flex flex-col gap-4 @[1100px]:flex-row @[1100px]:items-start">
          <div ref={wrap} className="min-w-0 flex-1 pt-2">
            <svg viewBox={`${-P} 0 ${VB_W + 2 * P} ${VB_H}`} className="block h-auto w-full select-none" role="group" aria-label="챔버K v2 계통도">
              {/* 배관(선 굵기 하나 — 열린 구간만 진회색) */}
              {pipe(`M${220 - P},130 H430`, on("ar_valve"))}
              {pipe(`M${220 - P},226 H430`, on("o2_valve"))}
              {pipe(`M730,130 H${880 + P}`, on("vent"))}
              {pipe("M520,400 V458", on("mv"))}
              {pipe("M544,482 H626", on("turbo"))}
              {pipe("M654,482 H740", on("fv"))}
              {pipe("M740,400 V482", on("rv"))}
              {pipe("M740,482 H826", on("rotary"))}
              {pipe(`M${400 - P / 2},328 H430`, false)}
              {pipe(`M758,330 H${800 + P / 2}`, false)}
              {/* 챔버 — 구조만 */}
              <rect x={430} y={66} width={300} height={334} rx={14} fill="#FFFFFF" stroke={T.on} strokeWidth={2} />
              {label(CX, 66 + px(20), "Chamber")}
              <rect x={455} y={100} width={110} height={34} rx={6} fill="#F5F6F8" stroke={T.border} />
              {label(510, 117 + px(5), "Gun1")}
              <rect x={595} y={100} width={110} height={34} rx={6} fill="#F5F6F8" stroke={T.border} />
              {label(650, 117 + px(5), "Gun2")}
              {shutter("s1", 465, 146, 90, "S1")}
              {shutter("s2", 605, 146, 90, "S2")}
              {shutter("ms", 475, 196, 210, "Main 셔터")}
              {/* 기판 히터 자리 — TC1 · TC2 같은 크기로 나란히(목표는 각각 아래 작게 — TC2 아래는 SV2) · 편차(TC2 단독 제어) · 제어 방식 */}
              <rect x={455} y={HY} width={250} height={392 - HY} rx={8} fill="#F5F6F8" stroke={T.border} />
              {label(467, HY + px(20), "기판 히터", "start")}
              {tcCell(467, HY + px(20), "TC1", tc2Only ? "기록" : "", tc1,
                hSv.unit ? `목표 ${hSv.text} ${hSv.unit}` : "")}
              {tcCell(585, HY + px(20), "TC2", "", tc2,
                tc2Pid && hSv2.unit ? `목표 ${hSv2.text} ${hSv2.unit}` : "")}
              {hDev !== null && (
                <g>
                  <text x={467} y={HY + px(20) + px(78)} fontSize={px(FSPX.body)} fill={T.muted} fontFamily={FONT}>편차(TC2)</text>
                  <text x={693} y={HY + px(20) + px(78)} textAnchor="end" fontFamily={FONT}>
                    <tspan fontSize={px(FSPX.body)} fontWeight={700} fill={T.value}>{`${hDev >= 0 ? "+" : "−"}${Math.abs(hDev).toFixed(1)}`}</tspan>
                    <tspan fontSize={px(FSPX.small)} fill={T.muted}> °C</tspan>
                  </text>
                </g>
              )}
              <text x={467} y={HY + px(20) + px(98)} fontSize={px(FSPX.body)} fill={T.muted} fontFamily={FONT}>제어</text>
              <text x={693} y={HY + px(20) + px(98)} textAnchor="end" fontSize={px(FSPX.body)} fontWeight={600} fill={T.text} fontFamily={FONT}>{ctrl}</text>
              {/* 챔버 압력(챔버 옆 작은 상자) */}
              {box(240 - P / 2, 328 - (8 + px(14) + px(24) + px(10)) / 2, 160, 8 + px(14) + px(24) + px(10), "챔버 압력", (() => {
                const v = valTxt("mfc.pressure_mtorr");
                return (
                  <text x={252 - P / 2} y={328 - (8 + px(14) + px(24) + px(10)) / 2 + 8 + px(14) + px(24)} fontFamily={FONT}>
                    <tspan fontSize={px(16)} fontWeight={700} fill={v.color}>{v.text}</tspan>
                    {v.unit && <tspan fontSize={px(FSPX.small)} fill={T.muted}> {v.unit}</tspan>}
                  </text>
                );
              })())}
              {/* 이온 게이지 — 챔버 벽 게이지 기호 → 상자 */}
              <circle cx={744} cy={330} r={14} fill="#FFFFFF" stroke={T.on} strokeWidth={2} />
              <text x={744} y={330 + px(4)} textAnchor="middle" fontSize={px(FSPX.small)} fontWeight={700} fill={T.text} fontFamily={FONT}>IG</text>
              {box(800 + P / 2, 330 - IGH / 2, 220, IGH, "이온 게이지", <>
                {kv(812 + P / 2, 1008 + P / 2, 330 - IGH / 2 + 8 + px(14) + px(26), "이온", "ig.ion_torr")}
                {kv(812 + P / 2, 1008 + P / 2, 330 - IGH / 2 + 8 + px(14) + px(50), "A", "ig.a_torr")}
                {kv(812 + P / 2, 1008 + P / 2, 330 - IGH / 2 + 8 + px(14) + px(74), "B", "ig.b_torr")}
              </>)}
              {/* 도어 */}
              {door("door_up", CX - 120, 8, "도어 올림")}
              {door("door_down", CX + 10, 8, "도어 내림")}
              {/* 가스 */}
              {mfcBox(30 - P, 98, "Ar", "mfc.ar_sccm", "mfc.ar_set")}
              {valve("ar_valve", 325 - P / 2, 130, "Ar 밸브")}
              {mfcBox(30 - P, 194, "O₂", "mfc.o2_sccm", "mfc.o2_set")}
              {valve("o2_valve", 325 - P / 2, 226, "O₂ 밸브")}
              {/* Vent */}
              {valve("vent", 805 + P / 2, 130, "Vent")}
              {small(888 + P, 130 + px(4), "대기", "start")}
              {/* 배기 */}
              {valve("mv", 520, 428, "MV", true, "right")}
              {pump("turbo", 520, 482, "Turbo")}
              {valve("fv", 640, 482, "FV", false, "above")}
              {valve("rv", 740, 428, "RV", true, "right")}
              {pump("rotary", 850, 482, "Rotary")}
            </svg>
          </div>
          <ValuePanel bundle={bundle} snap={snap} links={links} plcOk={plcOk} ion={{ on: on("ion"), wait: wait("ion"), lock: why("ion"), press: () => press("ion") }} />
        </div>
      </div>
      <Legend />
    </Card>
  );
}

/** 오른쪽 세로 '값' 패널 — 파워 · 유틸리티 · 이오나이저 · MV 인터록 */
function ValuePanel({ bundle, snap, links, plcOk, ion }: {
  bundle: Bundle | null; snap?: Record<string, unknown>; links?: Record<string, Link>; plcOk: boolean;
  ion: { on: boolean; wait: boolean; lock: string | null; press: () => void };
}) {
  const fieldOf = (col: string): FieldDef | undefined => bundle?.snapshot?.blocks?.flatMap((b) => b.fields).find((f) => f.column === col);
  const blockLabel = (n: string, l: string) => bundle?.snapshot?.blocks?.find((b) => b.name === n)?.label ?? l;
  const plc = (k: string) => (plcOk ? snap?.[`plc.${k}`] === true : null);
  const power = (name: "dc" | "rf" | "rfp", valueCol: string, outCol: string, l: string) => {
    const off = links?.[name]?.q === "off";
    const f = fieldOf(valueCol);
    const t = f ? fieldText(f, snap?.[valueCol], snap, bundle?.snapshot?.blocks) : null;
    const out = snap?.[outCol];
    return (
      <div className="flex min-h-[26px] items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-semibold text-[#1B1F24]">{blockLabel(name, l)}</span>
        {off ? <Chip>사용 안 함</Chip> : (
          <span className="flex shrink-0 items-baseline gap-2">
            <span className="whitespace-nowrap font-semibold tabular-nums text-[#133A7C]">
              {t?.text || "—"}{t?.text && f?.unit && <span className={`ml-1 font-normal text-[#5B6470] ${FS.small}`}>{f.unit}</span>}
            </span>
            {out !== undefined && <span className={`${FS.small} ${out === true ? "font-semibold text-[#1B1F24]" : "text-[#5B6470]"}`}>{out === true ? "출력" : "꺼짐"}</span>}
          </span>
        )}
      </div>
    );
  };
  const lamps: [string, string][] = [["air", "Air"], ["g1", "G1"], ["g2", "G2"], ["atm", "ATM"], ["water", "냉각수"]];
  const sec = (title: string, children: ReactNode) => (
    <div className="min-w-0 @[1100px]:border-t @[1100px]:border-[#E3E6EA] @[1100px]:pt-3 @[1100px]:first:border-t-0 @[1100px]:first:pt-0">
      <p className={`mb-1.5 font-bold text-[#1B1F24] ${FS.body}`}>{title}</p>
      {children}
    </div>
  );
  return (
    <aside className={`grid w-full shrink-0 gap-4 rounded-[10px] border border-[#E3E6EA] p-3 @[640px]:grid-cols-2 @[900px]:grid-cols-4 @[1100px]:w-[280px] @[1100px]:grid-cols-1 @[1100px]:gap-3 ${FS.body}`} aria-label="값">
      {sec("파워", <>
        {power("dc", "dc.p", "dc.out", "DC Power")}
        {power("rf", "rf.fwd_w", "rf.dac_enable", "RF Power")}
        {power("rfp", "rfp.fwd_w", "rfp.out_on", "RF Pulse")}
      </>)}
      {sec("유틸리티", (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
          {lamps.map(([k, l]) => (
            <span key={k} className="flex items-center gap-1.5" title={plc(k) ? "감지" : "없음"}>
              <Dot on={plc(k)} dim={!plcOk} />{fieldOf(`plc.${k}`)?.label ?? l}
            </span>
          ))}
        </div>
      ))}
      {sec("이오나이저", <>
        <Btn size="md" lock={ion.lock} onClick={ion.press} className="mb-2 w-full">
          {ion.on ? "이오나이저 끄기" : "이오나이저 켜기"}{ion.wait && " · 전환 중"}
        </Btn>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
          <StateBox on={plc("ion_remote_on")} label="ON" />
          <StateBox on={plc("ion_run")} label="구동" />
          <StateBox on={plc("ion_lamp")} label="점등" />
          {plcOk && snap?.["plc.ion_ot"] === true
            ? <Chip tone="warn" icon={<AlertTriangle size={12} />}>수명 초과</Chip>
            : <StateBox on={plc("ion_ot")} label="수명 초과" />}
        </div>
      </>)}
      {sec("인터록", <StateBox on={plc("mv_interlock")} label={fieldOf("plc.mv_interlock")?.label ?? "MV 인터록"} />)}
    </aside>
  );
}

/** 범례 — 그림 아래 한 줄 12px(기호 + 짧은 말) */
function Legend() {
  const sw = (children: ReactNode) => <svg width={18} height={12} viewBox="0 0 18 12" aria-hidden className="shrink-0">{children}</svg>;
  return (
    <p className={`mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[#E3E6EA] pt-2.5 text-[#5B6470] ${FS.small}`}>
      <span className="flex items-center gap-1.5">{sw(<rect x={3} y={1} width={10} height={10} rx={2} fill={T.on} />)}열림·켜짐</span>
      <span className="flex items-center gap-1.5">{sw(<rect x={3.5} y={1.5} width={9} height={9} rx={2} fill="#FFFFFF" stroke={T.off} strokeWidth={1.5} />)}닫힘·꺼짐</span>
      <span className="flex items-center gap-1.5">{sw(<path d="M1,6 H17" stroke={T.primary} strokeWidth={2} strokeDasharray="4 3" />)}전환 중</span>
      <span className="flex items-center gap-1.5"><AlertTriangle size={12} className="text-[#B54708]" />이상</span>
      <span className="flex items-center gap-1.5">{sw(<path d="M1,6 H17" stroke={T.on} strokeWidth={4} />)}열린 배관</span>
    </p>
  );
}
