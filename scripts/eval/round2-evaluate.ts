// 정답셋 2차 평가: 쌍마다 "현재" 묶음 결과를 보고, 표본을 뽑은 구간(stratum)의 크기로 가중해 전체를 추정한다.
// (구간 = 표본을 뽑을 때의 결과. 규칙이 바뀌어도 가중치는 그대로 쓸 수 있다: 층화 표본의 Horvitz–Thompson 추정)
// 사용: node scripts/evaluate-v2.ts 닭가슴살
import { readFileSync } from "node:fs";
import { pairKey } from "../lib/group.ts";

const name = process.argv[2] || "닭가슴살";
const { population, rows } = JSON.parse(readFileSync(`data/labels/labels-${name}-v2-key.json`, "utf8"));
const { answers } = JSON.parse(readFileSync(`data/labels/labels-${name}-v2-answers.json`, "utf8"));
const grouping = JSON.parse(readFileSync(`data/work/groups-${name}.json`, "utf8"));
const groupOf = new Map<string, string>();
for (const [g, ids] of Object.entries(grouping.groups as Record<string, string[]>)) for (const id of ids) groupOf.set(id, g);
const review = new Set((grouping.review as { a: string; b: string }[]).map((r) => pairKey(r.a, r.b)));

type Row = { no: number; a: string; b: string; stratum: string };
const n: Record<string, number> = {};
for (const r of rows as Row[]) n[r.stratum] = (n[r.stratum] ?? 0) + 1;
const weight = (r: Row) => population[r.stratum] / n[r.stratum];

let tp = 0, fp = 0, fn = 0, fnInReview = 0;
const errors: string[] = [];
for (const r of rows as Row[]) {
  const [truth, note] = answers[r.no];
  const merged = groupOf.get(r.a) === groupOf.get(r.b);
  const inReview = review.has(pairKey(r.a, r.b));
  const w = weight(r);
  if (merged && truth === "같음") tp += w;
  else if (merged) (fp += w), errors.push(`  #${r.no} 잘못 묶음 (정답 ${truth}) ${note}`);
  else if (truth === "같음") {
    fn += w;
    if (inReview) fnInReview += w;
    errors.push(`  #${r.no} 못 묶음${inReview ? " [검수 대기]" : ""} ${note}`);
  }
}
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
console.log(`정답셋 2차 ${rows.length}쌍 (1차 50쌍과 겹치지 않음), 구간 크기로 가중한 전체 추정`);
console.log(`  정밀도 ${pct(tp / (tp + fp))}  — 자동으로 묶은 쌍 중 같은 상품`);
console.log(`  재현율 ${pct(tp / (tp + fn))}  — 같은 상품 쌍 중 자동으로 묶은 것`);
console.log(`  검수까지 포함한 재현율 ${pct((tp + fnInReview) / (tp + fn))}`);
console.log(`  (추정 쌍 수: 맞게 묶음 ${tp.toFixed(0)} · 잘못 묶음 ${fp.toFixed(0)} · 못 묶음 ${fn.toFixed(0)}, 그중 검수 대기 ${fnInReview.toFixed(0)})`);
console.log("틀린 표본:\n" + errors.join("\n"));
