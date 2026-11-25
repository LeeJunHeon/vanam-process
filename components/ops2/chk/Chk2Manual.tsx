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
// W-22: 장비 규칙과 같은 잠금 — 가스가 켜져 있으면 [가스 켜기] 잠금(유량은 [유량 바꾸기] = 공정 중 값 바꾸기 Ar 유량), 이미 그 상태인
//   셔터 버튼 잠금, 조작이 진행 중이어도 [끄기](파워)·셔터 [닫기]는 바로(장비가 진행 중 조작을 '중단(끼어든 조작)'으로 끝낸다),
//   켜져 있는 파워는 [목표 적용](목표만 바꿈), RF 목표 칸 옆 '운전 상한 N W'(RF_OPERATING_MAX_W). 묶음 22 장비는 예전 그대로.
import { useMemo, useState, type ReactNode } from "react";
import { Hand, Square, Workflow } from "lucide-react";
import { checkBlocks } from "@/lib/ops2/chk/blocks";
import { checkEnvOf } from "@/lib/ops2/chk/recipe";
import { FS, Btn, Card, Chip, Empty, Issue, KV, Val, type Ask } from "./kit";
import { StateBadge, StateTag, type StateWords } from "./StateTag";
import { DevCard, HeaterCard, IgCard, MountedRows } from "./Chk2Devices";
import type { DevKey } from "./Chk2SettingsDrawer";
import { srcWord } from "@/lib/ops2/chk/plain";
import { fieldName, stepName } from "@/lib/ops2/chk/terms";
import { paramValue } from "./logic";
import { kindOf } from "./runview";
import { stateLabel, type Bundle, type StateData } from "./types";
import type { LockFn } from "./Chk2Status";
import { rfChip, rfCommanded } from "@/lib/ops2/chk/rf";

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

/** 조작 조건 한 칸 — 이름 + 배지 */
function Cond({ label, on, words, alert }: { label: string; on: boolean | undefined; words?: StateWords; alert?: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 ${FS.body} text-[#1B1F24]`}>{label}<StateBadge on={on} words={words} alert={alert} /></span>;
}

export default function Chk2Manual({ bundle, st, lock, onAsk, onHmi, onSettings, onConfig, nowMs }: {
  bundle: Bundle | null; st: StateData | null; lock: LockFn; onAsk: (a: Ask) => void; onHmi?: () => void;
  nowMs?: number;                                                 // 경과 시간(웹 시계)
  onSettings?: (dev: DevKey) => void; onConfig?: () => void;      // W-21 [⚙ 설정] 서랍 · 꺼진 장비 [설정 열기]
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
  // 끼어들 수 있는 조작(W-22 — 장비 manual_block 과 같은 규칙): 파워 끄기·셔터 닫기는 앞 조작이 진행 중이어도 받는다
  const interrupts = (b: Block) => b.type === "power_off" || (b.type === "shutter" && String(b.params.action ?? "").startsWith("close"));
  const busyWhy = man && !waiting ? stateWhy : null;
  const lockOf = (b: Block) => errOf(b) ?? sameWhy(b) ?? (interrupts(b) && busyWhy && !st?.stopping ? null : stateWhy) ?? lock("MANUAL_BLOCK");

  const shut = (k: string) => snap?.[`plc.${k}`] === true;
  const newDev = snap?.["mfc.ar_on"] !== undefined || snap?.["rf.cmd_on"] !== undefined;   // 묶음 23 장비(같은 상태 거부 규칙이 있음)
  // 가스가 켜져 있나 — 장비 GAS_ALREADY_ON 과 같은 판정(유량 켜짐 또는 Ar·O₂ 밸브 열림)
  const gasNowOn = snap?.["mfc.ar_on"] === true || snap?.["mfc.o2_on"] === true || snap?.["plc.ar_valve"] === true || snap?.["plc.o2_valve"] === true;
  const reasonHelp = (code: string, dflt: string) => bundle?.reasons?.find((r) => r.code === code)?.help || dflt;
  /** 장비가 같은 상태라 받지 않는 조작(W-22) — 가스 켜짐에서 가스 켜기, 이미 그 상태인 셔터 */
  const sameWhy = (b: Block): string | null => {
    if (!newDev && b.type !== "shutter") return null;
    if (b.type === "gas_intro" && gasNowOn) return reasonHelp("GAS_ALREADY_ON", "가스가 켜져 있습니다. 유량은 값 바꾸기로 바꾸세요.").replace(/\.$/, "");
    if (b.type === "shutter" && newDev) {
      const t = Array.isArray(b.params.targets) ? String(b.params.targets[0]) : "";
      const col = t === "g1" ? "plc.s1" : t === "g2" ? "plc.s2" : t === "ms" ? "plc.ms" : null;
      const want = String(b.params.action ?? "").startsWith("open");
      if (col && typeof snap?.[col] === "boolean" && snap?.[col] === want) return want ? "이미 열려 있음" : "이미 닫혀 있음";
    }
    return null;
  };
  const nm = (col: string) => fieldName(bundle, col);
  const oc = (k: string) => (shut(k) ? "열림" : "닫힘");
  const powerLines = () => [
    `챔버 압력 ${fmt(num(snap?.["mfc.pressure_mtorr"]), 2)} mTorr · Ar ${fmt(num(snap?.["mfc.ar_sccm"]), 2)} sccm · O₂ ${fmt(num(snap?.["mfc.o2_sccm"]), 2)} sccm`,
    `${nm("plc.ms")} ${oc("ms")} · ${nm("plc.s1")} ${oc("s1")} · ${nm("plc.s2")} ${oc("s2")} · ${nm("mfc.valve_pct")} ${fmt(num(snap?.["mfc.valve_pct"]))} %`,
  ];
  /** 확인창 첫 줄 — 무엇이 움직이는지 한 줄(예: "Ar 20 sccm 가스를 켭니다.") */
  const say = (b: Block): string => {
    const p = b.params, v = (x: unknown) => (typeof x === "number" ? String(x) : "");
    if (b.type === "gas_intro") return `${[p.ar && `Ar ${v(p.ar_flow)} sccm`, p.o2 && `O₂ ${v(p.o2_flow)} sccm`].filter(Boolean).join(" · ")} 가스를 켭니다.`;
    if (b.type === "gas_off") return "Ar·O₂ 가스를 끄고 밸브를 닫습니다.";
    if (b.type === "pressure") return p.set ? `SP${v(p.sp)} 를 ${v(p.value)} mTorr 로 맞춥니다.` : `장비에 저장된 SP${v(p.sp)} 압력으로 맞춥니다.`;
    if (b.type === "valve") return p.action === "open" ? "MFC 밸브를 엽니다." : p.action === "close" ? "MFC 밸브를 닫습니다." : "MFC 밸브를 지금 위치로 둡니다.";
    if (b.type === "shutter") {
      const t = Array.isArray(p.targets) ? String(p.targets[0]) : "";
      return `${nm(`plc.${t === "g1" ? "s1" : t === "g2" ? "s2" : "ms"}`)}를 ${p.action === "open" ? "엽니다" : "닫습니다"}.`;
    }
    if (b.type === "power_on") {
      const [n, w] = p.dc_power != null ? ["DC", p.dc_power] : p.rf_power != null ? ["RF", p.rf_power] : ["RF Pulse", p.rfp_power];
      const on = n === "DC" ? snap?.["dc.out"] === true : n === "RF" ? rfCommanded(snap) : snap?.["rfp.out_on"] === true;
      return on ? `${n} 파워는 켜 둔 채 목표만 ${v(w)} W 로 바꿉니다.` : `${n} 파워를 ${v(w)} W 로 켭니다.`;
    }
    if (b.type === "power_off" && man && !waiting) return `${p.dc ? "DC" : p.rf ? "RF" : "RF Pulse"} 파워를 끕니다. 진행 중인 조작은 '중단(끼어든 조작)'으로 끝납니다.`;
    if (b.type === "shutter" && man && !waiting && String(p.action ?? "").startsWith("close")) {
      const t = Array.isArray(p.targets) ? String(p.targets[0]) : "";
      return `${nm(`plc.${t === "g1" ? "s1" : t === "g2" ? "s2" : "ms"}`)}를 닫습니다. 진행 중인 조작은 '중단(끼어든 조작)'으로 끝납니다.`;
    }
    if (b.type === "power_off") return `${p.dc ? "DC" : p.rf ? "RF" : "RF Pulse"} 파워를 끕니다.`;
    return `${stepName(bundle, { type: b.type })} 조작을 실행합니다.`;
  };
  const ask = (b: Block, label: string, opts: { lines?: string[]; red?: boolean; note?: string } = {}) => onAsk({
    kind: "MANUAL_BLOCK", label: `수동 조작 · ${label}`, args: { block: b }, key: `MANUAL_BLOCK:${b.type}`,
    red: opts.red, lines: [say(b), ...(opts.lines ?? [])],
    note: opts.note ?? (man ? "끝나면 다음 조작을 기다립니다." : "수동 조작을 시작합니다. 끝낼 때는 [수동 조작 끝내기]를 누르세요."),
  });
  const btn = (b: Block, label: string, children: ReactNode, k: "neutral" | "primary" | "danger" = "neutral",
               opts?: Parameters<typeof ask>[2], size: "sm" | "md" = "md") => (
    <Btn kind={k} size={size} lock={lockOf(b)} onClick={() => ask(b, label, opts)}>{children}</Btn>
  );

  // [유량 바꾸기](W-22) — 가스가 켜져 있을 때 Ar 유량만 바꾼다(공정 중 값 바꾸기 mfc.ar_flow — 수동 조작 중에만)
  const arNew = parse(ar);
  const flowWhy = !newDev ? "장비 프로그램을 최신으로 올리면 사용할 수 있습니다"
    : !gasNowOn ? "가스가 꺼져 있어 [가스 켜기]로 켭니다"
    : !man ? "수동 조작 중에만 바꿀 수 있습니다"
    : st?.stopping ? "정지 순서 중"
    : arNew === null || Number.isNaN(arNew) ? "Ar 유량(sccm)을 넣으세요" : lock("PROCESS_ADJUST");
  const flowBtn = (
    <Btn lock={flowWhy} onClick={() => onAsk({ kind: "PROCESS_ADJUST", label: "수동 조작 · Ar 유량 바꾸기", key: "PROCESS_ADJUST:mfc.ar_flow",
      args: { device: "mfc", item: "ar_flow", value: arNew },
      lines: [`Ar 유량을 ${arNew} sccm 으로 바꿉니다.`], note: "가스는 켜진 채 유량만 바꿉니다." })}>
      유량 바꾸기
    </Btn>
  );
  const gasOn: Block = { type: "gas_intro", params: { ar: parse(ar) !== null, ar_flow: parse(ar), o2: parse(o2) !== null, o2_flow: parse(o2), zero } };
  const gasOff: Block = { type: "gas_off", params: { ar: true, o2: true, close_valves: true } };
  const press: Block = { type: "pressure", params: { sp, value: spSet ? parse(spVal) : null, set: spSet, select: true, wait: spWait } };
  const valve = (action: string): Block => ({ type: "valve", params: { action } });
  const shutter = (action: string, t: string): Block => ({ type: "shutter", params: { action, targets: [t] } });
  const pOn = (p: Record<string, unknown>): Block => ({ type: "power_on", params: { ...p, wait: true } });
  const pOff = (p: Record<string, unknown>): Block => ({ type: "power_off", params: p });
  const offWhy = (dev: string) => (st?.links?.[dev]?.q === "off" ? "사용하지 않음" : null);
  const failWhy = (dev: string) => (st?.links?.[dev]?.q === "fail" ? "장비와 연결이 끊김. 다시 연결되면 조작할 수 있음" : null);
  const b = (k: string) => (snap?.[k] === undefined ? undefined : snap?.[k] === true);
  // 출력이 켜져 있나 — 버튼 이름("켜기" / "목표 적용")만 정한다. RF 는 묶음 23 rf.cmd_on(명령 출력), 묶음 19~22 rf.out_on,
  // 그 전은 Forward 5 W 이상(lib/ops2/chk/rf)
  const rfOn = rfCommanded(snap);
  const rfc = rfChip(snap);
  const rfMax = num(paramValue(bundle, "RF_OPERATING_MAX_W"));
  const onWord = (on: boolean) => (on ? "목표 적용" : "켜기");
  const devSp = num(snap?.[`mfc.sp${sp}_dev_mtorr`]);
  const ctx = { bundle, st, snap, lock, onAsk };

  if (!bundle?.manual) return <Empty>장비 프로그램을 최신으로 올리면 사용할 수 있습니다.</Empty>;
  const endLock = !man ? "수동 조작 중이 아님" : st?.stopping ? "정지 순서 중" : lock("MANUAL_END");
  // 시작·경과 — 처음 조작의 시작(초 또는 ms)
  const t0raw = man?.executed?.[0]?.start;
  const t0 = typeof t0raw === "number" ? (t0raw > 1e12 ? t0raw : t0raw * 1000) : null;
  const kst = (ms: number) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour12: false, hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  const dcMax = num(paramValue(bundle, "DC_MAX_POWER"));
  const off = (dev: string, why?: string | null) => (why ?? offWhy(dev)) !== null;
  /** 잠긴 버튼 이유 — 박스 버튼 줄 아래 한 줄(같은 이유는 한 번). 잠금 규칙은 lock·검사 그대로(W-22 에서 바꿈) */
  const why = (...xs: [Block, string][]) => {
    const rs = [...new Set(xs.map(([bl, nmx]) => { const r = lockOf(bl); return r ? `${nmx}: ${r}` : ""; }).filter(Boolean))];
    const same = new Set(xs.map(([bl]) => lockOf(bl)));
    const all = xs.every(([bl]) => lockOf(bl)) && same.size === 1 ? [...same][0] : null;
    if (!rs.length) return null;
    return <p className={`${FS.small} text-[#5B6470]`}>{all ? `잠김: ${all}` : rs.join(" · ")}</p>;
  };
  /** 같은 상태 잠금(장비 규칙 — 버튼마다 이미 보임)은 빼고 나머지 잠금 이유만 */
  const whyX = (...xs: [Block, string][]) => why(...xs.filter(([bl]) => !sameWhy(bl)));
  const warnNote = (dev: string) => failWhy(dev) ? <Issue level="warn">{failWhy(dev)}</Issue> : undefined;
  const big2 = (a: [string, number | null, string, number], c?: [string, number | null, string, number]) => (
    <div className="grid grid-cols-2 gap-x-3">
      {[a, c].filter(Boolean).map((x) => (
        <div key={x![0]} className="min-w-0">
          <p className={`${FS.small} text-[#5B6470]`}>{x![0]}</p>
          <Val text={fmt(x![1], x![3])} unit={x![2]} size="big" />
        </div>
      ))}
    </div>
  );
  const outChip = (on: boolean | undefined) => on === undefined ? null : <Chip tone={on ? "dark" : "neutral"}>{on ? "출력 켜짐" : "출력 꺼짐"}</Chip>;
  const setUp = (k: DevKey) => (onSettings ? () => onSettings(k) : undefined);
  const openShut = ([["ms", "plc.ms"], ["s1", "plc.s1"], ["s2", "plc.s2"]] as const).filter(([k]) => shut(k)).map(([, c]) => nm(c));
  const spAct = num(snap?.["mfc.sp_active"]);
  const ctxS = { ...ctx, onSettings, onConfig };
  const dcOn = snap?.["dc.out"] === true;
  return (
    <div className="space-y-3">
      {/* 요약(W-21 시안) — 지금 조작·조작 수·시작·경과·출처, 켜져 있는 출력, 조작 조건, [수동 조작 끝내기] */}
      <Card title={<><Hand size={15} /> {man ? (waiting ? "수동 조작 · 다음 조작 대기" : `수동 조작 · ${st?.run?.current ?? "-"}번째 조작 · ${stateLabel(bundle, st?.procState)}`) : "수동 조작 · 대기 중"}</>}
        right={<Btn kind="danger" size="lg" lock={endLock}
          title="가스·파워·셔터를 정지 순서로 모두 끕니다. 히터와 Filament 는 그대로 둡니다."
          onClick={() => onAsk({ kind: "MANUAL_END", label: "수동 조작 끝내기", stop: true,
            note: "가스·파워·셔터를 정지 순서로 모두 끕니다. 히터와 Filament 는 그대로 둡니다." })}>
          <Square size={14} /> 수동 조작 끝내기
        </Btn>}>
        <div className="space-y-2">
          {man ? (
            <p className={`flex flex-wrap items-center gap-2 ${FS.body} text-[#5B6470]`}>
              <Chip>한 조작 {man.executed?.length ?? 0}개</Chip>
              {[t0 !== null ? `시작 ${kst(t0)}` : "", t0 !== null && nowMs ? `경과 ${Math.max(0, Math.floor((nowMs - t0) / 60000))}분` : "", srcWord(man.source)].filter(Boolean).join(" · ")}
            </p>
          ) : <p className={`${FS.body} text-[#5B6470]`}>가스·압력·셔터·파워를 하나씩 조작합니다. 끝낼 때는 [수동 조작 끝내기]를 누르세요.</p>}
          {man && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`${FS.small} text-[#5B6470]`}>켜져 있는 출력</span>
              {(man.outputs ?? []).length ? (man.outputs ?? []).map((o) => (
                <Chip key={o.key} tone="dark">{o.label}{typeof o.value === "number" ? ` ${Number(o.value.toPrecision(5))}${o.unit ? ` ${o.unit}` : ""}` : ""}</Chip>
              )) : <Chip>없음</Chip>}
            </div>
          )}
          {stateWhy && active && !man && <Issue level="warn">{stateWhy}</Issue>}
          <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${FS.body}`}>
            <span className={`${FS.small} text-[#5B6470]`}>조작 조건</span>
            <Cond label={nm("plc.mv")} on={b("plc.mv")} words="open" />
            <Cond label={nm("plc.mv_interlock")} on={b("plc.mv_interlock")} />
            <Cond label={nm("plc.water")} on={b("plc.water")} words="detect" />
            <Cond label={nm("plc.air")} on={b("plc.air")} words="detect" />
            <Cond label={nm("plc.atm")} on={b("plc.atm")} words="detect" />
            {onHmi && <span className="ml-auto"><Btn size="sm" onClick={onHmi} title="밸브·펌프·PLC 버튼은 HMI 탭에서 조작합니다."><Workflow size={13} /> HMI 열기</Btn></span>}
          </div>
        </div>
      </Card>

      {/* 장비 박스(W-21) — 상태 탭과 같은 박스 틀(DevCard), 폭 기준은 운전 탭 영역(950px 3개·650px 2개), 같은 줄 같은 높이.
          가스 | 압력 | 셔터 / DC Power | RF Power | RF Pulse / Ion Gauge | 히터(2칸) */}
      <div className="@container/run">
        <div className="grid grid-cols-1 gap-3 @min-[650px]/run:grid-cols-2 @min-[950px]/run:grid-cols-3">
          <DevCard title="가스" off={off("mfc")} offNote={OFF_NOTE} onConfig={onConfig} onSettings={setUp("gas")}
            chip={<Chip tone={b("plc.ar_valve") || b("plc.o2_valve") ? "dark" : "neutral"}>{b("plc.ar_valve") || b("plc.o2_valve") ? "가스 켜짐" : "가스 꺼짐"}</Chip>}
            note={warnNote("mfc")}
            actions={<>{btn(gasOn, "가스 켜기", <>가스 켜기</>, "primary")}{newDev && flowBtn}</>}
            footNote={gasNowOn && newDev ? <p className={`${FS.small} text-[#5B6470]`}>가스가 켜져 있어 켜기는 잠김 · 유량은 [유량 바꾸기]로</p>
              : why([gasOn, "가스 켜기"], [gasOff, "가스 끄기"])}
            actionsEnd={btn(gasOff, "가스 끄기", <>가스 끄기</>, "danger")}>
            <PairKV k="Ar 현재 / 목표" a={num(snap?.["mfc.ar_sccm"])} b={num(snap?.["mfc.ar_set"])} unit="sccm" />
            <PairKV k="O₂ 현재 / 목표" a={num(snap?.["mfc.o2_sccm"])} b={num(snap?.["mfc.o2_set"])} unit="sccm" />
            <div className="mt-1 grid grid-cols-2 gap-x-4">
              <StateTag on={b("plc.ar_valve")} label={nm("plc.ar_valve")} words="open" />
              <StateTag on={b("plc.o2_valve")} label={nm("plc.o2_valve")} words="open" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Field label="Ar" unit="sccm" value={ar} onChange={setAr} hint="비우면 Ar 을 쓰지 않습니다." />
              <Field label="O₂" unit="sccm" value={o2} onChange={setO2} hint="비우면 O₂ 를 쓰지 않습니다." />
            </div>
            <label className={`mt-2 flex items-center gap-1.5 ${FS.body}`} title="가스를 넣기 전에 MFC 유량·압력 영점을 맞춥니다.">
              <input type="checkbox" checked={zero} onChange={(e) => setZero(e.target.checked)} /> 영점{newDev ? " (가스가 꺼져 있을 때만)" : ""}
            </label>
          </DevCard>

          <DevCard title="압력" off={off("mfc")} offNote={OFF_NOTE} onConfig={onConfig} onSettings={setUp("pressure")}
            chip={spAct !== null && spAct >= 1 ? <Chip tone="dark">SP{spAct} 제어 중</Chip> : <Chip>{spAct === 0 ? "MFC 밸브 조작" : "SP 없음"}</Chip>}
            big={big2(["챔버 압력", num(snap?.["mfc.pressure_mtorr"]), "mTorr", 2], [nm("mfc.valve_pct"), num(snap?.["mfc.valve_pct"]), "%", 1])}
            note={warnNote("mfc")}
            actions={btn(press, `압력 SP${sp} 적용`, <>압력 적용</>, "primary")} footNote={why([press, "압력 적용"], [valve("open"), "MFC 밸브"])}
            actionsEnd={<>
              <span className={`${FS.small} text-[#5B6470]`}>MFC 밸브</span>
              {btn(valve("open"), "MFC 밸브 열기", <>열기</>, "neutral", undefined, "sm")}
              {btn(valve("close"), "MFC 밸브 닫기", <>닫기</>, "neutral", undefined, "sm")}
              {btn(valve("hold"), "MFC 밸브 지금 위치로 유지", <>위치 유지</>, "neutral", undefined, "sm")}
            </>}>
            <div className={`space-y-1.5 ${FS.body}`}>
              <label className="flex items-center gap-1.5">
                <span className="text-[#5B6470]">SP</span>
                <select value={sp} onChange={(e) => setSp(Number(e.target.value))} aria-label="압력 SP"
                  className={`h-10 rounded-[8px] border border-[#D9DDE3] bg-white px-2 ${FS.body}`}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>SP{n}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="chk-manual-sp" checked={!spSet} onChange={() => setSpSet(false)} />
                장비에 저장된 값{devSp !== null ? ` · 지금 ${fmt(devSp, 2)} mTorr` : ""}
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
          </DevCard>

          <DevCard title="셔터" off={off("plc")} offNote={OFF_NOTE} onConfig={onConfig} onSettings={setUp("shutter")}
            chip={<Chip tone={openShut.length ? "dark" : "neutral"}>{openShut.length ? `${openShut.join("·")} 열림` : "모두 닫힘"}</Chip>}
            note={<>{warnNote("plc")}{whyX(...([["g1", "s1"], ["g2", "s2"], ["ms", "ms"]] as const).flatMap(([t, c]) => [[shutter("open", t), `${nm(`plc.${c}`)} 열기`], [shutter("close", t), `${nm(`plc.${c}`)} 닫기`]] as [Block, string][]))}
              {newDev && <p>이미 그 상태인 셔터의 버튼은 잠깁니다 · [닫기]는 진행 중인 조작이 있어도 바로 실행</p>}</>}
            >
            {([["s1", "g1"], ["s2", "g2"], ["ms", "ms"]] as const).map(([col, t]) => (
              <div key={t} className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-0.5">
                <span className="min-w-0 flex-1"><StateTag on={snap?.[`plc.${col}`] as boolean | undefined} label={nm(`plc.${col}`)} words="open" /></span>
                <span className="flex gap-1.5">
                  {btn(shutter("open", t), `${nm(`plc.${col}`)} 열기`, <>열기</>, "neutral", undefined, "sm")}
                  {btn(shutter("close", t), `${nm(`plc.${col}`)} 닫기`, <>닫기</>, "neutral", undefined, "sm")}
                </span>
              </div>
            ))}
            <MountedRows st={st} />
          </DevCard>

          <DevCard title={bundle.snapshot?.blocks?.find((x) => x.name === "dc")?.label ?? "DC Power"} off={off("dc")} offNote={OFF_NOTE} onConfig={onConfig} onSettings={setUp("dc")}
            chip={outChip(b("dc.out"))} big={big2(["파워", num(snap?.["dc.p"]), "W", 1])} note={warnNote("dc")}
            actions={btn(pOn({ dc_power: parse(dc) }), `DC ${dc || "?"} W ${onWord(dcOn)}`, <>{onWord(dcOn)}</>, "primary", { red: true, lines: powerLines() })}
            footNote={why([pOn({ dc_power: parse(dc) }), onWord(dcOn)], [pOff({ dc: true }), "끄기"])
              ?? (dcOn && newDev ? <p className={`${FS.small} text-[#5B6470]`}>켜져 있어 [켜기] 대신 [목표 적용] · [끄기]는 진행 중인 조작이 있어도 바로 실행</p> : undefined)}
            actionsEnd={btn(pOff({ dc: true }), "DC 끄기", <>끄기</>, "danger")}>
            <KV k="전압"><Val text={fmt(num(snap?.["dc.v"]))} unit="V" /></KV>
            <KV k="전류"><Val text={fmt(num(snap?.["dc.i"]), 3)} unit="A" /></KV>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Field label="목표" unit="W" value={dc} onChange={setDc} />
              {dcMax !== null && <span className={`${FS.small} text-[#5B6470]`}>운전 상한 {dcMax} W</span>}
            </div>
          </DevCard>

          <DevCard title={bundle.snapshot?.blocks?.find((x) => x.name === "rf")?.label ?? "RF Power"} off={off("rf")} offNote={OFF_NOTE} onConfig={onConfig} onSettings={setUp("rf")}
            chip={rfc ? <Chip tone={rfc.tone}>{rfc.text}</Chip> : outChip(snap?.["rf.out_on"] === undefined && snap?.["rf.fwd_w"] === undefined ? undefined : rfOn)}
            big={big2([nm("rf.fwd_w"), num(snap?.["rf.fwd_w"]), "W", 1], [nm("rf.ref_w"), num(snap?.["rf.ref_w"]), "W", 1])} note={warnNote("rf")}
            actions={btn(pOn({ rf_power: parse(rf) }), `RF ${rf || "?"} W ${onWord(rfOn)}`, <>{onWord(rfOn)}</>, "primary", { red: true, lines: powerLines() })}
            footNote={why([pOn({ rf_power: parse(rf) }), onWord(rfOn)], [pOff({ rf: true }), "끄기"])
              ?? (rfOn && newDev ? <p className={`${FS.small} text-[#5B6470]`}>켜져 있어 [켜기] 대신 [목표 적용] · [끄기]는 올리는 중에도 바로 실행</p> : undefined)}
            actionsEnd={btn(pOff({ rf: true }), "RF 끄기", <>끄기</>, "danger")}>
            <KV k="목표"><Val text={fmt(num(snap?.["rf.set_w"]))} unit="W" /></KV>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Field label="목표" unit="W" value={rf} onChange={setRf} />
              {rfMax !== null && <span className={`${FS.small} text-[#5B6470]`}>운전 상한 {rfMax} W</span>}
            </div>
          </DevCard>

          <DevCard title={bundle.snapshot?.blocks?.find((x) => x.name === "rfp")?.label ?? "RF Pulse"} off={!rfpOn || off("rfp")} offNote={OFF_NOTE} onConfig={onConfig} onSettings={setUp("rfp")}
            chip={outChip(b("rfp.out_on"))} big={big2([nm("rfp.fwd_w"), num(snap?.["rfp.fwd_w"]), "W", 0])} note={warnNote("rfp")}
            actions={btn(pOn({ rfp_power: parse(rfp), rfp_freq_khz: parse(freq), rfp_duty: parse(duty) }), `RF Pulse ${rfp || "?"} W 켜기`, <>{onWord(snap?.["rfp.out_on"] === true)}</>, "primary", { red: true, lines: powerLines() })}
            footNote={why([pOn({ rfp_power: parse(rfp), rfp_freq_khz: parse(freq), rfp_duty: parse(duty) }), onWord(snap?.["rfp.out_on"] === true)], [pOff({ rfpulse: true }), "끄기"])}
            actionsEnd={btn(pOff({ rfpulse: true }), "RF Pulse 끄기", <>끄기</>, "danger")}>
            <KV k={nm("rfp.ref_w")}><Val text={fmt(num(snap?.["rfp.ref_w"]), 0)} unit="W" /></KV>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Field label="목표" unit="W" value={rfp} onChange={setRfp} />
              <Field label="주파수" unit="kHz" value={freq} onChange={setFreq} hint="비우면 장비에 있는 값을 그대로 씁니다." width="w-20" />
              <Field label="듀티" unit="%" value={duty} onChange={setDuty} hint="비우면 장비에 있는 값을 그대로 씁니다." width="w-16" />
            </div>
          </DevCard>

          {/* Ion Gauge · 히터 — 상태 탭 장비 박스와 같은 부품(조작·확인창 그대로) */}
          <IgCard {...ctxS} />
          <div className="grid min-w-0 @min-[950px]/run:col-span-2"><HeaterCard {...ctxS} /></div>
        </div>
      </div>
    </div>
  );
}

/** 현재 / 목표 한 줄 */
function PairKV({ k, a, b, unit }: { k: string; a: number | null; b: number | null; unit: string }) {
  return (
    <KV k={k}><Val text={fmt(a, 2)} /><span className={`ml-1 ${FS.small} text-[#5B6470]`}>/ {b === null ? "—" : fmt(b, 2)} {unit}</span></KV>
  );
}
const OFF_NOTE = "장비 설정에서 사용하도록 바꾸면 조작할 수 있습니다.";
