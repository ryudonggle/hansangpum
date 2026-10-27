// 로컬 결과(data/) → Supabase. 레코드·후보·판정은 upsert(있으면 갱신), 묶음은 해당 카테고리만 다시 쓴다.
// 사용: node scripts/load.ts 닭가슴살
import { existsSync, readFileSync } from "node:fs";
import { eq, getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { client, db } from "../db/client.ts";
import { candidatePairs, groupLinks, labels, pairJudgments, productGroups, records, reviewItems } from "../db/schema.ts";
import type { NormalizedRecord } from "../lib/normalize.ts";
import { readRaw } from "./raw.ts";

const name = process.argv[2] || "닭가슴살";
const readJsonl = (p: string) => (existsSync(p) ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const norm = new Map<string, NormalizedRecord>(readJsonl(`data/work/normalized-${name}.jsonl`).map((r) => [r.reportNo, r]));
// 정제한 레코드만 올린다 (normalize --services=C002로 돌렸으면 C006 원본은 빠진다)
const raw = readRaw(name).filter((r) => norm.has(r.PRDLST_REPORT_NO));
const candidates = readJsonl(`data/work/candidates-${name}.jsonl`);
const judgments = readJsonl(`data/work/judgments-${name}.jsonl`);
const grouping = JSON.parse(readFileSync(`data/work/groups-${name}.json`, "utf8"));

// 충돌하면 들어온 값으로 바꾸는 set 절 (키 컬럼 제외)
const excludedSet = (table: PgTable, keys: string[]) =>
  Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([k]) => !keys.includes(k))
      .map(([k, col]) => [k, sql.raw(`excluded."${col.name}"`)]),
  ) as Record<string, SQL>;

async function inBatches<T>(rows: T[], size: number, write: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await write(rows.slice(i, i + size));
}

const groupOf = new Map<string, string>();
for (const [gid, ids] of Object.entries(grouping.groups as Record<string, string[]>)) for (const id of ids) groupOf.set(id, gid);

await db.transaction(async (tx) => {
  // 1. 원본 레코드
  const recordRows = raw.map((r) => {
    const n = norm.get(r.PRDLST_REPORT_NO)!;
    return {
      reportNo: r.PRDLST_REPORT_NO, productName: r.PRDLST_NM, companyName: r.BSSH_NM, licenseNo: r.LCNS_NO,
      foodType: r.PRDLST_DCNM, reportedAt: r.PRMS_DT, changedAt: r.CHNG_DT ?? null, rawMaterials: r.RAWMTRL_NM ?? null,
      raw: r, category: name, service: r._service, nameKey: n.name.key, nameDisplay: n.name.display, companyRoot: n.company.root,
      normalized: n, groupId: groupOf.get(r.PRDLST_REPORT_NO) ?? null,
    };
  });
  await inBatches(recordRows, 500, (b) =>
    tx.insert(records).values(b).onConflictDoUpdate({ target: records.reportNo, set: excludedSet(records, ["reportNo", "ingestedAt"]) }));

  // 2. 묶음: 이 카테고리 것만 지우고 다시 쓴다. 대표 = 신고일(같으면 변경일)이 가장 최근인 레코드
  const byId = new Map(raw.map((r) => [r.PRDLST_REPORT_NO, r]));
  const groupRows = Object.entries(grouping.groups as Record<string, string[]>).map(([gid, ids]) => {
    const rep = ids.map((id) => byId.get(id)!).sort((x, y) => (y.PRMS_DT + (y.CHNG_DT ?? "")).localeCompare(x.PRMS_DT + (x.CHNG_DT ?? "")))[0];
    return {
      id: gid, representativeId: rep.PRDLST_REPORT_NO, displayName: rep.PRDLST_NM, companyRoot: norm.get(rep.PRDLST_REPORT_NO)!.company.root,
      foodType: rep.PRDLST_DCNM, category: name, memberCount: ids.length,
    };
  });
  const oldGroups = (await tx.select({ id: productGroups.id }).from(productGroups).where(eq(productGroups.category, name))).map((g) => g.id);
  await inBatches(oldGroups, 1000, (b) => tx.delete(groupLinks).where(inArray(groupLinks.groupA, b)));
  await tx.delete(productGroups).where(eq(productGroups.category, name));
  await inBatches(groupRows, 1000, (b) => tx.insert(productGroups).values(b));

  // 3. OEM 형제 링크 (묶음 단위, 같은 묶음끼리는 빼고 한 방향으로만)
  // relation: oem_sibling(Jev가 OEM으로 판정) / word_diff(규칙: 단어 하나만 다름, 브랜드인지 재료인지는 검수에서)
  const links = new Map<string, { groupA: string; groupB: string; relation: string; probability: number }>();
  for (const j of grouping.oemLinks) {
    const [ga, gb] = [groupOf.get(j.a)!, groupOf.get(j.b)!].sort();
    if (ga === gb) continue;
    const relation = j.source === "rule" ? "word_diff" : "oem_sibling";
    const prev = links.get(`${ga}|${gb}`);
    if (!prev || (prev.relation === "word_diff" && relation === "oem_sibling") || (prev.relation === relation && prev.probability < j.probabilities.oem_sibling))
      links.set(`${ga}|${gb}`, { groupA: ga, groupB: gb, relation, probability: j.probabilities.oem_sibling });
  }
  await inBatches([...links.values()], 1000, (b) => tx.insert(groupLinks).values(b));

  // 4. 후보 쌍
  const pairRows = candidates.map((p) => ({
    a: p.a, b: p.b, nameSim: p.score.name, materialSim: p.score.materials, sameType: p.score.sameType, conflict: p.score.conflict, band: p.band,
  }));
  await inBatches(pairRows, 1000, (b) =>
    tx.insert(candidatePairs).values(b).onConflictDoUpdate({ target: [candidatePairs.a, candidatePairs.b], set: excludedSet(candidatePairs, ["a", "b"]) }));

  // 5. Jev 판정 캐시
  const judgeRows = judgments.map((j) => ({
    a: j.a, b: j.b, source: "jev", relation: j.relation, probabilities: j.probabilities, confidence: j.confidence,
    model: j.model, inputTokens: j.inputTokens, judgedAt: new Date(j.judgedAt),
  }));
  await inBatches(judgeRows, 1000, (b) =>
    tx.insert(pairJudgments).values(b).onConflictDoUpdate({ target: [pairJudgments.a, pairJudgments.b, pairJudgments.source], set: excludedSet(pairJudgments, ["a", "b", "source"]) }));

  // 6. 검수 대기: 사람이 이미 고른 결정(decision)은 남기고, 대기열 내용만 갱신
  const reviewRows = (grouping.review as { a: string; b: string; reason?: string; probabilities?: { same_product: number } }[]).map((r) => ({
    a: r.a, b: r.b, category: name, reason: r.reason ?? "Jev 확률이 애매함", jevSame: r.probabilities?.same_product ?? null,
  }));
  await inBatches(reviewRows, 1000, (b) =>
    tx.insert(reviewItems).values(b).onConflictDoUpdate({ target: [reviewItems.a, reviewItems.b], set: { reason: sql`excluded.reason`, jevSame: sql`excluded.jev_same` } }));

  // 7. 정답셋 (1차·2차)
  for (const [keyFile, answerFile] of [
    [`data/labels/${name}/round1-key.json`, `data/labels/${name}/round1-answers.json`],
    [`data/labels/${name}/round2-key.json`, `data/labels/${name}/round2-answers.json`],
  ]) {
    if (!existsSync(keyFile) || !existsSync(answerFile)) continue;
    const { labeler, answers } = JSON.parse(readFileSync(answerFile, "utf8"));
    const key = JSON.parse(readFileSync(keyFile, "utf8"));
    const labelRows = (Array.isArray(key) ? key : key.rows).map((k: { no: number; a: string; b: string }) => ({
      a: k.a, b: k.b, truth: answers[k.no][0], note: answers[k.no][1], labeler,
    }));
    await tx.insert(labels).values(labelRows).onConflictDoUpdate({ target: [labels.a, labels.b], set: excludedSet(labels, ["a", "b"]) });
  }

  console.log(`적재: 레코드 ${recordRows.length} · 묶음 ${groupRows.length} · OEM 링크 ${links.size} · 후보 쌍 ${pairRows.length} · 판정 ${judgeRows.length}`);
});

const [check] = await client`
  select (select count(*) from records where category = ${name}) as records,
         (select count(*) from product_groups where category = ${name}) as groups,
         (select count(*) from records where category = ${name} and group_id is null) as ungrouped,
         (select count(*) from group_links) as links, (select count(*) from pair_judgments) as judgments, (select count(*) from labels) as labels, (select count(*) from review_items where category = ${name}) as review`;
console.log("DB 확인:", check);
await client.end();
