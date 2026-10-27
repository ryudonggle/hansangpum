"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const path = usePathname();
  const admin = path.startsWith("/admin");
  return (
    <nav aria-label="주요 화면">
      <Link href="/" aria-current={!admin ? "page" : undefined}>검색</Link>
      <Link href="/admin" aria-current={admin ? "page" : undefined}>검수·지표</Link>
    </nav>
  );
}
