# LIVE증권 17.7.5 — 종목 미리보기·주문 화면·프리미엄 UI

## 변경 범위

- `index.html`: 종목 프리뷰 측면 패널, 하단 `종목 상세` / `매수·매도` 액션, 프리미엄 종목 헤더 및 주문 호가 컨테이너 추가
- `app.js`: 공통 종목 목록 클릭을 측면 프리뷰로 연결. 기존 `openTrade()`에 상세/주문 모드를 추가하되 기존 계좌·주문검증·주문체결 루틴을 재사용. 공개 호가 선택 시 선택한 가격과 매수/매도 측을 기존 주문 입력 폼에 전달
- `app.css`: 네이비·아이보리·앰버 기준의 공통 카드/탭/입력/내비게이션 스타일 정리, 반응형 측면 패널, 상세 헤더 및 주문 모드 레이아웃
- `version-info.js`, `_worker.js`, `manifest.webmanifest`, `sw.js`: 버전/캐시 식별자를 17.7.5로 동기화

## 로컬 검증

```bash
node --check app.js
node --check _worker.js
node --test market-hours-regression.test.mjs server-security-regression.test.mjs data-feed-regression.test.mjs ui-premium-regression.test.mjs
```

## 검증 한계 및 배포 후 확인

- 정적 회귀 검사는 DOM hook, 라우팅, 주문 모드 및 기존 거래시간·서버 보안 경로의 존재를 검증한다. 이 검사는 실제 브라우저에서의 클릭·배치 검증을 대신하지 않는다.
- `node mobile-qa-check.mjs` 는 로컬에 Playwright 패키지가 없어 실행되지 않았다. 별도 headless Chromium 스모크 테스트도 제한 시간 안에 DOM을 반환하지 않아 완료로 판정하지 않았다. 따라서 실제 화면 좌표/기기 레이아웃의 브라우저 검증은 미완료다.
- 실시간 시세/호가 응답과 장중 주문 시나리오도 배포 후 브라우저에서 확인해야 한다. 앱의 매수·매도는 모의투자이며 실제 증권사 주문을 전송하지 않는다.
- 배포 후 확인: 목록 종목 탭 → 측면 패널 열림 → `종목 상세`가 상세/정보 탭을 표시하는지 → `매수·매도`가 주문 모드로 진입하는지 → 호가 선택 시 가격/매수·매도 방향이 주문 폼에 반영되는지 → 주문 제출 전 기존 세션/계좌/수량 검증이 유지되는지 확인한다.
