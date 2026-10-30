// fetch 실패를 사용자에게 보여줄 한글 메시지로 변환한다.
// TypeError("Failed to fetch")는 요청이 서버에 도달하기 전(DNS/네트워크)에
// 실패한 것이므로 별도 안내로 구분한다.
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof TypeError) {
    return "서버에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.";
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

// 목록 GET 을 JSON 으로 받는다. 실패 응답이면 서버가 준 error(없으면 "조회 실패 (상태)")로 throw 한다.
// 화면은 응답 콜백(.then)에서만 state 를 바꾼다 — effect 본문에서 setState 를 바로 부르지 않기 위해.
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.error ?? `조회 실패 (${res.status})`);
  }
  return (await res.json()) as T;
}
