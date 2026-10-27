// 애매 구간 쌍 → Jev 판정 → data/work/judgments-<이름>.jsonl (캐시: 이미 판정한 쌍은 다시 묻지 않음)
// 사용: node scripts/judge.ts 닭가슴살 [--limit=20]
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { buildRequest, judge } from "../lib/judge.ts";
import type { NormalizedRecord } from "../lib/normalize.ts";
import { readRaw } from "./raw.ts";

try { process.loadEnvFile(".env"); } catch {}
const KEY = process.env.TYPESAFE_API_KEY;
if (!KEY) throw new Error(".env에 TYPESAFE_API_KEY가 없습니다");

const name = process.argv[2] || "닭가슴살";
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) || Infinity);
const CONCURRENCY = 8;
const readJsonl = (p: string) => (existsSync(p) ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

const recs = new Map<string, NormalizedRecord>(readJsonl(`data/work/normalized-${name}.jsonl`).map((r) => [r.reportNo, r]));
const raw = new Map<string, string>(readRaw(name).map((r) => [r.PRDLST_REPORT_NO, r.PRDLST_NM]));
const out = `data/work/judgments-${name}.jsonl`;
const done = new Set(readJsonl(out).map((j) => `${j.a}|${j.b}`));
const todo = readJsonl(`data/work/candidates-${name}.jsonl`).filter((p) => p.band === "ambiguous" && !done.has(`${p.a}|${p.b}`)).slice(0, limit);

console.log(`애매 쌍 중 남은 ${todo.length}쌍 판정 (캐시 ${done.size}쌍)`);
let tokens = 0;
let finished = 0;
const queue = [...todo];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let p; (p = queue.shift()); ) {
      const body = buildRequest(recs.get(p.a)!, recs.get(p.b)!, [raw.get(p.a)!, raw.get(p.b)!], p.score);
      const j = await judge(body, KEY);
      tokens += j.inputTokens;
      appendFileSync(out, JSON.stringify({ a: p.a, b: p.b, aName: p.aName, bName: p.bName, ...j, judgedAt: new Date().toISOString() }) + "\n");
      if (++finished % 100 === 0) console.log(`  ${finished}/${todo.length}`);
    }
  }),
);
console.log(`완료 ${finished}쌍, 입력 ${tokens.toLocaleString()}토큰 ≈ $${((tokens / 1e6) * 0.042).toFixed(4)}`);
