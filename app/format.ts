export const n = (v: number) => v.toLocaleString("ko-KR");
export const date = (yyyymmdd: string | null) =>
  yyyymmdd && yyyymmdd.length === 8 ? `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6)}` : "—";

// 원재료 원문을 쉼표로 나눈다 (괄호 안 쉼표는 그대로). 표시용이라 글자는 고치지 않는다
export function splitMaterials(names: string | null, ordnos?: string | null): string[] {
  if (!names) return [];
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of names) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) (parts.push(cur.trim()), (cur = ""));
    else cur += ch;
  }
  parts.push(cur.trim());
  const items = parts.filter(Boolean);
  const order = (ordnos ?? "").split(",").map(Number);
  if (order.length !== items.length || order.some(Number.isNaN)) return items;
  return items.map((name, i) => ({ name, o: order[i] })).sort((x, y) => x.o - y.o).map((x) => x.name);
}
