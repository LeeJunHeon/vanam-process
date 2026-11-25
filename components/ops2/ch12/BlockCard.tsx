"use client";

// 챔버12 장비 카드 — 챔버K 의 Chk2Cards 에서 BlockCard 만 옮김(chk2-web 이 Chk2Cards 를 지워 CH12 가 직접 가진다). 값·라벨·단위·자릿수는 묶음 snapshot 정의 그대로. 블록마다 품질 배지(state.links).
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BigValue, Card, FieldValue, QBadge } from "../chk/kit";
import { StateTag, type StateWords } from "../chk/StateTag";
import type { BlockDef, Link } from "../chk/types";
import { useChk2Mode } from "../chk/mode";
import { dropPrefix, fieldTip, toTerms12 } from "@/lib/ops2/ch12/terms";

type Common = { def?: BlockDef; snap?: Record<string, unknown>; link?: Link };

/** 켜짐·꺼짐 / 열림·닫힘 / 감지·없음 — 필드 이름으로(밸브·셔터 = 열림/닫힘, 센서 = 감지/없음, 나머지 켜짐/꺼짐) */
export const words12 = (name: string): StateWords =>
  /valve|shutter|_gas_sw$|^(m|r|f)_v_|vent/.test(name) ? "open" : /sensor|water_ok|atm|_detect/.test(name) ? "detect" : "onoff";
/** 켜지면 이상인 상태(인터락 열림·이상·과온·센서 이상·워치독 이상) — 켜짐 배지를 주의색으로 */
export const alert12 = (name: string) => /itl_open|fault|^ot$|_err$|_alarm$/.test(name);

/** 블록 하나 — big 은 위 줄에 크게, 나머지 숫자·문자 필드는 목록, bool 은 이름 + 상태 배지(StateTag — 체크박스 모양 네모 없이) */
/** 라벨 끝의 PLC 레지스터·코일 주소 '(D119)'·'(D148/D149)'·'(D128×6)'·'(M00401)' — 개발용, '상세'에서만 */
export const plainLabel = (label: string) => label.replace(/\s*\((?:[DM]\d+)[^)]*\)/g, "").trim() || label;

export function BlockCard({ def: def0, snap, link, big = [], foldable, hide = [], children, startOpen = true, strip }: Common & {
  big?: string[]; foldable?: boolean; hide?: string[]; children?: ReactNode; startOpen?: boolean;   // startOpen=false — 처음 접어 둠
  strip?: string | null;          // 둘레 칸 제목(CH1·Plasma Cleaning·Loadlock) — 블록·필드 이름에서 같은 앞말을 뺀다(W-19)
}) {
  const [manual, setManual] = useState<boolean | null>(null);   // 누르기 전에는 품질대로(off 면 접음)
  const { detail } = useChk2Mode();
  if (!def0) return null;
  // 마우스 설명(W-19 ③): kit FieldValue 는 title 을 desc(+상세 보기면 열 이름)로 그린다 — 평소 보기는 help 를 desc 자리에 넣어 넘긴다
  //   (챔버12 desc 에는 레지스터·코일 이름이 있어 상세 보기에서만)
  const def = detail ? { ...def0, label: dropPrefix(def0.label, strip) }
    : { ...def0, label: dropPrefix(toTerms12(def0.label), strip),
        fields: def0.fields.map((f) => ({ ...f, label: dropPrefix(toTerms12(plainLabel(f.label)), strip), desc: fieldTip(f, false) ?? "" })) };
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
      right={<span className="flex items-center gap-1.5">{foldable && !open && off && <span className="text-[12px] text-[#8A929D]">꺼져 있어 접어 둠</span>}<QBadge link={link} /></span>}
    >
      {open && (
        <div className="@container">
          {bigs.length > 0 && (
            // 큰 값 칸은 좁으면 줄을 바꾼다(값·단위가 겹치지 않게 — 한 칸 최소 9rem)
            <div className="grid rounded-[10px] border border-[#E3E6EA]"
              style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(9rem, 100%), 1fr))` }}>
              {bigs.map((f) => <div key={f.column} className="min-w-0" title={fieldTip(def0.fields.find((x) => x.column === f.column), detail)}>
                <BigValue f={f} v={snap?.[f.column]} dim={dimOf(f.column, f.ownQuality)} /></div>)}
            </div>
          )}
          {bools.length > 0 && (
            <div className="mt-2 grid grid-cols-1 gap-x-5 gap-y-1 @[440px]:grid-cols-2">
              {bools.map((f) => (
                <StateTag key={f.column} on={dimOf(f.column, f.ownQuality) ? null : snap?.[f.column] === true} label={f.label}
                  words={words12(f.name)} alert={alert12(f.name)} title={fieldTip(def0.fields.find((x) => x.column === f.column), detail)} />
              ))}
            </div>
          )}
          {others.length > 0 && (
            <div className="mt-2 grid grid-cols-1 gap-x-5 @[440px]:grid-cols-2">
              {others.map((f) => <FieldValue key={f.column} f={f} v={snap?.[f.column]} dim={dimOf(f.column, f.ownQuality)} />)}
            </div>
          )}
          {children}
        </div>
      )}
    </Card>
  );
}
