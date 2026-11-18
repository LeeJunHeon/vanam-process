"use client";

// 챔버12 장비 카드 — 챔버K 의 Chk2Cards 에서 BlockCard 만 옮김(chk2-web 이 Chk2Cards 를 지워 CH12 가 직접 가진다). 값·라벨·단위·자릿수는 묶음 snapshot 정의 그대로. 블록마다 품질 배지(state.links).
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BigValue, Card, FieldValue, QBadge } from "../chk/kit";
import type { BlockDef, Link } from "../chk/types";
import { useChk2Mode } from "../chk/mode";

type Common = { def?: BlockDef; snap?: Record<string, unknown>; link?: Link };

/** 블록 하나 — big 은 위 줄에 크게, 나머지 숫자·문자 필드는 목록, bool 은 점 */
/** 라벨 끝의 PLC 레지스터·코일 주소 '(D119)'·'(D148/D149)'·'(D128×6)'·'(M00401)' — 개발용, '상세'에서만 */
export const plainLabel = (label: string) => label.replace(/\s*\((?:[DM]\d+)[^)]*\)/g, "").trim() || label;

export function BlockCard({ def: def0, snap, link, big = [], foldable, hide = [], children, startOpen = true }: Common & {
  big?: string[]; foldable?: boolean; hide?: string[]; children?: ReactNode; startOpen?: boolean;   // startOpen=false — 처음 접어 둠
}) {
  const [manual, setManual] = useState<boolean | null>(null);   // 누르기 전에는 품질대로(off 면 접음)
  const { detail } = useChk2Mode();
  if (!def0) return null;
  const def = detail ? def0 : { ...def0, fields: def0.fields.map((f) => ({ ...f, label: plainLabel(f.label) })) };
  const off = link?.q === "off";
  const open = manual ?? (startOpen && (!foldable || !off));
  const dimOf = (column: string, own?: boolean) =>
    off || (own && snap?.[`${column}.q`] !== undefined && snap?.[`${column}.q`] !== "ok");
  const bigs = big.map((n) => def.fields.find((f) => f.name === n)).filter((f) => !!f);
  // detail 필드(레지스터·내부 값)는 '상세'에서만, hide 는 카드가 따로 보여 주는 것
  const rest = def.fields.filter((f) => !big.includes(f.name) && (detail || (!f.detail && !hide.includes(f.name))));
  const bools = rest.filter((f) => f.type === "bool");
  const others = rest.filter((f) => f.type !== "bool");

  // 블록 설명(기종·통신·레지스터 범위)은 개발용 — '상세'에서만
  const title = <>{def.label}{detail && def.desc && <span className="text-[12px] font-normal text-[#8A929D]">{def.desc}</span>}</>;
  return (
    <Card
      title={
        foldable ? (
          <button onClick={() => setManual(!open)} className="flex items-center gap-1">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {title}
          </button>
        ) : title
      }
      right={<span className="flex items-center gap-1.5">{foldable && !open && off && <span className="text-[12px] text-[#8A929D]">꺼져 있음 — 접어 둠</span>}<QBadge link={link} /></span>}
    >
      {open && (
        <>
          {bigs.length > 0 && (
            <div className={`grid divide-x divide-gray-100 rounded-[10px] border border-[#E3E6EA]`}
              style={{ gridTemplateColumns: `repeat(${bigs.length}, minmax(0, 1fr))` }}>
              {bigs.map((f) => <BigValue key={f.column} f={f} v={snap?.[f.column]} dim={dimOf(f.column, f.ownQuality)} />)}
            </div>
          )}
          {bools.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {bools.map((f) => <FieldValue key={f.column} f={f} v={snap?.[f.column]} dim={dimOf(f.column, f.ownQuality)} />)}
            </div>
          )}
          {others.length > 0 && (
            <div className="mt-2 grid grid-cols-1 gap-x-5 sm:grid-cols-2">
              {others.map((f) => <FieldValue key={f.column} f={f} v={snap?.[f.column]} dim={dimOf(f.column, f.ownQuality)} />)}
            </div>
          )}
          {children}
        </>
      )}
    </Card>
  );
}
