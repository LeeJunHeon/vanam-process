"use client";

// 챔버12 장비 그림(챔버 하나) — 게이트·도어·벤트·척·셔터(Main·Gun)·가스(Ar·O₂·N₂ 차단밸브·Main 가스)·배기(M.V.·Turbo·F.V.·R.V.·Rotary).
// 값은 1초 행 PLC 열(묶음 snapshot 의 plc 블록 — plc.<코일 이름 소문자>, 예 plc.g_v_1_open_lamp)과 MFC·IG 값.
// 그림 모양·색은 챔버K 계통도(Chk2Mimic)와 같게: 켜짐 초록, 램프 초록 = 검출, 파랑 점선 = 전환 중, PLC 값이 오래되면 회색·잠금.
// 노드를 누르면 묶음 plcButtons 중 addr(또는 target)가 그 코일인 버튼 → 확인창("정말 하시겠습니까?") → PLC_BUTTON {target, on}.
// 버튼이 묶음에 없는 노드는 보기만. 인터락 비트(…_인터락)는 꺼진 것만 아래에 작게.
import type { ReactNode } from "react";
import { Dot, type Ask } from "../chk/kit";
import { useChk2Mode } from "../chk/mode";
import { short } from "./logic";
import type { Ch12Bundle } from "./types";

const GREEN = "#22c55e", GREEN_D = "#16a34a", GRAY_D = "#a1a1aa", PIPE = "#d4d4d8", PIPE_ON = "#86efac";
const RED = "#ef4444", RED_D = "#dc2626";

type PlcBtn = { target: string; addr: string; label: string };

/** 코일 이름(소문자, plc. 없이) → 묶음 버튼 */
export function plcButtonFor(b: Ch12Bundle | null, col: string): PlcBtn | undefined {
  const c = col.toLowerCase();
  return (b?.plcButtons ?? []).find((x) => x.addr?.toLowerCase() === c || x.target?.toLowerCase() === c);
}

/** 위험한 PLC 버튼(벤트·도어·게이트) — 확인창 빨강 문구 */
export const dangerPlc = (col: string) => /vent|door|g_v_|l_pin/i.test(col);

export function plcAsk(btn: PlcBtn, want: boolean, col: string): Ask {
  return {
    kind: "PLC_BUTTON", label: btn.label, detail: want ? "→ ON" : "→ OFF", args: { target: btn.target, on: want },
    danger: dangerPlc(col), plc: { target: btn.target, want },
    note: "정말 하시겠습니까? PLC 출력이 바로 바뀝니다. 공정 중에도 실행되며 공정 기록에 남습니다.",
  };
}

type Props = {
  bundle: Ch12Bundle | null; snapshot?: Record<string, unknown>; ch: "ch1" | "ch2"; plcOk: boolean;
  canPress: (target: string) => boolean; pending: Record<string, boolean>; onAsk: (a: Ask) => void; note: string;
};

export default function Ch12Mimic({ bundle, snapshot, ch, plcOk, canPress, pending, onAsk, note }: Props) {
  const { detail } = useChk2Mode();
  const n = ch === "ch1" ? 1 : 2;
  const v = (col: string) => snapshot?.[`plc.${col}`];
  const on = (col: string) => plcOk && v(col) === true;
  const btnOf = (col: string) => plcButtonFor(bundle, col);
  const isPending = (col: string) => {
    const b = btnOf(col);
    return plcOk && !!b && pending[b.target] !== undefined && pending[b.target] !== (v(col) === true);
  };
  const active = (col: string) => { const b = btnOf(col); return !!b && plcOk && canPress(b.target); };
  const click = (col: string) => {
    const b = btnOf(col);
    if (!b || !active(col)) return;
    onAsk(plcAsk(b, !(v(col) === true), col));
  };

  /** 누르는 노드 — sw = 버튼 코일, lamp = 켜짐 표시(없으면 sw) */
  const node = ({ x, y, w, h, label, sw, lamp, fs = 11 }:
    { x: number; y: number; w: number; h: number; label: string; sw: string; lamp?: string; fs?: number }) => {
    const lit = on(lamp ?? sw);
    const wait = isPending(sw);
    const b = btnOf(sw);
    return (
      <g key={`${sw}-${x}-${y}`} onClick={() => click(sw)} style={{ cursor: active(sw) ? "pointer" : "default" }}
        className={wait ? "animate-pulse" : undefined}>
        <title>{`${b?.label ?? label}${detail ? ` · plc.${lamp ?? sw}` : ""}${b ? "" : " (버튼 없음 — 보기만)"}`}</title>
        <rect x={x} y={y} width={w} height={h} rx={6} fill={lit ? GREEN : "#ffffff"}
          stroke={wait ? "#3b82f6" : lit ? GREEN_D : GRAY_D} strokeWidth={wait || lit ? 2 : 1.25}
          strokeDasharray={wait ? "5 3" : undefined} />
        <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight={700}
          fill={lit ? "#052e16" : "#52525b"}>{label}</text>
      </g>
    );
  };
  const box = (x: number, y: number, w: number, h: number, children: ReactNode) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={6} fill="#fafafa" stroke="#e4e4e7" strokeWidth={1.25} />
      {children}
    </g>
  );
  const pipe = (d: string, lit: boolean) => (
    <path key={d} d={d} fill="none" stroke={lit ? PIPE_ON : PIPE} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
  );
  const txt = (x: number, y: number, s: string, opt: { fs?: number; fill?: string; bold?: boolean; anchor?: "start" | "middle" | "end" } = {}) => (
    <text x={x} y={y} textAnchor={opt.anchor ?? "middle"} dominantBaseline="central" fontSize={opt.fs ?? 10}
      fontWeight={opt.bold ? 700 : 500} fill={opt.fill ?? "#71717a"}>{s}</text>
  );

  // 가스 줄(CH1 Ar·O₂, CH2 Ar·O₂·N₂)
  const gases = (bundle?.chambers?.find((c) => c.id === ch)?.gases ?? (n === 1 ? ["ar", "o2"] : ["ar", "o2", "n2"]));
  const gasName: Record<string, string> = { ar: "Ar", o2: "O₂", n2: "N₂" };
  const flow = (g: string) => snapshot?.[`${ch}.mfc.${g}_sccm`];
  const gasRows = gases.map((g, i) => ({ g, y: 40 + i * 46, sw: `${g}_${n}_gas_sw` }));
  const mainGas = `main_${n}_gas_sw`;
  const guns = n === 2 ? [1, 2, 3] : [];
  const zpos = ["up", "mid", "down"].find((p) => v(`z${n}_${p}_location`) === true);
  const ig = snapshot?.[`${ch}.ig.pressure_torr`];
  const wp = snapshot?.[`${ch}.mfc.pressure_mtorr`];
  const igText = typeof ig === "number" ? ig.toExponential(2) : "—";

  // 인터락 — 꺼진 것(미충족)만
  const itlNames = [`r_v_${n}`, `f_v_${n}`, `m_v_${n}`, `vent_${n}`, `turbo_${n}`, `door_${n}`, `g_v_${n}`, `main_shutter_${n}`,
    ...gases.map((g) => `${g}_${n}_gas`), `main_${n}_gas`];
  const itlOff = plcOk ? itlNames.filter((x) => v(`${x}_인터락`) === false) : [];
  const lamp = (col: string, label: string, alert = false) => {
    const lit = v(col) === true;
    return (
      <span key={col} className="flex items-center gap-1 text-[10px] text-gray-600" title={detail ? `plc.${col}` : undefined}>
        <span className="h-2.5 w-2.5 rounded-full border" style={!plcOk ? { backgroundColor: "#e5e7eb", borderColor: "#9ca3af" }
          : lit ? { backgroundColor: alert ? RED : GREEN, borderColor: alert ? RED_D : GREEN_D } : { backgroundColor: "#fff", borderColor: "#d4d4d8" }} />
        {label}
      </span>
    );
  };

  return (
    <section className="flex flex-col rounded-2xl border border-gray-100 bg-white p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">{n === 1 ? "CH1" : "CH2"} 장비 그림</h3>
        <span className={`text-[11px] ${note.includes("잠금") ? "text-rose-600" : "text-gray-400"}`}>{note}</span>
      </div>
      <svg viewBox="0 0 430 336" className="w-full select-none" role="img" aria-label={`${ch.toUpperCase()} 장비 그림`}>
        {/* 배관 */}
        {gasRows.map((r) => pipe(`M 74 ${r.y + 16} H 88`, on(r.sw)))}
        {gasRows.map((r) => pipe(`M 140 ${r.y + 16} H 152 V 102 H 160`, on(r.sw)))}
        {pipe("M 214 102 H 236", on(mainGas))}
        {pipe("M 360 56 H 372", on(`vent_${n}_sw`))}
        {pipe("M 360 120 H 372", on(`g_v_${n}_open_lamp`))}
        {pipe("M 294 196 V 206", on(`m_v_${n}_sw`))}
        {pipe("M 294 234 V 246", on(`turbo_${n}_sw`))}
        {pipe("M 294 274 V 286", on(`f_v_${n}_sw`))}
        {pipe("M 266 300 H 124", on(`f_v_${n}_sw`) && on(`r_p_${n}_sw`))}
        {pipe("M 248 196 V 236 H 208", on(`r_v_${n}_sw`))}
        {pipe("M 152 236 H 84 V 286", on(`r_v_${n}_sw`) && on(`r_p_${n}_sw`))}

        {/* 챔버 본체 */}
        <rect x={236} y={34} width={124} height={162} rx={12} fill="#fafafa" stroke="#a1a1aa" strokeWidth={2} />
        {txt(298, 46, n === 1 ? "CH1" : "CH2", { fs: 12, bold: true, fill: "#52525b" })}
        {txt(298, 62, `IG ${igText} Torr`, { fs: 9, fill: "#3f3f46" })}
        {txt(298, 74, `압력 ${short(wp)} mTorr`, { fs: 9, fill: "#3f3f46" })}
        {guns.map((g, i) => node({ x: 244 + i * 38, y: 84, w: 34, h: 20, label: `G${g}`, sw: `shutter_${g}_sw`, fs: 9 }))}
        {/* 척 */}
        <rect x={262} y={112} width={72} height={30} rx={5} fill={zpos ? "#eff6ff" : "#f4f4f5"} stroke={zpos ? "#93c5fd" : "#d4d4d8"} />
        {txt(298, 122, "척", { fs: 9, fill: "#52525b", bold: true })}
        {txt(298, 134, zpos ? zpos.toUpperCase() : "위치 모름", { fs: 9, fill: zpos ? "#1d4ed8" : "#a1a1aa", bold: !!zpos })}
        {node({ x: 252, y: 152, w: 92, h: 24, label: "Main Shutter", sw: `main_shutter_${n}_sw`, fs: 10 })}
        {txt(298, 186, v(`loading_${n}_sensor_lamp`) === true ? "기판 감지" : "기판 없음", { fs: 9,
          fill: v(`loading_${n}_sensor_lamp`) === true ? "#16a34a" : "#a1a1aa" })}

        {/* 도어 */}
        {node({ x: 242, y: 4, w: 54, h: 24, label: "Door 열기", sw: `door_${n}_open_sw`, lamp: `door_${n}_open_lamp`, fs: 9 })}
        {node({ x: 300, y: 4, w: 54, h: 24, label: "Door 닫기", sw: `door_${n}_close_sw`, lamp: `door_${n}_close_lamp`, fs: 9 })}
        {/* 벤트·게이트 */}
        {node({ x: 372, y: 42, w: 54, h: 28, label: "Vent", sw: `vent_${n}_sw`, lamp: `vent_${n}_lamp` })}
        {txt(399, 90, "게이트", { fs: 9, bold: true })}
        {node({ x: 372, y: 98, w: 54, h: 22, label: "G.V. 열기", sw: `g_v_${n}_open_sw`, lamp: `g_v_${n}_open_lamp`, fs: 9 })}
        {node({ x: 372, y: 124, w: 54, h: 22, label: "G.V. 닫기", sw: `g_v_${n}_close_sw`, lamp: `g_v_${n}_close_lamp`, fs: 9 })}

        {/* 가스 */}
        {gasRows.map((r) => (
          <g key={r.g}>
            {box(4, r.y, 70, 32, <>
              {txt(39, r.y + 10, `MFC ${gasName[r.g] ?? r.g}`, { fs: 9, bold: true, fill: "#52525b" })}
              {txt(39, r.y + 23, `${short(flow(r.g))} sccm`, { fs: 9, fill: "#3f3f46" })}
            </>)}
            {node({ x: 88, y: r.y, w: 52, h: 32, label: gasName[r.g] ?? r.g, sw: r.sw, fs: 12 })}
          </g>
        ))}
        {node({ x: 160, y: 88, w: 54, h: 28, label: "Main 가스", sw: mainGas, fs: 9 })}

        {/* 배기 */}
        {node({ x: 266, y: 206, w: 56, h: 28, label: "M.V.", sw: `m_v_${n}_sw`, fs: 12 })}
        {node({ x: 258, y: 246, w: 72, h: 28, label: "Turbo", sw: `turbo_${n}_sw`, fs: 12 })}
        {node({ x: 266, y: 286, w: 56, h: 28, label: "F.V.", sw: `f_v_${n}_sw`, fs: 12 })}
        {node({ x: 152, y: 222, w: 56, h: 28, label: "R.V.", sw: `r_v_${n}_sw`, fs: 12 })}
        {node({ x: 44, y: 286, w: 80, h: 28, label: "Rotary", sw: `r_p_${n}_sw`, fs: 12 })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-50 pt-1.5">
        {lamp(`gauge_${n}_a_interlock`, "게이지 A 인터락")}
        {lamp(`gauge_${n}_b_interlock`, "게이지 B 인터락")}
        {n === 2 && lamp("sw_rf_select", "Power Select(RF)")}
        {n === 2 && lamp("sw_power_select", "Power Select")}
        <span className="flex items-center gap-1 text-[10px] text-gray-500"><Dot on={v(`r_p_${n}_off_timer`) === true} dim={!plcOk} />Rotary OFF 타이머</span>
        {itlOff.length > 0 && (
          <span className="text-[10px] font-semibold text-amber-700" title={itlOff.map((x) => `${x}_인터락`).join(", ")}>
            인터락 미충족 {itlOff.length}개{detail ? ` — ${itlOff.join(", ")}` : ""}
          </span>
        )}
        <span className="ml-auto text-[10px] text-gray-400">초록 = ON·검출 · 파랑 점선 = 전환 중</span>
      </div>
    </section>
  );
}
