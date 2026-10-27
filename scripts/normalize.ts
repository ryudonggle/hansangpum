// data/raw/c002·c006-<이름>.jsonl(식품·축산물) → data/work/normalized-<이름>.jsonl
// 사용: node scripts/normalize.ts 닭가슴살
import { mkdirSync, writeFileSync } from "node:fs";
import { normalizeRecord } from "../lib/normalize.ts";
import { readRaw } from "./raw.ts";

const name = process.argv[2] || "닭가슴살";
const rows = readRaw(name);
const out = rows.map(normalizeRecord);

mkdirSync("data/work", { recursive: true });
writeFileSync(`data/work/normalized-${name}.jsonl`, out.map((r) => JSON.stringify(r)).join("\n") + "\n");

// 요약: 정제만으로 몇 건이 같은 (회사 계열, 이름, 보관 방식)으로 겹치나
const exact = new Map<string, number>();
for (const r of out) {
  const k = `${r.company.root}|${r.name.key}|${r.name.storage ?? ""}`;
  exact.set(k, (exact.get(k) ?? 0) + 1);
}
const dupGroups = [...exact.values()].filter((v) => v > 1);
const count = (f: (r: (typeof out)[number]) => unknown) => out.filter(f).length;
console.log(`식품 ${rows.filter((r) => r._service === "C002").length}건 · 축산물 ${rows.filter((r) => r._service === "C006").length}건`);
console.log(`레코드 ${out.length}건 → 정확히 같은 키 ${exact.size}개 (2건 이상 겹친 키 ${dupGroups.length}개, 레코드 ${dupGroups.reduce((a, b) => a + b, 0)}건)`);
console.log(`뽑힌 꼬리표: 중량 ${count((r) => r.name.weight)} · 입수 ${count((r) => r.name.pack)} · 보관 ${count((r) => r.name.storage)} · 판매처 ${count((r) => r.name.channel)} · 브랜드 ${count((r) => r.name.brand)}`);
console.log(`회사 ${new Set(rows.map((r) => r.BSSH_NM)).size}개 → 정제 후 ${new Set(out.map((r) => r.company.root)).size}개, 원재료 없는 레코드 ${count((r) => r.materials.length === 0)}건`);
console.log(`저장: data/work/normalized-${name}.jsonl`);
