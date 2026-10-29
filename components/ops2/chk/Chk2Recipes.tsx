"use client";

// 챔버K v2 레시피 — 공정 레시피(v1 행·딜레이 행·블록 행)와 히터 레시피(스텝 + 첫 행 가스)를 웹에 저장(ops2_recipe)·편집하고 장비에 보낸다.
// 웹 검사는 장비와 같은 계산(lib/ops2/chk/recipe.ts·blocks.ts — 골든으로 확인), 마지막 판단은 장비. 묶음 version 이 검사 기준과 다르면 안내만.
// 블록 행은 블록 편집기(Chk2BlockEditor)로, v1 행은 "블록 행으로 만들기"(그 행의 기본 템플릿 — 원래 행은 그대로).
// 조작(권한·연결은 W-3 규칙 — can): 적재(RECIPE_LOAD {name, rows} — 웹 검사 오류·저장 안 한 변경이 있으면 막음)·적재 시작·적재 해제,
// 한 행만 바로 시작(PROCESS_START — v1 행은 장비처럼 히터 열을 지운 row, 블록 행은 {blocks, name}),
// 히터 레시피 실행·정지·일시정지/재개(held 로 맞는 쪽 하나)·건너뛰기. 시작·실행은 확인창에 요약(빨강). 공정 중 수정은 W-5.
// W-9: 검사 오류는 칸을 건드린 뒤 또는 저장·적재를 누른 뒤부터(reveal — 저장된 레시피를 열면 바로), 머리 배지는 늘
// "검사 통과 / 오류 n / 경고 n". listOnly(장비 정의가 없는 장비)면 목록 보기만.
import { useCallback, useEffect, useMemo, useState, type MutableRefObject, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, BookOpen, FilePlus2, Pause, Play, Save, SkipForward, Square, Trash2, Upload, X } from "lucide-react";
import {
  checkEnvOf, checkHeaterRecipe, checkOutdated, checkProcessRecipe, delaySeconds, manualRow, pyTruthy, rowHasContent,
  GOLDEN_EXPORT_VERSION, type RecipeCheck, type Row,
} from "@/lib/ops2/chk/recipe";
import { fmtKst } from "@/lib/ops2/time";
import { Card, SimpleConfirm, type Ask, type Notice } from "./kit";
import { useChk2Mode } from "./mode";
import { HeaterTable, ProcessTable, isBlockRow, newUid, toERows, type ERow } from "./Chk2RecipeEditor";
import Chk2BlockEditor, { blockRowLines } from "./Chk2BlockEditor";
import { RECIPE_ERROR, type RecipeFull, type RecipeItem, type RecipeKind, type useRecipes } from "./useRecipes";
import type { Bundle, StateData } from "./types";

type Draft = {
  id: string | null; kind: RecipeKind; name: string; rows: ERow[]; gas: Row; updatedAt: string | null;
  base: string;                                  // 마지막으로 저장(또는 연) 내용 — 바뀌었는지 비교
};
const snap = (d: Pick<Draft, "name" | "rows" | "gas">) => JSON.stringify([d.name.trim(), d.rows.map((r) => r.data), d.gas]);
const fromFull = (r: RecipeFull): Draft => {
  const d = { id: r.id, kind: r.kind, name: r.name, rows: toERows(r.rows), gas: { ...(r.gas ?? {}) }, updatedAt: r.updatedAt };
  return { ...d, base: snap(d) };
};
const gasOrNull = (g: Row) => (Object.keys(g).length ? g : null);
const v = (x: unknown) => (x === undefined || x === null || x === "" ? "?" : String(x));

/** 공정 행 한 줄 요약(가스·파워·압력·시간) */
function rowLine(r: Row): string {
  const gas = [r.ar === true && `Ar ${v(r.ar_flow)} sccm`, r.o2 === true && `O₂ ${v(r.o2_flow)} sccm`].filter(Boolean).join(" + ") || "가스 없음";
  const pw = [r.use_dc === true && `DC ${v(r.dc_power)} W`, r.use_rf === true && `RF ${v(r.rf_power)} W`,
              r.use_rf_pulse === true && `RF Pulse ${v(r.rf_pulse_power)} W`].filter(Boolean).join(" + ") || "파워 없음";
  const time = `공정 ${v(r.process_time)}분${pyTruthy(r.shutter_delay) ? ` · 셔터 딜레이 ${v(r.shutter_delay)}분` : ""}`;
  return `${gas} · ${pw} · 압력 ${v(r.working_pressure)} mTorr · ${time}`;
}
const heaterLine = (r: Row) => (r.use_heater === true ? `히터 목표 ${v(r.heater_temp)} °C` : "히터 안 씀");

/** 레시피 시작 확인창 요약 — 이름·행 수(v1·블록·딜레이)·첫 공정 행(v1 행은 가스·파워·시간·히터, 블록 행은 블록 수·장비·시간) */
function processLines(name: string, rows: Row[], check: RecipeCheck | null): string[] {
  const content = rows.filter(rowHasContent);
  const isDelay = (r: Row) => !isBlockRow(r) && delaySeconds(r.process_name) !== null;
  const delays = content.filter(isDelay).length;
  const blocks = content.filter(isBlockRow).length;
  const procs = content.filter((r) => !isDelay(r) && !isBlockRow(r));
  const i = rows.findIndex((r) => rowHasContent(r) && !isDelay(r));
  const heat = procs.filter((r) => r.use_heater === true).length;
  const first = i < 0 ? [] : isBlockRow(rows[i])
    ? blockRowLines(rows[i], check?.rows[i] ?? null).map((l, k) => (k ? l : `첫 공정 행(${i + 1}행): ${l}`))
    : [`첫 공정 행(${i + 1}행): ${rowLine(rows[i])}`, `첫 공정 행 ${heaterLine(rows[i])}${heat ? ` · 히터 쓰는 행 ${heat}개` : ""}`];
  return [`레시피 '${name}' · ${content.length}행(일반 행 ${procs.length} · 블록 행 ${blocks} · 딜레이 행 ${delays})`, ...first];
}

function heaterLines(name: string, steps: Row[], gas: Row | null): string[] {
  const g = gas && (gas.use_ar === true || gas.use_o2 === true)
    ? `가스 ${[gas.use_ar === true && `Ar ${v(gas.ar_flow)} sccm`, gas.use_o2 === true && `O₂ ${v(gas.o2_flow)} sccm`]
        .filter(Boolean).join(" + ")} · 압력 ${v(gas.wp_mtorr)} mTorr`
    : "가스 없이";
  return [`히터 레시피 '${name}' · 스텝 ${steps.length}개`, `히터 목표 ${steps.map((s) => `${v(s.target_c)}°C`).join(" → ")}`, g];
}

function CheckBadge({ c }: { c: RecipeItem["check"] }) {
  if (!c) return <span className="text-[10px] text-gray-300">—</span>;
  if (c.errors) return <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700" title={c.first ?? ""}>오류 {c.errors}</span>;
  if (c.warnings) return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">경고 {c.warnings}</span>;
  return <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">검사 통과</span>;
}

const Btn = ({ onClick, disabled, title, tone = "gray", children }: {
  onClick: () => void; disabled?: boolean; title?: string; tone?: "gray" | "blue" | "rose" | "roseSolid"; children: ReactNode;
}) => (
  <button onClick={onClick} disabled={disabled} title={title}
    className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 ${
      tone === "blue" ? "bg-blue-600 text-white hover:bg-blue-700"
      : tone === "roseSolid" ? "bg-rose-600 text-white hover:bg-rose-700"
      : tone === "rose" ? "border border-rose-300 text-rose-600 hover:bg-rose-50"
      : "border border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
    {children}
  </button>
);

export default function Chk2Recipes({ bundle, st, recipes, can, onAsk, notify, dirtyRef, listOnly }: {
  bundle: Bundle | null; st: StateData | null; recipes: ReturnType<typeof useRecipes>;
  can: (kind: string) => boolean; onAsk: (a: Ask) => void; notify: (n: Omit<Notice, "id" | "at">) => void;
  dirtyRef: MutableRefObject<boolean>;           // 저장 안 한 변경 — 장비를 바꿀 때 화면이 묻는다
  listOnly?: boolean;                            // 장비 정의(열)를 받지 못한 장비 — 목록 보기만
}) {
  const { detail } = useChk2Mode();
  const [reveal, setReveal] = useState(false);   // 검사 문구를 모두 보이기(저장·적재를 누른 뒤, 저장된 레시피)
  const [tab, setTab] = useState<RecipeKind>("process");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<{ what: "leave"; then: () => void } | { what: "delete" } | null>(null);
  const [saveAs, setSaveAs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blockUid, setBlockUid] = useState<string | null>(null);   // 블록 편집기로 여는 블록 행
  const [toBlocks, setToBlocks] = useState<number | null>(null);    // "블록 행으로 만들기" 확인

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
  const hCheck = useMemo(() => (env && dKind === "heater" ? checkHeaterRecipe(rowsData, gasOrNull(dGas ?? {}), env) : null),
                         [env, dKind, dGas, rowsData]);
  const errCount = pCheck ? pCheck.errors : hCheck ? hCheck.errors.length : 0;
  const warnCount = pCheck ? pCheck.warnings : hCheck ? hCheck.warnings.length : 0;

  /** 저장 안 한 변경이 있으면 묻고 나서 */
  const leave = useCallback((then: () => void) => {
    if (dirty) setConfirm({ what: "leave", then });
    else then();
  }, [dirty]);

  const open = (item: RecipeItem) => leave(async () => {
    const r = await recipes.get(item.id);
    if (!r.ok) return notify({ tone: "bad", title: `레시피 '${item.name}' — 열지 못함`, text: RECIPE_ERROR[r.error] ?? r.error });
    setSaveAs(null);
    setBlockUid(null);
    setReveal(true);
    setDraft(fromFull(r.data.recipe));
  });
  const create = (kind: RecipeKind) => leave(() => {
    const d = { id: null, kind, name: "", rows: toERows([{}]), gas: {}, updatedAt: null };
    setSaveAs(null);
    setBlockUid(null);
    setReveal(false);
    setDraft({ ...d, base: snap(d) });
  });

  const save = async (asName?: string) => {
    if (!draft) return;
    setReveal(true);
    const name = (asName ?? draft.name).trim();
    if (!name) return notify({ tone: "bad", title: "이름을 넣으세요", text: "레시피 이름은 1~80자" });
    setBusy(true);
    const body = { kind: draft.kind, name, rows: draft.rows.map((r) => r.data), gas: draft.kind === "heater" ? gasOrNull(draft.gas) : null };
    const r = await recipes.save(body, asName !== undefined ? null : draft.id, draft.updatedAt);
    setBusy(false);
    if (!r.ok) {
      return notify({ tone: "bad", title: `레시피 '${name}' — 저장 못 함`,
                      text: `${RECIPE_ERROR[r.error] ?? r.error}${r.detail && !RECIPE_ERROR[r.error] ? ` · ${r.detail}` : ""}` });
    }
    const c = r.data.check;
    setSaveAs(null);
    const at = blockUid ? draft.rows.findIndex((x) => x.uid === blockUid) : -1;
    const next = fromFull(r.data.recipe);
    setBlockUid(at >= 0 ? next.rows[at]?.uid ?? null : null);       // 블록 편집기는 열린 채로
    setDraft(next);
    notify({ tone: c?.errors ? "warn" : "ok", title: `레시피 '${name}' — 저장함`,
             text: c ? `서버 검사: 오류 ${c.errors} · 경고 ${c.warnings}${c.first ? ` — ${c.first}` : ""}` : "서버 검사 없음(묶음에 열 정의 없음)" });
  };

  const remove = async () => {
    setConfirm(null);
    if (!draft?.id) return;
    const r = await recipes.remove(draft.id);
    if (!r.ok) return notify({ tone: "bad", title: `레시피 '${draft.name}' — 지우지 못함`, text: RECIPE_ERROR[r.error] ?? r.error });
    notify({ tone: "ok", title: `레시피 '${draft.name}' — 지움` });
    setDraft(null);
  };

  // ── 장비 조작 ──
  const loaded = st?.recipe ?? null;
  const hr = st?.heaterRecipe ?? null;
  const byName = (kind: RecipeKind, name?: string | null) =>
    name ? recipes.list?.find((r) => r.kind === kind && r.name === name) ?? null : null;
  const loadedWeb = byName("process", loaded?.name);

  const loadWhy = !draft || draft.kind !== "process" ? null
    : !env ? "묶음에 레시피 열 정의가 없음"
    : !draft.id || dirty ? "저장한 뒤 적재"
    : errCount ? `검사 오류 ${errCount}개 — 고친 뒤 적재`
    : !can("RECIPE_LOAD") ? "권한·연결 확인(또는 결과 기다리는 중)" : null;
  const runWhy = !draft || draft.kind !== "heater" ? null
    : !env ? "묶음에 레시피 열 정의가 없음"
    : !draft.id || dirty ? "저장한 뒤 실행"
    : errCount ? `검사 오류 ${errCount}개 — 고친 뒤 실행`
    : !can("HEATER_RECIPE_RUN") ? "권한·연결 확인(또는 결과 기다리는 중)" : null;

  const askLoad = () => {
    if (!draft) return;
    setReveal(true);
    if (errCount) {
      notify({ tone: "bad", title: `레시피 '${draft.name}' — 적재 못 함`, text: `검사 오류 ${errCount}개 — 표의 빨간 칸을 고친 뒤 적재하세요` });
      return;
    }
    const rows = draft.rows.map((r) => r.data);
    onAsk({ kind: "RECIPE_LOAD", label: "공정 레시피 적재", detail: `'${draft.name}'`, args: { name: draft.name, rows },
            lines: processLines(draft.name, rows, pCheck), note: "장비에 행 목록을 올립니다(검사 뒤 적재). 시작은 '적재 시작'." });
  };
  const askStartLoaded = async () => {
    let lines = [`장비에 적재된 '${loaded?.name || "이름 없음"}' · ${loaded?.rows ?? "-"}행`, "웹 목록에 같은 이름이 없어 내용을 보여 줄 수 없음"];
    if (loadedWeb) {
      const r = await recipes.get(loadedWeb.id);
      if (r.ok) {
        const rows = r.data.recipe.rows;
        lines = [...processLines(loadedWeb.name, rows, env ? checkProcessRecipe(rows, env) : null),
                 `웹 레시피 마지막 수정 ${fmtKst(loadedWeb.updatedAt)} — 적재 뒤 고쳤다면 장비 것과 다를 수 있음`];
      }
    }
    onAsk({ kind: "RECIPE_START", label: "적재 레시피 시작", detail: `'${loaded?.name ?? ""}'`, red: true, lines,
            note: "공정을 시작합니다 — 가스·파워·셔터가 움직입니다." });
  };
  const rowWhy = (i: number): string | null => {
    const rc = pCheck?.rows[i];
    if (!env || !rc) return "검사 없음";
    if (rc.kind === "delay") return "딜레이 행은 바로 시작할 수 없음";
    if (rc.kind === "blocks") {
      if (rc.errors.length) return `검사 오류 — ${rc.errors[0]}`;
    } else {
      if (rc.kind !== "row") return "내용 없는 행";
      const m = checkProcessRecipe([manualRow(draft?.rows[i]?.data ?? {})], env);
      if (m.errors) return `검사 오류 — ${m.rows[0]?.errors[0] ?? m.first}`;
    }
    if (!can("PROCESS_START")) return "권한·연결 확인(또는 결과 기다리는 중)";
    if (loaded) return "장비에 레시피가 적재돼 있음 — 해제한 뒤";
    return null;
  };
  const askStartRow = (i: number) => {
    const data = draft?.rows[i]?.data;
    if (!data) return;
    if (isBlockRow(data)) {
      const name = typeof data.process_name === "string" && data.process_name ? data.process_name : `${draft?.name || "블록 행"} ${i + 1}행`;
      onAsk({ kind: "PROCESS_START", label: "블록 행 바로 시작", detail: `${i + 1}행 '${name}'`, args: { blocks: data.blocks, name },
              red: true, lines: [`레시피 '${draft?.name || "(저장 안 함)"}' ${i + 1}행`, ...blockRowLines(data, pCheck?.rows[i] ?? null)],
              note: "공정을 시작합니다 — 가스·파워·셔터가 움직입니다(블록 순서 그대로)." });
      return;
    }
    const row = manualRow(data);
    onAsk({ kind: "PROCESS_START", label: "한 행 바로 시작", detail: `${i + 1}행 '${v(row.process_name)}'`, args: { row }, red: true,
            lines: [`레시피 '${draft?.name || "(저장 안 함)"}' ${i + 1}행`, rowLine(row),
                    data.use_heater === true ? "수동 시작은 히터 열을 쓰지 않음(장비 규칙) — 히터 목표는 보내지 않음" : "히터 안 씀"],
            note: "공정을 시작합니다 — 가스·파워·셔터가 움직입니다." });
  };
  const askHeaterRun = () => {
    if (!draft) return;
    setReveal(true);
    if (errCount) {
      notify({ tone: "bad", title: `히터 레시피 '${draft.name}' — 실행 못 함`, text: `검사 오류 ${errCount}개 — 표의 빨간 칸을 고친 뒤 실행하세요` });
      return;
    }
    const steps = draft.rows.map((r) => r.data), gas = gasOrNull(draft.gas);
    onAsk({ kind: "HEATER_RECIPE_RUN", label: "히터 레시피 실행", detail: `'${draft.name}'`, args: { name: draft.name, steps, gas },
            red: true, lines: heaterLines(draft.name, steps, gas), note: "히터를 켜고 스텝대로 온도를 올립니다." });
  };

  const makeBlocks = () => {
    const i = toBlocks;
    setToBlocks(null);
    const rc = i === null ? null : pCheck?.rows[i];
    if (i === null || !draft || !rc?.blocks) return;
    const src = draft.rows[i].data;
    const name = typeof src.process_name === "string" && src.process_name ? `${src.process_name} (블록)` : "";
    // 장비 template_blocks 그대로(label·stage "" 는 장비 5-11 부터 값 없음으로 통과)
    const n: ERow = { uid: newUid(), data: { ...(name ? { process_name: name } : {}), blocks: JSON.parse(JSON.stringify(rc.blocks)) } };
    setDraft({ ...draft, rows: [...draft.rows.slice(0, i + 1), n, ...draft.rows.slice(i + 1)] });
    setBlockUid(n.uid);
  };
  const blockAt = blockUid && draft?.kind === "process" ? draft.rows.findIndex((r) => r.uid === blockUid) : -1;

  const tabs: { kind: RecipeKind; label: string }[] = [{ kind: "process", label: "공정 레시피" }, { kind: "heater", label: "히터 레시피" }];
  const list = (recipes.list ?? []).filter((r) => r.kind === tab);

  return (
    <Card title={<><BookOpen size={15} /> 레시피</>}
      right={
        <div className="flex rounded-xl bg-gray-100 p-0.5">
          {tabs.map((t) => (
            <button key={t.kind} onClick={() => t.kind !== tab && leave(() => { setDraft(null); setBlockUid(null); setTab(t.kind); })}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tab === t.kind ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
              {t.label}
            </button>
          ))}
        </div>
      }>
      <div className="space-y-2">
        {outdated && (
          <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-800">
            <AlertTriangle size={13} />
            {(bundle?.version ?? 0) > GOLDEN_EXPORT_VERSION
              ? `웹 검사 기준이 장비보다 옛것 — 장비 판단만 믿을 것(웹 검사 v${GOLDEN_EXPORT_VERSION}, 장비 묶음 v${bundle?.version})`
              : `장비 묶음이 웹 검사 기준보다 옛것 — 장비 판단만 믿을 것(장비 묶음 v${bundle?.version}, 웹 검사 v${GOLDEN_EXPORT_VERSION})`}
          </p>
        )}
        {!env && bundle && (
          <p className="rounded-lg bg-gray-50 px-2 py-1.5 text-[11px] text-gray-500">묶음에 레시피 열 정의가 없어 웹 검사를 하지 않습니다 — 장비 판단만.</p>
        )}
        {recipes.error && <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">{recipes.error}</p>}

        {/* 지금 장비 */}
        {tab === "process" ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-2.5 py-2 text-[11px]">
            <span className="text-gray-600">
              {loaded ? (
                <>장비에 적재됨 <b className="text-gray-900">&apos;{loaded.name || "이름 없음"}&apos;</b>
                  {loadedWeb ? <span className="ml-1 rounded bg-blue-50 px-1 text-blue-700">웹 레시피</span>
                    : <span className="ml-1 rounded bg-gray-200 px-1 text-gray-600">웹 목록에 없는 이름</span>}
                  {" "}· {loaded.listActive ? `레시피 진행 중(${loaded.row ?? "-"}/${loaded.rows ?? "-"}행)` : loaded.row ? `${loaded.row}/${loaded.rows ?? "-"}행` : `적재됨 · ${loaded.rows ?? "-"}행`}</>
              ) : "장비에 적재된 공정 레시피 없음"}
            </span>
            {loaded && (
              <span className="flex gap-1.5">
                <Btn tone="roseSolid" disabled={!can("RECIPE_START") || loaded.listActive} onClick={() => void askStartLoaded()}>
                  <Play size={13} /> 적재 시작
                </Btn>
                <Btn disabled={!can("RECIPE_CLEAR")}
                  onClick={() => onAsk({ kind: "RECIPE_CLEAR", label: "적재 해제", detail: `'${loaded.name}'`,
                                         note: "장비에 올린 행 목록을 내립니다(공정 중이면 장비가 거부)." })}>
                  <X size={13} /> 적재 해제
                </Btn>
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-2.5 py-2 text-[11px]">
            <span className="text-gray-600">
              {hr ? (
                <>히터 레시피 실행 중 <b className="text-gray-900">&apos;{hr.name || "이름 없음"}&apos;</b>
                  {byName("heater", hr.name) ? <span className="ml-1 rounded bg-blue-50 px-1 text-blue-700">웹 레시피</span>
                    : <span className="ml-1 rounded bg-gray-200 px-1 text-gray-600">웹 목록에 없는 이름</span>}
                  {" "}· 스텝 {hr.step ?? "-"}/{hr.steps ?? "-"}{detail && hr.state ? ` · ${hr.state}` : ""}
                  {hr.held && <span className="ml-1 rounded bg-amber-100 px-1 font-semibold text-amber-800">일시정지 중</span>}</>
              ) : "실행 중인 히터 레시피 없음"}
            </span>
            {hr && (
              <span className="flex flex-wrap gap-1.5">
                {/* held 가 있으면(묶음 8) 맞는 버튼 하나만, 없으면(옛 장비) 둘 다 */}
                {hr.held !== true && (
                  <Btn disabled={!can("HEATER_RECIPE_HOLD")}
                    onClick={() => onAsk({ kind: "HEATER_RECIPE_HOLD", label: "히터 레시피 일시정지", args: { on: true },
                                           note: "지금 온도에서 멈춥니다(레시피 시계도 멈춤)." })}>
                    <Pause size={13} /> 일시정지
                  </Btn>
                )}
                {hr.held !== false && (
                  <Btn disabled={!can("HEATER_RECIPE_HOLD")}
                    onClick={() => onAsk({ kind: "HEATER_RECIPE_HOLD", label: "히터 레시피 재개", args: { on: false } })}>
                    <Play size={13} /> 재개
                  </Btn>
                )}
                <Btn disabled={!can("HEATER_RECIPE_SKIP")}
                  onClick={() => onAsk({ kind: "HEATER_RECIPE_SKIP", label: "히터 레시피 스텝 건너뛰기",
                                         detail: `스텝 ${hr.step ?? "-"} → 다음` })}>
                  <SkipForward size={13} /> 건너뛰기
                </Btn>
                <Btn tone="rose" disabled={!can("HEATER_RECIPE_STOP")}
                  onClick={() => onAsk({ kind: "HEATER_RECIPE_STOP", label: "히터 레시피 정지", stop: true,
                                         note: "히터 레시피를 멈추고 히터를 끕니다(RUN=0·램프 복구·SV=PV)." })}>
                  <Square size={13} /> 정지
                </Btn>
              </span>
            )}
          </div>
        )}

        {!draft ? (
          /* 목록 */
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] text-gray-400">
                {recipes.list === null ? "읽는 중…" : `${list.length}개`}{detail && " · CHK2·CHK2-SIM 이 같이 씀"}
              </span>
              {!readOnly && (
                <Btn tone="blue" onClick={() => create(tab)}><FilePlus2 size={13} /> 새 {tab === "process" ? "공정" : "히터"} 레시피</Btn>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-[11px] text-gray-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold">이름</th>
                    <th className="px-2 py-1.5 text-right font-semibold">{tab === "process" ? "행" : "스텝"}</th>
                    <th className="px-2 py-1.5 text-left font-semibold">수정자</th>
                    <th className="px-2 py-1.5 text-left font-semibold">시각</th>
                    <th className="px-2 py-1.5 text-left font-semibold">검사</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} onClick={() => open(r)} className="cursor-pointer border-t border-gray-100 hover:bg-blue-50/40">
                      <td className="px-2 py-1.5 font-semibold text-gray-900">
                        {r.name}
                        {((tab === "process" && loaded?.name === r.name) || (tab === "heater" && hr?.name === r.name)) && (
                          <span className="ml-1.5 rounded bg-blue-50 px-1 text-[10px] font-semibold text-blue-700">
                            {tab === "process" ? "장비에 적재됨" : "실행 중"}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{r.rowCount}</td>
                      <td className="px-2 py-1.5 text-gray-500">{r.updatedBy}</td>
                      <td className="px-2 py-1.5 tabular-nums text-gray-500">{fmtKst(r.updatedAt)}</td>
                      <td className="px-2 py-1.5"><CheckBadge c={r.check} /></td>
                    </tr>
                  ))}
                  {recipes.list !== null && !list.length && (
                    <tr><td colSpan={5} className="p-3 text-center text-gray-400">
                      저장된 레시피가 없습니다{!readOnly && ` — '새 ${tab === "process" ? "공정" : "히터"} 레시피'로 만드세요`}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* 편집 */
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => leave(() => { setDraft(null); setBlockUid(null); })} aria-label="목록으로"
                className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"><ArrowLeft size={16} /></button>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={readOnly}
                placeholder="레시피 이름(1~80자)" maxLength={80}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm font-semibold disabled:bg-gray-50" />
              {dirty && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">저장 안 됨</span>}
              {env && (
                <button onClick={() => setReveal(true)} title="누르면 모든 검사 문구를 표에 보입니다"
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    errCount ? "bg-rose-50 text-rose-700" : warnCount ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {errCount ? `오류 ${errCount}` : warnCount ? `경고 ${warnCount}` : "검사 통과"}
                  {errCount > 0 && warnCount > 0 && ` · 경고 ${warnCount}`}
                </button>
              )}
            </div>
            {draft.id && (
              <p className="text-[11px] text-gray-400">마지막 수정 {fmtKst(draft.updatedAt)}{readOnly && " · 조회만(저장은 장비 담당자·관리자)"}</p>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {!readOnly && (
                <>
                  <Btn tone="blue" disabled={busy || !draft.name.trim() || (!!draft.id && !dirty)} onClick={() => void save()}>
                    <Save size={13} /> 저장
                  </Btn>
                  {draft.id && (saveAs === null ? (
                    <Btn disabled={busy} onClick={() => setSaveAs(`${draft.name} 복사`)}>다른 이름으로 저장</Btn>
                  ) : (
                    <span className="flex items-center gap-1">
                      <input value={saveAs} onChange={(e) => setSaveAs(e.target.value)} maxLength={80} aria-label="새 이름"
                        className="w-44 rounded-lg border border-gray-200 px-2 py-1 text-xs" />
                      <Btn tone="blue" disabled={busy || !saveAs.trim()} onClick={() => void save(saveAs)}>새로 저장</Btn>
                      <Btn onClick={() => setSaveAs(null)}>취소</Btn>
                    </span>
                  ))}
                  {draft.id && <Btn tone="rose" disabled={busy} onClick={() => setConfirm({ what: "delete" })}><Trash2 size={13} /> 삭제</Btn>}
                </>
              )}
              <span className="ml-auto flex items-center gap-1.5">
                {draft.kind === "process" ? (
                  <>
                    {loadWhy && <span className="text-[11px] text-gray-400">{loadWhy}</span>}
                    <Btn tone="blue" disabled={!!loadWhy && !errCount} onClick={askLoad}><Upload size={13} /> 장비에 적재</Btn>
                  </>
                ) : (
                  <>
                    {runWhy && <span className="text-[11px] text-gray-400">{runWhy}</span>}
                    <Btn tone="roseSolid" disabled={!!runWhy && !errCount} onClick={askHeaterRun}><Play size={13} /> 히터 레시피 실행</Btn>
                  </>
                )}
              </span>
            </div>

            {reveal && pCheck && pCheck.listErrors.length > 0 && (
              <p className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">{pCheck.listErrors.join(" · ")}</p>
            )}
            {draft.kind === "process" && blockAt >= 0 ? (
              <Chk2BlockEditor key={blockUid} row={draft.rows[blockAt].data} rc={pCheck?.rows[blockAt] ?? null}
                env={env?.blocks ?? null} bundle={bundle} readOnly={readOnly} rowNo={blockAt + 1}
                startWhy={rowWhy(blockAt)} onStart={() => askStartRow(blockAt)} onClose={() => setBlockUid(null)} dirty={dirty}
                onRow={(data) => setDraft((d) => (d ? { ...d, rows: d.rows.map((r) => (r.uid === blockUid ? { ...r, data } : r)) } : d))} />
            ) : draft.kind === "process" ? (
              <ProcessTable cols={bundle?.recipe?.processColumns ?? []} rows={draft.rows} check={pCheck} bundle={bundle}
                readOnly={readOnly} reveal={reveal} canStart={rowWhy} onStart={askStartRow} onEditBlocks={setBlockUid} onToBlocks={setToBlocks}
                onRows={(f) => setDraft((d) => (d ? { ...d, rows: f(d.rows) } : d))} />
            ) : (
              <HeaterTable stepCols={bundle?.recipe?.heaterStepColumns ?? []} gasCols={bundle?.recipe?.heaterGasColumns ?? []}
                steps={draft.rows} gas={draft.gas} errors={hCheck?.errors ?? []} warnings={hCheck?.warnings ?? []}
                bundle={bundle} readOnly={readOnly} reveal={reveal}
                onSteps={(f) => setDraft((d) => (d ? { ...d, rows: f(d.rows) } : d))}
                onGas={(g) => setDraft((d) => (d ? { ...d, gas: g } : d))} />
            )}
          </div>
        )}
      </div>

      {confirm?.what === "leave" && (
        <SimpleConfirm title="저장 안 됨" ok="버리고 나가기" danger
          text="저장하지 않은 변경이 있습니다. 버리고 나갈까요?"
          onCancel={() => setConfirm(null)} onOk={() => { const t = confirm.then; setConfirm(null); t(); }} />
      )}
      {toBlocks !== null && draft && (
        <SimpleConfirm title="블록 행으로 만들기" ok="만들고 편집"
          text={<>{toBlocks + 1}행과 같은 순서의 블록 {pCheck?.rows[toBlocks]?.blocks?.length ?? "-"}개로 새 블록 행을 {toBlocks + 2}행에
            만듭니다. 원래 행은 그대로 둡니다. 블록 행에서 순서를 바꿀 수 있습니다.</>}
          onCancel={() => setToBlocks(null)} onOk={makeBlocks} />
      )}
      {confirm?.what === "delete" && draft && (
        <SimpleConfirm title="레시피 삭제" ok="삭제" danger
          text={<>레시피 <b>&apos;{draft.name}&apos;</b> 를 지웁니다. 장비에 이미 적재된 것은 그대로입니다.</>}
          onCancel={() => setConfirm(null)} onOk={() => void remove()} />
      )}
    </Card>
  );
}
