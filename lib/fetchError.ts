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
