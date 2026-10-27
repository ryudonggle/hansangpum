import type { NextConfig } from "next";

const config: NextConfig = {
  // 파이프라인 스크립트와 같은 lib/·db/ 코드를 쓴다 (.ts 확장자 import)
  typedRoutes: false,
  agentRules: false, // AGENTS.md 자동 생성 끄기
};

export default config;
