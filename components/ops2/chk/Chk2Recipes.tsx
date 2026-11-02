"use client";

// 챔버K v2 레시피 탭(W-10) — 공정 레시피(v1 행·대기 행·블록 공정)와 히터 레시피(스텝 + 첫 행 가스)를 웹에 저장(ops2_recipe)·편집하고 장비에 보낸다.
// 목록 표: 이름·종류·행 수·요약·검사(서버 검사)·수정 시각 + [적재] [편집] ⋮(복제·이름 바꾸기·삭제), [새 레시피].
// 편집은 탭 안 넓은 화면(목록 자리) — 위 줄: ← 목록 · 이름 · 상태 칩 하나(오류 n — 누르면 첫 오류로 / 저장 안 됨 · 변경 n곳) ·
//   [취소] [다른 이름으로 저장] [저장], 적재·실행은 저장된 최신 + 웹 검사 오류 없음일 때만(막히면 버튼 옆에 이유).
//   공정 레시피 3단 = Chk2RecipeEditor.ProcessEditor, 히터 = HeaterEditor.
// 웹 검사는 장비와 같은 계산(lib/ops2/chk/recipe.ts·blocks.ts — 골든으로 확인), 마지막 판단은 장비. 묶음 version 이 검사 기준과 다르면 안내만.
// 저장은 오류가 있어도 된다(지금 규칙 — 서버 검사 결과를 알림에), 적재·한 행 바로 시작·히터 레시피 실행은 오류가 없어야.
import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import { BookOpen, FilePlus2, Flame, MoreVertical, Pencil, Save, Upload } from "lucide-react";
import { createPortal } from "react-dom";
import {
  checkEnvOf, checkHeaterRecipe, checkOutdated, checkProcessRecipe, manualRow, GOLDEN_EXPORT_VERSION, type Row,
} from "@/lib/ops2/chk/recipe";
import { fmtKst } from "@/lib/ops2/time";
import { Btn, Card, Chip, Empty, Issue, Modal, SimpleConfirm, Tabs, type Ask, type Notice } from "./kit";
import { useChk2Mode } from "./mode";
import { HeaterEditor, ProcessEditor, isBlockRow, toERows, type ERow } from "./Chk2RecipeEditor";
import { blockRowLines } from "./Chk2BlockEditor";
import { heaterLines, processLines, rowLine, v } from "./recipeText";
import { RECIPE_ERROR, type RecipeFull, type RecipeItem, type RecipeKind, type useRecipes } from "./useRecipes";
import type { Bundle, StateData } from "./types";
import type { LockFn } from "./Chk2Status";

type Draft = {
  id: string | null; kind: RecipeKind; name: string; rows: ERow[]; gas: Row; updatedAt: string | null;
  base: string; baseRows: string[];              // 마지막으로 저장(또는 연) 내용 — 바뀌었는지·몇 곳인지
};
const snap = (d: Pick<Draft, "name" | "rows" | "gas">) => JSON.stringify([d.name.trim(), d.rows.map((r) => r.data), d.gas]);
const mk = (d: Omit<Draft, "base" | "baseRows">): Draft => ({ ...d, base: snap(d), baseRows: d.rows.map((r) => JSON.stringify(r.data)) });
const fromFull = (r: RecipeFull): Draft => mk({ id: r.id, kind: r.kind, name: r.name, rows: toERows(r.rows as Row[]), gas: { ...(r.gas ?? {}) }, updatedAt: r.updatedAt });
const gasOrNull = (g: Row) => (Object.keys(g).length ? g : null);
const KIND: Record<RecipeKind, string> = { process: "공정", heater: "히터" };

/** ⋮ 메뉴 — 표에 잘리지 않게 화면 기준(portal) */
function Menu({ anchor, onClose, items }: { anchor: HTMLElement; onClose: () => void; items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const a = anchor.getBoundingClientRect();
  const top = a.bottom + 4 + 160 > window.innerHeight ? Math.max(8, a.top - 164) : a.bottom + 4;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[85]" onClick={onClose} />
      <div style={{ left: Math.max(8, Math.min(a.right - 176, window.innerWidth - 184)), top }}
        className="fixed z-[86] w-44 rounded-[10px] border border-[#D9DDE3] bg-white p-1 text-xs shadow-lg">
        {items.map((it) => (
          <button key={it.label} onClick={() => { onClose(); it.onClick(); }}
            className={`flex w-full rounded-[8px] px-2 py-2 text-left hover:bg-[#F5F6F8] ${it.danger ? "text-[#B42318]" : "text-[#1B1F24]"}`}>{it.label}</button>
        ))}
      </div>
    </>,
    document.body,
  );
}

export default function Chk2Recipes({ bundle, st, recipes, lock, onAsk, notify, dirtyRef, listOnly, openReq }: {
  bundle: Bundle | null; st: StateData | null; recipes: ReturnType<typeof useRecipes>;
  lock: LockFn; onAsk: (a: Ask) => void; notify: (n: Omit<Notice, "id" | "at">) => void;
  dirtyRef: MutableRefObject<boolean>;           // 저장 안 한 변경 — 탭·장비를 바꿀 때 화면이 묻는다
  listOnly?: boolean;                            // 장비 정의(열)를 받지 못한 장비 — 목록 보기만
  openReq?: { id: string | null; n: number } | null;   // 운전 탭 '레시피 편집' — 이 레시피를 연다(n 이 바뀔 때마다)
}) {
  const { detail } = useChk2Mode();
  const [filter, setFilter] = useState<"all" | RecipeKind>("all");
  const [reveal, setReveal] = useState(false);   // 검사 문구를 모두 보이기(저장·적재를 누른 뒤, 저장된 레시피)
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ what: "leave"; then: () => void } | { what: "delete"; item: RecipeItem } | null>(null);
  const [nameModal, setNameModal] = useState<{ mode: "saveAs" | "rename"; item?: RecipeItem; name: string } | null>(null);
  const [menu, setMenu] = useState<{ item: RecipeItem; el: HTMLElement } | null>(null);
  const [busy, setBusy] = useState(false);

  const env = useMemo(() => checkEnvOf(bundle), [bundle]);
  const outdated = checkOutdated(bundle);
  const dirty = !!draft && snap(draft) !== draft.base;
  const readOnly = !recipes.canEdit || !!listOnly;

  useEffect(() => {
    dirtyRef.current = dirty;
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      dirtyRef.current = false;
    };
  }, [dirty, dirtyRef]);

  const dRows = draft?.rows, dKind = draft?.kind, dGas = draft?.gas;
  const rowsData = useMemo(() => dRows?.map((r) => r.data) ?? [], [dRows]);
  const pCheck = useMemo(() => (env && dKind === "process" ? checkProcessRecipe(rowsData, env) : null), [env, dKind, rowsData]);
  const hCheck = useMemo(() => (env && dKind === "heater" ? checkHeaterRecipe(rowsData, gasOrNull(dGas ?? {}), env) : null), [env, dKind, dGas, rowsData]);
  const errCount = pCheck ? pCheck.errors : hCheck ? hCheck.errors.length : 0;
  const changed = draft ? draft.rows.filter((r, i) => JSON.stringify(r.data) !== draft.baseRows[i]).length
    + Math.max(0, draft.baseRows.length - draft.rows.length) + (draft.name.trim() !== (JSON.parse(draft.base) as unknown[])[0] ? 1 : 0) : 0;

  /** 저장 안 한 변경이 있으면 묻고 나서 */
  const leave = useCallback((then: () => void) => {
    if (dirty) setConfirm({ what: "leave", then });
    else then();
  }, [dirty]);

  const open = useCallback((item: RecipeItem) => leave(async () => {
    const r = await recipes.get(item.id);
    if (!r.ok) return notify({ tone: "bad", title: `레시피 '${item.name}' — 열지 못함`, text: RECIPE_ERROR[r.error] ?? r.error });
    const d = fromFull(r.data.recipe);
    setReveal(true);
    setDraft(d);
    setSel(d.rows[0]?.uid ?? null);
  }), [leave, recipes, notify]);
  const create = (kind: RecipeKind) => leave(() => {
    const d = mk({ id: null, kind, name: "", rows: toERows([{}]), gas: {}, updatedAt: null });
    setReveal(false);
    setDraft(d);
    setSel(d.rows[0].uid);
  });

  // 운전 탭 '레시피 편집' — 그 레시피를 연다
  const reqN = openReq?.n;
  useEffect(() => {
    if (!reqN || !openReq?.id) return;
    const it = recipes.list?.find((r) => r.id === openReq.id);
    const t = setTimeout(() => { if (it) open(it); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 요청(n)마다 한 번
  }, [reqN]);

  const save = async (asName?: string) => {
    if (!draft) return;
    setReveal(true);
    const name = (asName ?? draft.name).trim();
    if (!name) return;
    setBusy(true);
    const body = { kind: draft.kind, name, rows: draft.rows.map((r) => r.data), gas: draft.kind === "heater" ? gasOrNull(draft.gas) : null };
    const r = await recipes.save(body, asName !== undefined ? null : draft.id, draft.updatedAt);
    setBusy(false);
    if (!r.ok) {
      return notify({ tone: "bad", title: `레시피 '${name}' — 저장 못 함`,
                      text: `${RECIPE_ERROR[r.error] ?? r.error}${r.detail && !RECIPE_ERROR[r.error] ? ` · ${r.detail}` : ""}` });
    }
    const c = r.data.check;
    const at = sel ? draft.rows.findIndex((x) => x.uid === sel) : -1;
    const next = fromFull(r.data.recipe);
    setDraft(next);
    setSel(at >= 0 ? next.rows[at]?.uid ?? null : next.rows[0]?.uid ?? null);
    notify({ tone: c?.errors ? "warn" : "ok", title: `레시피 '${name}' — 저장함`,
             text: c ? `서버 검사: 오류 ${c.errors} · 경고 ${c.warnings}${c.first ? ` — ${c.first}` : ""}${c.errors ? " · 오류를 고쳐야 적재할 수 있습니다" : ""}`
               : "서버 검사 없음(장비 정의에 레시피 열이 없음)" });
  };
  const cancelEdit = () => {
    if (!draft) return;
    if (!draft.id) return leave(() => setDraft(null));
    const base = JSON.parse(draft.base) as [string, Row[], Row];
    const d = mk({ id: draft.id, kind: draft.kind, name: base[0], rows: toERows(base[1]), gas: base[2], updatedAt: draft.updatedAt });
    setDraft(d);
    setSel(d.rows[0]?.uid ?? null);
  };

  const remove = async (item: RecipeItem) => {
    setConfirm(null);
    const r = await recipes.remove(item.id);
    if (!r.ok) return notify({ tone: "bad", title: `레시피 '${item.name}' — 지우지 못함`, text: RECIPE_ERROR[r.error] ?? r.error });
    notify({ tone: "ok", title: `레시피 '${item.name}' — 지움` });
    if (draft?.id === item.id) setDraft(null);
  };
  const duplicate = async (item: RecipeItem) => {
    const r = await recipes.get(item.id);
    if (!r.ok) return notify({ tone: "bad", title: `레시피 '${item.name}' — 복제 못 함`, text: RECIPE_ERROR[r.error] ?? r.error });
    const names = new Set((recipes.list ?? []).map((x) => x.name));
    let name = `${item.name} 복사`;
    for (let n = 2; names.has(name); n++) name = `${item.name} 복사 ${n}`;
    const s = await recipes.save({ kind: item.kind, name, rows: r.data.recipe.rows, gas: r.data.recipe.gas }, null, null);
    notify(s.ok ? { tone: "ok", title: `레시피 '${name}' — 복제함` } : { tone: "bad", title: "복제 못 함", text: RECIPE_ERROR[s.error] ?? s.error });
  };
  const rename = async (item: RecipeItem, name: string) => {
    const r = await recipes.get(item.id);
    if (!r.ok) return notify({ tone: "bad", title: "이름 바꾸기 못 함", text: RECIPE_ERROR[r.error] ?? r.error });
    const f = r.data.recipe;
    const s = await recipes.save({ kind: f.kind, name, rows: f.rows, gas: f.gas }, f.id, f.updatedAt);
    notify(s.ok ? { tone: "ok", title: `이름 바꿈 — '${name}'` } : { tone: "bad", title: "이름 바꾸기 못 함", text: RECIPE_ERROR[s.error] ?? s.error });
  };

  // ── 장비 조작 ──
  const loaded = st?.recipe ?? null;
  const askLoadFull = (f: { name: string; rows: Row[] }) => {
    const chk = env ? checkProcessRecipe(f.rows, env) : null;
    if (chk?.errors) return notify({ tone: "bad", title: `레시피 '${f.name}' — 적재 못 함`, text: `검사 오류 ${chk.errors}개 — 고친 뒤 적재하세요` });
    onAsk({ kind: "RECIPE_LOAD", label: "공정 레시피 적재", detail: `'${f.name}'`, args: { name: f.name, rows: f.rows },
            lines: processLines(f.name, f.rows, chk), note: "장비에 행 목록을 올립니다(검사 뒤 적재). 시작은 운전 탭 '적재 시작'." });
  };
  const listLoad = async (item: RecipeItem) => {
    const r = await recipes.get(item.id);
    if (!r.ok) return notify({ tone: "bad", title: `레시피 '${item.name}' — 읽지 못함`, text: RECIPE_ERROR[r.error] ?? r.error });
    askLoadFull({ name: r.data.recipe.name, rows: r.data.recipe.rows as Row[] });
  };
  const savedWhy = !draft ? null : !draft.id ? "저장한 뒤" : dirty ? "저장한 뒤(저장 안 한 변경이 있음)" : null;
  const loadWhy = !draft || draft.kind !== "process" ? null : !env ? "장비 정의를 아직 받지 못함" : savedWhy
    ? `${savedWhy} 적재` : errCount ? `오류 ${errCount}개를 고쳐야 적재할 수 있습니다` : lock("RECIPE_LOAD");
  const runWhy = !draft || draft.kind !== "heater" ? null : !env ? "장비 정의를 아직 받지 못함" : savedWhy
    ? `${savedWhy} 실행` : errCount ? `오류 ${errCount}개를 고쳐야 실행할 수 있습니다` : lock("HEATER_RECIPE_RUN");
  const rowWhy = (i: number): string | null => {
    const rc = pCheck?.rows[i];
    if (!env || !rc) return "검사 없음";
    if (rc.kind === "delay") return "대기 행은 바로 시작할 수 없음";
    if (savedWhy) return `${savedWhy} 시작`;
    if (rc.kind === "blocks") {
      if (rc.errors.length) return `검사 오류 ${rc.errors.length}개 — 고친 뒤`;
    } else {
      if (rc.kind !== "row") return "내용 없는 행";
      const m = checkProcessRecipe([manualRow(draft?.rows[i]?.data ?? {})], env);
      if (m.errors) return `검사 오류 ${m.errors}개 — 고친 뒤`;
    }
    if (loaded) return "장비에 레시피가 적재돼 있음 — 해제한 뒤";
    return lock("PROCESS_START");
  };
  const askStartRow = (i: number) => {
    const data = draft?.rows[i]?.data;
    if (!data) return;
    if (isBlockRow(data)) {
      const name = typeof data.process_name === "string" && data.process_name ? data.process_name : `${draft?.name || "블록 공정"} ${i + 1}행`;
      onAsk({ kind: "PROCESS_START", label: "블록 공정 바로 시작", detail: `${i + 1}행 '${name}'`, args: { blocks: data.blocks, name },
              red: true, lines: [`레시피 '${draft?.name}' ${i + 1}행`, ...blockRowLines(data, pCheck?.rows[i] ?? null)],
              note: "공정을 시작합니다 — 가스·파워·셔터가 움직입니다(블록 순서 그대로)." });
      return;
    }
    const row = manualRow(data);
    onAsk({ kind: "PROCESS_START", label: "한 행 바로 시작", detail: `${i + 1}행 '${v(row.process_name)}'`, args: { row }, red: true,
            lines: [`레시피 '${draft?.name}' ${i + 1}행`, rowLine(row),
                    data.use_heater === true ? "수동 시작은 히터 열을 쓰지 않음(장비 규칙) — 히터 목표는 보내지 않음" : "히터 안 씀"],
            note: "공정을 시작합니다 — 가스·파워·셔터가 움직입니다." });
  };
  const askHeaterRun = () => {
    if (!draft) return;
    const steps = draft.rows.map((r) => r.data), gas = gasOrNull(draft.gas);
    onAsk({ kind: "HEATER_RECIPE_RUN", label: "히터 레시피 실행", detail: `'${draft.name}'`, args: { name: draft.name, steps, gas },
            red: true, lines: heaterLines(draft.name, steps, gas), note: "히터를 켜고 스텝대로 온도를 올립니다." });
  };
  const goFirstError = () => {
    setReveal(true);
    if (!draft) return;
    const k = draft.kind === "process" ? (pCheck?.rows.findIndex((r) => r.errors.length) ?? -1)
      : draft.rows.findIndex((_, i) => hCheck?.errors.some((e) => e.startsWith(`스텝 ${i + 1}: `)));
    if (k >= 0) setSel(draft.rows[k].uid);
  };

  const list = (recipes.list ?? []).filter((r) => filter === "all" || r.kind === filter);
  const banner = (
    <>
      {outdated && (
        <Issue level="warn">
          {(bundle?.version ?? 0) > GOLDEN_EXPORT_VERSION
            ? `웹 검사 기준이 장비보다 옛것 — 장비 판단만 믿을 것(웹 검사 v${GOLDEN_EXPORT_VERSION}, 장비 정의 v${bundle?.version})`
            : `장비 정의가 웹 검사 기준보다 옛것 — 장비 판단만 믿을 것(장비 정의 v${bundle?.version}, 웹 검사 v${GOLDEN_EXPORT_VERSION})`}
        </Issue>
      )}
      {!env && bundle && <p className="text-[11px] text-[#5B6470]">장비 정의에 레시피 열이 없어 웹 검사를 하지 않습니다 — 장비 판단만.</p>}
      {recipes.error && <Issue level="alarm">{recipes.error}</Issue>}
    </>
  );

  if (draft) {
    const statusChip = errCount
      ? <button onClick={goFirstError} title="누르면 첫 오류로"><Chip tone="alarm">오류 {errCount}{dirty ? " · 저장 안 됨" : ""}</Chip></button>
      : dirty ? <Chip tone="warn">저장 안 됨 · 변경 {changed}곳</Chip> : <Chip>{draft.id ? "저장됨 · 검사 통과" : "새 레시피"}</Chip>;
    const why = draft.kind === "process" ? loadWhy : runWhy;
    return (
      <Card>
        <div className="space-y-3">
          {banner}
          <div className="flex flex-wrap items-center gap-2">
            <Btn kind="ghost" onClick={() => leave(() => setDraft(null))}>← 목록</Btn>
            <Chip>{KIND[draft.kind]} 레시피</Chip>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={readOnly}
              placeholder="레시피 이름(1~80자)" maxLength={80} aria-label="레시피 이름"
              className="h-10 min-w-0 flex-1 rounded-[10px] border border-[#D9DDE3] px-3 text-sm font-semibold disabled:bg-[#F5F6F8]" />
            {statusChip}
            {!readOnly && (
              <>
                <Btn kind="ghost" disabled={busy || (!dirty && !!draft.id)} onClick={cancelEdit}>취소</Btn>
                {draft.id && <Btn disabled={busy} onClick={() => setNameModal({ mode: "saveAs", name: `${draft.name} 복사` })}>다른 이름으로 저장</Btn>}
                <Btn kind="primary" size="lg" lock={!draft.name.trim() ? "이름을 넣으세요" : busy ? "저장 중" : null}
                  disabled={!!draft.id && !dirty} onClick={() => void save()}><Save size={14} /> 저장</Btn>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {draft.id && <span className="mr-auto text-[11px] text-[#5B6470]">마지막 수정 {fmtKst(draft.updatedAt)}{readOnly && " · 조회만(저장은 장비 담당자·관리자)"}</span>}
            {why && <span className="text-[11px] text-[#5B6470]">{why}</span>}
            {draft.kind === "process"
              ? <Btn kind="primary" lock={loadWhy} onClick={() => { setReveal(true); askLoadFull({ name: draft.name, rows: draft.rows.map((r) => r.data) }); }}><Upload size={14} /> 적재</Btn>
              : <Btn kind="dangerSolid" lock={runWhy} onClick={() => { setReveal(true); askHeaterRun(); }}><Flame size={14} /> 히터 레시피 실행</Btn>}
          </div>
          {errCount > 0 && <Issue level="warn">오류를 고쳐야 적재·실행할 수 있습니다(저장은 됩니다). &apos;오류 {errCount}&apos;를 누르면 첫 오류로 갑니다.</Issue>}
          {reveal && pCheck && pCheck.listErrors.length > 0 && <Issue level="alarm">{pCheck.listErrors.join(" · ")}</Issue>}

          {draft.kind === "process" ? (
            <ProcessEditor cols={bundle?.recipe?.processColumns ?? []} rows={draft.rows} check={pCheck} env={env?.blocks ?? null} bundle={bundle}
              readOnly={readOnly} reveal={reveal} sel={sel} onSel={setSel}
              onRows={(f) => setDraft((d) => (d ? { ...d, rows: f(d.rows) } : d))} rowStartWhy={rowWhy} onStartRow={askStartRow} />
          ) : (
            <HeaterEditor stepCols={bundle?.recipe?.heaterStepColumns ?? []} gasCols={bundle?.recipe?.heaterGasColumns ?? []}
              steps={draft.rows} gas={draft.gas} errors={hCheck?.errors ?? []} warnings={hCheck?.warnings ?? []} bundle={bundle}
              readOnly={readOnly} reveal={reveal} sel={sel} onSel={setSel}
              onSteps={(f) => setDraft((d) => (d ? { ...d, rows: f(d.rows) } : d))} onGas={(g) => setDraft((d) => (d ? { ...d, gas: g } : d))} />
          )}
        </div>
        {confirm?.what === "leave" && (
          <SimpleConfirm title="저장 안 됨" ok="버리고 나가기" danger text="저장하지 않은 변경이 있습니다. 버리고 나갈까요?"
            onCancel={() => setConfirm(null)} onOk={() => { const t = confirm.then; setConfirm(null); t(); }} />
        )}
        {nameModal?.mode === "saveAs" && (
          <Modal title="다른 이름으로 저장" onClose={() => setNameModal(null)}
            footer={<><Btn kind="ghost" onClick={() => setNameModal(null)}>취소</Btn>
              <Btn kind="primary" lock={!nameModal.name.trim() ? "이름을 넣으세요" : null}
                onClick={() => { const n = nameModal.name; setNameModal(null); void save(n); }}>새로 저장</Btn></>}>
            <input value={nameModal.name} onChange={(e) => setNameModal({ ...nameModal, name: e.target.value })} maxLength={80} aria-label="새 이름"
              className="h-10 w-full rounded-[10px] border border-[#D9DDE3] px-3 text-sm" />
          </Modal>
        )}
      </Card>
    );
  }

  return (
    <Card title={<><BookOpen size={15} /> 레시피</>}
      right={!readOnly && (
        <span className="flex gap-2">
          <Btn kind="primary" onClick={() => create("process")}><FilePlus2 size={14} /> 새 공정 레시피</Btn>
          <Btn onClick={() => create("heater")}><FilePlus2 size={14} /> 새 히터 레시피</Btn>
        </span>
      )}>
      <div className="space-y-3">
        {banner}
        {loaded && (
          <p className="text-xs text-[#5B6470]">
            장비에 적재됨 <b className="text-[#1B1F24]">{loaded.name || "이름 없음"}</b> · {loaded.rows ?? "-"}행 — 시작·해제는 운전 탭
          </p>
        )}
        <Tabs small value={filter} onChange={setFilter}
          tabs={[{ key: "all", label: "전체" }, { key: "process", label: "공정" }, { key: "heater", label: "히터" }]} />
        <div className="overflow-x-auto rounded-[10px] border border-[#E3E6EA]">
          <table className="min-w-full text-xs">
            <thead className="bg-[#F5F6F8] text-[11px] text-[#5B6470]">
              <tr>
                {["이름", "종류", "행 수", "요약", "검사", "수정 시각", ""].map((h, i) => (
                  <th key={i} className={`px-3 py-2 font-semibold ${h === "행 수" ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const isLoaded = r.kind === "process" && loaded?.name === r.name;
                const running = r.kind === "heater" && st?.heaterRecipe?.name === r.name;
                return (
                  <tr key={r.id} className="border-t border-[#E3E6EA] hover:bg-[#F5F6F8]">
                    <td className="px-3 py-2">
                      <button onClick={() => open(r)} className="text-left font-semibold text-[#1B1F24] hover:underline">{r.name}</button>
                      {isLoaded && <Chip className="ml-1.5" tone="info">장비에 적재됨</Chip>}
                      {running && <Chip className="ml-1.5" tone="info">실행 중</Chip>}
                    </td>
                    <td className="px-3 py-2 text-[#5B6470]">{KIND[r.kind]}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1B1F24]">{r.rowCount}</td>
                    <td className="max-w-[18rem] truncate px-3 py-2 text-[#5B6470]" title={r.check?.first ?? undefined}>
                      {r.check?.errors && r.check.first ? r.check.first : `${r.updatedBy}${detail && r.bundleVersion ? ` · 장비 정의 v${r.bundleVersion}` : ""}`}
                    </td>
                    <td className="px-3 py-2">
                      {!r.check ? <Chip>검사 없음</Chip> : r.check.errors ? <Chip tone="alarm">오류 {r.check.errors}</Chip>
                        : r.check.warnings ? <Chip tone="warn">경고 {r.check.warnings}</Chip> : <Chip>통과</Chip>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[#5B6470]">{fmtKst(r.updatedAt)}</td>
                    <td className="px-3 py-2">
                      <span className="flex justify-end gap-1.5">
                        {r.kind === "process" && (
                          <Btn size="sm" lock={r.check?.errors ? `오류 ${r.check.errors}개를 고쳐야 적재할 수 있습니다` : lock("RECIPE_LOAD")}
                            onClick={() => void listLoad(r)}><Upload size={13} /> 적재</Btn>
                        )}
                        <Btn size="sm" onClick={() => open(r)}><Pencil size={13} /> {readOnly ? "보기" : "편집"}</Btn>
                        {!readOnly && (
                          <button onClick={(e) => setMenu({ item: r, el: e.currentTarget })} aria-label={`${r.name} 메뉴`}
                            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#5B6470] hover:bg-[#E3E6EA]"><MoreVertical size={15} /></button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {recipes.list !== null && !list.length && (
                <tr><td colSpan={7}><Empty>저장된 레시피가 없습니다{!readOnly && " — '새 공정 레시피'로 만드세요"}</Empty></td></tr>
              )}
              {recipes.list === null && <tr><td colSpan={7}><Empty>읽는 중…</Empty></td></tr>}
            </tbody>
          </table>
        </div>
        {detail && <p className="text-[11px] text-[#8A929D]">레시피는 CHK2·CHK2-SIM 이 같이 씁니다</p>}
      </div>
      {menu && (
        <Menu anchor={menu.el} onClose={() => setMenu(null)} items={[
          { label: "복제", onClick: () => void duplicate(menu.item) },
          { label: "이름 바꾸기", onClick: () => setNameModal({ mode: "rename", item: menu.item, name: menu.item.name }) },
          { label: "삭제", danger: true, onClick: () => setConfirm({ what: "delete", item: menu.item }) },
        ]} />
      )}
      {nameModal?.mode === "rename" && nameModal.item && (
        <Modal title="이름 바꾸기" onClose={() => setNameModal(null)}
          footer={<><Btn kind="ghost" onClick={() => setNameModal(null)}>취소</Btn>
            <Btn kind="primary" lock={!nameModal.name.trim() ? "이름을 넣으세요" : null}
              onClick={() => { const it = nameModal.item!, n = nameModal.name.trim(); setNameModal(null); void rename(it, n); }}>바꾸기</Btn></>}>
          <input value={nameModal.name} onChange={(e) => setNameModal({ ...nameModal, name: e.target.value })} maxLength={80} aria-label="새 이름"
            className="h-10 w-full rounded-[10px] border border-[#D9DDE3] px-3 text-sm" />
        </Modal>
      )}
      {confirm?.what === "delete" && (
        <SimpleConfirm title="레시피 삭제" ok="삭제" danger
          text={<>레시피 <b>&apos;{confirm.item.name}&apos;</b> 를 지웁니다. 장비에 이미 적재된 것은 그대로입니다.</>}
          onCancel={() => setConfirm(null)} onOk={() => void remove(confirm.item)} />
      )}
    </Card>
  );
}
