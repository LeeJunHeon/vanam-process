// 서버가 켜질 때 한 번(Next.js instrumentation register) — 챔버K v2 구글챗 알림 보내기 타이머(W-6, lib/ops2/chat).
// Node.js 런타임에서만(edge 는 DB·타이머를 쓰지 않는다), next build 중에는 켜지 않는다(빌드 DB 는 자리표시).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startChat } = await import("./lib/ops2/chat");
    startChat();
  }
}
