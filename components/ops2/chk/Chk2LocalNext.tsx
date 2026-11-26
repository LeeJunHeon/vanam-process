"use client";

// 노트북 로컬 화면의 '다음 공정'(W-14 — 묶음 18, 장비 5-20 ②). 노트북 조작이 열려 있으면(hello.commandKinds 에 PROCESS_START 등)
// 한 행 공정을 바로 만들어 시작(PROCESS_START row·blocks — 열 정의·검사는 묶음과 lib/ops2/chk/recipe.ts 그대로, 수동 시작은 히터 열을
// 쓰지 않음)하고, 장비에 적재된 레시피를 시작·해제한다. 저장된 레시피 목록·편집·설정·이력은 웹에서만(노트북에는 웹 DB 가 없다).
// W-15: 처음에는 적재 상태와 버튼 둘('적재된 레시피 시작'·'값을 넣어 바로 시작…')만. 입력 칸은 누르면 펼치고, 사람이 값을 넣기 전에는
//   검사 오류를 띄우지 않는다(시작 버튼의 잠김 이유로만).
// W-22 F: 웹 레시피 사본 고르기 — 장비가 들고 있는 웹 레시피 사본(로컬 /api/v1/recipes — 웹과 맞춘 시각)에서 고르면 요약·검사를 보이고
//   [적재](RECIPE_LOAD {id, updatedAt} — 장비가 사본의 행을 다시 검사) → [적재 시작]. 히터 레시피는 [히터 레시피 시작](HEATER_RECIPE_RUN
//   {id, updatedAt}). '값을 넣어 바로 시작'은 고른 레시피 첫 행으로 채울 수 있다. 웹이 꺼져 있어도 마지막 사본으로. 편집은 웹에서만.
//   적재 확인창은 레시피 타겟 이름이 장착 타겟(state.targets)과 다르면 알린다(W-22 G). 묶음 22 장비(사본 없음)는 예전 그대로.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronUp, Download, FileText, PenLine, Play, RefreshCw, X } from "lucide-react";
import { checkEnvOf, checkProcessRecipe, devSpOf, manualRow, type Row } from "@/lib/ops2/chk/recipe";
import { FS, Btn, Card, Chip, Issue, KV, type Ask } from "./kit";
import { ProcessEditor, toERows, isBlockRow, type ERow } from "./Chk2RecipeEditor";
import { blockRowLines } from "./Chk2BlockEditor";
import { rowLine } from "./recipeText";
import { useChk2Mode } from "./mode";
import type { Bundle, StateData } from "./types";
import type { LockFn } from "./Chk2Status";
import { MountedRows } from "./Chk2Devices";

type CopyItem = { id: string; kind: string; name: string; rowCount: number; updatedAt: string; updatedBy?: string | null;
  check?: { errors: number; warnings: number; first: string | null } | null };
type CopyList = { syncedAt: string | null; error: string | null; count: number; recipes: CopyItem[] };
type CopyFull = CopyItem & { rows: Record<string, unknown>[]; gas?: Record<string, unknown> | null };
const kst = (iso: string | null | undefined) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(t)) : null;
};

/** 레시피 타겟 이름이 장착 타겟과 다른 Gun — 확인창 경고 줄 */
export function targetMismatch(rows: Record<string, unknown>[], st: StateData | null): string[] {
  const t = st?.targets;
  if (!t) return [];
  const out: string[] = [];
  for (const [g, key, use, label] of [["g1", "g1_target", "gun1", "Gun1"], ["g2", "g2_target", "gun2", "Gun2"]] as const) {
    const m = t[g];
    const want = rows.map((r) => (r[use] === true ? String(r[key] ?? "").trim() : "")).find((x) => x) ?? "";
    if (want && m && want !== m.text && want !== m.name) out.push(`${label} 레시피 타겟 '${want}' 이 장착 타겟 '${m.text}' 과 다릅니다.`);
  }
  return out;
}

export default function Chk2LocalNext({ bundle, st, lock, onAsk }: {
  bundle: Bundle | null; st: StateData | null; lock: LockFn; onAsk: (a: Ask) => void;
}) {
  const { webOnly } = useChk2Mode();
  const devKey = JSON.stringify(devSpOf(st?.snapshot ?? null));
  const env = useMemo(() => {
    const e = checkEnvOf(bundle);
    return e ? { ...e, devSp: JSON.parse(devKey) as Record<string, number | null> | null } : e;
  }, [bundle, devKey]);
  const [rows, setRows] = useState<ERow[]>(() => toERows([{ process_name: "노트북 공정" }]));
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);       // 값을 넣어 바로 시작 — 펼침
  const [touched, setTouched] = useState(false); // 사람이 값을 넣었나(그 전에는 오류 표시 없음)
  const loaded = st?.recipe ?? null;
  const check = useMemo(() => (env ? checkProcessRecipe(rows.map((r) => r.data), env) : null), [env, rows]);
  const canStart = !webOnly("PROCESS_START");
  // 웹 레시피 사본(W-22 F) — 묶음 23 장비만(state.recipeCopy). 맞춘 시각이 바뀌면 다시 읽는다
  const copyOn = st?.recipeCopy !== undefined && st?.recipeCopy !== null;
  const syncedAt = st?.recipeCopy?.syncedAt ?? null;
  const [list, setList] = useState<CopyList | null>(null);
  const [pick, setPick] = useState<CopyFull | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const fetchList = useCallback(() => fetch("/api/v1/recipes", { cache: "no-store" })
    .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json() as CopyList; }), []);
  const apply = useCallback((p: Promise<CopyList>) => p.then((l) => { setList(l); setListErr(null); },
    (e) => setListErr(`목록을 읽지 못했습니다(${(e as Error).message})`)), []);
  const loadList = () => void apply(fetchList());
  useEffect(() => { if (copyOn) void apply(fetchList()); }, [copyOn, syncedAt, apply, fetchList]);
  const choose = async (id: string) => {
    if (!id) { setPick(null); return; }
    try {
      const r = await fetch(`/api/v1/recipes/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPick(await r.json() as CopyFull);
    } catch (e) { setListErr(`레시피를 읽지 못했습니다(${(e as Error).message})`); }
  };
  // 고른 레시피가 사본에서 바뀌었나(웹에서 고침) — 목록의 updatedAt 과 다르면 다시 읽게
  const stale = pick && list ? list.recipes.find((r) => r.id === pick.id)?.updatedAt !== pick.updatedAt : false;
  const pickCheck = useMemo(() => (env && pick && pick.kind === "process" ? checkProcessRecipe(pick.rows as Row[], env) : null), [env, pick]);
  const loadWhy = !pick ? "레시피를 고르세요" : stale ? "사본이 바뀌어 다시 골라야 함" : pick.kind !== "process" ? "공정 레시피가 아님"
    : loaded ? "장비에 레시피가 적재돼 있어 해제한 뒤 적재할 수 있음" : pickCheck && pickCheck.errors > 0 ? `검사 오류 ${pickCheck.errors}개를 웹에서 고친 뒤 적재할 수 있음` : lock("RECIPE_LOAD");
  const heaterWhy = !pick ? "레시피를 고르세요" : stale ? "사본이 바뀌어 다시 골라야 함" : pick.kind !== "heater" ? "히터 레시피가 아님" : lock("HEATER_RECIPE_RUN");
  const askLoad = () => {
    if (!pick) return;
    onAsk({ kind: "RECIPE_LOAD", label: "웹 레시피 적재", detail: `'${pick.name}'`, args: { id: pick.id, updatedAt: pick.updatedAt },
      lines: [`'${pick.name}' · ${pick.rows.length}행 · 웹 수정 ${kst(pick.updatedAt) ?? pick.updatedAt}`, ...targetMismatch(pick.rows, st)],
      note: "장비가 사본의 행을 다시 검사해 적재합니다. 시작은 [적재된 레시피 시작]으로 합니다." });
  };
  const askHeater = () => {
    if (!pick) return;
    onAsk({ kind: "HEATER_RECIPE_RUN", label: "히터 레시피 시작", detail: `'${pick.name}'`, args: { id: pick.id, updatedAt: pick.updatedAt }, red: true,
      lines: [`'${pick.name}' · ${pick.rows.length}단계 · 웹 수정 ${kst(pick.updatedAt) ?? pick.updatedAt}`], note: "히터 레시피를 시작합니다." });
  };
  const fillFrom = () => {
    const first = pick?.rows?.find((r) => r && typeof r === "object") as Row | undefined;
    if (!first) return;
    setRows(toERows([{ ...first, process_name: String(first.process_name ?? pick?.name ?? "노트북 공정") }]));
    setTouched(true);
    setOpen(true);
  };

  const rowWhy = (i: number): string | null => {
    const rc = check?.rows[i];
    if (!env || !rc) return "장비 정보를 받는 중이라 검사할 수 없음";
    if (rc.kind === "delay") return "대기 행은 바로 시작할 수 없음";
    if (rc.kind === "blocks") {
      if (rc.errors.length) return `검사 오류 ${rc.errors.length}개를 고친 뒤 시작할 수 있음`;
    } else {
      if (rc.kind !== "row") return "내용 없는 행";
      const m = checkProcessRecipe([manualRow(rows[i]?.data ?? {})], env);
      if (m.errors) return `검사 오류 ${m.errors}개를 고친 뒤 시작할 수 있음`;
    }
    if (loaded) return "장비에 레시피가 적재돼 있어 해제한 뒤 시작할 수 있음";
    return lock("PROCESS_START");
  };
  const askRow = (i: number) => {
    const data = rows[i]?.data;
    if (!data) return;
    if (isBlockRow(data)) {
      const name = typeof data.process_name === "string" && data.process_name ? data.process_name : "노트북 공정";
      onAsk({ kind: "PROCESS_START", label: "공정 바로 시작", detail: `'${name}'`, args: { blocks: data.blocks, name }, red: true,
              lines: blockRowLines(data, check?.rows[i] ?? null), note: "공정을 시작합니다. 가스·파워·셔터가 움직입니다." });
      return;
    }
    const row = manualRow(data);
    onAsk({ kind: "PROCESS_START", label: "한 행 바로 시작", detail: `'${String(row.process_name ?? "")}'`, args: { row }, red: true,
            lines: [rowLine(row as Row), data.use_heater === true ? "수동 시작은 히터 열을 쓰지 않음(장비 규칙)" : "히터를 쓰지 않음"],
            note: "공정을 시작합니다. 가스·파워·셔터가 움직입니다." });
  };

  return (
    <Card title="다음 공정">
      <div className="space-y-3">
        {copyOn && (
          <div className={`space-y-2 rounded-[10px] border border-[#E3E6EA] px-3 py-2 ${FS.body}`}>
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-[#1B1F24]">웹 레시피</b>
              <span className={`${FS.small} text-[#5B6470]`}>
                {syncedAt ? `웹과 맞춘 시각 ${kst(syncedAt)}` : "아직 웹과 맞춘 적 없음"}{st?.recipeCopy?.error ? " · 마지막 사본으로 고릅니다" : ""}
              </span>
              <span className="ml-auto"><Btn size="sm" onClick={loadList} title="장비의 사본 목록을 다시 읽습니다."><RefreshCw size={13} /> 목록</Btn></span>
            </div>
            <label className="flex flex-wrap items-center gap-2">
              <span className="text-[#5B6470]">레시피</span>
              <select aria-label="웹 레시피" value={pick?.id ?? ""} onChange={(e) => void choose(e.target.value)}
                className={`h-10 min-w-0 max-w-full flex-1 rounded-[8px] border border-[#D9DDE3] bg-white px-2 ${FS.body}`}>
                <option value="">고르세요{list ? ` (${list.count}개)` : ""}</option>
                {(list?.recipes ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.kind === "heater" ? "[히터] " : ""}{r.name} · {r.rowCount}{r.kind === "heater" ? "단계" : "행"}{r.check?.errors ? ` · 오류 ${r.check.errors}` : ""}</option>
                ))}
              </select>
            </label>
            {listErr && <Issue level="warn">{listErr}</Issue>}
            {pick && (
              <div className="space-y-1.5">
                <p className={`flex flex-wrap items-center gap-2 ${FS.small} text-[#5B6470]`}>
                  <FileText size={13} /> {pick.kind === "heater" ? "히터 레시피" : "공정 레시피"} · {pick.rows.length}{pick.kind === "heater" ? "단계" : "행"} · 웹 수정 {kst(pick.updatedAt)}{pick.updatedBy ? ` · ${pick.updatedBy}` : ""}
                  {pick.check && <Chip tone={pick.check.errors ? "warn" : "neutral"}>웹 검사 오류 {pick.check.errors} · 경고 {pick.check.warnings}</Chip>}
                  {pickCheck && pickCheck.errors > 0 && <Chip tone="warn">이 장비 검사 오류 {pickCheck.errors}</Chip>}
                  {stale && <Chip tone="warn">웹에서 바뀌어 다시 골라야 함</Chip>}
                </p>
                {pick.kind === "process" && (
                  <ul className={`${FS.small} text-[#1B1F24]`}>
                    {pick.rows.slice(0, 4).map((r, i) => <li key={i} className="break-words">{i + 1}. {isBlockRow(r as Row) ? (blockRowLines(r as Row, pickCheck?.rows[i] ?? null)[0] ?? "단계 목록") : rowLine(r as Row)}</li>)}
                    {pick.rows.length > 4 && <li className="text-[#5B6470]">… {pick.rows.length - 4}행 더</li>}
                  </ul>
                )}
                {pick.kind === "process" && targetMismatch(pick.rows, st).map((t) => <Issue key={t} level="warn">{t}</Issue>)}
                <div className="flex flex-wrap items-center gap-2">
                  {pick.kind === "process" && !webOnly("RECIPE_LOAD") && (
                    <Btn kind="primary" lock={loadWhy} onClick={askLoad}><Download size={14} /> 적재</Btn>
                  )}
                  {pick.kind === "heater" && !webOnly("HEATER_RECIPE_RUN") && (
                    <Btn kind="primary" lock={heaterWhy} onClick={askHeater}><Play size={14} /> 히터 레시피 시작</Btn>
                  )}
                  {pick.kind === "process" && canStart && <Btn onClick={fillFrom} title="고른 레시피 첫 행으로 '값을 넣어 바로 시작' 칸을 채웁니다."><PenLine size={14} /> 값 채워 바로 시작…</Btn>}
                </div>
              </div>
            )}
            <MountedRows st={st} compact />
          </div>
        )}
        <div className={`flex flex-wrap items-center gap-2 rounded-[10px] border border-[#E3E6EA] px-3 py-2 ${FS.body}`}>
          {loaded ? (
            <>
              <span className="text-[#5B6470]">장비에 적재됨</span><b className="text-[#1B1F24]">{loaded.name || "이름 없음"}</b>
              <span className="text-[#5B6470]">· {loaded.rows ?? "-"}행</span>
              <span className="ml-auto flex gap-2">
                {!webOnly("RECIPE_START") && (
                  <Btn size="lg" kind="primary" lock={loaded.listActive ? "진행 중" : lock("RECIPE_START")}
                    onClick={() => onAsk({ kind: "RECIPE_START", label: "적재 레시피 시작", detail: `'${loaded.name ?? ""}'`, red: true,
                      lines: [`장비에 적재된 '${loaded.name || "이름 없음"}' · ${loaded.rows ?? "-"}행`], note: "공정을 시작합니다. 가스·파워·셔터가 움직입니다." })}>
                    <Play size={14} /> 적재된 레시피 시작
                  </Btn>
                )}
                {!webOnly("RECIPE_CLEAR") && (
                  <Btn lock={lock("RECIPE_CLEAR")}
                    onClick={() => onAsk({ kind: "RECIPE_CLEAR", label: "적재 해제", detail: `'${loaded.name}'`, note: "장비에 올린 행 목록을 내립니다." })}>
                    <X size={14} /> 적재 해제
                  </Btn>
                )}
              </span>
            </>
          ) : <span className="text-[#5B6470]">장비에 적재된 공정 레시피 없음</span>}
          {canStart && !open && (
            <span className={loaded ? "" : "ml-auto"}>
              <Btn onClick={() => setOpen(true)}><PenLine size={14} /> 값을 넣어 바로 시작…</Btn>
            </span>
          )}
        </div>
        {canStart && open ? (
          <div className="space-y-2 rounded-[10px] border border-[#E3E6EA] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <b className={`${FS.body} text-[#1B1F24]`}>값을 넣어 바로 시작</b>
              {touched && check && check.errors > 0 && <Chip tone="warn">검사 오류 {check.errors}</Chip>}
              <span className="ml-auto"><Btn size="sm" kind="ghost" onClick={() => setOpen(false)}><ChevronUp size={13} /> 접기</Btn></span>
            </div>
            <p className={`${FS.small} text-[#5B6470]`}>
              값을 넣고 그 줄의 시작을 누르세요. {copyOn ? "저장된 레시피는 위 '웹 레시피'에서 고릅니다." : "저장된 레시피는 웹에서 고릅니다."}
            </p>
            {!env && <Issue level="warn">장비 정보를 받는 중입니다.</Issue>}
            <ProcessEditor cols={bundle?.recipe?.processColumns ?? []} rows={rows} check={touched ? check : null} env={env?.blocks ?? null} bundle={bundle}
              readOnly={false} reveal sel={sel ?? rows[0]?.uid ?? null} onSel={setSel} onRows={(f) => { setTouched(true); setRows((l) => f(l)); }}
              rowStartWhy={rowWhy} onStartRow={askRow} />
          </div>
        ) : canStart ? null : (
          <KV k="공정 시작"><span className={`${FS.small} text-[#5B6470]`}>노트북 조작이 꺼져 있어 웹 화면에서만 시작할 수 있음</span></KV>
        )}
      </div>
    </Card>
  );
}
