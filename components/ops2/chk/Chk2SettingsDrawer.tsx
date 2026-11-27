"use client";

// 챔버K 장비 설정 보기 서랍(W-21) — 상태 탭·수동 조작 탭 장비 박스 머리의 [⚙ 설정]이 연다. 오른쪽 서랍(폭 680px, 좁은 화면은 전체).
// '프로그램 설정' = 그 장비의 설정(묶음 paramGroups — 가스·압력은 mfc + 압력 관련 공정 설정), 줄마다 이름(마우스 설명 = 설정 설명)·
//   지금 값·단위·적용 시점·[수정]. 통신 묶음은 맨 아래 접힌 '통신'. [수정]은 설정 탭(Chk2Config)의 편집·검사·권한·확인창·기록을
//   그 키 하나로 다시 쓴다(새 API 없음). 노트북 화면은 보기만(설정 탭과 같음).
// '컨트롤러 값' 구역(W-22 — Chk2DevParams)은 장비가 값을 줄 때(묶음 23 state.devParams)만 그린다. 가스·압력 = MFC(GPC3000),
//   Ion Gauge = E 응답 설정 항목(읽기만).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, PencilLine, X } from "lucide-react";
import { FS, Btn } from "./kit";
import { useChk2Mode } from "./mode";
import type { Bundle, ParamDef, StateData } from "./types";

export type DevKey = "vacuum" | "shutter" | "gas" | "pressure" | "dc" | "rf" | "rfp" | "ig" | "heater";

const PRESSURE_KEYS = /^(SP\d_|SP\d$|PRESSURE_|GAS_STABILIZE_SEC$|SP1_TIMEOUT_SEC$)/;
const SPEC: Record<DevKey, { title: string; groups: string[]; comm: string[]; extra?: RegExp }> = {
  vacuum: { title: "진공·셔터", groups: ["plc"], comm: ["comm_plc"] },
  shutter: { title: "진공·셔터", groups: ["plc"], comm: ["comm_plc"] },
  gas: { title: "가스·압력", groups: ["mfc"], comm: ["comm_mfc"], extra: PRESSURE_KEYS },
  pressure: { title: "가스·압력", groups: ["mfc"], comm: ["comm_mfc"], extra: PRESSURE_KEYS },
  dc: { title: "DC Power", groups: ["dc"], comm: ["comm_dc"] },
  rf: { title: "RF Power", groups: ["rf"], comm: [] },
  rfp: { title: "RF Pulse", groups: ["rfpulse"], comm: ["comm_rfpulse"] },
  ig: { title: "Ion Gauge", groups: ["ig"], comm: ["comm_ig"] },
  heater: { title: "히터", groups: ["heater", "heater_plc", "heater_ramp", "heater_hold", "heater_gas", "heater_recipe"], comm: [] },
};
const APPLY: Record<string, string> = { live: "바로 적용", idle: "대기 중 적용", restart: "재시작 필요" };

/** 그 장비의 설정 — 묶음 순서 그대로(비밀값 제외). 아무 동작도 하지 않는 설정(묶음 25 params[].unused — W-25 C2)은
 *  withUnused(상세 보기)일 때만 */
export function settingsOf(bundle: Bundle | null, dev: DevKey, withUnused = false): { main: ParamDef[]; comm: ParamDef[] } {
  const s = SPEC[dev];
  const ps = (bundle?.params ?? []).filter((p) => p.scope !== "secret" && (withUnused || !p.unused));
  const main = ps.filter((p) => s.groups.includes(p.group ?? "") || (!!s.extra && p.group === "process" && s.extra.test(p.key)));
  return { main, comm: ps.filter((p) => s.comm.includes(p.group ?? "")) };
}
export const settingsTitle = (dev: DevKey) => SPEC[dev].title;

function valueText(p: ParamDef): string {
  const v = p.current;
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "켜짐" : "꺼짐";
  if (typeof v === "string" && p.enumLabels?.[v]) return p.enumLabels[v];
  return String(v);
}

function Row({ p, editor, open, onOpen }: { p: ParamDef; editor?: (key: string) => ReactNode; open: boolean; onOpen: () => void }) {
  const { detail } = useChk2Mode();
  return (
    <li className="border-b border-[#EEF0F3] py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`min-w-0 flex-1 basis-48 ${FS.body} text-[#1B1F24]`} title={p.desc || undefined}>
          {p.label || p.key}{detail && <span className={`ml-1.5 font-mono ${FS.small} text-[#8A929D]`}>{p.key}</span>}
          {p.unused && <span className={`ml-1.5 rounded bg-[#EEF0F3] px-1 ${FS.small} text-[#5B6470]`}>쓰지 않음</span>}
        </span>
        <span className={`${FS.body} font-bold tabular-nums text-[#133A7C]`}>
          {valueText(p)}{p.unit && <span className={`ml-1 ${FS.small} font-normal text-[#5B6470]`}>{p.unit}</span>}
        </span>
        <span className={`w-20 ${FS.small} text-[#5B6470]`}>{APPLY[p.apply ?? ""] ?? ""}</span>
        {editor && <Btn size="sm" onClick={onOpen} ariaLabel={`${p.label || p.key} 수정`}><PencilLine size={13} /> {open ? "닫기" : "수정"}</Btn>}
      </div>
      {open && editor && <div className="mt-2">{editor(p.key)}</div>}
    </li>
  );
}

export default function Chk2SettingsDrawer({ dev, bundle, onClose, editor, controller }: {
  dev: DevKey; bundle: Bundle | null; st?: StateData | null; onClose: () => void;
  editor?: (key: string) => ReactNode;          // [수정] — 설정 탭 편집 흐름(Chk2Config onlyKeys). 없으면 보기만(노트북)
  controller?: ReactNode;                       // 컨트롤러 값(W-22) — 장비가 값을 줄 때만
}) {
  const { detail } = useChk2Mode();
  const { main, comm } = settingsOf(bundle, dev, detail);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [commOpen, setCommOpen] = useState(false);
  const box = useRef<HTMLElement | null>(null);
  useEffect(() => { box.current?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[rgba(17,24,39,0.28)]" onClick={onClose} aria-hidden />
      <aside ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${SPEC[dev].title} 설정`} data-tip-side="left"
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        className="absolute inset-y-0 right-0 flex w-full max-w-full flex-col border-l border-[#D9DDE3] bg-white shadow-[-12px_0_32px_rgba(17,24,39,0.12)] outline-none sm:w-[680px]">
        <div className="flex flex-col gap-1 border-b border-[#E3E6EA] px-4 pb-3 pt-4 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className={`min-w-0 font-bold text-[#1B1F24] ${FS.card}`}>{SPEC[dev].title} 설정</h2>
            <button type="button" onClick={onClose} aria-label="닫기"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[#5B6470] hover:bg-[#F5F6F8]"><X size={18} /></button>
          </div>
          <p className={`${FS.small} text-[#5B6470]`}>
            {editor ? "수정은 관리자만 할 수 있고, 바꾼 기록이 남습니다." : "보기만 할 수 있습니다. 바꾸기는 웹에서 합니다."}
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          {controller && (
            <section className="space-y-2">
              <h3 className={`font-bold text-[#1B1F24] ${FS.body}`}>컨트롤러 값
                <span className={`ml-2 font-normal ${FS.small} text-[#5B6470]`}>{dev === "ig" ? "Ion Gauge(934) 안에 저장된 값" : "MFC 컨트롤러(ATOVAC GPC3000) 안에 저장된 값"}</span>
              </h3>
              {controller}
            </section>
          )}
          <section>
            <h3 className={`mb-1 font-bold text-[#1B1F24] ${FS.body}`}>프로그램 설정</h3>
            {main.length ? (
              <ul>{main.map((p) => <Row key={p.key} p={p} editor={editor} open={openKey === p.key} onOpen={() => setOpenKey(openKey === p.key ? null : p.key)} />)}</ul>
            ) : <p className={`${FS.body} text-[#5B6470]`}>장비 정보를 받는 중입니다.</p>}
          </section>
          {comm.length > 0 && (
            <section>
              <button type="button" onClick={() => setCommOpen((o) => !o)} aria-expanded={commOpen}
                className={`flex items-center gap-1 font-bold text-[#1B1F24] ${FS.body}`}>
                {commOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} 통신 ({comm.length})
              </button>
              {commOpen && <ul className="mt-1">{comm.map((p) => <Row key={p.key} p={p} editor={editor} open={openKey === p.key} onOpen={() => setOpenKey(openKey === p.key ? null : p.key)} />)}</ul>}
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
