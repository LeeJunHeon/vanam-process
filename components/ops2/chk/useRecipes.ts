"use client";

// 챔버K v2 레시피(웹 저장) — /api/ops2/[equipment]/recipes. 목록은 공정·히터를 한 번에(상태 카드가 적재된 이름을 웹 레시피와 맞춘다).
import { useCallback, useEffect, useState } from "react";

export type RecipeKind = "process" | "heater";
export type CheckCount = { errors: number; warnings: number; first: string | null } | null;
export type RecipeItem = {
  id: string; kind: RecipeKind; name: string; rowCount: number; bundleVersion: number | null;
  createdBy: string; createdAt: string; updatedBy: string; updatedAt: string; check: CheckCount;
};
export type RecipeFull = RecipeItem & { rows: Record<string, unknown>[]; gas: Record<string, unknown> | null };
export type SaveBody = { kind: RecipeKind; name: string; rows: Record<string, unknown>[]; gas: Record<string, unknown> | null };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; detail?: string };

const url = (eq: string, id?: string) => `/api/ops2/${encodeURIComponent(eq)}/recipes${id ? `/${encodeURIComponent(id)}` : ""}`;

async function call<T>(u: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const r = await fetch(u, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: b.error ?? `HTTP ${r.status}`, detail: b.detail };
    return { ok: true, data: b as T };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}

/** enabled false(노트북 로컬 화면 — 웹 레시피 없음)면 읽지 않는다 */
export function useRecipes(equipment: string, enabled = true) {
  const [list, setList] = useState<RecipeItem[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await call<{ recipes: RecipeItem[]; canEdit: boolean }>(url(equipment));
    if (!r.ok) {
      setError(r.status === 0 ? "웹 서버에 닿지 않습니다." : `레시피 목록을 읽지 못했습니다(${r.status}).`);
      return;
    }
    setError(null);
    setList(r.data.recipes);
    setCanEdit(r.data.canEdit);
  }, [equipment]);

  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
  }, [reload, enabled]);

  const get = useCallback((id: string) => call<{ recipe: RecipeFull }>(url(equipment, id)), [equipment]);

  /** id 가 있으면 고치기(updatedAt 이 다르면 409 stale), 없으면 새로 */
  const save = useCallback(async (body: SaveBody, id?: string | null, updatedAt?: string | null) => {
    const r = id
      ? await call<{ recipe: RecipeFull; check: CheckCount }>(url(equipment, id),
          { method: "PUT", body: JSON.stringify({ name: body.name, rows: body.rows, gas: body.gas, updatedAt }) })
      : await call<{ recipe: RecipeFull; check: CheckCount }>(url(equipment), { method: "POST", body: JSON.stringify(body) });
    if (r.ok) void reload();
    return r;
  }, [equipment, reload]);

  const remove = useCallback(async (id: string) => {
    const r = await call<{ ok: true }>(url(equipment, id), { method: "DELETE" });
    if (r.ok) void reload();
    return r;
  }, [equipment, reload]);

  return { list, canEdit, error, reload, get, save, remove };
}

export const RECIPE_ERROR: Record<string, string> = {
  forbidden: "권한 없음 — 레시피 저장은 장비 담당자·관리자만",
  name_taken: "같은 이름의 레시피가 있습니다",
  stale: "다른 사람이 먼저 고쳤습니다 — 다시 열어 확인하세요",
  bad_name: "이름은 1~80자",
  too_large: "레시피가 너무 큽니다(256 KB)",
  not_found: "레시피가 없습니다(지워졌을 수 있음)",
  network: "웹 서버에 닿지 않음",
};
