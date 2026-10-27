// 최종 시험 결과 (동결 버전, 2026-10-26). scripts/evaluate-test.ts 출력 그대로.
// 규칙을 바꾸면 이 숫자는 새 버전에 해당하지 않는다 → 새 시험셋으로 다시 잰다.
export const QUALITY = {
  measuredAt: "2026-10-26",
  sample: 170,
  precision: 92.0,
  precisionLow: 81.2, // 95% 신뢰구간 하한 (자동 묶음 표본 46/50, Wilson)
  recall: 81.4,
  recallWithReview: 100.0,
  labeler: "Claude(API 미사용)",
};
