"use client";

// 챔버K v2 설정(W-5) — 보기는 장비 담당자·관리자, 적용·되돌리기는 관리자(묶음 CONFIG_APPLY·CONFIG_ROLLBACK role admin).
// 설정 버전은 장비별(CHK2 와 CHK2-SIM 따로). /api/ops2/[equipment]/config(GET 보기·POST 적용·되돌리기), /config/[version].
// 지금 값 = 장비가 쓰는 버전(state.configVersion)의 웹 행 — 없으면 묶음 current + 안내. 그보다 큰 resync 행(관리자
// "장비 저장 값으로 기준 다시 읽기" — 장비에 명령 없이 묶음 stored 로 만든 행)이 있으면 그 값이 기준(5-12).
// 대기 중 = 지금보다 새 웹 버전(ack 없음·pending_*)과 state.configPending(idle·restart 대기 키 → 값).
// 편집: 묶음 params 를 group 별로(라벨·단위·형식·범위·enum·pattern·기본값·safety·apply·desc·v1 출처). 비밀값은 보이지도
// 보내지도 않는다, webLocked 는 읽기만, 노트북 덮어쓰기가 정한 키(hello overriddenKeys·ack overriddenKeys)는
// "노트북 덮어쓰기 — 지금 실행 값 X" — 적용 값은 저장 값 기준(덮어쓰기 값을 config 에 넣지 않는다).
// 적용이 거부되면 거부된 키(errors·detail 에 나온 키)를 표시하고 "편집 비우기".
// W-9: 묶음 고르기 = paramGroups label(v11), 표 첫 칸 = label 굵게·키는 아래 작은 회색, 등급 높음·중간·낮음, 적용 시점은 한글만.
// desc 는 보이고 note·v1 출처·원래 적용 시점 이름은 '상세'에서만.
// 웹 검사는 키 하나씩(lib/ops2/configCheck) — 키 사이 규칙(crossRules)은 설명만, 판단은 장비(CONFIG_INVALID errors 그대로).
// 이력: 버전 목록 → 하나(changes·ack) → 두 버전 비교.
import { useCallback, useEffect, useMemo, useState } from "react";
import { DownloadCloud, Eraser, GitCompare, History, RotateCcw, Save, Settings2 } from "lucide-react";
import { CONFIG_REASON, checkParamValue } from "@/lib/ops2/configCheck";
import { fmtKst } from "@/lib/ops2/time";
import { Card, SimpleConfirm, type Notice } from "./kit";
import { reasonLabel, type Bundle, type ParamDef, type Perms, type StateData } from "./types";
import { useChk2Mode } from "./mode";

const SAFETY_TEXT: Record<string, string> = { H: "높음", M: "중간", L: "낮음" };
const TYPE_TEXT: Record<string, string> = { float: "숫자", int: "정수", str: "글", bool: "켬·끔", enum: "선택" };

type Version = {
  version: number; kind: string; createdBy: string; createdAt: string; note: string | null; cmdId: string | null;
  ackStatus: string | null; ackAt: string | null; reasonCode: string | null; errors: unknown; appliedKeys: unknown;
  pendingKeys: unknown; overriddenKeys: unknown; changes: unknown; paramValues?: Record<string, unknown>;
};
type Overview = {
  canApply: boolean; canRollback: boolean; deviceVersion: number | null; current: Record<string, unknown> | null;
  base: { version: number; kind: string } | null;            // 지금 값의 행(장비 버전 행 또는 그보다 큰 resync 행)
  overridden: Record<string, unknown>;                        // hello overriddenKeys → 실행 값(모르면 null)
  resyncPending: boolean;
  currentRow: { version: number; kind: string; ackStatus: string | null; overriddenKeys: unknown; pendingKeys: unknown } | null;
  statePending: { idle?: Record<string, unknown>; restart?: Record<string, unknown> } | null;
  pending: { version: number; ackStatus: string | null; values: Record<string, unknown> }[];
  webMaxVersion: number | null; versions: Version[];
};
type ApplyResp = {
  version: number | null; cmdId: string | null; waiting?: boolean; action?: string;
  command: { status: string; reasonCode: string | null; detail: string | null } | null; ack: Version | null;
  error?: string; detail?: string; errors?: string[];
};

const APPLY_TEXT: Record<string, string> = {
  live: "바로(공정 중에도)", idle: "공정·히터가 멈춰 있을 때(그 전에는 대기)", restart: "프로그램을 다시 켤 때",
};
const STATUS_TEXT: Record<string, string> = {
  applied: "적용됨", pending_idle: "대기(공정 끝나면)", pending_restart: "대기(재시작 때)", rejected: "거부",
};
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const show = (v: unknown) => (v === undefined ? "—" : v === null ? "null" : typeof v === "string" ? (v === "" ? '""' : v) : JSON.stringify(v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 칸 글 → 키 형식의 값 */
function parse(p: ParamDef, text: string): unknown {
  if (p.type === "int" || p.type === "float") {
    const t = text.trim();
    return t !== "" && Number.isFinite(Number(t)) ? Number(t) : text;
  }
  return text;
}

function Badge({ tone, children, title }: { tone: string; children: React.ReactNode; title?: string }) {
  return <span title={title} className={`rounded px-1 text-[10px] font-semibold ${tone}`}>{children}</span>;
}

function StatusBadge({ s }: { s: string | null }) {
  const tone = !s ? "bg-gray-100 text-gray-500" : s === "applied" ? "bg-emerald-50 text-emerald-700"
    : s === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700";
  return <Badge tone={tone}>{s ? STATUS_TEXT[s] ?? s : "응답 없음"}</Badge>;
}

function ParamInput({ p, value, onChange, readOnly, error }: {
  p: ParamDef; value: unknown; onChange: (v: unknown) => void; readOnly: boolean; error: string | null;
}) {
  const cls = `rounded-md border px-1.5 py-0.5 text-[11px] disabled:bg-gray-50 disabled:text-gray-500 ${error ? "border-rose-400 bg-rose-50" : "border-gray-200"}`;
  if (p.type === "bool") {
    return (
      <select disabled={readOnly} value={value === true ? "true" : value === false ? "false" : ""} className={cls}
        onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">true</option><option value="false">false</option>
      </select>
    );
  }
  if (p.type === "enum") {
    return (
      <select disabled={readOnly} value={String(value ?? "")} className={cls} onChange={(e) => onChange(e.target.value)}>
        {(p.enum ?? []).map((x) => <option key={String(x)} value={String(x)}>{String(x)}</option>)}
      </select>
    );
  }
  return (
    <input disabled={readOnly} value={value === undefined || value === null ? "" : String(value)}
      inputMode={p.type === "str" ? "text" : "decimal"} onChange={(e) => onChange(parse(p, e.target.value))}
      className={`${cls} ${p.type === "str" ? "w-48" : "w-28 tabular-nums"}`} />
  );
}

function VersionDetail({ v }: { v: Version }) {
  const ch = Array.isArray(v.changes) ? (v.changes as { key: string; old: unknown; new: unknown }[]) : [];
  const errs = arr(v.errors);
  return (
    <div className="space-y-1.5 rounded-xl bg-gray-50 p-2 text-[11px]">
      <p className="text-gray-600">
        버전 <b>{v.version}</b> · {v.kind} · {v.createdBy} · {fmtKst(v.createdAt)} · <StatusBadge s={v.ackStatus} />
        {v.reasonCode && <span className="ml-1 text-rose-600">{CONFIG_REASON[v.reasonCode] ?? v.reasonCode}</span>}
        {v.note && <span className="ml-1 text-gray-500">· 메모 {v.note}</span>}
      </p>
      {errs.length > 0 && <ul className="list-disc pl-4 text-rose-700">{errs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {[["바로 적용", arr(v.appliedKeys)], ["대기", arr(v.pendingKeys)], ["노트북 덮어쓰기가 이김", arr(v.overriddenKeys)]]
        .filter(([, l]) => (l as string[]).length).map(([t, l]) => (
          <p key={t as string} className="text-gray-600">{t as string}: <span className="font-mono">{(l as string[]).join(", ")}</span></p>
        ))}
      {ch.length ? (
        <table className="w-full"><thead><tr className="text-left text-gray-400"><th className="pr-2 font-medium">키</th><th className="pr-2 font-medium">전</th><th className="font-medium">후</th></tr></thead>
          <tbody>{ch.map((c, i) => (
            <tr key={i} className="border-t border-gray-100"><td className="pr-2 font-mono">{c.key}</td><td className="pr-2 text-gray-500">{show(c.old)}</td><td className="font-semibold">{show(c.new)}</td></tr>
          ))}</tbody></table>
      ) : <p className="text-gray-400">바뀐 키 기록 없음{v.kind === "import" ? "(처음 가져온 장비 값)" : ""}</p>}
    </div>
  );
}

export default function Chk2Config({ equipment, bundle, st, perms, connected, reloadSchema, notify }: {
  equipment: string; bundle: Bundle | null; st: StateData | null; perms: Perms | null; connected: boolean;
  reloadSchema: () => Promise<void>; notify: (n: Omit<Notice, "id" | "at">) => void;
}) {
  const { detail } = useChk2Mode();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"edit" | "history">("edit");
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [group, setGroup] = useState<string>("process");
  const [q, setQ] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [ask, setAsk] = useState<"apply" | "rollback" | "resync" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<ApplyResp | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [picked, setPicked] = useState<Version | null>(null);
  const [cmp, setCmp] = useState<[number | null, number | null]>([null, null]);
  const [cmpRows, setCmpRows] = useState<[Version, Version] | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/ops2/${encodeURIComponent(equipment)}/config?limit=100`, { cache: "no-store" }).catch(() => null);
    if (!r) return setErr("웹 서버에 닿지 않습니다");
    if (r.status === 403) return setErr("설정은 장비 담당자·관리자만 볼 수 있습니다");
    if (!r.ok) return setErr(`설정을 읽지 못했습니다(${r.status})`);
    setErr(null);
    setOv(await r.json());
  }, [equipment]);
  const cfgVer = st?.configVersion;
  const pendKey = JSON.stringify(st?.configPending ?? null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [open, load, cfgVer, pendKey]);

  const fetchVersion = useCallback(async (v: number): Promise<Version | null> => {
    const r = await fetch(`/api/ops2/${encodeURIComponent(equipment)}/config/${v}`, { cache: "no-store" }).catch(() => null);
    return r?.ok ? (await r.json()).version : null;
  }, [equipment]);
  useEffect(() => {
    if (pick === null) return;
    let off = false;
    void fetchVersion(pick).then((v) => { if (!off) setPicked(v); });
    return () => { off = true; };
  }, [pick, fetchVersion]);
  useEffect(() => {
    const [a, b] = cmp;
    if (a === null || b === null) return;
    let off = false;
    void Promise.all([fetchVersion(a), fetchVersion(b)]).then(([x, y]) => { if (!off && x && y) setCmpRows([x, y]); });
    return () => { off = true; };
  }, [cmp, fetchVersion]);

  const params = useMemo(() => (bundle?.params ?? []).filter((p) => p.scope !== "secret"), [bundle]);
  const groups = useMemo(() => [...new Set(params.map((p) => p.group ?? "기타"))], [params]);
  const nowVal = (p: ParamDef) => (ov?.current ? ov.current[p.key] : p.current);
  const changed = Object.keys(edits).filter((k) => {
    const p = params.find((x) => x.key === k);
    return p && !same(edits[k], nowVal(p));
  });
  const errors = Object.fromEntries(changed.map((k) => [k, checkParamValue(params.find((x) => x.key === k)!, edits[k])]));
  const bad = changed.filter((k) => errors[k]);
  const canApply = !!ov?.canApply && connected;
  const readOnly = !ov?.canApply;
  const idleP = ov?.statePending?.idle ?? {}, restartP = ov?.statePending?.restart ?? {};
  const overridden = new Set([...arr(ov?.currentRow?.overriddenKeys), ...Object.keys(ov?.overridden ?? {})]);
  // 마지막 적용이 거부됐으면 그 오류 글에 나온 키
  const rejected = useMemo(() => {
    const r = lastResult;
    if (!r || r.action !== "apply" || !(r.ack?.ackStatus === "rejected" || r.command?.status === "rejected")) return new Set<string>();
    const text = [...arr(r.ack?.errors), r.command?.detail ?? ""].join(" ");
    const keys = params.map((p) => p.key).filter((k) => new RegExp(`(^|[^A-Z0-9_])${k}([^A-Z0-9_]|$)`).test(text));
    // 키 사이 규칙 오류는 "[X08] MAX < START" 처럼 규칙 id 만 — 묶음 crossRules 의 키로
    for (const m of text.matchAll(/\[([A-Z]+\d+)\]/g)) keys.push(...(bundle?.crossRules?.find((c) => c.id === m[1])?.keys ?? []));
    return new Set(keys);
  }, [lastResult, params, bundle]);
  const pendingWeb = new Map<string, number[]>();
  for (const pv of ov?.pending ?? []) {
    for (const p of params) if (ov?.current && !same(pv.values?.[p.key], ov.current[p.key])) {
      pendingWeb.set(p.key, [...(pendingWeb.get(p.key) ?? []), pv.version]);
    }
  }
  const busyNow = !!st && (bundle?.states?.find((s) => s.name === st.procState)?.kind === "active" || !!st.heaterRecipe);

  const shown = params.filter((p) => {
    if (onlyChanged) return changed.includes(p.key);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      return p.key.toLowerCase().includes(t) || (p.label ?? "").toLowerCase().includes(t);
    }
    return (p.group ?? "기타") === group;
  });
  const rules = (bundle?.crossRules ?? []).filter((r) => r.keys.some((k) => changed.includes(k)));

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    const r = await fetch(`/api/ops2/${encodeURIComponent(equipment)}/config?wait=12`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    const b: ApplyResp = r ? await r.json().catch(() => ({})) : { error: "network" } as ApplyResp;
    b.action = String(body.action);
    setLastResult(b);
    const what = { apply: "적용", rollback: "되돌리기", resync: "기준 다시 읽기" }[String(body.action)] ?? "";
    if (!r || !r.ok) {
      notify({ tone: "bad", title: `설정 ${what} — 보내지 못함`, text: `${b.error ?? `HTTP ${r?.status}`}${b.detail ? ` · ${b.detail}` : ""}` });
      return;
    }
    if (body.action === "resync") {
      notify(b.ack ? { tone: "ok", title: `설정 기준 v${b.ack.version} — 장비 저장 값으로 다시 읽음`, text: "다음 적용은 이 값 위에 만듭니다(장비에는 보내지 않음)" }
        : { tone: "warn", title: "설정 기준 다시 읽기 — 장비 정의를 기다리는 중", text: "장비가 다음에 연락하면 만들어집니다(1분 안)" });
      await load();
      return;
    }
    const a = b.ack, c = b.command;
    const reason = a?.reasonCode ?? c?.reasonCode ?? null;
    if (a?.ackStatus && a.ackStatus !== "rejected") {
      notify({ tone: a.ackStatus === "applied" ? "ok" : "warn", title: `설정 버전 ${a.version} — ${STATUS_TEXT[a.ackStatus] ?? a.ackStatus}`,
               text: [arr(a.appliedKeys).length && `바로 적용 ${arr(a.appliedKeys).length}`, arr(a.pendingKeys).length && `대기 ${arr(a.pendingKeys).join(", ")}`,
                      arr(a.overriddenKeys).length && `노트북 덮어쓰기가 이김 ${arr(a.overriddenKeys).join(", ")}`].filter(Boolean).join(" · ") || undefined });
      setEdits({});
    } else if (a?.ackStatus === "rejected" || c?.status === "rejected") {
      notify({ tone: "bad", title: `설정 버전 ${b.version ?? "-"} — 거부`,
               text: `${reason ? CONFIG_REASON[reason] ?? reasonLabel(bundle, reason) : ""}${reason ? ` (${reason})` : ""}${arr(a?.errors).length ? ` — ${arr(a?.errors).slice(0, 3).join(" / ")}` : c?.detail ? ` — ${c.detail}` : ""}` });
    } else {
      notify({ tone: "warn", title: `설정 버전 ${b.version ?? "-"} — 결과를 기다리는 중`, text: `명령 ${c?.status ?? "-"} — 이력에서 확인하세요` });
    }
    await load();
    await reloadSchema();
  };

  if (!perms?.canOperate) return null;           // 보기는 담당자·관리자만(서버도 403)

  return (
    <Card title={<><Settings2 size={15} /> 설정</>}
      right={
        <span className="flex items-center gap-1.5">
          {open && (
            <span className="flex rounded-xl bg-gray-100 p-0.5">
              {([["edit", "편집"], ["history", "이력"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tab === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>{l}</button>
              ))}
            </span>
          )}
          <button onClick={() => setOpen((o) => !o)} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50">
            {open ? "접기" : "열기"}
          </button>
        </span>
      }>
      {!open ? (
        <p className="text-[11px] text-gray-500">장비 설정 버전 v{st?.configVersion ?? "-"}
          {st?.configPending && ` · 대기 중 ${Object.keys(st.configPending.idle ?? {}).length + Object.keys(st.configPending.restart ?? {}).length}개 키`}
          {" "}· 장비별 버전(CHK2·CHK2-SIM 따로) · 적용·되돌리기는 관리자</p>
      ) : err ? <p className="text-xs text-rose-600">{err}</p> : !ov ? <p className="text-xs text-gray-400">읽는 중…</p> : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
            <span>장비 버전 <b className="text-gray-900">v{ov.deviceVersion ?? "-"}</b>{detail && ov.currentRow && ` (${ov.currentRow.kind})`}</span>
            {ov.base && ov.base.version !== ov.deviceVersion && (
              <Badge tone="bg-blue-50 text-blue-700" title="장비에 보내지 않은 기준 — 다음 적용이 이 값 위에 만들어진다">
                기준 v{ov.base.version}(장비 저장 값{detail ? ` · ${ov.base.kind}` : ""})
              </Badge>
            )}
            <span>웹 최대 v{ov.webMaxVersion ?? "-"}</span>
            {ov.pending.length > 0 && <Badge tone="bg-amber-50 text-amber-700">대기 중 웹 버전 {ov.pending.map((p) => `v${p.version}(${p.ackStatus ? STATUS_TEXT[p.ackStatus] ?? p.ackStatus : "응답 없음"})`).join(", ")}</Badge>}
            {(Object.keys(idleP).length > 0 || Object.keys(restartP).length > 0) && (
              <Badge tone="bg-amber-50 text-amber-700">장비 대기 키 — 공정 끝나면 {Object.keys(idleP).length} · 재시작 때 {Object.keys(restartP).length}</Badge>
            )}
            {!ov.canApply && <Badge tone="bg-gray-100 text-gray-500">보기만 — 적용은 관리자</Badge>}
            {Object.keys(ov.overridden ?? {}).length > 0 && (
              <Badge tone="bg-violet-50 text-violet-700" title={Object.keys(ov.overridden).join(", ")}>
                노트북 설정 파일이 정한 값 {Object.keys(ov.overridden).length}개
                {detail && <span className="ml-1 font-mono font-normal">{Object.keys(ov.overridden).join(", ")}</span>}
              </Badge>
            )}
            <span className="ml-auto flex gap-1.5">
              {ov.canApply && (
                <button disabled={!connected || busy || ov.resyncPending} onClick={() => setAsk("resync")}
                  title="장비에 명령을 보내지 않고, 장비에 저장된 값으로 다음 적용의 기준을 다시 만든다"
                  className="flex items-center gap-1 rounded-xl border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                  <DownloadCloud size={13} /> {ov.resyncPending ? "기준 다시 읽는 중…" : "장비 저장 값으로 기준 다시 읽기"}
                </button>
              )}
              {ov.canRollback && (
                <button disabled={!connected || busy} onClick={() => setAsk("rollback")}
                  className="flex items-center gap-1 rounded-xl border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                  <RotateCcw size={13} /> 이전 버전으로 되돌리기
                </button>
              )}
            </span>
          </div>
          {!ov.current && (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              장비 버전 v{ov.deviceVersion ?? "-"} 의 값이 웹에 없습니다(노트북에서 생긴 버전 등) — 장비가 지금 쓰는 값을 보여 줍니다. 적용하려면 먼저 되돌리기나 장비 확인.
            </p>
          )}

          {tab === "edit" ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <select value={group} onChange={(e) => { setGroup(e.target.value); setQ(""); setOnlyChanged(false); }}
                  className="rounded-md border border-gray-200 px-1 py-0.5">
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {bundle?.paramGroups?.find((x) => x.key === g)?.label ?? g} ({params.filter((p) => (p.group ?? "기타") === g).length})
                    </option>
                  ))}
                </select>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="키·라벨 찾기" className="w-40 rounded-md border border-gray-200 px-1.5 py-0.5" />
                <label className="flex items-center gap-1"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> 바꾼 것만({changed.length})</label>
                {busyNow && <Badge tone="bg-amber-50 text-amber-700">공정·히터 운전 중 — 등급 높음 값은 장비가 거부, 멈춰 있을 때 적용하는 값은 끝난 뒤 적용</Badge>}
                <span className="ml-auto flex items-center gap-1.5">
                  {changed.length > 0 && <button onClick={() => setEdits({})} className="px-1 text-gray-400 underline">되돌림</button>}
                  {ov.canApply && (
                    <button disabled={!canApply || busy || !changed.length || bad.length > 0 || !ov.current}
                      title={bad.length ? `웹 검사 오류 ${bad.length}개` : !connected ? "장비 끊김" : undefined}
                      onClick={() => setAsk("apply")}
                      className="flex items-center gap-1 rounded-xl bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                      <Save size={13} /> 적용({changed.length})
                    </button>
                  )}
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>{["키", "지금 값", "새 값", "형식·범위", "기본값", "등급·적용", "설명"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {shown.map((p) => {
                      const v = p.key in edits ? edits[p.key] : nowVal(p);
                      const e = changed.includes(p.key) ? errors[p.key] : null;
                      const range = p.type === "int" || p.type === "float" ? `${p.min ?? ""}~${p.max ?? ""}` : "";
                      return (
                        <tr key={p.key} className={`border-t border-gray-100 align-top ${rejected.has(p.key) ? "bg-rose-50/60" : changed.includes(p.key) ? "bg-blue-50/40" : ""}`}>
                          <td className="px-2 py-1.5">
                            <p className="text-xs font-bold text-gray-900">{p.label || p.key}</p>
                            <p className="font-mono text-[10px] text-gray-400">{p.key}</p>
                            <span className="flex flex-wrap gap-0.5">
                              {p.webLocked && <Badge tone="bg-gray-200 text-gray-600">노트북 설정 파일로만</Badge>}
                              {overridden.has(p.key) && (
                                <Badge tone="bg-violet-50 text-violet-700" title="노트북 local_override.json 이 정한 키 — 웹 적용 값은 저장 값 기준, 실행은 덮어쓰기 값">
                                  노트북 덮어쓰기 — 지금 실행 값 {ov.overridden && p.key in ov.overridden && ov.overridden[p.key] !== null ? show(ov.overridden[p.key]) : "?"}
                                </Badge>
                              )}
                              {rejected.has(p.key) && <Badge tone="bg-rose-600 text-white">거부됨</Badge>}
                              {p.key in idleP && <Badge tone="bg-amber-50 text-amber-700" title={`대기 값 ${show(idleP[p.key])}`}>대기(공정 끝나면) → {show(idleP[p.key])}</Badge>}
                              {p.key in restartP && <Badge tone="bg-amber-50 text-amber-700" title={`대기 값 ${show(restartP[p.key])}`}>대기(재시작) → {show(restartP[p.key])}</Badge>}
                              {pendingWeb.has(p.key) && <Badge tone="bg-amber-50 text-amber-700">웹 v{pendingWeb.get(p.key)!.join("·v")} 에서 바뀜</Badge>}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 tabular-nums text-gray-700">{show(nowVal(p))}{p.unit && <span className="text-gray-400"> {p.unit}</span>}</td>
                          <td className="px-2 py-1.5">
                            <ParamInput p={p} value={v} readOnly={readOnly || !!p.webLocked} error={e}
                              onChange={(x) => setEdits((m) => ({ ...m, [p.key]: x }))} />
                            {e && <p className="mt-0.5 text-rose-600">{e}</p>}
                          </td>
                          <td className="px-2 py-1.5 text-gray-500">
                            {detail ? p.type : TYPE_TEXT[p.type ?? ""] ?? p.type}{range && ` · ${range}`}{p.unit && ` ${p.unit}`}
                            {p.enum && <p className="text-[10px]">{p.enum.map(String).join(" · ")}</p>}
                            {p.pattern && <p className="font-mono text-[10px]">/{p.pattern}/</p>}
                          </td>
                          <td className="px-2 py-1.5 tabular-nums text-gray-400">{show(p.default)}</td>
                          <td className="px-2 py-1.5">
                            <Badge tone={p.safety === "H" ? "bg-rose-600 text-white" : p.safety === "M" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}
                              title={p.safety === "H" ? "공정 중 변경 금지·관리자 전용" : undefined}>{SAFETY_TEXT[p.safety ?? ""] ?? p.safety}</Badge>
                            <p className="mt-0.5 text-[10px] text-gray-500">{APPLY_TEXT[p.apply ?? ""] ?? p.apply}</p>
                            {detail && <p className="font-mono text-[10px] text-gray-300">{p.safety} · {p.apply}</p>}
                          </td>
                          <td className="max-w-xs px-2 py-1.5 text-gray-500">
                            {p.desc}{detail && p.note && <p className="text-[10px] text-gray-400">{p.note}</p>}
                            {detail && p.v1Source && <p className="text-[10px] text-gray-400">v1 {p.v1Key ?? ""} · {p.v1Source}</p>}
                          </td>
                        </tr>
                      );
                    })}
                    {!shown.length && <tr><td colSpan={7} className="p-3 text-center text-gray-400">해당 키 없음</td></tr>}
                  </tbody>
                </table>
              </div>
              {rules.length > 0 && (
                <div className="rounded-lg bg-gray-50 p-2 text-[11px] text-gray-600">
                  <p className="font-semibold">바꾼 키가 걸린 키 사이 규칙(판단은 장비 — 어기면 CONFIG_INVALID)</p>
                  <ul className="list-disc pl-4">{rules.map((r) => <li key={r.id}><span className="font-mono">{r.id}</span> {r.desc} <span className="text-gray-400">({r.keys.join(", ")})</span></li>)}</ul>
                </div>
              )}
              {lastResult?.action === "apply" && (lastResult.ack?.ackStatus === "rejected" || lastResult.command?.status === "rejected") && (
                <div className="rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">
                      버전 {lastResult.version ?? "-"} 거부 — {(() => { const rc = lastResult.ack?.reasonCode ?? lastResult.command?.reasonCode; return rc ? `${CONFIG_REASON[rc] ?? reasonLabel(bundle, rc)} (${rc})` : ""; })()}
                    </p>
                    <span>거부된 키: {rejected.size ? <span className="font-mono">{[...rejected].join(", ")}</span> : "오류 글에 키 이름 없음"}</span>
                    <button onClick={() => { setEdits({}); setLastResult(null); }}
                      className="ml-auto flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-0.5 font-semibold text-rose-700 hover:bg-rose-100">
                      <Eraser size={12} /> 편집 비우기
                    </button>
                  </div>
                  <p className="mt-0.5 text-rose-600">편집한 값은 그대로 남아 있습니다 — 고쳐서 다시 적용하거나 편집 비우기({changed.length}개 키).</p>
                  {arr(lastResult.ack?.errors).length > 0 && <ul className="list-disc pl-4">{arr(lastResult.ack?.errors).map((x, i) => <li key={i}>{x}</li>)}</ul>}
                  {!arr(lastResult.ack?.errors).length && lastResult.command?.detail && <p>{lastResult.command.detail}</p>}
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <History size={13} /> 버전 {ov.versions.length}개(새것부터)
                  <span className="ml-auto flex items-center gap-1"><GitCompare size={12} /> 비교
                    {[0, 1].map((i) => (
                      <select key={i} value={cmp[i] ?? ""} className="rounded-md border border-gray-200 px-1 py-0.5"
                        onChange={(e) => setCmp((c) => { const n = [...c] as [number | null, number | null]; n[i] = e.target.value === "" ? null : Number(e.target.value); return n; })}>
                        <option value="">v?</option>
                        {ov.versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}
                      </select>
                    ))}
                  </span>
                </div>
                <div className="max-h-[480px] overflow-y-auto rounded-xl border border-gray-100">
                  <table className="min-w-full text-[11px]">
                    <thead className="bg-gray-50 text-gray-500"><tr>{["버전", "종류", "누가", "언제", "상태", "사유", "바뀐 키", "메모"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                    <tbody>
                      {ov.versions.map((v) => (
                        <tr key={v.version} onClick={() => setPick(v.version)}
                          className={`cursor-pointer border-t border-gray-100 hover:bg-blue-50/40 ${pick === v.version ? "bg-blue-50/60" : ""}`}>
                          <td className="px-2 py-1 font-semibold">v{v.version}{v.version === ov.deviceVersion && <Badge tone="ml-1 bg-emerald-50 text-emerald-700">장비</Badge>}</td>
                          <td className="px-2 py-1 text-gray-600">{v.kind}</td>
                          <td className="px-2 py-1 text-gray-500">{v.createdBy}</td>
                          <td className="px-2 py-1 tabular-nums text-gray-500">{fmtKst(v.createdAt)}</td>
                          <td className="whitespace-nowrap px-2 py-1"><StatusBadge s={v.ackStatus} /></td>
                          <td className="px-2 py-1 text-rose-600">{v.reasonCode ?? ""}</td>
                          <td className="px-2 py-1 tabular-nums">{Array.isArray(v.changes) ? v.changes.length : "-"}</td>
                          <td className="px-2 py-1 text-gray-500">{v.note ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="space-y-2">
                {picked ? <VersionDetail v={picked} /> : <p className="text-[11px] text-gray-400">버전을 누르면 바뀐 키(전 → 후)와 장비 결과</p>}
                {cmpRows && (
                  <div className="rounded-xl border border-gray-100 p-2 text-[11px]">
                    <p className="mb-1 font-semibold text-gray-700">v{cmpRows[0].version} ↔ v{cmpRows[1].version} 다른 키</p>
                    {(() => {
                      const a = cmpRows[0].paramValues ?? {}, b = cmpRows[1].paramValues ?? {};
                      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !same(a[k], b[k])).sort();
                      return keys.length ? (
                        <table className="w-full"><thead><tr className="text-left text-gray-400"><th className="pr-2 font-medium">키</th><th className="pr-2 font-medium">v{cmpRows[0].version}</th><th className="font-medium">v{cmpRows[1].version}</th></tr></thead>
                          <tbody>{keys.map((k) => <tr key={k} className="border-t border-gray-100"><td className="pr-2 font-mono">{k}</td><td className="pr-2">{show(a[k])}</td><td>{show(b[k])}</td></tr>)}</tbody></table>
                      ) : <p className="text-gray-400">값이 같음</p>;
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {ask === "apply" && ov && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4">
            <p className="text-sm font-bold text-gray-900">설정 적용 확인 — 장비 {equipment}</p>
            <p className="mt-1 text-xs text-gray-600">지금 v{ov.deviceVersion} → 새 버전 v{Math.max(ov.webMaxVersion ?? 0, ov.deviceVersion ?? 0) + 1} · 바뀐 키 {changed.length}개(비밀값은 보내지 않음)</p>
            <table className="mt-2 w-full text-[11px]">
              <thead><tr className="text-left text-gray-400"><th className="pr-2 font-medium">키</th><th className="pr-2 font-medium">전 → 새</th><th className="font-medium">등급·적용</th></tr></thead>
              <tbody>{changed.map((k) => {
                const p = params.find((x) => x.key === k)!;
                return (
                  <tr key={k} className="border-t border-gray-100 align-top">
                    <td className="pr-2 font-mono">{k}</td>
                    <td className="pr-2">{show(nowVal(p))} → <b>{show(edits[k])}</b>{p.unit && ` ${p.unit}`}</td>
                    <td><Badge tone={p.safety === "H" ? "bg-rose-600 text-white" : "bg-gray-100 text-gray-600"}>{SAFETY_TEXT[p.safety ?? ""] ?? p.safety}</Badge> {APPLY_TEXT[p.apply ?? ""]}</td>
                  </tr>
                );
              })}</tbody>
            </table>
            {busyNow && changed.some((k) => params.find((x) => x.key === k)?.safety === "H") && (
              <p className="mt-2 rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700">공정·히터 운전 중 — H 등급 키가 있어 장비가 거부합니다(CONFIG_H_IN_PROCESS).</p>
            )}
            <label className="mt-2 block text-[11px] text-gray-500">메모(선택)
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1 text-xs" />
            </label>
            <p className="mt-2 text-[11px] text-gray-400">이 조작은 실행자 계정과 함께 기록됩니다.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setAsk(null)} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50">취소</button>
              <button disabled={busy} onClick={() => {
                setAsk(null);
                void post({ action: "apply", baseVersion: ov.deviceVersion, changes: Object.fromEntries(changed.map((k) => [k, edits[k]])), note });
              }} className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">적용</button>
            </div>
          </div>
        </div>
      )}
      {ask === "rollback" && ov && (
        <SimpleConfirm title="설정 되돌리기" ok="되돌리기" danger
          text={<>장비 {equipment} 의 설정을 장비에 저장된 <b>직전 버전</b> 값으로 되돌립니다. 새 버전 번호
            v{Math.max(ov.webMaxVersion ?? 0, ov.deviceVersion ?? 0) + 1} 로 기록됩니다. 공정 중이면 등급 높음 값의 변경은 장비가 거부합니다.</>}
          onCancel={() => setAsk(null)} onOk={() => { setAsk(null); void post({ action: "rollback" }); }} />
      )}
      {ask === "resync" && ov && (
        <SimpleConfirm title="장비 저장 값으로 기준 다시 읽기" ok="다시 읽기"
          text={<>장비 {equipment} 에 저장된 설정 값(노트북 설정 파일이 정한 값은 빼고)을 다시 받아 새 버전
            v{Math.max(ov.webMaxVersion ?? 0, ov.deviceVersion ?? 0) + 1}을 만듭니다. <b>장비에는 아무 명령도 보내지 않습니다.</b>{" "}
            다음 적용은 이 값 위에 만들어집니다.{detail && <span className="block font-mono text-[11px] text-gray-400">묶음 params[].stored · kind resync</span>}</>}
          onCancel={() => setAsk(null)} onOk={() => { setAsk(null); void post({ action: "resync" }); }} />
      )}
    </Card>
  );
}
