"use client";

// 챔버12 장비 카드 — 챔버K 의 Chk2Cards 에서 BlockCard 만 옮김(chk2-web 이 Chk2Cards 를 지워 CH12 가 직접 가진다). 값·라벨·단위·자릿수는 묶음 snapshot 정의 그대로. 블록마다 품질 배지(state.links).
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BigValue, Card, FieldValue, QBadge } from "../chk/kit";
import type { BlockDef, Link } from "../chk/types";
import { useChk2Mode } from "../chk/mode";

type Common = { def?: BlockDef; snap?: Record<string, unknown>; link?: Link };

/** 블록 하나 — big 은 위 줄에 크게, 나머지 숫자·문자 필드는 목록, bool 은 점 */
export function BlockCard({ def, snap, link, big = [], foldable, hide = [], children }: Common & {
  big?: string[]; foldable?: boolean; hide?: string[]; children?: ReactNode;
}) {
  const [manual, setManual] = useState<boolean | null>(null);   // 누르기 전에는 품질대로(off 면 접음)
  const { detail } = useChk2Mode();
  if (!def) return null;
  const off = link?.q === "off";
  const open = manual ?? (!foldable || !off);
  const dimOf = (column: string, own?: boolean) =>
    off || (own && snap?.[`${column}.q`] !== undefined && snap?.[`${column}.q`] !== "ok");
  const bigs = big.map((n) => def.fields.find((f) => f.name === n)).filter((f) => !!f);
  // detail 필드(레지스터·내부 값)는 '상세'에서만, hide 는 카드가 따로 보여 주는 것
  const rest = def.fields.filter((f) => !big.includes(f.name) && (detail || (!f.detail && !hide.includes(f.name))));
  const bools = rest.filter((f) => f.type === "bool");
  const others = rest.filter((f) => f.type !== "bool");

  const title = <>{def.label}{def.desc && <span className="text-[11px] font-normal text-gray-400">{def.desc}</span>}</>;
  return (
    <Card
      title={
        foldable ? (
          <button onClick={() => setManual(!open)} className="flex items-center gap-1">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {title}
          </button>
        ) : title
      }
      right={<span className="flex items-center gap-1.5">{foldable && !open && off && <span className="text-[10px] text-gray-400">꺼져 있음 — 접어 둠</span>}<QBadge link={link} /></span>}
    >
      {open && (
        <>
          {bigs.length > 0 && (
            <div className={`grid divide-x divide-gray-100 rounded-xl border border-gray-100`}
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
