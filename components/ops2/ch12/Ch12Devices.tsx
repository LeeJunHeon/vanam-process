"use client";

// 챔버12 장비 박스(W-20) — 챔버K W-20 박스 틀(Chk2Devices DevCard)을 그대로 가져다 쓴다(틀을 복사하지 않음).
// 틀: 머리(박스 제목 + 칩) → 모델명 줄(상세 보기 — 블록 desc) → 큰 값 또는 요약 한 줄 → 라벨-값 줄 → 상태 두 열 → 안내 →
//   맨 아래 버튼 줄(위에 구분선, 버튼이 없으면 줄 없음). 박스는 격자 줄 높이를 채운다.
// 설정에서 꺼진 장비(블록 품질 off)는 DevCard 가 칩 '사용하지 않음' · 안내 한 줄 · [설정 열기](설정 탭이 있는 웹에서만).
// 챔버 박스: 진공 · 셔터·인터락 · 가스·압력 · Ion Gauge · DC Power · RF Power · DC Pulse · RF Pulse · 히터(CH2) · 두께 모니터 · OES · RGA.
// 이름·라벨·단위는 묶음 16 그대로(챔버 앞말 'CH1 ' 만 뺌, 옛 말은 toTerms12). 레지스터·코일 이름·주소는 상세 보기에서만.
// 조작(히터·두께 영점·두께 보정)은 W-19 칸과 같은 명령·인자·잠금·확인창. [HMI 열기] → HMI 탭(진공·셔터 조작은 계통도에서).
import { useState, type ReactNode } from "react";
import { Play, Square, Workflow } from "lucide-react";
import { FS, Btn, Chip, FieldValue, KV, QBadge, Val, type Ask, type Notice } from "../chk/kit";
import { DevCard } from "../chk/Chk2Devices";
import { StateTag, type StateWords } from "../chk/StateTag";
import { fieldText } from "../chk/text";
import { paramValue } from "../chk/logic";
import { useChk2Mode } from "../chk/mode";
import type { BlockDef, FieldDef } from "../chk/types";
import type { FeedItem, SendResult } from "../chk/useChk2";
import { alert12, plainLabel, words12 } from "./BlockCard";
import { FactorButton } from "./Ch12Thickness";
import { NumField } from "./Ch12Inputs";
import { KINDS, chArgs, checkNum, hasKind, pickKind, type NumRange } from "./logic";
import { asChk, type Ch12Bundle, type Ch12State } from "./types";
import { CARD, blockName, buttonName, commandName, dropPrefix, fieldName, fieldTip, fieldTipOf, placeName, toTerms12 } from "@/lib/ops2/ch12/terms";

type Ch = "ch1" | "ch2";
type Snap = Record<string, unknown> | undefined;
export type LockFn = (kind: string, key?: string) => string | null;
/** 박스 공통 — 탭 이동(onHmi·onConfig)은 그 탭이 있을 때만 넘긴다(없으면 버튼을 그리지 않음) */
export type BoxCtx = {
  bundle: Ch12Bundle | null; st: Ch12State | null; lock: LockFn; onAsk: (a: Ask) => void;
  onHmi?: () => void; onConfig?: () => void;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const blockOf = (b: Ch12Bundle | null, name: string) => b?.snapshot?.blocks?.find((x) => x.name === name);

/** 블록을 화면 이름으로 — 평소 보기: 옛 말 → 용어표 말, 라벨 끝 레지스터 주소 '(D119)' 빼기, 마우스 설명은 help(W-19 BlockCard 와 같은 규칙) */
export function viewDef(def0: BlockDef, detail: boolean, strip: string | null): BlockDef {
  if (detail) return { ...def0, label: dropPrefix(def0.label, strip), fields: def0.fields.map((f) => ({ ...f, label: dropPrefix(f.label, strip) })) };
  return { ...def0, label: dropPrefix(toTerms12(def0.label), strip),
    fields: def0.fields.map((f) => ({ ...f, label: dropPrefix(toTerms12(plainLabel(f.label)), strip), desc: fieldTip(f, false) ?? "" })) };
}

/** 큰 값 한 줄(라벨 12px + 값 28px) — 챔버K Big 과 같은 모양 */
export function Big12({ f, snap, bundle, off, title }: { f?: FieldDef; snap: Snap; bundle: Ch12Bundle | null; off?: boolean; title?: string }) {
  if (!f) return null;
  const t = fieldText(f, snap?.[f.column], snap, bundle?.snapshot?.blocks);
  return (
    <div title={title}>
      <p className={`${FS.small} text-[#5B6470]`}>{f.label}</p>
      <Val text={off ? "" : t.text} unit={f.unit} size="big" alt={off ? null : t.alt} altWarn={t.warn} />
    </div>
  );
}

/** 상태 두 열 — 두 칸에 들어가면 두 칸, 이름이 길어 반 칸에 안 들어가는 상태는 그 줄을 혼자 쓴다(이름을 자르지 않음 — W-20).
 *  DevCard states 칸(늘 두 칸)과 같은 자리(줄 아래)에 그린다 */
export function StateList({ items }: { items: ReactNode[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((x, i) => <div key={i} className="min-w-fit grow basis-[calc(50%-0.5rem)]">{x}</div>)}
    </div>
  );
}

/** 블록 박스(장비 하나) — big = 큰 값 필드, rows = 라벨-값 줄(없으면 bool 아닌 평소 필드 모두), states = 상태(없으면 bool 평소 필드 모두).
 *  chipOn = 머리 칩 '출력 켜짐/꺼짐'을 만드는 bool 필드(상태 목록에서는 뺌). 상세 보기는 나머지 필드(레지스터·내부 값)를 아래에 */
export function BlockBox({ ctx, name, strip, title, big, rows, states, chipOn, chip, summary, children, note, actions, actionsEnd, hide = [] }: {
  ctx: BoxCtx; name: string; strip: string | null; title?: ReactNode; big?: string; rows?: string[]; states?: string[]; chipOn?: string;
  chip?: ReactNode; summary?: ReactNode; children?: ReactNode; note?: ReactNode; actions?: ReactNode; actionsEnd?: ReactNode; hide?: string[];
}) {
  const { detail } = useChk2Mode();
  const { bundle, st, onConfig } = ctx;
  const def0 = blockOf(bundle, name);
  if (!def0) return null;
  const def = viewDef(def0, detail, strip);
  const snap = st?.snapshot;
  const link = st?.links?.[name];
  const off = link?.q === "off";
  const fo = (n: string) => def.fields.find((f) => f.name === n);
  const tipOf = (f: FieldDef) => fieldTip(def0.fields.find((x) => x.column === f.column), detail);
  const dim = (f: FieldDef) => off || (!!f.ownQuality && snap?.[`${f.column}.q`] !== undefined && snap?.[`${f.column}.q`] !== "ok");
  const plain = def.fields.filter((f) => !f.detail && !hide.includes(f.name) && f.name !== big && f.name !== chipOn);
  const rowFs = (rows ? rows.map(fo) : plain.filter((f) => f.type !== "bool")).filter((f): f is FieldDef => !!f);
  const stateFs = (states ? states.map(fo) : plain.filter((f) => f.type === "bool")).filter((f): f is FieldDef => !!f);
  const shown = new Set([big, chipOn, ...rowFs.map((f) => f.name), ...stateFs.map((f) => f.name), ...hide]);
  const rest = detail ? def.fields.filter((f) => !shown.has(f.name)) : [];
  const bigF = big ? fo(big) : undefined;
  const onF = chipOn ? fo(chipOn) : undefined;
  return (
    <DevCard title={title ?? def.label} sub={detail ? def0.desc : undefined} off={off} onConfig={onConfig}
      chip={<>{onF && !off && <Chip tone={snap?.[onF.column] === true ? "dark" : "neutral"}>{snap?.[onF.column] === true ? "출력 켜짐" : "출력 꺼짐"}</Chip>}
        {chip}<QBadge link={link} /></>}
      big={bigF && <Big12 f={bigF} snap={snap} bundle={bundle} off={off} title={tipOf(bigF)} />}
      summary={summary}
      note={note} actions={actions} actionsEnd={actionsEnd}>
      {(rowFs.length > 0 || stateFs.length > 0 || children || rest.length > 0) && <>
        {rowFs.map((f) => <FieldValue key={f.column} f={f} v={snap?.[f.column]} dim={dim(f)} snap={snap} blocks={bundle?.snapshot?.blocks} />)}
        <StateList items={stateFs.map((f) => (
          <StateTag key={f.column} on={dim(f) ? null : snap?.[f.column] === true} label={f.label} words={words12(f.name)} alert={alert12(f.name)} title={tipOf(f)} />
        ))} />
        {children}
        {rest.length > 0 && (
          <div className="mt-1 border-t border-dashed border-[#E3E6EA] pt-1">
            {rest.map((f) => (f.type === "bool"
              ? <StateTag key={f.column} on={dim(f) ? null : snap?.[f.column] === true} label={f.label} words={words12(f.name)} alert={alert12(f.name)} title={tipOf(f)} />
              : <FieldValue key={f.column} f={f} v={snap?.[f.column]} dim={dim(f)} snap={snap} blocks={bundle?.snapshot?.blocks} />))}
          </div>
        )}
      </>}
    </DevCard>
  );
}

/** [HMI 열기] — HMI 탭(계통도에서 진공·셔터·Loadlock 조작) */
export const HmiBtn = ({ onHmi }: { onHmi?: () => void }) =>
  onHmi ? <Btn onClick={onHmi}><Workflow size={14} /> HMI 열기</Btn> : null;

/** PLC 상태 한 칸 — 이름은 묶음(챔버 앞말 뺌), 마우스 설명은 help */
function PlcTag({ bundle, snap, col, label, on, words, alert }: {
  bundle: Ch12Bundle | null; snap: Snap; col: string; label: string; on?: boolean | null; words?: StateWords; alert?: boolean;
}) {
  const { detail } = useChk2Mode();
  const v = on !== undefined ? on : (snap?.[`plc.${col}`] as boolean | undefined);
  return <StateTag on={v} label={label} words={words ?? words12(col)} alert={alert} title={fieldTipOf(bundle, `plc.${col}`, detail)} />;
}
/** 열림/닫힘 표시등 두 개(Gate·Door) → 열림 true · 닫힘 false · 둘 다 꺼짐이면 모름 */
const lampPair = (snap: Snap, open: string, close: string): boolean | undefined =>
  snap?.[`plc.${open}`] === true ? true : snap?.[`plc.${close}`] === true ? false : undefined;
/** 버튼 이름에서 동작 말을 뺀 장비 이름('Gate 열기' → 'Gate') */
const devName = (b: Ch12Bundle | null, target: string, title: string) => buttonName(b, target, title).replace(/\s*(열기|닫기|올림|내림)$/, "");

// ───────────── 진공 ─────────────
/** 진공 — Rotary·Turbo·MV·RV·FV·Vent·Gate·Door(이 챔버 PLC 코일·표시등), [HMI 열기] */
export function VacuumBox12({ ctx, ch }: { ctx: BoxCtx; ch: Ch }) {
  const { bundle, st, onHmi } = ctx;
  const { detail } = useChk2Mode();
  const snap = st?.snapshot;
  const n = ch === "ch1" ? 1 : 2, label = placeName(bundle, ch);
  const nm = (t: string) => buttonName(bundle, t, label);
  const pumps = [`r_p_${n}_sw`, `turbo_${n}_sw`].filter((c) => snap?.[`plc.${c}`] === true).map(nm);
  const unknown = snap?.[`plc.r_p_${n}_sw`] === undefined;
  return (
    <DevCard title={CARD.vacuum} sub={detail ? blockOf(bundle, "plc")?.desc : undefined} chip={<QBadge link={st?.links?.plc} />}
      summary={unknown ? "—" : pumps.length ? `${pumps.join("·")} 운전` : "펌프 정지"}
      states={<>
        <PlcTag bundle={bundle} snap={snap} col={`r_p_${n}_sw`} label={nm(`r_p_${n}_sw`)} words="onoff" />
        <PlcTag bundle={bundle} snap={snap} col={`turbo_${n}_sw`} label={nm(`turbo_${n}_sw`)} words="onoff" />
        <PlcTag bundle={bundle} snap={snap} col={`m_v_${n}_sw`} label={nm(`m_v_${n}_sw`)} words="open" />
        <PlcTag bundle={bundle} snap={snap} col={`r_v_${n}_sw`} label={nm(`r_v_${n}_sw`)} words="open" />
        <PlcTag bundle={bundle} snap={snap} col={`f_v_${n}_sw`} label={nm(`f_v_${n}_sw`)} words="open" />
        <PlcTag bundle={bundle} snap={snap} col={`vent_${n}_lamp`} label={nm(`vent_${n}_sw`)} words="open" />
        <PlcTag bundle={bundle} snap={snap} col={`g_v_${n}_open_lamp`} label={devName(bundle, `g_v_${n}_open_sw`, label)} words="open"
          on={lampPair(snap, `g_v_${n}_open_lamp`, `g_v_${n}_close_lamp`)} />
        <PlcTag bundle={bundle} snap={snap} col={`door_${n}_open_lamp`} label={devName(bundle, `door_${n}_open_sw`, label)} words="open"
          on={lampPair(snap, `door_${n}_open_lamp`, `door_${n}_close_lamp`)} />
      </>}
      actions={<HmiBtn onHmi={onHmi} />} />
  );
}

// ───────────── Loadlock(공통) ─────────────
/** Loadlock — 요약 = 진공 준비 / 대기압 / 진공 준비 전(위 띠와 같은 글), 상태 = Rotary·RV·Vent·4Pin 올림·4Pin 내림·대기압 센서·Gauge A,
 *  인터락(꺼진 것만 이름으로, 모두 켜지면 개수 한 줄), [HMI 열기] */
export function LoadlockBox12({ ctx, plcOk = true }: { ctx: BoxCtx; plcOk?: boolean }) {
  const { bundle, st, onHmi } = ctx;
  const { detail } = useChk2Mode();
  const snap = st?.snapshot;
  const title = placeName(bundle, "loadlock");
  const nm = (t: string) => buttonName(bundle, t, title);
  const fn = (c: string) => fieldName(bundle, `plc.${c}`, title);
  const plc = (c: string) => snap?.[`plc.${c}`] === true;
  const sum = plc("l_vac_ready_sw") ? fn("l_vac_ready_sw") : plc("l_atm") || plc("l_atm_sensor") ? fn("l_atm")
    : plc("l_vac_not_ready") ? fn("l_vac_not_ready") : plcOk ? "—" : "PLC 값 없음";
  const itl = (blockOf(bundle, "plc")?.fields ?? []).filter((f) => /^l_.+_인터락$|^l_gauge_a_interlock$/.test(f.name));
  const offs = itl.filter((f) => snap?.[f.column] === false);
  const known = itl.some((f) => typeof snap?.[f.column] === "boolean");
  return (
    <DevCard title={title} sub={detail ? blockOf(bundle, "plc")?.desc : undefined} chip={<QBadge link={st?.links?.plc} />} summary={sum}
      states={<>
        <PlcTag bundle={bundle} snap={snap} col="l_r_p_sw" label={nm("l_r_p_sw")} words="onoff" />
        <PlcTag bundle={bundle} snap={snap} col="l_r_v_sw" label={nm("l_r_v_sw")} words="open" />
        <PlcTag bundle={bundle} snap={snap} col="l_vent_lamp" label={nm("l_vent_sw")} words="open" />
        <PlcTag bundle={bundle} snap={snap} col="l_atm_sensor" label={fn("l_atm_sensor")} words="detect" />
        <PlcTag bundle={bundle} snap={snap} col="l_pin_up_lamp" label={nm("l_pin_up_sw")} words="onoff" />
        <PlcTag bundle={bundle} snap={snap} col="l_pin_down_lamp" label={nm("l_pin_down_sw")} words="onoff" />
        <PlcTag bundle={bundle} snap={snap} col="l_gauge_a" label={fn("l_gauge_a")} words="onoff" />
      </>}
      actions={<HmiBtn onHmi={onHmi} />}>
      <KV k="인터락" title={itl.map((f) => fieldName(bundle, f.column, title)).join(", ")}>
        <span className={offs.length ? "font-semibold text-[#B54708]" : "text-[#1B1F24]"} data-interlock="loadlock">
          {!known ? "—" : offs.length ? `꺼짐 ${offs.length}개` : `모두 켜짐 · ${itl.length}개`}
        </span>
      </KV>
      {offs.length > 0 && <p className={`${FS.body} leading-snug text-[#B54708]`}>{offs.map((f) => fieldName(bundle, f.column, title)).join(" · ")}</p>}
    </DevCard>
  );
}

// ───────────── 셔터·인터락 ─────────────
/** 셔터·인터락 — Main 셔터 · Gun 셔터(CH2 — 공유 건 셔터) · 로딩 센서 · Chuck 위치 · 인터락(이 챔버 PLC 인터락 비트: 꺼진 것만 이름으로,
 *  모두 켜져 있으면 개수 한 줄 — 상세 보기는 전부), [HMI 열기] */
export function ShutterBox12({ ctx, ch }: { ctx: BoxCtx; ch: Ch }) {
  const { bundle, st, onHmi } = ctx;
  const { detail } = useChk2Mode();
  const snap = st?.snapshot;
  const n = ch === "ch1" ? 1 : 2, label = placeName(bundle, ch);
  const shutters = [`main_shutter_${n}_sw`, ...(n === 2 ? ["shutter_1_sw", "shutter_2_sw", "shutter_3_sw"] : [])]
    .filter((c) => bundle?.plcButtons?.some((x) => x.target === c) || snap?.[`plc.${c}`] !== undefined);
  const nm = (t: string) => buttonName(bundle, t, label);
  const open = shutters.filter((c) => snap?.[`plc.${c}`] === true).map(nm);
  const unknown = snap?.[`plc.main_shutter_${n}_sw`] === undefined;
  const itl = (blockOf(bundle, "plc")?.fields ?? []).filter((f) => new RegExp(`_${n}(_gas)?_인터락$|^gauge_${n}_[ab]_interlock$`).test(f.name));
  const itlName = (f: FieldDef) => fieldName(bundle, f.column, label);
  const offs = itl.filter((f) => snap?.[f.column] === false);
  const known = itl.some((f) => typeof snap?.[f.column] === "boolean");
  const zpos = ["up", "mid", "down"].find((x) => snap?.[`plc.z${n}_${x}_location`] === true);
  const chuck = buttonName(bundle, `z_m_p_${n}_sw`, label);
  return (
    <DevCard title={CARD.shutter} sub={detail ? blockOf(bundle, "plc")?.desc : undefined} chip={<QBadge link={st?.links?.plc} />}
      summary={unknown ? "—" : open.length ? `${open.join("·")} 열림` : "셔터 모두 닫힘"}
      states={<>
        {shutters.map((c) => <PlcTag key={c} bundle={bundle} snap={snap} col={c} label={nm(c)} words="open" />)}
        <PlcTag bundle={bundle} snap={snap} col={`loading_${n}_sensor_lamp`} label={fieldName(bundle, `plc.loading_${n}_sensor_lamp`, label)} words="detect" />
      </>}
      actions={<HmiBtn onHmi={onHmi} />}>
      <KV k={chuck} title={zpos ? fieldTipOf(bundle, `plc.z${n}_${zpos}_location`, detail) : undefined}>
        <span className="text-[#1B1F24]">{zpos ? fieldName(bundle, `plc.z${n}_${zpos}_location`, `${label} ${chuck}`) : snap?.[`plc.z${n}_up_location`] === undefined ? "—" : "위치 모름"}</span>
      </KV>
      <KV k="인터락" title={itl.map(itlName).join(", ")}>
        <span className={offs.length ? "font-semibold text-[#B54708]" : "text-[#1B1F24]"} data-interlock={ch}>
          {!known ? "—" : offs.length ? `꺼짐 ${offs.length}개` : `모두 켜짐 · ${itl.length}개`}
        </span>
      </KV>
      {offs.length > 0 && <p className={`${FS.body} leading-snug text-[#B54708]`}>{offs.map(itlName).join(" · ")}</p>}
      {detail && (
        <div className="mt-1 grid grid-cols-1 gap-y-1 border-t border-dashed border-[#E3E6EA] pt-1">
          {itl.map((f) => <StateTag key={f.column} on={snap?.[f.column] as boolean | undefined} label={itlName(f)} title={fieldTipOf(bundle, f.column, detail)} />)}
        </div>
      )}
    </DevCard>
  );
}

// ───────────── 가스·압력 · Ion Gauge · 파워 · OES · RGA ─────────────
/** 가스·압력 — 큰 값 챔버 압력, 줄 = 이 챔버 가스 라인 유량·MFC 밸브 위치, 상태 = 가스 밸브(PLC) */
export function GasBox12({ ctx, ch }: { ctx: BoxCtx; ch: Ch }) {
  const { bundle, st } = ctx;
  const snap = st?.snapshot;
  const n = ch === "ch1" ? 1 : 2, label = placeName(bundle, ch);
  const gases = bundle?.chambers?.find((c) => c.id === ch)?.gases ?? (n === 1 ? ["ar", "o2"] : ["ar", "o2", "n2"]);
  const valves = [...gases.map((g) => `${g}_${n}_gas_sw`), `main_${n}_gas_sw`].filter((c) => bundle?.plcButtons?.some((x) => x.target === c));
  return (
    <BlockBox ctx={ctx} name={`${ch}.mfc`} strip={label} title={CARD.gas} big="pressure_mtorr" rows={[...gases.map((g) => `${g}_sccm`), "valve_pct"]} states={[]}>
      {valves.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {valves.map((c) => <PlcTag key={c} bundle={bundle} snap={snap} col={c} label={buttonName(bundle, c, label)} words="open" />)}
        </div>
      )}
    </BlockBox>
  );
}

/** Ion Gauge — 큰 값 압력, 줄 = 상태 */
export const IgBox12 = ({ ctx, ch }: { ctx: BoxCtx; ch: Ch }) =>
  <BlockBox ctx={ctx} name={`${ch}.ig`} strip={placeName(ctx.bundle, ch)} big="pressure_torr" />;

/** 파워 — DC Power(CH2, 두 채널) · RF Power(CH2) · DC Pulse · RF Pulse. 머리 칩 = 출력 켜짐/꺼짐, 큰 값 = 출력 파워 */
export function PowerBox12({ ctx, ch, kind }: { ctx: BoxCtx; ch: Ch; kind: "dc" | "rf" | "dcpulse" | "rfpulse" }) {
  const strip = placeName(ctx.bundle, ch);
  if (kind === "dc") return <BlockBox ctx={ctx} name={`${ch}.dc`} strip={strip} big="dc1_p" chipOn="dc1_running" />;
  if (kind === "rf") return <BlockBox ctx={ctx} name={`${ch}.rf`} strip={strip} big="fwd_w" chipOn="running" />;
  if (kind === "dcpulse") return <BlockBox ctx={ctx} name={`${ch}.dcpulse`} strip={strip} big="p_w" chipOn="out_on" />;
  return <BlockBox ctx={ctx} name={`${ch}.rfpulse`} strip={strip} big="fwd_w" chipOn="out_on" />;
}

/** OES · RGA — 측정 프로그램 상태(돌고 있음·측정 중)와 마지막 값 나이 */
export const SpecBox12 = ({ ctx, ch, kind }: { ctx: BoxCtx; ch: Ch; kind: "oes" | "rga" }) =>
  <BlockBox ctx={ctx} name={`${ch}.${kind}`} strip={placeName(ctx.bundle, ch)} />;

// ───────────── 두께 모니터 ─────────────
/** 두께 모니터 — STM-100 두께·증착률·수명, CH2 는 두께 판정(목표·유효·남은)과 [두께 영점]·[두께 보정] */
export function ThicknessBox12({ ctx, ch, feed = [], send, notify }: {
  ctx: BoxCtx; ch: Ch; feed?: FeedItem[];
  send?: (kind: string, args: Record<string, unknown>, label?: string) => Promise<SendResult>;
  notify?: (n: Omit<Notice, "id" | "at">) => void;
}) {
  const { bundle, st, lock, onAsk } = ctx;
  const { detail } = useChk2Mode();
  const label = placeName(bundle, ch);
  const snap = st?.snapshot;
  const thk0 = ch === "ch2" ? blockOf(bundle, "ch2.thk") : undefined;
  const thk = thk0 ? viewDef(thk0, detail, label) : undefined;
  const kZero = pickKind(bundle, KINDS.thkZero);
  const key = (k: string) => `${k}@${ch}`;
  const can = (k: string) => !lock(k, key(k));
  const acts = ch === "ch2" ? <>
    {hasKind(bundle, KINDS.thkZero) && (
      <Btn lock={lock(kZero, key(kZero))} onClick={() => onAsk({ kind: kZero, key: key(kZero), label: "두께 영점", args: chArgs(bundle, kZero, "ch2"),
        note: "두께 모니터 영점을 맞춥니다. 공정 중이면 장비가 받지 않습니다." })}>두께 영점</Btn>
    )}
    {hasKind(bundle, KINDS.thkWindow) && <FactorButton feed={feed} can={can} send={send} notify={notify} />}
  </> : undefined;
  const thkRows = (thk?.fields ?? []).filter((f) => (detail || !f.detail) && f.type !== "bool");
  return (
    <BlockBox ctx={ctx} name={`${ch}.stm100`} strip={label} big="thickness_nm" actions={acts}>
      {thk && thkRows.length > 0 && (
        <div className="mt-2 border-t border-[#E3E6EA] pt-2" data-thk-judge={ch}>
          <p className={`mb-0.5 ${FS.small} font-semibold text-[#5B6470]`}>{blockName(bundle, "ch2.thk", label)}</p>
          {thkRows.map((f) => <FieldValue key={f.column} f={f} v={snap?.[f.column]} dim={st?.links?.["ch2.thk"]?.q === "off"} snap={snap} blocks={bundle?.snapshot?.blocks} />)}
        </div>
      )}
    </BlockBox>
  );
}

// ───────────── 히터(CH2) ─────────────
// v1 히터 패널 램프(ui/heater_panel.py _LAMPS) — 인터락 조건(켜짐 = 정상), 이상(켜짐 = 이상). 이름·마우스 설명은 묶음 필드
const LAMPS: [string, "ok" | "err"][] = [
  ["tc_ok", "ok"], ["da_ok", "ok"], ["water_ok", "ok"], ["vac_ok", "ok"], ["itl", "ok"], ["ot", "err"], ["tc_err", "err"], ["wd_err", "err"],
];
const BADGE: Record<string, "dark" | "warn" | "alarm" | "neutral"> = { RUN: "dark", ITL: "warn", FAULT: "alarm", STOP: "neutral" };
/** 장비 히터 패널 배지(v1 영문 RUN·ITL·FAULT·STOP) → 화면 말 */
const BADGE_WORD: Record<string, string> = { RUN: "운전", ITL: "인터락", FAULT: "이상", STOP: "정지" };
const f1 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(1) : "---");

/** CH2 히터 — 머리 칩 = 장비 히터 패널 배지, 큰 값 = 현재 온도, 줄 = 목표·편차·상태 줄·출력, 상태 = 램프 8개, 안내 = v1 패널 상태 문구,
 *  버튼 줄 = 목표 온도 칸 + 히터 켜기/끄기 · 목표 적용 · 이상 리셋(W-19 칸과 같은 명령·잠금·확인창). 레지스터 칸(41칸)은 상세 보기에서 */
export function HeaterBox12({ ctx, plcOk }: { ctx: BoxCtx; plcOk: boolean }) {
  const { bundle, st, lock, onAsk, onConfig } = ctx;
  const { detail } = useChk2Mode();
  const snap = st?.snapshot;
  const he = (st?.heater ?? {}) as Record<string, unknown>;
  const def0 = blockOf(bundle, "ch2.heater");
  const def = def0 ? viewDef(def0, detail, placeName(bundle, "ch2")) : undefined;
  const link = st?.links?.["ch2.heater"];
  const off = link?.q === "off";
  const run = snap?.["ch2.heater.run"] === true || he.run === true;
  const [t, setT] = useState("");
  const maxP = num(paramValue(asChk(bundle), "CH2_HEATER_MAX_TEMP"));
  const svl = num(he.sv_limit);
  const maxT = maxP !== null && svl !== null && svl > 0 ? Math.min(maxP, svl) : maxP ?? svl;
  const r: NumRange = { min: 0, max: maxT, unit: "°C" };
  const c = checkNum(t, r, true);
  const kOn = pickKind(bundle, KINDS.heaterOnOff), kApply = pickKind(bundle, KINDS.heaterApply), kReset = pickKind(bundle, KINDS.heaterReset);
  const key = (k: string) => `${k}@ch2`;
  const inputBad = !t.trim() ? "목표 온도를 넣으세요" : c.error;
  const p = (he.panel ?? null) as Record<string, unknown> | null;
  const stale = p?.stale === true;
  const badge = String(p?.badge ?? "");
  const tone = stale ? "neutral" : BADGE[badge] ?? "neutral";
  const mv = he.mv, lim = he.mv_limit;
  const ops = hasKind(bundle, KINDS.heaterOnOff) || hasKind(bundle, KINDS.heaterApply);
  const lamps = p ? LAMPS.map(([k, kind]) => {
    const col = `ch2.heater.${k}`;
    const on = he[k] === true;
    const dim = stale || he.ok === null || he.ok === undefined;
    const bad = !dim && (kind === "ok" ? !on : on);
    return (
      <StateTag key={k} on={dim ? null : on} alert={kind === "err"} words={k === "water_ok" ? "detect" : "onoff"} title={fieldTipOf(bundle, col, detail)}
        label={<span className={bad ? "font-semibold text-[#B54708]" : ""}>{fieldName(bundle, col, "CH2")}</span>} />
    );
  }) : undefined;
  return (
    <DevCard title={CARD.heater} sub={detail ? def0?.desc : undefined} off={off} onConfig={onConfig}
      chip={<>{p && <Chip tone={tone}>{BADGE_WORD[badge] ?? toTerms12(badge)}</Chip>}<QBadge link={link} /></>}
      big={(
        <div title={fieldTipOf(bundle, "ch2.heater.pv", detail)} data-heater-panel="">
          <p className={`${FS.small} text-[#5B6470]`}>{fieldName(bundle, "ch2.heater.pv", "CH2")}</p>
          <Val text={off ? "" : f1(he.pv)} unit="°C" size="big" dim={stale} />
        </div>
      )}
      states={lamps}
      note={<>
        {p ? <p className={`${FS.body} font-semibold ${badge === "FAULT" && !stale ? "text-[#B42318]" : badge === "ITL" && !stale ? "text-[#B54708]" : "text-[#1B1F24]"}`}
          data-heater-status="">{toTerms12(String(p.status_text ?? ""))}</p> : <p>장비가 아직 히터 상태를 보내지 않습니다.</p>}
        {ops && !plcOk && <p className="text-[#B54708]">PLC 값이 오래되어 히터 조작이 잠겼습니다.</p>}
      </>}
      actions={ops ? <>
        <NumField label="목표 온도" value={t} onChange={setT} range={r} />
        {run ? (
          <Btn kind="danger" lock={lock(kOn, key(kOn))}
            onClick={() => onAsk({ kind: kOn, key: key(kOn), label: "히터 끄기", stop: true, args: {}, note: "히터 운전을 끕니다." })}>
            <Square size={14} /> 히터 끄기
          </Btn>
        ) : (
          <Btn kind="dangerSolid" lock={lock(kOn, key(kOn)) ?? inputBad}
            onClick={() => c.value !== null && onAsk({ kind: kOn, key: key(kOn), label: "히터 켜기", red: true, args: { target: String(c.value) },
              lines: [`목표 ${c.value} °C 로 운전을 켭니다. 승온 속도는 설정 기본값입니다.`] })}>
            <Play size={14} /> 히터 켜기
          </Btn>
        )}
        <Btn lock={lock(kApply, key(kApply)) ?? inputBad}
          onClick={() => c.value !== null && onAsk({ kind: kApply, key: key(kApply), label: "목표 적용", args: { target: String(c.value) },
            lines: [`목표 ${c.value} °C`] })}>목표 적용</Btn>
        <Btn lock={lock(kReset, key(kReset)) ?? (run ? "히터 운전 중이라 먼저 꺼야 함" : null)}
          onClick={() => onAsk({ kind: kReset, key: key(kReset), label: commandName(bundle, kReset), args: {}, note: "히터 이상 표시(과온·TC 이상·워치독 이상)를 지웁니다." })}>이상 리셋</Btn>
      </> : undefined}>
      {p && <>
        <KV k="목표"><span className="tabular-nums text-[#1B1F24]">{f1(p.sv_show)}<span className={`ml-1 ${FS.small} text-[#5B6470]`}>°C</span></span></KV>
        {typeof p.dev === "number" && <KV k="편차"><span className="tabular-nums text-[#1B1F24]">{p.dev >= 0 ? "+" : ""}{p.dev.toFixed(1)}</span></KV>}
        <KV k="상태"><span className="text-[#1B1F24]">{toTerms12(String(p.state_line ?? ""))}</span></KV>
        <KV k={fieldName(bundle, "ch2.heater.mv", "CH2")} title={fieldTipOf(bundle, "ch2.heater.mv", detail)}>
          <span className="tabular-nums text-[#1B1F24]">{typeof mv === "number" && typeof lim === "number" ? `${mv}/${lim}` : "-/-"}</span>
        </KV>
        {p.owner_text ? <p className={`${FS.small} text-[#5B6470]`}>{toTerms12(String(p.owner_text))}</p> : null}
      </>}
      {detail && def && (
        <div className="mt-1 border-t border-dashed border-[#E3E6EA] pt-1">
          {def.fields.map((f) => (f.type === "bool"
            ? <StateTag key={f.column} on={snap?.[f.column] as boolean | undefined} label={f.label} words={words12(f.name)} alert={alert12(f.name)} />
            : <FieldValue key={f.column} f={f} v={snap?.[f.column]} snap={snap} blocks={bundle?.snapshot?.blocks} />))}
        </div>
      )}
    </DevCard>
  );
}

// ───────────── 챔버 장비 박스 격자 ─────────────
/** 챔버 하나의 장비 박스 — 읽는 순서 진공 → 셔터·인터락 → 가스·압력 → Ion Gauge → DC Power → RF Power → DC Pulse → RF Pulse → 히터(CH2) →
 *  두께 모니터 → OES → RGA(묶음 chambers[].blocks 에 있는 장비만). 같은 줄 박스는 높이를 맞춘다(격자 늘임) */
export function ChamberDevices({ ctx, ch, plcOk, feed, send, notify, grid }: {
  ctx: BoxCtx; ch: Ch; plcOk: boolean; feed?: FeedItem[]; grid: string;
  send?: (kind: string, args: Record<string, unknown>, label?: string) => Promise<SendResult>;
  notify?: (n: Omit<Notice, "id" | "at">) => void;
}) {
  const has = (k: string) => (ctx.bundle?.chambers?.find((c) => c.id === ch)?.blocks ?? []).includes(`${ch}.${k}`);
  return (
    <div className={grid} data-devices={ch}>
      <VacuumBox12 ctx={ctx} ch={ch} />
      <ShutterBox12 ctx={ctx} ch={ch} />
      {has("mfc") && <GasBox12 ctx={ctx} ch={ch} />}
      {has("ig") && <IgBox12 ctx={ctx} ch={ch} />}
      {(["dc", "rf", "dcpulse", "rfpulse"] as const).filter(has).map((k) => <PowerBox12 key={k} ctx={ctx} ch={ch} kind={k} />)}
      {ch === "ch2" && has("heater") && <HeaterBox12 ctx={ctx} plcOk={plcOk} />}
      {has("stm100") && <ThicknessBox12 ctx={ctx} ch={ch} feed={feed} send={send} notify={notify} />}
      {(["oes", "rga"] as const).filter(has).map((k) => <SpecBox12 key={k} ctx={ctx} ch={ch} kind={k} />)}
    </div>
  );
}
