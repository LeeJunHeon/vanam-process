"use client";

import { CHK_NODE_COMMANDS } from "@/lib/opsCommands";
import type { PendingCmd } from "@/components/ops/OpsKit";

type Props = {
  valves?: Record<string, boolean>;
  indicators?: Record<string, boolean>;
  heater?: { pv?: string; sv?: string; status?: string };
  online: boolean;
  onRequest: (c: PendingCmd) => void;
};

// 장비 프로그램과 동일한 색 규칙
const GREEN = "#22c55e";
const GREEN_D = "#16a34a";
const RED = "#ef4444";
const RED_D = "#dc2626";
const GRAY = "#d4d4d8";
const GRAY_D = "#a1a1aa";
const PIPE = "#d4d4d8";
const PIPE_ON = "#86efac";

function nodeFill(on: boolean, alert?: boolean) {
  if (!on) return { fill: GRAY, stroke: GRAY_D, text: "#3f3f46" };
  return alert
    ? { fill: RED, stroke: RED_D, text: "#ffffff" }
    : { fill: GREEN, stroke: GREEN_D, text: "#052e16" };
}

// 조작 가능한 노드
function Node({
  x, y, w, h, label, btn, alert, fontSize = 13, on, clickable, onClick,
}: {
  x: number; y: number; w: number; h: number; label: string;
  btn?: string; alert?: boolean; fontSize?: number;
  on: boolean; clickable: boolean; onClick: (btn: string) => void;
}) {
  const c = nodeFill(on, alert);
  return (
    <g
      onClick={() => btn && onClick(btn)}
      style={{ cursor: clickable ? "pointer" : "default" }}
      className={clickable ? "opacity-100 hover:opacity-80" : ""}
    >
      <rect
        x={x} y={y} width={w} height={h} rx={8}
        fill={c.fill} stroke={c.stroke} strokeWidth={1.5}
      />
      <text
        x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central"
        fontSize={fontSize} fontWeight={700} fill={c.text}
      >
        {label}
      </text>
    </g>
  );
}

function Static({ x, y, w, h, label }: { x: number; y: number; w: number; h: number; label: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={GRAY} stroke={GRAY_D} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central"
        fontSize={13} fontWeight={700} fill="#3f3f46">{label}</text>
    </g>
  );
}

function Pipe({ d, on }: { d: string; on: boolean }) {
  return (
    <path d={d} fill="none" stroke={on ? PIPE_ON : PIPE} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
  );
}

function Lamp({ x, label, on, alert }: { x: number; label: string; on: boolean; alert?: boolean }) {
  return (
    <g>
      <circle
        cx={x} cy={26} r={13}
        fill={on ? (alert ? RED : GREEN) : GRAY}
        stroke={on ? (alert ? RED_D : GREEN_D) : GRAY_D}
        strokeWidth={1.5}
      />
      <text x={x} y={52} textAnchor="middle" fontSize={11} fontWeight={600} fill="#52525b">{label}</text>
    </g>
  );
}

export default function ChkMimic({ valves, indicators, heater, online, onRequest }: Props) {
  const v = (k: string) => Boolean(valves?.[k]);
  const ind = (k: string) => Boolean(indicators?.[k]);

  const click = (btnKey: string) => {
    const def = CHK_NODE_COMMANDS[btnKey];
    if (!def || !online) return;
    const cur = def.stateKey ? v(def.stateKey) : false;
    onRequest({
      command: def.key,
      label: def.label,
      detail: cur ? "→ OFF" : "→ ON",
      danger: def.danger,
      args: { on: !cur },
    });
  };

  const heaterOn = (heater?.status ?? "").includes("운전");

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">챔버 계통도</h3>
        <span className="text-[11px] text-gray-400">
          {online ? "노드를 눌러 조작" : "장비 미연결"}
        </span>
      </div>
      <svg viewBox="0 0 700 470" className="w-full select-none" role="img" aria-label="CHK 챔버 계통도">
        {/* 상태 램프 (ATM만 빨강) */}
        <Lamp x={40} label="Air" on={ind("Air")} />
        <Lamp x={120} label="G1" on={ind("G1")} />
        <Lamp x={200} label="G2" on={ind("G2")} />
        <Lamp x={280} label="ATM" on={ind("ATM")} alert />
        <Lamp x={360} label="Water" on={ind("Water")} />

        {/* 가스 라인 */}
        <Pipe d="M 112 128 H 150" on={v("Ar")} />
        <Pipe d="M 226 128 H 300" on={v("Ar")} />
        <Pipe d="M 112 190 H 150" on={v("O2")} />
        <Pipe d="M 226 190 H 300" on={v("O2")} />
        <Static x={26} y={104} w={86} h={48} label="MFC" />
        <Node x={150} y={104} w={76} h={48} label="Ar" btn="Ar_Button"  on={v(CHK_NODE_COMMANDS["Ar_Button"]?.stateKey ?? "")} clickable={online} onClick={click} />
        <Static x={26} y={166} w={86} h={48} label="MFC" />
        <Node x={150} y={166} w={76} h={48} label="O₂" btn="O2_Button"  on={v(CHK_NODE_COMMANDS["O2_Button"]?.stateKey ?? "")} clickable={online} onClick={click} />

        {/* 도어 */}
        <Pipe d="M 400 96 V 116" on={v("Door")} />
        <Node x={330} y={48} w={140} h={48} label="Door" btn="Door_Button"  on={v(CHK_NODE_COMMANDS["Door_Button"]?.stateKey ?? "")} clickable={online} onClick={click} />

        {/* 챔버 */}
        <rect x={300} y={116} width={200} height={150} rx={12}
          fill="#fafafa" stroke="#a1a1aa" strokeWidth={2} />
        <text x={400} y={136} textAnchor="middle" fontSize={14} fontWeight={700} fill="#52525b">
          Chamber
        </text>
        <Node x={312} y={150} w={80} h={30} label="S1" btn="S1_button" fontSize={12}  on={v(CHK_NODE_COMMANDS["S1_button"]?.stateKey ?? "")} clickable={online} onClick={click} />
        <Node x={408} y={150} w={80} h={30} label="S2" btn="S2_button" fontSize={12}  on={v(CHK_NODE_COMMANDS["S2_button"]?.stateKey ?? "")} clickable={online} onClick={click} />
        <Node x={330} y={190} w={140} h={30} label="M.S." btn="MS_button" fontSize={12}  on={v(CHK_NODE_COMMANDS["MS_button"]?.stateKey ?? "")} clickable={online} onClick={click} />
        <g>
          <rect x={330} y={228} width={140} height={28} rx={6}
            fill={heaterOn ? GREEN : GRAY} stroke={heaterOn ? GREEN_D : GRAY_D} strokeWidth={1.5} />
          <text x={400} y={242} textAnchor="middle" dominantBaseline="central"
            fontSize={12} fontWeight={700} fill={heaterOn ? "#052e16" : "#3f3f46"}>
            Heater {heater?.pv ? `${heater.pv}℃` : ""}
          </text>
        </g>

        {/* 벤트 */}
        <Pipe d="M 500 160 H 560" on={v("Vent")} />
        <Node x={560} y={136} w={100} h={48} label="Vent" btn="Vent_button"  on={v(CHK_NODE_COMMANDS["Vent_button"]?.stateKey ?? "")} clickable={online} onClick={click} />

        {/* 터보 배기 라인 */}
        <Pipe d="M 360 266 V 300" on={v("MV")} />
        <Node x={310} y={300} w={100} h={44} label="M.V." btn="MV_button"  on={v(CHK_NODE_COMMANDS["MV_button"]?.stateKey ?? "")} clickable={online} onClick={click} />
        <Pipe d="M 360 344 V 376" on={v("Turbo")} />
        <Node x={302} y={376} w={116} h={50} label="Turbo" btn="Turbo_button"  on={v(CHK_NODE_COMMANDS["Turbo_button"]?.stateKey ?? "")} clickable={online} onClick={click} />
        <Pipe d="M 418 400 H 452" on={v("FV")} />
        <Node x={452} y={376} w={96} h={50} label="F.V." btn="FV_button"  on={v(CHK_NODE_COMMANDS["FV_button"]?.stateKey ?? "")} clickable={online} onClick={click} />
        <Pipe d="M 548 400 H 578" on={v("Rotary")} />
        <Node x={578} y={376} w={110} h={50} label="Rotary" btn="Rotary_button"  on={v(CHK_NODE_COMMANDS["Rotary_button"]?.stateKey ?? "")} clickable={online} onClick={click} />

        {/* 러핑 라인 */}
        <Pipe d="M 500 236 H 622 V 300" on={v("RV")} />
        <Node x={572} y={300} w={100} h={44} label="R.V." btn="RV_button"  on={v(CHK_NODE_COMMANDS["RV_button"]?.stateKey ?? "")} clickable={online} onClick={click} />
        <Pipe d="M 622 344 V 376" on={v("RV")} />

        {/* 부저 */}
        <Node x={26} y={376} w={130} h={50} label="Buzz Stop" btn="BuzzStop_Button" fontSize={12}  on={v(CHK_NODE_COMMANDS["BuzzStop_Button"]?.stateKey ?? "")} clickable={online} onClick={click} />
      </svg>
      <p className="mt-1 text-[10px] text-gray-400">
        초록 = ON / 열림 · 회색 = OFF / 닫힘 · 빨강 = ATM
      </p>
    </section>
  );
}
