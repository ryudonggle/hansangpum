// 최종 시험 평가: 동결 해시가 그대로인지 먼저 확인하고, 다르면 평가하지 않는다.
// 사용: node scripts/eval/final-evaluate.ts 닭가슴살 [--record-reproduction]
// 동결(frozen) 뒤 파일을 옮기거나 실행 스크립트를 고쳤다면 --record-reproduction으로 다시 돌린다.
// 점수가 동결 때(lib/quality.ts)와 똑같을 때만 지금 파일 해시를 reproduced에 기록하고, 이후에는 그 기록으로 확인한다.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { pairKey } from "../../lib/group.ts";
import { QUALITY } from "../../lib/quality.ts";

const name = process.argv[2] || "닭가슴살";
const record = process.argv.includes("--record-reproduction");
const keyPath = `data/labels/${name}/final-key.json`;
const key = JSON.parse(readFileSync(keyPath, "utf8"));
const { answers } = JSON.parse(readFileSync(`data/labels/${name}/final-answers.json`, "utf8"));
const sha = (p: string) => { try { return createHash("sha256").update(readFileSync(p)).digest("hex"); } catch { return "없음"; } };
const changedIn = (set: Record<string, string>) => Object.entries(set).filter(([f, h]) => sha(f) !== h).map(([f]) => f);
const frozenChanged = changedIn(key.frozen);
const reproChanged = key.reproduced ? changedIn(key.reproduced.files) : null;
const verified = frozenChanged.length === 0 || reproChanged?.length === 0;
if (!verified && !record)
  throw new Error(`동결 이후 바뀐 파일이 있어 평가하지 않습니다: ${(reproChanged ?? frozenChanged).join(", ")}`);

const grouping = JSON.parse(readFileSync(`data/work/groups-${name}.json`, "utf8"));
const groupOf = new Map<string, string>();
for (const [g, ids] of Object.entries(grouping.groups as Record<string, string[]>)) for (const id of ids) groupOf.set(id, g);
const review = new Set((grouping.review as { a: string; b: string }[]).map((r) => pairKey(r.a, r.b)));

type Row = { no: number; a: string; b: string; stratum: string };
const rows: Row[] = key.rows;
const n: Record<string, number> = {};
for (const r of rows) n[r.stratum] = (n[r.stratum] ?? 0) + 1;

let tp = 0, fp = 0, fn = 0, fnReview = 0;
const perStratum: Record<string, { same: number; oem: number; diff: number; wrong: number }> = {};
const errors: string[] = [];
for (const r of rows) {
  const [truth, note] = answers[r.no];
  const w = key.population[r.stratum] / n[r.stratum];
  const merged = groupOf.get(r.a) === groupOf.get(r.b);
  const st = (perStratum[r.stratum] ??= { same: 0, oem: 0, diff: 0, wrong: 0 });
  st[truth === "같음" ? "same" : truth === "OEM" ? "oem" : "diff"]++;
  if (merged && truth === "같음") tp += w;
  else if (merged) (fp += w), st.wrong++, errors.push(`  #${r.no} 잘못 묶음 [${r.stratum}] 정답 ${truth} ${note}`);
  else if (truth === "같음") {
    fn += w;
    st.wrong++;
    if (review.has(pairKey(r.a, r.b))) fnReview += w;
    errors.push(`  #${r.no} 못 묶음 [${r.stratum}]${review.has(pairKey(r.a, r.b)) ? " (검수 대기)" : ""} ${note}`);
  }
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`최종 시험 ${rows.length}쌍 · 1·2차 레코드 ${key.excludedRecords}개 제외 · ` +
  (frozenChanged.length === 0 ? `동결 해시 ${Object.keys(key.frozen).length}개 일치` : verified ? `재현 기록(${key.reproduced.at}) 해시 일치` : "해시 확인 전 (재현 기록 모드)"));
console.table(Object.fromEntries(Object.entries(perStratum).map(([s, v]) => [s, { 표본: n[s], 모집단: key.population[s], ...v }])));
console.log(`정밀도 ${pct(tp / (tp + fp))} · 재현율 ${pct(tp / (tp + fn))} · 검수 포함 재현율 ${pct((tp + fnReview) / (tp + fn))}`);
console.log(`(가중 추정 쌍: 맞게 묶음 ${tp.toFixed(0)} · 잘못 묶음 ${fp.toFixed(0)} · 못 묶음 ${fn.toFixed(0)}, 그중 검수 대기 ${fnReview.toFixed(0)})`);
console.log(errors.length ? "틀린 표본:\n" + errors.join("\n") : "틀린 표본 없음");

if (record) {
  const same = (tp / (tp + fp) * 100).toFixed(1) === QUALITY.precision.toFixed(1) && (tp / (tp + fn) * 100).toFixed(1) === QUALITY.recall.toFixed(1);
  if (!same) throw new Error("점수가 동결 때와 달라 재현 기록을 남기지 않습니다");
  const files: Record<string, string> = {};
  for (const dir of ["lib", "scripts", "scripts/eval"])
    for (const f of readdirSync(dir).filter((f) => /\.(ts|mjs)$/.test(f) && !f.endsWith(".test.ts"))) files[`${dir}/${f}`] = sha(`${dir}/${f}`);
  for (const f of [`data/work/groups-${name}.json`, `data/work/candidates-${name}.jsonl`]) files[f] = sha(f);
  key.reproduced = { at: new Date().toISOString(), note: "C002만 다시 정제해 같은 점수 확인. 파일 이동·실행 스크립트 변경(사람 판정·C006 옵션) 뒤 기록", files };
  writeFileSync(keyPath, JSON.stringify(key, null, 1));
  console.log(`재현 기록: ${Object.keys(files).length}개 파일 해시 → ${keyPath}`);
}
