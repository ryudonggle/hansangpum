// "같은 상품" 쌍을 이어 붙여 묶음을 만든다 (union-find).
// A=B이고 B=C면 A·B·C가 한 묶음이 된다.

export class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    let root = x;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    // 경로 압축: 다음 find가 빨라지도록 거쳐 간 노드를 바로 root에 붙인다
    for (let cur = x; cur !== root; ) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string) {
    const [ra, rb] = [this.find(a), this.find(b)];
    if (ra !== rb) this.parent.set(rb < ra ? ra : rb, rb < ra ? rb : ra); // 작은 id를 대표로 (결과가 매번 같게)
  }
}

export type Edge = { a: string; b: string };

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// 모든 레코드를 묶음으로 나눈다. 짝이 없는 레코드는 혼자 한 묶음.
// A=B, B=C로 연쇄되어 서로 다른 A·C가 섞이는 것을 두 단계로 막는다. sameEdges는 확신 높은 순으로 넣는다.
// - cannotLink: 확실히 다른 쌍. 하나라도 걸리면 두 묶음을 합치지 않는다
// - votes: 쌍마다 +1(같음) / -1(다름). 두 묶음 사이 쌍의 표가 같음 > 다름일 때만 합친다
//   (쌍 하나만 같다고 나왔는데 나머지 쌍 대부분이 다르면 합치지 않음)
export function buildGroups(
  ids: string[],
  sameEdges: Edge[],
  cannotLink: Edge[] = [],
  votes: Map<string, number> = new Map(),
): Map<string, string[]> {
  const uf = new UnionFind();
  const members = new Map<string, string[]>();
  const forbidden = new Map<string, Set<string>>();
  for (const { a, b } of cannotLink) {
    (forbidden.get(a) ?? forbidden.set(a, new Set()).get(a)!).add(b);
    (forbidden.get(b) ?? forbidden.set(b, new Set()).get(b)!).add(a);
  }
  const membersOf = (root: string) => members.get(root) ?? [root];
  for (const e of sameEdges) {
    const [ra, rb] = [uf.find(e.a), uf.find(e.b)];
    if (ra === rb) continue;
    const [ma, mb] = [membersOf(ra), membersOf(rb)];
    if (ma.some((x) => mb.some((y) => forbidden.get(x)?.has(y)))) continue;
    let tally = 0;
    for (const x of ma) for (const y of mb) tally += votes.get(pairKey(x, y)) ?? 0;
    if (votes.size && tally <= 0) continue;
    uf.union(ra, rb);
    members.delete(ra);
    members.delete(rb);
    members.set(uf.find(ra), [...ma, ...mb]);
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = uf.find(id);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(id);
  }
  return groups;
}
