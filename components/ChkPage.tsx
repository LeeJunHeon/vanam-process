"use client";

import {
  ConnBadge, EventFeed, FlatMetrics, IndicatorBar, MetricGroups, OpsCard,
  ReadOnlyNote, RunHistory, StatusHero, ValveGrid, useOpsStatus,
} from "@/components/ops/OpsKit";

export default function ChkPage() {
  const { data, failed, online, updatedAt } = useOpsStatus("CHK");
  const p = data?.state?.payload ?? {};
  const lastRun = data?.runs?.find((r) => r.status !== "running") ?? null;
  const heater = p.heater;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-gray-900">CHK</h2>
        <span className="ml-auto">
          <ConnBadge online={online} updatedAt={updatedAt} />
        </span>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <IndicatorBar items={p.indicators} />
        </div>
        {heater && (
          <OpsCard title="기판 히터">
            <div className="flex items-end gap-4">
              <div>
                <p className="text-[11px] text-gray-400">현재</p>
                <p className="text-2xl font-bold tabular-nums text-gray-900">
                  {heater.pv?.trim() ? heater.pv : "-"}
                  <span className="ml-1 text-xs font-normal text-gray-400">℃</span>
                </p>
              </div>
              <div className="pb-1">
                <p className="text-[11px] text-gray-400">목표</p>
                <p className="text-sm font-semibold tabular-nums text-gray-600">
                  {heater.sv?.trim() ? `${heater.sv} ℃` : "-"}
                </p>
              </div>
            </div>
            {heater.status && (
              <p
                className={`mt-2 text-xs font-semibold ${
                  ["과온 트립", "센서 이상", "통신 두절", "이상 발생"].includes(heater.status)
                    ? "text-rose-600"
                    : heater.status === "인터락"
                      ? "text-amber-600"
                      : "text-gray-500"
                }`}
              >
                {heater.status}
              </p>
            )}
            {heater.output && <p className="mt-0.5 text-[11px] text-gray-400">{heater.output}</p>}
          </OpsCard>
        )}
      </div>

      <MetricGroups groups={p.groups} />
      {!p.groups?.length && <FlatMetrics metrics={p.metrics} />}

      <ValveGrid items={p.valves} />
      <EventFeed events={data?.events} />
      <RunHistory runs={data?.runs} />
      <ReadOnlyNote />
    </div>
  );
}
