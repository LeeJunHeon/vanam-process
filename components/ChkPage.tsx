"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CommandLog, ConnBadge, EventFeed, HeaterCard, MetricSections,
  RunHistory, StatusHero, useCommandSender, useOpsStatus, type PendingCmd,
} from "@/components/ops/OpsKit";
import ChkMimic from "@/components/ops/ChkMimic";
import ChkProcessForm from "@/components/ops/ChkProcessForm";

const PENDING_TTL = 20_000;

export default function ChkPage() {
  const { data, failed, online, updatedAt, boost } = useOpsStatus("CHK");
  const [pendingStates, setPendingStates] = useState<Record<string, { want: boolean; at: number }>>({});

  const p = data?.state?.payload ?? {};
  const valves = p.valves;

  const handleSent = useCallback((c: PendingCmd) => {
    if (c.stateKey && typeof c.args?.on === "boolean") {
      const key = c.stateKey;
      const want = c.args.on as boolean;
      setPendingStates((s) => ({ ...s, [key]: { want, at: Date.now() } }));
    }
    boost(); // 명령 직후 고속 조회로 전환
  }, [boost]);

  const { request, dialog, msg } = useCommandSender("CHK", handleSent);

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

  const lastRun = data?.runs?.find((r) => r.status !== "running") ?? null;
  const running = online && (p.status === "running" || !!data?.run);

  return (
    <div className="space-y-3 p-3 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-gray-900">CHK</h2>
        <ConnBadge online={online} updatedAt={updatedAt} />
      </div>

      {(failed || msg) && (
        <p className="rounded-2xl border border-gray-100 bg-white p-3 text-xs text-gray-600">
          {failed ? "상태를 불러오지 못했습니다. 로그인 상태를 확인해 주세요." : msg}
        </p>
      )}

      <StatusHero
        online={online}
        status={p.status}
        stage={p.stage}
        runStartedAt={data?.run?.startedAt}
        runName={data?.run?.processName ?? p.process?.name}
        totalSec={p.process?.totalSec}
        lastRun={lastRun}
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ChkMimic
          indicators={p.indicators}
          valves={valves}
          heater={p.heater}
          online={online}
          pendingStates={pendingFlat}
          onRequest={request}
        />
        <div className="space-y-3">
          <HeaterCard heater={p.heater} />
          <MetricSections groups={p.groups} />
        </div>
      </div>

      <ChkProcessForm online={online} running={running} onRequest={request} />

      <EventFeed events={data?.events} />
      <RunHistory runs={data?.runs} />
      <CommandLog commands={data?.commands} />

      {dialog}
    </div>
  );
}
