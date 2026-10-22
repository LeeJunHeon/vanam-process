// 챔버K v2 브라우저 API(/api/ops2/[equipment]/v1/*) 공통 — 노트북 로컬 화면 API(챔버K v2 chk/local_server.py)와 같은 모양.
// hello·schema·stream 은 로컬과 같은 칸, 웹에서만 아는 것(연결·권한)은 hello.web 에.
import type { Session } from "next-auth";
import { ops2Db } from "@/lib/ops2/db";
import { CONFIG_KINDS, webCommandDef, type CommandDef } from "@/lib/ops2/commands";
import { canRunCommand, isAdminRole, isOperatorOf, operatorEquipments, type Actor } from "@/lib/ops2/perm";

export function actorOf(session: Session): Actor {
  const u = session.user;
  return { role: u?.role ?? null, employeeId: u?.employeeId ?? null };
}

/** 화면에 열 수 있는 장비(없거나 꺼져 있으면 null) */
export async function enabledDevice(equipment: string) {
  const d = await ops2Db.ops2Device.findUnique({ where: { equipment } });
  return d && d.enabled ? d : null;
}

/** 장비의 웹 설정 묶음(web_schema_hash) — 없으면 null */
export async function deviceBundle(webSchemaHash: string | null): Promise<Record<string, unknown> | null> {
  if (!webSchemaHash) return null;
  const s = await ops2Db.ops2WebSchema.findUnique({ where: { hash: webSchemaHash }, select: { bundle: true } });
  const b = s?.bundle;
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
}

export type Perms = { canOperate: boolean; isAdmin: boolean; kinds: string[] };

/** 이 사람의 권한 — kinds 는 묶음 commands 중 sources 에 web 이 있고 role 이 맞는 것(설정 명령 제외) */
export async function permsOf(actor: Actor, equipment: string, bundle: Record<string, unknown> | null): Promise<Perms> {
  const ops = await operatorEquipments(ops2Db, actor.employeeId);
  const isAdmin = isAdminRole(actor.role);
  const list = Array.isArray(bundle?.commands) ? (bundle.commands as CommandDef[]) : [];
  const kinds = list
    .filter((c) => c && typeof c.kind === "string" && !CONFIG_KINDS.includes(c.kind) && webCommandDef(bundle, c.kind))
    .filter((c) => canRunCommand(actor, equipment, c.role, ops))
    .map((c) => c.kind);
  return { canOperate: isAdmin || isOperatorOf(actor, equipment, ops), isAdmin, kinds };
}

/** ?limit= — 정수 1~max, 아니면 기본값 */
export function limitOf(v: string | null, def: number, max: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : def;
}
