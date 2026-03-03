# Slack Max API MCP

Slack Web API를 Codex/Claude Code에서 바로 사용할 수 있게 만든 `stdio` MCP 서버입니다.

- 패키지: `slack-max-api-mcp`
- 실행 방식: MCP 클라이언트(Codex/Claude)에서 도구 호출
- 목적: Slack 조회/검색/전송/캔버스/API 직접 호출 자동화

## 이 MCP가 무엇을 하는가

1. Slack API를 MCP 도구로 감싸서 AI가 호출할 수 있게 합니다.
2. 고정 도구 13개 + 카탈로그 기반 동적 메서드 도구(현재 304개)를 제공합니다.
3. 토큰/권한 범위 안에서 Slack 작업을 대화로 실행할 수 있습니다.

## Slack API로 만들 수 있는 것 vs 이 MCP에서 구현한 것

| 구분 | Slack API로 가능한 범위 | 이 MCP에서 구현한 방식 |
|---|---|---|
| 표준 Web API | 대부분 메서드 호출 가능 | `slack_api_call` + `slack_method_*` 자동 도구 |
| 비표준/특수 API (SCIM/Audit/Legal Holds 등) | 엔드포인트별 가능(권한 필요) | `slack_http_api_call` |
| 메시지/파일 검색 | `search.*` 계열 | `search_messages_files` |
| 유저/채널 탐색 | `users.*`, `conversations.*` | `search_users`, `search_channels`, `read_user_profile` |
| 메시지 전송/읽기 | `chat.postMessage`, `conversations.*` | `send_message`, `read_channel`, `read_thread` |
| 캔버스 | `canvases.*` | `create_canvas`, `update_canvas`, `read_canvas` |

참고:
- 고정 도구: 13개
- 카탈로그 메서드 수: 304개
- 카탈로그 스코프 수: 121개 (`data/slack-catalog.json` 기준)

## 제공 도구 목록

### 고정 도구 (13)

1. `slack_api_call`
2. `slack_http_api_call`
3. `search_messages_files`
4. `search_users`
5. `search_channels`
6. `send_message`
7. `read_channel`
8. `read_thread`
9. `create_canvas`
10. `update_canvas`
11. `read_canvas`
12. `read_user_profile`
13. `slack_method_tools_info`

### 동적 도구

1. `slack_method_<family_method>` 형식으로 자동 생성
2. 예: `slack_method_chat_postMessage`
3. 수량은 카탈로그/설정값에 따라 달라짐 (`SLACK_ENABLE_METHOD_TOOLS`, `SLACK_MAX_METHOD_TOOLS`)

## 현재 이 MCP가 할 수 있는 일

실시간 점검 결과 문서:
- [MCP_CURRENT_CAPABILITIES_NOW.md](./MCP_CURRENT_CAPABILITIES_NOW.md)

요약:
1. 기본(BOT)으로 유저/채널 조회, 프로필 조회, 캔버스 생성, 일반 API 호출 가능
2. USER 토큰 사용 시 메시지/파일 검색, 채널 읽기, 메시지 전송 가능
3. BOT으로 검색은 토큰 타입 제한(`not_allowed_token_type`)이 있어 USER 토큰 사용 권장

## 설치 및 실행

```powershell
npm install -g slack-max-api-mcp@latest
slack-max-api-mcp
```

또는:

```powershell
npx -y slack-max-api-mcp
```

## Codex / Claude Code 연결

### Codex

```powershell
codex mcp add slack-max -- npx -y slack-max-api-mcp
codex mcp list
```

### Claude Code

```powershell
claude mcp add slack-max -- npx -y slack-max-api-mcp
claude mcp list
```

## 인증 설정

## 1) 팀 운영 권장: 중앙 Gateway 모드

핵심:
1. `SLACK_CLIENT_SECRET`은 중앙 서버에만 둡니다.
2. 각 사용자 로컬에는 Slack 토큰을 두지 않습니다.
3. OAuth 승인으로 중앙 저장소(`~/.slack-max-api-mcp/tokens.json`)에 사용자별 토큰이 저장됩니다.

### 중앙 서버(1대) 설정

```powershell
setx SLACK_CLIENT_ID "YOUR_CLIENT_ID"
setx SLACK_CLIENT_SECRET "YOUR_CLIENT_SECRET"
setx SLACK_GATEWAY_HOST "0.0.0.0"
setx SLACK_GATEWAY_PORT "8790"
setx SLACK_GATEWAY_PUBLIC_BASE_URL "https://your-gateway.example.com"
setx SLACK_GATEWAY_SHARED_SECRET "long-random-shared-secret"
setx SLACK_GATEWAY_CLIENT_API_KEY "long-random-client-api-key"
setx SLACK_GATEWAY_PUBLIC_ONBOARD "true"
setx SLACK_GATEWAY_PUBLIC_ONBOARD_API_KEY "long-random-client-api-key"
npx -y slack-max-api-mcp gateway start
```

주의:
1. `SLACK_GATEWAY_PUBLIC_ONBOARD=true`는 토큰 없는 온보딩을 허용합니다.
2. 게이트웨이가 비공개(`SLACK_GATEWAY_ALLOW_PUBLIC=false`)라면 `SLACK_GATEWAY_PUBLIC_ONBOARD_API_KEY`를 함께 설정해야 팀원 로컬 클라이언트가 API 호출할 수 있습니다.

### 팀원 경험 (토큰 전달 없이 권장)

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
npx -y slack-max-api-mcp onboard run --gateway "https://your-gateway.example.com"
Remove-Item Env:NODE_TLS_REJECT_UNAUTHORIZED
```

자동 동작:
1. 로컬 클라이언트 설정 파일(`~/.slack-max-api-mcp/client.json`) 작성
2. 브라우저 OAuth 승인 페이지 자동 오픈
3. Slack Allow 승인
4. 완료 후 Codex에서 바로 사용

승인 후 Codex 연결(최초 1회):

```powershell
codex mcp add slack-max -- npx -y slack-max-api-mcp
```

### 팀원 경험 (초대토큰 기반, 기존 방식)

운영자가 팀원용 원클릭 초대 커맨드 생성:

```powershell
npx -y slack-max-api-mcp gateway invite --profile woobin --team T0AHNJ8QN0N
```

위 명령이 팀원에게 전달할 "원클릭 설치 커맨드"를 출력합니다.

```powershell
powershell -ExecutionPolicy Bypass -Command "irm 'https://your-gateway.example.com/onboard.ps1?token=...' | iex"
```

### 팀원 경험 (설치 후 `slack-max-api-mcp`만 실행)

운영자가 아래 값을 사전에 배포(이미지/스크립트/MDM)하면 팀원은 다음만 수행하면 됩니다.

```powershell
npm install -g slack-max-api-mcp@latest
slack-max-api-mcp
```

자동 동작:
1. 대화형 터미널에서 인증 설정이 비어 있으면 자동 온보딩 트리거
2. 브라우저 자동 오픈
3. Slack Allow 승인
4. 완료 후 Codex에서 바로 사용

필요한 사전 배포값(팀원이 직접 입력하지 않아도 됨):
1. `SLACK_AUTO_ONBOARD_URL` 또는
2. `SLACK_AUTO_ONBOARD_GATEWAY` + `SLACK_AUTO_ONBOARD_TOKEN`
3. 토큰 없는 자동 온보딩은 `SLACK_AUTO_ONBOARD_GATEWAY` 단독도 가능 (게이트웨이 `SLACK_GATEWAY_PUBLIC_ONBOARD=true` 필요)

## 2) 단독/개인 운영: 로컬 OAuth 모드

```powershell
setx SLACK_CLIENT_ID "YOUR_CLIENT_ID"
setx SLACK_CLIENT_SECRET "YOUR_CLIENT_SECRET"
npx -y slack-max-api-mcp oauth login --profile my-workspace --team T1234567890
```

토큰은 기본적으로 `~/.slack-max-api-mcp/tokens.json`에 저장됩니다.

## 3) 수동 토큰 모드 (대안)

```powershell
setx SLACK_BOT_TOKEN "xoxb-..."
setx SLACK_USER_TOKEN "xoxp-..."
```

### 토큰 선택 우선순위

1. 도구 입력의 `token_override`
2. Gateway 모드가 켜진 경우: 로컬 `client.json` 또는 env의 Gateway 설정으로 중앙 호출
3. Gateway 미사용 시: 로컬 환경변수 (`SLACK_BOT_TOKEN` / `SLACK_USER_TOKEN` / `SLACK_TOKEN`)
4. OAuth 토큰 저장소의 활성 프로필 (`SLACK_PROFILE` 또는 기본 프로필)
5. `.env.example` fallback (`SLACK_ALLOW_ENV_EXAMPLE_FALLBACK=true`일 때만)

참고:
1. 기본 토큰 타입 우선순위는 `SLACK_DEFAULT_TOKEN_TYPE`으로 조정할 수 있음 (`bot` 기본값, `user`, `generic`, `auto` 지원)
2. `not_allowed_token_type`, `missing_scope` 오류 시 서버가 자동으로 다른 후보 토큰을 재시도함

## 실제 요청 예시 (Codex/Claude에 자연어로)

1. `채널 목록 조회해서 이름과 ID를 표로 정리해줘.`
2. `USER 토큰으로 C0AHJ8GF09H 채널 최근 30개 메시지 읽어 요약해줘.`
3. `USER 토큰으로 C0AHJ8GF09H 채널에 "테스트 메시지" 전송해줘.`
4. `회의록 캔버스 하나 만들고 제목을 "MCP 점검"으로 생성해줘.`

정확도 팁:
1. 검색/읽기/전송은 USER 토큰 사용을 명시
2. 실패 시 `error/needed/provided`를 같이 출력하도록 요청

## 제약 사항과 운영 주의

1. 중앙 Gateway 모드에서는 `SLACK_GATEWAY_SHARED_SECRET` 유출 시 즉시 교체해야 함
2. OAuth든 수동 토큰이든, 토큰 관리 책임은 운영자에게 있음 (노출 시 즉시 회수/재발급)
3. scope 변경 후에는 Slack 앱 재설치(재승인)가 필요할 수 있음
4. 채널 읽기/전송은 봇/사용자 멤버십이 없으면 실패 가능 (`not_in_channel`)
5. 일부 API는 Enterprise 또는 Admin 권한 전용
6. Slack rate limit에 걸릴 수 있음
7. OAuth 저장소(`~/.slack-max-api-mcp/tokens.json`)를 공유 드라이브에 두면 보안 위험이 커짐

## 보안 주의

1. 실제 토큰을 README/코드/패키지/커밋에 넣지 마세요.
2. 토큰 노출 시 즉시 폐기 후 재발급하세요.
3. 필요하면 시크릿 매니저(1Password/Vault/AWS Secrets Manager) 사용을 권장합니다.

## 트러블슈팅 빠른 체크

1. 토큰 유효성: `auth.test`
2. 권한 부족: 응답의 `needed`/`provided` 확인
3. 메시지 전송 실패: 채널 멤버십(`not_in_channel`) 여부 확인
4. 검색 실패: BOT 토큰 사용 여부 확인 (`not_allowed_token_type`)

## 개발 정보

```powershell
npm install
npm run check
npm run build:catalog
npm run start
node src/slack-mcp-server.js oauth help
node src/slack-mcp-server.js gateway help
node src/slack-mcp-server.js onboard help
```

관련 파일:
- 서버: `src/slack-mcp-server.js`
- 카탈로그: `data/slack-catalog.json`
- 현재 기능 점검 결과: `MCP_CURRENT_CAPABILITIES_NOW.md`
