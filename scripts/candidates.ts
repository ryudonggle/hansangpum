// 정제 레코드 → 후보 쌍 + 규칙 점수 → data/work/candidates-<이름>.jsonl
// 같은 회사 계열 안에서만 비교하고(blocking), 이름이 어느 정도 닮은 쌍만 남긴다.
// 사용: node scripts/candidates.ts 닭가슴살
import { readFileSync, writeFileSync } from "node:fs";
import { sameCompanyFamily, type NormalizedRecord } from "../lib/normalize.ts";
import { bandOf, bigramDice, scorePair, type Band, type PairScore } from "../lib/score.ts";

const name = process.argv[2] || "닭가슴살";
const MIN_NAME = 0.5; // 이보다 이름이 덜 닮으면 후보에서 뺀다
const recs: NormalizedRecord[] = readFileSync(`data/work/normalized-${name}.jsonl`, "utf8").trim().split("\n").map((l: string) => JSON.parse(l));

// 회사 계열 묶음: "하림"과 "하림산업"처럼 이름이 이어지는 회사는 한 통에 넣는다
const roots = [...new Set(recs.map((r) => r.company.root))].sort();
const family = new Map<string, string>();
for (const root of roots) {
  const head = [...family.keys()].find((k) => sameCompanyFamily({ root: k, site: null }, { root, site: null }));
  family.set(root, head ? family.get(head)! : root);
}
const buckets = new Map<string, NormalizedRecord[]>();
for (const r of recs) {
  const f = family.get(r.company.root)!;
  (buckets.get(f) ?? buckets.set(f, []).get(f)!).push(r);
}

let compared = 0;
const pairs: { a: string; b: string; aName: string; bName: string; score: PairScore; band: Band }[] = [];
for (const list of buckets.values()) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      compared++;
      const [a, b] = [list[i], list[j]];
      if (bigramDice(a.name.key, b.name.key) < MIN_NAME) continue;
      const score = scorePair(a, b);
      pairs.push({ a: a.reportNo, b: b.reportNo, aName: a.name.display, bName: b.name.display, score, band: bandOf(score) });
    }
  }
}

writeFileSync(`data/work/candidates-${name}.jsonl`, pairs.map((p) => JSON.stringify(p)).join("\n") + "\n");
const by = (band: string) => pairs.filter((p) => p.band === band);
console.log(`회사 계열 ${buckets.size}통, 비교 ${compared.toLocaleString()}쌍 → 후보 ${pairs.length}쌍`);
console.log(`  자동 묶기 ${by("merge").length} · 애매(Jev) ${by("ambiguous").length} · 따로 ${by("separate").length}`);
console.log(`저장: data/work/candidates-${name}.jsonl`);
