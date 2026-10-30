"use client";

// 챔버K v2 HMI 탭 — 계통도(W-10, Chk2Mimic 을 새로). 한 장의 SVG(비율 유지 — 1280 너비에서도 글자 11px 이상):
//   왼쪽 가스(Ar·O₂ MFC 상자 실제/설정 sccm → 차단밸브 → 챔버), 가운데 챔버(Gun1·Gun2·셔터 S1·S2·Main 셔터·기판 히터 TC1·TC2·목표·
//   제어 상태·챔버 압력·이온 게이지 이온·A·B — 하한 아래 표시), 위 도어 올림·내림, 오른쪽 Vent, 아래 배기 MV → Turbo → FV → Rotary 와
//   RV 우회, 옆 파워 상자(DC Power·RF Power·RF Pulse 값·출력 — 어느 건에 물렸는지 데이터가 없어 선으로 잇지 않는다).
// 기호는 2D 평면(그라데이션·그림자 없음): 밸브 = 나비, 펌프 = 원, 셔터 = 막대. 켜짐·열림 = 진회색 채움, 꺼짐·닫힘 = 흰 바탕 테두리.
//   배관은 연회색, 그 구간을 여닫는 밸브·펌프가 켜진 구간만 진회색. 전환 중 = 파란 점선 + '전환 중'(10 s — 부르는 쪽 pending).
//   이상(인터록·수명 초과)만 주의색 + 아이콘.
// 누르면 확인창 → PLC_BUTTON(도어·Vent 는 위험 문구). 키보드 Tab·Enter·Space, 노드마다 aria-label.
//   잠기면(권한·bench·PLC 값 오래됨·끊김·로컬 화면) 누르지 못하고 이유를 그림 위 한 줄에 — PLC 값이 오래되면 그림 전체를 흐리게.
// 노드 상태 = snapshot plc.<addr>(묶음 plcButtons addr — 이오나이저만 target 과 다르다: ion_remote_on).
import type { KeyboardEvent, ReactNode } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { Btn, Card, Chip, Dot, StateBox, T, type Ask } from "./kit";
import { fieldText } from "./text";
import type { Bundle, FieldDef } from "./types";

const DANGER = new Set(["vent", "door_up", "door_down"]);
const FONT = "Pretendard, system-ui, sans-serif";

type Props = {
  bundle: Bundle | null;
  snapshot?: Record<string, unknown>;
  plcOk: boolean;                          // PLC 값을 믿을 수 있음(나이 기준)
  lockOf: (target: string) => string | null;   // PLC 버튼 잠금 이유(권한·bench·끊김·결과 기다림·PLC 오래됨)
  pending: Record<string, boolean>;        // target → 바라는 값(전환 중)
  onAsk: (a: Ask) => void;
  note: string;                            // 그림 위 한 줄(잠금 이유·안내)
  viewOnly: boolean;                       // 노트북 로컬 화면 — 보기만
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const f5 = (v: number | null) => (v === null ? "—" : String(Number(v.toPrecision(5))));

export default function Chk2Hmi({ bundle, snapshot: snap, plcOk, lockOf, pending, onAsk, note, viewOnly }: Props) {
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
  /** 누를 수 있는 노드 묶음(키보드·aria) */
  const node = (t: string, label: string, children: ReactNode) => {
    const w = why(t);
    const state = wait(t) ? "전환 중" : on(t) ? "켜짐·열림" : "꺼짐·닫힘";
    return (
      <g role="button" tabIndex={w ? -1 : 0} aria-disabled={!!w} aria-label={`${label} — ${state}${w ? ` (잠김: ${w})` : " — 눌러서 바꾸기"}`}
        onClick={() => press(t)} onKeyDown={keys(t)} style={{ cursor: w ? "default" : "pointer", outline: "none" }}
        className="[&:focus-visible>.ring]:opacity-100">
        <title>{`${btn(t)?.label ?? label} · ${state}${w ? ` · 잠김: ${w}` : ""}`}</title>
        {children}
      </g>
    );
  };
  const fill = (t: string) => (on(t) ? T.on : "#FFFFFF");
  const stroke = (t: string) => (wait(t) ? T.primary : on(t) ? T.on : T.off);
  const dash = (t: string) => (wait(t) ? "4 3" : undefined);
  const txt = (t: string) => (on(t) ? "#FFFFFF" : T.text);

  /** 나비 밸브 — (x, y) 가운데, vertical 이면 세로 배관 */
  const valve = (t: string, x: number, y: number, label: string, vertical = false, lx = 0, ly = 24) => (
    node(t, label, <>
      <rect className="ring" x={x - 20} y={y - 16} width={40} height={32} rx={6} fill="none" stroke={T.primary} strokeWidth={2} opacity={0} />
      <path d={vertical ? `M${x - 9},${y - 13} L${x + 9},${y + 13} L${x - 9},${y + 13} L${x + 9},${y - 13} Z`
        : `M${x - 13},${y - 9} L${x + 13},${y + 9} L${x + 13},${y - 9} L${x - 13},${y + 9} Z`}
        fill={fill(t)} stroke={stroke(t)} strokeWidth={2} strokeDasharray={dash(t)} strokeLinejoin="round" />
      <text x={x + lx} y={y + ly} textAnchor="middle" fontSize={12} fontWeight={700} fill={T.text} fontFamily={FONT}>{label}</text>
      {wait(t) && <text x={x + lx} y={y + ly + 14} textAnchor="middle" fontSize={11} fill={T.primary} fontFamily={FONT}>전환 중</text>}
    </>)
  );
  /** 펌프 — 원 */
  const pump = (t: string, x: number, y: number, label: string) => (
    node(t, label, <>
      <circle className="ring" cx={x} cy={y} r={30} fill="none" stroke={T.primary} strokeWidth={2} opacity={0} />
      <circle cx={x} cy={y} r={25} fill={fill(t)} stroke={stroke(t)} strokeWidth={2} strokeDasharray={dash(t)} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={txt(t)} fontFamily={FONT}>{label}</text>
      {wait(t) && <text x={x} y={y + 42} textAnchor="middle" fontSize={11} fill={T.primary} fontFamily={FONT}>전환 중</text>}
    </>)
  );
  /** 셔터 — 막대 */
  const shutter = (t: string, x: number, y: number, w: number, label: string) => (
    node(t, label, <>
      <rect className="ring" x={x - 4} y={y - 6} width={w + 8} height={22} rx={5} fill="none" stroke={T.primary} strokeWidth={2} opacity={0} />
      <rect x={x} y={y} width={w} height={10} rx={3} fill={fill(t)} stroke={stroke(t)} strokeWidth={2} strokeDasharray={dash(t)} />
      <text x={x + w / 2} y={y + 26} textAnchor="middle" fontSize={11} fontWeight={600} fill={T.text} fontFamily={FONT}>
        {label}{wait(t) ? " · 전환 중" : on(t) ? " · 열림" : " · 닫힘"}
      </text>
    </>)
  );
  /** 도어 버튼 */
  const door = (t: string, x: number, y: number, label: string) => (
    node(t, label, <>
      <rect x={x} y={y} width={88} height={30} rx={6} fill={fill(t)} stroke={stroke(t)} strokeWidth={2} strokeDasharray={dash(t)} />
      <text x={x + 44} y={y + 19} textAnchor="middle" fontSize={12} fontWeight={700} fill={txt(t)} fontFamily={FONT}>{label}</text>
    </>)
  );
  const pipe = (d: string, live: boolean) => (
    <path d={d} fill="none" stroke={live ? T.on : T.pipe} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
  );
  const fieldOf = (col: string): FieldDef | undefined => bundle?.snapshot?.blocks?.flatMap((b) => b.fields).find((f) => f.column === col);
  const valTxt = (col: string) => {
    const f = fieldOf(col);
    if (!f) return { text: "—", unit: "" };
    const t = fieldText(f, snap?.[col], snap, bundle?.snapshot?.blocks);
    return { text: t.text || (t.alt ? `${t.alt}` : "—"), unit: t.text ? f.unit : "", alt: !t.text && !!t.alt };
  };
  const vt = (x: number, y: number, label: string, col: string, anchor: "start" | "end" | "middle" = "start") => {
    const v = valTxt(col);
    return (
      <text x={x} y={y} textAnchor={anchor} fontSize={12} fontFamily={FONT}>
        {label && <tspan fill={T.muted}>{label} </tspan>}
        <tspan fill={v.alt ? T.warn : T.value} fontWeight={700}>{v.text}</tspan>
        {v.unit && <tspan fill={T.muted} fontSize={11}> {v.unit}</tspan>}
      </text>
    );
  };
  const mfcBox = (x: number, y: number, name: string, act: string, set: string) => (
    <g>
      <rect x={x} y={y} width={150} height={52} rx={8} fill="#FFFFFF" stroke={T.border} strokeWidth={1.5} />
      <text x={x + 10} y={y + 19} fontSize={12} fontWeight={700} fill={T.text} fontFamily={FONT}>{name} MFC</text>
      <text x={x + 10} y={y + 39} fontSize={12} fontFamily={FONT}>
        <tspan fill={T.value} fontWeight={700}>{f5(num(snap?.[act]))}</tspan>
        <tspan fill={T.muted}> / 설정 {f5(num(snap?.[set]))} sccm</tspan>
      </text>
    </g>
  );
  const mvItl = plcOk && snap?.["plc.mv_interlock"] === true;
  const casc = fieldOf("heater.casc_state");
  const cs = snap?.["heater.casc_state"];
  const ctrl = typeof cs === "string" && cs && cs !== "idle" ? casc?.enumLabels?.[cs] ?? cs : "";
  const powerOn = (b: string) => snap?.[b] === true;

  const lamps: [string, string][] = [["air", "Air"], ["g1", "G1"], ["g2", "G2"], ["atm", "ATM"], ["water", "Water"]]
    .map(([k, l]) => [k, fieldOf(`plc.${k}`)?.label ?? l]);
  const ionLock = why("ion");
  return (
    <Card title="계통도" right={<span className={`flex items-center gap-1 text-[11px] ${note.includes("잠금") ? "font-semibold text-[#B54708]" : "text-[#5B6470]"}`}>
      {note.includes("잠금") && <Lock size={12} />}{note}</span>}>
      <div className={`mx-auto w-full max-w-[1280px] ${plcOk ? "" : "opacity-50"}`}>
        <svg viewBox="0 50 980 560" className="h-auto w-full select-none" role="group" aria-label="챔버K v2 계통도">
          {/* 배관 */}
          {pipe("M170,170 H236 M262,170 H330", on("ar_valve"))}
          {pipe("M170,290 H236 M262,290 H330", on("o2_valve"))}
          {pipe("M650,200 H718 M744,200 H800", on("vent"))}
          {pipe("M450,450 V476", on("mv"))}
          {pipe("M450,520 V538", on("mv"))}
          {pipe("M450,560 V575 H560", on("turbo"))}
          {pipe("M586,575 H660", on("fv"))}
          {pipe("M620,450 V476 M620,502 V530 H680 V548", on("rv"))}
          {/* 챔버 */}
          <rect x={330} y={110} width={320} height={340} rx={14} fill="#FFFFFF" stroke={T.on} strokeWidth={2} />
          <text x={490} y={134} textAnchor="middle" fontSize={13} fontWeight={700} fill={T.text} fontFamily={FONT}>Chamber</text>
          {/* 건·셔터 */}
          <rect x={360} y={150} width={110} height={36} rx={6} fill="#F5F6F8" stroke={T.border} />
          <text x={415} y={173} textAnchor="middle" fontSize={12} fontWeight={700} fill={T.text} fontFamily={FONT}>Gun1</text>
          <rect x={510} y={150} width={110} height={36} rx={6} fill="#F5F6F8" stroke={T.border} />
          <text x={565} y={173} textAnchor="middle" fontSize={12} fontWeight={700} fill={T.text} fontFamily={FONT}>Gun2</text>
          {shutter("s1", 370, 196, 90, "S1")}
          {shutter("s2", 520, 196, 90, "S2")}
          {shutter("ms", 380, 250, 220, "Main 셔터")}
          {/* 기판 히터 */}
          <rect x={360} y={300} width={260} height={66} rx={8} fill="#F5F6F8" stroke={T.border} />
          <text x={372} y={318} fontSize={12} fontWeight={700} fill={T.text} fontFamily={FONT}>기판 히터{ctrl ? ` · ${ctrl}` : ""}</text>
          {vt(372, 338, "TC1", "heater.pv")}
          {vt(500, 338, "TC2", "heater.pv2")}
          {vt(372, 358, "목표", "heater.sv")}
          {/* 압력 */}
          {vt(345, 392, "챔버 압력", "mfc.pressure_mtorr")}
          {vt(345, 412, "이온", "ig.ion_torr")}
          {vt(500, 412, "A", "ig.a_torr")}
          {vt(345, 432, "B", "ig.b_torr")}
          {/* 도어 */}
          {door("door_up", 392, 62, "도어 올림")}
          {door("door_down", 500, 62, "도어 내림")}
          {/* 가스 */}
          {mfcBox(20, 144, "Ar", "mfc.ar_sccm", "mfc.ar_set")}
          {valve("ar_valve", 249, 170, "Ar 밸브")}
          {mfcBox(20, 264, "O₂", "mfc.o2_sccm", "mfc.o2_set")}
          {valve("o2_valve", 249, 290, "O₂ 밸브")}
          {/* Vent */}
          {valve("vent", 731, 200, "Vent")}
          <text x={806} y={204} fontSize={11} fill={T.muted} fontFamily={FONT}>대기</text>
          {/* 배기 */}
          {valve("mv", 450, 489, "MV", true, 34, 4)}
          {mvItl && (
            <g>
              <rect x={476} y={500} width={86} height={20} rx={4} fill={T.warnBg} stroke={T.warn} />
              <text x={519} y={514} textAnchor="middle" fontSize={11} fontWeight={700} fill={T.warn} fontFamily={FONT}>⚠ MV 인터록</text>
            </g>
          )}
          {pump("turbo", 450, 545, "Turbo")}
          {valve("fv", 573, 575, "FV", false, 0, -14)}
          {pump("rotary", 690, 575, "Rotary")}
          {valve("rv", 620, 489, "RV", true, 30, 4)}
          {/* 파워 상자(선으로 잇지 않음) */}
          <g>
            <rect x={800} y={250} width={170} height={200} rx={10} fill="#FFFFFF" stroke={T.border} strokeWidth={1.5} />
            <text x={812} y={272} fontSize={12} fontWeight={700} fill={T.text} fontFamily={FONT}>파워</text>
            <text x={812} y={296} fontSize={12} fontWeight={700} fill={T.text} fontFamily={FONT}>DC Power {powerOn("dc.out") ? "· 출력" : ""}</text>
            {vt(812, 314, "", "dc.p")}
            <text x={812} y={342} fontSize={12} fontWeight={700} fill={T.text} fontFamily={FONT}>RF Power</text>
            {vt(812, 360, "순방향", "rf.fwd_w")}
            <text x={812} y={388} fontSize={12} fontWeight={700} fill={T.text} fontFamily={FONT}>RF Pulse {powerOn("rfp.out_on") ? "· 출력" : ""}</text>
            {vt(812, 406, "순방향", "rfp.fwd_w")}
            <text x={812} y={436} fontSize={11} fill={T.muted} fontFamily={FONT}>건과의 연결은 데이터 없음</text>
          </g>
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#E3E6EA] pt-3 text-xs">
        <span className="flex flex-wrap items-center gap-3 text-[#5B6470]">
          {lamps.map(([k, l]) => (
            <span key={k} className="flex items-center gap-1.5" title={snap?.[`plc.${k}`] === true ? "감지" : "없음"}>
              <Dot on={plcOk && snap?.[`plc.${k}`] === true} dim={!plcOk} />{l}
            </span>
          ))}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Btn size="sm" lock={ionLock} onClick={() => press("ion")}>{on("ion") ? "이오나이저 끄기" : "이오나이저 켜기"}{wait("ion") && " · 전환 중"}</Btn>
          <StateBox on={plcOk ? snap?.["plc.ion_run"] === true : null} label="구동" />
          <StateBox on={plcOk ? snap?.["plc.ion_lamp"] === true : null} label="점등" />
          {plcOk && snap?.["plc.ion_ot"] === true ? <Chip tone="warn" icon={<AlertTriangle size={11} />}>수명 초과</Chip> : <StateBox on={plcOk ? false : null} label="수명 초과" />}
          {mvItl ? <Chip tone="warn">MV 인터록</Chip> : <StateBox on={plcOk ? false : null} label="MV 인터록" />}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-[#5B6470]">
        범례: 진회색 채움 = 켜짐·열림 · 흰 바탕 테두리 = 꺼짐·닫힘 · 파란 점선 = 전환 중 · 진회색 배관 = 열린 구간 · 채운 점 = 감지 ·
        주의색 = 이상. 노드를 누르거나 Tab 으로 골라 Enter 로 조작(확인창).
      </p>
    </Card>
  );
}
