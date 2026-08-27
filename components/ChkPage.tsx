"use client";

import {
  CommandLog, ConnBadge, EventFeed, HeaterCard, MetricSections,
  RunHistory, StatusHero, useCommandSender, useOpsStatus,
} from "@/components/ops/OpsKit";
import ChkMimic from "@/components/ops/ChkMimic";
import ChkProcessForm from "@/components/ops/ChkProcessForm";

export default function ChkPage() {
  const { data, failed, online, updatedAt } = useOpsStatus("CHK");
  const { request, dialog, msg } = useCommandSender("CHK");
  const p = data?.state?.payload ?? {};
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
          valves={p.valves}
          heater={p.heater}
          online={online}
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
