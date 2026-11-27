"use client";

// 챔버K v2 장비 박스(W-10, 운전 탭 대기 화면) — 진공 · 셔터·인터락 · 가스·압력 · DC Power · RF Power · RF Pulse · Ion Gauge · 히터.
// 박스 틀은 모두 같다(W-20): 머리(박스 제목 15px + 상태 칩) → 모델명 줄(12px 보조색) → 큰 값 28px 또는 요약 한 줄(진공·셔터) →
//   라벨-값 줄(14px) → 상태 목록 → 안내 → 맨 아래 버튼 줄. 박스는 격자 줄 높이를 채우고(같은 줄 박스 높이가 같음), 버튼 줄은 늘
//   박스 맨 아래에 붙는다(위에 얇은 구분선). 버튼이 하나도 없으면 버튼 줄·구분선을 그리지 않는다.
// 이름·라벨·단위는 묶음 그대로. 인터록 비트(히터·RF Pulse)는 켜짐/꺼짐 표시만 — 이상 판단은 장비 알람·이상 비트로만.
// 장비 상태는 이름 + 점 배지(StateTag — 켜짐·꺼짐 / 열림·닫힘 / 감지·없음). 색은 이상할 때만(아이콘 + 글자).
// 값 입력이 필요한 조작(히터 켜기·목표 바꾸기)은 버튼 → 작은 창에서 입력(범위는 묶음 인자) → 확인창. 버튼 색은 중립, 위험 동작만 빨간 테두리.
// 설정에서 꺼진 장비(블록 품질 off — RF Pulse 등)도 같은 틀: 칩 '사용하지 않음', 큰 값 자리는 빈 값, 안내 한 줄, 버튼 [설정 열기].
// 히터 출력은 퍼센트 없이 DAC·추정 전류(v1 결정), 2단 제어 상태 이름은 묶음 enumLabels, r1·SV2·ff·b_int 는 '상세'에서.
// 진공·셔터는 [HMI 열기] → HMI 탭(계통도), 가스·압력·파워(사용 중)는 [수동 조작 열기] → 수동 조작 탭(탭이 있을 때만).
// 노트북 로컬 화면은 HMI 경로에서 받는 명령만(나머지는 "웹에서만").
import { useState, type ReactNode } from "react";
import { Flame, Gauge, Hand, PauseCircle, Play, Settings, SkipForward, Square, Workflow } from "lucide-react";
import { FS, BigValue, Btn, Card, Chip, FieldValue, Issue, KV, Modal, QBadge, Val, type Ask } from "./kit";
import { StateTag, wordsOf } from "./StateTag";
import { CARD, blockSub, fieldName, fieldTip } from "@/lib/ops2/chk/terms";
import { argRange, capRange, checkInput, rangeText, type Range } from "./logic";
import { enumLabel, fieldText } from "./text";
import { GAS_STATE, HEATER_OWNER, fmtValue, type BlockDef, type Bundle, type FieldDef, type StateData } from "./types";
import { useChk2Mode } from "./mode";
import type { DevKey } from "./Chk2SettingsDrawer";
import { kindOf } from "./runview";
import type { LockFn } from "./Chk2Status";
import { rfChip, rfState } from "@/lib/ops2/chk/rf";

type Snap = Record<string, unknown> | undefined;
type Ctx = { bundle: Bundle | null; st: StateData | null; snap: Snap; lock: LockFn; onAsk: (a: Ask) => void;
  onManual?: () => void; onConfig?: () => void;           // 탭 이동(W-20) — 없으면 그 버튼을 그리지 않는다
  onSettings?: (dev: DevKey) => void };                    // W-21 머리 [⚙ 설정] → 장비 설정 서랍(없으면 그리지 않음)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** 켜짐/꺼짐 값 — 값이 없으면(끊김 W-26 · 읽지 못함) undefined 라 배지가 '모름'(꺼짐으로 그리지 않는다) */
const bv = (snap: Snap, k: string): boolean | undefined => (snap?.[k] === undefined || snap?.[k] === null ? undefined : snap?.[k] === true);
/** 줄을 그리는가 — 연결 때는 값이 왔는가, 끊김(W-26)이면 마지막 스냅숏에 값이 있었는가(칸 모양은 끊기기 전 그대로, 값만 "—"·'모름') */
const was = (st: StateData | null, snap: Snap, k: string) => (st?.blind ? !!st.had?.includes(k) : snap?.[k] !== undefined);

/** 블록 정의 찾기 */
const blockOf = (b: Bundle | null, name: string) => b?.snapshot?.blocks?.find((x) => x.name === name);
const fieldOf = (d: BlockDef | undefined, name: string) => d?.fields.find((f) => f.name === name);

/** 박스 틀(W-20) — 머리(제목 + 칩) → 모델명 → 큰 값 또는 요약 한 줄 → 라벨-값 줄 → 상태 목록 → 안내 → 맨 아래 버튼 줄.
 *  박스는 격자 줄 높이를 채우고 버튼 줄은 맨 아래(위에 구분선). 꺼진 장비는 칩 '사용하지 않음' · 큰 값 자리 빈 값 · 안내 한 줄 · [설정 열기] */
export function DevCard({ title, sub, chip, big, summary, children, states, actions, actionsEnd, note, off, onConfig, onSettings, offNote, footNote }: {
  title: ReactNode; sub?: ReactNode; chip?: ReactNode; big?: ReactNode; summary?: ReactNode; children?: ReactNode; states?: ReactNode;
  actions?: ReactNode; actionsEnd?: ReactNode; note?: ReactNode; off?: boolean; onConfig?: () => void;
  footNote?: ReactNode;             // W-21 챔버K 수동 조작 — 버튼 줄 아래 한 줄(잠긴 이유). 기본: 없음
  offNote?: string;                 // W-21 챔버K 수동 조작 — 꺼진 장비 안내 글(기본: 지금 글)
  onSettings?: () => void;          // W-21 챔버K — 머리 오른쪽 [⚙ 설정](장비 설정 서랍). 기본: 없음(CH1&2 그대로)
}) {
  const left = off ? (onConfig ? <Btn onClick={onConfig}><Settings size={14} /> 설정 열기</Btn> : null) : actions;
  const right = off ? null : actionsEnd;
  return (
    <Card className="flex flex-col !p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className={`min-w-0 truncate font-bold text-[#1B1F24] ${FS.card}`}>{title}</h3>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">{off ? <Chip>사용하지 않음</Chip> : chip}
          {onSettings && (
            <button type="button" onClick={onSettings} title="장비 설정 보기" aria-label={`${typeof title === "string" ? title : "장비"} 설정 보기`}
              className={`inline-flex h-8 items-center gap-1 rounded-[8px] px-1.5 ${FS.small} font-semibold text-[#1D4ED8] hover:bg-[#EEF4FF]`}>
              <Settings size={13} /> 설정
            </button>
          )}</span>
      </div>
      {sub && <p className={`truncate text-[#5B6470] ${FS.small}`}>{sub}</p>}
      {big && <div className="mt-2">{big}</div>}
      {summary && !off && <p className={`mt-2 truncate text-[#1B1F24] ${FS.body}`}>{summary}</p>}
      {off ? <p className={`mt-2 leading-snug text-[#5B6470] ${FS.small}`}>{offNote ?? "장비 설정에서 사용하도록 바꾸면 값이 표시됩니다."}</p> : <>
        {children && <div className="mt-2 min-w-0">{children}</div>}
        {states && <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">{states}</div>}
        {note && <div className={`mt-2 space-y-1 leading-snug text-[#5B6470] ${FS.small}`}>{note}</div>}
      </>}
      {(left || right) && (
        <div className="mt-auto pt-3">
          <div className="flex flex-wrap items-center gap-2 border-t border-[#E3E6EA] pt-3">
            {left}
            {right && <span className="ml-auto flex flex-wrap items-center justify-end gap-2">{right}</span>}
          </div>
          {footNote && !off && <div className="mt-1.5">{footNote}</div>}
        </div>
      )}
    </Card>
  );
}

/** [수동 조작 열기] — 수동 조작 탭이 있을 때만 */
const ManualBtn = ({ onManual }: { onManual?: () => void }) =>
  onManual ? <Btn onClick={onManual}><Hand size={14} /> 수동 조작 열기</Btn> : null;

/** 큰 값 한 줄(필드 정의) */
/** 끊김(W-26)에 큰 값 줄의 단위 자리를 남기는가 — 끊기기 전에 값(숫자 + 단위)이 보이던 열만(상태 이름 '꺼짐' 등이던 열은 단위가 없었다) */
const keepOf = (st: StateData | null | undefined, col: string | undefined) => !!st?.blind && !!col && !!st.had?.includes(col);
function Big({ f, snap, bundle, off, label, st }: { f?: FieldDef; snap: Snap; bundle: Bundle | null; off?: boolean; label?: string; st?: StateData | null }) {
  const { detail } = useChk2Mode();
  if (!f) return null;
  const t = fieldText(f, snap?.[f.column], snap, bundle?.snapshot?.blocks);
  return (
    <div title={fieldTip(f, detail)}>
      <p className={`${FS.small} text-[#5B6470]`}>{label ?? fieldName(bundle, f.column)}</p>
      <Val text={off ? "" : t.text} unit={f.unit} size="big" alt={off ? null : t.alt} altWarn={t.warn} keepUnit={keepOf(st, f.column) && !off} />
    </div>
  );
}

/** 값 줄(필드 정의) — bool 은 이름 + 상태 배지. 이름은 묶음(옛 묶음이면 용어표), 마우스 설명은 help(상세 보기는 desc·열 이름) */
function Row({ f, snap, bundle, off, staleNote }: { f?: FieldDef; snap: Snap; bundle: Bundle | null; off?: boolean; staleNote?: string }) {
  const { detail } = useChk2Mode();
  if (!f) return null;
  if (f.type === "bool") return <StateTag on={off ? null : bv(snap, f.column)} label={fieldName(bundle, f.column)} words={wordsOf(f.name)} title={fieldTip(f, detail)} />;
  // kit FieldValue 는 title 을 desc(+상세 보기면 열 이름)로 그린다 — 평소 보기는 help 를 desc 자리에 넣어 넘긴다
  const g = { ...f, label: fieldName(bundle, f.column), desc: detail ? f.desc : fieldTip(f, false) };
  return <FieldValue f={g} v={snap?.[f.column]} dim={off} snap={snap} blocks={bundle?.snapshot?.blocks} staleNote={staleNote} />;
}

/** 현재 / 목표 한 줄 */
function PairRow({ k, a, b, unit, off }: { k: string; a: unknown; b: unknown; unit: string; off?: boolean }) {
  const s = (v: unknown) => (num(v) === null ? "" : String(Number((v as number).toPrecision(6))));
  // 값이 없으면 Val 이 단위 없이 "—"(끊김 W-26 — 목표도 없으면 단위를 붙이지 않는다)
  return (
    <KV k={k}>
      {off ? <Val text="" /> : <><Val text={s(a)} /><span className={`ml-1 ${FS.small} text-[#5B6470]`}>/ {s(b) ? `${s(b)} ${unit}` : "—"}</span></>}
    </KV>
  );
}

/** '상세'에서만 보이는 나머지 필드 */
function DetailRows({ d, snap, bundle, shown, hide }: {
  d?: BlockDef; snap: Snap; bundle: Bundle | null; shown: string[]; hide?: (f: FieldDef) => boolean;
}) {
  const { detail } = useChk2Mode();
  if (!detail || !d) return null;
  const rest = d.fields.filter((f) => !shown.includes(f.name) && !hide?.(f));
  if (!rest.length) return null;
  return (
    <div className="mt-1 border-t border-dashed border-[#E3E6EA] pt-1">
      {rest.map((f) => <Row key={f.column} f={f} snap={snap} bundle={bundle} />)}
    </div>
  );
}

/** 웹에서만 되는 조작 — 한 줄 안내 */
const WebOnly = ({ what }: { what: string }) => <p className={`${FS.small} text-[#5B6470]`}>{what}은 웹에서만</p>;

// ───────────── 진공 ─────────────
export function VacuumCard({ bundle, snap, st, onHmi, onSettings }: Ctx & { onHmi: () => void }) {
  const d = blockOf(bundle, "plc");
  const { detail } = useChk2Mode();
  const pumps = ["rotary", "turbo"].filter((k) => snap?.[`plc.${k}`] === true).map((k) => fieldName(bundle, `plc.${k}`));
  const unknown = snap?.["plc.rotary"] === undefined;
  return (
    <DevCard title={CARD.vacuum} sub={blockSub(bundle, "plc", detail)} chip={<QBadge link={st?.links?.plc} />} onSettings={onSettings && (() => onSettings("vacuum"))}
      summary={unknown ? "—" : pumps.length ? `${pumps.join("·")} 운전` : "펌프 정지"}
      states={<>
        {["rotary", "turbo", "mv", "fv", "rv", "vent"].map((n) => {
          const f = fieldOf(d, n);
          return f ? <StateTag key={n} on={snap?.[f.column] as boolean | undefined} label={fieldName(bundle, f.column)} words={wordsOf(n)} title={fieldTip(f, detail)} /> : null;
        })}
        {/* 끊김(W-26)에도 줄은 그대로(값만 '모름') — 카드 높이가 바뀌지 않게 */}
        {was(st, snap, "plc.mv_interlock") && (
          <StateTag on={bv(snap, "plc.mv_interlock")} label={fieldName(bundle, "plc.mv_interlock")} title={fieldTip(fieldOf(d, "mv_interlock"), detail)} />
        )}
      </>}
      actions={<Btn onClick={onHmi}><Workflow size={14} /> HMI 열기</Btn>} />
  );
}

// ───────────── 가스·압력 ─────────────
// 밸브 위치를 이번 초에 읽지 않은 까닭(묶음 18 mfc.valve_read — 읽기 계획). 옛 장비는 명령 처리로 미룬 것만 있었다
const VALVE_WHY: Record<string, string> = { alternate: "2초마다 번갈아 읽음", yielded: "명령 처리로 건너뜀", no_reply: "응답 없음" };
const VALVE_STALE = "명령 처리로 건너뜀";
const ALT_NOTE = "2초마다 번갈아 읽음";
export function GasCard({ bundle, snap, st, onManual, onConfig, onSettings }: Ctx) {
  const { detail } = useChk2Mode();
  const d = blockOf(bundle, "mfc");
  const off = st?.links?.mfc?.q === "off";
  const spF = fieldOf(d, "sp_active"), spN = num(snap?.["mfc.sp_active"]);
  const spSelF = fieldOf(d, "sp_sel_mtorr");      // 사용 중 설정점 — 1~5 는 "SP5" 처럼
  return (
    <DevCard title={CARD.gas} sub={blockSub(bundle, "mfc", detail)} chip={<QBadge link={st?.links?.mfc} />} off={off} onConfig={onConfig}
      onSettings={onSettings && (() => onSettings("gas"))}
      big={<Big f={fieldOf(d, "pressure_mtorr")} snap={snap} bundle={bundle} off={off} st={st} />} actions={<ManualBtn onManual={onManual} />}>
      <PairRow k="Ar 현재 / 목표" a={snap?.["mfc.ar_sccm"]} b={snap?.["mfc.ar_set"]} unit="sccm" off={off} />
      <PairRow k="O₂ 현재 / 목표" a={snap?.["mfc.o2_sccm"]} b={snap?.["mfc.o2_set"]} unit="sccm" off={off} />
      {/* 압력 목표 — 묶음 16 은 선택된 설정점의 값(mfc.sp_sel_mtorr: SP4·SP5 단계에도), 옛 장비는 SP1 확인값(mfc.sp_mtorr) */}
      <Row f={spSelF ?? fieldOf(d, "sp_mtorr")} snap={snap} bundle={bundle} off={off} />
      {spF && (
        <KV k={fieldName(bundle, spF.column)} title={fieldTip(spF, detail)}>
          <Val text={off || spN === null ? "" : spN >= 1 ? `SP${spN}` : "MFC 밸브 조작"} />
        </KV>
      )}
      {/* 밸브 위치(묶음 15) — 기록용 읽기라 설정 명령 중에는 장비가 읽기를 미룬다(품질 열 stale → 앞 값을 흐리게) */}
      <Row f={fieldOf(d, "valve_pct")} snap={snap} bundle={bundle} off={off}
        staleNote={VALVE_WHY[String(snap?.["mfc.valve_read"] ?? "")] ?? VALVE_STALE} />
      {detail && !off && snap?.["mfc.read_plan"] === "alternate" && (
        <p className={`${FS.small} text-[#5B6470]`} title="읽기가 느려 유량과 MFC 밸브 위치를 2초마다 번갈아 읽습니다.">
          유량·MFC 밸브 위치는 {ALT_NOTE}
        </p>
      )}
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
        <StateTag on={snap?.["plc.ar_valve"] as boolean | undefined} label={fieldName(bundle, "plc.ar_valve")} words="open" />
        <StateTag on={snap?.["plc.o2_valve"] as boolean | undefined} label={fieldName(bundle, "plc.o2_valve")} words="open" />
      </div>
      <DetailRows d={d} snap={snap} bundle={bundle}
        shown={["pressure_mtorr", "ar_sccm", "ar_set", "o2_sccm", "o2_set", spSelF ? "sp_sel_mtorr" : "sp_mtorr", "sp_active", "valve_pct"]} />
    </DevCard>
  );
}

// ───────────── 히터 ─────────────
/** 숫자 입력 칸 + 범위(칸에 "0~700 °C", 밖이면 칸 아래 빨간 글씨) */
function NumInput({ label, value, onChange, range, unit, disabled }: {
  label: string; value: string; onChange: (v: string) => void; range: Range | null; unit: string; disabled?: boolean;
}) {
  const { error } = checkInput(value, range);
  return (
    <label className={`block ${FS.body}`}>
      <span className="text-[#5B6470]">{label}</span>
      <span className="mt-0.5 flex items-center gap-1.5">
        <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} inputMode="decimal" aria-label={label}
          placeholder={range ? rangeText(range) : unit}
          className={`h-10 w-36 rounded-[10px] border bg-white px-2 ${FS.body} tabular-nums disabled:bg-[#F5F6F8] disabled:text-[#8A929D] ${
            error && !disabled ? "border-[#B42318]" : "border-[#D9DDE3]"}`} />
        <span className={`${FS.small} text-[#5B6470]`}>{unit}</span>
      </span>
      {error && !disabled && <span className={`mt-0.5 block ${FS.small} font-semibold text-[#B42318]`}>{error}</span>}
    </label>
  );
}

function HeaterOnModal({ bundle, snap, onClose, onAsk }: { bundle: Bundle | null; snap: Snap; onClose: () => void; onAsk: (a: Ask) => void }) {
  const [target, setTarget] = useState("");
  const [useAr, setUseAr] = useState(false);
  const [arFlow, setArFlow] = useState("");
  const [useO2, setUseO2] = useState(false);
  const [o2Flow, setO2Flow] = useState("");
  const [wp, setWp] = useState("");
  const onRange = capRange(argRange(bundle, "HEATER_ON", "value"), snap?.["heater.sv_limit"]);
  const arRange = argRange(bundle, "HEATER_ON", "ar_flow"), o2Range = argRange(bundle, "HEATER_ON", "o2_flow");
  const wpR = argRange(bundle, "HEATER_ON", "wp_mtorr");
  const wpRange = wpR ? { ...wpR, unit: wpR.unit || "mTorr" } : null;
  const t = checkInput(target, onRange), ar = checkInput(arFlow, arRange), o2 = checkInput(o2Flow, o2Range), w = checkInput(wp, wpRange);
  const sv = num(snap?.["heater.sv"]);
  const value = t.value ?? sv;
  const gas = useAr || useO2;
  const bad = value === null || !!t.error || (useAr && (ar.value === null || !!ar.error)) || (useO2 && (o2.value === null || !!o2.error))
    || (gas && !!w.error);
  const go = () => {
    const a: Record<string, unknown> = { value };
    if (useAr) { a.use_ar = true; a.ar_flow = ar.value; }
    if (useO2) { a.use_o2 = true; a.o2_flow = o2.value; }
    if (gas && w.value !== null) a.wp_mtorr = w.value;
    const gasText = [useAr && `Ar ${arFlow} sccm`, useO2 && `O₂ ${o2Flow} sccm`, gas && wp && `압력 ${wp} mTorr`].filter(Boolean).join(" · ");
    onClose();
    onAsk({ kind: "HEATER_ON", label: "히터 켜기", detail: `→ ${value} °C${gasText ? ` · ${gasText}` : ""}`, args: a,
            lines: [`목표 ${value} °C`, gasText ? `가스 ${gasText}` : "가스 없이"] });
  };
  return (
    <Modal title="히터 켜기" onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn kind="primary" disabled={bad} onClick={go}>확인으로</Btn></>}>
      <div className="space-y-3">
        <NumInput label={`목표 온도${sv !== null ? ` (비우면 지금 목표 ${sv} °C)` : ""}`} value={target} onChange={setTarget} range={onRange} unit="°C" />
        <div className="rounded-[10px] border border-[#E3E6EA] p-3">
          <p className={`mb-2 ${FS.body} font-semibold text-[#1B1F24]`}>가스(선택)</p>
          <div className="space-y-2">
            <label className={`flex items-center gap-2 ${FS.body}`}><input type="checkbox" checked={useAr} onChange={(e) => setUseAr(e.target.checked)} /> Ar 사용</label>
            {useAr && <NumInput label="Ar 유량" value={arFlow} onChange={setArFlow} range={arRange} unit="sccm" />}
            <label className={`flex items-center gap-2 ${FS.body}`}><input type="checkbox" checked={useO2} onChange={(e) => setUseO2(e.target.checked)} /> O₂ 사용</label>
            {useO2 && <NumInput label="O₂ 유량" value={o2Flow} onChange={setO2Flow} range={o2Range} unit="sccm" />}
            {gas && <NumInput label="압력(선택)" value={wp} onChange={setWp} range={wpRange} unit="mTorr" />}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function HeaterSvModal({ bundle, snap, onClose, onAsk }: { bundle: Bundle | null; snap: Snap; onClose: () => void; onAsk: (a: Ask) => void }) {
  const [target, setTarget] = useState("");
  const r = capRange(argRange(bundle, "HEATER_SV", "value"), snap?.["heater.sv_limit"]);
  const t = checkInput(target, r);
  return (
    <Modal title="히터 목표 바꾸기" onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>취소</Btn>
        <Btn kind="primary" disabled={t.value === null || !!t.error}
          onClick={() => { onClose(); onAsk({ kind: "HEATER_SV", label: "히터 목표 온도", detail: `→ ${t.value} °C`, args: { value: t.value } }); }}>
          확인으로</Btn></>}>
      <NumInput label="새 목표 온도" value={target} onChange={setTarget} range={r} unit="°C" />
    </Modal>
  );
}

export function HeaterCard({ bundle, snap, st, lock, onAsk, onConfig, onSettings }: Ctx) {
  const m = useChk2Mode();
  const [modal, setModal] = useState<"on" | "sv" | null>(null);
  const d = blockOf(bundle, "heater");
  const off = st?.links?.heater?.q === "off";
  const run = snap?.["heater.run"] === true, runKnown = bv(snap, "heater.run");
  const fault = snap?.["heater.fault"] === true;
  const issues = [["fault", "히터 이상"], ["ot", "과온"], ["tc_err", "TC 이상"], ["wd_err", "워치독 이상"]]
    .filter(([k]) => snap?.[`heater.${k}`] === true).map(([, l]) => l);
  const mv = num(snap?.["heater.mv"]), mvMax = num(snap?.["heater.mv_limit"]), amp = num(snap?.["heater.current_est"]);
  const outText = mv === null ? "" : run ? `DAC ${Math.round(mv)}${mvMax ? `/${Math.round(mvMax)}` : ""}${amp !== null ? ` · ≈${amp.toFixed(1)} A` : ""}`
    : m.detail ? `정지 · DAC ${Math.round(mv)}` : "정지";
  const casc = fieldOf(d, "casc_state"), mode = fieldOf(d, "ctrl_mode");
  const cs = snap?.["heater.casc_state"], cm = snap?.["heater.ctrl_mode"];
  // 줄 구성(제어 방식 줄·TC2 편차 줄)은 끊김(W-26)이면 마지막 제어 구조로 — 글은 "—"
  const csL = st?.blind ? st.shape?.["heater.casc_state"] : cs, cmL = st?.blind ? st.shape?.["heater.ctrl_mode"] : cm;
  const hasCtrl = (typeof csL === "string" && !!csL && csL !== "idle") || (typeof cmL === "string" && !!cmL);
  // 상태 이름은 제어 구조에 따라(묶음 16 enumLabelsBy — tc2 의 running 은 "TC2 제어(단독)"), 옛 묶음은 enumLabels
  const ctrlText = typeof cs === "string" && cs && cs !== "idle" ? (enumLabel(casc, cs, snap) ?? cs)
    : typeof cm === "string" && cm ? (enumLabel(mode, cm, snap) ?? cm) : "";
  // 묶음 15 — tc2(TC2 단독 제어): 편차는 TC2 − SV2, TC1 은 기록. TC2 PID 두 모드(tc2·cascade)에서 TC2 아래 TC2 목표(SV2)
  //   SV2·편차는 TC2 제어가 돌 때만(꺼져 있으면 SV2 는 0 이라 뜻 없는 숫자가 된다)
  const tc2Only = cmL === "tc2", tc2Pid = cm === "tc2" || cm === "cascade";
  const cascOn = typeof cs === "string" && cs !== "" && cs !== "idle";
  const pvF = fieldOf(d, "pv"), pv2F = fieldOf(d, "pv2"), sv2F = fieldOf(d, "sv2");
  const sv2 = num(snap?.["heater.sv2"]), pv2 = num(snap?.["heater.pv2"]);
  const dev2 = tc2Only && cascOn && sv2 !== null && pv2 !== null ? pv2 - sv2 : null;
  const tcBig = (f: FieldDef | undefined, under: ReactNode) => {
    if (!f) return <div />;
    const t = fieldText(f, snap?.[f.column], snap, bundle?.snapshot?.blocks);
    return (
      <div className="min-w-0" title={fieldTip(f, m.detail)}>
        <p className={`${FS.small} text-[#5B6470]`}>{fieldName(bundle, f.column)}</p>
        <Val text={off ? "" : t.text} unit={f.unit} size="big" alt={off ? null : t.alt} altWarn={t.warn} keepUnit={keepOf(st, f.column) && !off} />
        <p className={`min-h-[18px] truncate ${FS.small} text-[#5B6470]`}>{off ? "" : under}</p>
      </div>
    );
  };
  const gas = st?.heater?.gas ?? null, owner = st?.heater?.owner ?? null;
  const hr = st?.heaterRecipe ?? null;
  const full = !m.webOnly("HEATER_ON");
  return (
    <>
      <DevCard title={d?.label ?? CARD.heater} sub={blockSub(bundle, "heater", m.detail)} off={off} onConfig={onConfig}
        onSettings={onSettings && (() => onSettings("heater"))}
        chip={<>{st?.blind ? null /* 끊김(W-26) — 지금 운전·정지를 모름 */ : issues.length ? <Chip tone="alarm">이상</Chip> : <Chip tone={run ? "dark" : "neutral"}>{run ? "운전" : "정지"}</Chip>}
          {st?.links?.heater?.q && st.links.heater.q !== "ok" && <QBadge link={st.links.heater} />}</>}
        big={
          // TC1·TC2 같은 크기로 나란히, TC2 목표(SV2)는 TC2 아래 작게(v1 노트북 화면 a786b25 와 같은 배치)
          <div className="grid grid-cols-2 gap-x-3">
            {tcBig(pvF, tc2Only && !st?.blind ? "참고" : "")}
            {tcBig(pv2F, tc2Pid && cascOn && sv2 !== null && sv2F ? `목표 ${fmtValue(sv2, sv2F.fmt)} ${sv2F.unit}` : "")}
          </div>
        }
        note={<>
          {issues.length > 0 && <Issue level="alarm">{issues.join(" · ")}: 원인을 확인한 뒤 이상 리셋</Issue>}
          {(owner || (gas && gas !== "IDLE")) && (
            <p>{owner && `히터 사용: ${HEATER_OWNER[owner] ?? owner}`}{st?.heater?.handedOver && " · 공정에서 넘겨받음"}
              {gas && gas !== "IDLE" && `${owner ? " · " : ""}${GAS_STATE[gas] ?? gas}`}</p>
          )}
          {hr && <p className="font-semibold text-[#1B1F24]">히터 레시피 {hr.name || ""} · 단계 {hr.step ?? "-"}/{hr.steps ?? "-"}{hr.held ? " · 일시정지" : ""}</p>}
          {!full && <WebOnly what="히터 켜기·목표·끄기·이상 리셋·가스 해제" />}
        </>}
        // 버튼은 맨 아래 줄 — 정지 계열(히터 정지·레시피 정지)은 줄 오른쪽 끝(W-20)
        actions={(full || fault || (gas && gas !== "IDLE") || hr) ? <>
          {full && <Btn lock={lock("HEATER_ON")} onClick={() => setModal("on")}><Flame size={14} /> 히터 켜기…</Btn>}
          {full && <Btn lock={lock("HEATER_SV")} onClick={() => setModal("sv")}>목표 바꾸기…</Btn>}
          {full && <Btn lock={lock("HEATER_OFF")} onClick={() => onAsk({ kind: "HEATER_OFF", label: "히터 끄기" })}>끄기</Btn>}
          {fault && full && (
            <Btn lock={lock("HEATER_RESET")}
              onClick={() => onAsk({ kind: "HEATER_RESET", label: "히터 이상 리셋", detail: "원인을 먼저 확인하세요", danger: true })}>이상 리셋</Btn>
          )}
          {gas && gas !== "IDLE" && !m.webOnly("HEATER_GAS_RELEASE") && (
            <Btn lock={lock("HEATER_GAS_RELEASE")} onClick={() => onAsk({ kind: "HEATER_GAS_RELEASE", label: "히터 가스 해제" })}>가스 해제</Btn>
          )}
          {hr && !m.webOnly("HEATER_RECIPE_HOLD") && hr.held !== true && (
            <Btn lock={lock("HEATER_RECIPE_HOLD")} onClick={() => onAsk({ kind: "HEATER_RECIPE_HOLD", label: "히터 레시피 일시정지",
              args: { on: true }, note: "지금 온도에서 멈춥니다. 레시피 시간도 멈춥니다." })}><PauseCircle size={13} /> 레시피 일시정지</Btn>
          )}
          {hr && !m.webOnly("HEATER_RECIPE_HOLD") && hr.held !== false && (
            <Btn lock={lock("HEATER_RECIPE_HOLD")} onClick={() => onAsk({ kind: "HEATER_RECIPE_HOLD", label: "히터 레시피 재개", args: { on: false } })}>
              <Play size={13} /> 레시피 재개</Btn>
          )}
          {hr && !m.webOnly("HEATER_RECIPE_SKIP") && (
            <Btn lock={lock("HEATER_RECIPE_SKIP")} onClick={() => onAsk({ kind: "HEATER_RECIPE_SKIP", label: "히터 레시피 단계 건너뛰기",
              detail: `단계 ${hr.step ?? "-"} → 다음` })}><SkipForward size={13} /> 단계 건너뛰기</Btn>
          )}
        </> : null}
        actionsEnd={<>
          <Btn kind="danger" lock={lock("HEATER_STOP")}
            onClick={() => onAsk({ kind: "HEATER_STOP", label: "히터 정지", stop: true,
                                   note: "히터 레시피를 멈추고 히터를 끕니다. 공정이 히터를 쓰면 공정도 멈춥니다." })}>
            <Square size={13} /> 히터 정지
          </Btn>
          {hr && (
            <Btn kind="danger" lock={lock("HEATER_RECIPE_STOP")} onClick={() => onAsk({ kind: "HEATER_RECIPE_STOP", label: "히터 레시피 정지",
              stop: true, note: "히터 레시피를 멈추고 히터를 끕니다. 목표는 지금 온도가 됩니다." })}><Square size={13} /> 레시피 정지</Btn>
          )}
        </>}>
        {/* 라벨-값 줄·상태 — 박스가 넓으면(2칸) 두 열(왼쪽 목표 온도·TC2 편차·제어 방식·bias, 오른쪽 출력·운전·히터 인터락), 좁으면 한 열 */}
        <div className="@container/heater">
          <div className="grid grid-cols-1 gap-x-6 @min-[560px]/heater:grid-cols-2">
            <div className="min-w-0">
              <Row f={fieldOf(d, "sv")} snap={snap} bundle={bundle} off={off} />
              {tc2Only && (
                <KV k="TC2 편차" title="TC2 와 TC2 목표의 차이입니다.">
                  <Val text={off || dev2 === null ? "" : `${dev2 >= 0 ? "+" : "−"}${Math.abs(dev2).toFixed(1)}`} unit="°C" />
                </KV>
              )}
              {ctrlText ? <KV k="제어 방식"><span className={`${FS.body} font-semibold text-[#1B1F24]`}>{ctrlText}</span></KV>
                : st?.blind && hasCtrl && (casc || mode) ? <KV k="제어 방식"><Val text="" /></KV> : null}
              {(st?.blind ? !!st.had?.includes("heater.bias") : num(snap?.["heater.bias"]) !== null) && <Row f={fieldOf(d, "bias")} snap={snap} bundle={bundle} off={off} />}
            </div>
            <div className="min-w-0">
              <KV k="출력"><Val text={off ? "" : outText} /></KV>
              {/* 좁을 때는 지금처럼 두 칸, 넓을 때(오른쪽 열)는 한 칸씩 아래로 */}
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 @min-[560px]/heater:grid-cols-1">
                <StateTag on={runKnown} label="운전" />
                {was(st, snap, "heater.itl") && <StateTag on={bv(snap, "heater.itl")} label={fieldName(bundle, "heater.itl")} title={fieldTip(fieldOf(d, "itl"), m.detail)} />}
              </div>
            </div>
          </div>
        </div>
        <DetailRows d={d} snap={snap} bundle={bundle} shown={["pv", "pv2", "sv", "casc_state", "bias", "mv", "current_est", "run", "itl", "fault", "ot", "tc_err", "wd_err"]}
          hide={(f) => /^bias/.test(f.name) && num(snap?.[f.column]) === null} />
      </DevCard>
      {modal === "on" && <HeaterOnModal bundle={bundle} snap={snap} onClose={() => setModal(null)} onAsk={onAsk} />}
      {modal === "sv" && <HeaterSvModal bundle={bundle} snap={snap} onClose={() => setModal(null)} onAsk={onAsk} />}
    </>
  );
}

// ───────────── Ion Gauge ─────────────
export function IgCard({ bundle, snap, st, lock, onAsk, onConfig, onSettings }: Ctx) {
  const m = useChk2Mode();
  const d = blockOf(bundle, "ig");
  const off = st?.links?.ig?.q === "off";
  const on = snap?.["ig.filament"] === true;
  const pk = kindOf(bundle, st);
  const busy = pk === "active" || pk === "stopping";       // 공정 중에는 공정이 Filament 를 다룬다(장비도 받지 않음)
  return (
    <DevCard title={d?.label && !/이온 게이지/.test(d.label) ? d.label : CARD.ig} sub={blockSub(bundle, "ig", m.detail)} chip={<QBadge link={st?.links?.ig} />} off={off}
      onConfig={onConfig} onSettings={onSettings && (() => onSettings("ig"))} big={<Big f={fieldOf(d, "ion_torr")} snap={snap} bundle={bundle} off={off} label="압력" st={st} />}
      note={m.webOnly("IG_FILAMENT") ? <WebOnly what="Filament 조작" /> : undefined}
      actions={m.webOnly("IG_FILAMENT") ? null : (
        <Btn lock={off ? "장비 설정에서 꺼져 있습니다." : busy ? "공정 중에는 조작할 수 없습니다." : lock("IG_FILAMENT")}
          onClick={() => onAsk({ kind: "IG_FILAMENT", label: `Filament ${on ? "끄기" : "켜기"}`, args: { on: !on } })}>
          <Gauge size={14} /> Filament {on ? "끄기" : "켜기"}
        </Btn>
      )}>
      <Row f={fieldOf(d, "a_torr")} snap={snap} bundle={bundle} off={off} />
      <Row f={fieldOf(d, "b_torr")} snap={snap} bundle={bundle} off={off} />
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
        {["filament", "emission", "degas"].map((n) => {
          const f = fieldOf(d, n);
          return f ? <StateTag key={n} on={off ? null : snap?.[f.column] as boolean | undefined} label={fieldName(bundle, f.column)} title={fieldTip(f, m.detail)} /> : null;
        })}
      </div>
      <DetailRows d={d} snap={snap} bundle={bundle} shown={["ion_torr", "a_torr", "b_torr", "filament", "emission", "degas"]} />
    </DevCard>
  );
}

// ───────────── 파워(DC Power · RF Power · RF Pulse) ─────────────
export function PowerCard({ name, bundle, snap, st, onManual, onConfig, onSettings }: Ctx & { name: "dc" | "rf" | "rfp" }) {
  const { detail } = useChk2Mode();
  const d = blockOf(bundle, name);
  const off = st?.links?.[name]?.q === "off";
  const bigName = name === "dc" ? "p" : "fwd_w";
  const rows = name === "dc" ? ["v", "i", "set_w"] : name === "rf" ? ["ref_w", "set_w"] : ["ref_w", "set_w", "freq_hz", "duty_pct"];
  // RF 출력 칩 — 묶음 23 은 명령 출력(rf.cmd_on)·명령 없는 출력(rf.uncommanded) 규칙(lib/ops2/chk/rf), 묶음 19~22 는 rf.out_on,
  // 그 전 묶음은 칩 없이 지금처럼
  const rfc = name === "rf" ? rfChip(snap) : null;
  const bools = name === "dc" ? ["out"] : name === "rfp" ? ["out_on", "itl_open"]
    : rfc ? ["cmd_on", "uncommanded", "out_on"] : fieldOf(d, "out_on") ? ["out_on"] : [];
  const chip = st?.blind ? null /* 끊김(W-26) — 지금 출력을 모름 */ : rfc ? <Chip tone={rfc.tone === "warn" ? "warn" : rfc.tone}>{rfc.text}</Chip>
    : bools[0] && <Chip tone={snap?.[`${name}.${bools[0]}`] === true ? "dark" : "neutral"}>{snap?.[`${name}.${bools[0]}`] === true ? "출력 켜짐" : "출력 꺼짐"}</Chip>;
  const raw = name === "rf" && rfState(snap) === "off" ? [snap?.["rf.fwd_w_raw"], snap?.["rf.ref_w_raw"]] : null;
  return (
    <DevCard title={d?.label ?? name} sub={blockSub(bundle, name, detail)} off={off} onConfig={onConfig} actions={<ManualBtn onManual={onManual} />}
      onSettings={onSettings && (() => onSettings(name))}
      chip={<>{!off && chip}<QBadge link={st?.links?.[name]} /></>}
      note={name === "rf" && rfc?.tone === "warn" && !off
        ? <Issue level="warn">RF 가 명령 없이 출력 중입니다. RF 전원 앞면(LOCAL)에서 켰는지 확인하세요.</Issue> : undefined}
      big={<Big f={fieldOf(d, bigName)} snap={snap} bundle={bundle} off={off} st={st} />}>
      {rows.map((n) => <Row key={n} f={fieldOf(d, n)} snap={snap} bundle={bundle} off={off} />)}
      {detail && raw && !off && (
        <p className={`${FS.small} text-[#5B6470]`} title="명령이 없어 화면에는 0 으로 보입니다. 기록에는 읽은 값이 남습니다.">
          읽은 값 Forward {fmtValue(raw[0], ".1f") || "—"} W · Reflected {fmtValue(raw[1], ".1f") || "—"} W
        </p>
      )}
      {detail && name === "rfp" && !off && snap?.["rfp.read_plan"] === "alternate" && (
        <p className={`${FS.small} text-[#5B6470]`} title="읽기가 느려 Forward 와 상태를 2초마다 번갈아 읽습니다.">
          Forward·상태는 {ALT_NOTE}
        </p>
      )}
      {/* 상태가 하나뿐이라 한 열(W-20 — 두 칸 격자의 반쪽이면 3개씩 줄에서 이름이 잘림) */}
      {name === "rfp" && fieldOf(d, "itl_open") && (
        <div className="mt-1 grid grid-cols-1 gap-y-1">
          <StateTag on={off ? null : bv(snap, "rfp.itl_open")} label={fieldName(bundle, "rfp.itl_open")} title={fieldTip(fieldOf(d, "itl_open"), detail)} alert />
        </div>
      )}
      <DetailRows d={d} snap={snap} bundle={bundle} shown={[bigName, ...rows, ...bools]} />
    </DevCard>
  );
}

// ───────────── 셔터·인터락 ─────────────
export function ShutterCard({ bundle, snap, st, onHmi, onSettings }: Ctx & { onHmi: () => void }) {
  const { detail } = useChk2Mode();
  const d = blockOf(bundle, "plc");
  const lamps = ["air", "g1", "g2", "atm", "water"];
  const open = ["ms", "s1", "s2"].filter((k) => snap?.[`plc.${k}`] === true).map((k) => fieldName(bundle, `plc.${k}`));
  const unknown = snap?.["plc.ms"] === undefined;
  return (
    <DevCard title={CARD.shutter} sub={blockSub(bundle, "plc", detail)} chip={<QBadge link={st?.links?.plc} />} onSettings={onSettings && (() => onSettings("shutter"))}
      summary={unknown ? "—" : open.length ? `${open.join("·")} 열림` : "셔터 모두 닫힘"}
      note={snap?.["plc.ion_ot"] === true ? <Issue level="warn">{fieldName(bundle, "plc.ion_ot")}</Issue> : undefined}
      actions={<Btn onClick={onHmi}><Workflow size={14} /> HMI 열기</Btn>}>
      {/* 상태 한 격자 두 열(W-20) — 왼쪽 셔터·Door·Ionizer, 오른쪽 센서(Air·G1·G2·ATM·Water) */}
      <div className="grid grid-cols-2 gap-x-4">
        <div className="flex min-w-0 flex-col gap-y-1">
          {["ms", "s1", "s2", "door_up", "door_down", "ion_remote_on"].map((n) => {
            const f = fieldOf(d, n);
            return f ? <StateTag key={n} on={snap?.[f.column] as boolean | undefined} label={fieldName(bundle, f.column)} words={wordsOf(n)} title={fieldTip(f, detail)} /> : null;
          })}
        </div>
        <div className="flex min-w-0 flex-col gap-y-1">
          {lamps.map((k) => (
            <StateTag key={k} on={snap?.[`plc.${k}`] as boolean | undefined} label={fieldName(bundle, `plc.${k}`)} words="detect" title={fieldTip(fieldOf(d, k), detail)} />
          ))}
        </div>
      </div>
      <MountedRows st={st} />
    </DevCard>
  );
}

/** 장착 타겟(W-22 — 재고관리 chamber-slots, state.targets). 읽기가 없으면(묶음 22·주소 없음·sim) 그리지 않는다 */
export function MountedRows({ st, compact }: { st?: StateData | null; compact?: boolean }) {
  const t = st?.targets;
  if (!t) return null;
  const at = t.readAt ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour12: false, hour: "2-digit", minute: "2-digit" }).format(new Date(t.readAt)) : null;
  const title = [t.readAt ? `${at} 재고관리에서 읽음` : "아직 읽기 전", t.error ? `마지막 읽기 실패: ${t.error}` : ""].filter(Boolean).join(" · ");
  return (
    <div className={compact ? "" : "mt-2 border-t border-[#EEF0F3] pt-2"} title={title}>
      {(["g1", "g2"] as const).map((g) => {
        const m = t[g];
        return (
          <KV key={g} k={`${g === "g1" ? "Gun1" : "Gun2"} 장착 타겟`}>
            <span className={`min-w-0 truncate ${FS.body} ${m ? "font-semibold text-[#1B1F24]" : "text-[#5B6470]"}`}
              title={m ? [m.text, m.barcode && `바코드 ${m.barcode}`, m.purity && `순도 ${m.purity}`].filter(Boolean).join(" · ") : undefined}>
              {m ? m.text : t.readAt ? "없음" : "—"}
            </span>
          </KV>
        );
      })}
      {t.error && !t.readAt && <p className={`${FS.small} text-[#5B6470]`}>재고관리에서 장착 타겟을 읽지 못했습니다.</p>}
    </div>
  );
}

/** 장비 박스 격자(W-20) — 폭 기준은 운전 탭 영역(Chk2Run 의 컨테이너 run). 읽는 순서는 늘 진공 → 셔터·인터락 → 가스·압력 →
 *  DC Power → RF Power → RF Pulse → Ion Gauge → 히터. 영역 950px 이상 한 줄 3개(히터 2칸), 650px 이상 2개(히터 1칸), 더 좁으면 1개.
 *  (기준 폭은 이름이 잘리지 않는 폭 — 900·560 에서는 'MV 인터락'·'히터 인터락' 등이 잘려 올림.) 같은 줄 박스는 높이를 맞춘다(격자 늘임). */
export function DeviceGrid(p: Ctx & { onHmi: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 @min-[650px]/run:grid-cols-2 @min-[950px]/run:grid-cols-3">
      <VacuumCard {...p} />
      <ShutterCard {...p} />
      <GasCard {...p} />
      <PowerCard {...p} name="dc" />
      <PowerCard {...p} name="rf" />
      <PowerCard {...p} name="rfp" />
      <IgCard {...p} />
      <HeaterBox {...p} />
    </div>
  );
}
/** 히터 — 3개씩 줄에서는 2칸 */
const HeaterBox = (p: Ctx) => <div className="grid min-w-0 @min-[950px]/run:col-span-2"><HeaterCard {...p} /></div>;

/** 값 하나 글(그래프 툴팁 등) */
export const valueText = (f: FieldDef | undefined, v: unknown) => (f ? fmtValue(v, f.fmt) : "");
export { BigValue };
