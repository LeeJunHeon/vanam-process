-- 챔버K v2 시험 장비(로컬 개발 DB 전용 — 운영 DB 에는 넣지 않는다). prisma/sql/ops2.sql 을 먼저 실행한 뒤에.
-- 챔버12 CH12-SIM: 챔버12 sim(UPLINK_IN_SIM)·scripts/ops2-fake-device-ch12.mjs — prisma/sql/ops2-ch12.sql 도 먼저 실행.
-- CHK2-SIM: 챔버K sim(UPLINK_IN_SIM — 장비 ID 가 -SIM 으로 끝나야 웹에 붙는다), TEST-SIM: scripts/ops2-fake-device.mjs(합성 장비).
-- 토큰은 node scripts/ops2-token.mjs <장비ID> 가 보여 주는 UPDATE 로. 다시 실행해도 된다(ON CONFLICT DO NOTHING).
INSERT INTO "process"."ops2_device" ("equipment", "label") VALUES
    ('CHK2-SIM', '챔버K 시뮬레이터'),
    ('TEST-SIM', '합성 시험 장비'),
    ('CH12-SIM', '챔버 CH1&2 시뮬레이터')
ON CONFLICT ("equipment") DO NOTHING;
