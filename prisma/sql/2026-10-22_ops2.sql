-- 챔버K v2 장비 연결(ops2) 표 — process 스키마. v1 ops_* 표는 건드리지 않는다.
-- 운영 반영: DBeaver 로 이 파일 전체를 한 번 실행(다시 실행해도 됨 — IF NOT EXISTS·ON CONFLICT DO NOTHING).
-- prisma/schema.prisma 의 Ops2* 모델과 같다(prisma migrate diff 로 만든 것에 IF NOT EXISTS 만 붙임).
-- 시각 열은 모두 UTC(TIMESTAMP(3), Prisma 기본).

BEGIN;
-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_device" (
    "equipment" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "holder_instance" TEXT,
    "holder_seen_at" TIMESTAMP(3),
    "run_mode" TEXT,
    "writes_allowed" BOOLEAN,
    "program" TEXT,
    "version" TEXT,
    "schema_hash" TEXT,
    "web_schema_hash" TEXT,
    "config_version" INTEGER,
    "clock_skew_ms" INTEGER,
    "clock_checked_at" TIMESTAMP(3),
    "last_hello" JSONB,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops2_device_pkey" PRIMARY KEY ("equipment")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_instance" (
    "instance" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "program" TEXT,
    "version" TEXT,
    "run_mode" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "hello" JSONB,

    CONSTRAINT "ops2_instance_pkey" PRIMARY KEY ("instance")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_state" (
    "equipment" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "msg_id" TEXT,
    "ts" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "ops2_state_pkey" PRIMARY KEY ("equipment")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_web_schema" (
    "hash" TEXT NOT NULL,
    "version" INTEGER,
    "param_schema_hash" TEXT,
    "config_version" INTEGER,
    "bundle" JSONB NOT NULL,
    "first_equipment" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops2_web_schema_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_run" (
    "equipment" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "start_msg_id" TEXT,
    "end_msg_id" TEXT,
    "recipe_name" TEXT,
    "started_by" TEXT,
    "name" TEXT,
    "step_no" INTEGER,
    "params" JSONB,
    "blocks" JSONB,
    "config_version" INTEGER,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "result" TEXT,
    "reason_code" TEXT,
    "summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops2_run_pkey" PRIMARY KEY ("equipment","run_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_event" (
    "msg_id" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "seq" INTEGER,
    "run_id" TEXT,
    "ts" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "level" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rule_id" TEXT,
    "message" TEXT NOT NULL,
    "source" TEXT,
    "kind" TEXT,
    "context" JSONB,
    "acked_by" TEXT,
    "acked_at" TIMESTAMP(3),

    CONSTRAINT "ops2_event_pkey" PRIMARY KEY ("msg_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_summary" (
    "msg_id" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "from_ts" TIMESTAMP(3) NOT NULL,
    "to_ts" TIMESTAMP(3) NOT NULL,
    "rows" INTEGER NOT NULL,
    "vals" JSONB NOT NULL,
    "quality" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops2_summary_pkey" PRIMARY KEY ("msg_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_cmd_result" (
    "msg_id" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "seq" INTEGER,
    "ts" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "cmd_id" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason_code" TEXT,
    "source" TEXT,
    "requested_by" TEXT,
    "detail" TEXT,

    CONSTRAINT "ops2_cmd_result_pkey" PRIMARY KEY ("msg_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_command" (
    "id" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "target_instance" TEXT,
    "origin" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "args" JSONB NOT NULL DEFAULT '{}',
    "label" TEXT,
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "expires_at_server" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "sent_via" TEXT,
    "result_at" TIMESTAMP(3),
    "reason_code" TEXT,
    "detail" TEXT,
    "result_msg_id" TEXT,
    "local_cmd_id" TEXT,

    CONSTRAINT "ops2_command_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_config_ack" (
    "msg_id" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER,
    "status" TEXT NOT NULL,
    "reason_code" TEXT,
    "kind" TEXT,
    "requested_by" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "ops2_config_ack_pkey" PRIMARY KEY ("msg_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_config_version" (
    "equipment" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "vals" JSONB NOT NULL,
    "param_schema_hash" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "cmd_id" TEXT,
    "ack_status" TEXT,
    "ack_at" TIMESTAMP(3),
    "reason_code" TEXT,
    "errors" JSONB,
    "applied_keys" JSONB,
    "pending_keys" JSONB,
    "overridden_keys" JSONB,
    "changes" JSONB,
    "ack_msg_id" TEXT,

    CONSTRAINT "ops2_config_version_pkey" PRIMARY KEY ("equipment","version")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_bad_message" (
    "id" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "instance" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "error" TEXT NOT NULL,
    "raw" JSONB,

    CONSTRAINT "ops2_bad_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_instance_equipment_first_seen_at_idx" ON "process"."ops2_instance"("equipment", "first_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ops2_run_start_msg_id_key" ON "process"."ops2_run"("start_msg_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ops2_run_end_msg_id_key" ON "process"."ops2_run"("end_msg_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_run_equipment_started_at_idx" ON "process"."ops2_run"("equipment", "started_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_run_equipment_instance_started_at_idx" ON "process"."ops2_run"("equipment", "instance", "started_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_event_equipment_ts_idx" ON "process"."ops2_event"("equipment", "ts");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_event_equipment_run_id_idx" ON "process"."ops2_event"("equipment", "run_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_event_equipment_level_acked_at_idx" ON "process"."ops2_event"("equipment", "level", "acked_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_summary_equipment_from_ts_idx" ON "process"."ops2_summary"("equipment", "from_ts");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ops2_summary_equipment_instance_from_ts_key" ON "process"."ops2_summary"("equipment", "instance", "from_ts");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_cmd_result_equipment_ts_idx" ON "process"."ops2_cmd_result"("equipment", "ts");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_cmd_result_cmd_id_idx" ON "process"."ops2_cmd_result"("cmd_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ops2_command_result_msg_id_key" ON "process"."ops2_command"("result_msg_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_command_equipment_status_idx" ON "process"."ops2_command"("equipment", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_command_equipment_requested_at_idx" ON "process"."ops2_command"("equipment", "requested_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_config_ack_equipment_version_idx" ON "process"."ops2_config_ack"("equipment", "version");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ops2_config_version_ack_msg_id_key" ON "process"."ops2_config_version"("ack_msg_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_bad_message_equipment_received_at_idx" ON "process"."ops2_bad_message"("equipment", "received_at");

-- 장비 등록. token_hash 는 자리표시 — scripts/ops2-token.mjs 로 만든 해시로 UPDATE 한다
-- (자리표시 그대로면 그 장비의 연결은 모두 401).
INSERT INTO "process"."ops2_device" ("equipment", "token_hash", "label") VALUES
    ('CHK2', 'REPLACE_WITH_SHA256_HEX', '챔버K v2'),
    ('CHK2-SIM', 'REPLACE_WITH_SHA256_HEX', '챔버K v2 시뮬레이터(웹 개발용)')
ON CONFLICT ("equipment") DO NOTHING;

COMMIT;
