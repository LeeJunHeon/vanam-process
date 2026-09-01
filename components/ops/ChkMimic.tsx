"use client";

import { CHK_NODE_COMMANDS } from "@/lib/opsCommands";
import type { PendingCmd } from "@/components/ops/OpsKit";

type Props = {
  valves?: Record<string, boolean>;
  indicators?: Record<string, boolean>;
  online: boolean;
  /** stateKey → 요청한 목표 상태. 실제 상태가 도달할 때까지 "전환 중"으로 표시 */
  pendingStates?: Record<string, boolean>;
  onRequest: (c: PendingCmd) => void;
};

const GREEN = "#22c55e";
const GREEN_D = "#16a34a";
const RED = "#ef4444";
const RED_D = "#dc2626";
const GRAY_D = "#a1a1aa";
const PIPE = "#d4d4d8";
const PIPE_ON = "#86efac";

export default function ChkMimic({
  valves, indicators, online, pendingStates, onRequest,
}: Props) {
  const v = (k: string) => Boolean(valves?.[k]);
  const ind = (k: string) => Boolean(indicators?.[k]);
  const isOn = (btn: string) => v(CHK_NODE_COMMANDS[btn]?.stateKey ?? "");
  const isPending = (btn: string) => {
    const sk = CHK_NODE_COMMANDS[btn]?.stateKey;
    if (!sk || !pendingStates) return false;
    const want = pendingStates[sk];
    return want !== undefined && want !== v(sk);
  };

  const click = (btnKey: string) => {
    const def = CHK_NODE_COMMANDS[btnKey];
    if (!def || !online) return;
    const cur = def.stateKey ? v(def.stateKey) : false;
    onRequest({
      command: def.key,
      label: def.label,
      detail: cur ? "→ OFF" : "→ ON",
      danger: def.danger,
      stateKey: def.stateKey,
      args: { on: !cur },
    });
  };

  const Node = ({
    x, y, w, h, label, btn, fs = 12,
  }: { x: number; y: number; w: number; h: number; label: string; btn: string; fs?: number }) => {
    const on = isOn(btn);
    const wait = isPending(btn);
    return (
      <g onClick={() => click(btn)} style={{ cursor: online ? "pointer" : "default" }}
        className={wait ? "animate-pulse" : undefined}>
        <rect
          x={x} y={y} width={w} height={h} rx={7}
          fill={on ? GREEN : "#ffffff"}
          stroke={wait ? "#3b82f6" : on ? GREEN_D : GRAY_D}
          strokeWidth={wait || on ? 2 : 1.25}
          strokeDasharray={wait ? "5 3" : undefined}
        />
        <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central"
          fontSize={fs} fontWeight={700} fill={on ? "#052e16" : "#52525b"}>{label}</text>
      </g>
    );
  };

  const Static = ({ x, y, w, h, label }: { x: number; y: number; w: number; h: number; label: string }) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={7} fill="#fafafa" stroke="#e4e4e7" strokeWidth={1.25} />
      <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central"
        fontSize={12} fontWeight={600} fill="#71717a">{label}</text>
    </g>
  );

  const Pipe = ({ d, on }: { d: string; on: boolean }) => (
    <path d={d} fill="none" stroke={on ? PIPE_ON : PIPE} strokeWidth={6}
      strokeLinecap="round" strokeLinejoin="round" />
  );

  const lamps = [
    { key: "Air", label: "Air" }, { key: "G1", label: "G1" }, { key: "G2", label: "G2" },
    { key: "ATM", label: "ATM", alert: true }, { key: "Water", label: "Water" },
  ];

  return (
    <section className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">HMI</h3>
        <span className="text-[11px] text-gray-400">
          {online ? "노드를 눌러 조작" : "장비 미연결"}
        </span>
      </div>

      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5">
        {lamps.map((l) => {
          const on = ind(l.key);
          return (
            <span key={l.key} className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
              <span className="h-3 w-3 rounded-full border"
                style={{
                  backgroundColor: on ? (l.alert ? RED : GREEN) : "#ffffff",
                  borderColor: on ? (l.alert ? RED_D : GREEN_D) : GRAY_D,
                }} />
              {l.label}
            </span>
          );
        })}
      </div>

      <svg viewBox="0 0 640 320" className="my-auto w-full select-none"
        role="img" aria-label="CHK HMI">
        {/* 1층: 배관 */}
        <g>
          <Pipe d="M 92 76 H 118" on={isOn("Ar_Button")} />
          <Pipe d="M 190 76 H 232" on={isOn("Ar_Button")} />
          <Pipe d="M 92 140 H 118" on={isOn("O2_Button")} />
          <Pipe d="M 190 140 H 232" on={isOn("O2_Button")} />
          <Pipe d="M 320 40 V 52" on={isOn("Door_Button")} />
          <Pipe d="M 408 76 H 448" on={isOn("Vent_button")} />
          <Pipe d="M 290 176 V 204" on={isOn("MV_button")} />
          <Pipe d="M 290 250 V 268" on={isOn("Turbo_button")} />
          <Pipe d="M 352 290 H 400" on={isOn("FV_button")} />
          <Pipe d="M 492 290 H 528" on={isOn("Rotary_button")} />
          <Pipe d="M 386 176 V 190 H 576 V 204" on={isOn("RV_button")} />
          <Pipe d="M 576 250 V 268" on={isOn("RV_button")} />
        </g>

        {/* 2층: 챔버 본체 */}
        <rect x={232} y={52} width={176} height={124} rx={12}
          fill="#fafafa" stroke="#a1a1aa" strokeWidth={2} />
        <text x={320} y={70} textAnchor="middle" fontSize={13} fontWeight={700} fill="#52525b">
          Chamber
        </text>

        {/* 3층: 노드 */}
        <g>
          <Static x={16} y={54} w={76} h={44} label="MFC" />
          <Node x={118} y={54} w={72} h={44} label="Ar" btn="Ar_Button" fs={13} />
          <Static x={16} y={118} w={76} h={44} label="MFC" />
          <Node x={118} y={118} w={72} h={44} label="O₂" btn="O2_Button" fs={13} />
          <Node x={262} y={2} w={116} h={38} label="Door" btn="Door_Button" fs={13} />
          <Node x={448} y={54} w={96} h={44} label="Vent" btn="Vent_button" fs={13} />
          <Node x={242} y={84} w={76} h={30} label="S1" btn="S1_button" fs={12} />
          <Node x={322} y={84} w={76} h={30} label="S2" btn="S2_button" fs={12} />
          <Node x={252} y={128} w={136} h={30} label="M.S." btn="MS_button" fs={12} />
          <Node x={238} y={204} w={104} h={46} label="M.V." btn="MV_button" fs={13} />
          <Node x={232} y={268} w={120} h={44} label="Turbo" btn="Turbo_button" fs={13} />
          <Node x={400} y={268} w={92} h={44} label="F.V." btn="FV_button" fs={13} />
          <Node x={528} y={268} w={96} h={44} label="Rotary" btn="Rotary_button" fs={13} />
          <Node x={524} y={204} w={104} h={46} label="R.V." btn="RV_button" fs={13} />
        </g>
      </svg>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-gray-50 pt-1.5">
        <button
          onClick={() => click("BuzzStop_Button")}
          disabled={!online}
          className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40 ${
            isOn("BuzzStop_Button")
              ? "border-green-600 bg-green-500 text-green-950"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          부저 정지
        </button>
        <span className="ml-auto text-[10px] text-gray-400">
          초록 = ON · 흰색 = OFF · 파랑 점선 = 전환 중
        </span>
      </div>
    </section>
  );
}
