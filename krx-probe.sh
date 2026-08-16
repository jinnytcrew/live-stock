#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  KRX bld 코드 탐침 — 후보를 한 번에 훑어 '어느 것이 실제로 데이터를 주는지' 찾는다
#  ──────────────────────────────────────────────────────────────────────────────
#  하나씩 찍어 보는 방식은 한 번에 하나만 확인되고, 빈 응답이 오면 그 코드가 틀린
#  것인지 파라미터가 틀린 것인지도 구분되지 않는다. 여기서는
#    ① 후보 코드를 차례로 던지고
#    ② 응답 길이·최상위 키·첫 행의 필드 이름까지 뽑아 준다.
#  결과에서 length 가 크고 키가 보이는 줄이 정답이다.
#
#  사용:  bash krx-probe.sh            (기본 날짜 = 최근 영업일 추정)
#         bash krx-probe.sh 20260814   (날짜 지정)
# ══════════════════════════════════════════════════════════════════════════════
D="${1:-$(date -d 'last friday' +%Y%m%d 2>/dev/null || date +%Y%m%d)}"
U="https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd"
H_REF="Referer: https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd"
H_UA="User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"
H_XR="X-Requested-With: XMLHttpRequest"
H_CT="Content-Type: application/x-www-form-urlencoded; charset=UTF-8"

echo "기준일: $D"
echo "────────────────────────────────────────────────────────────"

probe () {           # $1=라벨  $2=bld  $3=추가파라미터
  local body
  body=$(curl -s -X POST "$U" -H "$H_REF" -H "$H_UA" -H "$H_XR" -H "$H_CT" \
    --data "bld=$2&trdDd=$D&share=1&money=1&csvxls_isNo=false$3" 2>/dev/null)
  local len=${#body}
  local keys first
  keys=$(printf '%s' "$body" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    ks=list(d.keys())
    print('키='+','.join(ks[:4]), end='')
    for k in ks:
        v=d.get(k)
        if isinstance(v,list) and v:
            print(' | '+k+'['+str(len(v))+'] 필드: '+','.join(list(v[0].keys())[:9]), end='')
            break
except Exception as e:
    print('JSON아님', end='')
" 2>/dev/null)
  printf '%-34s len=%-7s %s\n' "$1" "$len" "$keys"
}

echo "■ 프로그램매매 후보"
probe "MDCSTAT30001"            "dbms/MDC/STAT/standard/MDCSTAT30001" ""
probe "MDCSTAT02701 (STK)"      "dbms/MDC/STAT/standard/MDCSTAT02701" "&mktId=STK"
probe "MDCSTAT02801 (STK)"      "dbms/MDC/STAT/standard/MDCSTAT02801" "&mktId=STK"
probe "MDCSTAT02901 (STK)"      "dbms/MDC/STAT/standard/MDCSTAT02901" "&mktId=STK"
probe "MDCSTAT03001 (STK)"      "dbms/MDC/STAT/standard/MDCSTAT03001" "&mktId=STK"
probe "MDCSTAT03101 (STK)"      "dbms/MDC/STAT/standard/MDCSTAT03101" "&mktId=STK"

echo
echo "■ 배당 후보 (PER/PBR/배당수익률 계열)"
probe "MDCSTAT03501 (STK)"      "dbms/MDC/STAT/standard/MDCSTAT03501" "&mktId=STK&searchType=1"
probe "MDCSTAT03502 (STK)"      "dbms/MDC/STAT/standard/MDCSTAT03502" "&mktId=STK&searchType=1"
probe "MDCSTAT03601 (STK)"      "dbms/MDC/STAT/standard/MDCSTAT03601" "&mktId=STK"
probe "MDCSTAT03701 (STK)"      "dbms/MDC/STAT/standard/MDCSTAT03701" "&mktId=STK"

echo
echo "■ 대조군 — 이미 되는 것(형식 확인용)"
probe "투자자별 02201 (검증됨)"   "dbms/MDC/STAT/standard/MDCSTAT02201" "&mktId=STK&locale=ko_KR"
probe "공매도잔고 30501 (검증됨)" "dbms/MDC/STAT/srt/MDCSTAT30501"     "&searchType=1&mktTpCd=1"

echo "────────────────────────────────────────────────────────────"
echo "len 이 크고 '필드:' 가 보이는 줄이 정답입니다. 그 줄을 그대로 알려주세요."
