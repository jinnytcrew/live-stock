// feed.js — 브라우저가 /api/quote 를 주기적으로 폴링해 실시간 시세를 받아온다.
// 간격은 getInterval()로 매 틱마다 결정(장중 빠르게 / 마감·주말·휴장 느린 확인만).
// [수정] 장이 닫혀 있어도 "최초 1회 종가 스냅샷"과 "장기 간격 재확인"은 반드시 수행한다.
//        (이전 버전은 휴장 중 요청을 전부 건너뛰어 화면 전체가 '—'로 보였다.)
export class LiveFeed {
  constructor(codes, opts = {}) {
    this.codes = [...codes];
    this.handlers = { quote: [], snapshot: [], status: [] };
    this.seen = new Set();
    this.getInterval = opts.getInterval || (() => 2000);
    this.active = opts.active || (() => true);
    this.onFetch = opts.onFetch || (() => {});
    this.closedInterval = opts.closedInterval || 600000; // 휴장 중 종가 재확인 주기(10분)
    this.chunk = opts.chunk || 40;                       // 한 요청당 종목 수 상한
    this.maxCodes = opts.maxCodes || 120;                // 동시 구독 상한 — 한 틱 최대 3요청
    this.pinned = new Set(opts.pinned || []);            // 관심·보유·선택은 절대 밀려나지 않는다
    this.interval = this.getInterval();
    this.timer = null;
    this._busy = false;
    this._lastFetch = 0;
  }
  on(type, cb) { (this.handlers[type] ||= []).push(cb); return this; }
  _emit(type, data) { (this.handlers[type] || []).forEach((cb) => cb(data)); }
  /* [v3.4] 예전엔 화면을 옮길 때마다 코드가 쌓이기만 하고 빠지지 않았다.
     검색·순위·ETF를 몇 번만 돌면 수백 종이 되고, 한 틱에 40개씩 나눠 10회 이상
     요청이 나간다. 앞선 요청이 끝날 때까지 다음 틱은 통째로 건너뛰므로(_busy)
     결국 '가끔 한 번씩만 갱신되는' 상태가 된다.
     → 고정 구독(관심·보유·선택)은 항상 지키고, 화면에서 흘러온 코드는
       최근 것 위주로 상한을 둔다. 우선순위가 높은 코드가 밀려나지 않는다. */
  addCode(code, opts) {
    if (!code) return;
    const pin = !!(opts && opts.pin);
    if (pin) this.pinned.add(code);
    if (this.codes.includes(code)) return;
    this.codes.push(code);
    this._trim();
    this._lastFetch = 0;          // 새 종목은 휴장 중에도 즉시 한 번 받아온다
    this._tick();
  }
  pin(codes) { (codes || []).forEach((c) => c && this.pinned.add(c)); }
  _trim() {
    if (this.codes.length <= this.maxCodes) return;
    const keep = this.codes.filter((c) => this.pinned.has(c));
    const rest = this.codes.filter((c) => !this.pinned.has(c));
    const room = Math.max(0, this.maxCodes - keep.length);
    this.codes = keep.concat(rest.slice(-room));            // 최근에 본 것 우선
  }

  start() { this._tick(); this._schedule(); }
  stop() { clearInterval(this.timer); this.timer = null; }
  _schedule() { clearInterval(this.timer); this.timer = setInterval(() => this._tick(), this.interval); }
  _reschedule() {
    let want = this.getInterval();
    try { if (typeof pollFactor === 'function') want = Math.round(want * pollFactor()); } catch (e) {}   // [S6] 갱신 주기 설정
    if (want !== this.interval) { this.interval = want; this._schedule(); }
  }

  _urls() {
    const out = [];
    for (let i = 0; i < this.codes.length; i += this.chunk) {
      out.push(`/api/quote?codes=${this.codes.slice(i, i + this.chunk).join(',')}`);
    }
    return out;
  }

  async _tick() {
    this._reschedule();
    if (this._busy) return;
    if (!this.codes.length) return;

    const live = this.active();
    const firstLoad = this.seen.size === 0;
    const stale = Date.now() - this._lastFetch;

    // 휴장·마감: 최초 스냅샷이 없거나 오래됐을 때만 조용히 1회 갱신(크레딧 절약 유지)
    if (!live && !firstLoad && stale < this.closedInterval) {
      this._emit('status', { online: true, market: 'CLOSE', paused: true });
      return;
    }
    // 백그라운드 탭은 절약. 단, 아직 한 번도 못 받았으면 받아온다.
    if (!firstLoad && typeof document !== 'undefined' && document.hidden) return;

    this._busy = true;
    try {
      const urls = this._urls();
      this.onFetch(urls.length);                                  // 사용량 집계(요청 수만큼)
      /* [v3.4] 응답이 느린 요청 하나가 _busy 를 붙들면 그 사이 모든 틱이 사라진다.
         요청마다 시간 제한을 걸어 다음 주기를 확보한다. */
      const results = await Promise.all(urls.map((u) => {
        const ac = new AbortController();
        const tm = setTimeout(() => ac.abort(), Math.max(4000, this.interval * 3));
        /* [v4.3] no-store → default. 시세는 서버가 2초 CDN 캐시를 걸어 두므로
           브라우저도 그 안에서는 재사용해 요청 자체가 나가지 않는다. */
        return fetch(u, { cache: 'default', signal: ac.signal })
          .then((r) => r.json()).catch(() => null).finally(() => clearTimeout(tm));
      }));
      const quotes = [];
      let anyOk = false;
      for (const j of results) {
        if (j && j.ok && Array.isArray(j.quotes)) { anyOk = true; quotes.push(...j.quotes); }
      }
      if (!anyOk) { this._emit('status', { online: false, paused: false }); return; }
      this._lastFetch = Date.now();
      let market = 'CLOSE';
      quotes.forEach((q) => {
        if (!q || !q.code) return;
        if (q.marketStatus === 'OPEN') market = 'OPEN';
        const first = !this.seen.has(q.code);
        this.seen.add(q.code);
        this._emit(first ? 'snapshot' : 'quote', q);
      });
      this._emit('status', { online: true, market, paused: !live });
    } catch (e) {
      this._emit('status', { online: false, paused: false });
    } finally {
      this._busy = false;
    }
  }
}
