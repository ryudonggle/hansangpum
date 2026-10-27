import Link from "next/link";

export default function NotFound() {
  return (
    <main className="stack">
      <h1>상품을 찾지 못했습니다</h1>
      <p className="lede">묶음을 다시 계산하면서 주소가 바뀌었을 수 있습니다. <Link href="/">검색에서 다시 찾아보세요.</Link></p>
    </main>
  );
}
