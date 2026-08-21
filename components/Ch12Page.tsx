"use client";

import { useState } from "react";
import { AlertTriangle, Play, Square, FileText } from "lucide-react";

type SubTab = "status" | "start" | "loadlock" | "aux" | "recipes" | "history";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "status", label: "공정 현황" },
  { key: "start", label: "공정 시작" },
  { key: "loadlock", label: "LoadLock" },
  { key: "aux", label: "TSP·프리스퍼터" },
  { key: "recipes", label: "레시피" },
  { key: "history", label: "런 이력" },
];

const DISABLED_HINT = "에이전트 연동 후 활성화됩니다";

// ── 공용 소품 ──────────────────────────────────────────────

function SampleBadge() {
  return (
    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">
      예시 데이터
    </span>
  );
}

function Metric({ label, value, range }: { label: string; value: string; range?: string }) {
  return (
    <span className="text-xs text-gray-600">
      <span className="text-gray-400">{label}</span> {value}
      {range && <span className="text-gray-300"> ({range})</span>}
    </span>
  );
}

function LogBox({ lines }: { lines: { t: string; m: string; warn?: boolean }[] }) {
  return (
    <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-gray-50 p-3 font-mono text-[11px]">
      {lines.map((l, i) => (
        <p key={i} className={l.warn ? "text-amber-600" : "text-gray-600"}>
          <span className="mr-2 text-gray-400">{l.t}</span>
          {l.m}
        </p>
      ))}
    </div>
  );
}

function GraphStub({ title }: { title: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
      <p className="text-xs text-gray-300">{title} — 에이전트 연동 시 표시</p>
    </div>
  );
}

function Num({ label, def, unit }: { label: string; def: string; unit?: string }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-gray-500">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="text"
          defaultValue={def}
          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800 focus:border-blue-300 focus:outline-none"
        />
        {unit && <span className="shrink-0 text-gray-400">{unit}</span>}
      </span>
    </label>
  );
}

function Check({ label, def }: { label: string; def?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-600">
      <input type="checkbox" defaultChecked={def} className="h-3.5 w-3.5 rounded border-gray-300" />
      {label}
    </label>
  );
}

function DisabledBtn({
  icon,
  label,
  danger,
}: {
  icon?: "play" | "stop" | "file";
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      disabled
      title={DISABLED_HINT}
      className={`inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold opacity-50 ${
        danger ? "bg-rose-50 text-rose-500" : "bg-gray-800 text-white"
      }`}
    >
      {icon === "play" && <Play size={12} />}
      {icon === "stop" && <Square size={12} />}
      {icon === "file" && <FileText size={12} />}
      {label}
    </button>
  );
}

function Card({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

// ── 탭 1: 공정 현황 ─────────────────────────────────────────

function StatusTab() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {/* CH1 — 가동 중 예시 */}
      <Card
        title="CH1"
        badge={<span className="rounded-lg bg-gray-800 px-2 py-0.5 text-[11px] font-semibold text-white">가동</span>}
      >
        <p className="mb-2 text-xs text-gray-500">
          발주 0821-03 · ITO 증착 · 메인 셔터 OPEN — 증착 진행
        </p>
        <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-gray-700" style={{ width: "62%" }} />
        </div>
        <p className="mb-3 text-right text-[11px] text-gray-400">경과 41:12 · 잔여 25:00 (62%)</p>

        <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-50 pt-3">
          <Metric label="Base P" value="2.1e-6 Torr" range="< 5e-6" />
          <Metric label="W.P" value="3.0 mTorr" range="2.5–3.5" />
          <Metric label="DC Pulse P" value="300 W" range="설정 300" />
          <Metric label="V / I" value="412 V · 0.73 A" />
          <Metric label="Freq / Duty" value="50 kHz · 70 %" />
          <Metric label="Ar / O₂" value="20.0 · 1.2 sccm" range="20 · 1.2" />
          <Metric label="for.P / ref.P" value="- · -" />
        </div>

        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <GraphStub title="OES 스펙트럼" />
          <GraphStub title="RGA 스펙트럼" />
        </div>

        <LogBox
          lines={[
            { t: "13:50:02", m: "공정 시작 (원격 · 발주 0821-03)" },
            { t: "13:52:41", m: "IG 베이스 압력 도달 (2.1e-6)" },
            { t: "13:53:20", m: "RGA 스캔 완료" },
            { t: "13:55:08", m: "가스 안정화 완료 · SP1 진입" },
            { t: "14:02:10", m: "메인 셔터 OPEN — 증착 시작" },
          ]}
        />
        <div className="mt-3 flex justify-end">
          <DisabledBtn icon="stop" label="정지 요청" danger />
        </div>
      </Card>

      {/* CH2 — 대기 예시 */}
      <Card
        title="CH2"
        badge={<span className="rounded-lg bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">대기</span>}
      >
        <p className="mb-3 text-xs text-gray-500">09:12 정상 종료 (SiO₂ RF 200W) · 게이트 CLOSED · 진공 유지</p>
        <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-50 pt-3">
          <Metric label="Base P" value="4.8e-7 Torr" />
          <Metric label="W.P" value="-" />
          <Metric label="DC / RF" value="0 W · 0 W" />
          <Metric label="for.P / ref.P" value="0 · 0 W" />
        </div>
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <GraphStub title="OES 스펙트럼" />
          <GraphStub title="RGA 스펙트럼" />
        </div>
        <LogBox
          lines={[
            { t: "09:12:44", m: "공정 정상 종료 · 셧다운 시퀀스 완료" },
            { t: "09:12:50", m: "런 요약 CSV 기록 (Ch2_log.csv)" },
          ]}
        />
        <div className="mt-3 flex justify-end">
          <DisabledBtn icon="play" label="공정 시작" />
        </div>
      </Card>
    </div>
  );
}

// ── 탭 2: 공정 시작 (챔버별 파라미터 폼) ─────────────────────

function StartTab() {
  const [ch, setCh] = useState<1 | 2>(1);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 text-xs sm:w-64">
        {([1, 2] as const).map((n) => (
          <button
            key={n}
            onClick={() => setCh(n)}
            className={`flex-1 rounded-lg py-1.5 font-semibold transition-all ${
              ch === n ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
            }`}
          >
            CH{n}
          </button>
        ))}
      </div>

      <Card title={`CH${ch} 공정 파라미터`} badge={<SampleBadge />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Num label="Process Name" def={ch === 1 ? "ITO_test" : "SiO2_RF"} />
          <Num label="Base Pressure" def="5e-6" unit="Torr" />
          <Num label="Working Pressure" def={ch === 1 ? "3.0" : "2.5"} unit="mTorr" />
          <Num label="Process Time" def={ch === 1 ? "66" : "40"} unit="분" />
          <Num label="Shutter Delay" def="5" unit="분" />
          <label className="block text-xs">
            <span className="mb-1 block text-gray-500">Chuck Position</span>
            <select className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800">
              <option>유지</option>
              <option>up</option>
              <option>mid</option>
              <option>down</option>
            </select>
          </label>
        </div>

        {/* 가스 — CH1: Ar/O₂, CH2: Ar/O₂/N₂ */}
        <div className="mt-4 border-t border-gray-50 pt-3">
          <p className="mb-2 text-xs font-semibold text-gray-700">가스 / 유량 (sccm)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Check label="Ar 사용" def />
              <Num label="Ar Flow" def="20.0" />
            </div>
            <div className="space-y-1.5">
              <Check label="O₂ 사용" def={ch === 1} />
              <Num label="O₂ Flow" def="1.2" />
            </div>
            {ch === 2 && (
              <div className="space-y-1.5">
                <Check label="N₂ 사용" />
                <Num label="N₂ Flow" def="0" />
              </div>
            )}
          </div>
        </div>

        {/* 전원 — CH1: DC Pulse만 / CH2: DC + RF + RF Pulse */}
        <div className="mt-4 border-t border-gray-50 pt-3">
          <p className="mb-2 text-xs font-semibold text-gray-700">전원</p>
          {ch === 1 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Check label="DC Pulse 사용" def />
                <Num label="Power" def="300" unit="W" />
              </div>
              <Num label="Pulse Freq" def="50" unit="kHz" />
              <Num label="Duty Cycle" def="70" unit="%" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Check label="DC Power 사용" />
                <Num label="DC Power" def="0" unit="W" />
              </div>
              <div className="space-y-1.5">
                <Check label="RF Power 사용" def />
                <Num label="RF Power" def="200" unit="W" />
              </div>
              <div className="space-y-1.5">
                <Check label="RF Pulse 사용" />
                <Num label="RF Pulse Power" def="0" unit="W" />
              </div>
              <div className="space-y-1.5">
                <Num label="Pulse Freq" def="0" unit="kHz" />
                <Num label="Duty Cycle" def="0" unit="%" />
              </div>
            </div>
          )}
        </div>

        {/* 건/타겟 — CH1: 1개 / CH2: G1~G3 */}
        <div className="mt-4 border-t border-gray-50 pt-3">
          <p className="mb-2 text-xs font-semibold text-gray-700">건 / 타겟</p>
          {ch === 1 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Num label="Gun Target" def="ITO" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Check label="Gun 1" def />
                <Num label="G1 Target" def="SiO₂" />
              </div>
              <div className="space-y-1.5">
                <Check label="Gun 2" />
                <Num label="G2 Target" def="" />
              </div>
              <div className="space-y-1.5">
                <Check label="Gun 3" />
                <Num label="G3 Target" def="TiO₂" />
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-gray-50 pt-3">
          <Check label="Main Shutter" def />
          <Check label="Power Select (PLC 절체)" />
          <span className="text-[11px] text-gray-400">
            OES Integration Time은 60ms 고정 (프로그램과 동일)
          </span>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <DisabledBtn icon="file" label="레시피(CSV)로 시작" />
          <DisabledBtn icon="play" label="현재 값으로 단발 시작" />
        </div>
      </Card>
    </div>
  );
}

// ── 탭 3: LoadLock (플라즈마 클리닝 + 진공/핀/게이트/척/센서) ──

function LoadlockTab() {
  return (
    <div className="space-y-4">
      <Card title="LoadLock 상태" badge={<SampleBadge />}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <Metric label="진공" value="유지 (8.4e-3 Torr)" />
          <Metric label="로딩센서 1 / 2" value="감지 · 비어있음" />
          <Metric label="4PIN" value="DOWN" />
          <Metric label="게이트 CH1 / CH2" value="CLOSED · CLOSED" />
          <Metric label="척 CH1 / CH2" value="UP · DOWN" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-50 pt-3">
          <DisabledBtn label="Vacuum ON" />
          <DisabledBtn label="Vacuum OFF" />
          <DisabledBtn label="4PIN UP" />
          <DisabledBtn label="4PIN DOWN" />
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          게이트·척은 공정/로봇 시퀀스가 제어합니다. 원격 수동 조작은 안전 검토 후 개방 예정.
        </p>
      </Card>

      <Card title="Plasma Cleaning" badge={<SampleBadge />}>
        <div className="mb-3 flex items-center gap-4 text-xs text-gray-600">
          <span className="font-semibold text-gray-700">대상 챔버</span>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="pcCh" defaultChecked /> CH1
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="pcCh" /> CH2
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Num label="Target Pressure" def="5e-2" unit="Torr" />
          <Num label="Working Pressure" def="8e-2" unit="Torr" />
          <Num label="RF Power" def="100" unit="W" />
          <Num label="Gas Flow" def="30" unit="sccm" />
          <Num label="Process Time" def="10" unit="분" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-50 pt-3 sm:grid-cols-5">
          <Metric label="for.P" value="0 W" />
          <Metric label="ref.P" value="0 W" />
          <Metric label="Bias V" value="0 V" />
          <Metric label="Temp" value="23.4 ℃" />
          <Metric label="Hum" value="31 %" />
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <DisabledBtn icon="file" label="Process List" />
          <DisabledBtn icon="play" label="Start" />
          <DisabledBtn icon="stop" label="Stop" danger />
        </div>
      </Card>
    </div>
  );
}

// ── 탭 4: TSP · 프리스퍼터 ──────────────────────────────────

function AuxTab() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="TSP" badge={<SampleBadge />}>
        <div className="grid grid-cols-2 gap-3">
          <Num label="Base Pressure" def="5e-6" unit="Torr" />
          <Num label="Target Pressure" def="1e-6" unit="Torr" />
          <Num label="Set Cycle" def="10" />
          <Metric label="Now Cycle" value="0 / 10" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <DisabledBtn icon="play" label="Start" />
          <DisabledBtn icon="stop" label="Stop" danger />
        </div>
      </Card>

      <Card title="Pre-Sputter" badge={<SampleBadge />}>
        <div className="mb-3 flex items-center gap-4 text-xs text-gray-600">
          <span className="font-semibold text-gray-700">대상 챔버</span>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="psCh" defaultChecked /> CH1
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="psCh" /> CH2
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Num label="Set Time" def="10" unit="분" />
          <Metric label="남은 시간" value="-" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <DisabledBtn icon="play" label="Start" />
          <DisabledBtn icon="stop" label="Stop" danger />
        </div>
      </Card>
    </div>
  );
}

// ── 탭 5: 레시피 (NAS CSV) ─────────────────────────────────

function RecipesTab() {
  const [folder, setFolder] = useState<"CH1" | "CH2" | "ALD">("CH1");
  const files: Record<string, { name: string; rows: string; date: string }[]> = {
    CH1: [
      { name: "ITO_150nm.csv", rows: "3행 (연속 공정)", date: "08-14" },
      { name: "VO2_250nm.csv", rows: "1행", date: "08-02" },
      { name: "Cleaning_Ar.csv", rows: "2행 (DELAY 포함)", date: "07-28" },
    ],
    CH2: [
      { name: "SiO2_RF200.csv", rows: "1행", date: "08-19" },
      { name: "TiO2_stack.csv", rows: "5행 (DELAY 1h30m 포함)", date: "08-11" },
    ],
    ALD: [{ name: "Al2O3_100cy.csv", rows: "1행", date: "07-30" }],
  };

  return (
    <Card title="레시피 (NAS: Recipe 폴더)" badge={<SampleBadge />}>
      <div className="mb-3 flex gap-1 rounded-xl bg-gray-100 p-1 text-xs sm:w-72">
        {(["CH1", "CH2", "ALD"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFolder(f)}
            className={`flex-1 rounded-lg py-1.5 font-semibold transition-all ${
              folder === f ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-400">
            <th className="py-1.5 font-medium">파일명</th>
            <th className="py-1.5 font-medium">구성</th>
            <th className="py-1.5 font-medium">수정일</th>
          </tr>
        </thead>
        <tbody>
          {files[folder].map((f) => (
            <tr key={f.name} className="border-t border-gray-50 text-gray-600">
              <td className="py-2 font-mono">{f.name}</td>
              <td className="py-2">{f.rows}</td>
              <td className="py-2">{f.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-gray-400">
        다중 행 = 연속 공정 큐 · DELAY 행(예: 1h30m) 지원 · 에이전트 연동 시 실제 NAS 목록으로 교체
      </p>
    </Card>
  );
}

// ── 탭 6: 런 이력 (Ch{n}_log.csv + 원격 명령 로그) ───────────

function HistoryTab() {
  const [ch, setCh] = useState<1 | 2>(1);
  const rows =
    ch === 1
      ? [
          { t: "08-21 13:50", note: "ITO 증착 (발주 0821-03)", bp: "2.1e-6", wp: "3.0", min: "66", pw: "DC Pulse 300W·50kHz·70%", gas: "Ar 20 / O₂ 1.2", tg: "ITO" },
          { t: "08-20 10:12", note: "VO₂ 250nm", bp: "3.4e-6", wp: "2.8", min: "40", pw: "DC Pulse 250W", gas: "Ar 20", tg: "VO₂" },
        ]
      : [
          { t: "08-21 09:12", note: "SiO₂ 박막", bp: "4.8e-7", wp: "2.5", min: "40", pw: "RF 200W", gas: "Ar 18", tg: "G1 SiO₂" },
          { t: "08-19 15:30", note: "TiO₂ 스택", bp: "6.1e-7", wp: "2.5", min: "85", pw: "RF Pulse 180W", gas: "Ar 18 / O₂ 2.0", tg: "G3 TiO₂" },
        ];

  return (
    <div className="space-y-4">
      <Card title={`런 이력 — Ch${ch}_log.csv`} badge={<SampleBadge />}>
        <div className="mb-3 flex gap-1 rounded-xl bg-gray-100 p-1 text-xs sm:w-64">
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              onClick={() => setCh(n)}
              className={`flex-1 rounded-lg py-1.5 font-semibold transition-all ${
                ch === n ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
              }`}
            >
              CH{n}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="py-1.5 font-medium">시각</th>
                <th className="py-1.5 font-medium">Process Note</th>
                <th className="py-1.5 font-medium">Base P</th>
                <th className="py-1.5 font-medium">W.P</th>
                <th className="py-1.5 font-medium">시간(분)</th>
                <th className="py-1.5 font-medium">전원</th>
                <th className="py-1.5 font-medium">가스</th>
                <th className="py-1.5 font-medium">타겟</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.t} className="border-t border-gray-50 text-gray-600">
                  <td className="py-2 whitespace-nowrap">{r.t}</td>
                  <td className="py-2">{r.note}</td>
                  <td className="py-2">{r.bp}</td>
                  <td className="py-2">{r.wp}</td>
                  <td className="py-2">{r.min}</td>
                  <td className="py-2">{r.pw}</td>
                  <td className="py-2">{r.gas}</td>
                  <td className="py-2">{r.tg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          NAS Ch{ch}_log.csv 31개 컬럼 중 요약 표시 (평균 계측값 포함 상세는 추후)
        </p>
      </Card>

      <Card title="원격 명령 로그 (remote_cmd)" badge={<SampleBadge />}>
        <LogBox
          lines={[
            { t: "13:50:01", m: "START_SPUTTER ch=1 · peer=NAS(erp) · OK" },
            { t: "14:02:33", m: "CH2_CHUCK_UP · peer=robot · OK" },
            { t: "14:31:05", m: "GET_SPUTTER_STATUS · Loadlock=warn", warn: true },
          ]}
        />
      </Card>
    </div>
  );
}

// ── 페이지 본체 ─────────────────────────────────────────────

export default function Ch12Page() {
  const [tab, setTab] = useState<SubTab>("status");

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-gray-900">CH1&2 Sputter</h2>
        <SampleBadge />
        <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
          <span className="h-2 w-2 rounded-full bg-gray-300" />
          ch12-agent 미연결
        </span>
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-xs text-gray-500">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-gray-400" />
        <p>
          아래는 화면 구성 확인용 예시 데이터입니다. 실행 버튼은 에이전트(erp-agent) 연동 후
          활성화되며, 비상정지는 항상 장비 현장 E-Stop이 우선입니다.
        </p>
      </div>

      {/* 서브탭 */}
      <div className="flex flex-wrap gap-1 border-b border-gray-100 pb-2">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-3 py-1.5 text-xs transition-all ${
              tab === t.key
                ? "bg-blue-50 font-semibold text-blue-600"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "status" && <StatusTab />}
      {tab === "start" && <StartTab />}
      {tab === "loadlock" && <LoadlockTab />}
      {tab === "aux" && <AuxTab />}
      {tab === "recipes" && <RecipesTab />}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}
