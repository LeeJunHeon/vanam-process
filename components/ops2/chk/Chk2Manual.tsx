"use client";

// 챔버K v2 수동 조작 탭(W-14 — 묶음 18, 장비 5-20 ③). 웹·노트북 화면이 같이 쓴다.
// 수동 조작 = 블록을 하나씩 실행하는 공정: 버튼 하나가 블록 하나(MANUAL_BLOCK {block}). 공정이 없을 때 첫 블록이 수동 조작을 시작하고
// (시작 조건은 공정 시작과 같음), 블록이 끝나면 수동 대기 — 감시·안전 규칙·정지 순서는 공정과 같다. 끝내기(MANUAL_END)는 정지 순서로 모두 끈다.
// 장비 칸: 가스(Ar·O₂ 유량·영점·켜기·끄기) · 압력(설정점·값 또는 장비 값·적용, MFC 밸브 열기·닫기·정지) · 셔터 · DC · RF · RF Pulse.
// 값 검사는 블록 편집기와 같은 검사(lib/ops2/chk/blocks.checkBlocks) — 틀리면 버튼에 이유. 파워를 켤 때 확인창에 챔버 압력·유량·밸브 위치·셔터.
// 공정 중에는 잠근다("공정 중에는 '공정 중 값 바꾸기'를 사용하세요"). PLC 버튼은 HMI 탭 그대로.
// 옛 장비(묶음 manual 없음)에서는 이 탭을 보이지 않는다(Chk2Page).
// W-15: 머리 설명은 운전자 말, 맨 위 '조작 조건' 한 줄(메인 밸브·MV 인터록·냉각수·Air·ATM), 압력은 '장비에 저장된 값 사용'·'직접 입력'
//   고르기, 칸마다 지금 값(DC 파워·전압·전류, RF 순방향·반사), 버튼은 꺼져 있으면 "켜기"·켜져 있으면 "목표 적용", 쓰지 않는 장비는 한 줄,
//   히터·이온 게이지는 운전 탭과 같은 카드(HeaterCard·IgCard). 보내는 명령·값 검사·확인창 내용은 그대로.
import { useMemo, useState, type ReactNode } from "react";
import { Gauge, Hand, Power, Square, Wind, Workflow } from "lucide-react";
import { checkBlocks } from "@/lib/ops2/chk/blocks";
import { checkEnvOf } from "@/lib/ops2/chk/recipe";
import { FS, Btn, Card, Chip, Empty, Issue, KV, Tile, Val, type Ask } from "./kit";
import { StateBadge, StateTag, type StateWords } from "./StateTag";
import { HeaterCard, IgCard } from "./Chk2Devices";
import { paramValue } from "./logic";
import { blockName } from "./text";
import { kindOf } from "./runview";
import { stateLabel, type Bundle, type StateData } from "./types";
import type { LockFn } from "./Chk2Status";

type Block = { type: string; params: Record<string, unknown> };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fmt = (v: number | null, d = 1) => (v === null ? "—" : String(Number(v.toFixed(d))));

/** 입력 글 → 숫자(빈 칸 null, 숫자가 아니면 NaN) */
const parse = (t: string): number | null => (t.trim() === "" ? null : Number(t));

function Field({ label, unit, value, onChange, hint, width = "w-24" }: {
  label: string; unit?: string; value: string; onChange: (v: string) => void; hint?: string; width?: string;
}) {
  return (
    <label className={`flex items-center gap-1.5 ${FS.body}`} title={hint}>
      {label && <span className="text-[#5B6470]">{label}</span>}
      <input aria-label={label || unit} value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal"
        className={`h-9 ${width} rounded-[8px] border border-[#D9DDE3] bg-white px-2 text-right tabular-nums ${FS.body}`} />
      {unit && <span className={`${FS.small} text-[#5B6470]`}>{unit}</span>}
    </label>
  );
}

/** 장비 칸 — 쓰지 않는 장비(off)는 이름과 이유 한 줄만, 연결이 끊긴 장비(warn)는 안내 한 줄을 붙인다 */
function Panel({ title, icon, children, off, warn }: { title: string; icon: ReactNode; children: ReactNode; off?: string | null; warn?: string | null }) {
  if (off) {
    return (
      <Tile className="bg-[#F5F6F8] p-3">
        <p className={`flex flex-wrap items-center gap-1.5 ${FS.body} text-[#5B6470]`}>
          {icon}<b className="text-[#5B6470]">{title}</b><span>· {off}</span>
        </p>
      </Tile>
    );
  }
  return (
    <Tile className="p-3">
      <p className={`mb-2 flex items-center gap-1.5 font-bold ${FS.body} text-[#1B1F24]`}>{icon}{title}</p>
      {warn && <div className="mb-2"><Issue level="warn">{warn}</Issue></div>}
      {children}
    </Tile>
  );
}

/** 조작 조건 한 칸 — 이름 + 배지 */
function Cond({ label, on, words, alert }: { label: string; on: boolean | undefined; words?: StateWords; alert?: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 ${FS.body} text-[#1B1F24]`}>{label}<StateBadge on={on} words={words} alert={alert} /></span>;
}

export default function Chk2Manual({ bundle, st, lock, onAsk, onHmi }: {
  bundle: Bundle | null; st: StateData | null; lock: LockFn; onAsk: (a: Ask) => void; onHmi?: () => void;
}) {
  const snap = st?.snapshot;
  const env = useMemo(() => checkEnvOf(bundle)?.blocks ?? null, [bundle]);
  const types = new Set(bundle?.manual?.blockTypes ?? []);
  const man = st?.run?.manual ?? null;
  const kind = kindOf(bundle, st);
  const active = kind === "active" || kind === "stopping";
  const waiting = !!man?.waiting;
  const rfpOn = paramValue(bundle, "RFPULSE_ENABLED") !== false;

  // 지금 받을 수 있는가 — 장비 쪽과 같은 규칙(공정 중·블록 실행 중·정지 순서 중이면 받지 않음)
  const stateWhy = !st ? "장비 상태를 기다리는 중"
    : st.stopping || kind === "stopping" ? "정지 순서 중이라 끝난 뒤에 할 수 있음"
    : active && !man ? "공정 중에는 '공정 중 값 바꾸기'를 사용하세요"
    : man && !waiting ? "앞 조작이 진행 중이라 끝난 뒤에 할 수 있음"
    : st.recipe && !man ? "장비에 레시피가 적재돼 있어 해제한 뒤 할 수 있음" : null;

  const [ar, setAr] = useState("20");
  const [o2, setO2] = useState("");
  const [zero, setZero] = useState(true);
  const [sp, setSp] = useState(1);
  const [spVal, setSpVal] = useState("");
  const [spSet, setSpSet] = useState(false);   // false = 장비에 저장된 값 사용, true = 직접 입력
  const [spWait, setSpWait] = useState(true);
  const [dc, setDc] = useState("");
  const [rf, setRf] = useState("");
  const [rfp, setRfp] = useState("");
  const [freq, setFreq] = useState("");
  const [duty, setDuty] = useState("");

  /** 블록 하나의 검사 — 오류 첫 줄 또는 null(검사 환경이 없으면 장비가 검사) */
  const errOf = (b: Block): string | null => {
    if (!types.has(b.type)) return "이 장비는 수동 조작에서 이 조작을 받지 않음";
    if (Object.values(b.params).some((v) => typeof v === "number" && Number.isNaN(v))) return "숫자를 넣으세요";
    const has = (k: string) => typeof b.params[k] === "number";
    if (b.type === "power_on" && !has("dc_power") && !has("rf_power") && !has("rfp_power")) return "목표 파워(W)를 넣으세요";
    if (b.type === "gas_intro" && !has("ar_flow") && !has("o2_flow")) return "Ar 또는 O₂ 유량을 넣으세요";
    if (!env) return null;
    const r = checkBlocks([b], env);
    return r.errors[0] ?? null;
  };
  const lockOf = (b: Block) => errOf(b) ?? stateWhy ?? lock("MANUAL_BLOCK");

  const shut = (k: string) => snap?.[`plc.${k}`] === true;
  const powerLines = () => [
    `챔버 압력 ${fmt(num(snap?.["mfc.pressure_mtorr"]), 2)} mTorr · Ar ${fmt(num(snap?.["mfc.ar_sccm"]), 2)} sccm · O₂ ${fmt(num(snap?.["mfc.o2_sccm"]), 2)} sccm`,
    `밸브 위치 ${fmt(num(snap?.["mfc.valve_pct"]))} % · 셔터 Gun 1 ${shut("s1") ? "열림" : "닫힘"} · Gun 2 ${shut("s2") ? "열림" : "닫힘"} · Main ${shut("ms") ? "열림" : "닫힘"}`,
  ];
  const ask = (b: Block, label: string, opts: { lines?: string[]; red?: boolean; note?: string } = {}) => onAsk({
    kind: "MANUAL_BLOCK", label: `수동 조작: ${label}`, args: { block: b }, key: `MANUAL_BLOCK:${b.type}`,
    red: opts.red, lines: [`${blockName(bundle, b.type)} 블록 하나를 실행합니다`, ...(opts.lines ?? [])],
    note: opts.note ?? (man ? "블록이 끝나면 수동 대기로 돌아옵니다." : "첫 블록이라 수동 조작을 시작합니다(시작 조건은 공정 시작과 같음). 끝낼 때는 '수동 조작 끝내기'를 누르세요."),
  });
  const btn = (b: Block, label: string, children: ReactNode, k: "neutral" | "primary" | "danger" = "neutral",
               opts?: Parameters<typeof ask>[2]) => (
    <Btn kind={k} lock={lockOf(b)} onClick={() => ask(b, label, opts)}>{children}</Btn>
  );

  const gasOn: Block = { type: "gas_intro", params: { ar: parse(ar) !== null, ar_flow: parse(ar), o2: parse(o2) !== null, o2_flow: parse(o2), zero } };
  const gasOff: Block = { type: "gas_off", params: { ar: true, o2: true, close_valves: true } };
  const press: Block = { type: "pressure", params: { sp, value: spSet ? parse(spVal) : null, set: spSet, select: true, wait: spWait } };
  const valve = (action: string): Block => ({ type: "valve", params: { action } });
  const shutter = (action: string, t: string): Block => ({ type: "shutter", params: { action, targets: [t] } });
  const pOn = (p: Record<string, unknown>): Block => ({ type: "power_on", params: { ...p, wait: true } });
  const pOff = (p: Record<string, unknown>): Block => ({ type: "power_off", params: p });
  const offWhy = (dev: string) => (st?.links?.[dev]?.q === "off" ? "사용하지 않음(장비 설정에서 꺼짐)" : null);
  const failWhy = (dev: string) => (st?.links?.[dev]?.q === "fail" ? "장비와 연결이 끊김. 다시 연결되면 조작할 수 있음" : null);
  const b = (k: string) => (snap?.[k] === undefined ? undefined : snap?.[k] === true);
  // 출력이 켜져 있나 — 버튼 이름("켜기" / "목표 적용")만 정한다. RF 는 묶음 19 rf.out_on, 옛 묶음은 순방향 5 W 이상
  const rfOn = snap?.["rf.out_on"] !== undefined ? snap?.["rf.out_on"] === true : (num(snap?.["rf.fwd_w"]) ?? 0) >= 5;
  const onWord = (on: boolean) => (on ? "목표 적용" : "켜기");
  const devSp = num(snap?.[`mfc.sp${sp}_dev_mtorr`]);
  const ctx = { bundle, st, snap, lock, onAsk };

  if (!bundle?.manual) return <Empty>이 장비 프로그램은 수동 조작을 지원하지 않습니다(묶음 18 이전)</Empty>;
  const endLock = !man ? "수동 조작 중이 아님" : st?.stopping ? "정지 순서 중" : lock("MANUAL_END");
  return (
    <div className="space-y-3">
      <Card title={<><Hand size={15} /> 수동 조작</>}
        right={<Btn kind="dangerSolid" size="lg" lock={endLock}
          onClick={() => onAsk({ kind: "MANUAL_END", label: "수동 조작 끝내기(모두 끄기)", stop: true,
            note: "정지 순서(STOP 과 같음)로 가스·파워·셔터를 모두 끕니다. 히터·필라멘트는 그대로 둡니다." })}>
          <Square size={14} /> 수동 조작 끝내기(모두 끄기)
        </Btn>}>
        <div className={`flex flex-wrap items-center gap-2 ${FS.body}`}>
          {man ? (
            <>
              <Chip tone="dark">{man.label || bundle.manual.label || "수동 조작 중"}</Chip>
              <b className="text-[#1B1F24]">{waiting ? "다음 조작을 기다림" : `${st?.run?.current ?? "-"}번째 조작 진행 중 · ${stateLabel(bundle, st?.procState)}`}</b>
              <span className="text-[#5B6470]">· 한 조작 {man.executed?.length ?? 0}개{man.source ? ` · 시작 ${man.source === "local" ? "노트북" : "웹"}` : ""}</span>
            </>
          ) : <span className="text-[#5B6470]">수동 조작 중이 아님. 아래에서 조작 하나를 보내면 수동 조작이 시작됩니다</span>}
        </div>
        {man && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`${FS.small} text-[#5B6470]`}>켜져 있는 출력</span>
            {(man.outputs ?? []).length ? (man.outputs ?? []).map((o) => (
              <Chip key={o.key}>{o.label}{typeof o.value === "number" ? ` ${Number(o.value.toPrecision(5))}${o.unit ? ` ${o.unit}` : ""}` : ""}</Chip>
            )) : <Chip>없음</Chip>}
          </div>
        )}
        {stateWhy && active && !man && <div className="mt-2"><Issue level="warn">{stateWhy}</Issue></div>}
        <p className={`mt-2 ${FS.body} text-[#5B6470]`}>
          가스·압력·셔터·파워를 하나씩 켜고 끕니다. 예) Ar 20 sccm 가스 켜기 → 압력 적용 → DC 100 W 켜기 → Gun 1 셔터 열기.
          누를 때마다 그 조작 하나만 하고 다음 조작을 기다립니다. 공정과 같은 감시·안전 규칙이 적용되고, 끝낼 때는 ‘수동 조작 끝내기’로 모두 끕니다.
        </p>
        <div className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#E3E6EA] pt-2 ${FS.body}`}>
          <b className="text-[#5B6470]">조작 조건</b>
          <Cond label="메인 밸브" on={b("plc.mv")} words="open" />
          <Cond label="MV 인터록" on={b("plc.mv_interlock")} />
          <Cond label="냉각수" on={b("plc.water")} words="detect" />
          <Cond label="Air" on={b("plc.air")} words="detect" />
          <Cond label="ATM" on={b("plc.atm")} words="detect" />
          {onHmi && <span className="ml-auto"><Btn size="sm" onClick={onHmi}><Workflow size={13} /> HMI 탭(밸브·펌프·PLC 버튼)</Btn></span>}
        </div>
      </Card>

      {/* W-16 배치 — 세로 열에 위에서부터 쌓는다(빈칸 없음): 1열 가스 → DC Power · 2열 압력 → RF Power · 3열 셔터 → RF Pulse.
          좁으면 1·2열을 나란히 두고 3열(셔터·RF Pulse)은 그 아래 두 칸, 더 좁으면 한 줄(같은 순서) */}
      <div className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-3">
        <Panel title="가스" icon={<Wind size={14} />} off={offWhy("mfc")} warn={failWhy("mfc")}>
          <div className="grid grid-cols-2 gap-x-3">
            <KV k="Ar 유량"><Val text={fmt(num(snap?.["mfc.ar_sccm"]), 2)} unit="sccm" /></KV>
            <KV k="O₂ 유량"><Val text={fmt(num(snap?.["mfc.o2_sccm"]), 2)} unit="sccm" /></KV>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3">
            <StateTag on={b("plc.ar_valve")} label="Ar 차단밸브" words="open" />
            <StateTag on={b("plc.o2_valve")} label="O₂ 차단밸브" words="open" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Field label="Ar" unit="sccm" value={ar} onChange={setAr} hint="비우면 Ar 을 쓰지 않음" />
            <Field label="O₂" unit="sccm" value={o2} onChange={setO2} hint="비우면 O₂ 를 쓰지 않음" />
            <label className={`flex items-center gap-1 ${FS.body}`} title="MFC·압력 영점을 먼저 한다">
              <input type="checkbox" checked={zero} onChange={(e) => setZero(e.target.checked)} /> 영점
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {btn(gasOn, "가스 켜기", <>가스 켜기</>, "primary")}
            {btn(gasOff, "가스 끄기", <>가스 끄기</>)}
          </div>
        </Panel>
        <Panel title="DC Power" icon={<Power size={14} />} off={offWhy("dc")} warn={failWhy("dc")}>
          <div>
            <KV k="파워"><Val text={fmt(num(snap?.["dc.p"]))} unit="W" /></KV>
            <KV k="전압"><Val text={fmt(num(snap?.["dc.v"]))} unit="V" /></KV>
            <KV k="전류"><Val text={fmt(num(snap?.["dc.i"]), 3)} unit="A" /></KV>
          </div>
          <div className="mt-2"><StateTag on={b("dc.out")} label="출력" /></div>
          <div className="mt-2"><Field label="목표" unit="W" value={dc} onChange={setDc} /></div>
          <div className="mt-2 flex flex-wrap gap-2">
            {btn(pOn({ dc_power: parse(dc) }), `DC ${dc || "?"} W 켜기`, <>{onWord(snap?.["dc.out"] === true)}</>, "danger", { red: true, lines: powerLines() })}
            {btn(pOff({ dc: true }), "DC 끄기", <>끄기</>)}
          </div>
        </Panel>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
        <Panel title="압력" icon={<Gauge size={14} />} off={offWhy("mfc")} warn={failWhy("mfc")}>
          <div className="grid grid-cols-2 gap-x-3">
            <KV k="챔버 압력"><Val text={fmt(num(snap?.["mfc.pressure_mtorr"]), 2)} unit="mTorr" /></KV>
            <KV k="밸브 위치"><Val text={fmt(num(snap?.["mfc.valve_pct"]))} unit="%" /></KV>
          </div>
          <div className={`mt-2 space-y-1.5 ${FS.body}`}>
            <label className="flex items-center gap-1.5">
              <span className="text-[#5B6470]">설정점</span>
              <select value={sp} onChange={(e) => setSp(Number(e.target.value))} aria-label="압력 설정점"
                className={`h-9 rounded-[8px] border border-[#D9DDE3] bg-white px-2 ${FS.body}`}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>SP{n}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="chk-manual-sp" checked={!spSet} onChange={() => setSpSet(false)} />
              장비에 저장된 값 사용{devSp !== null ? `(지금 ${fmt(devSp, 2)} mTorr)` : ""}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="chk-manual-sp" checked={spSet} onChange={() => setSpSet(true)} /> 직접 입력
              </label>
              {spSet && <Field label="" unit="mTorr" value={spVal} onChange={setSpVal} />}
            </div>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={spWait} onChange={(e) => setSpWait(e.target.checked)} /> 압력이 들어올 때까지 기다림
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {btn(press, `압력 SP${sp} 적용`, <>압력 적용</>, "primary")}
            {btn(valve("open"), "MFC 밸브 열기", <>밸브 열기</>)}
            {btn(valve("close"), "MFC 밸브 닫기", <>밸브 닫기</>)}
            {btn(valve("hold"), "MFC 밸브 정지", <>지금 위치로 유지</>)}
          </div>
        </Panel>
        <Panel title="RF Power" icon={<Power size={14} />} off={offWhy("rf")} warn={failWhy("rf")}>
          <div className="grid grid-cols-2 gap-x-3">
            <KV k="순방향"><Val text={fmt(num(snap?.["rf.fwd_w"]))} unit="W" /></KV>
            <KV k="반사"><Val text={fmt(num(snap?.["rf.ref_w"]))} unit="W" /></KV>
          </div>
          <div className="mt-2"><StateTag on={snap?.["rf.out_on"] === undefined && snap?.["rf.fwd_w"] === undefined ? undefined : rfOn} label="출력" /></div>
          <div className="mt-2"><Field label="목표" unit="W" value={rf} onChange={setRf} /></div>
          <div className="mt-2 flex flex-wrap gap-2">
            {btn(pOn({ rf_power: parse(rf) }), `RF ${rf || "?"} W 켜기`, <>{onWord(rfOn)}</>, "danger", { red: true, lines: powerLines() })}
            {btn(pOff({ rf: true }), "RF 끄기(천천히 내린 뒤)", <>끄기</>)}
          </div>
        </Panel>
        </div>
        <div className="grid min-w-0 items-start gap-3 lg:col-span-2 lg:grid-cols-2 2xl:col-span-1 2xl:flex 2xl:flex-col">
        <Panel title="셔터" icon={<Square size={14} />} off={offWhy("plc")} warn={failWhy("plc")}>
          {([["s1", "g1", "Gun 1"], ["s2", "g2", "Gun 2"], ["ms", "ms", "Main"]] as const).map(([col, t, name]) => (
            <div key={t} className="flex items-center justify-between gap-3 py-1">
              <span className="min-w-0 flex-1"><StateTag on={snap?.[`plc.${col}`] as boolean | undefined} label={`${name} 셔터`} words="open" /></span>
              <span className="flex gap-1.5">
                {btn(shutter("open", t), `${name} 셔터 열기`, <>열기</>)}
                {btn(shutter("close", t), `${name} 셔터 닫기`, <>닫기</>)}
              </span>
            </div>
          ))}
        </Panel>
        <Panel title="RF Pulse" icon={<Power size={14} />} off={!rfpOn ? "사용하지 않음(장비 설정에서 꺼짐)" : offWhy("rfp")} warn={failWhy("rfp")}>
          <div className="grid grid-cols-2 gap-x-3">
            <KV k="순방향"><Val text={fmt(num(snap?.["rfp.fwd_w"]), 0)} unit="W" /></KV>
            <KV k="반사"><Val text={fmt(num(snap?.["rfp.ref_w"]), 0)} unit="W" /></KV>
          </div>
          <div className="mt-2"><StateTag on={b("rfp.out_on")} label="출력" /></div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Field label="목표" unit="W" value={rfp} onChange={setRfp} />
            <Field label="주파수" unit="kHz" value={freq} onChange={setFreq} hint="비우면 장비에 있는 값 그대로" width="w-20" />
            <Field label="듀티" unit="%" value={duty} onChange={setDuty} hint="비우면 장비에 있는 값 그대로" width="w-16" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {btn(pOn({ rfp_power: parse(rfp), rfp_freq_khz: parse(freq), rfp_duty: parse(duty) }), `RF Pulse ${rfp || "?"} W 켜기`, <>{onWord(snap?.["rfp.out_on"] === true)}</>, "danger", { red: true, lines: powerLines() })}
            {btn(pOff({ rfpulse: true }), "RF Pulse 끄기", <>끄기</>)}
          </div>
        </Panel>
        </div>
      </div>
      {/* 히터·이온 게이지 — 운전 탭 장비 카드와 같은 부품(조작·확인창 그대로) */}
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <HeaterCard {...ctx} />
        <IgCard {...ctx} />
      </div>
    </div>
  );
}
