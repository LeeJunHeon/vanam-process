"use client";

// 챔버K v2 장비 화면 데이터 — hello·schema(묶음)·stream(SSE)·commands·runs. 장비 하나에 하나(장비를 바꾸면 key 로 새로).
// stream 은 다시 붙을 때마다 처음 묶음(hello·state·최근 사건)부터 다시 온다 — envelope id 로 거른다.
// hello 의 webSchemaHash 가 바뀌면 schema 를 다시 읽는다. hello(웹 연결·권한)는 10 s 마다도 다시 읽는다.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Bundle, CmdRow, Envelope, EventData, Hello, RunRow, StateData } from "./types";

const BP = process.env.NEXT_PUBLIC_BASE_PATH || "";   // EventSource 는 BasePathFetch 가 고치지 않는다
const FEED_KEEP = 300;
const HELLO_EVERY_MS = 10_000;
const FEED_TYPES = ["event", "run_start", "run_end", "cmd_result", "config_ack"] as const;

export type FeedItem = Envelope<Record<string, unknown>>;
export type FeedEvent = Envelope<EventData>;
export type SendResult = {
  ok: boolean; status: number;
  body: { id?: string; status?: string; reasonCode?: string; detail?: string; error?: string };
};

const api = (eq: string, path: string) => `/api/ops2/${encodeURIComponent(eq)}/v1/${path}`;

/** 명령 id(32 hex) — randomUUID 는 https·localhost 에서만 있으므로 getRandomValues 로 */
function newId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function useChk2(equipment: string) {
  const [hello, setHello] = useState<Hello | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [state, setState] = useState<Envelope<StateData> | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [commands, setCommands] = useState<CmdRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [streamUp, setStreamUp] = useState(false);
  const [offsetMs, setOffsetMs] = useState(0);         // 웹 서버 시계 − 이 브라우저 시계
  const [error, setError] = useState<string | null>(null);
  const schemaHash = useRef<string | null>(null);
  const seen = useRef(new Set<string>());

  const loadSchema = useCallback(async () => {
    const r = await fetch(api(equipment, "schema"), { cache: "no-store" });
    if (r.ok) setBundle(await r.json());
    else if (r.status === 409) setBundle(null);
  }, [equipment]);

  const loadHello = useCallback(async () => {
    const t0 = Date.now();
    const r = await fetch(api(equipment, "hello"), { cache: "no-store" }).catch(() => null);
    const t1 = Date.now();
    if (!r?.ok) {
      setError(!r ? "웹 서버에 닿지 않습니다." : r.status === 404 ? "등록되지 않았거나 꺼진 장비입니다."
        : `장비 정보를 읽지 못했습니다(${r.status}).`);
      return;
    }
    setError(null);
    const h = (await r.json()) as Hello;
    setHello(h);
    if (h.web?.serverNow) setOffsetMs(Date.parse(h.web.serverNow) - (t0 + t1) / 2);
    const hash = h.webSchemaHash ?? null;
    if (hash !== schemaHash.current) {
      schemaHash.current = hash;
      if (hash) await loadSchema();
      else setBundle(null);
    }
  }, [equipment, loadSchema]);

  const loadCommands = useCallback(async () => {
    const r = await fetch(api(equipment, "commands?limit=20"), { cache: "no-store" }).catch(() => null);
    if (r?.ok) setCommands((await r.json()).commands ?? []);
  }, [equipment]);

  const loadRuns = useCallback(async () => {
    const r = await fetch(api(equipment, "runs?limit=10"), { cache: "no-store" }).catch(() => null);
    if (r?.ok) setRuns((await r.json()).runs ?? []);
  }, [equipment]);

  useEffect(() => {
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
  }, [loadHello, loadCommands, loadRuns]);

  // stream
  useEffect(() => {
    const es = new EventSource(`${BP}${api(equipment, "stream")}`);
    let cmdTimer: ReturnType<typeof setTimeout> | null = null;
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

    es.onopen = () => {
      setStreamUp(true);
      void loadHello();
    };
    es.onerror = () => setStreamUp(false);      // EventSource 가 스스로 다시 붙는다

    es.addEventListener("state", (ev) => {
      const env = parse(ev) as Envelope<StateData> | null;
      if (!env) return;
      // 다시 붙을 때 온 옛 state 로 되돌아가지 않게(같은 실행이면 ts 가 늦은 것만)
      setState((cur) => (!cur || cur.instance !== env.instance || env.ts >= cur.ts ? env : cur));
    });
    es.addEventListener("hello", (ev) => {
      if (fresh(parse(ev))) void loadHello();
    });
    for (const type of FEED_TYPES) {
      es.addEventListener(type, (ev) => {
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
    return () => {
      es.close();
      if (cmdTimer) clearTimeout(cmdTimer);
    };
  }, [equipment, loadHello, loadCommands, loadRuns]);

  /** 명령 보내기 — ?wait=10 으로 결과(accepted·rejected·expired)까지 */
  const send = useCallback(async (kind: string, args: Record<string, unknown>, label?: string): Promise<SendResult> => {
    try {
      const r = await fetch(`${api(equipment, "command")}?wait=10`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newId(), kind, args, label }),
      });
      const body = await r.json().catch(() => ({}));
      void loadCommands();
      return { ok: r.ok, status: r.status, body };
    } catch {
      return { ok: false, status: 0, body: { error: "network" } };
    }
  }, [equipment, loadCommands]);

  return { hello, bundle, state, feed, commands, runs, streamUp, offsetMs, error, send };
}
