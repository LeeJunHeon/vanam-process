"use client";

// 챔버K v2 계통도 — v1 ChkMimic 의 그림·색·동작을 v2 데이터로(v1 은 전환 뒤 지운다).
// 노드 상태 = snapshot plc.<addr>(묶음 plcButtons 의 addr — ion 만 target 과 다르다: ion_remote_on), 버튼 = 묶음 plcButtons.
// 그리는 순서 배관 → 챔버 → 노드. 램프 켜짐 초록·꺼짐 빨강, PLC 품질이 ok 가 아니면 회색·노드 OFF·조작 잠금.
// PLC 잠금은 값 나이 기준(logic.plcFresh — 부르는 쪽이 plcOk 로).
// 누르면 확인창 한 번 → PLC_BUTTON → 실제 값이 바뀔 때까지 "전환 중"(10 s 넘으면 풀기 — 부르는 쪽).
import { Dot, type Ask } from "./kit";
import type { Bundle } from "./types";

const GREEN = "#22c55e";
const GREEN_D = "#16a34a";
const RED = "#ef4444";
const RED_D = "#dc2626";
const GRAY_D = "#a1a1aa";
const PIPE = "#d4d4d8";
const PIPE_ON = "#86efac";
const DANGER = new Set(["vent", "door_up", "door_down"]);   // v1 과 같게

type Props = {
  bundle: Bundle | null;
  snapshot?: Record<string, unknown>;
  plcOk: boolean;              // PLC 품질 ok
  canPress: (target: string) => boolean;   // 연결·권한(PLC_BUTTON)·같은 target 결과 기다리는 중이 아님
  pending: Record<string, boolean>;   // target → 바라는 값
  onAsk: (a: Ask) => void;
  note: string;                // 오른쪽 위 안내(잠금 이유)
};

export default function Chk2Mimic({ bundle, snapshot, plcOk, canPress, pending, onAsk, note }: Props) {
  const buttons = bundle?.plcButtons ?? [];
  const btn = (target: string) => buttons.find((b) => b.target === target);
  const raw = (target: string) => snapshot?.[`plc.${btn(target)?.addr ?? target}`];
  const isOn = (target: string) => plcOk && raw(target) === true;
  const isPending = (target: string) =>
    plcOk && pending[target] !== undefined && pending[target] !== (raw(target) === true);
  const active = (t: string) => canPress(t) && plcOk;

  const click = (target: string) => {
    const b = btn(target);
    if (!b || !active(target)) return;
    const want = !(raw(target) === true);
    onAsk({ kind: "PLC_BUTTON", label: b.label, detail: want ? "→ ON" : "→ OFF", args: { target, on: want },
            danger: DANGER.has(target), plc: { target, want } });
  };

  const node = ({ x, y, w, h, label, t, fs = 12 }:
    { x: number; y: number; w: number; h: number; label: string; t: string; fs?: number }) => {
    const on = isOn(t);
    const wait = isPending(t);
    const has = !!btn(t);
    return (
      <g onClick={() => click(t)} style={{ cursor: active(t) && has ? "pointer" : "default" }}
        className={wait ? "animate-pulse" : undefined}>
        <title>{btn(t)?.label ?? label}</title>
        <rect x={x} y={y} width={w} height={h} rx={7}
          fill={on ? GREEN : "#ffffff"}
          stroke={wait ? "#3b82f6" : on ? GREEN_D : GRAY_D}
          strokeWidth={wait || on ? 2 : 1.25}
          strokeDasharray={wait ? "5 3" : undefined} />
        <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central"
          fontSize={fs} fontWeight={700} fill={on ? "#052e16" : "#52525b"}>{label}</text>
      </g>
    );
  };

  const fixed = ({ x, y, w, h, label }: { x: number; y: number; w: number; h: number; label: string }) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={7} fill="#fafafa" stroke="#e4e4e7" strokeWidth={1.25} />
      <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central"
        fontSize={12} fontWeight={600} fill="#71717a">{label}</text>
    </g>
  );

  const pipe = ({ d, on }: { d: string; on: boolean }) => (
    <path d={d} fill="none" stroke={on ? PIPE_ON : PIPE} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
  );

  const lamps = [
    { key: "air", label: "Air" }, { key: "g1", label: "G1" }, { key: "g2", label: "G2" },
    { key: "atm", label: "ATM" }, { key: "water", label: "Water" },
  ];
  const bit = (k: string) => snapshot?.[`plc.${k}`] === true;

  const toggle = ({ t, label }: { t: string; label: string }) => (
    <button onClick={() => click(t)} disabled={!active(t) || !btn(t)}
      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40 ${
        isPending(t) ? "animate-pulse border-dashed border-blue-500 text-blue-700"
        : isOn(t) ? "border-green-600 bg-green-500 text-green-950" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
      {label}{isOn(t) ? " ON" : ""}
    </button>
  );

  return (
    <section className="flex flex-col rounded-2xl border border-gray-100 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">계통도</h3>
        <span className={`text-[11px] ${note.includes("잠금") ? "text-rose-600" : "text-gray-400"}`}>{note}</span>
      </div>

      <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-gray-50 px-2.5 py-1">
        {lamps.map((l) => {
          const on = bit(l.key);
          return (
            <span key={l.key} className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
              <span className="h-3 w-3 rounded-full border"
                style={!plcOk ? { backgroundColor: "#e5e7eb", borderColor: "#9ca3af" }
                  : { backgroundColor: on ? GREEN : RED, borderColor: on ? GREEN_D : RED_D }} />
              {l.label}
            </span>
          );
        })}
      </div>

      <svg viewBox="0 0 640 316" className="w-full select-none" role="img" aria-label="챔버K v2 계통도">
        {/* 1층: 배관 */}
        <g>
          {pipe({ d: "M 92 76 H 118", on: isOn("ar_valve") })}
          {pipe({ d: "M 190 76 H 232", on: isOn("ar_valve") })}
          {pipe({ d: "M 92 140 H 118", on: isOn("o2_valve") })}
          {pipe({ d: "M 190 140 H 232", on: isOn("o2_valve") })}
          {pipe({ d: "M 320 40 V 52", on: isOn("door_up") })}
          {pipe({ d: "M 408 76 H 448", on: isOn("vent") })}
          {pipe({ d: "M 290 176 V 204", on: isOn("mv") })}
          {pipe({ d: "M 290 250 V 268", on: isOn("turbo") })}
          {pipe({ d: "M 352 290 H 400", on: isOn("fv") })}
          {pipe({ d: "M 492 290 H 528", on: isOn("rotary") })}
          {pipe({ d: "M 386 176 V 190 H 576 V 204", on: isOn("rv") })}
          {pipe({ d: "M 576 250 V 268", on: isOn("rv") })}
        </g>

        {/* 2층: 챔버 본체 */}
        <rect x={232} y={52} width={176} height={124} rx={12} fill="#fafafa" stroke="#a1a1aa" strokeWidth={2} />
        <text x={320} y={70} textAnchor="middle" fontSize={13} fontWeight={700} fill="#52525b">Chamber</text>

        {/* 3층: 노드 */}
        <g>
          {fixed({ x: 16, y: 54, w: 76, h: 44, label: "MFC" })}
          {node({ x: 118, y: 54, w: 72, h: 44, label: "Ar", t: "ar_valve", fs: 13 })}
          {fixed({ x: 16, y: 118, w: 76, h: 44, label: "MFC" })}
          {node({ x: 118, y: 118, w: 72, h: 44, label: "O₂", t: "o2_valve", fs: 13 })}
          {node({ x: 262, y: 2, w: 56, h: 38, label: "Door ↑", t: "door_up", fs: 11 })}
          {node({ x: 322, y: 2, w: 56, h: 38, label: "Door ↓", t: "door_down", fs: 11 })}
          {node({ x: 448, y: 54, w: 96, h: 44, label: "Vent", t: "vent", fs: 13 })}
          {node({ x: 242, y: 84, w: 76, h: 30, label: "S1", t: "s1", fs: 12 })}
          {node({ x: 322, y: 84, w: 76, h: 30, label: "S2", t: "s2", fs: 12 })}
          {node({ x: 252, y: 128, w: 136, h: 30, label: "M.S.", t: "ms", fs: 12 })}
          {node({ x: 238, y: 204, w: 104, h: 46, label: "M.V.", t: "mv", fs: 13 })}
          {node({ x: 232, y: 268, w: 120, h: 44, label: "Turbo", t: "turbo", fs: 13 })}
          {node({ x: 400, y: 268, w: 92, h: 44, label: "F.V.", t: "fv", fs: 13 })}
          {node({ x: 528, y: 268, w: 96, h: 44, label: "Rotary", t: "rotary", fs: 13 })}
          {node({ x: 524, y: 204, w: 104, h: 46, label: "R.V.", t: "rv", fs: 13 })}
        </g>
      </svg>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-gray-50 pt-1.5">
        {/* 부저 정지는 위 정지 줄의 BUZZ_STOP 명령으로(PLC 버튼 buzz_stop 은 여기 두지 않는다) */}
        {toggle({ t: "ion", label: "이오나이저" })}
        <span className="flex items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><Dot on={bit("ion_run")} dim={!plcOk} />구동</span>
          <span className="flex items-center gap-1"><Dot on={bit("ion_lamp")} dim={!plcOk} />점등</span>
          <span className="flex items-center gap-1"><Dot on={bit("ion_ot")} alert dim={!plcOk} />수명 초과</span>
          <span className="flex items-center gap-1"><Dot on={bit("mv_interlock")} dim={!plcOk} />MV 인터록</span>
        </span>
        <span className="ml-auto text-[10px] text-gray-400">
          램프 초록 = 정상 · 빨강 = 미검출 · 노드 초록 = ON · 파랑 점선 = 전환 중
        </span>
      </div>
    </section>
  );
}
