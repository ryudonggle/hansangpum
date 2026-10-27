"use client";
// 행동 로그를 /api/events로 보낸다. 페이지를 떠나는 순간에도 보내지도록 sendBeacon을 쓴다.
import Link from "next/link";
import { useEffect, type ComponentProps } from "react";

type Event = { type: "search" | "result_click" | "product_view" | "outbound_click"; query?: string; groupId?: string; resultCount?: number; rank?: number };

function sessionId() {
  try {
    let id = localStorage.getItem("sid");
    if (!id) localStorage.setItem("sid", (id = crypto.randomUUID()));
    return id;
  } catch {
    return "no-storage";
  }
}

export function send(e: Event) {
  const body = JSON.stringify({ ...e, sessionId: sessionId() });
  if (navigator.sendBeacon?.(("/api/events"), new Blob([body], { type: "application/json" }))) return;
  fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}

// 화면이 열릴 때 한 번 기록 (같은 내용으로 다시 그려져도 한 번만)
export function LogOnMount(e: Event) {
  const key = JSON.stringify(e);
  useEffect(() => send(JSON.parse(key)), [key]);
  return null;
}

export function TrackedLink({ event, ...props }: ComponentProps<typeof Link> & { event: Event }) {
  return <Link {...props} onClick={() => send(event)} />;
}

export function TrackedA({ event, ...props }: ComponentProps<"a"> & { event: Event }) {
  return <a {...props} onClick={() => send(event)} />;
}
