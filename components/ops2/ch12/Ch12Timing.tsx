"use client";

// 챔버12 장비 응답 시간(진단) — 장비가 state.deviceTiming 으로 보내는 '가장 최근 1분 집계'(보냄 → 응답 끝, 장비별 개수·p95·최대·시간 초과).
// 명령별 자세한 값은 장비의 data/device_timing/timing_YYYYMMDD.csv. 집계 전이거나 기록을 끈 장비는 칸이 없다(자리 표시만).
import { Card } from "../chk/kit";
import type { Ch12State } from "./types";

export type DeviceTimingRow = { device: string; count: number; timeouts: number; p95Ms: number | null; maxMs: number | null; worstCmd: string | null };
export type DeviceTiming = { at?: string | null; intervalS?: number; devices?: DeviceTimingRow[] } | null | undefined;

const ms = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(v >= 100 ? 0 : 1)} ms`);

export default function Ch12Timing({ st }: { st: Ch12State | null }) {
  const t = (st as unknown as { deviceTiming?: DeviceTiming } | null)?.deviceTiming;
  const rows = t?.devices ?? [];
  return (
    <Card title="장비 응답 시간" right={<span className="text-[11px] text-gray-400">{t?.at ? `최근 집계 ${t.at}` : "집계 전"}</span>} tight>
      {rows.length === 0 ? (
        <p className="text-[12px] text-gray-400">아직 집계가 없습니다(기록 주기마다 갱신 — 설정 &gt; 감시 프로그램·진단).</p>
      ) : (
        <table className="w-full text-left text-[12px]">
          <thead className="text-gray-500">
            <tr><th className="py-1 pr-2 font-medium">장비</th><th className="pr-2 font-medium">횟수</th><th className="pr-2 font-medium">p95</th>
              <th className="pr-2 font-medium">최대</th><th className="font-medium">시간 초과</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.device} className="border-t border-[#EEF0F3]">
                <td className="py-1 pr-2 font-mono">{r.device}</td>
                <td className="pr-2 tabular-nums">{r.count}</td>
                <td className="pr-2 tabular-nums" title={r.worstCmd ? `가장 느린 명령 ${r.worstCmd}` : undefined}>{ms(r.p95Ms)}</td>
                <td className="pr-2 tabular-nums">{ms(r.maxMs)}</td>
                <td className={`tabular-nums ${r.timeouts > 0 ? "font-bold text-red-600" : ""}`}>{r.timeouts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
