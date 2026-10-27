// 검수 판정(pair_judgments: /admin 사람 human, 사람 대신 Claude가 한 claude) → data/work/human-<이름>.jsonl
// run-grouping이 이 파일을 읽어 규칙·Jev보다 먼저 쓴다. 같은 쌍에 둘 다 있으면 사람 판정을 쓴다.
// 사용: node scripts/pull-human.ts 닭가슴살
import { writeFileSync } from "node:fs";
import { client } from "../db/client.ts";

const name = process.argv[2] || "닭가슴살";
const rows = await client`
  select distinct on (j.a, j.b) j.a, j.b, j.relation, j.source, j.judged_at
  from pair_judgments j
  join records ra on ra.report_no = j.a and ra.category = ${name}
  join records rb on rb.report_no = j.b and rb.category = ${name}
  where j.source in ('human', 'claude')
  order by j.a, j.b, (j.source = 'human') desc, j.judged_at desc`;
writeFileSync(`data/work/human-${name}.jsonl`, rows.map((r) => JSON.stringify({ a: r.a, b: r.b, relation: r.relation, source: r.source, judgedAt: r.judged_at })).join("\n") + "\n");
const count = (rel: string) => rows.filter((r) => r.relation === rel).length;
console.log(`검수 판정 ${rows.length}쌍 (사람 ${rows.filter((r) => r.source === "human").length} · Claude ${rows.filter((r) => r.source === "claude").length}) — 같음 ${count("same_product")} · OEM ${count("oem_sibling")} · 다름 ${count("different_product")}`);
await client.end();
