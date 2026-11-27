"use client";

// 챔버K v2 장비 화면 공통 조각(W-10 — ISA-101 고성능 HMI: 정상은 회색, 색은 이상할 때만).
// 바탕 #EEF0F3 · 카드 흰색 테두리 #D9DDE3 모서리 12px · 안쪽 칸 테두리 #E3E6EA 모서리 10px · 글 #1B1F24 · 보조 #5B6470 ·
// 실시간 값 남색 #133A7C(굵게·tabular-nums·단위는 보조색 작게) · 주 버튼·선택 #1D4ED8 / 선택 배경 #E8EEFC ·
// 장비 상태 켜짐 = 진회색 #3A424D 채운 네모, 꺼짐 = 회색 #8A929D 테두리 네모(초록·빨강을 쓰지 않는다) ·
// 이상만 색: 주의 #B54708 / #FFFAEB, 알람·오류 #B42318 / #FEE4E2 — 늘 아이콘 + 글자 · 정보 띠 #EEF3FF / #C7D5FB / #1D4ED8.
// 잠긴 버튼은 자물쇠 + 마우스를 올리면 이유(권한·bench·끊김·PLC 오래됨 — 이유 문구만 다름).
// 도움말(W-14): 조각들은 지금처럼 title(·data-tip)을 달고, 화면 하나에 TipLayer 를 두면 마우스를 올리거나 키보드로 고를 때
//   같은 모양의 도움말 상자로 보인다(대상을 가리지 않게 아래·위, 긴 글은 줄바꿈). 브라우저 기본 title 말풍선은 그동안 숨긴다.
// 이 파일만 토큰을 안다 — CHK v2 화면 전체가 같은 조각을 쓴다(전역 CSS 는 건드리지 않는다).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertOctagon, AlertTriangle, CheckCircle2, Clock, HelpCircle, Info, Lock, MinusCircle, PlayCircle, X, type LucideIcon,
} from "lucide-react";
import { Q_LABEL, fmtValue, type FieldDef, type Link } from "./types";
import { useChk2Mode } from "./mode";
import { fieldText } from "./text";

/** 색 토큰(SVG·style 용) — 클래스에서는 같은 값을 그대로 적는다 */
export const T = {
  bg: "#EEF0F3", border: "#D9DDE3", sub: "#E3E6EA", text: "#1B1F24", muted: "#5B6470", value: "#133A7C",
  primary: "#1D4ED8", selBg: "#E8EEFC", on: "#3A424D", off: "#8A929D", pipe: "#C9CED6",
  warn: "#B54708", warnBg: "#FFFAEB", alarm: "#B42318", alarmBg: "#FEE4E2", infoBg: "#EEF3FF", infoBorder: "#C7D5FB",
} as const;

/** 글자 크기 체계(W-10b) — CHK v2 모든 탭·상태 띠·확인창·작은 창이 이것만 쓴다(1920·1280 같은 값, 12px 미만 없음).
 *  title 화면 제목·상태 띠 공정 상태 22px · card 카드 제목 15px · big 큰 실시간 값 28px(남색 — 숫자에만) · unit 큰 값 단위 13px ·
 *  body 본문·줄 라벨·줄 값 14px · small 보조 설명·시각·작은 칩 12px. 굵기·색은 쓰는 쪽(값은 600 남색). */
export const FS = {
  title: "text-[22px] leading-[28px]",
  card: "text-[15px] leading-[22px]",
  big: "text-[28px] leading-[34px] tabular-nums",
  unit: "text-[13px]",
  body: "text-[14px]",
  small: "text-[12px]",
} as const;
/** 같은 체계의 px(SVG fontSize) */
export const FSPX = { title: 22, card: 15, big: 28, unit: 13, body: 14, small: 12 } as const;

export function Card({
  title, right, children, className = "", tight,
}: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; tight?: boolean }) {
  return (
    <section className={`min-w-0 rounded-[12px] border border-[#D9DDE3] bg-white ${tight ? "p-3" : "p-4 sm:p-5"} ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h3 className={`flex min-w-0 items-center gap-1.5 font-bold text-[#1B1F24] ${FS.card}`}>{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** 카드 안 작은 칸 */
export function Tile({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-[10px] border border-[#E3E6EA] ${className}`}>{children}</div>;
}

export type Tone = "neutral" | "dark" | "warn" | "alarm" | "info" | "primary";
const CHIP: Record<Tone, string> = {
  neutral: "border-[#D9DDE3] bg-white text-[#5B6470]",
  dark: "border-[#3A424D] bg-[#3A424D] text-white",
  warn: "border-[#F5D9A8] bg-[#FFFAEB] text-[#B54708]",
  alarm: "border-[#F7C1BB] bg-[#FEE4E2] text-[#B42318]",
  info: "border-[#C7D5FB] bg-[#EEF3FF] text-[#1D4ED8]",
  primary: "border-[#1D4ED8] bg-[#1D4ED8] text-white",
};
/** 칩 — 주의·알람은 아이콘을 늘 같이(색만으로 구분하지 않는다) */
export function Chip({ tone = "neutral", icon, title, children, className = "" }: {
  tone?: Tone; icon?: ReactNode; title?: string; children: ReactNode; className?: string;
}) {
  const ic = icon ?? (tone === "warn" ? <AlertTriangle size={12} /> : tone === "alarm" ? <AlertOctagon size={12} /> : null);
  return (
    <span title={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 font-semibold leading-tight ${FS.small} ${CHIP[tone]} ${className}`}>
      {ic}{children}
    </span>
  );
}

/** 상태 배지(설정·기록, W-10a) — 늘 아이콘 + 글자. 색만으로 뜻을 전하지 않는다(kind 가 색과 기본 아이콘을 같이 정함) */
export type TagKind = "ok" | "alarm" | "alarmSolid" | "warn" | "wait" | "info" | "lock" | "run" | "muted" | "unknown";
const TAG: Record<TagKind, [string, LucideIcon]> = {
  ok: ["bg-[#EEF0F3] text-[#3A424D]", CheckCircle2],
  alarm: ["bg-[#FEE4E2] text-[#B42318]", AlertOctagon],
  alarmSolid: ["bg-[#B42318] text-white", AlertOctagon],
  warn: ["bg-[#FFFAEB] text-[#B54708]", AlertTriangle],
  wait: ["bg-[#FFFAEB] text-[#B54708]", Clock],
  info: ["bg-[#EEF3FF] text-[#1D4ED8]", Info],
  lock: ["bg-[#EEF0F3] text-[#5B6470]", Lock],
  run: ["bg-[#3A424D] text-white", PlayCircle],
  muted: ["bg-[#F5F6F8] text-[#5B6470]", MinusCircle],
  unknown: ["bg-[#EEF0F3] text-[#5B6470]", HelpCircle],
};
export function Tag({ kind, icon: Icon, title, children, className = "" }: {
  kind: TagKind; icon?: LucideIcon; title?: string; children: ReactNode; className?: string;
}) {
  const [cls, Def] = TAG[kind];
  const I = Icon ?? Def;
  return (
    <span title={title} className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1.5 py-px font-semibold leading-tight ${FS.small} ${cls} ${className}`}>
      <I size={12} className="shrink-0" aria-hidden />{children}
    </span>
  );
}

/** 오류 글 — 아이콘 + 빨간 글(색만으로 오류를 알리지 않는다) */
export function ErrText({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-start gap-1 text-[#B42318] ${className}`}>
      <AlertOctagon size={12} className="mt-px shrink-0" aria-label="오류" />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/** 장비 상태 — 켜짐·열림 = 진회색 채운 네모, 꺼짐·닫힘 = 회색 테두리 네모 + 글자. 모르면(값 없음) 점선 */
export function StateBox({ on, label, title, unknown }: { on: boolean | null | undefined; label: ReactNode; title?: string; unknown?: boolean }) {
  const u = unknown || on === null || on === undefined;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${FS.body}`} title={title}>
      <span className={`inline-block h-3 w-3 shrink-0 rounded-[2px] border ${
        u ? "border-dashed border-[#8A929D] bg-white" : on ? "border-[#3A424D] bg-[#3A424D]" : "border-[#8A929D] bg-white"}`} />
      <span className={`truncate ${on && !u ? "font-semibold text-[#1B1F24]" : "text-[#5B6470]"}`}>{label}</span>
    </span>
  );
}

/** 실시간 값 — 남색(줄 값 14px/600, 큰 값 28px/700 + 단위 13px), 단위는 보조색(늘 붙임).
 *  값이 없으면 같은 글꼴로 "—", 또는 상태 이름(alt) — altWarn(연결 안 됨·영점 안 됨·음수·형식 오류)일 때만 주의색 + 아이콘,
 *  나머지 상태(하한 아래·꺼짐 등 대기 때 정상)는 기본색 글자만 */
export function Val({ text, unit, size = "row", dim, alt, altWarn }: {
  text: string; unit?: string; size?: "row" | "big"; dim?: boolean; alt?: string | null; altWarn?: boolean;
}) {
  const big = size === "big";
  const cls = big ? `${FS.big} font-bold` : `${FS.body} font-semibold tabular-nums`;
  if (!text) {
    if (alt) {
      return altWarn
        ? <span className={`inline-flex items-center gap-1 font-semibold text-[#B54708] ${FS.body}`}><AlertTriangle size={14} />{alt}</span>
        : <span className={`whitespace-nowrap font-semibold text-[#1B1F24] ${big ? `${FS.card} leading-[34px]` : FS.body}`}>{alt}</span>;
    }
    return <span className={`${cls} text-[#8A929D]`}>—</span>;
  }
  return (
    <span className={`whitespace-nowrap ${cls} ${dim ? "text-[#8A929D]" : "text-[#133A7C]"}`}>
      {text}{unit && <span className={`ml-1 font-normal text-[#5B6470] ${big ? FS.unit : FS.small}`}>{unit}</span>}
    </span>
  );
}

/** 라벨 — 값 한 줄(라벨 왼쪽 보조색, 값 오른쪽) */
export function KV({ k, children, title }: { k: ReactNode; children: ReactNode; title?: string }) {
  return (
    <div className={`flex min-h-[26px] min-w-0 items-baseline justify-between gap-2 py-0.5 ${FS.body}`} title={title}>
      <span className="shrink-0 truncate text-[#5B6470]">{k}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}

export type BtnKind = "neutral" | "primary" | "danger" | "dangerSolid" | "ghost";
const BTN: Record<BtnKind, string> = {
  neutral: "border border-[#D9DDE3] bg-white text-[#1B1F24] hover:bg-[#F5F6F8]",
  primary: "border border-[#1D4ED8] bg-[#1D4ED8] text-white hover:bg-[#1E40AF]",
  danger: "border border-[#B42318] bg-white text-[#B42318] hover:bg-[#FEE4E2]",
  dangerSolid: "border border-[#B42318] bg-[#B42318] text-white hover:bg-[#912018]",
  ghost: "border border-transparent bg-transparent text-[#5B6470] hover:bg-[#F5F6F8]",
};
/** 버튼 — 높이 40px(주요 44px). lock 이 있으면 잠금(자물쇠 + 마우스를 올리면 이유) */
export function Btn({ kind = "neutral", size = "md", lock, disabled, onClick, title, children, className = "", ariaLabel }: {
  kind?: BtnKind; size?: "sm" | "md" | "lg"; lock?: string | null; disabled?: boolean; onClick?: () => void; title?: string;
  children: ReactNode; className?: string; ariaLabel?: string;
}) {
  const h = size === "lg" ? `h-11 px-4 ${FS.body}` : size === "md" ? `h-10 px-3 ${FS.body}` : `h-8 px-2.5 ${FS.small}`;
  const locked = !!lock;
  const { lockPrefix } = useChk2Mode();          // CH1&2 는 자기 앞말(LOCK_PREFIX)을 넘긴다. 없으면 '잠김: '(W-25 B1 — 예전 '잠김 — ')
  return (
    <button type="button" onClick={onClick} disabled={locked || disabled} aria-label={ariaLabel}
      title={locked ? `${lockPrefix ?? "잠김: "}${lock}` : title}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] font-semibold
        outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-45
        ${h} ${BTN[kind]} ${className}`}>
      {locked && <Lock size={13} />}{children}
    </button>
  );
}

/** 정보 띠(bench 등) */
export function InfoBand({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className={`flex items-start gap-2 rounded-[12px] border border-[#C7D5FB] bg-[#EEF3FF] px-4 py-2.5 text-[#1B1F24] ${FS.body}`}>
      <span className="mt-0.5 shrink-0 text-[#1D4ED8]">{icon ?? <Info size={15} />}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** 이상 한 줄(주의·알람) — 아이콘 + 글자 */
export function Issue({ level, children }: { level: "warn" | "alarm"; children: ReactNode }) {
  const { lineIcons } = useChk2Mode();          // W-23 챔버K — 아이콘을 첫 글자 줄 가운데에(줄 높이 상자). CH1&2 는 지금처럼
  const icon = level === "alarm" ? <AlertOctagon size={14} className={lineIcons ? "shrink-0" : "mt-px shrink-0"} />
    : <AlertTriangle size={14} className={lineIcons ? "shrink-0" : "mt-px shrink-0"} />;
  return (
    <p className={`flex items-start gap-1.5 rounded-[10px] px-3 py-2 ${FS.body} ${
      level === "alarm" ? "bg-[#FEE4E2] text-[#B42318]" : "bg-[#FFFAEB] text-[#B54708]"}`}>
      {lineIcons ? <span className="flex shrink-0 items-center" style={{ height: "1lh" }}>{icon}</span> : icon}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** 데이터 없을 때 안내 */
export function Empty({ children }: { children: ReactNode }) {
  return <p className={`py-6 text-center text-[#5B6470] ${FS.body}`}>{children}</p>;
}

/** 탭 — 선택은 #1D4ED8 밑줄·#E8EEFC 배경 */
export function Tabs<K extends string>({ tabs, value, onChange, right, small, wrap }: {
  tabs: { key: K; label: ReactNode; badge?: ReactNode; title?: string }[]; value: K; onChange: (k: K) => void; right?: ReactNode; small?: boolean;
  wrap?: boolean;     // W-21 챔버K — 좁은 화면에서 탭을 가로로 밀지 않고 줄을 바꿔 다 보이게(오른쪽 버튼과 겹치지 않음). 기본: 지금처럼 가로 스크롤
}) {
  return (
    <div className={`flex min-w-0 items-end gap-1 border-b border-[#D9DDE3] ${wrap ? "flex-wrap" : ""}`}>
      <div className={`flex min-w-0 items-end gap-1 ${wrap ? "flex-wrap" : "overflow-x-auto overflow-y-hidden"}`} role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)} title={t.title}
          className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-[10px] border-b-2 font-semibold ${
            small ? `h-9 px-3 ${FS.body}` : `h-11 px-4 ${FS.card}`} ${
            value === t.key ? "border-[#1D4ED8] bg-[#E8EEFC] text-[#1D4ED8]" : "border-transparent text-[#5B6470] hover:text-[#1B1F24]"}`}>
          {t.label}{t.badge}
        </button>
      ))}
      </div>
      {right && <span className="ml-auto flex shrink-0 items-center pb-1.5">{right}</span>}
    </div>
  );
}

/** 값 막대 — 회색 띠 = 허용 범위, ▲ = 목표, 세로선 = 지금. 눈금 0 ~ max */
export function RangeBar({ value, target, band, max, label }: {
  value: number | null; target: number | null; band: [number, number] | null; max: number; label?: string;
}) {
  const w = 200, h = 22, pad = 4;
  const x = (v: number) => pad + Math.max(0, Math.min(1, v / (max || 1))) * (w - pad * 2);
  const out = value !== null && band !== null && (value < band[0] || value > band[1]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[22px] w-full" role="img"
      aria-label={label ?? `지금 ${value ?? "—"}${target !== null ? `, 목표 ${target}` : ""}${band ? `, 허용 ${band[0]}~${band[1]}` : ""}`}>
      <rect x={pad} y={9} width={w - pad * 2} height={4} rx={2} fill="#E3E6EA" />
      {band && <rect x={x(band[0])} y={6} width={Math.max(2, x(band[1]) - x(band[0]))} height={10} rx={2} fill="#C9CED6" />}
      {target !== null && <path d={`M ${x(target) - 4} 21 L ${x(target) + 4} 21 L ${x(target)} 15 Z`} fill={T.on} />}
      {value !== null && <rect x={x(value) - 1.25} y={2} width={2.5} height={16} rx={1} fill={out ? T.warn : T.value} />}
    </svg>
  );
}

/** 장비 블록 품질 칩(state.links — q·age 초). 정상은 회색, 늦음·오래됨 주의, 끊김 알람, 꺼짐 회색 테두리 */
export function QBadge({ link }: { link?: Link }) {
  const { detail } = useChk2Mode();
  const q = link?.q ?? "—";
  const age = typeof link?.age === "number" ? link.age : null;
  const tone: Tone = q === "late" || q === "stale" ? "warn" : q === "fail" ? "alarm" : "neutral";
  return (
    <Chip tone={tone} title={`${q}${age !== null ? ` · 마지막 값 ${age.toFixed(1)} s 전` : ""}`}>
      {Q_LABEL[q] ?? q}
      {detail && <span className="font-mono font-normal opacity-70">{q}{age !== null ? ` ${age.toFixed(1)}s` : ""}</span>}
    </Chip>
  );
}

/** 램프 점 — 감지 = 채운 점, 없음 = 빈 점(색 없음). alert 면 켜졌을 때 주의색 */
export function Dot({ on, alert, dim }: { on?: boolean | null; alert?: boolean; dim?: boolean }) {
  const c = dim ? "border-dashed border-[#8A929D] bg-white"
    : on ? (alert ? "border-[#B54708] bg-[#B54708]" : "border-[#3A424D] bg-[#3A424D]") : "border-[#8A929D] bg-white";
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border ${c}`} />;
}

/** 묶음 snapshot 정의 그대로 값 하나 — 숫자는 fmt·단위, bool 은 상태 네모, str 은 enumLabels. 값이 비고 상태가 ok 가 아니면 상태 이름 */
export function FieldValue({ f, v, dim, snap, blocks, staleNote }: {
  f: FieldDef; v: unknown; dim?: boolean; snap?: Record<string, unknown>; blocks?: { fields: FieldDef[] }[];
  staleNote?: string;      // 자기 품질 열(<column>.q)이 ok 가 아닐 때 값 옆에 붙이는 말 — 값은 흐리게(앞 값)
}) {
  const { detail } = useChk2Mode();
  const tip = [f.desc, detail ? f.column : ""].filter(Boolean).join(" · ") || undefined;
  if (f.type === "bool") return <StateBox on={dim ? null : v === true} label={f.label} title={tip} />;
  const t = fieldText(f, v, snap, blocks);
  const stale = !dim && !!staleNote && ownStale(f, snap);
  return (
    <KV k={f.label} title={tip}>
      {stale && <span className={`mr-1.5 ${FS.small} text-[#8A929D]`}>{staleNote}</span>}
      <Val text={dim ? "" : t.text} unit={f.unit} dim={stale} alt={dim ? null : t.alt} altWarn={t.warn} />
    </KV>
  );
}

/** 자기 품질 열이 있는 필드(ownQuality)의 이번 값이 새로 읽은 것이 아닌가 — <column>.q 가 있고 ok 가 아님 */
export const ownStale = (f: FieldDef, snap?: Record<string, unknown>) => {
  const q = f.ownQuality ? snap?.[`${f.column}.q`] : undefined;
  return typeof q === "string" && q !== "" && q !== "ok";
};

/** 크게 보이는 값(카드 위 줄) */
export function BigValue({ f, v, dim, snap, blocks }: {
  f?: FieldDef; v: unknown; dim?: boolean; snap?: Record<string, unknown>; blocks?: { fields: FieldDef[] }[];
}) {
  if (!f) return null;
  const t = fieldText(f, v, snap, blocks);
  return (
    <div className="min-w-0 px-3 py-2">
      <p className={`truncate text-[#5B6470] ${FS.small}`}>{f.label}</p>
      <Val text={dim ? "" : t.text} unit={f.unit} size="big" alt={dim ? null : t.alt} altWarn={t.warn} />
    </div>
  );
}

/** 값 글만(카드 밖에서) — fmtValue 그대로 */
export const valueOf = (f: FieldDef | undefined, v: unknown) => (f ? fmtValue(v, f.fmt) : "");

export type Ask = {
  kind: string;
  label: string;          // 무엇을
  detail?: string;        // 어떻게(→ ON 등)
  args?: Record<string, unknown>;
  danger?: boolean;        // 도어·벤트 — 사람 확인 문구
  stop?: boolean;          // 정지 쪽 — 정지 문구(note), 열리면 실행에 포커스
  note?: string;           // 정지가 하는 일
  red?: boolean;           // 물리 동작(공정·히터 레시피 시작) — 실행 버튼 빨강
  lines?: string[];        // 무엇을 하는지 요약(레시피 이름·행 수·첫 행 가스·파워·시간, 히터 목표)
  plc?: { target: string; want: boolean };   // PLC 버튼 — "전환 중" 표시
  key?: string;            // 결과를 기다리는 동안 막는 단위(없으면 kind — 공정 중 수정은 항목마다)
};

/** 정지 쪽 조작인가(W-21 챔버K 색 규칙) — 정지 표시(stop)이거나 이름이 STOP·정지·끄기·끝내기 */
export const isStopLike = (a: Pick<Ask, "stop" | "label">) => !!a.stop || /STOP|정지|끄기|끝내기/.test(a.label);

/** 확인창 한 번 — 실행하면 onOk. Esc 취소, 정지 쪽은 열리면 실행 버튼에 포커스(Enter 실행) */
export function ConfirmDialog({ ask, onOk, onCancel }: { ask: Ask | null; onOk: () => void; onCancel: () => void }) {
  const okRef = useRef<HTMLButtonElement | null>(null);
  const { chkColors } = useChk2Mode();   // W-21 챔버K — 빨강은 정지·끄기·끝내기만(시작·실행·켜기·적용은 파랑). CH1&2 는 지금 규칙 그대로
  useEffect(() => {
    if (!ask) return;
    if (ask.stop) okRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [ask, onCancel]);
  if (!ask) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[12px] bg-white p-5">
        <p className={`font-bold text-[#1B1F24] ${FS.card}`}>조작 확인</p>
        <p className={`mt-2 text-[#1B1F24] ${FS.body}`}>
          <span className="font-semibold">{ask.label}</span>
          {ask.detail && <span> {ask.detail}</span>} — 명령을 장비에 보냅니다.
        </p>
        {ask.lines && ask.lines.length > 0 && (
          <ul className={`mt-2 space-y-0.5 rounded-[10px] border border-[#E3E6EA] p-2.5 leading-relaxed text-[#1B1F24] ${FS.body}`}>
            {ask.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
        {ask.note && (
          <p className={`mt-2 rounded-[10px] p-2.5 leading-relaxed ${FS.body} ${ask.stop ? "bg-[#FFFAEB] text-[#B54708]" : "bg-[#F5F6F8] text-[#5B6470]"}`}>
            {ask.note}
          </p>
        )}
        {ask.danger && <div className="mt-2"><Issue level="alarm">물리적 위험이 있는 조작입니다. 장비 주변에 사람이 없는지 반드시 확인하세요.</Issue></div>}
        <p className={`mt-3 text-[#5B6470] ${FS.small}`}>이 조작은 실행자 계정과 함께 기록됩니다.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Btn kind="ghost" onClick={onCancel}>취소</Btn>
          <button ref={okRef} onClick={onOk}
            className={`h-10 rounded-[10px] px-4 font-semibold text-white ${FS.body} outline-offset-2 focus:outline-2 focus:outline-[#1D4ED8] ${
              (chkColors ? isStopLike(ask) : ask.danger || ask.stop || ask.red) ? "bg-[#B42318]" : "bg-[#1D4ED8]"}`}>
            실행
          </button>
        </div>
      </div>
    </div>
  );
}

/** 화면 안 확인(장비 명령이 아닌 것 — 레시피 지우기·저장 안 하고 나가기). Esc 취소. alt 가 있으면 두 번째 선택 */
export function SimpleConfirm({ title, text, ok, danger, onOk, onCancel, alt }: {
  title: string; text: ReactNode; ok: string; danger?: boolean; onOk: () => void; onCancel: () => void;
  alt?: { label: string; onClick: () => void };
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[12px] bg-white p-5">
        <p className={`font-bold text-[#1B1F24] ${FS.card}`}>{title}</p>
        <div className={`mt-2 text-[#1B1F24] ${FS.body}`}>{text}</div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Btn kind="ghost" onClick={onCancel}>취소</Btn>
          {alt && <Btn onClick={alt.onClick}>{alt.label}</Btn>}
          <Btn kind={danger ? "dangerSolid" : "primary"} onClick={onOk}>{ok}</Btn>
        </div>
      </div>
    </div>
  );
}

/** 작은 입력 창(값을 넣고 → 확인창) */
export function Modal({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer: ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[12px] bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className={`font-bold text-[#1B1F24] ${FS.card}`}>{title}</p>
          <button onClick={onClose} aria-label="닫기" className="rounded p-1 text-[#5B6470] hover:bg-[#F5F6F8]"><X size={16} /></button>
        </div>
        {children}
        <div className="mt-4 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

export type Notice = { id: string; tone: "ok" | "bad" | "warn"; title: string; text?: string; at: number };

/** 결과 알림 — 화면 오른쪽 아래 고정 토스트(여러 개 쌓임). 닫기는 부르는 쪽(성공은 6 초 뒤 저절로) */
export function Notices({ list, onClose }: { list: Notice[]; onClose: (id: string) => void }) {
  if (!list.length) return null;
  const TONE = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    bad: "border-[#F7C1BB] bg-[#FEE4E2] text-[#B42318]",
    warn: "border-[#F5D9A8] bg-[#FFFAEB] text-[#B54708]",
  };
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col-reverse gap-2">
      {list.map((n) => (
        <div key={n.id} role="status"
          className={`pointer-events-auto flex items-start gap-2 rounded-[12px] border p-3 shadow-lg ${FS.body} ${TONE[n.tone]}`}>
          <div className="min-w-0 flex-1 leading-relaxed">
            <p className="font-bold">{n.title}</p>
            {n.text && <p className="mt-0.5">{n.text}</p>}
          </div>
          <button onClick={() => onClose(n.id)} aria-label="알림 닫기"
            className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** 도움말 층(W-14) — 화면에 하나. title·data-tip 이 있는 요소에 마우스를 올리거나(hover) 키보드로 고르면(focus) 도움말 상자.
 *  상자는 대상 아래(아래 자리가 모자라면 위)에 붙고 대상을 가리지 않는다. 긴 글은 줄바꿈(최대 너비 340px).
 *  보이는 동안은 요소의 title 을 data-tip 으로 옮겨 브라우저 기본 말풍선이 겹치지 않게 하고, 떠나면 되돌린다(서버 HTML·검사는 그대로).
 *  잠긴(disabled) 버튼은 마우스 사건이 오지 않는 브라우저가 있어, 마우스 위치로 가장 안쪽 요소를 찾아 쓴다. */
/** 대상 아래 줄 글 조각 상자(글 노드 범위 — 대상 아래 48 px 안에서 시작, 도움말 상자 자신은 빼고). 스크롤 상자 밖으로 잘려
 *  보이지 않는 글은 빼기(그 자리에서 실제로 보이는 요소가 그 글의 요소인지 — 도움말은 pointer-events 가 없어 걸리지 않음) */
function lineBoxesBelow(bottom: number, self: HTMLElement): DOMRect[] {
  const out: DOMRect[] = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const owner = n.parentElement;
    if (!owner || !n.textContent?.trim() || self.contains(n)) continue;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) {
      if (r.width <= 0.5 || r.top < bottom - 1 || r.top > bottom + 48) continue;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && (hit === owner || owner.contains(hit) || hit.contains(owner))) out.push(r);
    }
  }
  return out;
}

export function TipLayer() {
  // W-23 A: 같은 대상 위에 0.5 s 머문 뒤에 보인다(키보드 focus 는 바로), 벗어나면 바로 숨김, 스크롤 때는 숨기지 않고 자리만 다시(깜박임 없음).
  // 자리: 올린 대상을 가리지 않는다 — 설정 서랍 안의 줄은 서랍 왼쪽 바깥(어두운 영역)에 줄 높이에 맞춰, 그 밖은 포인터 가로 위치에 맞춰
  // 대상 위쪽에(실제 높이를 재서 — 위가 모자라면 옆, 옆도 모자라면 아래). 목록의 바로 아래 줄 이름을 덮지 않게 위쪽이 먼저.
  // 자리는 그린 뒤 크기를 재서 정한다(useLayoutEffect — 칠하기 전이라 깜박이지 않음). 부르는 쪽이 body 포털(Float)로 그린다.
  const [tip, setTip] = useState<{ text: string; r: [number, number, number, number]; px: number; drawerLeft: number | null } | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !tip) return;
    const [l, t, rr, b] = tip.r;
    const vw = window.innerWidth, vh = window.innerHeight, M = 8, G = 6;
    const put = (left: number, top: number) => {
      el.style.left = `${Math.round(left)}px`; el.style.top = `${Math.round(top)}px`; el.style.visibility = "visible";
    };
    el.style.maxWidth = "340px";
    let w = el.offsetWidth, h = el.offsetHeight;
    const vClamp = (y: number) => Math.max(M, Math.min(y, vh - h - M));
    if (tip.drawerLeft !== null) {                              // 서랍 왼쪽 바깥 — 줄 높이에 맞춰(창 안으로)
      el.style.maxWidth = `${Math.min(340, tip.drawerLeft - 2 * M)}px`;
      w = el.offsetWidth; h = el.offsetHeight;
      return put(tip.drawerLeft - M - w, vClamp(t));
    }
    const hClamp = (x: number) => Math.max(M, Math.min(x, vw - w - M));
    if (t - G - h >= M) return put(hClamp(tip.px - 12), t - G - h);   // 위
    // 위에 자리가 없을 때(화면 맨 위 머리 등, W-24 B3): 바로 아래 줄 글(대상 아래 48 px 안에서 시작하는 글 조각)을 덮지 않게
    const below = lineBoxesBelow(b, el);
    const hits = (x0: number, y0: number, x1: number, y1: number) =>
      below.some((r) => Math.min(r.right, x1) - Math.max(r.left, x0) > 1 && Math.min(r.bottom, y1) - Math.max(r.top, y0) > 1);
    const right = vw - rr - G - M, left = l - G - M;            // 옆(대상과 같은 높이에서 시작)
    for (const [room, isRight] of [[right, true], [left, false]].sort((a, c) => Number(c[0]) - Number(a[0])) as [number, boolean][]) {
      if (room < 160) continue;
      el.style.maxWidth = `${Math.min(340, room)}px`;
      w = el.offsetWidth; h = el.offsetHeight;
      const x = isRight ? rr + G : l - G - w, y = vClamp(t);
      if (!hits(x, y, x + w, y + h)) return put(x, y);
    }
    el.style.maxWidth = "340px";
    w = el.offsetWidth; h = el.offsetHeight;
    const x = Math.max(M, Math.min(tip.px - 12, vw - w - M));
    // 아래 — 그 아래 줄 글과 겹치면 그 줄 밑으로
    const under = below.filter((r) => Math.min(r.right, x + w) - Math.max(r.left, x) > 1);
    const y = under.length ? Math.max(...under.map((r) => r.bottom)) + G : b + G;
    put(x, Math.min(y, vh - h - M));
  }, [tip]);
  useEffect(() => {
    let cur: HTMLElement | null = null;
    let shown = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let px = 0;
    const DELAY_MS = 500;
    const restore = () => {
      if (cur && cur.dataset.tipFromTitle === "1") {
        cur.setAttribute("title", cur.dataset.tip ?? "");
        delete cur.dataset.tip;
        delete cur.dataset.tipFromTitle;
      }
    };
    const find = (el: Element | null): HTMLElement | null => {
      const x = el?.closest?.("[data-tip],[title]") as HTMLElement | null;
      if (!x || x.tagName === "svg" || x.closest("svg title")) return null;
      return x;
    };
    const textOf = (el: HTMLElement) => (el.dataset.tip ?? el.getAttribute("title") ?? "").trim();
    const place = (el: HTMLElement) => {
      const text = textOf(el);
      if (!text) { shown = false; setTip(null); return; }
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) { shown = false; setTip(null); return; }
      const drawer = el.closest("[data-tip-side='left']") as HTMLElement | null;
      const d = drawer?.getBoundingClientRect();
      shown = true;
      setTip({ text, r: [r.left, r.top, r.right, r.bottom], px, drawerLeft: d && d.left >= 220 ? d.left : null });
    };
    const arm = (el: HTMLElement | null, now: boolean) => {
      if (el === cur) return;
      if (timer) { clearTimeout(timer); timer = null; }
      restore();
      cur = el;
      shown = false;
      setTip(null);
      if (!el) return;
      if (el.hasAttribute("title")) {                           // 브라우저 기본 도움말이 같이 뜨지 않게
        el.dataset.tip = el.getAttribute("title") ?? "";
        el.dataset.tipFromTitle = "1";
        el.removeAttribute("title");
      }
      if (!textOf(el)) return;
      if (now) place(el);
      else timer = setTimeout(() => { timer = null; if (cur === el) place(el); }, DELAY_MS);
    };
    const over = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const t = find(el ?? (e.target as Element));
      if (t !== cur) px = e.clientX;
      arm(t, false);
    };
    const focus = (e: FocusEvent) => {
      const t = find(e.target as Element);
      if (t) px = t.getBoundingClientRect().left + 12;
      arm(t, true);
    };
    const hide = () => arm(null, false);
    const scroll = () => { if (cur && shown) place(cur); };
    document.addEventListener("mousemove", over, { passive: true });
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("blur", hide);
    return () => {
      if (timer) clearTimeout(timer);
      restore();
      document.removeEventListener("mousemove", over);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("blur", hide);
    };
  }, []);
  if (!tip) return null;
  return (
    <div role="tooltip" ref={box} style={{ left: 0, top: 0, visibility: "hidden" }}
      className={`pointer-events-none fixed z-[90] w-max max-w-[340px] whitespace-pre-line break-words rounded-[8px] bg-[#1B1F24] px-2.5 py-1.5
        leading-[18px] text-white shadow-lg ${FS.small}`}>
      {tip.text}
    </div>
  );
}
