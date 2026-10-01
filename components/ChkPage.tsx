"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CommandLog, ConnBadge, EventFeed, HeaterCard, MetricSections,
  IonizerCard, RunHistory, StatusHero, useCommandSender, useOpsStatus, type PendingCmd,
} from "@/components/ops/OpsKit";
import ChkMimic from "@/components/ops/ChkMimic";
import ChkProcessForm from "@/components/ops/ChkProcessForm";
import ChkRecipe from "@/components/ops/ChkRecipe";
import { fmtLogTime, type OpsNotice } from "@/lib/ops";

const PENDING_TTL = 20_000;
const TRACK_TTL = 45_000;   // 이 시간이 지나도 결과가 없으면 "응답 없음" 으로 끝낸다

/** 이 화면에서 보낸 명령. 알림은 내가 보낸 명령에 대해서만 띄운다. */
type Tracked = { id: number; label: string; stateKey?: string; at: number };
type Notice = {
  id: number;
  kind: "done" | "failed" | "expired" | "timeout";
  text: string;
  at: number;
};

const NOTICE_TONE: Record<string, string> = {
  error: "border-rose-200 bg-rose-50 text-rose-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-gray-100 bg-white text-gray-600",
};
const NOTICE_MAX = 5;

/** 장비가 보낸 자동 알림. [확인] 하면 모든 사람 화면에서 사라진다. */
function NoticeBanner({ notices, onAcked }: { notices: OpsNotice[]; onAcked: () => void }) {
  const [hidden, setHidden] = useState<number[]>([]);
  const list = notices.filter((n) => !hidden.includes(n.id));
  if (!list.length) return null;

  const ack = async (ids: number[]) => {
    setHidden((s) => [...s, ...ids]);   // 먼저 숨기고
    try {
      await fetch("/api/ops/notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      /* 실패해도 다음 조회에서 다시 나타난다 */
    }
    onAcked();                           // 전체 조회
  };

  const shown = list.slice(0, NOTICE_MAX);
  const rest = list.length - shown.length;

  return (
    <div className="space-y-2">
      {list.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={() => ack(list.map((n) => n.id))}
            title="확인하면 모든 사람 화면에서 사라지고 확인한 사람이 기록됩니다"
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
          >
            모두 확인 ({list.length})
          </button>
        </div>
      )}
      {shown.map((n) => (
        <div
          key={n.id}
          className={`flex items-start gap-3 rounded-2xl border p-3 text-xs ${
            NOTICE_TONE[n.level] ?? NOTICE_TONE.info
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[10px] opacity-70">
              <span className="font-mono">{fmtLogTime(n.ts)}</span>
              {n.origin && <span>{n.origin === "erp" ? "ERP에서 시작" : "노트북에서 시작"}</span>}
              {n.source && <span>{n.source === "heater" ? "히터" : "공정"}</span>}
            </p>
            <p className="mt-0.5 font-bold">{n.title}</p>
            <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{n.message}</p>
          </div>
          <button
            onClick={() => ack([n.id])}
            title="확인하면 모든 사람 화면에서 사라지고 확인한 사람이 기록됩니다"
            className="shrink-0 rounded-lg border border-current/30 px-2.5 py-1 text-[11px] font-semibold opacity-80 hover:opacity-100"
          >
            확인
          </button>
        </div>
      ))}
      {rest > 0 && <p className="text-right text-[11px] text-gray-400">외 {rest}건</p>}
    </div>
  );
}

export default function ChkPage() {
  const [tracked, setTracked] = useState<Tracked[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const trackIds = useMemo(() => tracked.map((t) => t.id), [tracked]);
  const { data, failed, online, updatedAt, boost, refresh, paused, setPaused, lastFetchMs } =
    useOpsStatus("CHK", trackIds);
  const [pendingStates, setPendingStates] = useState<Record<string, { want: boolean; at: number }>>({});

  const p = data?.state?.payload ?? {};
  const valves = p.valves;
  // 장비가 보내는 PLC 링크 상태. 키가 없는 구버전은 연결로 본다.
  const plcLink = p.plc_link !== false;

  const handleSent = useCallback((c: PendingCmd, id?: number) => {
    if (c.stateKey && typeof c.args?.on === "boolean") {
      const key = c.stateKey;
      const want = c.args.on as boolean;
      setPendingStates((s) => ({ ...s, [key]: { want, at: Date.now() } }));
    }
    if (typeof id === "number") {
      setTracked((s) => [{ id, label: c.label, stateKey: c.stateKey, at: Date.now() }, ...s].slice(0, 10));
    }
    boost(); // 명령 직후 고속 조회로 전환
  }, [boost]);

  const { request, dialog, msg } = useCommandSender("CHK", handleSent);

  // 추적 중인 명령의 결과를 알림으로 만든다. 폴링 응답(tracked)에 실려 오므로
  // 별도 요청을 만들지 않는다. 45초가 지나도 끝나지 않으면 "응답 없음" 으로 닫는다.
  useEffect(() => {
    if (!tracked.length) return;
    const rows = new Map((data?.tracked ?? []).map((c) => [c.id, c]));
    const now = Date.now();
    const finished: number[] = [];
    const clearKeys: string[] = [];
    const made: Notice[] = [];

    for (const t of tracked) {
      const row = rows.get(t.id);
      const st = row?.status;
      if (st === "done") {
        finished.push(t.id);
        made.push({ id: t.id, kind: "done", text: `${t.label} 완료`, at: now });
      } else if (st === "failed") {
        finished.push(t.id);
        if (t.stateKey) clearKeys.push(t.stateKey);
        made.push({ id: t.id, kind: "failed", text: `${t.label} 실패 — ${row?.result || "사유가 전달되지 않았습니다"}`, at: now });
      } else if (st === "expired") {
        finished.push(t.id);
        if (t.stateKey) clearKeys.push(t.stateKey);
        made.push({ id: t.id, kind: "expired", text: `${t.label} 만료 — ${row?.result || "장비가 제시간에 명령을 가져가지 않았습니다"}`, at: now });
      } else if (now - t.at > TRACK_TTL) {
        finished.push(t.id);
        if (t.stateKey) clearKeys.push(t.stateKey);
        made.push({ id: t.id, kind: "timeout", text: `${t.label} 응답 없음 — 장비 상태를 확인하세요`, at: now });
      }
    }
    if (!finished.length) return;

    setTracked((s) => s.filter((t) => !finished.includes(t.id)));
    if (clearKeys.length) {
      setPendingStates((s) => {
        const next = { ...s };
        for (const k of clearKeys) delete next[k];
        return next;
      });
    }
    setNotices((prev) => [...made, ...prev.filter((n) => !finished.includes(n.id))].slice(0, 3));
    refresh(); // 조작 기록을 바로 갱신한다(다음 조회를 전체 조회로)
  }, [data, lastFetchMs, tracked, refresh]);

  // 완료 알림만 5초 뒤 자동으로 사라진다
  useEffect(() => {
    if (!notices.some((n) => n.kind === "done")) return;
    const t = setTimeout(() => {
      setNotices((prev) => prev.filter((n) => n.kind !== "done" || Date.now() - n.at < 5_000));
    }, 5_200);
    return () => clearTimeout(t);
  }, [notices]);

  // 실제 상태가 목표에 도달했거나 시간이 지나면 "전환 중" 표시를 해제한다
  useEffect(() => {
    setPendingStates((s) => {
      const next: typeof s = {};
      let changed = false;
      for (const [k, val] of Object.entries(s)) {
        const reached = Boolean(valves?.[k]) === val.want;
        const stale = Date.now() - val.at > PENDING_TTL;
        if (reached || stale) changed = true;
        else next[k] = val;
      }
      return changed ? next : s;
    });
  }, [valves, updatedAt]);

  const pendingFlat = Object.fromEntries(
    Object.entries(pendingStates).map(([k, val]) => [k, val.want]),
  );

  const tgtGroup = p.groups?.find((g) => g.label === "타겟");
  const equipTargets = {
    g1: tgtGroup?.items.find((i) => i.label === "G1")?.value as string | undefined,
    g2: tgtGroup?.items.find((i) => i.label === "G2")?.value as string | undefined,
  };

  // RF 그룹의 "offset / param" 항목("6.79 / 1.0395")을 나눈다. 형식이 다르면 빈칸.
  const rfCal = p.groups
    ?.find((g) => g.label === "RF")
    ?.items.find((i) => i.label === "offset / param")?.value;
  const calParts = typeof rfCal === "string" ? rfCal.split("/").map((s) => s.trim()) : [];
  const isNum = (s?: string) => !!s && Number.isFinite(Number(s));
  const equipCal =
    calParts.length === 2 && isNum(calParts[0]) && isNum(calParts[1])
      ? { offset: calParts[0], param: calParts[1] }
      : { offset: "", param: "" };

  const lastRun = data?.runs?.find((r) => r.status !== "running") ?? null;
  const running = online && (p.status === "running" || !!data?.run);

  return (
    <div className="space-y-3 p-3 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-gray-900">CHK</h2>
        <ConnBadge
          online={online}
          updatedAt={updatedAt}
          lastFetchMs={lastFetchMs}
          paused={paused}
          onToggle={setPaused}
          onRefresh={refresh}
        />
      </div>

      <NoticeBanner notices={data?.notices ?? []} onAcked={refresh} />

      {(failed || msg) && (
        <p className="rounded-2xl border border-gray-100 bg-white p-3 text-xs text-gray-600">
          {failed ? "상태를 불러오지 못했습니다. 로그인 상태를 확인해 주세요." : msg}
        </p>
      )}

      {notices.map((n) => (
        <div
          key={n.id}
          className={`flex items-start gap-2 rounded-2xl border p-3 text-xs ${
            n.kind === "failed"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : n.kind === "done"
                ? "border-gray-100 bg-white text-gray-600"
                : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          <span className="min-w-0 flex-1 leading-relaxed">{n.text}</span>
          <button
            onClick={() => setNotices((prev) => prev.filter((x) => x.id !== n.id))}
            aria-label="알림 닫기"
            className="shrink-0 rounded px-1 text-sm font-bold opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}

      {online && !plcLink && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
          <p className="font-bold">PLC 연결 끊김</p>
          <p className="mt-0.5 text-[11px] leading-relaxed">
            밸브·펌프·램프·히터 표시는 마지막 수신값이며, PLC 조작이 잠겼습니다.
            ALL STOP 과 공정 정지는 사용할 수 있습니다.
          </p>
        </div>
      )}

      <StatusHero
        online={online}
        status={p.status}
        stage={p.stage}
        runStartedAt={data?.run?.startedAt}
        runName={data?.run?.processName ?? p.process?.name}
        process={p.process}
        lastRun={lastRun}
      />

      <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-2">
        <ChkMimic
          indicators={p.indicators}
          valves={valves}
          online={online}
          pendingStates={pendingFlat}
          onRequest={request}
          plcLink={plcLink}
        />
        <div className="flex flex-col gap-3">
          <HeaterCard
            heater={p.heater}
            progress={p.heaterRecipe}
            online={online}
            running={running}
            onRequest={request}
            plcLink={plcLink}
          />
          <IonizerCard
            ion={p.ion}
            on={Boolean(p.valves?.ION)}
            online={online}
            onRequest={request}
            plcLink={plcLink}
          />
          <div className="flex-1">
            <MetricSections groups={p.groups} />
          </div>
        </div>
      </div>

      <ChkProcessForm
        online={online}
        running={running}
        csvProgress={p.csvRecipe}
        equipTargets={equipTargets}
        equipCal={equipCal}
        onRequest={request}
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:items-stretch">
        <div className="space-y-3">
          <EventFeed events={data?.events} equipment="CHK" />
          <RunHistory runs={data?.runs} />
          <CommandLog commands={data?.commands} />
        </div>
        {/* xl 이상: 절대 배치로 행 높이에 기여하지 않게 하고 좌측 높이를 그대로 채운다 */}
        <div className="relative xl:min-h-[640px]">
          <div className="xl:absolute xl:inset-0">
            <ChkRecipe />
          </div>
        </div>
      </div>

      {dialog}
    </div>
  );
}
