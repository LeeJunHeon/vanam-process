"use client";

// 챔버12 CH2 두께 모니터 — Factor 설정 창(v1 ui/thickness_factor_dialog.py)·재료 목록 창(ui/thickness_material_dialog.py) 그대로.
// 창 값: 장비 명령 THICKNESS_WINDOW(결과 value — 허브가 사건 thickness/window 로도 내고, req 로 이 창의 요청을 찾는다) — 창을 열 때
//   파일을 읽는 v1 과 같이 열 때마다 읽는다. 내용(제목·안내·표·드롭다운 항목·경고)은 장비 thickness_factors.factor_window·
//   thickness_materials.materials_window 가 만든 글 그대로.
// 검사·문구(v1 그대로 — 장비 thickness_factors·thickness_materials 와 같은 규칙, 마지막 판단은 장비):
//   Factor [저장]: tooling 칸 10~399(틀린 칸 빨강 #ffcdd2 — '… 숫자가 아님'·'… 범위(10~399%) 밖'), 재료는 목록에 있어야 함(틀린 칸 빨강).
//     틀리면 경고 'Factor 설정'/'고칠 칸이 있어 저장하지 않았습니다:\n\n…', 저장하면 창 닫음(장비는 다시 읽기 — reload_factors).
//   [장비에 쓰기]: 고른 chuck×건 칸 + 그 건 재료 → THICKNESS_FACTOR_WRITE(결과 문구는 사건 thickness/panel_result — '장비에 적용됨 — …').
//   [재료 목록 편집] → 재료 창(지금 고른 재료 = '사용 중'). 저장 뒤 드롭다운 다시 읽기(고른 이름 유지).
//   재료 창: [행 추가]·[행 삭제](Factor 에서 쓰는 재료면 확인창 '재료 삭제' 기본 아니오)·[저장](빈 행 무시, 이름·density 0.500~99.99·
//     Z 0.100~9.999·이름 중복 — 처음 15건 '재료 목록'/'고칠 칸이 있어 저장하지 않았습니다').
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Settings2, X } from "lucide-react";
import type { Notice } from "../chk/kit";
import type { FeedItem, SendResult } from "../chk/useChk2";

export const TOOLING_MIN = 10, TOOLING_MAX = 399;
export const DENSITY_MIN = 0.5, DENSITY_MAX = 99.99, Z_MIN = 0.1, Z_MAX = 9.999;
export const CHUCKS = ["up", "mid", "down"] as const;
export const GUNS = ["G1", "G2", "G3"] as const;
export const CHUCK_TEXT: Record<string, string> = { up: "Up", mid: "Mid", down: "Down" };
export const NONE_TEXT = "(선택 안 함)";
const BAD = "bg-[#ffcdd2]";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export type FactorWindow = {
  title: string; tooling_header: string; material_header: string; tooling: Record<string, Record<string, string>>;
  material: Record<string, string>; values: Record<string, string>; choices: [string, string][]; warnings: string[];
  warning_text: string; info: string; write_note: string;
};
export type MaterialsWindow = { title: string; header: string; columns: string[]; rows: string[][]; warnings: string[]; warning_text: string; note: string };
export type Windows = { ch: number; req?: string | null; factor: FactorWindow; materials: MaterialsWindow };
type Mat = { name: string; symbol: string; density: number; z: number; label: string };

/** 파이썬 format(f, "g") */
export function fmtG(f: number): string {
  if (!Number.isFinite(f)) return Number.isNaN(f) ? "nan" : f > 0 ? "inf" : "-inf";
  if (f === 0) return Object.is(f, -0) ? "-0" : "0";
  const e = Number(f.toExponential(5).split("e")[1]);
  if (e < -4 || e >= 6) {
    const [m, x] = f.toExponential(5).split("e");
    const mm = m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m;
    const xn = Number(x);
    return `${mm}e${xn < 0 ? "-" : "+"}${String(Math.abs(xn)).padStart(2, "0")}`;
  }
  const s = f.toPrecision(6);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}
const pyRepr = (s: string) => (s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`);
/** 파이썬 float(글) — 안 되면 null */
function pyFloat(t: string): number | null {
  const s = t.trim().replace(/_/g, "");
  if (/^[+-]?(inf(inity)?)$/i.test(s)) return s.startsWith("-") ? -Infinity : Infinity;
  if (/^[+-]?nan$/i.test(s)) return NaN;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  return Number(s);
}

/** thickness_factors.check_tooling — 빈 칸은 (null, '') */
export function checkTooling(text: string): { v: number | null; err: string } {
  if (!text.trim()) return { v: null, err: "" };
  const f = pyFloat(text);
  if (f === null) return { v: null, err: `${pyRepr(text.trim())} 숫자가 아님` };
  if (Number.isNaN(f) || !(TOOLING_MIN <= f && f <= TOOLING_MAX)) return { v: null, err: `${fmtG(f)} 범위(${fmtG(TOOLING_MIN)}~${fmtG(TOOLING_MAX)}%) 밖` };
  return { v: f, err: "" };
}

export function matsOf(w: MaterialsWindow | null): Mat[] {
  return (w?.rows ?? []).map((r) => ({ name: String(r[0] ?? ""), symbol: String(r[1] ?? ""), density: Number(r[2]), z: Number(r[3]),
    label: r[1] ? `${r[1]} — ${r[0]}` : String(r[0] ?? "") }));
}

/** thickness_factors.chosen — 고른 글 → 재료 */
export function chosen(text: string, mats: Mat[], gun: string): { m: Mat | null; err: string } {
  const t = (text ?? "").trim();
  if (!t || t === NONE_TEXT) return { m: null, err: "" };
  const m = mats.find((x) => t === x.label || t === x.name || t.toLowerCase() === x.name.toLowerCase());
  return m ? { m, err: "" } : { m: null, err: `${gun}: 재료 '${t}' 가 재료 목록에 없음` };
}

export function valueText(text: string, mats: Mat[], gun: string): string {
  const { m, err } = chosen(text, mats, gun);
  if (m) return `ρ ${fmtG(m.density)} · Z ${m.z.toFixed(3)}`;
  return err ? "목록에 없음" : "—";
}

/** Factor [저장] 검사(ThicknessFactorDialog.collect) — 오류·빨간 칸('tooling.mid.G2'·'material.G3') */
export function factorCollect(tooling: Record<string, Record<string, string>>, mt: Record<string, string>, mats: Mat[]) {
  const errs: string[] = [], bad: string[] = [];
  for (const c of CHUCKS) for (const g of GUNS) {
    const { err } = checkTooling(tooling[c]?.[g] ?? "");
    if (err) { errs.push(`tooling ${CHUCK_TEXT[c]}/${g}: ${err}`); bad.push(`tooling.${c}.${g}`); }
  }
  for (const g of GUNS) {
    const { err } = chosen(mt[g] ?? "", mats, g);
    if (err) { errs.push(err); bad.push(`material.${g}`); }
  }
  return { errs, bad };
}

/** 재료 [저장] 검사(ThicknessMaterialDialog.collect) — 오류·빨간 칸('행,열') */
export function materialsCollect(rows: string[][]) {
  const errs: string[] = [], bad: string[] = [];
  const seen = new Map<string, number>();
  rows.forEach((row, r) => {
    const v = [0, 1, 2, 3, 4].map((c) => String(row[c] ?? "").trim());
    if (!v.some(Boolean)) return;
    const e: string[] = [];
    if (!v[0]) e.push("이름이 비어 있음");
    for (const [key, s, lo, hi] of [["density", v[2], DENSITY_MIN, DENSITY_MAX], ["z_factor", v[3], Z_MIN, Z_MAX]] as const) {
      const f = s ? pyFloat(s) : null;
      if (f === null) { e.push(`${key} ${pyRepr(s)} 숫자가 아님`); continue; }
      if (Number.isNaN(f) || !(lo <= f && f <= hi)) e.push(`${key} ${fmtG(f)} 범위(${fmtG(lo)}~${fmtG(hi)}) 밖`);
    }
    if (e.length) {
      errs.push(`${r + 1}행 '${v[0]}': ${e.join(", ")}`);
      ([[0, "이름"], [2, "density"], [3, "z_factor"]] as const).forEach(([c, k]) => { if (e.some((x) => x.startsWith(k))) bad.push(`${r},${c}`); });
      return;
    }
    const k = v[0].toLowerCase();
    if (seen.has(k)) { errs.push(`${r + 1}행 '${v[0]}': 이름 중복(${seen.get(k)! + 1}행)`); bad.push(`${r},0`); return; }
    seen.set(k, r);
  });
  return { errs, bad };
}

export const deleteConfirmText = (names: string[]) =>
  `Factor 설정에서 쓰는 재료입니다: ${names.join(", ")}\n지우면 그 건은 '재료 목록에 없음'이 되어 Thickness 모드 시작이 거부됩니다(E845).\n지울까요?`;

/** 사건 thickness/window 중 req 가 같은 마지막 것 */
export function windowEvent(feed: FeedItem[], req: string): Windows | null {
  for (let i = feed.length - 1; i >= 0; i--) {
    const c = (feed[i].data as Obj).context;
    if (feed[i].type !== "event" || !isObj(c) || c.source !== "thickness" || c.kind !== "window") continue;
    const d = c.data;
    if (isObj(d) && d.req === req && isObj(d.factor) && isObj(d.materials)) return d as unknown as Windows;
  }
  return null;
}

/** after(사건 id) 뒤에 온 thickness/panel_result 첫 사건 */
function panelResultAfter(feed: FeedItem[], after: string | null): { level: string; text: string } | null {
  const k = after ? feed.findIndex((e) => e.id === after) : -1;
  for (let i = k + 1; i < feed.length; i++) {
    const d = feed[i].data as Obj;
    const c = d.context;
    if (feed[i].type === "event" && isObj(c) && c.source === "thickness" && c.kind === "panel_result") {
      return { level: String(d.level ?? "info"), text: String(d.message ?? "") };
    }
  }
  return null;
}

type Send = (kind: string, args: Record<string, unknown>, label?: string) => Promise<SendResult>;
type Notify = (n: Omit<Notice, "id" | "at">) => void;
const reqId = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const failText = (r: SendResult) => (!r.ok ? String(r.body?.error ?? `HTTP ${r.status}`) : r.body?.status === "accepted" ? "" : String(r.body?.detail || r.body?.reasonCode || r.body?.status || "결과 없음"));

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-label={title}>
      <div className={`flex max-h-[92vh] w-full ${wide ? "max-w-3xl" : "max-w-xl"} flex-col rounded-2xl bg-white p-4`}>
        <div className="mb-2 flex items-center gap-2">
          <b className="text-sm text-gray-900">{title}</b>
          <button onClick={onClose} className="ml-auto rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="닫기"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto text-xs">{children}</div>
      </div>
    </div>
  );
}

function Alert({ msg, onClose }: { msg: { title: string; text: string; tone: "warn" | "info" } | null; onClose: () => void }) {
  if (!msg) return null;
  return (
    <div className={`whitespace-pre-wrap rounded-lg border px-2 py-1.5 ${msg.tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      <b>{msg.title}</b> — {msg.text}
      <button onClick={onClose} className="ml-2 text-[10px] underline">확인</button>
    </div>
  );
}

const btn = "rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40";

/** Factor 설정 창 */
export function FactorDialog({ win, feed, can, send, onClose, onReload }: {
  win: Windows; feed: FeedItem[]; can: (kind: string) => boolean; send: Send; onClose: () => void; onReload: (keep: Record<string, string>) => void;
}) {
  const f = win.factor;
  const mats = useMemo(() => matsOf(win.materials), [win.materials]);
  const [tool, setTool] = useState(() => Object.fromEntries(CHUCKS.map((c) => [c, { ...(f.tooling[c] ?? {}) }])) as Record<string, Record<string, string>>);
  const [mt, setMt] = useState<Record<string, string>>(() => Object.fromEntries(GUNS.map((g) => {
    const name = f.material[g] ?? "";
    const m = mats.find((x) => x.name === name);
    return [g, m ? m.label : name];
  })));
  const [bad, setBad] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ title: string; text: string; tone: "warn" | "info" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [wc, setWc] = useState<string>("up");
  const [wg, setWg] = useState<string>("G1");
  const [writeAfter, setWriteAfter] = useState<string | null | undefined>(undefined);
  const [matOpen, setMatOpen] = useState(false);
  const lastId = feed.length ? feed[feed.length - 1].id : null;
  // [장비에 쓰기] 결과 문구(사건 thickness/panel_result — 보낸 뒤 온 첫 것)
  const writeRes = writeAfter !== undefined ? panelResultAfter(feed, writeAfter) : null;
  const shown = writeRes ? { title: "장비에 쓰기", text: writeRes.text, tone: (writeRes.level === "info" ? "info" : "warn") as "info" | "warn" } : msg;
  const working = busy || (writeAfter !== undefined && !writeRes);

  const nameOf = (g: string) => chosen(mt[g] ?? "", mats, g).m?.name ?? (mt[g]?.trim() || "");
  const save = async () => {
    const c = factorCollect(tool, mt, mats);
    setBad(c.bad);
    if (c.errs.length) return setMsg({ title: "Factor 설정", text: "고칠 칸이 있어 저장하지 않았습니다:\n\n" + c.errs.join("\n"), tone: "warn" });
    setBusy(true);
    const r = await send("THICKNESS_FACTOR_SAVE", { ch: win.ch, tooling: tool, materials: Object.fromEntries(GUNS.map((g) => [g, mt[g] ?? ""])) }, "두께 Factor 저장");
    setBusy(false);
    const why = failText(r);
    if (why) return setMsg({ title: "Factor 설정", text: why, tone: "warn" });
    onClose();
  };
  const write = async () => {
    const errs: string[] = [], b: string[] = [];
    const t = checkTooling(tool[wc]?.[wg] ?? "");
    if (t.v === null) { errs.push(`tooling ${CHUCK_TEXT[wc]}/${wg}: ${t.err || "빈 칸"}`); b.push(`tooling.${wc}.${wg}`); }
    const m = chosen(mt[wg] ?? "", mats, wg);
    if (!m.m) { errs.push(m.err || `${wg}: 재료 미선택`); b.push(`material.${wg}`); }
    setBad(b);
    if (errs.length) return setMsg({ title: "장비에 쓰기", text: "고칠 칸이 있어 장비에 쓰지 않았습니다:\n\n" + errs.join("\n"), tone: "warn" });
    setBusy(true);
    const after = lastId;
    const r = await send("THICKNESS_FACTOR_WRITE", { ch: win.ch, chuck: wc, gun: wg, tooling: tool[wc]?.[wg] ?? "", material: mt[wg] ?? "" }, "두께 Factor 장비에 쓰기");
    const why = failText(r);
    setBusy(false);
    if (why) return setMsg({ title: "장비에 쓰기", text: why, tone: "warn" });
    setMsg(null);
    setWriteAfter(after);
  };

  return (
    <Modal title={f.title} onClose={onClose}>
      <p className="text-gray-700">{f.tooling_header}</p>
      <table className="w-full border-collapse text-center">
        <thead><tr><th className="w-16" />{GUNS.map((g) => <th key={g} className="border border-gray-200 bg-gray-50 px-1 py-0.5 font-semibold">{g}</th>)}</tr></thead>
        <tbody>
          {CHUCKS.map((c) => (
            <tr key={c}>
              <th className="border border-gray-200 bg-gray-50 px-1 font-semibold">{CHUCK_TEXT[c]}</th>
              {GUNS.map((g) => (
                <td key={g} className="border border-gray-200 p-0">
                  <input aria-label={`tooling ${CHUCK_TEXT[c]}/${g}`} value={tool[c]?.[g] ?? ""}
                    onChange={(e) => setTool((t) => ({ ...t, [c]: { ...t[c], [g]: e.target.value } }))}
                    className={`w-full px-1 py-1 text-center tabular-nums outline-none ${bad.includes(`tooling.${c}.${g}`) ? BAD : "bg-white"}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-gray-700">{f.material_header}</p>
      <datalist id="ch12-thk-materials">{f.choices.map(([label]) => <option key={label} value={label} />)}</datalist>
      <div className="space-y-1">
        {GUNS.map((g) => (
          <div key={g} className="flex items-center gap-2">
            <span className="w-6 font-semibold">{g}</span>
            <input list="ch12-thk-materials" aria-label={`재료 ${g}`} value={mt[g] ?? ""} placeholder={NONE_TEXT}
              onChange={(e) => setMt((m) => ({ ...m, [g]: e.target.value }))}
              className={`w-64 rounded-md border border-gray-200 px-1.5 py-1 ${bad.includes(`material.${g}`) ? BAD : "bg-white"}`} />
            <span className="text-[#37474f]" title={chosen(mt[g] ?? "", mats, g).m ? "" : undefined}>{valueText(mt[g] ?? "", mats, g)}</span>
          </div>
        ))}
      </div>
      <p className="whitespace-pre-wrap text-[10px] text-gray-500">{f.info}</p>
      {f.warning_text && <p className="whitespace-pre-wrap text-[10px] text-[#ef6c00]">{f.warning_text}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
        <span className="font-semibold text-gray-600">장비에 바로 쓰기</span>
        <select aria-label="chuck" value={wc} onChange={(e) => setWc(e.target.value)} className="rounded-md border border-gray-200 px-1 py-0.5">
          {CHUCKS.map((c) => <option key={c} value={c}>{CHUCK_TEXT[c]}</option>)}
        </select>
        <select aria-label="건" value={wg} onChange={(e) => setWg(e.target.value)} className="rounded-md border border-gray-200 px-1 py-0.5">
          {GUNS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <button className={btn} disabled={working || !can("THICKNESS_FACTOR_WRITE")} onClick={write}
          title="고른 chuck×건의 tooling 과 그 건 재료의 density·Z 를 지금 창의 값으로 장비에 바로 씀">장비에 쓰기</button>
      </div>
      <p className="text-[10px] text-gray-500">{f.write_note}</p>
      <Alert msg={shown} onClose={() => { setMsg(null); setWriteAfter(undefined); }} />
      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-2">
        <button className={btn} disabled={!can("THICKNESS_MATERIALS_SAVE")} onClick={() => setMatOpen(true)}>재료 목록 편집</button>
        <span className="ml-auto" />
        <button className={`${btn} border-blue-300 text-blue-700`} disabled={working || !can("THICKNESS_FACTOR_SAVE")} onClick={save}>저장</button>
        <button className={btn} onClick={onClose}>취소</button>
      </div>
      {matOpen && (
        <MaterialsDialog win={win} used={GUNS.map(nameOf).filter(Boolean)} can={can} send={send} onClose={() => setMatOpen(false)}
          onSaved={() => { setMatOpen(false); onReload(Object.fromEntries(GUNS.map((g) => [g, nameOf(g)]))); }} />
      )}
    </Modal>
  );
}

/** 재료 목록 창 */
export function MaterialsDialog({ win, used, can, send, onClose, onSaved }: {
  win: Windows; used: string[]; can: (kind: string) => boolean; send: Send; onClose: () => void; onSaved: () => void;
}) {
  const m = win.materials;
  const [rows, setRows] = useState<string[][]>(() => m.rows.map((r) => [0, 1, 2, 3, 4].map((c) => String(r[c] ?? ""))));
  const [sel, setSel] = useState<number | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ title: string; text: string; tone: "warn" | "info" } | null>(null);
  const [ask, setAsk] = useState<{ text: string; row: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const usedSet = new Set(used.map((u) => u.toLowerCase()));
  const firstNew = useRef<HTMLInputElement | null>(null);

  const add = () => { setRows((r) => [...r, ["", "", "", "", ""]]); setSel(rows.length); setTimeout(() => firstNew.current?.focus(), 0); };
  const del = () => {
    const r = sel ?? -1;
    if (r < 0 || r >= rows.length) return;
    const name = rows[r][0].trim();
    if (name && usedSet.has(name.toLowerCase())) return setAsk({ text: deleteConfirmText([name]), row: r });
    setRows((x) => x.filter((_, i) => i !== r)); setSel(null);
  };
  const save = async () => {
    const c = materialsCollect(rows);
    setBad(c.bad);
    if (c.errs.length) return setMsg({ title: "재료 목록", text: "고칠 칸이 있어 저장하지 않았습니다:\n\n" + c.errs.slice(0, 15).join("\n"), tone: "warn" });
    setBusy(true);
    const r = await send("THICKNESS_MATERIALS_SAVE", { ch: win.ch, rows, used_names: used, confirmed: true }, "두께 재료 목록 저장");
    setBusy(false);
    const why = failText(r);
    if (why) return setMsg({ title: "재료 목록", text: why, tone: "warn" });
    onSaved();
  };

  return (
    <Modal title={m.title} onClose={onClose} wide>
      <p className="text-gray-700">{m.header}</p>
      {m.warning_text && <p className="whitespace-pre-wrap text-[10px] text-[#ef6c00]">{m.warning_text}</p>}
      <div className="max-h-[45vh] overflow-auto rounded-lg border border-gray-200">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-gray-50"><tr>{m.columns.map((h) => <th key={h} className="border-b border-gray-200 px-1 py-0.5 text-left font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} onClick={() => setSel(r)} className={sel === r ? "bg-blue-50" : ""}>
                {row.map((v, c) => (
                  <td key={c} className="border-b border-gray-100 p-0">
                    <input aria-label={`${r + 1}행 ${m.columns[c]}`} value={v} ref={r === rows.length - 1 && c === 0 ? firstNew : undefined}
                      onFocus={() => setSel(r)}
                      onChange={(e) => setRows((x) => x.map((rr, i) => (i === r ? rr.map((vv, j) => (j === c ? e.target.value : vv)) : rr)))}
                      className={`w-full px-1 py-0.5 outline-none ${c === 0 || c === 4 ? "min-w-[10rem]" : "min-w-[5rem]"} ${bad.includes(`${r},${c}`) ? BAD : "bg-transparent"}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="whitespace-pre-wrap text-[10px] text-gray-500">{m.note}</p>
      <Alert msg={msg} onClose={() => setMsg(null)} />
      {ask && (
        <div className="whitespace-pre-wrap rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-900">
          <b>재료 삭제</b>{"\n"}{ask.text}
          <div className="mt-1 flex gap-2">
            <button className={btn} autoFocus onClick={() => setAsk(null)}>아니오</button>
            <button className={btn} onClick={() => { const r = ask.row; setAsk(null); setRows((x) => x.filter((_, i) => i !== r)); setSel(null); }}>예</button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-2">
        <button className={btn} onClick={add}>행 추가</button>
        <button className={btn} disabled={sel === null} onClick={del}>행 삭제</button>
        <span className="ml-auto" />
        <button className={`${btn} border-blue-300 text-blue-700`} disabled={busy || !can("THICKNESS_MATERIALS_SAVE")} onClick={save}>저장</button>
        <button className={btn} onClick={onClose}>취소</button>
      </div>
    </Modal>
  );
}

/** 패널의 [Factor 설정] 버튼 — 창 값을 읽어(THICKNESS_WINDOW) 창을 연다(v1 '창이 이미 떠 있으면 앞으로' = 하나만) */
export function FactorButton({ feed, can, send, notify, ch = 2 }: {
  feed: FeedItem[]; can: (kind: string) => boolean; send?: Send; notify?: Notify; ch?: number;
}) {
  const [req, setReq] = useState<string | null>(null);
  const [keep, setKeep] = useState<Record<string, string> | null>(null);
  const found = req ? windowEvent(feed, req) : null;
  // 재료 저장 뒤 다시 읽기 — 고른 이름 유지(v1 reload_materials)
  const win = found && keep ? { ...found, factor: { ...found.factor, material: { ...found.factor.material, ...keep } } } : found;
  const waiting = !!req && !found;
  const open = async (k: Record<string, string> | null = null) => {
    if (!send) return;
    const id = reqId();
    setKeep(k);
    setReq(id);
    const r = await send("THICKNESS_WINDOW", { ch, req: id }, "두께 Factor 설정 열기");
    const why = failText(r);
    if (why) { setReq(null); notify?.({ tone: "bad", title: "Factor 설정", text: `설정창을 열 수 없습니다: ${why}` }); }
  };
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => { setReq(null); notify?.({ tone: "bad", title: "Factor 설정", text: "설정창을 열 수 없습니다: 장비 응답(창 값) 없음" }); }, 15_000);
    return () => clearTimeout(t);
  }, [waiting, notify]);
  return (
    <>
      <button className={btn} disabled={!send || !!req || !can("THICKNESS_WINDOW")} onClick={() => void open()}>
        <Settings2 size={12} className="mr-1 inline" />Factor 설정
      </button>
      {win && (
        <FactorDialog key={`${win.req}`} win={win} feed={feed} can={can} send={send!} onClose={() => setReq(null)}
          onReload={(k) => void open(k)} />
      )}
    </>
  );
}
