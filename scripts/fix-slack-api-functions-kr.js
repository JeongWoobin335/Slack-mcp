#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const targetPath = path.join(process.cwd(), "SLACK_API_FUNCTIONS_KR.md");

function fallbackKorean(desc) {
  const d = String(desc || "").trim().replace(/\.$/, "");
  if (!d) return "해당 기능을 수행합니다.";

  const patterns = [
    [/^Get\s+/i, "조회합니다: "],
    [/^List\s+/i, "목록을 조회합니다: "],
    [/^Retrieve\s+/i, "가져옵니다: "],
    [/^Create\s+/i, "생성합니다: "],
    [/^Add\s+/i, "추가합니다: "],
    [/^Remove\s+/i, "제거합니다: "],
    [/^Delete\s+/i, "삭제합니다: "],
    [/^Update\s+/i, "수정합니다: "],
    [/^Set\s+/i, "설정합니다: "],
    [/^Open\s+/i, "엽니다: "],
    [/^Close\s+/i, "닫습니다: "],
    [/^Send\s+/i, "전송합니다: "],
    [/^Search\s+/i, "검색합니다: "],
    [/^Invite\s+/i, "초대합니다: "],
    [/^Join\s+/i, "참여합니다: "],
    [/^Leave\s+/i, "나갑니다: "],
    [/^Archive\s+/i, "보관 처리합니다: "],
    [/^Unarchive\s+/i, "보관 해제합니다: "],
    [/^Approve\s+/i, "승인합니다: "],
    [/^Deny\s+/i, "거부합니다: "],
    [/^Mark(ed)?\s+/i, "표시합니다: "],
    [/^Publish\s+/i, "게시합니다: "],
    [/^Push\s+/i, "추가합니다: "],
    [/^Allow(s)?\s+/i, "허용합니다: "],
    [/^Return(s)?\s+/i, "반환합니다: "],
  ];

  for (const [re, prefix] of patterns) {
    if (re.test(d)) {
      return `${prefix}${d.replace(re, "").trim()}`;
    }
  }

  return `${d} 기능을 수행합니다.`;
}

function parseRow(line) {
  if (!line.startsWith("|") || !line.endsWith("|")) return null;
  const cells = line
    .slice(1, -1)
    .split("|")
    .map((x) => x.trim());
  if (cells.length !== 5) return null;
  return cells;
}

function toRow(cells) {
  return `| ${cells.join(" | ")} |`;
}

function main() {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`File not found: ${targetPath}`);
  }

  const raw = fs.readFileSync(targetPath, "utf8");
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);

  const familyHint = {
    admin: "조직/관리자 운영 자동화",
    api: "플랫폼 API 메타 정보",
    apps: "앱 설정/연결/승인 관리",
    assistant: "AI Assistant 검색/컨텍스트",
    auth: "인증 테스트/취소/조회",
    bookmarks: "북마크 추가/수정/삭제/조회",
    bots: "봇 정보 조회",
    calls: "콜 객체 생성/수정/종료",
    canvases: "캔버스 생성/수정/조회/권한",
    chat: "메시지 전송/수정/삭제/스트리밍",
    conversations: "채널/DM 생성/조회/이력/멤버",
    dialog: "레거시 다이얼로그",
    dnd: "방해금지 상태 관리",
    emoji: "이모지 조회",
    entity: "엔터티 조회",
    files: "파일 업로드/조회/공유/삭제",
    functions: "Slack Functions 관리",
    migration: "마이그레이션 지원",
    oauth: "OAuth 토큰/교환",
    openid: "OpenID 인증",
    pins: "고정 메시지 관리",
    reactions: "리액션 추가/삭제/조회",
    reminders: "리마인더 생성/조회/완료",
    rtm: "RTM 연결",
    search: "메시지/파일 검색",
    slackLists: "Slack Lists 관리",
    stars: "즐겨찾기 관리",
    team: "워크스페이스 정보",
    tooling: "개발 도구 API",
    usergroups: "사용자 그룹 관리",
    users: "사용자 조회/프로필/프레즌스",
    views: "모달/뷰 열기/수정",
    workflows: "워크플로우 상태/실행 관리",
  };

  // 1) 상단 헤더/섹션명 정리
  const replacements = [
    [/^#\s+.+$/, "# Slack API 기능 정리 (한국어)"],
    [/^\?\?\s+\?\?:\s+/, "생성 시각: "],
    [/^\?\?:\s+Slack.+$/, "출처: Slack 공식 문서(sitemap + methods/scopes references)"],
    [/^##\s+\?\?$/, "## 요약"],
    [/^- Web API\s+\?\?\?\s+\?:/, "- Web API 메서드 수:"],
    [/^- \?\?\?\s+family\s+\?:/, "- 메서드 family 수:"],
    [/^##\s+Family\?\s+\?\?\s+\?\?$/, "## Family별 기능 범위"],
    [/^\| Family \| Count \| \?\? \?\? \|$/, "| Family | Count | 기능 요약 |"],
    [/^##\s+API\?\s+\?\?\s+\?\?$/, "## API별 기능 설명"],
    [
      /^\| Method \| Family \| \?\? \?\?\(\?\?\?\) \| \?\? \?\?\(\?\?\) \| \?\? scopes \|$/,
      "| Method | Family | 기능 설명(한국어) | 공식 설명(영문) | 대표 scopes |",
    ],
    [/^##\s+Scope\s+\?\?\s+\?\?$/, "## Scope 전체 목록"],
    [/^##\s+API\s+\?\?\?\s+\?\?$/, "## API 가이드 링크"],
  ];

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    for (const [re, rep] of replacements) {
      if (re.test(line)) line = line.replace(re, rep);
    }
    lines[i] = line;
  }

  // 2) Family 표 복구
  for (let i = 0; i < lines.length; i += 1) {
    const cells = parseRow(lines[i]);
    if (!cells) continue;
    const [c1, c2] = cells;
    if (!familyHint[c1]) continue;
    if (!/^\d+$/.test(c2)) continue;
    lines[i] = `| ${c1} | ${c2} | ${familyHint[c1]} |`;
  }

  // 3) API 설명 표에서 경고/깨짐 문구 교정
  let inApiTable = false;
  let fixedWarnings = 0;
  let fixedBroken = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.startsWith("## API별 기능 설명")) {
      inApiTable = true;
      continue;
    }
    if (line.startsWith("## Scope 전체 목록")) {
      inApiTable = false;
      continue;
    }
    if (!inApiTable) continue;
    if (!line.startsWith("|")) continue;
    if (line.startsWith("|---")) continue;
    if (line.startsWith("| Method |")) continue;

    const cells = parseRow(line);
    if (!cells) continue;

    const [method, family, ko, en, scopes] = cells;
    if (!method || !family) continue;

    let nextKo = ko;
    const hasWarning = /MYMEMORY WARNING/i.test(ko);
    const hasBroken = ko.includes("??");

    if (hasWarning || hasBroken || ko === "-" || !ko) {
      nextKo = fallbackKorean(en);
      if (hasWarning) fixedWarnings += 1;
      if (hasBroken) fixedBroken += 1;
    }

    lines[i] = toRow([method, family, nextKo, en || "-", scopes || "-"]);
  }

  // 4) 잔여 섹션 헤더의 깨짐 최소 복구
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] === "## ??") lines[i] = "## 요약";
    if (lines[i] === "## Scope ?? ??") lines[i] = "## Scope 전체 목록";
  }

  const out = `\uFEFF${lines.join("\n")}\n`;
  fs.writeFileSync(targetPath, out, "utf8");

  const remainingQ = (out.match(/\?/g) || []).length;
  console.log(
    JSON.stringify(
      {
        file: targetPath,
        fixedWarnings,
        fixedBroken,
        remainingQuestionMarks: remainingQ,
      },
      null,
      2
    )
  );
}

main();

