"use client";

import { Info } from "lucide-react";

type EquipKey = "chk" | "rayvac" | "ncd" | "evap" | "inline";

// 예시 데이터 — 실제 사양과 다르면 수정할 것
const EQUIP_INFO: Record<
  EquipKey,
  { name: string; kind: string; lastRun: string; totalRuns: number; note: string }
> = {
  chk: {
    name: "CHK",
    kind: "스퍼터 챔버 (별도 노트북 운용)",
    lastRun: "08-20 16:10 SiO₂ 증착 종료",
    totalRuns: 214,
    note: "chk-agent 연동 예정 (CH1&2 다음 순서)",
  },
  rayvac: {
    name: "Rayvac ALD",
    kind: "ALD 장비",
    lastRun: "08-19 11:32 Al₂O₃ 100 cycle 종료",
    totalRuns: 87,
    note: "장비 프로그램 분석 후 연동 예정",
  },
  ncd: {
    name: "NCD ALD",
    kind: "ALD 장비",
    lastRun: "08-21 13:12 TiN 300 cycle 진행 중 (예시)",
    totalRuns: 142,
    note: "벤더 OPC UA/SDK 확인 후 연동 방식 결정",
  },
  evap: {
    name: "Evaporator",
    kind: "증착기 (전용 프로그램 보유)",
    lastRun: "08-18 09:44 Au 50nm 종료",
    totalRuns: 65,
    note: "Evaporator 레포 분석 후 CH1&2와 동일 방식 연동 예정",
  },
  inline: {
    name: "In-Line Sputter",
    kind: "인라인 스퍼터",
    lastRun: "08-15 14:20 종료",
    totalRuns: 31,
    note: "연동 방식 검토 예정",
  },
};

export default function EquipmentStubPage({ equip }: { equip: EquipKey }) {
  const info = EQUIP_INFO[equip];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-gray-900">{info.name}</h2>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">
          예시 데이터
        </span>
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-500">
        <Info size={16} className="mt-0.5 shrink-0 text-gray-400" />
        <p>
          이 장비는 아직 ERP와 연동되지 않았습니다. 아래는 화면 구성 확인용 예시이며,
          에이전트 연동 후 실데이터로 교체됩니다. — {info.note}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs text-gray-400">장비 구분</p>
          <p className="mt-1 text-sm font-semibold text-gray-800">{info.kind}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs text-gray-400">마지막 공정</p>
          <p className="mt-1 text-sm font-semibold text-gray-800">{info.lastRun}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs text-gray-400">누적 런 (예시)</p>
          <p className="mt-1 text-sm font-semibold text-gray-800">{info.totalRuns}회</p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <h3 className="mb-2 text-sm font-bold text-gray-900">런 이력</h3>
        <p className="py-6 text-center text-xs text-gray-300">
          에이전트 연동 후 이 장비의 공정 이력이 표시됩니다
        </p>
      </div>
    </div>
  );
}
