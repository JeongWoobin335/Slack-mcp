#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const SITEMAP_URL = "https://docs.slack.dev/sitemap.xml";
const METHODS_PREFIX = "https://docs.slack.dev/reference/methods/";
const SCOPES_PREFIX = "https://docs.slack.dev/reference/scopes/";
const APIS_ROOT = "https://docs.slack.dev/apis/";
const TOOLS_ROOT = "https://docs.slack.dev/tools/";

const OUTPUT_DIR = path.join(process.cwd(), "data");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "slack-catalog.json");
const OUTPUT_MD = path.join(process.cwd(), "SLACK_API_FUNCTIONS_KR.md");

const CONCURRENCY = Number(process.env.SLACK_CATALOG_CONCURRENCY || 10);

function unique(values) {
  return Array.from(new Set(values));
}

function sortByText(a, b) {
  return a.localeCompare(b);
}

function extractLocsFromSitemap(xml) {
  const matches = Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g));
  return matches.map((m) => m[1].trim());
}

function extractMetaDescription(html) {
  const m = html.match(/<meta[^>]+name=description[^>]+content="([^"]+)"/i);
  if (m && m[1]) return m[1].trim();

  const m2 = html.match(/<meta[^>]+property=og:description[^>]+content="([^"]+)"/i);
  if (m2 && m2[1]) return m2[1].trim();

  return "";
}

function extractScopesFromMethodHtml(html) {
  const scopes = Array.from(
    html.matchAll(/\/reference\/scopes\/([a-zA-Z0-9:._-]+)/g)
  ).map((m) => m[1]);
  return unique(scopes).sort(sortByText);
}

function methodToFamily(method) {
  return method.split(".")[0];
}

function escapeMd(text) {
  return String(text || "").replace(/\|/g, "\\|");
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

async function mapWithConcurrency(items, mapper, concurrency = 10) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const current = index++;
      if (current >= items.length) break;
      try {
        results[current] = await mapper(items[current], current);
      } catch (error) {
        results[current] = { error: String(error) };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

function familyKoreanHint(family) {
  const map = {
    admin: "조직/관리자 운영 자동화",
    apps: "앱 설정/연결/데이터스토어",
    assistant: "AI Assistant 검색/스레드 컨텍스트",
    auth: "인증 테스트/취소/조회",
    bookmarks: "북마크 추가/편집/삭제/조회",
    calls: "콜(Call) 객체 생성/수정/종료",
    canvases: "캔버스 생성/수정/조회/권한",
    chat: "메시지 전송/수정/삭제/스트리밍",
    conversations: "채널/대화방 생성/조회/이력/멤버",
    dnd: "방해금지 상태 조회/설정",
    files: "파일 업로드/조회/공유/삭제",
    oauth: "OAuth 토큰/교환",
    reactions: "리액션 추가/삭제",
    reminders: "리마인더 생성/조회/완료",
    search: "검색(메시지/파일/전체)",
    users: "유저 조회/프로필/프레즌스",
    usergroups: "유저그룹 관리",
    views: "모달/뷰 열기/수정",
    workflows: "워크플로우 관련 관리",
  };
  return map[family] || "해당 도메인의 Slack 기능 제어";
}

function toKoreanRephrase(method, desc) {
  if (!desc) return `${method} 메서드를 통해 해당 Slack 기능을 호출합니다.`;
  return `${method} 메서드는 ${desc} 기능을 수행합니다.`;
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[catalog] fetching sitemap: ${SITEMAP_URL}`);
  const sitemapXml = await fetchText(SITEMAP_URL);
  const locs = extractLocsFromSitemap(sitemapXml);

  const methodUrls = unique(
    locs.filter((u) => u.startsWith(METHODS_PREFIX) && u !== "https://docs.slack.dev/reference/methods")
  ).sort(sortByText);
  const methods = methodUrls.map((u) => u.replace(METHODS_PREFIX, ""));

  const scopeNames = unique(
    locs
      .filter((u) => u.startsWith(SCOPES_PREFIX))
      .map((u) => u.replace(SCOPES_PREFIX, ""))
      .filter(Boolean)
  ).sort(sortByText);

  const apiGuideUrls = unique(locs.filter((u) => u.startsWith(APIS_ROOT))).sort(sortByText);
  const toolsTop = unique(
    locs
      .filter((u) => u.startsWith(TOOLS_ROOT))
      .map((u) => u.replace(TOOLS_ROOT, "").replace(/^\/+|\/+$/g, ""))
      .filter(Boolean)
      .map((p) => p.split("/")[0])
  ).sort(sortByText);

  console.log(`[catalog] methods discovered: ${methods.length}`);
  console.log(`[catalog] fetching method pages with concurrency=${CONCURRENCY}...`);

  const methodDetails = await mapWithConcurrency(
    methodUrls,
    async (url, idx) => {
      const method = methods[idx];
      try {
        const html = await fetchText(url);
        const description = extractMetaDescription(html);
        const scopes = extractScopesFromMethodHtml(html);
        const family = methodToFamily(method);
        return {
          method,
          family,
          url,
          description,
          scopes,
          korean_rephrase: toKoreanRephrase(method, description),
          family_korean_hint: familyKoreanHint(family),
        };
      } catch (error) {
        return {
          method,
          family: methodToFamily(method),
          url,
          description: "",
          scopes: [],
          korean_rephrase: `${method} 메서드 설명을 로딩하지 못했습니다.`,
          family_korean_hint: familyKoreanHint(methodToFamily(method)),
          fetch_error: String(error),
        };
      }
    },
    CONCURRENCY
  );

  const familyCounts = {};
  for (const m of methodDetails) {
    familyCounts[m.family] = (familyCounts[m.family] || 0) + 1;
  }

  const catalog = {
    generated_at: startedAt,
    source: {
      sitemap: SITEMAP_URL,
      methods_reference: "https://docs.slack.dev/reference/methods",
      scopes_reference: "https://docs.slack.dev/reference/scopes",
    },
    totals: {
      methods: methodDetails.length,
      families: Object.keys(familyCounts).length,
      scopes: scopeNames.length,
      api_guide_urls: apiGuideUrls.length,
      tools_top_categories: toolsTop.length,
    },
    api_guides: apiGuideUrls,
    tools_top_categories: toolsTop,
    scopes: scopeNames,
    families: Object.entries(familyCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([family, count]) => ({
        family,
        count,
        korean_hint: familyKoreanHint(family),
      })),
    methods: methodDetails.sort((a, b) => a.method.localeCompare(b.method)),
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(catalog, null, 2), "utf8");
  console.log(`[catalog] wrote JSON: ${OUTPUT_JSON}`);

  const lines = [];
  lines.push("# Slack API 기능 정리 (한국어 재표현)");
  lines.push("");
  lines.push(`생성 시각: ${catalog.generated_at}`);
  lines.push("출처: Slack 공식 문서(sitemap + methods/scopes references)");
  lines.push("");
  lines.push("## 요약");
  lines.push("");
  lines.push(`- Web API 메서드 수: **${catalog.totals.methods}**`);
  lines.push(`- 메서드 family 수: **${catalog.totals.families}**`);
  lines.push(`- scopes 수: **${catalog.totals.scopes}**`);
  lines.push("");
  lines.push("## family별 기능 범위");
  lines.push("");
  lines.push("| Family | Count | 기능 요약 |");
  lines.push("|---|---:|---|");
  for (const f of catalog.families) {
    lines.push(`| ${f.family} | ${f.count} | ${escapeMd(f.korean_hint)} |`);
  }
  lines.push("");
  lines.push("## 메서드별 기능 설명");
  lines.push("");
  lines.push("| Method | Family | 기능 설명(한국어 재표현) | 공식 설명 | 대표 scopes |");
  lines.push("|---|---|---|---|---|");
  for (const m of catalog.methods) {
    const scopes = m.scopes.length ? m.scopes.join(", ") : "-";
    lines.push(
      `| ${m.method} | ${m.family} | ${escapeMd(m.korean_rephrase)} | ${escapeMd(
        m.description || "-"
      )} | ${escapeMd(scopes)} |`
    );
  }
  lines.push("");
  lines.push("## scope 전체 목록");
  lines.push("");
  for (const s of catalog.scopes) {
    lines.push(`- ${s}`);
  }
  lines.push("");
  lines.push("## API 가이드 링크");
  lines.push("");
  for (const u of catalog.api_guides) {
    lines.push(`- ${u}`);
  }

  fs.writeFileSync(OUTPUT_MD, `${lines.join("\n")}\n`, "utf8");
  console.log(`[catalog] wrote markdown: ${OUTPUT_MD}`);
}

main().catch((error) => {
  console.error("[catalog] fatal error", error);
  process.exit(1);
});
