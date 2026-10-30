"use client";

// 챔버12 공정 중 시퀀스 편집 — 아직 시작 안 한 블록만 추가·삭제·순서 변경(편집 한 번 = 명령 한 번, 장비가 판 번호 +1·전체 재검사).
// 보내기 전에 웹도 같은 계산(lib/ops2/ch12/blocks.ts editSequence — 시작한 블록 보호·전체 재검사)으로 미리 막는다.
// 명령 인자 {chamber, op:{op:"insert",at,block}|{op:"delete",at}|{op:"move",from,to}, rev(지금 판)} — 마지막 판단은 장비
// (EDIT_STARTED_BLOCK·EDIT_BAD_OP·EDIT_INVALID). 끝 정지·파워 끄기·안전 규칙은 어떤 편집으로도 빠지지 않는다(장비가 늘 붙인다).
// 지금 블록 목록 = 엔진 상태(있으면) → 마지막 편집 사건 → 이 공정 run_start.blocks, 시작한 블록 수 = 엔진 started_upto → 블록 번호.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { editSequence } from "@/lib/ops2/ch12/blocks";
import type { Ask } from "../chk/kit";
import type { FeedItem } from "../chk/useChk2";
import Ch12BlockEditor, { BlockParams, type Blk } from "./Ch12BlockEditor";
import { KINDS, chArgs, chamberState, currentBlocks, envFor, pickKind, startedUpto } from "./logic";
import type { Ch12Bundle, Ch12State } from "./types";

export default function Ch12SeqEdit({ bundle, st, feed, ch, can, onAsk, onClose }: {
  bundle: Ch12Bundle | null; st: Ch12State | null; feed: FeedItem[]; ch: "ch1" | "ch2";
  can: (kind: string) => boolean; onAsk: (a: Ask) => void; onClose: () => void;
}) {
  const env = envFor(bundle, ch === "ch1" ? 1 : 2);
  const src = currentBlocks(st, feed, ch);
  const blocks = (src.blocks ?? []) as Blk[];
  const k = startedUpto(st, ch, blocks.length);
  const cs = chamberState(st, ch);
  const rev = cs?.recipeRev ?? 0;
  const kind = pickKind(bundle, KINDS.edit);
  const [ins, setIns] = useState<{ at: number; b: Blk } | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const label = ch.toUpperCase();

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const send = (op: Record<string, unknown>, what: string) => {
    if (!env) return;
    const r = editSequence(blocks, k, op, env, rev);
    if (!r.ok) return setErrs([`${r.reason}: ${r.errors.join(" · ")}`]);
    setErrs(r.warnings.map((w) => `경고 — ${w}`));
    onAsk({ kind, label: `${label} 시퀀스 편집`, detail: what, red: true, key: `${kind}@${ch}`,
            args: chArgs(bundle, kind, ch, { op, rev }),
            lines: [`레시피 판 ${rev} → ${r.rev}`, `블록 ${blocks.length} → ${r.blocks?.length ?? "-"}개`, "시작한 블록·정지 순서·끝 정지(파워 끄기)는 바뀌지 않습니다"] });
    setIns(null);
  };

  // 편집기에서 바뀐 목록 → 한 번의 op(위/아래 = move, 지우기 = delete)
  const onEdit = (n: Blk[]) => {
    if (n.length === blocks.length - 1) {
      const at = blocks.findIndex((b, i) => JSON.stringify(b) !== JSON.stringify(n[i]));
      const i = at < 0 ? blocks.length - 1 : at;
      return send({ op: "delete", at: i }, `${i + 1}번 블록 지우기`);
    }
    if (n.length === blocks.length + 1) return setIns({ at: blocks.length, b: n[n.length - 1] });
    const diff = blocks.map((b, i) => (JSON.stringify(b) !== JSON.stringify(n[i]) ? i : -1)).filter((i) => i >= 0);
    if (diff.length === 2 && JSON.stringify(blocks[diff[0]]) === JSON.stringify(n[diff[1]])) {
      return send({ op: "move", from: diff[0], to: diff[1] }, `${diff[0] + 1}번 → ${diff[1] + 1}번 자리`);
    }
    setErrs(["값 고치기는 공정 중 값 수정(PROCESS_ADJUST)으로 — 시퀀스 편집은 추가·삭제·순서만"]);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-4">
        <div className="mb-2 flex items-center gap-2">
          <b className="text-sm text-gray-900">{label} 시퀀스 편집</b>
          <span className="text-[11px] text-gray-500">레시피 판 {rev} · 시작한 블록 {k}/{blocks.length}</span>
          <button onClick={onClose} className="ml-auto rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="닫기"><X size={16} /></button>
        </div>
        <p className="mb-2 rounded-lg bg-gray-50 px-2 py-1 text-[11px] text-gray-600">
          아직 시작 안 한 블록만 추가·삭제·순서 변경할 수 있습니다. 편집마다 장비가 전체를 다시 검사하고 판 번호를 올리며, 원래 레시피와 실제 실행 순서를 모두 기록합니다.
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!src.blocks ? (
            <p className="py-6 text-center text-xs text-gray-400">지금 공정의 블록 목록을 아직 받지 못했습니다(장비 엔진 상태 또는 공정 시작 기록이 필요).</p>
          ) : (
            <Ch12BlockEditor blocks={blocks} env={env} lockUpto={k} current={k > 0 ? k - 1 : null} onChange={can(kind) ? onEdit : undefined} />
          )}
          {ins && env && (() => {
            const def = env.byType.get(ins.b.type);
            return (
              <div className="mt-2 space-y-1.5 rounded-xl border border-blue-200 bg-blue-50/40 p-2">
                <p className="text-xs font-semibold text-gray-800">새 블록 — {def?.label ?? ins.b.type}</p>
                <label className="flex items-center gap-2 text-[11px] text-gray-600">넣을 자리(번호 앞)
                  <select value={ins.at} onChange={(e) => setIns({ ...ins, at: Number(e.target.value) })}
                    className="rounded-md border border-gray-200 px-1 py-0.5 text-[11px]">
                    {Array.from({ length: blocks.length - k + 1 }, (_, i) => k + i).map((at) => (
                      <option key={at} value={at}>{at === blocks.length ? "맨 끝" : `${at + 1}번 앞`}</option>
                    ))}
                  </select>
                </label>
                {def && <BlockParams def={def} b={ins.b} onChange={(b) => setIns({ ...ins, b })} />}
                <div className="flex gap-2">
                  <button onClick={() => send({ op: "insert", at: ins.at, block: ins.b }, `${def?.label ?? ins.b.type} 넣기`)}
                    className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700">넣기 보내기</button>
                  <button onClick={() => setIns(null)} className="rounded-lg px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-100">취소</button>
                </div>
              </div>
            );
          })()}
        </div>
        {errs.length > 0 && <div className="mt-2 space-y-0.5">{errs.map((e, i) => <p key={i} className="text-[11px] text-rose-600">{e}</p>)}</div>}
        {!can(kind) && <p className="mt-2 text-[11px] text-gray-400">보기만 — 시퀀스 편집 권한·연결이 없거나 장비가 이 명령을 내지 않습니다.</p>}
      </div>
    </div>
  );
}
