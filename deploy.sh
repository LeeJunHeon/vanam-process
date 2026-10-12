#!/bin/bash
# 공정관리(process-web) 배포 — 사용법: bash deploy.sh (root 가 아니면 sudo -H 로 자신을 다시 실행)
# 본문 전체를 main() 으로 감싸 마지막 줄에서 호출한다. git pull 이 이 파일을 바꿔도
# bash 는 이미 읽어 둔 함수 내용으로 끝까지 실행한다.
set -euo pipefail

APP_DIR="/volume1/docker/process-web"
SERVICE="nextjs"
CONTAINER="process-web-nextjs"
WAIT_SEC=60
INTERVAL_SEC=5

is_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)" = "true" ]
}

main() {
  # 폴더 소유자가 jhlee 가 아니고 jhlee 는 홈 폴더가 없어 git 설정을 저장할 수 없으므로 root 로 실행한다
  if [ "$(id -u)" -ne 0 ]; then
    exec sudo -H bash "$0" "$@"
  fi

  cd "$APP_DIR"

  echo "[1/4] git pull"
  # dubious ownership 방지: root 의 safe.directory 에 없을 때만 추가한다(중복 방지)
  if ! git config --global --get-all safe.directory | grep -qxF "$APP_DIR"; then
    git config --global --add safe.directory "$APP_DIR"
  fi
  git pull

  echo "[2/4] docker compose build $SERVICE"
  export BUILDX_GIT_INFO=0
  docker compose build "$SERVICE"

  # stop 은 하지 않는다 — up -d 가 이미지가 바뀌면 컨테이너를 교체한다.
  # (stop 뒤 up -d 가 "Running" 만 찍고 컨테이너를 켜지 않은 적이 있다)
  echo "[3/4] docker compose up -d $SERVICE"
  docker compose up -d "$SERVICE"

  echo "[4/4] 실행 확인 (최대 ${WAIT_SEC}초)"
  local waited=0
  local retried=0
  until is_running; do
    if [ "$retried" -eq 0 ]; then
      echo "컨테이너가 실행 중이 아님 — docker compose up -d $SERVICE 다시 실행"
      docker compose up -d "$SERVICE"
      retried=1
    fi
    if [ "$waited" -ge "$WAIT_SEC" ]; then
      docker ps -a --filter "name=$CONTAINER"
      docker logs --tail 30 "$CONTAINER" || true
      echo "배포 실패: 컨테이너가 실행 중이 아님"
      exit 1
    fi
    sleep "$INTERVAL_SEC"
    waited=$((waited + INTERVAL_SEC))
  done

  git log --oneline -1
  docker ps --filter "name=$CONTAINER" --format '{{.Names}}  {{.Status}}'
  echo "배포 완료!"
}

main "$@"
