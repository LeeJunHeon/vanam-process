// 웹 명령 인자 — 서버가 넣는 것(DB·네트워크 없는 순수 함수 — 명령 API 와 화면 검사 스크립트가 같이 쓴다).
import type { CommandDef } from "@/lib/ops2/commands";

/** 서버가 넣는 인자 — 명령 정의가 by_name 인자를 선언하면(챔버12 PLC_BUTTON — 2026-11-20 D425) 로그인한 사람 이름을 넣는다.
 *  브라우저가 보낸 by_name 은 버리고 세션 이름으로 덮어쓴다(꾸밀 수 없게 — 계정은 requestedBy). 선언하지 않은 명령(챔버K 등)은 그대로. */
export function withServerArgs(def: CommandDef, args: Record<string, unknown>, userName: string | null | undefined): Record<string, unknown> {
  const declares = Array.isArray(def.args) && def.args.some((a) => !!a && typeof a === "object" && (a as { name?: unknown }).name === "by_name");
  if (!declares) return args;
  const { by_name: _drop, ...rest } = args;
  void _drop;
  const name = typeof userName === "string" ? userName.trim().slice(0, 60) : "";
  return name ? { ...rest, by_name: name } : rest;
}
