"use client";

// 챔버K v2 공정 순서(W-10, 운전 탭 공정 중 왼쪽) — state.run.blocks(묶음 13, 펼친 블록). 끝난 블록 회색 + 걸린 시간(건너뜀·중단 표시),
// 지금 블록 강조(번호 원 남색·연한 파랑 배경) + 상태 한 줄 + [일시정지]/[재개]·[건너뛰기](장비가 준 skip·pause 가 참일 때만 — 아니면 이유),
// 남은 블록 + 정해진 시간. 머리에 '판 n'·[순서 고치기], 아래 '정지 순서(고정) 보기'. 확인창에 무엇이 일어나는지(묶음 skip·pause 문구).
// 순서 고치기(PROCESS_EDIT {revision, blocks}): 지금 행의 맨 위 블록 전체 목록을 보낸다 — 시작했거나 끝난 블록(맨 위 1~k)과 그 앞은 그대로.
//   처음 목록 = 장비가 준 지금 판의 기준 목록(state.run.editBase, 묶음 14 — 장비가 실제로 실행하는 정리 목록. v1 행·장비 앞면 시작·
//   한 행 바로 시작도). 웹이 템플릿을 다시 만들지 않는다. 아직 없으면(옛 묶음·받는 중) 버튼을 막고 이유를 보인다.
//   웹 검사 = 장비와 같은 계산(blocks.ts checkBlocks) + '시작한 블록 그대로'(둘 다 정리 모양으로 비교 — 장비와 같게).
//   그사이 판이 바뀌면 "다른 곳에서 순서가 바뀜 — 다시 불러오기".
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ListOrdered, PauseCircle, Play, RefreshCw, SkipForward } from "lucide-react";
import { checkBlocks, type BlockEnv } from "@/lib/ops2/chk/blocks";
import { checkEnvOf } from "@/lib/ops2/chk/recipe";
import { FS, Btn, Card, Chip, Empty, Issue, type Ask } from "./kit";
import { BlockPane, BlockTree, TopMessages, fromJson, toJson, type EBlock } from "./Chk2BlockEditor";
import { blockName, blockSummary, fmtClock, fmtDur } from "./text";
import { DONE_STATUS, OPEN_TYPES, blockTarget, topOf } from "./runview";
import { paramValue } from "./logic";
import type { LockFn } from "./Chk2Status";
import type { EditBase, RunBlocks } from "./useChk2";
import type { Bundle, RunBlock, StateData } from "./types";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const RESULT: Record<string, string> = { done: "끝", skipped: "건너뜀", aborted: "중단", error: "오류", failed: "실패" };

/** 정리 모양(checkBlocks clean) 문자열 — 키 순서·빈 값/기본값·"cfg:키" 차이 없이 비교(장비 process_engine.edit 와 같게). 오류면 원문 */
function cleanKey(xs: unknown[], env: BlockEnv): string {
  if (!xs.length) return "[]";
  return JSON.stringify(checkBlocks(xs, env).clean ?? xs);
}
/** 장비 묶음이 기준 목록(editBase)을 주는 판 */
const EDIT_BASE_VERSION = 14;

/** 블록 하나 이름(이름표가 있으면 같이) */
const nameOf = (b: Bundle | null, x: { type: string; label?: string }) =>
  x.type === "delay" ? "딜레이 행" : `${blockName(b, x.type)}${x.label && x.label !== blockName(b, x.type) && !/^[\d.#]+$/.test(x.label) ? ` · ${x.label}` : ""}`;

function SeqItem({ b, bundle, st, current, lock, onAsk, revision, pauseMax }: {
  b: RunBlock; bundle: Bundle | null; st: StateData | null; current: boolean; lock: LockFn; onAsk: (a: Ask) => void;
  revision: number; pauseMax: number;
}) {
  const done = DONE_STATUS.has(b.status);
  const paused = b.status === "paused";
  const took = typeof b.start === "number" && typeof b.end === "number" ? b.end - b.start : null;
  const cur = typeof (st?.step?.remainS ?? st?.remainS) === "number" ? (st?.step?.remainS ?? st?.remainS) as number : null;
  const name = nameOf(bundle, b);
  const target = current ? blockTarget(b.type, st?.snapshot) : "";
  const pausedS = st?.run?.paused?.pausedS ?? 0;
  return (
    <li className={`rounded-[10px] border px-3 py-2 ${current ? "border-[#C7D5FB] bg-[#E8EEFC]" : done ? "border-transparent bg-[#F5F6F8]" : "border-[#E3E6EA] bg-white"}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1 font-mono ${FS.small} font-bold ${
          current ? "bg-[#133A7C] text-white" : done ? "bg-[#E3E6EA] text-[#5B6470]" : "border border-[#C9CED6] text-[#5B6470]"}`}>{b.no === "delay" ? "D" : b.no}</span>
        <div className="min-w-0 flex-1">
          <p className={`flex flex-wrap items-center gap-1.5 ${FS.body} font-semibold ${done ? "text-[#5B6470]" : "text-[#1B1F24]"}`}>
            <span className="truncate">{name}</span>
            {b.auto && <Chip>자동으로 붙음</Chip>}
            {b.status === "skipped" && <Chip tone="warn" icon={<SkipForward size={11} />}>건너뜀</Chip>}
            {(b.status === "aborted" || b.status === "error" || b.status === "failed") && <Chip tone="alarm">{RESULT[b.status]}</Chip>}
            {paused && <Chip tone="warn" icon={<PauseCircle size={11} />}>일시정지 {fmtClock(pausedS)}{pauseMax > 0 ? ` / ${fmtClock(pauseMax)}` : ""}</Chip>}
          </p>
          <p className={`${FS.small} text-[#5B6470]`}>
            {done ? `${RESULT[b.status] ?? b.status}${took !== null ? ` · ${fmtDur(took)}` : ""}${(b.pausedSec ?? 0) > 0 ? ` · 멈춤 ${fmtDur(b.pausedSec ?? 0)}` : ""}`
              : current ? [target, paused ? "멈춤" : cur !== null ? `남은 ${fmtClock(cur)}` : OPEN_TYPES.has(b.type) ? "도달 대기 중" : "진행 중"].filter(Boolean).join(" · ")
              : typeof b.durationS === "number" ? fmtDur(b.durationS) : OPEN_TYPES.has(b.type) ? "도달까지" : ""}
          </p>
          {current && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {paused ? (
                <Btn size="sm" kind="primary" lock={lock("PROCESS_RESUME")}
                  onClick={() => onAsk({ kind: "PROCESS_RESUME", label: "일시정지 재개", detail: `${b.no === "delay" ? "" : `${b.no} `}${name}`,
                    args: { revision }, note: "멈춘 블록을 이어서 합니다(메인은 셔터를 다시 열고, 도달 대기는 안정 유지 시간을 처음부터)." })}>
                  <Play size={13} /> 재개
                </Btn>
              ) : b.pause ? (
                <Btn size="sm" lock={lock("PROCESS_PAUSE")}
                  onClick={() => onAsk({ kind: "PROCESS_PAUSE", label: "블록 일시정지", detail: `${b.no === "delay" ? "" : `${b.no} `}${name}`,
                    args: { no: b.no, revision }, lines: [`${name}: ${b.pauseText ?? ""}`],
                    note: pauseMax > 0 ? `한도 ${fmtDur(pauseMax)}를 넘으면 정지 순서로 갑니다(5분 전 경고).` : "한도 없음(설정 PROCESS_PAUSE_MAX_SEC 0)." })}>
                  <PauseCircle size={13} /> 일시정지
                </Btn>
              ) : <span className={`${FS.small} text-[#5B6470]`}>일시정지 못 함 — {b.pauseText || "이 블록은 멈출 수 없음"}</span>}
              {b.skip ? (
                <Btn size="sm" lock={lock("PROCESS_SKIP")}
                  onClick={() => onAsk({ kind: "PROCESS_SKIP", label: "블록 건너뛰기", detail: `${b.no === "delay" ? "" : `${b.no} `}${name}`,
                    args: { no: b.no, revision }, lines: [`${name}: ${b.skipText ?? ""}`], red: true })}>
                  <SkipForward size={13} /> 건너뛰기
                </Btn>
              ) : !paused && <span className={`${FS.small} text-[#5B6470]`}>건너뛰기 못 함 — {b.skipText || "이 블록은 건너뛸 수 없음"}</span>}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function SeqEditor({ bundle, base, baseRev, revision, lockTop, runBlocks, lock, onAsk, onClose, onReload, reloadReady }: {
  bundle: Bundle | null; base: unknown[]; baseRev: number; revision: number; lockTop: number; runBlocks: RunBlock[];
  lock: LockFn; onAsk: (a: Ask) => void; onClose: () => void; onReload: () => void; reloadReady: boolean;
}) {
  const env = useMemo(() => checkEnvOf(bundle), [bundle]);
  const [tree, setTree] = useState<EBlock[]>(() => base.map(fromJson));
  const [sel, setSel] = useState<string | null>(() => tree[lockTop]?.uid ?? tree[0]?.uid ?? null);
  const json = useMemo(() => tree.map(toJson), [tree]);
  const chk = useMemo(() => (env?.blocks ? checkBlocks(json, env.blocks) : null), [json, env]);
  const startedSame = !env?.blocks || cleanKey(json.slice(0, lockTop), env.blocks) === cleanKey(base.slice(0, lockTop), env.blocks);
  const errors = [...(chk?.errors ?? []), ...(startedSame ? [] : ["시작했거나 끝난 블록과 그 앞 순서는 그대로여야 함"])];
  const changes = (() => {
    const out: string[] = [];
    const n = Math.max(json.length, base.length);
    for (let i = lockTop; i < n; i++) {
      const a = base[i], b = json[i];
      if (a !== undefined && b !== undefined && env?.blocks && cleanKey([a], env.blocks) === cleanKey([b], env.blocks)) continue;
      const nm = (x: unknown) => (isObj(x) && typeof x.type === "string" ? `${blockName(bundle, x.type)}${isObj(x.params) && blockSummary(bundle, x.type, x.params) ? ` (${blockSummary(bundle, x.type, x.params)})` : ""}` : "없음");
      out.push(a === undefined ? `${i + 1}번 추가: ${nm(b)}` : b === undefined ? `${i + 1}번 빠짐: ${nm(a)}` : `${i + 1}번 ${nm(a)} → ${nm(b)}`);
    }
    return out;
  })();
  const stale = revision !== baseRev;
  const doneText = (top: number) => {
    const xs = runBlocks.filter((b) => topOf(b.no) === top);
    if (!xs.length) return null;
    if (xs.some((b) => b.status === "running" || b.status === "paused")) return "지금 진행 중";
    const r = xs[xs.length - 1];
    return `${RESULT[r.status] ?? r.status}`;
  };
  if (!env?.blocks) return <Empty>이 장비 정의에는 블록 정의가 없어 순서를 고칠 수 없습니다.</Empty>;
  return (
    <div className="space-y-3">
      {stale && (
        <Issue level="warn">
          다른 곳에서 순서가 바뀜(지금 판 {revision}, 고치던 판 {baseRev}) — 다시 불러온 뒤 고치세요.
          {reloadReady
            ? <button onClick={onReload} className="ml-2 inline-flex items-center gap-1 font-semibold underline"><RefreshCw size={12} /> 다시 불러오기</button>
            : <span className="ml-2">새 판 기준 목록을 받는 중…</span>}
        </Issue>
      )}
      <TopMessages errors={errors.filter((m) => !m.startsWith("블록 "))} bundle={bundle} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <BlockTree tree={tree} onTree={setTree} sel={sel} onSel={setSel} env={env.blocks} bundle={bundle} readOnly={false}
          errors={chk?.errors ?? []} warnings={chk?.warnings ?? []} lockTop={lockTop} doneText={doneText} />
        <div className="rounded-[12px] border border-[#D9DDE3] bg-white p-3 lg:self-start">
          <BlockPane tree={tree} sel={sel} env={env.blocks} bundle={bundle} readOnly={false} errors={chk?.errors ?? []}
            warnings={chk?.warnings ?? []} onTree={setTree} lockTop={lockTop} />
        </div>
      </div>
      <div className={`sticky bottom-0 flex flex-wrap items-center gap-2 rounded-[10px] border border-[#D9DDE3] bg-white px-3 py-2 ${FS.body}`}>
        <span className="text-[#5B6470]">판 {baseRev} 기준 · 바뀐 것 <b className="text-[#1B1F24]">{changes.length}</b>개 ·</span>
        {errors.length ? <Chip tone="alarm">검사 오류 {errors.length}</Chip> : <Chip>검사 통과</Chip>}
        <span className="ml-auto flex gap-2">
          <Btn kind="ghost" onClick={onClose}>취소</Btn>
          <Btn kind="primary" size="lg" lock={stale ? "다른 곳에서 순서가 바뀜 — 다시 불러오기" : errors.length ? "검사 오류를 고친 뒤" : !changes.length ? "바뀐 것이 없음" : lock("PROCESS_EDIT")}
            onClick={() => onAsk({ kind: "PROCESS_EDIT", label: "순서 고치기", detail: `판 ${baseRev} → ${baseRev + 1}`,
              args: { revision: baseRev, blocks: json }, red: true,
              lines: [`맨 위 블록 ${base.length}개 → ${json.length}개`, ...changes.slice(0, 8), ...(changes.length > 8 ? [`외 ${changes.length - 8}개`] : [])],
              note: "시작했거나 끝난 블록은 그대로 두고, 아직 시작하지 않은 블록을 새 목록으로 바꿉니다(장비가 다시 검사)." })}>
            적용
          </Btn>
        </span>
      </div>
    </div>
  );
}

export default function Chk2Seq({ bundle, st, runBlocks, editBase, lock, onAsk, local, onWide }: {
  bundle: Bundle | null; st: StateData | null; runBlocks: RunBlocks | null; editBase: EditBase | null;
  lock: LockFn; onAsk: (a: Ask) => void; local: boolean;
  onWide?: (wide: boolean) => void;               // 순서 고치기 중에는 넓게(부르는 쪽 격자)
}) {
  const [editing, setEditingState] = useState(false);
  const setEditing = (v: boolean) => { setEditingState(v); onWide?.(v); };
  const [stopOpen, setStopOpen] = useState(false);
  const [base, setBase] = useState<{ blocks: unknown[]; revision: number; key: number } | null>(null);
  const run = st?.run ?? null;
  const blocks = runBlocks && (!runBlocks.runId || runBlocks.runId === st?.runId) ? runBlocks.blocks : null;
  const revision = run?.revision ?? 0;
  const curNo = run?.current ?? null;
  const pauseMax = typeof paramValue(bundle, "PROCESS_PAUSE_MAX_SEC") === "number" ? paramValue(bundle, "PROCESS_PAUSE_MAX_SEC") as number : 0;
  const lockTop = curNo && curNo !== "delay" ? topOf(curNo) + 1 : blocks ? new Set(blocks.filter((b) => DONE_STATUS.has(b.status)).map((b) => topOf(b.no))).size : 0;
  // 지금 run·지금 판의 기준 목록만(판이 막 바뀌었으면 새 목록이 올 때까지 기다림)
  const eb = editBase && (!editBase.runId || editBase.runId === st?.runId) && editBase.revision === revision ? editBase : null;
  const oldBundle = typeof bundle?.version === "number" && bundle.version < EDIT_BASE_VERSION;

  // 판이 하나 올라가면(적용됨) 편집을 닫는다
  const [sentRev, setSentRev] = useState<number | null>(null);
  useEffect(() => {
    if (sentRev !== null && revision > sentRev) {
      const t = setTimeout(() => { setEditingState(false); onWide?.(false); setSentRev(null); }, 0);
      return () => clearTimeout(t);
    }
  }, [revision, sentRev, onWide]);

  /** 처음 목록 — 장비가 준 지금 판의 기준 목록(editBase) 그대로 */
  const loadBase = () => {
    if (!eb) return setBase(null);
    setBase({ blocks: JSON.parse(JSON.stringify(eb.blocks)) as unknown[], revision: eb.revision, key: Date.now() });
  };

  const editLock = local ? "순서 고치기는 웹에서만" : !blocks ? "블록 목록을 받는 중" : curNo === "delay" ? "딜레이 행은 고칠 블록이 없음"
    : st?.stopping ? "정지 순서 중"
    : oldBundle ? `장비 정의 v${bundle?.version} 은 순서 고치기 기준 목록을 주지 않음 — 장비 프로그램을 올린 뒤(묶음 ${EDIT_BASE_VERSION}부터)`
    : !eb ? "장비의 기준 목록을 받는 중 — 판이 바뀔 때·10초마다 보냅니다" : lock("PROCESS_EDIT");

  return (
    <Card title={<><ListOrdered size={15} /> 공정 순서</>}
      right={<span className="flex items-center gap-2">
        {revision > 0 && <Chip>판 {revision}</Chip>}
        {!editing && <Btn size="sm" lock={editLock} onClick={() => { setEditing(true); loadBase(); }}>순서 고치기</Btn>}
      </span>}>
      {editing ? (
        base ? (
          <SeqEditor key={base.key} bundle={bundle} base={base.blocks} baseRev={base.revision} revision={revision} lockTop={lockTop}
            runBlocks={blocks ?? []} lock={lock} onAsk={(a) => { setSentRev(base.revision); onAsk(a); }}
            onClose={() => setEditing(false)} onReload={loadBase} reloadReady={!!eb} />
        ) : (
          <div className="space-y-2">
            <Issue level="warn">장비의 기준 목록이 아직 없습니다 — 판이 바뀔 때·10초마다 보냅니다. 잠시 뒤 다시 여세요.</Issue>
            <Btn onClick={() => setEditing(false)}>닫기</Btn>
          </div>
        )
      ) : !blocks ? (
        <Empty>블록 목록을 받는 중… 장비가 바뀔 때·10초마다 보냅니다</Empty>
      ) : (
        <ol className="space-y-1.5">
          {blocks.map((b, i) => (
            <SeqItem key={`${b.no}-${i}`} b={b} bundle={bundle} st={st} current={b.status === "running" || b.status === "paused"}
              lock={lock} onAsk={onAsk} revision={revision} pauseMax={pauseMax} />
          ))}
        </ol>
      )}
      <div className="mt-3 border-t border-[#E3E6EA] pt-2">
        <button onClick={() => setStopOpen((o) => !o)} className={`flex items-center gap-1 ${FS.small} font-semibold text-[#5B6470] hover:text-[#1B1F24]`}>
          {stopOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 정지 순서(고정) 보기
        </button>
        {stopOpen && (
          <ol className={`mt-1 space-y-0.5 ${FS.small} text-[#5B6470]`}>
            {(bundle?.stopSequence?.steps ?? []).map((s) => <li key={s.no}>{s.no}. {s.label || s.desc || s.act}</li>)}
            {!bundle?.stopSequence?.steps?.length && <li>장비 정의에 정지 순서가 없습니다</li>}
          </ol>
        )}
      </div>
    </Card>
  );
}
