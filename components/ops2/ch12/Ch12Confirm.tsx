"use client";

// 챔버12 확인창(2026-11-20 D425, W-19 글) — PLC 버튼은 챔버12 모양, 나머지는 kit ConfirmDialog 와 같은 동작·모양을 챔버12 글로
// (kit 은 챔버K 도 쓰므로 고치지 않는다 — Esc 취소·정지 쪽은 실행에 포커스·빨간 실행 버튼 조건이 같다).
// PLC 버튼(Ch12Hmi plcAsk — procLine·hazards 가 있음):
//   맨 위 빨간 줄 'CH1 공정 중 · 지금 단계 · 공정 이름'(그 버튼의 챔버가 공정 중일 때 — 잠그지 않고 알린다, 사용자 결정 2026-11-20),
//   무엇을·어떻게, 안내, 위험 두 갈래(사람 위험 = 빨강 · 장비 위험 = 주황 — 문구는 장비 묶음 plcHazardText),
//   누가 기록되는지(웹 = 로그인한 이름·계정, 노트북 = '노트북'), 실행 버튼 빨강은 정지·끄기·끝내기만(U1 — 챔버K 규칙, runRed). Esc 취소.
import { useEffect, useRef } from "react";
import { AlertOctagon } from "lucide-react";
import { FS, Btn, Issue, isStopLike, type Ask } from "../chk/kit";
import { useChk2Mode } from "../chk/mode";
import type { PlcAsk } from "./Ch12Hmi";

export const isPlcAsk = (a: Ask | null): a is PlcAsk =>
  !!a && a.kind === "PLC_BUTTON" && Array.isArray((a as Partial<PlcAsk>).hazards);

/** 기록 안내 — 웹은 로그인한 이름·계정, 노트북은 로그인이 없어 '노트북' */
export const recordNote = (local: boolean) =>
  local ? "이 조작은 '노트북'에서 누른 것으로 장비 로그에 기록됩니다." : "이 조작은 로그인한 이름·계정과 함께 장비 로그에 기록됩니다.";

export function PlcConfirmBody({ ask, local }: { ask: PlcAsk; local: boolean }) {
  return (
    <>
      {ask.procLine && (
        <p role="alert" data-proc-line className={`mb-3 flex items-start gap-1.5 rounded-[10px] bg-[#B42318] px-3 py-2 font-bold text-white ${FS.body}`}>
          <AlertOctagon size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0">{ask.procLine}</span>
        </p>
      )}
      <p className={`font-bold text-[#1B1F24] ${FS.card}`}>조작 확인</p>
      <What ask={ask} />
      {ask.note && <p className={`mt-2 rounded-[10px] bg-[#F5F6F8] p-2.5 leading-relaxed text-[#5B6470] ${FS.body}`}>{ask.note}</p>}
      {ask.hazards.map((h, i) => (
        <div key={i} className="mt-2" data-hazard={h.kind}><Issue level={h.kind === "person" ? "alarm" : "warn"}>{h.text}</Issue></div>
      ))}
      <p className={`mt-3 text-[#5B6470] ${FS.small}`}>{recordNote(local)}</p>
    </>
  );
}

/** 실행 버튼 빨강(U1 — 챔버K kit chkColors 와 같은 규칙): 켜면 정지·끄기·끝내기만 빨강(시작·실행·켜기·열기·적용은 파랑).
 *  PLC 버튼은 '이름 → 끄기'처럼 detail 에 동작이 있어 그것까지 본다. 끄면(옛 규칙) 위험·정지·물리 동작이면 빨강 */
export const runRed = (ask: Ask, chkColors: boolean | undefined) =>
  chkColors ? isStopLike({ stop: ask.stop, label: `${ask.label} ${ask.detail ?? ""}` }) : !!(ask.danger || ask.stop || ask.red);

function PlcConfirm({ ask, onOk, onCancel }: { ask: PlcAsk; onOk: () => void; onCancel: () => void }) {
  const { local, chkColors } = useChk2Mode();
  const okRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[12px] bg-white p-5">
        <PlcConfirmBody ask={ask} local={local} />
        <div className="mt-4 flex justify-end gap-2">
          <Btn kind="ghost" onClick={onCancel}>취소</Btn>
          <button ref={okRef} onClick={onOk}
            className={`h-10 rounded-[10px] px-4 font-semibold text-white ${FS.body} outline-offset-2 focus:outline-2 focus:outline-[#1D4ED8] ${
              (chkColors ? runRed(ask, true) : ask.red) ? "bg-[#B42318]" : "bg-[#1D4ED8]"}`}>
            실행
          </button>
        </div>
      </div>
    </div>
  );
}

/** 무엇을·어떻게 — '<이름> → 켜기·열기' 다음 줄에 '명령을 장비에 보냅니다.' */
function What({ ask }: { ask: Ask }) {
  return (
    <p className={`mt-2 text-[#1B1F24] ${FS.body}`}>
      <span className="font-semibold">{ask.label}</span>
      {ask.detail && <span> {ask.detail}</span>}
      <span className="block text-[#5B6470]">명령을 장비에 보냅니다.</span>
    </p>
  );
}

/** 그 밖의 확인창 — kit ConfirmDialog 와 같은 동작(Esc 취소, 정지 쪽은 열리면 실행에 포커스, 위험·정지·물리 동작이면 실행 빨강) */
function AskConfirm({ ask, onOk, onCancel }: { ask: Ask; onOk: () => void; onCancel: () => void }) {
  const { chkColors } = useChk2Mode();
  const okRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (ask.stop) okRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [ask, onCancel]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[12px] bg-white p-5">
        <p className={`font-bold text-[#1B1F24] ${FS.card}`}>조작 확인</p>
        <What ask={ask} />
        {ask.lines && ask.lines.length > 0 && (
          <ul className={`mt-2 space-y-0.5 rounded-[10px] border border-[#E3E6EA] p-2.5 leading-relaxed text-[#1B1F24] ${FS.body}`}>
            {ask.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
        {ask.note && (
          <p className={`mt-2 rounded-[10px] p-2.5 leading-relaxed ${FS.body} ${ask.stop ? "bg-[#FFFAEB] text-[#B54708]" : "bg-[#F5F6F8] text-[#5B6470]"}`}>
            {ask.note}
          </p>
        )}
        {ask.danger && <div className="mt-2"><Issue level="alarm">물리적 위험이 있는 조작입니다. 장비 주변에 사람이 없는지 반드시 확인하세요.</Issue></div>}
        <p className={`mt-3 text-[#5B6470] ${FS.small}`}>이 조작은 실행자 계정과 함께 기록됩니다.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Btn kind="ghost" onClick={onCancel}>취소</Btn>
          <button ref={okRef} onClick={onOk}
            className={`h-10 rounded-[10px] px-4 font-semibold text-white ${FS.body} outline-offset-2 focus:outline-2 focus:outline-[#1D4ED8] ${
              runRed(ask, chkColors) ? "bg-[#B42318]" : "bg-[#1D4ED8]"}`}>
            실행
          </button>
        </div>
      </div>
    </div>
  );
}

/** 챔버12 화면의 확인창 — PLC 버튼은 챔버12 모양, 그 밖은 kit 확인창과 같은 동작(챔버12 글) */
export default function Ch12Confirm({ ask, onOk, onCancel }: { ask: Ask | null; onOk: () => void; onCancel: () => void }) {
  if (!ask) return null;
  if (isPlcAsk(ask)) return <PlcConfirm ask={ask} onOk={onOk} onCancel={onCancel} />;
  return <AskConfirm ask={ask} onOk={onOk} onCancel={onCancel} />;
}
