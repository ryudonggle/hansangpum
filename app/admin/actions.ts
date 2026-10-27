"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ADMIN_COOKIE, DECISIONS, adminToken, decide, isAdmin, passwordMatches, type Decision } from "../../lib/web/admin.ts";
import { allow, clientIp } from "../../lib/web/rate-limit.ts";

// 비밀번호 대입 막기: IP마다 2시간 5번, 전체 1시간 30번 (맞든 틀리든 시도마다 센다)
export async function login(_: { error?: string } | undefined, form: FormData) {
  if (!(await allow("login", 5, 7200, clientIp(await headers()))) || !(await allow("login-all", 30, 3600)))
    return { error: "시도가 너무 많습니다. 잠시 후 다시 해 주세요." };
  if (!passwordMatches(String(form.get("password") ?? ""))) return { error: "비밀번호가 맞지 않습니다." };
  (await cookies()).set(ADMIN_COOKIE, adminToken(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/admin", maxAge: 60 * 60 * 8 });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: "/admin" });
  redirect("/admin/login");
}

export async function decideAction(form: FormData) {
  if (!isAdmin((await cookies()).get(ADMIN_COOKIE)?.value)) redirect("/admin/login");
  const [a, b, d] = [form.get("a"), form.get("b"), form.get("decision")].map(String);
  if (!DECISIONS.includes(d as Decision) || !/^\d+$/.test(a) || !/^\d+$/.test(b)) return;
  await decide(a, b, d as Decision);
  revalidatePath("/admin");
}
