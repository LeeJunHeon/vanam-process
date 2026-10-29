// 챔버K v2 화면 문구(W-9) — 묶음 v11 의 화면용 이름·도움말로 사람이 읽는 글을 만든다(웹에 이름 표를 따로 두지 않는다).
// 묶음에 이름이 없으면(v10 이하 옛 장비) 지금처럼 코드·이름 그대로. 원시 코드·키는 '상세'에서만(부르는 쪽이 detail 로).
import type { BlockDef as BDef, BParamDef } from "@/lib/ops2/chk/blocks";
import type { ColDef } from "@/lib/ops2/chk/recipe";
import { CMD_STATUS, RUN_RESULT, commandLabel, reasonLabel, stateLabel, type Bundle } from "./types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const g6 = (x: number) => String(Number(x.toPrecision(6)));

/** 3725 → "1시간 2분 5초" */
export function fmtDur(sec: number): string {
  const t = Math.max(0, Math.round(sec));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return [h && `${h}시간`, m && `${m}분`, (x || (!h && !m)) && `${x}초`].filter(Boolean).join(" ");
}
/** 49 → "0:49", 3725 → "1:02:05" */
export function fmtClock(sec: number): string {
  const t = Math.max(0, Math.round(sec));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
}

// ───────────── 블록 ─────────────
export const blockDef = (b: Bundle | null, type: string): BDef | undefined =>
  b?.blocks?.defs?.find((d) => d.type === type) as BDef | undefined;
export const blockName = (b: Bundle | null, type: string) => blockDef(b, type)?.label ?? type;
export const paramLabel = (p: BParamDef) => p.label || p.name;

/** 블록 값 하나를 글로 — enum·list 는 enumLabels, bool 은 켬이면 이름만 */
function valueText(p: BParamDef | undefined, v: unknown, name: string): string | null {
  if (v === null || v === undefined || v === "" || v === false) return null;
  const lab = p ? paramLabel(p) : name;
  const el = p?.enumLabels ?? null;
  if (v === true) return lab;
  if (Array.isArray(v)) return v.length ? v.map((x) => el?.[String(x)] ?? String(x)).join("·") : null;
  if (isObj(v)) return null;                                      // 감시 등 — 요약에서는 뺀다
  if (typeof v === "string") return el?.[v] ?? `${lab} ${v}`;
  const n = num(v);
  return n === null ? `${lab} ${String(v)}` : `${lab} ${g6(n)}${p?.unit ? ` ${p.unit}` : ""}`;
}

/** 블록 한 줄 요약 — 묶음 summary(v11) 값들, 없으면 값이 있는 것 전부(옛 장비) */
export function blockSummary(b: Bundle | null, type: string, params: Obj): string {
  const d = blockDef(b, type);
  const names = d?.summary?.length ? d.summary : Object.keys(params);
  return names.map((n) => valueText(d?.params.find((p) => p.name === n), params[n], n)).filter(Boolean).join(" · ");
}

// ───────────── 레시피 열·검사 문구 ─────────────
export const colLabel = (c: ColDef) => c.label || c.v1Name || c.name;

/** "if:ar" → "Ar 사용 시 필수", always → "필수" */
export function requiredText(c: ColDef, cols: ColDef[]): string {
  if (c.required === "always") return "필수";
  if (c.required?.startsWith("if:")) {
    const k = c.required.slice(3);
    const base = cols.find((x) => x.name === k);
    return `${base ? colLabel(base) : k} 사용 시 필수`;
  }
  return "";
}

/** 검사 문구 안의 열·블록 값 이름을 화면 이름으로("ar_flow: 0 이하" → "Ar 유량: 0 이하"). 원문은 부르는 쪽이 title·상세로 */
export function humanize(msg: string, names: Record<string, string>): string {
  if (!msg) return msg;
  return msg.replace(/\b[a-z][a-z0-9_]*[a-z0-9]\b/g, (w) => names[w] ?? w);
}
export function colNames(cols: ColDef[]): Record<string, string> {
  return Object.fromEntries(cols.filter((c) => c.label).map((c) => [c.name, c.label as string]));
}
export function blockNames(b: Bundle | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of b?.blocks?.defs ?? []) {
    out[d.type] = d.label;
    for (const p of (d as BDef).params ?? []) if (p.label && !(p.name in out)) out[p.name] = p.label;
  }
  return out;
}

// ───────────── 공정 이름 ─────────────
/** 런 이력·공정 기록의 이름 — 장비 이름 "CSV 1/2 - Ti 증착" 은 "UI 검토 1 · 1/2행 · Ti 증착"(레시피 이름이 있을 때) */
export function runTitle(r: { name: string | null; recipeName: string | null; stepNo?: number | null }): string {
  const raw = r.name ?? r.recipeName ?? "-";
  const m = /^CSV (\d+)\/(\d+) - (.*)$/.exec(r.name ?? "");
  if (m && r.recipeName) return `${r.recipeName} · ${m[1]}/${m[2]}행 · ${m[3]}`;
  if (m) return `${m[1]}/${m[2]}행 · ${m[3]}`;
  return raw;
}

// ───────────── 로그(사건) ─────────────
export type FeedLike = { type: string; data: Obj };
export type LogLine = { level: string; kind: string; text: string; raw: string; main: boolean };

const ADJ_RESULT: Record<string, string> = {
  applied: "바로 적용", scheduled: "다음 블록부터", confirmed: "장비 확인", failed: "장비 적용 실패", rejected: "거부",
};

/** 공정 중 수정 사건 — adjust 항목 label 로 "공정 중 수정 · 홍길동 · Ar 유량 20 → 25 sccm · 바로 적용" */
export function adjustLine(b: Bundle | null, d: Obj): string {
  const it = b?.adjust?.items?.find((x) => x.device === d.device && x.item === d.item);
  const name = it?.label || `${s(d.device)}.${s(d.item)}`;
  const unit = it?.param?.unit ? ` ${it.param.unit}` : "";
  const v = (x: unknown) => (x === null || x === undefined ? "—" : String(x));
  const r = s(d.result);
  return `공정 중 수정 · ${v(d.by)} · ${name} ${v(d.old)} → ${v(d.new)}${unit} · ${ADJ_RESULT[r] ?? r}`
    + `${d.reason ? ` (${reasonLabel(b, s(d.reason))})` : ""}`;
}

/** 로그 한 줄 — 평소 보기(main)와 상세 보기 문구 */
export function logLine(b: Bundle | null, e: FeedLike): LogLine {
  const d = e.data;
  if (e.type === "run_start") {
    return { level: "info", kind: "공정 시작", main: true, raw: `RUN_START ${s(d.runId)}`,
             text: `${runTitle({ name: s(d.name) || null, recipeName: s(d.recipeName) || null }) || "공정"}${d.by ? ` · ${s(d.by)}` : ""}` };
  }
  if (e.type === "run_end") {
    const r = s(d.result);
    return { level: r === "done" ? "info" : "warn", kind: "공정 끝", main: true, raw: `RUN_END ${s(d.reasonCode)}`,
             text: `${RUN_RESULT[r] ?? r}${d.reasonCode ? ` · ${reasonLabel(b, s(d.reasonCode))}` : ""}` };
  }
  if (e.type === "cmd_result") {
    const ok = d.status === "accepted";
    return { level: ok ? "info" : "warn", kind: "명령 결과", main: true,
             raw: `${s(d.kind)} ${s(d.status)} ${s(d.reasonCode)} (${s(d.source)}${d.by ? `, ${s(d.by)}` : ""})`,
             text: `${commandLabel(b, s(d.kind))} — ${CMD_STATUS[s(d.status)] ?? s(d.status)}${d.reasonCode ? ` · ${reasonLabel(b, s(d.reasonCode))}` : ""}` };
  }
  if (e.type === "config_ack") {
    return { level: d.status === "rejected" ? "warn" : "info", kind: "설정 결과", main: true, raw: `CONFIG_ACK ${s(d.reasonCode)}`,
             text: `설정 버전 ${s(d.version)} ${s(d.status)}${d.reasonCode ? ` — ${reasonLabel(b, s(d.reasonCode))}` : ""}` };
  }
  // event
  const c = isObj(d.context) ? d.context : {};
  const source = s(c.source), kind = s(c.kind);
  const cd = isObj(c.data) ? c.data : {};
  const level = s(d.level) || "info";
  const ek = b?.eventKinds?.find((x) => x.source === source && x.kind === kind);
  const code = s(d.code);
  const raw = `${code}${d.ruleId ? ` [${s(d.ruleId)}]` : ""} ${s(d.message)}`.trim();
  const issue = level === "warn" || level === "error" || level === "critical";
  const main = issue || (b?.eventKinds ? ek?.level === "main" : true);
  const name = ek?.label ?? (reasonLabel(b, code) !== code ? reasonLabel(b, code) : code);
  let text: string;
  if (code === "PROCESS_ADJUST") text = adjustLine(b, cd);
  else if (source === "process" && kind === "state" && cd.from !== undefined) {
    text = `${stateLabel(b, s(cd.from))} → ${stateLabel(b, s(cd.to))}`;
  } else if (source === "process" && kind === "block" && cd.type) {
    const tag = s(cd.label);
    const bn = `${blockName(b, s(cd.type))}${tag && tag !== blockName(b, s(cd.type)) ? `(${tag})` : ""}`;
    if (cd.phase === "end") {
      const res = ({ ok: "정상", done: "정상", aborted: "중단", error: "오류", failed: "실패" } as Record<string, string>)[s(cd.result)] ?? s(cd.result);
      const el = num(cd.elapsed_s);
      text = `${s(cd.index ?? cd.no)} ${bn} 끝 — ${res}${el !== null ? `, ${fmtDur(el)}` : ""}`
        + `${cd.reason ? ` (${reasonLabel(b, s(cd.reason))})` : ""}`;
    } else text = `${s(cd.index ?? cd.no)}/${s(cd.total)} ${bn} 시작`;
  } else {
    const label = reasonLabel(b, code);
    text = [label !== code && label !== name ? label : "", s(d.message)].filter(Boolean).join(" — ");
  }
  return { level, kind: name, text, raw, main };
}
