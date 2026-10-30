"use client";

// 챔버K v2 장비 화면 공통 조각(W-10 — ISA-101 고성능 HMI: 정상은 회색, 색은 이상할 때만).
// 바탕 #EEF0F3 · 카드 흰색 테두리 #D9DDE3 모서리 12px · 안쪽 칸 테두리 #E3E6EA 모서리 10px · 글 #1B1F24 · 보조 #5B6470 ·
// 실시간 값 남색 #133A7C(굵게·tabular-nums·단위는 보조색 작게) · 주 버튼·선택 #1D4ED8 / 선택 배경 #E8EEFC ·
// 장비 상태 켜짐 = 진회색 #3A424D 채운 네모, 꺼짐 = 회색 #8A929D 테두리 네모(초록·빨강을 쓰지 않는다) ·
// 이상만 색: 주의 #B54708 / #FFFAEB, 알람·오류 #B42318 / #FEE4E2 — 늘 아이콘 + 글자 · 정보 띠 #EEF3FF / #C7D5FB / #1D4ED8.
// 잠긴 버튼은 자물쇠 + 마우스를 올리면 이유(권한·bench·끊김·PLC 오래됨 — 이유 문구만 다름).
// 이 파일만 토큰을 안다 — CHK v2 화면 전체가 같은 조각을 쓴다(전역 CSS 는 건드리지 않는다).
import { useEffect, useRef, type ReactNode } from "react";
import { AlertOctagon, AlertTriangle, Info, Lock, X } from "lucide-react";
import { Q_LABEL, fmtValue, type FieldDef, type Link } from "./types";
import { useChk2Mode } from "./mode";
import { fieldText } from "./text";

/** 색 토큰(SVG·style 용) — 클래스에서는 같은 값을 그대로 적는다 */
export const T = {
  bg: "#EEF0F3", border: "#D9DDE3", sub: "#E3E6EA", text: "#1B1F24", muted: "#5B6470", value: "#133A7C",
  primary: "#1D4ED8", selBg: "#E8EEFC", on: "#3A424D", off: "#8A929D", pipe: "#C9CED6",
  warn: "#B54708", warnBg: "#FFFAEB", alarm: "#B42318", alarmBg: "#FEE4E2", infoBg: "#EEF3FF", infoBorder: "#C7D5FB",
} as const;

export function Card({
  title, right, children, className = "", tight,
}: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; tight?: boolean }) {
  return (
    <section className={`min-w-0 rounded-[12px] border border-[#D9DDE3] bg-white ${tight ? "p-3" : "p-4 sm:p-5"} ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-[#1B1F24]">{title}</h3>}
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
  const ic = icon ?? (tone === "warn" ? <AlertTriangle size={11} /> : tone === "alarm" ? <AlertOctagon size={11} /> : null);
  return (
    <span title={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-tight ${CHIP[tone]} ${className}`}>
      {ic}{children}
    </span>
  );
}

/** 장비 상태 — 켜짐·열림 = 진회색 채운 네모, 꺼짐·닫힘 = 회색 테두리 네모 + 글자. 모르면(값 없음) 점선 */
export function StateBox({ on, label, title, unknown }: { on: boolean | null | undefined; label: ReactNode; title?: string; unknown?: boolean }) {
  const u = unknown || on === null || on === undefined;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs" title={title}>
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] border ${
        u ? "border-dashed border-[#8A929D] bg-white" : on ? "border-[#3A424D] bg-[#3A424D]" : "border-[#8A929D] bg-white"}`} />
      <span className={`truncate ${on && !u ? "font-semibold text-[#1B1F24]" : "text-[#5B6470]"}`}>{label}</span>
    </span>
  );
}

/** 실시간 값 — 남색 굵게, 단위는 보조색 작게(늘 붙임). 값이 없으면 "—" 또는 상태 이름(alt) */
export function Val({ text, unit, size = "md", dim, alt }: {
  text: string; unit?: string; size?: "sm" | "md" | "lg" | "xl"; dim?: boolean; alt?: string | null;
}) {
  const cls = size === "xl" ? "text-3xl" : size === "lg" ? "text-2xl" : size === "md" ? "text-base" : "text-xs";
  if (!text) {
    return alt
      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#B54708]"><AlertTriangle size={12} />{alt}</span>
      : <span className={`${cls} font-bold text-[#8A929D]`}>—</span>;
  }
  return (
    <span className={`whitespace-nowrap ${cls} font-bold leading-tight tabular-nums ${dim ? "text-[#8A929D]" : "text-[#133A7C]"}`}>
      {text}{unit && <span className="ml-0.5 text-[11px] font-normal text-[#5B6470]">{unit}</span>}
    </span>
  );
}

/** 라벨 — 값 한 줄(라벨 왼쪽 보조색, 값 오른쪽) */
export function KV({ k, children, title }: { k: ReactNode; children: ReactNode; title?: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 py-0.5 text-xs" title={title}>
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
  const h = size === "lg" ? "h-11 px-4 text-sm" : size === "md" ? "h-10 px-3 text-xs" : "h-8 px-2.5 text-xs";
  const locked = !!lock;
  return (
    <button type="button" onClick={onClick} disabled={locked || disabled} aria-label={ariaLabel}
      title={locked ? `잠김 — ${lock}` : title}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] font-semibold
        outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-45
        ${h} ${BTN[kind]} ${className}`}>
      {locked && <Lock size={12} />}{children}
    </button>
  );
}

/** 정보 띠(bench 등) */
export function InfoBand({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-[12px] border border-[#C7D5FB] bg-[#EEF3FF] px-4 py-2.5 text-xs text-[#1B1F24]">
      <span className="mt-0.5 shrink-0 text-[#1D4ED8]">{icon ?? <Info size={15} />}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** 이상 한 줄(주의·알람) — 아이콘 + 글자 */
export function Issue({ level, children }: { level: "warn" | "alarm"; children: ReactNode }) {
  return (
    <p className={`flex items-start gap-1.5 rounded-[10px] px-3 py-2 text-xs ${
      level === "alarm" ? "bg-[#FEE4E2] text-[#B42318]" : "bg-[#FFFAEB] text-[#B54708]"}`}>
      {level === "alarm" ? <AlertOctagon size={14} className="mt-px shrink-0" /> : <AlertTriangle size={14} className="mt-px shrink-0" />}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** 데이터 없을 때 안내 */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-xs text-[#5B6470]">{children}</p>;
}

/** 탭 — 선택은 #1D4ED8 밑줄·#E8EEFC 배경 */
export function Tabs<K extends string>({ tabs, value, onChange, right, small }: {
  tabs: { key: K; label: ReactNode; badge?: ReactNode }[]; value: K; onChange: (k: K) => void; right?: ReactNode; small?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-end gap-1 border-b border-[#D9DDE3] ${small ? "" : "overflow-x-auto"}`} role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-[10px] border-b-2 font-semibold ${
            small ? "h-9 px-3 text-xs" : "h-11 px-4 text-sm"} ${
            value === t.key ? "border-[#1D4ED8] bg-[#E8EEFC] text-[#1D4ED8]" : "border-transparent text-[#5B6470] hover:text-[#1B1F24]"}`}>
          {t.label}{t.badge}
        </button>
      ))}
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
export function FieldValue({ f, v, dim, snap, blocks }: {
  f: FieldDef; v: unknown; dim?: boolean; snap?: Record<string, unknown>; blocks?: { fields: FieldDef[] }[];
}) {
  const { detail } = useChk2Mode();
  const tip = [f.desc, detail ? f.column : ""].filter(Boolean).join(" · ") || undefined;
  if (f.type === "bool") return <StateBox on={dim ? null : v === true} label={f.label} title={tip} />;
  const t = fieldText(f, v, snap, blocks);
  return (
    <KV k={f.label} title={tip}>
      <Val text={dim ? "" : t.text} unit={f.unit} size="sm" alt={dim ? null : t.alt} />
    </KV>
  );
}

/** 크게 보이는 값(카드 위 줄) */
export function BigValue({ f, v, dim, snap, blocks }: {
  f?: FieldDef; v: unknown; dim?: boolean; snap?: Record<string, unknown>; blocks?: { fields: FieldDef[] }[];
}) {
  if (!f) return null;
  const t = fieldText(f, v, snap, blocks);
  return (
    <div className="min-w-0 px-3 py-2">
      <p className="truncate text-[11px] text-[#5B6470]">{f.label}</p>
      <Val text={dim ? "" : t.text} unit={f.unit} size="lg" alt={dim ? null : t.alt} />
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

/** 확인창 한 번 — 실행하면 onOk. Esc 취소, 정지 쪽은 열리면 실행 버튼에 포커스(Enter 실행) */
export function ConfirmDialog({ ask, onOk, onCancel }: { ask: Ask | null; onOk: () => void; onCancel: () => void }) {
  const okRef = useRef<HTMLButtonElement | null>(null);
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
        <p className="text-sm font-bold text-[#1B1F24]">조작 확인</p>
        <p className="mt-2 text-sm text-[#1B1F24]">
          <span className="font-semibold">{ask.label}</span>
          {ask.detail && <span> {ask.detail}</span>} — 명령을 장비에 보냅니다.
        </p>
        {ask.lines && ask.lines.length > 0 && (
          <ul className="mt-2 space-y-0.5 rounded-[10px] border border-[#E3E6EA] p-2.5 text-xs leading-relaxed text-[#1B1F24]">
            {ask.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
        {ask.note && (
          <p className={`mt-2 rounded-[10px] p-2.5 text-xs leading-relaxed ${ask.stop ? "bg-[#FFFAEB] text-[#B54708]" : "bg-[#F5F6F8] text-[#5B6470]"}`}>
            {ask.note}
          </p>
        )}
        {ask.danger && <div className="mt-2"><Issue level="alarm">물리적 위험이 있는 조작입니다. 장비 주변에 사람이 없는지 반드시 확인하세요.</Issue></div>}
        <p className="mt-3 text-[11px] text-[#5B6470]">이 조작은 실행자 계정과 함께 기록됩니다.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Btn kind="ghost" onClick={onCancel}>취소</Btn>
          <button ref={okRef} onClick={onOk}
            className={`h-10 rounded-[10px] px-4 text-xs font-semibold text-white outline-offset-2 focus:outline-2 focus:outline-[#1D4ED8] ${
              ask.danger || ask.stop || ask.red ? "bg-[#B42318]" : "bg-[#1D4ED8]"}`}>
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
        <p className="text-sm font-bold text-[#1B1F24]">{title}</p>
        <div className="mt-2 text-sm text-[#1B1F24]">{text}</div>
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
          <p className="text-sm font-bold text-[#1B1F24]">{title}</p>
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
          className={`pointer-events-auto flex items-start gap-2 rounded-[12px] border p-3 text-xs shadow-lg ${TONE[n.tone]}`}>
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
