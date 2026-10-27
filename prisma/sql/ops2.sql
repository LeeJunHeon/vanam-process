-- 챔버K v2 장비 연결(ops2) 표 — process 스키마. v1 ops_* 표는 건드리지 않는다.
-- prisma/schema.prisma 의 Ops2* 모델과 같다(prisma migrate diff 결과에 IF NOT EXISTS 만 붙임). FK 없음.
-- 단계(W-2 …)마다 이 파일에 표를 더한다. 운영 DB 에는 W-8 배포 직전에 한 번 실행한다(DBeaver).
-- 다시 실행해도 된다(IF NOT EXISTS · ON CONFLICT DO NOTHING).

BEGIN;

CREATE SCHEMA IF NOT EXISTS "process";

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_device" (
    "equipment" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "token_hash" TEXT,
    "holder_instance" TEXT,
    "holder_seen_at" TIMESTAMPTZ(6),
    "conflict_instance" TEXT,
    "conflict_at" TIMESTAMPTZ(6),
    "run_mode" TEXT,
    "writes_allowed" BOOLEAN,
    "program" TEXT,
    "version" TEXT,
    "schema_hash" TEXT,
    "web_schema_hash" TEXT,
    "config_version" INTEGER,
    "clock_skew_ms" INTEGER,
    "last_hello" JSONB,
    "last_hello_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops2_device_pkey" PRIMARY KEY ("equipment")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_instance" (
    "instance" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "program" TEXT,
    "version" TEXT,
    "run_mode" TEXT,
    "schema_hash" TEXT,
    "web_schema_hash" TEXT,
    "config_version" INTEGER,
    "snapshot_columns" JSONB,
    "command_kinds" JSONB,
    "writes_allowed" BOOLEAN,
    "hello_at" TIMESTAMPTZ(6),
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ops2_instance_pkey" PRIMARY KEY ("instance")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_state" (
    "equipment" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "msg_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "ts" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "proc_state" TEXT,
    "run_id" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "ops2_state_pkey" PRIMARY KEY ("equipment")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_web_schema" (
    "hash" TEXT NOT NULL,
    "version" INTEGER,
    "param_schema_hash" TEXT,
    "bundle" JSONB NOT NULL,
    "first_equipment" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ops2_web_schema_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_run" (
    "run_id" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
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
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "result" TEXT,
    "reason_code" TEXT,
    "summary" JSONB,

    CONSTRAINT "ops2_run_pkey" PRIMARY KEY ("run_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_event" (
    "msg_id" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "run_id" TEXT,
    "ts" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "level" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rule_id" TEXT,
    "message" TEXT NOT NULL,
    "source" TEXT,
    "kind" TEXT,
    "context" JSONB,
    "acked_by" TEXT,
    "acked_at" TIMESTAMPTZ(6),

    CONSTRAINT "ops2_event_pkey" PRIMARY KEY ("msg_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_summary" (
    "msg_id" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "from_ts" TIMESTAMPTZ(6) NOT NULL,
    "to_ts" TIMESTAMPTZ(6) NOT NULL,
    "row_count" INTEGER NOT NULL,
    "stats" JSONB NOT NULL,
    "quality" JSONB NOT NULL,

    CONSTRAINT "ops2_summary_pkey" PRIMARY KEY ("msg_id")
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
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "expires_at_server" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "last_sent_at" TIMESTAMPTZ(6),
    "send_count" INTEGER NOT NULL DEFAULT 0,
    "sent_via" TEXT,
    "result_at" TIMESTAMPTZ(6),
    "result_received_at" TIMESTAMPTZ(6),
    "reason_code" TEXT,
    "detail" TEXT,
    "result_msg_id" TEXT,
    "result_instance" TEXT,

    CONSTRAINT "ops2_command_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_config_version" (
    "equipment" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "param_values" JSONB NOT NULL,
    "param_schema_hash" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "cmd_id" TEXT,
    "ack_status" TEXT,
    "ack_at" TIMESTAMPTZ(6),
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
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT NOT NULL,
    "raw" TEXT,

    CONSTRAINT "ops2_bad_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "process"."ops2_operator" (
    "equipment" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops2_operator_pkey" PRIMARY KEY ("equipment","employee_id")
);

-- CreateTable (W-4a)
CREATE TABLE IF NOT EXISTS "process"."ops2_recipe" (
    "id" TEXT NOT NULL,
    "base_equipment" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rows" JSONB NOT NULL DEFAULT '[]',
    "gas" JSONB,
    "bundle_version" INTEGER,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops2_recipe_pkey" PRIMARY KEY ("id")
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
CREATE INDEX IF NOT EXISTS "ops2_event_equipment_ts_idx" ON "process"."ops2_event"("equipment", "ts");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_event_run_id_idx" ON "process"."ops2_event"("run_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_event_equipment_level_acked_at_idx" ON "process"."ops2_event"("equipment", "level", "acked_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_summary_equipment_from_ts_idx" ON "process"."ops2_summary"("equipment", "from_ts");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_summary_run_id_idx" ON "process"."ops2_summary"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ops2_command_result_msg_id_key" ON "process"."ops2_command"("result_msg_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_command_equipment_status_idx" ON "process"."ops2_command"("equipment", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_command_equipment_requested_at_idx" ON "process"."ops2_command"("equipment", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ops2_config_version_ack_msg_id_key" ON "process"."ops2_config_version"("ack_msg_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ops2_operator_employee_id_idx" ON "process"."ops2_operator"("employee_id");

-- CreateIndex (W-4a)
CREATE UNIQUE INDEX IF NOT EXISTS "ops2_recipe_base_equipment_kind_name_key" ON "process"."ops2_recipe"("base_equipment", "kind", "name");

-- CreateTable (W-6 구글챗 알림 outbox)
CREATE TABLE IF NOT EXISTS "process"."ops2_chat_outbox" (
    "id" SERIAL NOT NULL,
    "equipment" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "msg_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "tries" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "ops2_chat_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (W-6)
CREATE UNIQUE INDEX IF NOT EXISTS "ops2_chat_outbox_msg_id_key" ON "process"."ops2_chat_outbox"("msg_id");

-- CreateIndex (W-6)
CREATE INDEX IF NOT EXISTS "ops2_chat_outbox_status_next_at_idx" ON "process"."ops2_chat_outbox"("status", "next_at");

-- CreateIndex (W-6)
CREATE INDEX IF NOT EXISTS "ops2_chat_outbox_equipment_created_at_idx" ON "process"."ops2_chat_outbox"("equipment", "created_at");

-- 장비 등록. token_hash 는 비워 둔다(비어 있으면 그 장비의 연결은 모두 401) —
-- node scripts/ops2-token.mjs <장비ID> 가 보여 주는 UPDATE 로 넣는다.
INSERT INTO "process"."ops2_device" ("equipment", "label") VALUES
    ('CHK2', '챔버K'),
    ('CHK2-SIM', '챔버K 시뮬레이터')
ON CONFLICT ("equipment") DO NOTHING;

COMMIT;
