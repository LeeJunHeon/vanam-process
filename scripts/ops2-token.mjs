// 챔버K v2 장비 토큰 만들기 — 사용법: node scripts/ops2-token.mjs CHK2
// 토큰(장비 노트북 local_override.json 의 UPLINK_TOKEN)과 sha256 해시(ops2_device.token_hash)를 화면에만 보여 주고 끝.
// 파일·DB 에 쓰지 않는다 — 잃어버리면 새로 만들어 해시를 바꾼다.
import { createHash, randomBytes } from "node:crypto";

const equipment = process.argv[2];
if (!equipment || !/^[A-Z0-9][A-Z0-9-]{1,15}$/.test(equipment)) {
  console.error("사용법: node scripts/ops2-token.mjs <장비 ID, 예: CHK2>");
  process.exit(1);
}

const token = randomBytes(32).toString("hex");
const hash = createHash("sha256").update(token, "utf8").digest("hex");

console.log(`장비 ID : ${equipment}`);
console.log(`토큰    : ${token}`);
console.log("          → 장비 노트북 local_override.json 의 UPLINK_TOKEN (이 화면을 닫으면 다시 볼 수 없음)");
console.log(`해시    : ${hash}`);
console.log("          → DB 에서 실행:");
console.log(`UPDATE process.ops2_device SET token_hash='${hash}' WHERE equipment='${equipment}';`);
