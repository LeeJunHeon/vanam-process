"use client";

// 노트북 로컬 화면의 '설정' 탭(W-15, 장비 5-21 ⑤) — 보기 전용. 로컬 schema 의 params(지금 값·대기 값·저장 값·덮어쓰기·기본값·설명)와
// state.configPending(공정 끝나면·재시작 때 대기)만으로 그린다. 적용·되돌리기는 없다(노트북 경로는 설정 명령을 받지 않는다 — 장비 규칙).
// 묶음별 무리(paramGroups 순서) · 찾기 · 바뀐 값만(기본값과 다른 키) · 비밀 값은 보이지 않음 · 설명은 마우스.
import { useMemo, useState } from "react";
import { Info, Settings2 } from "lucide-react";
import { FS, Card, Issue, Tag } from "./kit";
import type { Bundle, ParamDef, StateData } from "./types";

type LP = ParamDef & { stored?: unknown; overridden?: boolean };
const show = (p: LP, v: unknown) => {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "켜짐" : "꺼짐";
  const s = typeof v === "string" ? (p.enumLabels?.[v] ?? v) : typeof v === "number" ? String(v) : JSON.stringify(v);
  return `${s}${p.unit && typeof v === "number" ? ` ${p.unit}` : ""}`;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export default function Chk2LocalConfig({ bundle, st }: { bundle: Bundle | null; st: StateData | null }) {
  const [q, setQ] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const params = useMemo(() => ((bundle?.params ?? []) as LP[]).filter((p) => p.scope !== "secret"), [bundle]);
  const idleP = st?.configPending?.idle ?? {}, restartP = st?.configPending?.restart ?? {};
  const groups = useMemo(() => {
    const have = [...new Set(params.map((p) => p.group ?? "기타"))];
    const order = (bundle?.paramGroups ?? []).map((g) => g.key).filter((k) => have.includes(k));
    return [...order, ...have.filter((k) => !order.includes(k))];
  }, [params, bundle]);
  const [group, setGroup] = useState<string | null>(null);
  const g = group ?? groups[0] ?? null;
  const gName = (k: string) => bundle?.paramGroups?.find((x) => x.key === k)?.label ?? k;
  const needle = q.trim().toLowerCase();
  const rows = params.filter((p) => (needle ? `${p.label ?? ""} ${p.key} ${p.desc ?? ""}`.toLowerCase().includes(needle) : (p.group ?? "기타") === g))
    .filter((p) => !onlyChanged || !same(p.current, p.default));

  return (
    <Card title={<><Settings2 size={15} /> 설정</>}>
      <div className="space-y-2">
        <p className={`${FS.body} text-[#5B6470]`}>
          설정 버전 <b className="text-[#1B1F24]">{st?.configVersion ?? "-"}</b> · 보기만 합니다. 설정을 바꾸려면 웹 화면에서 관리자로 로그인하세요.
        </p>
        {!params.length ? <Issue level="warn">장비 정의를 아직 받지 못했습니다.</Issue> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select value={g ?? ""} onChange={(e) => setGroup(e.target.value)} disabled={!!needle} aria-label="설정 묶음"
                className={`h-9 rounded-[8px] border border-[#D9DDE3] bg-white px-2 ${FS.body} disabled:text-[#8A929D]`}>
                {groups.map((k) => <option key={k} value={k}>{gName(k)}</option>)}
              </select>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·키 찾기" aria-label="설정 찾기"
                className={`h-9 w-48 rounded-[8px] border border-[#D9DDE3] bg-white px-2 ${FS.body}`} />
              <label className={`flex items-center gap-1.5 ${FS.body}`}>
                <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> 기본값과 다른 것만
              </label>
              <span className={`ml-auto ${FS.small} text-[#5B6470]`}>{rows.length}개</span>
            </div>
            <div className="max-h-[calc(100vh-300px)] min-h-[240px] overflow-y-auto rounded-[10px] border border-[#E3E6EA]">
              <table className={`w-full ${FS.body}`}>
                <thead className="sticky top-0 bg-[#F5F6F8] text-left text-[#5B6470]">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">이름</th>
                    <th className="px-3 py-1.5 font-medium">지금 값</th>
                    <th className="px-3 py-1.5 font-medium">대기 값</th>
                    <th className="px-3 py-1.5 font-medium">기본값</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const pend = p.key in idleP ? `${show(p, idleP[p.key])} (공정 끝나면)` : p.key in restartP ? `${show(p, restartP[p.key])} (재시작 때)`
                      : p.pending !== undefined && p.pending !== null ? show(p, p.pending) : "";
                    return (
                      <tr key={p.key} className="border-t border-[#E3E6EA] align-top">
                        <td className="px-3 py-1.5">
                          <span className="flex items-center gap-1 font-semibold text-[#1B1F24]" title={p.desc || undefined}>
                            {p.label || p.key}{p.desc && <Info size={12} className="shrink-0 text-[#8A929D]" aria-hidden />}
                          </span>
                          <span className={`font-mono ${FS.small} text-[#8A929D]`}>{p.key}</span>
                        </td>
                        <td className="px-3 py-1.5 tabular-nums text-[#1B1F24]">
                          {show(p, p.current)}
                          {p.overridden && (
                            <Tag kind="info" className="ml-1.5" title={`노트북 덮어쓰기 파일이 정한 값 · 저장 값 ${show(p, p.stored)}`}>노트북 덮어쓰기</Tag>
                          )}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums text-[#B54708]">{pend}</td>
                        <td className="px-3 py-1.5 tabular-nums text-[#5B6470]">{show(p, p.default)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
