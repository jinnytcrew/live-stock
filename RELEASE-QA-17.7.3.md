# LIVE증권 17.7.3 — 거래시간·인증 회귀 검증

## 변경 범위

- `market-hours.mjs`: KRX/NXT 세션 판정, 개별 배지, 홈 상태 요약, 허용 주문유형, NXT 단독 체결구간, 특례일 화면 시각 보정의 공통 기준
- `app.js`: 종목별 거래소 배지의 NXT 판정 대기 표기, 홈 브리핑 세션 문구, 장중/겹침 구간 실시간 표시, 거래소 상세 갱신 주기, 주문 제출 직전 세션/유형 재검증
- `_worker.js`: `/api/cronstep`은 설정된 Secret의 Bearer 인증이 있어야 실행하며 POST만 허용. `x-cron: 1` 및 URL 쿼리의 키로 인증을 우회할 수 없고, Secret 미설정은 fail-closed(503)
- `index.html`, `sw.js`: 모듈 및 서비스워커 캐시 갱신
- `ADMIN-SECRET-SETUP.md`: GitHub/Cloudflare Secret 회전 절차

## 검증 결과

프로젝트 루트에서 실행한 검증:

```bash
node --check app.js
node --check _worker.js
node --check market-hours.mjs
node --test market-hours-regression.test.mjs server-security-regression.test.mjs
```

결과: JS 구문 검사 성공, 회귀 테스트 **18/18 통과**. 회귀 테스트에는 아래가 포함됨:

- KRX 장전 시간외종가와 시가 동시호가 겹침, 09:00 정규장, 15:20 마감 동시호가
- KRX 장후 종가 주문 접수·체결과 16:00~20:00 애프터마켓 경계
- NXT 08:00~08:50 프리, 09:00:30~15:20 메인, 종가매매 접수/체결, 애프터 접수/체결
- KRX/NXT 동시 운영 구간에서 단일 NXT 창으로 잘못 판정하지 않는지
- 오래된 디버그 전역값이 실제 시각 판정을 덮어쓰지 않는지 및 앱/Worker/서비스워커 버전·캐시 키 일치
- NXT 공식 종목 명단을 아직 못 받은 경우 KRX 전용으로 오표시하지 않는지
- 시간특례 표시, 휴장일 차단, KRX/NXT/SOR 주문 유형 제한
- 내부 API의 위조 가능한 헤더·쿼리키 인증 우회 방지 및 내부 호출자의 Bearer 헤더

## 제한 및 배포 후 확인

- 이 검사는 로컬 코드/규칙 회귀 검사이며, 실제 증권사 주문 전송을 검증하는 테스트가 아니다. 앱은 모의투자이며 실주문 전송 기능으로 확인하지 않았다.
- 자동 모바일 화면 검사는 이 실행 환경에서 Chromium이 `127.0.0.1` 페이지 이동을 `ERR_BLOCKED_BY_ADMINISTRATOR`로 거부해 실행하지 못했다. 따라서 모바일 실화면 통과라고 표시하지 않는다. 배포 후 실제 기기에서 `?qa=1`로 오버레이 검사를 수행해야 한다.
- ZIP 생성은 Cloudflare Worker나 GitHub Secret을 원격 변경하지 않는다. 새 관리자 토큰은 `ADMIN-SECRET-SETUP.md` 절차로 Cloudflare에 직접 설정해야 한다.
- 배포 후 확인: 관리자 로그인, 인증 없이 `POST /api/cronstep` → 401(Secret 미설정 시 503), `x-cron: 1`만 지정 → 401, GET → 405, 홈/상세/주문 화면에서 08:00·08:30·08:40·08:50·09:00·09:00:30·15:00·15:20·15:30·15:40·16:00·20:00 시각별 문구 확인.
