// 규칙 묶기 + Jev 판정 + 사람 판정 → 묶음·OEM 형제 링크·검수 대기열 → data/work/groups-<이름>.json
// 사용: node scripts/run-grouping.ts 닭가슴살 (사람 판정 반영 전체: npm run regroup)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildGroups, pairKey, type Edge } from "../lib/group.ts";
import { AUTO_MAX_EXTRA_CHARS, REVIEW_MIN, SAME_MIN } from "../lib/judge.ts";

const name = process.argv[2] || "닭가슴살";
const readJsonl = (p: string) => (existsSync(p) ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const ids: string[] = readJsonl(`data/work/normalized-${name}.jsonl`).map((r) => r.reportNo);
// 사람 판정(/admin, scripts/pull-human.ts)은 규칙·Jev보다 먼저 쓴다: 그 쌍은 규칙·Jev 결과를 무시하고 사람 결정을 따른다
const human = new Map<string, string>(readJsonl(`data/work/human-${name}.jsonl`).map((h) => [pairKey(h.a, h.b), h.relation]));
const byHuman = (p: { a: string; b: string }) => human.has(pairKey(p.a, p.b));
const HUMAN_VOTE = 1000; // 묶음 합치기 표에서 사람 결정이 항상 이기게
const candidates = readJsonl(`data/work/candidates-${name}.jsonl`);
// 규칙이 바뀌어 애매 구간에서 빠진 쌍의 옛 판정은 쓰지 않는다
const ambiguous = new Set(candidates.filter((p) => p.band === "ambiguous").map((p) => `${p.a}|${p.b}`));
const extraChars = new Map<string, number>(candidates.map((p) => [`${p.a}|${p.b}`, p.score.extraChars]));
const judgments = readJsonl(`data/work/judgments-${name}.jsonl`).filter((j) => ambiguous.has(`${j.a}|${j.b}`) && !byHuman(j));
// 애매 쌍인데 Jev 판정이 없으면(새로 수집한 레코드 등) 멈춘다: 그대로 묶으면 그 쌍은 묶이지도 검수로 가지도 않는다
const judged = new Set(readJsonl(`data/work/judgments-${name}.jsonl`).map((j) => `${j.a}|${j.b}`));
const unjudged = [...ambiguous].filter((k) => !judged.has(k) && !human.has(k));
if (unjudged.length && !process.argv.includes("--allow-unjudged"))
  throw new Error(`Jev 판정이 없는 애매 쌍 ${unjudged.length}개: node scripts/judge.ts ${name} 먼저 (무시하려면 --allow-unjudged)`);
const humanPairs = [...human].map(([k, relation]) => ({ a: k.split("|")[0], b: k.split("|")[1], relation }));
const autoOk = (j: { a: string; b: string }) => (extraChars.get(`${j.a}|${j.b}`) ?? 0) <= AUTO_MAX_EXTRA_CHARS;

const humanEdges: Edge[] = humanPairs.filter((h) => h.relation === "same_product").map(({ a, b }) => ({ a, b }));
const ruleEdges: Edge[] = candidates.filter((p) => p.band === "merge" && !byHuman(p)).map(({ a, b }) => ({ a, b }));
const jevEdges: Edge[] = judgments
  .filter((j) => j.probabilities.same_product >= SAME_MIN && autoOk(j))
  .sort((x, y) => y.probabilities.same_product - x.probabilities.same_product)
  .map(({ a, b }) => ({ a, b }));
// 확실히 다른 쌍: Jev가 같은 상품이 아니라고 본 쌍 + 규칙 충돌(보관·포장·단계·숫자·브랜드 접두어)
const cannotLink: Edge[] = [
  ...judgments.filter((j) => j.probabilities.same_product < REVIEW_MIN),
  ...candidates.filter((p) => p.score.conflict && !byHuman(p)),
  ...humanPairs.filter((h) => h.relation !== "same_product"),
].map(({ a, b }) => ({ a, b }));
// 묶음끼리 합칠 때 쓰는 표: 같음 +1 / 다름 -1 (규칙 "따로" 포함, 검수 대기는 0)
const votes = new Map<string, number>();
for (const p of candidates) votes.set(pairKey(p.a, p.b), p.band === "merge" ? 1 : p.band === "separate" ? -1 : 0);
for (const j of judgments) {
  const same = j.probabilities.same_product;
  votes.set(pairKey(j.a, j.b), same >= SAME_MIN && autoOk(j) ? 1 : same < REVIEW_MIN ? -1 : 0);
}
for (const h of humanPairs) votes.set(pairKey(h.a, h.b), h.relation === "same_product" ? HUMAN_VOTE : -HUMAN_VOTE);
// OEM 형제 후보: Jev 판정 + 규칙(한쪽에만 단어가 더 있고 원재료가 거의 같음 → 브랜드일 가능성)
const oemLinks = [
  ...judgments.filter((j) => j.relation === "oem_sibling" && j.probabilities.oem_sibling >= SAME_MIN),
  ...candidates
    .filter((p) => p.score.extraWords && p.score.materials >= 0.6 && !byHuman(p))
    .map((p) => ({ a: p.a, b: p.b, aName: p.aName, bName: p.bName, relation: "oem_sibling", source: "rule", probabilities: { oem_sibling: 1 } })),
  ...humanPairs.filter((h) => h.relation === "oem_sibling").map((h) => ({ ...h, source: "human", probabilities: { oem_sibling: 1 } })),
];
// 검수 대기 (사람이 이미 정한 쌍은 빠진다): Jev가 애매하게 본 쌍 + 단어 하나만 더 있는 쌍(자체 브랜드면 같은 상품, OEM 브랜드·재료면 다름 → 사람이 판단)
const review = [
  ...judgments
    .filter((j) => j.probabilities.same_product >= REVIEW_MIN && (j.probabilities.same_product < SAME_MIN || !autoOk(j)))
    .map((j) => ({ ...j, reason: autoOk(j) ? "Jev 확률이 애매함" : "한쪽에 글자가 더 붙음" })),
  ...candidates.filter((p) => p.score.extraWords && p.score.materials >= 0.6 && !byHuman(p)).map((p) => ({ ...p, reason: `단어 차이 "${p.score.extraWords}"` })),
];

const ruleOnly = buildGroups(ids, ruleEdges);
const groups = buildGroups(ids, [...humanEdges, ...ruleEdges, ...jevEdges], cannotLink, votes);
// 사람이 같다고 했는데 다른 사람 판정(다름·OEM)과 부딪쳐 못 묶은 쌍
const groupOf = new Map([...groups].flatMap(([gid, m]) => m.map((id) => [id, gid] as const)));
const humanBlocked = humanEdges.filter((e) => groupOf.get(e.a) !== groupOf.get(e.b));
const sizes = [...groups.values()].map((g) => g.length).sort((a, b) => b - a);

writeFileSync(
  `data/work/groups-${name}.json`,
  JSON.stringify({ thresholds: { SAME_MIN, REVIEW_MIN }, groups: Object.fromEntries(groups), oemLinks, review }, null, 1),
);
const pct = (n: number) => `${((1 - n / ids.length) * 100).toFixed(1)}%`;
console.log(`레코드 ${ids.length}건`);
console.log(`  규칙만      → ${ruleOnly.size}묶음 (중복 ${pct(ruleOnly.size)} 줄임)`);
console.log(`  규칙 + Jev  → ${groups.size}묶음 (중복 ${pct(groups.size)} 줄임), 2건 이상 묶음 ${sizes.filter((s) => s > 1).length}개, 가장 큰 묶음 ${sizes[0]}건`);
console.log(`  사람 판정 ${human.size}쌍 반영 (같음 ${humanEdges.length}${humanBlocked.length ? `, 그중 다른 사람 판정과 부딪쳐 못 묶음 ${humanBlocked.length}` : ""})`);
console.log(`  OEM 형제 링크 ${oemLinks.length}쌍 · 검수 대기 ${review.length}쌍 (Jev 판정 ${judgments.length}쌍 중)`);
