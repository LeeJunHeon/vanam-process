"use client";

// CHK 챔버 계통도(미믹 다이어그램).
// 배관 구조는 장비마다 다르므로 이 컴포넌트는 CHK 전용이다.
// ISA-101 원칙: 정상 상태는 무채색. 채움 = ON/열림, 흰 바탕 = OFF/닫힘.

type Props = {
  valves?: Record<string, boolean>;
  indicators?: Record<string, boolean>;
  heater?: { pv?: string; sv?: string; status?: string };
};

const ON_FILL = "#374151";
const OFF_STROKE = "#d1d5db";
const OFF_TEXT = "#9ca3af";
const PIPE = "#e5e7eb";
const PIPE_ON = "#9ca3af";

function Node({
  x, y, w, h, label, on, small,
}: { x: number; y: number; w: number; h: number; label: string; on: boolean; small?: boolean }) {
  return (
    <g>
      <rect
        x={x} y={y} width={w} height={h} rx={6}
        fill={on ? ON_FILL : "#ffffff"}
        stroke={on ? ON_FILL : OFF_STROKE}
        strokeWidth={1}
      />
      <text
        x={x + w / 2} y={y + h / 2}
        textAnchor="middle" dominantBaseline="central"
        fontSize={small ? 9 : 11}
        fontWeight={600}
        fill={on ? "#ffffff" : OFF_TEXT}
      >
        {label}
      </text>
    </g>
  );
}

function Pipe({ d, on }: { d: string; on: boolean }) {
  return <path d={d} fill="none" stroke={on ? PIPE_ON : PIPE} strokeWidth={3} strokeLinecap="round" />;
}

function Lamp({ x, y, label, on }: { x: number; y: number; label: string; on: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r={4.5} fill={on ? ON_FILL : "#ffffff"} stroke={on ? ON_FILL : OFF_STROKE} />
      <text x={x + 9} y={y} dominantBaseline="central" fontSize={10} fill="#6b7280">{label}</text>
    </g>
  );
}

export default function ChkMimic({ valves, indicators, heater }: Props) {
  const v = (k: string) => Boolean(valves?.[k]);
  const i = (k: string) => Boolean(indicators?.[k]);

  const arOn = v("Ar");
  const o2On = v("O2");
  const roughOn = v("RV");
  const turboLine = v("MV") || v("Turbo");
  const foreOn = v("FV") || v("Rotary");
  const heaterOn = (heater?.status ?? "") === "운전 중";

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-3">
      <h3 className="mb-2 text-sm font-bold text-gray-900">챔버 계통도</h3>
      <svg viewBox="0 0 640 336" className="w-full" role="img" aria-label="CHK 챔버 계통도">
        {/* 상태 램프 */}
        <Lamp x={16} y={14} label="Air" on={i("Air")} />
        <Lamp x={76} y={14} label="Water" on={i("Water")} />
        <Lamp x={152} y={14} label="ATM" on={i("ATM")} />
        <Lamp x={212} y={14} label="G1" on={i("G1")} />
        <Lamp x={262} y={14} label="G2" on={i("G2")} />

        {/* 가스 라인 */}
        <Pipe d="M 82 76 H 110" on={arOn} />
        <Pipe d="M 158 76 H 250" on={arOn} />
        <Pipe d="M 82 122 H 110" on={o2On} />
        <Pipe d="M 158 122 H 250" on={o2On} />
        <Node x={20} y={62} w={62} h={28} label="MFC" on={false} />
        <Node x={110} y={62} w={48} h={28} label="Ar" on={arOn} />
        <Node x={20} y={108} w={62} h={28} label="MFC" on={false} />
        <Node x={110} y={108} w={48} h={28} label="O₂" on={o2On} />

        {/* 도어 */}
        <Pipe d="M 325 44 V 56" on={v("Door") || v("Doorup")} />
        <Node x={275} y={16} w={100} h={28} label="Door" on={v("Door") || v("Doorup")} />

        {/* 챔버 */}
        <rect x={250} y={56} width={150} height={112} rx={10} fill="#ffffff" stroke="#9ca3af" strokeWidth={1.5} />
        <text x={325} y={72} textAnchor="middle" fontSize={11} fontWeight={700} fill="#4b5563">Chamber</text>
        <Node x={262} y={82} w={40} h={16} label="S1" on={v("S1")} small />
        <Node x={348} y={82} w={40} h={16} label="S2" on={v("S2")} small />
        <Node x={276} y={108} w={98} h={16} label="M.S." on={v("MS")} small />
        <Node x={266} y={136} w={118} h={20} label={heaterOn ? `Heater ${heater?.pv ?? ""}℃` : "Heater"} on={heaterOn} small />

        {/* 벤트 */}
        <Pipe d="M 400 90 H 440" on={v("Vent")} />
        <Node x={440} y={76} w={60} h={28} label="Vent" on={v("Vent")} />

        {/* 터보 배기 라인: 챔버 → M.V. → Turbo → F.V. → Rotary */}
        <Pipe d="M 325 168 V 186" on={turboLine} />
        <Node x={295} y={186} w={60} h={28} label="M.V." on={v("MV")} />
        <Pipe d="M 325 214 V 238" on={turboLine} />
        <Node x={285} y={238} w={80} h={32} label="Turbo" on={v("Turbo")} />
        <Pipe d="M 325 270 V 296 H 396" on={foreOn} />
        <Node x={396} y={282} w={56} h={28} label="F.V." on={v("FV")} />
        <Pipe d="M 452 296 H 478" on={foreOn} />
        <Node x={478} y={282} w={84} h={28} label="Rotary" on={v("Rotary")} />

        {/* 러핑 라인: 챔버 → R.V. → Rotary */}
        <Pipe d="M 400 150 H 530 V 186" on={roughOn} />
        <Node x={500} y={186} w={60} h={28} label="R.V." on={roughOn} />
        <Pipe d="M 530 214 V 282" on={roughOn} />
      </svg>
      <p className="mt-1 text-[10px] text-gray-400">
        채움 = ON / 열림 · 흰 바탕 = OFF / 닫힘
      </p>
    </section>
  );
}
