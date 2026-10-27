import { History } from "./history.tsx";
import { TrackedLink } from "./track.tsx";
import { date, n } from "./format.ts";
import type { GroupHit } from "../lib/queries.ts";

export function ResultList({ hits, query }: { hits: GroupHit[]; query?: string }) {
  return (
    <>
      <div className="list-head" aria-hidden="true">
        <span>상품 (대표 신고 이름)</span>
        <span>업체</span>
        <span className="r">신고</span>
        <span className="axis"><span>2015</span><span>2020</span><span>2025</span></span>
      </div>
      <ol className="list">
        {hits.map((h, i) => (
          <li key={h.id}>
            <TrackedLink className="hit" href={`/product/${h.id}`} event={{ type: "result_click", query, groupId: h.id, rank: i + 1 }}>
              <span>
                <span className="hit-name">{h.displayName}</span>
                <span className="hit-meta">
                  {h.foodType} · 최근 신고 {date(h.representativeDate)}
                  {h.linkCount > 0 && ` · 같은 회사 비슷한 상품 ${n(h.linkCount)}`}
                </span>
              </span>
              <span className="muted hit-company" title={h.companyName}>{h.companyName}</span>
              <span className="hit-count num">{h.memberCount > 1 ? <b>{n(h.memberCount)}건</b> : "1건"}</span>
              <History dates={h.reportDates} />
            </TrackedLink>
          </li>
        ))}
      </ol>
    </>
  );
}
