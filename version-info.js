/* 내장 버전 정보. ★1 태그문자 금지 ★2 요약식 ★3 toast 3인자
   ★4 거래시간은 krSession() ★5 제도는 공식자료 확인 ★6 2026-09 KRX 연장
   ★7 게스트 폐지 ★8 수능일 추정 ★9 사용자데이터 cacheHdr 금지
   ★10 euc-kr 은 _euckr.js ★11 외부호출 50회·CPU 10ms ★12 긴작업은 _jobs.js
   ★13 Node 전용 패키지는 import 이름 조립
   ★14 node: 접두 모듈(crypto·zlib) 금지. 전역 crypto, DecompressionStream 사용. */
export const BUNDLED_VERSION = {
  version: '4.17.0',
  releasedAt: '2026-08-07 20:15',
  notes: [
    '앱 아이콘을 상승 그래프로 바꿨습니다 — 캐릭터를 빼고 우상향 차트와 화살표로 단순하게 정리했습니다',
    'LIVE 증권 글자와 L 로고를 아래로 내려 여백을 잡았습니다',
    '입장 화면 그림도 같은 상승 그래프로 통일했습니다',
  ],
};
