"use client";

// 챔버K v2 장비 화면 데이터 — hello·schema(묶음)·stream(SSE)·commands·runs. 장비 하나에 하나(장비를 바꾸면 key 로 새로).
// stream 은 다시 붙을 때마다 처음 묶음(hello·state·최근 사건)부터 다시 온다 — envelope id 로 거른다.
// EventSource 는 200 이 아닌 응답(배포 중 502·503, 세션 만료 401)을 받으면 CLOSED 가 되어 스스로 다시 붙지 않는다 —
// 그때는 닫고 1→2→5→10 s 간격으로 새로 연다(열리면 간격 처음으로). hello 가 401 이면 로그인이 끊긴 것: 다시 붙기를 멈춘다.
// 묶음: 가지고 있는 묶음의 hash 와 hello 의 webSchemaHash 가 다르면 schema 를 읽는다(409 면 다음 hello 때 다시) —
// 새 묶음을 받기 전까지는 가지고 있던 묶음을 그대로 쓴다. hello(웹 연결·권한)는 10 s 마다도 다시 읽는다.
// 묶음 params current 는 장비 설정 버전의 값(schema API) — state.configVersion 이 바뀌면(설정 적용·되돌리기) 다시 읽는다.
// mode(W-7): web = /process/api/ops2/[equipment]/v1/*(hello.web·perms·명령 ?wait) /
//   local = 노트북 로컬 화면, 같은 주소의 /api/v1/*(챔버K v2 chk/local_server.py — 로그인 없음·127.0.0.1).
//   local 은 명령 결과가 POST 응답 {id, ok, reason, detail} 로 바로 오고, 명령 기록·공정 기록 API 가 없다.
//   stream 은 브라우저가 스스로 다시 붙으면 Last-Event-ID 로 그 뒤부터 이어 받는다(id = seq).
import { useCallback, useEffect, useRef, useState } from "react";
import { newerState } from "./logic";
import type { Bundle, CmdRow, Envelope, EventData, Hello, RunRow, StateData } from "./types";

const BP = process.env.NEXT_PUBLIC_BASE_PATH || "";   // EventSource 는 BasePathFetch 가 고치지 않는다
const FEED_KEEP = 300;
const HELLO_EVERY_MS = 10_000;
const RETRY_MS = [1_000, 2_000, 5_000, 10_000];
const FEED_TYPES = ["event", "run_start", "run_end", "cmd_result", "config_ack"] as const;

export type FeedItem = Envelope<Record<string, unknown>>;
export type FeedEvent = Envelope<EventData>;
export type SendResult = {
  ok: boolean; status: number;
  body: { id?: string; status?: string; reasonCode?: string; detail?: string; error?: string };
};

export type Chk2Mode = "web" | "local";

const webApi = (eq: string, path: string) => `/api/ops2/${encodeURIComponent(eq)}/v1/${path}`;

/** 명령 id(32 hex) — randomUUID 는 https·localhost 에서만 있으므로 getRandomValues 로 */
function newId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function useChk2(equipment: string, mode: Chk2Mode = "web") {
  const local = mode === "local";
  const api = useCallback((_eq: string, path: string) => (local ? `/api/v1/${path}` : webApi(_eq, path)), [local]);
  const [hello, setHello] = useState<Hello | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [state, setState] = useState<Envelope<StateData> | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [commands, setCommands] = useState<CmdRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [streamUp, setStreamUp] = useState(false);
  const [offsetMs, setOffsetMs] = useState(0);         // 웹 서버 시계 − 이 브라우저 시계
  const [error, setError] = useState<string | null>(null);
  const [authLost, setAuthLost] = useState(false);     // hello 401 — 새로고침해야 한다
  const bundleHash = useRef<string | null>(null);      // 가지고 있는 묶음의 hash
  const schemaBusy = useRef(false);
  const seen = useRef(new Set<string>());

  const loadSchema = useCallback(async () => {
    if (schemaBusy.current) return;
    schemaBusy.current = true;
    try {
      const r = await fetch(api(equipment, "schema"), { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;                               // 409(아직 없음) 등 — 가지고 있던 묶음 그대로, 다음 hello 때 다시
      const b = (await r.json()) as Bundle;
      bundleHash.current = b.hash ?? null;
      // 로컬 묶음에는 deviceConfigVersion 이 없다 — 묶음 머리 configVersion 이 같은 뜻
      setBundle(local && b.deviceConfigVersion === undefined ? { ...b, deviceConfigVersion: b.configVersion ?? null } : b);
    } finally {
      schemaBusy.current = false;
    }
  }, [equipment, api, local]);

  const loadHello = useCallback(async () => {
    const t0 = Date.now();
    const r = await fetch(api(equipment, "hello"), { cache: "no-store" }).catch(() => null);
    const t1 = Date.now();
    if (r?.status === 401) {
      setAuthLost(true);
      return;
    }
    if (!r?.ok) {
      setError(local ? (!r ? "노트북 프로그램에 닿지 않습니다." : `장비 정보를 읽지 못했습니다(${r.status}).`)
        : !r ? "웹 서버에 닿지 않습니다." : r.status === 404 ? "등록되지 않았거나 꺼진 장비입니다."
        : `장비 정보를 읽지 못했습니다(${r.status}).`);
      return;
    }
    setError(null);
    const h = (await r.json()) as Hello;
    setHello(h);
    if (h.web?.serverNow) setOffsetMs(Date.parse(h.web.serverNow) - (t0 + t1) / 2);
    if (h.webSchemaHash && h.webSchemaHash !== bundleHash.current) await loadSchema();
  }, [equipment, loadSchema, api, local]);

  const loadCommands = useCallback(async () => {
    if (local) return;                                  // 로컬 서버에는 명령 기록 API 가 없다
    const r = await fetch(api(equipment, "commands?limit=20"), { cache: "no-store" }).catch(() => null);
    if (r?.ok) setCommands((await r.json()).commands ?? []);
  }, [equipment, api, local]);

  const loadRuns = useCallback(async () => {
    if (local) return;                                  // 공정 기록은 웹에만
    const r = await fetch(api(equipment, "runs?limit=10"), { cache: "no-store" }).catch(() => null);
    if (r?.ok) setRuns((await r.json()).runs ?? []);
  }, [equipment, api, local]);

  useEffect(() => {
    if (authLost) return;
    const first = setTimeout(() => {
      void loadHello();
      void loadCommands();
      void loadRuns();
    }, 0);
    const t = setInterval(() => void loadHello(), HELLO_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [authLost, loadHello, loadCommands, loadRuns]);

  // stream — CLOSED 가 되면 간격을 늘려 새로 연다
  useEffect(() => {
    if (authLost) return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let cmdTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let stopped = false;

    const parse = (ev: Event) => {
      try {
        return JSON.parse((ev as MessageEvent).data as string) as Envelope<Record<string, unknown>>;
      } catch {
        return null;
      }
    };
    const fresh = (env: Envelope<Record<string, unknown>> | null): env is Envelope<Record<string, unknown>> => {
      if (!env || seen.current.has(env.id)) return false;
      seen.current.add(env.id);
      if (seen.current.size > 5000) seen.current = new Set([...seen.current].slice(-2000));
      return true;
    };

    const open = () => {
      if (stopped) return;
      const s = new EventSource(local ? api(equipment, "stream") : `${BP}${api(equipment, "stream")}`);
      es = s;
      s.onopen = () => {
        attempt = 0;
        setStreamUp(true);
        void loadHello();
      };
      s.onerror = () => {
        setStreamUp(false);
        if (s.readyState !== EventSource.CLOSED || stopped) return;   // CONNECTING 이면 브라우저가 다시 붙는다
        s.close();
        void loadHello();                                              // 401 이면 authLost 로 멈춘다
        const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];
        attempt += 1;
        retry = setTimeout(open, wait);
      };
      s.addEventListener("state", (ev) => {
        const env = parse(ev) as Envelope<StateData> | null;
        if (env) setState((cur) => (newerState(cur, env) ? env : cur));
      });
      s.addEventListener("hello", (ev) => {
        if (fresh(parse(ev))) void loadHello();
      });
      for (const type of FEED_TYPES) {
        s.addEventListener(type, (ev) => {
          const env = parse(ev);
          if (!fresh(env)) return;
          setFeed((cur) => [...cur, env].slice(-FEED_KEEP));
          if (type === "run_start" || type === "run_end") void loadRuns();
          if (type === "cmd_result") {
            if (cmdTimer) clearTimeout(cmdTimer);
            cmdTimer = setTimeout(() => void loadCommands(), 300);
          }
        });
      }
    };
    open();
    return () => {
      stopped = true;
      es?.close();
      if (retry) clearTimeout(retry);
      if (cmdTimer) clearTimeout(cmdTimer);
    };
  }, [equipment, authLost, loadHello, loadCommands, loadRuns, api, local]);

  /** 명령 보내기 — web: ?wait=10 으로 결과(accepted·rejected·expired)까지 / local: POST 응답 {ok, reason, detail} 이 곧 결과 */
  const send = useCallback(async (kind: string, args: Record<string, unknown>, label?: string): Promise<SendResult> => {
    if (local) {
      try {
        const r = await fetch(api(equipment, "command"), {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: newId(), kind, args }),
        });
        const b = (await r.json().catch(() => ({}))) as { id?: string; ok?: boolean; reason?: string | null; detail?: string; error?: string };
        if (typeof b.ok !== "boolean") return { ok: false, status: r.status, body: { error: b.error ?? `HTTP ${r.status}` } };
        return { ok: true, status: r.status, body: { id: b.id, status: b.ok ? "accepted" : "rejected",
                                                      reasonCode: b.reason ?? undefined, detail: b.detail ?? "" } };
      } catch {
        return { ok: false, status: 0, body: { error: "network" } };
      }
    }
    try {
      const r = await fetch(`${api(equipment, "command")}?wait=10`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newId(), kind, args, label }),
      });
      if (r.status === 401) setAuthLost(true);
      const body = await r.json().catch(() => ({}));
      void loadCommands();
      return { ok: r.ok, status: r.status, body };
    } catch {
      return { ok: false, status: 0, body: { error: "network" } };
    }
  }, [equipment, loadCommands, api, local]);

  // 장비 설정 버전이 바뀌면 묶음(current)을 다시 — 같은 버전은 한 번만
  const cfgVer = state?.data.configVersion;
  const askedVer = useRef<number | null>(null);
  useEffect(() => {
    if (typeof cfgVer !== "number" || !bundle || bundle.deviceConfigVersion === cfgVer || askedVer.current === cfgVer) return;
    askedVer.current = cfgVer;
    void loadSchema();
  }, [cfgVer, bundle, loadSchema]);

  return { hello, bundle, state, feed, commands, runs, streamUp, offsetMs, error, authLost, send, loadSchema };
}
