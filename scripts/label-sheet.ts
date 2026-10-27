// 정답셋 만들기: 구간별로 골고루 뽑은 쌍을 CSV로 내보낸다. 사람이 "정답" 칸을 채운다.
// 규칙·Jev 답은 CSV에 넣지 않는다(보고 따라 적지 않도록). 답은 labels-key.json에 따로 둔다.
// 사용: node scripts/label-sheet.ts 닭가슴살
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readRaw } from "./raw.ts";

const name = process.argv[2] || "닭가슴살";
const readJsonl = (p: string) => (existsSync(p) ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const raw = new Map(readRaw(name).map((r) => [r.PRDLST_REPORT_NO, r]));
const candidates = readJsonl(`data/work/candidates-${name}.jsonl`);
const judged = new Map(readJsonl(`data/work/judgments-${name}.jsonl`).map((j) => [`${j.a}|${j.b}`, j]));

// 결과가 매번 같도록 고정 시드로 섞는다
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const sample = <T,>(xs: T[], n: number) => xs.map((x) => [rand(), x] as const).sort((p, q) => p[0] - q[0]).slice(0, n).map((p) => p[1]);

const withJ = candidates.map((p) => ({ ...p, j: judged.get(`${p.a}|${p.b}`) }));
const picked = [
  ...sample(withJ.filter((p) => p.band === "merge"), 10),
  ...sample(withJ.filter((p) => p.j?.relation === "same_product"), 12),
  ...sample(withJ.filter((p) => p.j?.relation === "oem_sibling"), 10),
  ...sample(withJ.filter((p) => p.j?.relation === "different_product"), 10),
  ...sample(withJ.filter((p) => p.band === "separate" && !p.score.conflict && p.score.name >= 0.7), 8),
];
const rows = sample(picked, picked.length); // 구간 순서가 드러나지 않게 다시 섞기

const csv = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
const header = ["번호", "A 상품명", "A 업체", "A 식품유형", "B 상품명", "B 업체", "B 식품유형", "원재료 겹침", "정답(같음/OEM/다름)", "메모"];
const lines = rows.map((p, i) => {
  const [a, b] = [raw.get(p.a)!, raw.get(p.b)!];
  return [i + 1, a.PRDLST_NM, a.BSSH_NM, a.PRDLST_DCNM, b.PRDLST_NM, b.BSSH_NM, b.PRDLST_DCNM, p.score.materials.toFixed(2), "", ""].map(csv).join(",");
});
mkdirSync("data/labels", { recursive: true });
writeFileSync(`data/labels/labels-${name}.csv`, "﻿" + [header.map(csv).join(","), ...lines].join("\r\n") + "\r\n");
writeFileSync(`data/labels/labels-${name}-key.json`, JSON.stringify(rows.map((p, i) => ({ no: i + 1, a: p.a, b: p.b, band: p.band, jev: p.j?.relation ?? null, jevProb: p.j?.probabilities ?? null })), null, 1));
console.log(`정답셋 ${rows.length}쌍 → data/labels/labels-${name}.csv (엑셀로 열어 "정답" 칸 채우기)`);
