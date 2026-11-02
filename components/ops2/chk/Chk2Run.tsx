"use client";

// 챔버K v2 운전 탭(W-10).
// 공정 중(묶음 states kind active·stopping): 왼쪽 공정 순서(Chk2Seq) · 가운데 주요 값(이번 공정이 쓰는 장비만 — 칸마다 라벨·목표·
//   큰 값·막대: 회색 띠 = 허용 범위(장비 판정과 같은 식), ▲ = 목표, 세로선 = 지금) · 추세(Chk2Trend) · 공정 중 값 바꾸기(Chk2Adjust, 접힘) ·
//   오른쪽 장비 상태 목록(진공·가스 차단밸브·셔터·안전/유틸리티)과 알림(활성 알람 + 최근 사건, '기록 전체 보기' → 기록 탭).
// 대기: 위 줄 다음 공정(2/3 — 레시피 고르기·편집·적재·적재 시작·적재 해제·히터 레시피 실행, 고른 레시피 요약) + 알림(1/3),
//   아래 장비 카드 격자(Chk2Devices).
// 적재·시작·실행은 저장된 최신 + 웹 검사 오류 없음일 때만 — 막히면 버튼에 자물쇠와 이유(마우스를 올리면).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BellRing, ChevronDown, ChevronRight, FileEdit, Flame, Play, Upload, X } from "lucide-react";
import { checkEnvOf, checkHeaterRecipe, checkProcessRecipe, type RecipeCheck, type Row } from "@/lib/ops2/chk/recipe";
import { expectedTime } from "@/lib/ops2/chk/blocks";
import { fmtKst } from "@/lib/ops2/time";
import { Btn, Card, Chip, Empty, KV, RangeBar, StateBox, Tile, Val, Dot, type Ask } from "./kit";
import { DeviceGrid } from "./Chk2Devices";
import Chk2Seq from "./Chk2Seq";
import Chk2Trend from "./Chk2Trend";
import Chk2Adjust from "./Chk2Adjust";
import { ExpandedView, fmtSec } from "./Chk2BlockEditor";
import { argRange, paramValue } from "./logic";
import { fieldText, logLine } from "./text";
import { bandOf, kindOf, scaleMax, usesNow } from "./runview";
import { heaterLines, processLines, rowLine } from "./recipeText";
import { useChk2Mode } from "./mode";
import { reasonLabel, type Bundle, type FieldDef, type StateData } from "./types";
import type { FeedItem, RunBlocks, TrendPt } from "./useChk2";
import type { RecipeFull, useRecipes } from "./useRecipes";
import type { LockFn } from "./Chk2Status";

type Snap = Record<string, unknown> | undefined;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fieldOf = (b: Bundle | null, col: string): FieldDef | undefined =>
  b?.snapshot?.blocks?.flatMap((x) => x.fields).find((f) => f.column === col);
const fmtN = (v: number | null) => (v === null ? "" : String(Number(v.toPrecision(5))));

// ───────────── 주요 값 ─────────────
type KeyDef = { key: "pressure" | "ar" | "o2" | "dc" | "rf" | "rfp" | "heater" | "ig"; label: string; value: string; target: string | null; limit: () => number | null };
const KEYS: KeyDef[] = [
  { key: "pressure", label: "챔버 압력", value: "mfc.pressure_mtorr", target: "mfc.sp_mtorr", limit: () => null },
  { key: "ar", label: "Ar 유량", value: "mfc.ar_sccm", target: "mfc.ar_set", limit: () => null },
  { key: "o2", label: "O₂ 유량", value: "mfc.o2_sccm", target: "mfc.o2_set", limit: () => null },
  { key: "dc", label: "DC Power", value: "dc.p", target: "dc.set_w", limit: () => null },
  { key: "rf", label: "RF Power", value: "rf.fwd_w", target: "rf.set_w", limit: () => null },
  { key: "rfp", label: "RF Pulse", value: "rfp.fwd_w", target: "rfp.set_w", limit: () => null },
  { key: "heater", label: "히터 TC1", value: "heater.pv", target: "heater.sv", limit: () => null },
  { key: "ig", label: "이온 게이지", value: "ig.ion_torr", target: null, limit: () => null },
];
const LIMIT_PARAM: Record<string, string> = { dc: "DC_MAX_POWER", rf: "RF_MAX_POWER", rfp: "RFPULSE_MAX_POWER", heater: "HEATER_MAX_TEMP" };

function KeyTile({ d, bundle, snap }: { d: KeyDef; bundle: Bundle | null; snap: Snap }) {
  const f = fieldOf(bundle, d.value), tf = d.target ? fieldOf(bundle, d.target) : undefined;
  const v = num(snap?.[d.value]), t = d.target ? num(snap?.[d.target]) : null;
  const unit = f?.unit ?? "";
  const txt = f ? fieldText(f, snap?.[d.value], snap, bundle?.snapshot?.blocks) : { text: "", alt: null };
  const lim = LIMIT_PARAM[d.key] ? num(paramValue(bundle, LIMIT_PARAM[d.key]))
    : d.key === "ar" ? argRange(bundle, "HEATER_ON", "ar_flow")?.max ?? null : d.key === "o2" ? argRange(bundle, "HEATER_ON", "o2_flow")?.max ?? null : null;
  const band = bandOf(bundle, d.key, t);
  const max = scaleMax(t, v, lim);
  const extra = d.key === "heater" ? (() => {
    const cs = snap?.["heater.casc_state"], csF = fieldOf(bundle, "heater.casc_state");
    const mv = num(snap?.["heater.mv"]), amp = num(snap?.["heater.current_est"]);
    return [num(snap?.["heater.pv2"]) !== null ? `TC2 ${fmtN(num(snap?.["heater.pv2"]))} °C` : "",
            mv !== null ? (snap?.["heater.run"] === true ? `DAC ${Math.round(mv)}${amp !== null ? ` ≈${amp.toFixed(1)} A` : ""}` : `정지 (DAC ${Math.round(mv)})`) : "",
            typeof cs === "string" && cs && cs !== "idle" ? csF?.enumLabels?.[cs] ?? cs : ""].filter(Boolean).join(" · ");
  })() : "";
  return (
    <Tile className="p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-semibold text-[#1B1F24]">{d.label}</span>
        {t !== null && <span className="shrink-0 text-[11px] text-[#5B6470]">목표 {tf ? fieldText(tf, t).text || fmtN(t) : fmtN(t)} {unit}</span>}
      </div>
      <div className="mt-1"><Val text={txt.text} unit={unit} size="lg" alt={txt.alt} /></div>
      {d.key !== "ig" && <div className="mt-1"><RangeBar value={v} target={t} band={band} max={max} label={`${d.label} 막대`} /></div>}
      <p className="mt-0.5 flex justify-between text-[10px] tabular-nums text-[#8A929D]">
        {d.key !== "ig" ? <><span>0</span><span>{fmtN(max)} {unit}</span></> : <span>로그 값 — 막대 없음</span>}
      </p>
      {extra && <p className="mt-1 truncate text-[11px] text-[#5B6470]">{extra}</p>}
    </Tile>
  );
}

function KeyValues({ bundle, st, blocks }: { bundle: Bundle | null; st: StateData | null; blocks: RunBlocks | null }) {
  const snap = st?.snapshot;
  const u = usesNow(st, blocks?.blocks ?? null);
  const used = (k: KeyDef["key"]) => (k === "pressure" ? u.mfc || u.ar || u.o2 : u[k]);
  const on = KEYS.filter((d) => used(d.key));
  const off = KEYS.filter((d) => !used(d.key));
  return (
    <Card title="주요 값" right={<span className="text-[11px] text-[#5B6470]">이번 공정이 쓰는 장비</span>}>
      {on.length ? (
        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {on.map((d) => <KeyTile key={d.key} d={d} bundle={bundle} snap={snap} />)}
        </div>
      ) : <Empty>이번 공정이 쓰는 장비 값을 아직 모릅니다</Empty>}
      <p className="mt-2 text-[11px] text-[#5B6470]">막대: 회색 띠 = 허용 범위(장비 판정과 같은 식, 모르면 없음) · ▲ = 목표 · 세로선 = 지금</p>
      {off.length > 0 && (
        <p className="mt-1 text-[11px] text-[#5B6470]">
          이번 공정에서 안 쓰는 장비 — {off.map((d) => {
            const f = fieldOf(bundle, d.value);
            const t = f ? fieldText(f, snap?.[d.value], snap, bundle?.snapshot?.blocks) : { text: "", alt: null };
            return `${d.label} ${t.text || t.alt || "—"}${t.text && f?.unit ? ` ${f.unit}` : ""}`;
          }).join(" · ")} · 사용 안 함
        </p>
      )}
    </Card>
  );
}

// ───────────── 장비 상태 목록 ─────────────
function DeviceStates({ bundle, snap }: { bundle: Bundle | null; snap: Snap }) {
  const lab = (n: string) => fieldOf(bundle, `plc.${n}`)?.label ?? n;
  const box = (n: string, label?: string) => <StateBox key={n} on={snap?.[`plc.${n}`] as boolean | undefined} label={label ?? lab(n)} />;
  const lamp = (n: string, label: string) => (
    <span key={n} className="flex items-center gap-1.5 text-xs text-[#5B6470]" title={snap?.[`plc.${n}`] === true ? "감지" : "없음"}>
      <Dot on={snap?.[`plc.${n}`] === true} dim={snap?.[`plc.${n}`] === undefined} />{fieldOf(bundle, `plc.${n}`)?.label ?? label}
    </span>
  );
  const group = (title: string, items: ReactNode[]) => (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-[#5B6470]">{title}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">{items}</div>
    </div>
  );
  return (
    <Card title="장비 상태">
      <div className="space-y-3">
        {group("진공", [box("rotary", "Rotary"), box("turbo", "Turbo"), box("mv", "MV"), box("fv", "FV"), box("rv", "RV"), box("vent", "Vent")])}
        {group("가스 차단밸브", [box("ar_valve", "Ar"), box("o2_valve", "O₂")])}
        {group("셔터", [box("ms", "Main"), box("s1", "Gun1"), box("s2", "Gun2")])}
        {group("안전·유틸리티", [lamp("air", "Air"), lamp("g1", "G1"), lamp("g2", "G2"), lamp("atm", "ATM"), lamp("water", "Water"),
          box("mv_interlock", "MV 인터록"), box("door_up", "도어 올림"), box("door_down", "도어 내림")])}
      </div>
    </Card>
  );
}

// ───────────── 알림 ─────────────
function Alerts({ bundle, st, feed, onLog }: { bundle: Bundle | null; st: StateData | null; feed: FeedItem[]; onLog?: () => void }) {
  const alarms = st?.alarms ?? [];
  const lines = useMemo(() => feed.map((e) => ({ e, ...logLine(bundle, e) })).filter((r) => r.main).slice(-8).reverse(), [bundle, feed]);
  return (
    <Card title={<><BellRing size={15} /> 알림</>} right={onLog && <Btn size="sm" kind="ghost" onClick={onLog}>기록 전체 보기</Btn>}>
      <p className="mb-2 text-xs text-[#5B6470]">
        활성 알람 {alarms.length ? <Chip tone="alarm">{alarms.length}개</Chip> : <b className="text-[#1B1F24]">없음</b>}
      </p>
      {alarms.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {alarms.map((a) => <Chip key={a.ruleId} tone="alarm">{a.code ? reasonLabel(bundle, a.code) : a.ruleId}</Chip>)}
        </div>
      )}
      {lines.length ? (
        <ul className="space-y-1">
          {lines.map((r) => (
            <li key={r.e.id} className="text-[11px] leading-snug" title={r.raw}>
              <span className="mr-1.5 tabular-nums text-[#8A929D]">{fmtKst(r.e.ts).slice(-8)}</span>
              {r.level === "warn" ? <Chip tone="warn">{r.kind}</Chip> : r.level === "error" || r.level === "critical"
                ? <Chip tone="alarm">{r.kind}</Chip> : <b className="text-[#1B1F24]">{r.kind}</b>}
              <span className={`ml-1 ${r.level === "warn" ? "text-[#B54708]" : r.level === "error" || r.level === "critical" ? "text-[#B42318]" : "text-[#5B6470]"}`}>{r.text}</span>
            </li>
          ))}
        </ul>
      ) : <Empty>최근 사건이 없습니다</Empty>}
    </Card>
  );
}

// ───────────── 다음 공정(대기) ─────────────
function NextProcess({ bundle, st, recipes, lock, onAsk, onEdit }: {
  bundle: Bundle | null; st: StateData | null; recipes: ReturnType<typeof useRecipes>; lock: LockFn; onAsk: (a: Ask) => void;
  onEdit: (id: string | null) => void;
}) {
  const env = useMemo(() => checkEnvOf(bundle), [bundle]);
  const [pid, setPid] = useState("");
  const [hid, setHid] = useState("");
  const [full, setFull] = useState<RecipeFull | null>(null);
  const [hfull, setHfull] = useState<RecipeFull | null>(null);
  const [showSeq, setShowSeq] = useState(false);
  const list = recipes.list ?? [];
  const loaded = st?.recipe ?? null;
  const hr = st?.heaterRecipe ?? null;
  useEffect(() => {
    if (!pid) return;
    let off = false;
    void recipes.get(pid).then((r) => { if (!off) setFull(r.ok ? r.data.recipe : null); });
    return () => { off = true; };
  }, [pid, recipes]);
  useEffect(() => {
    if (!hid) return;
    let off = false;
    void recipes.get(hid).then((r) => { if (!off) setHfull(r.ok ? r.data.recipe : null); });
    return () => { off = true; };
  }, [hid, recipes]);
  const chk: RecipeCheck | null = useMemo(() => (env && full && pid ? checkProcessRecipe(full.rows as Row[], env) : null), [env, full, pid]);
  const hchk = useMemo(() => (env && hfull && hid ? checkHeaterRecipe(hfull.rows as Row[], hfull.gas, env) : null), [env, hfull, hid]);
  const exp = chk?.rows.flatMap((r) => r.expanded ?? []) ?? [];
  const t = exp.length ? expectedTime(exp) : null;
  const steps = exp.reduce((n, b) => n + b.steps.filter((s) => !s.internal).length, 0);
  const first = full?.rows.find((r) => r && Object.keys(r).length && !("blocks" in r)) as Row | undefined;
  const loadLock = !full || !pid ? "레시피를 고르세요" : !env ? "장비 정의를 아직 받지 못함" : chk?.errors ? `검사 오류 ${chk.errors}개 — 레시피 탭에서 고친 뒤` : lock("RECIPE_LOAD");
  const runLock = !hfull || !hid ? "히터 레시피를 고르세요" : !env ? "장비 정의를 아직 받지 못함" : hchk?.errors.length ? `검사 오류 ${hchk.errors.length}개 — 레시피 탭에서 고친 뒤` : lock("HEATER_RECIPE_RUN");
  const loadedWeb = loaded?.name ? list.find((r) => r.kind === "process" && r.name === loaded.name) : undefined;

  const askStart = async () => {
    let lines = [`장비에 적재된 '${loaded?.name || "이름 없음"}' · ${loaded?.rows ?? "-"}행`, "웹 목록에 같은 이름이 없어 내용을 보여 줄 수 없음"];
    if (loadedWeb) {
      const r = await recipes.get(loadedWeb.id);
      if (r.ok) {
        const rows = r.data.recipe.rows as Row[];
        lines = [...processLines(loadedWeb.name, rows, env ? checkProcessRecipe(rows, env) : null),
                 `웹 레시피 마지막 수정 ${fmtKst(loadedWeb.updatedAt)} — 적재 뒤 고쳤다면 장비 것과 다를 수 있음`];
      }
    }
    onAsk({ kind: "RECIPE_START", label: "적재 레시피 시작", detail: `'${loaded?.name ?? ""}'`, red: true, lines,
            note: "공정을 시작합니다 — 가스·파워·셔터가 움직입니다." });
  };
  const sel = "h-10 min-w-0 flex-1 rounded-[10px] border border-[#D9DDE3] bg-white px-2 text-sm";
  return (
    <Card title="다음 공정" className="lg:col-span-2">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[#E3E6EA] px-3 py-2 text-xs">
          {loaded ? (
            <>
              <span className="text-[#5B6470]">장비에 적재됨</span><b className="text-[#1B1F24]">{loaded.name || "이름 없음"}</b>
              <span className="text-[#5B6470]">· {loaded.rows ?? "-"}행</span>
              {!loadedWeb && <Chip>웹 목록에 없는 이름</Chip>}
              <span className="ml-auto flex gap-2">
                <Btn size="lg" kind="dangerSolid" lock={loaded.listActive ? "진행 중" : lock("RECIPE_START")} onClick={() => void askStart()}>
                  <Play size={14} /> 적재 시작
                </Btn>
                <Btn lock={lock("RECIPE_CLEAR")}
                  onClick={() => onAsk({ kind: "RECIPE_CLEAR", label: "적재 해제", detail: `'${loaded.name}'`, note: "장비에 올린 행 목록을 내립니다." })}>
                  <X size={14} /> 적재 해제
                </Btn>
              </span>
            </>
          ) : <span className="text-[#5B6470]">장비에 적재된 공정 레시피 없음 — 아래에서 골라 적재하세요</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={pid} onChange={(e) => { setPid(e.target.value); if (!e.target.value) setFull(null); }} aria-label="공정 레시피 고르기" className={sel}>
            <option value="">공정 레시피 고르기…</option>
            {list.filter((r) => r.kind === "process").map((r) => <option key={r.id} value={r.id}>{r.name}{r.check?.errors ? ` (오류 ${r.check.errors})` : ""}</option>)}
          </select>
          <Btn onClick={() => onEdit(pid || null)}><FileEdit size={14} /> {pid ? "레시피 편집" : "레시피 탭"}</Btn>
          <Btn size="lg" kind="primary" lock={loadLock}
            onClick={() => full && onAsk({ kind: "RECIPE_LOAD", label: "공정 레시피 적재", detail: `'${full.name}'`,
              args: { name: full.name, rows: full.rows }, lines: processLines(full.name, full.rows as Row[], chk),
              note: "장비에 행 목록을 올립니다(검사 뒤 적재). 시작은 '적재 시작'." })}>
            <Upload size={14} /> 적재
          </Btn>
        </div>
        {full && pid && (
          <div className="space-y-2 rounded-[10px] border border-[#E3E6EA] p-3">
            <div className="flex flex-wrap gap-1.5">
              {chk ? (chk.errors ? <Chip tone="alarm">검사 오류 {chk.errors}</Chip> : chk.warnings ? <Chip tone="warn">경고 {chk.warnings}</Chip> : <Chip>검사 통과</Chip>)
                : <Chip>검사 없음</Chip>}
              <Chip>{full.rows.length}행</Chip>
              {steps > 0 && <Chip>단계 {steps}개</Chip>}
              {t && <Chip>예상 {fmtSec(t.sec)}{t.open ? ` + 도달 대기 ${t.open}개` : ""}</Chip>}
            </div>
            {first && <p className="text-xs text-[#1B1F24]">{rowLine(first)}</p>}
            {chk?.first && chk.errors > 0 && <p className="text-[11px] text-[#B42318]">{chk.first}</p>}
            {exp.length > 0 && (
              <div>
                <button onClick={() => setShowSeq((o) => !o)} className="flex items-center gap-1 text-[11px] font-semibold text-[#1D4ED8]">
                  {showSeq ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 공정 순서 보기
                </button>
                {showSeq && <div className="mt-1 max-h-80 overflow-y-auto rounded-[10px] bg-[#F5F6F8] p-2"><ExpandedView exp={exp} bundle={bundle} /></div>}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-[#E3E6EA] pt-3">
          <span className="text-xs font-semibold text-[#1B1F24]">히터 레시피</span>
          {hr ? <span className="text-xs text-[#5B6470]">실행 중 <b className="text-[#1B1F24]">{hr.name}</b> · 스텝 {hr.step ?? "-"}/{hr.steps ?? "-"} — 히터 카드에서 조작</span> : (
            <>
              <select value={hid} onChange={(e) => { setHid(e.target.value); if (!e.target.value) setHfull(null); }} aria-label="히터 레시피 고르기" className={sel}>
                <option value="">히터 레시피 고르기…</option>
                {list.filter((r) => r.kind === "heater").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <Btn kind="dangerSolid" lock={runLock}
                onClick={() => hfull && onAsk({ kind: "HEATER_RECIPE_RUN", label: "히터 레시피 실행", detail: `'${hfull.name}'`,
                  args: { name: hfull.name, steps: hfull.rows, gas: hfull.gas }, red: true,
                  lines: heaterLines(hfull.name, hfull.rows as Row[], hfull.gas as Row | null), note: "히터를 켜고 스텝대로 온도를 올립니다." })}>
                <Flame size={14} /> 실행
              </Btn>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function Chk2Run({ equipment, bundle, st, runBlocks, feed, trend, recipes, lock, canKey, onAsk, onHmi, onLog, onEditRecipe, nowMs, skewMs }: {
  equipment: string; bundle: Bundle | null; st: StateData | null; runBlocks: RunBlocks | null; feed: FeedItem[]; trend: TrendPt[];
  recipes: ReturnType<typeof useRecipes> | null; lock: LockFn; canKey: (kind: string, key: string) => boolean; onAsk: (a: Ask) => void;
  onHmi: () => void; onLog?: () => void; onEditRecipe?: (id: string | null) => void; nowMs: number; skewMs: number;
}) {
  const { local } = useChk2Mode();
  const [wide, setWide] = useState(false);       // 순서 고치기 중 — 공정 순서 칸을 한 줄 전체로
  const kind = kindOf(bundle, st);
  const snap = st?.snapshot;
  if (kind === "active" || kind === "stopping") {
    return (
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(300px,1fr)_minmax(0,2fr)] 2xl:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)_minmax(260px,0.9fr)]">
        <div className={`min-w-0 ${wide ? "lg:col-span-2 2xl:col-span-3" : ""}`}>
          <Chk2Seq bundle={bundle} st={st} runBlocks={runBlocks} feed={feed} recipes={recipes} lock={lock} onAsk={onAsk} local={local} onWide={setWide} />
        </div>
        <div className="min-w-0 space-y-3">
          <KeyValues bundle={bundle} st={st} blocks={runBlocks} />
          <Chk2Trend trend={trend} equipment={equipment} runId={st?.runId ?? null} local={local} nowMs={nowMs} />
          <Chk2Adjust bundle={bundle} st={st} skewMs={skewMs} canKey={canKey} onAsk={onAsk} />
        </div>
        <div className="grid min-w-0 gap-3 lg:col-span-2 lg:grid-cols-2 2xl:col-span-1 2xl:grid-cols-1">
          <DeviceStates bundle={bundle} snap={snap} />
          <Alerts bundle={bundle} st={st} feed={feed} onLog={onLog} />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid items-start gap-3 lg:grid-cols-3">
        {recipes && onEditRecipe ? <NextProcess bundle={bundle} st={st} recipes={recipes} lock={lock} onAsk={onAsk} onEdit={onEditRecipe} />
          : <Card title="다음 공정" className="lg:col-span-2">
              <KV k="장비에 적재됨"><b className="text-xs">{st?.recipe?.name || "없음"}</b></KV>
              <p className="mt-2 text-[11px] text-[#5B6470]">레시피 고르기·적재는 웹 화면에서</p>
            </Card>}
        <Alerts bundle={bundle} st={st} feed={feed} onLog={onLog} />
      </div>
      <DeviceGrid bundle={bundle} st={st} snap={snap} lock={lock} onAsk={onAsk} onHmi={onHmi} />
    </div>
  );
}
