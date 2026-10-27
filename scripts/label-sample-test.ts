// 최종 시험용 정답셋: 규칙 동결 뒤 한 번만 쓴다.
// - 1·2차 정답셋에 나온 레코드가 들어간 쌍은 모두 뺀다 (규칙을 고칠 때 본 이름이라 누출 가능)
// - 코드·결과 파일 해시를 함께 저장해, 평가 때 동결 이후 바뀐 게 없는지 확인한다
// 사용: node scripts/label-sample-test.ts 닭가슴살
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pairKey } from "../lib/group.ts";
import { jaccard, scorePair } from "../lib/score.ts";
import { sameCompanyFamily, type NormalizedRecord } from "../lib/normalize.ts";

const name = process.argv[2] || "닭가슴살";
const out = `data/labels/labels-${name}-test-key.json`;
if (existsSync(out)) throw new Error(`${out}가 이미 있습니다. 시험용 표본은 한 번만 뽑습니다.`);

const readJsonl = (p: string) => (existsSync(p) ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const recs: NormalizedRecord[] = readJsonl(`data/work/normalized-${name}.jsonl`);
const candidates = readJsonl(`data/work/candidates-${name}.jsonl`);
const grouping = JSON.parse(readFileSync(`data/work/groups-${name}.json`, "utf8"));

// 이미 본 레코드
const seen = new Set<string>();
const v1 = JSON.parse(readFileSync(`data/labels/labels-${name}-key.json`, "utf8"));
const v2 = JSON.parse(readFileSync(`data/labels/labels-${name}-v2-key.json`, "utf8")).rows;
for (const k of [...v1, ...v2]) seen.add(k.a), seen.add(k.b);
const fresh = (p: { a: string; b: string }) => !seen.has(p.a) && !seen.has(p.b);

const groupOf = new Map<string, string>();
for (const [g, ids] of Object.entries(grouping.groups as Record<string, string[]>)) for (const id of ids) groupOf.set(id, g);
const review = new Set((grouping.review as { a: string; b: string }[]).map((r) => pairKey(r.a, r.b)));
const candKeys = new Set(candidates.map((p) => pairKey(p.a, p.b)));

type Pair = { a: string; b: string };
const strata: Record<string, Pair[]> = { merged: [], review: [], ambiguousKept: [], ruleConflict: [], lowMaterials: [], outsideCandidates: [] };
for (const ids of Object.values(grouping.groups as Record<string, string[]>))
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) strata.merged.push({ a: ids[i], b: ids[j] });
for (const p of candidates) {
  if (groupOf.get(p.a) === groupOf.get(p.b)) continue;
  if (review.has(pairKey(p.a, p.b))) strata.review.push(p);
  else if (p.band === "ambiguous") strata.ambiguousKept.push(p);
  else if (p.score.conflict) strata.ruleConflict.push(p);
  else strata.lowMaterials.push(p); // 이름은 닮았지만 원재료가 달라 규칙이 뺀 쌍 (2차에 없던 구간)
}
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

let seed = 20261026;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const sample = <T,>(xs: T[], n: number) => xs.map((x) => [rand(), x] as const).sort((p, q) => p[0] - q[0]).slice(0, n).map((p) => p[1]);
const sizes: Record<string, number> = { merged: 50, review: 30, ambiguousKept: 20, ruleConflict: 30, lowMaterials: 20, outsideCandidates: 20 };

// 모집단 = 구간별 "새 레코드끼리" 쌍 (가중치도 이 기준)
const population = Object.fromEntries(Object.entries(strata).map(([k, v]) => [k, v.filter(fresh).length]));
const rows: { no: number; a: string; b: string; stratum: string }[] = [];
for (const [s, n] of Object.entries(sizes)) for (const p of sample(strata[s].filter(fresh), n)) rows.push({ no: rows.length + 1, a: p.a, b: p.b, stratum: s });

// 동결 증거: 규칙 코드와 결과 파일 해시
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const frozen: Record<string, string> = {};
for (const dir of ["lib", "scripts"]) for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) frozen[`${dir}/${f}`] = sha(`${dir}/${f}`);
for (const f of [`data/work/groups-${name}.json`, `data/work/candidates-${name}.jsonl`]) frozen[f] = sha(f);

writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), seed: 20261026, excludedRecords: seen.size, population, frozen, rows }, null, 1));
console.log(`제외한 레코드 ${seen.size}개. 구간별 모집단(새 레코드끼리):`, population, `→ 표본 ${rows.length}쌍`);
