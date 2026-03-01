# Codex/Claude Code + Slack MCP: 지금 바로 가능한 일

근거: `data/current-token-capability-report.json` 실호출 결과

## 핵심 요약

1. Codex와 Claude Code에서 사용할 수 있는 MCP 기능은 동일합니다.
2. 기본 토큰(BOT)만으로도 조회/캔버스/일반 API 호출은 바로 됩니다.
3. 검색/메시지 전송/채널 읽기는 USER 토큰으로 실행하면 바로 됩니다.

## AI에게 시킬 수 있는 작업 (정확 매핑)

| 내가 Codex/Claude에게 요청하는 일 | MCP 도구                       | 현재 상태                         |
| --------------------------------- | ------------------------------ | --------------------------------- |
| 사람 찾기/유저 목록 보기          | `search_users`                 | 바로 가능                         |
| 채널 찾기/채널 목록 보기          | `search_channels`              | 바로 가능                         |
| 유저 상세 프로필 보기             | `read_user_profile`            | 바로 가능                         |
| 캔버스 만들기                     | `create_canvas`                | 바로 가능                         |
| Slack API 직접 호출               | `slack_api_call`               | 바로 가능                         |
| Slack HTTP 엔드포인트 직접 호출   | `slack_http_api_call`          | 바로 가능                         |
| 메시지/파일 검색                  | `search_messages_files`        | USER 토큰으로 가능                |
| 채널 메시지 읽기                  | `read_channel`                 | USER 토큰으로 가능                |
| 스레드 읽기                       | `read_thread`                  | USER 토큰 + 유효 `thread_ts` 필요 |
| 메시지 보내기                     | `send_message`                 | USER 토큰으로 가능                |
| 캔버스 수정/본문 조회             | `update_canvas`, `read_canvas` | 가능(필수 파라미터 필요)          |

## 실제로 이렇게 요청하면 됩니다

1. `채널 목록 조회해서 이름과 ID를 표로 정리해줘.`
2. `USER 토큰으로 메시지 검색해서 "배포" 키워드 최근 결과 10개 보여줘.`
3. `USER 토큰으로 C0AHJ8GF09H 채널 최근 30개 메시지 읽어 요약해줘.`
4. `USER 토큰으로 C0AHJ8GF09H 채널에 "테스트 메시지" 전송해줘.`
5. `회의록 캔버스 하나 만들고 제목을 "MCP 점검"으로 생성해줘.`
6. `slack_api_call로 conversations.info 호출해서 C0AHJ8GF09H 메타데이터 보여줘.`

## 토큰별 동작 차이 (중요)

1. 기본 실행 토큰은 BOT입니다.
2. BOT으로 `search.messages/search.files`는 불가입니다. (`not_allowed_token_type`)
3. BOT이 채널에 없으면 `send_message/read_channel/read_thread`는 불가입니다. (`not_in_channel`)
4. USER 토큰으로는 검색/읽기/전송이 실제 테스트에서 동작했습니다.

## 현재 막히는 경우만 정리

1. `update_canvas`: `params.canvas_id`, `params.changes` 없으면 실패
2. `read_canvas`: `params.canvas_id`, `params.criteria` 없으면 실패
3. `read_thread`: 유효한 `thread_ts`가 아니면 실패

## 운영 팁

1. 일반 조회/자동화는 BOT 기본 사용
2. 검색/읽기/전송 작업만 USER 토큰으로 실행
3. BOT으로도 읽기/전송하려면 해당 채널에 BOT 초대
