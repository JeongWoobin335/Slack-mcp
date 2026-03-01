# Slack API 전체 기능/스코프 정리 (자동 생성)

데이터 소스: `https://docs.slack.dev/sitemap.xml` + Slack 공식 API 문서 페이지

## 1) 현재 구현 MCP가 "모든 Slack API"를 최대 활용하는가?

짧은 답: **아니요 (부분 + 확장형)**

현재 구현은 다음을 제공합니다.

- Slack형 도구 10개: 검색/메시지/채널/스레드/캔버스/유저 프로필
- 범용 도구 1개: `slack_api_call` (임의 Web API 메서드 호출)

즉, Web API 쪽은 스코프가 허용하는 범위에서 크게 확장 가능하지만, 다음은 별도 구현/권한/플랜이 필요합니다.

- Events API 수신(HTTP endpoint/Socket Mode)
- SCIM API, Audit Logs API, Legal Holds API 전용 인증/권한
- Enterprise/Org Admin 전용 API 및 관리자 승인 흐름

## 2) Slack API/도구 현황 요약

- Web API 메서드 수: **304**
- Web API 메서드 family 수: **33**
- Scope 문서 수: **121**
- Core API 가이드 카테고리 수 (/apis): **3** (events-api, slack-connect, web-api)
- Tools 상위 카테고리 수 (/tools): **11** (bolt-js, bolt-python, community-developed-tools, deno-slack-sdk, developer-sandboxes, java-slack-sdk, node-slack-sdk, partner-sandboxes, python-slack-sdk, slack-cli, slack-github-action)

## 3) Core API 가이드 목록

- https://docs.slack.dev/apis/
- https://docs.slack.dev/apis/events-api/
- https://docs.slack.dev/apis/events-api/comparing-http-socket-mode
- https://docs.slack.dev/apis/events-api/using-http-request-urls
- https://docs.slack.dev/apis/events-api/using-socket-mode
- https://docs.slack.dev/apis/slack-connect/
- https://docs.slack.dev/apis/slack-connect/using-slack-connect-api-methods
- https://docs.slack.dev/apis/web-api/
- https://docs.slack.dev/apis/web-api/pagination
- https://docs.slack.dev/apis/web-api/rate-limits
- https://docs.slack.dev/apis/web-api/real-time-search-api
- https://docs.slack.dev/apis/web-api/user-presence-and-status
- https://docs.slack.dev/apis/web-api/using-the-calls-api
- https://docs.slack.dev/apis/web-api/using-the-conversations-api
- https://docs.slack.dev/apis/web-api/using-web-api-with-postman

## 4) 추가 API 레퍼런스(관리/엔터프라이즈 포함)

- https://docs.slack.dev/reference/audit-logs-api
- https://docs.slack.dev/reference/audit-logs-api/anomalous-events-reference
- https://docs.slack.dev/reference/audit-logs-api/methods-actions-reference
- https://docs.slack.dev/reference/legal-holds-api-reference
- https://docs.slack.dev/reference/scim-api/
- https://docs.slack.dev/reference/scim-api/rate-limits
- https://docs.slack.dev/reference/scim-api/scim-api
- https://docs.slack.dev/reference/slack-connect-api-reference
- https://docs.slack.dev/reference/slack-status-api
- https://docs.slack.dev/legacy/legacy-rtm-api

## 5) Web API family별 메서드 수

| Family        | Count |
| ------------- | ----: |
| admin         |   104 |
| api           |     1 |
| apps          |    21 |
| assistant     |     5 |
| auth          |     3 |
| bookmarks     |     4 |
| bots          |     1 |
| calls         |     6 |
| canvases      |     6 |
| chat          |    13 |
| conversations |    28 |
| dialog        |     1 |
| dnd           |     5 |
| emoji         |     1 |
| entity        |     1 |
| files         |    15 |
| functions     |     8 |
| migration     |     1 |
| oauth         |     4 |
| openid        |     2 |
| pins          |     3 |
| reactions     |     4 |
| reminders     |     5 |
| rtm           |     2 |
| search        |     3 |
| slackLists    |    12 |
| stars         |     3 |
| team          |     9 |
| tooling       |     1 |
| usergroups    |     7 |
| users         |    13 |
| views         |     4 |
| workflows     |     8 |

## 6) Web API 메서드 전체 목록

- admin.analytics.getFile
- admin.apps.activities.list
- admin.apps.approve
- admin.apps.approved.list
- admin.apps.clearResolution
- admin.apps.config.lookup
- admin.apps.config.set
- admin.apps.requests.cancel
- admin.apps.requests.list
- admin.apps.restrict
- admin.apps.restricted.list
- admin.apps.uninstall
- admin.audit.anomaly.allow.getItem
- admin.audit.anomaly.allow.updateItem
- admin.auth.policy.assignEntities
- admin.auth.policy.getEntities
- admin.auth.policy.removeEntities
- admin.barriers.create
- admin.barriers.delete
- admin.barriers.list
- admin.barriers.update
- admin.conversations.archive
- admin.conversations.bulkArchive
- admin.conversations.bulkDelete
- admin.conversations.bulkMove
- admin.conversations.bulkSetExcludeFromSlackAi
- admin.conversations.convertToPrivate
- admin.conversations.convertToPublic
- admin.conversations.create
- admin.conversations.createForObjects
- admin.conversations.delete
- admin.conversations.disconnectShared
- admin.conversations.ekm.listOriginalConnectedChannelInfo
- admin.conversations.getConversationPrefs
- admin.conversations.getCustomRetention
- admin.conversations.getTeams
- admin.conversations.invite
- admin.conversations.linkObjects
- admin.conversations.lookup
- admin.conversations.removeCustomRetention
- admin.conversations.rename
- admin.conversations.restrictAccess.addGroup
- admin.conversations.restrictAccess.listGroups
- admin.conversations.restrictAccess.removeGroup
- admin.conversations.search
- admin.conversations.setConversationPrefs
- admin.conversations.setCustomRetention
- admin.conversations.setTeams
- admin.conversations.unarchive
- admin.conversations.unlinkObjects
- admin.emoji.add
- admin.emoji.addAlias
- admin.emoji.list
- admin.emoji.remove
- admin.emoji.rename
- admin.functions.list
- admin.functions.permissions.lookup
- admin.functions.permissions.set
- admin.inviteRequests.approve
- admin.inviteRequests.approved.list
- admin.inviteRequests.denied.list
- admin.inviteRequests.deny
- admin.inviteRequests.list
- admin.roles.addAssignments
- admin.roles.listAssignments
- admin.roles.removeAssignments
- admin.teams.admins.list
- admin.teams.create
- admin.teams.list
- admin.teams.owners.list
- admin.teams.settings.info
- admin.teams.settings.setDefaultChannels
- admin.teams.settings.setDescription
- admin.teams.settings.setDiscoverability
- admin.teams.settings.setIcon
- admin.teams.settings.setName
- admin.usergroups.addChannels
- admin.usergroups.addTeams
- admin.usergroups.listChannels
- admin.usergroups.removeChannels
- admin.users.assign
- admin.users.getExpiration
- admin.users.invite
- admin.users.list
- admin.users.remove
- admin.users.session.clearSettings
- admin.users.session.getSettings
- admin.users.session.invalidate
- admin.users.session.list
- admin.users.session.reset
- admin.users.session.resetBulk
- admin.users.session.setSettings
- admin.users.setAdmin
- admin.users.setExpiration
- admin.users.setOwner
- admin.users.setRegular
- admin.users.unsupportedVersions.export
- admin.workflows.collaborators.add
- admin.workflows.collaborators.remove
- admin.workflows.permissions.lookup
- admin.workflows.search
- admin.workflows.triggers.types.permissions.lookup
- admin.workflows.triggers.types.permissions.set
- admin.workflows.unpublish
- api.test
- apps.activities.list
- apps.auth.external.delete
- apps.auth.external.get
- apps.connections.open
- apps.datastore.bulkDelete
- apps.datastore.bulkGet
- apps.datastore.bulkPut
- apps.datastore.count
- apps.datastore.delete
- apps.datastore.get
- apps.datastore.put
- apps.datastore.query
- apps.datastore.update
- apps.event.authorizations.list
- apps.manifest.create
- apps.manifest.delete
- apps.manifest.export
- apps.manifest.update
- apps.manifest.validate
- apps.uninstall
- apps.user.connection.update
- assistant.search.context
- assistant.search.info
- assistant.threads.setStatus
- assistant.threads.setSuggestedPrompts
- assistant.threads.setTitle
- auth.revoke
- auth.teams.list
- auth.test
- bookmarks.add
- bookmarks.edit
- bookmarks.list
- bookmarks.remove
- bots.info
- calls.add
- calls.end
- calls.info
- calls.participants.add
- calls.participants.remove
- calls.update
- canvases.access.delete
- canvases.access.set
- canvases.create
- canvases.delete
- canvases.edit
- canvases.sections.lookup
- chat.appendStream
- chat.delete
- chat.deleteScheduledMessage
- chat.getPermalink
- chat.meMessage
- chat.postEphemeral
- chat.postMessage
- chat.scheduledMessages.list
- chat.scheduleMessage
- chat.startStream
- chat.stopStream
- chat.unfurl
- chat.update
- conversations.acceptSharedInvite
- conversations.approveSharedInvite
- conversations.archive
- conversations.canvases.create
- conversations.close
- conversations.create
- conversations.declineSharedInvite
- conversations.externalInvitePermissions.set
- conversations.history
- conversations.info
- conversations.invite
- conversations.inviteShared
- conversations.join
- conversations.kick
- conversations.leave
- conversations.list
- conversations.listConnectInvites
- conversations.mark
- conversations.members
- conversations.open
- conversations.rename
- conversations.replies
- conversations.requestSharedInvite.approve
- conversations.requestSharedInvite.deny
- conversations.requestSharedInvite.list
- conversations.setPurpose
- conversations.setTopic
- conversations.unarchive
- dialog.open
- dnd.endDnd
- dnd.endSnooze
- dnd.info
- dnd.setSnooze
- dnd.teamInfo
- emoji.list
- entity.presentDetails
- files.comments.delete
- files.completeUploadExternal
- files.delete
- files.getUploadURLExternal
- files.info
- files.list
- files.remote.add
- files.remote.info
- files.remote.list
- files.remote.remove
- files.remote.share
- files.remote.update
- files.revokePublicURL
- files.sharedPublicURL
- files.upload
- functions.completeError
- functions.completeSuccess
- functions.distributions.permissions.add
- functions.distributions.permissions.list
- functions.distributions.permissions.remove
- functions.distributions.permissions.set
- functions.workflows.steps.list
- functions.workflows.steps.responses.export
- migration.exchange
- oauth.access
- oauth.v2.access
- oauth.v2.exchange
- oauth.v2.user.access
- openid.connect.token
- openid.connect.userInfo
- pins.add
- pins.list
- pins.remove
- reactions.add
- reactions.get
- reactions.list
- reactions.remove
- reminders.add
- reminders.complete
- reminders.delete
- reminders.info
- reminders.list
- rtm.connect
- rtm.start
- search.all
- search.files
- search.messages
- slackLists.access.delete
- slackLists.access.set
- slackLists.create
- slackLists.download.get
- slackLists.download.start
- slackLists.items.create
- slackLists.items.delete
- slackLists.items.deleteMultiple
- slackLists.items.info
- slackLists.items.list
- slackLists.items.update
- slackLists.update
- stars.add
- stars.list
- stars.remove
- team.accessLogs
- team.billableInfo
- team.billing.info
- team.externalTeams.disconnect
- team.externalTeams.list
- team.info
- team.integrationLogs
- team.preferences.list
- team.profile.get
- tooling.tokens.rotate
- usergroups.create
- usergroups.disable
- usergroups.enable
- usergroups.list
- usergroups.update
- usergroups.users.list
- usergroups.users.update
- users.conversations
- users.deletePhoto
- users.discoverableContacts.lookup
- users.getPresence
- users.identity
- users.info
- users.list
- users.lookupByEmail
- users.profile.get
- users.profile.set
- users.setActive
- users.setPhoto
- users.setPresence
- views.open
- views.publish
- views.push
- views.update
- workflows.featured.add
- workflows.featured.list
- workflows.featured.remove
- workflows.featured.set
- workflows.triggers.permissions.add
- workflows.triggers.permissions.list
- workflows.triggers.permissions.remove
- workflows.triggers.permissions.set

## 7) Scope 전체 목록

- admin
- admin.analytics.read
- admin.app_activities.read
- admin.apps.read
- admin.apps.write
- admin.barriers.read
- admin.barriers.write
- admin.chat.read
- admin.chat.write
- admin.conversations.manage_objects
- admin.conversations.read
- admin.conversations.write
- admin.invites.read
- admin.invites.write
- admin.roles.read
- admin.roles.write
- admin.teams.read
- admin.teams.write
- admin.usergroups.read
- admin.usergroups.write
- admin.users.read
- admin.users.write
- admin.workflows.read
- admin.workflows.write
- app_configurations.read
- app_configurations.write
- app_mentions.read
- apps.requests.write
- assistant.write
- auditlogs.read
- authorizations.read
- bookmarks.read
- bookmarks.write
- bot
- calls.read
- calls.write
- canvases.read
- canvases.write
- channels.history
- channels.join
- channels.manage
- channels.read
- channels.write
- channels.write.invites
- channels.write.topic
- chat.write
- chat.write.customize
- chat.write.public
- client
- commands
- connections.write
- conversations.connect.manage
- conversations.connect.read
- conversations.connect.write
- datastore.read
- datastore.write
- dnd.read
- dnd.write
- email
- emoji.read
- files.read
- files.write
- groups.history
- groups.read
- groups.write
- groups.write.invites
- groups.write.topic
- hosting.read
- hosting.write
- identify
- im.history
- im.read
- im.write
- im.write.topic
- incoming-webhook
- links.embed.write
- links.read
- links.write
- lists.read
- lists.write
- metadata.message.read
- mpim.history
- mpim.read
- mpim.write
- mpim.write.topic
- openid
- pins.read
- pins.write
- profile
- reactions.read
- reactions.write
- reminders.read
- reminders.write
- remote_files.read
- remote_files.share
- remote_files.write
- search.read
- search.read.enterprise
- search.read.files
- search.read.im
- search.read.mpim
- search.read.private
- search.read.public
- search.read.users
- stars.read
- stars.write
- team.billing.read
- team.preferences.read
- team.read
- tokens.basic
- triggers.read
- triggers.write
- usergroups.read
- usergroups.write
- users.profile.read
- users.profile.write
- users.read
- users.read.email
- users.write
- workflows.templates.read
- workflows.templates.write

## 8) 현재 MCP 도구별 권장 Scope 매핑

| MCP 도구                | 사용 메서드                       | 권장 scope                                                          |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------- |
| `search_messages_files` | `search.messages`, `search.files` | `search.read`                                                       |
| `search_users`          | `users.list`                      | `users.read`, (`users.read.email` 권장)                             |
| `search_channels`       | `conversations.list`              | `channels.read`, `groups.read`, `im.read`, `mpim.read`              |
| `send_message`          | `chat.postMessage`                | `chat.write` (+ 필요시 `chat.write.public`, `chat.write.customize`) |
| `read_channel`          | `conversations.history`           | `channels.history`, `groups.history`, `im.history`, `mpim.history`  |
| `read_thread`           | `conversations.replies`           | `channels.history`, `groups.history`, `im.history`, `mpim.history`  |
| `create_canvas`         | `canvases.create`                 | `canvases.write`                                                    |
| `update_canvas`         | `canvases.edit`                   | `canvases.write`                                                    |
| `read_canvas`           | `canvases.sections.lookup`        | `canvases.read`                                                     |
| `read_user_profile`     | `users.info`, `users.profile.get` | `users.read`, `users.profile.read`, (`users.read.email` 권장)       |
| `slack_api_call`        | 임의 Web API 메서드               | 호출 대상 메서드별 scope 필요                                       |

## 9) Scope를 어떻게 주면 도구를 최대 사용 가능한가

### A. 현재 10개 Slack형 도구를 거의 모두 쓰는 권장 조합

- 기본 토큰: Bot token (`xoxb`)
- 추가 토큰: User token (`xoxp`, 검색/개인 접근 강화용)
- 권장 scope 집합:
  - `chat.write`, `channels.read`, `groups.read`, `im.read`, `mpim.read`
  - `channels.history`, `groups.history`, `im.history`, `mpim.history`
  - `users.read`, `users.profile.read`, `users.read.email`
  - `canvases.read`, `canvases.write`
  - `search.read`

예상 도구 커버리지 (현재 구현 기준):

- 위 scope를 모두 충족하면 **11/11 도구(10+generic)** 사용 가능
- `search.read`가 없으면 `search_messages_files`가 제한되어 보통 **10/11 이하**

### B. Slack "전체 API" 최대 접근 전략

- 단일 토큰/단일 scope 세트로 전체 API 100% 커버는 불가
- 이유: Admin/SCIM/Audit Logs/Legal Holds는 별도 권한, 조직 플랜, 관리자 승인, 전용 토큰이 필요
- 특히 `admin.*` family 메서드는 **104개**로, 엔터프라이즈/관리자 권한이 사실상 필수

권장 운영 방식:

- MCP 서버는 하나로 유지하되, 호출 시 `token_override`로 토큰을 분리
- 예: 일반 작업은 bot/user token, 관리 작업은 admin token
- 고위험 API는 별도 MCP 서버(또는 별도 명령 그룹)로 분리하여 감사/통제 강화

## 10) 참고 링크

- https://docs.slack.dev/apis/
- https://docs.slack.dev/reference/methods
- https://docs.slack.dev/reference/scopes
- https://docs.slack.dev/ai/slack-mcp-server/
- https://docs.slack.dev/tools/
- https://docs.slack.dev/sitemap.xml
