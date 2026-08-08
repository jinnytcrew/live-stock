/* 내장 버전 정보. ★1 태그문자 금지 ★2 요약식 ★3 toast 3인자
   ★4 거래시간은 krSession() ★5 제도는 공식자료 확인 ★6 2026-09 KRX 연장
   ★7 게스트 폐지 ★8 수능일 추정 ★9 사용자데이터 cacheHdr 금지
   ★10 euc-kr 은 _euckr.js ★11 외부호출 50회·CPU 10ms ★12 긴작업은 _jobs.js
   ★13 Node 전용 패키지는 import 이름 조립
   ★14 node: 접두 모듈(crypto·zlib) 금지. 전역 crypto, DecompressionStream 사용. */
export const BUNDLED_VERSION = {
  version: '4.41.0',
  releasedAt: '2026-08-10 04:30',
  notes: [
    '홈 총자산에 달러 예수금을 함께 표시하고, 자산을 국내·해외로 나눈 비중 막대를 추가했습니다',
    '오늘의 시장 카드에 미국 장 상태와 S&P500·나스닥100 등락을 함께 담았습니다',
    '홈 인기 순위에 국내·해외 전환 버튼을 넣었습니다',
    '관심종목·검색·순위 등 모든 목록에서 해외 종목을 눌러도 해외 화면으로 바로 이어집니다',
  ],
};
