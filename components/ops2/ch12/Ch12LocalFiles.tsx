"use client";

// 챔버12 노트북 화면(local)의 레시피 파일 고르기 — v1 'Select File'(CH1·CH2 processList — chamber_runtime.py:3359-3380)·PC 'CSV 불러오기'
// (PC-087)·프리스퍼터 레시피(main.py:1710-1758) 대화상자 자리. 장비 로컬 서버 GET /api/v1/files?dir=(시작 폴더 PROCESS_LIST_START_DIR
// 아래만, 127.0.0.1 만 — v2/ch12/local_server.py)로 폴더를 보고 *.csv·*.xlsx 를 고른다. 시작 폴더 = 마지막으로 연 폴더(이 브라우저
// 기억 — v1 '마지막으로 연 폴더'), 없으면 시작 폴더. 고른 파일은 명령 path 인자로(장비가 그 경로를 읽는다):
//   CH1·CH2 적재 RECIPE_LOAD{ch, path} · PC 불러오기 PC_RECIPE_LOAD{path}(CSV 만 — v1 PC 필터 'CSV Files (*.csv)') ·
//   프리스퍼터 레시피 PRESPUTTER_RECIPE{ch, path}. 웹 화면은 포털 레시피 목록 그대로(이 칸 없음).
import { useCallback, useEffect, useState } from "react";
import { FileText, Folder, FolderUp, RefreshCw } from "lucide-react";
import { Card, type Ask } from "../chk/kit";
import { KINDS, chArgs, hasKind, pickKind } from "./logic";
import type { Ch12Bundle } from "./types";

export type FileEntry = { name: string; path: string; full: string; kind: "dir" | "file"; size: number | null; mtime: number };
export type Listing = { root: string; dir: string; parent: string | null; abs: string; entries: FileEntry[]; truncated?: boolean };

const LAST_DIR_KEY = "vanam-process:ch12-local-files-dir";

/** 고른 파일로 보낼 수 있는 명령(v1 대화상자마다) */
export function fileTargets(bundle: Ch12Bundle | null, f: FileEntry | null): { label: string; kind: string; args: Record<string, unknown> }[] {
  if (!f || f.kind !== "file") return [];
  const out: { label: string; kind: string; args: Record<string, unknown> }[] = [];
  const kl = pickKind(bundle, KINDS.load);
  for (const ch of ["ch1", "ch2"] as const) {
    if (hasKind(bundle, KINDS.load)) out.push({ label: `${ch.toUpperCase()} 적재`, kind: kl, args: chArgs(bundle, kl, ch, { path: f.full }) });
  }
  if (f.name.toLowerCase().endsWith(".csv") && hasKind(bundle, ["PC_RECIPE_LOAD"])) {
    out.push({ label: "PC 불러오기", kind: "PC_RECIPE_LOAD", args: { path: f.full } });
  }
  for (const ch of ["ch1", "ch2"] as const) {
    if (hasKind(bundle, ["PRESPUTTER_RECIPE"])) {
      out.push({ label: `${ch.toUpperCase()} 프리스퍼터 레시피`, kind: "PRESPUTTER_RECIPE", args: chArgs(bundle, "PRESPUTTER_RECIPE", ch, { path: f.full }) });
    }
  }
  return out;
}

export function LocalFiles({ bundle, can, onAsk, fetcher, initial }: {
  bundle: Ch12Bundle | null; can: (kind: string) => boolean; onAsk: (a: Ask) => void;
  fetcher?: (dir: string) => Promise<{ status: number; body: Listing | { error?: string; detail?: string } }>;
  initial?: Listing | null;
}) {
  const [list, setList] = useState<Listing | null>(initial ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<FileEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (dir: string) => {
    const get = (x: string) => (fetcher ? fetcher(x)
      : fetch(`/api/v1/files?dir=${encodeURIComponent(x)}`, { cache: "no-store" })
        .then(async (y) => ({ status: y.status, body: await y.json().catch(() => ({})) })));
    try {
      let r = await get(dir);
      if (!(r.status === 200 && "entries" in r.body) && dir) r = await get("");   // 마지막 폴더가 없어졌으면 시작 폴더로(v1 '기본 위치로 열기')
      if (r.status === 200 && "entries" in r.body) {
        const b = r.body;
        setList(b); setErr(null); setPick(null);
        try { window.localStorage.setItem(LAST_DIR_KEY, b.dir); } catch { /* 저장소 없음 */ }
      } else {
        const b = r.body as { error?: string; detail?: string };
        setErr(b.detail || b.error || `HTTP ${r.status}`);
      }
    } catch {
      setErr("노트북 프로그램에 닿지 않습니다.");
    } finally {
      setBusy(false);
    }
  }, [fetcher]);

  useEffect(() => {
    if (initial) return;
    let last = "";
    try { last = window.localStorage.getItem(LAST_DIR_KEY) ?? ""; } catch { /* 저장소 없음 */ }
    const t = setTimeout(() => void load(last), 0);            // useChk2 와 같게 — 첫 읽기는 다음 차례에
    return () => clearTimeout(t);
  }, [load, initial]);

  const go = (dir: string) => { setBusy(true); void load(dir); };
  const targets = fileTargets(bundle, pick);
  return (
    <Card title={<><FileText size={15} /> 레시피 파일(장비 폴더)</>}
      right={<button onClick={() => go(list?.dir ?? "")} disabled={busy} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="새로 읽기"><RefreshCw size={13} /></button>}>
      <p className="mb-1 truncate font-mono text-[10px] text-gray-500" title={list?.abs}>{list ? list.abs : "시작 폴더 읽는 중…"}</p>
      {err && <p className="mb-1 rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{err}</p>}
      {list && (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-gray-100 text-xs">
          {list.parent !== null && (
            <li><button onClick={() => go(list.parent ?? "")} className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-gray-600 hover:bg-gray-50">
              <FolderUp size={13} /> 위 폴더</button></li>
          )}
          {list.entries.map((e) => (
            <li key={e.path}>
              <button onClick={() => (e.kind === "dir" ? go(e.path) : setPick(e))}
                className={`flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-gray-50 ${pick?.path === e.path ? "bg-blue-50 font-semibold" : ""}`}>
                {e.kind === "dir" ? <Folder size={13} className="text-amber-500" /> : <FileText size={13} className="text-gray-400" />}
                <span className="truncate">{e.name}</span>
                {e.size !== null && <span className="ml-auto shrink-0 text-[10px] text-gray-400">{(e.size / 1024).toFixed(1)} KB</span>}
              </button>
            </li>
          ))}
          {!list.entries.length && <li className="px-2 py-2 text-center text-[11px] text-gray-400">레시피 파일(*.csv·*.xlsx)·폴더 없음</li>}
        </ul>
      )}
      {list?.truncated && <p className="text-[10px] text-gray-400">항목이 많아 일부만 보입니다</p>}
      {pick && (
        <div className="mt-2 space-y-1">
          <p className="truncate text-[11px] text-gray-700">선택된 파일: <span className="font-mono">{pick.full}</span></p>
          <div className="flex flex-wrap gap-1.5">
            {targets.map((t) => (
              <button key={t.label} disabled={!can(t.kind)}
                onClick={() => onAsk({ kind: t.kind, label: t.label, detail: pick.name, args: t.args, key: `${t.kind}@${t.label}`,
                                       lines: [`파일: ${pick.full}`] })}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
