"use client";
import { useActionState } from "react";
import { login } from "../actions.ts";

export default function Login() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <main>
      <form className="card login" action={action}>
        <h1>검수·지표</h1>
        <p className="lede">묶음 검수와 검색 로그는 관리자만 봅니다.</p>
        <label htmlFor="password">관리자 비밀번호</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {state?.error && <p className="error" role="alert">{state.error}</p>}
        <button className="button button-primary" type="submit" disabled={pending} style={{ marginTop: 16, width: "100%" }}>
          {pending ? "확인 중" : "들어가기"}
        </button>
      </form>
    </main>
  );
}
