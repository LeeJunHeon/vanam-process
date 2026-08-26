"use client";

import { Info } from "lucide-react";

type EquipKey = "rayvac" | "ncd" | "evap" | "inline";

const EQUIP_INFO: Record<EquipKey, { name: string; kind: string; plan: string }> = {
  rayvac: {
    name: "Rayvac ALD",
    kind: "ALD 장비 (벤더 프로그램)",
    plan: "장비 프로그램 분석 후 리포터 연동 방식 결정",
  },
  ncd: {
    name: "NCD ALD",
    kind: "ALD 장비 (벤더 프로그램)",
    plan: "OPC UA / SDK 지원 여부 확인 후 연동",
  },
  evap: {
    name: "Evaporator",
    kind: "증착기 (자체 프로그램 보유)",
    plan: "Evaporator 레포에 CHK와 동일한 리포터 이식 예정",
  },
  inline: {
    name: "In-Line Sputter",
    kind: "인라인 스퍼터",
    plan: "연동 방식 검토 예정",
  },
};

export default function EquipmentStubPage({ equip }: { equip: EquipKey }) {
  const info = EQUIP_INFO[equip];

  return (
    <div className="space-y-3 p-3 sm:space-y-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-gray-900">{info.name}</h2>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-gray-400 sm:text-xs">
          <span className="h-2 w-2 rounded-full bg-gray-300" />
          미연결
        </span>
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border border-gray-100 bg-white p-3 text-xs leading-relaxed text-gray-500 sm:p-4">
        <Info size={15} className="mt-0.5 shrink-0 text-gray-400" />
        <p>
          이 장비는 아직 ERP와 연동되지 않았습니다. 장비 프로그램에 리포터가 추가되면
          공정 현황·계측값·이벤트·런 이력이 CHK와 동일한 화면으로 표시됩니다.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-3 sm:p-4">
        <div className="space-y-3">
          <div>
            <p className="text-[11px] text-gray-400">장비 구분</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-800">{info.kind}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400">연동 계획</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-800">{info.plan}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
