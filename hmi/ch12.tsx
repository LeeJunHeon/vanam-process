// 노트북 로컬 화면 진입점 — 챔버12(CH1&2) v2 장비 화면(Ch12Device)을 local 모드로. scripts/hmi-build.mjs --target ch12 가 esbuild 로
// 묶어 Chamber.Total_program v2\hmi 에 넣는다(로컬 서버 v2/ch12/local_server.py 가 정적 파일로 낸다 — 같은 주소의 /api/v1/*).
// 챔버K 진입점(hmi/main.tsx)과 같은 모양. 웹 앱(next build)에는 들어가지 않는다.
import { StrictMode, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Ch12Device } from "@/components/ops2/ch12/Ch12Page";

function App() {
  const dirtyRef = useRef(false);                 // 로컬 화면에는 레시피 편집이 없다(Ch12Device 가 받는 자리만)
  return (
    <div className="mx-auto max-w-[1920px] space-y-3 p-3 sm:p-4">
      <Ch12Device equipment="local" mode="local" dirtyRef={dirtyRef} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
