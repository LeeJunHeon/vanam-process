"use client";

// 챔버K 장비 설정 보기 — '컨트롤러 값' 구역(W-22, 묶음 23 state.devParams · 시안 '장비 설정 보기').
// MFC(GPC3000): SP1~5 표(설정값·Gain·P.Lead·종류) + 그 밖의 값 목록, 읽은 시각 + [다시 읽기](DEVICE_PARAMS_READ — 질의만).
//   바꿀 수 있는 칸(설정값·Gain·P.Lead·자동 제어 방식·공정 한계)은 [수정] → 범위 검사(묶음 devParams.writeItems) → 확인창
//   ("압력 제어 동작이 바로 바뀝니다") → DEVICE_PARAM_WRITE. 결과는 장비가 되읽어 비교한 값(state.devParams.mfc.write)으로 보인다.
//   바꾸기는 관리자만(웹 perms — 장비 명령 role admin), 대기·적재 중에만(장비가 거부 이유를 낸다). 노트북 화면은 보기만.
// Ion Gauge(934): E 응답의 자동 필라멘트·셋포인트·가스 계수·감도(읽기만).
// 묶음 22 장비(devParams 없음)는 이 구역을 그리지 않는다(부르는 쪽 Chk2Page).
import { useState } from "react";
import { PencilLine, RefreshCw } from "lucide-react";
import { FS, Btn, Chip, type Ask } from "./kit";
import type { Bundle, DevParams, DevParamsMfcValues, StateData } from "./types";

type WriteItem = { item: string; label: string; nos: number[]; unit: string; min: number | null; max: number | null; int: boolean };
const DEFAULT_ITEMS: WriteItem[] = [
  { item: "sp", label: "SP{n} 설정값", nos: [1, 2, 3, 4, 5], unit: "mTorr", min: 0, max: null, int: false },
  { item: "gain", label: "SP{n} Gain", nos: [1, 2, 3, 4, 5], unit: "%", min: 1, max: 9999, int: true },
  { item: "lead", label: "SP{n} P.Lead", nos: [1, 2, 3, 4, 5], unit: "s", min: 0.01, max: 2, int: false },
  { item: "auto", label: "자동 제어 방식", nos: [], unit: "", min: 0, max: 1, int: true },
  { item: "limit", label: "{lim}", nos: [1, 2, 3, 4], unit: "%FS", min: 0, max: 100, int: false },
];
const AUTO: Record<string, string> = { "0": "Self-Tuning", "1": "PID" };
const STATE_WORD: Record<string, string> = { reading: "읽는 중", waiting: "공정이 끝난 뒤 읽음", failed: "읽기 실패" };
const n2 = (v: number | null | undefined, d = 2) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");
const sci = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v.toExponential(1).toUpperCase().replace("E-0", "E-").replace("E+0", "E") : "—");
const kst = (iso: string | null | undefined) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(t)) : null;
};

type Edit = { item: string; no: number | null; label: string; now: number | null; text: string };

export default function Chk2DevParams({ dev, bundle, st, canWrite, writeLock, readLock, onAsk, onRead }: {
  dev: "mfc" | "ig"; bundle: Bundle | null; st: StateData | null;
  canWrite: boolean;                              // 관리자 + 웹(노트북은 보기만)
  writeLock: string | null;                       // DEVICE_PARAM_WRITE 잠금(권한·연결·결과 기다림)
  readLock: string | null;                        // DEVICE_PARAMS_READ 잠금
  onAsk: (a: Ask) => void; onRead?: () => void;
}) {
  const dp: DevParams | null | undefined = st?.devParams;
  const [edit, setEdit] = useState<Edit | null>(null);
  if (dev === "ig") return <IgValues dp={dp} />;
  const m = dp?.mfc;
  const v: DevParamsMfcValues | null | undefined = m?.values;
  const items: WriteItem[] = bundle?.devParams?.writeItems?.length ? bundle.devParams.writeItems : DEFAULT_ITEMS;
  const spec = (item: string) => items.find((x) => x.item === item);
  const fsMtorr = typeof v?.fsTorr === "number" ? v.fsTorr * 1000 : null;
  const busy = st?.procState && !["IDLE", "LOADED"].includes(st.procState) ? "공정·수동 조작 중에는 바꿀 수 없습니다" : null;
  const wl = !canWrite ? "관리자만 바꿀 수 있습니다" : busy ?? (m?.writing ? "앞에서 바꾼 값을 확인하는 중" : writeLock);
  const lim = (no: number) => bundle?.devParams?.limitLabels?.[String(no)] ?? ["", "공정 한계 1 하한", "공정 한계 1 상한", "공정 한계 2 하한", "공정 한계 2 상한"][no];
  const labelOf = (item: string, no: number | null) => (spec(item)?.label ?? item).replace("{n}", String(no ?? "")).replace("{lim}", lim(no ?? 0));
  const open = (item: string, no: number | null, now: number | null) => setEdit({ item, no, label: labelOf(item, no), now, text: now === null ? "" : String(now) });

  /** 범위 검사 — 장비 dev_params.check_write 와 같은 규칙 */
  const check = (e: Edit): { err: string | null; value: number | null } => {
    const s = spec(e.item);
    const t = e.text.trim();
    if (!t) return { err: "값을 넣으세요", value: null };
    const x = Number(t);
    if (!Number.isFinite(x)) return { err: "숫자를 넣으세요", value: null };
    if (s?.int && !Number.isInteger(x)) return { err: "정수를 넣으세요", value: null };
    if (e.item === "lead" && Math.abs(x * 100 - Math.round(x * 100)) > 1e-6) return { err: "소수 둘째 자리까지 넣으세요", value: null };
    const lo = s?.min ?? null, hi = e.item === "sp" ? fsMtorr : s?.max ?? null;
    if ((lo !== null && x < lo - 1e-9) || (hi !== null && x > hi + 1e-9)) {
      return { err: `범위 ${lo ?? "-"} ~ ${hi ?? "-"}${s?.unit ? ` ${s.unit}` : ""}`, value: null };
    }
    return { err: null, value: x };
  };
  const send = (e: Edit) => {
    const { value } = check(e);
    if (value === null) return;
    const unit = spec(e.item)?.unit ?? "";
    const txt = (y: number | null) => (y === null ? "모름" : e.item === "auto" ? AUTO[String(y)] ?? String(y) : `${y}${unit ? ` ${unit}` : ""}`);
    onAsk({
      kind: "DEVICE_PARAM_WRITE", label: `컨트롤러 값 · ${e.label} 바꾸기`, key: `DEVICE_PARAM_WRITE:${e.item}${e.no ?? ""}`, red: true,
      args: { device: "mfc", item: e.item, ...(e.no !== null ? { no: e.no } : {}), value },
      lines: [`${e.label}: ${txt(e.now)} → ${txt(value)}`, "쓴 뒤 다시 읽어 같은지 확인합니다."],
      note: "압력 제어 동작이 바로 바뀝니다.",
    });
    setEdit(null);
  };

  const at = kst(m?.readAt);
  const prog = m?.progress;
  const stateTxt = m?.state && STATE_WORD[m.state] ? `${STATE_WORD[m.state]}${prog && m.state === "reading" ? ` ${prog.done}/${prog.total}` : ""}` : null;
  const cell = (item: string, no: number | null, now: number | null, text: string) => {
    const on = edit?.item === item && edit?.no === no;
    const can = !!spec(item) && !wl;
    return (
      <td key={`${item}${no}`} className={`px-2 py-2 text-right tabular-nums ${on ? "rounded-[6px] bg-[#EEF4FF] outline outline-2 -outline-offset-2 outline-[#1D4ED8]" : ""}`}>
        {canWrite && spec(item) ? (
          <button type="button" disabled={!can} onClick={() => open(item, no, now)} title={can ? `${labelOf(item, no)} 수정` : wl ?? undefined}
            className="font-bold text-[#1E3A8A] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:no-underline">{text}</button>
        ) : <b className="text-[#1E3A8A]">{text}</b>}
      </td>
    );
  };
  const w = m?.write;
  const torr = (pct: number | null | undefined) => (typeof pct === "number" && typeof v?.fsTorr === "number" ? `${(pct / 100 * v.fsTorr).toFixed(4)}` : "—");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`${FS.small} text-[#5B6470]`}>
          {at ? `${at} 장비에서 읽음` : "아직 읽지 않음"}{stateTxt ? ` · ${stateTxt}` : ""}
        </p>
        <Btn size="sm" lock={readLock ?? (m?.state === "reading" ? "읽는 중" : null)} onClick={onRead}><RefreshCw size={13} /> 다시 읽기</Btn>
      </div>
      {v ? (
        <>
          <div className="overflow-x-auto">
            <table className={`w-full border-collapse ${FS.body}`}>
              <thead>
                <tr className="border-b border-[#E3E6EA] text-[#4B5560]">
                  <th className="px-2 py-2 text-left font-semibold"><span className="sr-only">항목</span></th>
                  {v.sp.map((x) => <th key={x.no} className="px-2 py-2 text-right font-semibold">SP{x.no}</th>)}
                </tr>
              </thead>
              <tbody className="[&>tr]:border-b [&>tr]:border-[#EEF0F3]">
                <tr><td className="px-2 py-2 whitespace-nowrap">설정값 (mTorr)</td>{v.sp.map((x) => cell("sp", x.no, x.mtorr, n2(x.mtorr)))}</tr>
                <tr><td className="px-2 py-2">Gain (%)</td>{v.sp.map((x) => cell("gain", x.no, x.gainPct, x.gainPct === null ? "—" : String(x.gainPct)))}</tr>
                <tr><td className="px-2 py-2">P.Lead (s)</td>{v.sp.map((x) => cell("lead", x.no, x.leadS, n2(x.leadS)))}</tr>
                <tr><td className="px-2 py-2">종류</td>{v.sp.map((x) => <td key={x.no} className="px-2 py-2 text-right">{x.typeText ?? "—"}</td>)}</tr>
              </tbody>
            </table>
          </div>
          {edit && (() => {
            const c = check(edit);
            const s = spec(edit.item);
            const hi = edit.item === "sp" ? fsMtorr : s?.max ?? null;
            return (
              <div className="space-y-2 rounded-[10px] border border-[#C7D7FE] bg-[#F5F8FF] px-3.5 py-3">
                <p className={`flex flex-wrap items-center gap-2 ${FS.body}`}><b>{edit.label} 바꾸기</b>
                  <span className={`${FS.small} text-[#5B6470]`}>지금 {edit.now === null ? "모름" : edit.item === "auto" ? AUTO[String(edit.now)] ?? edit.now : edit.now}</span></p>
                <div className="flex flex-wrap items-center gap-2">
                  {edit.item === "auto" ? (
                    <select aria-label={edit.label} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                      className={`h-9 rounded-[8px] border border-[#D9DDE3] bg-white px-2 ${FS.body}`}>
                      <option value="">고르세요</option><option value="0">Self-Tuning</option><option value="1">PID</option>
                    </select>
                  ) : (
                    <input aria-label={edit.label} value={edit.text} inputMode="decimal" onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                      className={`h-9 w-28 rounded-[8px] border border-[#D9DDE3] bg-white px-2 text-right tabular-nums ${FS.body}`} />
                  )}
                  {s?.unit && <span className={`${FS.small} text-[#5B6470]`}>{s.unit}</span>}
                  <span className={`${FS.small} ${c.err && edit.text ? "text-[#B42318]" : "text-[#5B6470]"}`}>
                    {c.err && edit.text ? c.err : `범위 ${s?.min ?? "-"} ~ ${hi ?? "-"}${s?.unit ? ` ${s.unit}` : ""}`}
                  </span>
                  <span className="ml-auto flex gap-1.5">
                    <Btn size="sm" onClick={() => setEdit(null)}>취소</Btn>
                    <Btn size="sm" kind="primary" lock={c.err ? c.err : wl} onClick={() => send(edit)}>장비에 쓰기</Btn>
                  </span>
                </div>
                <p className={`${FS.small} text-[#5B6470]`}>쓴 뒤 다시 읽어 같은지 확인합니다. 압력 제어 동작이 바로 바뀝니다.</p>
              </div>
            );
          })()}
          <ul className={FS.body}>
            <Line k="자동 압력 제어 방식" v={v.autoModeText ?? "—"} edit={canWrite ? () => open("auto", null, v.autoMode) : undefined} lock={wl} />
            <Line k="밸브 종류" v={v.valveType === null ? "—" : `J${v.valveType}`} />
            <Line k="제어 방향" v={v.direction === null ? "—" : `N${v.direction}`} />
            <Line k="압력 센서 범위" v={v.fsTorr !== null ? `${v.fsTorr} Torr` : "—"}
              sub={v.rangeCode !== null ? `범위 코드 ${v.rangeCode}${v.unitText ? ` · 단위 ${v.unitText}` : ""}` : undefined} />
            {[1, 3].map((a) => {
              const lo = v.limits.find((x) => x.no === a), hi = v.limits.find((x) => x.no === a + 1);
              return (
                <Line key={a} k={`공정 한계 ${a === 1 ? 1 : 2} (하한 / 상한)`} v={`${torr(lo?.pct)} / ${torr(hi?.pct)} Torr`}
                  sub={`${n2(lo?.pct)} / ${n2(hi?.pct)} %FS`}
                  edits={canWrite ? [[`하한`, () => open("limit", a, lo?.pct ?? null)], [`상한`, () => open("limit", a + 1, hi?.pct ?? null)]] : undefined} lock={wl} />
              );
            })}
            <Line k="Ar · O₂ 채널 풀스케일" v={`${v.flowFs.map((x) => (x === null ? "—" : String(x))).join(" / ")} ${v.flowUnits[0] ?? ""}`.trim()} />
            <Line k="제어 상태" v={v.status ?? "—"} sub="R37 MXYZ(X 1 = Remote)" />
            <Line k="소프트웨어 버전" v={v.version ?? "—"} />
          </ul>
          {v.missing && v.missing.length > 0 && <p className={`${FS.small} text-[#5B6470]`}>읽지 못한 값: {v.missing.join(", ")}</p>}
        </>
      ) : <p className={`${FS.body} text-[#5B6470]`}>{m?.state === "waiting" ? "공정·수동 조작이 끝난 뒤 읽습니다." : "장비가 아직 값을 읽지 않았습니다."}</p>}
      {w && (
        <p className={`flex flex-wrap items-center gap-2 ${FS.small} text-[#5B6470]`}>
          <Chip tone={w.ok ? "neutral" : "warn"}>{w.ok ? "바꿈" : "바꾸기 실패"}</Chip>
          {`${w.label} · ${w.old ?? "모름"} → ${w.ok ? w.new : `목표 ${w.target} · 되읽은 값 ${w.new ?? "모름"}`}${w.by ? ` · ${w.by}` : ""}${kst(w.at) ? ` · ${kst(w.at)}` : ""}`}
        </p>
      )}
      {!canWrite && <p className={`${FS.small} text-[#5B6470]`}>컨트롤러 값 바꾸기는 웹에서 관리자만 할 수 있습니다.</p>}
    </div>
  );

}

function Line({ k, v, sub, edit, edits, lock }: {
  k: string; v: string; sub?: string; edit?: () => void; edits?: [string, () => void][]; lock?: string | null;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#EEF0F3] py-1.5">
      <span className="min-w-0 text-[#1B1F24]">{k}{sub && <span className={`ml-1.5 ${FS.small} text-[#8A929D]`}>{sub}</span>}</span>
      <span className="flex items-center gap-2">
        <b className="tabular-nums text-[#1E3A8A]">{v}</b>
        {edit && <Btn size="sm" lock={lock ?? null} onClick={edit} ariaLabel={`${k} 수정`}><PencilLine size={13} /> 수정</Btn>}
        {edits?.map(([nm, fn]) => <Btn key={nm} size="sm" lock={lock ?? null} onClick={fn} ariaLabel={`${k} ${nm} 수정`}><PencilLine size={13} /> {nm}</Btn>)}
      </span>
    </li>
  );
}

function IgValues({ dp }: { dp: DevParams | null | undefined }) {
  const g = dp?.ig;
  if (!g) return <p className={`${FS.body} text-[#5B6470]`}>Ion Gauge 상태 응답을 기다리는 중입니다.</p>;
  const at = kst(g.readAt);
  return (
    <div className="space-y-2">
      <p className={`${FS.small} text-[#5B6470]`}>{at ? `${at} 장비에서 읽음` : ""} · 읽기만 합니다(값 바꾸기는 장비 앞면에서).</p>
      <ul className={FS.body}>
        <Line k="자동 Filament" v={g.autoFilament === null || g.autoFilament === undefined ? "—" : g.autoFilament ? "켜짐" : "꺼짐"} />
        <Line k="자동 Filament 셋포인트" v={`${sci(g.autoFilamentSpTorr)} Torr`} />
        <Line k="이온 셋포인트 1 / 2" v={`${sci(g.ionSp1Torr)} / ${sci(g.ionSp2Torr)} Torr`} />
        <Line k="Gauge A / B 셋포인트" v={`${sci(g.gaugeASpTorr)} / ${sci(g.gaugeBSpTorr)} Torr`} />
        <Line k="가스 계수" v={typeof g.gasFactor === "number" ? g.gasFactor.toFixed(2) : "—"} />
        <Line k="감도" v={typeof g.sensitivity === "number" ? g.sensitivity.toFixed(1) : "—"} />
        <Line k="셋포인트 보호 해제" v={g.spProtectOff === null || g.spProtectOff === undefined ? "—" : g.spProtectOff ? "켜짐" : "꺼짐"} />
      </ul>
    </div>
  );
}
