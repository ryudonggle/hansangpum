// /admin에서 사람이 고른 판정(pair_judgments, human) → data/work/human-<이름>.jsonl
// run-grouping이 이 파일을 읽어 규칙·Jev보다 먼저 쓴다. 사용: node scripts/pull-human.ts 닭가슴살
import { writeFileSync } from "node:fs";
import { client } from "../db/client.ts";

const name = process.argv[2] || "닭가슴살";
const rows = await client`
  select j.a, j.b, j.relation, j.judged_at
  from pair_judgments j
  join records ra on ra.report_no = j.a and ra.category = ${name}
  join records rb on rb.report_no = j.b and rb.category = ${name}
  where j.source = 'human'
  order by j.judged_at`;
writeFileSync(`data/work/human-${name}.jsonl`, rows.map((r) => JSON.stringify({ a: r.a, b: r.b, relation: r.relation, judgedAt: r.judged_at })).join("\n") + "\n");
const count = (rel: string) => rows.filter((r) => r.relation === rel).length;
console.log(`사람 판정 ${rows.length}쌍 (같음 ${count("same_product")} · OEM ${count("oem_sibling")} · 다름 ${count("different_product")})`);
await client.end();
