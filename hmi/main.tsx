// 노트북 로컬 화면(W-7) 진입점 — 챔버K v2 장비 화면(Chk2Device)을 local 모드로. scripts/hmi-build.mjs 가 esbuild 로 묶어
// 챔버K v2\hmi 에 넣는다(로컬 서버 chk/local_server.py 가 정적 파일로 낸다 — 같은 주소의 /api/v1/*).
// 웹 앱(next build)에는 들어가지 않는다.
import { StrictMode, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Chk2Device } from "@/components/ops2/chk/Chk2Page";

function App() {
  const dirtyRef = useRef(false);                 // 로컬 화면에는 레시피 편집이 없다(Chk2Device 가 받는 자리만)
  return (
    <div className="mx-auto max-w-[1800px] space-y-3 p-3 sm:p-4">
      <Chk2Device equipment="local" mode="local" dirtyRef={dirtyRef} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
