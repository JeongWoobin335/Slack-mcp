# Slack API 기능 정리 (한국어)

생성 시각: 2026-03-01T02:16:20.672Z
출처: Slack 공식 문서(sitemap + methods/scopes references)

## 요약

- Web API 메서드 수: **304**
- 메서드 family 수: **33**
- scopes 수: **121**

## Family별 기능 범위

| Family | Count | 기능 요약 |
|---|---:|---|
| admin | 104 | 조직/관리자 운영 자동화 |
| api | 1 | 플랫폼 API 메타 정보 |
| apps | 21 | 앱 설정/연결/승인 관리 |
| assistant | 5 | AI Assistant 검색/컨텍스트 |
| auth | 3 | 인증 테스트/취소/조회 |
| bookmarks | 4 | 북마크 추가/수정/삭제/조회 |
| bots | 1 | 봇 정보 조회 |
| calls | 6 | 콜 객체 생성/수정/종료 |
| canvases | 6 | 캔버스 생성/수정/조회/권한 |
| chat | 13 | 메시지 전송/수정/삭제/스트리밍 |
| conversations | 28 | 채널/DM 생성/조회/이력/멤버 |
| dialog | 1 | 레거시 다이얼로그 |
| dnd | 5 | 방해금지 상태 관리 |
| emoji | 1 | 이모지 조회 |
| entity | 1 | 엔터티 조회 |
| files | 15 | 파일 업로드/조회/공유/삭제 |
| functions | 8 | Slack Functions 관리 |
| migration | 1 | 마이그레이션 지원 |
| oauth | 4 | OAuth 토큰/교환 |
| openid | 2 | OpenID 인증 |
| pins | 3 | 고정 메시지 관리 |
| reactions | 4 | 리액션 추가/삭제/조회 |
| reminders | 5 | 리마인더 생성/조회/완료 |
| rtm | 2 | RTM 연결 |
| search | 3 | 메시지/파일 검색 |
| slackLists | 12 | Slack Lists 관리 |
| stars | 3 | 즐겨찾기 관리 |
| team | 9 | 워크스페이스 정보 |
| tooling | 1 | 개발 도구 API |
| usergroups | 7 | 사용자 그룹 관리 |
| users | 13 | 사용자 조회/프로필/프레즌스 |
| views | 4 | 모달/뷰 열기/수정 |
| workflows | 8 | 워크플로우 상태/실행 관리 |

## API별 기능 설명

| Method | Family | 기능 설명(한국어) | 공식 설명(영문) | 대표 scopes |
|---|---|---|---|---|
| admin.analytics.getFile | admin | 압축된 JSON 파일로 표시된 지정된 날짜에 대한 분석 데이터 검색 | Retrieve analytics data for a given date, presented as a compressed JSON file | admin.analytics.read |
| admin.apps.activities.list | admin | 지정된 팀/조직에 대한 로그 가져오기 | Get logs for a specified team/org | admin.app_activities.read |
| admin.apps.approve | admin | 작업 공간에 설치할 앱을 승인합니다. | Approve an app for installation on a workspace. | admin.apps.write |
| admin.apps.approved.list | admin | 조직 또는 작업 공간에 대해 승인된 앱을 나열합니다. | List approved apps for an org or workspace. | admin.apps.read |
| admin.apps.clearResolution | admin | 앱 해상도 지우기 | Clear an app resolution | admin.apps.write |
| admin.apps.config.lookup | admin | ID별로 커넥터에 대한 앱 구성 조회 | Look up the app config for connectors by their IDs | admin.apps.read |
| admin.apps.config.set | admin | 커넥터에 대한 앱 구성 설정 | Set the app config for a connector | admin.apps.write |
| admin.apps.requests.cancel | admin | 팀을 위한 앱 요청 취소 | Cancel app request for team | admin.apps.write |
| admin.apps.requests.list | admin | 팀/작업 공간에 대한 앱 요청을 나열합니다. | List app requests for a team/workspace. | admin.apps.read |
| admin.apps.restrict | admin | 작업 공간에 설치할 앱을 제한합니다. | Restrict an app for installation on a workspace. | admin.apps.write |
| admin.apps.restricted.list | admin | 조직 또는 작업 공간에 대해 제한된 앱을 나열합니다. | List restricted apps for an org or workspace. | admin.apps.read |
| admin.apps.uninstall | admin | 하나 이상의 작업 공간 또는 전체 엔터프라이즈 조직에서 앱을 제거합니다. | Uninstall an app from one or many workspaces, or an entire enterprise organization. | admin.apps.write |
| admin.audit.anomaly.allow.getItem | admin | 엔터프라이즈 조직 관리자가 엔터프라이즈 구성에서 허용 IP 블록 및 ASN 목록을 읽을 수 있도록 허용하는 API입니다. | API to allow Enterprise org admins to read the allow list of IP blocks and ASNs from the enterprise configuration. | admin |
| admin.audit.anomaly.allow.updateItem | admin | 엔터프라이즈 조직 관리자가 엔터프라이즈 구성에서 허용되는 IP 블록 및 ASN 목록을 작성/덮어쓸 수 있도록 허용하는 API입니다. | API to allow Enterprise org admins to write/overwrite the allow list of IP blocks and ASNs from the enterprise configuration. | admin |
| admin.auth.policy.assignEntities | admin | 특정 인증 정책에 개체를 할당합니다. | Assign entities to a particular authentication policy. | admin.users.write |
| admin.auth.policy.getEntities | admin | 특정 인증 정책에 할당된 모든 엔터티를 이름으로 가져옵니다. | Fetch all the entities assigned to a particular authentication policy by name. | admin.users.read |
| admin.auth.policy.removeEntities | admin | 지정된 인증 정책에서 지정된 개체를 제거합니다. | Remove specified entities from a specified authentication policy. | admin.users.write |
| admin.barriers.create | admin | 정보 장벽 만들기 | Create an Information Barrier | admin.barriers.write |
| admin.barriers.delete | admin | 기존 정보 장벽 삭제 | Delete an existing Information Barrier | admin.barriers.write |
| admin.barriers.list | admin | 조직의 모든 정보 장벽 확보 | Get all Information Barriers for your organization | admin.barriers.read |
| admin.barriers.update | admin | 기존 정보 장벽 업데이트 | Update an existing Information Barrier | admin.barriers.write |
| admin.conversations.archive | admin | 공개 또는 비공개 채널을 보관합니다. | Archive a public or private channel. | admin.conversations.write |
| admin.conversations.bulkArchive | admin | 공개 또는 비공개 채널을 일괄 보관합니다. | Archive public or private channels in bulk. | admin.conversations.write |
| admin.conversations.bulkDelete | admin | 공개 또는 비공개 채널 일괄 삭제 | Delete public or private channels in bulk | admin.conversations.write |
| admin.conversations.bulkMove | admin | 공개 또는 비공개 채널을 일괄 이동합니다. | Move public or private channels in bulk. | admin.conversations.write |
| admin.conversations.bulkSetExcludeFromSlackAi | admin | Slack AI에서 채널 대량 제외 | Exclude channels from Slack AI in bulk | admin.conversations.write |
| admin.conversations.convertToPrivate | admin | 공개 채널을 비공개 채널로 전환합니다. | Convert a public channel to a private channel. | admin.conversations.write |
| admin.conversations.convertToPublic | admin | 비공개 채널을 공개 채널로 전환합니다. | Convert a private channel to a public channel. | admin.conversations.write |
| admin.conversations.create | admin | 공개 또는 비공개 채널 기반 대화를 만듭니다. | Create a public or private channel-based conversation. | admin.conversations.write |
| admin.conversations.createForObjects | admin | 제공된 해당 개체에 대한 Salesforce 채널을 만듭니다. | Create a Salesforce channel for the corresponding object provided. | admin.conversations.manage_objects |
| admin.conversations.delete | admin | 공개 또는 비공개 채널을 삭제합니다. | Delete a public or private channel. | admin.conversations.write |
| admin.conversations.disconnectShared | admin | 하나 이상의 작업 공간에서 연결된 채널의 연결을 끊습니다. | Disconnect a connected channel from one or more workspaces. | admin.conversations.write |
| admin.conversations.ekm.listOriginalConnectedChannelInfo | admin | 연결이 끊긴 모든 채널 (예: 한때 다른 작업 공간에 연결되었다가 연결이 끊긴 채널) 과 EKM의 키 해지에 해당하는 원래 채널 ID를 나열합니다. | List all disconnected channels—i.e., channels that were once connected to other workspaces and then disconnected—and the corresponding original channel IDs for key revocation with EKM. | admin.conversations.read |
| admin.conversations.getConversationPrefs | admin | 공개 또는 비공개 채널에 대한 대화 기본 설정을 가져옵니다. | Get conversation preferences for a public or private channel. | admin.conversations.read |
| admin.conversations.getCustomRetention | admin | 이 API 엔드포인트는 모든 관리자가 대화의 보존 정책을 얻는 데 사용할 수 있습니다. | This API endpoint can be used by any admin to get a conversation's retention policy. | admin.conversations.read |
| admin.conversations.getTeams | admin | 이 Enterprise 조직 내에서 특정 공개 또는 비공개 채널이 연결된 모든 작업 공간을 가져옵니다. | Get all the workspaces a given public or private channel is connected to within this Enterprise org. | admin.conversations.read |
| admin.conversations.invite | admin | 사용자를 공개 또는 비공개 채널에 초대합니다. | Invite a user to a public or private channel. | admin.conversations.write |
| admin.conversations.linkObjects | admin | Salesforce 레코드를 채널에 연결 | Link a Salesforce record to a channel | admin.conversations.manage_objects |
| admin.conversations.lookup | admin | 필터를 사용하여 지정된 팀의 채널을 반환합니다. | Returns channels on the given team using the filters. | admin.conversations.read |
| admin.conversations.removeCustomRetention | admin | 이 API 엔드포인트는 모든 관리자가 대화의 보존 정책을 제거하는 데 사용할 수 있습니다. | This API endpoint can be used by any admin to remove a conversation's retention policy. | admin.conversations.write |
| admin.conversations.rename | admin | 공개 또는 비공개 채널의 이름을 변경합니다. | Rename a public or private channel. | admin.conversations.write |
| admin.conversations.restrictAccess.addGroup | admin | 채널에 액세스하기 위한 IDP 그룹 허용 목록 추가 | Add an allowlist of IDP groups for accessing a channel | admin.conversations.write |
| admin.conversations.restrictAccess.listGroups | admin | 채널에 연결된 모든 IDP 그룹 나열 | List all IDP Groups linked to a channel | admin.conversations.read |
| admin.conversations.restrictAccess.removeGroup | admin | 비공개 채널에서 링크된 IDP 그룹 삭제 | Remove a linked IDP group linked from a private channel | admin.conversations.write |
| admin.conversations.search | admin | Enterprise 조직에서 공개 또는 비공개 채널을 검색합니다. | Search for public or private channels in an Enterprise organization. | admin.conversations.read |
| admin.conversations.setConversationPrefs | admin | 공개 또는 비공개 채널에 대한 게시 권한을 설정합니다. | Set the posting permissions for a public or private channel. | admin.conversations.write |
| admin.conversations.setCustomRetention | admin | 이 API 엔드포인트는 모든 관리자가 대화의 보존 정책을 설정하는 데 사용할 수 있습니다. | This API endpoint can be used by any admin to set a conversation's retention policy. | admin.conversations.write |
| admin.conversations.setTeams | admin | 공개 또는 비공개 채널에 연결하는 Enterprise 조직의 작업 공간을 설정합니다. | Set the workspaces in an Enterprise org that connect to a public or private channel. | admin.conversations.write |
| admin.conversations.unarchive | admin | 공개 또는 비공개 채널 보관을 취소합니다. | Unarchive a public or private channel. | admin.conversations.write |
| admin.conversations.unlinkObjects | admin | 채널에서 Salesforce 레코드 연결 해제 | Unlink a Salesforce record from a channel | admin.conversations.manage_objects |
| admin.emoji.add | admin | 이모티콘을 추가하세요. | Add an emoji. | admin.teams.write |
| admin.emoji.addAlias | admin | 이모티콘 별칭을 추가하세요. | Add an emoji alias. | admin.teams.write |
| admin.emoji.list | admin | Enterprise 조직의 이모티콘을 나열합니다. | List emoji for an Enterprise organization. | admin.teams.read |
| admin.emoji.remove | admin | Enterprise 조직에서 이모티콘 삭제 | Remove an emoji across an Enterprise organization | admin.teams.write |
| admin.emoji.rename | admin | 이모티콘의 이름을 변경합니다. | Rename an emoji. | admin.teams.write |
| admin.functions.list | admin | 일련의 앱으로 함수를 찾습니다. | Look up functions by a set of apps. | admin.workflows.read |
| admin.functions.permissions.lookup | admin | 여러 Slack 함수의 가시성을 조회하고 특정 명명된 엔터티로 제한되는 경우 사용자를 포함합니다. | Lookup the visibility of multiple Slack functions and include the users if it is limited to particular named entities. | admin.workflows.read |
| admin.functions.permissions.set | admin | Slack 함수의 가시성을 설정하고 named_entities로 설정된 경우 사용자 또는 작업 공간을 정의합니다. | Set the visibility of a Slack function and define the users or workspaces if it is set to named_entities. | admin.workflows.read |
| admin.inviteRequests.approve | admin | 작업 공간 초대 요청을 승인합니다. | Approve a workspace invite request. | admin.invites.write |
| admin.inviteRequests.approved.list | admin | 승인된 모든 작업 공간 초대 요청을 나열합니다. | List all approved workspace invite requests. | admin.invites.read |
| admin.inviteRequests.denied.list | admin | 거부된 모든 작업 공간 초대 요청을 나열합니다. | List all denied workspace invite requests. | admin.invites.read |
| admin.inviteRequests.deny | admin | 작업 공간 초대 요청을 거부합니다. | Deny a workspace invite request. | admin.invites.write |
| admin.inviteRequests.list | admin | 대기 중인 모든 작업 공간 초대 요청을 나열합니다. | List all pending workspace invite requests. | admin.invites.read |
| admin.roles.addAssignments | admin | 지정된 범위로 지정된 역할에 구성원을 추가합니다 | Adds members to the specified role with the specified scopes | admin.roles.write |
| admin.roles.listAssignments | admin | 엔터티 전체의 모든 역할에 대한 할당을 나열합니다. 역할 또는 엔터티의 조합으로 결과 범위를 지정할 수 있는 옵션 | Lists assignments for all roles across entities. Options to scope results by any combination of roles or entities | admin.roles.read |
| admin.roles.removeAssignments | admin | 지정된 범위 및 엔터티에 대한 역할에서 사용자 집합을 제거합니다. | Removes a set of users from a role for the given scopes and entities | admin.roles.write |
| admin.teams.admins.list | admin | 지정된 작업 공간에 있는 모든 관리자를 나열합니다. | List all of the admins on a given workspace. | admin.teams.read |
| admin.teams.create | admin | Enterprise 팀을 생성합니다. | Create an Enterprise team. | admin.teams.write |
| admin.teams.list | admin | Enterprise 조직의 모든 팀 나열 | List all teams in an Enterprise organization | admin.teams.read |
| admin.teams.owners.list | admin | 지정된 작업 공간에 있는 모든 소유자를 나열합니다. | List all of the owners on a given workspace. | admin.teams.read |
| admin.teams.settings.info | admin | 작업 공간의 설정에 대한 정보 가져오기 | Fetch information about settings in a workspace | admin.teams.read |
| admin.teams.settings.setDefaultChannels | admin | 작업 공간의 기본 채널을 설정합니다. | Set the default channels of a workspace. | admin.teams.write |
| admin.teams.settings.setDescription | admin | 주어진 작업 공간에 대한 설명을 설정합니다. | Set the description of a given workspace. | admin.teams.write |
| admin.teams.settings.setDiscoverability | admin | 관리자가 지정된 작업 영역의 검색 가능성을 설정할 수 있는 API 메서드 | An API method that allows admins to set the discoverability of a given workspace | admin.teams.write |
| admin.teams.settings.setIcon | admin | 작업 영역의 아이콘을 설정합니다. | Sets the icon of a workspace. | admin.teams.write |
| admin.teams.settings.setName | admin | 지정된 작업 영역의 이름을 설정합니다. | Set the name of a given workspace. | admin.teams.write |
| admin.usergroups.addChannels | admin | IDP 그룹에 최대 100개의 기본 채널을 추가합니다. | Add up to one hundred default channels to an IDP group. | admin.usergroups.write |
| admin.usergroups.addTeams | admin | 하나 이상의 기본 작업 공간을 조직 전체의 IDP 그룹과 연결합니다. | Associate one or more default workspaces with an organization-wide IDP group. | admin.teams.write |
| admin.usergroups.listChannels | admin | 조직 수준 IDP 그룹 (사용자 그룹) 에 연결된 채널을 나열합니다. | List the channels linked to an org-level IDP group (user group). | admin.usergroups.read |
| admin.usergroups.removeChannels | admin | 조직 수준 IDP 그룹 (사용자 그룹) 에서 하나 이상의 기본 채널을 제거합니다. | Remove one or more default channels from an org-level IDP group (user group). | admin.usergroups.write |
| admin.users.assign | admin | 작업 공간에 Enterprise 사용자를 추가합니다. | Add an Enterprise user to a workspace. | admin.users.write |
| admin.users.getExpiration | admin | 게스트의 만료 타임스탬프를 가져옵니다. | Fetches the expiration timestamp for a guest. | admin.users.read |
| admin.users.invite | admin | 사용자를 작업 공간에 초대합니다. | Invite a user to a workspace. | admin.users.write |
| admin.users.list | admin | 작업 공간의 사용자 나열 | List users on a workspace | admin.users.read |
| admin.users.remove | admin | 작업 공간에서 사용자를 제거합니다. | Remove a user from a workspace. | admin.users.write |
| admin.users.session.clearSettings | admin | 사용자 목록에 대한 사용자별 세션 설정 (세션 기간 및 클라이언트가 닫힐 때 발생하는 일) 을 지웁니다. | Clear user-specific session settings—the session duration and what happens when the client closes—for a list of users. | admin.users.write |
| admin.users.session.getSettings | admin | 사용자 목록이 주어지면 사용자별 세션 설정 (세션 기간 및 클라이언트가 닫힐 때 발생하는 일) 을 가져옵니다. | Get user-specific session settings—the session duration and what happens when the client closes—given a list of users. | admin.users.read |
| admin.users.session.invalidate | admin | 사용자에 대한 단일 세션을 취소합니다. 사용자는 Slack에 로그인해야 합니다. | Revoke a single session for a user. The user will be forced to login to Slack. | admin.users.write |
| admin.users.session.list | admin | 조직의 활성 사용자 세션 나열 | List active user sessions for an organization | admin.users.read |
| admin.users.session.reset | admin | 특정 사용자의 모든 장치에서 유효한 세션을 모두 지웁니다 | Wipes all valid sessions on all devices for a given user | admin.users.write |
| admin.users.session.resetBulk | admin | 지정된 사용자 목록에 대한 모든 장치의 모든 유효한 세션을 지우기 위해 비동기 작업을 인큐합니다 | Enqueues an asynchronous job to wipe all valid sessions on all devices for a given list of users | admin.users.write |
| admin.users.session.setSettings | admin | 한 명 이상의 사용자를 위해 사용자 수준 세션 설정 (세션 기간 및 클라이언트가 닫힐 때 발생하는 일) 을 구성합니다. | Configure the user-level session settings—the session duration and what happens when the client closes—for one or more users. | admin.users.write |
| admin.users.setAdmin | admin | 기존 일반 사용자 또는 소유자를 작업 공간 또는 조직 관리자로 설정합니다. | Set an existing regular user or owner to be a workspace or org admin. | admin.users.write |
| admin.users.setExpiration | admin | 게스트 사용자에 대한 만료일 설정 | Set an expiration for a guest user | admin.users.write |
| admin.users.setOwner | admin | 기존 일반 사용자 또는 관리자를 작업 공간 또는 조직 소유자로 설정합니다. | Set an existing regular user or admin to be a workspace or org owner. | admin.users.write |
| admin.users.setRegular | admin | 기존 게스트 사용자, 관리자 사용자 또는 소유자를 일반 사용자로 설정합니다. | Set an existing guest user, admin user, or owner to be a regular user. | admin.users.write |
| admin.users.unsupportedVersions.export | admin | Slackbot에 지원되지 않는 소프트웨어를 사용하여 압축된 CSV 파일로 표시된 모든 작업 공간 구성원을 나열한 내보내기를 보내달라고 요청합니다. | Ask Slackbot to send you an export listing all workspace members using unsupported software, presented as a zipped CSV file. | admin.users.read |
| admin.workflows.collaborators.add | admin | 팀 또는 기업 내 워크플로우에 협업 참여자 추가 | Add collaborators to workflows within the team or enterprise | admin.workflows.write |
| admin.workflows.collaborators.remove | admin | 팀 또는 기업 내 워크플로에서 협업 참여자 제거 | Remove collaborators from workflows within the team or enterprise | admin.workflows.write |
| admin.workflows.permissions.lookup | admin | 일련의 워크플로우에 대한 사용 권한을 찾습니다. | Look up the permissions for a set of workflows | admin.workflows.read |
| admin.workflows.search | admin | 팀 또는 기업 내 워크플로우 검색 | Search workflows within the team or enterprise | admin.workflows.read |
| admin.workflows.triggers.types.permissions.lookup | admin | 각 트리거 유형 사용 권한 나열 | List the permissions for using each trigger type | client |
| admin.workflows.triggers.types.permissions.set | admin | 트리거 유형 사용 권한 설정 | Set the permissions for using a trigger type | client |
| admin.workflows.unpublish | admin | 팀 또는 기업 내 워크플로우 게시 취소 | Unpublish workflows within the team or enterprise | admin.workflows.write |
| api.test | api | API 호출 코드를 확인합니다. | Checks API calling code. | - |
| apps.activities.list | apps | 지정된 앱에 대한 로그 가져오기 | Get logs for a specified app | hosting.read |
| apps.auth.external.delete | apps | Slack 측에서만 외부 인증 토큰 삭제 | Delete external auth tokens only on the Slack side | - |
| apps.auth.external.get | apps | 제공된 토큰 ID에 대한 액세스 토큰을 가져옵니다. | Get the access token for the provided token ID | - |
| apps.connections.open | apps | 이벤트 및 대화형 페이로드를 수신하기 위해 앱이 연결할 수 있는 임시 소켓 모드 웹 소켓 URL을 생성합니다. | Generate a temporary Socket Mode WebSocket URL that your app can connect to in order to receive events and interactive payloads over. | - |
| apps.datastore.bulkDelete | apps | 데이터 저장소에서 항목 일괄 삭제 | Delete items from a datastore in bulk | datastore.write |
| apps.datastore.bulkGet | apps | 데이터 저장소에서 대량으로 항목 가져오기 | Get items from a datastore in bulk | datastore.read |
| apps.datastore.bulkPut | apps | 기존 아이템을 대량으로 생성 또는 교체 | Creates or replaces existing items in bulk | datastore.write |
| apps.datastore.count | apps | 쿼리와 일치하는 데이터스토어의 항목 수를 계산합니다. | Count the number of items in a datastore that match a query | datastore.read |
| apps.datastore.delete | apps | 데이터 저장소에서 항목 삭제 | Delete an item from a datastore | datastore.write |
| apps.datastore.get | apps | 데이터스토어에서 아이템 가져오기 | Get an item from a datastore | datastore.read |
| apps.datastore.put | apps | 새 항목을 만들거나 이전 항목을 새 항목으로 바꿉니다. | Creates a new item, or replaces an old item with a new item. | datastore.write |
| apps.datastore.query | apps | 항목에 대한 데이터 저장소 쿼리 | Query a datastore for items | datastore.read |
| apps.datastore.update | apps | 기존 항목의 속성을 편집하거나 새 항목이 없는 경우 추가합니다. | Edits an existing item's attributes, or adds a new item if it does not already exist. | datastore.write |
| apps.event.authorizations.list | apps | 주어진 이벤트 컨텍스트에 대한 승인 목록을 가져옵니다. 각 인증은 이벤트가 표시되는 앱 설치를 나타냅니다. | Get a list of authorizations for the given event context. Each authorization represents an app installation that the event is visible to. | authorizations.read |
| apps.manifest.create | apps | 앱 매니페스트에서 앱을 만듭니다. | Create an app from an app manifest. | - |
| apps.manifest.delete | apps | 앱 매니페스트를 통해 생성된 앱을 영구적으로 삭제합니다 | Permanently deletes an app created through app manifests | - |
| apps.manifest.export | apps | 기존 앱에서 앱 매니페스트 내보내기 | Export an app manifest from an existing app | - |
| apps.manifest.update | apps | 앱 매니페스트에서 앱 업데이트 | Update an app from an app manifest | - |
| apps.manifest.validate | apps | 앱 매니페스트 유효성 검사 | Validate an app manifest | - |
| apps.uninstall | apps | 작업 공간에서 앱을 제거합니다. | Uninstalls your app from a workspace. | - |
| apps.user.connection.update | apps | 사용자와 앱 간의 연결 상태를 업데이트합니다. | Updates the connection status between a user and an app. | users.write |
| assistant.search.context | assistant | Slack 조직 전체에서 메시지를 검색하므로 광범위하고 구체적이며 실시간으로 데이터를 검색할 수 있습니다. | Searches messages across your Slack organization—perfect for broad, specific, and real-time data retrieval. | search.read.files, search.read.im, search.read.mpim, search.read.private, search.read.public, search.read.users |
| assistant.search.info | assistant | 특정 팀에 대한 검색 기능을 반환합니다. | Returns search capabilities on a given team. | search.read, search.read.public |
| assistant.threads.setStatus | assistant | AI 어시스턴트 스레드의 상태를 설정합니다. | Set the status for an AI assistant thread. | assistant.write |
| assistant.threads.setSuggestedPrompts | assistant | 주어진 어시스턴트 스레드에 대한 제안 프롬프트 설정 | Set suggested prompts for the given assistant thread | assistant.write |
| assistant.threads.setTitle | assistant | 주어진 어시스턴트 스레드의 제목을 설정합니다. | Set the title for the given assistant thread | assistant.write |
| auth.revoke | auth | 토큰을 취소합니다. | Revokes a token. | - |
| auth.teams.list | auth | 조직 전체 앱이 승인된 작업 공간의 전체 목록을 가져옵니다. | Obtain a full list of workspaces your org-wide app has been approved for. | - |
| auth.test | auth | 인증 및 신원을 확인합니다. | Checks authentication & identity. | - |
| bookmarks.add | bookmarks | 채널에 북마크를 추가합니다. | Add bookmark to a channel. | bookmarks.write |
| bookmarks.edit | bookmarks | 북마크 수정 | Edit bookmark. | bookmarks.write |
| bookmarks.list | bookmarks | 채널의 북마크를 나열합니다. | List bookmark for the channel. | bookmarks.read |
| bookmarks.remove | bookmarks | 채널에서 북마크를 제거합니다. | Remove bookmark from the channel. | bookmarks.write |
| bots.info | bots | 봇 사용자에 대한 정보를 가져옵니다. | Gets information about a bot user. | users.read |
| calls.add | calls | 새 통화를 등록합니다. | Registers a new Call. | calls.write |
| calls.end | calls | 통화를 종료합니다. | Ends a Call. | calls.write |
| calls.info | calls | 통화에 대한 정보를 반환합니다. | Returns information about a Call. | calls.read |
| calls.participants.add | calls | 통화에 추가된 새 참가자를 등록합니다. | Registers new participants added to a Call. | calls.write |
| calls.participants.remove | calls | 통화에서 제거된 참가자를 등록합니다. | Registers participants removed from a Call. | calls.write |
| calls.update | calls | 통화에 대한 정보를 업데이트합니다. | Updates information about a Call. | calls.write |
| canvases.access.delete | canvases | 지정된 개체에 대한 캔버스에 대한 액세스 제거 | Remove access to a canvas for specified entities | canvases.write |
| canvases.access.set | canvases | 지정된 개체에 대한 액세스 수준을 캔버스로 설정합니다. | Sets the access level to a canvas for specified entities | canvases.write |
| canvases.create | canvases | 사용자용 캔버스 만들기 | Create canvas for a user | canvases.write |
| canvases.delete | canvases | 캔버스를 삭제합니다 | Deletes a canvas | canvases.write |
| canvases.edit | canvases | 기존 캔버스 업데이트 | Update an existing canvas | canvases.write |
| canvases.sections.lookup | canvases | 제공된 기준과 일치하는 섹션 찾기 | Find sections matching the provided criteria | canvases.read |
| chat.appendStream | chat | 기존 스트리밍 대화에 텍스트 추가 | Append text to an existing streaming conversation | chat.write |
| chat.delete | chat | 메시지를 삭제합니다. | Deletes a message. | chat.write |
| chat.deleteScheduledMessage | chat | 대기열에서 보류 중인 예약 전송 메시지를 삭제합니다. | Deletes a pending scheduled message from the queue. | chat.write |
| chat.getPermalink | chat | 특정 현존하는 메시지에 대한 퍼머링크 URL 검색 | Retrieve a permalink URL for a specific extant message | - |
| chat.meMessage | chat | 채널에 나에 대한 메시지를 공유하세요. | Share a me message into a channel. | chat.write |
| chat.postEphemeral | chat | 채널의 사용자에게 일시적인 메시지를 보냅니다. | Sends an ephemeral message to a user in a channel. | chat.write |
| chat.postMessage | chat | 채널에 메시지를 보냅니다. | Sends a message to a channel. | chat.write, chat.write.customize, chat.write.public |
| chat.scheduledMessages.list | chat | 예약 전송 메시지 목록을 반환합니다. | Returns a list of scheduled messages. | - |
| chat.scheduleMessage | chat | 채널로 보낼 메시지를 예약합니다. | Schedules a message to be sent to a channel. | chat.write |
| chat.startStream | chat | 새로운 스트리밍 대화 시작 | Start a new streaming conversation | chat.write |
| chat.stopStream | chat | 스트리밍 대화 중지 | Stop a streaming conversation | chat.write |
| chat.unfurl | chat | 사용자가 게시한 URL에 대한 사용자 지정 펼침 동작 제공 | Provide custom unfurl behavior for user-posted URLs | links.write |
| chat.update | chat | 메시지를 업데이트합니다. | Updates a message. | chat.write |
| conversations.acceptSharedInvite | conversations | Slack Connect 채널에 대한 초대를 수락합니다. | Accepts an invitation to a Slack Connect channel. | conversations.connect.write |
| conversations.approveSharedInvite | conversations | Slack Connect 채널 초대 승인 | Approves an invitation to a Slack Connect channel | conversations.connect.manage |
| conversations.archive | conversations | 대화를 보관합니다. | Archives a conversation. | channels.manage, channels.write, groups.write, im.write, mpim.write |
| conversations.canvases.create | conversations | 채널용 채널 캔버스 만들기 | Create a channel canvas for a channel | canvases.write |
| conversations.close | conversations | 다이렉트 메시지 또는 여러 사람의 다이렉트 메시지를 닫습니다. | Closes a direct message or multi-person direct message. | channels.manage, channels.write, groups.write, im.write, mpim.write |
| conversations.create | conversations | 공개 또는 비공개 채널 기반 대화를 시작합니다. | Initiates a public or private channel-based conversation | channels.manage, channels.write, groups.write, im.write, mpim.write |
| conversations.declineSharedInvite | conversations | Slack Connect 채널 초대를 거부합니다. | Declines a Slack Connect channel invite. | conversations.connect.manage |
| conversations.externalInvitePermissions.set | conversations | '게시만 가능' 과 '게시 및 초대 가능' 간 Slack Connect 채널 권한을 업그레이드하거나 다운그레이드하세요. | Upgrade or downgrade Slack Connect channel permissions between 'can post only' and 'can post and invite'. | conversations.connect.manage |
| conversations.history | conversations | 메시지 및 이벤트에 대한 대화 기록을 가져옵니다. | Fetches a conversation's history of messages and events. | channels.history, groups.history, im.history, mpim.history |
| conversations.info | conversations | 대화에 대한 정보를 검색합니다. | Retrieve information about a conversation. | channels.read, groups.read, im.read, mpim.read |
| conversations.invite | conversations | 채널에 사용자를 초대합니다. | Invites users to a channel. | channels.manage, channels.write, channels.write.invites, groups.write, groups.write.invites, im.write, mpim.write |
| conversations.inviteShared | conversations | Slack Connect 채널에 초대장 보내기 | Sends an invitation to a Slack Connect channel | conversations.connect.write |
| conversations.join | conversations | 기존 대화에 참여합니다. | Joins an existing conversation. | channels.join, channels.write |
| conversations.kick | conversations | 대화에서 사용자를 제거합니다. | Removes a user from a conversation. | channels.manage, channels.write, groups.write, im.write, mpim.write |
| conversations.leave | conversations | 대화를 남깁니다. | Leaves a conversation. | channels.manage, channels.write, groups.write, im.write, mpim.write |
| conversations.list | conversations | Slack 팀의 모든 채널을 나열합니다. | Lists all channels in a Slack team. | channels.read, groups.read, im.read, mpim.read |
| conversations.listConnectInvites | conversations | 생성되거나 수신되었지만 모든 당사자가 승인하지 않은 공유 채널 초대를 나열합니다. | Lists shared channel invites that have been generated or received but have not been approved by all parties | conversations.connect.manage |
| conversations.mark | conversations | 채널에서 읽기 커서를 설정합니다. | Sets the read cursor in a channel. | channels.manage, channels.write, groups.write, im.write, mpim.write |
| conversations.members | conversations | 대화의 구성원을 검색합니다. | Retrieve members of a conversation. | channels.read, groups.read, im.read, mpim.read |
| conversations.open | conversations | 다이렉트 메시지 또는 여러 사람의 다이렉트 메시지를 열거나 재개합니다. | Opens or resumes a direct message or multi-person direct message. | channels.manage, channels.write, groups.write, im.write, mpim.write |
| conversations.rename | conversations | 대화의 이름을 변경합니다. | Renames a conversation. | channels.manage, channels.write, groups.write, im.write, mpim.write |
| conversations.replies | conversations | 대화에 게시된 메시지 스레드 검색 | Retrieve a thread of messages posted to a conversation | channels.history, groups.history, im.history, mpim.history |
| conversations.requestSharedInvite.approve | conversations | 채널에 외부 사용자를 추가하라는 요청을 승인하고 Slack Connect 초대장을 보냅니다. | Approves a request to add an external user to a channel and sends them a Slack Connect invite | conversations.connect.manage |
| conversations.requestSharedInvite.deny | conversations | 외부 사용자를 채널에 초대하는 요청을 거부합니다. | Denies a request to invite an external user to a channel | conversations.connect.manage |
| conversations.requestSharedInvite.list | conversations | 필터링 기능이 있는 채널에 외부 사용자를 추가하는 요청을 나열합니다. | Lists requests to add external users to channels with ability to filter. | conversations.connect.manage |
| conversations.setPurpose | conversations | 채널 설명을 설정합니다. | Sets the channel description. | channels.manage, channels.write, channels.write.topic, groups.write, groups.write.topic, im.write, im.write.topic, mpim.write, mpim.write.topic |
| conversations.setTopic | conversations | 대화의 주제를 설정합니다. | Sets the topic for a conversation. | channels.manage, channels.write, channels.write.topic, groups.write, groups.write.topic, im.write, im.write.topic, mpim.write, mpim.write.topic |
| conversations.unarchive | conversations | 대화 아카이브를 되돌립니다. | Reverses conversation archival. | channels.manage, channels.write, groups.write, im.write, mpim.write |
| dialog.open | dialog | 사용자와 대화 상자 열기 | Open a dialog with a user | - |
| dnd.endDnd | dnd | 현재 사용자의 방해 금지 세션을 즉시 종료합니다. | Ends the current user's Do Not Disturb session immediately. | dnd.write |
| dnd.endSnooze | dnd | 현재 사용자의 휴식 모드가 즉시 종료됩니다. | Ends the current user's snooze mode immediately. | dnd.write |
| dnd.info | dnd | 사용자의 현재 방해 금지 상태를 검색합니다. | Retrieves a user's current Do Not Disturb status. | dnd.read |
| dnd.setSnooze | dnd | 현재 사용자의 방해 금지 모드를 켜거나 지속 시간을 변경합니다. | Turns on Do Not Disturb mode for the current user, or changes its duration. | dnd.write |
| dnd.teamInfo | dnd | 팀에서 최대 50명의 사용자에 대한 방해 금지 상태를 검색합니다. | Retrieves the Do Not Disturb status for up to 50 users on a team. | dnd.read |
| emoji.list | emoji | 팀의 맞춤 이모티콘을 나열합니다. | Lists custom emoji for a team. | emoji.read |
| entity.presentDetails | entity | 작업 개체에 대한 사용자 지정 flexpane 동작을 제공합니다. 앱은 이 메서드를 호출하여 사용자별 flexpane 메타데이터를 클라이언트에 전송합니다. | Provide custom flexpane behavior for Work Objects. Apps call this method to send per-user flexpane metadata to the client. | - |
| files.comments.delete | files | 파일에 대한 기존 주석을 삭제합니다. | Deletes an existing comment on a file. | files.write |
| files.completeUploadExternal | files | Files.getUploadURLExternal로 시작된 업로드를 완료합니다 | Finishes an upload started with files.getUploadURLExternal | files.write |
| files.delete | files | 파일을 삭제합니다. | Deletes a file. | files.write |
| files.getUploadURLExternal | files | 가장자리 외부 파일 업로드를 위한 URL을 가져옵니다 | Gets a URL for an edge external file upload | files.write |
| files.info | files | 파일에 대한 정보를 가져옵니다. | Gets information about a file. | files.read |
| files.list | files | 팀, 채널 또는 필터가 적용된 사용자를 나열합니다. | List for a team, in a channel, or from a user with applied filters. | files.read |
| files.remote.add | files | 원격 서비스에서 파일을 추가합니다 | Adds a file from a remote service | bot, remote_files.write |
| files.remote.info | files | Slack에 추가된 원격 파일에 대한 정보 검색 | Retrieve information about a remote file added to Slack | remote_files.read |
| files.remote.list | files | Slack에 추가된 원격 파일에 대한 정보 검색 | Retrieve information about a remote file added to Slack | remote_files.read |
| files.remote.remove | files | 원격 파일을 제거합니다. | Remove a remote file. | remote_files.write |
| files.remote.share | files | 원격 파일을 채널에 공유합니다. | Share a remote file into a channel. | remote_files.share |
| files.remote.update | files | 기존 원격 파일을 업데이트합니다. | Updates an existing remote file. | remote_files.write |
| files.revokePublicURL | files | 파일에 대한 공개/외부 공유 액세스를 취소합니다 | Revokes public/external sharing access for a file | files.write |
| files.sharedPublicURL | files | 공개/외부 공유를 위한 파일을 활성화합니다. | Enables a file for public/external sharing. | files.write |
| files.upload | files | 파일을 업로드하거나 만듭니다. | Uploads or creates a file. | files.write |
| functions.completeError | functions | 함수가 완료되지 않았다는 신호 | Signal that a function failed to complete | - |
| functions.completeSuccess | functions | 함수의 성공적인 완료를 알리는 신호 | Signal the successful completion of a function | - |
| functions.distributions.permissions.add | functions | PERMISSION_TYPE이 named_entities로 설정된 경우 사용자 정의 슬랙 함수에 대한 액세스 권한을 사용자에게 부여합니다. | Grant users access to a custom slack function if its permission_type is set to named_entities | - |
| functions.distributions.permissions.list | functions | 사용자 정의 슬랙 함수의 액세스 유형을 나열하고 permission_type이 named_entities로 설정된 경우 액세스 권한이 있는 사용자, 팀 또는 조직 ID를 포함합니다. | List the access type of a custom slack function and include the users, team or org ids with access if its permission_type is set to named_entities | - |
| functions.distributions.permissions.remove | functions | Permission_type이 named_entities로 설정된 경우 사용자 정의 슬랙 함수에 대한 사용자 액세스 취소 | Revoke user access to a custom slack function if permission_type set to named_entities | - |
| functions.distributions.permissions.set | functions | 사용자 정의 슬랙 함수의 액세스 유형을 설정하고 permission_type이 named_entities로 설정된 경우 액세스 권한이 부여될 사용자, 팀 또는 조직 ID를 정의합니다. | Set the access type of a custom slack function and define the users, team or org ids to be granted access if permission_type is set to named_entities | - |
| functions.workflows.steps.list | functions | 워크플로 버전의 특정 함수 단계 나열 | List the steps of a specific function of a workflow's versions | - |
| functions.workflows.steps.responses.export | functions | 워크플로우의 양식 응답 다운로드 | Download form responses of a workflow | - |
| migration.exchange | migration | Enterprise 조직 작업 공간의 경우 로컬 사용자 ID를 글로벌 사용자 ID에 매핑합니다. | For Enterprise organization workspaces, map local user IDs to global user IDs | tokens.basic |
| oauth.access | oauth | 액세스 토큰에 대한 임시 OAuth 확인자 코드를 교환합니다. | Exchanges a temporary OAuth verifier code for an access token. | - |
| oauth.v2.access | oauth | 액세스 토큰에 대한 임시 OAuth 확인자 코드를 교환합니다. | Exchanges a temporary OAuth verifier code for an access token. | - |
| oauth.v2.exchange | oauth | 레거시 액세스 토큰을 새로운 만료되는 액세스 토큰 및 새로 고침 토큰으로 교환합니다 | Exchanges a legacy access token for a new expiring access token and refresh token | - |
| oauth.v2.user.access | oauth | 사용자 액세스 토큰에 대한 임시 OAuth 확인자 코드를 교환합니다. | Exchanges a temporary OAuth verifier code for a user access token. | - |
| openid.connect.token | openid | Slack으로 로그인하기 위한 액세스 토큰으로 임시 OAuth 확인자 코드를 교환합니다. | Exchanges a temporary OAuth verifier code for an access token for Sign in with Slack. | - |
| openid.connect.userInfo | openid | Slack으로 로그인을 승인한 사용자의 신원을 확인합니다. | Get the identity of a user who has authorized Sign in with Slack. | openid |
| pins.add | pins | 아이템을 채널에 고정합니다. | Pins an item to a channel. | pins.write |
| pins.list | pins | 채널에 고정된 항목을 나열합니다. | Lists items pinned to a channel. | pins.read |
| pins.remove | pins | 채널에서 항목을 고정 해제합니다. | Un-pins an item from a channel. | pins.write |
| reactions.add | reactions | 항목에 반응을 추가합니다. | Adds a reaction to an item. | reactions.write |
| reactions.get | reactions | 아이템에 대한 반응을 가져옵니다. | Gets reactions for an item. | reactions.read |
| reactions.list | reactions | 사용자가 작성한 반응을 나열합니다. | Lists reactions made by a user. | reactions.read |
| reactions.remove | reactions | 항목에서 반응을 제거합니다. | Removes a reaction from an item. | reactions.write |
| reminders.add | reminders | 미리 알림을 생성합니다. | Creates a reminder. | reminders.write |
| reminders.complete | reminders | 알림을 완료로 표시합니다. | Marks a reminder as complete. | reminders.write |
| reminders.delete | reminders | 미리 알림을 삭제합니다. | Deletes a reminder. | reminders.write |
| reminders.info | reminders | 알림에 대한 정보를 가져옵니다. | Gets information about a reminder. | reminders.read |
| reminders.list | reminders | 특정 사용자에 의해 또는 특정 사용자에 대해 생성된 모든 미리 알림을 나열합니다. | Lists all reminders created by or for a given user. | reminders.read |
| rtm.connect | rtm | 실시간 메시징 세션을 시작합니다. | Starts a Real Time Messaging session. | - |
| rtm.start | rtm | 사용되지 않음: 실시간 메시징 세션을 시작합니다. 대신 rtm.connect를 사용하십시오. | Deprecated: Starts a Real Time Messaging session. Use rtm.connect instead. | - |
| search.all | search | 쿼리와 일치하는 메시지 및 파일을 검색합니다. | Searches for messages and files matching a query. | search.read |
| search.files | search | 쿼리와 일치하는 파일을 검색합니다. | Searches for files matching a query. | search.read |
| search.messages | search | 검색어와 일치하는 메시지를 검색합니다. | Searches for messages matching a query. | search.read |
| slackLists.access.delete | slackLists | 지정된 엔터티에 대한 목록에 대한 액세스를 취소합니다. | Revoke access to a List for specified entities. | lists.write |
| slackLists.access.set | slackLists | 지정된 엔터티에 대한 액세스 수준을 목록으로 설정합니다. | Set the access level to a List for specified entities. | lists.write |
| slackLists.create | slackLists | 리스트 만들기 | Create a List. | lists.write |
| slackLists.download.get | slackLists | 목록 콘텐츠를 다운로드하기 위해 내보내기 작업에서 목록 다운로드 URL을 검색합니다. | Retrieve List download URL from an export job to download List contents. | lists.read |
| slackLists.download.start | slackLists | 목록 내용을 내보내기 위해 작업을 시작하십시오. | Initiate a job to export List contents. | lists.read |
| slackLists.items.create | slackLists | 기존 목록에 새 항목을 추가합니다. | Add a new item to an existing List. | lists.write |
| slackLists.items.delete | slackLists | 기존 목록에서 항목을 삭제합니다. | Deletes an item from an existing List. | lists.write |
| slackLists.items.deleteMultiple | slackLists | 기존 목록에서 여러 항목을 삭제합니다. | Deletes multiple items from an existing List. | lists.write |
| slackLists.items.info | slackLists | 목록에서 행을 가져옵니다. | Get a row from a List. | lists.read |
| slackLists.items.list | slackLists | 목록에서 레코드를 가져옵니다. | Get records from a List. | lists.read |
| slackLists.items.update | slackLists | 목록의 셀을 업데이트합니다. | Updates cells in a List. | lists.write |
| slackLists.update | slackLists | 목록을 업데이트합니다. | Update a List. | lists.write |
| stars.add | stars | 나중을 위해 아이템을 저장하세요. 이전에는 별을 추가하는 것으로 알려졌습니다. | Save an item for later. Formerly known as adding a star. | stars.write |
| stars.list | stars | 사용자가 저장한 항목 (이전에는 별표 표시로 알려짐) 을 나열했습니다. | Listed a user's saved items, formerly known as stars. | stars.read |
| stars.remove | stars | 항목에서 저장된 항목 (별표) 을 제거합니다. | Removes a saved item (star) from an item. | stars.write |
| team.accessLogs | team | 현재 팀의 액세스 로그를 가져옵니다. | Gets the access logs for the current team. | admin |
| team.billableInfo | team | 현재 팀의 청구 가능한 사용자 정보를 가져옵니다. | Gets billable users information for the current team. | admin |
| team.billing.info | team | 작업 공간의 청구 계획 정보를 읽습니다. | Reads a workspace's billing plan information. | team.billing.read |
| team.externalTeams.disconnect | team | 외부 조직의 연결을 끊습니다. | Disconnect an external organization. | conversations.connect.manage |
| team.externalTeams.list | team | 연결된 모든 외부 팀의 목록과 연결에 대한 세부 정보를 반환합니다. | Returns a list of all the external teams connected and details about the connection. | conversations.connect.manage, team.read |
| team.info | team | 현재 팀에 대한 정보를 가져옵니다. | Gets information about the current team. | team.read |
| team.integrationLogs | team | 현재 팀의 통합 로그를 가져옵니다. | Gets the integration logs for the current team. | admin |
| team.preferences.list | team | 작업 공간의 팀 기본 설정 목록을 검색합니다. | Retrieve a list of a workspace's team preferences. | team.preferences.read |
| team.profile.get | team | 팀의 프로필을 검색합니다. | Retrieve a team's profile. | users.profile.read |
| tooling.tokens.rotate | tooling | 새 앱 구성 토큰으로 새로 고침 토큰을 교환합니다. | Exchanges a refresh token for a new app configuration token. | - |
| usergroups.create | usergroups | 단체(그룹) 만들기 | Create a User Group. | usergroups.write |
| usergroups.disable | usergroups | 기존 사용자 그룹을 비활성화합니다. | Disable an existing User Group. | usergroups.write |
| usergroups.enable | usergroups | 사용자 그룹을 활성화합니다. | Enable a User Group. | usergroups.write |
| usergroups.list | usergroups | 팀의 모든 사용자 그룹을 나열합니다. | List all User Groups for a team. | usergroups.read |
| usergroups.update | usergroups | 기존 사용자 그룹을 업데이트합니다. | Update an existing User Group. | usergroups.write |
| usergroups.users.list | usergroups | 사용자 그룹의 모든 사용자를 나열합니다. | List all users in a User Group. | usergroups.read |
| usergroups.users.update | usergroups | 사용자 그룹의 사용자 목록을 업데이트합니다. | Update the list of users for a user group. | usergroups.write |
| users.conversations | users | 호출 사용자가 구성원인 대화를 나열합니다. | List conversations the calling user is a member of. | channels.read, groups.read, im.read, mpim.read |
| users.deletePhoto | users | 프로필 사진 삭제 | Delete the user profile photo | users.profile.write |
| users.discoverableContacts.lookup | users | Slack에서 검색 가능한 사람이 있는지 확인하려면 이메일 주소를 조회하세요. | Look up an email address to see if someone is discoverable on Slack | conversations.connect.manage, team.read |
| users.getPresence | users | 사용자의 현재 상태 정보를 가져옵니다. | Gets user presence information. | users.read |
| users.identity | users | 사용자의 신원을 확인합니다. | Get a user's identity. | identity.read |
| users.info | users | 사용자에 대한 정보를 가져옵니다. | Gets information about a user. | users.read, users.read.email |
| users.list | users | Lists all users in a Slack team 기능을 수행합니다. | Lists all users in a Slack team. | users.read, users.read.email |
| users.lookupByEmail | users | Find a user with an email address 기능을 수행합니다. | Find a user with an email address. | users.read, users.read.email, users.read.email. |
| users.profile.get | users | 가져옵니다: a user's profile information, including their custom status | Retrieve a user's profile information, including their custom status. | users.profile.read, users.read, users.read.email |
| users.profile.set | users | 설정합니다: a user's profile information, including custom status | Set a user's profile information, including custom status. | users.profile.write |
| users.setActive | users | 표시합니다: a user as active. Deprecated and non-functional | Marked a user as active. Deprecated and non-functional. | users.write |
| users.setPhoto | users | 설정합니다: the user profile photo | Set the user profile photo | users.profile.write |
| users.setPresence | users | Manually sets user presence 기능을 수행합니다. | Manually sets user presence. | users.write |
| views.open | views | 엽니다: a view for a user | Open a view for a user. | - |
| views.publish | views | 게시합니다: a static view for a User | Publish a static view for a User. | - |
| views.push | views | 추가합니다: a view onto the stack of a root view | Push a view onto the stack of a root view. | - |
| views.update | views | 수정합니다: an existing view | Update an existing view. | - |
| workflows.featured.add | workflows | 추가합니다: featured workflows to a channel | Add featured workflows to a channel. | bookmarks.write |
| workflows.featured.list | workflows | 목록을 조회합니다: the featured workflows for specified channels | List the featured workflows for specified channels. | bookmarks.read |
| workflows.featured.remove | workflows | 제거합니다: featured workflows from a channel | Remove featured workflows from a channel. | bookmarks.write |
| workflows.featured.set | workflows | 설정합니다: featured workflows for a channel | Set featured workflows for a channel. | bookmarks.write |
| workflows.triggers.permissions.add | workflows | 허용합니다: users to run a trigger that has its permission type set to named_entities | Allows users to run a trigger that has its permission type set to named_entities | triggers.write |
| workflows.triggers.permissions.list | workflows | 반환합니다: the permission type of a trigger and if applicable, includes the entities that have been granted access | Returns the permission type of a trigger and if applicable, includes the entities that have been granted access | triggers.read |
| workflows.triggers.permissions.remove | workflows | Revoke an entity's access to a trigger that has its permission type set to named_entities 기능을 수행합니다. | Revoke an entity's access to a trigger that has its permission type set to named_entities | triggers.write |
| workflows.triggers.permissions.set | workflows | 설정합니다: the permission type for who can run a trigger | Set the permission type for who can run a trigger | triggers.write |

## Scope 전체 목록

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

## API 가이드 링크

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
