"use client";

// 챔버K v2 장비 카드(W-10, 운전 탭 대기 화면) — 진공 · 가스·압력 · 히터 · 이온 게이지 / DC Power · RF Power · RF Pulse · 셔터·안전.
// 카드 구조는 모두 같다: 머리(이름 + 상태 칩) · 큰 값 한 줄 · 라벨-값 줄 · 버튼 줄(카드 아래쪽). 이름·라벨·단위는 묶음 그대로.
// 장비 상태는 진회색 채운 네모(켜짐·열림) / 회색 테두리 네모(꺼짐·닫힘) — 색은 이상할 때만(아이콘 + 글자).
// 값 입력이 필요한 조작(히터 켜기·목표 바꾸기)은 버튼 → 작은 창에서 입력(범위는 묶음 인자) → 확인창. 버튼 색은 중립, 위험 동작만 빨간 테두리.
// 설정에서 꺼진 장비(블록 품질 off — RF Pulse 등)는 접지 않고 값 '—'·칩 '사용 안 함 · 장비 설정'·한 줄 안내.
// 히터 출력은 퍼센트 없이 DAC·추정 전류(v1 결정), 2단 제어 상태 이름은 묶음 enumLabels, r1·SV2·ff·b_int 는 '상세'에서.
// 진공·셔터는 [HMI 에서 조작] → HMI 탭(계통도). 노트북 로컬 화면은 HMI 경로에서 받는 명령만(나머지는 "웹에서만").
import { useState, type ReactNode } from "react";
import { Flame, Gauge, PauseCircle, Play, SkipForward, Square, Workflow } from "lucide-react";
import { BigValue, Btn, Card, Chip, Dot, FieldValue, Issue, KV, Modal, QBadge, StateBox, Val, type Ask } from "./kit";
import { argRange, capRange, checkInput, rangeText, type Range } from "./logic";
import { fieldText } from "./text";
import { GAS_STATE, HEATER_OWNER, fmtValue, type BlockDef, type Bundle, type FieldDef, type StateData } from "./types";
import { useChk2Mode } from "./mode";
import type { LockFn } from "./Chk2Status";

type Snap = Record<string, unknown> | undefined;
type Ctx = { bundle: Bundle | null; st: StateData | null; snap: Snap; lock: LockFn; onAsk: (a: Ask) => void };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** 블록 정의 찾기 */
const blockOf = (b: Bundle | null, name: string) => b?.snapshot?.blocks?.find((x) => x.name === name);
const fieldOf = (d: BlockDef | undefined, name: string) => d?.fields.find((f) => f.name === name);

/** 카드 틀 — 머리 · 큰 값 · 줄 · (아래쪽) 버튼 */
function DevCard({ title, sub, chip, big, children, actions, note, off }: {
  title: ReactNode; sub?: ReactNode; chip?: ReactNode; big?: ReactNode; children?: ReactNode; actions?: ReactNode; note?: ReactNode; off?: boolean;
}) {
  return (
    <Card className="flex h-full flex-col !p-5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-[#1B1F24]">{title}</h3>
          {sub && <p className="truncate text-[11px] text-[#5B6470]">{sub}</p>}
        </div>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">{off ? <Chip>사용 안 함 · 장비 설정</Chip> : chip}</span>
      </div>
      {big && <div className="mb-2 min-h-[2.25rem]">{big}</div>}
      <div className="min-w-0 space-y-0.5">{children}</div>
      {note && <div className="mt-2 text-[11px] leading-snug text-[#5B6470]">{note}</div>}
      {actions && <div className="mt-auto flex flex-wrap gap-2 pt-3">{actions}</div>}
    </Card>
  );
}

/** 큰 값 한 줄(필드 정의) */
function Big({ f, snap, bundle, off }: { f?: FieldDef; snap: Snap; bundle: Bundle | null; off?: boolean }) {
  if (!f) return null;
  const t = fieldText(f, snap?.[f.column], snap, bundle?.snapshot?.blocks);
  return (
    <div>
      <p className="text-[11px] text-[#5B6470]">{f.label}</p>
      <Val text={off ? "" : t.text} unit={f.unit} size="xl" alt={off ? null : t.alt} />
    </div>
  );
}

/** 값 줄(필드 정의) — bool 은 상태 네모 */
function Row({ f, snap, bundle, off }: { f?: FieldDef; snap: Snap; bundle: Bundle | null; off?: boolean }) {
  if (!f) return null;
  return <FieldValue f={f} v={snap?.[f.column]} dim={off} snap={snap} blocks={bundle?.snapshot?.blocks} />;
}

/** 실제 / 설정 한 줄 */
function PairRow({ k, a, b, unit, off }: { k: string; a: unknown; b: unknown; unit: string; off?: boolean }) {
  const s = (v: unknown) => (num(v) === null ? "—" : String(Number((v as number).toPrecision(6))));
  return (
    <KV k={k}>
      {off ? <Val text="" /> : <><Val text={s(a)} size="sm" /><span className="mx-1 text-[11px] text-[#5B6470]">/ 설정 {s(b)}</span>
        <span className="text-[11px] text-[#5B6470]">{unit}</span></>}
    </KV>
  );
}

/** '상세'에서만 보이는 나머지 필드 */
function DetailRows({ d, snap, bundle, shown }: { d?: BlockDef; snap: Snap; bundle: Bundle | null; shown: string[] }) {
  const { detail } = useChk2Mode();
  if (!detail || !d) return null;
  const rest = d.fields.filter((f) => !shown.includes(f.name));
  if (!rest.length) return null;
  return (
    <div className="mt-1 border-t border-dashed border-[#E3E6EA] pt-1">
      {rest.map((f) => <Row key={f.column} f={f} snap={snap} bundle={bundle} />)}
    </div>
  );
}

/** 웹에서만 되는 조작 — 한 줄 안내 */
const WebOnly = ({ what }: { what: string }) => <p className="text-[11px] text-[#5B6470]">{what}은 웹에서만</p>;

// ───────────── 진공 ─────────────
export function VacuumCard({ bundle, snap, st, onHmi }: Ctx & { onHmi: () => void }) {
  const d = blockOf(bundle, "plc");
  const pumps = [["rotary", "Rotary"], ["turbo", "Turbo"]].filter(([k]) => snap?.[`plc.${k}`] === true).map(([, l]) => l);
  const unknown = snap?.["plc.rotary"] === undefined;
  return (
    <DevCard title="진공" chip={<QBadge link={st?.links?.plc} />}
      big={<Val text={unknown ? "" : pumps.length ? `${pumps.join("·")} 운전` : "펌프 정지"} size="lg" />}
      actions={<Btn onClick={onHmi}><Workflow size={14} /> HMI 에서 조작</Btn>}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {["rotary", "turbo", "mv", "fv", "rv", "vent"].map((n) => {
          const f = fieldOf(d, n);
          return f ? <StateBox key={n} on={snap?.[f.column] as boolean | undefined} label={f.label} title={f.desc} /> : null;
        })}
      </div>
      {snap?.["plc.mv_interlock"] === true && <p className="pt-1"><StateBox on label="MV 인터록" /></p>}
    </DevCard>
  );
}

// ───────────── 가스·압력 ─────────────
export function GasCard({ bundle, snap, st }: Ctx) {
  const d = blockOf(bundle, "mfc");
  const off = st?.links?.mfc?.q === "off";
  return (
    <DevCard title="가스·압력" sub={d?.desc} chip={<QBadge link={st?.links?.mfc} />} off={off}
      big={<Big f={fieldOf(d, "pressure_mtorr")} snap={snap} bundle={bundle} off={off} />}>
      <PairRow k="Ar 유량" a={snap?.["mfc.ar_sccm"]} b={snap?.["mfc.ar_set"]} unit="sccm" off={off} />
      <PairRow k="O₂ 유량" a={snap?.["mfc.o2_sccm"]} b={snap?.["mfc.o2_set"]} unit="sccm" off={off} />
      <Row f={fieldOf(d, "sp_mtorr")} snap={snap} bundle={bundle} off={off} />
      <Row f={fieldOf(d, "sp_active")} snap={snap} bundle={bundle} off={off} />
      <div className="flex flex-wrap gap-x-3 pt-1">
        <StateBox on={snap?.["plc.ar_valve"] as boolean | undefined} label="Ar 차단밸브" />
        <StateBox on={snap?.["plc.o2_valve"] as boolean | undefined} label="O₂ 차단밸브" />
      </div>
      <DetailRows d={d} snap={snap} bundle={bundle} shown={["pressure_mtorr", "ar_sccm", "ar_set", "o2_sccm", "o2_set", "sp_mtorr", "sp_active"]} />
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
    <label className="block text-xs">
      <span className="text-[#5B6470]">{label}</span>
      <span className="mt-0.5 flex items-center gap-1.5">
        <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} inputMode="decimal" aria-label={label}
          placeholder={range ? rangeText(range) : unit}
          className={`h-10 w-36 rounded-[10px] border bg-white px-2 text-sm tabular-nums disabled:bg-[#F5F6F8] disabled:text-[#8A929D] ${
            error && !disabled ? "border-[#B42318]" : "border-[#D9DDE3]"}`} />
        <span className="text-[11px] text-[#5B6470]">{unit}</span>
      </span>
      {error && !disabled && <span className="mt-0.5 block text-[11px] font-semibold text-[#B42318]">{error}</span>}
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
          <p className="mb-2 text-xs font-semibold text-[#1B1F24]">가스(선택)</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={useAr} onChange={(e) => setUseAr(e.target.checked)} /> Ar 사용</label>
            {useAr && <NumInput label="Ar 유량" value={arFlow} onChange={setArFlow} range={arRange} unit="sccm" />}
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={useO2} onChange={(e) => setUseO2(e.target.checked)} /> O₂ 사용</label>
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

export function HeaterCard({ bundle, snap, st, lock, onAsk }: Ctx) {
  const m = useChk2Mode();
  const [modal, setModal] = useState<"on" | "sv" | null>(null);
  const d = blockOf(bundle, "heater");
  const off = st?.links?.heater?.q === "off";
  const run = snap?.["heater.run"] === true;
  const fault = snap?.["heater.fault"] === true;
  const issues = [["fault", "히터 이상"], ["ot", "과온"], ["tc_err", "TC 이상"], ["wd_err", "워치독 이상"]]
    .filter(([k]) => snap?.[`heater.${k}`] === true).map(([, l]) => l);
  const mv = num(snap?.["heater.mv"]), mvMax = num(snap?.["heater.mv_limit"]), amp = num(snap?.["heater.current_est"]);
  const outText = mv === null ? "" : run ? `DAC ${Math.round(mv)}${mvMax ? `/${Math.round(mvMax)}` : ""}${amp !== null ? ` · ≈${amp.toFixed(1)} A` : ""}`
    : `정지 (DAC ${Math.round(mv)})`;
  const casc = fieldOf(d, "casc_state"), mode = fieldOf(d, "ctrl_mode");
  const cs = snap?.["heater.casc_state"], cm = snap?.["heater.ctrl_mode"];
  const ctrlText = typeof cs === "string" && cs && cs !== "idle" ? (casc?.enumLabels?.[cs] ?? cs)
    : typeof cm === "string" && cm ? (mode?.enumLabels?.[cm] ?? cm) : "";
  const gas = st?.heater?.gas ?? null, owner = st?.heater?.owner ?? null;
  const hr = st?.heaterRecipe ?? null;
  const full = !m.webOnly("HEATER_ON");
  return (
    <>
      <DevCard title={d?.label ?? "히터"} sub={d?.desc} off={off}
        chip={<>{issues.length ? <Chip tone="alarm">이상</Chip> : <Chip tone={run ? "dark" : "neutral"}>{run ? "운전" : "정지"}</Chip>}
          {st?.links?.heater?.q && st.links.heater.q !== "ok" && <QBadge link={st.links.heater} />}</>}
        big={<Big f={fieldOf(d, "pv")} snap={snap} bundle={bundle} off={off} />}
        note={<>
          {issues.length > 0 && <Issue level="alarm">{issues.join(" · ")} — 원인을 확인한 뒤 이상 리셋</Issue>}
          {(owner || (gas && gas !== "IDLE")) && (
            <p>{owner && `히터: ${HEATER_OWNER[owner] ?? owner} 소유`}{st?.heater?.handedOver && " · 공정에서 넘겨받음"}
              {gas && gas !== "IDLE" && `${owner ? " · " : ""}${GAS_STATE[gas] ?? gas}`}</p>
          )}
          {hr && <p className="font-semibold text-[#1B1F24]">히터 레시피 {hr.name || ""} · 스텝 {hr.step ?? "-"}/{hr.steps ?? "-"}{hr.held ? " · 일시정지" : ""}</p>}
          {!full && <WebOnly what="히터 켜기·목표·끄기·이상 리셋·가스 해제" />}
        </>}
        actions={<>
          {full && <Btn lock={lock("HEATER_ON")} onClick={() => setModal("on")}><Flame size={14} /> 히터 켜기…</Btn>}
          {full && <Btn lock={lock("HEATER_SV")} onClick={() => setModal("sv")}>목표 바꾸기…</Btn>}
          {full && <Btn lock={lock("HEATER_OFF")} onClick={() => onAsk({ kind: "HEATER_OFF", label: "히터 끄기" })}>끄기</Btn>}
          <Btn kind="danger" lock={lock("HEATER_STOP")}
            onClick={() => onAsk({ kind: "HEATER_STOP", label: "히터 정지", stop: true,
                                   note: "히터 레시피를 멈추고 RUN 을 끕니다. 공정이 히터를 쓰는 중이면 공정도 멈춥니다." })}>
            <Square size={13} /> 히터 정지
          </Btn>
          {fault && full && (
            <Btn kind="danger" lock={lock("HEATER_RESET")}
              onClick={() => onAsk({ kind: "HEATER_RESET", label: "히터 이상 리셋", detail: "(원인을 먼저 확인)", danger: true })}>이상 리셋</Btn>
          )}
          {gas && gas !== "IDLE" && !m.webOnly("HEATER_GAS_RELEASE") && (
            <Btn lock={lock("HEATER_GAS_RELEASE")} onClick={() => onAsk({ kind: "HEATER_GAS_RELEASE", label: "히터 가스 해제" })}>가스 해제</Btn>
          )}
          {hr && !m.webOnly("HEATER_RECIPE_HOLD") && hr.held !== true && (
            <Btn lock={lock("HEATER_RECIPE_HOLD")} onClick={() => onAsk({ kind: "HEATER_RECIPE_HOLD", label: "히터 레시피 일시정지",
              args: { on: true }, note: "지금 온도에서 멈춥니다(레시피 시계도 멈춤)." })}><PauseCircle size={13} /> 레시피 일시정지</Btn>
          )}
          {hr && !m.webOnly("HEATER_RECIPE_HOLD") && hr.held !== false && (
            <Btn lock={lock("HEATER_RECIPE_HOLD")} onClick={() => onAsk({ kind: "HEATER_RECIPE_HOLD", label: "히터 레시피 재개", args: { on: false } })}>
              <Play size={13} /> 레시피 재개</Btn>
          )}
          {hr && !m.webOnly("HEATER_RECIPE_SKIP") && (
            <Btn lock={lock("HEATER_RECIPE_SKIP")} onClick={() => onAsk({ kind: "HEATER_RECIPE_SKIP", label: "히터 레시피 스텝 건너뛰기",
              detail: `스텝 ${hr.step ?? "-"} → 다음` })}><SkipForward size={13} /> 스텝 건너뛰기</Btn>
          )}
          {hr && (
            <Btn kind="danger" lock={lock("HEATER_RECIPE_STOP")} onClick={() => onAsk({ kind: "HEATER_RECIPE_STOP", label: "히터 레시피 정지",
              stop: true, note: "히터 레시피를 멈추고 히터를 끕니다(RUN=0·램프 복구·SV=PV)." })}><Square size={13} /> 레시피 정지</Btn>
          )}
        </>}>
        <Row f={fieldOf(d, "pv2")} snap={snap} bundle={bundle} off={off} />
        <Row f={fieldOf(d, "sv")} snap={snap} bundle={bundle} off={off} />
        {ctrlText && <KV k="제어 방식"><span className="text-xs font-semibold text-[#1B1F24]">{ctrlText}</span></KV>}
        {num(snap?.["heater.bias"]) !== null && <Row f={fieldOf(d, "bias")} snap={snap} bundle={bundle} off={off} />}
        <KV k="출력"><Val text={off ? "" : outText} size="sm" /></KV>
        <div className="flex flex-wrap gap-x-3 pt-1">
          <StateBox on={run} label="운전(RUN)" />
          {snap?.["heater.itl"] !== undefined && <StateBox on={snap?.["heater.itl"] === true} label="인터록" />}
        </div>
        <DetailRows d={d} snap={snap} bundle={bundle} shown={["pv", "pv2", "sv", "casc_state", "bias", "mv", "current_est", "run", "itl", "fault", "ot", "tc_err", "wd_err"]} />
      </DevCard>
      {modal === "on" && <HeaterOnModal bundle={bundle} snap={snap} onClose={() => setModal(null)} onAsk={onAsk} />}
      {modal === "sv" && <HeaterSvModal bundle={bundle} snap={snap} onClose={() => setModal(null)} onAsk={onAsk} />}
    </>
  );
}

// ───────────── 이온 게이지 ─────────────
export function IgCard({ bundle, snap, st, lock, onAsk }: Ctx) {
  const m = useChk2Mode();
  const d = blockOf(bundle, "ig");
  const off = st?.links?.ig?.q === "off";
  const on = snap?.["ig.filament"] === true;
  return (
    <DevCard title={d?.label ?? "이온 게이지"} sub={d?.desc} chip={<QBadge link={st?.links?.ig} />} off={off}
      big={<Big f={fieldOf(d, "ion_torr")} snap={snap} bundle={bundle} off={off} />}
      note={off ? "장비 설정에서 이온 게이지를 쓰지 않습니다" : "공정 중에는 공정이 필라멘트를 다룹니다(공정이 없을 때만 조작)"}
      actions={m.webOnly("IG_FILAMENT") ? <WebOnly what="필라멘트 조작" /> : (
        <Btn lock={off ? "장비 설정에서 꺼짐" : lock("IG_FILAMENT")}
          onClick={() => onAsk({ kind: "IG_FILAMENT", label: "이온 게이지 필라멘트", detail: on ? "→ 끄기" : "→ 켜기", args: { on: !on } })}>
          <Gauge size={14} /> 필라멘트 {on ? "끄기" : "켜기"}
        </Btn>
      )}>
      <Row f={fieldOf(d, "a_torr")} snap={snap} bundle={bundle} off={off} />
      <Row f={fieldOf(d, "b_torr")} snap={snap} bundle={bundle} off={off} />
      <div className="flex flex-wrap gap-x-3 pt-1">
        {["filament", "emission", "degas"].map((n) => {
          const f = fieldOf(d, n);
          return f ? <StateBox key={n} on={off ? null : snap?.[f.column] as boolean | undefined} label={f.label} /> : null;
        })}
      </div>
      <DetailRows d={d} snap={snap} bundle={bundle} shown={["ion_torr", "a_torr", "b_torr", "filament", "emission", "degas"]} />
    </DevCard>
  );
}

// ───────────── 파워(DC Power · RF Power · RF Pulse) ─────────────
export function PowerCard({ name, bundle, snap, st }: Ctx & { name: "dc" | "rf" | "rfp" }) {
  const d = blockOf(bundle, name);
  const off = st?.links?.[name]?.q === "off";
  const bigName = name === "dc" ? "p" : "fwd_w";
  const rows = name === "dc" ? ["v", "i", "set_w"] : name === "rf" ? ["ref_w", "set_w"] : ["ref_w", "set_w", "freq_hz", "duty_pct"];
  const bools = name === "dc" ? ["out"] : name === "rfp" ? ["out_on", "itl_open"] : [];
  const itl = name === "rfp" && snap?.["rfp.itl_open"] === true && !off;
  return (
    <DevCard title={d?.label ?? name} sub={d?.desc} off={off}
      chip={<>{bools[0] && !off && <Chip tone={snap?.[`${name}.${bools[0]}`] === true ? "dark" : "neutral"}>{snap?.[`${name}.${bools[0]}`] === true ? "출력 켜짐" : "출력 꺼짐"}</Chip>}
        <QBadge link={st?.links?.[name]} /></>}
      big={<Big f={fieldOf(d, bigName)} snap={snap} bundle={bundle} off={off} />}
      note={off ? "장비 설정에서 꺼져 있어 값을 읽지 않습니다" : itl ? <Issue level="warn">인터록 열림</Issue> : undefined}>
      {rows.map((n) => <Row key={n} f={fieldOf(d, n)} snap={snap} bundle={bundle} off={off} />)}
      <DetailRows d={d} snap={snap} bundle={bundle} shown={[bigName, ...rows, ...bools]} />
    </DevCard>
  );
}

// ───────────── 셔터·안전 ─────────────
export function ShutterCard({ bundle, snap, st, onHmi }: Ctx & { onHmi: () => void }) {
  const d = blockOf(bundle, "plc");
  const lamps = [["air", "Air"], ["g1", "G1"], ["g2", "G2"], ["atm", "ATM"], ["water", "Water"]];
  const open = ["ms", "s1", "s2"].filter((k) => snap?.[`plc.${k}`] === true).map((k) => fieldOf(d, k)?.label ?? k);
  const unknown = snap?.["plc.ms"] === undefined;
  return (
    <DevCard title="셔터·안전" chip={<QBadge link={st?.links?.plc} />}
      big={<Val text={unknown ? "" : open.length ? `${open.join("·")} 열림` : "셔터 모두 닫힘"} size="lg" />}
      note={snap?.["plc.ion_ot"] === true ? <Issue level="warn">이오나이저 수명 초과</Issue> : undefined}
      actions={<Btn onClick={onHmi}><Workflow size={14} /> HMI 에서 조작</Btn>}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {["ms", "s1", "s2", "door_up", "door_down", "ion_remote_on"].map((n) => {
          const f = fieldOf(d, n);
          return f ? <StateBox key={n} on={snap?.[f.column] as boolean | undefined} label={n === "ion_remote_on" ? "이오나이저" : f.label} /> : null;
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5 text-xs text-[#5B6470]">
        {lamps.map(([k, l]) => (
          <span key={k} className="flex items-center gap-1" title={snap?.[`plc.${k}`] === true ? "감지" : "없음"}>
            <Dot on={snap?.[`plc.${k}`] === true} dim={snap?.[`plc.${k}`] === undefined} />{fieldOf(d, k)?.label ?? l}
          </span>
        ))}
      </div>
    </DevCard>
  );
}

/** 장비 카드 격자 — 4열 같은 너비, 한 줄 높이 같게, 좁으면 2열·1열 */
export function DeviceGrid(p: Ctx & { onHmi: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
      <VacuumCard {...p} />
      <GasCard {...p} />
      <HeaterCard {...p} />
      <IgCard {...p} />
      <PowerCard {...p} name="dc" />
      <PowerCard {...p} name="rf" />
      <PowerCard {...p} name="rfp" />
      <ShutterCard {...p} />
    </div>
  );
}

/** 값 하나 글(그래프 툴팁 등) */
export const valueText = (f: FieldDef | undefined, v: unknown) => (f ? fmtValue(v, f.fmt) : "");
export { BigValue };
