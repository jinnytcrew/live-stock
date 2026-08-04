/* 내장 버전 정보. ★1 태그문자 금지 ★2 요약식 ★3 toast 3인자
   ★4 거래시간은 krSession() ★5 제도는 공식자료 확인 ★6 2026-09 KRX 연장
   ★7 게스트 폐지 ★8 수능일 추정 ★9 사용자데이터 cacheHdr 금지
   ★10 euc-kr 은 _euckr.js ★11 외부호출 50회·CPU 10ms ★12 긴작업은 _jobs.js
   ★13 Node 전용 패키지는 import 이름 조립
   ★14 node: 접두 모듈(crypto·zlib) 금지. 전역 crypto, DecompressionStream 사용. */
export const BUNDLED_VERSION = {
  version: '4.6.0',
  releasedAt: '2026-08-04 20:10',
  notes: [
    '터미널 없이 배포 가능 — 파일을 끌어다 놓는 것만으로 올릴 수 있는 묶음을 만들었습니다',
    'Node 전용 모듈 제거 — 암호화와 압축 해제를 표준 웹 기술로 바꿔 어느 환경에서나 동작합니다',
    '엑셀 판독기 개선 — 압축 해제를 브라우저 표준 방식으로 교체했습니다',
    '전체 코드를 하나로 묶어 배포 — 40여 개 파일이 단일 파일로 합쳐져 업로드가 간단합니다',
  ],
};
