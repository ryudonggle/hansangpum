// 정답셋 2차: 1차 50쌍과 겹치지 않게, 현재 파이프라인 결과 구간(stratum)별로 뽑는다.
// 구간별 전체 쌍 수도 저장해 두어, 평가 때 표본을 전체 비율로 되돌려(가중) 추정한다.
// 사용: node scripts/label-sample-v2.ts 닭가슴살
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pairKey } from "../lib/group.ts";
import { jaccard, scorePair } from "../lib/score.ts";
import { sameCompanyFamily, type NormalizedRecord } from "../lib/normalize.ts";

const name = process.argv[2] || "닭가슴살";
const readJsonl = (p: string) => (existsSync(p) ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const recs: NormalizedRecord[] = readJsonl(`data/work/normalized-${name}.jsonl`);
const candidates = readJsonl(`data/work/candidates-${name}.jsonl`);
const grouping = JSON.parse(readFileSync(`data/work/groups-${name}.json`, "utf8"));
const used = new Set(JSON.parse(readFileSync(`data/labels/labels-${name}-key.json`, "utf8")).map((k: { a: string; b: string }) => pairKey(k.a, k.b)));

const groupOf = new Map<string, string>();
for (const [g, ids] of Object.entries(grouping.groups as Record<string, string[]>)) for (const id of ids) groupOf.set(id, g);
const review = new Set((grouping.review as { a: string; b: string }[]).map((r) => pairKey(r.a, r.b)));
const candKeys = new Set(candidates.map((p) => pairKey(p.a, p.b)));

type Pair = { a: string; b: string };
const strata: Record<string, Pair[]> = { merged: [], review: [], ambiguousKept: [], ruleSeparate: [], outsideCandidates: [] };
// 자동 묶음: 같은 묶음 안 모든 쌍
for (const ids of Object.values(grouping.groups as Record<string, string[]>))
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) strata.merged.push({ a: ids[i], b: ids[j] });
for (const p of candidates) {
  if (groupOf.get(p.a) === groupOf.get(p.b)) continue;
  if (review.has(pairKey(p.a, p.b))) strata.review.push(p);
  else if (p.band === "ambiguous") strata.ambiguousKept.push(p);
  else if (p.score.conflict) strata.ruleSeparate.push(p);
}
// 후보 밖: 같은 회사 계열, 이름은 덜 닮았지만(<0.5) 원재료가 거의 같은 쌍 → 이름을 바꾼 같은 상품이 숨어 있나
const byRoot = new Map<string, NormalizedRecord[]>();
for (const r of recs) (byRoot.get(r.company.root) ?? byRoot.set(r.company.root, []).get(r.company.root)!).push(r);
for (const list of byRoot.values())
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i], list[j]];
      if (candKeys.has(pairKey(a.reportNo, b.reportNo)) || !sameCompanyFamily(a.company, b.company)) continue;
      if (a.type === b.type && jaccard(a.materials, b.materials) >= 0.8 && !scorePair(a, b).conflict?.startsWith("회사"))
        strata.outsideCandidates.push({ a: a.reportNo, b: b.reportNo });
    }

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const sample = <T,>(xs: T[], n: number) => xs.map((x) => [rand(), x] as const).sort((p, q) => p[0] - q[0]).slice(0, n).map((p) => p[1]);
const sizes = { merged: 40, review: 30, ambiguousKept: 20, ruleSeparate: 30, outsideCandidates: 20 };

const rows: { no: number; a: string; b: string; stratum: string }[] = [];
for (const [s, n] of Object.entries(sizes))
  for (const p of sample(strata[s].filter((p) => !used.has(pairKey(p.a, p.b))), n)) rows.push({ no: rows.length + 1, a: p.a, b: p.b, stratum: s });
writeFileSync(`data/labels/labels-${name}-v2-key.json`, JSON.stringify({ population: Object.fromEntries(Object.entries(strata).map(([k, v]) => [k, v.length])), rows }, null, 1));
console.log("구간별 전체 쌍 수:", Object.fromEntries(Object.entries(strata).map(([k, v]) => [k, v.length])), "→ 표본", rows.length);
