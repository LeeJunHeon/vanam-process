-- 챔버12(CH1&2) v2 장비 연결(ops2) — 추가만(기존 표·열은 바꾸거나 지우지 않는다). prisma/sql/ops2.sql 을 먼저 실행한 뒤에.
-- prisma/schema.prisma 의 Ops2Run(chamber·owner·recipeRev)·Ops2Summary(runIds) 와 같다. 다시 실행해도 된다(IF NOT EXISTS · ON CONFLICT DO NOTHING).
-- 운영 DB 에는 CH12 배포 직전에 한 번 실행한다(DBeaver). 시험 장비 CH12-SIM 은 prisma/sql/ops2-local-test.sql(로컬 DB 전용).

BEGIN;

-- 공정(run) — 챔버12 run_* 의 chamber(ch1·ch2·pc·tsp)·owner(robot·web·local)·recipeRev(공정 중 시퀀스 편집 판). 챔버K 행은 비어 있다
ALTER TABLE "process"."ops2_run" ADD COLUMN IF NOT EXISTS "chamber" TEXT;
ALTER TABLE "process"."ops2_run" ADD COLUMN IF NOT EXISTS "owner" TEXT;
ALTER TABLE "process"."ops2_run" ADD COLUMN IF NOT EXISTS "recipe_rev" INTEGER;

-- 1분 요약 — 챔버12 snapshot_summary.runIds(챔버별 마지막 run id)의 run id 목록(JSON 배열). 챔버K 행은 비어 있다
ALTER TABLE "process"."ops2_summary" ADD COLUMN IF NOT EXISTS "run_ids" JSONB;

-- CreateIndex — 챔버별 공정 기록(이력 화면 챔버 거르기)
CREATE INDEX IF NOT EXISTS "ops2_run_equipment_chamber_started_at_idx" ON "process"."ops2_run"("equipment", "chamber", "started_at");

-- 장비 등록(운영 장비 CH12). token_hash 는 비워 둔다(비어 있으면 그 장비의 연결은 모두 401) —
-- node scripts/ops2-token.mjs CH12 가 보여 주는 UPDATE 로 넣는다.
INSERT INTO "process"."ops2_device" ("equipment", "label") VALUES
    ('CH12', '챔버 CH1&2')
ON CONFLICT ("equipment") DO NOTHING;

COMMIT;
