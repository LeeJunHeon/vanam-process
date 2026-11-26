"use client";

// 떠 있는 상자(도움말·설정 서랍·확인창·알림 토스트)를 document.body 에 그린다(W-23 A). 페이지 묶음의 흐름(space-y 여백)에 끼지 않아
// 뜨고 사라져도 페이지 높이·스크롤 높이가 바뀌지 않는다. 서버에서 그릴 때는 아무것도 그리지 않는다.
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

export function Float({ children }: { children: ReactNode }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  return client ? createPortal(children, document.body) : null;
}
