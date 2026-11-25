"use client";

// 노트북 로컬 화면의 '다음 공정'(W-14 — 묶음 18, 장비 5-20 ②). 노트북 조작이 열려 있으면(hello.commandKinds 에 PROCESS_START 등)
// 한 행 공정을 바로 만들어 시작(PROCESS_START row·blocks — 열 정의·검사는 묶음과 lib/ops2/chk/recipe.ts 그대로, 수동 시작은 히터 열을
// 쓰지 않음)하고, 장비에 적재된 레시피를 시작·해제한다. 저장된 레시피 목록·편집·설정·이력은 웹에서만(노트북에는 웹 DB 가 없다).
// W-15: 처음에는 적재 상태와 버튼 둘('적재된 레시피 시작'·'값을 넣어 바로 시작…')만. 입력 칸은 누르면 펼치고, 사람이 값을 넣기 전에는
//   검사 오류를 띄우지 않는다(시작 버튼의 잠김 이유로만).
import { useMemo, useState } from "react";
import { ChevronUp, PenLine, Play, X } from "lucide-react";
import { checkEnvOf, checkProcessRecipe, devSpOf, manualRow, type Row } from "@/lib/ops2/chk/recipe";
import { FS, Btn, Card, Chip, Issue, KV, type Ask } from "./kit";
import { ProcessEditor, toERows, isBlockRow, type ERow } from "./Chk2RecipeEditor";
import { blockRowLines } from "./Chk2BlockEditor";
import { rowLine } from "./recipeText";
import { useChk2Mode } from "./mode";
import type { Bundle, StateData } from "./types";
import type { LockFn } from "./Chk2Status";

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
              값을 넣고 그 줄의 시작을 누르세요. 저장된 레시피는 웹에서 고릅니다.
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
