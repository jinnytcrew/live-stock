/* 내장 버전 정보. ★1 태그문자 금지 ★2 요약식 ★3 toast 3인자
   ★4 거래시간은 krSession() ★5 제도는 공식자료 확인 ★6 2026-09 KRX 연장
   ★7 게스트 폐지 ★8 수능일 추정 ★9 사용자데이터 cacheHdr 금지
   ★10 euc-kr 은 _euckr.js ★11 외부호출 50회·CPU 10ms ★12 긴작업은 _jobs.js
   ★13 Node 전용 패키지는 import 이름 조립
   ★14 node: 접두 모듈(crypto·zlib) 금지. 전역 crypto, DecompressionStream 사용. */
export const BUNDLED_VERSION = {
  version: '4.47.0',
  releasedAt: '2026-08-10 21:30',
  notes: [
    '계좌 비밀번호를 계좌마다 따로 설정합니다 — 개설할 때 숫자 4자리로 정하고, 주문할 때 그 계좌의 비밀번호를 씁니다',
    '너무 쉬운 비밀번호(1111, 1234 같은 반복·연속 숫자)는 사용할 수 없습니다',
    '기존 계정의 계좌 비밀번호는 그대로 이어집니다',
  ],
};
