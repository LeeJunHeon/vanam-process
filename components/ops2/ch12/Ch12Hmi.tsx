"use client";

// 챔버12 HMI 탭(2026-11-18 — 챔버K Chk2Hmi 계통도 방식): CH1·CH2(1280 이상 나란히)·로드락 2D 계통도 + 계통도에 없는 PLC 버튼 목록(한국어 이름).
// 기호는 2D 평면: 밸브 = 나비, 펌프 = 원, 셔터 = 막대, 도어·게이트 = 사각 버튼. 켜짐·열림 = 진회색 채움, 꺼짐·닫힘 = 흰 바탕 테두리(초록·빨강 없음),
// 배관은 그 구간을 여는 밸브·펌프가 켜진 구간만 진회색. 전환 중 = 파란 점선 + '전환 중'(10 s — 부르는 쪽 pending).
// 노드 이름 아래 지금 상태 글. 누를 수 있으면 마우스를 올리면 테두리 강조 + 손가락 커서, 키보드 Tab·Enter·Space, 노드마다 aria-label.
// 누르면 확인창 → PLC_BUTTON {target, on}. 잠그지 않는다(사용자 결정 2026-11-20 — 공정 중에도 누를 수 있게) — 대신 확인창에(D425):
//   그 버튼의 챔버(공유 건 셔터·Power Select 는 묶음 procChamber = CH2)가 공정 중이면 맨 위 빨간 줄 'CH1 공정 중 — 지금 블록 · 공정 이름',
//   위험 두 갈래(묶음 hazard{on, off} — 사람: 벤트·도어·게이트·로드락 핀·척 모터 / 장비: 터보·로터리 끄기, 포어라인·러핑·메인 밸브,
//   Power Select — DC Pulse 출력 중 SW_RF_SELECT 켜기는 RF 전용 릴레이 문구를 더), 문구는 묶음 plcHazardText(없으면 같은 글).
//   잠기면(권한·bench·끊김·결과 기다림·PLC 값 오래됨) 누르지 못하고
// 이유를 그림 위 한 줄에 — PLC 값이 오래되면 그림 전체를 흐리게. 노트북 화면도 같은 규칙(v2 는 노트북에서도 PLC_BUTTON 을 받는다).
// 노드 상태 = 1초 행 plc.<코일 이름 소문자>(램프 코일이 있으면 램프). 코일 원래 이름은 '상세'에서만(마우스 올림 글).
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { FS, FSPX, T, Btn, Card, type Ask } from "../chk/kit";
import { StateBadge, StateTag } from "../chk/StateTag";
import { words12 } from "./BlockCard";
import { useChk2Mode } from "../chk/mode";
import { blockLabel, chamberState, engineOf, isRunning, plcCol, plcName, short } from "./logic";
import type { Ch12Bundle, Ch12State, PlcButtonDef12 } from "./types";
import { CARD, WORD, buttonName, fieldName, fieldTipOf, placeName, toTerms12 } from "@/lib/ops2/ch12/terms";

const FONT = "Pretendard, system-ui, sans-serif";
type PlcBtn = PlcButtonDef12;
type Props = {
  bundle: Ch12Bundle | null; snapshot?: Record<string, unknown>; plcOk: boolean; st?: Ch12State | null;
  lockOf: (target: string) => string | null; pending: Record<string, boolean>; onAsk: (a: Ask) => void; note: string;
};

/** 묶음에 hazard 가 없는 장비(D425 전)의 사람 위험 — 예전 규칙 그대로 */
export const dangerTarget = (t: string) => /vent|door|g_v_|l_pin/i.test(t);

/** 위험 문구 — 장비 묶음 plcHazardText 가 없을 때(장비 commands.HAZARD_TEXT 묶음 16 과 같은 글) */
export const HAZARD_TEXT: Record<"person" | "equipment" | "rf_select_dcp", string> = {
  person: "사람 위험: Vent·Door·Gate·Loadlock 4Pin·Chuck 은 사람이 다칠 수 있습니다. 장비 주변과 챔버·Loadlock 안에 사람이 없는지 반드시 확인하세요.",
  equipment: "장비 위험: Turbo·Rotary 끄기, FV·RV·MV, Power Select·RF Select 를 잘못 바꾸면 펌프·밸브·파워 장비가 손상될 수 있습니다. 지금 진공과 파워 상태를 확인하세요.",
  rf_select_dcp: "지금 DC Pulse 사용 중입니다. RF Select 는 RF 전용 릴레이라 DC Pulse 를 쓰는 중에 켜면 특히 위험합니다. DC Pulse 를 먼저 끄세요.",
};

export type PlcHazard = { kind: "person" | "equipment"; text: string };
/** PLC 버튼 확인창 — 챔버12 확인창(Ch12Confirm)이 맨 위 빨간 줄·위험 두 갈래를 그린다 */
export type PlcAsk = Ask & { procLine: string | null; hazards: PlcHazard[] };

/** 그 버튼이 닿는 공정 챔버 — 챔버 버튼은 그 챔버, 공유 버튼은 묶음 procChamber(건 셔터·Power Select = CH2), 로드락·부저는 없음 */
export const plcChamber = (b: PlcBtn): "ch1" | "ch2" | null =>
  b.procChamber !== undefined ? b.procChamber ?? null : b.chamber === "ch1" || b.chamber === "ch2" ? b.chamber : null;

/** 확인창 내용 — 공정 중 줄('CH1 공정 중 — 블록 · 공정 이름')·위험(켤 때/끌 때 분류 + DC Pulse 출력 중 SW_RF_SELECT 켜기) */
export function plcContext(bundle: Ch12Bundle | null, st: Ch12State | null | undefined, snap: Record<string, unknown> | undefined,
  b: PlcBtn, want: boolean): { procLine: string | null; hazards: PlcHazard[] } {
  const ch = plcChamber(b);
  let procLine: string | null = null;
  if (ch) {
    const cs = chamberState(st ?? null, ch);
    if (isRunning(bundle, cs)) {
      const step = cs?.step;
      const block = step?.label || (step?.type ? blockLabel(bundle, step.type) : "");
      const name = engineOf(st ?? null, ch)?.process_name ?? "";
      procLine = [`${placeName(bundle, ch)} 공정 중`, block ? toTerms12(block) : "", name].filter(Boolean).join(" · ");
    }
  }
  const text = { ...HAZARD_TEXT, ...(bundle?.plcHazardText ?? {}) };
  const kind = b.hazard ? (want ? b.hazard.on : b.hazard.off) ?? null : dangerTarget(b.target) ? "person" : null;
  const hazards: PlcHazard[] = kind === "person" || kind === "equipment" ? [{ kind, text: text[kind] }] : [];
  if (b.name === "SW_RF_SELECT" && want && snap?.["ch2.dcpulse.out_on"] === true) hazards.push({ kind: "equipment", text: text.rf_select_dcp });
  return { procLine, hazards };
}

/** 확인창 — PLC 버튼(켜기·열기 / 끄기·닫기). 공정 중·위험이면 실행 버튼 빨강 */
export function plcAsk(b: PlcBtn, want: boolean, ctx?: { procLine: string | null; hazards: PlcHazard[] }): PlcAsk {
  const c = ctx ?? { procLine: null, hazards: dangerTarget(b.target) ? [{ kind: "person" as const, text: HAZARD_TEXT.person }] : [] };
  return {
    kind: "PLC_BUTTON", label: plcName(b), detail: want ? "→ 켜기·열기" : "→ 끄기·닫기", args: { target: b.target, on: want },
    danger: c.hazards.some((h) => h.kind === "person"), red: c.hazards.length > 0 || !!c.procLine,
    plc: { target: b.target, want }, key: `PLC_BUTTON:${b.target}`,
    note: "PLC 출력이 바로 바뀝니다. 공정 중에도 실행되고 장비 기록에 남습니다.",
    procLine: c.procLine, hazards: c.hazards,
  };
}

const MAX_SCALE = 1.25;
function useScale(vbW: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [s, setS] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { const w = el.clientWidth; if (w > 0) setS(Math.max(0.45, Math.min(MAX_SCALE, w / vbW))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [vbW]);
  return [ref, s] as const;
}

/** 계통도 그리기 도구 — 버튼 상태·잠금·확인창·글자 크기(그림 배율을 재서 14·12px 그대로) */
function useDraw(p: Props, scale: number) {
  const { detail } = useChk2Mode();
  const { bundle, snapshot: snap, plcOk, lockOf, pending, onAsk, st } = p;
  const px = (n: number) => n / scale;
  const btn = (t: string): PlcBtn | undefined => (bundle?.plcButtons ?? []).find((b) => b.target === t) as PlcBtn | undefined;
  const raw = (col: string) => snap?.[`plc.${col}`];
  const on = (col: string) => plcOk && raw(col) === true;
  const swCol = (t: string) => { const b = btn(t); return b ? plcCol(b).slice(4) : t; };
  const wait = (t: string) => plcOk && pending[t] !== undefined && pending[t] !== (raw(swCol(t)) === true);
  const why = (t: string) => (!btn(t) ? "장비 정보에 없는 버튼" : lockOf(t));
  const press = (t: string) => {
    const b = btn(t);
    if (!b || why(t)) return;
    const want = !(raw(swCol(t)) === true);
    onAsk(plcAsk(b, want, plcContext(bundle, st, snap, b, want)));
  };
  const keys = (t: string) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); press(t); } };
  const word = (t: string, lamp: string, kind: "open" | "run") =>
    !plcOk ? "—" : wait(t) ? "전환 중" : on(lamp) ? (kind === "open" ? "열림" : "켜짐") : (kind === "open" ? "닫힘" : "꺼짐");
  const node = (t: string, name: string, state: string, children: ReactNode) => {
    const w = why(t);
    const b = btn(t);
    return (
      <g role="button" tabIndex={w ? -1 : 0} aria-disabled={!!w} aria-label={`${name} · ${state}${w ? ` (잠김: ${w})` : " · 눌러서 바꾸기"}`}
        onClick={() => press(t)} onKeyDown={keys(t)} style={{ cursor: w ? "default" : "pointer", outline: "none" }}
        className={w ? "" : "[&:focus-visible>.ring]:opacity-100 [&:hover>.ring]:opacity-100"}>
        <title>{`${b ? plcName(b) : name} · ${state}${w ? ` · 잠김: ${w}` : ""}${detail && b ? ` · ${b.desc || b.name || b.target}` : ""}`}</title>
        {children}
      </g>
    );
  };
  const fill = (lamp: string) => (on(lamp) ? T.on : "#FFFFFF");
  const stroke = (t: string, lamp: string) => (wait(t) ? T.primary : on(lamp) ? T.on : T.off);
  const dash = (t: string) => (wait(t) ? "4 3" : undefined);
  const ink = (lamp: string) => (on(lamp) ? "#FFFFFF" : T.text);
  const stFill = (t: string) => (wait(t) ? T.primary : T.muted);
  const text = (x: number, y: number, s: string, o: { size?: number; bold?: boolean; color?: string; anchor?: "start" | "middle" | "end" } = {}) => (
    <text x={x} y={y} textAnchor={o.anchor ?? "middle"} fontSize={px(o.size ?? FSPX.body)} fontWeight={o.bold ? 700 : 400}
      fill={o.color ?? T.text} fontFamily={FONT}>{s}</text>
  );
  /** 나비 밸브 — (x, y) 가운데. lamp = 상태 코일(없으면 버튼 코일) */
  const valve = (t: string, x: number, y: number, name: string, o: { vertical?: boolean; lamp?: string; side?: "below" | "right" | "above" } = {}) => {
    const lamp = o.lamp ?? swCol(t);
    const st = word(t, lamp, "open");
    const side = o.side ?? "below";
    const [lx, ly, anc] = side === "right" ? [x + 22, y - 2, "start" as const] : side === "above" ? [x, y - 18 - px(16), "middle" as const]
      : [x, y + 20 + px(12), "middle" as const];
    return node(t, name, st, <>
      <rect className="ring" x={x - 19} y={y - 19} width={38} height={38} rx={8} fill="none" stroke={T.primary} strokeWidth={2} opacity={0} />
      <path d={o.vertical ? `M${x - 9},${y - 13} L${x + 9},${y + 13} L${x - 9},${y + 13} L${x + 9},${y - 13} Z`
        : `M${x - 13},${y - 9} L${x + 13},${y + 9} L${x + 13},${y - 9} L${x - 13},${y + 9} Z`}
        fill={fill(lamp)} stroke={stroke(t, lamp)} strokeWidth={2} strokeDasharray={dash(t)} strokeLinejoin="round" />
      {text(lx, ly, name, { bold: true, anchor: anc })}
      {text(lx, ly + px(15), st, { size: FSPX.small, color: stFill(t), anchor: anc })}
    </>);
  };
  const pump = (t: string, x: number, y: number, name: string) => {
    const lamp = swCol(t), st = word(t, lamp, "run");
    return node(t, name, st, <>
      <circle className="ring" cx={x} cy={y} r={27} fill="none" stroke={T.primary} strokeWidth={2} opacity={0} />
      <circle cx={x} cy={y} r={22} fill={fill(lamp)} stroke={stroke(t, lamp)} strokeWidth={2} strokeDasharray={dash(t)} />
      <path d={`M${x - 8},${y - 12} L${x + 12},${y} L${x - 8},${y + 12} Z`} fill="none" stroke={ink(lamp)} strokeWidth={2} strokeLinejoin="round" />
      {text(x, y + 22 + px(15), name, { bold: true })}
      {text(x, y + 22 + px(30), st, { size: FSPX.small, color: stFill(t) })}
    </>);
  };
  /** 셔터 막대 — 이름·상태 한 줄, stack 이면 두 줄(좁은 Gun 셔터 셋) */
  const shutter = (t: string, x: number, y: number, w: number, name: string, stack = false) => {
    const lamp = swCol(t), st = word(t, lamp, "open");
    return node(t, name, st, <>
      <rect className="ring" x={x - 5} y={y - 6} width={w + 10} height={stack ? 12 + px(30) : 22} rx={6} fill="none" stroke={T.primary} strokeWidth={2} opacity={0} />
      <rect x={x} y={y} width={w} height={10} rx={3} fill={fill(lamp)} stroke={stroke(t, lamp)} strokeWidth={2} strokeDasharray={dash(t)} />
      {stack ? <>
        {text(x + w / 2, y + 12 + px(12), name, { bold: true, size: FSPX.small })}
        {text(x + w / 2, y + 12 + px(26), st, { size: FSPX.small, color: stFill(t) })}
      </> : (
        <text x={x + w / 2} y={y + 12 + px(14)} textAnchor="middle" fontSize={px(FSPX.body)} fontFamily={FONT}>
          <tspan fontWeight={700} fill={T.text}>{name}</tspan>
          <tspan fontSize={px(FSPX.small)} fill={stFill(t)}> {st}</tspan>
        </text>
      )}
    </>);
  };
  /** 사각 버튼(도어·게이트·핀·진공 준비) — 안에 이름 + 상태(램프 코일). 버튼이라 상태 글은 켜짐/꺼짐(챔버K Chk2Hmi 도어 버튼과 같은 규칙 —
   *  '게이트 닫기' 램프가 켜져 있으면 '켜짐', 열림/닫힘으로 읽으면 '게이트 닫기 … 열림' 처럼 거꾸로 보인다) */
  const square = (t: string, x: number, y: number, w: number, name: string, lamp: string) => {
    const st = word(t, lamp, "run");
    const h = px(16) + px(16) + 10;
    return node(t, name, st, <>
      <rect className="ring" x={x - 4} y={y - 4} width={w + 8} height={h + 8} rx={10} fill="none" stroke={T.primary} strokeWidth={2} opacity={0} />
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill(lamp)} stroke={stroke(t, lamp)} strokeWidth={2} strokeDasharray={dash(t)} />
      {text(x + w / 2, y + 4 + px(14), name, { bold: true, color: ink(lamp) })}
      {text(x + w / 2, y + 4 + px(30), st, { size: FSPX.small, color: on(lamp) ? "#FFFFFF" : stFill(t) })}
    </>);
  };
  const pipe = (d: string, live: boolean) => <path d={d} fill="none" stroke={live ? T.on : T.pipe} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />;
  const box = (x: number, y: number, w: number, h: number, title: string, children?: ReactNode) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="#FFFFFF" stroke={T.border} strokeWidth={1.5} />
      {text(x + 10, y + 6 + px(13), title, { bold: true, anchor: "start" })}
      {children}
    </g>
  );
  return { px, on, text, valve, pump, shutter, square, pipe, box, snap, btn };
}

/** 챔버 하나의 계통도 */
function ChamberMap(p: Props & { ch: "ch1" | "ch2" }) {
  const n = p.ch === "ch1" ? 1 : 2;
  const VB_W = 640, VB_H = 470;
  const [wrap, scale] = useScale(VB_W);
  const D = useDraw(p, scale);
  const { px, on, text, snap } = D;
  const gases = p.bundle?.chambers?.find((c) => c.id === p.ch)?.gases ?? (n === 1 ? ["ar", "o2"] : ["ar", "o2", "n2"]);
  const flow = (g: string) => snap?.[`${p.ch}.mfc.${g}_sccm`];
  const zpos = ["up", "mid", "down"].find((x) => snap?.[`plc.z${n}_${x}_location`] === true);
  const sub = snap?.[`plc.loading_${n}_sensor_lamp`] === true;
  const ig = snap?.[`${p.ch}.ig.pressure_torr`];
  const wp = snap?.[`${p.ch}.mfc.pressure_mtorr`];
  const vp = snap?.[`${p.ch}.mfc.valve_pct`];
  const title = placeName(p.bundle, p.ch);
  const nm = (t: string) => buttonName(p.bundle, t, title);          // 'CH1 MV' → 'MV'(카드 제목과 같은 앞말은 뺌)
  const chuck = buttonName(p.bundle, `z_m_p_${n}_sw`, title);       // 'Chuck'(묶음 버튼 이름)
  const CX = 300, CY = 70, CW = 190, CH = 230;          // 챔버
  const gy = (i: number) => 96 + i * 62;
  const mainGas = `main_${n}_gas_sw`;
  const anyGas = gases.some((g) => on(`${g}_${n}_gas_sw`));
  return (
    <div ref={wrap} className="min-w-0">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block h-auto w-full select-none" role="group" aria-label={`${title} ${CARD.map}`}>
        {/* 배관 — 열린 구간만 진회색 */}
        {gases.map((g, i) => <g key={`a${g}`}>{D.pipe(`M140,${gy(i) + 16} H178`, on(`${g}_${n}_gas_sw`))}</g>)}
        {gases.map((g, i) => <g key={`b${g}`}>{D.pipe(`M206,${gy(i) + 16} H226 V${170} H244`, on(`${g}_${n}_gas_sw`))}</g>)}
        {D.pipe(`M272,170 H${CX}`, anyGas && on(mainGas))}
        {D.pipe(`M${CX + CW},110 H560`, on(`vent_${n}_lamp`) || on(`vent_${n}_sw`))}
        {D.pipe(`M${CX + CW},230 H530`, on(`g_v_${n}_open_lamp`))}
        {D.pipe(`M360,${CY + CH} V346`, on(`m_v_${n}_sw`))}
        {D.pipe("M382,400 H448", on(`turbo_${n}_sw`))}
        {D.pipe("M476,400 H540", on(`f_v_${n}_sw`))}
        {D.pipe(`M450,${CY + CH} V346`, on(`r_v_${n}_sw`))}
        {D.pipe("M450,372 V384 H540", on(`r_v_${n}_sw`))}
        {/* 챔버 — 구조만 */}
        <rect x={CX} y={CY} width={CW} height={CH} rx={14} fill="#FFFFFF" stroke={T.on} strokeWidth={2} />
        {text(CX + CW / 2, CY + px(18), title, { bold: true })}
        {n === 2 && [1, 2, 3].map((g, i) => <g key={g}>{D.shutter(`shutter_${g}_sw`, CX + 12 + i * 60, CY + 32, 50, nm(`shutter_${g}_sw`), true)}</g>)}
        {D.shutter(`main_shutter_${n}_sw`, CX + 25, CY + (n === 2 ? 84 : 40), CW - 50, nm(`main_shutter_${n}_sw`))}
        <rect x={CX + 40} y={CY + 128} width={CW - 80} height={px(16) * 2 + 12} rx={6} fill="#F5F6F8" stroke={T.border} />
        {text(CX + CW / 2, CY + 128 + 4 + px(13), chuck, { bold: true })}
        {text(CX + CW / 2, CY + 128 + 4 + px(29), zpos ? fieldName(p.bundle, `plc.z${n}_${zpos}_location`, `${title} ${chuck}`) : "위치 모름", { size: FSPX.small, color: T.muted })}
        {text(CX + CW / 2, CY + CH - 34, `${fieldName(p.bundle, `plc.loading_${n}_sensor_lamp`, title)} ${sub ? WORD.detect : WORD.none}`, { size: FSPX.small, color: sub ? T.text : T.muted })}
        {text(CX + CW / 2, CY + CH - 12, `${fieldName(p.bundle, `${p.ch}.mfc.pressure_mtorr`, title)} ${short(wp)} mTorr`, { size: FSPX.small, color: T.value })}
        {/* 도어 */}
        {D.square(`door_${n}_open_sw`, CX + 4, 6, 88, nm(`door_${n}_open_sw`), `door_${n}_open_lamp`)}
        {D.square(`door_${n}_close_sw`, CX + 98, 6, 88, nm(`door_${n}_close_sw`), `door_${n}_close_lamp`)}
        {/* 가스 */}
        {gases.map((g, i) => (
          <g key={g}>
            {D.box(8, gy(i), 132, px(13) + px(18) + 14, fieldName(p.bundle, `${p.ch}.mfc.${g}_sccm`, title),
              text(18, gy(i) + 6 + px(13) + px(18), `${short(flow(g))} sccm`, { anchor: "start", color: T.value, bold: true }))}
            {D.valve(`${g}_${n}_gas_sw`, 192, gy(i) + 16, nm(`${g}_${n}_gas_sw`), { side: "above" })}
          </g>
        ))}
        {D.valve(mainGas, 258, 170, nm(mainGas))}
        {D.box(8, 330, 132, px(13) + px(18) + 14, fieldName(p.bundle, `${p.ch}.mfc.valve_pct`, title),
          text(18, 330 + 6 + px(13) + px(18), typeof vp === "number" && Number.isFinite(vp) ? `${short(vp)} %` : "—", { anchor: "start", color: T.value, bold: true }))}
        {D.box(8, 390, 132, px(13) + px(18) + 14, fieldName(p.bundle, `${p.ch}.ig.pressure_torr`, title),
          text(18, 390 + 6 + px(13) + px(18), typeof ig === "number" ? `${ig.toExponential(2)} Torr` : "—", { anchor: "start", color: T.value, bold: true }))}
        {/* 벤트·게이트 */}
        {D.valve(`vent_${n}_sw`, 574, 110, nm(`vent_${n}_sw`), { lamp: `vent_${n}_lamp` })}
        {text(620, 112, "대기", { size: FSPX.small, color: T.muted, anchor: "end" })}
        {D.square(`g_v_${n}_open_sw`, 538, 196, 96, nm(`g_v_${n}_open_sw`), `g_v_${n}_open_lamp`)}
        {D.square(`g_v_${n}_close_sw`, 538, 252, 96, nm(`g_v_${n}_close_sw`), `g_v_${n}_close_lamp`)}
        {text(586, 252 + px(32) + 30, `→ ${placeName(p.bundle, "loadlock")}`, { size: FSPX.small, color: T.muted })}
        {/* 배기 */}
        {D.valve(`m_v_${n}_sw`, 360, 346, nm(`m_v_${n}_sw`), { vertical: true, side: "right" })}
        {D.pump(`turbo_${n}_sw`, 360, 400, nm(`turbo_${n}_sw`))}
        {D.valve(`f_v_${n}_sw`, 470, 400, nm(`f_v_${n}_sw`))}
        {D.valve(`r_v_${n}_sw`, 450, 346, nm(`r_v_${n}_sw`), { vertical: true, side: "right" })}
        {D.pump(`r_p_${n}_sw`, 566, 400, nm(`r_p_${n}_sw`))}
      </svg>
    </div>
  );
}

/** 로드락 계통도 — 로터리·러핑 밸브·벤트·4핀 올림/내림·진공 준비 */
function LoadLockMap(p: Props) {
  const VB_W = 640, VB_H = 250;
  const [wrap, scale] = useScale(VB_W);
  const D = useDraw(p, scale);
  const { px, on, text } = D;
  const title = placeName(p.bundle, "loadlock");
  const nm = (t: string) => buttonName(p.bundle, t, title);          // 'Loadlock 4Pin 올림' → '4Pin 올림'
  return (
    <div ref={wrap} className="min-w-0">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block h-auto w-full select-none" role="group" aria-label={`${title} ${CARD.map}`}>
        {D.pipe("M300,90 H360", on("l_vent_lamp") || on("l_vent_sw"))}
        {D.pipe("M200,130 V180 H260", on("l_r_v_sw"))}
        {D.pipe("M288,180 H370", on("l_r_v_sw") && on("l_r_p_sw"))}
        <rect x={110} y={30} width={190} height={100} rx={14} fill="#FFFFFF" stroke={T.on} strokeWidth={2} />
        {text(205, 30 + px(18), title, { bold: true })}
        {D.square("l_pin_up_sw", 122, 30 + px(18) + 10, 80, nm("l_pin_up_sw"), "l_pin_up_lamp")}
        {D.square("l_pin_down_sw", 210, 30 + px(18) + 10, 80, nm("l_pin_down_sw"), "l_pin_down_lamp")}
        {D.valve("l_vent_sw", 374, 90, nm("l_vent_sw"), { lamp: "l_vent_lamp" })}
        {D.valve("l_r_v_sw", 274, 180, nm("l_r_v_sw"))}
        {D.pump("l_r_p_sw", 396, 180, nm("l_r_p_sw"))}
        {D.square("l_vac_ready_sw", 480, 40, 140, nm("l_vac_ready_sw"), "l_vac_ready_sw")}
        {text(550, 120, `${fieldName(p.bundle, "plc.l_atm", title)} ${on("l_atm") || on("l_atm_sensor") ? WORD.detect : WORD.none}`, { size: FSPX.small, color: T.muted })}
        {text(550, 120 + px(16), `${fieldName(p.bundle, "plc.l_gauge_a", title)} ${on("l_gauge_a") ? WORD.on : WORD.off}`, { size: FSPX.small, color: T.muted })}
        {text(110, 20, `← ${placeName(p.bundle, "ch1")}·${placeName(p.bundle, "ch2")} Gate`, { size: FSPX.small, color: T.muted, anchor: "start" })}
      </svg>
    </div>
  );
}

/** 계통도에 그린 버튼(나머지는 아래 목록) */
const DRAWN = (n: number, gases: string[]) => [
  `r_p_${n}_sw`, `r_v_${n}_sw`, `f_v_${n}_sw`, `m_v_${n}_sw`, `vent_${n}_sw`, `turbo_${n}_sw`, `door_${n}_open_sw`, `door_${n}_close_sw`,
  `g_v_${n}_open_sw`, `g_v_${n}_close_sw`, `main_shutter_${n}_sw`, `main_${n}_gas_sw`, ...gases.map((g) => `${g}_${n}_gas_sw`),
  ...(n === 2 ? ["shutter_1_sw", "shutter_2_sw", "shutter_3_sw"] : []),
];
const LL_DRAWN = ["l_r_p_sw", "l_r_v_sw", "l_vent_sw", "l_pin_up_sw", "l_pin_down_sw", "l_vac_ready_sw"];
export function drawnTargets(b: Ch12Bundle | null): Set<string> {
  const g = (ch: string, d: string[]) => b?.chambers?.find((c) => c.id === ch)?.gases ?? d;
  return new Set([...DRAWN(1, g("ch1", ["ar", "o2"])), ...DRAWN(2, g("ch2", ["ar", "o2", "n2"])), ...LL_DRAWN]);
}

/** 계통도에 없는 PLC 버튼 — 한국어 이름(원래 이름은 '상세'), 켜짐 = 진회색 네모, 전환 중 = 파란 점선 */
function OtherButtons(p: Props) {
  const { detail } = useChk2Mode();
  const drawn = drawnTargets(p.bundle);
  const list = ((p.bundle?.plcButtons ?? []) as PlcBtn[]).filter((b) => !drawn.has(b.target));
  const groups = ["ch1", "ch2", "loadlock", "shared"].map((g) => ({ g, items: list.filter((b) => (b.chamber ?? "shared") === g) })).filter((x) => x.items.length);
  if (!list.length) return null;
  return (
    <Card title={CARD.otherButtons} right={<span className={`${FS.small} text-[#5B6470]`}>계통도에 없는 버튼</span>}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map(({ g, items }) => (
          <div key={g} className="min-w-0">
            <p className={`mb-1.5 ${FS.small} font-semibold text-[#5B6470]`}>{placeName(p.bundle, g)}</p>
            <div className="space-y-1.5">
              {items.map((b) => {
                const col = plcCol(b);
                const lit = p.plcOk && p.snapshot?.[col] === true;
                const wait = p.plcOk && p.pending[b.target] !== undefined && p.pending[b.target] !== (p.snapshot?.[col] === true);
                return (
                  <div key={b.target} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1" title={detail ? `${b.desc || b.name || b.target} · ${col}` : undefined}>
                      <StateTag on={p.plcOk ? lit : null} words={words12(b.target)}
                        label={<>{buttonName(p.bundle, b.target, g === "shared" ? null : placeName(p.bundle, g))}
                          {detail && <span className={`ml-1 font-mono ${FS.small} text-[#8A929D]`}>{b.name ?? b.target}</span>}</>} />
                    </span>
                    <Btn size="sm" lock={p.lockOf(b.target)} onClick={() => {
                      const want = !(p.snapshot?.[col] === true);
                      p.onAsk(plcAsk(b, want, plcContext(p.bundle, p.st, p.snapshot, b, want)));
                    }}
                      className={wait ? "border-dashed border-[#1D4ED8] text-[#1D4ED8]" : ""}>
                      {wait ? "전환 중" : lit ? "끄기" : "켜기"}
                    </Btn>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Legend() {
  const sw = (children: ReactNode) => <svg width={18} height={12} viewBox="0 0 18 12" aria-hidden className="shrink-0">{children}</svg>;
  return (
    <p className={`mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[#E3E6EA] pt-2.5 text-[#5B6470] ${FS.small}`}>
      <span className="flex items-center gap-1.5">{sw(<rect x={3} y={1} width={10} height={10} rx={2} fill={T.on} />)}열림·켜짐</span>
      <span className="flex items-center gap-1.5">{sw(<rect x={3.5} y={1.5} width={9} height={9} rx={2} fill="#FFFFFF" stroke={T.off} strokeWidth={1.5} />)}닫힘·꺼짐</span>
      <span className="flex items-center gap-1.5">{sw(<path d="M1,6 H17" stroke={T.primary} strokeWidth={2} strokeDasharray="4 3" />)}전환 중</span>
      <span className="flex items-center gap-1.5">{sw(<path d="M1,6 H17" stroke={T.on} strokeWidth={4} />)}열린 배관</span>
    </p>
  );
}

/** 인터락·램프 한 줄(챔버별) — 이름·마우스 설명은 묶음 PLC 필드(Gauge A 인터락·Rotary 끄기 대기), 미충족 인터락만 주의색 */
function Lamps({ bundle, snapshot, plcOk, n, gases }: { bundle: Ch12Bundle | null; snapshot?: Record<string, unknown>; plcOk: boolean; n: number; gases: string[] }) {
  const { detail } = useChk2Mode();
  const v = (c: string) => snapshot?.[`plc.${c}`];
  const title = placeName(bundle, `ch${n}`);
  const itl = [`r_v_${n}`, `f_v_${n}`, `m_v_${n}`, `vent_${n}`, `turbo_${n}`, `door_${n}`, `g_v_${n}`, `main_shutter_${n}`, ...gases.map((g) => `${g}_${n}_gas`), `main_${n}_gas`];
  const off = plcOk ? itl.filter((x) => v(`${x}_인터락`) === false).length : 0;
  const lamp = (c: string) => (
    <span className="flex items-center gap-1.5" title={fieldTipOf(bundle, `plc.${c}`, detail)}>
      {fieldName(bundle, `plc.${c}`, title)}<StateBadge on={plcOk ? v(c) === true : null} />
    </span>
  );
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${FS.small} text-[#5B6470]`}>
      {lamp(`gauge_${n}_a_interlock`)}{lamp(`gauge_${n}_b_interlock`)}{lamp(`r_p_${n}_off_timer`)}
      {off > 0 ? <span className="font-semibold text-[#B54708]">인터락 미충족 {off}개</span> : plcOk && <span>인터락 모두 충족</span>}
    </div>
  );
}

export default function Ch12Hmi(p: Props) {
  const locked = p.note.includes("잠금");
  const g = (ch: string, d: string[]) => p.bundle?.chambers?.find((c) => c.id === ch)?.gases ?? d;
  return (
    <div className="space-y-3">
      <Card title={CARD.map} right={<span className={`flex items-center gap-1 ${FS.small} ${locked ? "font-semibold text-[#B54708]" : "text-[#5B6470]"}`}>
        {locked && <Lock size={12} />}{p.note}</span>}>
        <div className={p.plcOk ? "" : "opacity-50"}>
          <div className="grid gap-4 min-[1280px]:grid-cols-2">
            <div className="min-w-0 space-y-1.5"><ChamberMap {...p} ch="ch1" /><Lamps bundle={p.bundle} snapshot={p.snapshot} plcOk={p.plcOk} n={1} gases={g("ch1", ["ar", "o2"])} /></div>
            <div className="min-w-0 space-y-1.5"><ChamberMap {...p} ch="ch2" /><Lamps bundle={p.bundle} snapshot={p.snapshot} plcOk={p.plcOk} n={2} gases={g("ch2", ["ar", "o2", "n2"])} /></div>
          </div>
          <div className="mt-4 border-t border-[#E3E6EA] pt-3 min-[1280px]:max-w-[50%]"><LoadLockMap {...p} /></div>
        </div>
        <Legend />
      </Card>
      <OtherButtons {...p} />
    </div>
  );
}
