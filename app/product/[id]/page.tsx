import Link from "next/link";
import { notFound } from "next/navigation";
import { groupDetail } from "../../../lib/web/queries.ts";
import { History } from "../../history.tsx";
import { LogOnMount, TrackedA } from "../../track.tsx";
import { date, n, splitMaterials } from "../../format.ts";

const RELATION: Record<string, string> = {
  oem_sibling: "다른 브랜드, 같은 레시피",
  word_diff: "이름에 단어 하나 차이 · 검수 대기",
};

export default async function Product({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await groupDetail(id);
  if (!g) notFound();
  const rep = g.members.find((m) => m.isRepresentative)!;
  const materials = splitMaterials(rep.rawMaterials, rep.rawOrder);
  const dates = g.members.map((m) => m.reportedAt).sort();
  const sites = new Set(g.members.map((m) => m.licenseNo)).size;
  return (
    <main className="stack">
      <LogOnMount type="product_view" groupId={g.id} />
      <section className="card object" aria-labelledby="name">
        <div>
          <h1 id="name">{g.displayName}</h1>
          <p className="object-meta">
            {rep.companyName} · {g.foodType} · 대표 신고 <span className="mono">{rep.reportNo}</span> ({date(rep.reportedAt)})
          </p>
          <div className="object-history">
            <History dates={dates} size="large" />
            <span className="muted">
              신고 {n(g.memberCount)}건{sites > 1 ? ` · 인허가 ${n(sites)}곳` : ""} · {date(dates[0])} ~ {date(dates.at(-1)!)}
            </span>
          </div>
        </div>
        <TrackedA className="button button-primary" href={`https://www.coupang.com/np/search?q=${encodeURIComponent(g.displayName)}`}
          target="_blank" rel="noopener noreferrer" event={{ type: "outbound_click", groupId: g.id }}>
          쿠팡에서 찾기
        </TrackedA>
      </section>

      <div className="grid-6">
        <section className="card span-4" aria-labelledby="records">
          <div className="card-head">
            <h2 id="records">이 상품으로 묶인 신고</h2>
            <span className="muted">원문 그대로 · 최신순</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>품목보고번호</th><th>상품명 (원문)</th><th>업체 (원문)</th><th className="num">신고일</th><th className="num">변경일</th></tr>
              </thead>
              <tbody>
                {g.members.map((m) => (
                  <tr key={m.reportNo} className={m.isRepresentative ? "is-rep" : undefined}>
                    <td className="mono">{m.reportNo}</td>
                    <td>{m.productName} {m.isRepresentative && <span className="pill pill-rep">대표</span>}{m.foodType !== g.foodType && <span className="muted"> · {m.foodType}</span>}</td>
                    <td>{m.companyName}</td>
                    <td className="num">{date(m.reportedAt)}</td>
                    <td className="num">{date(m.changedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card span-2" aria-labelledby="materials">
          <div className="card-head">
            <h2 id="materials">원재료</h2>
            <span className="muted num">대표 신고 · {n(materials.length)}가지</span>
          </div>
          {materials.length ? (
            <div className="materials">{materials.map((m, i) => <span key={i} className="pill">{m}</span>)}</div>
          ) : (
            <p className="empty">신고에 원재료가 없습니다.</p>
          )}
        </section>

        {g.memberCount > 1 && (
          <section className="card span-6" aria-labelledby="why">
            <div className="card-head">
              <h2 id="why">묶은 근거</h2>
              <span className="muted">실제로 이어 붙인 신고 쌍 · 다르다고 판정된 쌍이 있으면 묶지 않습니다</span>
            </div>
            <div className="table-scroll"><table className="why">
              <tbody>
                {g.evidence.map((e, i) => (
                  <tr key={i}><td>{e.aName}</td><td>{e.bName}</td><td className="muted">{e.how}</td></tr>
                ))}
              </tbody>
            </table></div>
          </section>
        )}

        <section className="card span-6" aria-labelledby="related">
          <div className="card-head">
            <h2 id="related">같은 회사의 비슷한 상품</h2>
            <span className="muted">묶지 않았지만 관계가 있는 상품</span>
          </div>
          {g.links.length ? (
            <ul className="link-list">
              {g.links.map((l) => (
                <li key={l.id}>
                  <Link href={`/product/${l.id}`}>
                    <span>{l.displayName} <span className="muted">· {l.foodType} · 신고 {n(l.memberCount)}건</span></span>
                    <span className="pill">{RELATION[l.relation] ?? l.relation}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">같은 회사에서 이 상품과 레시피가 겹치는 다른 상품은 찾지 못했습니다.</p>
          )}
        </section>
      </div>
    </main>
  );
}
