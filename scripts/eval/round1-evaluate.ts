// 정답셋으로 "같은 상품" 판정 품질을 잰다: 규칙만 vs 규칙+Jev vs 최종 묶음(연쇄 방지 포함)
// 사용: node scripts/eval/round1-evaluate.ts 닭가슴살
import { readFileSync } from "node:fs";
import { SAME_MIN } from "../../lib/judge.ts";

const name = process.argv[2] || "닭가슴살";
const keys: { no: number; a: string; b: string; band: string; jev: string | null; jevProb: Record<string, number> | null }[] =
  JSON.parse(readFileSync(`data/labels/${name}/round1-key.json`, "utf8"));
const { answers } = JSON.parse(readFileSync(`data/labels/${name}/round1-answers.json`, "utf8"));
const { groups } = JSON.parse(readFileSync(`data/work/groups-${name}.json`, "utf8"));
const groupOf = new Map<string, string>();
for (const [root, ids] of Object.entries(groups as Record<string, string[]>)) for (const id of ids) groupOf.set(id, root);

// 구간은 지금 규칙으로 다시 계산한다 (정답셋을 뽑은 뒤 규칙이 바뀌었을 수 있음)
const bandNow = new Map<string, string>(
  readFileSync(`data/work/candidates-${name}.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((p) => [`${p.a}|${p.b}`, p.band]),
);
const rows = keys.map((k) => {
  const band = bandNow.get(`${k.a}|${k.b}`) ?? "separate";
  const jev = band === "ambiguous" ? { jev: k.jev, jevProb: k.jevProb } : { jev: null, jevProb: null };
  return { ...k, band, ...jev, truth: answers[String(k.no)][0] as string };
});
const same = (r: (typeof rows)[number]) => r.truth === "같음";

function report(label: string, predict: (r: (typeof rows)[number]) => boolean) {
  let tp = 0, fp = 0, fn = 0;
  for (const r of rows) {
    const p = predict(r);
    if (p && same(r)) tp++;
    else if (p) fp++;
    else if (same(r)) fn++;
  }
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  console.log(`${label.padEnd(28)} 정밀도 ${(precision * 100).toFixed(0).padStart(3)}% (${tp}/${tp + fp})  재현율 ${(recall * 100).toFixed(0).padStart(3)}% (${tp}/${tp + fn})`);
  return { tp, fp, fn };
}

console.log(`정답셋 ${rows.length}쌍 (같음 ${rows.filter(same).length} · OEM ${rows.filter((r) => r.truth === "OEM").length} · 다름 ${rows.filter((r) => r.truth === "다름").length}), 구간별로 골라 뽑은 표본\n`);
report("규칙만", (r) => r.band === "merge");
report(`규칙 + Jev (≥${SAME_MIN})`, (r) => r.band === "merge" || (r.jevProb?.same_product ?? 0) >= SAME_MIN);
report("최종 묶음 (연쇄 방지 포함)", (r) => groupOf.get(r.a) === groupOf.get(r.b));

console.log("\nJev 기준값 바꿔 보기");
for (const t of [0.5, 0.6, 0.7, 0.8, 0.9]) report(`  same_product ≥ ${t}`, (r) => r.band === "merge" || (r.jevProb?.same_product ?? 0) >= t);

const judged = rows.filter((r) => r.jev);
const map: Record<string, string> = { same_product: "같음", oem_sibling: "OEM", different_product: "다름" };
const hit = judged.filter((r) => map[r.jev!] === r.truth).length;
console.log(`\nJev 3분류 일치 ${hit}/${judged.length} (${((hit / judged.length) * 100).toFixed(0)}%)`);
for (const r of judged.filter((r) => map[r.jev!] !== r.truth))
  console.log(`  #${r.no} 정답 ${r.truth} ← Jev ${map[r.jev!]} (같음 ${(r.jevProb!.same_product).toFixed(2)})`);
const reviewKeys = new Set((JSON.parse(readFileSync(`data/work/groups-${name}.json`, "utf8")).review as { a: string; b: string }[]).map((r) => `${r.a}|${r.b}`));
const review = rows.filter((r) => reviewKeys.has(`${r.a}|${r.b}`));
console.log(`검수 대기로 빠진 정답셋 쌍 ${review.length}개: ${review.map((r) => `#${r.no}(${r.truth})`).join(" ")}`);
const missed = rows.filter((r) => same(r) && groupOf.get(r.a) !== groupOf.get(r.b));
console.log(`자동으로 못 묶은 '같음' ${missed.length}쌍 중 검수 대기에 있는 것 ${missed.filter((r) => reviewKeys.has(`${r.a}|${r.b}`)).length}쌍`);
