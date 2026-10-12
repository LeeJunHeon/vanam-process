// 포털 런처 연동 — 메뉴 주소(?page=) 읽기·쓰기와 사용 기록 전송.
// 모두 브라우저 전용이라 useEffect·이벤트 핸들러 안에서만 부른다.

const APP = "process";

/** 주소의 ?page= 값(없으면 null). 유효성 검사는 호출부가 한다. */
export function readPageParam(): string | null {
  return new URLSearchParams(window.location.search).get("page");
}

/** 주소의 page 파라미터를 바꾼다(null 이면 지움). 다른 파라미터·해시는 그대로, 기록은 남기지 않는다. */
export function writePageParam(page: string | null): void {
  const url = new URL(window.location.href);
  if (page) url.searchParams.set("page", page);
  else url.searchParams.delete("page");
  if (url.href !== window.location.href) {
    // Next.js 가 history 를 감싸 자체 상태를 유지하므로 문서대로 state 는 null 로 넘긴다
    window.history.replaceState(null, "", url);
  }
}

/** 사용자가 직접 메뉴를 옮겼을 때 포털에 1건 보낸다. 실패는 무시한다. */
export function sendLauncherUsage(page: string): void {
  try {
    // BasePathFetch 가 "/..." 문자열 주소에 basePath 를 붙이므로 반드시 origin 을 붙인 절대 주소로 보낸다
    const url = `${window.location.origin}/api/launcher/usage`;
    const body = JSON.stringify({ app: APP, page });
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      fetch(url, {
        method: "POST",
        keepalive: true,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => {});
    }
  } catch {
    // 기록 실패는 화면 동작에 영향을 주지 않는다
  }
}
