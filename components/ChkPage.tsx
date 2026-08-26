"use client";

import {
  ConnBadge, EventFeed, FlatMetrics, HeaterCard, MetricSections,
  ReadOnlyNote, RunHistory, StatusHero, useOpsStatus,
} from "@/components/ops/OpsKit";
import ChkMimic from "@/components/ops/ChkMimic";

export default function ChkPage() {
  const { data, failed, online, updatedAt } = useOpsStatus("CHK");
  const p = data?.state?.payload ?? {};
  const lastRun = data?.runs?.find((r) => r.status !== "running") ?? null;

  return (
    <div className="space-y-3 p-3 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-gray-900">CHK</h2>
        <ConnBadge online={online} updatedAt={updatedAt} />
      </div>

      {failed && (
        <p className="rounded-2xl border border-gray-100 bg-white p-3 text-xs text-gray-500">
          상태를 불러오지 못했습니다. 로그인 상태를 확인해 주세요.
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

      <div className="grid grid-cols-1 gap-3 @container xl:grid-cols-2">
        <ChkMimic indicators={p.indicators} valves={p.valves} heater={p.heater} />
        <div className="space-y-3">
          <HeaterCard heater={p.heater} />
          <MetricSections groups={p.groups} />
          {!p.groups?.length && <FlatMetrics metrics={p.metrics} />}
        </div>
      </div>

      <EventFeed events={data?.events} />
      <RunHistory runs={data?.runs} />
      <ReadOnlyNote />
    </div>
  );
}
