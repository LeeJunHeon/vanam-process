"use client";

// 챔버12 상태 띠(2026-11-18 — 챔버K Chk2Status 와 같은 틀). 모든 탭 위에 늘 보이고, 스크롤로 안 보이면 위에 얇은 줄(StatusBar12).
// 왼쪽 위: 장비 이름·연결(웹 또는 노트북 프로그램 — 연결됨·n초 전 / 늦음 / 끊김, 끊김만 빨강)·노트북 웹 연결(노트북 화면)·PLC·모드 칩
//   (실제 운전 / 읽기 전용(bench) 어두운 칩 + 자물쇠 / SIM — 모의 장비).
// 가운데: CH1·CH2 칸 — 공정 상태(크게)·블록 n/전체·블록 이름·남은 시간(블록)·ETA(공정 끝까지 — 장비가 확정하기 전에는 '—')·끝 예정·진행 막대·알람.
// 아래 줄: 로드락·플라즈마 클리닝·TSP 요약, 장비 전체 알람·정지 순서·지난 공정이 남긴 출력. 오른쪽: 부저 정지·ALL STOP(빨간 채움).
// 정상은 색 없이(회색), 이상만 주의·알람 색 + 아이콘. run id·원시 이름은 '상세'에서만.
import type { ReactNode } from "react";
import { BellOff, Lock, OctagonX, PauseCircle } from "lucide-react";
import { FS, Btn, Chip, Issue, type Ask, type Tone } from "../chk/kit";
import { useChk2Mode } from "../chk/mode";
import { reasonLabel } from "../chk/types";
import { fmtKst } from "@/lib/ops2/time";
import { KINDS, blockLabel, chamberState, clockOrDash, engineOf, isRunning, pickKind, stateInfo } from "./logic";
import { asChk, type Ch12Bundle, type Ch12State, type ChamberId } from "./types";
import { ownerName, placeName, reasonTip } from "@/lib/ops2/ch12/terms";

export type LockFn = (kind: string, key?: string) => string | null;
export type ConnInfo = { label: string; tone: Tone };

const STATE_WORD: Record<string, string> = { active: "가동 중", stopping: "정지 중", end: "끝남" };
const idleName = (p: string | null | undefined) => !p || /^idle$/i.test(p);

/** 부저 정지·ALL STOP(정지 쪽 — 결과를 기다리는 중에도 막지 않음) */
export function StopButtons12({ bundle, lock, onAsk, small }: { bundle: Ch12Bundle | null; lock: LockFn; onAsk: (a: Ask) => void; small?: boolean }) {
  const size = small ? "sm" : "lg";
  const kBuzz = pickKind(bundle, KINDS.buzz), kAll = pickKind(bundle, KINDS.allStop);
  return (
    <div className="flex shrink-0 flex-nowrap gap-2">
      <Btn size={size} lock={lock(kBuzz)} onClick={() => onAsk({ kind: kBuzz, label: "부저 정지", stop: true, note: "울리는 부저를 끕니다." })}>
        <BellOff size={14} /> 부저 정지
      </Btn>
      <Btn size={size} kind="dangerSolid" lock={lock(kAll)}
        onClick={() => onAsk({ kind: kAll, label: "ALL STOP", stop: true,
          note: "CH1·CH2·플라즈마 클리닝·TSP 를 모두 멈추고 출력을 끕니다(공정 여부와 무관 — 정지 순서 고정)." })}>
        <OctagonX size={14} /> ALL STOP
      </Btn>
    </div>
  );
}

/** 챔버 하나의 짧은 상태 글 — '대기' / '공정 진행 · 블록 2/5 · 남은 1:20' */
export function chamberLine(bundle: Ch12Bundle | null, st: Ch12State | null, ch: ChamberId): string {
  const cs = chamberState(st, ch);
  if (!cs) return "상태 없음";
  if (idleName(cs.procState)) return "대기";
  const info = stateInfo(bundle, cs.procState, ch);
  const step = cs.step;
  const rem = cs.remainS ?? step?.remainS;
  return [info.label, step?.no ? `블록 ${step.no}/${step.total ?? "-"}` : "", typeof rem === "number" ? `남은 ${clockOrDash(rem)}` : ""]
    .filter(Boolean).join(" · ");
}

function ChamberCell({ bundle, st, ch, connected, nowMs }: {
  bundle: Ch12Bundle | null; st: Ch12State | null; ch: "ch1" | "ch2"; connected: boolean; nowMs: number;
}) {
  const { detail } = useChk2Mode();
  const cs = chamberState(st, ch);
  const info = stateInfo(bundle, cs?.procState, ch);
  const running = isRunning(bundle, cs);
  const eng = engineOf(st, ch);
  const step = cs?.step;
  const eta = cs?.etaRemainingS;
  const etaAt = typeof eta === "number" && eta >= 0 ? fmtKst(new Date(nowMs + eta * 1000).toISOString()).slice(-8, -3) : null;
  const prog = running && step && typeof step.no === "number" && typeof step.total === "number" && step.total > 0
    ? Math.min(1, Math.max(0, (step.no - 1) / step.total)) : null;
  const alarms = [...(cs?.alarms ?? []), ...(st?.alarms ?? []).filter((a) => a.chamber === ch).map((a) => a.ruleId)];
  const label = placeName(bundle, ch);
  return (
    <div className="min-w-0 rounded-[10px] border border-[#E3E6EA] px-3 py-2" data-band-chamber={ch}>
      <p className={`flex flex-wrap items-center gap-1.5 ${FS.small} font-semibold text-[#5B6470]`}>
        <span className="rounded bg-[#3A424D] px-1.5 py-px text-white">{label}</span>
        {STATE_WORD[info.kind] ?? "대기"}
        {cs?.owner && <span>· {ownerName(bundle, cs.owner)}</span>}
        {cs?.paused && <Chip tone="warn" icon={<PauseCircle size={11} />}>일시정지</Chip>}
        {alarms.length > 0 && <Chip tone="alarm">알람 {alarms.length}</Chip>}
      </p>
      <p className={`mt-0.5 truncate ${FS.title} font-bold ${connected ? "text-[#1B1F24]" : "text-[#8A929D]"}`}>
        {!cs ? "상태 없음" : idleName(cs.procState) ? "대기 중" : info.label}
        {detail && cs?.procState && <span className={`ml-2 align-middle font-mono ${FS.small} font-normal text-[#8A929D]`}>{cs.procState}</span>}
      </p>
      {running && step ? (
        <p className={`truncate ${FS.body} text-[#1B1F24]`}>
          <span className="tabular-nums text-[#5B6470]">블록 {step.no ?? "-"}/{step.total ?? "-"}</span>{" "}
          <b>{blockLabel(bundle, step.type)}</b>
        </p>
      ) : (
        <p className={`truncate ${FS.body} text-[#5B6470]`}>{eng?.recipe_name ? `적재 '${String(eng.recipe_name)}'` : "적재된 레시피 없음"}</p>
      )}
      <p className={`mt-0.5 flex flex-wrap gap-x-3 ${FS.body} text-[#5B6470]`}>
        <span>남은 <b className="tabular-nums text-[#133A7C]">{clockOrDash(cs?.remainS ?? step?.remainS)}</b></span>
        <span title="공정 끝까지 — 장비가 확정하기 전에는 '—'">ETA <b className="tabular-nums text-[#133A7C]">{clockOrDash(eta)}</b>
          <span className={`ml-1 ${FS.small}`}>{etaAt ? `끝 예정 ${etaAt}` : running ? "확정 전" : ""}</span></span>
      </p>
      {prog !== null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E3E6EA]" role="progressbar" aria-label={`${label} 진행`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(prog * 100)}>
          <div className="h-full rounded-full bg-[#133A7C]" style={{ width: `${prog * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/** 아래 줄 요약 칩 하나 — 이름 + 짧은 상태(정상은 회색) */
function Sum({ name, text, tone = "neutral" }: { name: string; text: string; tone?: Tone }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${FS.body}`}>
      <span className="font-semibold text-[#1B1F24]">{name}</span>
      {tone === "neutral" ? <span className="truncate text-[#5B6470]">{text}</span> : <Chip tone={tone}>{text}</Chip>}
    </span>
  );
}

export function StatusBand12({ bundle, st, connected, conn, links, mode, equipment, label, lock, onAsk, nowMs, plcOk, extra }: {
  bundle: Ch12Bundle | null; st: Ch12State | null; connected: boolean; conn: ConnInfo; links: ConnInfo[];
  mode: "run" | "bench" | "sim" | null; equipment: string; label: string | null; lock: LockFn; onAsk: (a: Ask) => void;
  nowMs: number; plcOk: boolean; extra?: ReactNode;
}) {
  const { detail } = useChk2Mode();
  const snap = st?.snapshot;
  const plc = (k: string) => (plcOk ? snap?.[`plc.${k}`] === true : null);
  const ll = plc("l_vac_ready_sw") ? "진공 준비" : plc("l_atm") || plc("l_atm_sensor") ? "대기압" : plc("l_vac_not_ready") ? "진공 준비 안 됨" : plcOk ? "—" : "PLC 값 없음";
  const glob = (st?.alarms ?? []).filter((a) => !a.chamber || !["ch1", "ch2"].includes(a.chamber));
  const left = st?.left ?? {};
  const pcLine = chamberLine(bundle, st, "pc"), tspLine = chamberLine(bundle, st, "tsp");
  return (
    <section className="min-w-0 rounded-[12px] border border-[#D9DDE3] bg-white p-3 sm:p-4" data-status-band="">
      <div className={`flex flex-wrap items-center gap-2 ${FS.body}`}>
        <b className={`${FS.card} text-[#1B1F24]`}>{label || equipment}</b>
        {label && <span className={`font-mono ${FS.small} text-[#5B6470]`}>{equipment}</span>}
        <Chip tone={conn.tone}>{conn.label}</Chip>
        {links.map((l) => <Chip key={l.label} tone={l.tone}>{l.label}</Chip>)}
        {mode === "bench" && <Chip tone="dark" icon={<Lock size={11} />}>읽기 전용(bench)</Chip>}
        {mode === "sim" && <Chip tone="info">SIM — 모의 장비</Chip>}
        {mode === "run" && <Chip>실제 운전</Chip>}
        {extra && <span className="ml-auto flex items-center gap-2">{extra}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          <ChamberCell bundle={bundle} st={st} ch="ch1" connected={connected} nowMs={nowMs} />
          <ChamberCell bundle={bundle} st={st} ch="ch2" connected={connected} nowMs={nowMs} />
        </div>
        <StopButtons12 bundle={bundle} lock={lock} onAsk={onAsk} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
        <Sum name={placeName(bundle, "loadlock")} text={ll} />
        <Sum name={placeName(bundle, "pc")} text={pcLine} tone={chamberState(st, "pc")?.alarms?.length ? "alarm" : "neutral"} />
        <Sum name={placeName(bundle, "tsp")} text={tspLine} tone={chamberState(st, "tsp")?.alarms?.length ? "alarm" : "neutral"} />
        {glob.map((a) => (
          <Chip key={a.ruleId} tone="alarm" title={[reasonTip(asChk(bundle), a.code, detail), a.since ? `시작 ${fmtKst(a.since)}` : ""].filter(Boolean).join(" · ") || undefined}>
            {a.code ? reasonLabel(asChk(bundle), a.code) : a.ruleId}{detail && <span className="font-mono font-normal">{a.ruleId}</span>}
          </Chip>
        ))}
      </div>
      {(st?.stopping || Object.keys(left).length > 0) && (
        <div className="mt-2 space-y-1.5">
          {st?.stopping && <Issue level="warn">정지 순서 실행 중{detail ? ` — ${String(st.stopping)}` : ""}</Issue>}
          {Object.keys(left).length > 0 && (
            <Issue level="warn"><b>지난 공정이 남긴 출력</b> — {Object.keys(left).length}개 켜져 있음 — 챔버 STOP 또는 ALL STOP 으로 정리</Issue>
          )}
        </div>
      )}
    </section>
  );
}

/** 스크롤했을 때 위에 붙는 얇은 줄 — CH1·CH2 상태 한 줄씩 + 정지 버튼 */
export function StatusBar12({ bundle, st, connected, lock, onAsk }: {
  bundle: Ch12Bundle | null; st: Ch12State | null; connected: boolean; lock: LockFn; onAsk: (a: Ask) => void;
}) {
  return (
    <div className="flex items-center gap-4 whitespace-nowrap rounded-[12px] border border-[#D9DDE3] bg-white/95 px-3 py-1.5 shadow-md backdrop-blur">
      {(["ch1", "ch2"] as const).map((ch) => (
        <span key={ch} className={`min-w-0 truncate ${FS.body} ${connected ? "text-[#1B1F24]" : "text-[#8A929D]"}`}>
          <b>{placeName(bundle, ch)}</b> <span className="tabular-nums">{chamberLine(bundle, st, ch)}</span>
        </span>
      ))}
      <span className="ml-auto"><StopButtons12 bundle={bundle} lock={lock} onAsk={onAsk} small /></span>
    </div>
  );
}
