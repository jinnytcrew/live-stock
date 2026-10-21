# 관리자 Secret 재설정 (LIVE증권 17.7.5)

## 1) 앱 관리자 토큰 설정

이 프로젝트의 관리자 인증은 Cloudflare Worker 환경의 `NXT_ADMIN_TOKEN`을 사용합니다. API 내부 수집 엔드포인트는 `ADMIN_KEY`가 별도로 있으면 그 값을 우선 사용하며, 없으면 `NXT_ADMIN_TOKEN`을 사용합니다. 두 이름을 모두 사용 중인 배포에서는 두 Secret을 일관되게 교체하세요.

### Cloudflare 대시보드에서 교체
1. Cloudflare 대시보드 → **Workers & Pages** → `live-stock` Worker를 엽니다.
2. **Settings → Variables and Secrets** (UI에 따라 **Settings → Bindings**)로 이동합니다.
3. `NXT_ADMIN_TOKEN` Secret을 편집하거나 새 Secret으로 다시 설정하고 저장합니다. 이 앱에서는 `NXT_ADMIN_TOKEN`이 관리자 인증에 필요합니다.
4. `ADMIN_KEY`를 별도 설정한 배포라면 이 값도 같이 교체하세요.
5. Worker가 새 설정을 반영했는지 확인한 뒤, 사이트의 관리자 화면에서 새 값으로 로그인합니다.

### Wrangler CLI에서 교체
프로젝트 폴더에서 아래를 한 줄씩 실행하고 프롬프트에 새 Secret을 입력하세요. 값을 명령어에 직접 쓰거나 채팅/커밋에 붙여 넣지 마세요.

```bash
npx wrangler secret put NXT_ADMIN_TOKEN
```

선택적으로 내부 작업용 별도 키도 쓰는 경우:

```bash
npx wrangler secret put ADMIN_KEY
```

## 2) GitHub Actions Secret

1. GitHub 저장소 → **Settings → Secrets and variables → Actions**로 이동합니다.
2. `NXT_ADMIN_TOKEN`을 추가하거나 기존 항목을 업데이트합니다. 필요하면 `ADMIN_KEY`도 추가/갱신합니다.
3. 배포 워크플로가 Wrangler로 Secret을 직접 업데이트하도록 구성되어 있지 않으면 GitHub에 값을 저장하는 것만으로 Cloudflare Worker Secret이 바뀌지 않습니다. 실제 Worker 환경에서도 위 Cloudflare 대시보드 또는 `wrangler secret put` 절차를 수행해야 합니다.

## 3) 교체 후 안전 확인

- 새 Secret으로 관리자 화면 로그인이 성공하는지 확인합니다.
- `/api/cronstep?job=nxt` 를 인증 없이 호출했을 때 `401`(Secret 미설정 시 `503`)이어야 합니다.
- `x-cron: 1` 헤더만 보내는 호출도 인증을 통과하면 안 됩니다.
- `GET /api/cronstep?job=nxt` 는 `405`여야 합니다. 내부 작업 호출은 `POST`와 `Authorization: Bearer ...`를 사용합니다.

**보안:** Secret을 `wrangler.toml`, JavaScript, GitHub 소스 코드, 스크린샷 또는 공개 이슈에 넣지 마세요. 노출 가능성이 있으면 기존 값을 폐기하고 새 값으로 교체하세요. 이 ZIP을 생성하는 작업은 사용자 Cloudflare/GitHub 설정을 원격으로 변경하지 않습니다.
