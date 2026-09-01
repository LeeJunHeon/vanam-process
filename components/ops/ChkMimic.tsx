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

const GREEN = "#22c55e";
const GREEN_D = "#16a34a";
const RED = "#ef4444";
const RED_D = "#dc2626";
const GRAY = "#e4e4e7";
const GRAY_D = "#a1a1aa";
const PIPE = "#d4d4d8";
const PIPE_ON = "#86efac";

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

  const isOn = (btn: string) => v(CHK_NODE_COMMANDS[btn]?.stateKey ?? "");

  // 조작 가능한 배관 노드
  const Node = ({
    x, y, w, h, label, btn, fs = 13,
  }: { x: number; y: number; w: number; h: number; label: string; btn: string; fs?: number }) => {
    const on = isOn(btn);
    const can = online;
    return (
      <g onClick={() => click(btn)} style={{ cursor: can ? "pointer" : "default" }}>
        <rect
          x={x} y={y} width={w} height={h} rx={8}
          fill={on ? GREEN : "#ffffff"}
          stroke={on ? GREEN_D : GRAY_D}
          strokeWidth={on ? 2 : 1.5}
        />
        <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central"
          fontSize={fs} fontWeight={700} fill={on ? "#052e16" : "#52525b"}>{label}</text>
        {can && (
          <rect x={x} y={y} width={w} height={h} rx={8} fill="transparent"
            className="transition-colors hover:fill-black/5" />
        )}
      </g>
    );
  };

  // 조작 불가 표시 전용 노드
  const Static = ({ x, y, w, h, label }: { x: number; y: number; w: number; h: number; label: string }) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="#fafafa" stroke={GRAY} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central"
        fontSize={13} fontWeight={600} fill="#71717a">{label}</text>
    </g>
  );

  const Pipe = ({ d, on }: { d: string; on: boolean }) => (
    <path d={d} fill="none" stroke={on ? PIPE_ON : PIPE} strokeWidth={8}
      strokeLinecap="round" strokeLinejoin="round" />
  );

  const heaterOn = (heater?.status ?? "").includes("운전");

  const lamps: { key: string; label: string; alert?: boolean }[] = [
    { key: "Air", label: "Air" },
    { key: "G1", label: "G1" },
    { key: "G2", label: "G2" },
    { key: "ATM", label: "ATM", alert: true },
    { key: "Water", label: "Water" },
  ];

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">챔버 계통도</h3>
        <span className="text-[11px] text-gray-400">
          {online ? "노드를 눌러 조작" : "장비 미연결"}
        </span>
      </div>

      {/* 상태 램프 — SVG 밖에 두어 라벨 겹침을 원천 차단 */}
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-gray-50 px-3 py-2">
        {lamps.map((l) => {
          const on = ind(l.key);
          return (
            <span key={l.key} className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <span
                className="h-3.5 w-3.5 rounded-full border"
                style={{
                  backgroundColor: on ? (l.alert ? RED : GREEN) : "#ffffff",
                  borderColor: on ? (l.alert ? RED_D : GREEN_D) : GRAY_D,
                }}
              />
              {l.label}
            </span>
          );
        })}
      </div>

      <svg viewBox="0 0 720 400" className="w-full select-none" role="img" aria-label="CHK 챔버 계통도">
        {/* 가스 라인 (좌 → 우) */}
        <Pipe d="M 100 82 H 130" on={isOn("Ar_Button")} />
        <Pipe d="M 200 82 H 272" on={isOn("Ar_Button")} />
        <Pipe d="M 100 152 H 130" on={isOn("O2_Button")} />
        <Pipe d="M 200 152 H 272" on={isOn("O2_Button")} />
        <Static x={20} y={62} w={80} h={40} label="MFC" />
        <Node x={130} y={62} w={70} h={40} label="Ar" btn="Ar_Button" />
        <Static x={20} y={132} w={80} h={40} label="MFC" />
        <Node x={130} y={132} w={70} h={40} label="O₂" btn="O2_Button" />

        {/* 도어 (챔버 상단) */}
        <Pipe d="M 370 38 V 52" on={isOn("Door_Button")} />
        <Node x={310} y={2} w={120} h={36} label="Door" btn="Door_Button" />

        {/* 벤트 (챔버 우측) */}
        <Pipe d="M 468 82 H 542" on={isOn("Vent_button")} />
        <Node x={542} y={62} w={90} h={40} label="Vent" btn="Vent_button" />

        {/* 챔버 본체 */}
        <rect x={270} y={50} width={200} height={172} rx={12}
          fill="#fafafa" stroke="#a1a1aa" strokeWidth={2} />
        <text x={370} y={68} textAnchor="middle" fontSize={13} fontWeight={700} fill="#52525b">
          Chamber
        </text>
        <Node x={284} y={82} w={82} h={30} label="S1" btn="S1_button" fs={12} />
        <Node x={374} y={82} w={82} h={30} label="S2" btn="S2_button" fs={12} />
        <Node x={300} y={122} w={140} h={30} label="M.S." btn="MS_button" fs={12} />
        <g>
          <rect x={300} y={162} width={140} height={30} rx={8}
            fill={heaterOn ? GREEN : "#ffffff"} stroke={heaterOn ? GREEN_D : GRAY_D}
            strokeWidth={heaterOn ? 2 : 1.5} />
          <text x={370} y={177} textAnchor="middle" dominantBaseline="central"
            fontSize={12} fontWeight={700} fill={heaterOn ? "#052e16" : "#52525b"}>
            Heater{heater?.pv ? ` ${heater.pv}℃` : ""}
          </text>
        </g>

        {/* 터보 배기 라인: 챔버 → M.V. → Turbo → F.V. → Rotary */}
        <Pipe d="M 340 222 V 252" on={isOn("MV_button")} />
        <Node x={290} y={252} w={100} h={42} label="M.V." btn="MV_button" />
        <Pipe d="M 340 294 V 322" on={isOn("Turbo_button")} />
        <Node x={282} y={322} w={116} h={46} label="Turbo" btn="Turbo_button" />
        <Pipe d="M 398 345 H 452" on={isOn("FV_button")} />
        <Node x={452} y={324} w={90} h={42} label="F.V." btn="FV_button" />
        <Pipe d="M 542 345 H 594" on={isOn("Rotary_button")} />
        <Node x={594} y={324} w={106} h={42} label="Rotary" btn="Rotary_button" />

        {/* 러핑 라인: 챔버 하단 → R.V. → Rotary (챔버 밖에서 분기) */}
        <Pipe d="M 420 222 V 238 H 632 V 252" on={isOn("RV_button")} />
        <Node x={582} y={252} w={100} h={42} label="R.V." btn="RV_button" />
        <Pipe d="M 632 294 V 324" on={isOn("RV_button")} />
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-50 pt-2">
        <button
          onClick={() => click("BuzzStop_Button")}
          disabled={!online}
          className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-40 ${
            isOn("BuzzStop_Button")
              ? "border-green-600 bg-green-500 text-green-950"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          부저 정지
        </button>
        <span className="ml-auto text-[10px] text-gray-400">
          초록 = ON / 열림 · 흰색 = OFF / 닫힘 · 빨강 = ATM
        </span>
      </div>
    </section>
  );
}
