// 시트 '코드' 시트의 옵션 목록. "세금계산선"은 원본 오타라 "세금계산서"로 교정.
export const PROCESS_STATUSES = ["대기", "예약", "진행", "보류", "완료", "취소"] as const;
export const PAYMENT_STATUSES = ["미결제", "세금계산서 발급", "입금확인", "선금확인", "부분입금확인"] as const;
export const PRECHECK_STATUSES = ["해당없음", "미완료", "완료", "이상보고"] as const;
// 작업 묶음(work_order) 구분. 발주 = 고객 의뢰(관리자), 사내작업 = 직원이 공정 관리에서 등록
export const ORDER_KINDS = ["발주", "사내작업"] as const;

// 구분 칩
export const KIND_STYLE: Record<string, string> = {
  발주: "bg-blue-50 text-blue-600",
  사내작업: "bg-violet-50 text-violet-600",
};

// 상태 배지(셀 단위)
export const STATUS_STYLE: Record<string, string> = {
  대기: "bg-gray-100 text-gray-600",
  예약: "bg-blue-50 text-blue-600",
  진행: "bg-amber-50 text-amber-600",
  보류: "bg-orange-50 text-orange-600",
  완료: "bg-emerald-50 text-emerald-600",
  취소: "bg-rose-50 text-rose-500",
};

// 공정 테이블 행 배경(행 단위 구분). 취소는 흐리게 처리한다.
export const ROW_STYLE: Record<string, string> = {
  대기: "",
  예약: "bg-blue-50/40",
  진행: "bg-amber-50/60",
  보류: "bg-orange-50/60",
  완료: "bg-emerald-50/40",
  취소: "bg-rose-50/30 opacity-60",
};

// 캘린더 연동 상태 배지 (시트 '연동상태' 열의 값 체계 유지)
export const SYNC_STYLE: Record<string, string> = {
  동기화완료: "bg-emerald-50 text-emerald-600",
  미연동: "bg-gray-100 text-gray-500",
  "필수정보 부족": "bg-amber-50 text-amber-600",
  동기화오류: "bg-rose-50 text-rose-500",
  취소: "bg-gray-100 text-gray-400",
};
