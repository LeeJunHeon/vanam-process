"use client";

// 챔버12 조작 조각 — 묶음 명령 정의(commands[].args)대로 입력 칸을 그려 보내는 칸(CmdForm), 묶음 plcButtons 전부(PlcPanel —
// 챔버별·로드락·그 밖으로 묶어 '정말 하시겠습니까?' 확인 뒤 PLC_BUTTON), 작은 버튼(Btn).
// 인자 범위: min·max·paramMin·paramMax(params 지금 값) — 챔버K logic.argRange 와 같은 규칙. 마지막 판단은 장비.
import { useState, type ReactNode } from "react";
import { Card, type Ask } from "../chk/kit";
import { argRange, checkInput, rangeText } from "../chk/logic";
import { useChk2Mode } from "../chk/mode";
import { asChk, type ArgDef12, type Ch12Bundle } from "./types";
import { chamberArg, chamberArgName, cmdDef } from "./logic";
import { plcAsk } from "./Ch12Mimic";

export const Btn = ({ onClick, disabled, title, tone = "gray", children, small }: {
  onClick: () => void; disabled?: boolean; title?: string; tone?: "gray" | "blue" | "rose" | "roseSolid" | "amber";
  children: ReactNode; small?: boolean;
}) => (
  <button onClick={onClick} disabled={disabled} title={title}
    className={`flex items-center gap-1 whitespace-nowrap rounded-xl ${small ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs"} font-semibold disabled:opacity-40 ${
      tone === "blue" ? "bg-blue-600 text-white hover:bg-blue-700"
      : tone === "roseSolid" ? "bg-rose-600 text-white hover:bg-rose-700"
      : tone === "rose" ? "border border-rose-300 bg-white text-rose-600 hover:bg-rose-50"
      : tone === "amber" ? "border border-amber-300 bg-white text-amber-700 hover:bg-amber-50"
      : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>
    {children}
  </button>
);

/** 칸 글 → 인자 값(형식대로). 빈 칸은 undefined(보내지 않음) */
function parseArg(a: ArgDef12, text: string): { v: unknown; err: string | null } {
  const t = text.trim();
  if (t === "") return { v: undefined, err: a.required ? "필수" : null };
  if (a.type === "int" || a.type === "float") {
    const n = Number(t);
    if (!Number.isFinite(n)) return { v: t, err: "숫자가 아닙니다" };
    if (a.type === "int" && !Number.isInteger(n)) return { v: n, err: "정수여야 합니다" };
    return { v: n, err: null };
  }
  if (a.type === "obj" || a.type === "rows") {
    try { return { v: JSON.parse(t), err: null }; } catch { return { v: t, err: "JSON 형식이 아닙니다" }; }
  }
  return { v: t, err: null };
}

/** 인자 화면 이름(정의 desc 가 없을 때) */
const ARG_LABEL: Record<string, string> = {
  ch: "채널", target: "목표", cycles: "사이클 수", on: "켜기", time: "시각(HH:MM)", params: "값(JSON)", rows: "행(JSON)",
  path: "파일 경로", reason: "사유", tooling: "tooling", material: "재료", name: "이름",
};

/** 명령 하나 — 정의의 인자 칸 + 보내기. chamber(ch1·ch2)를 넘기면 챔버 인자(ch)를 채운다. 정의가 없으면 그리지 않는다 */
export function CmdForm({ bundle, kind, chamber, label, can, onAsk, red, stop, note, fixed = {}, hide = [] }: {
  bundle: Ch12Bundle | null; kind: string; chamber?: "ch1" | "ch2" | null; label: string; can: (kind: string) => boolean;
  onAsk: (a: Ask) => void; red?: boolean; stop?: boolean; note?: string; fixed?: Record<string, unknown>; hide?: string[];
}) {
  const def = cmdDef(bundle, kind);
  const { detail } = useChk2Mode();
  const [vals, setVals] = useState<Record<string, string>>({});
  if (!def) return null;
  const chName = chamberArgName(bundle, kind);
  const args = (def.args ?? []).filter((a) => !(chamber && a.name === chName) && !(a.name in fixed) && !hide.includes(a.name));
  const parsed = args.map((a) => {
    if (a.type === "bool") return { a, v: vals[a.name] === "true" ? true : vals[a.name] === "false" ? false : undefined, err: null };
    if (a.name === "ch" && a.type === "int") return { a, v: vals.ch ? Number(vals.ch) : undefined, err: a.required && !vals.ch ? "필수" : null };
    if (a.type === "enum" || (a.enum && a.enum.length)) return { a, v: vals[a.name] || undefined, err: a.required && !vals[a.name] ? "필수" : null };
    const p = parseArg(a, vals[a.name] ?? "");
    if (!p.err && typeof p.v === "number") {
      const r = argRange(asChk(bundle), kind, a.name);
      const c = checkInput(String(p.v), r);
      if (c.error) return { a, v: p.v, err: c.error };
    }
    return { a, ...p };
  });
  const bad = parsed.some((p) => p.err);
  const out: Record<string, unknown> = { ...fixed };
  if (chamber && def.args?.some((a) => a.name === chName)) out[chName] = chamberArg(bundle, kind, chamber);
  for (const p of parsed) if (p.v !== undefined) out[p.a.name] = p.v;
  const send = () => onAsk({
    kind, label, args: out, red, stop, note, key: chamber ? `${kind}@${chamber}` : kind,
    lines: parsed.filter((p) => p.v !== undefined).map((p) => `${ARG_LABEL[p.a.name] ?? p.a.desc ?? p.a.name}: ${typeof p.v === "object" ? JSON.stringify(p.v) : String(p.v)}`),
  });
  const cls = (err: string | null) => `rounded-md border px-1.5 py-0.5 text-[11px] ${err && err !== "필수" ? "border-rose-400 bg-rose-50" : "border-gray-200"}`;
  return (
    <div className="flex flex-wrap items-end gap-2">
      {parsed.map(({ a, err }) => {
        const r = a.type === "int" || a.type === "float" ? argRange(asChk(bundle), kind, a.name) : null;
        const title = `${a.desc ?? ""}${detail ? ` (${a.name}${a.type ? `: ${a.type}` : ""})` : ""}`.trim() || undefined;
        return (
          <label key={a.name} className="flex flex-col text-[10px] text-gray-500" title={title}>
            <span>{ARG_LABEL[a.name] ?? (a.desc ? a.desc.split(/[—(]/)[0].trim() || a.name : a.name)}{a.required ? " *" : ""}</span>
            {a.name === "ch" && a.type === "int" ? (
              <select value={vals.ch ?? ""} onChange={(e) => setVals((m) => ({ ...m, ch: e.target.value }))} className={cls(null)}>
                <option value="">—</option><option value="1">CH1</option><option value="2">CH2</option>
              </select>
            ) : a.type === "bool" ? (
              <select value={vals[a.name] ?? ""} onChange={(e) => setVals((m) => ({ ...m, [a.name]: e.target.value }))} className={cls(null)}>
                <option value="">—</option><option value="true">켬</option><option value="false">끔</option>
              </select>
            ) : a.enum && a.enum.length ? (
              <select value={vals[a.name] ?? ""} onChange={(e) => setVals((m) => ({ ...m, [a.name]: e.target.value }))} className={cls(err)}>
                <option value="">—</option>
                {a.enum.map((x) => <option key={String(x)} value={String(x)}>{String(x)}</option>)}
              </select>
            ) : (
              <input value={vals[a.name] ?? ""} onChange={(e) => setVals((m) => ({ ...m, [a.name]: e.target.value }))}
                placeholder={r ? rangeText(r) : a.type ?? ""} inputMode={a.type === "int" || a.type === "float" ? "decimal" : "text"}
                className={`${cls(err)} ${a.type === "obj" || a.type === "rows" ? "w-56 font-mono" : "w-24"}`} />
            )}
            {err && err !== "필수" && <span className="text-rose-600">{err}</span>}
          </label>
        );
      })}
      <Btn onClick={send} disabled={!can(kind) || bad} tone={stop ? "rose" : red ? "roseSolid" : "blue"} small>{label}</Btn>
    </div>
  );
}

/** PLC 버튼 묶음 이름 — 코일 이름의 _1_/_2_(챔버), L_(로드락), 그 밖 */
function groupOf(addr: string): string {
  const a = addr.toLowerCase();
  if (/^l_|_l_/.test(a)) return "로드락";
  if (/(^|_)1(_|$)|z1_|z_m_p_1/.test(a)) return "CH1";
  if (/(^|_)2(_|$)|z2_|z_m_p_2/.test(a)) return "CH2";
  return "공통";
}

/** 묶음 plcButtons 전부 — 그림에 없는 것까지(로드락 핀·벤트·Power Select 등). 확인창 '정말 하시겠습니까?' */
export function PlcPanel({ bundle, snapshot, plcOk, canPress, pending, onAsk, note }: {
  bundle: Ch12Bundle | null; snapshot?: Record<string, unknown>; plcOk: boolean; canPress: (target: string) => boolean;
  pending: Record<string, boolean>; onAsk: (a: Ask) => void; note: string;
}) {
  const { detail } = useChk2Mode();
  const list = bundle?.plcButtons ?? [];
  const GROUP: Record<string, string> = { ch1: "CH1", ch2: "CH2", loadlock: "로드락" };
  const gOf = (b: { addr?: string; target: string; chamber?: string }) => (b.chamber ? GROUP[b.chamber] ?? "공통" : groupOf(b.addr || b.target));
  const groups = ["CH1", "CH2", "로드락", "공통"].map((g) => ({ g, items: list.filter((b) => gOf(b) === g) }))
    .filter((x) => x.items.length);
  return (
    <Card title="PLC 버튼" right={<span className={`text-[11px] ${note.includes("잠금") ? "text-rose-600" : "text-gray-400"}`}>{note}</span>}>
      {!list.length ? (
        <p className="py-3 text-center text-xs text-gray-400">장비 묶음에 PLC 버튼 정의가 없습니다(장비 명령 표가 정하면 나타납니다).</p>
      ) : (
        <div className="space-y-2">
          {groups.map(({ g, items }) => (
            <div key={g}>
              <p className="mb-1 text-[11px] font-semibold text-gray-500">{g}</p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((b) => {
                  const col = (b.addr || b.target).toLowerCase();
                  const lit = plcOk && snapshot?.[`plc.${col}`] === true;
                  const wait = plcOk && pending[b.target] !== undefined && pending[b.target] !== (snapshot?.[`plc.${col}`] === true);
                  return (
                    <button key={b.target} disabled={!plcOk || !canPress(b.target)}
                      onClick={() => onAsk(plcAsk(b, !(snapshot?.[`plc.${col}`] === true), col))}
                      title={detail ? `${b.target} · plc.${col}` : b.label}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-40 ${
                        wait ? "animate-pulse border-dashed border-blue-500 text-blue-700"
                        : lit ? "border-green-600 bg-green-500 text-green-950" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                      {b.label}{lit ? " ON" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
