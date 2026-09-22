"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CommandLog, ConnBadge, EventFeed, HeaterCard, MetricSections,
  IonizerCard, RunHistory, StatusHero, useCommandSender, useOpsStatus, type PendingCmd,
} from "@/components/ops/OpsKit";
import ChkMimic from "@/components/ops/ChkMimic";
import ChkProcessForm from "@/components/ops/ChkProcessForm";
import ChkRecipe from "@/components/ops/ChkRecipe";

const PENDING_TTL = 20_000;

export default function ChkPage() {
  const { data, failed, online, updatedAt, boost, refresh, paused, setPaused, lastFetchMs } =
    useOpsStatus("CHK");
  const [pendingStates, setPendingStates] = useState<Record<string, { want: boolean; at: number }>>({});

  const p = data?.state?.payload ?? {};
  const valves = p.valves;
  // 장비가 보내는 PLC 링크 상태. 키가 없는 구버전은 연결로 본다.
  const plcLink = p.plc_link !== false;

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

  const tgtGroup = p.groups?.find((g) => g.label === "타겟");
  const equipTargets = {
    g1: tgtGroup?.items.find((i) => i.label === "G1")?.value as string | undefined,
    g2: tgtGroup?.items.find((i) => i.label === "G2")?.value as string | undefined,
  };

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

      {(failed || msg) && (
        <p className="rounded-2xl border border-gray-100 bg-white p-3 text-xs text-gray-600">
          {failed ? "상태를 불러오지 못했습니다. 로그인 상태를 확인해 주세요." : msg}
        </p>
      )}

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
