"use client";

import { useState, type ReactNode } from "react";
import {
  AlertTriangle, Play, Square, FileText, Plus, Copy, Trash2,
  ArrowUp, ArrowDown, Pencil,
} from "lucide-react";

type SubTab = "status" | "run" | "recipes" | "loadlock" | "aux" | "history";
type Chamber = 1 | 2;

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "status", label: "공정 현황" },
  { key: "run", label: "공정 실행" },
  { key: "recipes", label: "레시피" },
  { key: "loadlock", label: "LoadLock" },
  { key: "aux", label: "TSP·프리스퍼터" },
  { key: "history", label: "런 이력" },
];

const DISABLED_HINT = "에이전트 연동 후 활성화됩니다";
const RECIPE_ROOT = "VanaM_toShare / JH_Lee / Recipe";
const rid = () => Math.random().toString(36).slice(2, 9);

// ── 레시피 데이터 모델 (CSV 다중 행 = 스텝, DELAY 행 지원) ──────

type RecipeStep = {
  kind: "process" | "delay";
  name?: string;    // process: 스텝 이름
  time?: string;    // process: 공정 시간(분)
  summary?: string; // process: 요약 한 줄
  delay?: string;   // delay: 예 "1h30m"
};

type Recipe = {
  id: string;
  name: string;
  folder: string;
  chamber: Chamber;
  updated: string;
  steps: RecipeStep[];
};

const INITIAL_FOLDERS = ["CH1", "CH2", "ALD"];

const INITIAL_RECIPES: Recipe[] = [
  {
    id: "r1", name: "ITO_150nm", folder: "CH1", chamber: 1, updated: "08-14",
    steps: [
      { kind: "process", name: "프리 클리닝", time: "10", summary: "Ar 20 · DC Pulse 200W" },
      { kind: "delay", delay: "10m" },
      { kind: "process", name: "ITO 증착", time: "66", summary: "Ar 20 / O₂ 1.2 · DC Pulse 300W · 타겟 ITO" },
    ],
  },
  {
    id: "r2", name: "VO2_250nm", folder: "CH1", chamber: 1, updated: "08-02",
    steps: [{ kind: "process", name: "VO₂ 증착", time: "40", summary: "Ar 20 · DC Pulse 250W" }],
  },
  {
    id: "r3", name: "SiO2_RF200", folder: "CH2", chamber: 2, updated: "08-19",
    steps: [{ kind: "process", name: "SiO₂ 증착", time: "40", summary: "Ar 18 · RF 200W · G1 SiO₂" }],
  },
  {
    id: "r4", name: "TiO2_stack", folder: "CH2", chamber: 2, updated: "08-11",
    steps: [
      { kind: "process", name: "1층 TiO₂", time: "45", summary: "Ar 18 / O₂ 2.0 · RF Pulse 180W · G3" },
      { kind: "delay", delay: "1h30m" },
      { kind: "process", name: "2층 TiO₂", time: "40", summary: "Ar 18 / O₂ 2.0 · RF Pulse 180W · G3" },
    ],
  },
];

// ── 공용 소품 ────────────────────────────────────────────────

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
  icon, label, danger,
}: { icon?: "play" | "stop" | "file"; label: string; danger?: boolean }) {
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

function IconBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600">
      {children}
    </button>
  );
}

function Card({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
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

// ── 챔버별 파라미터 폼 (CH1: Ar/O₂·DC Pulse·타겟1 / CH2: +N₂·DC/RF/RF Pulse·G1~3) ──

function ParamForm({ chamber, showNameTime = true }: { chamber: Chamber; showNameTime?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {showNameTime && <Num label="Process Name" def={chamber === 1 ? "ITO_test" : "SiO2_RF"} />}
        {showNameTime && <Num label="Process Time" def={chamber === 1 ? "66" : "40"} unit="분" />}
        <Num label="Base Pressure" def="5e-6" unit="Torr" />
        <Num label="Working Pressure" def={chamber === 1 ? "3.0" : "2.5"} unit="mTorr" />
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

      <div className="border-t border-gray-50 pt-3">
        <p className="mb-2 text-xs font-semibold text-gray-700">가스 / 유량 (sccm)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Check label="Ar 사용" def />
            <Num label="Ar Flow" def="20.0" />
          </div>
          <div className="space-y-1.5">
            <Check label="O₂ 사용" def={chamber === 1} />
            <Num label="O₂ Flow" def="1.2" />
          </div>
          {chamber === 2 && (
            <div className="space-y-1.5">
              <Check label="N₂ 사용" />
              <Num label="N₂ Flow" def="0" />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-50 pt-3">
        <p className="mb-2 text-xs font-semibold text-gray-700">전원</p>
        {chamber === 1 ? (
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

      <div className="border-t border-gray-50 pt-3">
        <p className="mb-2 text-xs font-semibold text-gray-700">건 / 타겟</p>
        {chamber === 1 ? (
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

      <div className="flex flex-wrap items-center gap-4 border-t border-gray-50 pt-3">
        <Check label="Main Shutter" def />
        <Check label="Power Select (PLC 절체)" />
        <span className="text-[11px] text-gray-400">OES Integration Time 60ms 고정</span>
      </div>
    </div>
  );
}

// ── 탭 1: 공정 현황 ──────────────────────────────────────────

const CH1_FLOW = ["준비", "베이스 압력", "RGA 스캔", "가스 안정화", "파워 램프", "셔터 딜레이", "증착", "종료"];

function StepTimeline({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {steps.map((s, i) => (
        <span
          key={s}
          className={`rounded-lg px-2 py-1 text-[10px] font-medium ${
            i < current
              ? "bg-gray-100 text-gray-400"
              : i === current
                ? "bg-gray-800 text-white"
                : "border border-gray-200 text-gray-300"
          }`}
        >
          {s}
        </span>
      ))}
    </div>
  );
}

function StatusTab({ onGoRun }: { onGoRun: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card
        title="CH1"
        badge={<span className="rounded-lg bg-gray-800 px-2 py-0.5 text-[11px] font-semibold text-white">가동</span>}
      >
        <p className="text-xs text-gray-500">발주 0821-03 · ITO 증착 · 레시피 ITO_150nm.csv (스텝 3/3)</p>
        <div className="mt-2">
          <StepTimeline steps={CH1_FLOW} current={6} />
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-[11px] text-gray-400">남은 시간</p>
            <p className="text-2xl font-bold tracking-tight text-gray-900">25:00</p>
          </div>
          <p className="text-[11px] text-gray-400">경과 41:12 · 62%</p>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-gray-700" style={{ width: "62%" }} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-50 pt-3">
          <Metric label="Base P" value="2.1e-6 Torr" range="< 5e-6" />
          <Metric label="W.P" value="3.0 mTorr" range="2.5–3.5" />
          <Metric label="DC Pulse P" value="300 W" range="설정 300" />
          <Metric label="V / I" value="412 V · 0.73 A" />
          <Metric label="Freq / Duty" value="50 kHz · 70 %" />
          <Metric label="Ar / O₂" value="20.0 · 1.2 sccm" range="20 · 1.2" />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <GraphStub title="OES 스펙트럼" />
          <GraphStub title="RGA 스펙트럼" />
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600">상세 로그 보기</summary>
          <div className="mt-2">
            <LogBox
              lines={[
                { t: "13:50:02", m: "공정 시작 (원격 · 발주 0821-03)" },
                { t: "13:52:41", m: "IG 베이스 압력 도달 (2.1e-6)" },
                { t: "13:53:20", m: "RGA 스캔 완료" },
                { t: "13:55:08", m: "가스 안정화 완료 · SP1 진입" },
                { t: "14:02:10", m: "메인 셔터 OPEN — 증착 시작" },
              ]}
            />
          </div>
        </details>

        <div className="mt-3 flex justify-end">
          <DisabledBtn icon="stop" label="정지 요청" danger />
        </div>
      </Card>

      <Card
        title="CH2"
        badge={<span className="rounded-lg bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">대기</span>}
      >
        <p className="text-xs text-gray-500">09:12 정상 종료 (SiO₂ RF 200W) · 게이트 CLOSED · 진공 유지</p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-50 pt-3">
          <Metric label="Base P" value="4.8e-7 Torr" />
          <Metric label="W.P" value="-" />
          <Metric label="DC / RF" value="0 W · 0 W" />
          <Metric label="for.P / ref.P" value="0 · 0 W" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <GraphStub title="OES 스펙트럼" />
          <GraphStub title="RGA 스펙트럼" />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={onGoRun}
            className="rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100"
          >
            공정 실행 탭으로 →
          </button>
        </div>
      </Card>
    </div>
  );
}

// ── 탭 2: 공정 실행 (챔버 → 레시피/직접 입력 → 사전점검) ──────

function RunTab({ recipes }: { recipes: Recipe[] }) {
  const [ch, setCh] = useState<Chamber>(2);
  const [mode, setMode] = useState<"recipe" | "manual">("recipe");
  const [selId, setSelId] = useState<string | null>(null);

  const CH_INFO: Record<Chamber, { state: string; running: boolean; note: string }> = {
    1: { state: "가동", running: true, note: "발주 0821-03 진행 중 · 종료 후 선택 가능" },
    2: { state: "대기", running: false, note: "09:12 정상 종료 · 시작 가능" },
  };

  const list = recipes.filter((r) => r.chamber === ch);
  const sel = list.find((r) => r.id === selId) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold text-gray-700">1. 챔버 선택</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {([1, 2] as const).map((n) => {
            const info = CH_INFO[n];
            const selected = ch === n;
            return (
              <button
                key={n}
                disabled={info.running}
                onClick={() => {
                  setCh(n);
                  setSelId(null);
                }}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  info.running
                    ? "cursor-not-allowed border-gray-100 bg-gray-50 opacity-60"
                    : selected
                      ? "border-blue-300 bg-blue-50/50 ring-1 ring-blue-200"
                      : "border-gray-100 bg-white hover:border-gray-200"
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-900">CH{n}</span>
                  <span
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
                      info.running ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {info.state}
                  </span>
                </span>
                <span className="mt-1 block text-[11px] text-gray-400">{info.note}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-gray-700">2. 실행 방식</p>
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 text-xs sm:w-72">
          <button
            onClick={() => setMode("recipe")}
            className={`flex-1 rounded-lg py-1.5 font-semibold transition-all ${
              mode === "recipe" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
            }`}
          >
            저장된 레시피
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`flex-1 rounded-lg py-1.5 font-semibold transition-all ${
              mode === "manual" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
            }`}
          >
            직접 입력
          </button>
        </div>
      </div>

      {mode === "recipe" ? (
        <Card title={`CH${ch} 레시피 선택`}>
          {list.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-300">
              CH{ch}용 레시피가 없습니다 — 레시피 탭에서 만들 수 있습니다
            </p>
          ) : (
            <div className="space-y-2">
              {list.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelId(r.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                    selId === r.id ? "border-blue-300 bg-blue-50/50" : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <FileText size={13} className="shrink-0 text-gray-300" />
                    <span className="font-mono text-xs font-medium text-gray-800">{r.name}.csv</span>
                    <span className="text-[11px] text-gray-400">
                      {r.folder} 폴더 · 스텝 {r.steps.length}개 · 수정 {r.updated}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {sel && (
            <div className="mt-3 rounded-xl bg-gray-50 p-3">
              <p className="mb-1.5 text-[11px] font-semibold text-gray-500">스텝 미리보기</p>
              <ol className="space-y-1 text-xs text-gray-600">
                {sel.steps.map((s, i) => (
                  <li key={i}>
                    {i + 1}. {s.kind === "delay" ? `대기 ${s.delay}` : `${s.name} — ${s.time}분 (${s.summary})`}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>
      ) : (
        <Card title={`CH${ch} 직접 입력`}>
          <ParamForm chamber={ch} />
        </Card>
      )}

      <Card title="3. 사전점검">
        <div className="space-y-1.5 text-xs">
          <p>
            <span className="mr-1.5 font-bold text-rose-500">✗</span>
            <span className="text-gray-600">에이전트 연결 — 미연결</span>
          </p>
          <p>
            <span className="mr-1.5 font-bold text-emerald-500">✓</span>
            <span className="text-gray-600">CH{ch} 상태 idle · 게이트 CLOSED</span>
          </p>
          <p>
            <span className="mr-1.5 font-bold text-gray-300">─</span>
            <span className="text-gray-400">레시피 타겟 ↔ 장착 타겟 일치 (재고 연동 후 자동 확인)</span>
          </p>
        </div>
        <div className="mt-3 flex justify-end border-t border-gray-50 pt-3">
          <DisabledBtn
            icon="play"
            label={mode === "recipe" ? (sel ? `${sel.name} 실행` : "레시피를 선택하세요") : "현재 값으로 시작"}
          />
        </div>
      </Card>
    </div>
  );
}

// ── 탭 3: 레시피 (목록 + 빌더) ───────────────────────────────

function RecipeEditor({
  initial, isNew, folders, onSave, onCancel,
}: {
  initial: Recipe;
  isNew: boolean;
  folders: string[];
  onSave: (r: Recipe, newFolder: string | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [chamber, setChamber] = useState<Chamber>(initial.chamber);
  const [folder, setFolder] = useState(initial.folder);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [steps, setSteps] = useState<RecipeStep[]>(initial.steps);
  const [open, setOpen] = useState<number | null>(null);

  const patch = (i: number, p: Partial<RecipeStep>) =>
    setSteps((s) => s.map((st, k) => (k === i ? { ...st, ...p } : st)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const c = [...s];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const remove = (i: number) => {
    setSteps((s) => s.filter((_, k) => k !== i));
    setOpen(null);
  };
  const duplicate = (i: number) => setSteps((s) => [...s.slice(0, i + 1), { ...s[i] }, ...s.slice(i + 1)]);
  const addProcess = () => {
    setSteps((s) => [...s, { kind: "process", name: `스텝 ${s.length + 1}`, time: "10", summary: "직접 입력 파라미터" }]);
    setOpen(steps.length);
  };
  const addDelay = () => setSteps((s) => [...s, { kind: "delay", delay: "30m" }]);

  const finalFolder = newFolderMode ? newFolderName.trim() || "새폴더" : folder;

  return (
    <Card title={isNew ? "새 레시피" : `레시피 편집 — ${initial.name}`} badge={<SampleBadge />}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-xs">
          <span className="mb-1 block text-gray-500">레시피 이름</span>
          <span className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: ITO_150nm"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800 focus:border-blue-300 focus:outline-none"
            />
            <span className="shrink-0 text-gray-400">.csv</span>
          </span>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-gray-500">대상 챔버</span>
          <span className="flex gap-1 rounded-xl bg-gray-100 p-1">
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                onClick={() => setChamber(n)}
                className={`flex-1 rounded-lg py-1 font-semibold transition-all ${
                  chamber === n ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
                }`}
              >
                CH{n}
              </button>
            ))}
          </span>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-gray-500">저장 위치</span>
          <select
            value={newFolderMode ? "__new__" : folder}
            onChange={(e) => {
              if (e.target.value === "__new__") setNewFolderMode(true);
              else {
                setNewFolderMode(false);
                setFolder(e.target.value);
              }
            }}
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800"
          >
            {folders.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
            <option value="__new__">+ 새 폴더 만들기</option>
          </select>
        </label>
      </div>
      {newFolderMode && (
        <input
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder="새 폴더 이름"
          className="mt-2 w-full rounded-lg border border-blue-200 px-2 py-1.5 text-xs text-gray-800 focus:border-blue-300 focus:outline-none sm:w-64"
        />
      )}
      <p className="mt-2 text-[11px] text-gray-400">
        저장 경로: {RECIPE_ROOT} / {finalFolder} / {name.trim() || "이름"}.csv
      </p>

      <div className="mt-4 border-t border-gray-50 pt-3">
        <p className="mb-2 text-xs font-semibold text-gray-700">스텝 (CSV 행 순서대로 실행)</p>
        <div className="space-y-2">
          {steps.map((st, i) => (
            <div key={i} className="rounded-xl border border-gray-100">
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="w-5 shrink-0 text-center text-[11px] font-bold text-gray-400">{i + 1}</span>
                {st.kind === "delay" ? (
                  <>
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">대기</span>
                    <span className="truncate text-xs text-gray-600">DELAY {st.delay}</span>
                  </>
                ) : (
                  <>
                    <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">공정</span>
                    <span className="truncate text-xs font-medium text-gray-800">{st.name}</span>
                    <span className="hidden shrink-0 text-[11px] text-gray-400 sm:inline">{st.time}분 · {st.summary}</span>
                  </>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-0.5">
                  <IconBtn onClick={() => move(i, -1)}><ArrowUp size={13} /></IconBtn>
                  <IconBtn onClick={() => move(i, 1)}><ArrowDown size={13} /></IconBtn>
                  <IconBtn onClick={() => duplicate(i)}><Copy size={13} /></IconBtn>
                  <IconBtn onClick={() => remove(i)}><Trash2 size={13} /></IconBtn>
                  <button
                    onClick={() => setOpen(open === i ? null : i)}
                    className="rounded-lg px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    {open === i ? "접기" : "편집"}
                  </button>
                </span>
              </div>
              {open === i && (
                <div className="border-t border-gray-50 p-3">
                  {st.kind === "delay" ? (
                    <label className="block text-xs sm:w-64">
                      <span className="mb-1 block text-gray-500">대기 시간 (예: 1h30m, 45m)</span>
                      <input
                        value={st.delay ?? ""}
                        onChange={(e) => patch(i, { delay: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800"
                      />
                    </label>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 sm:w-96">
                        <label className="block text-xs">
                          <span className="mb-1 block text-gray-500">스텝 이름</span>
                          <input
                            value={st.name ?? ""}
                            onChange={(e) => patch(i, { name: e.target.value })}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800"
                          />
                        </label>
                        <label className="block text-xs">
                          <span className="mb-1 block text-gray-500">공정 시간 (분)</span>
                          <input
                            value={st.time ?? ""}
                            onChange={(e) => patch(i, { time: e.target.value })}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800"
                          />
                        </label>
                      </div>
                      <ParamForm chamber={chamber} showNameTime={false} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={addProcess}
            className="inline-flex items-center gap-1 rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200"
          >
            <Plus size={13} /> 공정 스텝
          </button>
          <button
            onClick={addDelay}
            className="inline-flex items-center gap-1 rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200"
          >
            <Plus size={13} /> 대기(DELAY) 스텝
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-50 pt-3">
        <p className="text-[11px] text-gray-400">
          저장하면 화면 목록에 즉시 반영됩니다. NAS CSV 저장은 API 연동 후 활성화 — 새로고침 시 초기화됩니다.
        </p>
        <span className="flex gap-2">
          <button onClick={onCancel} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50">
            취소
          </button>
          <button
            onClick={() =>
              onSave(
                { ...initial, name: name.trim() || "이름없음", folder: finalFolder, chamber, steps, updated: "오늘" },
                newFolderMode ? finalFolder : null,
              )
            }
            className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            저장
          </button>
        </span>
      </div>
    </Card>
  );
}

function RecipesTab({
  recipes, folders, onSaveRecipe,
}: {
  recipes: Recipe[];
  folders: string[];
  onSaveRecipe: (r: Recipe, newFolder: string | null) => void;
}) {
  const [folder, setFolder] = useState(folders[0]);
  const [editing, setEditing] = useState<{ recipe: Recipe; isNew: boolean } | null>(null);

  const list = recipes.filter((r) => r.folder === folder);

  const blank = (): Recipe => ({
    id: rid(),
    name: "",
    folder,
    chamber: 1,
    updated: "오늘",
    steps: [{ kind: "process", name: "스텝 1", time: "10", summary: "직접 입력 파라미터" }],
  });

  const save = (r: Recipe, nf: string | null) => {
    onSaveRecipe(r, nf);
    setFolder(r.folder);
    setEditing(null);
  };

  if (editing) {
    return (
      <RecipeEditor
        initial={editing.recipe}
        isNew={editing.isNew}
        folders={folders}
        onSave={save}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <Card title="레시피" badge={<SampleBadge />}>
      <p className="mb-2 text-[11px] text-gray-400">NAS · {RECIPE_ROOT} / {folder}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 text-xs">
          {folders.map((f) => (
            <button
              key={f}
              onClick={() => setFolder(f)}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-all ${
                folder === f ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={() => setEditing({ recipe: blank(), isNew: true })}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          <Plus size={13} /> 새 레시피
        </button>
      </div>

      {list.length === 0 ? (
        <p className="py-8 text-center text-xs text-gray-300">이 폴더에 레시피가 없습니다</p>
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 px-3 py-2.5">
              <FileText size={14} className="shrink-0 text-gray-300" />
              <span className="font-mono text-xs font-medium text-gray-800">{r.name}.csv</span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">CH{r.chamber}</span>
              <span className="text-[11px] text-gray-400">
                스텝 {r.steps.length}개{r.steps.some((s) => s.kind === "delay") ? " (DELAY 포함)" : ""} · 수정 {r.updated}
              </span>
              <span className="ml-auto flex shrink-0 gap-1">
                <button
                  onClick={() => setEditing({ recipe: r, isNew: false })}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
                >
                  <Pencil size={12} /> 편집
                </button>
                <button
                  onClick={() => save({ ...r, id: rid(), name: `${r.name}_copy`, updated: "오늘" }, null)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-50"
                >
                  <Copy size={12} /> 복제
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-gray-400">
        CSV 다중 행 = 연속 공정 큐 · DELAY 행(1h30m 형식) 지원 · 새 폴더는 레시피 저장 시 만들 수 있습니다
      </p>
    </Card>
  );
}

// ── 탭 4: LoadLock ───────────────────────────────────────────

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

// ── 탭 5: TSP · 프리스퍼터 ──────────────────────────────────

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

// ── 탭 6: 런 이력 ────────────────────────────────────────────

function HistoryTab() {
  const [ch, setCh] = useState<Chamber>(1);
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
  const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES);
  const [folders, setFolders] = useState<string[]>(INITIAL_FOLDERS);

  const handleSaveRecipe = (r: Recipe, newFolder: string | null) => {
    if (newFolder && !folders.includes(newFolder)) setFolders((f) => [...f, newFolder]);
    setRecipes((list) => {
      const i = list.findIndex((x) => x.id === r.id);
      if (i === -1) return [...list, r];
      const c = [...list];
      c[i] = r;
      return c;
    });
  };

  return (
    <div className="space-y-3 p-3 sm:space-y-4 sm:p-6">
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
          아래는 화면 구성 확인용 예시 데이터입니다. 실행·정지 버튼은 에이전트(erp-agent) 연동 후
          활성화되며, 비상정지는 항상 장비 현장 E-Stop이 우선입니다.
        </p>
      </div>

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

      {tab === "status" && <StatusTab onGoRun={() => setTab("run")} />}
      {tab === "run" && <RunTab recipes={recipes} />}
      {tab === "recipes" && <RecipesTab recipes={recipes} folders={folders} onSaveRecipe={handleSaveRecipe} />}
      {tab === "loadlock" && <LoadlockTab />}
      {tab === "aux" && <AuxTab />}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}
