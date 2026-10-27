// 원본 수집 파일 읽기: 식품(C002)과 축산물(C006)을 합친다. 두 서비스의 필드는 같다.
// 레코드마다 어느 서비스에서 왔는지 _service로 남기고, 품목보고번호가 겹치면 먼저 읽은 것을 쓴다.
import { existsSync, readFileSync } from "node:fs";
import type { RawRecord } from "../lib/normalize.ts";

export const SERVICES = ["C002", "C006"] as const;
export type SourcedRecord = RawRecord & { _service: (typeof SERVICES)[number]; _matched_by?: string[] };

export function readRaw(name: string): SourcedRecord[] {
  const byNo = new Map<string, SourcedRecord>();
  for (const svc of SERVICES) {
    const p = `data/raw/${svc.toLowerCase()}-${name}.jsonl`;
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      if (!byNo.has(r.PRDLST_REPORT_NO)) byNo.set(r.PRDLST_REPORT_NO, { ...r, _service: svc });
    }
  }
  return [...byNo.values()];
}
