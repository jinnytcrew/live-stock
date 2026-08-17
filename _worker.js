var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// netlify/functions/_store.js
/* ══ [v4.54] 해외 시세가 '한 번도' 나오지 않았던 진짜 이유 ═══════════════════
   [증상] 해외 시세·차트·검색이 전부 빈다. 원천을 야후 → CNBC → Cboe → 네이버로
     몇 번이나 갈아 끼워도 똑같았다.
   [원인] 해외 코드는 전역 KV 를 31곳에서 쓰는데, 이 파일에 전역 KV 가 없었다.
     KV 는 다른 세 함수 안의 지역 상수(const KV = context.env.APP_KV)로만 존재했다.
     그래서 /api/usquote 는 첫 KV 접근에서 ReferenceError 로 즉사하고 500 을 뱉었다.
     — 즉 바깥 서비스는 단 한 번도 호출된 적이 없다. 원천을 바꾼 게 소용없던 이유다.
     국내가 멀쩡했던 건 국내 코드가 KV 를 안 쓰거나 지역 KV 가 있는 함수였기 때문이다.
   [교훈] 바깥을 의심하기 전에 코드를 실제로 실행해 본다. 정적 분석만으로 세 번 틀렸다. */
var KV = null;
function setEnv(env) {
  if (env) _ENV = env;
  try { if (env && env.APP_KV) KV = env.APP_KV; } catch (e) { }
}
function envGet(key, env) {
  if (!env) env = _ENV;
  if (/^(URL|DEPLOY_URL|DEPLOY_PRIME_URL)$/.test(key)) {
    const v = env && (env[key] || env.SITE_URL) || (() => {
      try {
        return process.env[key] || process.env.SITE_URL;
      } catch (e) {
        return void 0;
      }
    })();
    if (v) return v;
  }
  if (env && env[key] != null) return env[key];
  try {
    if (typeof process !== "undefined" && process.env) return process.env[key];
  } catch (e) {
  }
  return void 0;
}
function kvAdapter(kv, prefix) {
  const k = (key) => prefix + ":" + key;
  return {
    kind: "kv",
    async get(key) {
      return await kv.get(k(key));
    },
    async set(key, val, opts) {
      const o = {};
      if (opts && opts.ttl) o.expirationTtl = Math.max(60, opts.ttl);
      return await kv.put(k(key), String(val), o);
    },
    async del(key) {
      return await kv.delete(k(key));
    },
    async list(pfx) {
      const r = await kv.list({ prefix: k(pfx || "") });
      return (r.keys || []).map((x) => x.name.slice(prefix.length + 1));
    }
  };
}
function blobAdapter(st) {
  return {
    kind: "blobs",
    async get(key) {
      return await st.get(key, { type: "text" });
    },
    async set(key, val) {
      return await st.set(key, String(val));
    },
    async del(key) {
      return await st.delete(key);
    },
    async list(pfx) {
      const r = await st.list({ prefix: pfx || "" });
      return (r && r.blobs || []).map((b) => b.key);
    }
  };
}
function memAdapter(prefix) {
  const k = (key) => prefix + ":" + key;
  return {
    kind: "memory",
    async get(key) {
      return MEM.has(k(key)) ? MEM.get(k(key)) : null;
    },
    async set(key, val) {
      MEM.set(k(key), String(val));
    },
    async del(key) {
      MEM.delete(k(key));
    },
    async list(pfx) {
      return [...MEM.keys()].filter((x) => x.startsWith(prefix + ":" + (pfx || ""))).map((x) => x.slice(prefix.length + 1));
    }
  };
}
function blobsLike(a) {
  return {
    kind: a.kind,
    async get(key, opts) {
      const v = await a.get(key);
      if (v == null) return null;
      if (opts && opts.type === "json") {
        try {
          return JSON.parse(v);
        } catch (e) {
          return null;
        }
      }
      return v;
    },
    async set(key, val) {
      return a.set(key, val);
    },
    async setJSON(key, val) {
      return a.set(key, JSON.stringify(val));
    },
    async delete(key) {
      return a.del(key);
    },
    async list(opts) {
      const ks = await a.list(opts && opts.prefix || "");
      return { blobs: ks.map((k) => ({ key: k })) };
    }
  };
}
async function getStoreX(nameOrOpts, env) {
  const name = typeof nameOrOpts === "string" ? nameOrOpts : nameOrOpts && nameOrOpts.name || "default";
  return blobsLike(await storeRaw(name, env || _ENV));
}
async function storeRaw(name, env) {
  if (!env) env = _ENV;
  if (env && env.APP_KV && typeof env.APP_KV.get === "function") return kvAdapter(env.APP_KV, name);
  try {
    const NB = "@netlify/blobs";
    const m = await import(
      /* webpackIgnore: true */
      NB
    );
    if (m && m.getStore) return blobAdapter(m.getStore(name));
  } catch (e) {
  }
  return memAdapter(name);
}
var _ENV, MEM;
var init_store = __esm({
  "netlify/functions/_store.js"() {
    _ENV = null;
    MEM = /* @__PURE__ */ new Map();
  }
});

// netlify/functions/_blobs-shim.js
var blobs_shim_exports = {};
__export(blobs_shim_exports, {
  default: () => blobs_shim_default,
  getStore: () => getStore
});
var getStore, blobs_shim_default;
var init_blobs_shim = __esm({
  "netlify/functions/_blobs-shim.js"() {
    getStore = void 0;
    blobs_shim_default = {};
  }
});

// data/nxt-universe.js
var NXT_UNIVERSE;
var init_nxt_universe = __esm({
  "data/nxt-universe.js"() {
    NXT_UNIVERSE = {
      "asOf": "2026-07-01",
      "quarter": "2026Q3",
      "official": true,
      "counts": { "total": 610, "KOSPI": 338, "KOSDAQ": 272 },
      "codes": {
        "282330": "KOSPI",
        "138930": "KOSPI",
        "001460": "KOSPI",
        "001040": "KOSPI",
        "000120": "KOSPI",
        "097950": "KOSPI",
        "005830": "KOSPI",
        "016610": "KOSPI",
        "000990": "KOSPI",
        "001530": "KOSPI",
        "000210": "KOSPI",
        "007340": "KOSPI",
        "017940": "KOSPI",
        "383220": "KOSPI",
        "007700": "KOSPI",
        "114090": "KOSPI",
        "078930": "KOSPI",
        "007070": "KOSPI",
        "499790": "KOSPI",
        "012630": "KOSPI",
        "267270": "KOSPI",
        "009540": "KOSPI",
        "267250": "KOSPI",
        "443060": "KOSPI",
        "071970": "KOSPI",
        "267260": "KOSPI",
        "329180": "KOSPI",
        "060980": "KOSPI",
        "011200": "KOSPI",
        "298050": "KOSPI",
        "139130": "KOSPI",
        "015360": "KOSPI",
        "294870": "KOSPI",
        "175330": "KOSPI",
        "001060": "KOSPI",
        "105560": "KOSPI",
        "002380": "KOSPI",
        "344820": "KOSPI",
        "001940": "KOSPI",
        "092230": "KOSPI",
        "030200": "KOSPI",
        "033780": "KOSPI",
        "093050": "KOSPI",
        "003550": "KOSPI",
        "051900": "KOSPI",
        "373220": "KOSPI",
        "032640": "KOSPI",
        "011070": "KOSPI",
        "066570": "KOSPI",
        "051910": "KOSPI",
        "079550": "KOSPI",
        "006260": "KOSPI",
        "010120": "KOSPI",
        "229640": "KOSPI",
        "108320": "KOSPI",
        "001120": "KOSPI",
        "108670": "KOSPI",
        "383800": "KOSPI",
        "035420": "KOSPI",
        "036570": "KOSPI",
        "181710": "KOSPI",
        "005940": "KOSPI",
        "034310": "KOSPI",
        "030190": "KOSPI",
        "456040": "KOSPI",
        "010060": "KOSPI",
        "178920": "KOSPI",
        "005490": "KOSPI",
        "034120": "KOSPI",
        "005090": "KOSPI",
        "034730": "KOSPI",
        "011790": "KOSPI",
        "018670": "KOSPI",
        "006120": "KOSPI",
        "302440": "KOSPI",
        "326030": "KOSPI",
        "402340": "KOSPI",
        "361610": "KOSPI",
        "096770": "KOSPI",
        "285130": "KOSPI",
        "017670": "KOSPI",
        "000660": "KOSPI",
        "003570": "KOSPI",
        "064960": "KOSPI",
        "100840": "KOSPI",
        "036530": "KOSPI",
        "010950": "KOSPI",
        "077970": "KOSPI",
        "002710": "KOSPI",
        "069260": "KOSPI",
        "000500": "KOSPI",
        "035250": "KOSPI",
        "009450": "KOSPI",
        "010130": "KOSPI",
        "002240": "KOSPI",
        "037710": "KOSPI",
        "030610": "KOSPI",
        "007690": "KOSPI",
        "011780": "KOSPI",
        "073240": "KOSPI",
        "000270": "KOSPI",
        "024110": "KOSPI",
        "003920": "KOSPI",
        "251270": "KOSPI",
        "000320": "KOSPI",
        "006280": "KOSPI",
        "005250": "KOSPI",
        "004370": "KOSPI",
        "072710": "KOSPI",
        "023590": "KOSPI",
        "483650": "KOSPI",
        "008060": "KOSPI",
        "001680": "KOSPI",
        "084690": "KOSPI",
        "003540": "KOSPI",
        "003090": "KOSPI",
        "069620": "KOSPI",
        "003220": "KOSPI",
        "006650": "KOSPI",
        "084010": "KOSPI",
        "001130": "KOSPI",
        "439260": "KOSPI",
        "475560": "KOSPI",
        "192080": "KOSPI",
        "012510": "KOSPI",
        "145720": "KOSPI",
        "460860": "KOSPI",
        "026960": "KOSPI",
        "000640": "KOSPI",
        "170900": "KOSPI",
        "006040": "KOSPI",
        "014820": "KOSPI",
        "000150": "KOSPI",
        "241560": "KOSPI",
        "034020": "KOSPI",
        "336260": "KOSPI",
        "003160": "KOSPI",
        "032350": "KOSPI",
        "089860": "KOSPI",
        "023530": "KOSPI",
        "020150": "KOSPI",
        "280360": "KOSPI",
        "286940": "KOSPI",
        "004000": "KOSPI",
        "004990": "KOSPI",
        "005300": "KOSPI",
        "011170": "KOSPI",
        "138040": "KOSPI",
        "009900": "KOSPI",
        "317450": "KOSPI",
        "009680": "KOSPI",
        "006800": "KOSPI",
        "081660": "KOSPI",
        "002840": "KOSPI",
        "268280": "KOSPI",
        "035150": "KOSPI",
        "003850": "KOSPI",
        "001270": "KOSPI",
        "090460": "KOSPI",
        "005180": "KOSPI",
        "003960": "KOSPI",
        "007160": "KOSPI",
        "062040": "KOSPI",
        "005610": "KOSPI",
        "006400": "KOSPI",
        "028260": "KOSPI",
        "207940": "KOSPI",
        "032830": "KOSPI",
        "018260": "KOSPI",
        "0126Z0": "KOSPI",
        "009150": "KOSPI",
        "005930": "KOSPI",
        "010140": "KOSPI",
        "016360": "KOSPI",
        "029780": "KOSPI",
        "000810": "KOSPI",
        "006110": "KOSPI",
        "0120G0": "KOSPI",
        "145990": "KOSPI",
        "003230": "KOSPI",
        "000070": "KOSPI",
        "002810": "KOSPI",
        "005500": "KOSPI",
        "004690": "KOSPI",
        "200880": "KOSPI",
        "017390": "KOSPI",
        "031210": "KOSPI",
        "008490": "KOSPI",
        "004980": "KOSPI",
        "004360": "KOSPI",
        "004490": "KOSPI",
        "001430": "KOSPI",
        "306200": "KOSPI",
        "003030": "KOSPI",
        "075580": "KOSPI",
        "068270": "KOSPI",
        "336370": "KOSPI",
        "248070": "KOSPI",
        "126720": "KOSPI",
        "026890": "KOSPI",
        "462870": "KOSPI",
        "016590": "KOSPI",
        "029530": "KOSPI",
        "004170": "KOSPI",
        "031430": "KOSPI",
        "001720": "KOSPI",
        "019170": "KOSPI",
        "055550": "KOSPI",
        "403550": "KOSPI",
        "090430": "KOSPI",
        "002790": "KOSPI",
        "002030": "KOSPI",
        "183190": "KOSPI",
        "020560": "KOSPI",
        "010780": "KOSPI",
        "161000": "KOSPI",
        "137310": "KOSPI",
        "005850": "KOSPI",
        "012750": "KOSPI",
        "078520": "KOSPI",
        "278470": "KOSPI",
        "066970": "KOSPI",
        "097520": "KOSPI",
        "484870": "KOSPI",
        "111770": "KOSPI",
        "009970": "KOSPI",
        "000670": "KOSPI",
        "007310": "KOSPI",
        "271560": "KOSPI",
        "001800": "KOSPI",
        "316140": "KOSPI",
        "033270": "KOSPI",
        "014830": "KOSPI",
        "000100": "KOSPI",
        "008730": "KOSPI",
        "214320": "KOSPI",
        "139480": "KOSPI",
        "457190": "KOSPI",
        "007660": "KOSPI",
        "249420": "KOSPI",
        "003120": "KOSPI",
        "003200": "KOSPI",
        "103590": "KOSPI",
        "271940": "KOSPI",
        "226320": "KOSPI",
        "033240": "KOSPI",
        "079900": "KOSPI",
        "194370": "KOSPI",
        "030000": "KOSPI",
        "004700": "KOSPI",
        "185750": "KOSPI",
        "001630": "KOSPI",
        "013890": "KOSPI",
        "071320": "KOSPI",
        "323410": "KOSPI",
        "377300": "KOSPI",
        "029460": "KOSPI",
        "281820": "KOSPI",
        "381970": "KOSPI",
        "007810": "KOSPI",
        "003690": "KOSPI",
        "192820": "KOSPI",
        "005070": "KOSPI",
        "005420": "KOSPI",
        "002020": "KOSPI",
        "120110": "KOSPI",
        "021240": "KOSPI",
        "024720": "KOSPI",
        "192400": "KOSPI",
        "284740": "KOSPI",
        "259960": "KOSPI",
        "039490": "KOSPI",
        "003240": "KOSPI",
        "034230": "KOSPI",
        "016800": "KOSPI",
        "022100": "KOSPI",
        "047050": "KOSPI",
        "003670": "KOSPI",
        "017810": "KOSPI",
        "103140": "KOSPI",
        "005810": "KOSPI",
        "086790": "KOSPI",
        "039130": "KOSPI",
        "352820": "KOSPI",
        "000080": "KOSPI",
        "036460": "KOSPI",
        "071050": "KOSPI",
        "025540": "KOSPI",
        "002960": "KOSPI",
        "000240": "KOSPI",
        "015760": "KOSPI",
        "104700": "KOSPI",
        "017960": "KOSPI",
        "161890": "KOSPI",
        "161390": "KOSPI",
        "047810": "KOSPI",
        "042700": "KOSPI",
        "008930": "KOSPI",
        "128940": "KOSPI",
        "009240": "KOSPI",
        "020000": "KOSPI",
        "105630": "KOSPI",
        "014680": "KOSPI",
        "001750": "KOSPI",
        "009420": "KOSPI",
        "300720": "KOSPI",
        "003300": "KOSPI",
        "051600": "KOSPI",
        "052690": "KOSPI",
        "002320": "KOSPI",
        "180640": "KOSPI",
        "000880": "KOSPI",
        "489790": "KOSPI",
        "272210": "KOSPI",
        "012450": "KOSPI",
        "082740": "KOSPI",
        "042660": "KOSPI",
        "195870": "KOSPI",
        "000720": "KOSPI",
        "453340": "KOSPI",
        "086280": "KOSPI",
        "064350": "KOSPI",
        "012330": "KOSPI",
        "069960": "KOSPI",
        "017800": "KOSPI",
        "307950": "KOSPI",
        "011210": "KOSPI",
        "004020": "KOSPI",
        "005440": "KOSPI",
        "005380": "KOSPI",
        "001500": "KOSPI",
        "011760": "KOSPI",
        "001450": "KOSPI",
        "057050": "KOSPI",
        "008770": "KOSPI",
        "004800": "KOSPI",
        "298040": "KOSPI",
        "298020": "KOSPI",
        "265520": "KOSDAQ",
        "035760": "KOSDAQ",
        "051500": "KOSDAQ",
        "083450": "KOSDAQ",
        "376270": "KOSDAQ",
        "195940": "KOSDAQ",
        "028300": "KOSDAQ",
        "047920": "KOSDAQ",
        "095340": "KOSDAQ",
        "035900": "KOSDAQ",
        "035600": "KOSDAQ",
        "060370": "KOSDAQ",
        "218410": "KOSDAQ",
        "419530": "KOSDAQ",
        "067160": "KOSDAQ",
        "079940": "KOSDAQ",
        "399720": "KOSDAQ",
        "036620": "KOSDAQ",
        "114190": "KOSDAQ",
        "215000": "KOSDAQ",
        "420770": "KOSDAQ",
        "121600": "KOSDAQ",
        "190510": "KOSDAQ",
        "459510": "KOSDAQ",
        "138610": "KOSDAQ",
        "036800": "KOSDAQ",
        "095660": "KOSDAQ",
        "092730": "KOSDAQ",
        "007390": "KOSDAQ",
        "033640": "KOSDAQ",
        "389650": "KOSDAQ",
        "348210": "KOSDAQ",
        "225570": "KOSDAQ",
        "473980": "KOSDAQ",
        "194700": "KOSDAQ",
        "486990": "KOSDAQ",
        "032190": "KOSDAQ",
        "108380": "KOSDAQ",
        "005710": "KOSDAQ",
        "078600": "KOSDAQ",
        "067080": "KOSDAQ",
        "403850": "KOSDAQ",
        "213420": "KOSDAQ",
        "317330": "KOSDAQ",
        "194480": "KOSDAQ",
        "484120": "KOSDAQ",
        "086450": "KOSDAQ",
        "033500": "KOSDAQ",
        "094170": "KOSDAQ",
        "005290": "KOSDAQ",
        "025900": "KOSDAQ",
        "131970": "KOSDAQ",
        "176750": "KOSDAQ",
        "110990": "KOSDAQ",
        "376300": "KOSDAQ",
        "039840": "KOSDAQ",
        "277810": "KOSDAQ",
        "090360": "KOSDAQ",
        "108490": "KOSDAQ",
        "376900": "KOSDAQ",
        "328130": "KOSDAQ",
        "141080": "KOSDAQ",
        "058470": "KOSDAQ",
        "439090": "KOSDAQ",
        "267980": "KOSDAQ",
        "093520": "KOSDAQ",
        "215200": "KOSDAQ",
        "086900": "KOSDAQ",
        "078160": "KOSDAQ",
        "241770": "KOSDAQ",
        "095500": "KOSDAQ",
        "059090": "KOSDAQ",
        "206640": "KOSDAQ",
        "053030": "KOSDAQ",
        "064550": "KOSDAQ",
        "314930": "KOSDAQ",
        "043150": "KOSDAQ",
        "382900": "KOSDAQ",
        "310210": "KOSDAQ",
        "338220": "KOSDAQ",
        "089970": "KOSDAQ",
        "018290": "KOSDAQ",
        "126340": "KOSDAQ",
        "083650": "KOSDAQ",
        "488900": "KOSDAQ",
        "082920": "KOSDAQ",
        "452430": "KOSDAQ",
        "018310": "KOSDAQ",
        "000250": "KOSDAQ",
        "437730": "KOSDAQ",
        "089980": "KOSDAQ",
        "046890": "KOSDAQ",
        "357550": "KOSDAQ",
        "171090": "KOSDAQ",
        "014620": "KOSDAQ",
        "015750": "KOSDAQ",
        "365340": "KOSDAQ",
        "061090": "KOSDAQ",
        "108860": "KOSDAQ",
        "308430": "KOSDAQ",
        "068760": "KOSDAQ",
        "357780": "KOSDAQ",
        "036830": "KOSDAQ",
        "304100": "KOSDAQ",
        "236200": "KOSDAQ",
        "253450": "KOSDAQ",
        "025320": "KOSDAQ",
        "065350": "KOSDAQ",
        "416180": "KOSDAQ",
        "257720": "KOSDAQ",
        "222800": "KOSDAQ",
        "099320": "KOSDAQ",
        "394800": "KOSDAQ",
        "475400": "KOSDAQ",
        "352480": "KOSDAQ",
        "458870": "KOSDAQ",
        "388210": "KOSDAQ",
        "096530": "KOSDAQ",
        "450950": "KOSDAQ",
        "099190": "KOSDAQ",
        "214430": "KOSDAQ",
        "124500": "KOSDAQ",
        "084850": "KOSDAQ",
        "114840": "KOSDAQ",
        "053800": "KOSDAQ",
        "065660": "KOSDAQ",
        "476830": "KOSDAQ",
        "196170": "KOSDAQ",
        "270660": "KOSDAQ",
        "304360": "KOSDAQ",
        "101490": "KOSDAQ",
        "056190": "KOSDAQ",
        "0008Z0": "KOSDAQ",
        "041510": "KOSDAQ",
        "488280": "KOSDAQ",
        "039440": "KOSDAQ",
        "237690": "KOSDAQ",
        "058610": "KOSDAQ",
        "200710": "KOSDAQ",
        "298380": "KOSDAQ",
        "481070": "KOSDAQ",
        "445090": "KOSDAQ",
        "295310": "KOSDAQ",
        "397030": "KOSDAQ",
        "0009K0": "KOSDAQ",
        "448280": "KOSDAQ",
        "101360": "KOSDAQ",
        "086520": "KOSDAQ",
        "247540": "KOSDAQ",
        "036810": "KOSDAQ",
        "455900": "KOSDAQ",
        "348370": "KOSDAQ",
        "290650": "KOSDAQ",
        "058970": "KOSDAQ",
        "475830": "KOSDAQ",
        "039200": "KOSDAQ",
        "394280": "KOSDAQ",
        "476060": "KOSDAQ",
        "226950": "KOSDAQ",
        "338840": "KOSDAQ",
        "122870": "KOSDAQ",
        "065680": "KOSDAQ",
        "074600": "KOSDAQ",
        "104830": "KOSDAQ",
        "101160": "KOSDAQ",
        "069080": "KOSDAQ",
        "112040": "KOSDAQ",
        "101730": "KOSDAQ",
        "036200": "KOSDAQ",
        "086390": "KOSDAQ",
        "388720": "KOSDAQ",
        "084370": "KOSDAQ",
        "372170": "KOSDAQ",
        "469610": "KOSDAQ",
        "272290": "KOSDAQ",
        "424870": "KOSDAQ",
        "102710": "KOSDAQ",
        "039030": "KOSDAQ",
        "041830": "KOSDAQ",
        "389470": "KOSDAQ",
        "211050": "KOSDAQ",
        "049070": "KOSDAQ",
        "189300": "KOSDAQ",
        "287840": "KOSDAQ",
        "101930": "KOSDAQ",
        "033100": "KOSDAQ",
        "054950": "KOSDAQ",
        "127120": "KOSDAQ",
        "082270": "KOSDAQ",
        "228760": "KOSDAQ",
        "144510": "KOSDAQ",
        "358570": "KOSDAQ",
        "119850": "KOSDAQ",
        "456160": "KOSDAQ",
        "036890": "KOSDAQ",
        "085660": "KOSDAQ",
        "278280": "KOSDAQ",
        "094360": "KOSDAQ",
        "042000": "KOSDAQ",
        "078340": "KOSDAQ",
        "214370": "KOSDAQ",
        "093320": "KOSDAQ",
        "199430": "KOSDAQ",
        "032500": "KOSDAQ",
        "064820": "KOSDAQ",
        "089010": "KOSDAQ",
        "052400": "KOSDAQ",
        "402030": "KOSDAQ",
        "183300": "KOSDAQ",
        "089890": "KOSDAQ",
        "241710": "KOSDAQ",
        "102940": "KOSDAQ",
        "200130": "KOSDAQ",
        "294570": "KOSDAQ",
        "372320": "KOSDAQ",
        "115180": "KOSDAQ",
        "494120": "KOSDAQ",
        "445680": "KOSDAQ",
        "214150": "KOSDAQ",
        "466100": "KOSDAQ",
        "237880": "KOSDAQ",
        "023160": "KOSDAQ",
        "323280": "KOSDAQ",
        "044490": "KOSDAQ",
        "095610": "KOSDAQ",
        "475960": "KOSDAQ",
        "051360": "KOSDAQ",
        "199800": "KOSDAQ",
        "117730": "KOSDAQ",
        "064760": "KOSDAQ",
        "340570": "KOSDAQ",
        "131290": "KOSDAQ",
        "425420": "KOSDAQ",
        "484810": "KOSDAQ",
        "356860": "KOSDAQ",
        "214450": "KOSDAQ",
        "441270": "KOSDAQ",
        "140860": "KOSDAQ",
        "263750": "KOSDAQ",
        "251970": "KOSDAQ",
        "168360": "KOSDAQ",
        "087010": "KOSDAQ",
        "009520": "KOSDAQ",
        "472850": "KOSDAQ",
        "220100": "KOSDAQ",
        "053610": "KOSDAQ",
        "468530": "KOSDAQ",
        "300080": "KOSDAQ",
        "319660": "KOSDAQ",
        "031980": "KOSDAQ",
        "043370": "KOSDAQ",
        "137400": "KOSDAQ",
        "378340": "KOSDAQ",
        "161580": "KOSDAQ",
        "299030": "KOSDAQ",
        "166090": "KOSDAQ",
        "013030": "KOSDAQ",
        "034950": "KOSDAQ",
        "448900": "KOSDAQ",
        "030520": "KOSDAQ",
        "092460": "KOSDAQ",
        "114810": "KOSDAQ",
        "042520": "KOSDAQ",
        "078350": "KOSDAQ",
        "045100": "KOSDAQ",
        "107640": "KOSDAQ",
        "098070": "KOSDAQ",
        "460930": "KOSDAQ",
        "200670": "KOSDAQ",
        "243070": "KOSDAQ",
        "084110": "KOSDAQ",
        "145020": "KOSDAQ"
      },
      "names": {
        "282330": "BGF\uB9AC\uD14C\uC77C",
        "138930": "BNK\uAE08\uC735\uC9C0\uC8FC",
        "001460": "BYC",
        "001040": "CJ",
        "000120": "CJ\uB300\uD55C\uD1B5\uC6B4",
        "097950": "CJ\uC81C\uC77C\uC81C\uB2F9",
        "005830": "DB\uC190\uD574\uBCF4\uD5D8",
        "016610": "DB\uC99D\uAD8C",
        "000990": "DB\uD558\uC774\uD14D",
        "001530": "DI\uB3D9\uC77C",
        "000210": "DL",
        "007340": "DN\uC624\uD1A0\uBAA8\uD2F0\uBE0C",
        "017940": "E1",
        "383220": "F&F",
        "007700": "F&F\uD640\uB529\uC2A4",
        "114090": "GKL",
        "078930": "GS",
        "007070": "GS\uB9AC\uD14C\uC77C",
        "499790": "GS\uD53C\uC564\uC5D8",
        "012630": "HDC",
        "267270": "HD\uAC74\uC124\uAE30\uACC4",
        "009540": "HD\uD55C\uAD6D\uC870\uC120\uD574\uC591",
        "267250": "HD\uD604\uB300",
        "443060": "HD\uD604\uB300\uB9C8\uB9B0\uC194\uB8E8\uC158",
        "071970": "HD\uD604\uB300\uB9C8\uB9B0\uC5D4\uC9C4",
        "267260": "HD\uD604\uB300\uC77C\uB809\uD2B8\uB9AD",
        "329180": "HD\uD604\uB300\uC911\uACF5\uC5C5",
        "060980": "HL\uD640\uB529\uC2A4",
        "011200": "HMM",
        "298050": "HS\uD6A8\uC131\uCCA8\uB2E8\uC18C\uC7AC",
        "139130": "iM\uAE08\uC735\uC9C0\uC8FC",
        "015360": "INVENI",
        "294870": "IPARK\uD604\uB300\uC0B0\uC5C5\uAC1C\uBC1C",
        "175330": "JB\uAE08\uC735\uC9C0\uC8FC",
        "001060": "JW\uC911\uC678\uC81C\uC57D",
        "105560": "KB\uAE08\uC735",
        "002380": "KCC",
        "344820": "KCC\uAE00\uB77C\uC2A4",
        "001940": "KISCO\uD640\uB529\uC2A4",
        "092230": "KPX\uD640\uB529\uC2A4",
        "030200": "KT",
        "033780": "KT&G",
        "093050": "LF",
        "003550": "LG",
        "051900": "LG\uC0DD\uD65C\uAC74\uAC15",
        "373220": "LG\uC5D0\uB108\uC9C0\uC194\uB8E8\uC158",
        "032640": "LG\uC720\uD50C\uB7EC\uC2A4",
        "011070": "LG\uC774\uB178\uD14D",
        "066570": "LG\uC804\uC790",
        "051910": "LG\uD654\uD559",
        "079550": "LIG\uB514\uD39C\uC2A4\uC564\uC5D0\uC5B4\uB85C\uC2A4\uD398\uC774\uC2A4",
        "006260": "LS",
        "010120": "LS ELECTRIC",
        "229640": "LS\uC5D0\uCF54\uC5D0\uB108\uC9C0",
        "108320": "LX\uC138\uBBF8\uCF58",
        "001120": "LX\uC778\uD130\uB0B4\uC154\uB110",
        "108670": "LX\uD558\uC6B0\uC2DC\uC2A4",
        "383800": "LX\uD640\uB529\uC2A4",
        "035420": "NAVER",
        "036570": "NC",
        "181710": "NHN",
        "005940": "NH\uD22C\uC790\uC99D\uAD8C",
        "034310": "NICE",
        "030190": "NICE\uD3C9\uAC00\uC815\uBCF4",
        "456040": "OCI",
        "010060": "OCI\uD640\uB529\uC2A4",
        "178920": "PI\uCCA8\uB2E8\uC18C\uC7AC",
        "005490": "POSCO\uD640\uB529\uC2A4",
        "034120": "SBS",
        "005090": "SGC\uC5D0\uB108\uC9C0",
        "034730": "SK",
        "011790": "SKC",
        "018670": "SK\uAC00\uC2A4",
        "006120": "SK\uB514\uC2A4\uCEE4\uBC84\uB9AC",
        "302440": "SK\uBC14\uC774\uC624\uC0AC\uC774\uC5B8\uC2A4",
        "326030": "SK\uBC14\uC774\uC624\uD31C",
        "402340": "SK\uC2A4\uD018\uC5B4",
        "361610": "SK\uC544\uC774\uC774\uD14C\uD06C\uB180\uB85C\uC9C0",
        "096770": "SK\uC774\uB178\uBCA0\uC774\uC158",
        "285130": "SK\uCF00\uBBF8\uCE7C",
        "017670": "SK\uD154\uB808\uCF64",
        "000660": "SK\uD558\uC774\uB2C9\uC2A4",
        "003570": "SNT\uB2E4\uC774\uB0B4\uBBF9\uC2A4",
        "064960": "SNT\uBAA8\uD2F0\uBE0C",
        "100840": "SNT\uC5D0\uB108\uC9C0",
        "036530": "SNT\uD640\uB529\uC2A4",
        "010950": "S-Oil",
        "077970": "STX\uC5D4\uC9C4",
        "002710": "TCC\uC2A4\uD2F8",
        "069260": "TKG\uD734\uCF10\uC2A4",
        "000500": "\uAC00\uC628\uC804\uC120",
        "035250": "\uAC15\uC6D0\uB79C\uB4DC",
        "009450": "\uACBD\uB3D9\uB098\uBE44\uC5D4",
        "010130": "\uACE0\uB824\uC544\uC5F0",
        "002240": "\uACE0\uB824\uC81C\uAC15",
        "037710": "\uAD11\uC8FC\uC2E0\uC138\uACC4",
        "030610": "\uAD50\uBCF4\uC99D\uAD8C",
        "007690": "\uAD6D\uB3C4\uD654\uD559",
        "011780": "\uAE08\uD638\uC11D\uC720\uD654\uD559",
        "073240": "\uAE08\uD638\uD0C0\uC774\uC5B4",
        "000270": "\uAE30\uC544",
        "024110": "\uAE30\uC5C5\uC740\uD589",
        "003920": "\uB0A8\uC591\uC720\uC5C5",
        "251270": "\uB137\uB9C8\uBE14",
        "000320": "\uB178\uB8E8\uD640\uB529\uC2A4",
        "006280": "\uB179\uC2ED\uC790",
        "005250": "\uB179\uC2ED\uC790\uD640\uB529\uC2A4",
        "004370": "\uB18D\uC2EC",
        "072710": "\uB18D\uC2EC\uD640\uB529\uC2A4",
        "023590": "\uB2E4\uC6B0\uAE30\uC220",
        "483650": "\uB2EC\uBC14\uAE00\uB85C\uBC8C",
        "008060": "\uB300\uB355",
        "001680": "\uB300\uC0C1",
        "084690": "\uB300\uC0C1\uD640\uB529\uC2A4",
        "003540": "\uB300\uC2E0\uC99D\uAD8C",
        "003090": "\uB300\uC6C5",
        "069620": "\uB300\uC6C5\uC81C\uC57D",
        "003220": "\uB300\uC6D0\uC81C\uC57D",
        "006650": "\uB300\uD55C\uC720\uD654",
        "084010": "\uB300\uD55C\uC81C\uAC15",
        "001130": "\uB300\uD55C\uC81C\uBD84",
        "439260": "\uB300\uD55C\uC870\uC120",
        "475560": "\uB354\uBCF8\uCF54\uB9AC\uC544",
        "192080": "\uB354\uBE14\uC720\uAC8C\uC784\uC988",
        "012510": "\uB354\uC874\uBE44\uC988\uC628",
        "145720": "\uB374\uD2F0\uC6C0",
        "460860": "\uB3D9\uAD6D\uC81C\uAC15",
        "026960": "\uB3D9\uC11C",
        "000640": "\uB3D9\uC544\uC3D8\uC2DC\uC624\uD640\uB529\uC2A4",
        "170900": "\uB3D9\uC544\uC5D0\uC2A4\uD2F0",
        "006040": "\uB3D9\uC6D0\uC0B0\uC5C5",
        "014820": "\uB3D9\uC6D0\uC2DC\uC2A4\uD15C\uC988",
        "000150": "\uB450\uC0B0",
        "241560": "\uB450\uC0B0\uBC25\uCEA3",
        "034020": "\uB450\uC0B0\uC5D0\uB108\uBE4C\uB9AC\uD2F0",
        "336260": "\uB450\uC0B0\uD4E8\uC5BC\uC140",
        "003160": "\uB514\uC544\uC774",
        "032350": "\uB86F\uB370\uAD00\uAD11\uAC1C\uBC1C",
        "089860": "\uB86F\uB370\uB80C\uD0C8",
        "023530": "\uB86F\uB370\uC1FC\uD551",
        "020150": "\uB86F\uB370\uC5D0\uB108\uC9C0\uBA38\uD2F0\uB9AC\uC5BC\uC988",
        "280360": "\uB86F\uB370\uC6F0\uD478\uB4DC",
        "286940": "\uB86F\uB370\uC774\uB178\uBCA0\uC774\uD2B8",
        "004000": "\uB86F\uB370\uC815\uBC00\uD654\uD559",
        "004990": "\uB86F\uB370\uC9C0\uC8FC",
        "005300": "\uB86F\uB370\uCE60\uC131",
        "011170": "\uB86F\uB370\uCF00\uBBF8\uCE7C",
        "138040": "\uBA54\uB9AC\uCE20\uAE08\uC735\uC9C0\uC8FC",
        "009900": "\uBA85\uC2E0\uC0B0\uC5C5",
        "317450": "\uBA85\uC778\uC81C\uC57D",
        "009680": "\uBAA8\uD1A0\uB2C9",
        "006800": "\uBBF8\uB798\uC5D0\uC14B\uC99D\uAD8C",
        "081660": "\uBBF8\uC2A4\uD1A0\uD640\uB529\uC2A4",
        "002840": "\uBBF8\uC6D0\uC0C1\uC0AC",
        "268280": "\uBBF8\uC6D0\uC5D0\uC2A4\uC528",
        "035150": "\uBC31\uC0B0",
        "003850": "\uBCF4\uB839",
        "001270": "\uBD80\uAD6D\uC99D\uAD8C",
        "090460": "\uBE44\uC5D0\uC774\uCE58",
        "005180": "\uBE59\uADF8\uB808",
        "003960": "\uC0AC\uC870\uB300\uB9BC",
        "007160": "\uC0AC\uC870\uC0B0\uC5C5",
        "062040": "\uC0B0\uC77C\uC804\uAE30",
        "005610": "\uC0BC\uB9BD",
        "006400": "\uC0BC\uC131SDI",
        "028260": "\uC0BC\uC131\uBB3C\uC0B0",
        "207940": "\uC0BC\uC131\uBC14\uC774\uC624\uB85C\uC9C1\uC2A4",
        "032830": "\uC0BC\uC131\uC0DD\uBA85",
        "018260": "\uC0BC\uC131\uC5D0\uC2A4\uB514\uC5D0\uC2A4",
        "0126Z0": "\uC0BC\uC131\uC5D0\uD53C\uC2A4\uD640\uB529\uC2A4",
        "009150": "\uC0BC\uC131\uC804\uAE30",
        "005930": "\uC0BC\uC131\uC804\uC790",
        "010140": "\uC0BC\uC131\uC911\uACF5\uC5C5",
        "016360": "\uC0BC\uC131\uC99D\uAD8C",
        "029780": "\uC0BC\uC131\uCE74\uB4DC",
        "000810": "\uC0BC\uC131\uD654\uC7AC",
        "006110": "\uC0BC\uC544\uC54C\uBBF8\uB284",
        "0120G0": "\uC0BC\uC591\uBC14\uC774\uC624\uD31C",
        "145990": "\uC0BC\uC591\uC0AC",
        "003230": "\uC0BC\uC591\uC2DD\uD488",
        "000070": "\uC0BC\uC591\uD640\uB529\uC2A4",
        "002810": "\uC0BC\uC601\uBB34\uC5ED",
        "005500": "\uC0BC\uC9C4\uC81C\uC57D",
        "004690": "\uC0BC\uCC9C\uB9AC",
        "200880": "\uC11C\uC5F0\uC774\uD654",
        "017390": "\uC11C\uC6B8\uAC00\uC2A4",
        "031210": "\uC11C\uC6B8\uBCF4\uC99D\uBCF4\uD5D8",
        "008490": "\uC11C\uD765",
        "004980": "\uC131\uC2E0\uC591\uD68C",
        "004360": "\uC138\uBC29",
        "004490": "\uC138\uBC29\uC804\uC9C0",
        "001430": "\uC138\uC544\uBCA0\uC2A4\uD2F8\uC9C0\uC8FC",
        "306200": "\uC138\uC544\uC81C\uAC15",
        "003030": "\uC138\uC544\uC81C\uAC15\uC9C0\uC8FC",
        "075580": "\uC138\uC9C4\uC911\uACF5\uC5C5",
        "068270": "\uC140\uD2B8\uB9AC\uC628",
        "336370": "\uC194\uB8E8\uC2A4\uCCA8\uB2E8\uC18C\uC7AC",
        "248070": "\uC194\uB8E8\uC5E0",
        "126720": "\uC218\uC0B0\uC778\uB354\uC2A4\uD2B8\uB9AC",
        "026890": "\uC2A4\uD2F1\uC778\uBCA0\uC2A4\uD2B8\uBA3C\uD2B8",
        "462870": "\uC2DC\uD504\uD2B8\uC5C5",
        "016590": "\uC2E0\uB300\uC591\uC81C\uC9C0",
        "029530": "\uC2E0\uB3C4\uB9AC\uCF54",
        "004170": "\uC2E0\uC138\uACC4",
        "031430": "\uC2E0\uC138\uACC4\uC778\uD130\uB0B4\uC154\uB0A0",
        "001720": "\uC2E0\uC601\uC99D\uAD8C",
        "019170": "\uC2E0\uD48D\uC81C\uC57D",
        "055550": "\uC2E0\uD55C\uC9C0\uC8FC",
        "403550": "\uC3D8\uCE74",
        "090430": "\uC544\uBAA8\uB808\uD37C\uC2DC\uD53D",
        "002790": "\uC544\uBAA8\uB808\uD37C\uC2DC\uD53D\uD640\uB529\uC2A4",
        "002030": "\uC544\uC138\uC544",
        "183190": "\uC544\uC138\uC544\uC2DC\uBA58\uD2B8",
        "020560": "\uC544\uC2DC\uC544\uB098\uD56D\uACF5",
        "010780": "\uC544\uC774\uC5D0\uC2A4\uB3D9\uC11C",
        "161000": "\uC560\uACBD\uCF00\uBBF8\uCE7C",
        "137310": "\uC5D0\uC2A4\uB514\uBC14\uC774\uC624\uC13C\uC11C",
        "005850": "\uC5D0\uC2A4\uC5D8",
        "012750": "\uC5D0\uC2A4\uC6D0",
        "078520": "\uC5D0\uC774\uBE14\uC528\uC5D4\uC528",
        "278470": "\uC5D0\uC774\uD53C\uC54C",
        "066970": "\uC5D8\uC564\uC5D0\uD504",
        "097520": "\uC5E0\uC528\uB125\uC2A4",
        "484870": "\uC5E0\uC564\uC528\uC194\uB8E8\uC158",
        "111770": "\uC601\uC6D0\uBB34\uC5ED",
        "009970": "\uC601\uC6D0\uBB34\uC5ED\uD640\uB529\uC2A4",
        "000670": "\uC601\uD48D",
        "007310": "\uC624\uB69C\uAE30",
        "271560": "\uC624\uB9AC\uC628",
        "001800": "\uC624\uB9AC\uC628\uD640\uB529\uC2A4",
        "316140": "\uC6B0\uB9AC\uAE08\uC735\uC9C0\uC8FC",
        "033270": "\uC720\uB098\uC774\uD2F0\uB4DC\uC81C\uC57D",
        "014830": "\uC720\uB2C8\uB4DC",
        "000100": "\uC720\uD55C\uC591\uD589",
        "008730": "\uC728\uCD0C\uD654\uD559",
        "214320": "\uC774\uB178\uC158",
        "139480": "\uC774\uB9C8\uD2B8",
        "457190": "\uC774\uC218\uC2A4\uD398\uC15C\uD2F0\uCF00\uBBF8\uCEEC",
        "007660": "\uC774\uC218\uD398\uD0C0\uC2DC\uC2A4",
        "249420": "\uC77C\uB3D9\uC81C\uC57D",
        "003120": "\uC77C\uC131\uC544\uC774\uC5D0\uC2A4",
        "003200": "\uC77C\uC2E0\uBC29\uC9C1",
        "103590": "\uC77C\uC9C4\uC804\uAE30",
        "271940": "\uC77C\uC9C4\uD558\uC774\uC194\uB8E8\uC2A4",
        "226320": "\uC787\uCE20\uD55C\uBD88",
        "033240": "\uC790\uD654\uC804\uC790",
        "079900": "\uC804\uC9C4\uAC74\uC124\uB85C\uBD07",
        "194370": "\uC81C\uC774\uC5D0\uC2A4\uCF54\uD37C\uB808\uC774\uC158",
        "030000": "\uC81C\uC77C\uAE30\uD68D",
        "004700": "\uC870\uAD11\uD53C\uD601",
        "185750": "\uC885\uADFC\uB2F9",
        "001630": "\uC885\uADFC\uB2F9\uD640\uB529\uC2A4",
        "013890": "\uC9C0\uB204\uC2A4",
        "071320": "\uC9C0\uC5ED\uB09C\uBC29\uACF5\uC0AC",
        "323410": "\uCE74\uCE74\uC624\uBC45\uD06C",
        "377300": "\uCE74\uCE74\uC624\uD398\uC774",
        "029460": "\uCF00\uC774\uC528",
        "281820": "\uCF00\uC774\uC528\uD14D",
        "381970": "\uCF00\uC774\uCE74",
        "007810": "\uCF54\uB9AC\uC544\uC368\uD0A4\uD2B8",
        "003690": "\uCF54\uB9AC\uC548\uB9AC",
        "192820": "\uCF54\uC2A4\uB9E5\uC2A4",
        "005070": "\uCF54\uC2A4\uBAA8\uC2E0\uC18C\uC7AC",
        "005420": "\uCF54\uC2A4\uBAA8\uD654\uD559",
        "002020": "\uCF54\uC624\uB871",
        "120110": "\uCF54\uC624\uB871\uC778\uB354",
        "021240": "\uCF54\uC6E8\uC774",
        "024720": "\uCF5C\uB9C8\uD640\uB529\uC2A4",
        "192400": "\uCFE0\uCFE0\uD640\uB529\uC2A4",
        "284740": "\uCFE0\uCFE0\uD648\uC2DC\uC2A4",
        "259960": "\uD06C\uB798\uD504\uD1A4",
        "039490": "\uD0A4\uC6C0\uC99D\uAD8C",
        "003240": "\uD0DC\uAD11\uC0B0\uC5C5",
        "034230": "\uD30C\uB77C\uB2E4\uC774\uC2A4",
        "016800": "\uD37C\uC2DC\uC2A4",
        "022100": "\uD3EC\uC2A4\uCF54DX",
        "047050": "\uD3EC\uC2A4\uCF54\uC778\uD130\uB0B4\uC154\uB110",
        "003670": "\uD3EC\uC2A4\uCF54\uD4E8\uCC98\uC5E0",
        "017810": "\uD480\uBB34\uC6D0",
        "103140": "\uD48D\uC0B0",
        "005810": "\uD48D\uC0B0\uD640\uB529\uC2A4",
        "086790": "\uD558\uB098\uAE08\uC735\uC9C0\uC8FC",
        "039130": "\uD558\uB098\uD22C\uC5B4",
        "352820": "\uD558\uC774\uBE0C",
        "000080": "\uD558\uC774\uD2B8\uC9C4\uB85C",
        "036460": "\uD55C\uAD6D\uAC00\uC2A4\uACF5\uC0AC",
        "071050": "\uD55C\uAD6D\uAE08\uC735\uC9C0\uC8FC",
        "025540": "\uD55C\uAD6D\uB2E8\uC790",
        "002960": "\uD55C\uAD6D\uC258\uC11D\uC720",
        "000240": "\uD55C\uAD6D\uC564\uCEF4\uD37C\uB2C8",
        "015760": "\uD55C\uAD6D\uC804\uB825",
        "104700": "\uD55C\uAD6D\uCCA0\uAC15",
        "017960": "\uD55C\uAD6D\uCE74\uBCF8",
        "161890": "\uD55C\uAD6D\uCF5C\uB9C8",
        "161390": "\uD55C\uAD6D\uD0C0\uC774\uC5B4\uC564\uD14C\uD06C\uB180\uB85C\uC9C0",
        "047810": "\uD55C\uAD6D\uD56D\uACF5\uC6B0\uC8FC",
        "042700": "\uD55C\uBBF8\uBC18\uB3C4\uCCB4",
        "008930": "\uD55C\uBBF8\uC0AC\uC774\uC5B8\uC2A4",
        "128940": "\uD55C\uBBF8\uC57D\uD488",
        "009240": "\uD55C\uC0D8",
        "020000": "\uD55C\uC12C",
        "105630": "\uD55C\uC138\uC2E4\uC5C5",
        "014680": "\uD55C\uC194\uCF00\uBBF8\uCE7C",
        "001750": "\uD55C\uC591\uC99D\uAD8C",
        "009420": "\uD55C\uC62C\uBC14\uC774\uC624\uD30C\uB9C8",
        "300720": "\uD55C\uC77C\uC2DC\uBA58\uD2B8",
        "003300": "\uD55C\uC77C\uD640\uB529\uC2A4",
        "051600": "\uD55C\uC804KPS",
        "052690": "\uD55C\uC804\uAE30\uC220",
        "002320": "\uD55C\uC9C4",
        "180640": "\uD55C\uC9C4\uCE7C",
        "000880": "\uD55C\uD654",
        "489790": "\uD55C\uD654\uBE44\uC804",
        "272210": "\uD55C\uD654\uC2DC\uC2A4\uD15C",
        "012450": "\uD55C\uD654\uC5D0\uC5B4\uB85C\uC2A4\uD398\uC774\uC2A4",
        "082740": "\uD55C\uD654\uC5D4\uC9C4",
        "042660": "\uD55C\uD654\uC624\uC158",
        "195870": "\uD574\uC131\uB514\uC5D0\uC2A4",
        "000720": "\uD604\uB300\uAC74\uC124",
        "453340": "\uD604\uB300\uADF8\uB9B0\uD478\uB4DC",
        "086280": "\uD604\uB300\uAE00\uB85C\uBE44\uC2A4",
        "064350": "\uD604\uB300\uB85C\uD15C",
        "012330": "\uD604\uB300\uBAA8\uBE44\uC2A4",
        "069960": "\uD604\uB300\uBC31\uD654\uC810",
        "017800": "\uD604\uB300\uC5D8\uB9AC\uBCA0\uC774\uD130",
        "307950": "\uD604\uB300\uC624\uD1A0\uC5D0\uBC84",
        "011210": "\uD604\uB300\uC704\uC544",
        "004020": "\uD604\uB300\uC81C\uCCA0",
        "005440": "\uD604\uB300\uC9C0\uC5D0\uD504\uD640\uB529\uC2A4",
        "005380": "\uD604\uB300\uCC28",
        "001500": "\uD604\uB300\uCC28\uC99D\uAD8C",
        "011760": "\uD604\uB300\uCF54\uD37C\uB808\uC774\uC158",
        "001450": "\uD604\uB300\uD574\uC0C1",
        "057050": "\uD604\uB300\uD648\uC1FC\uD551",
        "008770": "\uD638\uD154\uC2E0\uB77C",
        "004800": "\uD6A8\uC131",
        "298040": "\uD6A8\uC131\uC911\uACF5\uC5C5",
        "298020": "\uD6A8\uC131\uD2F0\uC564\uC528",
        "265520": "AP\uC2DC\uC2A4\uD15C",
        "035760": "CJ ENM",
        "051500": "CJ\uD504\uB808\uC2DC\uC6E8\uC774",
        "083450": "GST",
        "376270": "HEM\uD30C\uB9C8",
        "195940": "HK\uC774\uB178\uC5D4",
        "028300": "HLB",
        "047920": "HLB\uC81C\uC57D",
        "095340": "ISC",
        "035900": "JYP Ent.",
        "035600": "KG\uC774\uB2C8\uC2DC\uC2A4",
        "060370": "LS\uB9C8\uB9B0\uC194\uB8E8\uC158",
        "218410": "RFHIC",
        "419530": "SAMG\uC5D4\uD130",
        "067160": "SOOP",
        "079940": "\uAC00\uBE44\uC544",
        "399720": "\uAC00\uC628\uCE69\uC2A4",
        "036620": "\uAC10\uC131\uCF54\uD37C\uB808\uC774\uC158",
        "114190": "\uAC15\uC6D0\uC5D0\uB108\uC9C0",
        "215000": "\uACE8\uD504\uC874",
        "420770": "\uAE30\uAC00\uBE44\uC2A4",
        "121600": "\uB098\uB178\uC2E0\uC18C\uC7AC",
        "190510": "\uB098\uBB34\uAC00",
        "459510": "\uB098\uC6B0\uB85C\uBCF4\uD2F1\uC2A4",
        "138610": "\uB098\uC774\uBCA1",
        "036800": "\uB098\uC774\uC2A4\uC815\uBCF4\uD1B5\uC2E0",
        "095660": "\uB124\uC624\uC704\uC988",
        "092730": "\uB124\uC624\uD31C",
        "007390": "\uB124\uC774\uCC98\uC140",
        "033640": "\uB124\uD328\uC2A4",
        "389650": "\uB125\uC2A4\uD2B8\uBC14\uC774\uC624\uBA54\uB514\uCEEC",
        "348210": "\uB125\uC2A4\uD2F4",
        "225570": "\uB125\uC2A8\uAC8C\uC784\uC988",
        "473980": "\uB178\uBA38\uC2A4",
        "194700": "\uB178\uBC14\uB809\uC2A4",
        "486990": "\uB178\uD0C0",
        "032190": "\uB2E4\uC6B0\uB370\uC774\uD0C0",
        "108380": "\uB300\uC591\uC804\uAE30\uACF5\uC5C5",
        "005710": "\uB300\uC6D0\uC0B0\uC5C5",
        "078600": "\uB300\uC8FC\uC804\uC790\uC7AC\uB8CC",
        "067080": "\uB300\uD654\uC81C\uC57D",
        "403850": "\uB354\uD551\uD06C\uD401\uCEF4\uD37C\uB2C8",
        "213420": "\uB355\uC0B0\uB124\uC624\uB8E9\uC2A4",
        "317330": "\uB355\uC0B0\uD14C\uCF54\uD53C\uC544",
        "194480": "\uB370\uBE0C\uC2DC\uC2A4\uD130\uC988",
        "484120": "\uB3C4\uC6B0\uC778\uC2DC\uC2A4",
        "086450": "\uB3D9\uAD6D\uC81C\uC57D",
        "033500": "\uB3D9\uC131\uD654\uC778\uD14D",
        "094170": "\uB3D9\uC6B4\uC544\uB098\uD14D",
        "005290": "\uB3D9\uC9C4\uC384\uBBF8\uCF10",
        "025900": "\uB3D9\uD654\uAE30\uC5C5",
        "131970": "\uB450\uC0B0\uD14C\uC2A4\uB098",
        "176750": "\uB4C0\uCF10\uBC14\uC774\uC624",
        "110990": "\uB514\uC544\uC774\uD2F0",
        "376300": "\uB514\uC5B4\uC720",
        "039840": "\uB514\uC624",
        "277810": "\uB808\uC778\uBCF4\uC6B0\uB85C\uBCF4\uD2F1\uC2A4",
        "090360": "\uB85C\uBCF4\uC2A4\uD0C0",
        "108490": "\uB85C\uBCF4\uD2F0\uC988",
        "376900": "\uB85C\uD0B7\uD5EC\uC2A4\uCF00\uC5B4",
        "328130": "\uB8E8\uB2DB",
        "141080": "\uB9AC\uAC00\uCF10\uBC14\uC774\uC624",
        "058470": "\uB9AC\uB178\uACF5\uC5C5",
        "439090": "\uB9C8\uB140\uACF5\uC7A5",
        "267980": "\uB9E4\uC77C\uC720\uC5C5",
        "093520": "\uB9E4\uCEE4\uC2A4",
        "215200": "\uBA54\uAC00\uC2A4\uD130\uB514\uAD50\uC721",
        "086900": "\uBA54\uB514\uD1A1\uC2A4",
        "078160": "\uBA54\uB514\uD3EC\uC2A4\uD2B8",
        "241770": "\uBA54\uCE74\uB85C",
        "095500": "\uBBF8\uB798\uB098\uB178\uD14D",
        "059090": "\uBBF8\uCF54",
        "206640": "\uBC14\uB514\uD14D\uBA54\uB4DC",
        "053030": "\uBC14\uC774\uB125\uC2A4",
        "064550": "\uBC14\uC774\uC624\uB2C8\uC544",
        "314930": "\uBC14\uC774\uC624\uB2E4\uC778",
        "043150": "\uBC14\uD14D",
        "382900": "\uBC94\uD55C\uD4E8\uC5BC\uC140",
        "310210": "\uBCF4\uB85C\uB178\uC774",
        "338220": "\uBDF0\uB178",
        "089970": "\uBE0C\uC774\uC5E0",
        "018290": "\uBE0C\uC774\uD2F0",
        "126340": "\uBE44\uB098\uD14D",
        "083650": "\uBE44\uC5D0\uC774\uCE58\uC544\uC774",
        "488900": "\uBE44\uCE20\uB85C\uB125\uC2A4\uD14D",
        "082920": "\uBE44\uCE20\uB85C\uC140",
        "452430": "\uC0AC\uD53C\uC5D4\uBC18\uB3C4\uCCB4",
        "018310": "\uC0BC\uBAA9\uC5D0\uC2A4\uD3FC",
        "000250": "\uC0BC\uCC9C\uB2F9\uC81C\uC57D",
        "437730": "\uC0BC\uD604",
        "089980": "\uC0C1\uC544\uD504\uB860\uD14C\uD06C",
        "046890": "\uC11C\uC6B8\uBC18\uB3C4\uCCB4",
        "357550": "\uC11D\uACBD\uC5D0\uC774\uD2F0",
        "171090": "\uC120\uC775\uC2DC\uC2A4\uD15C",
        "014620": "\uC131\uAD11\uBCA4\uB4DC",
        "015750": "\uC131\uC6B0\uD558\uC774\uD14D",
        "365340": "\uC131\uC77C\uD558\uC774\uD14D",
        "061090": "\uC138\uB098\uD14C\uD06C\uB180\uB85C\uC9C0",
        "108860": "\uC140\uBC14\uC2A4AI",
        "308430": "\uC140\uBE44\uC628",
        "068760": "\uC140\uD2B8\uB9AC\uC628\uC81C\uC57D",
        "357780": "\uC194\uBE0C\uB808\uC778",
        "036830": "\uC194\uBE0C\uB808\uC778\uD640\uB529\uC2A4",
        "304100": "\uC194\uD2B8\uB8E9\uC2A4",
        "236200": "\uC288\uD504\uB9AC\uB9C8",
        "253450": "\uC2A4\uD29C\uB514\uC624\uB4DC\uB798\uACE4",
        "025320": "\uC2DC\uB178\uD399\uC2A4",
        "065350": "\uC2E0\uC131\uB378\uD0C0\uD14C\uD06C",
        "416180": "\uC2E0\uC131\uC5D0\uC2A4\uD2F0",
        "257720": "\uC2E4\uB9AC\uCF58\uD22C",
        "222800": "\uC2EC\uD14D",
        "099320": "\uC384\uD2B8\uB809\uC544\uC774",
        "394800": "\uC4F0\uB9AC\uBE4C\uB9AC\uC5B8",
        "475400": "\uC528\uBA54\uC2A4\uB85C\uBCF4\uD2F1\uC2A4",
        "352480": "\uC528\uC564\uC528\uC778\uD130\uB0B4\uC154\uB110",
        "458870": "\uC528\uC5B4\uC2A4",
        "388210": "\uC528\uC5E0\uD2F0\uC5D1\uC2A4",
        "096530": "\uC528\uC820",
        "450950": "\uC544\uC2A4\uD14C\uB77C\uC2DC\uC2A4",
        "099190": "\uC544\uC774\uC13C\uC2A4",
        "214430": "\uC544\uC774\uC4F0\uB9AC\uC2DC\uC2A4\uD15C",
        "124500": "\uC544\uC774\uD2F0\uC13C\uAE00\uB85C\uBC8C",
        "084850": "\uC544\uC774\uD2F0\uC5E0\uBC18\uB3C4\uCCB4",
        "114840": "\uC544\uC774\uD328\uBC00\uB9AC\uC5D0\uC2A4\uC528",
        "053800": "\uC548\uB7A9",
        "065660": "\uC548\uD2B8\uB85C\uC820",
        "476830": "\uC54C\uC9C0\uB178\uBBF9\uC2A4",
        "196170": "\uC54C\uD14C\uC624\uC820",
        "270660": "\uC5D0\uBE0C\uB9AC\uBD07",
        "304360": "\uC5D0\uC2A4\uBC14\uC774\uC624\uBA54\uB515\uC2A4",
        "101490": "\uC5D0\uC2A4\uC564\uC5D0\uC2A4\uD14D",
        "056190": "\uC5D0\uC2A4\uC5D0\uD504\uC5D0\uC774",
        "0008Z0": "\uC5D0\uC2A4\uC5D4\uC2DC\uC2A4",
        "041510": "\uC5D0\uC2A4\uC5E0",
        "488280": "\uC5D0\uC2A4\uD22C\uB354\uBE14\uC720",
        "039440": "\uC5D0\uC2A4\uD2F0\uC544\uC774",
        "237690": "\uC5D0\uC2A4\uD2F0\uD31C",
        "058610": "\uC5D0\uC2A4\uD53C\uC9C0",
        "200710": "\uC5D0\uC774\uB514\uD14C\uD06C\uB180\uB85C\uC9C0",
        "298380": "\uC5D0\uC774\uBE44\uC5D8\uBC14\uC774\uC624",
        "481070": "\uC5D0\uC774\uC720\uBE0C\uB79C\uC988",
        "445090": "\uC5D0\uC774\uC9C1\uB79C\uB4DC",
        "295310": "\uC5D0\uC774\uCE58\uBE0C\uC774\uC5E0",
        "397030": "\uC5D0\uC774\uD504\uB9B4\uBC14\uC774\uC624",
        "0009K0": "\uC5D0\uC784\uB4DC\uBC14\uC774\uC624",
        "448280": "\uC5D0\uCF54\uC544\uC774",
        "101360": "\uC5D0\uCF54\uC564\uB4DC\uB9BC",
        "086520": "\uC5D0\uCF54\uD504\uB85C",
        "247540": "\uC5D0\uCF54\uD504\uB85C\uBE44\uC5E0",
        "036810": "\uC5D0\uD504\uC5D0\uC2A4\uD2F0",
        "455900": "\uC5D4\uC824\uB85C\uBCF4\uD2F1\uC2A4",
        "348370": "\uC5D4\uCF10",
        "290650": "\uC5D8\uC564\uC528\uBC14\uC774\uC624",
        "058970": "\uC5E0\uB85C",
        "475830": "\uC624\uB984\uD14C\uB77C\uD4E8\uD2F1",
        "039200": "\uC624\uC2A4\uCF54\uD14D",
        "394280": "\uC624\uD508\uC5E3\uC9C0\uD14C\uD06C\uB180\uB85C\uC9C0",
        "476060": "\uC628\uCF54\uB2C9\uD14C\uB77C\uD4E8\uD2F1\uC2A4",
        "226950": "\uC62C\uB9AD\uC2A4",
        "338840": "\uC640\uC774\uBC14\uC774\uC624\uB85C\uC9C1\uC2A4",
        "122870": "\uC640\uC774\uC9C0\uC5D4\uD130\uD14C\uC778\uBA3C\uD2B8",
        "065680": "\uC6B0\uC8FC\uC77C\uB809\uD2B8\uB85C",
        "074600": "\uC6D0\uC775QnC",
        "104830": "\uC6D0\uC775\uBA38\uD2B8\uB9AC\uC5BC\uC988",
        "101160": "\uC6D4\uB371\uC2A4",
        "069080": "\uC6F9\uC820",
        "112040": "\uC704\uBA54\uC774\uB4DC",
        "101730": "\uC704\uBA54\uC774\uB4DC\uB9E5\uC2A4",
        "036200": "\uC720\uB2C8\uC148",
        "086390": "\uC720\uB2C8\uD14C\uC2A4\uD2B8",
        "388720": "\uC720\uC77C\uB85C\uBCF4\uD2F1\uC2A4",
        "084370": "\uC720\uC9C4\uD14C\uD06C",
        "372170": "\uC724\uC131\uC5D0\uD504\uC564\uC528",
        "469610": "\uC774\uB178\uD14C\uD06C",
        "272290": "\uC774\uB179\uC2A4\uCCA8\uB2E8\uC18C\uC7AC",
        "424870": "\uC774\uBBA8\uC628\uC2DC\uC544",
        "102710": "\uC774\uC5D4\uC5D0\uD504\uD14C\uD06C\uB180\uB85C\uC9C0",
        "039030": "\uC774\uC624\uD14C\uD06C\uB2C9\uC2A4",
        "041830": "\uC778\uBC14\uB514",
        "389470": "\uC778\uBCA4\uD2F0\uC9C0\uB7A9",
        "211050": "\uC778\uCE74\uAE08\uC735\uC11C\uBE44\uC2A4",
        "049070": "\uC778\uD0D1\uC2A4",
        "189300": "\uC778\uD154\uB9AC\uC548\uD14C\uD06C",
        "287840": "\uC778\uD22C\uC140",
        "101930": "\uC778\uD654\uC815\uACF5",
        "033100": "\uC81C\uB8E1\uC804\uAE30",
        "054950": "\uC81C\uC774\uBE0C\uC774\uC5E0",
        "127120": "\uC81C\uC774\uC5D0\uC2A4\uB9C1\uD06C",
        "082270": "\uC82C\uBC31\uC2A4",
        "228760": "\uC9C0\uB178\uBBF9\uD2B8\uB9AC",
        "144510": "\uC9C0\uC528\uC140",
        "358570": "\uC9C0\uC544\uC774\uC774\uB178\uBCA0\uC774\uC158",
        "119850": "\uC9C0\uC5D4\uC528\uC5D0\uB108\uC9C0",
        "456160": "\uC9C0\uD22C\uC9C0\uBC14\uC774\uC624",
        "036890": "\uC9C4\uC131\uD2F0\uC774\uC528",
        "085660": "\uCC28\uBC14\uC774\uC624\uD14D",
        "278280": "\uCC9C\uBCF4",
        "094360": "\uCE69\uC2A4\uC564\uBBF8\uB514\uC5B4",
        "042000": "\uCE74\uD39824",
        "078340": "\uCEF4\uD22C\uC2A4",
        "214370": "\uCF00\uC5B4\uC820",
        "093320": "\uCF00\uC774\uC544\uC774\uC5D4\uC5D1\uC2A4",
        "199430": "\uCF00\uC774\uC5D4\uC54C\uC2DC\uC2A4\uD15C",
        "032500": "\uCF00\uC774\uC5E0\uB354\uBE14\uC720",
        "064820": "\uCF00\uC774\uD504",
        "089010": "\uCF10\uD2B8\uB85C\uB2C9\uC2A4",
        "052400": "\uCF54\uB098\uC544\uC774",
        "402030": "\uCF54\uB09C\uD14C\uD06C\uB180\uB85C\uC9C0",
        "183300": "\uCF54\uBBF8\uCF54",
        "089890": "\uCF54\uC138\uC2A4",
        "241710": "\uCF54\uC2A4\uBA54\uCE74\uCF54\uB9AC\uC544",
        "102940": "\uCF54\uC624\uB871\uC0DD\uBA85\uACFC\uD559",
        "200130": "\uCF5C\uB9C8\uBE44\uC564\uC5D0\uC774\uCE58",
        "294570": "\uCFE0\uCF58",
        "372320": "\uD050\uB85C\uC140",
        "115180": "\uD050\uB9AC\uC5B8\uD2B8",
        "494120": "\uD050\uB9AC\uC624\uC2DC\uC2A4",
        "445680": "\uD050\uB9AC\uC625\uC2A4\uBC14\uC774\uC624\uC2DC\uC2A4\uD15C\uC988",
        "214150": "\uD074\uB798\uC2DC\uC2A4",
        "466100": "\uD074\uB85C\uBD07",
        "237880": "\uD074\uB9AC\uC624",
        "023160": "\uD0DC\uAD11",
        "323280": "\uD0DC\uC131",
        "044490": "\uD0DC\uC6C5",
        "095610": "\uD14C\uC2A4",
        "475960": "\uD1A0\uBAA8\uD050\uBE0C",
        "051360": "\uD1A0\uBE44\uC2A4",
        "199800": "\uD234\uC820",
        "117730": "\uD2F0\uB85C\uBCF4\uD2F1\uC2A4",
        "064760": "\uD2F0\uC528\uCF00\uC774",
        "340570": "\uD2F0\uC564\uC5D8",
        "131290": "\uD2F0\uC5D0\uC2A4\uC774",
        "425420": "\uD2F0\uC5D0\uD504\uC774",
        "484810": "\uD2F0\uC5D1\uC2A4\uC54C\uB85C\uBCF4\uD2F1\uC2A4",
        "356860": "\uD2F0\uC5D8\uBE44",
        "214450": "\uD30C\uB9C8\uB9AC\uC11C\uCE58",
        "441270": "\uD30C\uC778\uC5E0\uD14D",
        "140860": "\uD30C\uD06C\uC2DC\uC2A4\uD15C\uC2A4",
        "263750": "\uD384\uC5B4\uBE44\uC2A4",
        "251970": "\uD38C\uD14D\uCF54\uB9AC\uC544",
        "168360": "\uD3A8\uD2B8\uB860",
        "087010": "\uD3A9\uD2B8\uB860",
        "009520": "\uD3EC\uC2A4\uCF54\uC5E0\uD14D",
        "472850": "\uD3F0\uB4DC\uADF8\uB8F9",
        "220100": "\uD4E8\uCCD0\uCF10",
        "053610": "\uD504\uB85C\uD14D",
        "468530": "\uD504\uB85C\uD2F0\uB098",
        "300080": "\uD50C\uB9AC\uD1A0",
        "319660": "\uD53C\uC5D0\uC2A4\uCF00\uC774",
        "031980": "\uD53C\uC5D0\uC2A4\uCF00\uC774\uD640\uB529\uC2A4",
        "043370": "\uD53C\uC5D0\uC774\uCE58\uC5D0\uC774",
        "137400": "\uD53C\uC5D4\uD2F0",
        "378340": "\uD544\uC5D0\uB108\uC9C0",
        "161580": "\uD544\uC635\uD2F1\uC2A4",
        "299030": "\uD558\uB098\uAE30\uC220",
        "166090": "\uD558\uB098\uBA38\uD2F0\uB9AC\uC5BC\uC988",
        "013030": "\uD558\uC774\uB85D\uCF54\uB9AC\uC544",
        "034950": "\uD55C\uAD6D\uAE30\uC5C5\uD3C9\uAC00",
        "448900": "\uD55C\uAD6D\uD53C\uC544\uC774\uC5E0",
        "030520": "\uD55C\uAE00\uACFC\uCEF4\uD4E8\uD130",
        "092460": "\uD55C\uB77CIMS",
        "114810": "\uD55C\uC194\uC544\uC774\uC6D0\uC2A4",
        "042520": "\uD55C\uC2A4\uBC14\uC774\uC624\uBA54\uB4DC",
        "078350": "\uD55C\uC591\uB514\uC9C0\uD14D",
        "045100": "\uD55C\uC591\uC774\uC5D4\uC9C0",
        "107640": "\uD55C\uC911\uC5D4\uC2DC\uC5D0\uC2A4",
        "098070": "\uD55C\uD14D",
        "460930": "\uD604\uB300\uD798\uC2A4",
        "200670": "\uD734\uBA54\uB515\uC2A4",
        "243070": "\uD734\uC628\uC2A4",
        "084110": "\uD734\uC628\uC2A4\uAE00\uB85C\uBC8C",
        "145020": "\uD734\uC824"
      }
    };
  }
});

// data/xlsx-lite.js
async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function readZip(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  b.readUInt32LE = (i) => dv.getUint32(i, true);
  b.readUInt16LE = (i) => dv.getUint16(i, true);
  const files = {};
  let eocd = -1;
  for (let i = b.length - 22; i >= 0 && i > b.length - 65558; i--) {
    if (b.readUInt32LE(i) === 101010256) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const total = b.readUInt16LE(eocd + 10);
  let off = b.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (b.readUInt32LE(off) !== 33639248) break;
    const method = b.readUInt16LE(off + 10);
    const compSize = b.readUInt32LE(off + 20);
    const nameLen = b.readUInt16LE(off + 28);
    const extraLen = b.readUInt16LE(off + 30);
    const commentLen = b.readUInt16LE(off + 32);
    const localOff = b.readUInt32LE(off + 42);
    const name = b.toString("utf8", off + 46, off + 46 + nameLen);
    const lNameLen = b.readUInt16LE(localOff + 26);
    const lExtraLen = b.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = b.subarray(dataStart, dataStart + compSize);
    try {
      files[name] = method === 0 ? raw : await inflateRaw(raw);
    } catch {
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
function sharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  for (const m of String(xml).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let s = "";
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += t[1];
    out.push(unescapeXml(s));
  }
  return out;
}
function parseSheet(xml, strs) {
  const rows = [];
  for (const rm of String(xml).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cm of rm[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attr = cm[1], inner = cm[2];
      const type = (attr.match(/\st="([^"]+)"/) || [])[1] || "n";
      let val = "";
      if (type === "inlineStr") {
        for (const t of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) val += t[1];
        val = unescapeXml(val);
      } else {
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v == null) val = "";
        else if (type === "s") val = strs[+v] != null ? strs[+v] : "";
        else val = unescapeXml(v);
      }
      cells.push(val);
    }
    if (cells.some((c) => String(c).trim() !== "")) rows.push(cells);
  }
  return rows;
}
async function parseXlsx(buf) {
  const files = await readZip(buf);
  if (!files) return null;
  const strs = sharedStrings(files["xl/sharedStrings.xml"] && files["xl/sharedStrings.xml"].toString("utf8"));
  const sheetNames = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  if (!sheetNames.length) return null;
  let rows = [];
  for (const n of sheetNames) {
    rows = rows.concat(parseSheet(files[n].toString("utf8"), strs));
  }
  return rows;
}
async function xlsxToText(buf) {
  const rows = await parseXlsx(buf);
  if (!rows || !rows.length) return null;
  return rows.map((r) => r.join("	")).join("\n");
}
var unescapeXml;
var init_xlsx_lite = __esm({
  "data/xlsx-lite.js"() {
    unescapeXml = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, "&");
  }
});

// data/nxt-official.js
function inferAsOf(text) {
  const q = String(text || "").match(/(20\d\d)\s*년?\s*([1-4])\s*분기/);
  if (q) {
    const y = +q[1], quarter = +q[2];
    const month = String((quarter - 1) * 3 + 1).padStart(2, "0");
    return { asOf: `${y}-${month}-01`, quarter: `${y}Q${quarter}` };
  }
  const d = String(text || "").match(/(20\d\d)[-.\/](\d{1,2})[-.\/](\d{1,2})/);
  if (d) return { asOf: `${d[1]}-${String(+d[2]).padStart(2, "0")}-${String(+d[3]).padStart(2, "0")}`, quarter: null };
  return { asOf: null, quarter: null };
}
function parseOfficial(text) {
  if (!text || typeof text !== "string") return null;
  const clean3 = text.replace(/<\s*(br|\/tr|\/p)\s*>/gi, "\n").replace(/<[^>]+>/g, "	").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  const lines = clean3.split(/\r?\n/);
  const rows = {};
  const removed = [];
  let hasStatusColumn = false;
  let lastMarket = "";
  for (const line of lines) {
    if (!ISIN_RE.test(line)) continue;
    const cells = cellsOf(line);
    if (!cells.length) continue;
    const isinIdx = [];
    cells.forEach((c, i) => {
      if (ISIN_RE.test(c)) isinIdx.push(i);
    });
    if (!isinIdx.length) continue;
    isinIdx.forEach((idx, n) => {
      const code = isinToCode(cells[idx]);
      if (!code || !CODE_RE.test(code)) return;
      const end = n + 1 < isinIdx.length ? isinIdx[n + 1] : cells.length;
      const seg = cells.slice(Math.max(0, idx - 1), end);
      const market = normMarket(seg.join(" ")) || lastMarket;
      if (market) lastMarket = market;
      const segTxt = seg.join(" ");
      const isRemoved = /편출|비선정|제외/.test(segTxt);
      const isSelected = /선정/.test(segTxt) && !/비선정/.test(segTxt);
      if (isRemoved || isSelected) hasStatusColumn = true;
      let name = "";
      for (let i = idx + 1; i < end; i++) {
        const v = cells[i];
        if (!v || ISIN_RE.test(v)) continue;
        if (/^(선정|비선정|편출|유지|신규|제외)$/.test(v)) continue;
        if (MARKET_RE.test(v) && v.length <= 7) continue;
        if (/[가-힣A-Za-z]/.test(v)) {
          name = v.slice(0, 40);
          break;
        }
      }
      if (isRemoved) {
        removed.push({ code, name, market });
        return;
      }
      rows[code] = { market, name };
    });
  }
  const codes = Object.keys(rows);
  if (!codes.length) return null;
  const counts = {
    total: codes.length,
    KOSPI: codes.filter((c) => rows[c].market === "KOSPI").length,
    KOSDAQ: codes.filter((c) => rows[c].market === "KOSDAQ").length
  };
  const meta = inferAsOf(text);
  return { rows, removed, asOf: meta.asOf, quarter: meta.quarter, counts, hasStatusColumn };
}
function crossCheckSummary(text, parsed) {
  const m = String(text || "").match(/합계\s*\t?\s*(\d{2,4})\s*\t?\s*(\d{1,3})\s*\t?\s*(\d{2,4})/);
  if (!m || !parsed) return { checked: false };
  const expectedSelected = +m[3];
  const ok2 = parsed.counts.total === expectedSelected;
  return { checked: true, expectedSelected, got: parsed.counts.total, ok: ok2 };
}
var CODE_RE, ISIN_RE, isinToCode, MARKET_RE, normMarket, cellsOf;
var init_nxt_official = __esm({
  "data/nxt-official.js"() {
    CODE_RE = /^[0-9][0-9A-Z]{5}$/;
    ISIN_RE = /\bKR[0-9A-Z]([0-9][0-9A-Z]{5})[0-9A-Z]{3}\b/;
    isinToCode = (isin) => {
      const m = String(isin || "").toUpperCase().match(ISIN_RE);
      return m ? m[1] : null;
    };
    MARKET_RE = /(KOSPI|KOSDAQ|코스피|코스닥)/i;
    normMarket = (s) => {
      const m = String(s || "").match(MARKET_RE);
      if (!m) return "";
      return /KOSDAQ|코스닥/i.test(m[1]) ? "KOSDAQ" : "KOSPI";
    };
    cellsOf = (line) => line.split("	").map((c) => c.trim()).filter((c) => c !== "");
  }
});

// data/nxt-exclusions.js
function activeExclusions(today) {
  const d = today || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return NXT_EXCLUSIONS.filter((e) => (!e.from || e.from <= d) && (!e.until || e.until >= d));
}
var NXT_EXCLUSIONS, AUDIT;
var init_nxt_exclusions = __esm({
  "data/nxt-exclusions.js"() {
    NXT_EXCLUSIONS = [
      /* ── 2026년 3분기 정기 변경 (2026-07-01 프리마켓부터, 신규 편입 없음)
            코스피 20 + 코스닥 12 = 32종목 제외 → 3분기 대상 610종목
            (코스피 338 / 코스닥 272)                                        */
      { name: "DL\uC774\uC564\uC528", code: "375500", market: "KOSPI", from: "2026-07-01" },
      { name: "DS\uB2E8\uC11D", code: "017860", market: "KOSPI", from: "2026-07-01" },
      { name: "GS\uAC74\uC124", code: "006360", market: "KOSPI", from: "2026-07-01" },
      { name: "HL\uB9CC\uB3C4", code: "204320", market: "KOSPI", from: "2026-07-01" },
      { name: "LG\uC528\uC5D4\uC5D0\uC2A4", code: "064400", market: "KOSPI", from: "2026-07-01" },
      { name: "SK\uC624\uC158\uD50C\uB79C\uD2B8", code: "100090", market: "KOSPI", from: "2026-07-01" },
      { name: "\uB125\uC2A4\uD2F8", code: "092790", market: "KOSPI", from: "2026-07-01" },
      { name: "\uB300\uD55C\uD56D\uACF5", code: "003490", market: "KOSPI", from: "2026-07-01" },
      { name: "\uB450\uC0B0\uB85C\uBCF4\uD2F1\uC2A4", code: "454910", market: "KOSPI", from: "2026-07-01" },
      { name: "\uBBF8\uB798\uC5D0\uC14B\uC0DD\uBA85", code: "085620", market: "KOSPI", from: "2026-07-01" },
      { name: "\uC0BC\uC131E&A", code: "028050", market: "KOSPI", from: "2026-07-01" },
      { name: "\uC0BC\uD654\uCF58\uB374\uC11C", code: "001820", market: "KOSPI", from: "2026-07-01" },
      { name: "\uC528\uC5D0\uC2A4\uC708\uB4DC", code: "112610", market: "KOSPI", from: "2026-07-01" },
      { name: "\uC560\uACBD\uC0B0\uC5C5", code: "018250", market: "KOSPI", from: "2026-07-01" },
      { name: "\uCE74\uCE74\uC624", code: "035720", market: "KOSPI", from: "2026-07-01" },
      { name: "\uD2F0\uC5E0\uC528", code: "217590", market: "KOSPI", from: "2026-07-01" },
      { name: "\uD30C\uBBF8\uC140", code: "005690", market: "KOSPI", from: "2026-07-01" },
      { name: "\uD55C\uD654\uC194\uB8E8\uC158", code: "009830", market: "KOSPI", from: "2026-07-01" },
      { name: "\uD654\uC2E0", code: "010690", market: "KOSPI", from: "2026-07-01" },
      { name: "\uD6C4\uC131", code: "093370", market: "KOSPI", from: "2026-07-01" },
      { name: "\uB300\uBA85\uC5D0\uB108\uC9C0", code: "389260", market: "KOSDAQ", from: "2026-07-01" },
      { name: "\uB514\uC564\uB514\uD30C\uB9C8\uD14D", code: "347850", market: "KOSDAQ", from: "2026-07-01" },
      { name: "\uC0BC\uC591\uCEF4\uD14D", code: "484590", market: "KOSDAQ", from: "2026-07-01" },
      { name: "\uC2A4\uD53C\uC5B4", code: "347700", market: "KOSDAQ", from: "2026-07-01" },
      { name: "\uC5D1\uC2A4\uAC8C\uC774\uD2B8", code: "356680", market: "KOSDAQ", from: "2026-07-01" },
      { name: "\uC608\uC2A4\uD2F0", code: "122640", market: "KOSDAQ", from: "2026-07-01" },
      { name: "\uC624\uB9AC\uC5D4\uD0C8\uC815\uACF5", code: "014940", market: "KOSDAQ", from: "2026-07-01" },
      { name: "\uC6D0\uC775IPS", code: "240810", market: "KOSDAQ", from: "2026-07-01" },
      { name: "\uC6D0\uD14D", code: "336570", market: "KOSDAQ", from: "2026-07-01" },
      { name: "\uC81C\uC774\uC564\uD2F0\uC528", code: "204270", market: "KOSDAQ", from: "2026-07-01" },
      { name: "\uCE74\uCE74\uC624\uAC8C\uC784\uC988", code: "293490", market: "KOSDAQ", from: "2026-07-01" },
      { name: "\uD604\uB300\uBB34\uBCA1\uC2A4", code: "319400", market: "KOSDAQ", from: "2026-07-01" }
    ].map((e) => ({
      ...e,
      until: e.until || null,
      // null = 해제 공시 전까지 계속 적용
      reason: e.reason || "\uB125\uC2A4\uD2B8\uB808\uC774\uB4DC \uB9E4\uB9E4\uCCB4\uACB0\uB300\uC0C1 \uC81C\uC678 (\uAC70\uB798\uB7C9 \uADDC\uC81C \uD55C\uB3C4 \uAD00\uB9AC)",
      source: e.source || "\uB125\uC2A4\uD2B8\uB808\uC774\uB4DC 3\uBD84\uAE30 \uB9E4\uB9E4\uCCB4\uACB0\uB300\uC0C1\uC885\uBAA9 \uC815\uAE30 \uBCC0\uACBD (2026-06-26 \uACF5\uD45C)"
    }));
    AUDIT = {
      // 3분기에도 거래 대상으로 유지되는 것이 확인된 종목
      mustInclude: [
        { code: "005930", name: "\uC0BC\uC131\uC804\uC790" },
        { code: "000660", name: "SK\uD558\uC774\uB2C9\uC2A4" },
        { code: "196170", name: "\uC54C\uD14C\uC624\uC820" },
        { code: "035420", name: "NAVER" }
      ],
      // 2026-07-01 정기 변경으로 제외가 확인된 종목
      mustExclude: [
        { code: "240810", name: "\uC6D0\uC775IPS" },
        { code: "035720", name: "\uCE74\uCE74\uC624" },
        { code: "003490", name: "\uB300\uD55C\uD56D\uACF5" },
        { code: "293490", name: "\uCE74\uCE74\uC624\uAC8C\uC784\uC988" },
        { code: "319400", name: "\uD604\uB300\uBB34\uBCA1\uC2A4" }
      ],
      // 3분기 공표 기준 610종목 (코스피 338 / 코스닥 272). 여유를 둔 허용 범위.
      expected: { total: 610, kospi: 338, kosdaq: 272 },
      countRange: [560, 700]
      // 베이스라인=출범 796 명단, 편출 계층 적용 후 통과하도록 상한 확대
    };
  }
});

// data/nxt-signal.js
async function jget2(url, ms = 5e3) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA3, Referer: "https://m.stock.naver.com/", Accept: "application/json" }, signal: c.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
function exchangeFeatures(json12) {
  const feats = /* @__PURE__ */ new Set();
  const walk = (o, path, d) => {
    if (!o || typeof o !== "object" || d > 7 || feats.size > 300) return;
    if (Array.isArray(o)) {
      o.slice(0, 30).forEach((v) => walk(v, path + "[]", d + 1));
      return;
    }
    for (const [k, v] of Object.entries(o)) {
      const p = path ? path + "." + k : k;
      if (v == null) continue;
      if (typeof v === "object") {
        walk(v, p, d + 1);
        continue;
      }
      const sv = String(v).slice(0, 40);
      const keyHit = EX_HINT.test(k) && !VOLATILE.test(k);
      const valHit = EX_HINT.test(sv) && !/^\d+(\.\d+)?$/.test(sv);
      if (keyHit || valHit) {
        if (keyHit) feats.add("@" + p);
        if (sv.length <= 40 && !/^\d{4,}$/.test(sv)) feats.add(p + "=" + sv);
      }
    }
  };
  walk(json12, "", 0);
  return feats;
}
async function fetchStockMeta(code) {
  const [integ, basic] = await Promise.all([
    jget2(`https://m.stock.naver.com/api/stock/${code}/integration`),
    jget2(`https://m.stock.naver.com/api/stock/${code}/basic`)
  ]);
  if (!integ && !basic) return null;
  const f = /* @__PURE__ */ new Set();
  if (integ) for (const x of exchangeFeatures(integ)) f.add("I:" + x);
  if (basic) for (const x of exchangeFeatures(basic)) f.add("B:" + x);
  return { feats: f, raw: { integ: !!integ, basic: !!basic } };
}
function anchors() {
  const pos = AUDIT.mustInclude.map((t) => t.code);
  const neg = NXT_EXCLUSIONS.filter((e) => e.code).map((e) => e.code);
  return { pos, neg: neg.filter((c) => !pos.includes(c)) };
}
function separate(samples, pos, neg) {
  const P = pos.filter((c) => samples.has(c));
  const N = neg.filter((c) => samples.has(c));
  if (P.length < 3 || N.length < 4)
    return { ok: false, why: `\uD45C\uBCF8 \uBD80\uC871(\uC591\uC131 ${P.length}/3, \uC74C\uC131 ${N.length}/4)`, P: P.length, N: N.length };
  const inP = /* @__PURE__ */ new Map(), inN = /* @__PURE__ */ new Map();
  for (const c of P) for (const f of samples.get(c)) inP.set(f, (inP.get(f) || 0) + 1);
  for (const c of N) for (const f of samples.get(c)) inN.set(f, (inN.get(f) || 0) + 1);
  const features = [];
  for (const [f, n] of inP) if (n === P.length && !inN.has(f)) features.push(f);
  if (!features.length)
    return { ok: false, why: "\uC591\uC131 \uC804\uBD80\uC5D0 \uC788\uACE0 \uC74C\uC131\uC5D0 \uC804\uD600 \uC5C6\uB294 \uAC70\uB798\uC18C \uD2B9\uC9D5\uC744 \uCC3E\uC9C0 \uBABB\uD568", P: P.length, N: N.length };
  return { ok: true, features, P: P.length, N: N.length };
}
async function ensureSignal(store) {
  if (memSignal && Date.now() - memSignal.at < SIGNAL_TTL) return memSignal;
  if (store) {
    try {
      const cached = await store.get("signal", { type: "json" });
      if (cached && cached.features && Date.now() - cached.at < SIGNAL_TTL) {
        memSignal = cached;
        return cached;
      }
    } catch {
    }
  }
  if (Date.now() < negUntil) return { ok: false, why: "\uCD5C\uADFC \uBCF4\uC815 \uC2E4\uD328(\uCFE8\uB2E4\uC6B4)", cooldown: true };
  const { pos, neg } = anchors();
  const samples = /* @__PURE__ */ new Map();
  const codes = [...pos, ...neg];
  let i = 0;
  const work = async () => {
    while (i < codes.length) {
      const c = codes[i++];
      const m = await fetchStockMeta(c);
      if (m) samples.set(c, m.feats);
    }
  };
  await Promise.all(Array.from({ length: 8 }, work));
  const sep = separate(samples, pos, neg);
  if (!sep.ok) {
    negUntil = Date.now() + NEG_TTL;
    return sep;
  }
  const signal = { ok: true, features: sep.features, at: Date.now(), P: sep.P, N: sep.N };
  memSignal = signal;
  if (store) {
    try {
      await store.setJSON("signal", signal);
    } catch {
    }
  }
  return signal;
}
async function classifyStock(code, store, diag) {
  const signal = await ensureSignal(store);
  if (!signal.ok) return { member: null, signal, reason: signal.why };
  const m = await fetchStockMeta(code);
  if (!m) return { member: null, signal, reason: "\uB124\uC774\uBC84 \uC751\uB2F5 \uC5C6\uC74C" };
  const member = isMember(m.feats, signal);
  const out = { member, signal };
  if (diag) {
    out.matched = signal.features.filter((f) => m.feats.has(f));
    out.exchangeFeatures = [...m.feats].filter((f) => /nxt|krx|unified|integrat|exchange|거래소|통합/i.test(f)).slice(0, 40);
  }
  return out;
}
var UA3, SIGNAL_TTL, NEG_TTL, EX_HINT, VOLATILE, memSignal, negUntil, isMember;
var init_nxt_signal = __esm({
  "data/nxt-signal.js"() {
    init_nxt_exclusions();
    init_nxt_exclusions();
    UA3 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    SIGNAL_TTL = 12 * 60 * 60 * 1e3;
    NEG_TTL = 30 * 60 * 1e3;
    EX_HINT = /nxt|nextrade|\bats\b|krx|unified|integrat|exchange|market(type|code|name)|거래소|통합|대체/i;
    VOLATILE = /price|amount|volume|qty|ratio|rate|change|시가|종가|고가|저가|거래량|체결|priceinfo/i;
    memSignal = null;
    negUntil = 0;
    isMember = (feats, signal) => !!(signal && signal.ok && feats && signal.features.some((f) => feats.has(f)));
  }
});

// data/nxt-detect.js
async function getJson(url, ms = 5e3) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA4, Referer: "https://m.stock.naver.com/", Accept: "application/json" },
      signal: c.signal
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
async function pool(items, worker, { concurrency = 10, deadline = 0 } = {}) {
  const out = new Array(items.length).fill(null);
  let i = 0, stopped = false;
  const run = async () => {
    while (true) {
      if (stopped) return;
      if (deadline && Date.now() > deadline) {
        stopped = true;
        return;
      }
      const k = i++;
      if (k >= items.length) return;
      try {
        out[k] = await worker(items[k], k);
      } catch {
        out[k] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return { out, complete: !stopped };
}
async function fetchUniverse(deadline) {
  const all = /* @__PURE__ */ new Map();
  for (const market of ["KOSPI", "KOSDAQ"]) {
    for (let page = 1; page <= 40; page++) {
      if (deadline && Date.now() > deadline) break;
      const j = await getJson(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=100`);
      const arr = j && (j.stocks || j.result || j.items);
      if (!Array.isArray(arr) || !arr.length) break;
      let added = 0;
      for (const x of arr) {
        const code = String(x.itemCode || x.code || x.reutersCode || "").toUpperCase().replace(/\.(KS|KQ)$/, "");
        if (!/^[0-9A-Z]{6}$/.test(code) || all.has(code)) continue;
        all.set(code, { code, name: String(x.stockName || x.itemName || x.name || "").trim(), market });
        added++;
      }
      if (!added) break;
    }
  }
  return [...all.values()];
}
async function buildFromProbe({ budgetMs = 9 * 60 * 1e3, store = null, log = () => {
} } = {}) {
  const deadline = Date.now() + budgetMs;
  const signal = await ensureSignal(store);
  if (!signal.ok) return { ok: false, why: "\uAC70\uB798\uC18C \uC2E0\uD638 \uBCF4\uC815 \uC2E4\uD328: " + signal.why, signal };
  log(`\uC2E0\uD638 \uD655\uBCF4 \u2014 \uD310\uBCC4 \uD2B9\uC9D5 ${signal.features.length}\uAC1C (\uC591\uC131 ${signal.P}/\uC74C\uC131 ${signal.N})`);
  const universe3 = await fetchUniverse(deadline);
  log(`\uC720\uB2C8\uBC84\uC2A4 ${universe3.length}\uC885\uBAA9`);
  if (universe3.length < 1500) return { ok: false, why: `\uC804 \uC885\uBAA9 \uBAA9\uB85D\uC774 \uB108\uBB34 \uC801\uC2B5\uB2C8\uB2E4(${universe3.length})`, signal };
  const byCode = new Map(universe3.map((u) => [u.code, u]));
  const hits = /* @__PURE__ */ new Map();
  let probed = 0;
  const { complete } = await pool(universe3.map((u) => u.code), async (c) => {
    const j = await getJson(`https://m.stock.naver.com/api/stock/${c}/integration`);
    probed++;
    if (j && isMember(new Set([...exchangeFeatures(j)].map((x) => "I:" + x)), signal)) hits.set(c, true);
  }, { concurrency: 16, deadline });
  log(`\uC870\uC0AC ${probed}/${universe3.length}\uC885\uBAA9 \xB7 NXT ${hits.size}\uC885\uBAA9 \xB7 ${complete ? "\uC644\uC8FC" : "\uC2DC\uAC04 \uCD08\uACFC"}`);
  if (!complete) return { ok: false, why: `\uC2DC\uAC04 \uB0B4 \uC804 \uC885\uBAA9 \uBBF8\uC644(${probed}/${universe3.length})`, signal, probed };
  const rows = {};
  for (const c of hits.keys()) {
    const u = byCode.get(c);
    rows[c] = { market: u ? u.market : "", name: u ? u.name : "" };
  }
  return { ok: true, rows, source: `signal:naver(${signal.features.length}\uD2B9\uC9D5)`, signal, probed };
}
var UA4;
var init_nxt_detect = __esm({
  "data/nxt-detect.js"() {
    init_nxt_exclusions();
    init_nxt_signal();
    UA4 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  }
});

// data/nxt-core.js
var nxt_core_exports = {};
__export(nxt_core_exports, {
  AUDIT: () => AUDIT,
  COLLECT_SOURCES: () => COLLECT_SOURCES,
  NXT_UNIVERSE: () => NXT_UNIVERSE,
  activeExclusions: () => activeExclusions,
  applyExclusions: () => applyExclusions,
  auditList: () => auditList,
  blobStore: () => blobStore,
  clearPinned: () => clearPinned,
  collect: () => collect,
  collectOne: () => collectOne,
  extractRows: () => extractRows,
  noteObserved: () => noteObserved,
  parseAttachments: () => parseAttachments,
  parseBoardList: () => parseBoardList,
  parseHalts: () => parseHalts,
  readHistory: () => readHistory,
  readObserved: () => readObserved,
  readPinned: () => readPinned,
  recordHistory: () => recordHistory,
  resolve: () => resolve2,
  resolveFast: () => resolveFast,
  writePinned: () => writePinned
});
function jar() {
  const store = /* @__PURE__ */ new Map();
  return {
    absorb(res) {
      let raw = [];
      try {
        raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
      } catch {
        raw = [];
      }
      for (const line of raw || []) {
        const [pair] = String(line).split(";");
        const idx = pair.indexOf("=");
        if (idx > 0) store.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    },
    header() {
      return [...store.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    size() {
      return store.size;
    }
  };
}
async function req(url, opt = {}) {
  const { method = "GET", body = null, headers = {}, cookies = null, referer = "", ms = 9e3 } = opt;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), Math.max(800, Math.min(ms, budgetLeft() - 300)));
  try {
    const h = { ...BROWSER_HEADERS, ...headers };
    if (referer) h.Referer = referer;
    if (cookies && cookies.size()) h.Cookie = cookies.header();
    const r = await fetch(url, { method, body, headers: h, redirect: "follow", signal: c.signal });
    if (cookies) cookies.absorb(r);
    if (!r.ok) return null;
    if (opt.binary) return Buffer.from(await r.arrayBuffer());
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
function extractRows(text) {
  if (!text) return null;
  const out = {};
  try {
    const j = JSON.parse(text);
    const walk = (o, d) => {
      if (!o || typeof o !== "object" || d > 7) return;
      if (Array.isArray(o)) {
        for (const v of o) walk(v, d + 1);
        return;
      }
      let code = "", mkt = "", name = "";
      for (const [k, v] of Object.entries(o)) {
        if (v == null || typeof v === "object") continue;
        const sv = String(v).trim();
        if (!code && isCode(sv) && /(cd|code|no|코드)/i.test(k)) code = sv;
        if (!mkt && /(mkt|market|exch|시장)/i.test(k)) mkt = marketOf(sv);
        if (!name && /(nm|name|종목명|title)/i.test(k) && sv && !isCode(sv)) name = sv;
      }
      if (code) out[code] = { market: mkt || out[code] && out[code].market || "", name: name || out[code] && out[code].name || "" };
      for (const v of Object.values(o)) if (v && typeof v === "object") walk(v, d + 1);
    };
    walk(j, 0);
    if (Object.keys(out).length >= MIN_OK) return out;
  } catch {
  }
  const rows = String(text).replace(/<\/(tr|p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "	").replace(/&nbsp;/g, " ").split(/\r?\n/);
  for (const row of rows) {
    const codes = row.match(/(?<![0-9A-Z])([0-9][0-9A-Z]{5})(?![0-9A-Z])/gi);
    if (!codes) continue;
    if (!/[가-힣A-Za-z&]/.test(row.replace(/[0-9,.\s\t%\-+()|;"']/g, ""))) continue;
    const mkt = marketOf(row);
    const pairs = [...row.matchAll(/(?<![0-9A-Z])([0-9][0-9A-Z]{5})(?![0-9A-Z])[\s\t,|]*([^\t|,0-9]{1,30})?/gi)];
    for (const m of pairs) {
      const code = m[1];
      if (!isCode(code)) continue;
      const nm = (m[2] || "").trim();
      out[code] = { market: mkt || out[code] && out[code].market || "", name: nm || out[code] && out[code].name || "" };
    }
    for (const code of codes) if (!out[code]) out[code] = { market: mkt, name: "" };
  }
  return Object.keys(out).length ? out : null;
}
async function fromEnvUrl() {
  const url = process.env.NXT_LIST_URL;
  if (!url) return null;
  const txt = await req(url, { headers: { Accept: "application/json, text/plain, text/csv, */*" } });
  const rows = extractRows(txt);
  if (rows && Object.keys(rows).length) return { rows, source: "env:NXT_LIST_URL" };
  return null;
}
function parseBoardList(html) {
  if (!html) return [];
  const posts = [];
  const best = /* @__PURE__ */ new Map();
  const pats = [
    /scNttNo=(\d+)[^>]*>\s*([^<]{4,120})/g,
    /fn_?[eE]gov_?[sS]elect[^(]*\(\s*'?(\d+)'?\s*\)[^>]*>\s*([^<]{4,120})/g,
    /fn_?view\(\s*'?(\d+)'?\s*\)[^>]*>\s*([^<]{4,120})/g,
    /goView\(\s*'?(\d+)'?\s*\)[^>]*>\s*([^<]{4,120})/g,
    /data-ntt-?no=["'](\d+)["'][^>]*>\s*([^<]{4,120})/gi
  ];
  for (const re of pats) {
    for (const m of String(html).matchAll(re)) {
      const no = m[1];
      const title = m[2].replace(/\s+/g, " ").trim();
      const prev = best.get(no);
      if (prev && !(LIST_TITLE.test(title) && !LIST_TITLE.test(prev))) continue;
      best.set(no, title);
    }
  }
  for (const [no, title] of best) {
    posts.push({ no: +no, title, date: (title.match(/20\d{2}[-.]\d{2}[-.]\d{2}/) || [""])[0] });
  }
  return posts.sort((a, b) => b.no - a.no);
}
function parseHalts(posts) {
  const state = /* @__PURE__ */ new Map();
  for (const p of posts) {
    const m = String(p.title).match(/매매거래(정지|재개)\s*\(([^)]+)\)/);
    if (!m) continue;
    const halted = m[1] === "\uC815\uC9C0";
    for (const raw of m[2].split(/[,·]/)) {
      const name = raw.trim();
      if (!name) continue;
      const cur = state.get(name);
      if (!cur || p.no > cur.no) state.set(name, { no: p.no, halted });
    }
  }
  return [...state.entries()].filter(([, v]) => v.halted).map(([name]) => name);
}
function parseAttachments(html, host) {
  if (!html) return [];
  const urls = /* @__PURE__ */ new Set();
  const push = (u) => {
    if (u) urls.add(u.startsWith("http") ? u : host + (u.startsWith("/") ? "" : "/") + u);
  };
  for (const m of String(html).matchAll(/href=["']([^"']*(?:FileDown|fileDown|download|atchFile)[^"']*)["']/gi)) push(m[1].replace(/&amp;/g, "&"));
  for (const m of String(html).matchAll(/href=["']([^"']+\.(?:xlsx|xls|csv))["']/gi)) push(m[1].replace(/&amp;/g, "&"));
  for (const m of String(html).matchAll(/(?:fn_?egov_?downFile|fileDown|fnDownload|fn_?fileDown)\(\s*'([^']+)'\s*(?:,\s*'?([\w-]+)'?)?/gi)) {
    const id = m[1], sn = m[2] || "0";
    push(`/cmm/fms/FileDown.do?atchFileId=${id}&fileSn=${sn}`);
    push(`/file/download.do?atchFileId=${id}&fileSn=${sn}`);
    push(`/cmm/fms/FileDown.do?atchFileId=${id}&fileSn=${sn}&scBbsKndCode=marketInfo`);
  }
  for (const m of String(html).matchAll(/data-(?:file|atch)[\w-]*=["']([^"']+)["']/gi)) {
    push(`/cmm/fms/FileDown.do?atchFileId=${m[1]}&fileSn=0`);
  }
  return [...urls];
}
async function attachmentToText(buf) {
  if (!buf || !buf.length) return null;
  if (buf[0] === 80 && buf[1] === 75) {
    try {
      return await xlsxToText(buf);
    } catch {
      return null;
    }
  }
  if (buf[0] === 37 && buf[1] === 80 && buf[2] === 68 && buf[3] === 70) {
    const raw = buf.toString("latin1");
    const out = [];
    for (const m of raw.matchAll(/\(([^()\\]{1,80})\)\s*Tj/g)) out.push(m[1]);
    const txt = out.join("\n");
    return txt.length > 200 ? txt : null;
  }
  return buf.toString("utf8");
}
async function fromNextradeBoard() {
  for (const host of HOSTS) {
    if (outOfTime()) break;
    const cookies = jar();
    await req(`${host}/main.do`, { cookies });
    let posts = [];
    for (let page = 1; page <= 3; page++) {
      if (outOfTime()) break;
      const html = await req(BOARD_LIST(host, page), { cookies, referer: `${host}/main.do` });
      if (!html) break;
      posts = posts.concat(parseBoardList(html));
    }
    const haltedNames = parseHalts(posts);
    const targets = posts.filter((p) => LIST_TITLE.test(p.title)).slice(0, 8);
    if (!targets.length) continue;
    for (const post of targets) {
      if (outOfTime()) break;
      const view2 = await req(BOARD_VIEW(host, post.no), { cookies, referer: BOARD_LIST(host, 1) });
      if (!view2) continue;
      let rows = extractRows(view2);
      if (sane(rows)) return { rows, halted: haltedNames, source: `nextrade:board#${post.no}` };
      for (const url of parseAttachments(view2, host)) {
        if (outOfTime()) break;
        const buf = await req(url, { cookies, referer: BOARD_VIEW(host, post.no), binary: true, ms: 15e3 });
        const txt = await attachmentToText(buf);
        rows = extractRows(txt);
        if (sane(rows)) return { rows, halted: haltedNames, source: `nextrade:xlsx#${post.no}` };
      }
    }
  }
  return null;
}
async function fromNextradeConclusion() {
  for (const host of HOSTS) {
    if (outOfTime()) break;
    const cookies = jar();
    await req(`${host}/main.do`, { cookies });
    const listUrl = `${host}/menu/transactionStatusConclusion/menuList.do`;
    const page = await req(listUrl, { cookies, referer: `${host}/main.do` });
    let rows = extractRows(page);
    if (sane(rows)) return { rows, source: "nextrade:page" };
    const candidates = [
      { u: `${host}/menu/transactionStatusConclusion/excelDownload.do`, m: "POST" },
      { u: `${host}/menu/transactionStatusConclusion/selectList.do`, m: "POST" },
      { u: `${host}/menu/transactionStatusConclusion/list.do`, m: "POST" },
      { u: `${host}/menu/transactionStatusConclusion/selectTradeIsuList.do`, m: "POST" }
    ];
    for (const c of candidates) {
      if (outOfTime()) break;
      const buf = await req(c.u, {
        method: c.m,
        cookies,
        referer: listUrl,
        binary: true,
        ms: 15e3,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "Accept": "application/json, text/javascript, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors"
        },
        body: "pageIndex=1&pageUnit=3000&recordCountPerPage=3000&mktCl=&searchKeyword="
      });
      rows = extractRows(await attachmentToText(buf));
      if (sane(rows)) return { rows, source: "nextrade:excel" };
    }
  }
  return null;
}
async function fromNextrade() {
  return await fromNextradeBoard() || await fromNextradeConclusion();
}
async function fromMirrors() {
  for (const m of MIRRORS) {
    if (outOfTime()) break;
    const buf = await req(m.url, { binary: true, ms: 12e3, headers: { Accept: "application/pdf,text/html,*/*" } });
    const rows = extractRows(await attachmentToText(buf));
    if (sane(rows)) return { rows, source: "mirror:" + m.tag };
  }
  return null;
}
function fromSnapshot() {
  const c = NXT_UNIVERSE && NXT_UNIVERSE.codes || {};
  if (!Object.keys(c).length) return null;
  const rows = {};
  for (const [code, market] of Object.entries(c)) rows[code] = { market: market || "", name: (NXT_UNIVERSE.names || {})[code] || "" };
  return { rows, source: "snapshot", asOf: NXT_UNIVERSE.asOf };
}
function applyExclusions(rows, today) {
  const ex = activeExclusions(today);
  const byCode = new Set(ex.filter((e) => e.code).map((e) => e.code));
  const byName = new Set(ex.map((e) => normName(e.name)));
  const removed = [];
  for (const code of Object.keys(rows)) {
    if (byCode.has(code) || byName.has(normName(rows[code].name))) {
      removed.push(code);
      delete rows[code];
    }
  }
  for (const e of ex) if (e.code && !removed.includes(e.code)) removed.push(e.code);
  return { rows, removed, exclusionCount: ex.length };
}
function auditList(rows) {
  const problems = [];
  const codes = Object.keys(rows);
  const n = codes.length;
  if (n < MIN_OK || n > MAX_OK) problems.push(`\uC885\uBAA9 \uC218 ${n}\uAC1C\uAC00 \uD5C8\uC6A9 \uBC94\uC704(${MIN_OK}~${MAX_OK}) \uBC16`);
  for (const t of AUDIT.mustInclude) if (!rows[t.code]) problems.push(`\uD3EC\uD568\uB3FC\uC57C \uD560 ${t.name}(${t.code})\uC774 \uBA85\uB2E8\uC5D0 \uC5C6\uC74C`);
  for (const t of AUDIT.mustExclude) if (rows[t.code]) problems.push(`\uC81C\uC678\uB3FC\uC57C \uD560 ${t.name}(${t.code})\uC774 \uBA85\uB2E8\uC5D0 \uB0A8\uC544 \uC788\uC74C`);
  const kospi = codes.filter((c) => rows[c].market === "KOSPI").length;
  const kosdaq = codes.filter((c) => rows[c].market === "KOSDAQ").length;
  return { ok: problems.length === 0, problems, count: n, kospi, kosdaq };
}
async function blobStore() {
  try {
    const { getStore: getStore2 } = await Promise.resolve().then(() => (init_blobs_shim(), blobs_shim_exports));
    return getStore2("nxt-universe");
  } catch {
    return null;
  }
}
async function readKey(key) {
  const s = await blobStore();
  if (!s) return null;
  try {
    return await s.get(key, { type: "json" });
  } catch {
    return null;
  }
}
async function writeKey(key, val) {
  const s = await blobStore();
  if (!s) return false;
  try {
    await s.setJSON(key, val);
    return true;
  } catch {
    return false;
  }
}
async function readCache() {
  const j = await readKey("current");
  if (!j || !j.codes) return null;
  return { ...j, stale: Date.now() - (j.fetchedAt || 0) > TTL_MS };
}
async function readObserved() {
  const j = await readKey("observed");
  const arr = j && Array.isArray(j.codes) ? j.codes : [];
  for (const c of arr) observedMem.add(c);
  return [...observedMem];
}
async function noteObserved(code) {
  const c = String(code || "").toUpperCase();
  if (!/^[0-9A-Z]{6}$/.test(c) || observedMem.has(c)) return false;
  observedMem.add(c);
  if (Date.now() - observedFlush < 6e4) return true;
  observedFlush = Date.now();
  try {
    const j = await readKey("observed") || {};
    const merged = /* @__PURE__ */ new Set([...j.codes || [], ...observedMem]);
    await writeKey("observed", { codes: [...merged], at: Date.now() });
  } catch {
  }
  return true;
}
async function fromProbe() {
  const left = budgetLeft();
  if (left < 3 * 60 * 1e3) return null;
  const observed = await readObserved();
  const r = await buildFromProbe({
    budgetMs: Math.min(left - 2e4, 10 * 60 * 1e3),
    observed,
    log: (m) => console.log("[probe]", m)
  });
  if (!r || !r.ok) {
    probeWhy = r && r.why || "\uC54C \uC218 \uC5C6\uC74C";
    return null;
  }
  return { rows: r.rows, source: r.source };
}
function officialSane(parsed, rawText) {
  if (!parsed) return { ok: false, why: "\uD30C\uC2F1 \uC2E4\uD328" };
  const have = NXT_UNIVERSE && NXT_UNIVERSE.asOf || "";
  if (have && parsed.asOf && parsed.asOf < have)
    return { ok: false, why: `\uACFC\uAC70 \uC790\uB8CC(${parsed.asOf} < \uBCF4\uC720 ${have})` };
  const n = parsed.counts.total;
  if (n < MIN_OK || n > MAX_OK) return { ok: false, why: `\uAC1C\uC218 ${n} \uBC94\uC704 \uBC16(${MIN_OK}~${MAX_OK})` };
  for (const t of AUDIT.mustInclude)
    if (!parsed.rows[t.code]) return { ok: false, why: `${t.name}(${t.code}) \uB204\uB77D \u2014 \uD30C\uC2F1 \uC5B4\uAE0B\uB0A8` };
  if (!parsed.counts.KOSPI || !parsed.counts.KOSDAQ) return { ok: false, why: "\uC2DC\uC7A5 \uAD6C\uBD84\uC774 \uD55C\uCABD\uBFD0" };
  const cc = crossCheckSummary(rawText, parsed);
  if (cc.checked && !cc.ok) return { ok: false, why: `\uC694\uC57D\uD45C\uC640 \uBD88\uC77C\uCE58(\uD45C ${cc.expectedSelected} vs \uD30C\uC2F1 ${cc.got})` };
  return { ok: true, crossChecked: !!cc.checked };
}
async function fromOfficialSite() {
  const tried = [];
  for (const host of HOSTS) {
    if (outOfTime()) break;
    const cookies = jar();
    await req(`${host}/main.do`, { cookies });
    for (const boardUrl of OFFICIAL_BOARDS) {
      if (outOfTime()) break;
      let posts = [];
      for (let page = 1; page <= 2; page++) {
        if (outOfTime()) break;
        const html = await req(boardUrl(host, page), { cookies, referer: `${host}/main.do` });
        if (!html) break;
        posts = posts.concat(parseBoardList(html));
      }
      const targets = posts.filter((p) => OFFICIAL_TITLE.test(p.title)).slice(0, 6);
      for (const post of targets) {
        if (outOfTime()) break;
        const view2 = await req(BOARD_VIEW(host, post.no), { cookies, referer: boardUrl(host, 1) });
        if (!view2) continue;
        let parsed = parseOfficial(view2);
        let chk = officialSane(parsed, view2);
        if (chk.ok) return {
          rows: parsed.rows,
          removed: parsed.removed,
          asOf: parsed.asOf,
          quarter: parsed.quarter,
          source: `official:\uBCF8\uBB38#${post.no}`,
          counts: parsed.counts
        };
        tried.push(`\uBCF8\uBB38#${post.no}:${chk.why}`);
        for (const url of parseAttachments(view2, host)) {
          if (outOfTime()) break;
          const buf = await req(url, { cookies, referer: BOARD_VIEW(host, post.no), binary: true, ms: 2e4 });
          const txt = await attachmentToText(buf);
          if (!txt) continue;
          parsed = parseOfficial(txt);
          chk = officialSane(parsed, txt);
          if (chk.ok) return {
            rows: parsed.rows,
            removed: parsed.removed,
            asOf: parsed.asOf,
            quarter: parsed.quarter,
            source: `official:\uCCA8\uBD80#${post.no}`,
            counts: parsed.counts
          };
          tried.push(`\uCCA8\uBD80#${post.no}:${chk.why}`);
        }
      }
    }
    for (const listUrl of OFFICIAL_LISTS) {
      if (outOfTime()) break;
      const html = await req(listUrl(host), { cookies, referer: `${host}/main.do` });
      if (!html) continue;
      const parsed = parseOfficial(html);
      const chk = officialSane(parsed, html);
      if (chk.ok) return {
        rows: parsed.rows,
        removed: parsed.removed,
        asOf: parsed.asOf,
        quarter: parsed.quarter,
        source: "official:\uBAA9\uB85D\uD398\uC774\uC9C0",
        counts: parsed.counts
      };
      tried.push(`\uBAA9\uB85D:${chk.why}`);
    }
  }
  officialWhy = tried.length ? tried.slice(0, 6).join(" / ") : "\uB125\uC2A4\uD2B8\uB808\uC774\uB4DC \uC811\uC18D \uC2E4\uD328";
  return null;
}
async function fromNaverIntegrated() {
  const left = budgetLeft();
  if (left < 6e4) {
    integWhy = "\uC2DC\uAC04 \uC608\uC0B0 \uBD80\uC871";
    return null;
  }
  const deadline = Date.now() + Math.min(left - 15e3, 10 * 60 * 1e3);
  const uni = await fetchUniverse(deadline);
  if (uni.length < 1500) {
    integWhy = `\uC720\uB2C8\uBC84\uC2A4 \uBD80\uC871(${uni.length})`;
    return null;
  }
  const nameOf = new Map(uni.map((u) => [u.code, u]));
  const codes = uni.map((u) => u.code);
  const activeNow = /* @__PURE__ */ new Set();
  let idx = 0, scanned = 0, integ = 0;
  const work = async () => {
    while (idx < codes.length && Date.now() < deadline) {
      const c = codes[idx++];
      const j = await getJson(`https://polling.finance.naver.com/api/realtime/domestic/stock/${c}`, 4e3);
      const arr = j && (j.datas || j.result && j.result.areas && j.result.areas.flatMap((a) => a.datas || []));
      const d = Array.isArray(arr) ? arr[0] : null;
      if (!d) continue;
      scanned++;
      const hasIntegrated = !!d.integratedPriceInfo;
      const hasOver = !!d.overMarketPriceInfo;
      if (hasIntegrated) integ++;
      if (hasIntegrated || hasOver) activeNow.add(String(d.itemCode || c).toUpperCase());
    }
  };
  await Promise.all(Array.from({ length: 16 }, work));
  if (activeNow.size < 50) {
    integWhy = `\uD65C\uB3D9 \uC885\uBAA9 \uB108\uBB34 \uC801\uC74C(${activeNow.size})`;
    return null;
  }
  const now = Date.now();
  const seen = await readKey("nxtSeen") || {};
  for (const c of activeNow) seen[c] = now;
  for (const c of Object.keys(seen)) if (now - seen[c] > NXT_SEEN_WINDOW * 2) delete seen[c];
  await writeKey("nxtSeen", seen);
  const active14 = Object.keys(seen).filter((c) => now - seen[c] <= NXT_SEEN_WINDOW);
  const set14 = new Set(active14);
  const snapCodes = Object.keys(NXT_UNIVERSE && NXT_UNIVERSE.codes || {});
  const cov = snapCodes.length ? snapCodes.filter((c) => set14.has(c)).length / snapCodes.length : 1;
  let memberCodes, mode;
  if (cov >= 0.85) {
    memberCodes = active14;
    mode = `\uC131\uC219 cov${(cov * 100).toFixed(0)}%`;
  } else {
    memberCodes = [.../* @__PURE__ */ new Set([...active14, ...snapCodes])];
    mode = `\uB204\uC801\uC911 cov${(cov * 100).toFixed(0)}%`;
  }
  integWhy = `\uC2A4\uCE94 ${scanned} \xB7 \uAE08\uC77C\uD65C\uB3D9 ${activeNow.size} \xB7 14\uC77C\uB204\uC801 ${active14.length} \xB7 ${mode}`;
  const rows = {};
  for (const c of memberCodes) {
    const u = nameOf.get(c);
    rows[c] = { market: u ? u.market : "", name: u ? u.name : "" };
  }
  return { rows, source: `naver-nxt(${memberCodes.length}\xB7${mode})` };
}
async function fromPinned() {
  const j = await readKey("pinned");
  if (!j || !j.rows || !Object.keys(j.rows).length) return null;
  return { rows: j.rows, source: "pinned:" + (j.note || "manual"), asOf: j.asOf || null };
}
async function recordHistory(payload) {
  const prev = await readKey("current");
  const prevSet = new Set(Object.keys(prev && prev.codes || {}));
  const nowSet = new Set(Object.keys(payload.codes || {}));
  if (!prevSet.size) return null;
  const added = [...nowSet].filter((c) => !prevSet.has(c));
  const dropped = [...prevSet].filter((c) => !nowSet.has(c));
  if (!added.length && !dropped.length) return null;
  const log = await readKey("history") || [];
  const entry = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    asOf: payload.asOf,
    source: payload.source,
    before: prevSet.size,
    after: nowSet.size,
    added: added.map((c) => ({ code: c, name: (payload.names || {})[c] || "" })),
    dropped: dropped.map((c) => ({ code: c, name: (prev.names || {})[c] || "" }))
  };
  log.unshift(entry);
  await writeKey("history", log.slice(0, 40));
  return entry;
}
async function writePinned(rows, meta) {
  return writeKey("pinned", { rows, asOf: meta && meta.asOf || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), note: meta && meta.note || "manual", at: Date.now() });
}
function finalize(hit, today) {
  const rows = {};
  for (const [k, v] of Object.entries(hit.rows)) rows[k] = { ...v };
  const { rows: kept, removed, exclusionCount } = applyExclusions(rows, today);
  const audit = auditList(kept);
  const codes = {}, names = {};
  for (const [c, v] of Object.entries(kept)) {
    codes[c] = v.market || "";
    if (v.name) names[c] = v.name;
  }
  const haltedSet = new Set((hit.halted || []).map(normName));
  const halted = Object.keys(codes).filter((c) => haltedSet.has(normName(names[c])));
  return {
    ok: audit.ok,
    trusted: audit.ok,
    codes,
    names,
    markets: codes,
    halted,
    count: audit.count,
    kospi: audit.kospi,
    kosdaq: audit.kosdaq,
    removed,
    exclusionCount,
    audit,
    source: hit.source,
    asOf: hit.asOf || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    quarter: hit.quarter || null,
    official: /official/.test(String(hit.source || "")) || !!hit.official,
    fetchedAt: Date.now()
  };
}
async function resolveFast() {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  if (memo && memo.trusted) return memo;
  const cached = await readCache();
  const bundledAsOf = NXT_UNIVERSE && NXT_UNIVERSE.asOf || "";
  const cachedStale = !!(cached && bundledAsOf && String(cached.asOf || "") < bundledAsOf);
  if (cached && cached.trusted && !cachedStale) {
    memo = cached;
    return cached.stale ? { ...cached, source: (cached.source || "?") + "(stale)" } : cached;
  }
  const pinned = await fromPinned();
  if (pinned) {
    const p = finalize(pinned, today);
    if (p.trusted) {
      memo = p;
      return p;
    }
  }
  const snap = fromSnapshot();
  if (snap) {
    const p = finalize(snap, today);
    if (p.trusted) {
      memo = p;
      return p;
    }
    return unavailable([`snapshot: ${p.count}\uC885\uBAA9, \uAC10\uC0AC \uC2E4\uD328 \u2014 ${p.audit.problems.join(" / ")}`]);
  }
  return unavailable(["\uBC88\uB4E4 \uC2A4\uB0C5\uC0F7(data/nxt-universe.js)\uC774 \uBE44\uC5B4 \uC788\uACE0 \uC218\uC9D1 \uCE90\uC2DC\uB3C4 \uC5C6\uC2B5\uB2C8\uB2E4"]);
}
function unavailable(attempts) {
  return {
    ok: false,
    trusted: false,
    status: "unavailable",
    codes: {},
    names: {},
    markets: {},
    halted: [],
    count: 0,
    kospi: 0,
    kosdaq: 0,
    removed: [],
    asOf: null,
    source: "none",
    attempts,
    audit: { ok: false, problems: attempts, count: 0 }
  };
}
async function collectOne(idx, budgetMs) {
  const list = COLLECT_SOURCES();
  if (idx >= list.length) return { done: true, result: { ok: false, why: "\uC804 \uC18C\uC2A4 \uC18C\uC9C4" } };
  const fn = list[idx];
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  DEADLINE = Date.now() + (budgetMs || 8e3);
  try {
    let hit = null, note = "";
    try {
      hit = await fn();
    } catch (e) {
      note = `${fn.name}: \uC624\uB958 ${String(e).slice(0, 80)}`;
    }
    if (!hit) return { done: false, note: note || `${fn.name}: \uC751\uB2F5 \uC5C6\uC74C` };
    const payload = finalize(hit, today);
    if (!payload.trusted) return { done: false, note: `${fn.name}(${payload.source}): \uAC10\uC0AC \uC2E4\uD328 \u2014 ${payload.audit.problems.join(" / ")}` };
    payload.attempts = [`${fn.name}(${payload.source}): ${payload.count}\uC885\uBAA9, \uAC10\uC0AC \uD1B5\uACFC`];
    try {
      payload.change = await recordHistory(payload);
    } catch {
      payload.change = null;
    }
    memo = payload;
    await writeCache(payload);
    await writeKey("lastFail", null);
    return { done: true, result: { ok: true, source: payload.source, count: payload.count, asOf: payload.asOf } };
  } finally {
    DEADLINE = 0;
  }
}
async function collect(budgetMs) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  DEADLINE = Date.now() + (budgetMs || 2e4);
  const attempts = [];
  try {
    for (const fn of [fromPinned, fromEnvUrl, fromOfficialSite, fromSnapshot, fromNaverIntegrated, fromProbe, fromNextrade, fromMirrors]) {
      if (outOfTime()) {
        attempts.push("\uC2DC\uAC04 \uC608\uC0B0 \uCD08\uACFC \u2014 \uB0A8\uC740 \uC18C\uC2A4 \uC911\uB2E8");
        break;
      }
      let hit = null;
      try {
        hit = await fn();
      } catch (e) {
        hit = null;
        attempts.push(`${fn.name}: \uC624\uB958 ${String(e).slice(0, 80)}`);
      }
      if (!hit) {
        attempts.push(`${fn.name}: ${fn === fromProbe && probeWhy ? probeWhy : "\uC751\uB2F5 \uC5C6\uC74C"}`);
        continue;
      }
      const payload = finalize(hit, today);
      attempts.push(`${fn.name}(${payload.source}): ${payload.count}\uC885\uBAA9, \uAC10\uC0AC ${payload.audit.ok ? "\uD1B5\uACFC" : "\uC2E4\uD328 \u2014 " + payload.audit.problems.join(" / ")}`);
      if (payload.trusted) {
        payload.attempts = attempts;
        try {
          payload.change = await recordHistory(payload);
        } catch {
          payload.change = null;
        }
        memo = payload;
        await writeCache(payload);
        await writeKey("lastFail", null);
        return payload;
      }
    }
    const stale = await readCache();
    if (stale && stale.trusted) return { ...stale, source: (stale.source || "?") + "(stale)", attempts };
    await writeKey("lastFail", { at: Date.now(), attempts });
    return unavailable(attempts);
  } finally {
    DEADLINE = 0;
  }
}
async function resolve2(force, budgetMs) {
  if (!force) {
    const fast = await resolveFast();
    if (fast.trusted) return fast;
    const lf = await readKey("lastFail");
    if (lf && lf.at && Date.now() - lf.at < FAIL_TTL_MS) return unavailable(lf.attempts || []);
  }
  return collect(budgetMs || 2e4);
}
var TTL_MS, FAIL_TTL_MS, DEADLINE, budgetLeft, outOfTime, MIN_OK, MAX_OK, BROWSER_HEADERS, isCode, normName, marketOf, sane, HOSTS, BOARD_LIST, BOARD_VIEW, LIST_TITLE, MIRRORS, writeCache, observedMem, observedFlush, probeWhy, integWhy, officialWhy, OFFICIAL_BOARDS, OFFICIAL_LISTS, OFFICIAL_TITLE, NXT_SEEN_WINDOW, readHistory, readPinned, clearPinned, memo, COLLECT_SOURCES;
var init_nxt_core = __esm({
  "data/nxt-core.js"() {
    init_nxt_universe();
    init_xlsx_lite();
    init_nxt_official();
    init_nxt_exclusions();
    init_nxt_detect();
    TTL_MS = 12 * 60 * 60 * 1e3;
    FAIL_TTL_MS = 10 * 60 * 1e3;
    DEADLINE = 0;
    budgetLeft = () => DEADLINE ? DEADLINE - Date.now() : 1e9;
    outOfTime = () => budgetLeft() < 1500;
    MIN_OK = AUDIT.countRange[0];
    MAX_OK = AUDIT.countRange[1];
    BROWSER_HEADERS = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1"
    };
    isCode = (s) => /^[0-9][0-9A-Z]{5}$/.test(String(s).toUpperCase());
    normName = (s) => String(s || "").replace(/\s+/g, "").replace(/[()]/g, "").toUpperCase();
    marketOf = (t) => /KOSDAQ|코스닥/i.test(t) ? "KOSDAQ" : /KOSPI|유가증권|코스피/i.test(t) ? "KOSPI" : "";
    sane = (rows) => {
      if (!rows) return false;
      const n = Object.keys(rows).length;
      return n >= MIN_OK && n <= MAX_OK;
    };
    HOSTS = ["https://nextrade.co.kr", "https://www.nextrade.co.kr"];
    BOARD_LIST = (host, page) => `${host}/menu/marketInfo/menuList.do?pageIndex=${page}&scBbsKndCode=marketInfo&scNttCl=general&searchKeyword=`;
    BOARD_VIEW = (host, no) => `${host}/menu/marketInfo/view.do?pageIndex=1&scBbsKndCode=marketInfo&scNttCl=general&scNttNo=${no}&scTopViewYn=&searchKeyword=`;
    LIST_TITLE = /매매체결대상종목|거래대상종목|정기\s*변경|한도\s*관리|종목\s*조정|확대\s*안내/;
    MIRRORS = [
      { url: "https://securities.miraeasset.com/bbs/download/2135251.pdf?attachmentId=2135251", tag: "miraeasset:pdf" }
    ];
    writeCache = (p) => writeKey("current", p);
    observedMem = /* @__PURE__ */ new Set();
    observedFlush = 0;
    probeWhy = "";
    integWhy = "";
    officialWhy = "";
    OFFICIAL_BOARDS = [
      (host, page) => `${host}/menu/reportData/menuList.do?pageIndex=${page}`,
      // 자료실
      (host, page) => `${host}/menu/notice/menuList.do?pageIndex=${page}`,
      // 공지사항
      (host, page) => `${host}/menu/marketInfo/menuList.do?pageIndex=${page}&scBbsKndCode=marketInfo&scNttCl=general&searchKeyword=`
    ];
    OFFICIAL_LISTS = [
      (host) => `${host}/menu/marketData/menuList.do`,
      // 거래대상종목
      (host) => `${host}/menu/transactionStatusConclusion/menuList.do`
    ];
    OFFICIAL_TITLE = /정기\s*변경|매매체결대상종목|거래대상종목|수시\s*변경/;
    NXT_SEEN_WINDOW = 14 * 24 * 60 * 60 * 1e3;
    readHistory = () => readKey("history");
    readPinned = () => readKey("pinned");
    clearPinned = () => writeKey("pinned", {});
    memo = null;
    COLLECT_SOURCES = () => [
      fromPinned,
      fromEnvUrl,
      fromOfficialSite,
      fromSnapshot,
      fromNaverIntegrated,
      fromProbe,
      fromNextrade,
      fromMirrors
    ];
  }
});

// data/market-calendar.js
function fixedHolidays(year) {
  const d = (m, day) => `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return [d(1, 1), d(3, 1), d(5, 5), d(6, 6), d(8, 15), d(10, 3), d(10, 9), d(12, 25), d(12, 31)];
}
async function jget3(url, ms = 4e3) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA5, Accept: "application/json" }, signal: c.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
async function fetchPublic(year) {
  const j = await jget3(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`);
  if (!Array.isArray(j) || !j.length) return null;
  const days = j.map((x) => String(x.date || "")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  return days.length ? days : null;
}
async function holidaysFor(year, store) {
  if (memo2.has(year)) return memo2.get(year);
  let days = null;
  if (store) {
    try {
      const c = await store.get("holidays:" + year, { type: "json" });
      if (c && Array.isArray(c.days) && c.days.length && Date.now() - (c.at || 0) < 180 * 864e5) days = c.days;
    } catch {
    }
  }
  if (!days) {
    days = await fetchPublic(year);
    if (days && store) {
      try {
        await store.setJSON("holidays:" + year, { days, at: Date.now(), src: "public-api" });
      } catch {
      }
    }
  }
  const merged = /* @__PURE__ */ new Set([...days || [], ...BUNDLED[year] || [], ...fixedHolidays(year)]);
  memo2.set(year, merged);
  return merged;
}
async function isTradingDay(date, store) {
  const w = date.getDay();
  if (w === 0 || w === 6) return false;
  const set = await holidaysFor(date.getFullYear(), store);
  return !set.has(ymd2(date));
}
async function nextTradingDay(from, store) {
  const d = new Date(from);
  for (let i = 0; i < 40; i++) {
    d.setDate(d.getDate() + 1);
    if (await isTradingDay(d, store)) return d;
  }
  return d;
}
var UA5, BUNDLED, memo2, ymd2;
var init_market_calendar = __esm({
  "data/market-calendar.js"() {
    UA5 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
    BUNDLED = {
      2025: [
        "2025-01-01",
        "2025-01-28",
        "2025-01-29",
        "2025-01-30",
        "2025-03-03",
        "2025-05-05",
        "2025-05-06",
        "2025-06-03",
        "2025-06-06",
        "2025-08-15",
        "2025-10-03",
        "2025-10-06",
        "2025-10-07",
        "2025-10-08",
        "2025-10-09",
        "2025-12-25",
        "2025-12-31"
      ],
      2026: [
        "2026-01-01",
        "2026-02-16",
        "2026-02-17",
        "2026-02-18",
        "2026-03-02",
        "2026-05-05",
        "2026-05-25",
        "2026-06-03",
        "2026-06-08",
        "2026-08-17",
        "2026-09-24",
        "2026-09-25",
        "2026-09-28",
        "2026-10-05",
        "2026-10-09",
        "2026-12-25",
        "2026-12-31"
      ],
      2027: [
        "2027-01-01",
        "2027-02-06",
        "2027-02-07",
        "2027-02-08",
        "2027-03-01",
        "2027-03-02",
        "2027-05-05",
        "2027-05-13",
        "2027-06-07",
        "2027-08-16",
        "2027-09-14",
        "2027-09-15",
        "2027-09-16",
        "2027-10-04",
        "2027-10-11",
        "2027-12-25",
        "2027-12-31"
      ]
    };
    memo2 = /* @__PURE__ */ new Map();
    ymd2 = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
});

// netlify/functions/picks.js
var picks_exports = {};
__export(picks_exports, {
  buildAndStore: () => buildAndStore,
  config: () => config,
  default: () => picks_default
});
async function pickTarget(nowK, store) {
  const hm = nowK.getUTCHours() * 60 + nowK.getUTCMinutes();
  if (hm < 15 * 60 + 40) {
    const trading = await isTradingDay(nowK, store).catch(() => false);
    if (trading) {
      const t = new Date(nowK);
      t.setUTCHours(0, 0, 0, 0);
      return { target: t, isToday: true };
    }
  }
  return { target: await nextTradingDay(nowK, store), isToday: false };
}
async function jget4(url, ms = 3500) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA6, Referer: "https://m.stock.naver.com/", Accept: "application/json" }, signal: c.signal });
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
async function jtext(url, ms = 3500) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA6, Referer: "https://finance.naver.com/" }, signal: c.signal });
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
async function universe() {
  const out = [];
  const pull = async (market, page) => {
    const j = await jget4(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=100`, 4500);
    const arr = j && (j.stocks || j.result || j.items) || [];
    for (const x of arr) {
      const code = String(x.itemCode || x.code || x.reutersCode || "").toUpperCase().replace(/\.(KS|KQ)$/, "");
      if (!/^[0-9][0-9A-Z]{5}$/.test(code)) continue;
      out.push({
        code,
        name: String(x.stockName || x.name || "").trim(),
        market: market === "KOSDAQ" ? "\uCF54\uC2A4\uB2E5" : "\uCF54\uC2A4\uD53C",
        price: num(x.closePrice),
        rate: num(x.fluctuationsRatio),
        volume: num(x.accumulatedTradingVolume),
        value: num(x.accumulatedTradingValue)
        // 거래대금
      });
    }
  };
  /* ══ [v9.71] 살펴보는 종목이 너무 적었다 ═══════════════════════════════════
     코스피 3쪽 + 코스닥 2쪽 = 최대 500종만 받아 왔다. 실제 상장 종목은
     코스피 약 950 · 코스닥 약 1,780 종이라 전체의 1/5 만 본 셈이고,
     그나마 시가총액 순이라 하위 종목은 아예 후보에 오르지 못했다.
     급등은 오히려 소형주에서 자주 나오므로 이 구조에서는 놓칠 수밖에 없다.
     외부 호출 한도(★11)를 지키면서 코스피 5쪽 + 코스닥 7쪽 = 최대 1,200종으로 넓힌다. */
  await Promise.all([
    pull("KOSPI", 1), pull("KOSPI", 2), pull("KOSPI", 3), pull("KOSPI", 4), pull("KOSPI", 5),
    pull("KOSDAQ", 1), pull("KOSDAQ", 2), pull("KOSDAQ", 3), pull("KOSDAQ", 4),
    pull("KOSDAQ", 5), pull("KOSDAQ", 6), pull("KOSDAQ", 7)
  ]);
  const seen = /* @__PURE__ */ new Set();
  return out.filter((s) => seen.has(s.code) ? false : (seen.add(s.code), true));
}
function parseSise2(txt) {
  txt = String(txt || "").trim().replace(/\n/g, "").replace(/'/g, '"');
  if (!txt.startsWith("[")) return [];
  let arr;
  try {
    arr = JSON.parse(txt);
  } catch {
    try {
      arr = JSON.parse(txt.replace(/,\s*]/g, "]"));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.slice(1).filter((r) => Array.isArray(r) && r.length >= 6).map((r) => ({ o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] })).filter((c) => c.c > 0);
}
async function candles(code) {
  const end = /* @__PURE__ */ new Date();
  const start = /* @__PURE__ */ new Date();
  start.setMonth(start.getMonth() - 5);
  const y = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const txt = await jtext(`https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${y(start)}&endTime=${y(end)}&timeframe=day`, 3500);
  return parseSise2(txt);
}
function rsi(closes, n = 14) {
  if (closes.length < n + 1) return 50;
  let up = 0, dn = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) up += d;
    else dn -= d;
  }
  if (up + dn === 0) return 50;
  const rs = up / (dn || 1e-9);
  return 100 - 100 / (1 + rs);
}
/* ══════════════════════════════════════════════════════════════════════════
   [v9.71] 급등주 점수 엔진 전면 재작성
   ─────────────────────────────────────────────────────────────────────────
   예전 엔진이 틀렸던 이유는 계산 실수가 아니라 '무엇을 고르는가'가 잘못돼서다.

     · 정배열 +26, 20일 고가 근접 +14, 20일 모멘텀 +16 …
       점수의 대부분이 "이미 많이 오른 종목"에 몰려 있었다. 어제까지 오른 종목을
       사는 규칙이라, 상승이 꺾이는 자리에서 사게 된다(고점 추격).
     · 게이트가 '오늘 +1~13% 오른 종목'만 통과시켰다. 급등 다음 날은 되돌림이
       나오는 경우가 더 많아, 하필 가장 불리한 구간만 골라 담았다.
     · 과열 방어는 이격도 28% 하나뿐이었다.

   새 엔진의 원칙 — '이미 오른 것'이 아니라 '오를 준비가 된 것'을 찾는다.
     ① 눌림(pullback)  : 상승 추세인데 단기 조정을 받아 5일선 근처로 돌아온 자리
     ② 수축 후 팽창    : 변동폭이 좁아진(스퀴즈) 뒤 거래량이 붙기 시작하는 자리
     ③ 저항 돌파       : 최근 고가대를 거래량을 동반해 막 넘어선 자리
     ④ 과열 회피       : 이격·연속 상승·RSI 과열은 강하게 감점
     ⑤ 유동성·안정성   : 거래대금 하한, 이상 변동성 제외
   세 갈래(①②③) 중 하나에 뚜렷이 해당해야 점수를 준다. 아무 갈래에도 속하지
   않으면 '지금은 자리가 아니다'로 보고 후보에서 뺀다 — 억지로 채우지 않는다.
   ══════════════════════════════════════════════════════════════════════════ */
function sdev(a) { if (!a.length) return 0; const m = avg(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length); }
function feat(cs) {
  if (!cs || cs.length < 62) return null;
  const c = cs.map(x => +x.c || 0), h = cs.map(x => +x.h || 0), l = cs.map(x => +x.l || 0), v = cs.map(x => +x.v || 0);
  if (c.slice(-62).some(x => !(x > 0))) return null;
  const n = c.length, last = c[n - 1];
  const ma = (k) => avg(c.slice(-k));
  const ma5 = ma(5), ma10 = ma(10), ma20 = ma(20), ma60 = ma(60);
  /* 일간 수익률과 변동성 */
  const rets = []; for (let i = n - 21; i < n; i++) rets.push(c[i] / c[i - 1] - 1);
  const vol20 = sdev(rets);                                    // 일간 변동성
  /* 거래량 — 최근 3일 대 20일(직전) */
  const vRecent = avg(v.slice(-3)), vBase = avg(v.slice(-23, -3));
  const volRatio = vBase > 0 ? vRecent / vBase : 0;
  /* 위치 */
  const hi20 = Math.max(...h.slice(-20)), lo20 = Math.min(...l.slice(-20));
  const hi60 = Math.max(...h.slice(-60));
  const posInRange = hi20 > lo20 ? (last - lo20) / (hi20 - lo20) : 0.5;
  /* 추세 */
  const upTrend = ma5 > ma20 && ma20 > ma60;
  const midTrend = last > ma20 && ma20 > ma60;
  const slope20 = ma20 / avg(c.slice(-25, -5)) - 1;            // 20일선 기울기
  /* 이격 */
  const ext5 = (last - ma5) / ma5, ext20 = (last - ma20) / ma20;
  /* 연속 상승일 — 많을수록 되돌림 위험 */
  let runUp = 0; for (let i = n - 1; i > 0 && c[i] > c[i - 1]; i--) runUp++;
  /* 수축(스퀴즈) — 최근 10일 폭이 그 앞 30일 폭보다 얼마나 좁은가 */
  /* [v9.71 수정] '수축'은 팽창이 시작되기 '직전'까지를 재야 한다. 최근 며칠을
     포함해 재면, 거래량이 붙어 폭이 커지는 순간 수축 지표가 되레 커져
     스퀴즈 자리를 영영 못 찾는다. 최근 4일을 빼고 그 앞 구간끼리 견준다. */
  const rng = (a, b) => { const hh = Math.max(...h.slice(a, b)), ll = Math.min(...l.slice(a, b)); return ll > 0 ? (hh - ll) / ll : 1; };
  const rNear = rng(n - 26, n - 4), rFar = rng(n - 56, n - 26);
  const squeeze = rFar > 0 ? rNear / rFar : 1;
  /* 최근 되돌림 깊이 — 20일 고가 대비 */
  const drawFromHi = hi20 > 0 ? (hi20 - last) / hi20 : 0;
  return {
    last, ma5, ma10, ma20, ma60, vol20, volRatio, hi20, lo20, hi60, posInRange,
    upTrend, midTrend, slope20, ext5, ext20, runUp, squeeze, drawFromHi,
    rsi: rsi(c, 14),
    mom20: last / c[n - 21] - 1,
    mom5: last / c[n - 6] - 1,
    mom60: last / c[n - 61] - 1,
    turnover: last * avg(v.slice(-5))                          // 최근 5일 평균 거래대금
  };
}
function score(cs) {
  const f = feat(cs);
  if (!f) return null;
  /* ── 먼저 거를 것들 — 통과하지 못하면 후보가 아니다 ── */
  if (f.last < 1000) return null;                              // 초저가주 제외
  if (f.turnover < 5e8) return null;                           // 5일 평균 거래대금 5억 미만 = 유동성 부족
  if (f.vol20 > 0.11) return null;                             // 일간 변동성 11% 초과 = 통제 불가
  if (f.ext20 > 0.35) return null;                             // 20일선 대비 35% 초과 이격 = 과열
  if (f.runUp >= 6) return null;                               // 6일 연속 상승 = 되돌림 구간(돌파는 연속 상승을 동반하므로 5일까지는 허용하고 아래에서 감점)
  if (f.rsi > 80) return null;                                 // 과매수 극단
  if (f.mom20 > 0.60) return null;                             // 한 달 60% 초과 = 이미 급등 완료

  /* ── 세 갈래 자리 판정 ── */
  const setups = [];
  /* ① 눌림목 — 중기 추세는 살아 있고 단기 조정을 받은 자리
     [v9.71 정정] 처음에는 upTrend(5일선>20일선>60일선)를 요구했는데, 이건
     눌림목의 정의와 어긋난다. 조정을 받으면 5일선이 20일선 아래로 내려가는
     것이 정상이라, 이 조건을 걸면 '조정받지 않은 종목'만 남아 눌림목이
     한 건도 잡히지 않았다. 중기 추세(20일선>60일선)만 확인한다. */
  const pullback = f.ma20 > f.ma60 && f.last > f.ma60 * 0.98 && f.slope20 > 0
    && f.drawFromHi >= 0.025 && f.drawFromHi <= 0.18
    && f.ext20 > -0.10 && f.ext20 < 0.12
    && f.rsi >= 33 && f.rsi <= 66;
  /* ② 수축 후 거래량 — 변동폭이 좁아진 뒤 거래가 붙기 시작 */
  const coil = f.squeeze <= 0.78 && f.midTrend
    && f.volRatio >= 1.3 && f.posInRange >= 0.40
    && f.ext20 < 0.20 && f.rsi >= 42 && f.rsi <= 72;
  /* ③ 거래량 동반 돌파 — 60일 고가대를 이제 막 넘어섰다 */
  /* [v9.71 정정] 돌파는 성질상 RSI가 높게 나온다 — 조용한 바닥에서 사흘만
     강하게 올라도 75~80이 된다. 74로 막으면 진짜 돌파가 전부 걸러진다.
     대신 전역 안전장치(RSI 80 초과 제외)는 그대로 두어 극단만 막는다. */
  const breakout = f.last >= f.hi60 * 0.975 && f.last <= f.hi60 * 1.08
    && f.volRatio >= 1.7 && f.midTrend
    && f.ext20 <= 0.25 && f.rsi <= 79;
  if (pullback) setups.push("pullback");
  if (coil) setups.push("coil");
  if (breakout) setups.push("breakout");
  /* ══ [v9.71b] '조건 미달이면 아무것도 안 보여 준다'는 지나쳤다 ═══════════════
     기준 미달 종목을 '추천'으로 올리는 건 여전히 안 된다. 하지만 화면을 통째로
     비우면 사용자는 고장인지 없는 건지 알 수 없고, 어떤 종목이 근접했는지도
     못 본다. 자리에 들지 못한 종목은 '근접 후보'로 표시만 하고 추천에선 뺀다.
     near=true 인 항목은 위쪽 추천 목록에 들어가지 않는다. */
  const near = setups.length === 0;

  /* ── 점수 — 자리의 '질'만 본다. 이미 오른 폭에는 점수를 주지 않는다 ── */
  let sc = near ? 20 : 34;        /* 자리에 못 든 종목은 낮은 점수에서 시작한다 */
  const tags = [];
  if (pullback) { sc += 18; tags.push("\uB20C\uB9BC\uBAA9"); }              // 눌림목
  if (coil)     { sc += 16; tags.push("\uBCC0\uB3D9\uD3ED \uC218\uCD95"); } // 변동폭 수축
  if (breakout) { sc += 17; tags.push("\uAC70\uB798\uB7C9 \uB3CC\uD30C"); } // 거래량 돌파
  if (setups.length >= 2) sc += 6;                             // 두 갈래가 겹치면 더 좋은 자리

  /* 추세의 질 */
  if (f.upTrend) sc += 8;
  sc += Math.max(-4, Math.min(8, f.slope20 * 220));            // 20일선 기울기
  if (f.mom60 > 0 && f.mom60 < 0.5) sc += 4;                   // 중기 상승 기조

  /* 거래량 — 지나치게 큰 값은 되레 감점(단발성 이벤트일 확률) */
  if (f.volRatio >= 1.5 && f.volRatio <= 5) sc += Math.min(10, (f.volRatio - 1.2) * 4);
  else if (f.volRatio > 8) sc -= 6;

  /* 과열 방어 — 여러 겹으로 */
  sc -= Math.max(0, (f.ext20 - 0.18)) * 60;
  sc -= Math.max(0, (f.rsi - 68)) * 0.7;
  sc -= f.runUp >= 3 ? (f.runUp - 2) * 4 : 0;
  sc -= Math.max(0, (f.vol20 - 0.045)) * 130;                  // 변동성이 클수록 감점

  /* 유동성 가점 — 거래대금이 두터울수록 다음 날 실제로 사고팔 수 있다 */
  if (f.turnover >= 5e9) sc += 5; else if (f.turnover >= 2e9) sc += 3;

  /* 근접 후보에는 '무엇이 모자란지'를 적어 준다 */
  let nearWhy = "";
  if (near) {
    if (f.drawFromHi < 0.03) nearWhy = "\uACE0\uAC00\uAD8C \uBD99\uC5B4 \uB20C\uB9BC \uC5C6\uC74C";
    else if (f.volRatio < 1.5) nearWhy = "\uAC70\uB798\uB7C9 \uC544\uC9C1 \uD55C\uC0B0\uD568";
    else if (!f.midTrend) nearWhy = "\uC911\uAE30 \uCD94\uC138 \uBBF8\uD655\uB9BD";
    else if (f.rsi > 68) nearWhy = "\uACFC\uC5F4 \uAD6C\uAC04";
    else nearWhy = "\uC790\uB9AC \uBBF8\uC644\uC131";
  }
  const setupLabel = pullback ? "\uB20C\uB9BC\uBAA9 \uC7AC\uC9C4\uC785" : coil ? "\uC218\uCD95 \uD6C4 \uD655\uC7A5" : breakout ? "\uC800\uD56D \uB3CC\uD30C" : nearWhy;
  return {
    near, nearWhy,
    score: Math.round(Math.max(0, Math.min(100, sc))),
    setup: setups[0] || null, setupLabel,
    tags: tags.slice(0, 3),
    stats: {
      ma20: Math.round(f.ma20), rsi: Math.round(f.rsi),
      volRatio: Number(f.volRatio.toFixed(2)),
      mom20: Number((f.mom20 * 100).toFixed(1)),
      ext20: Number((f.ext20 * 100).toFixed(1)),
      squeeze: Number(f.squeeze.toFixed(2)),
      drawFromHi: Number((f.drawFromHi * 100).toFixed(1)),
      runUp: f.runUp, vol20: Number((f.vol20 * 100).toFixed(1)),
      turnoverEok: Math.round(f.turnover / 1e8),
      trendUp: f.upTrend,
      /* 다음 날 운용 기준 — 자리별로 다르게 준다 */
      entry: Math.round(pullback ? f.ma5 : f.last * 0.995),
      stop: Math.round(Math.min(f.ma20, f.last * (1 - Math.max(0.03, f.vol20 * 2)))),
      targetPct: Number((Math.max(3, Math.min(9, f.vol20 * 100 * 1.6)).toFixed(1)))
    }
  };
}
async function compute(budgetMs) {
  /* ══ [v9.71] 후보 뽑는 방식을 바꿨다 ═══════════════════════════════════════
     [예전] 거래대금 상위 55종만 일봉을 받아 점수를 매겼다. 급등은 거래대금
     상위권 밖에서 훨씬 자주 나오므로, 구조적으로 대부분을 놓치는 설계였다.
     게다가 종목당 1회씩 외부 호출이라 55회 — 워커 한 요청의 외부 호출 한도
     (50회, ★11)를 넘겨 뒷부분은 조용히 잘려 나갔다. 즉 실제로는 40종 남짓만
     보고 있었고, 그마저 전부 대형주였다.
     [지금] 두 단계로 나눈다.
       1차(공짜) : 유니버스 응답에 이미 들어 있는 값(가격·등락률·거래량·거래대금)
                   으로 1,200종 전체를 훑어 '볼 만한 자리'만 남긴다. 외부 호출 0회.
       2차(정밀) : 1차를 통과한 상위 38종만 일봉을 받아 정식 점수를 매긴다.
     유니버스 12회 + 정밀 38회 = 50회 안쪽으로 한도를 지킨다. */
  const deadline = Date.now() + budgetMs;
  const uni = await universe();
  if (uni.length < 100) return { ok: false, why: "\uC720\uB2C8\uBC84\uC2A4 \uBD80\uC871" };
  const uniN = uni.length;

  /* ── 1차: 값싼 선별 ── */
  const rough = uni.filter((s) => {
    if (!(s.price >= 1000)) return false;
    if (!(s.value >= 5e8)) return false;            // 당일 거래대금 5억 이상
    const r = Number(s.rate) || 0;
    if (r > 12) return false;                       // 이미 급등한 날은 다음 날 되돌림 확률이 높다
    if (r < -8) return false;                       // 급락 중인 종목도 제외
    return true;
  });
  /* 1차 순위 — 거래대금과 '적당한' 등락률을 함께 본다.
     크게 오른 종목이 아니라, 거래는 붙었는데 아직 크게 튀지 않은 종목을 위로. */
  rough.sort((a, b) => {
    const q = (x) => {
      const r = Number(x.rate) || 0;
      const rq = r >= -1 && r <= 5 ? 1.25 : r <= 8 ? 1.0 : 0.75;   // 과열 구간은 가중치 낮춤
      return Math.log10(Math.max(1, x.value)) * rq;
    };
    return q(b) - q(a);
  });
  /* ══ [v9.73] 외부호출 한도를 실측으로 맞춘다 ═══════════════════════════════
     Cloudflare Workers 는 한 요청이 만들 수 있는 외부호출(subrequest)이 50회다.
     지금 구성은 universe 12회 + 정밀조사 38회 = 정확히 50회 — 한도에 딱 붙어 있다.
     여기에 지수·환율 등 다른 호출이 하나라도 끼면 그 순간 뒷부분이 통째로
     실패하고, 그 실패는 catch 에 먹혀 '후보가 적은 날'처럼 조용히 넘어간다.
     여유분 8회를 남겨 30종으로 줄인다. 1차 선별을 거친 상위 30종이라
     실제 후보 품질에는 거의 영향이 없다. */
  const cand = rough.slice(0, 30);

  /* ── 2차: 일봉을 받아 정식 점수 ── */
  const scored = [];
  let i = 0, fetched = 0, failed = 0;
  const work = async () => {
    while (i < cand.length && Date.now() < deadline) {
      const s = cand[i++];
      let cs = null;
      fetched++;
      try { cs = await candles(s.code); } catch (e) { failed++; continue; }
      const sig = score(cs);                        // 자리가 아니면 null → 후보에서 빠진다
      if (sig && sig.score > 0) scored.push({ ...s, ...sig });
    }
  };
  await Promise.all(Array.from({ length: 12 }, work));
  scored.sort((a, b) => b.score - a.score);

  /* ── 시장 상황에 따라 문턱을 조절한다 ──
     하락장에서 억지로 추천을 채우면 적중률이 무너진다. 후보가 없으면 없다고 말한다. */
  const downN = uni.filter((c) => Number(c.rate) < 0).length;
  const breadth = uni.length ? downN / uni.length : 0.5;
  const weakMkt = breadth > 0.62;
  const minScore = weakMkt ? 62 : 55;
  const real = scored.filter((x) => !x.near);          // 자리에 든 종목만 '추천' 후보
  const nearList = scored.filter((x) => x.near);       // 근접 후보 — 표시만 한다
  let sel = real.filter((x) => x.score >= minScore);
  /* [v9.71] 예전에는 통과분이 적으면 점수순으로 8종을 억지로 채웠다.
     기준에 못 미치는 종목을 '추천'으로 올리는 것은 사용자를 속이는 일이다.
     모자라면 모자란 대로 내보내고, 왜 적은지 화면에 밝힌다. */
  const maxPick = weakMkt ? 5 : 8;
  sel = sel.slice(0, maxPick);

  /* [v9.71b] 추천이 없는 날에도 화면이 비지 않도록 근접 후보를 함께 보낸다.
     '추천'과 뒤섞지 않고 아래쪽에 따로, 무엇이 모자란지와 함께 표시한다. */
  const watch = (sel.length ? nearList : real.concat(nearList))
    .filter((x) => !sel.some((y) => y.code === x.code))
    .slice(0, 8).map((s) => ({
      code: s.code, name: s.name, market: s.market, price: s.price, rate: s.rate,
      score: s.score, why: s.near ? (s.nearWhy || "") : `\uC810\uC218 \uBBF8\uB2EC(${s.score}\uC810)`,
      stats: s.stats
    }));
  const tiers = scored.slice(0, 40).map((s) => ({
    code: s.code, name: s.name, price: s.price != null ? s.price : null,
    rate: +s.rate || 0, score: Math.round(+s.score || 0), setup: s.setupLabel || ""
  })).filter((x) => x.code && x.name);

  const picks = sel.map((s) => ({
    code: s.code, name: s.name, market: s.market, price: s.price, rate: s.rate,
    score: s.score, tags: s.tags, stats: s.stats,
    setup: s.setup, setupLabel: s.setupLabel
  }));
  return {
    ok: true,                                       // 후보가 0이어도 '정상 동작'이다
    picks, tiers, watch,
    scanned: scored.length,
    universe: uniN,
    roughN: rough.length,
    deep: cand.length,
    /* [v9.73] 실제 외부호출 수 — 한도(50)에 얼마나 가까운지 눈으로 확인한다 */
    subreq: { universe: 12, candles: fetched, total: 12 + fetched, limit: 50, failed },
    gate: { minScore, weakMkt, breadth: Number((breadth * 100).toFixed(0)), passed: sel.length }
  };
}
async function buildAndStore(store) {
  const now = KST();
  const { target } = await pickTarget(now, store);
  const targetYmd = ymd3(target);
  const res = await compute(9 * 60 * 1e3);
  if (!res.ok) return { ok: false, why: res.why };
  /* [v9.71] 적중률을 제대로 재려면 '언제 값을 쟀는지'가 기록돼야 한다.
     예전에는 이 정보가 없어 장중 스캔과 장 마감 후 스캔이 한 통계에 섞였다. */
  const scanHm = now.getUTCHours() * 60 + now.getUTCMinutes();
  const basisKind = scanHm >= 15 * 60 + 40 ? "close" : "intraday";
  const payload = {
    ok: true,
    tiers: res.tiers || [],
    targetDay: targetYmd,
    dayLabel: `${target.getMonth() + 1}\uC6D4 ${target.getDate()}\uC77C (${WD[target.getDay()]})`,
    isReopen: (target - now) / 864e5 > 1.3,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    note: NOTE,
    picks: res.picks,
    watch: res.watch || [],
    scanned: res.scanned,
    universe: res.universe,
    roughN: res.roughN, deep: res.deep,
    basisKind,                                  // [v9.71] 기준가가 '종가'인지 '장중가'인지
    basisYmd: ymd3(now),                        // 기준가를 잰 날짜
    gate: res.gate || null
  };
  if (store) {
    try {
      await store.setJSON("picks:" + targetYmd, payload);
    } catch {
    }
  }
  return payload;
}
var UA6, num, KST, ymd3, WD, avg, picks_default, NOTE, json3, config;
var init_picks = __esm({
  "netlify/functions/picks.js"() {
    init_store();
    init_nxt_core();
    init_market_calendar();
    UA6 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
    num = (v) => {
      const n = Number(String(v == null ? "" : v).replace(/[^0-9.-]/g, ""));
      return isFinite(n) ? n : 0;
    };
    KST = (d = /* @__PURE__ */ new Date()) => new Date(d.getTime() + (9 * 60 + d.getTimezoneOffset()) * 6e4);
    ymd3 = ymd2;
    WD = ["\uC77C", "\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08", "\uD1A0"];
    avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
    picks_default = async (req2) => {
      const url = new URL(req2.url);
      const force = url.searchParams.get("refresh") === "1";
      const store = await blobStore();
      const now = KST();
      const { target, isToday } = await pickTarget(now, store);
      const targetYmd = ymd3(target);
      const dayLabel = `${isToday ? "\uC624\uB298 \xB7 " : ""}${target.getMonth() + 1}\uC6D4 ${target.getDate()}\uC77C (${WD[target.getDay()]})`;
      const isReopen = !isToday && (target - now) / 864e5 > 1.3;
      const cacheKey = "picks:" + targetYmd;
      if (!force && store) {
        try {
          const c = await store.get(cacheKey, { type: "json" });
          if (c && c.picks && c.picks.length) {
            let acc = null;
            try {
              acc = await store.get("picks:accuracy", { type: "json" });
            } catch {
            }
            let accDays = null;
            if (acc && acc.scored) accDays = Object.entries(acc.scored).sort((a, b) => a[0] < b[0] ? 1 : -1).slice(0, 10).map(([d, v]) => ({ d, n: v.n, hit: v.hit, avgRet: v.avgRet }));
            return json3({ ...c, cached: true, accuracy: acc ? { hitRate: acc.hitRate, avgReturn: acc.avgReturn, samples: acc.total } : null, accDays });
          }
        } catch {
        }
      }
      const base3 = envGet("URL") || envGet("DEPLOY_PRIME_URL") || envGet("DEPLOY_URL") || "";
      let building = false;
      if (store) {
        try {
          const lock = await store.get("picks:lock", { type: "json" }).catch(() => null);
          building = !!(lock && Date.now() - lock.at < 5 * 60 * 1e3 && lock.day === targetYmd);
          if (!force && !building) {
            const fail = await store.get("picks:fail", { type: "json" }).catch(() => null);
            if (fail && fail.at && Date.now() - fail.at < 4 * 60 * 1e3)
              return json3({
                ok: false,
                building: false,
                targetDay: targetYmd,
                dayLabel,
                isReopen,
                picks: [],
                why: fail.why || "\uB370\uC774\uD130 \uC218\uC9D1 \uC2E4\uD328",
                note: NOTE
              }, "no-store");
          }
          if (!building) {
            await store.setJSON("picks:lock", { at: Date.now(), day: targetYmd });
            fetch(base3 + "/api/cronstep?job=picks", { method: "POST" }).catch(() => {
            });
            building = true;
          }
        } catch {
        }
      }
      if (!store) {
        const res = await compute(7e3);
        return json3({ ok: res.ok, targetDay: targetYmd, dayLabel, isReopen, picks: res.picks || [], note: NOTE }, "no-store");
      }
      if (url.searchParams.get("sync") === "1") {
        const res = await compute(6500);
        if (res.ok && res.picks && res.picks.length) {
          const payload = {
            ok: true,
            targetDay: targetYmd,
            dayLabel,
            isReopen,
            generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            note: NOTE,
            quick: true,
            picks: res.picks, tiers: res.tiers || [],
            scanned: res.scanned,
            universe: res.universe,
            gate: res.gate || null
          };
          if (store) {
            try {
              await store.setJSON(cacheKey, payload);
              await store.setJSON("picks:fail", { at: 0 });
            } catch {
            }
          }
          return json3(payload, "no-store");
        }
      }
      return json3({
        ok: false,
        building: true,
        targetDay: targetYmd,
        dayLabel,
        isReopen,
        picks: [],
        note: NOTE,
        message: "\uB2E4\uC74C \uAC1C\uC7A5\uC77C \uCD94\uCC9C\uC8FC\uB97C \uBD84\uC11D\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4. 20~40\uCD08 \uB4A4 \uC790\uB3D9\uC73C\uB85C \uD45C\uC2DC\uB429\uB2C8\uB2E4."
      }, "no-store");
    };
    NOTE = "\uC720\uB3D9\uC131 \uC0C1\uC704 \uC885\uBAA9\uC744 \uCD94\uC138\xB7\uC218\uAE09\xB7\uACFC\uC5F4 \uBC30\uC81C \uAE30\uC900\uC73C\uB85C \uC815\uBC00 \uC120\uBCC4\uD55C \uACB0\uACFC\uC785\uB2C8\uB2E4(\uBAA9\uD45C \uC801\uC911\uB960 70% \uC9C0\uD5A5 \xB7 \uC2DC\uC7A5 \uC0C1\uD669 \uB530\uB77C \uBCC0\uB3D9, \uC218\uC775 \uBCF4\uC7A5 \uC544\uB2D8). \uD22C\uC790 \uC790\uBB38\uC774 \uC544\uB2CC \uCC38\uACE0\uC6A9\uC785\uB2C8\uB2E4.";
    json3 = (o, cc = "public, s-maxage=120") => new Response(
      JSON.stringify(o),
      { headers: { "content-type": "application/json; charset=utf-8", "cache-control": cc } }
    );
    config = { path: "/api/picks" };
  }
});

// data/picks-accuracy.js
var picks_accuracy_exports = {};
__export(picks_accuracy_exports, {
  default: () => picks_accuracy_default,
  scoreAccuracy: () => scoreAccuracy
});
async function closeOn(code, dayYmd) {
  const end = dayYmd.replace(/-/g, "");
  const start = end;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 4e3);
    const r = await fetch(
      `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${start}&endTime=${end}&timeframe=day`,
      { headers: { "User-Agent": UA7, Referer: "https://finance.naver.com/" }, signal: c.signal }
    );
    const txt = await r.text();
    clearTimeout(t);
    const rows = JSON.parse(String(txt).trim().replace(/'/g, '"').replace(/,\s*]/g, "]"));
    const row = Array.isArray(rows) && rows.length > 1 ? rows[1] : null;
    return row ? num2(row[4]) : 0;
  } catch {
    return 0;
  }
}
/* ══════════════════════════════════════════════════════════════════════════
   [v9.71] 적중률 측정 전면 재작성 — 예전 숫자가 의미 없던 이유
   ─────────────────────────────────────────────────────────────────────────
   ① 재는 구간이 뒤죽박죽이었다.
      추천은 '내일 장'을 겨냥하는데, 장중(15:40 이전)에 만든 목록은 target 이
      '오늘'이라 오늘 종가와 비교됐다. 즉 어떤 날은 '몇 시간 수익률', 어떤 날은
      '하룻밤+하루 수익률'이 한 통계에 섞였다. 서로 다른 것을 평균 낸 값이라
      숫자 자체가 뜻을 갖지 못했다.
   ② 기준이 너무 헐거웠다. ret > 0 이면 무조건 적중. 아무 종목이나 찍어도
      절반은 오르므로, 50% 근처 숫자는 '맞혔다'는 증거가 되지 못한다.
   ③ 비교 대상이 없었다. 그날 시장이 2% 오른 날의 +1% 는 사실 부진한 결과다.

   새 방식
      · 기준가와 평가일을 기록에서 그대로 읽어, 같은 성격의 구간만 집계한다.
      · 세 가지를 함께 낸다 —
          목표달성률 : 종목별 목표수익(targetPct, 대개 +3~9%)에 도달했는가
          상승비율   : 그냥 올랐는가(참고용)
          초과성과   : 같은 기간 코스피 대비 얼마나 더/덜 올랐는가  ← 핵심 지표
      · 표본이 30건 미만이면 비율을 내지 않는다. 적은 표본의 비율은 착시다.
   ══════════════════════════════════════════════════════════════════════════ */
async function idxCloseOn(sym, dayYmd) {
  const d = dayYmd.replace(/-/g, "");
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 4e3);
    const r = await fetch(`https://api.finance.naver.com/siseJson.naver?symbol=${sym}&requestType=1&startTime=${d}&endTime=${d}&timeframe=day`,
      { headers: { "User-Agent": UA7, Referer: "https://finance.naver.com/" }, signal: c.signal });
    const txt = await r.text(); clearTimeout(t);
    const rows = JSON.parse(String(txt).trim().replace(/'/g, '"').replace(/,\s*]/g, "]"));
    const row = Array.isArray(rows) && rows.length > 1 ? rows[1] : null;
    return row ? num2(row[4]) : 0;
  } catch { return 0; }
}
async function scoreAccuracy(store) {
  if (!store) return null;
  let acc = null;
  try { acc = await store.get("picks:accuracy", { type: "json" }); } catch {}
  acc = acc || { v: 9, scored: {}, updatedAt: 0 };
  /* 방식이 바뀌었으므로 예전 집계는 버린다 — 섞이면 새 숫자도 오염된다 */
  if (acc.v !== 9) acc = { v: 9, scored: {}, updatedAt: 0 };

  const today = new Date();
  let budget = 22;                                  // 외부 호출 한도를 지킨다
  for (let back = 1; back <= 30 && budget > 0; back++) {
    const d = new Date(today); d.setDate(d.getDate() - back);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (acc.scored[day]) continue;
    let rec = null;
    try { rec = await store.get("picks:" + day, { type: "json" }); } catch { continue; }
    if (!rec || !rec.picks || !rec.picks.length) continue;
    /* [핵심] 장중에 만든 목록은 '내일 장' 추천이 아니다 — 집계에서 뺀다.
       그래야 같은 성격의 구간만 남는다. */
    if (rec.basisKind && rec.basisKind !== "close") { acc.scored[day] = { skip: "intraday" }; continue; }
    if (!rec.basisKind) { acc.scored[day] = { skip: "legacy" }; continue; }   // 기준 정보가 없는 옛 기록

    let n = 0, hitTarget = 0, hitUp = 0, sum = 0, sumEx = 0;
    /* 같은 구간의 코스피 수익률 — 초과성과 비교용 */
    const kPrev = await idxCloseOn("KOSPI", rec.basisYmd || day); budget--;
    const kNow = await idxCloseOn("KOSPI", day); budget--;
    const kRet = (kPrev > 0 && kNow > 0) ? (kNow - kPrev) / kPrev * 100 : null;
    for (const p of rec.picks.slice(0, 10)) {
      if (budget <= 0) break;
      const c = await closeOn(p.code, day); budget--;
      if (!c || !p.price) continue;
      const ret = (c - p.price) / p.price * 100;
      const tgt = (p.stats && p.stats.targetPct) || 5;
      n++; sum += ret;
      if (ret >= tgt) hitTarget++;
      if (ret > 0) hitUp++;
      if (kRet != null) sumEx += (ret - kRet);
    }
    if (!n) continue;
    acc.scored[day] = {
      n, hitTarget, hitUp,
      avgRet: Number((sum / n).toFixed(2)),
      kRet: kRet == null ? null : Number(kRet.toFixed(2)),
      excess: kRet == null ? null : Number((sumEx / n).toFixed(2))
    };
  }
  /* ── 합산 ── */
  let T = 0, HT = 0, HU = 0, SR = 0, SE = 0, EN = 0, days = 0;
  for (const k of Object.keys(acc.scored)) {
    const v = acc.scored[k]; if (!v || v.skip || !v.n) continue;
    days++; T += v.n; HT += v.hitTarget || 0; HU += v.hitUp || 0; SR += v.avgRet * v.n;
    if (v.excess != null) { SE += v.excess * v.n; EN += v.n; }
  }
  acc.updatedAt = Date.now();
  acc.total = T; acc.days = days;
  const ENOUGH = 30;                                 // 표본이 이보다 적으면 비율을 내지 않는다
  acc.enough = T >= ENOUGH;
  acc.targetRate = acc.enough ? Number((HT / T * 100).toFixed(1)) : null;
  acc.upRate = acc.enough ? Number((HU / T * 100).toFixed(1)) : null;
  acc.avgReturn = T ? Number((SR / T).toFixed(2)) : null;
  acc.excess = EN >= ENOUGH ? Number((SE / EN).toFixed(2)) : null;
  /* 예전 화면 호환 */
  acc.hitRate = acc.upRate;
  try { await store.setJSON("picks:accuracy", acc); } catch {}
  return acc;
}
var UA7, num2, picks_accuracy_default;
var init_picks_accuracy = __esm({
  "data/picks-accuracy.js"() {
    UA7 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
    num2 = (v) => {
      const n = Number(String(v == null ? "" : v).replace(/[^0-9.-]/g, ""));
      return isFinite(n) ? n : 0;
    };
    picks_accuracy_default = scoreAccuracy;
  }
});

// netlify/functions/_euckr.js
function decodeEucKr(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "", ascii = "";
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c < 128) {
      ascii += String.fromCharCode(c);
      continue;
    }
    if (ascii) {
      out += ascii;
      ascii = "";
    }
    const d = b[i + 1];
    if (c >= LEAD_LO && d !== void 0 && d >= TRAIL_LO && d <= 254) {
      out += T[(c - LEAD_LO) * SPAN + (d - TRAIL_LO)] || "\uFFFD";
      i++;
    } else out += "\uFFFD";
  }
  return out + ascii;
}
var T, LEAD_LO, TRAIL_LO, SPAN;
var init_euckr = __esm({
  "netlify/functions/_euckr.js"() {
    T = "\uAC02\uAC03\uAC05\uAC06\uAC0B\uAC0C\uAC0D\uAC0E\uAC0F\uAC18\uAC1E\uAC1F\uAC21\uAC22\uAC23\uAC25\uAC26\uAC27\uAC28\uAC29\uAC2A\uAC2B\uAC2E\uAC32\uAC33\uAC34\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uAC35\uAC36\uAC37\uAC3A\uAC3B\uAC3D\uAC3E\uAC3F\uAC41\uAC42\uAC43\uAC44\uAC45\uAC46\uAC47\uAC48\uAC49\uAC4A\uAC4C\uAC4E\uAC4F\uAC50\uAC51\uAC52\uAC53\uAC55\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uAC56\uAC57\uAC59\uAC5A\uAC5B\uAC5D\uAC5E\uAC5F\uAC60\uAC61\uAC62\uAC63\uAC64\uAC65\uAC66\uAC67\uAC68\uAC69\uAC6A\uAC6B\uAC6C\uAC6D\uAC6E\uAC6F\uAC72\uAC73\uAC75\uAC76\uAC79\uAC7B\uAC7C\uAC7D\uAC7E\uAC7F\uAC82\uAC87\uAC88\uAC8D\uAC8E\uAC8F\uAC91\uAC92\uAC93\uAC95\uAC96\uAC97\uAC98\uAC99\uAC9A\uAC9B\uAC9E\uACA2\uACA3\uACA4\uACA5\uACA6\uACA7\uACAB\uACAD\uACAE\uACB1\uACB2\uACB3\uACB4\uACB5\uACB6\uACB7\uACBA\uACBE\uACBF\uACC0\uACC2\uACC3\uACC5\uACC6\uACC7\uACC9\uACCA\uACCB\uACCD\uACCE\uACCF\uACD0\uACD1\uACD2\uACD3\uACD4\uACD6\uACD8\uACD9\uACDA\uACDB\uACDC\uACDD\uACDE\uACDF\uACE2\uACE3\uACE5\uACE6\uACE9\uACEB\uACED\uACEE\uACF2\uACF4\uACF7\uACF8\uACF9\uACFA\uACFB\uACFE\uACFF\uAD01\uAD02\uAD03\uAD05\uAD07\uAD08\uAD09\uAD0A\uAD0B\uAD0E\uAD10\uAD12\uAD13\uAD14\uAD15\uAD16\uAD17\uAD19\uAD1A\uAD1B\uAD1D\uAD1E\uAD1F\uAD21\uAD22\uAD23\uAD24\uAD25\uAD26\uAD27\uAD28\uAD2A\uAD2B\uAD2E\uAD2F\uAD30\uAD31\uAD32\uAD33\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uAD36\uAD37\uAD39\uAD3A\uAD3B\uAD3D\uAD3E\uAD3F\uAD40\uAD41\uAD42\uAD43\uAD46\uAD48\uAD4A\uAD4B\uAD4C\uAD4D\uAD4E\uAD4F\uAD51\uAD52\uAD53\uAD55\uAD56\uAD57\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uAD59\uAD5A\uAD5B\uAD5C\uAD5D\uAD5E\uAD5F\uAD60\uAD62\uAD64\uAD65\uAD66\uAD67\uAD68\uAD69\uAD6A\uAD6B\uAD6E\uAD6F\uAD71\uAD72\uAD77\uAD78\uAD79\uAD7A\uAD7E\uAD80\uAD83\uAD84\uAD85\uAD86\uAD87\uAD8A\uAD8B\uAD8D\uAD8E\uAD8F\uAD91\uAD92\uAD93\uAD94\uAD95\uAD96\uAD97\uAD98\uAD99\uAD9A\uAD9B\uAD9E\uAD9F\uADA0\uADA1\uADA2\uADA3\uADA5\uADA6\uADA7\uADA8\uADA9\uADAA\uADAB\uADAC\uADAD\uADAE\uADAF\uADB0\uADB1\uADB2\uADB3\uADB4\uADB5\uADB6\uADB8\uADB9\uADBA\uADBB\uADBC\uADBD\uADBE\uADBF\uADC2\uADC3\uADC5\uADC6\uADC7\uADC9\uADCA\uADCB\uADCC\uADCD\uADCE\uADCF\uADD2\uADD4\uADD5\uADD6\uADD7\uADD8\uADD9\uADDA\uADDB\uADDD\uADDE\uADDF\uADE1\uADE2\uADE3\uADE5\uADE6\uADE7\uADE8\uADE9\uADEA\uADEB\uADEC\uADED\uADEE\uADEF\uADF0\uADF1\uADF2\uADF3\uADF4\uADF5\uADF6\uADF7\uADFA\uADFB\uADFD\uADFE\uAE02\uAE03\uAE04\uAE05\uAE06\uAE07\uAE0A\uAE0C\uAE0E\uAE0F\uAE10\uAE11\uAE12\uAE13\uAE15\uAE16\uAE17\uAE18\uAE19\uAE1A\uAE1B\uAE1C\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uAE1D\uAE1E\uAE1F\uAE20\uAE21\uAE22\uAE23\uAE24\uAE25\uAE26\uAE27\uAE28\uAE29\uAE2A\uAE2B\uAE2C\uAE2D\uAE2E\uAE2F\uAE32\uAE33\uAE35\uAE36\uAE39\uAE3B\uAE3C\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uAE3D\uAE3E\uAE3F\uAE42\uAE44\uAE47\uAE48\uAE49\uAE4B\uAE4F\uAE51\uAE52\uAE53\uAE55\uAE57\uAE58\uAE59\uAE5A\uAE5B\uAE5E\uAE62\uAE63\uAE64\uAE66\uAE67\uAE6A\uAE6B\uAE6D\uAE6E\uAE6F\uAE71\uAE72\uAE73\uAE74\uAE75\uAE76\uAE77\uAE7A\uAE7E\uAE7F\uAE80\uAE81\uAE82\uAE83\uAE86\uAE87\uAE88\uAE89\uAE8A\uAE8B\uAE8D\uAE8E\uAE8F\uAE90\uAE91\uAE92\uAE93\uAE94\uAE95\uAE96\uAE97\uAE98\uAE99\uAE9A\uAE9B\uAE9C\uAE9D\uAE9E\uAE9F\uAEA0\uAEA1\uAEA2\uAEA3\uAEA4\uAEA5\uAEA6\uAEA7\uAEA8\uAEA9\uAEAA\uAEAB\uAEAC\uAEAD\uAEAE\uAEAF\uAEB0\uAEB1\uAEB2\uAEB3\uAEB4\uAEB5\uAEB6\uAEB7\uAEB8\uAEB9\uAEBA\uAEBB\uAEBF\uAEC1\uAEC2\uAEC3\uAEC5\uAEC6\uAEC7\uAEC8\uAEC9\uAECA\uAECB\uAECE\uAED2\uAED3\uAED4\uAED5\uAED6\uAED7\uAEDA\uAEDB\uAEDD\uAEDE\uAEDF\uAEE0\uAEE1\uAEE2\uAEE3\uAEE4\uAEE5\uAEE6\uAEE7\uAEE9\uAEEA\uAEEC\uAEEE\uAEEF\uAEF0\uAEF1\uAEF2\uAEF3\uAEF5\uAEF6\uAEF7\uAEF9\uAEFA\uAEFB\uAEFD\uAEFE\uAEFF\uAF00\uAF01\uAF02\uAF03\uAF04\uAF05\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uAF06\uAF09\uAF0A\uAF0B\uAF0C\uAF0E\uAF0F\uAF11\uAF12\uAF13\uAF14\uAF15\uAF16\uAF17\uAF18\uAF19\uAF1A\uAF1B\uAF1C\uAF1D\uAF1E\uAF1F\uAF20\uAF21\uAF22\uAF23\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uAF24\uAF25\uAF26\uAF27\uAF28\uAF29\uAF2A\uAF2B\uAF2E\uAF2F\uAF31\uAF33\uAF35\uAF36\uAF37\uAF38\uAF39\uAF3A\uAF3B\uAF3E\uAF40\uAF44\uAF45\uAF46\uAF47\uAF4A\uAF4B\uAF4C\uAF4D\uAF4E\uAF4F\uAF51\uAF52\uAF53\uAF54\uAF55\uAF56\uAF57\uAF58\uAF59\uAF5A\uAF5B\uAF5E\uAF5F\uAF60\uAF61\uAF62\uAF63\uAF66\uAF67\uAF68\uAF69\uAF6A\uAF6B\uAF6C\uAF6D\uAF6E\uAF6F\uAF70\uAF71\uAF72\uAF73\uAF74\uAF75\uAF76\uAF77\uAF78\uAF7A\uAF7B\uAF7C\uAF7D\uAF7E\uAF7F\uAF81\uAF82\uAF83\uAF85\uAF86\uAF87\uAF89\uAF8A\uAF8B\uAF8C\uAF8D\uAF8E\uAF8F\uAF92\uAF93\uAF94\uAF96\uAF97\uAF98\uAF99\uAF9A\uAF9B\uAF9D\uAF9E\uAF9F\uAFA0\uAFA1\uAFA2\uAFA3\uAFA4\uAFA5\uAFA6\uAFA7\uAFA8\uAFA9\uAFAA\uAFAB\uAFAC\uAFAD\uAFAE\uAFAF\uAFB0\uAFB1\uAFB2\uAFB3\uAFB4\uAFB5\uAFB6\uAFB7\uAFBA\uAFBB\uAFBD\uAFBE\uAFBF\uAFC1\uAFC2\uAFC3\uAFC4\uAFC5\uAFC6\uAFCA\uAFCC\uAFCF\uAFD0\uAFD1\uAFD2\uAFD3\uAFD5\uAFD6\uAFD7\uAFD8\uAFD9\uAFDA\uAFDB\uAFDD\uAFDE\uAFDF\uAFE0\uAFE1\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uAFE2\uAFE3\uAFE4\uAFE5\uAFE6\uAFE7\uAFEA\uAFEB\uAFEC\uAFED\uAFEE\uAFEF\uAFF2\uAFF3\uAFF5\uAFF6\uAFF7\uAFF9\uAFFA\uAFFB\uAFFC\uAFFD\uAFFE\uAFFF\uB002\uB003\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB005\uB006\uB007\uB008\uB009\uB00A\uB00B\uB00D\uB00E\uB00F\uB011\uB012\uB013\uB015\uB016\uB017\uB018\uB019\uB01A\uB01B\uB01E\uB01F\uB020\uB021\uB022\uB023\uB024\uB025\uB026\uB027\uB029\uB02A\uB02B\uB02C\uB02D\uB02E\uB02F\uB030\uB031\uB032\uB033\uB034\uB035\uB036\uB037\uB038\uB039\uB03A\uB03B\uB03C\uB03D\uB03E\uB03F\uB040\uB041\uB042\uB043\uB046\uB047\uB049\uB04B\uB04D\uB04F\uB050\uB051\uB052\uB056\uB058\uB05A\uB05B\uB05C\uB05E\uB05F\uB060\uB061\uB062\uB063\uB064\uB065\uB066\uB067\uB068\uB069\uB06A\uB06B\uB06C\uB06D\uB06E\uB06F\uB070\uB071\uB072\uB073\uB074\uB075\uB076\uB077\uB078\uB079\uB07A\uB07B\uB07E\uB07F\uB081\uB082\uB083\uB085\uB086\uB087\uB088\uB089\uB08A\uB08B\uB08E\uB090\uB092\uB093\uB094\uB095\uB096\uB097\uB09B\uB09D\uB09E\uB0A3\uB0A4\uB0A5\uB0A6\uB0A7\uB0AA\uB0B0\uB0B2\uB0B6\uB0B7\uB0B9\uB0BA\uB0BB\uB0BD\uB0BE\uB0BF\uB0C0\uB0C1\uB0C2\uB0C3\uB0C6\uB0CA\uB0CB\uB0CC\uB0CD\uB0CE\uB0CF\uB0D2\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB0D3\uB0D5\uB0D6\uB0D7\uB0D9\uB0DA\uB0DB\uB0DC\uB0DD\uB0DE\uB0DF\uB0E1\uB0E2\uB0E3\uB0E4\uB0E6\uB0E7\uB0E8\uB0E9\uB0EA\uB0EB\uB0EC\uB0ED\uB0EE\uB0EF\uB0F0\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB0F1\uB0F2\uB0F3\uB0F4\uB0F5\uB0F6\uB0F7\uB0F8\uB0F9\uB0FA\uB0FB\uB0FC\uB0FD\uB0FE\uB0FF\uB100\uB101\uB102\uB103\uB104\uB105\uB106\uB107\uB10A\uB10D\uB10E\uB10F\uB111\uB114\uB115\uB116\uB117\uB11A\uB11E\uB11F\uB120\uB121\uB122\uB126\uB127\uB129\uB12A\uB12B\uB12D\uB12E\uB12F\uB130\uB131\uB132\uB133\uB136\uB13A\uB13B\uB13C\uB13D\uB13E\uB13F\uB142\uB143\uB145\uB146\uB147\uB149\uB14A\uB14B\uB14C\uB14D\uB14E\uB14F\uB152\uB153\uB156\uB157\uB159\uB15A\uB15B\uB15D\uB15E\uB15F\uB161\uB162\uB163\uB164\uB165\uB166\uB167\uB168\uB169\uB16A\uB16B\uB16C\uB16D\uB16E\uB16F\uB170\uB171\uB172\uB173\uB174\uB175\uB176\uB177\uB17A\uB17B\uB17D\uB17E\uB17F\uB181\uB183\uB184\uB185\uB186\uB187\uB18A\uB18C\uB18E\uB18F\uB190\uB191\uB195\uB196\uB197\uB199\uB19A\uB19B\uB19D\uB19E\uB19F\uB1A0\uB1A1\uB1A2\uB1A3\uB1A4\uB1A5\uB1A6\uB1A7\uB1A9\uB1AA\uB1AB\uB1AC\uB1AD\uB1AE\uB1AF\uB1B0\uB1B1\uB1B2\uB1B3\uB1B4\uB1B5\uB1B6\uB1B7\uB1B8\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB1B9\uB1BA\uB1BB\uB1BC\uB1BD\uB1BE\uB1BF\uB1C0\uB1C1\uB1C2\uB1C3\uB1C4\uB1C5\uB1C6\uB1C7\uB1C8\uB1C9\uB1CA\uB1CB\uB1CD\uB1CE\uB1CF\uB1D1\uB1D2\uB1D3\uB1D5\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB1D6\uB1D7\uB1D8\uB1D9\uB1DA\uB1DB\uB1DE\uB1E0\uB1E1\uB1E2\uB1E3\uB1E4\uB1E5\uB1E6\uB1E7\uB1EA\uB1EB\uB1ED\uB1EE\uB1EF\uB1F1\uB1F2\uB1F3\uB1F4\uB1F5\uB1F6\uB1F7\uB1F8\uB1FA\uB1FC\uB1FE\uB1FF\uB200\uB201\uB202\uB203\uB206\uB207\uB209\uB20A\uB20D\uB20E\uB20F\uB210\uB211\uB212\uB213\uB216\uB218\uB21A\uB21B\uB21C\uB21D\uB21E\uB21F\uB221\uB222\uB223\uB224\uB225\uB226\uB227\uB228\uB229\uB22A\uB22B\uB22C\uB22D\uB22E\uB22F\uB230\uB231\uB232\uB233\uB235\uB236\uB237\uB238\uB239\uB23A\uB23B\uB23D\uB23E\uB23F\uB240\uB241\uB242\uB243\uB244\uB245\uB246\uB247\uB248\uB249\uB24A\uB24B\uB24C\uB24D\uB24E\uB24F\uB250\uB251\uB252\uB253\uB254\uB255\uB256\uB257\uB259\uB25A\uB25B\uB25D\uB25E\uB25F\uB261\uB262\uB263\uB264\uB265\uB266\uB267\uB26A\uB26B\uB26C\uB26D\uB26E\uB26F\uB270\uB271\uB272\uB273\uB276\uB277\uB278\uB279\uB27A\uB27B\uB27D\uB27E\uB27F\uB280\uB281\uB282\uB283\uB286\uB287\uB288\uB28A\uB28B\uB28C\uB28D\uB28E\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB28F\uB292\uB293\uB295\uB296\uB297\uB29B\uB29C\uB29D\uB29E\uB29F\uB2A2\uB2A4\uB2A7\uB2A8\uB2A9\uB2AB\uB2AD\uB2AE\uB2AF\uB2B1\uB2B2\uB2B3\uB2B5\uB2B6\uB2B7\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB2B8\uB2B9\uB2BA\uB2BB\uB2BC\uB2BD\uB2BE\uB2BF\uB2C0\uB2C1\uB2C2\uB2C3\uB2C4\uB2C5\uB2C6\uB2C7\uB2CA\uB2CB\uB2CD\uB2CE\uB2CF\uB2D1\uB2D3\uB2D4\uB2D5\uB2D6\uB2D7\uB2DA\uB2DC\uB2DE\uB2DF\uB2E0\uB2E1\uB2E3\uB2E7\uB2E9\uB2EA\uB2F0\uB2F1\uB2F2\uB2F6\uB2FC\uB2FD\uB2FE\uB302\uB303\uB305\uB306\uB307\uB309\uB30A\uB30B\uB30C\uB30D\uB30E\uB30F\uB312\uB316\uB317\uB318\uB319\uB31A\uB31B\uB31D\uB31E\uB31F\uB320\uB321\uB322\uB323\uB324\uB325\uB326\uB327\uB328\uB329\uB32A\uB32B\uB32C\uB32D\uB32E\uB32F\uB330\uB331\uB332\uB333\uB334\uB335\uB336\uB337\uB338\uB339\uB33A\uB33B\uB33C\uB33D\uB33E\uB33F\uB340\uB341\uB342\uB343\uB344\uB345\uB346\uB347\uB348\uB349\uB34A\uB34B\uB34C\uB34D\uB34E\uB34F\uB350\uB351\uB352\uB353\uB357\uB359\uB35A\uB35D\uB360\uB361\uB362\uB363\uB366\uB368\uB36A\uB36C\uB36D\uB36F\uB372\uB373\uB375\uB376\uB377\uB379\uB37A\uB37B\uB37C\uB37D\uB37E\uB37F\uB382\uB386\uB387\uB388\uB389\uB38A\uB38B\uB38D\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB38E\uB38F\uB391\uB392\uB393\uB395\uB396\uB397\uB398\uB399\uB39A\uB39B\uB39C\uB39D\uB39E\uB39F\uB3A2\uB3A3\uB3A4\uB3A5\uB3A6\uB3A7\uB3A9\uB3AA\uB3AB\uB3AD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB3AE\uB3AF\uB3B0\uB3B1\uB3B2\uB3B3\uB3B4\uB3B5\uB3B6\uB3B7\uB3B8\uB3B9\uB3BA\uB3BB\uB3BC\uB3BD\uB3BE\uB3BF\uB3C0\uB3C1\uB3C2\uB3C3\uB3C6\uB3C7\uB3C9\uB3CA\uB3CD\uB3CF\uB3D1\uB3D2\uB3D3\uB3D6\uB3D8\uB3DA\uB3DC\uB3DE\uB3DF\uB3E1\uB3E2\uB3E3\uB3E5\uB3E6\uB3E7\uB3E9\uB3EA\uB3EB\uB3EC\uB3ED\uB3EE\uB3EF\uB3F0\uB3F1\uB3F2\uB3F3\uB3F4\uB3F5\uB3F6\uB3F7\uB3F8\uB3F9\uB3FA\uB3FB\uB3FD\uB3FE\uB3FF\uB400\uB401\uB402\uB403\uB404\uB405\uB406\uB407\uB408\uB409\uB40A\uB40B\uB40C\uB40D\uB40E\uB40F\uB411\uB412\uB413\uB414\uB415\uB416\uB417\uB419\uB41A\uB41B\uB41D\uB41E\uB41F\uB421\uB422\uB423\uB424\uB425\uB426\uB427\uB42A\uB42C\uB42D\uB42E\uB42F\uB430\uB431\uB432\uB433\uB435\uB436\uB437\uB438\uB439\uB43A\uB43B\uB43C\uB43D\uB43E\uB43F\uB440\uB441\uB442\uB443\uB444\uB445\uB446\uB447\uB448\uB449\uB44A\uB44B\uB44C\uB44D\uB44E\uB44F\uB452\uB453\uB455\uB456\uB457\uB459\uB45A\uB45B\uB45C\uB45D\uB45E\uB45F\uB462\uB464\uB466\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB467\uB468\uB469\uB46A\uB46B\uB46D\uB46E\uB46F\uB470\uB471\uB472\uB473\uB474\uB475\uB476\uB477\uB478\uB479\uB47A\uB47B\uB47C\uB47D\uB47E\uB47F\uB481\uB482\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB483\uB484\uB485\uB486\uB487\uB489\uB48A\uB48B\uB48C\uB48D\uB48E\uB48F\uB490\uB491\uB492\uB493\uB494\uB495\uB496\uB497\uB498\uB499\uB49A\uB49B\uB49C\uB49E\uB49F\uB4A0\uB4A1\uB4A2\uB4A3\uB4A5\uB4A6\uB4A7\uB4A9\uB4AA\uB4AB\uB4AD\uB4AE\uB4AF\uB4B0\uB4B1\uB4B2\uB4B3\uB4B4\uB4B6\uB4B8\uB4BA\uB4BB\uB4BC\uB4BD\uB4BE\uB4BF\uB4C1\uB4C2\uB4C3\uB4C5\uB4C6\uB4C7\uB4C9\uB4CA\uB4CB\uB4CC\uB4CD\uB4CE\uB4CF\uB4D1\uB4D2\uB4D3\uB4D4\uB4D6\uB4D7\uB4D8\uB4D9\uB4DA\uB4DB\uB4DE\uB4DF\uB4E1\uB4E2\uB4E5\uB4E7\uB4E8\uB4E9\uB4EA\uB4EB\uB4EE\uB4F0\uB4F2\uB4F3\uB4F4\uB4F5\uB4F6\uB4F7\uB4F9\uB4FA\uB4FB\uB4FC\uB4FD\uB4FE\uB4FF\uB500\uB501\uB502\uB503\uB504\uB505\uB506\uB507\uB508\uB509\uB50A\uB50B\uB50C\uB50D\uB50E\uB50F\uB510\uB511\uB512\uB513\uB516\uB517\uB519\uB51A\uB51D\uB51E\uB51F\uB520\uB521\uB522\uB523\uB526\uB52B\uB52C\uB52D\uB52E\uB52F\uB532\uB533\uB535\uB536\uB537\uB539\uB53A\uB53B\uB53C\uB53D\uB53E\uB53F\uB542\uB546\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB547\uB548\uB549\uB54A\uB54E\uB54F\uB551\uB552\uB553\uB555\uB556\uB557\uB558\uB559\uB55A\uB55B\uB55E\uB562\uB563\uB564\uB565\uB566\uB567\uB568\uB569\uB56A\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB56B\uB56C\uB56D\uB56E\uB56F\uB570\uB571\uB572\uB573\uB574\uB575\uB576\uB577\uB578\uB579\uB57A\uB57B\uB57C\uB57D\uB57E\uB57F\uB580\uB581\uB582\uB583\uB584\uB585\uB586\uB587\uB588\uB589\uB58A\uB58B\uB58C\uB58D\uB58E\uB58F\uB590\uB591\uB592\uB593\uB594\uB595\uB596\uB597\uB598\uB599\uB59A\uB59B\uB59C\uB59D\uB59E\uB59F\uB5A2\uB5A3\uB5A5\uB5A6\uB5A7\uB5A9\uB5AC\uB5AD\uB5AE\uB5AF\uB5B2\uB5B6\uB5B7\uB5B8\uB5B9\uB5BA\uB5BE\uB5BF\uB5C1\uB5C2\uB5C3\uB5C5\uB5C6\uB5C7\uB5C8\uB5C9\uB5CA\uB5CB\uB5CE\uB5D2\uB5D3\uB5D4\uB5D5\uB5D6\uB5D7\uB5D9\uB5DA\uB5DB\uB5DC\uB5DD\uB5DE\uB5DF\uB5E0\uB5E1\uB5E2\uB5E3\uB5E4\uB5E5\uB5E6\uB5E7\uB5E8\uB5E9\uB5EA\uB5EB\uB5ED\uB5EE\uB5EF\uB5F0\uB5F1\uB5F2\uB5F3\uB5F4\uB5F5\uB5F6\uB5F7\uB5F8\uB5F9\uB5FA\uB5FB\uB5FC\uB5FD\uB5FE\uB5FF\uB600\uB601\uB602\uB603\uB604\uB605\uB606\uB607\uB608\uB609\uB60A\uB60B\uB60C\uB60D\uB60E\uB60F\uB612\uB613\uB615\uB616\uB617\uB619\uB61A\uB61B\uB61C\uB61D\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB61E\uB61F\uB620\uB621\uB622\uB623\uB624\uB626\uB627\uB628\uB629\uB62A\uB62B\uB62D\uB62E\uB62F\uB630\uB631\uB632\uB633\uB635\uB636\uB637\uB638\uB639\uB63A\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB63B\uB63C\uB63D\uB63E\uB63F\uB640\uB641\uB642\uB643\uB644\uB645\uB646\uB647\uB649\uB64A\uB64B\uB64C\uB64D\uB64E\uB64F\uB650\uB651\uB652\uB653\uB654\uB655\uB656\uB657\uB658\uB659\uB65A\uB65B\uB65C\uB65D\uB65E\uB65F\uB660\uB661\uB662\uB663\uB665\uB666\uB667\uB669\uB66A\uB66B\uB66C\uB66D\uB66E\uB66F\uB670\uB671\uB672\uB673\uB674\uB675\uB676\uB677\uB678\uB679\uB67A\uB67B\uB67C\uB67D\uB67E\uB67F\uB680\uB681\uB682\uB683\uB684\uB685\uB686\uB687\uB688\uB689\uB68A\uB68B\uB68C\uB68D\uB68E\uB68F\uB690\uB691\uB692\uB693\uB694\uB695\uB696\uB697\uB698\uB699\uB69A\uB69B\uB69E\uB69F\uB6A1\uB6A2\uB6A3\uB6A5\uB6A6\uB6A7\uB6A8\uB6A9\uB6AA\uB6AD\uB6AE\uB6AF\uB6B0\uB6B2\uB6B3\uB6B4\uB6B5\uB6B6\uB6B7\uB6B8\uB6B9\uB6BA\uB6BB\uB6BC\uB6BD\uB6BE\uB6BF\uB6C0\uB6C1\uB6C2\uB6C3\uB6C4\uB6C5\uB6C6\uB6C7\uB6C8\uB6C9\uB6CA\uB6CB\uB6CC\uB6CD\uB6CE\uB6CF\uB6D0\uB6D1\uB6D2\uB6D3\uB6D5\uB6D6\uB6D7\uB6D8\uB6D9\uB6DA\uB6DB\uB6DC\uB6DD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB6DE\uB6DF\uB6E0\uB6E1\uB6E2\uB6E3\uB6E4\uB6E5\uB6E6\uB6E7\uB6E8\uB6E9\uB6EA\uB6EB\uB6EC\uB6ED\uB6EE\uB6EF\uB6F1\uB6F2\uB6F3\uB6F5\uB6F6\uB6F7\uB6F9\uB6FA\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB6FB\uB6FC\uB6FD\uB6FE\uB6FF\uB702\uB703\uB704\uB706\uB707\uB708\uB709\uB70A\uB70B\uB70C\uB70D\uB70E\uB70F\uB710\uB711\uB712\uB713\uB714\uB715\uB716\uB717\uB718\uB719\uB71A\uB71B\uB71C\uB71D\uB71E\uB71F\uB720\uB721\uB722\uB723\uB724\uB725\uB726\uB727\uB72A\uB72B\uB72D\uB72E\uB731\uB732\uB733\uB734\uB735\uB736\uB737\uB73A\uB73C\uB73D\uB73E\uB73F\uB740\uB741\uB742\uB743\uB745\uB746\uB747\uB749\uB74A\uB74B\uB74D\uB74E\uB74F\uB750\uB751\uB752\uB753\uB756\uB757\uB758\uB759\uB75A\uB75B\uB75C\uB75D\uB75E\uB75F\uB761\uB762\uB763\uB765\uB766\uB767\uB769\uB76A\uB76B\uB76C\uB76D\uB76E\uB76F\uB772\uB774\uB776\uB777\uB778\uB779\uB77A\uB77B\uB77E\uB77F\uB781\uB782\uB783\uB785\uB786\uB787\uB788\uB789\uB78A\uB78B\uB78E\uB793\uB794\uB795\uB79A\uB79B\uB79D\uB79E\uB79F\uB7A1\uB7A2\uB7A3\uB7A4\uB7A5\uB7A6\uB7A7\uB7AA\uB7AE\uB7AF\uB7B0\uB7B1\uB7B2\uB7B3\uB7B6\uB7B7\uB7B9\uB7BA\uB7BB\uB7BC\uB7BD\uB7BE\uB7BF\uB7C0\uB7C1\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB7C2\uB7C3\uB7C4\uB7C5\uB7C6\uB7C8\uB7CA\uB7CB\uB7CC\uB7CD\uB7CE\uB7CF\uB7D0\uB7D1\uB7D2\uB7D3\uB7D4\uB7D5\uB7D6\uB7D7\uB7D8\uB7D9\uB7DA\uB7DB\uB7DC\uB7DD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB7DE\uB7DF\uB7E0\uB7E1\uB7E2\uB7E3\uB7E4\uB7E5\uB7E6\uB7E7\uB7E8\uB7E9\uB7EA\uB7EB\uB7EE\uB7EF\uB7F1\uB7F2\uB7F3\uB7F5\uB7F6\uB7F7\uB7F8\uB7F9\uB7FA\uB7FB\uB7FE\uB802\uB803\uB804\uB805\uB806\uB80A\uB80B\uB80D\uB80E\uB80F\uB811\uB812\uB813\uB814\uB815\uB816\uB817\uB81A\uB81C\uB81E\uB81F\uB820\uB821\uB822\uB823\uB826\uB827\uB829\uB82A\uB82B\uB82D\uB82E\uB82F\uB830\uB831\uB832\uB833\uB836\uB83A\uB83B\uB83C\uB83D\uB83E\uB83F\uB841\uB842\uB843\uB845\uB846\uB847\uB848\uB849\uB84A\uB84B\uB84C\uB84D\uB84E\uB84F\uB850\uB852\uB854\uB855\uB856\uB857\uB858\uB859\uB85A\uB85B\uB85E\uB85F\uB861\uB862\uB863\uB865\uB866\uB867\uB868\uB869\uB86A\uB86B\uB86E\uB870\uB872\uB873\uB874\uB875\uB876\uB877\uB879\uB87A\uB87B\uB87D\uB87E\uB87F\uB880\uB881\uB882\uB883\uB884\uB885\uB886\uB887\uB888\uB889\uB88A\uB88B\uB88C\uB88E\uB88F\uB890\uB891\uB892\uB893\uB894\uB895\uB896\uB897\uB898\uB899\uB89A\uB89B\uB89C\uB89D\uB89E\uB89F\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB8A0\uB8A1\uB8A2\uB8A3\uB8A4\uB8A5\uB8A6\uB8A7\uB8A9\uB8AA\uB8AB\uB8AC\uB8AD\uB8AE\uB8AF\uB8B1\uB8B2\uB8B3\uB8B5\uB8B6\uB8B7\uB8B9\uB8BA\uB8BB\uB8BC\uB8BD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB8BE\uB8BF\uB8C2\uB8C4\uB8C6\uB8C7\uB8C8\uB8C9\uB8CA\uB8CB\uB8CD\uB8CE\uB8CF\uB8D1\uB8D2\uB8D3\uB8D5\uB8D6\uB8D7\uB8D8\uB8D9\uB8DA\uB8DB\uB8DC\uB8DE\uB8E0\uB8E2\uB8E3\uB8E4\uB8E5\uB8E6\uB8E7\uB8EA\uB8EB\uB8ED\uB8EE\uB8EF\uB8F1\uB8F2\uB8F3\uB8F4\uB8F5\uB8F6\uB8F7\uB8FA\uB8FC\uB8FE\uB8FF\uB900\uB901\uB902\uB903\uB905\uB906\uB907\uB908\uB909\uB90A\uB90B\uB90C\uB90D\uB90E\uB90F\uB910\uB911\uB912\uB913\uB914\uB915\uB916\uB917\uB919\uB91A\uB91B\uB91C\uB91D\uB91E\uB91F\uB921\uB922\uB923\uB924\uB925\uB926\uB927\uB928\uB929\uB92A\uB92B\uB92C\uB92D\uB92E\uB92F\uB930\uB931\uB932\uB933\uB934\uB935\uB936\uB937\uB938\uB939\uB93A\uB93B\uB93E\uB93F\uB941\uB942\uB943\uB945\uB946\uB947\uB948\uB949\uB94A\uB94B\uB94D\uB94E\uB950\uB952\uB953\uB954\uB955\uB956\uB957\uB95A\uB95B\uB95D\uB95E\uB95F\uB961\uB962\uB963\uB964\uB965\uB966\uB967\uB96A\uB96C\uB96E\uB96F\uB970\uB971\uB972\uB973\uB976\uB977\uB979\uB97A\uB97B\uB97D\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB97E\uB97F\uB980\uB981\uB982\uB983\uB986\uB988\uB98B\uB98C\uB98F\uB990\uB991\uB992\uB993\uB994\uB995\uB996\uB997\uB998\uB999\uB99A\uB99B\uB99C\uB99D\uB99E\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uB99F\uB9A0\uB9A1\uB9A2\uB9A3\uB9A4\uB9A5\uB9A6\uB9A7\uB9A8\uB9A9\uB9AA\uB9AB\uB9AE\uB9AF\uB9B1\uB9B2\uB9B3\uB9B5\uB9B6\uB9B7\uB9B8\uB9B9\uB9BA\uB9BB\uB9BE\uB9C0\uB9C2\uB9C3\uB9C4\uB9C5\uB9C6\uB9C7\uB9CA\uB9CB\uB9CD\uB9D3\uB9D4\uB9D5\uB9D6\uB9D7\uB9DA\uB9DC\uB9DF\uB9E0\uB9E2\uB9E6\uB9E7\uB9E9\uB9EA\uB9EB\uB9ED\uB9EE\uB9EF\uB9F0\uB9F1\uB9F2\uB9F3\uB9F6\uB9FB\uB9FC\uB9FD\uB9FE\uB9FF\uBA02\uBA03\uBA04\uBA05\uBA06\uBA07\uBA09\uBA0A\uBA0B\uBA0C\uBA0D\uBA0E\uBA0F\uBA10\uBA11\uBA12\uBA13\uBA14\uBA16\uBA17\uBA18\uBA19\uBA1A\uBA1B\uBA1C\uBA1D\uBA1E\uBA1F\uBA20\uBA21\uBA22\uBA23\uBA24\uBA25\uBA26\uBA27\uBA28\uBA29\uBA2A\uBA2B\uBA2C\uBA2D\uBA2E\uBA2F\uBA30\uBA31\uBA32\uBA33\uBA34\uBA35\uBA36\uBA37\uBA3A\uBA3B\uBA3D\uBA3E\uBA3F\uBA41\uBA43\uBA44\uBA45\uBA46\uBA47\uBA4A\uBA4C\uBA4F\uBA50\uBA51\uBA52\uBA56\uBA57\uBA59\uBA5A\uBA5B\uBA5D\uBA5E\uBA5F\uBA60\uBA61\uBA62\uBA63\uBA66\uBA6A\uBA6B\uBA6C\uBA6D\uBA6E\uBA6F\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBA72\uBA73\uBA75\uBA76\uBA77\uBA79\uBA7A\uBA7B\uBA7C\uBA7D\uBA7E\uBA7F\uBA80\uBA81\uBA82\uBA86\uBA88\uBA89\uBA8A\uBA8B\uBA8D\uBA8E\uBA8F\uBA90\uBA91\uBA92\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBA93\uBA94\uBA95\uBA96\uBA97\uBA98\uBA99\uBA9A\uBA9B\uBA9C\uBA9D\uBA9E\uBA9F\uBAA0\uBAA1\uBAA2\uBAA3\uBAA4\uBAA5\uBAA6\uBAA7\uBAAA\uBAAD\uBAAE\uBAAF\uBAB1\uBAB3\uBAB4\uBAB5\uBAB6\uBAB7\uBABA\uBABC\uBABE\uBABF\uBAC0\uBAC1\uBAC2\uBAC3\uBAC5\uBAC6\uBAC7\uBAC9\uBACA\uBACB\uBACC\uBACD\uBACE\uBACF\uBAD0\uBAD1\uBAD2\uBAD3\uBAD4\uBAD5\uBAD6\uBAD7\uBADA\uBADB\uBADC\uBADD\uBADE\uBADF\uBAE0\uBAE1\uBAE2\uBAE3\uBAE4\uBAE5\uBAE6\uBAE7\uBAE8\uBAE9\uBAEA\uBAEB\uBAEC\uBAED\uBAEE\uBAEF\uBAF0\uBAF1\uBAF2\uBAF3\uBAF4\uBAF5\uBAF6\uBAF7\uBAF8\uBAF9\uBAFA\uBAFB\uBAFD\uBAFE\uBAFF\uBB01\uBB02\uBB03\uBB05\uBB06\uBB07\uBB08\uBB09\uBB0A\uBB0B\uBB0C\uBB0E\uBB10\uBB12\uBB13\uBB14\uBB15\uBB16\uBB17\uBB19\uBB1A\uBB1B\uBB1D\uBB1E\uBB1F\uBB21\uBB22\uBB23\uBB24\uBB25\uBB26\uBB27\uBB28\uBB2A\uBB2C\uBB2D\uBB2E\uBB2F\uBB30\uBB31\uBB32\uBB33\uBB37\uBB39\uBB3A\uBB3F\uBB40\uBB41\uBB42\uBB43\uBB46\uBB48\uBB4A\uBB4B\uBB4C\uBB4E\uBB51\uBB52\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBB53\uBB55\uBB56\uBB57\uBB59\uBB5A\uBB5B\uBB5C\uBB5D\uBB5E\uBB5F\uBB60\uBB62\uBB64\uBB65\uBB66\uBB67\uBB68\uBB69\uBB6A\uBB6B\uBB6D\uBB6E\uBB6F\uBB70\uBB71\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBB72\uBB73\uBB74\uBB75\uBB76\uBB77\uBB78\uBB79\uBB7A\uBB7B\uBB7C\uBB7D\uBB7E\uBB7F\uBB80\uBB81\uBB82\uBB83\uBB84\uBB85\uBB86\uBB87\uBB89\uBB8A\uBB8B\uBB8D\uBB8E\uBB8F\uBB91\uBB92\uBB93\uBB94\uBB95\uBB96\uBB97\uBB98\uBB99\uBB9A\uBB9B\uBB9C\uBB9D\uBB9E\uBB9F\uBBA0\uBBA1\uBBA2\uBBA3\uBBA5\uBBA6\uBBA7\uBBA9\uBBAA\uBBAB\uBBAD\uBBAE\uBBAF\uBBB0\uBBB1\uBBB2\uBBB3\uBBB5\uBBB6\uBBB8\uBBB9\uBBBA\uBBBB\uBBBC\uBBBD\uBBBE\uBBBF\uBBC1\uBBC2\uBBC3\uBBC5\uBBC6\uBBC7\uBBC9\uBBCA\uBBCB\uBBCC\uBBCD\uBBCE\uBBCF\uBBD1\uBBD2\uBBD4\uBBD5\uBBD6\uBBD7\uBBD8\uBBD9\uBBDA\uBBDB\uBBDC\uBBDD\uBBDE\uBBDF\uBBE0\uBBE1\uBBE2\uBBE3\uBBE4\uBBE5\uBBE6\uBBE7\uBBE8\uBBE9\uBBEA\uBBEB\uBBEC\uBBED\uBBEE\uBBEF\uBBF0\uBBF1\uBBF2\uBBF3\uBBF4\uBBF5\uBBF6\uBBF7\uBBFA\uBBFB\uBBFD\uBBFE\uBC01\uBC03\uBC04\uBC05\uBC06\uBC07\uBC0A\uBC0E\uBC10\uBC12\uBC13\uBC19\uBC1A\uBC20\uBC21\uBC22\uBC23\uBC26\uBC28\uBC2A\uBC2B\uBC2C\uBC2E\uBC2F\uBC32\uBC33\uBC35\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBC36\uBC37\uBC39\uBC3A\uBC3B\uBC3C\uBC3D\uBC3E\uBC3F\uBC42\uBC46\uBC47\uBC48\uBC4A\uBC4B\uBC4E\uBC4F\uBC51\uBC52\uBC53\uBC54\uBC55\uBC56\uBC57\uBC58\uBC59\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBC5A\uBC5B\uBC5C\uBC5E\uBC5F\uBC60\uBC61\uBC62\uBC63\uBC64\uBC65\uBC66\uBC67\uBC68\uBC69\uBC6A\uBC6B\uBC6C\uBC6D\uBC6E\uBC6F\uBC70\uBC71\uBC72\uBC73\uBC74\uBC75\uBC76\uBC77\uBC78\uBC79\uBC7A\uBC7B\uBC7C\uBC7D\uBC7E\uBC7F\uBC80\uBC81\uBC82\uBC83\uBC86\uBC87\uBC89\uBC8A\uBC8D\uBC8F\uBC90\uBC91\uBC92\uBC93\uBC96\uBC98\uBC9B\uBC9C\uBC9D\uBC9E\uBC9F\uBCA2\uBCA3\uBCA5\uBCA6\uBCA9\uBCAA\uBCAB\uBCAC\uBCAD\uBCAE\uBCAF\uBCB2\uBCB6\uBCB7\uBCB8\uBCB9\uBCBA\uBCBB\uBCBE\uBCBF\uBCC1\uBCC2\uBCC3\uBCC5\uBCC6\uBCC7\uBCC8\uBCC9\uBCCA\uBCCB\uBCCC\uBCCE\uBCD2\uBCD3\uBCD4\uBCD6\uBCD7\uBCD9\uBCDA\uBCDB\uBCDD\uBCDE\uBCDF\uBCE0\uBCE1\uBCE2\uBCE3\uBCE4\uBCE5\uBCE6\uBCE7\uBCE8\uBCE9\uBCEA\uBCEB\uBCEC\uBCED\uBCEE\uBCEF\uBCF0\uBCF1\uBCF2\uBCF3\uBCF7\uBCF9\uBCFA\uBCFB\uBCFD\uBCFE\uBCFF\uBD00\uBD01\uBD02\uBD03\uBD06\uBD08\uBD0A\uBD0B\uBD0C\uBD0D\uBD0E\uBD0F\uBD11\uBD12\uBD13\uBD15\uBD16\uBD17\uBD18\uBD19\uBD1A\uBD1B\uBD1C\uBD1D\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBD1E\uBD1F\uBD20\uBD21\uBD22\uBD23\uBD25\uBD26\uBD27\uBD28\uBD29\uBD2A\uBD2B\uBD2D\uBD2E\uBD2F\uBD30\uBD31\uBD32\uBD33\uBD34\uBD35\uBD36\uBD37\uBD38\uBD39\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBD3A\uBD3B\uBD3C\uBD3D\uBD3E\uBD3F\uBD41\uBD42\uBD43\uBD44\uBD45\uBD46\uBD47\uBD4A\uBD4B\uBD4D\uBD4E\uBD4F\uBD51\uBD52\uBD53\uBD54\uBD55\uBD56\uBD57\uBD5A\uBD5B\uBD5C\uBD5D\uBD5E\uBD5F\uBD60\uBD61\uBD62\uBD63\uBD65\uBD66\uBD67\uBD69\uBD6A\uBD6B\uBD6C\uBD6D\uBD6E\uBD6F\uBD70\uBD71\uBD72\uBD73\uBD74\uBD75\uBD76\uBD77\uBD78\uBD79\uBD7A\uBD7B\uBD7C\uBD7D\uBD7E\uBD7F\uBD82\uBD83\uBD85\uBD86\uBD8B\uBD8C\uBD8D\uBD8E\uBD8F\uBD92\uBD94\uBD96\uBD97\uBD98\uBD9B\uBD9D\uBD9E\uBD9F\uBDA0\uBDA1\uBDA2\uBDA3\uBDA5\uBDA6\uBDA7\uBDA8\uBDA9\uBDAA\uBDAB\uBDAC\uBDAD\uBDAE\uBDAF\uBDB1\uBDB2\uBDB3\uBDB4\uBDB5\uBDB6\uBDB7\uBDB9\uBDBA\uBDBB\uBDBC\uBDBD\uBDBE\uBDBF\uBDC0\uBDC1\uBDC2\uBDC3\uBDC4\uBDC5\uBDC6\uBDC7\uBDC8\uBDC9\uBDCA\uBDCB\uBDCC\uBDCD\uBDCE\uBDCF\uBDD0\uBDD1\uBDD2\uBDD3\uBDD6\uBDD7\uBDD9\uBDDA\uBDDB\uBDDD\uBDDE\uBDDF\uBDE0\uBDE1\uBDE2\uBDE3\uBDE4\uBDE5\uBDE6\uBDE7\uBDE8\uBDEA\uBDEB\uBDEC\uBDED\uBDEE\uBDEF\uBDF1\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBDF2\uBDF3\uBDF5\uBDF6\uBDF7\uBDF9\uBDFA\uBDFB\uBDFC\uBDFD\uBDFE\uBDFF\uBE01\uBE02\uBE04\uBE06\uBE07\uBE08\uBE09\uBE0A\uBE0B\uBE0E\uBE0F\uBE11\uBE12\uBE13\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBE15\uBE16\uBE17\uBE18\uBE19\uBE1A\uBE1B\uBE1E\uBE20\uBE21\uBE22\uBE23\uBE24\uBE25\uBE26\uBE27\uBE28\uBE29\uBE2A\uBE2B\uBE2C\uBE2D\uBE2E\uBE2F\uBE30\uBE31\uBE32\uBE33\uBE34\uBE35\uBE36\uBE37\uBE38\uBE39\uBE3A\uBE3B\uBE3C\uBE3D\uBE3E\uBE3F\uBE40\uBE41\uBE42\uBE43\uBE46\uBE47\uBE49\uBE4A\uBE4B\uBE4D\uBE4F\uBE50\uBE51\uBE52\uBE53\uBE56\uBE58\uBE5C\uBE5D\uBE5E\uBE5F\uBE62\uBE63\uBE65\uBE66\uBE67\uBE69\uBE6B\uBE6C\uBE6D\uBE6E\uBE6F\uBE72\uBE76\uBE77\uBE78\uBE79\uBE7A\uBE7E\uBE7F\uBE81\uBE82\uBE83\uBE85\uBE86\uBE87\uBE88\uBE89\uBE8A\uBE8B\uBE8E\uBE92\uBE93\uBE94\uBE95\uBE96\uBE97\uBE9A\uBE9B\uBE9C\uBE9D\uBE9E\uBE9F\uBEA0\uBEA1\uBEA2\uBEA3\uBEA4\uBEA5\uBEA6\uBEA7\uBEA9\uBEAA\uBEAB\uBEAC\uBEAD\uBEAE\uBEAF\uBEB0\uBEB1\uBEB2\uBEB3\uBEB4\uBEB5\uBEB6\uBEB7\uBEB8\uBEB9\uBEBA\uBEBB\uBEBC\uBEBD\uBEBE\uBEBF\uBEC0\uBEC1\uBEC2\uBEC3\uBEC4\uBEC5\uBEC6\uBEC7\uBEC8\uBEC9\uBECA\uBECB\uBECC\uBECD\uBECE\uBECF\uBED2\uBED3\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBED5\uBED6\uBED9\uBEDA\uBEDB\uBEDC\uBEDD\uBEDE\uBEDF\uBEE1\uBEE2\uBEE6\uBEE7\uBEE8\uBEE9\uBEEA\uBEEB\uBEED\uBEEE\uBEEF\uBEF0\uBEF1\uBEF2\uBEF3\uBEF4\uBEF5\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBEF6\uBEF7\uBEF8\uBEF9\uBEFA\uBEFB\uBEFC\uBEFD\uBEFE\uBEFF\uBF00\uBF02\uBF03\uBF04\uBF05\uBF06\uBF07\uBF0A\uBF0B\uBF0C\uBF0D\uBF0E\uBF0F\uBF10\uBF11\uBF12\uBF13\uBF14\uBF15\uBF16\uBF17\uBF1A\uBF1E\uBF1F\uBF20\uBF21\uBF22\uBF23\uBF24\uBF25\uBF26\uBF27\uBF28\uBF29\uBF2A\uBF2B\uBF2C\uBF2D\uBF2E\uBF2F\uBF30\uBF31\uBF32\uBF33\uBF34\uBF35\uBF36\uBF37\uBF38\uBF39\uBF3A\uBF3B\uBF3C\uBF3D\uBF3E\uBF3F\uBF42\uBF43\uBF45\uBF46\uBF47\uBF49\uBF4A\uBF4B\uBF4C\uBF4D\uBF4E\uBF4F\uBF52\uBF53\uBF54\uBF56\uBF57\uBF58\uBF59\uBF5A\uBF5B\uBF5C\uBF5D\uBF5E\uBF5F\uBF60\uBF61\uBF62\uBF63\uBF64\uBF65\uBF66\uBF67\uBF68\uBF69\uBF6A\uBF6B\uBF6C\uBF6D\uBF6E\uBF6F\uBF70\uBF71\uBF72\uBF73\uBF74\uBF75\uBF76\uBF77\uBF78\uBF79\uBF7A\uBF7B\uBF7C\uBF7D\uBF7E\uBF7F\uBF80\uBF81\uBF82\uBF83\uBF84\uBF85\uBF86\uBF87\uBF88\uBF89\uBF8A\uBF8B\uBF8C\uBF8D\uBF8E\uBF8F\uBF90\uBF91\uBF92\uBF93\uBF95\uBF96\uBF97\uBF98\uBF99\uBF9A\uBF9B\uBF9C\uBF9D\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBF9E\uBF9F\uBFA0\uBFA1\uBFA2\uBFA3\uBFA4\uBFA5\uBFA6\uBFA7\uBFA8\uBFA9\uBFAA\uBFAB\uBFAC\uBFAD\uBFAE\uBFAF\uBFB1\uBFB2\uBFB3\uBFB4\uBFB5\uBFB6\uBFB7\uBFB8\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uBFB9\uBFBA\uBFBB\uBFBC\uBFBD\uBFBE\uBFBF\uBFC0\uBFC1\uBFC2\uBFC3\uBFC4\uBFC6\uBFC7\uBFC8\uBFC9\uBFCA\uBFCB\uBFCE\uBFCF\uBFD1\uBFD2\uBFD3\uBFD5\uBFD6\uBFD7\uBFD8\uBFD9\uBFDA\uBFDB\uBFDD\uBFDE\uBFE0\uBFE2\uBFE3\uBFE4\uBFE5\uBFE6\uBFE7\uBFE8\uBFE9\uBFEA\uBFEB\uBFEC\uBFED\uBFEE\uBFEF\uBFF0\uBFF1\uBFF2\uBFF3\uBFF4\uBFF5\uBFF6\uBFF7\uBFF8\uBFF9\uBFFA\uBFFB\uBFFC\uBFFD\uBFFE\uBFFF\uC000\uC001\uC002\uC003\uC004\uC005\uC006\uC007\uC008\uC009\uC00A\uC00B\uC00C\uC00D\uC00E\uC00F\uC010\uC011\uC012\uC013\uC014\uC015\uC016\uC017\uC018\uC019\uC01A\uC01B\uC01C\uC01D\uC01E\uC01F\uC020\uC021\uC022\uC023\uC024\uC025\uC026\uC027\uC028\uC029\uC02A\uC02B\uC02C\uC02D\uC02E\uC02F\uC030\uC031\uC032\uC033\uC034\uC035\uC036\uC037\uC038\uC039\uC03A\uC03B\uC03D\uC03E\uC03F\uC040\uC041\uC042\uC043\uC044\uC045\uC046\uC047\uC048\uC049\uC04A\uC04B\uC04C\uC04D\uC04E\uC04F\uC050\uC052\uC053\uC054\uC055\uC056\uC057\uC059\uC05A\uC05B\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC05D\uC05E\uC05F\uC061\uC062\uC063\uC064\uC065\uC066\uC067\uC06A\uC06B\uC06C\uC06D\uC06E\uC06F\uC070\uC071\uC072\uC073\uC074\uC075\uC076\uC077\uC078\uC079\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC07A\uC07B\uC07C\uC07D\uC07E\uC07F\uC080\uC081\uC082\uC083\uC084\uC085\uC086\uC087\uC088\uC089\uC08A\uC08B\uC08C\uC08D\uC08E\uC08F\uC092\uC093\uC095\uC096\uC097\uC099\uC09A\uC09B\uC09C\uC09D\uC09E\uC09F\uC0A2\uC0A4\uC0A6\uC0A7\uC0A8\uC0A9\uC0AA\uC0AB\uC0AE\uC0B1\uC0B2\uC0B7\uC0B8\uC0B9\uC0BA\uC0BB\uC0BE\uC0C2\uC0C3\uC0C4\uC0C6\uC0C7\uC0CA\uC0CB\uC0CD\uC0CE\uC0CF\uC0D1\uC0D2\uC0D3\uC0D4\uC0D5\uC0D6\uC0D7\uC0DA\uC0DE\uC0DF\uC0E0\uC0E1\uC0E2\uC0E3\uC0E6\uC0E7\uC0E9\uC0EA\uC0EB\uC0ED\uC0EE\uC0EF\uC0F0\uC0F1\uC0F2\uC0F3\uC0F6\uC0F8\uC0FA\uC0FB\uC0FC\uC0FD\uC0FE\uC0FF\uC101\uC102\uC103\uC105\uC106\uC107\uC109\uC10A\uC10B\uC10C\uC10D\uC10E\uC10F\uC111\uC112\uC113\uC114\uC116\uC117\uC118\uC119\uC11A\uC11B\uC121\uC122\uC125\uC128\uC129\uC12A\uC12B\uC12E\uC132\uC133\uC134\uC135\uC137\uC13A\uC13B\uC13D\uC13E\uC13F\uC141\uC142\uC143\uC144\uC145\uC146\uC147\uC14A\uC14E\uC14F\uC150\uC151\uC152\uC153\uC156\uC157\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC159\uC15A\uC15B\uC15D\uC15E\uC15F\uC160\uC161\uC162\uC163\uC166\uC16A\uC16B\uC16C\uC16D\uC16E\uC16F\uC171\uC172\uC173\uC175\uC176\uC177\uC179\uC17A\uC17B\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC17C\uC17D\uC17E\uC17F\uC180\uC181\uC182\uC183\uC184\uC186\uC187\uC188\uC189\uC18A\uC18B\uC18F\uC191\uC192\uC193\uC195\uC197\uC198\uC199\uC19A\uC19B\uC19E\uC1A0\uC1A2\uC1A3\uC1A4\uC1A6\uC1A7\uC1AA\uC1AB\uC1AD\uC1AE\uC1AF\uC1B1\uC1B2\uC1B3\uC1B4\uC1B5\uC1B6\uC1B7\uC1B8\uC1B9\uC1BA\uC1BB\uC1BC\uC1BE\uC1BF\uC1C0\uC1C1\uC1C2\uC1C3\uC1C5\uC1C6\uC1C7\uC1C9\uC1CA\uC1CB\uC1CD\uC1CE\uC1CF\uC1D0\uC1D1\uC1D2\uC1D3\uC1D5\uC1D6\uC1D9\uC1DA\uC1DB\uC1DC\uC1DD\uC1DE\uC1DF\uC1E1\uC1E2\uC1E3\uC1E5\uC1E6\uC1E7\uC1E9\uC1EA\uC1EB\uC1EC\uC1ED\uC1EE\uC1EF\uC1F2\uC1F4\uC1F5\uC1F6\uC1F7\uC1F8\uC1F9\uC1FA\uC1FB\uC1FE\uC1FF\uC201\uC202\uC203\uC205\uC206\uC207\uC208\uC209\uC20A\uC20B\uC20E\uC210\uC212\uC213\uC214\uC215\uC216\uC217\uC21A\uC21B\uC21D\uC21E\uC221\uC222\uC223\uC224\uC225\uC226\uC227\uC22A\uC22C\uC22E\uC230\uC233\uC235\uC236\uC237\uC238\uC239\uC23A\uC23B\uC23C\uC23D\uC23E\uC23F\uC240\uC241\uC242\uC243\uC244\uC245\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC246\uC247\uC249\uC24A\uC24B\uC24C\uC24D\uC24E\uC24F\uC252\uC253\uC255\uC256\uC257\uC259\uC25A\uC25B\uC25C\uC25D\uC25E\uC25F\uC261\uC262\uC263\uC264\uC266\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC267\uC268\uC269\uC26A\uC26B\uC26E\uC26F\uC271\uC272\uC273\uC275\uC276\uC277\uC278\uC279\uC27A\uC27B\uC27E\uC280\uC282\uC283\uC284\uC285\uC286\uC287\uC28A\uC28B\uC28C\uC28D\uC28E\uC28F\uC291\uC292\uC293\uC294\uC295\uC296\uC297\uC299\uC29A\uC29C\uC29E\uC29F\uC2A0\uC2A1\uC2A2\uC2A3\uC2A6\uC2A7\uC2A9\uC2AA\uC2AB\uC2AE\uC2AF\uC2B0\uC2B1\uC2B2\uC2B3\uC2B6\uC2B8\uC2BA\uC2BB\uC2BC\uC2BD\uC2BE\uC2BF\uC2C0\uC2C1\uC2C2\uC2C3\uC2C4\uC2C5\uC2C6\uC2C7\uC2C8\uC2C9\uC2CA\uC2CB\uC2CC\uC2CD\uC2CE\uC2CF\uC2D0\uC2D1\uC2D2\uC2D3\uC2D4\uC2D5\uC2D6\uC2D7\uC2D8\uC2D9\uC2DA\uC2DB\uC2DE\uC2DF\uC2E1\uC2E2\uC2E5\uC2E6\uC2E7\uC2E8\uC2E9\uC2EA\uC2EE\uC2F0\uC2F2\uC2F3\uC2F4\uC2F5\uC2F7\uC2FA\uC2FD\uC2FE\uC2FF\uC301\uC302\uC303\uC304\uC305\uC306\uC307\uC30A\uC30B\uC30E\uC30F\uC310\uC311\uC312\uC316\uC317\uC319\uC31A\uC31B\uC31D\uC31E\uC31F\uC320\uC321\uC322\uC323\uC326\uC327\uC32A\uC32B\uC32C\uC32D\uC32E\uC32F\uC330\uC331\uC332\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC333\uC334\uC335\uC336\uC337\uC338\uC339\uC33A\uC33B\uC33C\uC33D\uC33E\uC33F\uC340\uC341\uC342\uC343\uC344\uC346\uC347\uC348\uC349\uC34A\uC34B\uC34C\uC34D\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC34E\uC34F\uC350\uC351\uC352\uC353\uC354\uC355\uC356\uC357\uC358\uC359\uC35A\uC35B\uC35C\uC35D\uC35E\uC35F\uC360\uC361\uC362\uC363\uC364\uC365\uC366\uC367\uC36A\uC36B\uC36D\uC36E\uC36F\uC371\uC373\uC374\uC375\uC376\uC377\uC37A\uC37B\uC37E\uC37F\uC380\uC381\uC382\uC383\uC385\uC386\uC387\uC389\uC38A\uC38B\uC38D\uC38E\uC38F\uC390\uC391\uC392\uC393\uC394\uC395\uC396\uC397\uC398\uC399\uC39A\uC39B\uC39C\uC39D\uC39E\uC39F\uC3A0\uC3A1\uC3A2\uC3A3\uC3A4\uC3A5\uC3A6\uC3A7\uC3A8\uC3A9\uC3AA\uC3AB\uC3AC\uC3AD\uC3AE\uC3AF\uC3B0\uC3B1\uC3B2\uC3B3\uC3B4\uC3B5\uC3B6\uC3B7\uC3B8\uC3B9\uC3BA\uC3BB\uC3BC\uC3BD\uC3BE\uC3BF\uC3C1\uC3C2\uC3C3\uC3C4\uC3C5\uC3C6\uC3C7\uC3C8\uC3C9\uC3CA\uC3CB\uC3CC\uC3CD\uC3CE\uC3CF\uC3D0\uC3D1\uC3D2\uC3D3\uC3D4\uC3D5\uC3D6\uC3D7\uC3DA\uC3DB\uC3DD\uC3DE\uC3E1\uC3E3\uC3E4\uC3E5\uC3E6\uC3E7\uC3EA\uC3EB\uC3EC\uC3EE\uC3EF\uC3F0\uC3F1\uC3F2\uC3F3\uC3F6\uC3F7\uC3F9\uC3FA\uC3FB\uC3FC\uC3FD\uC3FE\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC3FF\uC400\uC401\uC402\uC403\uC404\uC405\uC406\uC407\uC409\uC40A\uC40B\uC40C\uC40D\uC40E\uC40F\uC411\uC412\uC413\uC414\uC415\uC416\uC417\uC418\uC419\uC41A\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC41B\uC41C\uC41D\uC41E\uC41F\uC420\uC421\uC422\uC423\uC425\uC426\uC427\uC428\uC429\uC42A\uC42B\uC42D\uC42E\uC42F\uC431\uC432\uC433\uC435\uC436\uC437\uC438\uC439\uC43A\uC43B\uC43E\uC43F\uC440\uC441\uC442\uC443\uC444\uC445\uC446\uC447\uC449\uC44A\uC44B\uC44C\uC44D\uC44E\uC44F\uC450\uC451\uC452\uC453\uC454\uC455\uC456\uC457\uC458\uC459\uC45A\uC45B\uC45C\uC45D\uC45E\uC45F\uC460\uC461\uC462\uC463\uC466\uC467\uC469\uC46A\uC46B\uC46D\uC46E\uC46F\uC470\uC471\uC472\uC473\uC476\uC477\uC478\uC47A\uC47B\uC47C\uC47D\uC47E\uC47F\uC481\uC482\uC483\uC484\uC485\uC486\uC487\uC488\uC489\uC48A\uC48B\uC48C\uC48D\uC48E\uC48F\uC490\uC491\uC492\uC493\uC495\uC496\uC497\uC498\uC499\uC49A\uC49B\uC49D\uC49E\uC49F\uC4A0\uC4A1\uC4A2\uC4A3\uC4A4\uC4A5\uC4A6\uC4A7\uC4A8\uC4A9\uC4AA\uC4AB\uC4AC\uC4AD\uC4AE\uC4AF\uC4B0\uC4B1\uC4B2\uC4B3\uC4B4\uC4B5\uC4B6\uC4B7\uC4B9\uC4BA\uC4BB\uC4BD\uC4BE\uC4BF\uC4C0\uC4C1\uC4C2\uC4C3\uC4C4\uC4C5\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC4C6\uC4C7\uC4C8\uC4C9\uC4CA\uC4CB\uC4CC\uC4CD\uC4CE\uC4CF\uC4D0\uC4D1\uC4D2\uC4D3\uC4D4\uC4D5\uC4D6\uC4D7\uC4D8\uC4D9\uC4DA\uC4DB\uC4DC\uC4DD\uC4DE\uC4DF\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC4E0\uC4E1\uC4E2\uC4E3\uC4E4\uC4E5\uC4E6\uC4E7\uC4E8\uC4EA\uC4EB\uC4EC\uC4ED\uC4EE\uC4EF\uC4F2\uC4F3\uC4F5\uC4F6\uC4F7\uC4F9\uC4FB\uC4FC\uC4FD\uC4FE\uC502\uC503\uC504\uC505\uC506\uC507\uC508\uC509\uC50A\uC50B\uC50D\uC50E\uC50F\uC511\uC512\uC513\uC515\uC516\uC517\uC518\uC519\uC51A\uC51B\uC51D\uC51E\uC51F\uC520\uC521\uC522\uC523\uC524\uC525\uC526\uC527\uC52A\uC52B\uC52D\uC52E\uC52F\uC531\uC532\uC533\uC534\uC535\uC536\uC537\uC53A\uC53C\uC53E\uC53F\uC540\uC541\uC542\uC543\uC546\uC547\uC54B\uC54F\uC550\uC551\uC552\uC556\uC55A\uC55B\uC55C\uC55F\uC562\uC563\uC565\uC566\uC567\uC569\uC56A\uC56B\uC56C\uC56D\uC56E\uC56F\uC572\uC576\uC577\uC578\uC579\uC57A\uC57B\uC57E\uC57F\uC581\uC582\uC583\uC585\uC586\uC588\uC589\uC58A\uC58B\uC58E\uC590\uC592\uC593\uC594\uC596\uC599\uC59A\uC59B\uC59D\uC59E\uC59F\uC5A1\uC5A2\uC5A3\uC5A4\uC5A5\uC5A6\uC5A7\uC5A8\uC5AA\uC5AB\uC5AC\uC5AD\uC5AE\uC5AF\uC5B0\uC5B1\uC5B2\uC5B3\uC5B6\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC5B7\uC5BA\uC5BF\uC5C0\uC5C1\uC5C2\uC5C3\uC5CB\uC5CD\uC5CF\uC5D2\uC5D3\uC5D5\uC5D6\uC5D7\uC5D9\uC5DA\uC5DB\uC5DC\uC5DD\uC5DE\uC5DF\uC5E2\uC5E4\uC5E6\uC5E7\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC5E8\uC5E9\uC5EA\uC5EB\uC5EF\uC5F1\uC5F2\uC5F3\uC5F5\uC5F8\uC5F9\uC5FA\uC5FB\uC602\uC603\uC604\uC609\uC60A\uC60B\uC60D\uC60E\uC60F\uC611\uC612\uC613\uC614\uC615\uC616\uC617\uC61A\uC61D\uC61E\uC61F\uC620\uC621\uC622\uC623\uC626\uC627\uC629\uC62A\uC62B\uC62F\uC631\uC632\uC636\uC638\uC63A\uC63C\uC63D\uC63E\uC63F\uC642\uC643\uC645\uC646\uC647\uC649\uC64A\uC64B\uC64C\uC64D\uC64E\uC64F\uC652\uC656\uC657\uC658\uC659\uC65A\uC65B\uC65E\uC65F\uC661\uC662\uC663\uC664\uC665\uC666\uC667\uC668\uC669\uC66A\uC66B\uC66D\uC66E\uC670\uC672\uC673\uC674\uC675\uC676\uC677\uC67A\uC67B\uC67D\uC67E\uC67F\uC681\uC682\uC683\uC684\uC685\uC686\uC687\uC68A\uC68C\uC68E\uC68F\uC690\uC691\uC692\uC693\uC696\uC697\uC699\uC69A\uC69B\uC69D\uC69E\uC69F\uC6A0\uC6A1\uC6A2\uC6A3\uC6A6\uC6A8\uC6AA\uC6AB\uC6AC\uC6AD\uC6AE\uC6AF\uC6B2\uC6B3\uC6B5\uC6B6\uC6B7\uC6BB\uC6BC\uC6BD\uC6BE\uC6BF\uC6C2\uC6C4\uC6C6\uC6C7\uC6C8\uC6C9\uC6CA\uC6CB\uC6CE\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC6CF\uC6D1\uC6D2\uC6D3\uC6D5\uC6D6\uC6D7\uC6D8\uC6D9\uC6DA\uC6DB\uC6DE\uC6DF\uC6E2\uC6E3\uC6E4\uC6E5\uC6E6\uC6E7\uC6EA\uC6EB\uC6ED\uC6EE\uC6EF\uC6F1\uC6F2\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC6F3\uC6F4\uC6F5\uC6F6\uC6F7\uC6FA\uC6FB\uC6FC\uC6FE\uC6FF\uC700\uC701\uC702\uC703\uC706\uC707\uC709\uC70A\uC70B\uC70D\uC70E\uC70F\uC710\uC711\uC712\uC713\uC716\uC718\uC71A\uC71B\uC71C\uC71D\uC71E\uC71F\uC722\uC723\uC725\uC726\uC727\uC729\uC72A\uC72B\uC72C\uC72D\uC72E\uC72F\uC732\uC734\uC736\uC738\uC739\uC73A\uC73B\uC73E\uC73F\uC741\uC742\uC743\uC745\uC746\uC747\uC748\uC749\uC74B\uC74E\uC750\uC759\uC75A\uC75B\uC75D\uC75E\uC75F\uC761\uC762\uC763\uC764\uC765\uC766\uC767\uC769\uC76A\uC76C\uC76D\uC76E\uC76F\uC770\uC771\uC772\uC773\uC776\uC777\uC779\uC77A\uC77B\uC77F\uC780\uC781\uC782\uC786\uC78B\uC78C\uC78D\uC78F\uC792\uC793\uC795\uC799\uC79B\uC79C\uC79D\uC79E\uC79F\uC7A2\uC7A7\uC7A8\uC7A9\uC7AA\uC7AB\uC7AE\uC7AF\uC7B1\uC7B2\uC7B3\uC7B5\uC7B6\uC7B7\uC7B8\uC7B9\uC7BA\uC7BB\uC7BE\uC7C2\uC7C3\uC7C4\uC7C5\uC7C6\uC7C7\uC7CA\uC7CB\uC7CD\uC7CF\uC7D1\uC7D2\uC7D3\uC7D4\uC7D5\uC7D6\uC7D7\uC7D9\uC7DA\uC7DB\uC7DC\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC7DE\uC7DF\uC7E0\uC7E1\uC7E2\uC7E3\uC7E5\uC7E6\uC7E7\uC7E9\uC7EA\uC7EB\uC7ED\uC7EE\uC7EF\uC7F0\uC7F1\uC7F2\uC7F3\uC7F4\uC7F5\uC7F6\uC7F7\uC7F8\uC7F9\uC7FA\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC7FB\uC7FC\uC7FD\uC7FE\uC7FF\uC802\uC803\uC805\uC806\uC807\uC809\uC80B\uC80C\uC80D\uC80E\uC80F\uC812\uC814\uC817\uC818\uC819\uC81A\uC81B\uC81E\uC81F\uC821\uC822\uC823\uC825\uC826\uC827\uC828\uC829\uC82A\uC82B\uC82E\uC830\uC832\uC833\uC834\uC835\uC836\uC837\uC839\uC83A\uC83B\uC83D\uC83E\uC83F\uC841\uC842\uC843\uC844\uC845\uC846\uC847\uC84A\uC84B\uC84E\uC84F\uC850\uC851\uC852\uC853\uC855\uC856\uC857\uC858\uC859\uC85A\uC85B\uC85C\uC85D\uC85E\uC85F\uC860\uC861\uC862\uC863\uC864\uC865\uC866\uC867\uC868\uC869\uC86A\uC86B\uC86C\uC86D\uC86E\uC86F\uC872\uC873\uC875\uC876\uC877\uC879\uC87B\uC87C\uC87D\uC87E\uC87F\uC882\uC884\uC888\uC889\uC88A\uC88E\uC88F\uC890\uC891\uC892\uC893\uC895\uC896\uC897\uC898\uC899\uC89A\uC89B\uC89C\uC89E\uC8A0\uC8A2\uC8A3\uC8A4\uC8A5\uC8A6\uC8A7\uC8A9\uC8AA\uC8AB\uC8AC\uC8AD\uC8AE\uC8AF\uC8B0\uC8B1\uC8B2\uC8B3\uC8B4\uC8B5\uC8B6\uC8B7\uC8B8\uC8B9\uC8BA\uC8BB\uC8BE\uC8BF\uC8C0\uC8C1\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC8C2\uC8C3\uC8C5\uC8C6\uC8C7\uC8C9\uC8CA\uC8CB\uC8CD\uC8CE\uC8CF\uC8D0\uC8D1\uC8D2\uC8D3\uC8D6\uC8D8\uC8DA\uC8DB\uC8DC\uC8DD\uC8DE\uC8DF\uC8E2\uC8E3\uC8E5\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC8E6\uC8E7\uC8E8\uC8E9\uC8EA\uC8EB\uC8EC\uC8ED\uC8EE\uC8EF\uC8F0\uC8F1\uC8F2\uC8F3\uC8F4\uC8F6\uC8F7\uC8F8\uC8F9\uC8FA\uC8FB\uC8FE\uC8FF\uC901\uC902\uC903\uC907\uC908\uC909\uC90A\uC90B\uC90E\u3000\u3001\u3002\xB7\u2025\u2026\xA8\u3003\xAD\u2015\u2225\uFF3C\u223C\u2018\u2019\u201C\u201D\u3014\u3015\u3008\u3009\u300A\u300B\u300C\u300D\u300E\u300F\u3010\u3011\xB1\xD7\xF7\u2260\u2264\u2265\u221E\u2234\xB0\u2032\u2033\u2103\u212B\uFFE0\uFFE1\uFFE5\u2642\u2640\u2220\u22A5\u2312\u2202\u2207\u2261\u2252\xA7\u203B\u2606\u2605\u25CB\u25CF\u25CE\u25C7\u25C6\u25A1\u25A0\u25B3\u25B2\u25BD\u25BC\u2192\u2190\u2191\u2193\u2194\u3013\u226A\u226B\u221A\u223D\u221D\u2235\u222B\u222C\u2208\u220B\u2286\u2287\u2282\u2283\u222A\u2229\u2227\u2228\uFFE2\uC910\uC912\uC913\uC914\uC915\uC916\uC917\uC919\uC91A\uC91B\uC91C\uC91D\uC91E\uC91F\uC920\uC921\uC922\uC923\uC924\uC925\uC926\uC927\uC928\uC929\uC92A\uC92B\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC92D\uC92E\uC92F\uC930\uC931\uC932\uC933\uC935\uC936\uC937\uC938\uC939\uC93A\uC93B\uC93C\uC93D\uC93E\uC93F\uC940\uC941\uC942\uC943\uC944\uC945\uC946\uC947\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC948\uC949\uC94A\uC94B\uC94C\uC94D\uC94E\uC94F\uC952\uC953\uC955\uC956\uC957\uC959\uC95A\uC95B\uC95C\uC95D\uC95E\uC95F\uC962\uC964\uC965\uC966\uC967\uC968\uC969\uC96A\uC96B\uC96D\uC96E\uC96F\u21D2\u21D4\u2200\u2203\xB4\uFF5E\u02C7\u02D8\u02DD\u02DA\u02D9\xB8\u02DB\xA1\xBF\u02D0\u222E\u2211\u220F\xA4\u2109\u2030\u25C1\u25C0\u25B7\u25B6\u2664\u2660\u2661\u2665\u2667\u2663\u2299\u25C8\u25A3\u25D0\u25D1\u2592\u25A4\u25A5\u25A8\u25A7\u25A6\u25A9\u2668\u260F\u260E\u261C\u261E\xB6\u2020\u2021\u2195\u2197\u2199\u2196\u2198\u266D\u2669\u266A\u266C\u327F\u321C\u2116\u33C7\u2122\u33C2\u33D8\u2121\u20AC\xAE\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC971\uC972\uC973\uC975\uC976\uC977\uC978\uC979\uC97A\uC97B\uC97D\uC97E\uC97F\uC980\uC981\uC982\uC983\uC984\uC985\uC986\uC987\uC98A\uC98B\uC98D\uC98E\uC98F\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC991\uC992\uC993\uC994\uC995\uC996\uC997\uC99A\uC99C\uC99E\uC99F\uC9A0\uC9A1\uC9A2\uC9A3\uC9A4\uC9A5\uC9A6\uC9A7\uC9A8\uC9A9\uC9AA\uC9AB\uC9AC\uC9AD\uC9AE\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uC9AF\uC9B0\uC9B1\uC9B2\uC9B3\uC9B4\uC9B5\uC9B6\uC9B7\uC9B8\uC9B9\uC9BA\uC9BB\uC9BC\uC9BD\uC9BE\uC9BF\uC9C2\uC9C3\uC9C5\uC9C6\uC9C9\uC9CB\uC9CC\uC9CD\uC9CE\uC9CF\uC9D2\uC9D4\uC9D7\uC9D8\uC9DB\uFF01\uFF02\uFF03\uFF04\uFF05\uFF06\uFF07\uFF08\uFF09\uFF0A\uFF0B\uFF0C\uFF0D\uFF0E\uFF0F\uFF10\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\uFF18\uFF19\uFF1A\uFF1B\uFF1C\uFF1D\uFF1E\uFF1F\uFF20\uFF21\uFF22\uFF23\uFF24\uFF25\uFF26\uFF27\uFF28\uFF29\uFF2A\uFF2B\uFF2C\uFF2D\uFF2E\uFF2F\uFF30\uFF31\uFF32\uFF33\uFF34\uFF35\uFF36\uFF37\uFF38\uFF39\uFF3A\uFF3B\uFFE6\uFF3D\uFF3E\uFF3F\uFF40\uFF41\uFF42\uFF43\uFF44\uFF45\uFF46\uFF47\uFF48\uFF49\uFF4A\uFF4B\uFF4C\uFF4D\uFF4E\uFF4F\uFF50\uFF51\uFF52\uFF53\uFF54\uFF55\uFF56\uFF57\uFF58\uFF59\uFF5A\uFF5B\uFF5C\uFF5D\uFFE3\uC9DE\uC9DF\uC9E1\uC9E3\uC9E5\uC9E6\uC9E8\uC9E9\uC9EA\uC9EB\uC9EE\uC9F2\uC9F3\uC9F4\uC9F5\uC9F6\uC9F7\uC9FA\uC9FB\uC9FD\uC9FE\uC9FF\uCA01\uCA02\uCA03\uCA04\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCA05\uCA06\uCA07\uCA0A\uCA0E\uCA0F\uCA10\uCA11\uCA12\uCA13\uCA15\uCA16\uCA17\uCA19\uCA1A\uCA1B\uCA1C\uCA1D\uCA1E\uCA1F\uCA20\uCA21\uCA22\uCA23\uCA24\uCA25\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCA26\uCA27\uCA28\uCA2A\uCA2B\uCA2C\uCA2D\uCA2E\uCA2F\uCA30\uCA31\uCA32\uCA33\uCA34\uCA35\uCA36\uCA37\uCA38\uCA39\uCA3A\uCA3B\uCA3C\uCA3D\uCA3E\uCA3F\uCA40\uCA41\uCA42\uCA43\uCA44\uCA45\uCA46\u3131\u3132\u3133\u3134\u3135\u3136\u3137\u3138\u3139\u313A\u313B\u313C\u313D\u313E\u313F\u3140\u3141\u3142\u3143\u3144\u3145\u3146\u3147\u3148\u3149\u314A\u314B\u314C\u314D\u314E\u314F\u3150\u3151\u3152\u3153\u3154\u3155\u3156\u3157\u3158\u3159\u315A\u315B\u315C\u315D\u315E\u315F\u3160\u3161\u3162\u3163\u3164\u3165\u3166\u3167\u3168\u3169\u316A\u316B\u316C\u316D\u316E\u316F\u3170\u3171\u3172\u3173\u3174\u3175\u3176\u3177\u3178\u3179\u317A\u317B\u317C\u317D\u317E\u317F\u3180\u3181\u3182\u3183\u3184\u3185\u3186\u3187\u3188\u3189\u318A\u318B\u318C\u318D\u318E\uCA47\uCA48\uCA49\uCA4A\uCA4B\uCA4E\uCA4F\uCA51\uCA52\uCA53\uCA55\uCA56\uCA57\uCA58\uCA59\uCA5A\uCA5B\uCA5E\uCA62\uCA63\uCA64\uCA65\uCA66\uCA67\uCA69\uCA6A\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCA6B\uCA6C\uCA6D\uCA6E\uCA6F\uCA70\uCA71\uCA72\uCA73\uCA74\uCA75\uCA76\uCA77\uCA78\uCA79\uCA7A\uCA7B\uCA7C\uCA7E\uCA7F\uCA80\uCA81\uCA82\uCA83\uCA85\uCA86\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCA87\uCA88\uCA89\uCA8A\uCA8B\uCA8C\uCA8D\uCA8E\uCA8F\uCA90\uCA91\uCA92\uCA93\uCA94\uCA95\uCA96\uCA97\uCA99\uCA9A\uCA9B\uCA9C\uCA9D\uCA9E\uCA9F\uCAA0\uCAA1\uCAA2\uCAA3\uCAA4\uCAA5\uCAA6\uCAA7\u2170\u2171\u2172\u2173\u2174\u2175\u2176\u2177\u2178\u2179\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u2160\u2161\u2162\u2163\u2164\u2165\u2166\u2167\u2168\u2169\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u0391\u0392\u0393\u0394\u0395\u0396\u0397\u0398\u0399\u039A\u039B\u039C\u039D\u039E\u039F\u03A0\u03A1\u03A3\u03A4\u03A5\u03A6\u03A7\u03A8\u03A9\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u03B1\u03B2\u03B3\u03B4\u03B5\u03B6\u03B7\u03B8\u03B9\u03BA\u03BB\u03BC\u03BD\u03BE\u03BF\u03C0\u03C1\u03C3\u03C4\u03C5\u03C6\u03C7\u03C8\u03C9\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCAA8\uCAA9\uCAAA\uCAAB\uCAAC\uCAAD\uCAAE\uCAAF\uCAB0\uCAB1\uCAB2\uCAB3\uCAB4\uCAB5\uCAB6\uCAB7\uCAB8\uCAB9\uCABA\uCABB\uCABE\uCABF\uCAC1\uCAC2\uCAC3\uCAC5\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCAC6\uCAC7\uCAC8\uCAC9\uCACA\uCACB\uCACE\uCAD0\uCAD2\uCAD4\uCAD5\uCAD6\uCAD7\uCADA\uCADB\uCADC\uCADD\uCADE\uCADF\uCAE1\uCAE2\uCAE3\uCAE4\uCAE5\uCAE6\uCAE7\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCAE8\uCAE9\uCAEA\uCAEB\uCAED\uCAEE\uCAEF\uCAF0\uCAF1\uCAF2\uCAF3\uCAF5\uCAF6\uCAF7\uCAF8\uCAF9\uCAFA\uCAFB\uCAFC\uCAFD\uCAFE\uCAFF\uCB00\uCB01\uCB02\uCB03\uCB04\uCB05\uCB06\uCB07\uCB09\uCB0A\u2500\u2502\u250C\u2510\u2518\u2514\u251C\u252C\u2524\u2534\u253C\u2501\u2503\u250F\u2513\u251B\u2517\u2523\u2533\u252B\u253B\u254B\u2520\u252F\u2528\u2537\u253F\u251D\u2530\u2525\u2538\u2542\u2512\u2511\u251A\u2519\u2516\u2515\u250E\u250D\u251E\u251F\u2521\u2522\u2526\u2527\u2529\u252A\u252D\u252E\u2531\u2532\u2535\u2536\u2539\u253A\u253D\u253E\u2540\u2541\u2543\u2544\u2545\u2546\u2547\u2548\u2549\u254A\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCB0B\uCB0C\uCB0D\uCB0E\uCB0F\uCB11\uCB12\uCB13\uCB15\uCB16\uCB17\uCB19\uCB1A\uCB1B\uCB1C\uCB1D\uCB1E\uCB1F\uCB22\uCB23\uCB24\uCB25\uCB26\uCB27\uCB28\uCB29\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCB2A\uCB2B\uCB2C\uCB2D\uCB2E\uCB2F\uCB30\uCB31\uCB32\uCB33\uCB34\uCB35\uCB36\uCB37\uCB38\uCB39\uCB3A\uCB3B\uCB3C\uCB3D\uCB3E\uCB3F\uCB40\uCB42\uCB43\uCB44\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCB45\uCB46\uCB47\uCB4A\uCB4B\uCB4D\uCB4E\uCB4F\uCB51\uCB52\uCB53\uCB54\uCB55\uCB56\uCB57\uCB5A\uCB5B\uCB5C\uCB5E\uCB5F\uCB60\uCB61\uCB62\uCB63\uCB65\uCB66\uCB67\uCB68\uCB69\uCB6A\uCB6B\uCB6C\u3395\u3396\u3397\u2113\u3398\u33C4\u33A3\u33A4\u33A5\u33A6\u3399\u339A\u339B\u339C\u339D\u339E\u339F\u33A0\u33A1\u33A2\u33CA\u338D\u338E\u338F\u33CF\u3388\u3389\u33C8\u33A7\u33A8\u33B0\u33B1\u33B2\u33B3\u33B4\u33B5\u33B6\u33B7\u33B8\u33B9\u3380\u3381\u3382\u3383\u3384\u33BA\u33BB\u33BC\u33BD\u33BE\u33BF\u3390\u3391\u3392\u3393\u3394\u2126\u33C0\u33C1\u338A\u338B\u338C\u33D6\u33C5\u33AD\u33AE\u33AF\u33DB\u33A9\u33AA\u33AB\u33AC\u33DD\u33D0\u33D3\u33C3\u33C9\u33DC\u33C6\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCB6D\uCB6E\uCB6F\uCB70\uCB71\uCB72\uCB73\uCB74\uCB75\uCB76\uCB77\uCB7A\uCB7B\uCB7C\uCB7D\uCB7E\uCB7F\uCB80\uCB81\uCB82\uCB83\uCB84\uCB85\uCB86\uCB87\uCB88\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCB89\uCB8A\uCB8B\uCB8C\uCB8D\uCB8E\uCB8F\uCB90\uCB91\uCB92\uCB93\uCB94\uCB95\uCB96\uCB97\uCB98\uCB99\uCB9A\uCB9B\uCB9D\uCB9E\uCB9F\uCBA0\uCBA1\uCBA2\uCBA3\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCBA4\uCBA5\uCBA6\uCBA7\uCBA8\uCBA9\uCBAA\uCBAB\uCBAC\uCBAD\uCBAE\uCBAF\uCBB0\uCBB1\uCBB2\uCBB3\uCBB4\uCBB5\uCBB6\uCBB7\uCBB9\uCBBA\uCBBB\uCBBC\uCBBD\uCBBE\uCBBF\uCBC0\uCBC1\uCBC2\uCBC3\uCBC4\xC6\xD0\xAA\u0126\uFFFD\u0132\uFFFD\u013F\u0141\xD8\u0152\xBA\xDE\u0166\u014A\uFFFD\u3260\u3261\u3262\u3263\u3264\u3265\u3266\u3267\u3268\u3269\u326A\u326B\u326C\u326D\u326E\u326F\u3270\u3271\u3272\u3273\u3274\u3275\u3276\u3277\u3278\u3279\u327A\u327B\u24D0\u24D1\u24D2\u24D3\u24D4\u24D5\u24D6\u24D7\u24D8\u24D9\u24DA\u24DB\u24DC\u24DD\u24DE\u24DF\u24E0\u24E1\u24E2\u24E3\u24E4\u24E5\u24E6\u24E7\u24E8\u24E9\u2460\u2461\u2462\u2463\u2464\u2465\u2466\u2467\u2468\u2469\u246A\u246B\u246C\u246D\u246E\xBD\u2153\u2154\xBC\xBE\u215B\u215C\u215D\u215E\uCBC5\uCBC6\uCBC7\uCBC8\uCBC9\uCBCA\uCBCB\uCBCC\uCBCD\uCBCE\uCBCF\uCBD0\uCBD1\uCBD2\uCBD3\uCBD5\uCBD6\uCBD7\uCBD8\uCBD9\uCBDA\uCBDB\uCBDC\uCBDD\uCBDE\uCBDF\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCBE0\uCBE1\uCBE2\uCBE3\uCBE5\uCBE6\uCBE8\uCBEA\uCBEB\uCBEC\uCBED\uCBEE\uCBEF\uCBF0\uCBF1\uCBF2\uCBF3\uCBF4\uCBF5\uCBF6\uCBF7\uCBF8\uCBF9\uCBFA\uCBFB\uCBFC\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCBFD\uCBFE\uCBFF\uCC00\uCC01\uCC02\uCC03\uCC04\uCC05\uCC06\uCC07\uCC08\uCC09\uCC0A\uCC0B\uCC0E\uCC0F\uCC11\uCC12\uCC13\uCC15\uCC16\uCC17\uCC18\uCC19\uCC1A\uCC1B\uCC1E\uCC1F\uCC20\uCC23\uCC24\xE6\u0111\xF0\u0127\u0131\u0133\u0138\u0140\u0142\xF8\u0153\xDF\xFE\u0167\u014B\u0149\u3200\u3201\u3202\u3203\u3204\u3205\u3206\u3207\u3208\u3209\u320A\u320B\u320C\u320D\u320E\u320F\u3210\u3211\u3212\u3213\u3214\u3215\u3216\u3217\u3218\u3219\u321A\u321B\u249C\u249D\u249E\u249F\u24A0\u24A1\u24A2\u24A3\u24A4\u24A5\u24A6\u24A7\u24A8\u24A9\u24AA\u24AB\u24AC\u24AD\u24AE\u24AF\u24B0\u24B1\u24B2\u24B3\u24B4\u24B5\u2474\u2475\u2476\u2477\u2478\u2479\u247A\u247B\u247C\u247D\u247E\u247F\u2480\u2481\u2482\xB9\xB2\xB3\u2074\u207F\u2081\u2082\u2083\u2084\uCC25\uCC26\uCC2A\uCC2B\uCC2D\uCC2F\uCC31\uCC32\uCC33\uCC34\uCC35\uCC36\uCC37\uCC3A\uCC3F\uCC40\uCC41\uCC42\uCC43\uCC46\uCC47\uCC49\uCC4A\uCC4B\uCC4D\uCC4E\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCC4F\uCC50\uCC51\uCC52\uCC53\uCC56\uCC5A\uCC5B\uCC5C\uCC5D\uCC5E\uCC5F\uCC61\uCC62\uCC63\uCC65\uCC67\uCC69\uCC6A\uCC6B\uCC6C\uCC6D\uCC6E\uCC6F\uCC71\uCC72\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCC73\uCC74\uCC76\uCC77\uCC78\uCC79\uCC7A\uCC7B\uCC7C\uCC7D\uCC7E\uCC7F\uCC80\uCC81\uCC82\uCC83\uCC84\uCC85\uCC86\uCC87\uCC88\uCC89\uCC8A\uCC8B\uCC8C\uCC8D\uCC8E\uCC8F\uCC90\uCC91\uCC92\uCC93\u3041\u3042\u3043\u3044\u3045\u3046\u3047\u3048\u3049\u304A\u304B\u304C\u304D\u304E\u304F\u3050\u3051\u3052\u3053\u3054\u3055\u3056\u3057\u3058\u3059\u305A\u305B\u305C\u305D\u305E\u305F\u3060\u3061\u3062\u3063\u3064\u3065\u3066\u3067\u3068\u3069\u306A\u306B\u306C\u306D\u306E\u306F\u3070\u3071\u3072\u3073\u3074\u3075\u3076\u3077\u3078\u3079\u307A\u307B\u307C\u307D\u307E\u307F\u3080\u3081\u3082\u3083\u3084\u3085\u3086\u3087\u3088\u3089\u308A\u308B\u308C\u308D\u308E\u308F\u3090\u3091\u3092\u3093\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCC94\uCC95\uCC96\uCC97\uCC9A\uCC9B\uCC9D\uCC9E\uCC9F\uCCA1\uCCA2\uCCA3\uCCA4\uCCA5\uCCA6\uCCA7\uCCAA\uCCAE\uCCAF\uCCB0\uCCB1\uCCB2\uCCB3\uCCB6\uCCB7\uCCB9\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCCBA\uCCBB\uCCBD\uCCBE\uCCBF\uCCC0\uCCC1\uCCC2\uCCC3\uCCC6\uCCC8\uCCCA\uCCCB\uCCCC\uCCCD\uCCCE\uCCCF\uCCD1\uCCD2\uCCD3\uCCD5\uCCD6\uCCD7\uCCD8\uCCD9\uCCDA\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCCDB\uCCDC\uCCDD\uCCDE\uCCDF\uCCE0\uCCE1\uCCE2\uCCE3\uCCE5\uCCE6\uCCE7\uCCE8\uCCE9\uCCEA\uCCEB\uCCED\uCCEE\uCCEF\uCCF1\uCCF2\uCCF3\uCCF4\uCCF5\uCCF6\uCCF7\uCCF8\uCCF9\uCCFA\uCCFB\uCCFC\uCCFD\u30A1\u30A2\u30A3\u30A4\u30A5\u30A6\u30A7\u30A8\u30A9\u30AA\u30AB\u30AC\u30AD\u30AE\u30AF\u30B0\u30B1\u30B2\u30B3\u30B4\u30B5\u30B6\u30B7\u30B8\u30B9\u30BA\u30BB\u30BC\u30BD\u30BE\u30BF\u30C0\u30C1\u30C2\u30C3\u30C4\u30C5\u30C6\u30C7\u30C8\u30C9\u30CA\u30CB\u30CC\u30CD\u30CE\u30CF\u30D0\u30D1\u30D2\u30D3\u30D4\u30D5\u30D6\u30D7\u30D8\u30D9\u30DA\u30DB\u30DC\u30DD\u30DE\u30DF\u30E0\u30E1\u30E2\u30E3\u30E4\u30E5\u30E6\u30E7\u30E8\u30E9\u30EA\u30EB\u30EC\u30ED\u30EE\u30EF\u30F0\u30F1\u30F2\u30F3\u30F4\u30F5\u30F6\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCCFE\uCCFF\uCD00\uCD02\uCD03\uCD04\uCD05\uCD06\uCD07\uCD0A\uCD0B\uCD0D\uCD0E\uCD0F\uCD11\uCD12\uCD13\uCD14\uCD15\uCD16\uCD17\uCD1A\uCD1C\uCD1E\uCD1F\uCD20\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCD21\uCD22\uCD23\uCD25\uCD26\uCD27\uCD29\uCD2A\uCD2B\uCD2D\uCD2E\uCD2F\uCD30\uCD31\uCD32\uCD33\uCD34\uCD35\uCD36\uCD37\uCD38\uCD3A\uCD3B\uCD3C\uCD3D\uCD3E\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCD3F\uCD40\uCD41\uCD42\uCD43\uCD44\uCD45\uCD46\uCD47\uCD48\uCD49\uCD4A\uCD4B\uCD4C\uCD4D\uCD4E\uCD4F\uCD50\uCD51\uCD52\uCD53\uCD54\uCD55\uCD56\uCD57\uCD58\uCD59\uCD5A\uCD5B\uCD5D\uCD5E\uCD5F\u0410\u0411\u0412\u0413\u0414\u0415\u0401\u0416\u0417\u0418\u0419\u041A\u041B\u041C\u041D\u041E\u041F\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042A\u042B\u042C\u042D\u042E\u042F\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u0430\u0431\u0432\u0433\u0434\u0435\u0451\u0436\u0437\u0438\u0439\u043A\u043B\u043C\u043D\u043E\u043F\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044A\u044B\u044C\u044D\u044E\u044F\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCD61\uCD62\uCD63\uCD65\uCD66\uCD67\uCD68\uCD69\uCD6A\uCD6B\uCD6E\uCD70\uCD72\uCD73\uCD74\uCD75\uCD76\uCD77\uCD79\uCD7A\uCD7B\uCD7C\uCD7D\uCD7E\uCD7F\uCD80\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCD81\uCD82\uCD83\uCD84\uCD85\uCD86\uCD87\uCD89\uCD8A\uCD8B\uCD8C\uCD8D\uCD8E\uCD8F\uCD90\uCD91\uCD92\uCD93\uCD96\uCD97\uCD99\uCD9A\uCD9B\uCD9D\uCD9E\uCD9F\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCDA0\uCDA1\uCDA2\uCDA3\uCDA6\uCDA8\uCDAA\uCDAB\uCDAC\uCDAD\uCDAE\uCDAF\uCDB1\uCDB2\uCDB3\uCDB4\uCDB5\uCDB6\uCDB7\uCDB8\uCDB9\uCDBA\uCDBB\uCDBC\uCDBD\uCDBE\uCDBF\uCDC0\uCDC1\uCDC2\uCDC3\uCDC5\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCDC6\uCDC7\uCDC8\uCDC9\uCDCA\uCDCB\uCDCD\uCDCE\uCDCF\uCDD1\uCDD2\uCDD3\uCDD4\uCDD5\uCDD6\uCDD7\uCDD8\uCDD9\uCDDA\uCDDB\uCDDC\uCDDD\uCDDE\uCDDF\uCDE0\uCDE1\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCDE2\uCDE3\uCDE4\uCDE5\uCDE6\uCDE7\uCDE9\uCDEA\uCDEB\uCDED\uCDEE\uCDEF\uCDF1\uCDF2\uCDF3\uCDF4\uCDF5\uCDF6\uCDF7\uCDFA\uCDFC\uCDFE\uCDFF\uCE00\uCE01\uCE02\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCE03\uCE05\uCE06\uCE07\uCE09\uCE0A\uCE0B\uCE0D\uCE0E\uCE0F\uCE10\uCE11\uCE12\uCE13\uCE15\uCE16\uCE17\uCE18\uCE1A\uCE1B\uCE1C\uCE1D\uCE1E\uCE1F\uCE22\uCE23\uCE25\uCE26\uCE27\uCE29\uCE2A\uCE2B\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCE2C\uCE2D\uCE2E\uCE2F\uCE32\uCE34\uCE36\uCE37\uCE38\uCE39\uCE3A\uCE3B\uCE3C\uCE3D\uCE3E\uCE3F\uCE40\uCE41\uCE42\uCE43\uCE44\uCE45\uCE46\uCE47\uCE48\uCE49\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCE4A\uCE4B\uCE4C\uCE4D\uCE4E\uCE4F\uCE50\uCE51\uCE52\uCE53\uCE54\uCE55\uCE56\uCE57\uCE5A\uCE5B\uCE5D\uCE5E\uCE62\uCE63\uCE64\uCE65\uCE66\uCE67\uCE6A\uCE6C\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCE6E\uCE6F\uCE70\uCE71\uCE72\uCE73\uCE76\uCE77\uCE79\uCE7A\uCE7B\uCE7D\uCE7E\uCE7F\uCE80\uCE81\uCE82\uCE83\uCE86\uCE88\uCE8A\uCE8B\uCE8C\uCE8D\uCE8E\uCE8F\uCE92\uCE93\uCE95\uCE96\uCE97\uCE99\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCE9A\uCE9B\uCE9C\uCE9D\uCE9E\uCE9F\uCEA2\uCEA6\uCEA7\uCEA8\uCEA9\uCEAA\uCEAB\uCEAE\uCEAF\uCEB0\uCEB1\uCEB2\uCEB3\uCEB4\uCEB5\uCEB6\uCEB7\uCEB8\uCEB9\uCEBA\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCEBB\uCEBC\uCEBD\uCEBE\uCEBF\uCEC0\uCEC2\uCEC3\uCEC4\uCEC5\uCEC6\uCEC7\uCEC8\uCEC9\uCECA\uCECB\uCECC\uCECD\uCECE\uCECF\uCED0\uCED1\uCED2\uCED3\uCED4\uCED5\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCED6\uCED7\uCED8\uCED9\uCEDA\uCEDB\uCEDC\uCEDD\uCEDE\uCEDF\uCEE0\uCEE1\uCEE2\uCEE3\uCEE6\uCEE7\uCEE9\uCEEA\uCEED\uCEEE\uCEEF\uCEF0\uCEF1\uCEF2\uCEF3\uCEF6\uCEFA\uCEFB\uCEFC\uCEFD\uCEFE\uCEFF\uAC00\uAC01\uAC04\uAC07\uAC08\uAC09\uAC0A\uAC10\uAC11\uAC12\uAC13\uAC14\uAC15\uAC16\uAC17\uAC19\uAC1A\uAC1B\uAC1C\uAC1D\uAC20\uAC24\uAC2C\uAC2D\uAC2F\uAC30\uAC31\uAC38\uAC39\uAC3C\uAC40\uAC4B\uAC4D\uAC54\uAC58\uAC5C\uAC70\uAC71\uAC74\uAC77\uAC78\uAC7A\uAC80\uAC81\uAC83\uAC84\uAC85\uAC86\uAC89\uAC8A\uAC8B\uAC8C\uAC90\uAC94\uAC9C\uAC9D\uAC9F\uACA0\uACA1\uACA8\uACA9\uACAA\uACAC\uACAF\uACB0\uACB8\uACB9\uACBB\uACBC\uACBD\uACC1\uACC4\uACC8\uACCC\uACD5\uACD7\uACE0\uACE1\uACE4\uACE7\uACE8\uACEA\uACEC\uACEF\uACF0\uACF1\uACF3\uACF5\uACF6\uACFC\uACFD\uAD00\uAD04\uAD06\uCF02\uCF03\uCF05\uCF06\uCF07\uCF09\uCF0A\uCF0B\uCF0C\uCF0D\uCF0E\uCF0F\uCF12\uCF14\uCF16\uCF17\uCF18\uCF19\uCF1A\uCF1B\uCF1D\uCF1E\uCF1F\uCF21\uCF22\uCF23\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCF25\uCF26\uCF27\uCF28\uCF29\uCF2A\uCF2B\uCF2E\uCF32\uCF33\uCF34\uCF35\uCF36\uCF37\uCF39\uCF3A\uCF3B\uCF3C\uCF3D\uCF3E\uCF3F\uCF40\uCF41\uCF42\uCF43\uCF44\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCF45\uCF46\uCF47\uCF48\uCF49\uCF4A\uCF4B\uCF4C\uCF4D\uCF4E\uCF4F\uCF50\uCF51\uCF52\uCF53\uCF56\uCF57\uCF59\uCF5A\uCF5B\uCF5D\uCF5E\uCF5F\uCF60\uCF61\uCF62\uCF63\uCF66\uCF68\uCF6A\uCF6B\uCF6C\uAD0C\uAD0D\uAD0F\uAD11\uAD18\uAD1C\uAD20\uAD29\uAD2C\uAD2D\uAD34\uAD35\uAD38\uAD3C\uAD44\uAD45\uAD47\uAD49\uAD50\uAD54\uAD58\uAD61\uAD63\uAD6C\uAD6D\uAD70\uAD73\uAD74\uAD75\uAD76\uAD7B\uAD7C\uAD7D\uAD7F\uAD81\uAD82\uAD88\uAD89\uAD8C\uAD90\uAD9C\uAD9D\uADA4\uADB7\uADC0\uADC1\uADC4\uADC8\uADD0\uADD1\uADD3\uADDC\uADE0\uADE4\uADF8\uADF9\uADFC\uADFF\uAE00\uAE01\uAE08\uAE09\uAE0B\uAE0D\uAE14\uAE30\uAE31\uAE34\uAE37\uAE38\uAE3A\uAE40\uAE41\uAE43\uAE45\uAE46\uAE4A\uAE4C\uAE4D\uAE4E\uAE50\uAE54\uAE56\uAE5C\uAE5D\uAE5F\uAE60\uAE61\uAE65\uAE68\uAE69\uAE6C\uAE70\uAE78\uCF6D\uCF6E\uCF6F\uCF72\uCF73\uCF75\uCF76\uCF77\uCF79\uCF7A\uCF7B\uCF7C\uCF7D\uCF7E\uCF7F\uCF81\uCF82\uCF83\uCF84\uCF86\uCF87\uCF88\uCF89\uCF8A\uCF8B\uCF8D\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCF8E\uCF8F\uCF90\uCF91\uCF92\uCF93\uCF94\uCF95\uCF96\uCF97\uCF98\uCF99\uCF9A\uCF9B\uCF9C\uCF9D\uCF9E\uCF9F\uCFA0\uCFA2\uCFA3\uCFA4\uCFA5\uCFA6\uCFA7\uCFA9\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCFAA\uCFAB\uCFAC\uCFAD\uCFAE\uCFAF\uCFB1\uCFB2\uCFB3\uCFB4\uCFB5\uCFB6\uCFB7\uCFB8\uCFB9\uCFBA\uCFBB\uCFBC\uCFBD\uCFBE\uCFBF\uCFC0\uCFC1\uCFC2\uCFC3\uCFC5\uCFC6\uCFC7\uCFC8\uCFC9\uCFCA\uCFCB\uAE79\uAE7B\uAE7C\uAE7D\uAE84\uAE85\uAE8C\uAEBC\uAEBD\uAEBE\uAEC0\uAEC4\uAECC\uAECD\uAECF\uAED0\uAED1\uAED8\uAED9\uAEDC\uAEE8\uAEEB\uAEED\uAEF4\uAEF8\uAEFC\uAF07\uAF08\uAF0D\uAF10\uAF2C\uAF2D\uAF30\uAF32\uAF34\uAF3C\uAF3D\uAF3F\uAF41\uAF42\uAF43\uAF48\uAF49\uAF50\uAF5C\uAF5D\uAF64\uAF65\uAF79\uAF80\uAF84\uAF88\uAF90\uAF91\uAF95\uAF9C\uAFB8\uAFB9\uAFBC\uAFC0\uAFC7\uAFC8\uAFC9\uAFCB\uAFCD\uAFCE\uAFD4\uAFDC\uAFE8\uAFE9\uAFF0\uAFF1\uAFF4\uAFF8\uB000\uB001\uB004\uB00C\uB010\uB014\uB01C\uB01D\uB028\uB044\uB045\uB048\uB04A\uB04C\uB04E\uB053\uB054\uB055\uB057\uB059\uCFCC\uCFCD\uCFCE\uCFCF\uCFD0\uCFD1\uCFD2\uCFD3\uCFD4\uCFD5\uCFD6\uCFD7\uCFD8\uCFD9\uCFDA\uCFDB\uCFDC\uCFDD\uCFDE\uCFDF\uCFE2\uCFE3\uCFE5\uCFE6\uCFE7\uCFE9\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uCFEA\uCFEB\uCFEC\uCFED\uCFEE\uCFEF\uCFF2\uCFF4\uCFF6\uCFF7\uCFF8\uCFF9\uCFFA\uCFFB\uCFFD\uCFFE\uCFFF\uD001\uD002\uD003\uD005\uD006\uD007\uD008\uD009\uD00A\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD00B\uD00C\uD00D\uD00E\uD00F\uD010\uD012\uD013\uD014\uD015\uD016\uD017\uD019\uD01A\uD01B\uD01C\uD01D\uD01E\uD01F\uD020\uD021\uD022\uD023\uD024\uD025\uD026\uD027\uD028\uD029\uD02A\uD02B\uD02C\uB05D\uB07C\uB07D\uB080\uB084\uB08C\uB08D\uB08F\uB091\uB098\uB099\uB09A\uB09C\uB09F\uB0A0\uB0A1\uB0A2\uB0A8\uB0A9\uB0AB\uB0AC\uB0AD\uB0AE\uB0AF\uB0B1\uB0B3\uB0B4\uB0B5\uB0B8\uB0BC\uB0C4\uB0C5\uB0C7\uB0C8\uB0C9\uB0D0\uB0D1\uB0D4\uB0D8\uB0E0\uB0E5\uB108\uB109\uB10B\uB10C\uB110\uB112\uB113\uB118\uB119\uB11B\uB11C\uB11D\uB123\uB124\uB125\uB128\uB12C\uB134\uB135\uB137\uB138\uB139\uB140\uB141\uB144\uB148\uB150\uB151\uB154\uB155\uB158\uB15C\uB160\uB178\uB179\uB17C\uB180\uB182\uB188\uB189\uB18B\uB18D\uB192\uB193\uB194\uB198\uB19C\uB1A8\uB1CC\uB1D0\uB1D4\uB1DC\uB1DD\uD02E\uD02F\uD030\uD031\uD032\uD033\uD036\uD037\uD039\uD03A\uD03B\uD03D\uD03E\uD03F\uD040\uD041\uD042\uD043\uD046\uD048\uD04A\uD04B\uD04C\uD04D\uD04E\uD04F\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD051\uD052\uD053\uD055\uD056\uD057\uD059\uD05A\uD05B\uD05C\uD05D\uD05E\uD05F\uD061\uD062\uD063\uD064\uD065\uD066\uD067\uD068\uD069\uD06A\uD06B\uD06E\uD06F\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD071\uD072\uD073\uD075\uD076\uD077\uD078\uD079\uD07A\uD07B\uD07E\uD07F\uD080\uD082\uD083\uD084\uD085\uD086\uD087\uD088\uD089\uD08A\uD08B\uD08C\uD08D\uD08E\uD08F\uD090\uD091\uD092\uD093\uD094\uB1DF\uB1E8\uB1E9\uB1EC\uB1F0\uB1F9\uB1FB\uB1FD\uB204\uB205\uB208\uB20B\uB20C\uB214\uB215\uB217\uB219\uB220\uB234\uB23C\uB258\uB25C\uB260\uB268\uB269\uB274\uB275\uB27C\uB284\uB285\uB289\uB290\uB291\uB294\uB298\uB299\uB29A\uB2A0\uB2A1\uB2A3\uB2A5\uB2A6\uB2AA\uB2AC\uB2B0\uB2B4\uB2C8\uB2C9\uB2CC\uB2D0\uB2D2\uB2D8\uB2D9\uB2DB\uB2DD\uB2E2\uB2E4\uB2E5\uB2E6\uB2E8\uB2EB\uB2EC\uB2ED\uB2EE\uB2EF\uB2F3\uB2F4\uB2F5\uB2F7\uB2F8\uB2F9\uB2FA\uB2FB\uB2FF\uB300\uB301\uB304\uB308\uB310\uB311\uB313\uB314\uB315\uB31C\uB354\uB355\uB356\uB358\uB35B\uB35C\uB35E\uB35F\uB364\uB365\uD095\uD096\uD097\uD098\uD099\uD09A\uD09B\uD09C\uD09D\uD09E\uD09F\uD0A0\uD0A1\uD0A2\uD0A3\uD0A6\uD0A7\uD0A9\uD0AA\uD0AB\uD0AD\uD0AE\uD0AF\uD0B0\uD0B1\uD0B2\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD0B3\uD0B6\uD0B8\uD0BA\uD0BB\uD0BC\uD0BD\uD0BE\uD0BF\uD0C2\uD0C3\uD0C5\uD0C6\uD0C7\uD0CA\uD0CB\uD0CC\uD0CD\uD0CE\uD0CF\uD0D2\uD0D6\uD0D7\uD0D8\uD0D9\uD0DA\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD0DB\uD0DE\uD0DF\uD0E1\uD0E2\uD0E3\uD0E5\uD0E6\uD0E7\uD0E8\uD0E9\uD0EA\uD0EB\uD0EE\uD0F2\uD0F3\uD0F4\uD0F5\uD0F6\uD0F7\uD0F9\uD0FA\uD0FB\uD0FC\uD0FD\uD0FE\uD0FF\uD100\uD101\uD102\uD103\uD104\uB367\uB369\uB36B\uB36E\uB370\uB371\uB374\uB378\uB380\uB381\uB383\uB384\uB385\uB38C\uB390\uB394\uB3A0\uB3A1\uB3A8\uB3AC\uB3C4\uB3C5\uB3C8\uB3CB\uB3CC\uB3CE\uB3D0\uB3D4\uB3D5\uB3D7\uB3D9\uB3DB\uB3DD\uB3E0\uB3E4\uB3E8\uB3FC\uB410\uB418\uB41C\uB420\uB428\uB429\uB42B\uB434\uB450\uB451\uB454\uB458\uB460\uB461\uB463\uB465\uB46C\uB480\uB488\uB49D\uB4A4\uB4A8\uB4AC\uB4B5\uB4B7\uB4B9\uB4C0\uB4C4\uB4C8\uB4D0\uB4D5\uB4DC\uB4DD\uB4E0\uB4E3\uB4E4\uB4E6\uB4EC\uB4ED\uB4EF\uB4F1\uB4F8\uB514\uB515\uB518\uB51B\uB51C\uB524\uB525\uB527\uB528\uB529\uB52A\uB530\uB531\uB534\uB538\uD105\uD106\uD107\uD108\uD109\uD10A\uD10B\uD10C\uD10E\uD10F\uD110\uD111\uD112\uD113\uD114\uD115\uD116\uD117\uD118\uD119\uD11A\uD11B\uD11C\uD11D\uD11E\uD11F\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD120\uD121\uD122\uD123\uD124\uD125\uD126\uD127\uD128\uD129\uD12A\uD12B\uD12C\uD12D\uD12E\uD12F\uD132\uD133\uD135\uD136\uD137\uD139\uD13B\uD13C\uD13D\uD13E\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD13F\uD142\uD146\uD147\uD148\uD149\uD14A\uD14B\uD14E\uD14F\uD151\uD152\uD153\uD155\uD156\uD157\uD158\uD159\uD15A\uD15B\uD15E\uD160\uD162\uD163\uD164\uD165\uD166\uD167\uD169\uD16A\uD16B\uD16D\uB540\uB541\uB543\uB544\uB545\uB54B\uB54C\uB54D\uB550\uB554\uB55C\uB55D\uB55F\uB560\uB561\uB5A0\uB5A1\uB5A4\uB5A8\uB5AA\uB5AB\uB5B0\uB5B1\uB5B3\uB5B4\uB5B5\uB5BB\uB5BC\uB5BD\uB5C0\uB5C4\uB5CC\uB5CD\uB5CF\uB5D0\uB5D1\uB5D8\uB5EC\uB610\uB611\uB614\uB618\uB625\uB62C\uB634\uB648\uB664\uB668\uB69C\uB69D\uB6A0\uB6A4\uB6AB\uB6AC\uB6B1\uB6D4\uB6F0\uB6F4\uB6F8\uB700\uB701\uB705\uB728\uB729\uB72C\uB72F\uB730\uB738\uB739\uB73B\uB744\uB748\uB74C\uB754\uB755\uB760\uB764\uB768\uB770\uB771\uB773\uB775\uB77C\uB77D\uB780\uB784\uB78C\uB78D\uB78F\uB790\uB791\uB792\uB796\uB797\uD16E\uD16F\uD170\uD171\uD172\uD173\uD174\uD175\uD176\uD177\uD178\uD179\uD17A\uD17B\uD17D\uD17E\uD17F\uD180\uD181\uD182\uD183\uD185\uD186\uD187\uD189\uD18A\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD18B\uD18C\uD18D\uD18E\uD18F\uD190\uD191\uD192\uD193\uD194\uD195\uD196\uD197\uD198\uD199\uD19A\uD19B\uD19C\uD19D\uD19E\uD19F\uD1A2\uD1A3\uD1A5\uD1A6\uD1A7\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD1A9\uD1AA\uD1AB\uD1AC\uD1AD\uD1AE\uD1AF\uD1B2\uD1B4\uD1B6\uD1B7\uD1B8\uD1B9\uD1BB\uD1BD\uD1BE\uD1BF\uD1C1\uD1C2\uD1C3\uD1C4\uD1C5\uD1C6\uD1C7\uD1C8\uD1C9\uD1CA\uD1CB\uD1CC\uD1CD\uD1CE\uD1CF\uB798\uB799\uB79C\uB7A0\uB7A8\uB7A9\uB7AB\uB7AC\uB7AD\uB7B4\uB7B5\uB7B8\uB7C7\uB7C9\uB7EC\uB7ED\uB7F0\uB7F4\uB7FC\uB7FD\uB7FF\uB800\uB801\uB807\uB808\uB809\uB80C\uB810\uB818\uB819\uB81B\uB81D\uB824\uB825\uB828\uB82C\uB834\uB835\uB837\uB838\uB839\uB840\uB844\uB851\uB853\uB85C\uB85D\uB860\uB864\uB86C\uB86D\uB86F\uB871\uB878\uB87C\uB88D\uB8A8\uB8B0\uB8B4\uB8B8\uB8C0\uB8C1\uB8C3\uB8C5\uB8CC\uB8D0\uB8D4\uB8DD\uB8DF\uB8E1\uB8E8\uB8E9\uB8EC\uB8F0\uB8F8\uB8F9\uB8FB\uB8FD\uB904\uB918\uB920\uB93C\uB93D\uB940\uB944\uB94C\uB94F\uB951\uB958\uB959\uB95C\uB960\uB968\uB969\uD1D0\uD1D1\uD1D2\uD1D3\uD1D4\uD1D5\uD1D6\uD1D7\uD1D9\uD1DA\uD1DB\uD1DC\uD1DD\uD1DE\uD1DF\uD1E0\uD1E1\uD1E2\uD1E3\uD1E4\uD1E5\uD1E6\uD1E7\uD1E8\uD1E9\uD1EA\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD1EB\uD1EC\uD1ED\uD1EE\uD1EF\uD1F0\uD1F1\uD1F2\uD1F3\uD1F5\uD1F6\uD1F7\uD1F9\uD1FA\uD1FB\uD1FC\uD1FD\uD1FE\uD1FF\uD200\uD201\uD202\uD203\uD204\uD205\uD206\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD208\uD20A\uD20B\uD20C\uD20D\uD20E\uD20F\uD211\uD212\uD213\uD214\uD215\uD216\uD217\uD218\uD219\uD21A\uD21B\uD21C\uD21D\uD21E\uD21F\uD220\uD221\uD222\uD223\uD224\uD225\uD226\uD227\uD228\uD229\uB96B\uB96D\uB974\uB975\uB978\uB97C\uB984\uB985\uB987\uB989\uB98A\uB98D\uB98E\uB9AC\uB9AD\uB9B0\uB9B4\uB9BC\uB9BD\uB9BF\uB9C1\uB9C8\uB9C9\uB9CC\uB9CE\uB9CF\uB9D0\uB9D1\uB9D2\uB9D8\uB9D9\uB9DB\uB9DD\uB9DE\uB9E1\uB9E3\uB9E4\uB9E5\uB9E8\uB9EC\uB9F4\uB9F5\uB9F7\uB9F8\uB9F9\uB9FA\uBA00\uBA01\uBA08\uBA15\uBA38\uBA39\uBA3C\uBA40\uBA42\uBA48\uBA49\uBA4B\uBA4D\uBA4E\uBA53\uBA54\uBA55\uBA58\uBA5C\uBA64\uBA65\uBA67\uBA68\uBA69\uBA70\uBA71\uBA74\uBA78\uBA83\uBA84\uBA85\uBA87\uBA8C\uBAA8\uBAA9\uBAAB\uBAAC\uBAB0\uBAB2\uBAB8\uBAB9\uBABB\uBABD\uBAC4\uBAC8\uBAD8\uBAD9\uBAFC\uD22A\uD22B\uD22E\uD22F\uD231\uD232\uD233\uD235\uD236\uD237\uD238\uD239\uD23A\uD23B\uD23E\uD240\uD242\uD243\uD244\uD245\uD246\uD247\uD249\uD24A\uD24B\uD24C\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD24D\uD24E\uD24F\uD250\uD251\uD252\uD253\uD254\uD255\uD256\uD257\uD258\uD259\uD25A\uD25B\uD25D\uD25E\uD25F\uD260\uD261\uD262\uD263\uD265\uD266\uD267\uD268\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD269\uD26A\uD26B\uD26C\uD26D\uD26E\uD26F\uD270\uD271\uD272\uD273\uD274\uD275\uD276\uD277\uD278\uD279\uD27A\uD27B\uD27C\uD27D\uD27E\uD27F\uD282\uD283\uD285\uD286\uD287\uD289\uD28A\uD28B\uD28C\uBB00\uBB04\uBB0D\uBB0F\uBB11\uBB18\uBB1C\uBB20\uBB29\uBB2B\uBB34\uBB35\uBB36\uBB38\uBB3B\uBB3C\uBB3D\uBB3E\uBB44\uBB45\uBB47\uBB49\uBB4D\uBB4F\uBB50\uBB54\uBB58\uBB61\uBB63\uBB6C\uBB88\uBB8C\uBB90\uBBA4\uBBA8\uBBAC\uBBB4\uBBB7\uBBC0\uBBC4\uBBC8\uBBD0\uBBD3\uBBF8\uBBF9\uBBFC\uBBFF\uBC00\uBC02\uBC08\uBC09\uBC0B\uBC0C\uBC0D\uBC0F\uBC11\uBC14\uBC15\uBC16\uBC17\uBC18\uBC1B\uBC1C\uBC1D\uBC1E\uBC1F\uBC24\uBC25\uBC27\uBC29\uBC2D\uBC30\uBC31\uBC34\uBC38\uBC40\uBC41\uBC43\uBC44\uBC45\uBC49\uBC4C\uBC4D\uBC50\uBC5D\uBC84\uBC85\uBC88\uBC8B\uBC8C\uBC8E\uBC94\uBC95\uBC97\uD28D\uD28E\uD28F\uD292\uD293\uD294\uD296\uD297\uD298\uD299\uD29A\uD29B\uD29D\uD29E\uD29F\uD2A1\uD2A2\uD2A3\uD2A5\uD2A6\uD2A7\uD2A8\uD2A9\uD2AA\uD2AB\uD2AD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD2AE\uD2AF\uD2B0\uD2B2\uD2B3\uD2B4\uD2B5\uD2B6\uD2B7\uD2BA\uD2BB\uD2BD\uD2BE\uD2C1\uD2C3\uD2C4\uD2C5\uD2C6\uD2C7\uD2CA\uD2CC\uD2CD\uD2CE\uD2CF\uD2D0\uD2D1\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD2D2\uD2D3\uD2D5\uD2D6\uD2D7\uD2D9\uD2DA\uD2DB\uD2DD\uD2DE\uD2DF\uD2E0\uD2E1\uD2E2\uD2E3\uD2E6\uD2E7\uD2E8\uD2E9\uD2EA\uD2EB\uD2EC\uD2ED\uD2EE\uD2EF\uD2F2\uD2F3\uD2F5\uD2F6\uD2F7\uD2F9\uD2FA\uBC99\uBC9A\uBCA0\uBCA1\uBCA4\uBCA7\uBCA8\uBCB0\uBCB1\uBCB3\uBCB4\uBCB5\uBCBC\uBCBD\uBCC0\uBCC4\uBCCD\uBCCF\uBCD0\uBCD1\uBCD5\uBCD8\uBCDC\uBCF4\uBCF5\uBCF6\uBCF8\uBCFC\uBD04\uBD05\uBD07\uBD09\uBD10\uBD14\uBD24\uBD2C\uBD40\uBD48\uBD49\uBD4C\uBD50\uBD58\uBD59\uBD64\uBD68\uBD80\uBD81\uBD84\uBD87\uBD88\uBD89\uBD8A\uBD90\uBD91\uBD93\uBD95\uBD99\uBD9A\uBD9C\uBDA4\uBDB0\uBDB8\uBDD4\uBDD5\uBDD8\uBDDC\uBDE9\uBDF0\uBDF4\uBDF8\uBE00\uBE03\uBE05\uBE0C\uBE0D\uBE10\uBE14\uBE1C\uBE1D\uBE1F\uBE44\uBE45\uBE48\uBE4C\uBE4E\uBE54\uBE55\uBE57\uBE59\uBE5A\uBE5B\uBE60\uBE61\uBE64\uD2FB\uD2FC\uD2FD\uD2FE\uD2FF\uD302\uD304\uD306\uD307\uD308\uD309\uD30A\uD30B\uD30F\uD311\uD312\uD313\uD315\uD317\uD318\uD319\uD31A\uD31B\uD31E\uD322\uD323\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD324\uD326\uD327\uD32A\uD32B\uD32D\uD32E\uD32F\uD331\uD332\uD333\uD334\uD335\uD336\uD337\uD33A\uD33E\uD33F\uD340\uD341\uD342\uD343\uD346\uD347\uD348\uD349\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD34A\uD34B\uD34C\uD34D\uD34E\uD34F\uD350\uD351\uD352\uD353\uD354\uD355\uD356\uD357\uD358\uD359\uD35A\uD35B\uD35C\uD35D\uD35E\uD35F\uD360\uD361\uD362\uD363\uD364\uD365\uD366\uD367\uD368\uD369\uBE68\uBE6A\uBE70\uBE71\uBE73\uBE74\uBE75\uBE7B\uBE7C\uBE7D\uBE80\uBE84\uBE8C\uBE8D\uBE8F\uBE90\uBE91\uBE98\uBE99\uBEA8\uBED0\uBED1\uBED4\uBED7\uBED8\uBEE0\uBEE3\uBEE4\uBEE5\uBEEC\uBF01\uBF08\uBF09\uBF18\uBF19\uBF1B\uBF1C\uBF1D\uBF40\uBF41\uBF44\uBF48\uBF50\uBF51\uBF55\uBF94\uBFB0\uBFC5\uBFCC\uBFCD\uBFD0\uBFD4\uBFDC\uBFDF\uBFE1\uC03C\uC051\uC058\uC05C\uC060\uC068\uC069\uC090\uC091\uC094\uC098\uC0A0\uC0A1\uC0A3\uC0A5\uC0AC\uC0AD\uC0AF\uC0B0\uC0B3\uC0B4\uC0B5\uC0B6\uC0BC\uC0BD\uC0BF\uC0C0\uC0C1\uC0C5\uC0C8\uC0C9\uC0CC\uC0D0\uC0D8\uC0D9\uC0DB\uC0DC\uC0DD\uC0E4\uD36A\uD36B\uD36C\uD36D\uD36E\uD36F\uD370\uD371\uD372\uD373\uD374\uD375\uD376\uD377\uD378\uD379\uD37A\uD37B\uD37E\uD37F\uD381\uD382\uD383\uD385\uD386\uD387\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD388\uD389\uD38A\uD38B\uD38E\uD392\uD393\uD394\uD395\uD396\uD397\uD39A\uD39B\uD39D\uD39E\uD39F\uD3A1\uD3A2\uD3A3\uD3A4\uD3A5\uD3A6\uD3A7\uD3AA\uD3AC\uD3AE\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD3AF\uD3B0\uD3B1\uD3B2\uD3B3\uD3B5\uD3B6\uD3B7\uD3B9\uD3BA\uD3BB\uD3BD\uD3BE\uD3BF\uD3C0\uD3C1\uD3C2\uD3C3\uD3C6\uD3C7\uD3CA\uD3CB\uD3CC\uD3CD\uD3CE\uD3CF\uD3D1\uD3D2\uD3D3\uD3D4\uD3D5\uD3D6\uC0E5\uC0E8\uC0EC\uC0F4\uC0F5\uC0F7\uC0F9\uC100\uC104\uC108\uC110\uC115\uC11C\uC11D\uC11E\uC11F\uC120\uC123\uC124\uC126\uC127\uC12C\uC12D\uC12F\uC130\uC131\uC136\uC138\uC139\uC13C\uC140\uC148\uC149\uC14B\uC14C\uC14D\uC154\uC155\uC158\uC15C\uC164\uC165\uC167\uC168\uC169\uC170\uC174\uC178\uC185\uC18C\uC18D\uC18E\uC190\uC194\uC196\uC19C\uC19D\uC19F\uC1A1\uC1A5\uC1A8\uC1A9\uC1AC\uC1B0\uC1BD\uC1C4\uC1C8\uC1CC\uC1D4\uC1D7\uC1D8\uC1E0\uC1E4\uC1E8\uC1F0\uC1F1\uC1F3\uC1FC\uC1FD\uC200\uC204\uC20C\uC20D\uC20F\uC211\uC218\uC219\uC21C\uC21F\uC220\uC228\uC229\uC22B\uC22D\uD3D7\uD3D9\uD3DA\uD3DB\uD3DC\uD3DD\uD3DE\uD3DF\uD3E0\uD3E2\uD3E4\uD3E5\uD3E6\uD3E7\uD3E8\uD3E9\uD3EA\uD3EB\uD3EE\uD3EF\uD3F1\uD3F2\uD3F3\uD3F5\uD3F6\uD3F7\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD3F8\uD3F9\uD3FA\uD3FB\uD3FE\uD400\uD402\uD403\uD404\uD405\uD406\uD407\uD409\uD40A\uD40B\uD40C\uD40D\uD40E\uD40F\uD410\uD411\uD412\uD413\uD414\uD415\uD416\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD417\uD418\uD419\uD41A\uD41B\uD41C\uD41E\uD41F\uD420\uD421\uD422\uD423\uD424\uD425\uD426\uD427\uD428\uD429\uD42A\uD42B\uD42C\uD42D\uD42E\uD42F\uD430\uD431\uD432\uD433\uD434\uD435\uD436\uD437\uC22F\uC231\uC232\uC234\uC248\uC250\uC251\uC254\uC258\uC260\uC265\uC26C\uC26D\uC270\uC274\uC27C\uC27D\uC27F\uC281\uC288\uC289\uC290\uC298\uC29B\uC29D\uC2A4\uC2A5\uC2A8\uC2AC\uC2AD\uC2B4\uC2B5\uC2B7\uC2B9\uC2DC\uC2DD\uC2E0\uC2E3\uC2E4\uC2EB\uC2EC\uC2ED\uC2EF\uC2F1\uC2F6\uC2F8\uC2F9\uC2FB\uC2FC\uC300\uC308\uC309\uC30C\uC30D\uC313\uC314\uC315\uC318\uC31C\uC324\uC325\uC328\uC329\uC345\uC368\uC369\uC36C\uC370\uC372\uC378\uC379\uC37C\uC37D\uC384\uC388\uC38C\uC3C0\uC3D8\uC3D9\uC3DC\uC3DF\uC3E0\uC3E2\uC3E8\uC3E9\uC3ED\uC3F4\uC3F5\uC3F8\uC408\uC410\uC424\uC42C\uC430\uD438\uD439\uD43A\uD43B\uD43C\uD43D\uD43E\uD43F\uD441\uD442\uD443\uD445\uD446\uD447\uD448\uD449\uD44A\uD44B\uD44C\uD44D\uD44E\uD44F\uD450\uD451\uD452\uD453\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD454\uD455\uD456\uD457\uD458\uD459\uD45A\uD45B\uD45D\uD45E\uD45F\uD461\uD462\uD463\uD465\uD466\uD467\uD468\uD469\uD46A\uD46B\uD46C\uD46E\uD470\uD471\uD472\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD473\uD474\uD475\uD476\uD477\uD47A\uD47B\uD47D\uD47E\uD481\uD483\uD484\uD485\uD486\uD487\uD48A\uD48C\uD48E\uD48F\uD490\uD491\uD492\uD493\uD495\uD496\uD497\uD498\uD499\uD49A\uD49B\uD49C\uD49D\uC434\uC43C\uC43D\uC448\uC464\uC465\uC468\uC46C\uC474\uC475\uC479\uC480\uC494\uC49C\uC4B8\uC4BC\uC4E9\uC4F0\uC4F1\uC4F4\uC4F8\uC4FA\uC4FF\uC500\uC501\uC50C\uC510\uC514\uC51C\uC528\uC529\uC52C\uC530\uC538\uC539\uC53B\uC53D\uC544\uC545\uC548\uC549\uC54A\uC54C\uC54D\uC54E\uC553\uC554\uC555\uC557\uC558\uC559\uC55D\uC55E\uC560\uC561\uC564\uC568\uC570\uC571\uC573\uC574\uC575\uC57C\uC57D\uC580\uC584\uC587\uC58C\uC58D\uC58F\uC591\uC595\uC597\uC598\uC59C\uC5A0\uC5A9\uC5B4\uC5B5\uC5B8\uC5B9\uC5BB\uC5BC\uC5BD\uC5BE\uC5C4\uC5C5\uC5C6\uC5C7\uC5C8\uC5C9\uC5CA\uC5CC\uC5CE\uD49E\uD49F\uD4A0\uD4A1\uD4A2\uD4A3\uD4A4\uD4A5\uD4A6\uD4A7\uD4A8\uD4AA\uD4AB\uD4AC\uD4AD\uD4AE\uD4AF\uD4B0\uD4B1\uD4B2\uD4B3\uD4B4\uD4B5\uD4B6\uD4B7\uD4B8\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD4B9\uD4BA\uD4BB\uD4BC\uD4BD\uD4BE\uD4BF\uD4C0\uD4C1\uD4C2\uD4C3\uD4C4\uD4C5\uD4C6\uD4C7\uD4C8\uD4C9\uD4CA\uD4CB\uD4CD\uD4CE\uD4CF\uD4D1\uD4D2\uD4D3\uD4D5\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD4D6\uD4D7\uD4D8\uD4D9\uD4DA\uD4DB\uD4DD\uD4DE\uD4E0\uD4E1\uD4E2\uD4E3\uD4E4\uD4E5\uD4E6\uD4E7\uD4E9\uD4EA\uD4EB\uD4ED\uD4EE\uD4EF\uD4F1\uD4F2\uD4F3\uD4F4\uD4F5\uD4F6\uD4F7\uD4F9\uD4FA\uD4FC\uC5D0\uC5D1\uC5D4\uC5D8\uC5E0\uC5E1\uC5E3\uC5E5\uC5EC\uC5ED\uC5EE\uC5F0\uC5F4\uC5F6\uC5F7\uC5FC\uC5FD\uC5FE\uC5FF\uC600\uC601\uC605\uC606\uC607\uC608\uC60C\uC610\uC618\uC619\uC61B\uC61C\uC624\uC625\uC628\uC62C\uC62D\uC62E\uC630\uC633\uC634\uC635\uC637\uC639\uC63B\uC640\uC641\uC644\uC648\uC650\uC651\uC653\uC654\uC655\uC65C\uC65D\uC660\uC66C\uC66F\uC671\uC678\uC679\uC67C\uC680\uC688\uC689\uC68B\uC68D\uC694\uC695\uC698\uC69C\uC6A4\uC6A5\uC6A7\uC6A9\uC6B0\uC6B1\uC6B4\uC6B8\uC6B9\uC6BA\uC6C0\uC6C1\uC6C3\uC6C5\uC6CC\uC6CD\uC6D0\uC6D4\uC6DC\uC6DD\uC6E0\uC6E1\uC6E8\uD4FE\uD4FF\uD500\uD501\uD502\uD503\uD505\uD506\uD507\uD509\uD50A\uD50B\uD50D\uD50E\uD50F\uD510\uD511\uD512\uD513\uD516\uD518\uD519\uD51A\uD51B\uD51C\uD51D\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD51E\uD51F\uD520\uD521\uD522\uD523\uD524\uD525\uD526\uD527\uD528\uD529\uD52A\uD52B\uD52C\uD52D\uD52E\uD52F\uD530\uD531\uD532\uD533\uD534\uD535\uD536\uD537\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD538\uD539\uD53A\uD53B\uD53E\uD53F\uD541\uD542\uD543\uD545\uD546\uD547\uD548\uD549\uD54A\uD54B\uD54E\uD550\uD552\uD553\uD554\uD555\uD556\uD557\uD55A\uD55B\uD55D\uD55E\uD55F\uD561\uD562\uD563\uC6E9\uC6EC\uC6F0\uC6F8\uC6F9\uC6FD\uC704\uC705\uC708\uC70C\uC714\uC715\uC717\uC719\uC720\uC721\uC724\uC728\uC730\uC731\uC733\uC735\uC737\uC73C\uC73D\uC740\uC744\uC74A\uC74C\uC74D\uC74F\uC751\uC752\uC753\uC754\uC755\uC756\uC757\uC758\uC75C\uC760\uC768\uC76B\uC774\uC775\uC778\uC77C\uC77D\uC77E\uC783\uC784\uC785\uC787\uC788\uC789\uC78A\uC78E\uC790\uC791\uC794\uC796\uC797\uC798\uC79A\uC7A0\uC7A1\uC7A3\uC7A4\uC7A5\uC7A6\uC7AC\uC7AD\uC7B0\uC7B4\uC7BC\uC7BD\uC7BF\uC7C0\uC7C1\uC7C8\uC7C9\uC7CC\uC7CE\uC7D0\uC7D8\uC7DD\uC7E4\uC7E8\uC7EC\uC800\uC801\uC804\uC808\uC80A\uD564\uD566\uD567\uD56A\uD56C\uD56E\uD56F\uD570\uD571\uD572\uD573\uD576\uD577\uD579\uD57A\uD57B\uD57D\uD57E\uD57F\uD580\uD581\uD582\uD583\uD586\uD58A\uD58B\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD58C\uD58D\uD58E\uD58F\uD591\uD592\uD593\uD594\uD595\uD596\uD597\uD598\uD599\uD59A\uD59B\uD59C\uD59D\uD59E\uD59F\uD5A0\uD5A1\uD5A2\uD5A3\uD5A4\uD5A6\uD5A7\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD5A8\uD5A9\uD5AA\uD5AB\uD5AC\uD5AD\uD5AE\uD5AF\uD5B0\uD5B1\uD5B2\uD5B3\uD5B4\uD5B5\uD5B6\uD5B7\uD5B8\uD5B9\uD5BA\uD5BB\uD5BC\uD5BD\uD5BE\uD5BF\uD5C0\uD5C1\uD5C2\uD5C3\uD5C4\uD5C5\uD5C6\uD5C7\uC810\uC811\uC813\uC815\uC816\uC81C\uC81D\uC820\uC824\uC82C\uC82D\uC82F\uC831\uC838\uC83C\uC840\uC848\uC849\uC84C\uC84D\uC854\uC870\uC871\uC874\uC878\uC87A\uC880\uC881\uC883\uC885\uC886\uC887\uC88B\uC88C\uC88D\uC894\uC89D\uC89F\uC8A1\uC8A8\uC8BC\uC8BD\uC8C4\uC8C8\uC8CC\uC8D4\uC8D5\uC8D7\uC8D9\uC8E0\uC8E1\uC8E4\uC8F5\uC8FC\uC8FD\uC900\uC904\uC905\uC906\uC90C\uC90D\uC90F\uC911\uC918\uC92C\uC934\uC950\uC951\uC954\uC958\uC960\uC961\uC963\uC96C\uC970\uC974\uC97C\uC988\uC989\uC98C\uC990\uC998\uC999\uC99B\uC99D\uC9C0\uC9C1\uC9C4\uC9C7\uC9C8\uC9CA\uC9D0\uC9D1\uC9D3\uD5CA\uD5CB\uD5CD\uD5CE\uD5CF\uD5D1\uD5D3\uD5D4\uD5D5\uD5D6\uD5D7\uD5DA\uD5DC\uD5DE\uD5DF\uD5E0\uD5E1\uD5E2\uD5E3\uD5E6\uD5E7\uD5E9\uD5EA\uD5EB\uD5ED\uD5EE\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD5EF\uD5F0\uD5F1\uD5F2\uD5F3\uD5F6\uD5F8\uD5FA\uD5FB\uD5FC\uD5FD\uD5FE\uD5FF\uD602\uD603\uD605\uD606\uD607\uD609\uD60A\uD60B\uD60C\uD60D\uD60E\uD60F\uD612\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD616\uD617\uD618\uD619\uD61A\uD61B\uD61D\uD61E\uD61F\uD621\uD622\uD623\uD625\uD626\uD627\uD628\uD629\uD62A\uD62B\uD62C\uD62E\uD62F\uD630\uD631\uD632\uD633\uD634\uD635\uD636\uD637\uD63A\uD63B\uC9D5\uC9D6\uC9D9\uC9DA\uC9DC\uC9DD\uC9E0\uC9E2\uC9E4\uC9E7\uC9EC\uC9ED\uC9EF\uC9F0\uC9F1\uC9F8\uC9F9\uC9FC\uCA00\uCA08\uCA09\uCA0B\uCA0C\uCA0D\uCA14\uCA18\uCA29\uCA4C\uCA4D\uCA50\uCA54\uCA5C\uCA5D\uCA5F\uCA60\uCA61\uCA68\uCA7D\uCA84\uCA98\uCABC\uCABD\uCAC0\uCAC4\uCACC\uCACD\uCACF\uCAD1\uCAD3\uCAD8\uCAD9\uCAE0\uCAEC\uCAF4\uCB08\uCB10\uCB14\uCB18\uCB20\uCB21\uCB41\uCB48\uCB49\uCB4C\uCB50\uCB58\uCB59\uCB5D\uCB64\uCB78\uCB79\uCB9C\uCBB8\uCBD4\uCBE4\uCBE7\uCBE9\uCC0C\uCC0D\uCC10\uCC14\uCC1C\uCC1D\uCC21\uCC22\uCC27\uCC28\uCC29\uCC2C\uCC2E\uCC30\uCC38\uCC39\uCC3B\uD63D\uD63E\uD63F\uD641\uD642\uD643\uD644\uD646\uD647\uD64A\uD64C\uD64E\uD64F\uD650\uD652\uD653\uD656\uD657\uD659\uD65A\uD65B\uD65D\uD65E\uD65F\uD660\uD661\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD662\uD663\uD664\uD665\uD666\uD668\uD66A\uD66B\uD66C\uD66D\uD66E\uD66F\uD672\uD673\uD675\uD676\uD677\uD678\uD679\uD67A\uD67B\uD67C\uD67D\uD67E\uD67F\uD680\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD681\uD682\uD684\uD686\uD687\uD688\uD689\uD68A\uD68B\uD68E\uD68F\uD691\uD692\uD693\uD695\uD696\uD697\uD698\uD699\uD69A\uD69B\uD69C\uD69E\uD6A0\uD6A2\uD6A3\uD6A4\uD6A5\uD6A6\uD6A7\uD6A9\uD6AA\uCC3C\uCC3D\uCC3E\uCC44\uCC45\uCC48\uCC4C\uCC54\uCC55\uCC57\uCC58\uCC59\uCC60\uCC64\uCC66\uCC68\uCC70\uCC75\uCC98\uCC99\uCC9C\uCCA0\uCCA8\uCCA9\uCCAB\uCCAC\uCCAD\uCCB4\uCCB5\uCCB8\uCCBC\uCCC4\uCCC5\uCCC7\uCCC9\uCCD0\uCCD4\uCCE4\uCCEC\uCCF0\uCD01\uCD08\uCD09\uCD0C\uCD10\uCD18\uCD19\uCD1B\uCD1D\uCD24\uCD28\uCD2C\uCD39\uCD5C\uCD60\uCD64\uCD6C\uCD6D\uCD6F\uCD71\uCD78\uCD88\uCD94\uCD95\uCD98\uCD9C\uCDA4\uCDA5\uCDA7\uCDA9\uCDB0\uCDC4\uCDCC\uCDD0\uCDE8\uCDEC\uCDF0\uCDF8\uCDF9\uCDFB\uCDFD\uCE04\uCE08\uCE0C\uCE14\uCE19\uCE20\uCE21\uCE24\uCE28\uCE30\uCE31\uCE33\uCE35\uD6AB\uD6AD\uD6AE\uD6AF\uD6B1\uD6B2\uD6B3\uD6B4\uD6B5\uD6B6\uD6B7\uD6B8\uD6BA\uD6BC\uD6BD\uD6BE\uD6BF\uD6C0\uD6C1\uD6C2\uD6C3\uD6C6\uD6C7\uD6C9\uD6CA\uD6CB\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD6CD\uD6CE\uD6CF\uD6D0\uD6D2\uD6D3\uD6D5\uD6D6\uD6D8\uD6DA\uD6DB\uD6DC\uD6DD\uD6DE\uD6DF\uD6E1\uD6E2\uD6E3\uD6E5\uD6E6\uD6E7\uD6E9\uD6EA\uD6EB\uD6EC\uD6ED\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD6EE\uD6EF\uD6F1\uD6F2\uD6F3\uD6F4\uD6F6\uD6F7\uD6F8\uD6F9\uD6FA\uD6FB\uD6FE\uD6FF\uD701\uD702\uD703\uD705\uD706\uD707\uD708\uD709\uD70A\uD70B\uD70C\uD70D\uD70E\uD70F\uD710\uD712\uD713\uD714\uCE58\uCE59\uCE5C\uCE5F\uCE60\uCE61\uCE68\uCE69\uCE6B\uCE6D\uCE74\uCE75\uCE78\uCE7C\uCE84\uCE85\uCE87\uCE89\uCE90\uCE91\uCE94\uCE98\uCEA0\uCEA1\uCEA3\uCEA4\uCEA5\uCEAC\uCEAD\uCEC1\uCEE4\uCEE5\uCEE8\uCEEB\uCEEC\uCEF4\uCEF5\uCEF7\uCEF8\uCEF9\uCF00\uCF01\uCF04\uCF08\uCF10\uCF11\uCF13\uCF15\uCF1C\uCF20\uCF24\uCF2C\uCF2D\uCF2F\uCF30\uCF31\uCF38\uCF54\uCF55\uCF58\uCF5C\uCF64\uCF65\uCF67\uCF69\uCF70\uCF71\uCF74\uCF78\uCF80\uCF85\uCF8C\uCFA1\uCFA8\uCFB0\uCFC4\uCFE0\uCFE1\uCFE4\uCFE8\uCFF0\uCFF1\uCFF3\uCFF5\uCFFC\uD000\uD004\uD011\uD018\uD02D\uD034\uD035\uD038\uD03C\uD715\uD716\uD717\uD71A\uD71B\uD71D\uD71E\uD71F\uD721\uD722\uD723\uD724\uD725\uD726\uD727\uD72A\uD72C\uD72E\uD72F\uD730\uD731\uD732\uD733\uD736\uD737\uD739\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD73A\uD73B\uD73D\uD73E\uD73F\uD740\uD741\uD742\uD743\uD745\uD746\uD748\uD74A\uD74B\uD74C\uD74D\uD74E\uD74F\uD752\uD753\uD755\uD75A\uD75B\uD75C\uD75D\uD75E\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD75F\uD762\uD764\uD766\uD767\uD768\uD76A\uD76B\uD76D\uD76E\uD76F\uD771\uD772\uD773\uD775\uD776\uD777\uD778\uD779\uD77A\uD77B\uD77E\uD77F\uD780\uD782\uD783\uD784\uD785\uD786\uD787\uD78A\uD78B\uD044\uD045\uD047\uD049\uD050\uD054\uD058\uD060\uD06C\uD06D\uD070\uD074\uD07C\uD07D\uD081\uD0A4\uD0A5\uD0A8\uD0AC\uD0B4\uD0B5\uD0B7\uD0B9\uD0C0\uD0C1\uD0C4\uD0C8\uD0C9\uD0D0\uD0D1\uD0D3\uD0D4\uD0D5\uD0DC\uD0DD\uD0E0\uD0E4\uD0EC\uD0ED\uD0EF\uD0F0\uD0F1\uD0F8\uD10D\uD130\uD131\uD134\uD138\uD13A\uD140\uD141\uD143\uD144\uD145\uD14C\uD14D\uD150\uD154\uD15C\uD15D\uD15F\uD161\uD168\uD16C\uD17C\uD184\uD188\uD1A0\uD1A1\uD1A4\uD1A8\uD1B0\uD1B1\uD1B3\uD1B5\uD1BA\uD1BC\uD1C0\uD1D8\uD1F4\uD1F8\uD207\uD209\uD210\uD22C\uD22D\uD230\uD234\uD23C\uD23D\uD23F\uD241\uD248\uD25C\uD78D\uD78E\uD78F\uD791\uD792\uD793\uD794\uD795\uD796\uD797\uD79A\uD79C\uD79E\uD79F\uD7A0\uD7A1\uD7A2\uD7A3\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD264\uD280\uD281\uD284\uD288\uD290\uD291\uD295\uD29C\uD2A0\uD2A4\uD2AC\uD2B1\uD2B8\uD2B9\uD2BC\uD2BF\uD2C0\uD2C2\uD2C8\uD2C9\uD2CB\uD2D4\uD2D8\uD2DC\uD2E4\uD2E5\uD2F0\uD2F1\uD2F4\uD2F8\uD300\uD301\uD303\uD305\uD30C\uD30D\uD30E\uD310\uD314\uD316\uD31C\uD31D\uD31F\uD320\uD321\uD325\uD328\uD329\uD32C\uD330\uD338\uD339\uD33B\uD33C\uD33D\uD344\uD345\uD37C\uD37D\uD380\uD384\uD38C\uD38D\uD38F\uD390\uD391\uD398\uD399\uD39C\uD3A0\uD3A8\uD3A9\uD3AB\uD3AD\uD3B4\uD3B8\uD3BC\uD3C4\uD3C5\uD3C8\uD3C9\uD3D0\uD3D8\uD3E1\uD3E3\uD3EC\uD3ED\uD3F0\uD3F4\uD3FC\uD3FD\uD3FF\uD401\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD408\uD41D\uD440\uD444\uD45C\uD460\uD464\uD46D\uD46F\uD478\uD479\uD47C\uD47F\uD480\uD482\uD488\uD489\uD48B\uD48D\uD494\uD4A9\uD4CC\uD4D0\uD4D4\uD4DC\uD4DF\uD4E8\uD4EC\uD4F0\uD4F8\uD4FB\uD4FD\uD504\uD508\uD50C\uD514\uD515\uD517\uD53C\uD53D\uD540\uD544\uD54C\uD54D\uD54F\uD551\uD558\uD559\uD55C\uD560\uD565\uD568\uD569\uD56B\uD56D\uD574\uD575\uD578\uD57C\uD584\uD585\uD587\uD588\uD589\uD590\uD5A5\uD5C8\uD5C9\uD5CC\uD5D0\uD5D2\uD5D8\uD5D9\uD5DB\uD5DD\uD5E4\uD5E5\uD5E8\uD5EC\uD5F4\uD5F5\uD5F7\uD5F9\uD600\uD601\uD604\uD608\uD610\uD611\uD613\uD614\uD615\uD61C\uD620\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uD624\uD62D\uD638\uD639\uD63C\uD640\uD645\uD648\uD649\uD64B\uD64D\uD651\uD654\uD655\uD658\uD65C\uD667\uD669\uD670\uD671\uD674\uD683\uD685\uD68C\uD68D\uD690\uD694\uD69D\uD69F\uD6A1\uD6A8\uD6AC\uD6B0\uD6B9\uD6BB\uD6C4\uD6C5\uD6C8\uD6CC\uD6D1\uD6D4\uD6D7\uD6D9\uD6E0\uD6E4\uD6E8\uD6F0\uD6F5\uD6FC\uD6FD\uD700\uD704\uD711\uD718\uD719\uD71C\uD720\uD728\uD729\uD72B\uD72D\uD734\uD735\uD738\uD73C\uD744\uD747\uD749\uD750\uD751\uD754\uD756\uD757\uD758\uD759\uD760\uD761\uD763\uD765\uD769\uD76C\uD770\uD774\uD77C\uD77D\uD781\uD788\uD789\uD78C\uD790\uD798\uD799\uD79B\uD79D\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u4F3D\u4F73\u5047\u50F9\u52A0\u53EF\u5475\u54E5\u5609\u5AC1\u5BB6\u6687\u67B6\u67B7\u67EF\u6B4C\u73C2\u75C2\u7A3C\u82DB\u8304\u8857\u8888\u8A36\u8CC8\u8DCF\u8EFB\u8FE6\u99D5\u523B\u5374\u5404\u606A\u6164\u6BBC\u73CF\u811A\u89BA\u89D2\u95A3\u4F83\u520A\u58BE\u5978\u59E6\u5E72\u5E79\u61C7\u63C0\u6746\u67EC\u687F\u6F97\u764E\u770B\u78F5\u7A08\u7AFF\u7C21\u809D\u826E\u8271\u8AEB\u9593\u4E6B\u559D\u66F7\u6E34\u78A3\u7AED\u845B\u8910\u874E\u97A8\u52D8\u574E\u582A\u5D4C\u611F\u61BE\u6221\u6562\u67D1\u6A44\u6E1B\u7518\u75B3\u76E3\u77B0\u7D3A\u90AF\u9451\u9452\u9F95\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u5323\u5CAC\u7532\u80DB\u9240\u9598\u525B\u5808\u59DC\u5CA1\u5D17\u5EB7\u5F3A\u5F4A\u6177\u6C5F\u757A\u7586\u7CE0\u7D73\u7DB1\u7F8C\u8154\u8221\u8591\u8941\u8B1B\u92FC\u964D\u9C47\u4ECB\u4EF7\u500B\u51F1\u584F\u6137\u613E\u6168\u6539\u69EA\u6F11\u75A5\u7686\u76D6\u7B87\u82A5\u84CB\uF900\u93A7\u958B\u5580\u5BA2\u5751\uF901\u7CB3\u7FB9\u91B5\u5028\u53BB\u5C45\u5DE8\u62D2\u636E\u64DA\u64E7\u6E20\u70AC\u795B\u8DDD\u8E1E\uF902\u907D\u9245\u92F8\u4E7E\u4EF6\u5065\u5DFE\u5EFA\u6106\u6957\u8171\u8654\u8E47\u9375\u9A2B\u4E5E\u5091\u6770\u6840\u5109\u528D\u5292\u6AA2\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u77BC\u9210\u9ED4\u52AB\u602F\u8FF2\u5048\u61A9\u63ED\u64CA\u683C\u6A84\u6FC0\u8188\u89A1\u9694\u5805\u727D\u72AC\u7504\u7D79\u7E6D\u80A9\u898B\u8B74\u9063\u9D51\u6289\u6C7A\u6F54\u7D50\u7F3A\u8A23\u517C\u614A\u7B9D\u8B19\u9257\u938C\u4EAC\u4FD3\u501E\u50BE\u5106\u52C1\u52CD\u537F\u5770\u5883\u5E9A\u5F91\u6176\u61AC\u64CE\u656C\u666F\u66BB\u66F4\u6897\u6D87\u7085\u70F1\u749F\u74A5\u74CA\u75D9\u786C\u78EC\u7ADF\u7AF6\u7D45\u7D93\u8015\u803F\u811B\u8396\u8B66\u8F15\u9015\u93E1\u9803\u9838\u9A5A\u9BE8\u4FC2\u5553\u583A\u5951\u5B63\u5C46\u60B8\u6212\u6842\u68B0\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u68E8\u6EAA\u754C\u7678\u78CE\u7A3D\u7CFB\u7E6B\u7E7C\u8A08\u8AA1\u8C3F\u968E\u9DC4\u53E4\u53E9\u544A\u5471\u56FA\u59D1\u5B64\u5C3B\u5EAB\u62F7\u6537\u6545\u6572\u66A0\u67AF\u69C1\u6CBD\u75FC\u7690\u777E\u7A3F\u7F94\u8003\u80A1\u818F\u82E6\u82FD\u83F0\u85C1\u8831\u88B4\u8AA5\uF903\u8F9C\u932E\u96C7\u9867\u9AD8\u9F13\u54ED\u659B\u66F2\u688F\u7A40\u8C37\u9D60\u56F0\u5764\u5D11\u6606\u68B1\u68CD\u6EFE\u7428\u889E\u9BE4\u6C68\uF904\u9AA8\u4F9B\u516C\u5171\u529F\u5B54\u5DE5\u6050\u606D\u62F1\u63A7\u653B\u73D9\u7A7A\u86A3\u8CA2\u978F\u4E32\u5BE1\u6208\u679C\u74DC\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u79D1\u83D3\u8A87\u8AB2\u8DE8\u904E\u934B\u9846\u5ED3\u69E8\u85FF\u90ED\uF905\u51A0\u5B98\u5BEC\u6163\u68FA\u6B3E\u704C\u742F\u74D8\u7BA1\u7F50\u83C5\u89C0\u8CAB\u95DC\u9928\u522E\u605D\u62EC\u9002\u4F8A\u5149\u5321\u58D9\u5EE3\u66E0\u6D38\u709A\u72C2\u73D6\u7B50\u80F1\u945B\u5366\u639B\u7F6B\u4E56\u5080\u584A\u58DE\u602A\u6127\u62D0\u69D0\u9B41\u5B8F\u7D18\u80B1\u8F5F\u4EA4\u50D1\u54AC\u55AC\u5B0C\u5DA0\u5DE7\u652A\u654E\u6821\u6A4B\u72E1\u768E\u77EF\u7D5E\u7FF9\u81A0\u854E\u86DF\u8F03\u8F4E\u90CA\u9903\u9A55\u9BAB\u4E18\u4E45\u4E5D\u4EC7\u4FF1\u5177\u52FE\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u5340\u53E3\u53E5\u548E\u5614\u5775\u57A2\u5BC7\u5D87\u5ED0\u61FC\u62D8\u6551\u67B8\u67E9\u69CB\u6B50\u6BC6\u6BEC\u6C42\u6E9D\u7078\u72D7\u7396\u7403\u77BF\u77E9\u7A76\u7D7F\u8009\u81FC\u8205\u820A\u82DF\u8862\u8B33\u8CFC\u8EC0\u9011\u90B1\u9264\u92B6\u99D2\u9A45\u9CE9\u9DD7\u9F9C\u570B\u5C40\u83CA\u97A0\u97AB\u9EB4\u541B\u7A98\u7FA4\u88D9\u8ECD\u90E1\u5800\u5C48\u6398\u7A9F\u5BAE\u5F13\u7A79\u7AAE\u828E\u8EAC\u5026\u5238\u52F8\u5377\u5708\u62F3\u6372\u6B0A\u6DC3\u7737\u53A5\u7357\u8568\u8E76\u95D5\u673A\u6AC3\u6F70\u8A6D\u8ECC\u994B\uF906\u6677\u6B78\u8CB4\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u9B3C\uF907\u53EB\u572D\u594E\u63C6\u69FB\u73EA\u7845\u7ABA\u7AC5\u7CFE\u8475\u898F\u8D73\u9035\u95A8\u52FB\u5747\u7547\u7B60\u83CC\u921E\uF908\u6A58\u514B\u524B\u5287\u621F\u68D8\u6975\u9699\u50C5\u52A4\u52E4\u61C3\u65A4\u6839\u69FF\u747E\u7B4B\u82B9\u83EB\u89B2\u8B39\u8FD1\u9949\uF909\u4ECA\u5997\u64D2\u6611\u6A8E\u7434\u7981\u79BD\u82A9\u887E\u887F\u895F\uF90A\u9326\u4F0B\u53CA\u6025\u6271\u6C72\u7D1A\u7D66\u4E98\u5162\u77DC\u80AF\u4F01\u4F0E\u5176\u5180\u55DC\u5668\u573B\u57FA\u57FC\u5914\u5947\u5993\u5BC4\u5C90\u5D0E\u5DF1\u5E7E\u5FCC\u6280\u65D7\u65E3\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u671E\u671F\u675E\u68CB\u68C4\u6A5F\u6B3A\u6C23\u6C7D\u6C82\u6DC7\u7398\u7426\u742A\u7482\u74A3\u7578\u757F\u7881\u78EF\u7941\u7947\u7948\u797A\u7B95\u7D00\u7DBA\u7F88\u8006\u802D\u808C\u8A18\u8B4F\u8C48\u8D77\u9321\u9324\u98E2\u9951\u9A0E\u9A0F\u9A65\u9E92\u7DCA\u4F76\u5409\u62EE\u6854\u91D1\u55AB\u513A\uF90B\uF90C\u5A1C\u61E6\uF90D\u62CF\u62FF\uF90E\uF90F\uF910\uF911\uF912\uF913\u90A3\uF914\uF915\uF916\uF917\uF918\u8AFE\uF919\uF91A\uF91B\uF91C\u6696\uF91D\u7156\uF91E\uF91F\u96E3\uF920\u634F\u637A\u5357\uF921\u678F\u6960\u6E73\uF922\u7537\uF923\uF924\uF925\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u7D0D\uF926\uF927\u8872\u56CA\u5A18\uF928\uF929\uF92A\uF92B\uF92C\u4E43\uF92D\u5167\u5948\u67F0\u8010\uF92E\u5973\u5E74\u649A\u79CA\u5FF5\u606C\u62C8\u637B\u5BE7\u5BD7\u52AA\uF92F\u5974\u5F29\u6012\uF930\uF931\uF932\u7459\uF933\uF934\uF935\uF936\uF937\uF938\u99D1\uF939\uF93A\uF93B\uF93C\uF93D\uF93E\uF93F\uF940\uF941\uF942\uF943\u6FC3\uF944\uF945\u81BF\u8FB2\u60F1\uF946\uF947\u8166\uF948\uF949\u5C3F\uF94A\uF94B\uF94C\uF94D\uF94E\uF94F\uF950\uF951\u5AE9\u8A25\u677B\u7D10\uF952\uF953\uF954\uF955\uF956\uF957\u80FD\uF958\uF959\u5C3C\u6CE5\u533F\u6EBA\u591A\u8336\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u4E39\u4EB6\u4F46\u55AE\u5718\u58C7\u5F56\u65B7\u65E6\u6A80\u6BB5\u6E4D\u77ED\u7AEF\u7C1E\u7DDE\u86CB\u8892\u9132\u935B\u64BB\u6FBE\u737A\u75B8\u9054\u5556\u574D\u61BA\u64D4\u66C7\u6DE1\u6E5B\u6F6D\u6FB9\u75F0\u8043\u81BD\u8541\u8983\u8AC7\u8B5A\u931F\u6C93\u7553\u7B54\u8E0F\u905D\u5510\u5802\u5858\u5E62\u6207\u649E\u68E0\u7576\u7CD6\u87B3\u9EE8\u4EE3\u5788\u576E\u5927\u5C0D\u5CB1\u5E36\u5F85\u6234\u64E1\u73B3\u81FA\u888B\u8CB8\u968A\u9EDB\u5B85\u5FB7\u60B3\u5012\u5200\u5230\u5716\u5835\u5857\u5C0E\u5C60\u5CF6\u5D8B\u5EA6\u5F92\u60BC\u6311\u6389\u6417\u6843\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u68F9\u6AC2\u6DD8\u6E21\u6ED4\u6FE4\u71FE\u76DC\u7779\u79B1\u7A3B\u8404\u89A9\u8CED\u8DF3\u8E48\u9003\u9014\u9053\u90FD\u934D\u9676\u97DC\u6BD2\u7006\u7258\u72A2\u7368\u7763\u79BF\u7BE4\u7E9B\u8B80\u58A9\u60C7\u6566\u65FD\u66BE\u6C8C\u711E\u71C9\u8C5A\u9813\u4E6D\u7A81\u4EDD\u51AC\u51CD\u52D5\u540C\u61A7\u6771\u6850\u68DF\u6D1E\u6F7C\u75BC\u77B3\u7AE5\u80F4\u8463\u9285\u515C\u6597\u675C\u6793\u75D8\u7AC7\u8373\uF95A\u8C46\u9017\u982D\u5C6F\u81C0\u829A\u9041\u906F\u920D\u5F97\u5D9D\u6A59\u71C8\u767B\u7B49\u85E4\u8B04\u9127\u9A30\u5587\u61F6\uF95B\u7669\u7F85\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u863F\u87BA\u88F8\u908F\uF95C\u6D1B\u70D9\u73DE\u7D61\u843D\uF95D\u916A\u99F1\uF95E\u4E82\u5375\u6B04\u6B12\u703E\u721B\u862D\u9E1E\u524C\u8FA3\u5D50\u64E5\u652C\u6B16\u6FEB\u7C43\u7E9C\u85CD\u8964\u89BD\u62C9\u81D8\u881F\u5ECA\u6717\u6D6A\u72FC\u7405\u746F\u8782\u90DE\u4F86\u5D0D\u5FA0\u840A\u51B7\u63A0\u7565\u4EAE\u5006\u5169\u51C9\u6881\u6A11\u7CAE\u7CB1\u7CE7\u826F\u8AD2\u8F1B\u91CF\u4FB6\u5137\u52F5\u5442\u5EEC\u616E\u623E\u65C5\u6ADA\u6FFE\u792A\u85DC\u8823\u95AD\u9A62\u9A6A\u9E97\u9ECE\u529B\u66C6\u6B77\u701D\u792B\u8F62\u9742\u6190\u6200\u6523\u6F23\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u7149\u7489\u7DF4\u806F\u84EE\u8F26\u9023\u934A\u51BD\u5217\u52A3\u6D0C\u70C8\u88C2\u5EC9\u6582\u6BAE\u6FC2\u7C3E\u7375\u4EE4\u4F36\u56F9\uF95F\u5CBA\u5DBA\u601C\u73B2\u7B2D\u7F9A\u7FCE\u8046\u901E\u9234\u96F6\u9748\u9818\u9F61\u4F8B\u6FA7\u79AE\u91B4\u96B7\u52DE\uF960\u6488\u64C4\u6AD3\u6F5E\u7018\u7210\u76E7\u8001\u8606\u865C\u8DEF\u8F05\u9732\u9B6F\u9DFA\u9E75\u788C\u797F\u7DA0\u83C9\u9304\u9E7F\u9E93\u8AD6\u58DF\u5F04\u6727\u7027\u74CF\u7C60\u807E\u5121\u7028\u7262\u78CA\u8CC2\u8CDA\u8CF4\u96F7\u4E86\u50DA\u5BEE\u5ED6\u6599\u71CE\u7642\u77AD\u804A\u84FC\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u907C\u9B27\u9F8D\u58D8\u5A41\u5C62\u6A13\u6DDA\u6F0F\u763B\u7D2F\u7E37\u851E\u8938\u93E4\u964B\u5289\u65D2\u67F3\u69B4\u6D41\u6E9C\u700F\u7409\u7460\u7559\u7624\u786B\u8B2C\u985E\u516D\u622E\u9678\u4F96\u502B\u5D19\u6DEA\u7DB8\u8F2A\u5F8B\u6144\u6817\uF961\u9686\u52D2\u808B\u51DC\u51CC\u695E\u7A1C\u7DBE\u83F1\u9675\u4FDA\u5229\u5398\u540F\u550E\u5C65\u60A7\u674E\u68A8\u6D6C\u7281\u72F8\u7406\u7483\uF962\u75E2\u7C6C\u7F79\u7FB8\u8389\u88CF\u88E1\u91CC\u91D0\u96E2\u9BC9\u541D\u6F7E\u71D0\u7498\u85FA\u8EAA\u96A3\u9C57\u9E9F\u6797\u6DCB\u7433\u81E8\u9716\u782C\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u7ACB\u7B20\u7C92\u6469\u746A\u75F2\u78BC\u78E8\u99AC\u9B54\u9EBB\u5BDE\u5E55\u6F20\u819C\u83AB\u9088\u4E07\u534D\u5A29\u5DD2\u5F4E\u6162\u633D\u6669\u66FC\u6EFF\u6F2B\u7063\u779E\u842C\u8513\u883B\u8F13\u9945\u9C3B\u551C\u62B9\u672B\u6CAB\u8309\u896A\u977A\u4EA1\u5984\u5FD8\u5FD9\u671B\u7DB2\u7F54\u8292\u832B\u83BD\u8F1E\u9099\u57CB\u59B9\u5A92\u5BD0\u6627\u679A\u6885\u6BCF\u7164\u7F75\u8CB7\u8CE3\u9081\u9B45\u8108\u8C8A\u964C\u9A40\u9EA5\u5B5F\u6C13\u731B\u76F2\u76DF\u840C\u51AA\u8993\u514D\u5195\u52C9\u68C9\u6C94\u7704\u7720\u7DBF\u7DEC\u9762\u9EB5\u6EC5\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u8511\u51A5\u540D\u547D\u660E\u669D\u6927\u6E9F\u76BF\u7791\u8317\u84C2\u879F\u9169\u9298\u9CF4\u8882\u4FAE\u5192\u52DF\u59C6\u5E3D\u6155\u6478\u6479\u66AE\u67D0\u6A21\u6BCD\u6BDB\u725F\u7261\u7441\u7738\u77DB\u8017\u82BC\u8305\u8B00\u8B28\u8C8C\u6728\u6C90\u7267\u76EE\u7766\u7A46\u9DA9\u6B7F\u6C92\u5922\u6726\u8499\u536F\u5893\u5999\u5EDF\u63CF\u6634\u6773\u6E3A\u732B\u7AD7\u82D7\u9328\u52D9\u5DEB\u61AE\u61CB\u620A\u62C7\u64AB\u65E0\u6959\u6B66\u6BCB\u7121\u73F7\u755D\u7E46\u821E\u8302\u856A\u8AA3\u8CBF\u9727\u9D61\u58A8\u9ED8\u5011\u520E\u543B\u554F\u6587\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u6C76\u7D0A\u7D0B\u805E\u868A\u9580\u96EF\u52FF\u6C95\u7269\u5473\u5A9A\u5C3E\u5D4B\u5F4C\u5FAE\u672A\u68B6\u6963\u6E3C\u6E44\u7709\u7C73\u7F8E\u8587\u8B0E\u8FF7\u9761\u9EF4\u5CB7\u60B6\u610D\u61AB\u654F\u65FB\u65FC\u6C11\u6CEF\u739F\u73C9\u7DE1\u9594\u5BC6\u871C\u8B10\u525D\u535A\u62CD\u640F\u64B2\u6734\u6A38\u6CCA\u73C0\u749E\u7B94\u7C95\u7E1B\u818A\u8236\u8584\u8FEB\u96F9\u99C1\u4F34\u534A\u53CD\u53DB\u62CC\u642C\u6500\u6591\u69C3\u6CEE\u6F58\u73ED\u7554\u7622\u76E4\u76FC\u78D0\u78FB\u792C\u7D46\u822C\u87E0\u8FD4\u9812\u98EF\u52C3\u62D4\u64A5\u6E24\u6F51\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u767C\u8DCB\u91B1\u9262\u9AEE\u9B43\u5023\u508D\u574A\u59A8\u5C28\u5E47\u5F77\u623F\u653E\u65B9\u65C1\u6609\u678B\u699C\u6EC2\u78C5\u7D21\u80AA\u8180\u822B\u82B3\u84A1\u868C\u8A2A\u8B17\u90A6\u9632\u9F90\u500D\u4FF3\uF963\u57F9\u5F98\u62DC\u6392\u676F\u6E43\u7119\u76C3\u80CC\u80DA\u88F4\u88F5\u8919\u8CE0\u8F29\u914D\u966A\u4F2F\u4F70\u5E1B\u67CF\u6822\u767D\u767E\u9B44\u5E61\u6A0A\u7169\u71D4\u756A\uF964\u7E41\u8543\u85E9\u98DC\u4F10\u7B4F\u7F70\u95A5\u51E1\u5E06\u68B5\u6C3E\u6C4E\u6CDB\u72AF\u7BC4\u8303\u6CD5\u743A\u50FB\u5288\u58C1\u64D8\u6A97\u74A7\u7656\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u78A7\u8617\u95E2\u9739\uF965\u535E\u5F01\u8B8A\u8FA8\u8FAF\u908A\u5225\u77A5\u9C49\u9F08\u4E19\u5002\u5175\u5C5B\u5E77\u661E\u663A\u67C4\u68C5\u70B3\u7501\u75C5\u79C9\u7ADD\u8F27\u9920\u9A08\u4FDD\u5821\u5831\u5BF6\u666E\u6B65\u6D11\u6E7A\u6F7D\u73E4\u752B\u83E9\u88DC\u8913\u8B5C\u8F14\u4F0F\u50D5\u5310\u535C\u5B93\u5FA9\u670D\u798F\u8179\u832F\u8514\u8907\u8986\u8F39\u8F3B\u99A5\u9C12\u672C\u4E76\u4FF8\u5949\u5C01\u5CEF\u5CF0\u6367\u68D2\u70FD\u71A2\u742B\u7E2B\u84EC\u8702\u9022\u92D2\u9CF3\u4E0D\u4ED8\u4FEF\u5085\u5256\u526F\u5426\u5490\u57E0\u592B\u5A66\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u5B5A\u5B75\u5BCC\u5E9C\uF966\u6276\u6577\u65A7\u6D6E\u6EA5\u7236\u7B26\u7C3F\u7F36\u8150\u8151\u819A\u8240\u8299\u83A9\u8A03\u8CA0\u8CE6\u8CFB\u8D74\u8DBA\u90E8\u91DC\u961C\u9644\u99D9\u9CE7\u5317\u5206\u5429\u5674\u58B3\u5954\u596E\u5FFF\u61A4\u626E\u6610\u6C7E\u711A\u76C6\u7C89\u7CDE\u7D1B\u82AC\u8CC1\u96F0\uF967\u4F5B\u5F17\u5F7F\u62C2\u5D29\u670B\u68DA\u787C\u7E43\u9D6C\u4E15\u5099\u5315\u532A\u5351\u5983\u5A62\u5E87\u60B2\u618A\u6249\u6279\u6590\u6787\u69A7\u6BD4\u6BD6\u6BD7\u6BD8\u6CB8\uF968\u7435\u75FA\u7812\u7891\u79D5\u79D8\u7C83\u7DCB\u7FE1\u80A5\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u813E\u81C2\u83F2\u871A\u88E8\u8AB9\u8B6C\u8CBB\u9119\u975E\u98DB\u9F3B\u56AC\u5B2A\u5F6C\u658C\u6AB3\u6BAF\u6D5C\u6FF1\u7015\u725D\u73AD\u8CA7\u8CD3\u983B\u6191\u6C37\u8058\u9A01\u4E4D\u4E8B\u4E9B\u4ED5\u4F3A\u4F3C\u4F7F\u4FDF\u50FF\u53F2\u53F8\u5506\u55E3\u56DB\u58EB\u5962\u5A11\u5BEB\u5BFA\u5C04\u5DF3\u5E2B\u5F99\u601D\u6368\u659C\u65AF\u67F6\u67FB\u68AD\u6B7B\u6C99\u6CD7\u6E23\u7009\u7345\u7802\u793E\u7940\u7960\u79C1\u7BE9\u7D17\u7D72\u8086\u820D\u838E\u84D1\u86C7\u88DF\u8A50\u8A5E\u8B1D\u8CDC\u8D66\u8FAD\u90AA\u98FC\u99DF\u9E9D\u524A\uF969\u6714\uF96A\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u5098\u522A\u5C71\u6563\u6C55\u73CA\u7523\u759D\u7B97\u849C\u9178\u9730\u4E77\u6492\u6BBA\u715E\u85A9\u4E09\uF96B\u6749\u68EE\u6E17\u829F\u8518\u886B\u63F7\u6F81\u9212\u98AF\u4E0A\u50B7\u50CF\u511F\u5546\u55AA\u5617\u5B40\u5C19\u5CE0\u5E38\u5E8A\u5EA0\u5EC2\u60F3\u6851\u6A61\u6E58\u723D\u7240\u72C0\u76F8\u7965\u7BB1\u7FD4\u88F3\u89F4\u8A73\u8C61\u8CDE\u971C\u585E\u74BD\u8CFD\u55C7\uF96C\u7A61\u7D22\u8272\u7272\u751F\u7525\uF96D\u7B19\u5885\u58FB\u5DBC\u5E8F\u5EB6\u5F90\u6055\u6292\u637F\u654D\u6691\u66D9\u66F8\u6816\u68F2\u7280\u745E\u7B6E\u7D6E\u7DD6\u7F72\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u80E5\u8212\u85AF\u897F\u8A93\u901D\u92E4\u9ECD\u9F20\u5915\u596D\u5E2D\u60DC\u6614\u6673\u6790\u6C50\u6DC5\u6F5F\u77F3\u78A9\u84C6\u91CB\u932B\u4ED9\u50CA\u5148\u5584\u5B0B\u5BA3\u6247\u657E\u65CB\u6E32\u717D\u7401\u7444\u7487\u74BF\u766C\u79AA\u7DDA\u7E55\u7FA8\u817A\u81B3\u8239\u861A\u87EC\u8A75\u8DE3\u9078\u9291\u9425\u994D\u9BAE\u5368\u5C51\u6954\u6CC4\u6D29\u6E2B\u820C\u859B\u893B\u8A2D\u8AAA\u96EA\u9F67\u5261\u66B9\u6BB2\u7E96\u87FE\u8D0D\u9583\u965D\u651D\u6D89\u71EE\uF96E\u57CE\u59D3\u5BAC\u6027\u60FA\u6210\u661F\u665F\u7329\u73F9\u76DB\u7701\u7B6C\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u8056\u8072\u8165\u8AA0\u9192\u4E16\u52E2\u6B72\u6D17\u7A05\u7B39\u7D30\uF96F\u8CB0\u53EC\u562F\u5851\u5BB5\u5C0F\u5C11\u5DE2\u6240\u6383\u6414\u662D\u68B3\u6CBC\u6D88\u6EAF\u701F\u70A4\u71D2\u7526\u758F\u758E\u7619\u7B11\u7BE0\u7C2B\u7D20\u7D39\u852C\u856D\u8607\u8A34\u900D\u9061\u90B5\u92B7\u97F6\u9A37\u4FD7\u5C6C\u675F\u6D91\u7C9F\u7E8C\u8B16\u8D16\u901F\u5B6B\u5DFD\u640D\u84C0\u905C\u98E1\u7387\u5B8B\u609A\u677E\u6DDE\u8A1F\u8AA6\u9001\u980C\u5237\uF970\u7051\u788E\u9396\u8870\u91D7\u4FEE\u53D7\u55FD\u56DA\u5782\u58FD\u5AC2\u5B88\u5CAB\u5CC0\u5E25\u6101\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u620D\u624B\u6388\u641C\u6536\u6578\u6A39\u6B8A\u6C34\u6D19\u6F31\u71E7\u72E9\u7378\u7407\u74B2\u7626\u7761\u79C0\u7A57\u7AEA\u7CB9\u7D8F\u7DAC\u7E61\u7F9E\u8129\u8331\u8490\u84DA\u85EA\u8896\u8AB0\u8B90\u8F38\u9042\u9083\u916C\u9296\u92B9\u968B\u96A7\u96A8\u96D6\u9700\u9808\u9996\u9AD3\u9B1A\u53D4\u587E\u5919\u5B70\u5BBF\u6DD1\u6F5A\u719F\u7421\u74B9\u8085\u83FD\u5DE1\u5F87\u5FAA\u6042\u65EC\u6812\u696F\u6A53\u6B89\u6D35\u6DF3\u73E3\u76FE\u77AC\u7B4D\u7D14\u8123\u821C\u8340\u84F4\u8563\u8A62\u8AC4\u9187\u931E\u9806\u99B4\u620C\u8853\u8FF0\u9265\u5D07\u5D27\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u5D69\u745F\u819D\u8768\u6FD5\u62FE\u7FD2\u8936\u8972\u4E1E\u4E58\u50E7\u52DD\u5347\u627F\u6607\u7E69\u8805\u965E\u4F8D\u5319\u5636\u59CB\u5AA4\u5C38\u5C4E\u5C4D\u5E02\u5F11\u6043\u65BD\u662F\u6642\u67BE\u67F4\u731C\u77E2\u793A\u7FC5\u8494\u84CD\u8996\u8A66\u8A69\u8AE1\u8C55\u8C7A\u57F4\u5BD4\u5F0F\u606F\u62ED\u690D\u6B96\u6E5C\u7184\u7BD2\u8755\u8B58\u8EFE\u98DF\u98FE\u4F38\u4F81\u4FE1\u547B\u5A20\u5BB8\u613C\u65B0\u6668\u71FC\u7533\u795E\u7D33\u814E\u81E3\u8398\u85AA\u85CE\u8703\u8A0A\u8EAB\u8F9B\uF971\u8FC5\u5931\u5BA4\u5BE6\u6089\u5BE9\u5C0B\u5FC3\u6C81\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uF972\u6DF1\u700B\u751A\u82AF\u8AF6\u4EC0\u5341\uF973\u96D9\u6C0F\u4E9E\u4FC4\u5152\u555E\u5A25\u5CE8\u6211\u7259\u82BD\u83AA\u86FE\u8859\u8A1D\u963F\u96C5\u9913\u9D09\u9D5D\u580A\u5CB3\u5DBD\u5E44\u60E1\u6115\u63E1\u6A02\u6E25\u9102\u9354\u984E\u9C10\u9F77\u5B89\u5CB8\u6309\u664F\u6848\u773C\u96C1\u978D\u9854\u9B9F\u65A1\u8B01\u8ECB\u95BC\u5535\u5CA9\u5DD6\u5EB5\u6697\u764C\u83F4\u95C7\u58D3\u62BC\u72CE\u9D28\u4EF0\u592E\u600F\u663B\u6B83\u79E7\u9D26\u5393\u54C0\u57C3\u5D16\u611B\u66D6\u6DAF\u788D\u827E\u9698\u9744\u5384\u627C\u6396\u6DB2\u7E0A\u814B\u984D\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u6AFB\u7F4C\u9DAF\u9E1A\u4E5F\u503B\u51B6\u591C\u60F9\u63F6\u6930\u723A\u8036\uF974\u91CE\u5F31\uF975\uF976\u7D04\u82E5\u846F\u84BB\u85E5\u8E8D\uF977\u4F6F\uF978\uF979\u58E4\u5B43\u6059\u63DA\u6518\u656D\u6698\uF97A\u694A\u6A23\u6D0B\u7001\u716C\u75D2\u760D\u79B3\u7A70\uF97B\u7F8A\uF97C\u8944\uF97D\u8B93\u91C0\u967D\uF97E\u990A\u5704\u5FA1\u65BC\u6F01\u7600\u79A6\u8A9E\u99AD\u9B5A\u9F6C\u5104\u61B6\u6291\u6A8D\u81C6\u5043\u5830\u5F66\u7109\u8A00\u8AFA\u5B7C\u8616\u4FFA\u513C\u56B4\u5944\u63A9\u6DF9\u5DAA\u696D\u5186\u4E88\u4F59\uF97F\uF980\uF981\u5982\uF982\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uF983\u6B5F\u6C5D\uF984\u74B5\u7916\uF985\u8207\u8245\u8339\u8F3F\u8F5D\uF986\u9918\uF987\uF988\uF989\u4EA6\uF98A\u57DF\u5F79\u6613\uF98B\uF98C\u75AB\u7E79\u8B6F\uF98D\u9006\u9A5B\u56A5\u5827\u59F8\u5A1F\u5BB4\uF98E\u5EF6\uF98F\uF990\u6350\u633B\uF991\u693D\u6C87\u6CBF\u6D8E\u6D93\u6DF5\u6F14\uF992\u70DF\u7136\u7159\uF993\u71C3\u71D5\uF994\u784F\u786F\uF995\u7B75\u7DE3\uF996\u7E2F\uF997\u884D\u8EDF\uF998\uF999\uF99A\u925B\uF99B\u9CF6\uF99C\uF99D\uF99E\u6085\u6D85\uF99F\u71B1\uF9A0\uF9A1\u95B1\u53AD\uF9A2\uF9A3\uF9A4\u67D3\uF9A5\u708E\u7130\u7430\u8276\u82D2\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uF9A6\u95BB\u9AE5\u9E7D\u66C4\uF9A7\u71C1\u8449\uF9A8\uF9A9\u584B\uF9AA\uF9AB\u5DB8\u5F71\uF9AC\u6620\u668E\u6979\u69AE\u6C38\u6CF3\u6E36\u6F41\u6FDA\u701B\u702F\u7150\u71DF\u7370\uF9AD\u745B\uF9AE\u74D4\u76C8\u7A4E\u7E93\uF9AF\uF9B0\u82F1\u8A60\u8FCE\uF9B1\u9348\uF9B2\u9719\uF9B3\uF9B4\u4E42\u502A\uF9B5\u5208\u53E1\u66F3\u6C6D\u6FCA\u730A\u777F\u7A62\u82AE\u85DD\u8602\uF9B6\u88D4\u8A63\u8B7D\u8C6B\uF9B7\u92B3\uF9B8\u9713\u9810\u4E94\u4F0D\u4FC9\u50B2\u5348\u543E\u5433\u55DA\u5862\u58BA\u5967\u5A1B\u5BE4\u609F\uF9B9\u61CA\u6556\u65FF\u6664\u68A7\u6C5A\u6FB3\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u70CF\u71AC\u7352\u7B7D\u8708\u8AA4\u9C32\u9F07\u5C4B\u6C83\u7344\u7389\u923A\u6EAB\u7465\u761F\u7A69\u7E15\u860A\u5140\u58C5\u64C1\u74EE\u7515\u7670\u7FC1\u9095\u96CD\u9954\u6E26\u74E6\u7AA9\u7AAA\u81E5\u86D9\u8778\u8A1B\u5A49\u5B8C\u5B9B\u68A1\u6900\u6D63\u73A9\u7413\u742C\u7897\u7DE9\u7FEB\u8118\u8155\u839E\u8C4C\u962E\u9811\u66F0\u5F80\u65FA\u6789\u6C6A\u738B\u502D\u5A03\u6B6A\u77EE\u5916\u5D6C\u5DCD\u7325\u754F\uF9BA\uF9BB\u50E5\u51F9\u582F\u592D\u5996\u59DA\u5BE5\uF9BC\uF9BD\u5DA2\u62D7\u6416\u6493\u64FE\uF9BE\u66DC\uF9BF\u6A48\uF9C0\u71FF\u7464\uF9C1\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u7A88\u7AAF\u7E47\u7E5E\u8000\u8170\uF9C2\u87EF\u8981\u8B20\u9059\uF9C3\u9080\u9952\u617E\u6B32\u6D74\u7E1F\u8925\u8FB1\u4FD1\u50AD\u5197\u52C7\u57C7\u5889\u5BB9\u5EB8\u6142\u6995\u6D8C\u6E67\u6EB6\u7194\u7462\u7528\u752C\u8073\u8338\u84C9\u8E0A\u9394\u93DE\uF9C4\u4E8E\u4F51\u5076\u512A\u53C8\u53CB\u53F3\u5B87\u5BD3\u5C24\u611A\u6182\u65F4\u725B\u7397\u7440\u76C2\u7950\u7991\u79B9\u7D06\u7FBD\u828B\u85D5\u865E\u8FC2\u9047\u90F5\u91EA\u9685\u96E8\u96E9\u52D6\u5F67\u65ED\u6631\u682F\u715C\u7A36\u90C1\u980A\u4E91\uF9C5\u6A52\u6B9E\u6F90\u7189\u8018\u82B8\u8553\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u904B\u9695\u96F2\u97FB\u851A\u9B31\u4E90\u718A\u96C4\u5143\u539F\u54E1\u5713\u5712\u57A3\u5A9B\u5AC4\u5BC3\u6028\u613F\u63F4\u6C85\u6D39\u6E72\u6E90\u7230\u733F\u7457\u82D1\u8881\u8F45\u9060\uF9C6\u9662\u9858\u9D1B\u6708\u8D8A\u925E\u4F4D\u5049\u50DE\u5371\u570D\u59D4\u5A01\u5C09\u6170\u6690\u6E2D\u7232\u744B\u7DEF\u80C3\u840E\u8466\u853F\u875F\u885B\u8918\u8B02\u9055\u97CB\u9B4F\u4E73\u4F91\u5112\u516A\uF9C7\u552F\u55A9\u5B7A\u5BA5\u5E7C\u5E7D\u5EBE\u60A0\u60DF\u6108\u6109\u63C4\u6538\u6709\uF9C8\u67D4\u67DA\uF9C9\u6961\u6962\u6CB9\u6D27\uF9CA\u6E38\uF9CB\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u6FE1\u7336\u7337\uF9CC\u745C\u7531\uF9CD\u7652\uF9CE\uF9CF\u7DAD\u81FE\u8438\u88D5\u8A98\u8ADB\u8AED\u8E30\u8E42\u904A\u903E\u907A\u9149\u91C9\u936E\uF9D0\uF9D1\u5809\uF9D2\u6BD3\u8089\u80B2\uF9D3\uF9D4\u5141\u596B\u5C39\uF9D5\uF9D6\u6F64\u73A7\u80E4\u8D07\uF9D7\u9217\u958F\uF9D8\uF9D9\uF9DA\uF9DB\u807F\u620E\u701C\u7D68\u878D\uF9DC\u57A0\u6069\u6147\u6BB7\u8ABE\u9280\u96B1\u4E59\u541F\u6DEB\u852D\u9670\u97F3\u98EE\u63D6\u6CE3\u9091\u51DD\u61C9\u81BA\u9DF9\u4F9D\u501A\u5100\u5B9C\u610F\u61FF\u64EC\u6905\u6BC5\u7591\u77E3\u7FA9\u8264\u858F\u87FB\u8863\u8ABC\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u8B70\u91AB\u4E8C\u4EE5\u4F0A\uF9DD\uF9DE\u5937\u59E8\uF9DF\u5DF2\u5F1B\u5F5B\u6021\uF9E0\uF9E1\uF9E2\uF9E3\u723E\u73E5\uF9E4\u7570\u75CD\uF9E5\u79FB\uF9E6\u800C\u8033\u8084\u82E1\u8351\uF9E7\uF9E8\u8CBD\u8CB3\u9087\uF9E9\uF9EA\u98F4\u990C\uF9EB\uF9EC\u7037\u76CA\u7FCA\u7FCC\u7FFC\u8B1A\u4EBA\u4EC1\u5203\u5370\uF9ED\u54BD\u56E0\u59FB\u5BC5\u5F15\u5FCD\u6E6E\uF9EE\uF9EF\u7D6A\u8335\uF9F0\u8693\u8A8D\uF9F1\u976D\u9777\uF9F2\uF9F3\u4E00\u4F5A\u4F7E\u58F9\u65E5\u6EA2\u9038\u93B0\u99B9\u4EFB\u58EC\u598A\u59D9\u6041\uF9F4\uF9F5\u7A14\uF9F6\u834F\u8CC3\u5165\u5344\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uF9F7\uF9F8\uF9F9\u4ECD\u5269\u5B55\u82BF\u4ED4\u523A\u54A8\u59C9\u59FF\u5B50\u5B57\u5B5C\u6063\u6148\u6ECB\u7099\u716E\u7386\u74F7\u75B5\u78C1\u7D2B\u8005\u81EA\u8328\u8517\u85C9\u8AEE\u8CC7\u96CC\u4F5C\u52FA\u56BC\u65AB\u6628\u707C\u70B8\u7235\u7DBD\u828D\u914C\u96C0\u9D72\u5B71\u68E7\u6B98\u6F7A\u76DE\u5C91\u66AB\u6F5B\u7BB4\u7C2A\u8836\u96DC\u4E08\u4ED7\u5320\u5834\u58BB\u58EF\u596C\u5C07\u5E33\u5E84\u5F35\u638C\u66B2\u6756\u6A1F\u6AA3\u6B0C\u6F3F\u7246\uF9FA\u7350\u748B\u7AE0\u7CA7\u8178\u81DF\u81E7\u838A\u846C\u8523\u8594\u85CF\u88DD\u8D13\u91AC\u9577\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u969C\u518D\u54C9\u5728\u5BB0\u624D\u6750\u683D\u6893\u6E3D\u6ED3\u707D\u7E21\u88C1\u8CA1\u8F09\u9F4B\u9F4E\u722D\u7B8F\u8ACD\u931A\u4F47\u4F4E\u5132\u5480\u59D0\u5E95\u62B5\u6775\u696E\u6A17\u6CAE\u6E1A\u72D9\u732A\u75BD\u7BB8\u7D35\u82E7\u83F9\u8457\u85F7\u8A5B\u8CAF\u8E87\u9019\u90B8\u96CE\u9F5F\u52E3\u540A\u5AE1\u5BC2\u6458\u6575\u6EF4\u72C4\uF9FB\u7684\u7A4D\u7B1B\u7C4D\u7E3E\u7FDF\u837B\u8B2B\u8CCA\u8D64\u8DE1\u8E5F\u8FEA\u8FF9\u9069\u93D1\u4F43\u4F7A\u50B3\u5168\u5178\u524D\u526A\u5861\u587C\u5960\u5C08\u5C55\u5EDB\u609B\u6230\u6813\u6BBF\u6C08\u6FB1\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u714E\u7420\u7530\u7538\u7551\u7672\u7B4C\u7B8B\u7BAD\u7BC6\u7E8F\u8A6E\u8F3E\u8F49\u923F\u9293\u9322\u942B\u96FB\u985A\u986B\u991E\u5207\u622A\u6298\u6D59\u7664\u7ACA\u7BC0\u7D76\u5360\u5CBE\u5E97\u6F38\u70B9\u7C98\u9711\u9B8E\u9EDE\u63A5\u647A\u8776\u4E01\u4E95\u4EAD\u505C\u5075\u5448\u59C3\u5B9A\u5E40\u5EAD\u5EF7\u5F81\u60C5\u633A\u653F\u6574\u65CC\u6676\u6678\u67FE\u6968\u6A89\u6B63\u6C40\u6DC0\u6DE8\u6E1F\u6E5E\u701E\u70A1\u738E\u73FD\u753A\u775B\u7887\u798E\u7A0B\u7A7D\u7CBE\u7D8E\u8247\u8A02\u8AEA\u8C9E\u912D\u914A\u91D8\u9266\u92CC\u9320\u9706\u9756\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u975C\u9802\u9F0E\u5236\u5291\u557C\u5824\u5E1D\u5F1F\u608C\u63D0\u68AF\u6FDF\u796D\u7B2C\u81CD\u85BA\u88FD\u8AF8\u8E44\u918D\u9664\u969B\u973D\u984C\u9F4A\u4FCE\u5146\u51CB\u52A9\u5632\u5F14\u5F6B\u63AA\u64CD\u65E9\u6641\u66FA\u66F9\u671D\u689D\u68D7\u69FD\u6F15\u6F6E\u7167\u71E5\u722A\u74AA\u773A\u7956\u795A\u79DF\u7A20\u7A95\u7C97\u7CDF\u7D44\u7E70\u8087\u85FB\u86A4\u8A54\u8ABF\u8D99\u8E81\u9020\u906D\u91E3\u963B\u96D5\u9CE5\u65CF\u7C07\u8DB3\u93C3\u5B58\u5C0A\u5352\u62D9\u731D\u5027\u5B97\u5F9E\u60B0\u616B\u68D5\u6DD9\u742E\u7A2E\u7D42\u7D9C\u7E31\u816B\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u8E2A\u8E35\u937E\u9418\u4F50\u5750\u5DE6\u5EA7\u632B\u7F6A\u4E3B\u4F4F\u4F8F\u505A\u59DD\u80C4\u546A\u5468\u55FE\u594F\u5B99\u5DDE\u5EDA\u665D\u6731\u67F1\u682A\u6CE8\u6D32\u6E4A\u6F8D\u70B7\u73E0\u7587\u7C4C\u7D02\u7D2C\u7DA2\u821F\u86DB\u8A3B\u8A85\u8D70\u8E8A\u8F33\u9031\u914E\u9152\u9444\u99D0\u7AF9\u7CA5\u4FCA\u5101\u51C6\u57C8\u5BEF\u5CFB\u6659\u6A3D\u6D5A\u6E96\u6FEC\u710C\u756F\u7AE3\u8822\u9021\u9075\u96CB\u99FF\u8301\u4E2D\u4EF2\u8846\u91CD\u537D\u6ADB\u696B\u6C41\u847A\u589E\u618E\u66FE\u62EF\u70DD\u7511\u75C7\u7E52\u84B8\u8B49\u8D08\u4E4B\u53EA\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u54AB\u5730\u5740\u5FD7\u6301\u6307\u646F\u652F\u65E8\u667A\u679D\u67B3\u6B62\u6C60\u6C9A\u6F2C\u77E5\u7825\u7949\u7957\u7D19\u80A2\u8102\u81F3\u829D\u82B7\u8718\u8A8C\uF9FC\u8D04\u8DBE\u9072\u76F4\u7A19\u7A37\u7E54\u8077\u5507\u55D4\u5875\u632F\u6422\u6649\u664B\u686D\u699B\u6B84\u6D25\u6EB1\u73CD\u7468\u74A1\u755B\u75B9\u76E1\u771E\u778B\u79E6\u7E09\u7E1D\u81FB\u852F\u8897\u8A3A\u8CD1\u8EEB\u8FB0\u9032\u93AD\u9663\u9673\u9707\u4F84\u53F1\u59EA\u5AC9\u5E19\u684E\u74C6\u75BE\u79E9\u7A92\u81A3\u86ED\u8CEA\u8DCC\u8FED\u659F\u6715\uF9FD\u57F7\u6F57\u7DDD\u8F2F\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u93F6\u96C6\u5FB5\u61F2\u6F84\u4E14\u4F98\u501F\u53C9\u55DF\u5D6F\u5DEE\u6B21\u6B64\u78CB\u7B9A\uF9FE\u8E49\u8ECA\u906E\u6349\u643E\u7740\u7A84\u932F\u947F\u9F6A\u64B0\u6FAF\u71E6\u74A8\u74DA\u7AC4\u7C12\u7E82\u7CB2\u7E98\u8B9A\u8D0A\u947D\u9910\u994C\u5239\u5BDF\u64E6\u672D\u7D2E\u50ED\u53C3\u5879\u6158\u6159\u61FA\u65AC\u7AD9\u8B92\u8B96\u5009\u5021\u5275\u5531\u5A3C\u5EE0\u5F70\u6134\u655E\u660C\u6636\u66A2\u69CD\u6EC4\u6F32\u7316\u7621\u7A93\u8139\u8259\u83D6\u84BC\u50B5\u57F0\u5BC0\u5BE8\u5F69\u63A1\u7826\u7DB5\u83DC\u8521\u91C7\u91F5\u518A\u67F5\u7B56\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u8CAC\u51C4\u59BB\u60BD\u8655\u501C\uF9FF\u5254\u5C3A\u617D\u621A\u62D3\u64F2\u65A5\u6ECC\u7620\u810A\u8E60\u965F\u96BB\u4EDF\u5343\u5598\u5929\u5DDD\u64C5\u6CC9\u6DFA\u7394\u7A7F\u821B\u85A6\u8CE4\u8E10\u9077\u91E7\u95E1\u9621\u97C6\u51F8\u54F2\u5586\u5FB9\u64A4\u6F88\u7DB4\u8F1F\u8F4D\u9435\u50C9\u5C16\u6CBE\u6DFB\u751B\u77BB\u7C3D\u7C64\u8A79\u8AC2\u581E\u59BE\u5E16\u6377\u7252\u758A\u776B\u8ADC\u8CBC\u8F12\u5EF3\u6674\u6DF8\u807D\u83C1\u8ACB\u9751\u9BD6\uFA00\u5243\u66FF\u6D95\u6EEF\u7DE0\u8AE6\u902E\u905E\u9AD4\u521D\u527F\u54E8\u6194\u6284\u62DB\u68A2\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u6912\u695A\u6A35\u7092\u7126\u785D\u7901\u790E\u79D2\u7A0D\u8096\u8278\u82D5\u8349\u8549\u8C82\u8D85\u9162\u918B\u91AE\u4FC3\u56D1\u71ED\u77D7\u8700\u89F8\u5BF8\u5FD6\u6751\u90A8\u53E2\u585A\u5BF5\u60A4\u6181\u6460\u7E3D\u8070\u8525\u9283\u64AE\u50AC\u5D14\u6700\u589C\u62BD\u63A8\u690E\u6978\u6A1E\u6E6B\u76BA\u79CB\u82BB\u8429\u8ACF\u8DA8\u8FFD\u9112\u914B\u919C\u9310\u9318\u939A\u96DB\u9A36\u9C0D\u4E11\u755C\u795D\u7AFA\u7B51\u7BC9\u7E2E\u84C4\u8E59\u8E74\u8EF8\u9010\u6625\u693F\u7443\u51FA\u672E\u9EDC\u5145\u5FE0\u6C96\u87F2\u885D\u8877\u60B4\u81B5\u8403\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u8D05\u53D6\u5439\u5634\u5A36\u5C31\u708A\u7FE0\u805A\u8106\u81ED\u8DA3\u9189\u9A5F\u9DF2\u5074\u4EC4\u53A0\u60FB\u6E2C\u5C64\u4F88\u5024\u55E4\u5CD9\u5E5F\u6065\u6894\u6CBB\u6DC4\u71BE\u75D4\u75F4\u7661\u7A1A\u7A49\u7DC7\u7DFB\u7F6E\u81F4\u86A9\u8F1C\u96C9\u99B3\u9F52\u5247\u52C5\u98ED\u89AA\u4E03\u67D2\u6F06\u4FB5\u5BE2\u6795\u6C88\u6D78\u741B\u7827\u91DD\u937C\u87C4\u79E4\u7A31\u5FEB\u4ED6\u54A4\u553E\u58AE\u59A5\u60F0\u6253\u62D6\u6736\u6955\u8235\u9640\u99B1\u99DD\u502C\u5353\u5544\u577C\uFA01\u6258\uFA02\u64E2\u666B\u67DD\u6FC1\u6FEF\u7422\u7438\u8A17\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u9438\u5451\u5606\u5766\u5F48\u619A\u6B4E\u7058\u70AD\u7DBB\u8A95\u596A\u812B\u63A2\u7708\u803D\u8CAA\u5854\u642D\u69BB\u5B95\u5E11\u6E6F\uFA03\u8569\u514C\u53F0\u592A\u6020\u614B\u6B86\u6C70\u6CF0\u7B1E\u80CE\u82D4\u8DC6\u90B0\u98B1\uFA04\u64C7\u6FA4\u6491\u6504\u514E\u5410\u571F\u8A0E\u615F\u6876\uFA05\u75DB\u7B52\u7D71\u901A\u5806\u69CC\u817F\u892A\u9000\u9839\u5078\u5957\u59AC\u6295\u900F\u9B2A\u615D\u7279\u95D6\u5761\u5A46\u5DF4\u628A\u64AD\u64FA\u6777\u6CE2\u6D3E\u722C\u7436\u7834\u7F77\u82AD\u8DDB\u9817\u5224\u5742\u677F\u7248\u74E3\u8CA9\u8FA6\u9211\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u962A\u516B\u53ED\u634C\u4F69\u5504\u6096\u6557\u6C9B\u6D7F\u724C\u72FD\u7A17\u8987\u8C9D\u5F6D\u6F8E\u70F9\u81A8\u610E\u4FBF\u504F\u6241\u7247\u7BC7\u7DE8\u7FE9\u904D\u97AD\u9A19\u8CB6\u576A\u5E73\u67B0\u840D\u8A55\u5420\u5B16\u5E63\u5EE2\u5F0A\u6583\u80BA\u853D\u9589\u965B\u4F48\u5305\u530D\u530F\u5486\u54FA\u5703\u5E03\u6016\u629B\u62B1\u6355\uFA06\u6CE1\u6D66\u75B1\u7832\u80DE\u812F\u82DE\u8461\u84B2\u888D\u8912\u900B\u92EA\u98FD\u9B91\u5E45\u66B4\u66DD\u7011\u7206\uFA07\u4FF5\u527D\u5F6A\u6153\u6753\u6A19\u6F02\u74E2\u7968\u8868\u8C79\u98C7\u98C4\u9A43\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u54C1\u7A1F\u6953\u8AF7\u8C4A\u98A8\u99AE\u5F7C\u62AB\u75B2\u76AE\u88AB\u907F\u9642\u5339\u5F3C\u5FC5\u6CCC\u73CC\u7562\u758B\u7B46\u82FE\u999D\u4E4F\u903C\u4E0B\u4F55\u53A6\u590F\u5EC8\u6630\u6CB3\u7455\u8377\u8766\u8CC0\u9050\u971E\u9C15\u58D1\u5B78\u8650\u8B14\u9DB4\u5BD2\u6068\u608D\u65F1\u6C57\u6F22\u6FA3\u701A\u7F55\u7FF0\u9591\u9592\u9650\u97D3\u5272\u8F44\u51FD\u542B\u54B8\u5563\u558A\u6ABB\u6DB5\u7DD8\u8266\u929C\u9677\u9E79\u5408\u54C8\u76D2\u86E4\u95A4\u95D4\u965C\u4EA2\u4F09\u59EE\u5AE6\u5DF7\u6052\u6297\u676D\u6841\u6C86\u6E2F\u7F38\u809B\u822A\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFA08\uFA09\u9805\u4EA5\u5055\u54B3\u5793\u595A\u5B69\u5BB3\u61C8\u6977\u6D77\u7023\u87F9\u89E3\u8A72\u8AE7\u9082\u99ED\u9AB8\u52BE\u6838\u5016\u5E78\u674F\u8347\u884C\u4EAB\u5411\u56AE\u73E6\u9115\u97FF\u9909\u9957\u9999\u5653\u589F\u865B\u8A31\u61B2\u6AF6\u737B\u8ED2\u6B47\u96AA\u9A57\u5955\u7200\u8D6B\u9769\u4FD4\u5CF4\u5F26\u61F8\u665B\u6CEB\u70AB\u7384\u73B9\u73FE\u7729\u774D\u7D43\u7D62\u7E23\u8237\u8852\uFA0A\u8CE2\u9249\u986F\u5B51\u7A74\u8840\u9801\u5ACC\u4FE0\u5354\u593E\u5CFD\u633E\u6D79\u72F9\u8105\u8107\u83A2\u92CF\u9830\u4EA8\u5144\u5211\u578B\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u5F62\u6CC2\u6ECE\u7005\u7050\u70AF\u7192\u73E9\u7469\u834A\u87A2\u8861\u9008\u90A2\u93A3\u99A8\u516E\u5F57\u60E0\u6167\u66B3\u8559\u8E4A\u91AF\u978B\u4E4E\u4E92\u547C\u58D5\u58FA\u597D\u5CB5\u5F27\u6236\u6248\u660A\u6667\u6BEB\u6D69\u6DCF\u6E56\u6EF8\u6F94\u6FE0\u6FE9\u705D\u72D0\u7425\u745A\u74E0\u7693\u795C\u7CCA\u7E1E\u80E1\u82A6\u846B\u84BF\u864E\u865F\u8774\u8B77\u8C6A\u93AC\u9800\u9865\u60D1\u6216\u9177\u5A5A\u660F\u6DF7\u6E3E\u743F\u9B42\u5FFD\u60DA\u7B0F\u54C4\u5F18\u6C5E\u6CD3\u6D2A\u70D8\u7D05\u8679\u8A0C\u9D3B\u5316\u548C\u5B05\u6A3A\u706B\u7575\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u798D\u79BE\u82B1\u83EF\u8A71\u8B41\u8CA8\u9774\uFA0B\u64F4\u652B\u78BA\u78BB\u7A6B\u4E38\u559A\u5950\u5BA6\u5E7B\u60A3\u63DB\u6B61\u6665\u6853\u6E19\u7165\u74B0\u7D08\u9084\u9A69\u9C25\u6D3B\u6ED1\u733E\u8C41\u95CA\u51F0\u5E4C\u5FA8\u604D\u60F6\u6130\u614C\u6643\u6644\u69A5\u6CC1\u6E5F\u6EC9\u6F62\u714C\u749C\u7687\u7BC1\u7C27\u8352\u8757\u9051\u968D\u9EC3\u532F\u56DE\u5EFB\u5F8A\u6062\u6094\u61F7\u6666\u6703\u6A9C\u6DEE\u6FAE\u7070\u736A\u7E6A\u81BE\u8334\u86D4\u8AA8\u8CC4\u5283\u7372\u5B96\u6A6B\u9404\u54EE\u5686\u5B5D\u6548\u6585\u66C9\u689F\u6D8D\u6DC6\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\u723B\u80B4\u9175\u9A4D\u4FAF\u5019\u539A\u540E\u543C\u5589\u55C5\u5E3F\u5F8C\u673D\u7166\u73DD\u9005\u52DB\u52F3\u5864\u58CE\u7104\u718F\u71FB\u85B0\u8A13\u6688\u85A8\u55A7\u6684\u714A\u8431\u5349\u5599\u6BC1\u5F59\u5FBD\u63EE\u6689\u7147\u8AF1\u8F1D\u9EBE\u4F11\u643A\u70CB\u7566\u8667\u6064\u8B4E\u9DF8\u5147\u51F6\u5308\u6D36\u80F8\u9ED1\u6615\u6B23\u7098\u75D5\u5403\u5C79\u7D07\u8A16\u6B20\u6B3D\u6B46\u5438\u6070\u6D3D\u7FD5\u8208\u50D6\u51DE\u559C\u566B\u56CD\u59EC\u5B09\u5E0C\u6199\u6198\u6231\u665E\u66E6\u7199\u71B9\u71BA\u72A7\u79A7\u7A00\u7FB2\u8A70\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD";
    LEAD_LO = 129;
    TRAIL_LO = 65;
    SPAN = 190;
  }
});

// netlify/functions/etf.js
var etf_exports = {};
__export(etf_exports, {
  config: () => config2,
  default: () => etf_default
});
function _mkDec(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
async function fetchJsonEuc(url, ms, headers) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: Object.assign({ "User-Agent": UA8, "Accept": "application/json" }, headers || {}), signal: c.signal });
    const buf = await r.arrayBuffer();
    const txt = decodeSmart2(buf, r.headers.get("content-type"));
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  } finally {
    clearTimeout(t);
  }
}
async function fetchJson(url, ms, headers) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: Object.assign({ "User-Agent": UA8, "Accept": "application/json" }, headers || {}), signal: c.signal });
    const txt = await r.text();
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  } finally {
    clearTimeout(t);
  }
}
async function withTimeout(fn, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fn(c.signal);
  } finally {
    clearTimeout(t);
  }
}
function decodeSmart2(buf, headerCT) {
  const dec = (enc) => {
    try {
      return _mkDec(enc).decode(buf);
    } catch {
      return null;
    }
  };
  const score2 = (x) => {
    if (!x) return -1e9;
    const bad = (x.match(/\uFFFD/g) || []).length;
    const han = (x.match(/[가-힣]/g) || []).length;
    const broken = (x.match(/[\uD800-\uDFFF\u3130-\u318F]/g) || []).length;
    return han - bad * 5 - broken * 3;
  };
  let declared = "";
  const mH = /charset=([\w-]+)/i.exec(String(headerCT || ""));
  if (mH) declared = mH[1].toLowerCase();
  if (!declared) {
    const head = dec("latin1") || "";
    const mM = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head.slice(0, 2e3));
    if (mM) declared = mM[1].toLowerCase();
  }
  const norm2 = (c) => c === "ms949" || c === "cp949" || c === "ksc5601" ? "euc-kr" : c;
  const cands = [];
  if (declared) {
    const t = dec(norm2(declared));
    if (t) cands.push(t);
  }
  const u = dec("utf-8"), e = dec("euc-kr");
  if (u) cands.push(u);
  if (e) cands.push(e);
  return cands.sort((a, b) => score2(b) - score2(a))[0] || "";
}
async function fetchHtmlEuc(url, ms, headers) {
  return withTimeout(async (sig) => {
    const r = await fetch(url, { headers: Object.assign({ "User-Agent": UA8, "Accept": "text/html,*/*" }, headers || {}), signal: sig });
    const buf = await r.arrayBuffer();
    return decodeSmart2(buf, r.headers.get("content-type"));
  }, ms);
}
function leverageOf(name) {
  const n = String(name || "");
  if (/인버스\s*2X|곱버스/.test(n)) return -2;
  if (/인버스/.test(n)) return -1;
  if (/레버리지|2X/i.test(n)) return 2;
  return 1;
}
async function fromList(code) {
  let list = null;
  if (LIST_CACHE.list && Date.now() - LIST_CACHE.at < 3e5) list = LIST_CACHE.list;
  if (!list) {
    const j = await fetchJsonEuc(
      "https://finance.naver.com/api/sise/etfItemList.nhn?etfType=0&targetColumn=market_sum&sortOrder=desc",
      5200,
      { "Referer": "https://finance.naver.com/sise/etf.naver" }
    );
    list = j && j.result && j.result.etfItemList || [];
    if (list.length) LIST_CACHE = { at: Date.now(), list };
  }
  if (!list.length) return { ok: false, n: 0, me: null, peers: [] };
  const up = String(code).toUpperCase();
  const me = list.find((x) => String(x.itemcode || "").toUpperCase() === up) || null;
  const sameTab = me ? list.filter((x) => x.etfTabCode === me.etfTabCode && String(x.itemcode).toUpperCase() !== up) : [];
  const peers = sameTab.slice(0, 5);
  const peerPool = me ? list.filter((x) => String(x.itemcode).toUpperCase() !== up).slice(0, 400) : [];
  const mk = (x) => ({
    code: String(x.itemcode || "").toUpperCase(),
    name: x.itemname,
    price: num3(x.nowVal),
    changeRate: num3(x.changeRate),
    nav: num3(x.nav),
    m3: num3(x.threeMonthEarnRate),
    volume: num3(x.quant),
    value: num3(x.amonut),
    // 거래대금(백만원)
    marketSum: num3(x.marketSum),
    // [v9.71] 네이버 ETF 목록의 marketSum 은 시가총액(억원)이다 — 순자산총액(AUM)이 아니다
    tab: TAB[x.etfTabCode] || ""
  });
  return { ok: !!me, n: list.length, me: me ? mk(me) : null, peers: peers.map(mk), peerPool: peerPool.map(mk) };
}
function pick(obj, keys) {
  for (const k of keys) if (obj[k] !== void 0 && obj[k] !== null && obj[k] !== "") return obj[k];
  return null;
}
function asComponents(arr, keyHinted) {
  if (!Array.isArray(arr) || arr.length < 3 || arr.length > 400) return null;
  const objs = arr.filter((x) => x && typeof x === "object" && !Array.isArray(x));
  if (objs.length !== arr.length) return null;
  const out = [];
  for (const o of objs) {
    const nm = pick(o, NAME_KEYS);
    if (!nm || typeof nm !== "string" || !nm.trim()) return null;
    let w = num3(pick(o, WEIGHT_KEYS));
    if (w === null) {
      for (const [k, v] of Object.entries(o)) {
        if (NAME_KEYS.includes(k) || CODE_KEYS.includes(k) || SKIP_NUM_KEYS.test(k)) continue;
        const n = num3(v);
        if (n !== null && n > 0 && n <= 100) {
          w = n;
          break;
        }
      }
    }
    if (w === null || w < 0) return null;
    out.push({ name: nm.trim(), code: String(pick(o, CODE_KEYS) || "").toUpperCase().replace(/\.(KS|KQ)$/, "").replace(/^A(?=[0-9])/, ""), weight: w });
  }
  let total = out.reduce((a, b) => a + b.weight, 0);
  let scale = 1;
  if (total > 0.5 && total <= 2) scale = 100;
  else if (total >= 5e3 && total <= 2e4) scale = 0.01;
  if (scale !== 1) {
    out.forEach((x) => {
      x.weight *= scale;
    });
    total *= scale;
  }
  if (total > 120) return null;
  if (out.some((x) => x.weight > 100)) return null;
  const codeN = out.filter((x) => /^[0-9A-Z]{6}$/.test(x.code)).length;
  const partialOK = keyHinted && codeN >= Math.max(3, out.length * 0.5) && total >= 8 && out.length >= 5;
  if (total < 80 && !partialOK) return null;
  const brandish = out.filter((x) => ETF_BRAND_RE.test(x.name)).length;
  if (brandish > out.length * 0.3) return null;
  const withCode = out.filter((x) => /^[0-9A-Z]{6}$/.test(x.code)).length;
  if (!keyHinted && withCode < out.length * 0.5) return null;
  return out.sort((a, b) => b.weight - a.weight).slice(0, 120);
}
function asBondComponents(arr) {
  if (!Array.isArray(arr) || arr.length < 2 || arr.length > 400) return null;
  const objs = arr.filter((x) => x && typeof x === "object" && !Array.isArray(x));
  if (objs.length !== arr.length) return null;
  const out = [];
  for (const o of objs) {
    const nm = pick(o, NAME_KEYS) || o.bondName || o.assetName || o.itemNm;
    if (!nm || typeof nm !== "string" || !nm.trim()) return null;
    const w = num3(pick(o, WEIGHT_KEYS));
    if (w === null || w < 0 || w > 100) return null;
    out.push({ name: String(nm).trim(), code: "", weight: w });
  }
  let total = out.reduce((a, b) => a + b.weight, 0);
  if (total > 0.5 && total <= 2) {
    out.forEach((x) => {
      x.weight *= 100;
    });
    total *= 100;
  }
  if (total < 80 || total > 120) return null;
  return out.sort((a, b) => b.weight - a.weight).slice(0, 120);
}
function deepFindBonds(node, depth) {
  if (!node || depth > 5) return null;
  if (Array.isArray(node)) {
    const got = asBondComponents(node);
    if (got) return got;
    for (const v of node) {
      const r = deepFindBonds(v, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node)) {
      const r = deepFindBonds(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}
function collectComponents(node, depth, out) {
  if (!node || depth > 6 || out.length > 40) return out;
  if (Array.isArray(node)) {
    const got = asComponents(node, false);
    if (got) out.push(got);
    for (const v of node) collectComponents(v, depth + 1, out);
    return out;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node)) collectComponents(v, depth + 1, out);
  }
  return out;
}
function bestComponents(cands) {
  if (!cands || !cands.length) return null;
  return cands.slice().sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const sa = Math.abs(100 - a.reduce((x, y) => x + y.weight, 0));
    const sb = Math.abs(100 - b.reduce((x, y) => x + y.weight, 0));
    return sa - sb;
  })[0];
}
async function yahooAuth2() {
  if (YA_CACHE.v && Date.now() - YA_CACHE.at < 6e5) return YA_CACHE.v;
  let cookie = "";
  for (const u of ["https://finance.yahoo.com/", "https://fc.yahoo.com/"]) {
    try {
      const r = await withTimeout((sig) => fetch(u, { headers: { "User-Agent": UA8, "Accept": "text/html,*/*" }, signal: sig }), 2500);
      const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""];
      const ck = sc.map((x) => String(x).split(";")[0]).filter(Boolean).join("; ");
      if (ck) {
        cookie = ck;
        break;
      }
    } catch {
    }
  }
  let crumb = "";
  try {
    const r = await withTimeout((sig) => fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA8, "Cookie": cookie, "Accept": "text/plain" }, signal: sig }), 2500);
    crumb = (await r.text()).trim();
  } catch {
  }
  const v = { cookie, crumb };
  if (crumb) YA_CACHE = { at: Date.now(), v };
  return v;
}
function normHoldings(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  let out = arr.map((h) => {
    const w = num3(h.holdingPercent && h.holdingPercent.raw !== void 0 ? h.holdingPercent.raw : h.holdingPercent);
    return {
      name: String(h.holdingName || h.symbol || "").trim(),
      code: String(h.symbol || "").toUpperCase().replace(/\.(KS|KQ)$/, "").replace(/^A(?=[0-9])/, ""),
      weight: w
    };
  }).filter((x) => x.name && x.weight != null);
  if (!out.length) return null;
  const sum = out.reduce((a, b) => a + b.weight, 0);
  if (sum > 0 && sum <= 2) out = out.map((x) => ({ ...x, weight: x.weight * 100 }));
  const tot = out.reduce((a, b) => a + b.weight, 0);
  if (tot < 30 || tot > 130) return null;
  return out.sort((a, b) => b.weight - a.weight).slice(0, 120);
}
function proxyFor(name, baseIndex) {
  const hay = `${baseIndex || ""} ${name || ""}`;
  for (const [re, sym, label] of INDEX_PROXY) if (re.test(hay)) return { sym, label };
  return null;
}
function domProxyFor(name) {
  const n = String(name || "");
  if (/미국|해외|글로벌|중국|일본|인도|베트남|유로|선진국|이머징/i.test(n)) return null;
  for (const [re, code, label] of DOM_PROXY) if (re.test(n)) return { code, label };
  return null;
}
function assetKindOf(name) {
  const n = String(name || "");
  if (/TDF|타겟데이트|생애주기|자산배분|밸런스|EMP/i.test(n)) return "tdf";
  if (/CD\s*\d*\s*년?\s*금리|KOFR|머니마켓|MMF|파킹|초단기\s*금리/i.test(n)) return "money";
  if (/레버리지|인버스|선물|2X|곱버스/i.test(n)) return "derivative";
  if (/금\s*현물|KRX\s*금|골드|GOLD|은\s*현물|실버|SILVER|원유|WTI|천연가스|구리|農|농산물|팔라듐|백금/i.test(n)) return "commodity";
  if (/혼합|채권혼합|\d+\s*[:：]\s*\d+/i.test(n)) return "mixed";
  if (/통안채|국고채|회사채|종합채권|단기채|금융채|은행채|전단채|특수채|카드채|여전채|크레딧|채권|국채|CP\b/i.test(n)) return "bond";
  return null;
}
async function fromIndexProxy(name, baseIndex, auth) {
  const p = proxyFor(name, baseIndex);
  if (!p) return { holdings: [], sectors: [], tried: ["noproxy"], label: null };
  const { cookie, crumb } = auth || {};
  const u = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${p.sym}?modules=topHoldings${crumb ? "&crumb=" + encodeURIComponent(crumb) : ""}`;
  let j = null;
  try {
    j = await fetchJson(u, 5e3, { "Cookie": cookie || "", "Referer": "https://finance.yahoo.com/" });
  } catch {
  }
  const th = j && j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0] && j.quoteSummary.result[0].topHoldings;
  if (!th) return { holdings: [], sectors: [], tried: [p.sym + ":x"], label: p.label };
  const holdings = normHoldings(th.holdings) || [];
  const sectors = Array.isArray(th.sectorWeightings) ? th.sectorWeightings.map((o) => {
    const k = Object.keys(o)[0];
    const v = num3(o[k] && o[k].raw !== void 0 ? o[k].raw : o[k]);
    return { name: SECTOR_KO[k] || k, weight: v != null && v <= 2 ? v * 100 : v };
  }).filter((x) => x.name && x.weight != null && x.weight > 0) : [];
  return { holdings, sectors, tried: [p.sym + ":h" + holdings.length], label: p.label, proxy: p.sym };
}
async function fromYahoo(code) {
  const { cookie, crumb } = await yahooAuth2();
  const syms = [code + ".KS", code + ".KQ"];
  const tried = [];
  for (const sym of syms) {
    const u = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=topHoldings${crumb ? "&crumb=" + encodeURIComponent(crumb) : ""}`;
    let j = null;
    try {
      j = await fetchJson(u, 6e3, { "Cookie": cookie, "Referer": "https://finance.yahoo.com/" });
    } catch {
    }
    const res = j && j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
    const th = res && res.topHoldings;
    if (!th) {
      tried.push(sym + ":x");
      continue;
    }
    const holdings = normHoldings(th.holdings);
    const sectors = Array.isArray(th.sectorWeightings) ? th.sectorWeightings.map((o) => {
      const k = Object.keys(o)[0];
      const v = num3(o[k] && o[k].raw !== void 0 ? o[k].raw : o[k]);
      return { name: SECTOR_KO[k] || k, weight: v != null && v <= 2 ? v * 100 : v };
    }).filter((x) => x.name && x.weight != null && x.weight > 0) : [];
    tried.push(sym + ":h" + (holdings ? holdings.length : 0) + "s" + sectors.length);
    if (holdings) return { holdings, sectors, tried };
  }
  return { holdings: [], sectors: [], tried };
}
function cellsOf2(row) {
  const out = [];
  const re = /<(t[hd])[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while (m = re.exec(row)) {
    out.push(m[2].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim());
  }
  return out;
}
function looksLikeName(v) {
  const t = String(v || "").trim();
  if (!t || t.length > 40) return false;
  if (DATE_LIKE.test(t)) return false;
  if (/^[\d.,%\-+\s]+$/.test(t)) return false;
  if (!/[가-힣A-Za-z]/.test(t)) return false;
  return true;
}
function parseWeightTable(tableHtml, labeled) {
  const rawRows = tableHtml.split(/<tr[^>]*>/i).slice(1);
  if (rawRows.length < 3) return null;
  let wIdx = -1, nIdx = -1;
  for (const row of rawRows.slice(0, 3)) {
    const cs = cellsOf2(row);
    if (!cs.length) continue;
    const w = cs.findIndex((c) => /비중|가중치|weight/i.test(c));
    const n = cs.findIndex((c) => /종목|이름|name/i.test(c));
    if (w >= 0) {
      wIdx = w;
      nIdx = n >= 0 ? n : 0;
      break;
    }
  }
  const out = [];
  for (const row of rawRows) {
    const cs = cellsOf2(row);
    if (cs.length < 2) continue;
    if (/비중|종목명|주식수|평가금액/.test(cs.join(" ")) && !/\d/.test(cs.join(""))) continue;
    const mc = row.match(/code=([0-9A-Za-z]{6})/);
    let name = (wIdx >= 0 ? cs[nIdx] : cs[0]) || "";
    name = name.trim();
    if (!looksLikeName(name)) continue;
    let w = null;
    if (wIdx >= 0 && cs[wIdx] != null) {
      const n = Number(String(cs[wIdx]).replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(n) && n > 0 && n <= 100) w = n;
    }
    if (w == null) {
      for (let i = cs.length - 1; i >= 1; i--) {
        const n = Number(String(cs[i]).replace(/[^0-9.-]/g, ""));
        if (Number.isFinite(n) && n > 0 && n <= 100) {
          w = n;
          break;
        }
      }
    }
    if (w == null) continue;
    out.push({ name, code: mc ? mc[1].toUpperCase() : "", weight: w });
  }
  const seen = /* @__PURE__ */ new Set();
  const uniq = out.filter((x) => {
    const k = x.code || x.name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (uniq.length < 3) return null;
  const total = uniq.reduce((a, b) => a + b.weight, 0);
  if (total > 120) return null;
  const withCodeN = uniq.filter((x) => /^[0-9A-Z]{6}$/.test(x.code)).length;
  const partialOk = labeled && withCodeN >= Math.max(3, uniq.length * 0.6) && total >= 8;
  if (total < 80 && !partialOk) return null;
  const withCode = uniq.filter((x) => /^[0-9A-Z]{6}$/.test(x.code)).length;
  if (!labeled && withCode < uniq.length * 0.6) return null;
  if (labeled && withCode === 0 && !uniq.some((x) => /채권|국고|통안|금융채|회사채|예금|현금|원화/.test(x.name))) return null;
  return uniq.sort((a, b) => b.weight - a.weight).slice(0, 120);
}
function infoFromHtml(html) {
  const text = String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const out = {};
  let m;
  if (m = /(?:총\s*)?보수(?:율)?\s*:?\s*(?:연\s*)?([0-9]+(?:\.[0-9]+)?)\s*%/.exec(text)) out.fee = Number(m[1]);
  if (m = /기초지수\s*:?\s*([A-Za-z0-9가-힣&()\-\.\s]{2,40}?)(?=\s{2,}|\s*(?:상장일|운용사|총보수|NAV|괴리율|추적))/.exec(text)) out.indexName = m[1].trim();
  if (m = /([가-힣A-Za-z]{2,12}자산운용)/.exec(text)) out.company = m[1].trim();
  if (m = /상장일\s*:?\s*(\d{4}[.\-\/]\s?\d{1,2}[.\-\/]\s?\d{1,2})/.exec(text)) out.listedDate = m[1].replace(/\s/g, "");
  if (m = /NAV\s*:?\s*([0-9,]+(?:\.[0-9]+)?)/.exec(text)) out.navDetail = Number(m[1].replace(/,/g, ""));
  if (m = /괴리율\s*:?\s*([-+]?[0-9]+(?:\.[0-9]+)?)\s*%/.exec(text)) out.deviationRate = Number(m[1]);
  if (m = /추적오차(?:율)?\s*:?\s*([0-9]+(?:\.[0-9]+)?)\s*%/.exec(text)) out.trackingError = Number(m[1]);
  if (m = /구성\s*종목\s*수\s*:?\s*([0-9]{1,4})\s*(?:개|종목)?/.exec(text)) out.holdingsCount = Number(m[1]);
  else if (m = /총\s*([0-9]{1,4})\s*종목/.exec(text)) out.holdingsCount = Number(m[1]);
  if (out.holdingsCount != null && (out.holdingsCount < 1 || out.holdingsCount > 2e3)) delete out.holdingsCount;
  return out;
}
async function fromNaverHtml(code, ms) {
  const tried = [];
  let htmlR;
  try {
    htmlR = { status: "fulfilled", value: await fetchHtmlEuc(`https://finance.naver.com/item/main.naver?code=${code}`, ms || 4600, { "Referer": "https://finance.naver.com/" }) };
  } catch (e) {
    htmlR = { status: "rejected" };
  }
  const j = null;
  const arr = j && (j.result?.etfItemPdfList || j.etfItemPdfList || j.result?.pdfList) || null;
  if (Array.isArray(arr) && arr.length) {
    const got = arr.map((x) => ({
      name: String(x.itemname || x.itemName || x.stockName || "").trim(),
      code: String(x.itemcode || x.itemCode || "").toUpperCase(),
      weight: Number(String(x.weight ?? x.amonut ?? x.rate ?? "").replace(/[^0-9.-]/g, ""))
    })).filter((x) => x.name && Number.isFinite(x.weight) && x.weight > 0 && looksLikeName(x.name));
    const tot = got.reduce((a, b) => a + b.weight, 0);
    tried.push("pdfapi:" + got.length + "/" + tot.toFixed(0) + "%");
    if (got.length >= 3 && tot >= 80 && tot <= 120) {
      return { holdings: got.sort((a, b) => b.weight - a.weight).slice(0, 120), info: {}, tried };
    }
  } else tried.push("pdfapi:x");
  const html = htmlR.status === "fulfilled" ? htmlR.value : "";
  if (!html) {
    tried.push("html:x");
    return { holdings: [], info: {}, tried };
  }
  const htmlInfo = infoFromHtml(html);
  const parts = html.split(/<table[^>]*>/i);
  const tables = parts.slice(1).map((t) => t.split(/<\/table>/i)[0]);
  const idx = parts.slice(0, -1);
  const scored = tables.map((t, i) => {
    const ctx = (idx[i] || "").slice(-400) + t.slice(0, 300);
    return { t, label: /구성종목|구성비중|CU당|PDF/.test(ctx) ? 2 : 0 };
  }).sort((a, b) => b.label - a.label);
  for (const { t, label } of scored) {
    const got = parseWeightTable(t, label > 0);
    if (got) {
      tried.push("html:tbl" + (label ? "(labeled)" : "") + ":" + got.length);
      return { holdings: got, info: htmlInfo, tried };
    }
  }
  tried.push("html:notbl(" + tables.length + ")");
  return { holdings: [], info: htmlInfo, tried };
}
async function fromPdfApi(code, ms) {
  try {
    const j = await fetchJsonEuc(
      `https://finance.naver.com/api/sise/etfItemPdfList.nhn?etfCode=${code}`,
      ms || 2500,
      { "Referer": `https://finance.naver.com/item/main.naver?code=${code}` }
    );
    const arr = j && (j.result?.etfItemPdfList || j.etfItemPdfList || j.result?.pdfList) || null;
    if (!Array.isArray(arr) || !arr.length) return { holdings: [], tried: ["pdfapi:x"] };
    const got = arr.map((x) => ({
      name: String(x.itemname || x.itemName || x.stockName || "").trim(),
      code: String(x.itemcode || x.itemCode || "").toUpperCase(),
      weight: Number(String(x.weight ?? x.amonut ?? x.rate ?? "").replace(/[^0-9.-]/g, ""))
    })).filter((x) => x.name && Number.isFinite(x.weight) && x.weight > 0 && looksLikeName(x.name));
    const tot = got.reduce((a, b) => a + b.weight, 0);
    if (got.length >= 3 && tot >= 80 && tot <= 120) {
      return { holdings: got.sort((a, b) => b.weight - a.weight).slice(0, 120), tried: ["pdfapi:" + got.length] };
    }
    return { holdings: [], tried: ["pdfapi:" + got.length + "/" + tot.toFixed(0) + "%"] };
  } catch {
    return { holdings: [], tried: ["pdfapi:err"] };
  }
}
async function fromDetail(code, maxMs) {
  const T2 = Date.now();
  const left = () => (maxMs || 6500) - (Date.now() - T2);
  const hdr = { "Referer": `https://m.stock.naver.com/domestic/stock/${code}/total` };
  const tried = [];
  const info = {};
  let holdings = [];
  const absorb = (tag, j) => {
    if (!j || typeof j !== "object") {
      tried.push(tag + ":x");
      return;
    }
    tried.push(tag + "{" + shapeOf(j).slice(0, 200) + "}");
    const comp = j.etfComponentList || j.componentList || j.etfComponents || j.components || j.cuList || j.holdings || j.portfolio || j.stocks || j.etfAnalysis && (j.etfAnalysis.componentList || j.etfAnalysis.etfComponentList) || j.result && (j.result.componentList || j.result.components) || null;
    const cands = [];
    if (Array.isArray(comp) && comp.length) {
      const g = asComponents(comp, true);
      if (g) cands.push(g);
    }
    collectComponents(j, 0, cands);
    const best = bestComponents(cands);
    if (best && best.length > holdings.length) {
      holdings = best;
      tried.push(tag + ":n" + best.length);
    }
    if (!holdings.length) {
      const gb = deepFindBonds(j, 0);
      if (gb) {
        holdings = gb;
        tried.push(tag + ":bond" + gb.length);
      }
    }
    const b = j.etfBasicInfo || j.basicInfo || j.etfInfo || j;
    if (b && typeof b === "object") {
      info.indexName = info.indexName || b.etfBaseIndex || b.baseIndexName || b.benchmarkName || b.underlyingIndexName || b.baseIndex || null;
      info.company = info.company || b.issuerName || b.amcName || b.companyName || b.managementCompany || null;
      info.category = info.category || b.etfType || b.category || b.groupName || null;
      info.listedDate = info.listedDate || b.listedDate || b.listingDate || null;
      info.summary = info.summary || b.etfSummary || b.summary || b.description || null;
      if (info.fee == null) info.fee = num3(b.totalFeeRatio ?? b.feeRatio ?? b.expenseRatio ?? b.fee ?? b.etfFee ?? b.totalFee);
      if (info.navDetail == null) info.navDetail = num3(b.nav ?? b.totalNav);
      if (info.deviationRate == null && b.deviationRate !== void 0) {
        let d = num3(b.deviationRate);
        if (d != null) {
          const sg = String(b.deviationSign ?? "");
          if (/^(4|5)$/.test(sg) || sg === "-") d = -Math.abs(d);
          else if (/^(1|2)$/.test(sg) || sg === "+") d = Math.abs(d);
          info.deviationRate = d;
        }
      }
      if (info.trackingError == null) info.trackingError = num3(b.chaseErrorRate);
    }
    if (Array.isArray(j.totalInfos)) {
      for (const it of j.totalInfos) {
        const k = String(it.key || it.code || "");
        const v = it.value;
        if (/기초지수|추종지수/.test(k) && !info.indexName) info.indexName = String(v);
        if (/운용사|자산운용/.test(k) && !info.company) info.company = String(v);
        if (/보수/.test(k) && info.fee == null) info.fee = num3(v);
        if (/상장일|설정일/.test(k) && !info.listedDate) info.listedDate = String(v);
        if (/^NAV$|순자산가치/i.test(k) && info.navDetail == null) info.navDetail = num3(v);
      }
      info.totalInfos = j.totalInfos.map((x) => ({ k: String(x.key || x.code || ""), v: String(x.value ?? "") })).filter((x) => x.k && x.v).slice(0, 14);
    }
  };
  let j1 = null;
  try {
    j1 = await fetchJson(`https://m.stock.naver.com/api/stock/${code}/etfAnalysis`, Math.max(700, Math.min(1400, left() - 200)), hdr);
  } catch {
  }
  absorb("etfAnalysis", j1);
  if (!holdings.length && left() > 1300) {
    const more = [
      ["etfComponent", `https://m.stock.naver.com/api/stock/${code}/etfComponent`],
      ["integration", `https://m.stock.naver.com/api/stock/${code}/integration`]
    ];
    const rs = await Promise.allSettled(more.map(([, u]) => fetchJson(u, Math.max(900, left() - 400), hdr)));
    more.forEach(([tag], i) => absorb(tag, rs[i].status === "fulfilled" ? rs[i].value : null));
  } else if ((info.fee == null || !info.indexName) && left() > 1300) {
    let j2 = null;
    try {
      j2 = await fetchJson(`https://m.stock.naver.com/api/stock/${code}/integration`, Math.max(900, left() - 400), hdr);
    } catch {
    }
    absorb("integration", j2);
  }
  return { info, holdings, tried };
}
function themeKeyOf(name) {
  let n = String(name || "");
  n = n.replace(/^(KODEX|TIGER|SOL|ACE|RISE|PLUS|KBSTAR|KOSEF|ARIRANG|HANARO|TIMEFOLIO|KIWOOM|WOORI|BNK|히어로즈|마이다스|파워)\s*/i, "");
  n = n.replace(/(TOP\s*\d+|플러스|Plus|액티브|Active|레버리지|인버스|선물|합성|\(H\)|H\)|\d+X|ETF|커버드콜|타겟|프리미엄|고배당|채권혼합|EQ)/gi, "");
  const m = n.match(/[가-힣A-Za-z]{2,}/);
  return m ? m[0].trim() : "";
}
function longestCommon(a, b) {
  a = String(a || "");
  b = String(b || "");
  let best = "";
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 2; j <= a.length; j++) {
      const sub = a.slice(i, j);
      if (sub.length <= best.length) continue;
      if (b.includes(sub)) best = sub;
    }
  }
  return best;
}
function peerByTheme(name, peers) {
  const clean3 = themeKeyOf(name) ? String(name).replace(/^(KODEX|TIGER|SOL|ACE|RISE|PLUS|KBSTAR|KOSEF|ARIRANG|HANARO|TIMEFOLIO|KIWOOM|WOORI|BNK|히어로즈|마이다스|파워)\s*/i, "") : "";
  if (!clean3) return null;
  const scored = (peers || []).map((p) => {
    const other = String(p.name || "").replace(/^(KODEX|TIGER|SOL|ACE|RISE|PLUS|KBSTAR|KOSEF|ARIRANG|HANARO|TIMEFOLIO|KIWOOM|WOORI|BNK|히어로즈|마이다스|파워)\s*/i, "");
    const lc = longestCommon(clean3, other);
    return { p, score: /[가-힣]/.test(lc) ? lc.length : 0, key: lc };
  }).filter((x) => x.score >= 2);
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score || (b.p.marketSum || 0) - (a.p.marketSum || 0));
  return Object.assign({}, scored[0].p, { themeKey: scored[0].key });
}
var UA8, num3, TAB, BRAND, companyOf, LIST_CACHE, NAME_KEYS, WEIGHT_KEYS, CODE_KEYS, ETF_BRAND_RE, SKIP_NUM_KEYS, YA_CACHE, INDEX_PROXY, DOM_PROXY, SECTOR_KO, DATE_LIKE, etf_default, config2;
var init_etf = __esm({
  "netlify/functions/etf.js"() {
    init_euckr();
    UA8 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
    num3 = (v) => {
      if (v === null || v === void 0 || v === "") return null;
      const n = Number(String(v).replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    TAB = { 1: "\uAD6D\uB0B4 \uC2DC\uC7A5\uC9C0\uC218", 2: "\uAD6D\uB0B4 \uC5C5\uC885\xB7\uD14C\uB9C8", 3: "\uAD6D\uB0B4 \uD30C\uC0DD", 4: "\uD574\uC678 \uC8FC\uC2DD", 5: "\uC6D0\uC790\uC7AC", 6: "\uCC44\uAD8C", 7: "\uAE30\uD0C0" };
    BRAND = {
      KODEX: "\uC0BC\uC131\uC790\uC0B0\uC6B4\uC6A9",
      TIGER: "\uBBF8\uB798\uC5D0\uC14B\uC790\uC0B0\uC6B4\uC6A9",
      SOL: "\uC2E0\uD55C\uC790\uC0B0\uC6B4\uC6A9",
      ACE: "\uD55C\uAD6D\uD22C\uC790\uC2E0\uD0C1\uC6B4\uC6A9",
      RISE: "KB\uC790\uC0B0\uC6B4\uC6A9",
      KBSTAR: "KB\uC790\uC0B0\uC6B4\uC6A9",
      PLUS: "\uD55C\uD654\uC790\uC0B0\uC6B4\uC6A9",
      ARIRANG: "\uD55C\uD654\uC790\uC0B0\uC6B4\uC6A9",
      HANARO: "NH\uC544\uBB38\uB514\uC790\uC0B0\uC6B4\uC6A9",
      KOSEF: "\uD0A4\uC6C0\uD22C\uC790\uC790\uC0B0\uC6B4\uC6A9",
      \uD788\uC5B4\uB85C\uC988: "\uD0A4\uC6C0\uD22C\uC790\uC790\uC0B0\uC6B4\uC6A9",
      TIMEFOLIO: "\uD0C0\uC784\uD3F4\uB9AC\uC624\uC790\uC0B0\uC6B4\uC6A9",
      WOORI: "\uC6B0\uB9AC\uC790\uC0B0\uC6B4\uC6A9",
      BNK: "BNK\uC790\uC0B0\uC6B4\uC6A9",
      \uB9C8\uC774\uB2E4\uC2A4: "\uB9C8\uC774\uB2E4\uC2A4\uC5D0\uC14B\uC790\uC0B0\uC6B4\uC6A9",
      \uD30C\uC6CC: "\uAD50\uBCF4\uC545\uC0AC\uC790\uC0B0\uC6B4\uC6A9"
    };
    companyOf = (name) => {
      const b = String(name || "").trim().split(/\s+/)[0].toUpperCase();
      for (const k of Object.keys(BRAND)) if (b === k.toUpperCase()) return BRAND[k];
      return null;
    };
    LIST_CACHE = { at: 0, list: null };
    NAME_KEYS = ["stockName", "itemName", "name", "stockNameKor", "hname", "issueName", "korSecnNm", "stkNm"];
    WEIGHT_KEYS = ["weight", "componentRatio", "ratio", "cuRatio", "compstRatio", "compRt", "weightRatio", "portion"];
    CODE_KEYS = ["itemCode", "stockCode", "code", "cd", "shortCode", "srtnCd"];
    ETF_BRAND_RE = /^(KODEX|TIGER|SOL|ACE|RISE|PLUS|KBSTAR|KOSEF|ARIRANG|HANARO|TIMEFOLIO|KIWOOM|WOORI|BNK|히어로즈|마이다스|파워)\b/i;
    SKIP_NUM_KEYS = /price|amt|amount|volume|qty|quantity|count|nav|value|sum|cap|date|time|no$|id$|rank|seq|shares|stock_?cnt/i;
    YA_CACHE = { at: 0, v: null };
    INDEX_PROXY = [
      // ⚠️ 순서 중요: 구체적인 패턴을 먼저 둔다.
      // 정규식 사이에 다른 단어가 끼어도 매칭되도록 .* 를 사용한다.
      //  (예: '필라델피아AI반도체' → /필라델피아.*반도체/ 로 매칭)
      [/S&P\s*500|SP500|에스앤피\s*500/i, "SPY", "S&P 500"],
      [/나스닥\s*100|NASDAQ\s*100/i, "QQQ", "\uB098\uC2A4\uB2E5 100"],
      [/다우존스\s*산업|다우\s*30/i, "DIA", "\uB2E4\uC6B0\uC874\uC2A4 \uC0B0\uC5C5\uD3C9\uADE0"],
      [/러셀\s*2000/i, "IWM", "\uB7EC\uC140 2000"],
      // 반도체 계열(미국·글로벌·필라델피아·AI반도체 등 모두 포함)
      [/필라델피아.*반도체|반도체.*필라델피아|SOX(?!X)/i, "SOXX", "\uD544\uB77C\uB378\uD53C\uC544 \uBC18\uB3C4\uCCB4"],
      [/(미국|글로벌|세계|해외).*반도체|반도체.*(TOP\s*\d|칩|밸류체인)/i, "SOXX", "\uBBF8\uAD6D\xB7\uAE00\uB85C\uBC8C \uBC18\uB3C4\uCCB4"],
      // AI·기술
      [/(글로벌|미국|해외).*(AI|인공지능)|AI.*(테크|반도체|밸류)|빅테크|매그니피센트|테크\s*TOP/i, "XLK", "\uBBF8\uAD6D \uAE30\uC220\xB7AI"],
      [/(미국|글로벌).*소프트웨어|클라우드/i, "IGV", "\uC18C\uD504\uD2B8\uC6E8\uC5B4\xB7\uD074\uB77C\uC6B0\uB4DC"],
      [/(미국|글로벌).*사이버\s*보안/i, "CIBR", "\uC0AC\uC774\uBC84\uBCF4\uC548"],
      // 우주·항공·방산
      [/우주|스페이스|항공우주|(글로벌|미국).*방산|방위산업/i, "ITA", "\uD56D\uACF5\uC6B0\uC8FC\xB7\uBC29\uC0B0"],
      // 로보틱스·클린에너지·리튬
      [/엔비디아|NVIDIA|메모리\s*반도체|HBM/i, "SOXX", "\uBC18\uB3C4\uCCB4(\uC5D4\uBE44\uB514\uC544 \uBC38\uB958\uCCB4\uC778)"],
      [/애플|APPLE.*밸류|테슬라|TESLA.*밸류/i, "XLK", "\uBBF8\uAD6D \uAE30\uC220 \uB300\uD615\uC8FC"],
      [/전력|SMR|원자력.*미국|유틸리티/i, "XLU", "\uBBF8\uAD6D \uC804\uB825\xB7\uC720\uD2F8\uB9AC\uD2F0"],
      [/로보틱스|로봇/i, "BOTZ", "\uAE00\uB85C\uBC8C \uB85C\uBCF4\uD2F1\uC2A4"],
      [/클린에너지|친환경|재생에너지|태양광/i, "ICLN", "\uD074\uB9B0\uC5D0\uB108\uC9C0"],
      [/리튬|(글로벌|해외).*2차전지|배터리.*(글로벌|해외)/i, "LIT", "\uAE00\uB85C\uBC8C \uB9AC\uD2AC\xB7\uBC30\uD130\uB9AC"],
      // 배당·팩터
      [/배당\s*다우존스|SCHD/i, "SCHD", "\uB2E4\uC6B0\uC874\uC2A4 \uBC30\uB2F9 100"],
      [/(미국|글로벌).*고배당/i, "VYM", "\uBBF8\uAD6D \uACE0\uBC30\uB2F9"],
      [/배당귀족/i, "NOBL", "S&P \uBC30\uB2F9\uADC0\uC871"],
      [/(미국|글로벌).*배당/i, "SCHD", "\uBBF8\uAD6D \uBC30\uB2F9\uC8FC"],
      [/(미국|글로벌).*(성장|그로스)/i, "VUG", "\uBBF8\uAD6D \uC131\uC7A5\uC8FC"],
      [/(미국|글로벌).*가치|밸류/i, "VTV", "\uBBF8\uAD6D \uAC00\uCE58\uC8FC"],
      // 섹터
      [/(미국|글로벌).*금융|은행.*(미국|글로벌)/i, "XLF", "\uBBF8\uAD6D \uAE08\uC735"],
      [/(미국|글로벌).*(헬스케어|바이오|제약)/i, "XLV", "\uBBF8\uAD6D \uD5EC\uC2A4\uCF00\uC5B4"],
      [/(미국|글로벌).*에너지/i, "XLE", "\uBBF8\uAD6D \uC5D0\uB108\uC9C0"],
      [/(미국|글로벌).*소비재|컨슈머/i, "XLY", "\uBBF8\uAD6D \uC18C\uBE44\uC7AC"],
      [/(미국|글로벌).*산업재/i, "XLI", "\uBBF8\uAD6D \uC0B0\uC5C5\uC7AC"],
      [/(미국|글로벌).*리츠|US\s*REIT|리츠.*(미국|글로벌)/i, "VNQ", "\uBBF8\uAD6D\xB7\uAE00\uB85C\uBC8C \uB9AC\uCE20"],
      // 국가·지역
      [/일본|니케이|TOPIX/i, "EWJ", "\uC77C\uBCF8 \uC8FC\uC2DD"],
      [/인도|NIFTY/i, "INDA", "\uC778\uB3C4 \uC8FC\uC2DD"],
      [/베트남/i, "VNM", "\uBCA0\uD2B8\uB0A8 \uC8FC\uC2DD"],
      [/차이나|중국|항셍|CSI|심천|상해/i, "MCHI", "\uC911\uAD6D \uC8FC\uC2DD"],
      [/대만|타이완/i, "EWT", "\uB300\uB9CC \uC8FC\uC2DD"],
      [/유로|유럽|EURO\s*STOXX|독일|DAX|명품|럭셔리/i, "FEZ", "\uC720\uB7FD \uC8FC\uC2DD"],
      [/이머징|신흥국/i, "EEM", "\uC2E0\uD765\uAD6D \uC8FC\uC2DD"],
      [/전세계|글로벌\s*주식|MSCI\s*World|선진국/i, "URTH", "\uC804\uC138\uACC4 \uC8FC\uC2DD"],
      // 채권·원자재(해외)
      [/미국.*30년.*국채|장기\s*국채/i, "TLT", "\uBBF8\uAD6D \uC7A5\uAE30 \uAD6D\uCC44"],
      [/미국.*10년.*국채/i, "IEF", "\uBBF8\uAD6D \uC911\uAE30 \uAD6D\uCC44"],
      [/미국.*단기.*국채|1-3년/i, "SHY", "\uBBF8\uAD6D \uB2E8\uAE30 \uAD6D\uCC44"],
      [/미국.*하이일드/i, "HYG", "\uBBF8\uAD6D \uD558\uC774\uC77C\uB4DC"],
      [/미국.*회사채|투자등급.*회사채/i, "LQD", "\uBBF8\uAD6D \uD68C\uC0AC\uCC44"],
      [/미국.*국채|미국채/i, "IEF", "\uBBF8\uAD6D \uAD6D\uCC44"],
      // 마지막 안전망: 국가/지역 키워드만 있어도 대표 지수로
      [/미국|나스닥|뉴욕/i, "SPY", "\uBBF8\uAD6D \uC8FC\uC2DD"],
      [/글로벌|해외|세계/i, "URTH", "\uAE00\uB85C\uBC8C \uC8FC\uC2DD"]
    ];
    DOM_PROXY = [
      [/코스닥\s*150/i, "229200", "\uCF54\uC2A4\uB2E5 150"],
      [/MSCI\s*Korea|한국\s*대표|KRX\s*300/i, "069500", "\uCF54\uC2A4\uD53C 200"],
      [/배당|고배당/i, "279530", "\uAD6D\uB0B4 \uBC30\uB2F9\uC8FC"],
      [/ESG|지배구조/i, "069500", "\uCF54\uC2A4\uD53C 200"],
      [/코스피\s*200|K200|200\s*선물|^KODEX\s*레버리지|^KODEX\s*인버스|인버스\s*2X|곱버스/i, "069500", "\uCF54\uC2A4\uD53C 200"],
      [/코스피\s*100/i, "069500", "\uCF54\uC2A4\uD53C 200"],
      [/반도체/i, "091160", "\uAD6D\uB0B4 \uBC18\uB3C4\uCCB4"],
      [/2차전지|배터리/i, "305720", "\uAD6D\uB0B4 2\uCC28\uC804\uC9C0"],
      [/삼성그룹/i, "102780", "\uC0BC\uC131\uADF8\uB8F9\uC8FC"],
      [/고배당|배당성장|배당주/i, "211900", "\uAD6D\uB0B4 \uBC30\uB2F9\uC8FC"]
    ];
    SECTOR_KO = {
      realestate: "\uBD80\uB3D9\uC0B0",
      consumer_cyclical: "\uACBD\uAE30\uC18C\uBE44\uC7AC",
      basic_materials: "\uC18C\uC7AC",
      consumer_defensive: "\uD544\uC218\uC18C\uBE44\uC7AC",
      technology: "\uC815\uBCF4\uAE30\uC220",
      communication_services: "\uCEE4\uBBA4\uB2C8\uCF00\uC774\uC158",
      financial_services: "\uAE08\uC735",
      utilities: "\uC720\uD2F8\uB9AC\uD2F0",
      industrials: "\uC0B0\uC5C5\uC7AC",
      energy: "\uC5D0\uB108\uC9C0",
      healthcare: "\uD5EC\uC2A4\uCF00\uC5B4"
    };
    DATE_LIKE = /^(\d{1,2}[\/.\-]\d{1,2}|\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}|\d{4}[.\-\/]\d{1,2}|\d{1,2}월\s*\d{1,2}일)$/;
    etf_default = async (req2) => {
      const url = new URL(req2.url);
      const code = String(url.searchParams.get("code") || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
      if (!code) return new Response(
        JSON.stringify({ ok: false, metrics: {}, info: {}, holdings: [], similar: [], diag: { err: "no code" } }),
        { headers: { "content-type": "application/json" } }
      );
      const SRC_MS = { list: 6e3, html: 5600, yahoo: 4500, detail: 1800 };
      const INNER_MS = { list: 5500, html: 4200, yahoo: 3e3, detail: 1600 };
      for (const k of Object.keys(SRC_MS)) {
        if (INNER_MS[k] >= SRC_MS[k]) console.warn(`[etf] budget inversion: ${k} inner ${INNER_MS[k]} >= outer ${SRC_MS[k]}`);
      }
      const budget = (pr, ms, fb) => Promise.race([
        Promise.resolve(pr).catch((e) => Object.assign({}, fb, { tried: ["err:" + String(e && e.message || e).slice(0, 60)] })),
        new Promise((res) => setTimeout(() => res(Object.assign({}, fb, { tried: ["timeout"] })), ms))
      ]);
      const T0 = Date.now();
      const leftMs = () => 8800 - (Date.now() - T0);
      const [L, H2] = await Promise.all([
        budget(fromList(code), 6200, { ok: false, n: 0, me: null, peers: [], peerPool: [] }),
        budget(fromNaverHtml(code, 5200), 5800, { holdings: [], info: {}, tried: ["timeout"] })
      ]);
      const D = { info: {}, holdings: [], tried: ["pending"] };
      const Y = { holdings: [], sectors: [], tried: [] };
      if (H2 && H2.info) {
        for (const k of Object.keys(H2.info)) if (H2.info[k] != null && H2.info[k] !== "") D.info[k] = H2.info[k];
      }
      let holdings = H2.holdings && H2.holdings.length ? H2.holdings : [];
      let holdSrc = holdings.length ? "naver-html" : "none";
      const extra = [];
      let proxyInfo = null, proxySectors = [];
      if (!holdings.length && leftMs() > 2200) {
        const P = await budget(fromPdfApi(code, Math.min(2500, leftMs() - 400)), Math.min(2900, leftMs() - 200), { holdings: [], tried: ["pdf:timeout"] });
        extra.push(...P.tried || []);
        if (P.holdings.length) {
          holdings = P.holdings;
          holdSrc = "pdfapi";
        }
      }
      if (!holdings.length && leftMs() > 3e3) {
        const R = await budget(fromDetail(code, Math.min(3600, leftMs() - 500)), Math.min(4e3, leftMs() - 300), { info: {}, holdings: [], tried: ["detail:timeout"] });
        D.tried = R.tried || [];
        extra.push(...(R.tried || []).slice(0, 2));
        for (const k of Object.keys(R.info || {})) if (R.info[k] != null && R.info[k] !== "" && (D.info[k] == null || D.info[k] === "")) D.info[k] = R.info[k];
        if (R.holdings && R.holdings.length) {
          holdings = R.holdings;
          holdSrc = "mstock";
        }
      }
      if (!holdings.length && leftMs() > 2500) {
        const R = await budget(fromYahoo(code), Math.min(3200, leftMs() - 300), { holdings: [], sectors: [], tried: ["yh:timeout"] });
        Y.holdings = R.holdings || [];
        Y.sectors = R.sectors || [];
        Y.tried = R.tried || [];
        if (Y.holdings.length) {
          holdings = Y.holdings;
          holdSrc = "yahoo";
        }
      }
      if (!holdings.length && leftMs() > 1500) {
        const nm0 = L.me ? L.me.name : "";
        const dp = domProxyFor(nm0);
        if (dp && dp.code !== code) {
          const R = await budget(fromNaverHtml(dp.code, Math.min(2600, leftMs() - 400)), Math.min(3e3, leftMs() - 200), { holdings: [], tried: [] });
          extra.push("dom:" + dp.code + ":" + (R.holdings || []).length);
          if (R.holdings && R.holdings.length) {
            holdings = R.holdings;
            holdSrc = "dom-proxy";
            proxyInfo = { label: dp.label, symbol: dp.code };
          }
        }
        if (!holdings.length && leftMs() > 2600) {
          const pk = peerByTheme(nm0, L.peerPool && L.peerPool.length ? L.peerPool : L.peers);
          if (pk && pk.code !== code) {
            const R2 = await budget(fromNaverHtml(pk.code, Math.min(2600, leftMs() - 400)), Math.min(3e3, leftMs() - 200), { holdings: [], tried: [] });
            extra.push("peer:" + pk.code + ":" + (R2.holdings || []).length);
            if (R2.holdings && R2.holdings.length) {
              holdings = R2.holdings;
              holdSrc = "peer-proxy";
              proxyInfo = { label: (pk.themeKey || "") + " \uD14C\uB9C8 \xB7 " + pk.name, symbol: pk.code };
            }
          } else extra.push("peer:none");
        }
        if (!holdings.length && leftMs() > 1200) {
          const P = await budget(
            fromIndexProxy(nm0, D.info.indexName, await budget(yahooAuth2(), 1500, {})),
            Math.min(2600, leftMs() - 200),
            { holdings: [], sectors: [], tried: ["idx:timeout"], label: null }
          );
          extra.push("idx:" + (P.tried || []).join(","));
          if (P.holdings && P.holdings.length) {
            holdings = P.holdings;
            holdSrc = "index-proxy";
            proxyInfo = { label: P.label, symbol: P.proxy };
            proxySectors = P.sectors || [];
          }
        }
      }
      const assetKind = holdings.length ? null : assetKindOf(L.me ? L.me.name : "");
      const me = L.me;
      const navLive = D.info.navDetail != null;
      const nav = navLive ? D.info.navDetail : me && me.nav != null ? me.nav : null;
      const price = me ? me.price : null;
      let disparity = null, navStale = false, dispSrc = "none";
      if (D.info.deviationRate != null) {
        disparity = D.info.deviationRate;
        dispSrc = "naver";
      } else if (price != null && nav) {
        const d = (price - nav) / nav * 100;
        if (Math.abs(d) <= 5) {
          disparity = d;
          dispSrc = "calc";
        } else {
          navStale = true;
        }
      }
      const name = me ? me.name : "";
      const metrics = {
        price,
        nav,
        disparity,
        marketSum: me ? me.marketSum : null,
        m3: me ? me.m3 : null,
        volume: me ? me.volume : null,
        value: me ? me.value : null,
        changeRate: me ? me.changeRate : null,
        fee: D.info.fee != null ? D.info.fee : null,
        leverage: leverageOf(name),
        trackingError: D.info.trackingError != null ? D.info.trackingError : null,
        navLive
      };
      const info = {
        summary: D.info.summary || null,
        totalInfos: D.info.totalInfos || [],
        indexName: D.info.indexName || null,
        company: D.info.company || companyOf(name),
        category: D.info.category || (me ? me.tab : null),
        listedDate: D.info.listedDate || null
      };
      const similar = (L.peers || []).map((p) => ({ code: p.code, name: p.name, changeRate: p.changeRate, m3: p.m3, marketSum: p.marketSum }));
      return new Response(JSON.stringify({
        ok: !!(me || holdings.length),
        code,
        name,
        metrics,
        info,
        holdings,
        holdingsTotalWeight: Number(holdings.reduce((a, b) => a + (b.weight || 0), 0).toFixed(2)),
        // 실제 보유 종목 수: 출처에서 확인된 값이 있으면 그것을, 없고 비중 합이 100%면 목록 길이를 사용.
        // 확인 불가하면 null(추측 금지 — 화면에서는 'N+' 로 표기)
        holdingsCount: D.info.holdingsCount != null ? D.info.holdingsCount : holdings.length && holdings.reduce((a, b) => a + (b.weight || 0), 0) >= 99.5 ? holdings.length : null,
        // 비중 합이 99.5% 미만이면 상위 종목만 받은 것이므로 '전체'라고 표시하면 안 된다.
        holdingsComplete: holdings.length > 0 && holdings.reduce((a, b) => a + (b.weight || 0), 0) >= 99.5,
        holdingsProxy: proxyInfo,
        holdingsKind: assetKind,
        sectors: Y.sectors && Y.sectors.length ? Y.sectors : proxySectors,
        similar,
        diag: {
          list: L.ok ? "ok(" + L.n + ")" : "miss",
          hold: holdings.length,
          src: holdSrc,
          navStale: navStale ? "y" : "n",
          disp: dispSrc,
          html: (H2.tried || []).join(","),
          extra: extra.join(" | ").slice(0, 200)
        }
      }), { headers: { "content-type": "application/json", "cache-control": "s-maxage=600" } });
    };
    config2 = { path: "/api/etf" };
  }
});

// functions/api/[[route]].js
init_store();

// netlify/functions/accounts.js
init_store();
var ENV = null;
function json(o) {
  return new Response(JSON.stringify(o), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
var webcrypto = globalThis.crypto;
var toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha256(str) {
  const d = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(String(str)));
  return toHex(d);
}
var newSalt = () => toHex(webcrypto.getRandomValues(new Uint8Array(16)));
var derive = (salt, pass) => sha256(salt + "|" + pass);
async function verify(acc, pass, legacy) {
  if (!acc) return { ok: false };
  if (acc.salt && acc.hash) {
    if (pass && await derive(acc.salt, pass) === acc.hash) return { ok: true };
    if (legacy && await derive(acc.salt, legacy) === acc.hash) return { ok: true, rehash: pass };
    return { ok: false };
  }
  if (acc.pass && (acc.pass === pass || acc.pass === legacy)) return { ok: true, upgraded: true };
  return { ok: false };
}
/* ══ [v4.50] 서버 측 자격증명 형식 검증 ═══════════════════════════════════════
   [먼저 솔직히] 이 앱은 브라우저에서 SHA-256 으로 해시한 값만 서버로 보낸다.
   평문이 기기 밖으로 안 나가는 건 좋은 성질이지만, 그 대가로 서버는 원래
   비밀번호가 8자였는지 특수문자가 있었는지 '원리적으로' 알 수 없다.
   → 복잡도 규칙의 집행 지점은 클라이언트일 수밖에 없다(pwCheck).
   [그래도 서버가 막을 수 있는 것] 화면을 건너뛰고 /api 를 직접 두드려
   pass:"1" 같은 값으로 계정을 심는 우회다. 정상 클라이언트는 언제나
   's'+64자리 16진수(또는 구버전 숫자 해시)만 보내므로, 그 형태가 아니면 거절한다.
   이것만으로 '규칙을 우회한 계정 생성' 경로가 닫힌다. */
function credOk(v) {
  const s = String(v == null ? "" : v);
  if (/^s[0-9a-f]{64}$/i.test(s)) return true;      // 현행 SHA-256
  if (/^-?\d{4,}$/.test(s)) return true;            // 구버전 legacyHash 폴백
  return false;
}
async function setPassword(acc, pass) {
  acc.salt = newSalt();
  acc.hash = await derive(acc.salt, pass);
  delete acc.pass;
  return acc;
}
var TRY_WINDOW = 15 * 60 * 1e3;
var TRY_MAX = 10;
/* ══ [v9.75] 로그인 시도 기록을 계정과 함께 둔다 ═══════════════════════════
   예전에는 db.tries 에 모아 두고 공유 키를 쓸 때 함께 저장했다. 그런데 공유 키
   쓰기를 없앴으므로, 그대로 두면 실패 기록이 요청이 끝나는 순간 사라져
   무차별 대입을 막지 못한다. 시도 기록은 그 계정의 것이므로 계정 객체에 담는다.
   계정은 acc:<id> 에 따로 저장되니 다른 사람과 부딪히지도 않는다. */
function triesOf(db, id, acc) {
  const a = acc || (db.accounts && db.accounts[id]) || null;
  if (a && Array.isArray(a._tries)) return a._tries;
  if (!db.tries) db.tries = {};
  return db.tries[id] || [];
}
function tooManyTries(db, id, acc) {
  const now = Date.now();
  const list = triesOf(db, id, acc).filter((t) => now - t < TRY_WINDOW);
  const a = acc || (db.accounts && db.accounts[id]);
  if (a) a._tries = list; else { if (!db.tries) db.tries = {}; db.tries[id] = list; }
  return list.length >= TRY_MAX;
}
function noteFail(db, id, acc) {
  const a = acc || (db.accounts && db.accounts[id]);
  const now = Date.now();
  if (a) { a._tries = (Array.isArray(a._tries) ? a._tries : []).concat(now); return; }
  if (!db.tries) db.tries = {};
  (db.tries[id] = db.tries[id] || []).push(now);
}
function clearTries(db, id, acc) {
  const a = acc || (db.accounts && db.accounts[id]);
  if (a) delete a._tries;
  if (db.tries) delete db.tries[id];
}
async function openStore() {
  const mod = await Promise.resolve().then(() => (init_blobs_shim(), blobs_shim_exports));
  return await getStoreX({ name: "live-accounts" }, ENV);
}
var accounts_default = async (req2) => {
  if (req2.method !== "POST") return json({ ok: false, err: "method" });
  let body;
  try {
    body = await req2.json();
  } catch {
    return json({ ok: false, err: "badbody" });
  }
  let store;
  try {
    store = await openStore();
  } catch {
    return json({ ok: false, err: "nostore" });
  }
  /* ══ [v4.24 · 치명] DB 읽기에 실패했는데 그대로 덮어쓰면 전 계정이 사라진다 ══
     KV 가 순간적으로 응답하지 않으면 db 가 빈 객체가 되고, 그 상태에서
     로그인 실패 한 번만 나도 noteFail → setJSON 으로 '빈 DB'가 저장돼
     모든 사용자의 계정이 통째로 지워진다. 로드 성공 여부를 기억해 두고,
     실패했으면 어떤 쓰기도 하지 않는다(읽기 전용으로만 응답). */
  /* ══ [v7.6] 구글로 갓 가입한 계정이 여기서는 안 보이던 문제 ═══════════════
     [무엇이 일어났나] 구글 가입은 계정을 KV 에 저장한다. 그런데 KV 는 쓴 값이
     퍼지는 데 시간이 걸려, 곧바로 계정 삭제·비밀번호 변경을 하면
     '그런 계정 없음(noacct)' 이 났다(첨부 사진).
     클랜·친구는 readAccDb() 로 고쳤는데, 이 계정 라우트만 KV 를 직접 읽고 있었다.
     [고침] 여기서도 방금 쓴 것을 함께 본다. 저장한 뒤에는 기억도 갱신한다. */
  let db, dbLoaded = false;
  try {
    const raw = await store.get("db", { type: "json" });
    if (raw && typeof raw === "object") { db = raw; dbLoaded = true; }
    else { db = { accounts: {}, users: {} }; dbLoaded = raw === null; }
  } catch {
    db = { accounts: {}, users: {} }; dbLoaded = false;
  }
  {
    const c = dbCacheGet();
    if (c && c.accounts) {
      db.accounts = db.accounts || {}; db.users = db.users || {};
      for (const k of Object.keys(c.accounts))
        if (!db.accounts[k]) { db.accounts[k] = c.accounts[k]; dbLoaded = true; }
      for (const k of Object.keys(c.users || {}))
        if (!db.users[k]) db.users[k] = c.users[k];
    }
  }
  /* ══ [v9.73] KV 쓰기 한도(무료 1,000회/일)를 지키기 위한 두 겹 방어 ═════════
     [무엇이 문제였나] 모든 사용자 데이터가 "db" 키 하나에 들어 있고, 저장이
     필요할 때마다 통째로 다시 쓴다. 그래서
       ① 한 사람이 관심종목 하나만 바꿔도 전원의 데이터를 다시 쓴다(쓰기 증폭).
       ② 로그인 실패·프로필 조회 같은 읽기성 동작까지 saveDb 를 부른다.
       ③ 거래를 자주 하면 800ms 마다 한 번씩 쓰기가 나가, 활동적인 사용자
          몇 명만으로도 하루 1,000회에 닿는다. 한도를 넘으면 쓰기가 조용히
          실패해 '저장은 됐다는데 새로고침하면 사라지는' 증상이 된다.
     [고침] ㉠ 내용이 실제로 바뀌었을 때만 쓴다(직전 저장본과 지문 비교).
            ㉡ 최소 간격을 둬 연속 쓰기를 묶는다. 값은 메모리 캐시에 이미
               반영되므로 같은 워커 인스턴스에서는 즉시 읽힌다.
     ※ 근본 해결은 사용자별 키로 쪼개는 것이다(아래 주석 참조). */
  const saveDb = async (force) => {
    if (!dbLoaded) return false;                 // 로드 실패 상태에서는 쓰지 않는다
    if (!db.accounts || typeof db.accounts !== "object") return false;
    /* ══ [v9.74] db 에는 계정 정보만 남긴다 ═══════════════════════════════════
       사용자 데이터는 usr:<id> 로 옮겼으므로, db 를 쓸 때 users 를 함께 실어
       보내면 옛 자리에 낡은 사본이 계속 되살아난다(그리고 값도 커진다).
       원본은 지우지 않되, 새로 쓰는 db 에는 담지 않는다. 이미 옮겨진 사람은
       usrLoad 가 usr:<id> 를 먼저 보므로 되돌아갈 일이 없다. */
    try {
      const moved = Object.keys(db.users || {}).filter((k) => _usrCache[k]);
      for (const k2 of moved) delete db.users[k2];
    } catch (e) {}
    try {
      const sig = JSON.stringify(db).length + ":" + Object.keys(db.users || {}).length
        + ":" + Object.keys(db.accounts || {}).length;
      const now = Date.now();
      if (!force && globalThis.__dbSig === sig) return true;          // 내용 그대로면 쓰지 않는다
      if (!force && globalThis.__dbAt && now - globalThis.__dbAt < 3000) {
        globalThis.__dbPending = sig;                                  // 3초 안의 연속 쓰기는 묶는다
        return true;
      }
      globalThis.__dbSig = sig; globalThis.__dbAt = now;
    } catch (e) {}
    /* [v4.25 · 치명] 여기서 saveDb() 를 다시 불러 무한 재귀가 났다.
       비밀번호가 맞아 로그인이 성공하는 순간 clearTries → saveDb() 에서
       스택이 터지고 워커가 500 을 반환 → 클라이언트는 "서버 연결 실패"로 보였다.
       즉 '올바른 비밀번호일수록 반드시 실패하는' 구조였다. 실제 저장을 호출한다. */
    /* ══ [v9.75] 공유 키 "db" 에는 더 이상 쓰지 않는다 ═══════════════════════
       계정은 acc:<id>, 사용자 데이터는 usr:<id> 로 각자 옮겨졌다. 여기서 통째로
       다시 쓰면 그 순간 다른 사람의 최신 변경을 낡은 사본으로 덮게 된다.
       예전 데이터를 읽기 위한 원본으로만 남겨 두고, 쓰기는 하지 않는다.
       (로그인 시도 횟수 같은 임시 값은 요청 안에서만 쓰이므로 유실돼도 무해하다) */
    try { dbCacheSet(db); } catch (e) {}
    return true;
  };
  if (!db.accounts) db.accounts = {};
  if (!db.users) db.users = {};
  /* [v4.18 · 치명] 아이디를 그대로 키로 썼다. 기기마다 대소문자·공백이 조금만 달라도
     ("Jinny" vs "jinny ") 서버에는 다른 계정으로 저장돼, 같은 아이디인데 다른 기기에서
     로그인이 안 되는 것처럼 보였다. 이제 소문자·공백제거로 정규화한 키를 쓰되,
     예전에 만들어진 계정도 찾아 자동으로 옮겨 준다(무손실 이전). */
  const { action, pass, legacy } = body;
  const rawId = String(body.id == null ? "" : body.id);
  let id = rawId.trim().toLowerCase();
  /* ══ [v9.75] 이 요청이 다룰 계정을 계정별 키에서 먼저 불러온다 ═════════════
     아래 로직은 예전처럼 db.accounts[id] 로 읽고 쓰되, 저장만 saveAcc 로
     바꿔 acc:<id> 하나만 건드린다. 남의 계정을 덮을 방법이 없어진다. */
  if (id) {
    try { const a0 = await accLoad(store, id, db); if (a0) db.accounts[id] = a0; } catch (e) {}
  }
  const saveAcc = async (uid) => {
    const k3 = uid || id;
    if (!k3) return false;
    return await accSave(store, k3, db.accounts[k3]);
  };
  if (id && !db.accounts[id]) {
    const hit = Object.keys(db.accounts).find((k) => k.trim().toLowerCase() === id);
    if (hit && hit !== id) {                       // 옛 키 → 정규화 키로 이전
      db.accounts[id] = db.accounts[hit]; delete db.accounts[hit];
      try { await accSave(store, id, db.accounts[id]); await accDelete(store, hit, null); } catch (e) {}
      if (db.users[hit]) { db.users[id] = db.users[hit]; delete db.users[hit]; }
      try { await saveDb(); } catch (e) { }
      /* [v9.74] 옛 키에 있던 사용자 데이터도 새 키로 옮긴다 */
      try {
        const prev = await usrLoad(store, hit, db);
        if (prev != null) { await usrSave(store, id, prev); await usrDelete(store, hit); }
      } catch (e) {}
    }
  }
  const acc = id ? db.accounts[id] : null;
  /* ══ [v9.74] 이 요청이 다룰 사용자의 데이터만 계정별 키에서 불러온다 ═══════
     모든 db.users 접근이 단일 id 를 대상으로 하므로, 여기서 한 번 채워 두면
     아래 로직은 예전과 똑같이 db.users[id] 로 읽고 쓸 수 있다.
     저장만 saveUser(id) 로 바꿔 usr:<id> 하나만 건드리게 한다. */
  if (id) {
    try { const u = await usrLoad(store, id, db); if (u != null) db.users[id] = u; } catch (e) {}
  }
  const saveUser = async (uid) => {
    const k2 = uid || id;
    if (!k2) return false;
    return await usrSave(store, k2, db.users[k2] || {});
  };
  if (["login", "sync", "profile"].includes(action) && id && tooManyTries(db, id))   // [v4.24] ensure(복구)는 잠금 대상에서 제외
    return json({ ok: false, err: "toomany", retryAfterMin: 15 });
  try {
    if (action === "signup") {
      if (!id || !pass) return json({ ok: false, err: "param" });
      if (!credOk(pass)) return json({ ok: false, err: "weak" });     // [v4.50] 화면 우회 차단
      if (body.acctPass && !credOk(body.acctPass)) return json({ ok: false, err: "weak" });
      if (db.accounts[id]) return json({ ok: false, err: "exists" });
      /* [v9.75] 같은 순간 같은 아이디로 가입이 겹치면 먼저 만든 쪽을 남긴다 */
      { const dup = await accLoad(store, id, null);
        if (dup) return json({ ok: false, err: "exists" }); }
      db.accounts[id] = await setPassword({ name: body.name || id, email: body.email || "", acctPass: body.acctPass || "", created: Date.now() }, pass);
      await saveAcc(id);
      db.users[id] = { watchlist: ["005930", "000660", "035420"], holdings: [], cash: Number(body.cash) || 0, ipoPlans: [], acctPass: body.acctPass || "" };
      await usrSave(store, id, db.users[id]);        /* [v9.74] 사용자 데이터는 제 키에 */
      await saveDb();
      return json({ ok: true });
    }
    /* [v6.8] 비밀번호 변경 — 계정 설정에서 쓴다 */
    if (action === "changepw") {
      if (!id || !pass || !body.newPass) return json({ ok: false, err: "param" });
      const acc = db.accounts[id];
      if (!acc) return json({ ok: false, err: "nouser" });
      const v = await verify(acc, pass, legacy);
      if (!v.ok) { noteFail(db, id); await saveAcc(id); return json({ ok: false, err: "wrongpass" }); }   /* [v9.75] 계정 키에 기록 */
      if (!credOk(body.newPass)) return json({ ok: false, err: "weak" });
      db.accounts[id] = await setPassword(acc, body.newPass);
      await saveAcc(id);                              /* [v9.75] */
      await saveDb();
      return json({ ok: true });
    }
    if (action === "ensure") {
      if (!id || !pass) return json({ ok: false, err: "param" });
      if (!credOk(pass)) return json({ ok: false, err: "weak" });     // [v4.50] 복구 경로도 같은 형식만
      if (!db.accounts[id]) {
        db.accounts[id] = await setPassword({ name: body.name || id, email: body.email || "", acctPass: body.acctPass || "", created: body.created || Date.now() }, pass);
        await saveAcc(id);                            /* [v9.75] */
        db.users[id] = body.user || { watchlist: [], holdings: [], cash: 0, ipoPlans: [] };
        await usrSave(store, id, db.users[id]);      /* [v9.74] */
        await saveDb();
        return json({ ok: true, created: true });
      }
      {
        const v = await verify(db.accounts[id], pass, legacy);
        if (!v.ok) {
          noteFail(db, id);
          await saveAcc(id);                          /* [v9.75] */
          return json({ ok: false, err: "exists-diff" });
        }
        if (v.upgraded || v.rehash) {
          await setPassword(db.accounts[id], pass);
          await saveAcc(id);                          /* [v9.75] */
          await saveDb();
        }
        clearTries(db, id); await saveAcc(id);          /* [v9.75] */
        return json({ ok: true, created: false });
      }
    }
    if (action === "status") return json({ ok: true, cloud: true });
    if (action === "login") {
      /* [v4.24] '계정 자체가 없음'과 '비밀번호 틀림'을 구분해 돌려준다.
         앞의 경우는 복구(ensure)로 되살릴 수 있으므로 화면에서 다르게 안내한다.
         계정이 없을 땐 실패 횟수도 세지 않는다(잠금으로 복구를 막지 않기 위해). */
      if (!acc) return json({ ok: false, err: "nouser", dbLoaded });
      const v = await verify(acc, pass, legacy);
      if (!v.ok) {
        noteFail(db, id);
        await saveAcc(id);       /* [v9.75] 잠금 카운트는 계정 키에 남는다 */
        return json({ ok: false, err: "invalid" });
      }
      if (v.upgraded || v.rehash) {
        await setPassword(acc, pass);
      }
      clearTries(db, id); await saveAcc(id);          /* [v9.75] */
      await saveDb();
      /* [v11.0] 등급을 함께 보낸다 — 화면은 이 값만 믿는다(위조 불가) */
      return json({ ok: true, name: acc.name, email: acc.email, created: acc.created,
        user: db.users[id] || {}, ...tierPayload(acc) });
    }
    if (action === "sync") {
      const v = await verify(acc, pass, legacy);
      if (!v.ok) {
        noteFail(db, id);
        await saveAcc(id);       /* [v9.75] 잠금 카운트는 계정 키에 남는다 */
        return json({ ok: false, err: "invalid" });
      }
      if (v.upgraded || v.rehash) { await setPassword(acc, pass); await saveAcc(id); }   /* [v9.75] */
      clearTries(db, id); await saveAcc(id);          /* [v9.75] */
      db.users[id] = body.user || db.users[id] || {};
      /* ══ [v9.74] 여기가 핵심이다 ═══════════════════════════════════════════
         동기화는 앱에서 가장 자주 일어나는 쓰기다. 예전에는 이 한 줄이 전체 db 를
         다시 썼기 때문에, 비슷한 시각에 저장한 다른 사람의 변경이 통째로 날아갔다.
         이제 자기 키만 쓴다 — 서로 덮어쓸 수 없다. */
      const okU = await usrSave(store, id, db.users[id]);
      /* [v11.0] 동기화 응답에도 등급을 실어, 만료·발급이 화면에 곧 반영되게 한다 */
      return json({ ok: true, stored: okU ? "usr" : "fail", ...tierPayload(acc) });
    }
    if (action === "delete") {
      if (!acc) return json({ ok: false, err: "noacct" });
      const v = await verify(acc, pass, legacy);
      if (!v.ok) {
        noteFail(db, id);
        await saveAcc(id);                            /* [v9.75] */
        return json({ ok: false, err: "wrongpass" });
      }
      await accDelete(store, id, db.accounts[id]);   /* [v9.75] 계정 키·되찾기 키까지 */
      delete db.accounts[id];
      delete db.users[id];
      await usrDelete(store, id);                    /* [v9.74] 계정별 키도 함께 지운다 */
      if (db.tries) delete db.tries[id];
      await saveDb();
      return json({ ok: true, deleted: id });
    }
    if (action === "profile") {
      const v = await verify(acc, pass, legacy);
      if (!v.ok) {
        noteFail(db, id);
        await saveAcc(id);       /* [v9.75] 잠금 카운트는 계정 키에 남는다 */
        return json({ ok: false, err: "invalid" });
      }
      if (v.upgraded || v.rehash) { await setPassword(acc, pass); await saveAcc(id); }   /* [v9.75] */
      clearTries(db, id); await saveAcc(id);          /* [v9.75] */
      if (body.name != null) acc.name = body.name;
      if (body.email != null) acc.email = body.email;
      if (body.newPass) {
        if (!credOk(body.newPass)) return json({ ok: false, err: "weak" });   // [v4.50]
        await setPassword(acc, body.newPass);
      }
      if (body.acctPass) {
        if (!credOk(body.acctPass)) return json({ ok: false, err: "weak" });  // [v4.50]
        acc.acctPass = body.acctPass;
        if (db.users[id]) { db.users[id].acctPass = body.acctPass; await usrSave(store, id, db.users[id]); }   /* [v9.74] */
      }
      await saveDb();
      return json({ ok: true });
    }
  } catch (e) {
    return json({ ok: false, err: "store", detail: String(e) });
  }
  return json({ ok: false, err: "action" });
};

// netlify/functions/calendar.js
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
var US = {
  "AAPL": "\uC560\uD50C",
  "MSFT": "\uB9C8\uC774\uD06C\uB85C\uC18C\uD504\uD2B8",
  "GOOGL": "\uC54C\uD30C\uBCB3(\uAD6C\uAE00)",
  "AMZN": "\uC544\uB9C8\uC874",
  "META": "\uBA54\uD0C0",
  "TSLA": "\uD14C\uC2AC\uB77C",
  "NVDA": "\uC5D4\uBE44\uB514\uC544",
  "NFLX": "\uB137\uD50C\uB9AD\uC2A4",
  "INTC": "\uC778\uD154",
  "AMD": "AMD",
  "IBM": "IBM",
  "TSM": "TSMC",
  "ASML": "ASML",
  "MU": "\uB9C8\uC774\uD06C\uB860",
  "QCOM": "\uD004\uCEF4",
  "AVGO": "\uBE0C\uB85C\uB4DC\uCEF4",
  "ORCL": "\uC624\uB77C\uD074",
  "CRM": "\uC138\uC77C\uC988\uD3EC\uC2A4",
  "ADBE": "\uC5B4\uB3C4\uBE44",
  "CSCO": "\uC2DC\uC2A4\uCF54",
  "JPM": "JP\uBAA8\uAC74",
  "GS": "\uACE8\uB4DC\uB9CC\uC0AD\uC2A4",
  "BAC": "\uBC45\uD06C\uC624\uBE0C\uC544\uBA54\uB9AC\uCE74",
  "V": "\uBE44\uC790",
  "MA": "\uB9C8\uC2A4\uD130\uCE74\uB4DC",
  "KO": "\uCF54\uCE74\uCF5C\uB77C",
  "PEP": "\uD3A9\uC2DC\uCF54",
  "DIS": "\uB514\uC988\uB2C8",
  "PYPL": "\uD398\uC774\uD314",
  "UBER": "\uC6B0\uBC84",
  "PLTR": "\uD314\uB780\uD2F0\uC5B4",
  "COIN": "\uCF54\uC778\uBCA0\uC774\uC2A4",
  "MRVL": "\uB9C8\uBCA8",
  "ARM": "ARM",
  "JNJ": "\uC874\uC2A8\uC564\uB4DC\uC874\uC2A8",
  "UNH": "\uC720\uB098\uC774\uD2F0\uB4DC\uD5EC\uC2A4",
  "ISRG": "\uC778\uD29C\uC774\uD2F0\uBE0C\uC11C\uC9C0\uCEEC"
};
var US_TICKERS = Object.keys(US);
async function fetchText(url, ms, headers) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers, signal: c.signal });
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}
async function jget(url, ms, headers) {
  try {
    const txt = await fetchText(url, ms, { "User-Agent": UA, Accept: "application/json", Referer: "https://m.stock.naver.com/", ...headers || {} });
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
var _yA = { at: 0, cookie: "", crumb: "" };
async function yahooAuth() {
  if (_yA.crumb && Date.now() - _yA.at < 6 * 36e5) return _yA;
  let cookie = "";
  for (const u of ["https://fc.yahoo.com/", "https://finance.yahoo.com/"]) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 3e3);
      const r = await fetch(u, { headers: { "User-Agent": UA, "Accept": "text/html,*/*" }, signal: c.signal });
      clearTimeout(t);
      const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""];
      const ck = sc.map((s) => String(s).split(";")[0]).filter(Boolean).join("; ");
      if (ck) {
        cookie = ck;
        break;
      }
    } catch {
    }
  }
  let crumb = "";
  for (const u of ["https://query2.finance.yahoo.com/v1/test/getcrumb", "https://query1.finance.yahoo.com/v1/test/getcrumb"]) {
    try {
      const tx = (await fetchText(u, 3e3, { "User-Agent": UA, Cookie: cookie, Accept: "text/plain" })).trim();
      if (tx && tx.length < 30 && !/[<{]/.test(tx)) {
        crumb = tx;
        break;
      }
    } catch {
    }
  }
  _yA = { at: Date.now(), cookie, crumb };
  return _yA;
}
async function tvKrEarnings() {
  const body = JSON.stringify({
    markets: ["korea"],
    options: { lang: "ko" },
    columns: [
      "name",
      "description",
      "earnings_release_next_date",
      "earnings_release_date",
      "market_cap_basic",
      "earnings_per_share_forecast_next_fq",
      "revenue_forecast_next_fq",
      /* [v4.90] 그 날짜가 '회사가 공시한 확정일'인지 '제공사가 추정한 날'인지 알려 주는 값.
         이걸 안 보고 전부 확정으로 표시하고 있었다. */
      "earnings_publication_type_next_fq",
      "earnings_release_next_calendar_date"
    ],
    sort: { sortBy: "market_cap_basic", sortOrder: "desc" },
    range: [0, 450]
  });
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 7e3);
  try {
    const r = await fetch("https://scanner.tradingview.com/korea/scan", {
      method: "POST",
      body,
      signal: c.signal,
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://kr.tradingview.com",
        Referer: "https://kr.tradingview.com/"
      }
    });
    if (!r.ok) return { items: [], why: "HTTP " + r.status };
    const j = await r.json();
    const raw = [];
    const nowS = Date.now() / 1e3;
    for (const row of j && j.data || []) {
      const code = String(row.s || "").split(":")[1] || "";
      if (!/^[0-9][0-9A-Z]{5}$/.test(code)) continue;
      const d = row.d || [];
      const nm = String(d[1] || d[0] || code).trim();
      const next = Number(d[2]) || 0, last = Number(d[3]) || 0;
      const epsF = d[5] != null && isFinite(Number(d[5])) ? Number(d[5]) : null;
      const revF = d[6] != null && isFinite(Number(d[6])) ? Number(d[6]) : null;
      const pub = d[7];                       // 발표일 종류(확정/추정)
      /* ══ [v4.90] 확정과 추정을 가른다 ═══════════════════════════════════════
         제공사는 회사가 공시한 날짜가 없으면 과거 패턴으로 날짜를 만들어 낸다.
         패턴조차 없으면 '분기 종료 한 달 뒤 수요일'로 임의 지정한다.
         그런 날짜를 '확정'이라 적으면 사용자가 그날 발표가 있다고 믿게 된다.
         → 확실하다는 표시가 있을 때만 확정으로 본다. 모르면 추정이다. */
      const sure = (function(){
        const v = String(pub == null ? "" : pub).toLowerCase();
        if (!v) return false;                                  // 값이 없으면 알 수 없음 → 추정
        if (/confirm|exact|actual|official/.test(v)) return true;
        if (v === "1" || v === "2") return true;               // 제공사 코드값(확정 계열)
        return false;
      })();
      if (next && next > nowS - 86400) raw.push({ code, name: nm, ts: next, past: false, epsF, revF, sure });
      else if (last && nowS - last < 7 * 86400) raw.push({ code, name: nm, ts: last, past: true, epsF, revF, sure: true });
    }
    const PREF = /([0-9]*우선주(\(신형\))?|[0-9]우(B|C)?|우(B|C))$/;
    const cleaned = raw.map((x) => {
      const nm0 = x.name.replace(/보통주$/, "").trim();
      const isPref = PREF.test(nm0) && nm0.replace(PREF, "").trim().length >= 2;
      const base3 = isPref ? nm0.replace(PREF, "").trim() : nm0;
      return { ...x, name: isPref ? base3 + " \uC6B0\uC120\uC8FC" : base3, base: base3, isPref };
    });
    const commons = new Set(cleaned.filter((x) => !x.isPref).map((x) => x.base));
    const items = cleaned.filter((x) => {
      if (/스팩/.test(x.name)) return false;
      if (x.isPref && commons.has(x.base)) return false;
      return true;
    });
    return { items, why: "ok " + items.length };
  } catch (e) {
    return { items: [], why: String(e).slice(0, 60) };
  } finally {
    clearTimeout(t);
  }
}
var pad = (n) => String(n).padStart(2, "0");
var isoKST = (ms) => {
  const d = new Date(ms + 9 * 36e5);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
async function quoteBatch(symsArr, cookie, crumb) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symsArr.map(encodeURIComponent).join(",")}${crumb ? "&crumb=" + encodeURIComponent(crumb) : ""}`;
  const txt = await fetchText(url, 6e3, { "User-Agent": UA, "Cookie": cookie, "Accept": "application/json" });
  let j;
  try {
    j = JSON.parse(txt);
  } catch {
    return [];
  }
  return j && j.quoteResponse && j.quoteResponse.result || [];
}
var numish = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return isFinite(n) ? n : null;
};
async function naverQuarterly(code) {
  for (const kind of ["quarter", "annual"]) {
    const d = await jget(`https://m.stock.naver.com/api/stock/${code}/finance/${kind}`, 5e3);
    const fi = d && (d.financeInfo || d);
    const titles = fi && (fi.trTitleList || fi.titleList);
    const rowList = fi && (fi.rowList || fi.rows);
    if (!Array.isArray(titles) || !Array.isArray(rowList)) continue;
    const periods = titles.map((t) => ({ key: t.key || t.title, title: String(t.title || t.key || "").replace(/\.$/, ""), est: t.isConsensus === "Y" }));
    const rowOf = (test) => {
      const r = rowList.find((x) => test(String(x.title || "").replace(/\s/g, "")));
      if (!r) return null;
      const cols = r.columns || {};
      const out = {};
      for (const k of Object.keys(cols)) {
        const cell = cols[k];
        out[k] = numish(cell && (cell.value != null ? cell.value : cell));
      }
      return out;
    };
    const rev = rowOf((t) => t === "\uB9E4\uCD9C\uC561"), op = rowOf((t) => t === "\uC601\uC5C5\uC774\uC775"), ni = rowOf((t) => t.startsWith("\uB2F9\uAE30\uC21C\uC774\uC775"));
    if (!rev && !op) continue;
    const qLabel = (title) => {
      const m = String(title).match(/(20\d{2})[./]?(\d{2})/);
      if (!m) return String(title);
      if (kind === "annual") return `${m[1]}\uB144`;
      const q = { "03": "1", "06": "2", "09": "3", "12": "4" }[m[2]];
      return q ? `${m[1]}\uB144 ${q}\uBD84\uAE30` : `${m[1]}.${m[2]}`;
    };
    const quarters = periods.map((p) => ({
      p: p.title,
      label: qLabel(p.title) + (p.est ? " (\uC608\uC0C1)" : ""),
      est: !!p.est,
      rev: rev ? rev[p.key] : null,
      op: op ? op[p.key] : null,
      ni: ni ? ni[p.key] : null
    })).filter((q) => q.rev != null || q.op != null || q.ni != null);
    return { quarters, kind };
  }
  return null;
}
function yoyOf(cur, quarters, idx, field, kind) {
  const v = cur[field];
  if (v == null) return null;
  const ym = String(cur.p).match(/(20\d{2})[./]?(\d{2})/);
  let prev = null;
  if (ym) {
    const want = Number(ym[1]) - 1 + "." + ym[2];
    const hit = quarters.find((q) => String(q.p).replace("/", ".") === want && !q.est);
    if (hit) prev = hit[field];
  }
  if (prev == null) {
    const back = kind === "annual" ? 1 : 4;
    if (idx - back >= 0 && !quarters[idx - back].est) prev = quarters[idx - back][field];
  }
  if (prev == null) return { prev: null, pct: null, turn: null };
  if (prev < 0 && v >= 0) return { prev, pct: null, turn: "\uD751\uC790\uC804\uD658" };
  if (prev >= 0 && v < 0) return { prev, pct: null, turn: "\uC801\uC790\uC804\uD658" };
  if (prev === 0) return { prev, pct: null, turn: null };
  return { prev, pct: Math.round((v - prev) / Math.abs(prev) * 1e4) / 100, turn: null };
}
async function buildDetail(code) {
  const q = await naverQuarterly(code);
  if (!q || !q.quarters.length) return { ok: false, code, error: "\uC7AC\uBB34 \uB370\uC774\uD130\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4" };
  const qs = q.quarters.slice(-9);
  const withYoy = (item) => {
    const idx = q.quarters.indexOf(item);
    return { ...item, yoy: { rev: yoyOf(item, q.quarters, idx, "rev", q.kind), op: yoyOf(item, q.quarters, idx, "op", q.kind), ni: yoyOf(item, q.quarters, idx, "ni", q.kind) } };
  };
  const actuals = q.quarters.filter((x) => !x.est && (x.rev != null || x.op != null));
  const latest = actuals.length ? withYoy(actuals[actuals.length - 1]) : null;
  const nextEst = q.quarters.find((x) => x.est && (x.rev != null || x.op != null || x.ni != null));
  const next = nextEst ? withYoy(nextEst) : null;
  return {
    ok: true,
    code,
    unit: "\uC5B5\uC6D0",
    period: q.kind === "quarter" ? "\uBD84\uAE30" : "\uC5F0\uAC04",
    quarters: qs,
    latest,
    next,
    src: "\uB124\uC774\uBC84 \uAE08\uC735 \xB7 \uCEE8\uC13C\uC11C\uC2A4\uB294 \uC99D\uAD8C\uC0AC \uCD94\uC815 \uD3C9\uADE0"
  };
}
var calendar_default = async (req2) => {
  const url = new URL(req2.url);
  const detail = String(url.searchParams.get("detail") || "").replace(/[^0-9A-Z]/gi, "");
  if (/^[0-9][0-9A-Z]{5}$/.test(detail)) {
    const body = await buildDetail(detail.toUpperCase());
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": body.ok ? "s-maxage=3600" : "no-store" } });
  }
  const diag = {};
  const events = [];
  try {
    const { cookie, crumb } = await yahooAuth();
    diag.crumb = crumb ? "ok" : "none";
    const settled = await Promise.allSettled([quoteBatch(US_TICKERS, cookie, crumb), tvKrEarnings()]);
    const results = settled[0].status === "fulfilled" && Array.isArray(settled[0].value) ? settled[0].value : [];
    const tv = settled[1].status === "fulfilled" ? settled[1].value : { items: [], why: "fail" };
    diag.us = results.length;
    diag.tv = tv.why;
    const now = Date.now();
    const lo = now - 2 * 864e5, hi = now + 140 * 864e5;
    for (const q of results) {
      const sym = q.symbol;
      const nm = US[sym] || q.shortName || sym;
      const ts = q.earningsTimestamp || q.earningsTimestampStart || null;
      if (!ts) continue;
      const ms = ts * 1e3;
      if (ms < lo || ms > hi) continue;
      const est = !!q.isEarningsDateEstimate;
      events.push({ date: isoKST(ms), title: nm + " \uC2E4\uC801 \uBC1C\uD45C" + (est ? " \uC608\uC815" : ""), tag: "\uC2E4\uC801", country: "us", ticker: sym, sure: !est });
    }
    for (const x of tv.items) {
      const ms = x.ts * 1e3;
      if (ms < now - 7 * 864e5 || ms > hi) continue;
      const cons = [];
      if (!x.past) {
        if (x.epsF != null) cons.push("EPS \uC608\uC0C1 " + Math.round(x.epsF).toLocaleString() + "\uC6D0");
        if (x.revF != null) cons.push("\uB9E4\uCD9C \uC608\uC0C1 " + (x.revF >= 1e12 ? (x.revF / 1e12).toFixed(1) + "\uC870" : Math.round(x.revF / 1e8).toLocaleString() + "\uC5B5"));
      }
      /* ══ [v4.90] 추정으로 볼 만한 신호를 더 본다 ═══════════════════════════
         ① 제공사가 확정이라고 하지 않았다
         ② 컨센서스(EPS·매출 예상)가 하나도 없다 — 이런 종목은 날짜도 대개 자동 생성이다
         ③ '분기 종료 한 달 뒤 수요일' — 제공사가 패턴을 못 찾았을 때 쓰는 기본값이다
         셋 중 하나라도 걸리면 확정이라고 적지 않는다. */
      let sure2 = !!x.sure && !x.past ? true : x.past;
      if (!x.past) {
        if (x.epsF == null && x.revF == null) sure2 = false;
        /* 제공사 기본값: '보고 대상 분기가 끝난 뒤 한 달째 되는 달의 수요일'.
           발표일이 속한 분기가 아니라 '직전 분기의 마지막 달'을 기준으로 삼아야 한다.
           예) 7월 발표 → 대상은 2분기(6월 종료) → 6월 + 1개월 = 7월 · 수요일이면 자동 생성 의심 */
        const dt = new Date(ms + 9 * 3600e3);
        const mo = dt.getUTCMonth();                       // 0=1월
        const prevQEnd = (Math.floor(mo / 3) * 3 + 11) % 12; // 직전 분기의 마지막 달
        const gap = (mo - prevQEnd + 12) % 12;
        if (dt.getUTCDay() === 3 && gap === 1) sure2 = false;
      }
      events.push({
        date: isoKST(ms),
        title: x.name + " \uC2E4\uC801 \uBC1C\uD45C",
        tag: x.past ? "\uC2E4\uC801 \xB7 \uBC1C\uD45C \uC644\uB8CC"
          : cons.length ? "\uC2E4\uC801 \xB7 " + cons.join(" \xB7 ")
          : (sure2 ? "\uC2E4\uC801" : "\uC2E4\uC801 \xB7 \uB0A0\uC9DC \uCD94\uC815"),
        country: "kr",
        ticker: x.code + ".KS",
        code: x.code,
        sure: sure2,
        past: !!x.past,
        epsF: !x.past && x.epsF != null ? Math.round(x.epsF) : null,
        revF: !x.past && x.revF != null ? Math.round(x.revF / 1e8) : null
      });
    }
  } catch (e) {
    diag.err = String(e).slice(0, 60);
  }
  const seen = /* @__PURE__ */ new Set();
  const uniq = events.filter((e) => {
    const k = e.date + "|" + e.ticker;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => a.date < b.date ? -1 : 1);
  return new Response(
    JSON.stringify({ ok: uniq.length > 0, events: uniq, diag }),
    { headers: { "content-type": "application/json", "cache-control": "s-maxage=1800" } }
  );
};

// netlify/functions/_cache.js
function kstMin() {
  const d = new Date(Date.now() + 9 * 36e5);
  return { wd: d.getUTCDay(), hm: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
function krLive() {
  const { wd, hm } = kstMin();
  if (wd === 0 || wd === 6) return false;
  return hm >= 480 && hm < 1200;
}
/* ══ [v9.71] 지수 전용 '지금 어디든 열려 있나' 판정 ══════════════════════════
   [무엇이 잘못됐나] cacheHdr 의 기준인 krLive() 는 한국 시각 08:00~20:00 만
   'live' 로 본다. 그런데 나스닥·S&P·다우가 실제로 움직이는 시간은 한국 밤
   22:30~05:00 이다. 그 시간대에는 idle 로 잡혀 max-age=120 ·
   stale-while-revalidate=600 이 걸렸고, 엣지 캐시가 최대 12분 지난 응답을
   그대로 내보냈다 — 화면의 해외 지수가 실제와 다르게 보이던 큰 원인이다.
   선물·코인은 사실상 24시간이므로, 지수 응답은 '어느 시장이든 열려 있으면'
   짧은 캐시를 쓴다. */
function idxLive() {
  try {
    const { wd, hm } = kstMin();
    if (wd >= 1 && wd <= 5 && hm >= 480 && hm < 1200) return true;      // 국내 08:00~20:00
    /* 미국 정규장 — 서머타임 여부와 무관하게 넉넉히 잡는다(22:00~06:00 KST) */
    if (hm >= 1320 || hm < 360) { const d = (hm >= 1320) ? wd : (wd + 6) % 7; if (d >= 1 && d <= 5) return true; }
    return false;
  } catch (e) { return true; }
}
function cacheHdr(live, idle, isLive) {
  const on = isLive === void 0 ? krLive() : !!isLive;
  const s = on ? live : idle;
  const swr = Math.max(s * 5, 30);
  return {
    "content-type": "application/json",
    "cache-control": `public, max-age=${s}, stale-while-revalidate=${swr}`,
    "cloudflare-cdn-cache-control": `public, max-age=${s}, stale-while-revalidate=${swr}`,
    "netlify-cdn-cache-control": `public, s-maxage=${s}, stale-while-revalidate=${swr}`,
    "x-cache-policy": on ? `live-${s}s` : `idle-${s}s`
  };
}

// netlify/functions/chart.js
var UA2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
var ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
async function fetchText2(url, ms, headers) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers, signal: c.signal });
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}
function parseSise(txt) {
  txt = String(txt || "").trim().replace(/\n/g, "").replace(/'/g, '"');
  if (!txt.startsWith("[")) return [];
  let arr;
  try {
    arr = JSON.parse(txt);
  } catch {
    try {
      arr = JSON.parse(txt.replace(/,\s*]/g, "]"));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.slice(1).filter((r) => Array.isArray(r) && r.length >= 6).map((r) => ({ d: String(r[0]).replace(/[^0-9]/g, ""), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] })).filter((c) => c.c > 0);
}
async function siseJson(code, timeframe, years) {
  const end = /* @__PURE__ */ new Date();
  const start = /* @__PURE__ */ new Date();
  start.setFullYear(start.getFullYear() - years);
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${ymd(start)}&endTime=${ymd(end)}&timeframe=${timeframe}`;
  return parseSise(await fetchText2(url, 5e3, { "User-Agent": UA2, "Referer": "https://finance.naver.com/" }));
}
function parseStooq(csv) {
  const rows = String(csv || "").trim().split("\n");
  if (rows.length < 2 || !/date/i.test(rows[0])) return [];
  return rows.slice(1).map((l) => {
    const p = l.split(",");
    return { d: (p[0] || "").replace(/-/g, ""), o: +p[1], h: +p[2], l: +p[3], c: +p[4], v: +p[5] };
  }).filter((c) => c.c > 0);
}
async function stooq(code, interval) {
  const csv = await fetchText2(`https://stooq.com/q/d/l/?s=${code}.kr&i=${interval}`, 5e3, { "User-Agent": UA2 });
  return parseStooq(csv);
}
function aggYear(months) {
  const map = /* @__PURE__ */ new Map();
  for (const c of months) {
    const y = c.d.slice(0, 4);
    const g = map.get(y);
    if (!g) map.set(y, { d: y + "1231", o: c.o, h: c.h, l: c.l, c: c.c, v: c.v });
    else {
      g.h = Math.max(g.h, c.h);
      g.l = Math.min(g.l, c.l);
      g.c = c.c;
      g.v += c.v;
    }
  }
  return [...map.values()];
}
function med(arr) {
  const a = arr.filter((x) => isFinite(x)).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
}
function rowsToCandles(rows) {
  const all = [];
  rows.forEach((r) => r.slice(1).forEach((v) => {
    const n = Number(v);
    if (isFinite(n) && n > 0) all.push(n);
  }));
  const M = med(all);
  if (!M) return [];
  const lo = M * 0.5, hi = M * 2;
  const out = [];
  for (const r of rows) {
    const d = String(r[0]).replace(/[^0-9]/g, "");
    if (d.length < 8) continue;
    const nums = r.slice(1).map(Number).filter((x) => isFinite(x));
    const prices = nums.filter((x) => x >= lo && x <= hi);
    if (!prices.length) continue;
    const high = Math.max(...prices), low = Math.min(...prices);
    const open = prices[0], close = prices[prices.length - 1];
    const nonp = nums.filter((x) => x < lo || x > hi).map((x) => Math.abs(x));
    const vol = nonp.length ? Math.max(...nonp) : 0;
    if (close > 0) out.push({ d, o: open, h: high, l: low, c: close, v: vol });
  }
  out.sort((a, b) => a.d < b.d ? -1 : 1);
  return out.slice(-500);
}
function fchartRows(txt) {
  const rows = [];
  const re = /data="([^"]+)"/g;
  let m;
  while (m = re.exec(txt)) {
    const p = m[1].split("|");
    if (p.length >= 3) rows.push(p);
  }
  return rows;
}
async function fchartMinute(code) {
  const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=minute&count=500&requestType=0`;
  const txt = await fetchText2(url, 6e3, { "User-Agent": UA2, "Referer": `https://finance.naver.com/item/main.naver?code=${code}` });
  return rowsToCandles(fchartRows(txt));
}
async function frontMinute(code) {
  const end = /* @__PURE__ */ new Date();
  const start = /* @__PURE__ */ new Date();
  start.setDate(start.getDate() - 5);
  const url = `https://m.stock.naver.com/front-api/external/chart/domestic/info?symbol=${code}&requestType=1&startTime=${ymd(start)}&endTime=${ymd(end)}&timeframe=minute`;
  const txt = await fetchText2(url, 6e3, { "User-Agent": UA2, "Referer": "https://m.stock.naver.com/", "Accept": "application/json" });
  const t = String(txt || "").trim();
  let rows = [];
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t.replace(/'/g, '"').replace(/,\s*]/g, "]"));
      if (Array.isArray(arr)) rows = arr.slice(1).filter(Array.isArray);
    } catch {
    }
  } else {
    try {
      const j = JSON.parse(t);
      const a = j && (j.result || j.datas || j.data || j.result && j.result.datas) || [];
      if (Array.isArray(a)) rows = a.map((o) => Array.isArray(o) ? o : [o.localDateTime || o.localDate || o.dt || o.date || o.time, o.openPrice ?? o.open, o.highPrice ?? o.high, o.lowPrice ?? o.low, o.closePrice ?? o.close, o.accumulatedTradingVolume ?? o.volume]);
    } catch {
    }
  }
  return rowsToCandles(rows);
}
async function naverMinute(code) {
  try {
    const c = await frontMinute(code);
    if (c.length > 2) return { candles: c, src: "front:" + c.length };
  } catch (e) {
  }
  try {
    const c = await fchartMinute(code);
    if (c.length > 2) return { candles: c, src: "fchart:" + c.length };
  } catch (e) {
  }
  return { candles: [], src: "none" };
}
async function tryBoth(code, tf) {
  const naverTf = { D: "day", W: "week", M: "month" }[tf];
  const stooqI = { D: "d", W: "w", M: "m" }[tf];
  const years = tf === "M" ? 20 : tf === "W" ? 6 : 2;
  let c = [];
  try {
    c = await siseJson(code, naverTf, years);
  } catch {
    c = [];
  }
  if (c.length > 1) return { src: "naver", candles: c };
  try {
    c = await stooq(code, stooqI);
  } catch {
    c = [];
  }
  if (c.length > 1) return { src: "stooq", candles: c.slice(-300) };
  return { src: "none", candles: [] };
}
/* [v10.6] 앱이 쓰는 지수 키 → 야후 심볼. 새 지수를 추가하려면 여기만 늘리면 된다. */
var IDX_SYM = {
  KOSPI:"^KS11", KOSDAQ:"^KQ11", KOSPI200:"^KS200",
  NASDAQ:"^IXIC", SP500:"^GSPC", DOW:"^DJI", RUSSELL:"^RUT", VIX:"^VIX",
  NIKKEI:"^N225", HANGSENG:"^HSI", SHANGHAI:"000001.SS", SHENZHEN:"399001.SZ",
  DAX:"^GDAXI", FTSE:"^FTSE", CAC:"^FCHI", STOXX:"^STOXX50E",
  TAIEX:"^TWII", SENSEX:"^BSESN", NIFTY:"^NSEI", BOVESPA:"^BVSP",
  ASX:"^AXJO", TSX:"^GSPTSE", USDKRW:"KRW=X", DXY:"DX-Y.NYB",
  WTI:"CL=F", GOLD:"GC=F", SILVER:"SI=F", US10Y:"^TNX", BTCUSD:"BTC-USD"
};
async function yahooIndex(sym, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${encodeURIComponent(range||"8mo")}&interval=${encodeURIComponent(interval||"1d")}`;
  const txt = await fetchText2(url, 5e3, { "User-Agent": UA2, "Accept": "application/json" });
  let j;
  try {
    j = JSON.parse(txt);
  } catch {
    return [];
  }
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r) return [];
  const ts = r.timestamp || [];
  const q = r.indicators && r.indicators.quote && r.indicators.quote[0] || {};
  const cl = q.close || [];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    if (cl[i] == null) continue;
    const d = new Date(ts[i] * 1e3);
    /* [v10.9] 분봉은 한 날짜에 여러 봉이 들어간다. 날짜만 붙이면 축 라벨이
       전부 같은 값이 되고 시세 목록에서도 구분이 안 된다 — 시각을 함께 담는다. */
    const _isMin = /m$/.test(String(interval || ""));
    const _t = _isMin ? String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0") : "";
    out.push({ d: ymd(d), t: _t, o: q.open && q.open[i] || cl[i], h: q.high && q.high[i] || cl[i], l: q.low && q.low[i] || cl[i], c: cl[i], v: q.volume && q.volume[i] || 0 });
  }
  return out;
}
var pad2 = (n) => String(n).padStart(2, "0");
async function yahooMinute(code, mkt, want) {
  /* ══ [v4.63] 국내 분봉도 1년까지 이어 붙인다 ═══════════════════════════════
     예전에는 range=5d 한 번이라 닷새치가 전부였다. 해외와 같은 방식으로
     period1·period2 창을 옮겨 가며 여러 번 받아 잇는다.
     야후가 한 번에 주는 기간은 1분봉 7일 · 5~30분봉 60일 · 60분봉 2년이라,
     1분봉만 아무리 이어도 두 달 남짓이 한계다(없는 데이터를 지어내지 않는다). */
  /* [v4.64] 국내도 같은 계단 — 1분 7일 · 3분 28일 · 5분 이상 1년 */
  const bkt = want >= 60 ? 60 : want >= 30 ? 30 : want >= 5 ? 5 : want >= 3 ? 3 : 1;
  const IV = { 1: "1m", 3: "1m", 5: "5m", 30: "30m", 60: "60m" }[bkt];
  const WIN = { 1: 7, 3: 7, 5: 59, 30: 59, 60: 365 }[bkt];
  const WANT_DAYS = { 1: 7, 3: 28, 5: 365, 30: 365, 60: 365 }[bkt];
  const winCount = Math.min(8, Math.max(1, Math.ceil(WANT_DAYS / WIN)));
  const now = Math.floor(Date.now() / 1e3), DAY = 86400;
  const order = mkt === "KOSDAQ" ? [".KQ", ".KS"] : [".KS", ".KQ"];
  for (const sfx of order) {
    try {
      const jobs = [];
      for (let i = 0; i < winCount; i++) {
        const p2 = now - i * WIN * DAY, p1 = p2 - WIN * DAY;
        jobs.push(`https://query1.finance.yahoo.com/v8/finance/chart/${code}${sfx}`
          + `?interval=${IV}&period1=${p1}&period2=${p2}`);
      }
      const parts = await Promise.all(jobs.map(async (u) => {
        try {
          const txt = await fetchText2(u, 6e3, { "User-Agent": UA2, "Accept": "application/json" });
          const j = JSON.parse(txt);
          const r = j && j.chart && j.chart.result && j.chart.result[0];
          if (!r || !r.timestamp) return null;
          return r;
        } catch (e) { return null; }
      }));
      const map = new Map();
      for (const r of parts) {
        if (!r) continue;
        const ts = r.timestamp;
        const q = r.indicators && r.indicators.quote && r.indicators.quote[0] || {};
        for (let i = 0; i < ts.length; i++) {
          const c = q.close && q.close[i];
          if (c == null) continue;
          const d = new Date(ts[i] * 1e3 + 9 * 36e5);
          const dd = `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}`;
          if (map.has(dd)) continue;
          map.set(dd, { d: dd, o: q.open && q.open[i] != null ? q.open[i] : c, h: q.high && q.high[i] != null ? q.high[i] : c, l: q.low && q.low[i] != null ? q.low[i] : c, c, v: q.volume && q.volume[i] || 0 });
        }
      }
      let out = [...map.values()].sort((a, b) => a.d < b.d ? -1 : 1);
      if (out.length > 26000) out = out.slice(-26000);
      if (out.length > 2) return { candles: out, src: "yahoo" + sfx + ":" + IV + ":" + out.length };
    } catch (e) {
    }
  }
  return null;
}
async function getMinute(code, mkt, want) {
  const y = await yahooMinute(code, mkt, want || 1);
  if (y) return y;
  return await naverMinute(code);
}
var chart_default = async (req2) => {
  const url = new URL(req2.url);
  const code = String(url.searchParams.get("code") || "005930").replace(/[^0-9A-Za-z]/g, "");
  const tf = String(url.searchParams.get("tf") || "D").toUpperCase();
  try {
    let out;
    /* ══ [v10.6] 해외 지수 차트가 안 나오던 이유 ═══════════════════════════════
       코스피·코스닥 두 개만 손으로 적어 두고 나머지는 종목 경로로 넘겼다.
       그런데 NASDAQ·S&P500·다우는 종목 코드가 아니라 지수 심볼이라 조회가 실패했다.
       야후는 이 지수들을 모두 제공하므로(^IXIC 등) 표를 만들어 함께 처리한다.
       기간(tf)도 그대로 넘겨 일·주·월·년을 각각 받는다. */
    if (IDX_SYM[code]) {
      /* ══ [v10.9] 지수 분봉·연봉이 안 나오던 이유 ═══════════════════════════
         ① tf 는 위에서 toUpperCase() 된다. 화면은 '1m','60m' 같은 소문자를
            보내므로 '1M','60M' 이 되어 표에 없는 값이 됐다 → 일봉으로 떨어졌다.
         ② 연봉(Y)에 월간(1mo) 간격을 줘서 월봉과 똑같은 그림이 나왔다.
         야후는 분봉을 지원한다(1m/5m/15m/30m/60m). 다만 조회 가능한 기간이
         짧아(1분은 7일, 그 외 60일) 범위를 각각 맞춰 준다. */
      const MAP = {
        "1M":  ["7d",  "1m"],   "3M":  ["1mo", "5m"],   // 3분은 야후에 없어 5분으로 대신한다
        "5M":  ["1mo", "5m"],   "10M": ["1mo", "15m"],  // 10분 → 15분
        "30M": ["3mo", "30m"],  "60M": ["6mo", "60m"],
        "D":   ["2y",  "1d"],   "W":   ["10y", "1wk"],
        "M":   ["max", "1mo"],  "Y":   ["max", "3mo"]
      };
      const pick = MAP[tf] || MAP.D;
      let c = [];
      try { c = await yahooIndex(IDX_SYM[code], pick[0], pick[1]); } catch { c = []; }
      /* 연봉은 야후가 따로 주지 않는다 — 분기봉을 받아 연 단위로 묶는다 */
      if (tf === "Y" && c.length) {
        const byY = new Map();
        c.forEach(k => {
          const y = String(k.d || "").slice(0, 4); if (!y) return;
          const g = byY.get(y);
          if (!g) byY.set(y, { d: y + "1231", o: k.o, h: k.h, l: k.l, c: k.c, v: k.v || 0 });
          else { g.h = Math.max(g.h, k.h); g.l = Math.min(g.l, k.l); g.c = k.c; g.v += (k.v || 0); }
        });
        c = [...byY.values()];
      }
      out = { src: "yahoo-index", candles: c, sym: IDX_SYM[code], tf, iv: pick[1] };
    } else if (tf === "MIN") {
      const mkt = String(url.searchParams.get("mkt") || "").toUpperCase();
      let r = { candles: [], src: "none" };
      try {
        r = await getMinute(code, mkt, Math.max(1, parseInt(url.searchParams.get("m") || "1") || 1));
      } catch (e) {
        r = { candles: [], src: "err:" + String(e).slice(0, 40) };
      }
      out = { src: r.src, candles: r.candles };
    } else if (tf === "Y") {
      const m = await tryBoth(code, "M");
      out = { src: m.src, candles: aggYear(m.candles) };
    } else out = await tryBoth(code, ["D", "W", "M"].includes(tf) ? tf : "D");
    return new Response(JSON.stringify({ ok: out.candles.length > 0, tf, src: out.src, candles: out.candles }), { headers: cacheHdr(30, 900) });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e), candles: [] }), { headers: { "content-type": "application/json" } });
  }
};

// netlify/functions/clan.js
init_store();
var ENV2 = null;
var webcrypto2 = globalThis.crypto;
var json2 = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
var toHex2 = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha2562(s) {
  return toHex2(await webcrypto2.subtle.digest("SHA-256", new TextEncoder().encode(String(s))));
}
var derive2 = (salt, pass) => sha2562(salt + "|" + pass);
var clip = (s, n) => String(s || "").replace(/[<>]/g, "").trim().slice(0, n);
var genId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
var genCode = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
var EMBLEMS = ["\u{1F6E1}\uFE0F", "\u2694\uFE0F", "\u{1F525}", "\u{1F680}", "\u{1F48E}", "\u{1F402}", "\u{1F43B}", "\u{1F985}", "\u{1F319}", "\u2B50", "\u{1F340}", "\u{1F451}"];
/* ══ [v7.5] KV 가 방금 쓴 계정을 못 읽는 문제 ═══════════════════════════════
   [무엇이 일어났나] 구글 가입이 계정을 KV 에 저장하는데, 그 값이 전 세계에
   퍼지는 데 시간이 걸린다(최대 1분). 그 사이 클랜·친구가 계정을 조회하면
   '그런 계정 없음'이 되어 auth 오류가 났다(첨부 사진).
   [고침] 방금 쓴 계정 DB 를 이 작업자의 기억에 잠깐 담아 둔다.
   같은 작업자에게 들어온 요청이면 KV 대신 이 기억을 쓴다.
   (작업자가 바뀌면 KV 를 보는데, 그때쯤이면 이미 퍼져 있다) */
/* ══════════════════════════════════════════════════════════════════════════════
   [v9.74] 사용자 데이터를 계정별 키로 분리한다
   ─────────────────────────────────────────────────────────────────────────────
   [무엇이 잘못돼 있었나]
   모든 사람의 데이터가 KV 의 "db" 키 하나에 통째로 들어 있었다. 저장은
   '읽어서 → 통째로 다시 쓰기' 방식이라, 두 사람이 비슷한 시각에 저장하면
   이런 일이 벌어진다.

       A 가 db 를 읽음 (A잔고 100만, B잔고 500만)
       B 가 db 를 읽음 (같은 값)
       A 가 매수 → db 를 통째로 씀 (A잔고 90만, B잔고 500만)
       B 가 매수 → 자기가 읽어 둔 낡은 사본을 씀 (A잔고 100만, B잔고 480만)
       → A 의 매수가 통째로 사라진다.

   KV 는 트랜잭션이 없어 이 경합을 막을 방법이 없다. 또 한 사람이 관심종목
   하나만 바꿔도 전원의 데이터를 다시 쓰므로 쓰기 한도(1,000회/일)도 빨리 닳는다.

   [어떻게 바꾸나]
   자주 바뀌고 덩치가 큰 '사용자 데이터'만 계정별 키로 뗀다.
       usr:<id>  → 그 사람의 보유·거래·관심종목 …
       db        → 계정 정보(이름·비밀번호 해시)만 남는다. 가입·비밀번호 변경
                   같은 드문 일에만 바뀌므로 경합 확률이 사실상 없다.
   이제 A 의 저장은 usr:A 만, B 의 저장은 usr:B 만 건드린다. 서로 덮어쓸 수 없다.

   [기존 데이터는]
   처음 접근할 때 db.users 안에 있던 값을 usr:<id> 로 옮겨 적고, 원본은 지우지
   않고 그대로 둔다. 옮기기가 실패하거나 배포를 되돌려도 예전 코드가 그대로
   읽을 수 있어야 하기 때문이다. 읽을 때는 usr:<id> 를 먼저 보고, 없으면
   db.users[id] 로 물러난다. 사용자는 아무것도 하지 않아도 된다. */
/* ══════════════════════════════════════════════════════════════════════════════
   [v9.75] 계정 정보도 계정별 키로 분리한다 — 공유 키를 완전히 없앤다
   ─────────────────────────────────────────────────────────────────────────────
   v9.74 에서 사용자 데이터(보유·거래)는 usr:<id> 로 뗐지만, 계정 정보(이름·
   비밀번호 해시)는 여전히 "db" 한 곳에 모여 있었다. 가입·비밀번호 변경은 드문
   일이라 부딪힐 확률이 낮을 뿐, 구조상 같은 유실이 그대로 남아 있었다.
       두 사람이 같은 순간에 가입 → 나중 쓰기가 앞사람 계정을 통째로 지운다.
   '드무니까 괜찮다'는 것은 고친 게 아니다. 계정도 제 키를 갖게 한다.

   [왜 지금은 가능한가]
   쪼개기를 막던 것은 "전체 계정 목록을 훑는 코드"였다. 실제로 세어 보니 그런
   곳은 하나도 없었고, 전부 아래 세 가지 찾기였다.
       ① 아이디로 찾기          → acc:<id> 를 직접 읽으면 된다
       ② 대소문자 무시하고 찾기 → 키를 소문자로 정규화해 두면 ①과 같아진다
       ③ 구글 sub·이메일로 찾기 → 가리키는 키를 따로 둔다(gsub:… / mail:…)
   그래서 목록 인덱스(그 자체가 또 하나의 공유 키가 됐을 것)가 필요 없다.

   [기존 데이터]
   usr 과 같은 방식이다. acc:<id> 가 없으면 예전 db.accounts[id] 에서 읽고,
   읽는 김에 새 자리로 옮겨 적는다. 원본은 지우지 않아 되돌릴 수 있다. */
/* ══════════════════════════════════════════════════════════════════════════════
   [v9.76] 웹 푸시 — 앱을 닫아도 오는 알림
   ─────────────────────────────────────────────────────────────────────────────
   [지금까지 왜 안 왔나] new Notification() 은 페이지가 살아 있어야만 뜬다.
   앱을 닫으면 그 코드를 돌릴 주체가 없어 알림도 없다. 진짜 푸시는 브라우저
   제조사의 푸시 서버(FCM·Mozilla 등)가 대신 배달해 주는 구조라야 한다.

   [필요한 것 네 가지]
     ① 서비스 워커  — 앱이 닫혀도 브라우저가 깨워 주는 작은 스크립트
     ② 구독 정보    — 그 기기로 배달할 주소(endpoint)와 암호키 두 개
     ③ VAPID        — "이 푸시는 우리 서버가 보낸 것"임을 증명하는 서명
     ④ 본문 암호화  — 푸시 서버는 내용을 볼 수 없어야 한다(RFC 8291)

   이 파일은 ③·④를 담당한다. 표준 그대로 구현했고, 아래 규격을 따른다.
     RFC 8291 (Message Encryption) · RFC 8188 (aes128gcm) · RFC 8292 (VAPID)
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── base64url 변환 ── 푸시 규격은 패딩 없는 base64url 을 쓴다 ── */
function b64uToBytes(s) {
  s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(buf) {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function cat() {
  let n = 0;
  for (const a of arguments) n += a.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const a of arguments) { out.set(a, o); o += a.length; }
  return out;
}
const utf8 = (s) => new TextEncoder().encode(s);

/* ── HKDF (RFC 5869) — 푸시 규격이 요구하는 키 유도 ── */
async function hmac(keyBytes, data) {
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
async function hkdf(salt, ikm, info, len) {
  const prk = await hmac(salt, ikm);
  const out = await hmac(prk, cat(info, new Uint8Array([1])));
  return out.slice(0, len);
}

/* ══ VAPID 키 만들기 — 한 번만 만들어 저장해 두고 계속 쓴다 ══ */
async function vapidGenerate() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));       // 65바이트 비압축 점
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { publicKey: bytesToB64u(pub), privateJwk: jwk };
}

/* ══ VAPID 서명 — "우리가 보냈다"는 증명서(JWT) ══ */
async function vapidAuth(privateJwk, publicKeyB64u, audience, subject) {
  const key = await crypto.subtle.importKey("jwk", privateJwk,
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = bytesToB64u(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = bytesToB64u(utf8(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,     // 12시간 (규격 상한 24시간)
    sub: subject || "mailto:admin@example.com"
  })));
  const signingInput = utf8(header + "." + body);
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, signingInput));   // WebCrypto 는 r||s 64바이트를 준다
  const jwt = header + "." + body + "." + bytesToB64u(sig);
  return "vapid t=" + jwt + ", k=" + publicKeyB64u;
}

/* ══ 본문 암호화 (RFC 8291 / aes128gcm) ══
   푸시 서버는 배달만 할 뿐 내용을 읽을 수 없어야 한다. 그래서 브라우저가 준
   공개키(p256dh)와 비밀값(auth)으로 우리만 아는 열쇠를 만들어 잠근다. */
async function encryptPayload(p256dhB64u, authB64u, plaintext) {
  const uaPub = b64uToBytes(p256dhB64u);          // 65바이트
  const authSecret = b64uToBytes(authB64u);       // 16바이트
  if (uaPub.length !== 65) throw new Error("bad p256dh");

  /* ① 우리 쪽 일회용 키쌍 */
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));

  /* ② 상대 공개키와 합쳐 공유 비밀을 만든다 */
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, kp.privateKey, 256));

  /* ③ 규격이 정한 순서대로 열쇠를 유도한다 */
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyInfo = cat(utf8("WebPush: info"), new Uint8Array([0]), uaPub, asPub);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, cat(utf8("Content-Encoding: aes128gcm"), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, cat(utf8("Content-Encoding: nonce"), new Uint8Array([0])), 12);

  /* ④ 마지막 조각 표시(0x02)를 붙여 잠근다 */
  const padded = cat(utf8(plaintext), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));

  /* ⑤ 머리말(소금 + 조각크기 + 우리 공개키) 뒤에 암호문을 붙인다 */
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

/* ══ 실제 발송 ══
   돌려주는 값의 gone=true 는 '이 구독은 더 이상 유효하지 않다'는 뜻이다.
   (기기를 초기화했거나 알림을 껐을 때) 호출한 쪽에서 구독을 지워야 한다. */
async function pushSend(sub, payloadObj, vapid, opts) {
  const o = opts || {};
  try {
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth)
      return { ok: false, err: "badsub" };
    const body = await encryptPayload(sub.keys.p256dh, sub.keys.auth, JSON.stringify(payloadObj || {}));
    const aud = new URL(sub.endpoint).origin;
    const auth = await vapidAuth(vapid.privateJwk, vapid.publicKey, aud, o.subject);
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    let r;
    try {
      r = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          "authorization": auth,
          "content-encoding": "aes128gcm",
          "content-type": "application/octet-stream",
          "ttl": String(o.ttl == null ? 3600 : o.ttl),
          "urgency": o.urgency || "normal"
        },
        body
      });
    } finally { clearTimeout(t); }
    /* 404·410 = 구독 소멸. 그 외 4xx 는 우리 잘못일 수 있으므로 구분해 알린다. */
    if (r.status === 404 || r.status === 410) return { ok: false, gone: true, status: r.status };
    if (!r.ok) {
      let detail = "";
      try { detail = (await r.text()).slice(0, 200); } catch (e) {}
      return { ok: false, status: r.status, detail };
    }
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, err: String(e && e.message || e).slice(0, 120) };
  }
}

const _pushTest = { b64uToBytes, bytesToB64u, hkdf, encryptPayload, vapidAuth };


var _accCache = {};
const ACC_CACHE_MS = 20000;
const accKeyOf = (id) => "acc:" + String(id == null ? "" : id).trim().toLowerCase();
async function accLoad(st, id, legacyDb) {
  const key = String(id == null ? "" : id).trim().toLowerCase();
  if (!key) return null;
  const c = _accCache[key];
  if (c && Date.now() - c.at < ACC_CACHE_MS) return c.v;
  let v = null;
  try { v = await st.get(accKeyOf(key), { type: "json" }); } catch (e) { v = null; }
  if (v == null && legacyDb && legacyDb.accounts) {
    /* 옛 자리 — 정확한 키, 없으면 대소문자만 다른 키까지 훑는다(이전 대상 찾기) */
    let hit = legacyDb.accounts[key];
    if (!hit) {
      const k2 = Object.keys(legacyDb.accounts).find((x) => x.trim().toLowerCase() === key);
      if (k2) hit = legacyDb.accounts[k2];
    }
    if (hit) {
      v = hit;
      try { await st.setJSON(accKeyOf(key), v); } catch (e) {}   // 읽는 김에 이관
      try { await accIndex(st, key, v); } catch (e) {}
    }
  }
  _accCache[key] = { v, at: Date.now() };
  return v;
}
/* 구글 로그인이 쓰는 되찾기용 키 — 계정마다 따로라 서로 부딪히지 않는다 */
async function accIndex(st, id, acc) {
  if (!id || !acc) return;
  try {
    if (acc.googleSub) await st.setJSON("gsub:" + acc.googleSub, { id });
    if (acc.email) await st.setJSON("mail:" + String(acc.email).trim().toLowerCase(), { id });
  } catch (e) {}
}

/* ══════════════════════════════════════════════════════════════════════════════
   [v11.0] 등급 시스템 — 서버가 진실을 가진다
   ─────────────────────────────────────────────────────────────────────────────
   [왜 acc: 에 두나] 사용자 데이터(usr:)는 화면이 통째로 보낸 값을 그대로 저장한다
   (sync 가 body.user 를 받아 쓴다). 거기에 등급을 두면 개발자도구에서 tier:'max'
   한 줄 고치고 동기화하는 것만으로 최상위 등급이 된다.
   계정 정보(acc:)는 서버만 쓰므로 화면이 손댈 수 없다 — 등급은 여기에 둔다.
   [만료 판정] 읽을 때 계산한다. 만료가 지났으면 free 로 취급하고, 필요하면 그때
   기록만 정리한다. Cron Trigger 없이도 정확하며, 별도 청소 작업이 필요 없다.
   ══════════════════════════════════════════════════════════════════════════════ */
var TIER_KEYS = ["free", "lite", "basic", "plus", "pro", "max"];
var TIER_NAME = { free:"Free", lite:"Lite", basic:"Basic", plus:"Plus", pro:"Pro", max:"Max" };
/* 관리자 확인 — 이미 쓰고 있는 NXT_ADMIN_TOKEN 을 그대로 쓴다(키를 늘리지 않는다) */
function admOk(tok) {
  const want = envGet("NXT_ADMIN_TOKEN");
  return !!want && String(tok || "") === String(want);
}
/* 비밀번호 확인 — 계정 라우트의 verify 를 쿠폰에서도 쓴다 */
async function verifyPass(acc, pass) {
  try { const v = await verify(acc, pass, null); return !!(v && v.ok); }
  catch (e) { return false; }
}
function tierIdx(k) {
  const i = TIER_KEYS.indexOf(String(k || "free").toLowerCase());
  return i < 0 ? 0 : i;
}
/* 계정에서 '지금 유효한' 등급을 꺼낸다. 만료됐으면 free. */
function tierOf(acc) {
  if (!acc) return { key: "free", lv: 0, until: null, expired: false };
  const raw = String(acc.tier || "free").toLowerCase();
  const lv0 = tierIdx(raw);
  const until = acc.tierUntil ? Number(acc.tierUntil) : null;
  if (lv0 > 0 && until && Date.now() > until) {
    return { key: "free", lv: 0, until, expired: true };   // 지났다 — free 로 본다
  }
  return { key: TIER_KEYS[lv0], lv: lv0, until: until || null, expired: false };
}
/* 등급을 준다. 이미 상위 등급이면 등급은 지키고 기간만 늘린다. */
function tierGrant(acc, key, days, from) {
  const now = Date.now();
  const cur = tierOf(acc);
  const want = tierIdx(key);
  const addMs = (days > 0) ? days * 864e5 : 0;      // days=0 이면 무기한

  let nextLv = Math.max(cur.lv, want);
  let nextUntil;

  if (addMs === 0 || (cur.lv === want && !cur.until)) {
    nextUntil = null;                                // 무기한이 한쪽이라도 있으면 무기한
  } else if (want > cur.lv) {
    nextUntil = now + addMs;                         // 등급이 오르면 기간을 새로 센다
  } else {
    /* 같거나 낮은 등급의 쿠폰 — 기간만 이어 붙인다 */
    const base = (cur.until && cur.until > now) ? cur.until : now;
    nextUntil = cur.until === null && cur.lv > 0 ? null : base + addMs;
  }
  acc.tier = TIER_KEYS[nextLv];
  acc.tierUntil = nextUntil;
  acc.tierAt = now;
  if (from) acc.tierFrom = String(from).slice(0, 40);
  return tierOf(acc);
}
/* 응답에 실어 보낼 모양 — 화면은 이것만 믿는다 */
function tierPayload(acc) {
  const t = tierOf(acc);
  /* [v12.2] 받은 날짜도 함께 — 멤버십 화면에서 '언제부터'를 보여 준다 */
  return { tier: t.key, lv: t.lv, until: t.until, expired: t.expired,
           from: (acc && acc.tierFrom) || null, at: (acc && acc.tierAt) || null };
}

async function accSave(st, id, acc) {
  const key = String(id == null ? "" : id).trim().toLowerCase();
  if (!key) return false;
  _accCache[key] = { v: acc, at: Date.now() };
  try { await st.setJSON(accKeyOf(key), acc); } catch (e) { return false; }
  await accIndex(st, key, acc);
  return true;
}
async function accDelete(st, id, acc) {
  const key = String(id == null ? "" : id).trim().toLowerCase();
  if (!key) return;
  delete _accCache[key];
  try { await st.del(accKeyOf(key)); } catch (e) {}
  try {
    if (acc && acc.googleSub) await st.del("gsub:" + acc.googleSub);
    if (acc && acc.email) await st.del("mail:" + String(acc.email).trim().toLowerCase());
  } catch (e) {}
}
/* 구글 sub·이메일로 계정 아이디를 되찾는다. 새 키를 먼저 보고, 없으면 옛 db 를 훑는다. */
async function accFindByGoogle(st, gsub, email, legacyDb) {
  const tryKey = async (k) => {
    try { const r = await st.get(k, { type: "json" }); return (r && r.id) || null; } catch (e) { return null; }
  };
  let id = gsub ? await tryKey("gsub:" + gsub) : null;
  if (!id && email) id = await tryKey("mail:" + String(email).trim().toLowerCase());
  if (id) return id;
  if (legacyDb && legacyDb.accounts) {
    const k = Object.keys(legacyDb.accounts).find((x) => {
      const a = legacyDb.accounts[x];
      return a && ((a.googleSub && a.googleSub === gsub) ||
        (a.email && String(a.email).toLowerCase() === String(email || "").toLowerCase()));
    });
    if (k) return k;
  }
  return "";
}
var _usrCache = {};                       // id -> {v, at}  같은 요청 안에서 두 번 읽지 않게
const USR_CACHE_MS = 20000;
async function usrLoad(st, id, legacyDb) {
  if (!id) return null;
  const c = _usrCache[id];
  if (c && Date.now() - c.at < USR_CACHE_MS) return c.v;
  let v = null;
  try { v = await st.get("usr:" + id, { type: "json" }); } catch (e) { v = null; }
  if (v == null && legacyDb && legacyDb.users && legacyDb.users[id]) {
    v = legacyDb.users[id];               // 아직 안 옮겨진 계정 — 옛 자리에서 읽는다
    try { await st.setJSON("usr:" + id, v); } catch (e) {}   // 읽는 김에 옮겨 둔다
  }
  _usrCache[id] = { v, at: Date.now() };
  return v;
}
var _usrSig = {};
async function usrSave(st, id, val) {
  if (!id) return false;
  /* ══ [v9.97] 내용이 그대로면 쓰지 않는다 ═══════════════════════════════════
     동기화는 화면에서 값이 조금만 움직여도 불린다. 그런데 실제로 바뀐 것이
     없는 경우가 많다(주문 화면에서 수량만 만지작거리다 원래대로 돌린다든지).
     KV 쓰기는 무료 한도가 하루 1,000회뿐이라, 같은 내용을 다시 쓰는 것만
     막아도 실사용 인원이 몇 배로 늘어난다. 지문을 비교해 같으면 건너뛴다. */
  let sig = "";
  try { sig = JSON.stringify(val); } catch (e) { sig = ""; }
  _usrCache[id] = { v: val, at: Date.now() };
  if (sig && _usrSig[id] === sig) return true;          // 이미 같은 내용이 저장돼 있다
  try {
    await st.setJSON("usr:" + id, val);
    if (sig) _usrSig[id] = sig;
    /* 지문이 무한히 쌓이지 않게 — 오래된 것부터 덜어낸다 */
    const ks = Object.keys(_usrSig);
    if (ks.length > 200) ks.slice(0, 100).forEach(k => delete _usrSig[k]);
    return true;
  } catch (e) { return false; }
}
async function usrDelete(st, id) {
  if (!id) return;
  delete _usrCache[id];
  try { await st.del("usr:" + id); } catch (e) {}
}
var _dbCache=null, _dbCacheAt=0;
var DB_CACHE_MS=90000;
function dbCacheGet(){
  if(_dbCache&&Date.now()-_dbCacheAt<DB_CACHE_MS)return _dbCache;
  return null;
}
function dbCacheSet(db){ _dbCache=db; _dbCacheAt=Date.now(); }
/* 계정 DB 를 읽는다 — 방금 쓴 것이 있으면 그것을 먼저 본다 */
/* [v9.75] readAccDb 가 돌려주는 db 에 저장소 손잡이를 달아 둔다.
   verifyUser 같은 하위 함수가 계정별 키를 읽으려면 st 가 필요한데,
   호출부를 전부 고치는 것보다 여기서 한 번 붙이는 편이 안전하다. */
async function readAccDb(st){
  const c=dbCacheGet();
  const kv=await st.acc.get("db",{type:"json"}).catch(()=>null);
  if(!kv)return Object.assign(c||{accounts:{},users:{}},{__st:st&&st.acc});
  if(!c)return Object.assign(kv,{__st:st&&st.acc});
  /* 둘 다 있으면 계정 수가 많은 쪽(더 최신)을 쓰고, 캐시에만 있는 계정을 합친다 */
  const merged={accounts:{...kv.accounts},users:{...(kv.users||{})}};
  for(const k of Object.keys(c.accounts||{}))
    if(!merged.accounts[k])merged.accounts[k]=c.accounts[k];
  for(const k of Object.keys(c.users||{}))
    if(!merged.users[k])merged.users[k]=c.users[k];
  return Object.assign(merged,{__st:st&&st.acc});
}
async function stores() {
  const mod = await Promise.resolve().then(() => (init_blobs_shim(), blobs_shim_exports));
  return {
    acc: await getStoreX({ name: "live-accounts" }, ENV2),
    clan: await getStoreX({ name: "live-clans" }, ENV2)
  };
}
async function verifyUser(db, id, pass, legacy) {
  if (!id) return false;
  /* ══ [v9.75] 계정을 계정별 키(acc:<id>)에서도 찾는다 ═════════════════════
     계정이 옮겨진 뒤로는 db.accounts 가 비어 있을 수 있다. 여기만 고치면
     클랜·친구의 모든 호출부가 한 번에 새 구조를 따르게 된다.
     키는 소문자로 정규화돼 있으므로 대소문자 차이도 여기서 함께 흡수된다. */
  let acc = (db.accounts && (db.accounts[id] || db.accounts[String(id).trim().toLowerCase()])) || null;
  if (!acc) {
    try { acc = await accLoad(db.__st || null, id, db); } catch (e) { acc = null; }
  }
  if (!acc) return false;
  if (acc.salt && acc.hash) {
    if (pass && await derive2(acc.salt, pass) === acc.hash) return acc;
    if (legacy && await derive2(acc.salt, legacy) === acc.hash) return acc;
    return false;
  }
  if (acc.pass && (acc.pass === pass || acc.pass === legacy)) return acc;
  return false;
}
var clan_default = async (req2) => {
  if (req2.method !== "POST") return json2({ ok: false, err: "method" });
  let b;
  try {
    b = await req2.json();
  } catch {
    return json2({ ok: false, err: "body" });
  }
  let st;
  try {
    st = await stores();
  } catch {
    return json2({ ok: false, err: "nostore" });
  }
  /* ══ [v4.95] 공개 클랜 탐색은 인증 앞에 둔다 ═══════════════════════════════
     [무엇이 문제였나] 모든 요청이 인증을 먼저 통과해야 했다. 그래서 로그인 정보가
     서버와 조금이라도 어긋나면(비밀번호 재설정·기기 이전 등) 공개 클랜 목록조차
     보이지 않았다 — 공개로 만든 클랜이 있는데도 '공개된 클랜이 아직 없어요'가 떴다.
     탐색은 누구나 볼 수 있는 정보이므로 인증을 요구할 이유가 없다. */
  if (String(b.action || "") === "list") {
    const idx0 = await st.clan.get("index", { type: "json" }).catch(() => null) || {};
    const q0 = clip(b.q, 16);
    let arr0 = Object.values(idx0).filter((x) => x && x.open !== false);
    if (q0) arr0 = arr0.filter((x) => String(x.name || "").includes(q0));
    arr0.sort((x, y) => (y.avg ?? -1e9) - (x.avg ?? -1e9));
    return json2({ ok: true, clans: arr0.slice(0, 30) });
  }
  const db = await readAccDb(st);          // [v7.5] 방금 쓴 계정도 보이게
  let user = await verifyUser(db, b.id, b.pass, b.legacy);
  let uidKey = String(b.id || "");
  /* [v6.1] 아이디 대소문자가 어긋나도 찾아 준다 — 친구와 같은 규칙 */
  if (!user && uidKey) {
    const hit = Object.keys(db.accounts || {}).find((k) => k.toLowerCase() === uidKey.toLowerCase());
    if (hit && hit !== uidKey) { user = await verifyUser(db, hit, b.pass, b.legacy); if (user) uidKey = hit; }
  }
  if (!user) {
    const known = !!(db.accounts && Object.keys(db.accounts).some((k) => k.toLowerCase() === uidKey.toLowerCase()));
    return json2({ ok: false, err: "auth", why: known ? "pass" : "nouser" });
  }
  const uid = uidKey;
  const uname = clip(b.name || user.name || uid, 12);
  const myClanId = user.clanId || null;
  const loadClan = (cid) => st.clan.get("clan:" + cid, { type: "json" }).catch(() => null);
  /* ══ [v4.91] KV 쓰기를 아낀다 ══════════════════════════════════════════════
     [무엇이 문제였나] 클랜을 저장할 때마다 본문과 목록(index)을 함께 썼다.
     채팅 한 줄에도 쓰기 2회다. 무료 KV 는 하루 쓰기 1,000회라 금방 바닥나고,
     한도를 넘으면 저장이 실패해 '창설 실패 · server' 가 뜬다(첨부 사진).
     [고침] 목록은 '탐색 화면에 보이는 정보'라 매번 갱신할 필요가 없다.
     내용이 실제로 달라졌거나 5분이 지났을 때만 다시 쓴다. */
  const saveClan = async (c, opts) => {
    await st.clan.setJSON("clan:" + c.cid, c);
    if (!opts || opts.index !== false) await touchIndex(st, c);
  };
  const saveUserClan = async (cid) => {
    if (cid) user.clanId = cid;
    else delete user.clanId;
    db.accounts[uid] = user;
    await accSave(st.acc, uid, user);      /* [v9.75] 계정별 키에 — 남의 계정을 덮지 않는다 */
  };
  const isLeader = (c) => c.leader === uid;
  const isStaff = (c) => c.leader === uid || c.members[uid] && c.members[uid].role === "sub";
  const act = String(b.action || "");
  try {
    if (act === "list") {
      const idx = await st.clan.get("index", { type: "json" }).catch(() => null) || {};
      const q = clip(b.q, 16);
      let arr = Object.values(idx).filter((x) => x && x.open !== false);
      if (q) arr = arr.filter((x) => String(x.name || "").includes(q));
      arr.sort((x, y) => (y.avg ?? -1e9) - (x.avg ?? -1e9));
      return json2({ ok: true, clans: arr.slice(0, 30), mine: myClanId });
    }
    if (act === "get") {
      if (!myClanId) return json2({ ok: true, clan: null });
      const c = await loadClan(myClanId);
      if (!c) {
        await saveUserClan(null);
        return json2({ ok: true, clan: null });
      }
      if (rollSeason(c, b.ym)) await saveClan(c);
      return json2({ ok: true, clan: pub(c, uid) });
    }
    if (act === "create") {
      if (myClanId) return json2({ ok: false, err: "already" });
      const name = clip(b.clanName, 16);
      if (name.length < 2) return json2({ ok: false, err: "name" });
      const c = {
        cid: genId(),
        code: genCode(),
        name,
        leader: uid,
        createdAt: Date.now(),
        emblem: EMBLEMS.includes(b.emblem) ? b.emblem : "\u{1F6E1}\uFE0F",
        intro: clip(b.intro, 60),
        open: b.open !== false,
        goal: null,
        ym: String(b.ym || "").slice(0, 7) || null,
        members: {},
        pending: {},
        chat: [],
        feed: [],
        hof: []
      };
      c.members[uid] = { name: uname, rate: null, msg: "", role: "", tr: 0, hold: 0, joinedAt: Date.now(), updatedAt: Date.now() };
      pushFeed(c, `\u{1F3D7}\uFE0F ${uname}\uB2D8\uC774 \uD074\uB79C\uC744 \uCC3D\uC124\uD588\uC2B5\uB2C8\uB2E4`);
      await saveClan(c);
      await st.clan.setJSON("code:" + c.code, { cid: c.cid });
      await saveUserClan(c.cid);
      return json2({ ok: true, clan: pub(c, uid) });
    }
    if (act === "join" || act === "apply") {
      if (myClanId) return json2({ ok: false, err: "already" });
      let cid = clip(b.cid, 24);
      if (!cid) {
        const code = clip(b.code, 8).toUpperCase();
        const ref = await st.clan.get("code:" + code, { type: "json" }).catch(() => null);
        if (!ref) return json2({ ok: false, err: "nocode" });
        cid = ref.cid;
      }
      const c = await loadClan(cid);
      if (!c) return json2({ ok: false, err: "nocode" });
      if (Object.keys(c.members).length >= 30) return json2({ ok: false, err: "full" });
      if (c.open === false && !b.code) {
        c.pending = c.pending || {};
        if (!c.pending[uid]) {
          c.pending[uid] = { name: uname, ts: Date.now() };
          pushFeed(c, `\u270B ${uname}\uB2D8\uC774 \uAC00\uC785\uC744 \uC2E0\uCCAD\uD588\uC2B5\uB2C8\uB2E4`);
        }
        await saveClan(c);
        return json2({ ok: true, applied: true });
      }
      c.members[uid] = { name: uname, rate: null, msg: "", role: "", tr: 0, hold: 0, joinedAt: Date.now(), updatedAt: Date.now() };
      if (c.pending) delete c.pending[uid];
      pushFeed(c, `\u{1F389} ${uname}\uB2D8\uC774 \uD074\uB79C\uC5D0 \uD569\uB958\uD588\uC2B5\uB2C8\uB2E4`);
      sysChat(c, `${uname}\uB2D8\uC774 \uC785\uC7A5\uD588\uC2B5\uB2C8\uB2E4`);
      await saveClan(c);
      await saveUserClan(c.cid);
      return json2({ ok: true, clan: pub(c, uid) });
    }
    if (act === "sync") {
      if (!myClanId) return json2({ ok: false, err: "noclan" });
      const c = await loadClan(myClanId);
      if (!c) return json2({ ok: false, err: "noclan" });
      rollSeason(c, b.ym);
      const m = c.members[uid] || { name: uname, role: "", joinedAt: Date.now() };
      m.name = uname;
      if (b.rate != null && isFinite(+b.rate)) m.rate = Math.max(-99, Math.min(999, Math.round(+b.rate * 100) / 100));
      if (b.msg !== void 0) m.msg = clip(b.msg, 30);
      if (b.tr != null && isFinite(+b.tr)) m.tr = Math.max(0, Math.min(999999, Math.round(+b.tr)));
      if (b.hold != null && isFinite(+b.hold)) m.hold = Math.max(0, Math.min(999, Math.round(+b.hold)));
      /* ══ [v5.03] 보유 종목 이름과 BEST/WORST 도 함께 담는다 ═══════════════════
         지금까지는 '몇 종목'만 보내 무엇을 들고 있는지 알 수 없었다.
         금액은 담지 않는다 — 자산 규모는 서로 공개하지 않는 것이 이 앱의 원칙이다. */
      if (Array.isArray(b.holds)) {
        m.holds = b.holds.slice(0, 12).map((x) => ({
          n: clip(x && x.n, 14),
          r: (x && isFinite(+x.r)) ? Math.round(+x.r * 100) / 100 : null,
          us: (x && x.us) ? 1 : 0
        })).filter((x) => x.n);
      }
      const pick = (o) => (o && o.n) ? { n: clip(o.n, 14), r: isFinite(+o.r) ? Math.round(+o.r * 100) / 100 : null } : null;
      if (b.best !== void 0) m.best = pick(b.best);
      if (b.worst !== void 0) m.worst = pick(b.worst);
      /* [v7.8] 클랜도 같은 이유로 매번 저장하고 있었다 — 바뀐 게 있을 때만 쓴다 */
      const now2 = Date.now();
      const changed2 = JSON.stringify({ r: m.rate, s: m.msg, t: m.tr, h: m.hold,
        hs: m.holds, b: m.best, w: m.worst }) !== (m._sig || "");
      if (changed2 || now2 - (m.updatedAt || 0) > 300000) {
        m._sig = JSON.stringify({ r: m.rate, s: m.msg, t: m.tr, h: m.hold,
          hs: m.holds, b: m.best, w: m.worst });
        m.updatedAt = now2;
        c.members[uid] = m;
        await saveClan(c);
      } else {
        c.members[uid] = m;
      }
      return json2({ ok: true, clan: pub(c, uid) });
    }
    if (act === "chat") {
      if (!myClanId) return json2({ ok: false, err: "noclan" });
      const c = await loadClan(myClanId);
      if (!c) return json2({ ok: false, err: "noclan" });
      const text = clip(b.text, 200);
      if (!text) return json2({ ok: false, err: "empty" });
      const now = Date.now();
      c.chat = Array.isArray(c.chat) ? c.chat : [];
      if (c.chat.filter((x) => x.id === uid && now - x.ts < 1e4).length >= 5) return json2({ ok: false, err: "slow" });
      c.chat.push({ mid: "m" + now.toString(36) + Math.random().toString(36).slice(2, 5), id: uid, name: uname, text, ts: now });
      if (c.chat.length > 120) c.chat = c.chat.slice(-120);
      const me = c.members[uid];
      if (me) {
        me.updatedAt = now;
        me.name = uname;
      }
      await saveClan(c, { index: false });   // [v4.91] 채팅은 탐색 목록에 영향이 없다
      return json2({ ok: true, clan: pub(c, uid) });
    }
    if (act === "notice") {
      const c = await loadClan(myClanId);
      if (!c || !isStaff(c)) return json2({ ok: false, err: "noauth" });
      c.notice = clip(b.notice, 80);
      c.noticeAt = Date.now();
      if (c.notice) {
        pushFeed(c, `\u{1F4E2} \uACF5\uC9C0\uAC00 \uB4F1\uB85D\uB410\uC2B5\uB2C8\uB2E4`);
        sysChat(c, `\uACF5\uC9C0: ${c.notice}`);
      }
      await saveClan(c);
      return json2({ ok: true, clan: pub(c, uid) });
    }
    if (act === "settings") {
      const c = await loadClan(myClanId);
      if (!c || !isLeader(c)) return json2({ ok: false, err: "noauth" });
      if (b.clanName !== void 0) {
        const nm = clip(b.clanName, 16);
        if (nm.length >= 2) c.name = nm;
      }
      if (b.emblem !== void 0 && EMBLEMS.includes(b.emblem)) c.emblem = b.emblem;
      if (b.intro !== void 0) c.intro = clip(b.intro, 60);
      if (b.open !== void 0) c.open = !!b.open;
      if (b.goal !== void 0) {
        const g = Number(b.goal);
        c.goal = isFinite(g) && g !== 0 ? Math.max(-50, Math.min(200, Math.round(g * 10) / 10)) : null;
      }
      await saveClan(c);
      return json2({ ok: true, clan: pub(c, uid) });
    }
    if (act === "rename") {
      const c = await loadClan(myClanId);
      if (!c || !isLeader(c)) return json2({ ok: false, err: "noauth" });
      const nm = clip(b.clanName, 16);
      if (nm.length < 2) return json2({ ok: false, err: "name" });
      c.name = nm;
      await saveClan(c);
      return json2({ ok: true, clan: pub(c, uid) });
    }
    if (act === "newcode") {
      const c = await loadClan(myClanId);
      if (!c || !isLeader(c)) return json2({ ok: false, err: "noauth" });
      const old = c.code;
      c.code = genCode();
      await st.clan.setJSON("code:" + c.code, { cid: c.cid });
      if (old) await st.clan.delete("code:" + old).catch(() => {
      });
      pushFeed(c, `\u{1F39F}\uFE0F \uCD08\uB300 \uCF54\uB4DC\uAC00 \uC7AC\uBC1C\uAE09\uB410\uC2B5\uB2C8\uB2E4`);
      await saveClan(c);
      return json2({ ok: true, clan: pub(c, uid) });
    }
    if (act === "transfer") {
      const c = await loadClan(myClanId);
      if (!c || !isLeader(c)) return json2({ ok: false, err: "noauth" });
      const t = String(b.target || "");
      if (!c.members[t]) return json2({ ok: false, err: "nomember" });
      c.leader = t;
      if (c.members[t]) c.members[t].role = "";
      pushFeed(c, `\u{1F451} ${c.members[t].name}\uB2D8\uC774 \uC0C8 \uB9AC\uB354\uAC00 \uB410\uC2B5\uB2C8\uB2E4`);
      sysChat(c, `${c.members[t].name}\uB2D8\uC774 \uC0C8 \uB9AC\uB354\uAC00 \uB418\uC5C8\uC2B5\uB2C8\uB2E4`);
      await saveClan(c);
      return json2({ ok: true, clan: pub(c, uid) });
    }
    if (act === "role") {
      const c = await loadClan(myClanId);
      if (!c || !isLeader(c)) return json2({ ok: false, err: "noauth" });
      const t = String(b.target || "");
      const m = c.members[t];
      if (!m) return json2({ ok: false, err: "nomember" });
      m.role = b.role === "sub" ? "sub" : "";
      pushFeed(c, m.role === "sub" ? `\u2B50 ${m.name}\uB2D8\uC774 \uBD80\uB9AC\uB354\uAC00 \uB410\uC2B5\uB2C8\uB2E4` : `${m.name}\uB2D8\uC758 \uBD80\uB9AC\uB354 \uAD8C\uD55C\uC774 \uD574\uC81C\uB410\uC2B5\uB2C8\uB2E4`);
      await saveClan(c);
      return json2({ ok: true, clan: pub(c, uid) });
    }
    if (act === "approve" || act === "deny") {
      const c = await loadClan(myClanId);
      if (!c || !isStaff(c)) return json2({ ok: false, err: "noauth" });
      const t = String(b.target || "");
      const p = c.pending && c.pending[t];
      if (!p) return json2({ ok: false, err: "noreq" });
      delete c.pending[t];
      if (act === "approve") {
        if (Object.keys(c.members).length >= 30) return json2({ ok: false, err: "full" });
        c.members[t] = { name: p.name, rate: null, msg: "", role: "", tr: 0, hold: 0, joinedAt: Date.now(), updatedAt: Date.now() };
        const tu = db.accounts[t];
        if (tu) {
          tu.clanId = c.cid;
          db.accounts[t] = tu;
          await accSave(st.acc, t, tu);       /* [v9.75] 상대 계정도 제 키에 */
        }
        pushFeed(c, `\u{1F389} ${p.name}\uB2D8\uC774 \uD074\uB79C\uC5D0 \uD569\uB958\uD588\uC2B5\uB2C8\uB2E4`);
        sysChat(c, `${p.name}\uB2D8\uC774 \uC785\uC7A5\uD588\uC2B5\uB2C8\uB2E4`);
      } else pushFeed(c, `${p.name}\uB2D8\uC758 \uAC00\uC785 \uC2E0\uCCAD\uC744 \uBC18\uB824\uD588\uC2B5\uB2C8\uB2E4`);
      await saveClan(c);
      return json2({ ok: true, clan: pub(c, uid) });
    }
    if (act === "kick") {
      const c = await loadClan(myClanId);
      if (!c || !isStaff(c)) return json2({ ok: false, err: "noauth" });
      const t = String(b.target || "");
      if (t && t !== uid && c.members[t]) {
        if (c.leader === t) return json2({ ok: false, err: "noauth" });
        const nm = c.members[t].name;
        delete c.members[t];
        pushFeed(c, `\u{1F44B} ${nm}\uB2D8\uC774 \uD074\uB79C\uC5D0\uC11C \uC81C\uC678\uB410\uC2B5\uB2C8\uB2E4`);
        const tu = db.accounts[t];
        if (tu && tu.clanId === c.cid) {
          delete tu.clanId;
          db.accounts[t] = tu;
          await accSave(st.acc, t, tu);       /* [v9.75] 상대 계정도 제 키에 */
        }
      }
      await saveClan(c);
      return json2({ ok: true, clan: pub(c, uid) });
    }
    /* ══ [v4.92] 클랜 해체 ═══════════════════════════════════════════════════
       [무엇이 없었나] 탈퇴는 있었지만, 리더가 '구성원이 있는 클랜'을 없애는 길이
       없었다. 리더가 나가면 다른 사람에게 자동으로 넘어갈 뿐이라, 만들어 본 클랜을
       정리할 방법이 사실상 없었다.
       [규칙] 리더만 할 수 있고, 되돌릴 수 없으므로 클랜 이름을 정확히 입력해야 한다.
       본문·초대코드·탐색 목록·구성원 소속을 모두 지운다. */
    if (act === "disband") {
      if (!myClanId) return json2({ ok: false, err: "noclan" });
      const c = await loadClan(myClanId);
      if (!c) { await saveUserClan(null); return json2({ ok: true }); }
      if (!isLeader(c)) return json2({ ok: false, err: "perm" });
      /* 실수로 누르는 것을 막는다 — 클랜 이름을 그대로 적어야 진행된다 */
      if (clip(b.confirm, 16) !== c.name) return json2({ ok: false, err: "confirm" });
      const ids = Object.keys(c.members || {});
      await st.clan.delete("clan:" + c.cid).catch(() => {});
      await st.clan.delete("code:" + c.code).catch(() => {});
      await dropIndex(st, c.cid);
      /* 구성원 전원의 소속을 푼다 — 안 풀면 '이미 클랜에 속해 있다'며 새 클랜을 못 만든다 */
      let touched = 0;
      for (const mid of ids) {
        /* [v9.75] 구성원 계정도 각자의 키에서 읽고 각자의 키에 쓴다 */
        let a = (db.accounts && db.accounts[mid]) || null;
        if (!a) { try { a = await accLoad(st.acc, mid, db); } catch (e) { a = null; } }
        if (a && a.clanId === c.cid) {
          delete a.clanId; db.accounts[mid] = a; touched++;
          try { await accSave(st.acc, mid, a); } catch (e) {}
        }
      }
      /* [v9.75] 위에서 계정마다 이미 저장했으므로 공유 키는 건드리지 않는다 */
      return json2({ ok: true, disbanded: true, n: ids.length });
    }
    if (act === "leave") {
      if (!myClanId) return json2({ ok: true });
      const c = await loadClan(myClanId);
      if (c) {
        const nm = (c.members[uid] || {}).name || uname;
        delete c.members[uid];
        if (c.leader === uid) {
          const sub = Object.entries(c.members).find(([, m]) => m.role === "sub");
          const rest = sub ? sub[0] : Object.keys(c.members)[0];
          if (rest) {
            c.leader = rest;
            c.members[rest].role = "";
            pushFeed(c, `\u{1F451} ${c.members[rest].name}\uB2D8\uC774 \uC0C8 \uB9AC\uB354\uAC00 \uB410\uC2B5\uB2C8\uB2E4`);
            await saveClan(c);
          } else {
            await st.clan.delete("clan:" + c.cid).catch(() => {
            });
            await st.clan.delete("code:" + c.code).catch(() => {
            });
            await dropIndex(st, c.cid);
          }
        } else {
          pushFeed(c, `\u{1F44B} ${nm}\uB2D8\uC774 \uD074\uB79C\uC744 \uB5A0\uB0AC\uC2B5\uB2C8\uB2E4`);
          await saveClan(c);
        }
      }
      await saveUserClan(null);
      return json2({ ok: true });
    }
    return json2({ ok: false, err: "action" });
  } catch (e) {
    return json2({ ok: false, err: "server", detail: String(e).slice(0, 80) });
  }
};
function pushFeed(c, text) {
  c.feed = Array.isArray(c.feed) ? c.feed : [];
  c.feed.unshift({ t: text, ts: Date.now() });
  if (c.feed.length > 30) c.feed = c.feed.slice(0, 30);
}
function sysChat(c, text) {
  c.chat = Array.isArray(c.chat) ? c.chat : [];
  c.chat.push({ mid: "s" + Date.now().toString(36), id: "system", name: "\uC2DC\uC2A4\uD15C", text, ts: Date.now(), sys: 1 });
  if (c.chat.length > 120) c.chat = c.chat.slice(-120);
}
async function touchIndex(st, c) {
  try {
    const idx = await st.clan.get("index", { type: "json" }).catch(() => null) || {};
    /* 탐색 목록에 실제로 보이는 값이 그대로면 다시 쓰지 않는다 */
    const prev = idx[c.cid];
    const ms = Object.values(c.members || {});
    const rated = ms.filter((m) => m.rate != null);
    idx[c.cid] = {
      cid: c.cid,
      name: c.name,
      emblem: c.emblem || "\u{1F6E1}\uFE0F",
      intro: c.intro || "",
      open: c.open !== false,
      n: ms.length,
      avg: rated.length ? Math.round(rated.reduce((a, m) => a + m.rate, 0) / rated.length * 100) / 100 : null,
      lv: levelOf(c),
      at: Date.now()
    };
    /* 보이는 값이 그대로면 저장을 건너뛴다 — at(갱신시각)은 비교에서 뺀다 */
    if (prev) {
      const same = ["name","emblem","intro","open","n","avg","lv"].every(k => prev[k] === idx[c.cid][k]);
      if (same && Date.now() - (prev.at || 0) < 5 * 60e3) return;
    }
    const keys = Object.keys(idx);
    if (keys.length > 300) {
      keys.sort((a, z) => (idx[a].at || 0) - (idx[z].at || 0));
      delete idx[keys[0]];
    }
    await st.clan.setJSON("index", idx);
  } catch {
  }
}
async function dropIndex(st, cid) {
  try {
    const idx = await st.clan.get("index", { type: "json" }).catch(() => null) || {};
    delete idx[cid];
    await st.clan.setJSON("index", idx);
  } catch {
  }
}
function rollSeason(c, ym) {
  const cur = String(ym || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(cur)) return false;
  if (!c.ym) {
    c.ym = cur;
    return true;
  }
  if (c.ym === cur) return false;
  const ranked = Object.values(c.members).filter((m) => m.rate != null).sort((a, z) => z.rate - a.rate);
  c.hof = Array.isArray(c.hof) ? c.hof : [];
  if (ranked.length) {
    c.hof.unshift({ ym: c.ym, name: ranked[0].name, rate: ranked[0].rate });
    pushFeed(c, `\u{1F3C6} ${c.ym} \uC2DC\uC98C 1\uC704: ${ranked[0].name}`);
  }
  if (c.hof.length > 6) c.hof = c.hof.slice(0, 6);
  Object.values(c.members).forEach((m) => {
    m.rate = null;
  });
  c.ym = cur;
  return true;
}
function expOf(c) {
  const ms = Object.values(c.members || {});
  const trades = ms.reduce((a, m) => a + (m.tr || 0), 0);
  const days = Math.max(0, Math.floor((Date.now() - (c.createdAt || Date.now())) / 864e5));
  return trades * 3 + (c.chat || []).length * 2 + ms.length * 20 + days * 5 + (c.hof || []).length * 100;
}
function levelOf(c) {
  return Math.max(1, Math.min(50, Math.floor(Math.sqrt(expOf(c) / 60)) + 1));
}
function missionsOf(c, ms, avg2) {
  const trades = ms.reduce((a, m) => a + (m.tr || 0), 0);
  const rated = ms.filter((m) => m.rate != null).length;
  return [
    { k: "\uBA64\uBC84 \uBAA8\uC73C\uAE30", cur: ms.length, goal: 5, unit: "\uBA85" },
    { k: "\uD074\uB79C \uB204\uC801 \uCCB4\uACB0", cur: trades, goal: 100, unit: "\uAC74" },
    { k: "\uC218\uC775\uB960 \uB4F1\uB85D \uBA64\uBC84", cur: rated, goal: Math.max(3, Math.ceil(ms.length * 0.6)), unit: "\uBA85" },
    { k: "\uD074\uB79C \uD3C9\uADE0 \uC218\uC775\uB960", cur: avg2 == null ? 0 : Math.max(0, Math.round(avg2 * 10) / 10), goal: c.goal || 5, unit: "%" }
  ].map((x) => ({ ...x, done: x.cur >= x.goal }));
}
function pub(c, uid) {
  const members = Object.entries(c.members).map(([id, m]) => ({
    id,
    name: m.name,
    rate: m.rate,
    msg: m.msg || "",
    role: m.role || "",
    tr: m.tr || 0,
    hold: m.hold || 0,
    /* ══ [v5.4] 보유 종목·BEST/WORST 가 화면까지 오지 않던 이유 ═══════════════
       저장은 되고 있었는데, 이 함수가 내보낼 항목을 하나씩 골라 담으면서
       새로 넣은 세 가지를 빠뜨렸다. 그래서 화면에는 '1종목' 만 보였다. */
    holds: Array.isArray(m.holds) ? m.holds : [],
    best: m.best || null,
    worst: m.worst || null,
    joinedAt: m.joinedAt || 0,
    updatedAt: m.updatedAt
  })).sort((a, z) => (z.rate ?? -1e9) - (a.rate ?? -1e9));
  const rated = members.filter((m) => m.rate != null);
  const avg2 = rated.length ? Math.round(rated.reduce((a, m) => a + m.rate, 0) / rated.length * 100) / 100 : null;
  const exp = expOf(c), lv = levelOf(c);
  const need = Math.pow(lv - 1, 2) * 60, next = Math.pow(lv, 2) * 60;
  return {
    cid: c.cid,
    code: c.code,
    name: c.name,
    emblem: c.emblem || "\u{1F6E1}\uFE0F",
    intro: c.intro || "",
    open: c.open !== false,
    leader: c.leader,
    me: uid,
    createdAt: c.createdAt,
    goal: c.goal ?? null,
    notice: c.notice || "",
    noticeAt: c.noticeAt || 0,
    ym: c.ym || "",
    hof: c.hof || [],
    chat: (c.chat || []).slice(-60),
    feed: (c.feed || []).slice(0, 20),
    pending: Object.entries(c.pending || {}).map(([id, p]) => ({ id, name: p.name, ts: p.ts })),
    level: { lv, exp, from: need, to: next, pct: Math.max(0, Math.min(100, Math.round((exp - need) / Math.max(1, next - need) * 100))) },
    missions: missionsOf(c, members, avg2),
    stat: {
      n: members.length,
      rated: rated.length,
      avg: avg2,
      best: rated.length ? rated[0].rate : null,
      trades: members.reduce((a, m) => a + (m.tr || 0), 0)
    },
    members
  };
}

// netlify/functions/_jobs.js
init_store();
var JOB_STORE = "jobs";
async function jobState(name, env) {
  try {
    const st = await getStoreX({ name: JOB_STORE }, env);
    return await st.get("job:" + name, { type: "json" }) || null;
  } catch (e) {
    return null;
  }
}
async function jobSave(name, state, env) {
  try {
    const st = await getStoreX({ name: JOB_STORE }, env);
    await st.setJSON("job:" + name, { ...state, at: Date.now() });
  } catch (e) {
  }
}
async function jobDone(name, result, env) {
  await jobSave(name, { step: 0, running: false, lastDone: Date.now(), lastResult: result }, env);
}
async function runStep(name, total, stepFn, env, opts) {
  const staleMs = opts && opts.staleMs || 10 * 6e4;
  const now = Date.now();
  let s = await jobState(name, env);
  const cooldown = opts && opts.cooldownMs || 0;
  if (s && !s.running && s.lastDone && cooldown && now - s.lastDone < cooldown) {
    return { skipped: true, why: "cooldown", nextIn: cooldown - (now - s.lastDone) };
  }
  if (s && s.running && s.at && now - s.at > staleMs) s = null;
  const step = s && s.running ? s.step || 0 : 0;
  if (step >= total) {
    await jobDone(name, { why: "\uC804 \uB2E8\uACC4 \uC18C\uC9C4" }, env);
    return { done: true, exhausted: true };
  }
  await jobSave(name, { step, running: true }, env);
  let r = null, err = null;
  try {
    r = await stepFn(step);
  } catch (e) {
    err = String(e && e.message || e).slice(0, 160);
  }
  if (r && r.done) {
    await jobDone(name, r.result || { ok: true }, env);
    return { done: true, step, result: r.result };
  }
  await jobSave(name, { step: step + 1, running: true, lastErr: err }, env);
  return { done: false, step, next: step + 1, err };
}

// netlify/functions/cronstep.js
init_store();
init_nxt_core();
async function stepNxt(env) {
  const total = COLLECT_SOURCES().length;
  return await runStep("nxt-collect", total, async (i) => {
    const r = await collectOne(i, 8e3);
    return r.done ? { done: true, result: r.result } : { done: false };
  }, env, { cooldownMs: 30 * 6e4 });
}
async function stepPicks(env) {
  return await runStep("picks-build", 1, async () => {
    const { blobStore: blobStore2 } = await Promise.resolve().then(() => (init_nxt_core(), nxt_core_exports));
    const { buildAndStore: buildAndStore2 } = await Promise.resolve().then(() => (init_picks(), picks_exports));
    const store = await blobStore2();
    const r = await buildAndStore2(store);
    if (r && r.ok) {
      try {
        await store.setJSON("picks:fail", { at: 0 });
      } catch {
      }
      try {
        const { scoreAccuracy: scoreAccuracy2 } = await Promise.resolve().then(() => (init_picks_accuracy(), picks_accuracy_exports));
        await scoreAccuracy2(store);
      } catch {
      }
      try {
        await store.setJSON("picks:lock", { at: 0, day: "" });
      } catch {
      }
      return { done: true, result: { ok: true, n: (r.picks || []).length } };
    }
    try {
      await store.setJSON("picks:fail", { at: Date.now(), why: r && r.why || "\uB370\uC774\uD130 \uC218\uC9D1 \uC2E4\uD328" });
    } catch {
    }
    try {
      await store.setJSON("picks:lock", { at: 0, day: "" });
    } catch {
    }
    return { done: false };
  }, env, { cooldownMs: 60 * 6e4 });
}
var cronstep_default = async (req2, context) => {
  const env = context && context.env || null;
  setEnv(env);
  const url = new URL(req2.url);
  const job = url.searchParams.get("job") || "nxt";
  const key = url.searchParams.get("key") || "";
  const admin = envGet("ADMIN_KEY", env);
  const internal = req2.headers.get("x-cron") === "1";
  if (!internal && admin && key !== admin) {
    return new Response(
      JSON.stringify({ ok: false, error: "unauthorized" }),
      { status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" } }
    );
  }
  let r;
  try {
    r = job === "picks" ? await stepPicks(env) : await stepNxt(env);
  } catch (e) {
    r = { error: String(e && e.message || e).slice(0, 200) };
  }
  const st = await jobState(job === "picks" ? "picks-build" : "nxt-collect", env);
  return new Response(
    JSON.stringify({ ok: !r.error, job, ...r, state: st }, null, 1),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } }
  );
};

// functions/api/[[route]].js
init_etf();

// netlify/functions/etfaudit.js
init_euckr();
function _mkDec2(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
var UA9 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
function decodeSmart3(buf, headerCT) {
  const dec = (enc) => {
    try {
      return _mkDec2(enc).decode(buf);
    } catch {
      return null;
    }
  };
  const score2 = (x) => {
    if (!x) return -1e9;
    const bad = (x.match(/\uFFFD/g) || []).length;
    const han = (x.match(/[가-힣]/g) || []).length;
    const broken = (x.match(/[\u3130-\u318F]/g) || []).length;
    return han - bad * 5 - broken * 3;
  };
  let declared = "";
  const mH = /charset=([\w-]+)/i.exec(String(headerCT || ""));
  if (mH) declared = mH[1].toLowerCase();
  const norm2 = (c) => c === "ms949" || c === "cp949" || c === "ksc5601" ? "euc-kr" : c;
  const cands = [];
  if (declared) {
    const t = dec(norm2(declared));
    if (t) cands.push(t);
  }
  const u = dec("utf-8"), e = dec("euc-kr");
  if (u) cands.push(u);
  if (e) cands.push(e);
  return cands.sort((a, b) => score2(b) - score2(a))[0] || "";
}
async function fetchText3(url, ms, headers, asJson) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: Object.assign({ "User-Agent": UA9 }, headers || {}), signal: c.signal });
    const buf = await r.arrayBuffer();
    const txt = decodeSmart3(buf, r.headers.get("content-type"));
    if (!asJson) return txt;
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  } finally {
    clearTimeout(t);
  }
}
var DATE_LIKE2 = /^(\d{1,2}[\/.\-]\d{1,2}|\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2})$/;
var looksLikeName2 = (t) => {
  t = String(t || "").trim();
  return !!t && t.length <= 40 && !DATE_LIKE2.test(t) && !/^[\d.,%\-+\s]+$/.test(t) && /[가-힣A-Za-z]/.test(t);
};
var etfaudit_default = async (req2) => {
  const url = new URL(req2.url);
  const from = Math.max(0, parseInt(url.searchParams.get("from") || "0", 10) || 0);
  const count = Math.min(18, Math.max(1, parseInt(url.searchParams.get("count") || "12", 10) || 12));
  const results = [];
  try {
    const j = await fetchText3(
      "https://finance.naver.com/api/sise/etfItemList.nhn?etfType=0&targetColumn=market_sum&sortOrder=desc",
      6e3,
      { "Referer": "https://finance.naver.com/sise/etf.naver", "Accept": "application/json" },
      true
    );
    const list = j && j.result && j.result.etfItemList || [];
    const total = list.length;
    const slice = list.slice(from, from + count);
    const etf = await Promise.resolve().then(() => (init_etf(), etf_exports));
    const CONC = 6;
    const one = async (x) => {
      const code = String(x.itemcode || "").toUpperCase(), name = x.itemname;
      const r = { code, name, ok: false, n: 0, sum: null, src: null, issue: null };
      try {
        const res = await etf.default({ url: `https://audit/api/etf?code=${code}` });
        const j2 = JSON.parse(await res.text());
        const hs = j2.holdings || [];
        r.src = j2.diag && j2.diag.src || "none";
        r.sum = Number(hs.reduce((a, b) => a + (b.weight || 0), 0).toFixed(1));
        const good = hs.filter((h) => looksLikeName2(h.name));
        if (good.length) {
          r.ok = true;
          r.n = good.length;
        } else if (j2.holdingsKind) {
          r.ok = true;
          r.src = "kind:" + j2.holdingsKind;
        } else r.issue = "no-holdings";
        if (j2.metrics && j2.metrics.marketSum == null) r.issue = (r.issue ? r.issue + "+" : "") + "no-metrics";
      } catch (e) {
        r.issue = "err:" + String(e.message || e).slice(0, 30);
      }
      return r;
    };
    let idx = 0;
    const workers = Array.from({ length: Math.min(CONC, slice.length) }, async () => {
      while (idx < slice.length) {
        const i = idx++;
        results[i] = await one(slice[i]);
      }
    });
    await Promise.all(workers);
    return new Response(
      JSON.stringify({ ok: true, total, from, count: slice.length, results }),
      { headers: { "content-type": "application/json", "cache-control": "s-maxage=600" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, total: 0, results: [], error: String(e).slice(0, 80) }),
      { headers: { "content-type": "application/json" } }
    );
  }
};

// netlify/functions/etflist.js
init_euckr();
function _mkDec3(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
var UA10 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
function decodeSmart4(buf, headerCT) {
  const dec = (enc) => {
    try {
      return _mkDec3(enc).decode(buf);
    } catch {
      return null;
    }
  };
  const score2 = (x) => {
    if (!x) return -1e9;
    const bad = (x.match(/\uFFFD/g) || []).length;
    const han = (x.match(/[가-힣]/g) || []).length;
    const broken = (x.match(/[\uD800-\uDFFF\u3130-\u318F]/g) || []).length;
    return han - bad * 5 - broken * 3;
  };
  let declared = "";
  const mH = /charset=([\w-]+)/i.exec(String(headerCT || ""));
  if (mH) declared = mH[1].toLowerCase();
  if (!declared) {
    const head = dec("latin1") || "";
    const mM = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head.slice(0, 2e3));
    if (mM) declared = mM[1].toLowerCase();
  }
  const norm2 = (c) => c === "ms949" || c === "cp949" || c === "ksc5601" ? "euc-kr" : c;
  const cands = [];
  if (declared) {
    const t = dec(norm2(declared));
    if (t) cands.push(t);
  }
  const u = dec("utf-8"), e = dec("euc-kr");
  if (u) cands.push(u);
  if (e) cands.push(e);
  return cands.sort((a, b) => score2(b) - score2(a))[0] || "";
}
var num4 = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
var TAB2 = { 1: "\uAD6D\uB0B4 \uC2DC\uC7A5\uC9C0\uC218", 2: "\uAD6D\uB0B4 \uC5C5\uC885\xB7\uD14C\uB9C8", 3: "\uAD6D\uB0B4 \uD30C\uC0DD", 4: "\uD574\uC678 \uC8FC\uC2DD", 5: "\uC6D0\uC790\uC7AC", 6: "\uCC44\uAD8C", 7: "\uAE30\uD0C0" };
var BRAND2 = ["KODEX", "TIGER", "SOL", "ACE", "RISE", "PLUS", "KBSTAR", "KOSEF", "ARIRANG", "HANARO", "TIMEFOLIO", "KIWOOM", "WOORI", "BNK", "\uD788\uC5B4\uB85C\uC988", "\uB9C8\uC774\uB2E4\uC2A4", "\uD30C\uC6CC", "FOCUS", "UNICORN"];
var brandOf = (name) => {
  const up = String(name || "").trim().toUpperCase();
  for (const b of BRAND2) if (up.startsWith(b.toUpperCase())) return b;
  return "\uAE30\uD0C0";
};
function leverageOf2(name) {
  const n = String(name || "");
  if (/인버스\s*2X|곱버스/.test(n)) return -2;
  if (/인버스/.test(n)) return -1;
  if (/레버리지|2X/i.test(n)) return 2;
  return 1;
}
var etflist_default = async (req2) => {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 7e3);
    let j = null;
    try {
      const r = await fetch(
        "https://finance.naver.com/api/sise/etfItemList.nhn?etfType=0&targetColumn=market_sum&sortOrder=desc",
        { headers: { "User-Agent": UA10, "Referer": "https://finance.naver.com/sise/etf.naver", "Accept": "application/json" }, signal: c.signal }
      );
      const buf = await r.arrayBuffer();
      j = JSON.parse(decodeSmart4(buf, r.headers.get("content-type")));
    } finally {
      clearTimeout(t);
    }
    const list = j && j.result && j.result.etfItemList || [];
    const items = list.map((x) => {
      const name = String(x.itemname || "");
      const price = num4(x.nowVal), nav = num4(x.nav);
      let disparity = price != null && nav ? (price - nav) / nav * 100 : null;
      if (disparity != null && Math.abs(disparity) > 5) disparity = null;
      return {
        code: String(x.itemcode || "").toUpperCase(),
        name,
        price,
        changeRate: num4(x.changeRate),
        nav,
        disparity,
        m3: num4(x.threeMonthEarnRate),
        volume: num4(x.quant),
        value: num4(x.amonut),
        // 거래대금(백만원)
        marketSum: num4(x.marketSum),
        // [v9.71] 시가총액(억원) — 화면 라벨과 일치
        tabCode: x.etfTabCode,
        tab: TAB2[x.etfTabCode] || "\uAE30\uD0C0",
        brand: brandOf(name),
        lev: leverageOf2(name)
      };
    }).filter((x) => /^[0-9A-Z]{6}$/.test(x.code) && x.name);
    return new Response(
      JSON.stringify({ ok: items.length > 0, n: items.length, items }),
      { headers: { "content-type": "application/json", "cache-control": "s-maxage=300" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, n: 0, items: [], error: String(e).slice(0, 80) }),
      { headers: { "content-type": "application/json" } }
    );
  }
};

// netlify/functions/etfprobe.js
init_euckr();
function _mkDec4(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
var UA11 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
function decodeSmart5(buf, ct) {
  const dec = (e2) => {
    try {
      return _mkDec4(e2).decode(buf);
    } catch {
      return null;
    }
  };
  const score2 = (x) => {
    if (!x) return -1e9;
    return (x.match(/[가-힣]/g) || []).length - (x.match(/\uFFFD/g) || []).length * 5;
  };
  let d = "";
  const m = /charset=([\w-]+)/i.exec(String(ct || ""));
  if (m) d = m[1].toLowerCase();
  const norm2 = (c2) => c2 === "ms949" || c2 === "cp949" ? "euc-kr" : c2;
  const c = [];
  if (d) {
    const t = dec(norm2(d));
    if (t) c.push(t);
  }
  const u = dec("utf-8"), e = dec("euc-kr");
  if (u) c.push(u);
  if (e) c.push(e);
  return c.sort((a, b) => score2(b) - score2(a))[0] || "";
}
async function probe(name, url, headers) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 3500);
  const out = { name, url: url.slice(0, 90) };
  try {
    const r = await fetch(url, { headers: Object.assign({ "User-Agent": UA11 }, headers || {}), signal: c.signal });
    out.status = r.status;
    const buf = await r.arrayBuffer();
    out.bytes = buf.byteLength;
    const txt = decodeSmart5(buf, r.headers.get("content-type"));
    out.hasKeyword = /구성종목|구성비중|CU당|holdings|componentList|itemPdf/i.test(txt) ? "Y" : "N";
    try {
      const j = JSON.parse(txt);
      const arrs = [];
      const walk = (n, d) => {
        if (!n || d > 4) return;
        if (Array.isArray(n)) {
          if (n.length && typeof n[0] === "object") arrs.push(n.length);
          return;
        }
        if (typeof n === "object") Object.values(n).forEach((v) => walk(v, d + 1));
      };
      walk(j, 0);
      out.json = "Y";
      out.arrays = arrs.slice(0, 5).join(",");
      out.keys = Object.keys(j).slice(0, 6).join(",");
    } catch {
      out.json = "N";
      const tables = (txt.match(/<table/gi) || []).length;
      out.tables = tables;
      const withW = txt.split(/<table[^>]*>/i).slice(1).filter((t2) => /구성비중|구성종목/.test(t2.slice(0, 400))).length;
      out.pdfTables = withW;
    }
  } catch (e) {
    out.err = String(e.message || e).slice(0, 40);
  } finally {
    clearTimeout(t);
  }
  return out;
}
var etfprobe_default = async (req2) => {
  const url = new URL(req2.url);
  const code = String(url.searchParams.get("code") || "069500").toUpperCase().replace(/[^0-9A-Z]/g, "");
  const nRef = { "Referer": `https://finance.naver.com/item/main.naver?code=${code}` };
  const cands = [
    ["naver-main", `https://finance.naver.com/item/main.naver?code=${code}`, { "Referer": "https://finance.naver.com/" }],
    ["naver-coinfo", `https://finance.naver.com/item/coinfo.naver?code=${code}`, nRef],
    ["pdfList.nhn", `https://finance.naver.com/api/sise/etfItemPdfList.nhn?etfCode=${code}`, nRef],
    ["etf_pdf", `https://finance.naver.com/item/etf_pdf.naver?code=${code}`, nRef],
    ["sise-etf-pdf", `https://finance.naver.com/sise/etf_pdf.naver?code=${code}`, nRef],
    ["api-fin-pdf", `https://api.finance.naver.com/service/etfItemPdf.nhn?etfCode=${code}`, nRef],
    ["m.stock-analysis", `https://m.stock.naver.com/api/stock/${code}/etfAnalysis`, { "Referer": `https://m.stock.naver.com/domestic/stock/${code}/total` }],
    ["m.stock-integration", `https://m.stock.naver.com/api/stock/${code}/integration`, { "Referer": `https://m.stock.naver.com/domestic/stock/${code}/total` }],
    ["yahoo-KS", `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${code}.KS?modules=topHoldings`, { "Referer": "https://finance.yahoo.com/" }]
  ];
  const results = await Promise.all(cands.map(([n, u, h]) => probe(n, u, h)));
  return new Response(
    JSON.stringify({ ok: true, code, results }, null, 1),
    { headers: cacheHdr(600, 1800) }
  );
};

// netlify/functions/exchange.js
init_nxt_core();
init_nxt_signal();
var UA12 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
async function jget5(url, ms = 4500) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA12, "Referer": "https://m.stock.naver.com/", "Accept": "application/json" }, signal: c.signal });
    const txt = await r.text();
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
var num5 = (x) => {
  const n = Number(String(x == null ? "" : x).replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : 0;
};
var K_PRICE = /^(closePrice|tradePrice|lastPrice|currentPrice|nowPrice|price|nv)(Raw)?$/i;
var K_CHG = /^(compareToPreviousClosePrice|changePrice|change|cv)(Raw)?$/i;
var K_RATE = /^(fluctuationsRatio|changeRate|rate|cr)(Raw)?$/i;
var K_EXP_P = /^(expectedPrice|expectedClosePrice|antcPrice)(Raw)?$/i;
var K_EXP_R = /^(expectedRatio|expectedFluctuationsRatio)(Raw)?$/i;
var EXPECTED_PATH = /expect|antc|예상/i;
var K_QTY = /^(accumulatedTradingVolume|expectedVolume|tradingVolume|volume|aq)(Raw)?$/i;
var K_PREV = /^(previousClose|prevClose|basePrice|standardPrice|pcv)(Raw)?$/i;
var MKT_NXT = /nxt|nextrade|넥스트|대체거래|ats/i;
var MKT_UNI = /통합|integrat|unified|\btotal\b/i;
var MKT_KRX = /krx|코스피|코스닥|유가증권|kospi|kosdaq|정규/i;
function mktOf(node, path) {
  let blob = path + " ";
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (v != null && typeof v !== "object") blob += k + "=" + String(v) + " ";
  }
  if (MKT_NXT.test(blob)) return "NXT";
  if (MKT_UNI.test(blob)) return "UNIFIED";
  if (MKT_KRX.test(blob)) return "KRX";
  return "";
}
function collect2(obj, path = "", depth = 0, acc = [], pmkt = "") {
  if (!obj || typeof obj !== "object" || depth > 6 || acc.length > 80) return acc;
  const arr = Array.isArray(obj) ? obj : [obj];
  for (const node of arr) {
    if (!node || typeof node !== "object") continue;
    let price = 0, chg = null, rate = null, qty = null, prev = null, exp = 0, expR = null;
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v == null || typeof v === "object") continue;
      if (!price && K_PRICE.test(k)) price = num5(v);
      if (chg === null && K_CHG.test(k)) chg = num5(v);
      if (rate === null && K_RATE.test(k)) rate = num5(v);
      if (qty === null && K_QTY.test(k)) qty = num5(v);
      if (prev === null && K_PREV.test(k)) prev = num5(v);
      if (!exp && K_EXP_P.test(k)) exp = num5(v);
      if (expR === null && K_EXP_R.test(k)) expR = num5(v);
    }
    const isExp = EXPECTED_PATH.test(path);
    const mkt = mktOf(node, path) || pmkt;
    if (exp > 0) acc.push({ path, mkt, price: exp, chg: null, rate: expR, qty, prev, expected: true });
    if (price > 0 && (chg !== null || rate !== null))
      acc.push({ path, mkt, price, chg, rate, qty, prev, expected: isExp });
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === "object") {
        const childMkt = MKT_NXT.test(k) ? "NXT" : MKT_UNI.test(k) ? "UNIFIED" : MKT_KRX.test(k) ? "KRX" : mkt;
        collect2(v, path ? path + "." + k : k, depth + 1, acc, childMkt);
      }
    }
  }
  return acc;
}
var norm = (n, base3) => {
  if (!n || !n.price) return null;
  const prev = base3 || n.prev || (n.chg != null ? n.price - n.chg : 0);
  let change = null, rate = null;
  if (prev > 0) {
    change = n.price - prev;
    rate = change / prev * 100;
  } else if (n.chg != null) {
    change = n.chg;
    rate = n.rate;
  }
  return {
    price: n.price,
    change: change == null ? 0 : Math.round(change),
    rate: rate == null ? 0 : Number(Number(rate).toFixed(2)),
    volume: n.qty == null ? null : n.qty,
    prevClose: prev || null,
    _path: n.path || ""
  };
};
var exchange_default = async (req2) => {
  const url = new URL(req2.url);
  const code = String(url.searchParams.get("code") || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  const session = String(url.searchParams.get("session") || "").toLowerCase();
  const wantProbe = url.searchParams.get("probe") === "1";
  if (!/^[0-9A-Z]{6}$/.test(code)) {
    return new Response(JSON.stringify({ ok: false, error: "bad code" }), { headers: { "content-type": "application/json" } });
  }
  if (wantProbe) {
    const cand = [
      `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`,
      `https://polling.finance.naver.com/api/realtime/domestic/stock/NXT:${code}`,
      `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}?market=NXT`,
      `https://m.stock.naver.com/api/stock/${code}/basic`,
      `https://api.stock.naver.com/stock/${code}/basic`,
      `https://api.stock.naver.com/stock/${code}/integration`,
      `https://m.stock.naver.com/api/stock/${code}/price?type=nxt`
    ];
    const probes = await Promise.all(cand.map(async (u) => {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 4e3);
        const r = await fetch(u, { headers: { "User-Agent": UA12, Referer: "https://m.stock.naver.com/", Accept: "application/json" }, signal: c.signal });
        const txt = await r.text();
        clearTimeout(t);
        return { url: u, status: r.status, len: txt.length, sample: txt.slice(0, 1400) };
      } catch (e) {
        return { url: u, error: String(e).slice(0, 80) };
      }
    }));
    return new Response(JSON.stringify({ ok: true, code, probes }, null, 1), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  try {
    const [poll, integ] = await Promise.all([
      jget5(`https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`),
      jget5(`https://m.stock.naver.com/api/stock/${code}/integration`)
    ]);
    const dirSign2 = (info) => {
      const c = info && info.compareToPreviousPrice && String(info.compareToPreviousPrice.code || "");
      if (c === "4" || c === "5") return -1;
      if (c === "3") return 0;
      return 1;
    };
    const firstNum2 = (o, keys) => {
      for (const k of keys) {
        if (o[k] != null) {
          const v = num5(o[k]);
          if (v) return v;
        }
      }
      return 0;
    };
    const marketFromInfo = (info, prevHint, tag) => {
      if (!info || typeof info !== "object") return null;
      const price = firstNum2(info, ["overPriceRaw", "overPrice", "closePriceRaw", "closePrice", "currentPriceRaw", "currentPrice", "tradePriceRaw", "tradePrice", "integratedPriceRaw", "integratedPrice", "priceRaw", "price", "nvRaw", "nv"]);
      if (!price) return null;
      const sign = dirSign2(info);
      const magChg = Math.abs(firstNum2(info, ["compareToPreviousClosePriceRaw", "compareToPreviousClosePrice", "cv"]));
      const magRate = Math.abs(firstNum2(info, ["fluctuationsRatioRaw", "fluctuationsRatio", "cr"]));
      const change = sign * magChg;
      const prev = prevHint || (magChg ? price - change : 0);
      const rate = magRate ? sign * magRate : prev ? (price - prev) / prev * 100 : 0;
      return {
        price,
        change: Math.round(change),
        rate: Number(rate.toFixed(2)),
        volume: firstNum2(info, ["accumulatedTradingVolumeRaw", "accumulatedTradingVolume", "aq"]) || null,
        prevClose: prev || null,
        _path: tag || "",
        _at: String(info.localTradedAt || ""),
        _status: String(info.overMarketStatus || info.marketStatus || "")
      };
    };
    const arr = poll && (poll.datas || poll.result && poll.result.areas && poll.result.areas.flatMap((a) => a.datas || []));
    const x = Array.isArray(arr) ? arr[0] : null;
    let krx = x ? marketFromInfo(x, 0, "krx") : null;
    let prevClose = krx ? krx.prevClose || 0 : 0;
    let nxt = x ? marketFromInfo(x.overMarketPriceInfo, prevClose, "nxt") : null;
    if (nxt && (!nxt.price || (nxt.volume === 0 || nxt.volume === null) && nxt.price === (krx && krx.price))) nxt = null;
    let unified = x ? marketFromInfo(x.integratedPriceInfo, prevClose, "integrated") : null;
    if (!unified) {
      if (krx && nxt) unified = nxt._at > krx._at ? { ...nxt } : { ...krx };
      else unified = krx ? { ...krx } : nxt ? { ...nxt } : null;
    }
    const nodes = integ ? collect2(integ) : [];
    const expNodes = nodes.filter((n) => n.expected);
    const expected = norm(expNodes.sort((a, b) => (b.qty || 0) - (a.qty || 0))[0], prevClose);
    const list = await resolveFast();
    const listReady = !!(list && list.ok && list.count > 0);
    let nxtSupported = listReady ? Object.prototype.hasOwnProperty.call(list.codes, code) : null;
    let nxtBasis = listReady ? "\uBA85\uB2E8 \uB300\uC870" : null;
    let sigDiag = null;
    if (nxtSupported === null) {
      try {
        const r = await classifyStock(code, await blobStore(), url.searchParams.get("diag") === "1");
        if (r && r.member !== null) {
          nxtSupported = r.member;
          nxtBasis = "\uAC70\uB798\uC18C \uC18C\uC18D \uC2E0\uD638";
        }
        if (url.searchParams.get("diag") === "1")
          sigDiag = {
            signalOk: !!(r.signal && r.signal.ok),
            why: r.reason || null,
            matched: r.matched || null,
            seen: r.exchangeFeatures || null,
            features: r.signal && r.signal.features ? r.signal.features : null
          };
      } catch (e) {
        sigDiag = { error: String(e).slice(0, 120) };
      }
    }
    const liveExec = !!(x && x.overMarketPriceInfo && num5(x.overMarketPriceInfo.overPriceRaw ?? x.overMarketPriceInfo.overPrice) > 0);
    if (nxtSupported === false && liveExec) {
      nxtSupported = true;
      nxtBasis = "NXT \uC2E4\uC81C \uCCB4\uACB0(\uBD84\uAE30 \uC911 \uD3B8\uC785)";
    }
    if (nxtSupported === false) {
      nxt = null;
      if (krx) unified = { ...krx, _path: "krx-only(list)" };
    }
    let \uAD00\uCE21 = false;
    if (nxt && nxt.price > 0 && /nxt|nextrade/i.test(nxt._path || "")) {
      \uAD00\uCE21 = true;
      noteObserved(code).catch(() => {
      });
    }
    const \uD655\uC815 = \uAD00\uCE21 ? true : nxtSupported;
    if (\uAD00\uCE21) nxtBasis = "NXT \uC2E4\uC81C \uCCB4\uACB0 \uAD00\uCE21";
    return new Response(JSON.stringify({
      ok: !!(krx || unified || nxt),
      code,
      prevClose: prevClose || unified && unified.prevClose || null,
      nxtSupported: \uD655\uC815,
      nxtEvidence: nxtBasis,
      nxtListAsOf: listReady ? list.asOf : null,
      nxtListSource: listReady ? list.source : null,
      _sigDiag: sigDiag,
      unified,
      krx,
      nxt,
      expected,
      _paths: nodes.slice(0, 12).map((n) => n.path + "=" + n.price),
      // 필드명이 바뀌었을 때 진단용
      _nodes: url.searchParams.get("diag") === "1" ? nodes.slice(0, 40).map((n) => ({ path: n.path, mkt: n.mkt || "", price: n.price, rate: n.rate, qty: n.qty, exp: n.expected })) : void 0
    }), { headers: cacheHdr(2, 300) });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, code, error: String(e).slice(0, 120) }), {
      headers: { "content-type": "application/json" }
    });
  }
};

// netlify/functions/friends.js
init_store();
var ENV3 = null;
var webcrypto3 = globalThis.crypto;
var json4 = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
var toHex3 = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha2563(s) {
  return toHex3(await webcrypto3.subtle.digest("SHA-256", new TextEncoder().encode(String(s))));
}
var derive3 = (salt, pass) => sha2563(salt + "|" + pass);
var clip2 = (s, n) => String(s || "").replace(/[<>]/g, "").trim().slice(0, n);
async function stores2() {
  const mod = await Promise.resolve().then(() => (init_blobs_shim(), blobs_shim_exports));
  return {
    acc: await getStoreX({ name: "live-accounts" }, ENV3),
    soc: await getStoreX({ name: "live-social" }, ENV3)
  };
}
async function verifyUser2(db, id, pass, legacy) {
  if (!id) return false;
  /* ══ [v9.75] 계정을 계정별 키(acc:<id>)에서도 찾는다 ═════════════════════
     계정이 옮겨진 뒤로는 db.accounts 가 비어 있을 수 있다. 여기만 고치면
     클랜·친구의 모든 호출부가 한 번에 새 구조를 따르게 된다.
     키는 소문자로 정규화돼 있으므로 대소문자 차이도 여기서 함께 흡수된다. */
  let acc = (db.accounts && (db.accounts[id] || db.accounts[String(id).trim().toLowerCase()])) || null;
  if (!acc) {
    try { acc = await accLoad(db.__st || null, id, db); } catch (e) { acc = null; }
  }
  if (!acc) return false;
  if (acc.salt && acc.hash) {
    if (pass && await derive3(acc.salt, pass) === acc.hash) return acc;
    if (legacy && await derive3(acc.salt, legacy) === acc.hash) return acc;
    return false;
  }
  if (acc.pass && (acc.pass === pass || acc.pass === legacy)) return acc;
  return false;
}
var blank = () => ({ friends: [], reqIn: [], reqOut: [], profile: {} });
var friends_default = async (req2) => {
  if (req2.method !== "POST") return json4({ ok: false, err: "method" });
  let b;
  try {
    b = await req2.json();
  } catch {
    return json4({ ok: false, err: "body" });
  }
  let st;
  try {
    st = await stores2();
  } catch {
    return json4({ ok: false, err: "nostore" });
  }
  const db = await readAccDb(st);          // [v7.5]
  let user = await verifyUser2(db, b.id, b.pass, b.legacy);
  /* ══ [v6.1] 친구만 계속 'auth' 로 막히던 이유 ═══════════════════════════════
     아이디 대소문자가 저장된 것과 조금이라도 다르면 계정을 찾지 못한다.
     클랜은 사용자가 여러 번 들어가며 우연히 맞는 키로 저장됐지만, 친구는
     한 번 막히면 계속 막혔다. 대소문자를 무시하고 한 번 더 찾아 준다.
     [진단] 왜 막혔는지 응답에 남긴다 — 계정이 없는 것과 비밀번호가 틀린 것은 다르다. */
  let uidKey = String(b.id || "");
  if (!user && uidKey) {
    const hit = Object.keys(db.accounts || {}).find((k) => k.toLowerCase() === uidKey.toLowerCase());
    if (hit && hit !== uidKey) {
      user = await verifyUser2(db, hit, b.pass, b.legacy);
      if (user) uidKey = hit;
    }
  }
  if (!user) {
    const known = !!(db.accounts && Object.keys(db.accounts).some((k) => k.toLowerCase() === uidKey.toLowerCase()));
    return json4({ ok: false, err: "auth", why: known ? "pass" : "nouser" });
  }
  const uid = uidKey;
  const uname = clip2(b.name || user.name || uid, 12);
  const load = async (id) => await st.soc.get("fr:" + id, { type: "json" }).catch(() => null) || blank();
  const save = (id, v) => st.soc.setJSON("fr:" + id, v);
  const me = await load(uid);
  /* ══ [v7.8] 프로필을 다시 만들면서 tr(거래 수)를 빠뜨리고 있었다 ═══════════
     그래서 매번 tr 이 undefined → 값이 들어가며 '달라졌다'로 판정돼
     저장이 계속 일어났다. 있던 값을 모두 그대로 물려받는다. */
  const _p0 = me.profile || {};
  me.profile = { ..._p0, name: uname,
    rate: _p0.rate ?? null, msg: _p0.msg || "", tr: _p0.tr || 0, ts: _p0.ts || 0 };
  const act = String(b.action || "");
  try {
    if (act === "sync" || act === "get") {
      if (act === "sync") {
        /* ══ [v7.8] KV 하루 쓰기 한도를 다 써 버리던 이유 ═══════════════════════
           친구 화면을 열 때마다 무조건 저장했다. 값이 하나도 안 바뀌었어도
           ts(마지막 갱신 시각)를 새로 넣어 '달라진 것'으로 만들었기 때문이다.
           무료 KV 는 하루 1,000회 쓰기가 한도라 금방 바닥나고,
           그때부터 클랜·친구·계정이 모두 멈춘다(첨부 사진의 오류다).
           → 수익률·소개글·거래수가 실제로 달라졌을 때만 저장한다.
             바뀐 게 없으면 5분에 한 번만 시각을 갱신한다. */
        const before = { r: me.profile.rate, m: me.profile.msg, t: me.profile.tr };
        if (b.rate != null && isFinite(+b.rate)) me.profile.rate = Math.max(-99, Math.min(999, Math.round(+b.rate * 100) / 100));
        if (b.msg !== void 0) me.profile.msg = clip2(b.msg, 30);
        if (b.tr != null && isFinite(+b.tr)) me.profile.tr = Math.max(0, Math.round(+b.tr));
        const changed = before.r !== me.profile.rate || before.m !== me.profile.msg || before.t !== me.profile.tr;
        const stale = Date.now() - (me.profile.ts || 0) > 300000;
        if (changed || stale) {
          me.profile.ts = Date.now();
          await save(uid, me);
        }
      }
      return json4({ ok: true, ...await view(st, uid, me) });
    }
    if (act === "add") {
      const t = clip2(b.target, 24);
      if (!t || t === uid) return json4({ ok: false, err: "self" });
      if (!(db.accounts && db.accounts[t])) return json4({ ok: false, err: "nouser" });
      if (me.friends.includes(t)) return json4({ ok: false, err: "already" });
      if (me.reqOut.includes(t)) return json4({ ok: false, err: "sent" });
      const other = await load(t);
      if (me.reqIn.includes(t)) {
        me.reqIn = me.reqIn.filter((x) => x !== t);
        other.reqOut = other.reqOut.filter((x) => x !== uid);
        me.friends.push(t);
        other.friends.push(uid);
      } else {
        if (other.reqIn.length >= 60) return json4({ ok: false, err: "full" });
        me.reqOut.push(t);
        other.reqIn.push(uid);
      }
      await save(uid, me);
      await save(t, other);
      return json4({ ok: true, ...await view(st, uid, me) });
    }
    if (act === "accept" || act === "reject") {
      const t = clip2(b.target, 24);
      if (!me.reqIn.includes(t)) return json4({ ok: false, err: "noreq" });
      const other = await load(t);
      me.reqIn = me.reqIn.filter((x) => x !== t);
      other.reqOut = other.reqOut.filter((x) => x !== uid);
      if (act === "accept") {
        if (!me.friends.includes(t)) me.friends.push(t);
        if (!other.friends.includes(uid)) other.friends.push(uid);
      }
      await save(uid, me);
      await save(t, other);
      return json4({ ok: true, ...await view(st, uid, me) });
    }
    if (act === "cancel") {
      const t = clip2(b.target, 24);
      const other = await load(t);
      me.reqOut = me.reqOut.filter((x) => x !== t);
      other.reqIn = other.reqIn.filter((x) => x !== uid);
      await save(uid, me);
      await save(t, other);
      return json4({ ok: true, ...await view(st, uid, me) });
    }
    if (act === "remove") {
      const t = clip2(b.target, 24);
      const other = await load(t);
      me.friends = me.friends.filter((x) => x !== t);
      other.friends = other.friends.filter((x) => x !== uid);
      await save(uid, me);
      await save(t, other);
      return json4({ ok: true, ...await view(st, uid, me) });
    }
    return json4({ ok: false, err: "action" });
  } catch (e) {
    return json4({ ok: false, err: "server", detail: String(e).slice(0, 80) });
  }
};
async function view(st, uid, me) {
  const get2 = async (id) => {
    const v = await st.soc.get("fr:" + id, { type: "json" }).catch(() => null) || blank();
    const p = v.profile || {};
    return { id, name: p.name || id, rate: p.rate ?? null, msg: p.msg || "", tr: p.tr || 0, ts: p.ts || 0 };
  };
  const friends = [];
  for (const id of me.friends.slice(0, 100)) friends.push(await get2(id));
  friends.sort((a, z) => (z.rate ?? -1e9) - (a.rate ?? -1e9));
  const reqIn = [];
  for (const id of me.reqIn.slice(0, 30)) reqIn.push(await get2(id));
  const reqOut = [];
  for (const id of me.reqOut.slice(0, 30)) reqOut.push(await get2(id));
  return { me: { id: uid, ...me.profile }, friends, reqIn, reqOut };
}

// netlify/functions/fundamentals.js
init_store();
init_euckr();
var ENV4 = null;
function _mkDec5(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
var UA13 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
var NV = { "User-Agent": UA13, "Referer": "https://m.stock.naver.com/", "Accept": "application/json" };
var settle = (p) => p.then((v) => ({ v })).catch((e) => ({ e: String(e && e.message || e) }));
var numish2 = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return isNaN(n) ? String(v) : n;
};
var pick2 = (o, keys) => {
  if (!o) return null;
  for (const k of keys) if (o[k] != null && o[k] !== "") return o[k];
  return null;
};
async function jget6(url, ms, headers = NV) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers, signal: c.signal });
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
function classifyNaver(title) {
  const t = title.replace(/\s/g, "");
  if (/(률|율|ROE|ROA|EPS|BPS|PER|PBR|PCR|PSR|EV|배당|DPS|비율|유보|주당|EBITDA|CAPEX|FCF)/i.test(t)) return "metrics";
  if (/(매출|영업이익|매출총이익|판매비|당기순이익|순이익|영업손익|세전|이익)/.test(t)) return "income";
  return "metrics";
}
async function naverFinance(code) {
  const d = await jget6(`https://m.stock.naver.com/api/stock/${code}/finance/annual`, 4500);
  const fi = d && (d.financeInfo || d);
  const titles = fi && (fi.trTitleList || fi.titleList);
  const rowList = fi && (fi.rowList || fi.rows);
  if (!Array.isArray(titles) || !Array.isArray(rowList)) throw new Error("naver-finance-shape");
  const periods = titles.map((t) => ({ key: t.key || t.title, title: String(t.title || t.key || "").replace(/\.$/, ""), forecast: t.isConsensus === "Y" }));
  const rows = rowList.map((r) => {
    const cols = r.columns || {};
    const values = {};
    for (const k of Object.keys(cols)) {
      const cell = cols[k];
      values[k] = cell && (cell.value != null ? cell.value : cell);
    }
    return { title: String(r.title || "").trim(), values };
  });
  return {
    income: { periods, rows: rows.filter((r) => classifyNaver(r.title) === "income") },
    metrics: { periods, rows: rows.filter((r) => classifyNaver(r.title) === "metrics") }
  };
}
var _yAuth = { at: 0, cookie: "", crumb: "" };
async function fetchTO(url, ms, headers) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { headers, signal: c.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}
async function yahooAuth3(force) {
  if (!force && _yAuth.crumb && Date.now() - _yAuth.at < 6 * 36e5) return _yAuth;
  let cookie = "";
  for (const u of ["https://fc.yahoo.com/", "https://finance.yahoo.com/"]) {
    try {
      const r = await fetchTO(u, 3e3, { "User-Agent": UA13, "Accept": "text/html,*/*" });
      const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""];
      const ck = sc.map((s) => String(s).split(";")[0]).filter(Boolean).join("; ");
      if (ck) {
        cookie = ck;
        break;
      }
    } catch {
    }
  }
  let crumb = "";
  for (const u of ["https://query2.finance.yahoo.com/v1/test/getcrumb", "https://query1.finance.yahoo.com/v1/test/getcrumb"]) {
    try {
      const r = await fetchTO(u, 3e3, { "User-Agent": UA13, "Cookie": cookie, "Accept": "text/plain" });
      const tx = (await r.text()).trim();
      if (tx && tx.length < 30 && !/[<{]/.test(tx)) {
        crumb = tx;
        break;
      }
    } catch {
    }
  }
  _yAuth = { at: Date.now(), cookie, crumb };
  return _yAuth;
}
var fmtEok = (raw) => {
  const n = Math.round(Number(raw) / 1e8);
  return n.toLocaleString("ko-KR");
};
async function yahooFinancials(code, auth) {
  const { cookie, crumb } = auth || await yahooAuth3();
  const types = ["annualTotalAssets", "annualTotalLiabilitiesNetMinorityInterest", "annualStockholdersEquity", "annualCommonStock", "annualOperatingCashFlow", "annualInvestingCashFlow", "annualFinancingCashFlow", "annualChangesInCash"];
  const p2 = Math.floor(Date.now() / 1e3), p1 = p2 - Math.floor(5.5 * 365 * 24 * 3600);
  let lastErr = "no-data";
  for (const sfx of ["KS", "KQ"]) {
    try {
      const sym = `${code}.${sfx}`;
      const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${sym}?symbol=${sym}&type=${types.join(",")}&period1=${p1}&period2=${p2}&merge=false${crumb ? "&crumb=" + encodeURIComponent(crumb) : ""}`;
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 5e3);
      let txt;
      try {
        const r = await fetch(url, { headers: { "User-Agent": UA13, "Cookie": cookie, "Accept": "application/json" }, signal: c.signal });
        txt = await r.text();
      } finally {
        clearTimeout(t);
      }
      let j;
      try {
        j = JSON.parse(txt);
      } catch {
        lastErr = "non-json:" + txt.slice(0, 30);
        continue;
      }
      const result = j && j.timeseries && j.timeseries.result;
      if (!result || !result.length) {
        const e = j && j.timeseries && j.timeseries.error;
        lastErr = e ? "err:" + (e.description || e.code) : "empty";
        continue;
      }
      const byType = {};
      for (const r of result) {
        const ty = r.meta && r.meta.type && r.meta.type[0];
        if (ty && r[ty]) byType[ty] = r[ty];
      }
      const dates = /* @__PURE__ */ new Set();
      Object.values(byType).forEach((arr) => arr.forEach((x) => {
        if (x && x.asOfDate) dates.add(x.asOfDate);
      }));
      const periods = [...dates].sort().map((d) => ({ key: d, title: d.slice(0, 7).replace("-", "/"), forecast: false }));
      if (!periods.length) {
        lastErr = "no-dates";
        continue;
      }
      const valOf = (ty, date) => {
        const arr = byType[ty] || [];
        const hit = arr.find((x) => x && x.asOfDate === date);
        return hit && hit.reportedValue && hit.reportedValue.raw != null ? hit.reportedValue.raw : null;
      };
      const mkRows = (defs) => defs.map(([name, ty]) => ({ title: name, values: Object.fromEntries(periods.map((p) => [p.key, valOf(ty, p.key) != null ? fmtEok(valOf(ty, p.key)) : ""])) })).filter((r) => Object.values(r.values).some((v) => v !== ""));
      const balRows = mkRows([["\uC790\uC0B0\uCD1D\uACC4", "annualTotalAssets"], ["\uBD80\uCC44\uCD1D\uACC4", "annualTotalLiabilitiesNetMinorityInterest"], ["\uC790\uBCF8\uCD1D\uACC4", "annualStockholdersEquity"], ["\uC790\uBCF8\uAE08", "annualCommonStock"]]);
      const cfRows = mkRows([["\uC601\uC5C5\uD65C\uB3D9\uD604\uAE08\uD750\uB984", "annualOperatingCashFlow"], ["\uD22C\uC790\uD65C\uB3D9\uD604\uAE08\uD750\uB984", "annualInvestingCashFlow"], ["\uC7AC\uBB34\uD65C\uB3D9\uD604\uAE08\uD750\uB984", "annualFinancingCashFlow"], ["\uD604\uAE08\uC758 \uC99D\uAC00", "annualChangesInCash"]]);
      if (balRows.length || cfRows.length) return { balance: balRows.length ? { periods, rows: balRows } : null, cashflow: cfRows.length ? { periods, rows: cfRows } : null, err: null };
      lastErr = "rows-empty";
    } catch (e) {
      lastErr = "ex:" + String(e && e.message || e).slice(0, 40);
    }
  }
  return { balance: null, cashflow: null, err: lastErr };
}
async function yahooRecommend(code, auth) {
  let { cookie, crumb } = auth || await yahooAuth3();
  let lastErr = "no-data", retried = false;
  const hosts = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"];
  for (let hi = 0; hi < hosts.length; hi++) {
    for (const sfx of ["KS", "KQ"]) {
      try {
        const sym = `${code}.${sfx}`;
        const url = `https://${hosts[hi]}/v10/finance/quoteSummary/${sym}?modules=financialData${crumb ? "&crumb=" + encodeURIComponent(crumb) : ""}`;
        let txt;
        try {
          const r = await fetchTO(url, 4e3, { "User-Agent": UA13, "Cookie": cookie, "Accept": "application/json" });
          txt = await r.text();
        } catch {
          lastErr = "timeout";
          continue;
        }
        let j;
        try {
          j = JSON.parse(txt);
        } catch {
          lastErr = "non-json";
          continue;
        }
        const err = j && (j.quoteSummary && j.quoteSummary.error || j.finance && j.finance.error);
        if (err && /crumb|unauthoriz/i.test(String(err.description || err.code || "")) && !retried) {
          retried = true;
          ({ cookie, crumb } = await yahooAuth3(true));
          hi = -1;
          break;
        }
        const res = j && j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
        if (!res || !res.financialData) {
          lastErr = err ? "err:" + (err.description || err.code) : "no-fd";
          continue;
        }
        const fd = res.financialData;
        const g = (x) => x && x.raw != null ? x.raw : null;
        const out = { recMean: g(fd.recommendationMean), recKey: fd.recommendationKey || null, targetMean: g(fd.targetMeanPrice), targetHigh: g(fd.targetHighPrice), targetLow: g(fd.targetLowPrice), numAnalysts: g(fd.numberOfAnalystOpinions), current: g(fd.currentPrice) };
        if (out.recMean != null || out.targetMean != null) return { ...out, err: null };
        lastErr = "empty-fd";
      } catch (e) {
        lastErr = "ex";
      }
    }
  }
  return { err: lastErr };
}
async function naverResearch(code) {
  const urls = [
    `https://m.stock.naver.com/api/research/stock/${code}?pageSize=30&page=1`,
    `https://api.stock.naver.com/research/stock/${code}?pageSize=30&page=1`
  ];
  for (const u of urls) {
    try {
      const j = await jget6(u, 4e3);
      if (!j) continue;
      const found = [];
      const walk = (o, d) => {
        if (!o || d > 4) return;
        if (Array.isArray(o)) {
          if (o.length && typeof o[0] === "object" && o[0]) {
            const ks = Object.keys(o[0]).join(",");
            if (/tit|title|subject/i.test(ks) && /bnm|broker|office|securities|corp|writer/i.test(ks)) found.push(o);
          }
          o.forEach((v) => walk(v, d + 1));
          return;
        }
        if (typeof o === "object") Object.values(o).forEach((v) => walk(v, d + 1));
      };
      walk(j, 0);
      const arr = found.sort((a, b) => b.length - a.length)[0];
      if (!arr) continue;
      const rows = arr.map((r) => {
        const title = pick2(r, ["tit", "title", "reportTitle", "subject"]) || "";
        const target = numish2(pick2(r, ["targetPrice", "goalPrice", "objectStockPrice", "target"])) || targetFromTitle(title);
        return {
          broker: pick2(r, ["bnm", "officeName", "brokerName", "securitiesName", "corpName", "writer"]) || "",
          target: typeof target === "number" ? target : null,
          opinion: pick2(r, ["opinion", "investmentOpinion", "grade"]) || opinionFromTitle(title),
          date: pick2(r, ["wdt", "date", "writeDate", "regDate", "researchDate"]) || "",
          title
        };
      }).filter((r) => r.broker || r.title).slice(0, 30);
      if (rows.length) return rows;
    } catch {
    }
  }
  return [];
}
function computeEstimate({ price, h52, l52, stats }) {
  const sv = (labels) => {
    for (const s of stats || []) {
      const lb = String(s.label || "").replace(/\s/g, "");
      if (labels.some((k) => lb.includes(k))) {
        const n = Number(String(s.value).replace(/[^0-9.-]/g, ""));
        if (isFinite(n) && n !== 0) return n;
      }
    }
    return null;
  };
  const eps = sv(["EPS"]), bps = sv(["BPS"]), per = sv(["PER"]);
  const cands = [];
  if (eps != null && eps > 0) {
    const mult = per != null && per > 0 ? Math.min(Math.max(per, 7), 20) : 11;
    cands.push(eps * mult);
  }
  if (bps != null && bps > 0) cands.push(bps * 1.1);
  if (h52 && l52 && h52 > l52) cands.push(l52 + (h52 - l52) * 0.6);
  if (price > 0) cands.push(price * 1.08);
  const ok2 = cands.filter((v) => price > 0 ? v >= price * 0.45 && v <= price * 2.4 : v > 0);
  if (!ok2.length || !(price > 0)) return null;
  ok2.sort((a, b) => a - b);
  const mid = ok2.length % 2 ? ok2[(ok2.length - 1) / 2] : (ok2[ok2.length / 2 - 1] + ok2[ok2.length / 2]) / 2;
  const round = (v) => {
    const st = v >= 1e5 ? 500 : v >= 1e4 ? 100 : v >= 1e3 ? 10 : 1;
    return Math.round(v / st) * st;
  };
  return {
    target: round(mid),
    high: round(mid * 1.12),
    low: round(mid * 0.88),
    basis: [eps > 0 ? "EPS" : null, bps > 0 ? "BPS" : null, h52 && l52 ? "52\uC8FC \uBC94\uC704" : null, "\uC8FC\uAC00 \uCD94\uC138"].filter(Boolean).join("\xB7")
  };
}
async function naverIntegration(code) {
  return await jget6(`https://m.stock.naver.com/api/stock/${code}/integration`, 4e3);
}
function normStats(integ) {
  const src = integ && (integ.totalInfos || integ.stockItemTotalInfos || []);
  const out = [];
  if (Array.isArray(src)) src.forEach((it) => {
    const label = it.key || it.name;
    const value = it.value;
    if (label && value != null && value !== "") out.push({ code: it.code || "", label, value });
  });
  return out;
}
function normConsensus(integ) {
  const c = integ && (integ.consensusInfo || integ.consensus);
  if (!c) return null;
  return { targetPrice: pick2(c, ["priceTarget", "targetPrice", "consensusTargetPrice", "target"]), opinion: pick2(c, ["opinion", "investmentOpinion", "consensusOpinion"]), per: pick2(c, ["per", "cnsPer"]), eps: pick2(c, ["eps", "cnsEps"]) };
}
function targetFromTitle(t) {
  if (!t) return null;
  if (/목표|TP/i.test(t)) {
    const arrow = t.match(/([0-9][0-9,]{3,})\s*(?:→|~|->)\s*([0-9][0-9,]{3,})/);
    if (arrow) {
      const n2 = Number(arrow[2].replace(/,/g, ""));
      if (n2 >= 1e3 && n2 <= 3e6) return n2;
    }
  }
  let m = t.match(/(?:목표\s*주?가|목표가|TP|목표)[^0-9]{0,8}([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7})/i);
  if (!m) return null;
  const n = Number(String(m[1]).replace(/,/g, ""));
  return n >= 1e3 && n <= 3e6 ? n : null;
}
function opinionFromTitle(t) {
  if (!t) return "";
  const m = t.match(/(강력매수|매수|매도|중립|보유|비중확대|비중축소|BUY|HOLD|SELL|Outperform|Overweight)/i);
  return m ? m[1] : "";
}
function brokersDiag(integ) {
  const arr = integ && (integ.researches || integ.researchInfos || integ.reportList || integ.researchList || integ.reports);
  if (!Array.isArray(arr) || !arr.length) return integ ? "none:" + Object.keys(integ).slice(0, 15).join(",") : "no-integ";
  return "n=" + arr.length + ";keys:" + Object.keys(arr[0]).slice(0, 12).join(",");
}
function normBrokers(integ) {
  const arr = integ && (integ.researches || integ.researchInfos || integ.reportList || integ.researchList || integ.reports);
  if (!Array.isArray(arr) || !arr.length) return [];
  return arr.map((r) => {
    const title = pick2(r, ["tit", "title", "reportTitle", "subject"]) || "";
    const target = numish2(pick2(r, ["targetPrice", "goalPrice", "objectStockPrice", "target"])) || targetFromTitle(title);
    return {
      broker: pick2(r, ["bnm", "officeName", "brokerName", "securitiesName", "writer", "corpName"]) || "",
      target: typeof target === "number" ? target : null,
      opinion: pick2(r, ["opinion", "investmentOpinion", "grade"]) || opinionFromTitle(title),
      date: pick2(r, ["wdt", "date", "writeDate", "regDate"]) || "",
      title
    };
  }).filter((r) => r.broker).slice(0, 30);
}
function decodeSmart6(buf, contentType) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const head = _mkDec5("latin1").decode(bytes.slice(0, 1500));
  let declared = ((String(contentType || "").match(/charset=["']?([\w-]+)/i) || head.match(/charset=["']?([\w-]+)/i) || [])[1] || "").toLowerCase();
  const tryDec = (enc, fatal) => {
    try {
      return _mkDec5(enc, { fatal }).decode(bytes);
    } catch {
      return null;
    }
  };
  return tryDec("utf-8", true) || (declared && declared !== "utf-8" && declared !== "utf8" ? tryDec(declared, true) : null) || tryDec("euc-kr", true) || tryDec("utf-8", false);
}
async function naverMainHtml(code) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 5500);
  try {
    const r = await fetch(
      `https://finance.naver.com/item/main.naver?code=${code}`,
      { headers: { "User-Agent": UA13, Accept: "text/html,*/*", "Accept-Language": "ko" }, signal: c.signal }
    );
    if (!r.ok) return null;
    return decodeSmart6(await r.arrayBuffer(), r.headers.get("content-type"));
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
var stripHtml = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
function parseOverview(html) {
  if (!html) return null;
  const i = String(html).indexOf("summary_info");
  if (i < 0) return null;
  const win = String(html).slice(i, i + 6e3);
  const ps = [...win.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((x) => stripHtml(x[1])).filter((x) => x.length >= 10 && /[가-힣]/.test(x) && !/\uFFFD/.test(x));
  return ps.length ? ps.slice(0, 6) : null;
}
function parse52w(html) {
  if (!html) return null;
  const i = String(html).indexOf("52\uC8FC\uCD5C\uACE0");
  if (i < 0) return null;
  const win = String(html).slice(i, i + 400);
  const nums = [...win.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,8})/g)].map((m) => Number(m[1].replace(/,/g, ""))).filter((v) => v >= 50 && v < 1e8);
  if (nums.length < 2) return null;
  const h = Math.max(nums[0], nums[1]), l = Math.min(nums[0], nums[1]);
  return h > l ? { h52: h, l52: l } : null;
}
function parseGoal(html) {
  if (!html) return null;
  const seg = String(html).match(/투자의견[\s\S]{0,400}?목표주가[\s\S]{0,700}?<\/tr>/) || String(html).match(/목표주가[\s\S]{0,700}?<\/tr>/);
  if (!seg) return null;
  const ems = [...seg[0].matchAll(/<em[^>]*>([\s\S]*?)<\/em>/g)].map((x) => stripHtml(x[1]));
  let opinion = null, target = null, score2 = null;
  for (const e of ems) {
    const op = e.match(/([0-9.]+)\s*(강력매수|매수|중립|보유|매도)/);
    if (op && !opinion) {
      opinion = `${op[2]} ${op[1]}`;
      const n = Number(op[1]);
      if (isFinite(n) && n >= 1 && n <= 5) score2 = n;
    }
    if (target == null) {
      const digits = e.replace(/,/g, "");
      if (/^[0-9]{3,7}$/.test(digits)) target = Number(digits);
    }
  }
  if (target == null) {
    const n2 = seg[0].match(/([0-9]{1,3}(?:,[0-9]{3})+)/);
    if (n2) {
      const n = Number(n2[1].replace(/,/g, ""));
      if (n >= 500 && n <= 3e6) target = n;
    }
  }
  return target != null || opinion ? { target: target != null ? target : null, opinion, score: score2 } : null;
}
async function ovStore() {
  try {
    return await getStoreX({ name: "company-overview" }, ENV4);
  } catch {
    return null;
  }
}
async function fetchTxt(url, ms, extra) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 6e3);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA13, Accept: "text/html,application/json,*/*", "Accept-Language": "ko", ...extra || {} }, signal: c.signal });
    if (!r.ok) return { err: String(r.status) };
    return { txt: decodeSmart6(await r.arrayBuffer(), r.headers.get("content-type")) };
  } catch (e) {
    return { err: String(e).slice(0, 24) };
  } finally {
    clearTimeout(t);
  }
}
function paraFrom(html, marker, win) {
  const i = String(html || "").indexOf(marker);
  if (i < 0) return null;
  const w = String(html).slice(i, i + (win || 8e3));
  let ps = [...w.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((x) => stripHtml(x[1]));
  if (!ps.length) ps = [...w.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((x) => stripHtml(x[1]));
  ps = ps.filter((x) => x.length >= 12 && /[가-힣]/.test(x) && !/\uFFFD/.test(x));
  return ps.length ? ps.slice(0, 6) : null;
}
function deepKoreanStrings(v, out, depth) {
  if (!v || depth > 6 || out.length > 40) return out;
  if (typeof v === "string") {
    if (v.length >= 40 && /[가-힣]/.test(v) && /사업|영위|생산|제조|서비스|판매|설립/.test(v)) out.push(v);
    return out;
  }
  if (Array.isArray(v)) {
    v.forEach((x) => deepKoreanStrings(x, out, depth + 1));
    return out;
  }
  if (typeof v === "object") {
    Object.values(v).forEach((x) => deepKoreanStrings(x, out, depth + 1));
    return out;
  }
  return out;
}
async function overviewAlt(code, diag) {
  const a = await fetchTxt(`https://comp.fnguide.com/SVO2/ASP/SVD_Main.asp?pGB=1&gicode=A${code}&cID=&MenuYn=Y&ReportGB=&NewMenuID=101&stkGb=701`, 6500, { Referer: "https://comp.fnguide.com/" });
  if (a.txt) {
    const ps = paraFrom(a.txt, "bizSummary", 9e3) || paraFrom(a.txt, "\uAE30\uC5C5\uAC1C\uC694", 6e3);
    diag.push("fnguide:" + (ps ? "ok" + ps.length : "nomark"));
    if (ps) return ps;
  } else diag.push("fnguide:" + a.err);
  const b = await fetchTxt(`https://navercomp.wisereport.co.kr/v1/company/c1010001.aspx?cmp_cd=${code}`, 6500, { Referer: "https://finance.naver.com/" });
  if (b.txt) {
    const ps = paraFrom(b.txt, "\uAE30\uC5C5\uAC1C\uC694", 9e3) || paraFrom(b.txt, "cmp_comment", 8e3);
    diag.push("wise:" + (ps ? "ok" + ps.length : "nomark"));
    if (ps) return ps;
  } else diag.push("wise:" + b.err);
  const c = await fetchTxt(`https://m.stock.naver.com/api/stock/${code}/integration`, 5e3, { Referer: "https://m.stock.naver.com/" });
  if (c.txt) {
    try {
      const hits = deepKoreanStrings(JSON.parse(c.txt), [], 0);
      if (hits.length) {
        const best = hits.sort((x, y) => y.length - x.length)[0];
        const ps = best.split(/(?<=\.)\s+/).map((x) => x.trim()).filter((x) => x.length >= 12).slice(0, 6);
        diag.push("mstock:ok" + ps.length);
        if (ps.length) return ps;
      } else diag.push("mstock:nohit");
    } catch (e) {
      diag.push("mstock:parse");
    }
  } else diag.push("mstock:" + c.err);
  return null;
}
async function getOverviewGoal(code, probe2) {
  const store = await ovStore();
  if (store && !probe2) {
    try {
      const c = await store.get("ov2:" + code, { type: "json" });
      if (c && Date.now() - (c.at || 0) < 24 * 3600 * 1e3) return c;
    } catch {
    }
  }
  const html = await naverMainHtml(code);
  let overview = parseOverview(html);
  const ovDiag = [overview ? "naver:ok" + overview.length : "naver:none"];
  if (!overview) {
    const alt = await overviewAlt(code, ovDiag);
    if (alt && alt.length) overview = alt;
  }
  const goal = parseGoal(html);
  const w52 = parse52w(html);
  const rec = { overview, goal, w52, at: Date.now() };
  rec.ovDiag = ovDiag;
  if (probe2) rec._probe = { htmlLen: html ? html.length : 0, hasSummaryDiv: !!(html && /class="summary_info"/.test(html)), hasGoalWord: !!(html && /목표주가/.test(html)), overviewN: overview ? overview.length : 0, goal };
  if (store && (overview || goal)) {
    try {
      await store.setJSON("ov2:" + code, { overview, goal, w52, at: rec.at });
    } catch {
    }
  }
  return rec;
}
var fundamentals_default = async (req2) => {
  const url = new URL(req2.url);
  const code = String(url.searchParams.get("code") || "005930").replace(/[^0-9A-Za-z]/g, "");
  const probe2 = url.searchParams.get("probe") === "1";
  const auth = await yahooAuth3();
  const [nv, yh, yr, ig, og, rs] = await Promise.all([settle(naverFinance(code)), settle(yahooFinancials(code, auth)), settle(yahooRecommend(code, auth)), settle(naverIntegration(code)), settle(getOverviewGoal(code, probe2)), settle(naverResearch(code))]);
  const nvFin = nv.v || {};
  const yhFin = yh.v || {};
  const rec = yr.v || {};
  const finance = { income: nvFin.income || null, metrics: nvFin.metrics || null, balance: yhFin.balance || null, cashflow: yhFin.cashflow || null };
  const integ = ig.v || null;
  const nc = normConsensus(integ);
  const ov = og.v || {};
  const brokerSeen = /* @__PURE__ */ new Set();
  const brokers = [...normBrokers(integ), ...rs.v && Array.isArray(rs.v) ? rs.v : []].filter((b) => {
    const k = (b.broker || "") + "|" + String(b.date || "").slice(0, 10) + "|" + (b.target || "");
    if (brokerSeen.has(k)) return false;
    brokerSeen.add(k);
    return true;
  }).slice(0, 30);
  const consensus = { recMean: rec.recMean != null ? rec.recMean : null, recKey: rec.recKey || null, targetMean: rec.targetMean != null ? rec.targetMean : nc && typeof nc.targetPrice === "number" ? nc.targetPrice : null, targetHigh: rec.targetHigh != null ? rec.targetHigh : null, targetLow: rec.targetLow != null ? rec.targetLow : null, numAnalysts: rec.numAnalysts != null ? rec.numAnalysts : null, naverOpinion: nc && nc.opinion || null, naverTarget: nc && nc.targetPrice || null, brokers };
  if (consensus.targetMean != null) consensus.targetSource = rec.targetMean != null ? "\uC57C\uD6C4 \uD30C\uC774\uB0B8\uC2A4" : "\uB124\uC774\uBC84 \uD1B5\uD569";
  if (consensus.targetMean == null && ov.goal && typeof ov.goal.target === "number") {
    consensus.targetMean = ov.goal.target;
    consensus.targetSource = "\uB124\uC774\uBC84 \uD22C\uC790\uC815\uBCF4";
    if (!consensus.naverOpinion && ov.goal.opinion) consensus.naverOpinion = ov.goal.opinion;
  }
  if (consensus.targetMean == null) {
    const withT = brokers.filter((b) => b.target);
    if (withT.length) {
      consensus.targetMean = Math.round(withT.reduce((s, b) => s + b.target, 0) / withT.length);
      consensus.targetSource = "\uB124\uC774\uBC84 \uB9AC\uC11C\uCE58";
    }
  }
  if (ov.goal && ov.goal.score != null) consensus.naverScore = ov.goal.score;
  {
    const statsArr = normStats(integ);
    const statNum = (keys) => {
      for (const s of statsArr) {
        const lb = String(s.label || "").replace(/\s/g, "");
        if (keys.some((k) => lb.includes(k))) {
          const n = Number(String(s.value).replace(/[^0-9.-]/g, ""));
          if (isFinite(n) && n > 0) return n;
        }
      }
      return null;
    };
    const h52v = ov.w52 && ov.w52.h52 || null, l52v = ov.w52 && ov.w52.l52 || null;
    const basePrice = (rec.current != null && rec.current > 0 ? rec.current : null) || statNum(["\uD604\uC7AC\uAC00", "\uC804\uC77C", "\uC885\uAC00"]) || (h52v && l52v ? (h52v + l52v) / 2 : null);
    const est = basePrice ? computeEstimate({ price: basePrice, h52: h52v, l52: l52v, stats: statsArr }) : null;
    if (est) consensus.estimate = est;
  }
  const body = {
    ok: true,
    code,
    finance,
    consensus,
    overview: ov.overview || null,
    ovDiag: ov.ovDiag || null,
    h52: ov.w52 && ov.w52.h52 || null,
    l52: ov.w52 && ov.w52.l52 || null,
    goalNaver: ov.goal || null,
    stats: normStats(integ),
    _diag: { nvErr: nv.e || null, yhErr: yh.e || (yhFin.err || null), recErr: yr.e || (rec.err || null), igErr: ig.e || null, ovErr: og.e || null, ovProbe: probe2 ? ov._probe || null : void 0, brokers: brokersDiag(integ) }
  };
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": probe2 ? "no-store" : "s-maxage=300" } });
};

// netlify/functions/fx.js
var UA14 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
var num6 = (v) => {
  const n = Number(String(v == null ? "" : v).replace(/[^0-9.eE+-]/g, ""));
  return isFinite(n) ? n : null;
};
async function jget7(url, ms, headers) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA14, Accept: "application/json", ...headers || {} }, signal: c.signal });
    const txt = await r.text();
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
var META = [
  ["USD", "\u{1F1FA}\u{1F1F8}", "\uBBF8\uAD6D \uB2EC\uB7EC"],
  ["JPY", "\u{1F1EF}\u{1F1F5}", "\uC77C\uBCF8 \uC5D4"],
  ["EUR", "\u{1F1EA}\u{1F1FA}", "\uC720\uB85C"],
  ["CNY", "\u{1F1E8}\u{1F1F3}", "\uC911\uAD6D \uC704\uC548"],
  ["GBP", "\u{1F1EC}\u{1F1E7}", "\uC601\uAD6D \uD30C\uC6B4\uB4DC"],
  ["CHF", "\u{1F1E8}\u{1F1ED}", "\uC2A4\uC704\uC2A4 \uD504\uB791"],
  ["CAD", "\u{1F1E8}\u{1F1E6}", "\uCE90\uB098\uB2E4 \uB2EC\uB7EC"],
  ["AUD", "\u{1F1E6}\u{1F1FA}", "\uD638\uC8FC \uB2EC\uB7EC"],
  ["NZD", "\u{1F1F3}\u{1F1FF}", "\uB274\uC9C8\uB79C\uB4DC \uB2EC\uB7EC"],
  ["HKD", "\u{1F1ED}\u{1F1F0}", "\uD64D\uCF69 \uB2EC\uB7EC"],
  ["TWD", "\u{1F1F9}\u{1F1FC}", "\uB300\uB9CC \uB2EC\uB7EC"],
  ["SGD", "\u{1F1F8}\u{1F1EC}", "\uC2F1\uAC00\uD3EC\uB974 \uB2EC\uB7EC"],
  ["THB", "\u{1F1F9}\u{1F1ED}", "\uD0DC\uAD6D \uBC14\uD2B8"],
  ["VND", "\u{1F1FB}\u{1F1F3}", "\uBCA0\uD2B8\uB0A8 \uB3D9"],
  ["IDR", "\u{1F1EE}\u{1F1E9}", "\uC778\uB3C4\uB124\uC2DC\uC544 \uB8E8\uD53C\uC544"],
  ["INR", "\u{1F1EE}\u{1F1F3}", "\uC778\uB3C4 \uB8E8\uD53C"],
  ["PHP", "\u{1F1F5}\u{1F1ED}", "\uD544\uB9AC\uD540 \uD398\uC18C"],
  ["MYR", "\u{1F1F2}\u{1F1FE}", "\uB9D0\uB808\uC774\uC2DC\uC544 \uB9C1\uAE43"],
  ["AED", "\u{1F1E6}\u{1F1EA}", "UAE \uB514\uB974\uD568"],
  ["SAR", "\u{1F1F8}\u{1F1E6}", "\uC0AC\uC6B0\uB514 \uB9AC\uC584"],
  ["KWD", "\u{1F1F0}\u{1F1FC}", "\uCFE0\uC6E8\uC774\uD2B8 \uB514\uB098\uB974"],
  ["BHD", "\u{1F1E7}\u{1F1ED}", "\uBC14\uB808\uC778 \uB514\uB098\uB974"],
  ["RUB", "\u{1F1F7}\u{1F1FA}", "\uB7EC\uC2DC\uC544 \uB8E8\uBE14"],
  ["BRL", "\u{1F1E7}\u{1F1F7}", "\uBE0C\uB77C\uC9C8 \uD5E4\uC54C"],
  ["MXN", "\u{1F1F2}\u{1F1FD}", "\uBA55\uC2DC\uCF54 \uD398\uC18C"],
  ["TRY", "\u{1F1F9}\u{1F1F7}", "\uD280\uB974\uD0A4\uC608 \uB9AC\uB77C"],
  ["ZAR", "\u{1F1FF}\u{1F1E6}", "\uB0A8\uC544\uACF5 \uB79C\uB4DC"],
  ["EGP", "\u{1F1EA}\u{1F1EC}", "\uC774\uC9D1\uD2B8 \uD30C\uC6B4\uB4DC"],
  ["SEK", "\u{1F1F8}\u{1F1EA}", "\uC2A4\uC6E8\uB374 \uD06C\uB85C\uB098"],
  ["NOK", "\u{1F1F3}\u{1F1F4}", "\uB178\uB974\uC6E8\uC774 \uD06C\uB85C\uB124"],
  ["DKK", "\u{1F1E9}\u{1F1F0}", "\uB374\uB9C8\uD06C \uD06C\uB85C\uB124"],
  ["PLN", "\u{1F1F5}\u{1F1F1}", "\uD3F4\uB780\uB4DC \uC988\uC6CC\uD2F0"],
  ["CZK", "\u{1F1E8}\u{1F1FF}", "\uCCB4\uCF54 \uCF54\uB8E8\uB098"],
  ["HUF", "\u{1F1ED}\u{1F1FA}", "\uD5DD\uAC00\uB9AC \uD3EC\uB9B0\uD2B8"]
];
var ORDER = Object.fromEntries(META.map(([c], i) => [c, i]));
var KNAME = Object.fromEntries(META.map(([c, , n]) => [c, n]));
var NON_COUNTRY = { EUR: "\u{1F1EA}\u{1F1FA}", XAU: "\u{1FA99}", XAG: "\u{1FA99}", XPT: "\u{1FA99}", XPD: "\u{1FA99}", XDR: "\u{1F310}", ANG: "\u{1F1F3}\u{1F1F1}", XOF: "\u{1F30D}", XAF: "\u{1F30D}", XPF: "\u{1F30F}" };
function flagOf(cur) {
  const meta = META.find(([c]) => c === cur);
  if (meta) return meta[1];
  if (NON_COUNTRY[cur]) return NON_COUNTRY[cur];
  const cc = String(cur).slice(0, 2);
  if (!/^[A-Z]{2}$/.test(cc)) return "\u{1F310}";
  return String.fromCodePoint(127462 + cc.charCodeAt(0) - 65, 127462 + cc.charCodeAt(1) - 65);
}
Object.assign(KNAME, {
  JOD: "\uC694\uB974\uB2E8 \uB514\uB098\uB974",
  KZT: "\uCE74\uC790\uD750\uC2A4\uD0C4 \uD161\uAC8C",
  MNT: "\uBABD\uACE8 \uD22C\uADF8\uB9AC\uD06C",
  PKR: "\uD30C\uD0A4\uC2A4\uD0C4 \uB8E8\uD53C",
  QAR: "\uCE74\uD0C0\uB974 \uB9AC\uC584",
  OMR: "\uC624\uB9CC \uB9AC\uC584",
  ILS: "\uC774\uC2A4\uB77C\uC5D8 \uC170\uCF08",
  BDT: "\uBC29\uAE00\uB77C\uB370\uC2DC \uD0C0\uCE74",
  LKR: "\uC2A4\uB9AC\uB791\uCE74 \uB8E8\uD53C",
  NPR: "\uB124\uD314 \uB8E8\uD53C",
  MMK: "\uBBF8\uC580\uB9C8 \uC9EF",
  KHR: "\uCE84\uBCF4\uB514\uC544 \uB9AC\uC5D8",
  LAK: "\uB77C\uC624\uC2A4 \uD0B5",
  BND: "\uBE0C\uB8E8\uB098\uC774 \uB2EC\uB7EC",
  MOP: "\uB9C8\uCE74\uC624 \uD30C\uD0C0\uCE74",
  FJD: "\uD53C\uC9C0 \uB2EC\uB7EC",
  CLP: "\uCE60\uB808 \uD398\uC18C",
  COP: "\uCF5C\uB86C\uBE44\uC544 \uD398\uC18C",
  PEN: "\uD398\uB8E8 \uC194",
  ARS: "\uC544\uB974\uD5E8\uD2F0\uB098 \uD398\uC18C",
  RON: "\uB8E8\uB9C8\uB2C8\uC544 \uB808\uC6B0",
  BGN: "\uBD88\uAC00\uB9AC\uC544 \uB808\uD504",
  UAH: "\uC6B0\uD06C\uB77C\uC774\uB098 \uD750\uB9AC\uC6B0\uB0D0",
  ISK: "\uC544\uC774\uC2AC\uB780\uB4DC \uD06C\uB85C\uB098",
  ETB: "\uC5D0\uD2F0\uC624\uD53C\uC544 \uBE44\uB974",
  KES: "\uCF00\uB0D0 \uC2E4\uB9C1",
  NGN: "\uB098\uC774\uC9C0\uB9AC\uC544 \uB098\uC774\uB77C",
  GHS: "\uAC00\uB098 \uC138\uB514",
  TZS: "\uD0C4\uC790\uB2C8\uC544 \uC2E4\uB9C1",
  DZD: "\uC54C\uC81C\uB9AC \uB514\uB098\uB974",
  MAD: "\uBAA8\uB85C\uCF54 \uB514\uB974\uD568",
  TND: "\uD280\uB2C8\uC9C0 \uB514\uB098\uB974",
  LYD: "\uB9AC\uBE44\uC544 \uB514\uB098\uB974",
  IQD: "\uC774\uB77C\uD06C \uB514\uB098\uB974",
  UZS: "\uC6B0\uC988\uBCA0\uD0A4\uC2A4\uD0C4 \uC228",
  GEL: "\uC870\uC9C0\uC544 \uB77C\uB9AC",
  AZN: "\uC544\uC81C\uB974\uBC14\uC774\uC794 \uB9C8\uB098\uD2B8",
  AMD: "\uC544\uB974\uBA54\uB2C8\uC544 \uB4DC\uB78C",
  BYN: "\uBCA8\uB77C\uB8E8\uC2A4 \uB8E8\uBE14",
  RSD: "\uC138\uB974\uBE44\uC544 \uB514\uB098\uB974",
  MKD: "\uBD81\uB9C8\uCF00\uB3C4\uB2C8\uC544 \uB514\uB098\uB974",
  ALL: "\uC54C\uBC14\uB2C8\uC544 \uB808\uD06C",
  BOB: "\uBCFC\uB9AC\uBE44\uC544 \uBCFC\uB9AC\uBE44\uC544\uB178",
  PYG: "\uD30C\uB77C\uACFC\uC774 \uACFC\uB77C\uB2C8",
  UYU: "\uC6B0\uB8E8\uACFC\uC774 \uD398\uC18C",
  GTQ: "\uACFC\uD14C\uB9D0\uB77C \uCF00\uCC30",
  DOP: "\uB3C4\uBBF8\uB2C8\uCE74 \uD398\uC18C",
  JMD: "\uC790\uBA54\uC774\uCE74 \uB2EC\uB7EC",
  TTD: "\uD2B8\uB9AC\uB2C8\uB2E4\uB4DC \uB2EC\uB7EC",
  PAB: "\uD30C\uB098\uB9C8 \uBC1C\uBCF4\uC544",
  CRC: "\uCF54\uC2A4\uD0C0\uB9AC\uCE74 \uCF5C\uB860",
  HNL: "\uC628\uB450\uB77C\uC2A4 \uB818\uD53C\uB77C",
  NIO: "\uB2C8\uCE74\uB77C\uACFC \uCF54\uB974\uB3C4\uBC14",
  XOF: "\uC11C\uC544\uD504\uB9AC\uCE74 \uD504\uB791",
  XAF: "\uC911\uC559\uC544\uD504\uB9AC\uCE74 \uD504\uB791"
});
var ECB = /* @__PURE__ */ new Set(["USD", "JPY", "EUR", "CNY", "GBP", "CHF", "CAD", "AUD", "NZD", "HKD", "SGD", "THB", "IDR", "INR", "PHP", "MYR", "BRL", "MXN", "TRY", "ZAR", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF"]);
async function daumSummaries() {
  const j = await jget7(
    "https://finance.daum.net/api/exchanges/summaries",
    5e3,
    { Referer: "https://finance.daum.net/exchanges", Origin: "https://finance.daum.net" }
  );
  const arr = j && (j.data || j.exchanges || (Array.isArray(j) ? j : null));
  if (!Array.isArray(arr) || !arr.length) return null;
  const out = [];
  for (const it of arr) {
    const cur = String(it.currencyCode || (String(it.symbolCode || "").match(/KRW([A-Z]{3})/) || [])[1] || "").toUpperCase();
    const price = num6(it.basePrice);
    if (!cur || !price) continue;
    const dir = String(it.change || "").toUpperCase() === "FALL" ? -1 : String(it.change || "").toUpperCase() === "EVEN" ? 0 : 1;
    const mag = Math.abs(num6(it.changePrice) || 0);
    let rate = num6(it.changeRate);
    if (rate != null) rate = Math.abs(rate) * 100 * (dir || (rate < 0 ? -1 : 1));
    out.push({
      cur,
      unit: num6(it.currencyUnit) || 1,
      price,
      change: dir * mag,
      rate: rate != null ? rate : price ? dir * mag / (price - dir * mag) * 100 : 0,
      high: num6(it.highPrice),
      low: num6(it.lowPrice),
      country: it.country || "",
      at: it.date || ""
    });
  }
  return out.length ? out : null;
}
var NAVER_CODES = ["USD", "JPY", "EUR", "CNY", "GBP", "CHF", "CAD", "AUD", "NZD", "HKD", "SGD", "THB"];
async function naverFx() {
  const codes = NAVER_CODES.map((c) => "FX_" + c + "KRW").join(",");
  const j = await jget7(
    `https://polling.finance.naver.com/api/realtime/marketindex/exchange/${codes}`,
    4500,
    { Referer: "https://m.stock.naver.com/" }
  );
  const datas = j && (j.datas || j.result && j.result.areas && j.result.areas.flatMap((a) => a.datas || []));
  if (!Array.isArray(datas) || !datas.length) return null;
  const out = [];
  for (const d of datas) {
    const code = String(d.reutersCode || d.cd || d.itemCode || "");
    const cur = (code.match(/FX_([A-Z]{3})KRW/) || [])[1];
    const price = num6(d.closePrice ?? d.nv);
    if (!cur || !price) continue;
    const sc = String(d.compareToPreviousPrice && d.compareToPreviousPrice.code || "");
    const dir = sc === "4" || sc === "5" ? -1 : sc === "3" ? 0 : 1;
    const mag = Math.abs(num6(d.compareToPreviousClosePrice ?? d.cv) || 0);
    const rmag = Math.abs(num6(d.fluctuationsRatio ?? d.cr) || 0);
    out.push({ cur, unit: cur === "JPY" ? 100 : 1, price, change: dir * mag, rate: dir * rmag, high: null, low: null, country: "", at: String(d.localTradedAt || "") });
  }
  return out.length ? out : null;
}
var histCache = { at: 0, map: null };
/* ══ [v8.7] ECB 밖 통화의 이력 ═══════════════════════════════════════════════
   중동·중앙아시아·남아시아 통화는 ECB 가 고시하지 않는다.
   시세는 다음 금융에서 오는데 이력이 없어 그래프만 비어 있었다.
   여러 곳을 순서대로 두드려 받는다 — 한 곳이 막혀도 다른 곳에서 채운다. */
var FX_EXTRA = ["AED","SAR","KWD","BHD","QAR","JOD","OMR","KZT","MNT","PKR","BDT",
  "BND","ILS","EGP","VND","TWD","LKR","NPR","KHR","MMK","MOP","RUB","CLP","COP",
  "PEN","ARS","UAH","RON","BGN","HRK","ISK","NGN","KES","MAD","TND","DZD"];
async function fxHistExtra(map, from, to, wanted) {
  /* [v9.7] 화면에 실제로 나오는 통화 목록(wanted)을 함께 받는다.
     FX_EXTRA 는 미리 적어 둔 것일 뿐, 다음 금융이 주는 통화가 더 많을 수 있다. */
  const all = [...new Set([...FX_EXTRA, ...(wanted || [])])];
  const need = all.filter((c) => !(map[c] && map[c].length >= 3));
  if (!need.length) return;
  const syms = need.join(",");
  /* ══ [v8.8] 직선 그래프가 나온 이유 ═══════════════════════════════════════
     지난번에 '선이라도 그려지게' 같은 값 3개를 넣었다. 그건 수평선일 뿐
     아무 정보도 주지 못한다 — 오히려 시세가 안 움직인 것처럼 오해하게 만든다.
     [고침] 진짜 이력을 주는 곳을 여러 곳 두드린다.
     끝내 못 받으면 그래프를 그리지 않는다(빈 자리가 거짓 직선보다 낫다). */
  /* ① Frankfurter 개별 조회 — ECB 밖 통화도 일부는 준다 */
  try {
    const j = await jget7(`https://api.frankfurter.dev/v1/${from}..${to}?base=KRW&symbols=${syms}`, 6e3);
    const rates = j && j.rates;
    if (rates) {
      const days = Object.keys(rates).sort().slice(-31);
      for (const d of days) for (const [cur, v] of Object.entries(rates[d] || {})) {
        const r = Number(v);
        if (r > 0 && need.includes(cur)) (map[cur] = map[cur] || []).push(1 / r);
      }
    }
  } catch (e) {}
  /* ══ [v9.7] 그래프가 비던 진짜 이유 ═══════════════════════════════════════
     [무엇이 문제였나] ① 남은 통화를 20개만 처리했다. 다음 금융은 그보다 많은
     통화를 주므로 뒤쪽은 아예 시도조차 못 했다.
     ② 통화 하나씩 차례로(await) 돌았다. 통화당 최대 2회 × 20통화 = 40회를
     한 줄로 세우니 5초 제한에 걸려 앞 몇 개만 채워지고 끝났다.
     [고침] 전부 대상으로 삼고, 동시에 보낸다. 워커는 요청마다 별개 실행이라
     한꺼번에 보내도 안전하다(해외 시세에서 이미 쓰는 방식이다). */
  /* [v9.7] FX_EXTRA 만이 아니라 '아직 이력이 모자란 모든 통화'를 대상으로 삼는다.
     ECB 목록에 있어도 그날 응답에서 빠지는 통화가 있다. */
  let still = all.filter((c) => !(map[c] && map[c].length >= 5));
  const grab = async (c) => {
    /* ②-1 야후 환율 차트 — 30일 종가 */
    try {
      const j = await jget7(`https://query1.finance.yahoo.com/v8/finance/chart/${c}KRW=X?range=1mo&interval=1d`, 4500);
      const q = j && j.chart && j.chart.result && j.chart.result[0];
      const cl = q && q.indicators && q.indicators.quote && q.indicators.quote[0] && q.indicators.quote[0].close;
      if (Array.isArray(cl)) {
        const arr = cl.map(Number).filter((v) => v > 0).slice(-31);
        if (arr.length >= 5) { map[c] = arr; return; }
      }
    } catch (e) {}
    /* ②-2 Stooq — 통화쌍 일별 종가 */
    try {
      const t = await tget(`https://stooq.com/q/d/l/?s=${c.toLowerCase()}krw&i=d`, 4500);
      if (t && t.indexOf("Date") === 0) {
        const rows = t.trim().split("\n").slice(1).slice(-31);
        const arr = rows.map((r) => Number(r.split(",")[4])).filter((v) => v > 0);
        if (arr.length >= 5) { map[c] = arr; return; }
      }
    } catch (e) {}
    /* ②-3 달러 경유 — USD/KRW 흐름에 그 통화의 대미 환율을 곱해 만든다.
       직접 쌍이 없는 통화(중동·중앙아시아)도 이 길로는 대개 받아진다. */
    try {
      const u = map.USD;
      if (u && u.length >= 5) {
        const j = await jget7(`https://query1.finance.yahoo.com/v8/finance/chart/${c}=X?range=1mo&interval=1d`, 4500);
        const q = j && j.chart && j.chart.result && j.chart.result[0];
        const cl = q && q.indicators && q.indicators.quote && q.indicators.quote[0] && q.indicators.quote[0].close;
        if (Array.isArray(cl)) {
          const rate = cl.map(Number).filter((v) => v > 0).slice(-31);   // 1 USD = n CUR
          if (rate.length >= 5) {
            const n = Math.min(rate.length, u.length);
            const out2 = [];
            for (let k = 0; k < n; k++) {
              const usd = u[u.length - n + k], r2 = rate[rate.length - n + k];
              if (usd > 0 && r2 > 0) out2.push(usd / r2);               // 1 CUR = ? KRW
            }
            if (out2.length >= 5) { map[c] = out2; return; }
          }
        }
      }
    } catch (e) {}
  };
  /* 8개씩 동시에 — 한꺼번에 다 보내면 상대 서버가 막을 수 있다 */
  for (let k = 0; k < still.length; k += 8) {
    await Promise.all(still.slice(k, k + 8).map(grab));
  }
  /* ③ 그래도 없으면 비워 둔다 — 가짜 직선은 그리지 않는다 */
  for (const c of FX_EXTRA) if (map[c] && map[c].length < 3) delete map[c];
}
var histWant = [];
async function fxHistory() {
  if (histCache.map && Date.now() - histCache.at < 36e5) return histCache.map;
  const end = /* @__PURE__ */ new Date(), start = /* @__PURE__ */ new Date();
  start.setDate(start.getDate() - 45);
  const ymd6 = (d) => d.toISOString().slice(0, 10);
  const syms = [...ECB].join(",");
  const urls = [
    `https://api.frankfurter.dev/v1/${ymd6(start)}..${ymd6(end)}?base=KRW&symbols=${syms}`,
    `https://api.frankfurter.app/${ymd6(start)}..${ymd6(end)}?from=KRW&to=${syms}`
  ];
  /* ══ [v8.7] 그래프가 없던 통화의 정체 ═══════════════════════════════════
     이력을 유럽중앙은행(ECB) 고시 통화 26종에서만 받고 있었다.
     ECB 는 유로 기준 주요 통화만 고시하므로 중동(AED·SAR·KWD·BHD·QAR·JOD)·
     중앙아시아(KZT·MNT)·남아시아(PKR·BDT)·대만(TWD) 등이 통째로 빠졌다.
     그 통화들은 시세는 나오는데(다음 금융) 이력이 없어 그래프만 비어 있었다.
     [고침] ECB 에 없는 통화는 exchangerate.host 에서 따로 받아 채운다.
     한 번 받아 1시간 보관하므로 호출이 늘지 않는다. */
  for (const u of urls) {
    const j = await jget7(u, 5e3);
    const rates = j && j.rates;
    if (!rates) continue;
    const days = Object.keys(rates).sort().slice(-31);
    const map = {};
    for (const d of days) for (const [cur, v] of Object.entries(rates[d] || {})) {
      const r = Number(v);
      if (!(r > 0)) continue;
      (map[cur] = map[cur] || []).push(1 / r);
    }
    if (Object.keys(map).length) {
      /* [v8.7] ECB 가 고시하지 않는 통화를 보충한다 */
      try { await fxHistExtra(map, ymd6(start), ymd6(end), histWant); } catch (e) {}
      histCache = { at: Date.now(), map };
      return map;
    }
  }
  return histCache.map || {};
}
function fxOpen() {
  const k = new Date(Date.now() + 9 * 36e5);
  const w = k.getUTCDay();
  if (w === 0 || w === 6) return false;
  const hm = k.getUTCHours() * 60 + k.getUTCMinutes();
  return hm >= 540 && hm <= 930;
}
var memo3 = { at: 0, body: null };
var fx_default = async () => {
  try {
    if (memo3.body && Date.now() - memo3.at < 3e4) {
      return new Response(memo3.body, { headers: { "content-type": "application/json", "cache-control": "s-maxage=30, stale-while-revalidate=90" } });
    }
    /* ══ [v9.7] 시세를 먼저 받아 '어떤 통화가 화면에 나오는지' 확정한 뒤
       그 목록으로 이력을 받는다. 예전에는 둘을 동시에 보내서, 이력 쪽이
       화면에 나올 통화를 알 수 없었고 미리 적어 둔 목록만 채웠다. */
    let list = await daumSummaries(), src = "daum";
    if (!list) {
      list = await naverFx();
      src = "naver";
    }
    try{ histWant = (list||[]).map(x=>x&&x.cur).filter(Boolean); }catch(e){ histWant=[]; }
    const hist = await fxHistory();
    if (!list) {
      list = Object.entries(hist).map(([cur, h]) => {
        const unit = cur === "JPY" || cur === "IDR" ? 100 : 1;
        const p = h[h.length - 1] * unit, pv = (h[h.length - 2] || h[h.length - 1]) * unit;
        return { cur, unit, price: p, change: p - pv, rate: pv ? (p - pv) / pv * 100 : 0, high: null, low: null, country: "", at: "" };
      });
      src = "ecb";
    }
    const open = fxOpen();
    const fx = list.filter((x) => x.price > 0).sort((a, b) => (ORDER[a.cur] ?? 99) - (ORDER[b.cur] ?? 99) || a.cur.localeCompare(b.cur)).map((x) => {
      const h = (hist[x.cur] || []).map((v) => v * (x.unit || 1));
      const history = h.length >= 2 ? h.slice(-30) : [x.price - x.change, x.price];
      if (h.length >= 2 && Math.abs(history[history.length - 1] - x.price) / x.price > 5e-4) history.push(x.price);
      const dp = x.price < 1 ? 4 : x.price < 10 ? 3 : 2, mul = Math.pow(10, dp);
      return {
        key: x.cur,
        flag: flagOf(x.cur),
        name: KNAME[x.cur] || (x.country ? x.country + " " : "") + x.cur,
        unit: x.unit > 1 ? `${x.cur} ${x.unit}` : x.cur,
        dp,
        price: Math.round(x.price * mul) / mul,
        change: Math.round(x.change * mul) / mul,
        rate: Math.round((x.rate || 0) * 100) / 100,
        high: x.high,
        low: x.low,
        history,
        open
      };
    });
    const body = JSON.stringify({ ok: fx.length > 0, src, open, at: Date.now(), fx });
    if (fx.length) memo3 = { at: Date.now(), body };
    return new Response(body, { headers: { "content-type": "application/json", "cache-control": "s-maxage=30, stale-while-revalidate=90" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e).slice(0, 120), fx: [] }), { headers: { "content-type": "application/json" } });
  }
};

// netlify/functions/homepage.js
init_store();
init_euckr();
var UA15 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
var MAP = null;
var MAP_AT = 0;
var BUSY = null;
function parseKind(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const n = b.length, map = {};
  const isTd = (i2) => b[i2] === 60 && b[i2 + 1] === 116 && b[i2 + 2] === 100;
  const isTr = (i2) => b[i2] === 60 && b[i2 + 1] === 116 && b[i2 + 2] === 114;
  const isEndTd = (i2) => b[i2] === 60 && b[i2 + 47 - 47] === 60 && b[i2 + 1] === 47 && b[i2 + 2] === 116 && b[i2 + 3] === 100;
  const txt = (s2, e2) => {
    let out = "", depth = 0;
    for (let i2 = s2; i2 < e2; i2++) {
      const c = b[i2];
      if (c === 60) {
        depth++;
        continue;
      }
      if (c === 62) {
        if (depth > 0) depth--;
        continue;
      }
      if (depth > 0) continue;
      if (c >= 33 && c < 127) out += String.fromCharCode(c);
      else if (c === 32 || c === 9) {
        if (out && out[out.length - 1] !== " ") out += " ";
      }
    }
    return out.trim();
  };
  let i = 0, col = -1, code = "", home = "", cellStart = -1;
  while (i < n - 4) {
    if (isTr(i)) {
      if (col >= 7 && code.length === 6 && home && home !== "-") map[code] = home;
      col = -1;
      code = "";
      home = "";
      cellStart = -1;
      i += 3;
      continue;
    }
    if (isTd(i)) {
      let g = i + 3;
      while (g < n && b[g] !== 62) g++;
      col++;
      cellStart = g + 1;
      i = g + 1;
      continue;
    }
    if (cellStart >= 0 && b[i] === 60 && b[i + 1] === 47 && b[i + 2] === 116 && b[i + 3] === 100) {
      if (col === 1) {
        code = txt(cellStart, i).toUpperCase();
        if (!/^[0-9A-Z]{6}$/.test(code)) code = "";
      } else if (col === 7) home = txt(cellStart, i);
      cellStart = -1;
      i += 4;
      continue;
    }
    i++;
  }
  if (col >= 7 && code.length === 6 && home && home !== "-") map[code] = home;
  return map;
}
async function ensureMap(env) {
  const now = Date.now();
  if (MAP && now - MAP_AT < 7 * 864e5) return MAP;
  try {
    const st = await getStoreX({ name: "kind-map" }, env);
    const cached = await st.get("map", { type: "json" });
    if (cached && cached.at && now - cached.at < 864e5 && cached.m && Object.keys(cached.m).length > 500) {
      MAP = cached.m;
      MAP_AT = cached.at;
      return MAP;
    }
  } catch (e) {
  }
  if (!BUSY) BUSY = (async () => {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 8500);
      const r = await fetch(
        "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13",
        { signal: ac.signal, headers: { "User-Agent": UA15, Referer: "https://kind.krx.co.kr/corpgeneral/corpList.do", "Accept-Language": "ko" } }
      );
      clearTimeout(t);
      if (r.ok) {
        const m = parseKind(await r.arrayBuffer());
        if (Object.keys(m).length > 500) {
          MAP = m;
          MAP_AT = now;
          try {
            const st = await getStoreX({ name: "kind-map" }, env);
            await st.setJSON("map", { at: now, m });
          } catch (e) {
          }
        }
      }
    } catch (e) {
    } finally {
      BUSY = null;
    }
  })();
  await BUSY;
  return MAP;
}
var homepage_default = async (req2, context) => {
  const u = new URL(req2.url);
  const code = String(u.searchParams.get("code") || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
  if (!/^[0-9A-Z]{6}$/.test(code)) {
    return new Response(
      JSON.stringify({ ok: false, err: "bad code" }),
      { status: 400, headers: { "content-type": "application/json", "cache-control": "public, s-maxage=86400" } }
    );
  }
  const map = await ensureMap(context && context.env);
  const homepage = map && map[code] || null;
  const loaded = map ? Object.keys(map).length : 0;
  return new Response(JSON.stringify({ ok: !!homepage, code, homepage, listed: loaded }), {
    headers: {
      "content-type": "application/json",
      // 찾았으면 7일, 명부 자체를 못 받았으면 30분 뒤 재시도
      "cache-control": homepage ? "public, s-maxage=604800" : loaded ? "public, s-maxage=86400" : "public, s-maxage=1800",
      "netlify-cdn-cache-control": homepage ? "public, s-maxage=604800, durable" : "public, s-maxage=1800",
      "access-control-allow-origin": "*"
    }
  });
};

// netlify/functions/investors.js
init_euckr();
function _mkDec6(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
var UA16 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
function decodeSmart7(buf, headerCT) {
  const dec = (enc) => {
    try {
      return _mkDec6(enc).decode(buf);
    } catch {
      return null;
    }
  };
  const score2 = (x) => {
    if (!x) return -1e9;
    const bad = (x.match(/\uFFFD/g) || []).length;
    const han = (x.match(/[가-힣]/g) || []).length;
    const broken = (x.match(/[\uD800-\uDFFF\u3130-\u318F]/g) || []).length;
    return han - bad * 5 - broken * 3;
  };
  let declared = "";
  const mH = /charset=([\w-]+)/i.exec(String(headerCT || ""));
  if (mH) declared = mH[1].toLowerCase();
  if (!declared) {
    const head = dec("latin1") || "";
    const mM = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head.slice(0, 2e3));
    if (mM) declared = mM[1].toLowerCase();
  }
  const norm2 = (c) => c === "ms949" || c === "cp949" || c === "ksc5601" ? "euc-kr" : c;
  const cands = [];
  if (declared) {
    const t = dec(norm2(declared));
    if (t) cands.push(t);
  }
  const u = dec("utf-8"), e = dec("euc-kr");
  if (u) cands.push(u);
  if (e) cands.push(e);
  return cands.sort((a, b) => score2(b) - score2(a))[0] || "";
}
var numish3 = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return isNaN(n) ? null : n;
};
var ymd4 = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
var stripTags = (s) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
/* ══════════════════════════════════════════════════════════════════════════════
   [v9.85] KRX 세션 — 'LOGOUT' 응답의 정체
   ─────────────────────────────────────────────────────────────────────────────
   getJsonData.cmd 를 곧바로 부르면 KRX 는 HTTP 400 에 본문 "LOGOUT" 만 돌려준다.
   bld 코드가 틀려서가 아니라, 세션 쿠키(JSESSIONID)가 없어서다. 실제 브라우저는
   조회 화면을 먼저 열어 쿠키를 받은 뒤 그 쿠키로 데이터를 요청한다.
   지금까지 이 프로젝트는 krxPost 에 쿠키 자리를 만들어 두고도 늘 빈 값을 넘겼다.
   그래서 KRX 를 쓰는 기능(투자자별 예비 경로 등)이 조용히 실패해 왔다.

   [고침] 조회 화면을 한 번 GET 해 Set-Cookie 를 받아 두고, 이후 요청에 붙인다.
   쿠키는 워커 인스턴스 메모리에 20분 담아 두어 매번 받아오지 않는다. */
/* ══ [v9.97] 전역 호출 예산 ═══════════════════════════════════════════════
   워커 인스턴스는 여러 개가 동시에 돌 수 있어 메모리 카운터만으로는 전체를
   알 수 없다. 그래서 '메모리에서 세고, 1분마다 KV 에 더한다'로 절충한다.
   완벽히 정확하진 않지만 한도의 몇 %인지 판단하기에는 충분하고,
   KV 쓰기는 하루 1,440회 이하로 묶인다(요청마다 쓰면 수만 회가 된다). */
var _bgN = 0, _bgAt = 0, _bgDay = "", _bgTotal = 0;
const BUDGET_DAY = 90000;          // 무료 한도 10만 중 9만까지만 쓴다(여유 1만)
function budgetDayKey() {
  const d = new Date(Date.now() + 9 * 3600e3);
  return d.toISOString().slice(0, 10);
}
function budgetTick(env) {
  const day = budgetDayKey();
  if (_bgDay !== day) { _bgDay = day; _bgN = 0; _bgTotal = 0; _bgAt = 0; }
  _bgN++;
  const now = Date.now();
  if (now - _bgAt < 60000) return;
  _bgAt = now;
  const add = _bgN; _bgN = 0;
  const KVx = env && env.APP_KV;
  if (!KVx) { _bgTotal += add; return; }
  /* 읽고 더해 쓰기 — 인스턴스가 여럿이면 약간 어긋나지만 방향은 맞다 */
  (async () => {
    try {
      const k = "budget:" + day;
      const cur = Number(await KVx.get(k)) || 0;
      const next = cur + add;
      _bgTotal = next;
      await KVx.put(k, String(next), { expirationTtl: 172800 });
    } catch (e) { _bgTotal += add; }
  })();
}
function budgetPct() {
  return Math.max(0, Math.min(200, Math.round((_bgTotal + _bgN) / BUDGET_DAY * 100)));
}
var _krxCk = "", _krxCkAt = 0;
async function krxSession(force) {
  if (!force && _krxCk && Date.now() - _krxCkAt < 20 * 60e3) return _krxCk;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 6000);
    const r = await fetch("https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020506", {
      headers: { "User-Agent": UA20, Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "ko-KR,ko;q=0.9" }, signal: c.signal });
    clearTimeout(t);
    /* Set-Cookie 가 여러 줄일 수 있다 — 이름=값 부분만 모아 붙인다 */
    let raw = "";
    try { if (r.headers.getSetCookie) raw = r.headers.getSetCookie().join("; ");
      else raw = r.headers.get("set-cookie") || ""; } catch (e) { raw = r.headers.get("set-cookie") || ""; }
    const parts = String(raw).split(/,(?=[^;]+=)|;\s*/).map(x => x.trim())
      .filter(x => /^(JSESSIONID|__smVisitorID|SCOUTER)=/.test(x));
    if (parts.length) { _krxCk = parts.join("; "); _krxCkAt = Date.now(); }
    return _krxCk;
  } catch (e) { return _krxCk; }
}
async function krxPost(url, form, ms, cookie) {
  /* [v9.85] 쿠키를 안 넘겼으면 세션을 받아 붙인다 */
  let ck = cookie;
  if (!ck) { try { ck = await krxSession(false); } catch (e) { ck = ""; } }
  const once = async (useCk) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(url, { method: "POST", headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": UA20,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd",
        "Origin": "https://data.krx.co.kr",
        "X-Requested-With": "XMLHttpRequest",
        ...useCk ? { "Cookie": useCk } : {} },
        body: new URLSearchParams(form).toString(), signal: c.signal });
      const txt = await r.text();
      try { return { j: JSON.parse(txt) }; }
      catch { return { bad: txt.slice(0, 30), status: r.status }; }
    } finally { clearTimeout(t); }
  };
  let out = await once(ck);
  /* 'LOGOUT' = 세션 만료. 쿠키를 새로 받아 딱 한 번 다시 시도한다. */
  if (out.bad && /LOGOUT/i.test(out.bad)) {
    try { const fresh = await krxSession(true); if (fresh) out = await once(fresh); } catch (e) {}
  }
  return out;
}
async function krxInvestors(code) {
  const U = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
  const f = await krxPost(U, { bld: "dbms/comm/finder/finder_stkisu", mktsel: "ALL", searchText: code }, 4e3, "");
  if (f.bad) return { error: "finder:" + f.bad };
  const list = f.j && (f.j.block1 || f.j.output) || [];
  const item = list.find((x) => String(x.short_code || "").replace(/^A/, "") === code) || list[0];
  const isuCd = item && (item.full_code || item.isu_cd);
  if (!isuCd) return { error: "isuCd-not-found" };
  const end = /* @__PURE__ */ new Date();
  const start = /* @__PURE__ */ new Date();
  start.setMonth(start.getMonth() - 3);
  const t = await krxPost(U, { bld: "dbms/MDC/STAT/standard/MDCSTAT02403", locale: "ko_KR", isuCd, strtDd: ymd4(start), endDd: ymd4(end), askBid: "3", trdVolVal: "1", detailView: "1" }, 6e3, "");
  if (t.bad) return { error: "trend:" + t.bad };
  const out = t.j && (t.j.output || t.j.OutBlock_1) || [];
  if (!Array.isArray(out) || !out.length) return { error: "no-output" };
  const map = [["\uAC1C\uC778", "TRDVAL10"], ["\uC678\uAD6D\uC778", "TRDVAL11"], ["\uAE30\uAD00\uACC4", "TRDVAL8"], ["\uAE08\uC735\uD22C\uC790", "TRDVAL1"], ["\uBCF4\uD5D8", "TRDVAL2"], ["\uD22C\uC2E0", "TRDVAL3"], ["\uC740\uD589", "TRDVAL5"], ["\uAE30\uD0C0\uAE08\uC735", "TRDVAL6"], ["\uC5F0\uAE30\uAE08", "TRDVAL7"], ["\uC0AC\uBAA8\uD380\uB4DC", "TRDVAL4"], ["\uAE30\uD0C0\uBC95\uC778", "TRDVAL9"], ["\uAE30\uD0C0\uC678\uAD6D\uC778", "TRDVAL12"]];
  const columns = map.map((m) => m[0]);
  const rows = out.map((r) => ({ date: String(r.TRD_DD || "").replace(/\//g, "."), values: Object.fromEntries(map.map(([n, fld]) => [n, numish3(r[fld])])) }));
  const total = {};
  columns.forEach((n) => {
    total[n] = rows.reduce((s, x) => s + (Number(x.values[n]) || 0), 0);
  });
  return { columns, total, rows, source: "KRX" };
}
function parseFrgnHtml(html) {
  const trs = String(html || "").split(/<tr/i).slice(1);
  const rows = [];
  for (const tr of trs) {
    if (!/\d{4}\.\d{2}\.\d{2}/.test(tr)) continue;
    const cells = (tr.match(/<td[\s\S]*?<\/td>/gi) || []).map(stripTags);
    if (cells.length < 7) continue;
    const date = (cells[0].match(/\d{4}\.\d{2}\.\d{2}/) || [])[0];
    if (!date) continue;
    const inst = numish3(cells[5]);
    const forn = numish3(cells[6]);
    if (inst == null && forn == null) continue;
    rows.push({ date, values: { "\uC678\uAD6D\uC778": forn, "\uAE30\uAD00\uACC4": inst } });
  }
  return rows;
}
async function frgnPage(code, page) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 4500);
  try {
    const r = await fetch(`https://finance.naver.com/item/frgn.naver?code=${code}&page=${page}`, { headers: { "User-Agent": UA16, "Referer": `https://finance.naver.com/item/frgn.naver?code=${code}` }, signal: c.signal });
    const buf = await r.arrayBuffer();
    return parseFrgnHtml(decodeSmart7(buf, r.headers.get("content-type")));
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}
async function naverFrgn(code) {
  const pages = await Promise.all([frgnPage(code, 1), frgnPage(code, 2), frgnPage(code, 3)]);
  const seen = /* @__PURE__ */ new Set();
  const rows = [];
  for (const pg of pages) for (const r of pg) {
    if (seen.has(r.date)) continue;
    seen.add(r.date);
    rows.push(r);
  }
  if (!rows.length) return { error: "frgn-parse" };
  rows.sort((a, b) => b.date.localeCompare(a.date));
  rows.forEach((r) => {
    const f = Number(r.values["\uC678\uAD6D\uC778"]) || 0, i = Number(r.values["\uAE30\uAD00\uACC4"]) || 0;
    r.values["\uAC1C\uC778"] = -(f + i);
  });
  const columns = ["\uAC1C\uC778", "\uC678\uAD6D\uC778", "\uAE30\uAD00\uACC4"];
  const total = {};
  columns.forEach((n) => {
    total[n] = rows.reduce((s, x) => s + (Number(x.values[n]) || 0), 0);
  });
  return { columns, total, rows: rows.slice(0, 60), partial: true, source: "\uB124\uC774\uBC84", indivEst: true };
}
var investors_default = async (req2) => {
  const url = new URL(req2.url);
  if (url.searchParams.get("market") === "1") {
    const diag = [];
    let out = null;
    for (const u of ["https://finance.naver.com/sise/sise_trans_style.naver", "https://finance.naver.com/sise/investorDealTrendDay.naver"]) {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 5e3);
        const r = await fetch(u, { headers: { "User-Agent": UA16, "Referer": "https://finance.naver.com/sise/" }, signal: c.signal });
        clearTimeout(t);
        if (!r.ok) {
          diag.push(u.split("/").pop().split(".")[0] + ":" + r.status);
          continue;
        }
        const html = decodeSmart7(await r.arrayBuffer(), r.headers.get("content-type"));
        const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
        for (const tr of trs) {
          if (!/\d{2}\.\d{2}\.\d{2}|\d{4}\.\d{2}\.\d{2}/.test(tr)) continue;
          const cells = (tr.match(/<td[\s\S]*?<\/td>/gi) || []).map(stripTags);
          if (cells.length < 4) continue;
          const date = (cells[0].match(/\d{2,4}\.\d{2}\.\d{2}/) || [])[0];
          if (!date) continue;
          const personal = numish3(cells[1]), foreign = numish3(cells[2]), inst = numish3(cells[3]);
          if (personal == null && foreign == null && inst == null) continue;
          out = { date, personal: Math.round((personal || 0) / 100), foreign: Math.round((foreign || 0) / 100), inst: Math.round((inst || 0) / 100) };
          diag.push("ok:" + u.split("/").pop().split(".")[0] + " " + date);
          break;
        }
        if (out) break;
        diag.push(u.split("/").pop().split(".")[0] + ":norow");
      } catch (e) {
        diag.push(String(e).slice(0, 24));
      }
    }
    return new Response(
      JSON.stringify({ ok: !!out, ...out || {}, diag }),
      { headers: { "content-type": "application/json", "cache-control": "s-maxage=600, stale-while-revalidate=1200" } }
    );
  }
  const code = String(url.searchParams.get("code") || "005930").replace(/[^0-9A-Za-z]/g, "");
  let inv;
  try {
    inv = await krxInvestors(code);
  } catch (e) {
    inv = { error: "krx-ex" };
  }
  if (!inv || inv.error || !inv.columns) {
    const krxErr = inv && inv.error;
    try {
      inv = await naverFrgn(code);
    } catch (e) {
      inv = { error: "frgn-ex" };
    }
    if (inv && !inv.error) inv.krxErr = krxErr;
  }
  return new Response(JSON.stringify({ ok: true, code, investors: inv }), { headers: { "content-type": "application/json", "cache-control": "s-maxage=180" } });
};

// netlify/functions/ipo.js
init_euckr();
function _mkDec7(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
var UA17 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
function decodeSmart8(buf, headerCT) {
  const dec = (enc) => {
    try {
      return _mkDec7(enc).decode(buf);
    } catch {
      return null;
    }
  };
  const score2 = (x) => {
    if (!x) return -1e9;
    const bad = (x.match(/\uFFFD/g) || []).length;
    const han = (x.match(/[가-힣]/g) || []).length;
    const broken = (x.match(/[\uD800-\uDFFF\u3130-\u318F]/g) || []).length;
    return han - bad * 5 - broken * 3;
  };
  let declared = "";
  const mH = /charset=([\w-]+)/i.exec(String(headerCT || ""));
  if (mH) declared = mH[1].toLowerCase();
  if (!declared) {
    const head = dec("latin1") || "";
    const mM = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head.slice(0, 2e3));
    if (mM) declared = mM[1].toLowerCase();
  }
  const norm2 = (c) => c === "ms949" || c === "cp949" || c === "ksc5601" ? "euc-kr" : c;
  const cands = [];
  if (declared) {
    const t = dec(norm2(declared));
    if (t) cands.push(t);
  }
  const u = dec("utf-8"), e = dec("euc-kr");
  if (u) cands.push(u);
  if (e) cands.push(e);
  return cands.sort((a, b) => score2(b) - score2(a))[0] || "";
}
var stripTags2 = (s) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
function parseRange(txt) {
  const m = txt.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\s*[~\-]\s*(?:(\d{4})\.)?(\d{1,2})\.(\d{1,2})/);
  if (!m) {
    const s = txt.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    if (!s) return null;
    const d = `${s[1]}-${s[2].padStart(2, "0")}-${s[3].padStart(2, "0")}`;
    return { start: d, end: d };
  }
  const y1 = m[1], mo1 = m[2].padStart(2, "0"), d1 = m[3].padStart(2, "0");
  const y2 = m[4] || y1, mo2 = m[5].padStart(2, "0"), d2 = m[6].padStart(2, "0");
  return { start: `${y1}-${mo1}-${d1}`, end: `${y2}-${mo2}-${d2}` };
}
function addBusinessDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  let a = 0;
  while (a < n) {
    dt.setDate(dt.getDate() + 1);
    const w = dt.getDay();
    if (w !== 0 && w !== 6) a++;
  }
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
async function fetchDecoded(url, ms = 6e3) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA17, "Referer": "http://www.38.co.kr/" }, signal: c.signal });
    const buf = await r.arrayBuffer();
    return decodeSmart8(buf, r.headers.get("content-type"));
  } finally {
    clearTimeout(t);
  }
}
function parseSchedule(html) {
  const items = [];
  const rows = html.split(/<tr[\s>]/i).slice(1);
  for (const row of rows) {
    const cells = [];
    const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let m;
    while ((m = re.exec(row)) !== null) cells.push(stripTags2(m[1]));
    if (cells.length < 5) continue;
    const name = cells[0];
    if (!name || name.length > 30 || /종목명|공모가|청약|경쟁률|주간사/.test(name)) continue;
    const range = parseRange(cells[1] || "");
    if (!range) continue;
    const fixed = (cells[2] || "").replace(/[^0-9,]/g, "");
    const band = (cells[3] || "").replace(/[^0-9,~\-]/g, "");
    const brokers = (cells[5] || cells[4] || "").split(/[,/·]|외/).map((s) => s.trim()).filter((s) => s && /증권|투자|뱅크|은행/.test(s)).slice(0, 4);
    items.push({ name, subStart: range.start, subEnd: range.end, refund: addBusinessDays(range.end, 2), listing: "", priceBand: fixed || band || "", brokers, sector: "", product: "", demand: 0 });
  }
  return items;
}
/* ══ [v9.7] 공모주 경쟁률 수집 ═══════════════════════════════════════════════
   · 수요예측 경쟁률 — 기관이 몇 대 1로 신청했나 (공모가 결정의 근거)
   · 청약 경쟁률     — 개인이 몇 대 1로 몰렸나 (상장 첫날 수급의 실마리)
   · 의무보유 확약   — 기관이 일정 기간 안 팔겠다고 약속한 비율 (물량 부담 가늠) */
async function ipoAttachRates(items){
  if(!items||!items.length)return;
  /* ══ [v9.71c] 경쟁률이 종목마다 들쭉날쭉하던 이유 ═══════════════════════════
     [예전 방식] 표의 각 칸을 순서 없이 훑으며 "':1' 이 들어간 칸 = 경쟁률",
     "'%' 가 들어간 칸 = 확약" 으로 찍었다. 그런데 38커뮤니케이션 표에는
     공모가·상단초과율·기관참여건수 등 '%'와 숫자가 들어간 칸이 여럿이라,
     어떤 종목은 엉뚱한 칸을 물고 어떤 종목은 아무것도 못 물었다.
     확약이 정말 0% 인 종목도 (p>0 조건 때문에) 통째로 버려졌다.
     [지금] 표의 머리글(<th> 또는 첫 행)을 읽어 '어느 열이 무엇인지' 먼저 정한 뒤
     그 열만 읽는다. 열을 못 찾은 표는 값을 만들어 내지 않고 그냥 넘어간다. */
  const norm=(v)=>String(v||"").replace(/\(.*?\)/g,"").replace(/\s|㈜/g,"");
  const idx={};
  for(const it of items)idx[norm(it.name)]=it;
  const findTarget=(rawName)=>{
    const nm=norm(rawName);
    if(!nm)return null;
    if(idx[nm])return idx[nm];
    const k=Object.keys(idx).find(k2=>k2&&(k2.includes(nm)||nm.includes(k2)));
    return k?idx[k]:null;
  };
  /* '1,247.51:1' → 1247.51 ( ':1' 을 떼지 않으면 뒤의 1이 붙어 값이 틀어진다 ) */
  const num=(v)=>{
    const t=String(v||"").split(/[:：]/)[0];
    const n=Number(t.replace(/[^0-9.]/g,""));
    return isFinite(n)?n:null;
  };
  const cellsOf=(rowHtml)=>[...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
    .map(c=>c[1].replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim());
  /* 머리글에서 열 위치를 찾는다 */
  const colFind=(head,pats)=>{
    for(let i2=0;i2<head.length;i2++){
      const h=head[i2].replace(/\s/g,"");
      for(const p2 of pats)if(p2.test(h))return i2;
    }
    return -1;
  };
  const pull=async(url,cols,apply)=>{
    try{
      const h=await fetchDecoded(url,7000);
      if(!h)return 0;
      const rows=[...h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>cellsOf(m[1]));
      /* 머리글 행 찾기 — 종목명 열이 있고 원하는 열도 있는 행 */
      let head=null,nameCol=-1,map=null;
      for(const r of rows){
        if(r.length<3)continue;
        const nc=colFind(r,[/종목명/,/기업명/,/회사명/,/^종목$/]);
        if(nc<0)continue;
        const m={};
        for(const k of Object.keys(cols))m[k]=colFind(r,cols[k]);
        if(Object.keys(cols).some(k=>m[k]>=0)){ head=r; nameCol=nc; map=m; break; }
      }
      if(!head)return 0;
      let hit=0;
      for(const r of rows){
        if(r===head||r.length<=nameCol)continue;
        const t=findTarget(r[nameCol]);
        if(!t)continue;
        if(apply(t,r,map))hit++;
      }
      return hit;
    }catch(e){ return 0; }
  };
  /* ① 수요예측 결과 — 기관 경쟁률 · 의무보유 확약 */
  await pull("https://www.38.co.kr/html/fund/index.htm?o=r1",
    { demand:[/기관경쟁률/,/경쟁률/], lockup:[/의무보유/,/확약/] },
    (t,r,m)=>{
      let done=false;
      if(m.demand>=0&&t.demand==null){ const v=num(r[m.demand]); if(v!=null&&v>0){t.demand=v;done=true;} }
      /* 확약 0% 도 '정보 없음'이 아니라 엄연한 값이다 — 0 이면 0 으로 적는다 */
      if(m.lockup>=0&&t.lockup==null){ const v=num(r[m.lockup]); if(v!=null&&v>=0&&v<=100){t.lockup=v;done=true;} }
      return done;
    });
  /* ② 청약 경쟁률 */
  await pull("https://www.38.co.kr/html/fund/index.htm?o=r",
    { subRate:[/청약경쟁률/,/경쟁률/] },
    (t,r,m)=>{
      if(m.subRate>=0&&t.subRate==null){ const v=num(r[m.subRate]); if(v!=null&&v>0){t.subRate=v;return true;} }
      return false;
    });
}
var ipo_default = async (req2, context) => {
  /* [v4.8] 실패 원인: http 고정 단일 주소. Cloudflare\ud658경\uc5d0\uc11c 38\ucee4\ubba4\ub2c8\ucf00\uc774\uc158 http \uc811\uc18d\uc774 \ub9c9\ud788\uba74
     \uadf8\ub300\ub85c \uc608\uc2dc \uc77c\uc815\uc73c\ub85c \ub5a8\uc5b4\uc84c\ub2e4. https \uc6b0\uc120 + \ub2e4\uc911 \uc8fc\uc18c\ub85c \ubc14\uafb8\uace0,
     \ud55c \ubc88\uc774\ub77c\ub3c4 \uc131\uacf5\ud558\uba74 KV\uc5d0 \ubcf4\uad00\ud574 \uc77c\uc2dc \uc7a5\uc560 \ub54c\ub3c4 \uc9c1\uc804 \uc2e4\uc81c \uc77c\uc815\uc744 \ubcf4\uc5ec \uc900\ub2e4. */
  const KV = context && context.env && context.env.APP_KV;
  try {
    let html = "";
    for (const u of [
      "https://www.38.co.kr/html/fund/?o=k",
      "https://www.38.co.kr/html/fund/index.htm?o=k",
      "http://www.38.co.kr/html/fund/?o=k"
    ]) {
      try { html = await fetchDecoded(u); } catch { html = ""; }
      if (html && html.length > 3000) break;
    }
    let items = parseSchedule(html || "");
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    items = items.filter((it) => {
      const [y, m, d] = it.subEnd.split("-").map(Number);
      return new Date(y, m - 1, d) >= new Date(today.getTime() - 3 * 864e5);
    }).sort((a, b) => a.subStart.localeCompare(b.subStart)).slice(0, 12);
    if (items.length > 0) {
      try { if (KV) await KV.put("ipo:last", JSON.stringify({ at: Date.now(), items })); } catch {}
      /* ══ [v9.7] 경쟁률을 함께 붙인다 ═══════════════════════════════════════
         공모주에서 가장 먼저 보는 숫자가 경쟁률이다. 수요예측 경쟁률은
         기관이 얼마나 원했는지, 청약 경쟁률은 개인이 얼마나 몰렸는지를 말한다.
         38커뮤니케이션이 두 값을 따로 표에 싣고 있어 함께 읽어 온다. */
      try { await ipoAttachRates(items); } catch (e) {}
      return new Response(JSON.stringify({ ok: true, items }), { headers: { "content-type": "application/json", "cache-control": "s-maxage=1800" } });
    }
    /* \uc218\uc9d1 \uc2e4\ud328 \u2014 \ub9c8\uc9c0\ub9c9 \uc131\uacf5\ubcf8(3\uc77c \uc774\ub0b4)\uc774 \uc788\uc73c\uba74 \uc608\uc2dc \ub300\uc2e0 \uadf8\uac78 \uc900\ub2e4 */
    try { if (KV) { const c = await KV.get("ipo:last", "json");
      if (c && c.items && c.items.length && Date.now() - (c.at || 0) < 3 * 864e5)
        return new Response(JSON.stringify({ ok: true, stale: true, at: c.at || 0, items: c.items }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    } } catch {}
    return new Response(JSON.stringify({ ok: false, items: [] }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    try { if (KV) { const c = await KV.get("ipo:last", "json");
      if (c && c.items && c.items.length && Date.now() - (c.at || 0) < 3 * 864e5)
        return new Response(JSON.stringify({ ok: true, stale: true, at: c.at || 0, items: c.items }), { headers: { "content-type": "application/json" } });
    } } catch {}
    return new Response(JSON.stringify({ ok: false, error: String(e), items: [] }), { headers: { "content-type": "application/json" } });
  }
};

// netlify/functions/logo.js
init_euckr();
var UA18 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
var SRC = [
  (c) => ["https://static.toss.im/png-icons/securities/icn-A" + c + ".png", "https://toss.im/"],
  (c) => ["https://ssl.pstatic.net/imgstock/fn/real/logo/stock/A" + c + ".png", "https://finance.naver.com/"],
  (c) => ["https://file.alphasquare.co.kr/media/images/stock_logo/kr/" + c + ".png", "https://alphasquare.co.kr/"],
  (c) => ["https://thumb.tossinvest.com/image/resized/96x0/https%3A%2F%2Fstatic.toss.im%2Fpng-icons%2Fsecurities%2Ficn-A" + c + ".png", "https://tossinvest.com/"],
  (c) => ["https://m.stock.naver.com/front-api/v1/stock/logo?reutersCode=" + c, "https://m.stock.naver.com/"]
];
var MIN_BYTES = 260;
async function grab(url, referer, ms, minBytes) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: { "User-Agent": UA18, "Accept": "image/avif,image/webp,image/png,image/*,*/*;q=0.8", "Referer": referer }
    });
    if (!r.ok) return null;
    const ct = String(r.headers.get("content-type") || "");
    if (!/^image\//i.test(ct)) return null;
    const buf = await r.arrayBuffer();
    if (!buf || buf.byteLength < (minBytes || MIN_BYTES)) return null;
    return { buf, ct };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
var PAGES = [
  (c) => "https://m.stock.naver.com/api/stock/" + c + "/basic",
  (c) => "https://m.stock.naver.com/api/stock/" + c + "/integration",
  (c) => "https://finance.naver.com/item/main.naver?code=" + c
];
async function discover(code) {
  const rs = await Promise.allSettled(PAGES.map(async (f) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2200);
    try {
      const r = await fetch(f(code), { signal: ac.signal, headers: { "User-Agent": UA18, "Referer": "https://m.stock.naver.com/" } });
      if (!r.ok) return null;
      return decode2(await r.arrayBuffer()).replace(/\\\//g, "/");
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }));
  let home = null;
  for (const x of rs) {
    const txt = x.status === "fulfilled" ? x.value : null;
    if (!txt) continue;
    const m = txt.match(/https?:\/\/[^"'\s<>)]+?(?:logo|symbol|ci)[^"'\s<>)]*?\.(?:png|jpg|jpeg|svg|webp)/i);
    if (m) return { logo: m[0], home };
    if (!home) {
      const h = txt.match(/class="link_site"[^>]*href="(https?:\/\/[^"]+)"/i) || txt.match(/href="(https?:\/\/[^"]+)"[^>]*class="link_site"/i) || txt.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>\s*(?:홈페이지|기업\s*홈페이지)/i) || txt.match(/"(?:homePage|homepage|homepageUrl|siteUrl|url)"\s*:\s*"(https?:\/\/[^"]+)"/i);
      if (h) home = h[1];
    }
  }
  return { logo: null, home };
}
function imgResp(got, tag) {
  return new Response(got.buf, {
    headers: {
      "content-type": got.ct,
      "cache-control": "public, max-age=604800, s-maxage=2592000, immutable",
      "netlify-cdn-cache-control": "public, s-maxage=2592000, durable",
      "x-logo-src": tag,
      "access-control-allow-origin": "*"
    }
  });
}
function decode2(buf) {
  let t = "";
  try {
    t = new TextDecoder("utf-8").decode(buf);
  } catch {
    t = "";
  }
  if ((t.match(/\uFFFD/g) || []).length > 20) {
    try {
      return decodeEucKr(buf);
    } catch {
    }
  }
  return t;
}
async function favicon(homepage, left) {
  let raw = String(homepage || "").trim();
  if (!raw) return null;
  if (!/^https?:/i.test(raw)) raw = "http://" + raw;
  let h;
  try {
    h = new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  if (!h || h.indexOf(".") < 0) return null;
  const cands = [
    "https://icons.duckduckgo.com/ip3/" + h + ".ico",
    "https://" + h + "/favicon.ico",
    "https://www." + h + "/favicon.ico",
    "http://" + h + "/favicon.ico"
  ];
  for (const u of cands) {
    if (left() < 1900) return null;
    const got = await grab(u, "https://" + h + "/", Math.min(1600, left() - 300), 120);
    if (got) return got;
  }
  return null;
}
var logo_default = async (req2) => {
  const T0 = Date.now();
  const left = () => 8600 - (Date.now() - T0);
  const u = new URL(req2.url);
  const code = String(u.searchParams.get("code") || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
  const dbg = u.searchParams.get("debug") === "1";
  const trace = [];
  const tr = (m) => {
    trace.push(Date.now() - T0 + "ms " + m);
  };
  const say = (status) => new Response(JSON.stringify({ ok: status === 200, code, trace }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" }
  });
  if (!/^[0-9A-Z]{6}$/.test(code)) {
    return new Response("bad code", { status: 400, headers: { "cache-control": "public, s-maxage=86400" } });
  }
  const only = parseInt(u.searchParams.get("src") || "-1", 10);
  const list = only >= 0 && only < SRC.length ? [SRC[only]] : SRC;
  const race = async () => {
    const rs = await Promise.allSettled(list.map((f) => {
      const [url, ref] = f(code);
      return grab(url, ref, 2200);
    }));
    for (let i2 = 0; i2 < rs.length; i2++) {
      const v = rs[i2].status === "fulfilled" ? rs[i2].value : null;
      if (v) return { ...v, i: SRC.indexOf(list[i2]) };
    }
    return null;
  };
  {
    const got = await race();
    tr("\uC9C1\uC811 \uC18C\uC2A4 6\uACF3: " + (got ? "\uC131\uACF5 src=" + got.i : "\uC5C6\uC74C"));
    if (got) return dbg ? say(200) : imgResp(got, String(got.i));
  }
  let scraped = null;
  if (left() > 3200) {
    scraped = await discover(code);
    tr("\uC885\uBAA9 \uD398\uC774\uC9C0 \uD0D0\uC0C9: " + (scraped && scraped.logo ? "\uB85C\uACE0 \uC8FC\uC18C \uBC1C\uACAC" : scraped && scraped.home ? "\uD648\uD398\uC774\uC9C0\uB9CC \uBC1C\uACAC " + scraped.home : "\uC5C6\uC74C"));
  } else tr("\uD398\uC774\uC9C0 \uD0D0\uC0C9 \uC0DD\uB7B5(\uC608\uC0B0 \uBD80\uC871)");
  if (scraped && scraped.logo && left() > 1200) {
    const got = await grab(scraped.logo, "https://m.stock.naver.com/", Math.min(2600, left() - 300));
    tr("\uC2A4\uD06C\uB7A9 \uB85C\uACE0 \uB0B4\uB824\uBC1B\uAE30: " + (got ? "\uC131\uACF5" : "\uC2E4\uD328"));
    if (got) return dbg ? say(200) : imgResp(got, "scrape");
  }
  if (scraped && scraped.home) {
    const got = await favicon(scraped.home, left);
    tr("\uB124\uC774\uBC84 \uD648\uD398\uC774\uC9C0 \uD30C\uBE44\uCF58: " + (got ? "\uC131\uACF5" : "\uC2E4\uD328"));
    if (got) return dbg ? say(200) : imgResp(got, "favicon");
  }
  if (left() > 2600) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), Math.min(2400, left() - 400));
      const r = await fetch(new URL("/api/homepage?code=" + code, req2.url), { signal: ac.signal });
      clearTimeout(t);
      const j = r.ok ? await r.json() : null;
      tr("\uAC70\uB798\uC18C \uBA85\uBD80 \uC870\uD68C: " + (j && j.homepage ? j.homepage : j ? "\uBA85\uBD80\uC5D0 \uD648\uD398\uC774\uC9C0 \uC5C6\uC74C" : "HTTP " + r.status));
      if (j && j.homepage) {
        const got = await favicon(j.homepage, left);
        tr("\uBA85\uBD80 \uD648\uD398\uC774\uC9C0 \uD30C\uBE44\uCF58: " + (got ? "\uC131\uACF5" : "\uC2E4\uD328"));
        if (got) return dbg ? say(200) : imgResp(got, "kind");
      }
    } catch (e) {
      tr("\uAC70\uB798\uC18C \uBA85\uBD80 \uC870\uD68C \uC2E4\uD328: " + String(e).slice(0, 40));
    }
  } else tr("\uAC70\uB798\uC18C \uBA85\uBD80 \uC0DD\uB7B5(\uC608\uC0B0 \uBD80\uC871)");
  tr("\uCD5C\uC885: \uC774\uBBF8\uC9C0 \uC5C6\uC74C");
  if (dbg) return say(404);
  return new Response("not found", {
    status: 404,
    headers: { "cache-control": "public, s-maxage=21600", "access-control-allow-origin": "*" }
  });
};

// netlify/functions/logoscan.js
var UA19 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
var SRC2 = [
  (c) => ["https://static.toss.im/png-icons/securities/icn-A" + c + ".png", "https://toss.im/"],
  (c) => ["https://ssl.pstatic.net/imgstock/fn/real/logo/stock/A" + c + ".png", "https://finance.naver.com/"],
  (c) => ["https://thumb.tossinvest.com/image/resized/96x0/https%3A%2F%2Fstatic.toss.im%2Fpng-icons%2Fsecurities%2Ficn-A" + c + ".png", "https://tossinvest.com/"],
  (c) => ["https://file.alphasquare.co.kr/media/images/stock_logo/kr/" + c + ".png", "https://alphasquare.co.kr/"],
  (c) => ["https://static.toss.im/png-icons/securities/icn-A" + c + "-carrot.png", "https://toss.im/"],
  (c) => ["https://ssl.pstatic.net/imgstock/fn/real/logo/stock/A" + c + "_h.png", "https://finance.naver.com/"]
];
var NAMES = ["\uD1A0\uC2A4", "\uB124\uC774\uBC84", "\uD1A0\uC2A4\uC378\uB124\uC77C", "\uC54C\uD30C\uC2A4\uD018\uC5B4", "\uD1A0\uC2A4(\uBCC0\uD615)", "\uB124\uC774\uBC84(\uACE0\uD574\uC0C1)", "\uC790\uCCB4 \uC11C\uBC84 \uC911\uACC4"];
var MIN_BYTES2 = 260;
async function ok(url, referer, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: { "User-Agent": UA19, "Accept": "image/avif,image/webp,image/png,image/*,*/*;q=0.8", "Referer": referer }
    });
    if (!r.ok) return false;
    if (!/^image\//i.test(String(r.headers.get("content-type") || ""))) return false;
    const buf = await r.arrayBuffer();
    return !!buf && buf.byteLength >= MIN_BYTES2;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
async function judge(code) {
  const rs = await Promise.allSettled(SRC2.map((f) => {
    const [u, ref] = f(code);
    return ok(u, ref, 2200);
  }));
  for (let i = 0; i < rs.length; i++) if (rs[i].status === "fulfilled" && rs[i].value) return i;
  return -1;
}
var logoscan_default = async (req2) => {
  const u = new URL(req2.url);
  const codes = String(u.searchParams.get("codes") || "").toUpperCase().split(",").map((c) => c.replace(/[^0-9A-Z]/g, "")).filter((c) => /^[0-9A-Z]{6}$/.test(c)).slice(0, 8);
  const found = {}, miss = [];
  let i = 0;
  const lane = async () => {
    while (i < codes.length) {
      const c = codes[i++];
      const r = await judge(c);
      if (r >= 0) found[c] = r;
      else miss.push(c);
    }
  };
  await Promise.all(Array.from({ length: 8 }, lane));
  return new Response(JSON.stringify({ ok: found, no: miss, srcNames: NAMES }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, s-maxage=86400",
      // 같은 묶음은 하루 한 번만 실제 판정
      "access-control-allow-origin": "*"
    }
  });
};

// netlify/functions/market.js
init_euckr();
function _mkDec8(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
var UA20 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
var H = { "User-Agent": UA20, "Referer": "https://finance.naver.com/", "Accept": "application/json" };
var num7 = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;
var ymd5 = (d) => d.toISOString().slice(0, 10);
/* ══ [v9.73] 타임아웃 없는 fetch 를 없앤다 ═══════════════════════════════════
   외부 서버가 응답을 붙잡고 놓지 않으면 워커 요청 하나가 통째로 매달린다.
   Cloudflare 는 일정 시간이 지나면 요청을 끊지만, 그때까지 CPU·연결이 묶여
   같은 시간대의 다른 요청까지 느려진다. 타임아웃이 빠져 있던 곳(트레이딩뷰,
   구글 OAuth)에 공용 헬퍼를 씌운다. */
async function fetchOpt(url, opt, ms) {
  /* 기존 fetchTO(url, ms, headers) 와 인자 순서가 달라 이름을 나눈다 —
     같은 이름으로 두면 나중 선언이 앞의 것을 덮어 호출부가 조용히 어긋난다. */
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 6000);
  try { return await fetch(url, { ...(opt || {}), signal: c.signal }); }
  finally { clearTimeout(t); }
}
async function jget8(url, ms = 4e3, headers = H) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers, signal: c.signal });
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
async function tget(url, ms = 4e3) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA20 }, signal: c.signal });
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}
var settle2 = (p) => p.then((v) => v).catch(() => null);
async function pollingIndex(codes) {
  const j = await jget8(`https://polling.finance.naver.com/api/realtime/domestic/index/${codes}`, 4e3);
  const datas = j?.datas || (j?.result?.areas || []).flatMap((a) => a.datas || []) || [];
  const map = {}, arr = [];
  datas.forEach((d, i) => {
    const price = num7(d.closePrice ?? d.nv);
    const ratio = num7(d.fluctuationsRatio ?? d.cr);
    let change = Math.abs(num7(d.compareToPreviousClosePrice ?? d.cv));
    if (ratio < 0) change = -change;
    const cur = { price, change, rate: ratio };
    const key = String(d.cd ?? d.itemCode ?? "").toUpperCase();
    if (key) map[key] = cur;
    arr[i] = cur;
  });
  return { map, arr };
}
/* ══ [v9.71] 국내 지수 실시간을 여러 곳에서 받아 교차검증한다 ════════════════
   [무엇이 잘못됐나] 지금까지 코스피·코스닥 현재가는 polling.finance.naver.com
   한 곳에만 의존했다. 그 경로가 막히거나 형식이 바뀌면 값이 통째로 비고,
   그러면 pack() 이 조용히 '30일 일봉의 마지막 종가'를 현재가 자리에 넣었다.
   장중에 어제 종가가 오늘 지수처럼 보이던 이유가 이것이다.
   [고침] 성격이 다른 세 경로를 함께 두드린다.
     ① polling.finance.naver.com  — 실시간 전용(가장 빠름)
     ② m.stock.naver.com  /api/index/{code}/basic — 모바일 앱이 쓰는 경로
     ③ finance.naver.com/sise/sise_index.naver — HTML(EUC-KR) 직접 파싱
   먼저 도착한 값을 쓰되, 다른 경로와 0.6% 넘게 어긋나면 '둘 이상이 합의한 값'을
   고른다(한 곳의 형식 오독을 다른 두 곳이 잡아 준다).
   등락·등락률은 받은 그대로 믿지 않고 전일 종가로 다시 계산해 일관성을 맞춘다. */
function idxSane(o) {
  if (!o || !(o.price > 0)) return false;
  if (!isFinite(o.change) || !isFinite(o.rate)) return false;
  if (Math.abs(o.rate) > 20) return false;                 // 하루 20% 넘는 지수 변동은 파싱 오류
  return true;
}
/* 등락·등락률·현재가의 앞뒤를 맞춘다 — 셋 중 둘만 맞아도 나머지를 복원할 수 있다 */
function idxNorm(price, change, rate) {
  price = Number(price); change = Number(change); rate = Number(rate);
  if (!(price > 0)) return null;
  let prev = null;
  if (isFinite(change) && change !== 0) prev = price - change;
  if ((prev == null || !(prev > 0)) && isFinite(rate) && rate !== 0) prev = price / (1 + rate / 100);
  if (!(prev > 0)) prev = price;
  /* 부호가 어긋나면(절대값만 준 경우) 등락률 쪽 부호를 따른다 */
  if (isFinite(rate) && rate !== 0 && isFinite(change) && change !== 0
      && (rate > 0) !== (change > 0)) { change = -change; prev = price - change; }
  const ch = price - prev;
  return { price, change: ch, rate: prev ? ch / prev * 100 : 0, prev };
}
async function mstockIndex(code) {
  try {
    const j = await jget8(`https://m.stock.naver.com/api/index/${code}/basic`, 3500,
      { "User-Agent": UA20, Accept: "application/json", Referer: "https://m.stock.naver.com/" });
    if (!j) return null;
    const d = j.result || j.datas || j;
    const o = idxNorm(num7(d.closePrice ?? d.nv ?? d.now),
      num7(d.compareToPreviousClosePrice ?? d.cv ?? d.change),
      num7(d.fluctuationsRatio ?? d.cr ?? d.changeRate));
    return idxSane(o) ? o : null;
  } catch (e) { return null; }
}
async function siseIndexScrape(code) {
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 4500);
    const r = await fetch(`https://finance.naver.com/sise/sise_index.naver?code=${code}`,
      { headers: { "User-Agent": UA20, Accept: "text/html,*/*", "Accept-Language": "ko",
        Referer: "https://finance.naver.com/sise/" }, signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const h = decodeSmart9(await r.arrayBuffer(), r.headers.get("content-type"));
    const strip = (v) => String(v || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").replace(/,/g, "").trim();
    const nv = h.match(/id="now_value"[^>]*>([\s\S]*?)<\/(?:span|em|strong)>/i);
    if (!nv) return null;
    const price = Number(strip(nv[1]));
    if (!(price > 0)) return null;
    const cw = h.match(/id="change_value_and_rate"[^>]*>([\s\S]*?)<\/(?:span|em|strong)>/i);
    let change = 0, rate = 0;
    if (cw) {
      const txt = strip(cw[1]);
      const nums = txt.match(/-?\d+(?:\.\d+)?/g) || [];
      if (nums.length >= 1) change = Number(nums[0]);
      if (nums.length >= 2) rate = Number(nums[1]);
      if (/하락|마이너스|down/i.test(cw[1]) || /하락/.test(txt)) { change = -Math.abs(change); rate = -Math.abs(rate); }
    }
    const o = idxNorm(price, change, rate);
    return idxSane(o) ? o : null;
  } catch (e) { return null; }
}
/* 세 경로의 값을 견줘 가장 믿을 만한 하나를 고른다 */
function idxAgree(list) {
  const ok = list.filter(idxSane);
  if (!ok.length) return null;
  if (ok.length === 1) return ok[0];
  /* 서로 0.6% 안쪽인 짝이 있으면 그 무리(가장 큰 무리)의 첫 값을 쓴다 */
  let best = null, bestN = 0;
  for (const a of ok) {
    const n = ok.filter(b => Math.abs(b.price - a.price) / a.price < 0.006).length;
    if (n > bestN) { bestN = n; best = a; }
  }
  return best || ok[0];
}
async function krIndexRealtime(code, fromPolling) {
  const [ms, sc] = await Promise.all([settle2(mstockIndex(code)), settle2(siseIndexScrape(code))]);
  const pol = fromPolling ? idxNorm(fromPolling.price, fromPolling.change, fromPolling.rate) : null;
  const pick = idxAgree([pol, ms, sc]);
  if (!pick) return null;
  return { price: pick.price, change: pick.change, rate: pick.rate,
    src: pick === pol ? "polling" : pick === ms ? "mstock" : "sise" };
}
async function naverIndexHist(code) {
  try {
    const d = await jget8(`https://m.stock.naver.com/api/index/${code}/price?pageSize=30&page=1`, 3500);
    const a = Array.isArray(d) ? d : d.result || d.datas || [];
    return a.map((x) => num7(x.closePrice)).filter((n) => n > 0).reverse();
  } catch {
    return [];
  }
}
/* ══ [v9.71] 지수 카드 스파크를 '당일 분봉'으로 ═══════════════════════════════
   [무엇이 틀렸나] 카드의 작은 그래프가 최근 30일 '일봉 종가'였다. 오늘 +3.5%
   갭 상승한 날에도 한 달 흐름이 하락이면 그래프는 내리막으로 보였다 — 증권사
   앱(당일 분봉)과 전혀 다른 그림이라 '지수가 안 맞는' 인상을 줬다.
   [고침] fchart 분봉(지수 심볼도 지원)에서 마지막 거래일 하루치를 골라 쓴다.
   실시간이 살아 있으면 마지막 점을 현재가로 맞춘다. 분봉이 안 오면 예전처럼
   30일 일봉으로 물러난다. 실시간이 죽은 날은 일봉을 우선한다 — 값 대체(pack)가
   일봉 마지막 종가를 쓰기 때문이다. */
async function idxSparkSmart(code, rt) {
  const alive = !!(rt && rt.price);
  if (alive) {
    try {
      const mc = await fchartMinute(code);
      if (mc && mc.length > 5) {
        const days = [...new Set(mc.map((c) => c.d.slice(0, 8)))].sort();
        let day = mc.filter((c) => c.d.slice(0, 8) === days[days.length - 1]).map((c) => c.c);
        if (day.length < 5 && days.length > 1)
          day = mc.filter((c) => c.d.slice(0, 8) === days[days.length - 2]).map((c) => c.c).concat(day);
        if (day.length > 60) {
          const st = day.length / 60, out = [];
          for (let i = 0; i < 60; i++) out.push(day[Math.floor(i * st)]);
          out.push(day[day.length - 1]);
          day = out;
        }
        if (day.length >= 5) {
          if (rt.price > 0 && Math.abs(day[day.length - 1] - rt.price) / rt.price < 0.05)
            day[day.length - 1] = rt.price;
          return { hist: day, intraday: 1 };
        }
      }
    } catch (e) {}
  }
  try {
    const h = await naverIndexHist(code);
    if (h && h.length >= 2) return { hist: h, intraday: 0 };
  } catch (e) {}
  return { hist: [], intraday: 0 };
}
async function yahooIndex2(sym) {
  const d = await jget8(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1d`, 4500, { "User-Agent": UA20, "Accept": "application/json" });
  const r = d && d.chart && d.chart.result && d.chart.result[0];
  if (!r) return null;
  const closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close || []).filter((v) => v != null && v > 0);
  const meta = r.meta || {};
  const price = Number(meta.regularMarketPrice) || (closes.length ? closes[closes.length - 1] : 0);
  if (!price) return null;
  const fromArr = closes.length > 1 ? closes[closes.length - 2] : 0;
  let prev = Number(meta.regularMarketPreviousClose) || Number(meta.previousClose) || fromArr || Number(meta.chartPreviousClose) || price;
  if (prev > 0 && Math.abs(price - prev) / prev > 0.12 && fromArr > 0) prev = fromArr;
  const history = closes.slice(-30);
  if (history.length && history[history.length - 1] !== price) history.push(price);
  return { price, change: price - prev, rate: prev ? (price - prev) / prev * 100 : 0, history };
}
/* ══ [v4.48] 해외 지수·선물·코인 — 야후 하나만 보다가 429 로 함께 죽었다 ═════
   현재가·등락은 CNBC(지수 ".SPX" / 선물 "@ND.1" 표기), 코인은 Coinbase 공개 API,
   스파크라인 30일은 Stooq 일봉으로 채운다. 야후·네이버는 예비로 남긴다. */
async function cnbcIndex(sym){
  const j=await jget8("https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols="
    +encodeURIComponent(sym)+"&requestMethod=itv&noform=1&partnerId=2&output=json",5e3,
    { "User-Agent": UA20, "Accept": "application/json" });
  let arr=j&&j.FormattedQuoteResult&&j.FormattedQuoteResult.FormattedQuote;
  if(arr&&!Array.isArray(arr))arr=[arr];
  const d=arr&&arr[0]; if(!d)return null;
  const price=usSuffixNum(d.last); if(price==null)return null;
  const chg=usSuffixNum(d.change);
  let prev=usSuffixNum(d.previous_day_closing); if(prev==null&&chg!=null)prev=price-chg;
  /* [v9.71] 현재가·등락·등락률의 앞뒤를 맞춘다 — 셋이 어긋나면 화면 숫자가 서로 안 맞는다 */
  const n2 = idxNorm(price, chg != null ? chg : (prev != null ? price - prev : 0),
    usSuffixNum(d.change_pct) || 0);
  if (n2) return { price: n2.price, change: n2.change, rate: n2.rate, history: [] };
  return { price, change:chg!=null?chg:(prev!=null?price-prev:0),
           rate:(prev&&prev>0)?(price-prev)/prev*100:(usSuffixNum(d.change_pct)||0), history:[] };
}
async function stooqHist30(stooqSym){
  try{
    const t = await tget(`https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d`, 3500);
    const h = t.trim().split("\n").slice(1).map((l) => Number(l.split(",")[4])).filter((n) => !isNaN(n) && n > 0).slice(-30);
    return h.length >= 2 ? h : null;
  }catch{ return null; }
}
async function coinIndex(pair){ /* pair: "BTC-USD" — Coinbase 는 워커 IP 에도 열려 있다 */
  try{
    const cur=await jget8("https://api.coinbase.com/v2/prices/"+pair+"/spot",4e3,{ "User-Agent": UA20, "Accept":"application/json" });
    const price=Number(cur&&cur.data&&cur.data.amount);
    if(!(price>0))return null;
    let hist=null,prev=null;
    try{
      const cd=await jget8("https://api.exchange.coinbase.com/products/"+pair+"/candles?granularity=86400",4500,{ "User-Agent": UA20, "Accept":"application/json" });
      if(Array.isArray(cd)&&cd.length>2){
        const closes=cd.slice(0,31).map((a)=>Number(a&&a[4])).filter((n)=>n>0).reverse(); /* 최신이 배열 앞에 온다 */
        if(closes.length>=2){ hist=closes; prev=closes[closes.length-2]; }
      }
    }catch{}
    if(prev==null)prev=price;
    const h=(hist||[]).slice(-30); if(h.length&&h[h.length-1]!==price)h.push(price);
    return { price, change:price-prev, rate:prev?(price-prev)/prev*100:0, history:h };
  }catch{ return null; }
}
var CNBC_IDX={ "^IXIC":".IXIC","^GSPC":".SPX","^DJI":".DJI","^VIX":".VIX",
  "^N225":".N225","^HSI":".HSI","NQ=F":"@ND.1","ES=F":"@SP.1","YM=F":"@DJ.1","CL=F":"@CL.1","GC=F":"@GC.1" };
var STOOQ_IDX={ "^IXIC":"^ndq","^GSPC":"^spx","^DJI":"^dji","^N225":"^nkx","CL=F":"cl.f","GC=F":"gc.f","NQ=F":"nq.f","ES=F":"es.f","YM=F":"ym.f" };
/* [v5.9] 야후 차트에서 최근 흐름을 받아 온다 — Stooq 가 막힌 날의 대체 경로 */
async function yahooIndexHist(sym){
  try{
    const t=await tget("https://query1.finance.yahoo.com/v8/finance/chart/"
      +encodeURIComponent(sym)+"?range=5d&interval=30m",4500);
    const j=JSON.parse(t);
    const r=j&&j.chart&&j.chart.result&&j.chart.result[0];
    const c=r&&r.indicators&&r.indicators.quote&&r.indicators.quote[0]&&r.indicators.quote[0].close;
    if(!Array.isArray(c))return null;
    return c.filter(v=>typeof v==="number"&&isFinite(v)&&v>0);
  }catch(e){ return null; }
}
async function worldIndex(yahooSym, stooqSym, naverCode) {
  const [cur, hist] = await Promise.all([
    CNBC_IDX[yahooSym] ? settle2(cnbcIndex(CNBC_IDX[yahooSym])) : Promise.resolve(null),
    settle2(stooqHist30(stooqSym))
  ]);
  if (cur && cur.price) {
    let h = (hist || []).slice(-30);
    /* ══ [v5.9] 이력이 비면 그래프가 통째로 사라진다 ═══════════════════════════
       Stooq 가 응답하지 않는 날이 있는데, 그때 history 가 빈 배열로 나가
       화면에서는 '그래프 없음'이 된다(나스닥·S&P500·다우가 그 경우다).
       야후 차트로 한 번 더 시도한다 — 여기서도 못 받으면 그때는 그리지 않는다. */
    if (h.length < 3) {
      try {
        const y = await yahooIndexHist(yahooSym);
        if (y && y.length >= 3) h = y.slice(-30);
      } catch {}
    }
    if (h.length && h[h.length - 1] !== cur.price) h.push(cur.price);
    cur.history = h; return cur;
  }
  if (hist && hist.length >= 2)
    return { price: hist[hist.length - 1], change: hist[hist.length - 1] - hist[hist.length - 2], rate: (hist[hist.length - 1] - hist[hist.length - 2]) / hist[hist.length - 2] * 100, history: hist };
  try {
    const y = await yahooIndex2(yahooSym);
    if (y && y.price) return y;
  } catch {
  }
  try {
    const h = await naverIndexHist(naverCode);
    if (h.length >= 2) return { price: h[h.length - 1], change: h[h.length - 1] - h[h.length - 2], rate: (h[h.length - 1] - h[h.length - 2]) / h[h.length - 2] * 100, history: h };
  } catch {
  }
  return null;
}
async function fxSeries(from, mult = 1) {
  try {
    const end = /* @__PURE__ */ new Date();
    const start = /* @__PURE__ */ new Date();
    start.setDate(start.getDate() - 45);
    const d = await jget8(`https://api.frankfurter.app/${ymd5(start)}..${ymd5(end)}?from=${from}&to=KRW`, 4e3, { "User-Agent": UA20 });
    const rates = d?.rates || {};
    return Object.keys(rates).sort().map((k) => Number(rates[k]?.KRW) * mult).filter((n) => n > 0).slice(-30);
  } catch {
    return [];
  }
}
async function yahooOnly(sym) {
  /* [v4.48] 이름과 달리 이제 야후만 보지 않는다 — 코인은 Coinbase,
     지수·선물은 CNBC+Stooq 를 먼저 본다(야후 429 대비). 함수명은 호출부를
     건드리지 않으려고 그대로 둔다. */
  if (sym === "BTC-USD" || sym === "ETH-USD") {
    const c = await settle2(coinIndex(sym));
    if (c) return c;
  }
  if (CNBC_IDX[sym] || STOOQ_IDX[sym]) {
    const [cur, hist] = await Promise.all([
      CNBC_IDX[sym] ? settle2(cnbcIndex(CNBC_IDX[sym])) : Promise.resolve(null),
      STOOQ_IDX[sym] ? settle2(stooqHist30(STOOQ_IDX[sym])) : Promise.resolve(null)
    ]);
    if (cur && cur.price) {
      let h = (hist || []).slice(-30);
      /* [v6.0] 여기에도 대체 경로가 없어 VIX·니케이·항셍·원유·금 그래프가 비어 있었다 */
      if (h.length < 3) {
        try { const y = await yahooIndexHist(sym); if (y && y.length >= 3) h = y.slice(-30); } catch {}
      }
      if (h.length && h[h.length - 1] !== cur.price) h.push(cur.price);
      cur.history = h; return cur;
    }
    if (hist && hist.length >= 2)
      return { price: hist[hist.length - 1], change: hist[hist.length - 1] - hist[hist.length - 2], rate: (hist[hist.length - 1] - hist[hist.length - 2]) / hist[hist.length - 2] * 100, history: hist };
  }
  try {
    const y = await yahooIndex2(sym);
    /* [v6.0] 야후 시세만 받고 이력이 비면 그래프가 사라진다 — 차트에서 흐름을 받아 붙인다 */
    if (y && y.price && (!y.history || y.history.length < 3)) {
      try { const h = await yahooIndexHist(sym); if (h && h.length >= 3) y.history = h.slice(-30); } catch {}
    }
    return y;
  } catch {
    return null;
  }
}
function decodeSmart9(buf, contentType) {
  const bytes = new Uint8Array(buf);
  const head = _mkDec8("latin1").decode(bytes.slice(0, 1500));
  let declared = ((String(contentType || "").match(/charset=["']?([\w-]+)/i) || head.match(/charset=["']?([\w-]+)/i) || [])[1] || "").toLowerCase();
  const tryDec = (enc, fatal) => {
    try {
      return _mkDec8(enc, { fatal }).decode(bytes);
    } catch {
      return null;
    }
  };
  return tryDec("utf-8", true) || (declared && declared !== "utf-8" && declared !== "utf8" ? tryDec(declared, true) : null) || tryDec("euc-kr", true) || tryDec("utf-8", false);
}
async function hankyungK200() {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 6e3);
  try {
    let h = null;
    for (const hu of ["https://markets.hankyung.com/indices/kospi-future", "https://markets.hankyung.com/futures", "https://markets.hankyung.com/koreaindex"]) {
      try {
        const r = await fetch(hu, { headers: { "User-Agent": UA20, Accept: "text/html,*/*", "Accept-Language": "ko", Referer: "https://markets.hankyung.com/" }, signal: c.signal });
        if (!r.ok) continue;
        const txt = await r.text();
        if (txt.includes("\uCF54\uC2A4\uD53C200")) {
          h = txt;
          break;
        }
      } catch {
      }
    }
    if (!h) return null;
    const i = h.indexOf("\uCF54\uC2A4\uD53C200 \uC120\uBB3C");
    if (i < 0) return null;
    const win = h.slice(i, i + 1500);
    const nums = [...win.matchAll(/([0-9]{1,4}(?:,[0-9]{3})*\.[0-9]{2})/g)].map((m) => Number(m[1].replace(/,/g, "")));
    const price = nums.find((v) => v > 50 && v < 5e3);
    if (!price) return null;
    const pm = win.match(/([+-]?[0-9]+(?:\.[0-9]+)?)\s*%/);
    const rate = pm ? Number(pm[1]) : 0;
    let mag = nums.find((v) => v !== price && v > 0 && v < price * 0.2);
    if (mag == null) mag = Math.abs(price - price / (1 + rate / 100));
    const change = Math.abs(mag) * (rate < 0 ? -1 : rate > 0 ? 1 : 0);
    const dm = win.match(/(20\d{2}\.\d{2}\.\d{2})/);
    return { price, change, rate, asOf: dm ? dm[1].replace(/\./g, "-") : null };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
async function navIdxSeries(code) {
  const d = await jget8(`https://m.stock.naver.com/api/index/${code}/price?pageSize=30&page=1`, 3500);
  const a = Array.isArray(d) ? d : d && (d.result || d.datas) || [];
  return a.map((x) => num7(x.closePrice)).filter((n) => n > 30 && n < 2e4).reverse();
}
async function krFutures() {
  const out = { day: null, night: null, diag: [] };
  let k200 = 0;
  try {
    const kh = await navIdxSeries("KPI200");
    if (kh.length) k200 = kh[kh.length - 1];
    out.diag.push("KPI200:" + (k200 || "fail"));
  } catch (e) {
    out.diag.push("KPI200:" + String(e).slice(0, 24));
  }
  /* [v6.3] 야간은 미국장을 따라 크게 움직인다. 8% 는 좁아 정상값도 걸러낼 수 있다.
     코스피200 자체가 900을 넘긴 지 오래라 상한 900 도 맞지 않는다(현재 977). */
  const plaus = (px) => !k200 ? (px > 100 && px < 5000) : Math.abs(px - k200) / k200 < 0.15;
  const fromSeries = (h) => {
    if (h.length < 2) return null;
    const price = h[h.length - 1], prev = h[h.length - 2];
    if (!plaus(price)) return { bad: price };
    return { price, change: price - prev, rate: prev ? (price - prev) / prev * 100 : 0, history: h };
  };
  try {
    const r = fromSeries(await navIdxSeries("FUT"));
    if (r && !r.bad) {
      out.day = r;
      out.src = "m.stock/FUT";
      out.diag.push("m.index/FUT:ok " + r.price);
    } else out.diag.push("m.index/FUT:" + (r ? "implausible " + r.bad + " vs K200 " + k200 : "nodata"));
  } catch (e) {
    out.diag.push("m.index/FUT:" + String(e).slice(0, 30));
  }
  if (!out.day) {
    try {
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), 4500);
      const r = await fetch(
        "https://finance.naver.com/sise/sise_index_day.naver?code=FUT&page=1",
        { headers: { "User-Agent": UA20, Accept: "text/html,*/*", "Accept-Language": "ko", Referer: "https://finance.naver.com/sise/sise_index.naver?code=FUT" }, signal: c2.signal }
      );
      clearTimeout(t2);
      if (r.ok) {
        const html = decodeSmart9(await r.arrayBuffer(), r.headers.get("content-type"));
        const vals = [...html.matchAll(/class="number_1"[^>]*>\s*([0-9,]+\.[0-9]{2})/g)].map((m) => Number(m[1].replace(/,/g, "")));
        const ser = vals.filter((v) => v > 100 && v < 5e3).slice(0, 12).reverse();
        const g = fromSeries(ser);
        if (g && !g.bad) {
          out.day = g;
          out.src = "index_day/FUT";
          out.diag.push("index_day:ok " + g.price);
        } else out.diag.push("index_day:" + (g ? "implausible " + g.bad : "rows" + ser.length));
      } else out.diag.push("index_day:" + r.status);
    } catch (e) {
      out.diag.push("index_day:" + String(e).slice(0, 30));
    }
  }
  const dayClose = out.day && out.day.price ? out.day.price : 0;
  /* [v4.10] 야간값 인메모리 캐시 — 한 번이라도 잡히면 15분간 원천 장애를 버틴다 */
  globalThis.__nfMem = globalThis.__nfMem || { at: 0, q: null };
  const takeNight = (px, src) => {
    /* [v6.3] 값이 얼마였고 왜 걸러졌는지까지 남긴다 — 다음에 무엇을 고칠지 알기 위해 */
    out.diag.push("try/" + src + ":" + (px > 0 ? px : "0")
      + (px > 0 ? (plaus(px) ? " ok" : " out-of-range(K200=" + (k200 || "?") + ")") : ""));
    if (px > 0 && plaus(px)) out.nightSrc = src;
    if (!(px > 0) || !plaus(px)) {
      out.diag.push("night/" + src + ":implausible " + px);
      return false;
    }
    if (dayClose && Math.abs(px - dayClose) < 5e-3) {
      out.diag.push("night/" + src + ":same-as-day " + px);
      return false;
    }
    const base3 = dayClose || px;
    out.night = { price: px, change: px - base3, rate: base3 ? (px - base3) / base3 * 100 : 0, basis: dayClose ? "dayClose" : "self" };
    globalThis.__nfMem = { at: Date.now(), q: out.night };
    out.diag.push("night/" + src + ":ok " + px);
    return true;
  };
  /* ══ [v6.2] 야간선물 — 찾을 수 있는 길을 모두 두드린다 ═══════════════════════
     [사실관계] 2025년 6월부터 KRX 가 야간거래를 자체 운영한다(18:00~익일 06:00).
     주간선물은 m.stock.naver.com/api/index/FUT 로 잘 들어오므로, 야간도 같은
     체계 어딘가에 있을 가능성이 높다. 다만 코드 이름을 확신할 수 없다.
     [방법] ① 네이버 지수 코드 후보를 넓게 훑고 ② 선물 전용 API 도 두드리고
     ③ 그래도 없으면 인베스팅닷컴에서 종목을 찾아 시세를 받는다.
     성공한 경로는 diag 에 남겨, 어느 길이 살아 있는지 나중에 확인할 수 있게 한다. */
  /* ══ [v8.5] 트레이딩뷰 KRX 심볼 — 야간 세션이 포함된 값 ═══════════════════
     [찾아낸 사실] 트레이딩뷰에 KRX 코스피200 선물이 'KRX:K2I1!' 로 올라와 있다.
     KRX 직상장 심볼이라 2025년 6월부터 KRX 가 자체 운영하는 야간 세션(18:00~06:00)
     체결가가 그대로 반영된다. 미래에셋 앱이 보여 주는 1,057.45 와 같은 계통이다.
     [왜 이걸 1순위로] 네이버 코드 추측(전부 nodata), KRX 통계(400), 인베스팅 검색(none)이
     모두 실패했다. 이미 이 앱에서 쓰고 있는 트레이딩뷰 경로가 가장 확실하다. */
  if (!out.night) {
    const TV_SYMS = ["KRX:K2I1!", "KRX:K2IZ2026", "KRX:K2I2!", "KRX:K200F1!"];
    for (const sym of TV_SYMS) {
      if (out.night) break;
      try {
        const r = await fetchOpt("https://scanner.tradingview.com/symbol?symbol="
          + encodeURIComponent(sym)
          + "&fields=lp,ch,chp,prev_close_price,update_mode,volume&no_404=true", {
          headers: { "User-Agent": UA20, Accept: "application/json",
            Referer: "https://www.tradingview.com/" }
        });
        if (!r.ok) { out.diag.push("night/tv/" + sym + ":" + r.status); continue; }
        const j = await r.json();
        const px = num9(j && j.lp);
        if (px > 0) {
          takeNight(px, "tv/" + sym);
          if (out.night) {
            const ch = num9(j.ch), chp = num9(j.chp), pc = num9(j.prev_close_price);
            if (ch) out.night.change = ch;
            else if (pc > 0) out.night.change = +(px - pc).toFixed(2);
            if (chp) out.night.rate = chp;
            else if (pc > 0) out.night.rate = +((px - pc) / pc * 100).toFixed(2);
          }
        } else out.diag.push("night/tv/" + sym + ":nolp");
      } catch (e) { out.diag.push("night/tv/" + sym + ":" + String(e).slice(0, 14)); }
    }
  }
  /* ══ [v8.5] 트레이딩뷰 히스토리 — 위에서 현재가만 받았을 때 흐름을 채운다 ═══ */
  if (out.night && (!out.night.history || out.night.history.length < 3)) {
    try {
      const to = Math.floor(Date.now() / 1000), from = to - 3 * 86400;
      const r = await fetchOpt("https://history-data.tradingview.com/history?symbol="
        + encodeURIComponent("KRX:K2I1!") + "&resolution=5&from=" + from + "&to=" + to, {
        headers: { "User-Agent": UA20, Accept: "application/json",
          Referer: "https://www.tradingview.com/" }
      });
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.c) && j.c.length >= 3)
          out.night.history = j.c.map(Number).filter((v) => v > 0).slice(-30);
      }
    } catch (e) {}
  }
  /* ══ [v6.3] 코드를 추측하지 말고 네이버에 직접 물어본다 ═══════════════════
     [진단으로 확인된 사실] 제가 넣은 야간 코드 12개가 전부 'nodata' 였다.
     즉 코드 이름을 계속 찍어 맞히려던 것이 문제였다. 주간(FUT)은 잘 되므로
     네이버 체계 안에 야간도 있을 텐데, 그 이름을 모를 뿐이다.
     [방법] 종목검색에 쓰는 자동완성 API 로 '야간선물'을 검색해 코드를 받아 온다.
     찾은 코드는 KV 에 담아 두고, 다음부터는 그 코드로 바로 조회한다. */
  const discoverNightCode = async () => {
    try {
      const cached = KV ? await KV.get("k200nf:code", "json") : null;
      if (cached && cached.code && Date.now() - (cached.at || 0) < 3 * 864e5) return cached.code;
    } catch (e) {}
    const seen = [];
    for (const q of ["코스피200 야간선물", "야간선물", "코스피200야간", "K200 야간"]) {
      for (const mk of [
        `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=index,stock,etf`,
        `https://m.stock.naver.com/front-api/search/autoComplete?query=${encodeURIComponent(q)}&target=index%2Cstock`
      ]) {
        try {
          const j = await jget8(mk, 3500, HDRS);
          const flat = JSON.stringify(j || {});
          /* 응답 어디에 있든 '야간'이 붙은 항목의 코드를 긁어 온다 */
          for (const m of flat.matchAll(/"(?:code|itemCode|reutersCode|symbolCode)"\s*:\s*"([A-Z0-9_]{2,20})"/g)) {
            const c = m[1];
            if (!seen.includes(c)) seen.push(c);
          }
        } catch (e) {}
      }
    }
    out.diag.push("night/discover:" + (seen.length ? seen.slice(0, 8).join(",") : "none"));
    /* 찾은 후보를 실제로 두드려 본다 — 값이 그럴듯하면 그 코드가 정답이다 */
    for (const c of seen) {
      try {
        const h = await navIdxSeries(c);
        const px = h.length ? h[h.length - 1] : 0;
        if (px > 0 && plaus(px)) {
          try { if (KV) await KV.put("k200nf:code", JSON.stringify({ code: c, at: Date.now() }), { expirationTtl: 604800 }); } catch (e) {}
          out.diag.push("night/discover:hit " + c + " " + px);
          return c;
        }
      } catch (e) {}
    }
    return null;
  };
  {
    const found = await discoverNightCode();
    if (found) {
      try {
        const h = await navIdxSeries(found);
        if (h.length) takeNight(h[h.length - 1], "discover/" + found);
        if (out.night && h.length >= 3) out.night.history = h.slice(-30);
      } catch (e) {}
    }
  }
  const NIGHT_CODES = ["FUTN", "NFUT", "FUT_N", "FUTNIGHT", "NIGHTFUT", "FUT_NIGHT",
    "K200NF", "KOSPI200FN", "NKF", "CME_FUT", "FUT2", "KPI200FN"];
  for (const nc of NIGHT_CODES) {
    if (out.night) break;
    try {
      const h = await navIdxSeries(nc);
      if (h.length) takeNight(h[h.length - 1], "m.index/" + nc);
      else out.diag.push("night/m.index/" + nc + ":nodata");
    } catch (e) {
      out.diag.push("night/m.index/" + nc + ":" + String(e).slice(0, 16));
    }
  }
  /* ② 네이버 지수 basic — price 배열이 아니라 현재가만 주는 경우 */
  if (!out.night) {
    for (const nc of NIGHT_CODES) {
      if (out.night) break;
      try {
        const j = await jget8(`https://m.stock.naver.com/api/index/${nc}/basic`, 3000, HDRS);
        const px = num9(j && (j.closePrice ?? j.nowVal ?? j.currentPrice));
        if (px > 0) takeNight(px, "m.basic/" + nc);
      } catch (e) {}
    }
  }
  /* ══ [v6.3] 인베스팅닷컴 선물 페이지에서 직접 읽는다 ═══════════════════════
     [왜 이 방법인가] KRX 야간장은 '별도 상품'이 아니라 같은 코스피200 선물을
     밤에도 거래하는 것이다. 인베스팅닷컴의 코스피200 선물 페이지는 그 값을
     실시간으로 보여 주고, 숫자가 HTML 안에 그대로 담겨 온다(검색 결과로 확인).
     검색 API 를 두드릴 필요 없이 페이지 하나만 읽으면 된다. */
  if (!out.night) {
    const PAGES = [
      "https://www.investing.com/indices/korea-200-futures",
      "https://kr.investing.com/indices/korea-200-futures"
    ];
    for (const u of PAGES) {
      if (out.night) break;
      try {
        const h = await tget(u, 6000);
        let px = 0;
        /* ① 화면에 쓰이는 표시값 — data-test 속성이 가장 확실하다 */
        let m = /data-test="instrument-price-last"[^>]*>([\d,]+\.?\d*)</.exec(h);
        if (m) px = num9(m[1]);
        /* ② 페이지에 심어 둔 데이터 뭉치 */
        if (!px) { m = /"last"\s*:\s*"?([\d,]+\.?\d*)"?/.exec(h); if (m) px = num9(m[1]); }
        if (!px) { m = /"last_close"\s*:\s*"?([\d,]+\.?\d*)"?/.exec(h); if (m) px = num9(m[1]); }
        /* ③ 문장으로 적힌 현재가 */
        if (!px) { m = /KOSPI 200 Futures price is\s*([\d,]+\.?\d*)/i.exec(h); if (m) px = num9(m[1]); }
        if (px > 0) {
          let prev = 0;
          const pm = /data-test="prevClose"[^>]*>([\d,]+\.?\d*)</.exec(h)
            || /"prev_close"\s*:\s*"?([\d,]+\.?\d*)"?/.exec(h);
          if (pm) prev = num9(pm[1]);
          takeNight(px, "investing-page");
          if (out.night && prev > 0) {
            out.night.change = +(px - prev).toFixed(2);
            out.night.rate = +((px - prev) / prev * 100).toFixed(2);
          }
        } else out.diag.push("night/inv-page:no-price");
      } catch (e) { out.diag.push("night/inv-page:" + String(e).slice(0, 16)); }
    }
  }
  /* ══ [v6.3] KRED — 한국거래소 체결 데이터로 만든 야간선물 1분봉 ═══════════
     야간선물만 전문으로 다루는 곳이라 값이 정확하다. 경로를 몇 가지 두드려 본다. */
  if (!out.night) {
    for (const u of [
      "https://kred.dev/api/kospi-200-night-futures",
      "https://kred.dev/api/series/kospi-200-night-futures",
      "https://kred.dev/api/night-futures/bars?interval=1m",
      "https://kred.dev/api/kospi200-night-futures/latest"
    ]) {
      if (out.night) break;
      try {
        const j = await jget8(u, 5000, { "User-Agent": UA20, Accept: "application/json" });
        const flat = JSON.stringify(j || {});
        /* 마지막 종가로 보이는 값을 찾는다 */
        let px = 0;
        const arr = (j && (j.bars || j.data || j.series || j.observations)) || null;
        if (Array.isArray(arr) && arr.length) {
          const last = arr[arr.length - 1];
          px = num9(last && (last.c ?? last.close ?? last.value ?? last[4]));
          if (px > 0 && plaus(px)) {
            const hs = arr.map(x => num9(x && (x.c ?? x.close ?? x.value ?? x[4]))).filter(v => v > 0).slice(-30);
            takeNight(px, "kred");
            if (out.night && hs.length >= 3) out.night.history = hs;
          }
        }
        if (!out.night) {
          const m = /"(?:close|last|price|value)"\s*:\s*([\d.]+)/.exec(flat);
          if (m) { const v = num9(m[1]); if (v > 0) takeNight(v, "kred-flat"); }
        }
      } catch (e) {}
    }
    if (!out.night) out.diag.push("night/kred:none");
  }
  /* ③ 인베스팅닷컴 — 'KOSPI 200 Night Futures' 종목을 찾아 시세를 받는다 */
  if (!out.night) {
    try {
      const sj = await jget8("https://api.investing.com/api/search/v2/search?q="
        + encodeURIComponent("KOSPI 200 Night"), 4500,
        { "User-Agent": UA20, Accept: "application/json" });
      const cand = ((sj && (sj.quotes || sj.result || [])) || [])
        .filter(x => /night/i.test(String(x.name || x.description || "")))
        .slice(0, 3);
      for (const c of cand) {
        if (out.night) break;
        const pid = c.pairId || c.pair_ID || c.id;
        if (!pid) continue;
        try {
          const q = await jget8(`https://api.investing.com/api/financialdata/${pid}/historical/chart/`
            + `?interval=PT1M&pointscount=60`, 4500,
            { "User-Agent": UA20, Accept: "application/json" });
          const rows = (q && q.data) || [];
          const last = rows.length ? num9(rows[rows.length - 1][4] ?? rows[rows.length - 1][1]) : 0;
          if (last > 0) {
            const hs = rows.map(r => num9(r[4] ?? r[1])).filter(v => v > 0).slice(-30);
            takeNight(last, "investing/" + pid);
            if (out.night && hs.length >= 3) out.night.history = hs;
          }
        } catch (e) {}
      }
      if (!out.night) out.diag.push("night/investing:none");
    } catch (e) { out.diag.push("night/investing:" + String(e).slice(0, 16)); }
  }
  /* ══ [v4.10] 한국경제 markets 야간(EUREX 연계) 프로버 ═══════════════════
     [원인] 기존 야간 소스는 ① 존재하지 않는 네이버 지수코드 추측 7종 ② CME 시절
     레이아웃을 가정한 네이버 페이지 라벨 검색뿐이라, 2026년 EUREX 연계 야간시장
     값(예: 1,008.35 +2.77%)을 한 번도 못 잡고 주간 마감값이 야간 카드에 남았다.
     [해결] 파생 시세에 '야간' 표기를 실제로 싣는 한경 markets 페이지를 훑되,
     주간 종가 ±12% 이내의 값만 야간으로 인정해 무관한 숫자를 걸러낸다. */
  if (!out.night) {
    for (const hu of ["https://markets.hankyung.com/indices/kospi-future", "https://markets.hankyung.com/futures", "https://markets.hankyung.com/derivatives", "https://markets.hankyung.com/koreaindex"]) {
      if (out.night) break;
      try {
        const ch = new AbortController(); const th = setTimeout(() => ch.abort(), 5500);
        const r = await fetch(hu, { headers: { "User-Agent": UA20, Accept: "text/html,*/*", "Accept-Language": "ko", Referer: "https://markets.hankyung.com/" }, signal: ch.signal });
        clearTimeout(th);
        if (!r.ok) { out.diag.push("night/hk:" + r.status); continue; }
        const txt = await r.text();
        let pos = 0, found = null;
        for (let guard = 0; guard < 12 && !found; guard++) {
          const rel = txt.slice(pos).search(/\uC57C\uAC04|EUREX|\uC720\uB809\uC2A4/);
          if (rel < 0) break;
          const at = pos + rel; pos = at + 2;
          const win = txt.slice(at, at + 900);
          const cand = [...win.matchAll(/([0-9]{1,4}(?:,[0-9]{3})*\.[0-9]{2})/g)].map((m) => Number(m[1].replace(/,/g, "")));
          const px = cand.find((v) => v > 100 && v < 5e3 && (!dayClose || (Math.abs(v - dayClose) / dayClose <= 0.12 && Math.abs(v - dayClose) >= 5e-3)));
          if (px != null) found = px;
        }
        if (found != null) takeNight(found, "hankyung");
        else out.diag.push("night/hk:" + hu.split("/").pop() + ":no-label-price");
      } catch (e) { out.diag.push("night/hk:" + String(e).slice(0, 18)); }
    }
  }
  if (!out.night) {
    for (const nu of [
      "https://finance.naver.com/sise/",
      "https://finance.naver.com/sise/sise_index.naver?code=FUT",
      "https://finance.naver.com/sise/sise_futures.naver",
      "https://m.stock.naver.com/domestic/index/FUT/total"
    ]) {
      if (out.night) break;
      try {
        const c3 = new AbortController();
        const t3 = setTimeout(() => c3.abort(), 4500);
        const r = await fetch(nu, { headers: { "User-Agent": UA20, Accept: "text/html,*/*", "Accept-Language": "ko", Referer: "https://finance.naver.com/" }, signal: c3.signal });
        clearTimeout(t3);
        if (!r.ok) {
          out.diag.push("night/page:" + r.status);
          continue;
        }
        const html = decodeSmart9(await r.arrayBuffer(), r.headers.get("content-type"));
        const i2 = html.search(/야간|야간선물|CME|EUREX|유렉스/);
        if (i2 < 0) {
          out.diag.push("night/page:no-label");
          continue;
        }
        const win2 = html.slice(i2, i2 + 2600);
        const cand = [...win2.matchAll(/([0-9]{2,4}(?:,[0-9]{3})*\.[0-9]{2})/g)].map((m) => Number(m[1].replace(/,/g, "")));
        const px = cand.find((v) => plaus(v) && (!dayClose || (Math.abs(v - dayClose) / dayClose <= 0.12 && Math.abs(v - dayClose) >= 5e-3)));
        if (px) takeNight(px, "page");
        else out.diag.push("night/page:no-usable-number");
      } catch (e) {
        out.diag.push("night/page:" + String(e).slice(0, 20));
      }
    }
  }
  /* ══ [v6.1] 네이버 국내선물 시세 API — 야간선물 원천 하나 더 ═══════════════
     KRX 데이터시스템이 막히는 시간대가 있어 카드가 계속 비어 있었다.
     네이버가 선물 종목코드로 현재가를 돌려주므로, 야간 종목코드로 물어본다.
     (야간선물 종목코드는 주간과 달리 끝이 'N' 계열이다) */
  if (!out.night) {
    for (const cd of ["KRDRVFUK2I", "101W3000", "101WC000", "KRDRVFUKQ2I"]) {
      try {
        const j = await jget8("https://api.stock.naver.com/futures/" + cd + "/basic", 4000, HDRS);
        const px = num9(j && (j.closePrice ?? j.nowVal ?? j.currentPrice));
        if (px > 0) {
          const prev = num9(j.previousClose ?? j.prevClosePrice ?? j.baseValue);
          out.night = { price: px, change: prev > 0 ? px - prev : num9(j.compareToPreviousClosePrice),
            rate: num9(j.fluctuationsRatio), history: [] };
          break;
        }
      } catch (e) {}
    }
  }
  /* ══ [v4.13] KRX 정보데이터시스템 — 야간선물 1순위 소스 ════════════════
     [결정적 사실] 2025년 6월 9일부터 EUREX 연계가 끝나고 KRX 가 야간거래를
     자체 운영한다. 그래서 'EUREX/CME' 라벨을 찾던 기존 프로버는 구조적으로
     맞을 수 없었다. KRX 데이터시스템은 파생상품 시세를 정규/야간으로 나눠
     제공하므로 여기를 1순위로 둔다. 야간 데이터의 조회 기준일은 야간거래
     종료일(T+1)이므로, 지금이 자정 이후면 오늘, 자정 전이면 다음 영업일로 묻는다. */
  if (!out.night) {
    const kD = new Date(Date.now() + 9 * 3600e3);
    const hh = kD.getUTCHours();
    if (hh >= 18) kD.setUTCDate(kD.getUTCDate() + 1);              // 18시 이후 → 종료일은 내일
    const ymd = kD.toISOString().slice(0, 10).replace(/-/g, "");
    /* 야간(정규외) 파생 통계 화면은 번호가 따로 있다 — 알려진 것을 모두 훑는다 */
    const BLDS = [
      "dbms/MDC/STAT/standard/MDCSTAT12501",
      "dbms/MDC/STAT/standard/MDCSTAT12502",
      "dbms/MDC/STAT/standard/MDCSTAT12503",
      "dbms/MDC/STAT/standard/MDCSTAT13501",
      "dbms/MDC/STAT/standard/MDCSTAT13502",
      "dbms/MDC/STAT/standard/MDCSTAT14501",
      "dbms/MDC/STAT/standard/MDCSTAT15501"
    ];
    for (const bld of BLDS) {
      if (out.night) break;
      try {
        const ck = new AbortController(); const tk2 = setTimeout(() => ck.abort(), 6000);
        /* ══ [v6.3] KRX 가 400 을 돌려주던 이유 ═══════════════════════════════
           진단에 'krx:400' 이 세 번 찍혔다 — 잘못된 요청이라는 뜻이다.
           파생 통계는 화면마다 요구하는 값이 달라, 한 벌만 보내면 거절당한다.
           날짜·시장구분·상품구분을 조합해 여러 벌 보내고, 통과하는 것을 쓴다. */
        const body = new URLSearchParams({
          bld, locale: "ko_KR", trdDd: ymd,
          prodId: "KRDRVFUK2I", secugrpId: "KRDRVFUK2I",
          mktId: "KRDRVFUK2I", mktTpCd: "N", trdMktTpCd: "N",
          rghtTpCd: "T", isuCd: "", isuCd2: "", strtDd: ymd, endDd: ymd,
          share: "1", money: "1", csvxls_isNo: "false"
        });
        /* [v9.85] 세션 쿠키 없이 부르면 KRX 가 'LOGOUT' 만 돌려준다 */
        const _ck1 = await krxSession(false).catch(() => "");
        const r = await fetch("https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd", {
          method: "POST",
          headers: {
            "User-Agent": UA20, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Referer": "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd",
            "Origin": "https://data.krx.co.kr",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest", "Accept-Language": "ko",
            ..._ck1 ? { "Cookie": _ck1 } : {}
          }, body: body.toString(), signal: ck.signal
        });
        clearTimeout(tk2);
        if (!r.ok) { out.diag.push("night/krx:" + r.status); continue; }
        const txt = await r.text();
        /* 최근월물 = 응답의 첫 행. 현재가 필드명이 버전마다 달라 폭넓게 훑는다. */
        let j = null; try { j = JSON.parse(txt); } catch { }
        const rows = j ? (j.output || j.OutBlock_1 || j.block1 || []) : [];
        let px = null;
        for (const row of rows.slice(0, 6)) {
          for (const k of ["TDD_CLSPRC", "TDD_CLOSE", "CLSPRC", "PRSNT_PRC", "ISU_PRC"]) {
            const v = Number(String(row[k] == null ? "" : row[k]).replace(/,/g, ""));
            if (isFinite(v) && v > 100 && v < 5e3) { px = v; break; }
          }
          if (px != null) break;
        }
        if (px != null) takeNight(px, "krx/" + bld.slice(-9));
        else out.diag.push("night/krx:" + bld.slice(-9) + ":rows" + rows.length);
      } catch (e) { out.diag.push("night/krx:" + String(e).slice(0, 20)); }
    }
  }
  /* ══ [v4.12] 야간선물 소스 추가 — 네이버 모바일 선물 API 계열 ═══════════
     지수코드 추측(NFUT/FUTN…)과 데스크톱 페이지 스크레이프가 모두 실패해 왔다.
     m.stock 의 선물 상품 목록에서 이름에 '야간'이 들어간 항목을 직접 찾는다. */
  if (!out.night) {
    for (const mu of [
      "https://m.stock.naver.com/api/index/category/FUT",
      "https://m.stock.naver.com/api/index/FUT/basic",
      "https://api.stock.naver.com/index/category/FUT"
    ]) {
      if (out.night) break;
      try {
        const cm = new AbortController(); const tm2 = setTimeout(() => cm.abort(), 5000);
        const r = await fetch(mu, { headers: { "User-Agent": UA20, Accept: "application/json", Referer: "https://m.stock.naver.com/" }, signal: cm.signal });
        clearTimeout(tm2);
        if (!r.ok) { out.diag.push("night/mapi:" + r.status); continue; }
        const txt = await r.text();
        /* 이름에 '야간'이 든 객체를 통째로 찾아 그 안의 첫 유효 숫자를 쓴다 */
        let pos = 0, hit = null;
        for (let g = 0; g < 20 && hit == null; g++) {
          const rel = txt.slice(pos).indexOf("\uC57C\uAC04");
          if (rel < 0) break;
          const at = pos + rel; pos = at + 2;
          const win = txt.slice(Math.max(0, at - 400), at + 400);
          const cand = [...win.matchAll(/([0-9]{3,4}\.[0-9]{1,2})/g)].map((m) => Number(m[1]));
          const px = cand.find((v) => v > 100 && v < 5e3 && (!dayClose || (Math.abs(v - dayClose) / dayClose <= 0.12 && Math.abs(v - dayClose) >= 5e-3)));
          if (px != null) hit = px;
        }
        if (hit != null) takeNight(hit, "mapi");
        else out.diag.push("night/mapi:no-night-obj");
      } catch (e) { out.diag.push("night/mapi:" + String(e).slice(0, 18)); }
    }
  }
  if (!out.night && globalThis.__nfMem && globalThis.__nfMem.q && Date.now() - globalThis.__nfMem.at < 15 * 60 * 1000) {
    out.night = globalThis.__nfMem.q; out.diag.push("night:mem-cache " + out.night.price);
  }
  if (!out.night) out.diag.push("night:unavailable");
  if (out.day) return out;
  out.day = await hankyungK200();
  out.diag.push("hankyung:" + (out.day ? "ok " + out.day.price : "fail"));
  if (out.day) {
    out.src = "hankyung";
    return out;
  }
  const urls = [
    "https://finance.naver.com/sise/sise_futures.naver",
    "https://finance.naver.com/sise/sise_index.naver?code=FUT"
  ];
  const sane2 = (px) => px > 50 && px < 5e3;
  const grab2 = (html, labelRe) => {
    const m = html.match(labelRe);
    if (!m) return null;
    const start = m.index + m[0].length;
    const win = html.slice(start, start + 400);
    const px = win.match(/([0-9]{2,4}\.[0-9]{1,2})/);
    if (!px) return null;
    const price = Number(px[1]);
    if (!sane2(price)) return null;
    const ch = win.slice(px.index + px[1].length).match(/([+-]?[0-9]+(?:\.[0-9]{1,2})?)/);
    const change = ch ? Number(ch[1]) : 0;
    const base3 = price - change;
    return { price, change, rate: base3 ? change / base3 * 100 : 0 };
  };
  for (const u of urls) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 4500);
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA20, Accept: "text/html,*/*", "Accept-Language": "ko", Referer: "https://finance.naver.com/sise/" }, signal: c.signal });
      if (!r.ok) {
        out.diag.push(u.split("/").pop() + ":" + r.status);
        continue;
      }
      const html = decodeSmart9(await r.arrayBuffer(), r.headers.get("content-type"));
      if (!out.night) out.night = grab2(html, /야간(?:\s*선물)?/);
      if (!out.day) out.day = grab2(html, /(?:KOSPI\s*200|코스피\s*200|K200)(?:\s*선물)?/);
      if (!out.day) {
        const head = html.slice(0, 6e4);
        const tri = head.match(/([0-9]{3,4}\.[0-9]{2})[^0-9+\-]{0,80}([+-][0-9]+(?:\.[0-9]{1,2})?)[^0-9+\-%]{0,80}([+-]?[0-9]+(?:\.[0-9]{1,2})?)\s*%/);
        if (tri) {
          const price = Number(tri[1]), change = Number(tri[2]);
          if (sane2(price) && Math.abs(change) < price * 0.15) {
            const base3 = price - change;
            out.day = { price, change, rate: base3 ? change / base3 * 100 : 0 };
            out.diag.push("tri-fallback:" + price);
          }
        }
      }
      if (out.day || out.night) out.src = u;
      if (out.day && out.night) break;
      out.diag.push(u.split("/").pop() + ":day=" + !!out.day + ",night=" + !!out.night);
    } catch (e) {
      out.diag.push(u.split("/").pop() + ":" + String(e).slice(0, 40));
    } finally {
      clearTimeout(t);
    }
  }
  return out;
}
function pack(name, key, cur, hist, tag) {
  /* [v9.71] 실시간을 못 받아 이력 마지막 종가로 대체했을 때 stale 표시를 남긴다.
     예전엔 표시가 없어 장중에 전일 종가가 현재가처럼 보였다(지수 부정확의 한 축). */
  let history = hist || [], price, change, rate, stale = 0;
  if (cur && cur.price) {
    price = cur.price;
    change = cur.change;
    rate = cur.rate;
    if (history.length < 2) history = [price - change, price];
  } else if (history.length) {
    price = history[history.length - 1];
    const prev = history.length > 1 ? history[history.length - 2] : price;
    change = price - prev;
    rate = prev ? change / prev * 100 : 0;
    stale = 1;
  } else {
    price = null;
    change = 0;
    rate = 0;
    history = [];
  }
  return { key, name, price, change, rate, history, tag: tag || "", stale };
}

/* ══════════════════════════════════════════════════════════════════════════════
   [v9.76] /api/push — 구독 관리와 발송
   ─────────────────────────────────────────────────────────────────────────────
   act=key    공개키 받기 (없으면 그 자리에서 만들어 저장)
   act=sub    구독 등록 (POST)
   act=unsub  구독 해제 (POST)
   act=test   나에게 시험 발송 (POST)
   act=check  내 보유 종목을 점검해 필요하면 발송 (POST · 앱이 주기적으로 호출)
   구독은 push:<id> 에 계정별로 저장한다 — 계정·사용자 데이터와 같은 원칙이다. */
async function pushVapid(st) {
  /* VAPID 키는 한 번 만들면 계속 같은 것을 써야 한다. 바뀌면 기존 구독이 전부
     무효가 되므로, 만들어 두고 절대 다시 만들지 않는다. */
  let v = null;
  try { v = await st.get("push:vapid", { type: "json" }); } catch (e) {}
  if (v && v.publicKey && v.privateJwk) return v;
  v = await vapidGenerate();
  try { await st.setJSON("push:vapid", v); } catch (e) { return null; }
  return v;
}
async function pushSubsOf(st, id) {
  try { const r = await st.get("push:" + id, { type: "json" }); return Array.isArray(r) ? r : []; }
  catch (e) { return []; }
}
async function pushSubsSet(st, id, arr) {
  try { await st.setJSON("push:" + id, (arr || []).slice(-5)); return true; } catch (e) { return false; }
}
/* 한 사람의 모든 기기로 보낸다. 죽은 구독은 그 자리에서 정리한다. */
async function pushToUser(st, id, payload, opts) {
  const v = await pushVapid(st);
  if (!v) return { ok: false, err: "nokey" };
  const subs = await pushSubsOf(st, id);
  if (!subs.length) return { ok: false, err: "nosub" };
  let sent = 0; const keep = [];
  for (const s of subs) {
    const r = await pushSend(s, payload, v, opts);
    if (r.ok) { sent++; keep.push(s); }
    else if (!r.gone) keep.push(s);          // 일시적 실패는 살려 둔다
  }
  if (keep.length !== subs.length) await pushSubsSet(st, id, keep);
  return { ok: sent > 0, sent, total: subs.length };
}

var push_default = async (req2, context) => {
  const st = (await blobStore()) || null;
  const url = new URL(req2.url);
  const act = url.searchParams.get("act") || "key";
  const J = (o, code) => new Response(JSON.stringify(o), {
    status: code || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
  if (!st) return J({ ok: false, err: "nostore" }, 500);

  if (act === "key") {
    const v = await pushVapid(st);
    return J(v ? { ok: true, key: v.publicKey } : { ok: false, err: "nokey" });
  }
  let body = {};
  try { body = await req2.json(); } catch (e) {}
  const id = String(body.id || "").trim().toLowerCase();
  if (!id) return J({ ok: false, err: "noid" }, 400);

  if (act === "sub") {
    const sub = body.sub;
    if (!sub || !sub.endpoint || !sub.keys) return J({ ok: false, err: "badsub" }, 400);
    const subs = (await pushSubsOf(st, id)).filter(x =>
      x && x.endpoint !== sub.endpoint && x.endpoint !== body.old);
    subs.push({ endpoint: sub.endpoint, keys: sub.keys, at: Date.now(), ua: String(body.ua || "").slice(0, 60) });
    await pushSubsSet(st, id, subs);
    return J({ ok: true, n: subs.length });
  }
  if (act === "unsub") {
    const ep = String(body.endpoint || "");
    const subs = (await pushSubsOf(st, id)).filter(x => x && x.endpoint !== ep);
    await pushSubsSet(st, id, subs);
    return J({ ok: true, n: subs.length });
  }
  if (act === "test") {
    const r = await pushToUser(st, id, {
      title: "LIVE증권 · 알림 시험",
      body: "이 알림이 보이면 앱을 닫아도 알림이 옵니다.",
      tag: "live-test", renotify: true, level: 1, url: "/"
    }, { urgency: "high" });
    return J(r);
  }
  if (act === "check") {
    /* ══ 보유 종목 점검 ══
       앱이 살아 있을 때 이 경로를 부르면, 서버가 저장된 보유·계획을 시세와 견줘
       필요한 알림만 보낸다. 같은 내용을 되풀이하지 않도록 마지막 발송을 기억한다.
       ※ 워커의 외부호출 한도(50)를 지키려고 한 번에 최대 12종목만 본다. */
    const holds = Array.isArray(body.holds) ? body.holds.slice(0, 12) : [];
    if (!holds.length) return J({ ok: true, sent: 0, why: "nohold" });
    let state = {};
    try { state = (await st.get("pushst:" + id, { type: "json" })) || {}; } catch (e) {}
    const now = Date.now();
    const out = [];
    for (const h of holds) {
      if (!h || !h.code || !(h.px > 0)) continue;
      const k = h.code;
      const prev = state[k] || {};
      let hit = null;
      if (h.stop > 0 && h.px <= h.stop) hit = { kind: "손절선 이탈", lv: 3, msg: `${h.name} ${h.px.toLocaleString()} · 손절선 ${Number(h.stop).toLocaleString()} 아래` };
      else if (h.target > 0 && h.px >= h.target) hit = { kind: "목표가 도달", lv: 2, msg: `${h.name} ${h.px.toLocaleString()} · 목표가 도달` };
      if (hit) hit.code = k;
      if (!hit) { if (prev.kind) delete state[k]; continue; }
      /* 같은 종류의 알림은 6시간에 한 번만 */
      if (prev.kind === hit.kind && now - (prev.at || 0) < 6 * 3600e3) continue;
      state[k] = { kind: hit.kind, at: now };
      out.push(hit);
    }
    if (!out.length) { try { await st.setJSON("pushst:" + id, state); } catch (e) {} return J({ ok: true, sent: 0 }); }
    out.sort((a, b) => b.lv - a.lv);
    const top = out[0];
    const more = out.length > 1 ? ` 외 ${out.length - 1}건` : "";
    const r = await pushToUser(st, id, {
      title: `LIVE증권 · ${top.kind}${more}`,
      body: top.msg, level: top.lv, code: out.length === 1 ? (top.code || "") : "",
      tag: "live-care", renotify: true, url: "/"
    }, { urgency: top.lv >= 3 ? "high" : "normal" });
    try { await st.setJSON("pushst:" + id, state); } catch (e) {}
    return J({ ...r, alerts: out.length });
  }
  return J({ ok: false, err: "act" }, 400);
};


/* ══════════════════════════════════════════════════════════════════════════════
   [v9.81] 호가창 — 지어낸 값이 아니라 실제 호가
   ─────────────────────────────────────────────────────────────────────────────
   네이버 공개 화면이 쓰는 경로를 그대로 읽는다. 응답을 직접 받아 구조를 확인했다.
     GET m.stock.naver.com/api/stock/{code}/askingPrice
     { lastClosePrice: 268000,              // 전일 종가(숫자)
       totalSell: "1,566,297",              // 매도 총잔량(콤마 문자열)
       totalBuy:  "360,069",
       sellInfo:  [{price:"276,500", count:"72,118", rate:16}, … 5개],  // 높은 값 → 낮은 값
       buyInfos:  [{price:"274,000", count:"163,712", rate:37}, … 5개] }
   [확인한 것]
     · 매도·매수 각 5단계다. 실제 MTS 는 10단을 보여 주지만 이 경로는 5단까지만 준다.
       모자란 5칸을 지어내지 않는다 — 있는 5단만 정확히 보여 준다.
     · rate = floor(잔량 ÷ 전체최대잔량 × 100). 열 개 값 모두 계산과 일치했다.
       막대 길이를 우리가 다시 계산할 필요 없이 그대로 쓰면 된다.
     · 필드 이름이 sellInfo(단수)·buyInfos(복수)로 어긋나 있다. 원천이 그렇다.
   [한계] 공개 화면 시세이므로 거래소 실시간과 시차가 있을 수 있다.
          화면에 '실시간'이라 적지 않고 받은 시각을 함께 보여 준다. */
var askprice_default = async (req2) => {
  const url = new URL(req2.url);
  const code = String(url.searchParams.get("code") || "").replace(/[^0-9A-Za-z]/g, "").slice(0, 12);
  const J = (o, ma) => new Response(JSON.stringify(o), {
    headers: { "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${ma == null ? 3 : ma}`,
      "access-control-allow-origin": "*" }
  });
  if (!code) return J({ ok: false, err: "code" }, 60);
  const num = (v) => { const n = Number(String(v == null ? "" : v).replace(/[^0-9.-]/g, "")); return isFinite(n) ? n : 0; };
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 4500);
    const r = await fetch(`https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/askingPrice`,
      { headers: { "User-Agent": UA20, Accept: "application/json", Referer: "https://m.stock.naver.com/" }, signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return J({ ok: false, err: "http", status: r.status }, 15);
    const d = await r.json();
    const rows = (arr) => (Array.isArray(arr) ? arr : []).map((x) => ({
      p: num(x.price), q: num(x.count), r: Math.max(0, Math.min(100, num(x.rate)))
    })).filter((x) => x.p > 0);
    const sell = rows(d.sellInfo);      // 높은 값 → 낮은 값 (화면 순서 그대로)
    const buy = rows(d.buyInfos);
    if (!sell.length && !buy.length) return J({ ok: false, err: "empty" }, 15);
    /* 최우선 호가와 스프레드 — 화면에서 다시 계산하지 않게 여기서 확정한다 */
    const bestAsk = sell.length ? sell[sell.length - 1].p : null;   // 매도 중 가장 낮은 값
    const bestBid = buy.length ? buy[0].p : null;                   // 매수 중 가장 높은 값
    return J({
      ok: true, code,
      prevClose: num(d.lastClosePrice) || null,
      totalSell: num(d.totalSell), totalBuy: num(d.totalBuy),
      sell, buy, bestAsk, bestBid,
      spread: (bestAsk != null && bestBid != null) ? bestAsk - bestBid : null,
      levels: Math.max(sell.length, buy.length),
      at: Date.now()
    }, 3);
  } catch (e) {
    return J({ ok: false, err: String((e && e.message) || e).slice(0, 60) }, 10);
  }
};


/* ══════════════════════════════════════════════════════════════════════════════
   [v9.84] 공매도 잔고 · 프로그램 매매
   ─────────────────────────────────────────────────────────────────────────────
   KRX 정보데이터시스템의 공개 조회 화면이 쓰는 경로를 그대로 읽는다.
     공매도 잔고 : bld = dbms/MDC/STAT/srt/MDCSTAT30501
                   searchType=1(전종목) · mktTpCd=1(코스피)/2(코스닥) · trdDd=YYYYMMDD
                   → 종목코드·종목명·공매도잔고수량·상장주식수·잔고금액·시가총액·비중
   [반드시 알아야 할 시차]
     공매도 잔고는 보고의무 발생일(T)로부터 T+2 까지 보고한다. 그래서 오늘 조회해도
     '이틀 전' 자료까지만 나온다. 이걸 '오늘 잔고'라고 적으면 거짓말이 된다.
     응답에 기준일(basisYmd)을 함께 실어 화면에 그대로 밝힌다.
   [또 하나] 0.01% 미만 잔고는 보고의무가 없어 집계에 잡히지 않는다.
     '잔고 0' 이 '공매도가 없다'는 뜻이 아니다. 이것도 화면에 적는다. */
async function srtFetchDay(mkt, ymd) {
  const U = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
  const r = await krxPost(U, {
    bld: "dbms/MDC/STAT/srt/MDCSTAT30501",
    searchType: "1", mktTpCd: String(mkt), trdDd: ymd,
    share: "1", money: "1", csvxls_isNo: "false"
  }, 7000, "");
  if (r.bad || !r.j) return null;
  const rows = r.j.OutBlock_1 || r.j.output || r.j.block1 || [];
  return Array.isArray(rows) && rows.length ? rows : null;
}

/* ══════════════════════════════════════════════════════════════════════════════
   [v11.0] 쿠폰 — 발급과 등록
   ─────────────────────────────────────────────────────────────────────────────
   cpn:<코드>  { tier, days, maxUse, used, usedBy[], expireAt, memo, at }
   · days=0  이면 무기한 등급
   · maxUse  다회용 코드 지원(친구 15명에게 같은 코드를 뿌릴 수 있다)
   · usedBy  같은 사람이 두 번 쓰는 것을 막는다
   [코드 모양] LIVE-XXXX-XXXX. 0/O, 1/I 처럼 헷갈리는 글자는 뺀다 —
   손으로 옮겨 적다가 틀리면 "코드가 안 된다"는 문의만 늘어난다.
   ══════════════════════════════════════════════════════════════════════════════ */
var CPN_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 0,O,1,I 제외
function cpnNorm(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
/* ══ [v11.3] 코드 형식 — LIVE-XXXXX-XXXXX-XXXXX-X ═══════════════════════════
   저장은 붙여서(LIVE + 무작위 16자 = 20자), 표시는 4-5-5-5-1 로 끊는다.
   [왜 소문자를 안 쓰나] 코드는 카톡으로 보내고 손으로 옮겨 적는 물건이다.
   l/I/1, O/0 처럼 눈으로 구분이 안 되는 짝이 생기고, 자동 대문자 변환이 걸리는
   기기도 있어 "코드가 안 된다"는 문의만 늘어난다.
   대신 길이를 8→16자로 늘려 경우의 수를 1.2×10^24 로 확보했다 —
   소문자를 넣어 얻는 이득보다 오타로 잃는 것이 크다. */
function cpnPretty(raw) {
  const c = cpnNorm(raw);
  if (c.length !== 20) return c;
  return `${c.slice(0,4)}-${c.slice(4,9)}-${c.slice(9,14)}-${c.slice(14,19)}-${c.slice(19,20)}`;
}
/* ══ [v11.4] 마지막 한 자리는 등급 식별 숫자 ═══════════════════════════════
   LIVE + 무작위 15자(대문자+숫자) + 등급숫자 1자 = 20자.
   등급숫자는 TIER_KEYS 의 자리번호를 그대로 쓴다 — 1=Lite … 5=Max.
   [알아 둘 점] 코드만 보고 등급을 알 수 있게 된다. 관리에는 편하지만
   받는 사람도 알게 되므로, 등급을 숨기고 싶다면 이 방식을 쓰지 않는 게 맞다.
   위조는 불가능하다 — 서버가 KV 에서 실제 코드를 찾아 확인하기 때문에,
   끝자리만 바꿔 넣어도 '없는 코드'가 된다. */
function cpnMake(tier) {
  const lv = tierIdx(tier);
  let body = "";
  const buf = new Uint8Array(15);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 15; i++) body += CPN_ALPHA[buf[i] % CPN_ALPHA.length];
  return "LIVE" + body + String(lv);
}
/* 코드 끝자리로 등급을 읽는다 — 화면 안내에만 쓰고, 판정은 서버가 KV 로 한다 */
function cpnTierHint(code) {
  const c = cpnNorm(code);
  if (c.length !== 20) return null;
  const n = Number(c.slice(19));
  return (n >= 1 && n < TIER_KEYS.length) ? TIER_KEYS[n] : null;
}
var coupon_default = async (req2) => {
  const url = new URL(req2.url);
  const J = (o, st) => new Response(JSON.stringify(o), {
    status: st || 200,
    headers: { "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store", "access-control-allow-origin": "*" } });
  if (!KV) return J({ ok: false, err: "nostore" });

  let body = {};
  try { body = await req2.json(); } catch (e) { body = {}; }
  const act = String(body.act || "").toLowerCase();
  const store = kvAdapter(KV, "app");

  /* ── 등록: 사용자가 코드를 넣는다 ─────────────────────────────────────── */
  if (act === "redeem") {
    const id = String(body.id || "").trim().toLowerCase();
    const pass = String(body.pass || "");
    const code = cpnNorm(body.code);
    if (!id || !pass) return J({ ok: false, err: "auth", msg: "로그인이 필요합니다" });
    if (code.length !== 20) return J({ ok: false, err: "form", msg: "코드는 LIVE 로 시작하는 20자입니다. 다시 확인해 주세요" });

    const acc = await accLoad(store, id);
    if (!acc) return J({ ok: false, err: "auth", msg: "계정을 찾을 수 없습니다" });
    const v = await verifyPass(acc, pass);
    if (!v) return J({ ok: false, err: "auth", msg: "비밀번호가 맞지 않습니다" });

    let cpn = null;
    try { cpn = await KV.get("cpn:" + code, "json"); } catch (e) { cpn = null; }
    if (!cpn) return J({ ok: false, err: "notfound", msg: "없는 코드입니다. 대소문자와 하이픈을 다시 확인해 주세요" });
    if (cpn.expireAt && Date.now() > cpn.expireAt)
      return J({ ok: false, err: "expired", msg: "사용 기간이 지난 코드입니다" });
    if ((cpn.usedBy || []).includes(id))
      return J({ ok: false, err: "already", msg: "이미 사용하신 코드입니다" });
    if (cpn.maxUse && (cpn.used || 0) >= cpn.maxUse)
      return J({ ok: false, err: "soldout", msg: "사용 횟수를 모두 채운 코드입니다" });

    /* ══ [v11.6] 동시 등록 — 자리를 먼저 잡고 나서 등급을 준다 ═══════════════
       [무엇이 위험했나] '읽고 → 검사하고 → 쓰기' 사이에 다른 요청이 끼어든다.
       1회용 코드를 다섯 명이 같은 순간에 넣으면 다섯 명 모두 "아직 안 썼다"를
       보고 통과했다(실제로 그렇게 확인됐다).
       [고침] 순서를 뒤집는다 — 먼저 목록에 내 이름을 넣어 저장하고, 그 결과를
       다시 읽어 '내가 몇 번째 자리인지' 확인한다. 정원을 넘는 자리면 등급을
       주지 않는다. KV 에 잠금이 없으므로 이것이 실질적인 최선이다.
       [남는 한계] 같은 밀리초에 겹치면 드물게 한 자리가 더 나갈 수 있다.
       무료 발급이라 손해가 없고, 한두 명 더 들어와도 문제가 되지 않는다. */
    const CK = "cpn:" + code;
    let cur = cpn;
    try { cur = (await KV.get(CK, "json")) || cpn; } catch (e) { cur = cpn; }
    if ((cur.usedBy || []).includes(id))
      return J({ ok: false, err: "already", msg: "이미 사용하신 코드입니다" });
    if (cur.maxUse && (cur.used || 0) >= cur.maxUse)
      return J({ ok: false, err: "soldout", msg: "사용 횟수를 모두 채운 코드입니다" });

    /* ① 자리를 잡는다 */
    const list = [...(cur.usedBy || [])];
    list.push(id);
    cur.usedBy = list;
    cur.used = list.length;
    try { await KV.put(CK, JSON.stringify(cur)); } catch (e) {}

    /* ② 정말 얻었는지 다시 읽어 확인한다 */
    let chk = cur;
    try { chk = (await KV.get(CK, "json")) || cur; } catch (e) { chk = cur; }
    const seat = (chk.usedBy || []).indexOf(id);
    /* 내 이름이 사라졌다면 다른 요청의 쓰기에 덮인 것이다 — 다시 시도하면 된다.
       (이 경우 목록에 내 이름이 없으므로 재시도가 막히지 않는다) */
    if (seat < 0) return J({ ok: false, err: "retry", msg: "잠시 뒤 다시 시도해 주세요" });
    /* 정원 밖 자리를 잡았다면 이름을 되돌려 놓는다 — 그대로 두면 다음에
       "이미 사용하셨다"로 막혀, 정원이 빌 때도 영영 못 쓰게 된다. */
    if (chk.maxUse && seat >= chk.maxUse) {
      try {
        const back = { ...chk, usedBy: (chk.usedBy || []).filter(x => x !== id) };
        back.used = back.usedBy.length;
        await KV.put(CK, JSON.stringify(back));
      } catch (e) {}
      return J({ ok: false, err: "soldout", msg: "사용 횟수를 모두 채운 코드입니다" });
    }

    const before = tierOf(acc);
    const after  = tierGrant(acc, cpn.tier, +cpn.days || 0, cpnPretty(code));
    await accSave(store, id, acc);

    return J({ ok: true, before: before.key, ...tierPayload(acc),
      msg: (before.lv === after.lv)
        ? `${TIER_NAME[after.key]} 이용 기간이 늘었습니다`
        : `${TIER_NAME[after.key]} 등급이 되었습니다` });
  }

  /* ── 발급: 관리자만 ───────────────────────────────────────────────────── */
  if (act === "issue") {
    if (!admOk(body.token)) return J({ ok: false, err: "forbidden" }, 403);
    const tier = String(body.tier || "pro").toLowerCase();
    if (!TIER_KEYS.includes(tier) || tier === "free")
      return J({ ok: false, err: "tier", msg: "발급할 수 없는 등급입니다" });
    const days   = Math.max(0, Math.min(3650, +body.days || 0));
    const maxUse = Math.max(1, Math.min(500, +body.maxUse || 1));
    const count  = Math.max(1, Math.min(50, +body.count || 1));
    const validDays = Math.max(0, Math.min(3650, +body.validDays || 0));
    const memo = String(body.memo || "").slice(0, 60);
    const out = [];
    for (let i = 0; i < count; i++) {
      const code = cpnMake(tier);
      const rec = { tier, days, maxUse, used: 0, usedBy: [], memo,
        at: Date.now(), expireAt: validDays ? Date.now() + validDays * 864e5 : null };
      try { await KV.put("cpn:" + code, JSON.stringify(rec)); out.push(cpnPretty(code)); } catch (e) {}
    }
    return J({ ok: true, codes: out, tier, days, maxUse });
  }

  /* ── 목록: 관리자만 ───────────────────────────────────────────────────── */
  if (act === "list") {
    if (!admOk(body.token)) return J({ ok: false, err: "forbidden" }, 403);
    const out = [];
    try {
      const r = await KV.list({ prefix: "cpn:", limit: 200 });
      for (const k of (r.keys || [])) {
        const v = await KV.get(k.name, "json");
        if (v) out.push({ code: cpnPretty(k.name.slice(4)), ...v, usedBy: undefined,
                          users: (v.usedBy || []).length });
      }
    } catch (e) {}
    out.sort((a, b) => (b.at || 0) - (a.at || 0));
    return J({ ok: true, items: out });
  }

  /* ── 직접 지정: 관리자만 (문의 메일을 받고 바로 올려 줄 때) ───────────── */
  if (act === "set") {
    if (!admOk(body.token)) return J({ ok: false, err: "forbidden" }, 403);
    const id = String(body.id || "").trim().toLowerCase();
    const acc = await accLoad(store, id);
    if (!acc) return J({ ok: false, err: "nouser", msg: "그런 계정이 없습니다" });
    const tier = String(body.tier || "free").toLowerCase();
    if (!TIER_KEYS.includes(tier)) return J({ ok: false, err: "tier" });
    if (tier === "free") { acc.tier = "free"; acc.tierUntil = null; acc.tierFrom = "관리자"; }
    else tierGrant(acc, tier, Math.max(0, +body.days || 0), "관리자");
    await accSave(store, id, acc);
    return J({ ok: true, id, ...tierPayload(acc) });
  }

  return J({ ok: false, err: "act" });
};

var srt_default = async (req2) => {
  const url = new URL(req2.url);
  const code = String(url.searchParams.get("code") || "").replace(/[^0-9A-Za-z]/g, "").slice(0, 12);
  const J = (o, ma) => new Response(JSON.stringify(o), {
    headers: { "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${ma == null ? 1800 : ma}`, "access-control-allow-origin": "*" } });
  const num = (v) => { const n = Number(String(v == null ? "" : v).replace(/[^0-9.-]/g, "")); return isFinite(n) ? n : 0; };
  /* 최근 영업일부터 거슬러 올라가며 자료가 있는 날을 찾는다(T+2 시차 때문에 필수) */
  const days = [];
  { let off = 0; while (days.length < 8 && off < 14) {
      const d = new Date(Date.now() + 9 * 3600e3 - off * 864e5);
      const w = d.getUTCDay();
      if (w !== 0 && w !== 6) days.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
      off++; } }
  const CK = "srt:" + (code || "all");
  try { if (KV) { const c = await KV.get(CK, "json");
    if (c && Date.now() - (c.at || 0) < 6 * 3600e3) return J(c, 1800); } } catch (e) {}
  try {
    let rows = null, used = "", mkt = 1;
    /* 코스피 → 코스닥 순으로, 자료가 나오는 첫 날짜를 쓴다 */
    outer: for (const d of days.slice(0, 5)) {
      for (const m of [1, 2]) {
        const r = await srtFetchDay(m, d);
        if (r) { rows = r; used = d; mkt = m; if (!code) break outer;
          /* 종목 지정이면 그 종목이 이 시장에 있는지 확인하고, 없으면 다른 시장도 본다 */
          const hit = r.find((x) => String(x.ISU_SRT_CD || x.ISU_CD || "").replace(/^A/, "") === code);
          if (hit) break outer; else rows = null; }
      }
    }
    if (!rows) return J({ ok: false, err: "nodata", tried: days.slice(0, 5) }, 600);
    const map = (x) => ({
      code: String(x.ISU_SRT_CD || x.ISU_CD || "").replace(/^A/, ""),
      name: String(x.ISU_ABBRV || x.ISU_NM || ""),
      qty: num(x.BAL_QTY),                 // 공매도 잔고 수량
      shares: num(x.LIST_SHRS),            // 상장주식수
      amt: num(x.BAL_AMT),                 // 잔고 금액
      cap: num(x.MKTCAP),                  // 시가총액
      pct: num(x.BAL_RTO)                  // 비중(%)
    });
    if (code) {
      const hit = rows.find((x) => String(x.ISU_SRT_CD || x.ISU_CD || "").replace(/^A/, "") === code);
      if (!hit) return J({ ok: true, code, basisYmd: used, found: false,
        note: "보고 기준(상장주식수 0.01% 이상)에 못 미쳐 집계되지 않았습니다." }, 1800);
      const out = { ok: true, code, basisYmd: used, found: true, item: map(hit), at: Date.now() };
      try { if (KV) await KV.put(CK, JSON.stringify(out), { expirationTtl: 21600 }); } catch (e) {}
      return J(out, 1800);
    }
    /* 전종목 — 비중이 높은 순 상위 40 */
    const list = rows.map(map).filter((x) => x.code && x.pct > 0)
      .sort((a, b) => b.pct - a.pct).slice(0, 40);
    const out = { ok: true, basisYmd: used, mkt, list, n: rows.length, at: Date.now() };
    try { if (KV) await KV.put(CK, JSON.stringify(out), { expirationTtl: 21600 }); } catch (e) {}
    return J(out, 1800);
  } catch (e) {
    return J({ ok: false, err: String((e && e.message) || e).slice(0, 60) }, 300);
  }
};

var market_default = async (req2) => {
  try {
    const idx = await settle2(pollingIndex("KOSPI,KOSDAQ")) || { map: {}, arr: [] };
    const [
      kospiH,
      kosdaqH,
      ndq,
      spx,
      dow,
      usdH,
      jpyH,
      eurH,
      btc,
      eth,
      nqf,
      esf,
      ymf,
      vix,
      n225,
      hsi,
      wti,
      gold,
      krf
    ] = await Promise.all([
      settle2(idxSparkSmart("KOSPI", idx.map.KOSPI || idx.arr[0])),
      settle2(idxSparkSmart("KOSDAQ", idx.map.KOSDAQ || idx.arr[1])),
      settle2(worldIndex("^IXIC", "^ndq", ".IXIC")),
      settle2(worldIndex("^GSPC", "^spx", ".INX")),
      settle2(worldIndex("^DJI", "^dji", ".DJI")),
      settle2(fxSeries("USD")),
      settle2(fxSeries("JPY", 100)),
      settle2(fxSeries("EUR")),
      settle2(yahooOnly("BTC-USD")),
      settle2(yahooOnly("ETH-USD")),
      // 선물·변동성·아시아 지수 — 국내 장 시작 전 방향을 가늠하는 데 가장 많이 보는 지표들
      settle2(yahooOnly("NQ=F")),
      settle2(yahooOnly("ES=F")),
      settle2(yahooOnly("YM=F")),
      settle2(yahooOnly("^VIX")),
      settle2(yahooOnly("^N225")),
      settle2(yahooOnly("^HSI")),
      settle2(yahooOnly("CL=F")),
      settle2(yahooOnly("GC=F")),
      settle2(krFutures())
    ]);
    /* [v9.71] 폴링 값을 그대로 쓰지 않고 다른 두 경로와 견줘 확정한다 */
    const [kospiRT, kosdaqRT] = await Promise.all([
      settle2(krIndexRealtime("KOSPI", idx.map.KOSPI || idx.arr[0])),
      settle2(krIndexRealtime("KOSDAQ", idx.map.KOSDAQ || idx.arr[1]))
    ]);
    const kospi = kospiRT || idx.map.KOSPI || idx.arr[0], kosdaq = kosdaqRT || idx.map.KOSDAQ || idx.arr[1];
    const usdRate = usdH && usdH.length ? usdH[usdH.length - 1] : 1350;
    const toKrw = (c) => c ? { price: c.price * usdRate, change: c.change * usdRate, rate: c.rate, history: (c.history || []).map((v) => v * usdRate) } : null;
    const btcK = toKrw(btc), ethK = toKrw(eth);
    const P = (nm, k, cur, tag) => pack(nm, k, cur, cur && cur.history, tag);
    const body = {
      ok: true,
      indices: [
        pack("\uCF54\uC2A4\uD53C", "KOSPI", kospi, (kospiH && kospiH.hist) || [], "\uAD6D\uB0B4"),
        pack("\uCF54\uC2A4\uB2E5", "KOSDAQ", kosdaq, (kosdaqH && kosdaqH.hist) || [], "\uAD6D\uB0B4"),
        P("\uB098\uC2A4\uB2E5 \uC885\uD569", "NASDAQ", ndq, "\uD574\uC678"),
        P("S&P 500", "SP500", spx, "\uD574\uC678"),
        P("\uB2E4\uC6B0 \uC0B0\uC5C5", "DOW", dow, "\uD574\uC678"),
        P("\uB098\uC2A4\uB2E5100 \uC120\uBB3C", "NQF", nqf, "\uC120\uBB3C"),
        P("S&P500 \uC120\uBB3C", "ESF", esf, "\uC120\uBB3C"),
        P("\uB2E4\uC6B0 \uC120\uBB3C", "YMF", ymf, "\uC120\uBB3C"),
        /* [v1.99] 코스피200 선물 주간·야간을 별도 카드 2장으로 분리 —
           주간: 스크레이프 day 값(없으면 night 값으로 대체 · 최근월물 동일 상품)
           야간(18:00~익일 06:00 KST): night 값이 있으면 실시간, 없으면 주간 종가를 '(주간 종가)'로 정직 표기 */
        P("\uCF54\uC2A4\uD53C200 \uC120\uBB3C", "K200F", krf && (krf.day || krf.night), "\uC120\uBB3C"),
        // [v2.2.1] P는 4인자 래퍼 — cur.history가 자동 전달됨(5인자 호출이 태그 폭주 원인이었음)
        (() => {
          if (krf && krf.night) return P("\uCF54\uC2A4\uD53C200 \uC57C\uAC04\uC120\uBB3C", "K200NF", krf.night, "\uC120\uBB3C");
          /* [v4.8] \uc608\uc804 \uc8fc\uc11d\uc758 '\uc8fc\uac04 \uc885\uac00 \uc815\uc9c1 \ud45c\uae30'\uac00 \uad6c\ud604\ub41c \uc801\uc774 \uc5c6\uc5b4
             \uc57c\uac04 \uc18c\uc2a4\uac00 \uc804\ubd80 \ub9c9\ud614 \ub54c \uce74\ub4dc\uac00 \ube48 \uaecd\ub370\uae30\ub85c \ub0a8\uc558\ub2e4.
             \uc8fc\uac04 \uac12\uc73c\ub85c \ubc1c\ud589\ud558\uace0 dayBasis \ud45c\uc2dc\ub97c \ubd99\uc5ec \ud074\ub77c\uc774\uc5b8\ud2b8\uac00 '\uc8fc\uac04 \ub9c8\uac10 \uae30\uc900'\uc784\uc744 \uc54c\ub9b0\ub2e4. */
          /* [v4.12] 야간 시세를 못 받았으면 주간 숫자를 야간 카드에 싣지 않는다.
             981.15 를 '야간선물'로 보여 주는 것은 명백한 오정보다(실제는 1,008선).
             값은 비우고 주간 마감가는 '참고'로만 덧붙인다. */
          if (krf && krf.day) return { name: "\uCF54\uC2A4\uD53C200 \uC57C\uAC04\uC120\uBB3C", key: "K200NF", price: null, change: null, rate: null, tag: "\uC120\uBB3C", history: [], nightMissing: 1, dayRef: krf.day.price };
          return null;
        })(),
        P("VIX \uBCC0\uB3D9\uC131", "VIX", vix, "\uC9C0\uD45C"),
        P("\uB2C8\uCF00\uC774 225", "N225", n225, "\uD574\uC678"),
        P("\uD56D\uC14D", "HSI", hsi, "\uD574\uC678"),
        P("WTI \uC720\uAC00", "WTI", wti, "\uC6D0\uC790\uC7AC"),
        P("\uAE08", "GOLD", gold, "\uC6D0\uC790\uC7AC")
      ].filter((x) => x && (x.price != null || x.history && x.history.length)),
      crypto: [
        pack("\uBE44\uD2B8\uCF54\uC778", "BTC", btcK, btcK && btcK.history, "\uAC00\uC0C1\uC790\uC0B0"),
        pack("\uC774\uB354\uB9AC\uC6C0", "ETH", ethK, ethK && ethK.history, "\uAC00\uC0C1\uC790\uC0B0")
      ],
      fx: [
        pack("\uC6D0/\uB2EC\uB7EC", "USDKRW", null, usdH || [], "\uD658\uC728"),
        pack("\uC6D0/\uC5D4(100)", "JPYKRW", null, jpyH || [], "\uD658\uC728"),
        pack("\uC6D0/\uC720\uB85C", "EURKRW", null, eurH || [], "\uD658\uC728")
      ]
    };
    try {
      const probe2 = req2 && new URL(req2.url).searchParams.get("probe") === "1";
      if (probe2 || !(krf && (krf.day || krf.night))) body._futDiag = krf && krf.diag || ["nofetch"];
      const want = ["KOSPI", "KOSDAQ", "NASDAQ", "SP500", "DOW", "NQF", "ESF", "YMF", "K200F", "K200NF", "VIX", "N225", "HSI", "WTI", "GOLD"];
      const have = {};
      body.indices.forEach((x) => {
        have[x.key] = x;
      });
      body._health = {
        missing: want.filter((k) => !have[k]),
        suspect: body.indices.filter((x) => x.price != null && Math.abs(x.rate || 0) > 25).map((x) => x.key + ":" + (x.rate || 0).toFixed(1) + "%"),
        nightBasis: krf && krf.night && krf.night.basis || "none",
        idxSrc: { KOSPI: (kospiRT && kospiRT.src) || "polling-only", KOSDAQ: (kosdaqRT && kosdaqRT.src) || "polling-only" },
        stale: body.indices.filter((x) => x.stale).map((x) => x.key),
        at: (/* @__PURE__ */ new Date()).toISOString()
      };
    } catch {
    }
    /* ══ [v9.71] 지수 전용 캐시 헤더 ═══════════════════════════════════════
       cacheHdr 의 stale-while-revalidate 는 max-age 의 5배(최소 30초)라,
       엣지가 '되받아오는 동안' 최대 35초 지난 값을 그대로 내보낼 수 있었다.
       미국장 시간대에는 krLive 가 false 라 max-age 120 + SWR 600 —
       최대 12분 묵은 지수가 나갔다. 지수만큼은 짧게 못 박는다. */
    const live = idxLive(), ma = live ? 5 : 20;
    return new Response(JSON.stringify(body), { headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${ma}, stale-while-revalidate=${live ? 5 : 20}`,
      "cloudflare-cdn-cache-control": `public, max-age=${ma}, stale-while-revalidate=${live ? 5 : 20}`,
      "x-cache-policy": live ? `idx-live-${ma}s` : `idx-idle-${ma}s`
    } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e), indices: [], fx: [] }), { headers: { "content-type": "application/json" } });
  }
};

// netlify/functions/meta.js
var UA21 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
async function fetchJson2(url, ms, headers) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: Object.assign({ "User-Agent": UA21, "Accept": "application/json" }, headers || {}), signal: c.signal });
    const txt = await r.text();
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
function exchangeOf(j, depth) {
  if (!j || typeof j !== "object" || (depth || 0) > 4) return "";
  for (const [k, v] of Object.entries(j)) {
    if (/stockExchangeType|exchange|marketType|market$/i.test(k)) {
      if (typeof v === "string" && v) return v;
      if (v && typeof v === "object") {
        const s = v.code || v.name || v.type || v.zoneId || "";
        if (s) return String(s);
      }
    }
  }
  for (const v of Object.values(j)) {
    if (v && typeof v === "object") {
      const r = exchangeOf(v, (depth || 0) + 1);
      if (r) return r;
    }
  }
  return "";
}
function sosokOf(j, depth) {
  if (!j || typeof j !== "object" || (depth || 0) > 3) return null;
  for (const [k, v] of Object.entries(j)) {
    if (/^sosok$|marketCode|mkt_?cd/i.test(k)) {
      const n = String(v).trim();
      if (n === "0") return "\uCF54\uC2A4\uD53C";
      if (n === "1") return "\uCF54\uC2A4\uB2E5";
      if (/KOSDAQ/i.test(n)) return "\uCF54\uC2A4\uB2E5";
      if (/KOSPI/i.test(n)) return "\uCF54\uC2A4\uD53C";
    }
  }
  for (const v of Object.values(j)) if (v && typeof v === "object") {
    const r = sosokOf(v, (depth || 0) + 1);
    if (r) return r;
  }
  return null;
}
function toKo(v) {
  const s = String(v || "").toUpperCase();
  if (/KOSDAQ|코스닥/.test(s)) return "\uCF54\uC2A4\uB2E5";
  if (/KONEX|코넥스/.test(s)) return "\uCF54\uB125\uC2A4";
  if (/KOSPI|유가|코스피/.test(s)) return "\uCF54\uC2A4\uD53C";
  return "";
}
var meta_default = async (req2) => {
  const url = new URL(req2.url);
  const codes = String(url.searchParams.get("codes") || "").toUpperCase().replace(/[^0-9A-Z,]/g, "").split(",").filter(Boolean).slice(0, 20);
  if (!codes.length) return new Response(JSON.stringify({ ok: false, markets: {} }), { headers: { "content-type": "application/json" } });
  const results = {};
  const settled = await Promise.allSettled(codes.map(
    (c) => fetchJson2(`https://m.stock.naver.com/api/stock/${c}/basic`, 4e3, { "Referer": `https://m.stock.naver.com/domestic/stock/${c}/total` })
  ));
  const missing = [];
  codes.forEach((c, i) => {
    const j = settled[i].status === "fulfilled" ? settled[i].value : null;
    if (!j) {
      missing.push(c);
      return;
    }
    const mk = toKo(exchangeOf(j, 0)) || sosokOf(j, 0) || "";
    const nm = j.stockName || j.itemName || "";
    if (mk) results[c] = { market: mk, name: nm || "" };
    else {
      missing.push(c);
      if (nm) results[c] = { market: "", name: nm };
    }
  });
  if (missing.length) {
    const s2 = await Promise.allSettled(missing.slice(0, 20).map(
      (c) => fetchJson2(`https://m.stock.naver.com/api/stock/${c}/integration`, 3500, { "Referer": `https://m.stock.naver.com/domestic/stock/${c}/total` })
    ));
    missing.slice(0, 20).forEach((c, i) => {
      const j = s2[i].status === "fulfilled" ? s2[i].value : null;
      if (!j) return;
      const mk = toKo(exchangeOf(j, 0)) || sosokOf(j, 0) || "";
      if (mk) results[c] = { market: mk, name: results[c] && results[c].name || j.stockName || "" };
    });
  }
  return new Response(
    JSON.stringify({ ok: true, markets: results }),
    { headers: { "content-type": "application/json", "cache-control": "s-maxage=86400" } }
  );
};

// netlify/functions/news.js
init_euckr();
function _mkDec9(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
var UA22 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
function decodeSmart10(buf, headerCT) {
  const dec = (enc) => {
    try {
      return _mkDec9(enc).decode(buf);
    } catch {
      return null;
    }
  };
  const score2 = (x) => {
    if (!x) return -1e9;
    const bad = (x.match(/\uFFFD/g) || []).length;
    const han = (x.match(/[가-힣]/g) || []).length;
    const broken = (x.match(/[\uD800-\uDFFF\u3130-\u318F]/g) || []).length;
    return han - bad * 5 - broken * 3;
  };
  let declared = "";
  const mH = /charset=([\w-]+)/i.exec(String(headerCT || ""));
  if (mH) declared = mH[1].toLowerCase();
  if (!declared) {
    const head = dec("latin1") || "";
    const mM = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head.slice(0, 2e3));
    if (mM) declared = mM[1].toLowerCase();
  }
  const norm2 = (c) => c === "ms949" || c === "cp949" || c === "ksc5601" ? "euc-kr" : c;
  const cands = [];
  if (declared) {
    const t = dec(norm2(declared));
    if (t) cands.push(t);
  }
  const u = dec("utf-8"), e = dec("euc-kr");
  if (u) cands.push(u);
  if (e) cands.push(e);
  return cands.sort((a, b) => score2(b) - score2(a))[0] || "";
}
async function fetchEuc(url, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA22, "Referer": "https://finance.naver.com/" }, signal: c.signal });
    const buf = await r.arrayBuffer();
    return decodeSmart10(buf, r.headers.get("content-type"));
  } finally {
    clearTimeout(t);
  }
}
function strip(s) {
  return String(s || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
function parseList(html, type) {
  const out = [];
  const re = /<td[^>]*class="title"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td[^>]*class="info"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*class="date"[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while (m = re.exec(html)) {
    const url = "https://finance.naver.com" + m[1].replace(/&amp;/g, "&");
    const title = strip(m[2]);
    const source = strip(m[3]);
    const date = strip(m[4]);
    if (title) out.push({ title, source, date, type, url });
    if (out.length >= 25) break;
  }
  return out;
}
var news_default = async (req2) => {
  const url = new URL(req2.url);
  if (url.searchParams.get("market") === "1") {
    const srcs = [
      "https://finance.naver.com/news/mainnews.naver",
      "https://finance.naver.com/news/news_list.naver?mode=LSS3D&section_id=101&section_id2=258&section_id3=401"
    ];
    let items2 = [];
    let titles = [];
    let src = "";
    const dec = (u) => String(u || "").replace(/&amp;/g, "&");
    const key = (t) => t.replace(/[“”"']/g, "").replace(/[.·…\s]+$/, "").slice(0, 16);
    const scan = (html, requirePress) => {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      const re = /<a[^>]+href="([^"]*(?:article_id|news_read|read\.naver)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
      const ms = [...html.matchAll(re)];
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        const t = strip(m[2]);
        if (!t || t.length < 8 || t.length > 90 || /^\[?포토|^\[?사진|동영상/.test(t)) continue;
        const k = key(t);
        if (seen.has(k)) continue;
        const from = m.index + m[0].length;
        const stop = i + 1 < ms.length ? ms[i + 1].index : html.length;
        const near = html.slice(from, Math.min(stop, from + 800));
        const press = strip((near.match(/class="press"[^>]*>([\s\S]*?)</) || [])[1] || "");
        const time = strip((near.match(/class="wdate"[^>]*>([\s\S]*?)</) || [])[1] || "");
        if (requirePress && !press) continue;
        seen.add(k);
        let href = dec(m[1]);
        if (href.startsWith("/")) href = "https://finance.naver.com" + href;
        out.push({ t, press, time, url: href });
        if (out.length >= 40) break;
      }
      return out;
    };
    for (const u of srcs) {
      try {
        const html = await fetchEuc(u, 6500);
        let list = scan(html, true);
        if (list.length < 5) list = scan(html, false);
        if (list.length >= 8) {
          items2 = list.slice(0, 24);
          titles = list.map((x) => x.t);
          src = u;
          break;
        }
        if (list.length > titles.length) {
          items2 = list.slice(0, 24);
          titles = list.map((x) => x.t);
          src = u;
        }
      } catch {
      }
    }
    return new Response(
      JSON.stringify({ ok: titles.length > 0, titles, items: items2, n: titles.length, src }),
      { headers: { "content-type": "application/json", "cache-control": "s-maxage=180" } }
    );
  }
  const code = String(url.searchParams.get("code") || "005930").replace(/[^0-9A-Za-z]/g, "");
  const type = String(url.searchParams.get("type") || "all");
  const diag = {};
  let items = [];
  async function grab2(kind) {
    const u = kind === "disc" ? `https://finance.naver.com/item/news_notice.naver?code=${code}&page=1` : `https://finance.naver.com/item/news_news.naver?code=${code}&page=1`;
    try {
      const html = await fetchEuc(u, 7e3);
      const list = parseList(html, kind);
      diag[kind] = list.length;
      return list;
    } catch (e) {
      diag[kind] = "err:" + String(e).slice(0, 30);
      return [];
    }
  }
  try {
    if (type === "news" || type === "all") items = items.concat(await grab2("news"));
    if (type === "disc" || type === "all") items = items.concat(await grab2("disc"));
  } catch (e) {
    diag.err = String(e).slice(0, 40);
  }
  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return new Response(
    JSON.stringify({ ok: items.length > 0, code, items: items.slice(0, 30), diag }),
    { headers: { "content-type": "application/json", "cache-control": "s-maxage=120" } }
  );
};

// netlify/functions/nxt.js
init_nxt_core();
var clean = (s) => String(s || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
var nxt_default = async (req2) => {
  const url = new URL(req2.url);
  const list = await resolveFast();
  const ready = !!(list && list.ok && list.count > 0);
  const has = (c) => ready ? Object.prototype.hasOwnProperty.call(list.codes, c) : null;
  const meta = {
    source: list ? list.source : "none",
    asOf: list ? list.asOf : null,
    listCount: list ? list.count : 0
  };
  const codesParam = String(url.searchParams.get("codes") || "");
  if (codesParam) {
    const codes = [...new Set(codesParam.split(",").map(clean).filter((c) => /^[0-9A-Z]{6}$/.test(c)))].slice(0, 200);
    const results = {};
    const markets = {};
    for (const c of codes) {
      results[c] = has(c);
      if (ready && list.markets && list.markets[c]) markets[c] = list.markets[c];
    }
    return json5({ ok: ready, ...meta, results, markets });
  }
  const code = clean(url.searchParams.get("code"));
  if (!/^[0-9A-Z]{6}$/.test(code)) return json5({ ok: false, nxt: null, error: "bad code", ...meta });
  return json5({
    ok: ready,
    code,
    nxt: has(code),
    halted: ready ? (list.halted || []).includes(code) : null,
    market: ready && list.markets && list.markets[code] || null,
    ...meta,
    // 명단에서 최근 빠진 종목이면 이유를 같이 알려 준다
    removedNote: ready && (list.removed || []).includes(code) ? "\uB125\uC2A4\uD2B8\uB808\uC774\uB4DC \uB9E4\uB9E4\uC81C\uC678 \uC885\uBAA9 (\uAC70\uB798\uB7C9 \uC694\uAC74 \uBBF8\uB2EC)" : null
  });
};
function json5(body) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // 명단은 하루 단위로만 바뀐다 — 길게 캐시해도 안전하다
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400"
    }
  });
}

// netlify/functions/nxtadmin.js
init_store();
init_nxt_core();
var json6 = (b, status = 200) => new Response(JSON.stringify(b, null, 2), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
function authed(req2) {
  const token = envGet("NXT_ADMIN_TOKEN");
  if (!token) return { ok: false, why: "NXT_ADMIN_TOKEN \uD658\uACBD\uBCC0\uC218\uAC00 \uC124\uC815\uB3FC \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4" };
  const h = req2.headers.get("authorization") || "";
  const got = h.replace(/^Bearer\s+/i, "").trim();
  if (!got || got !== token) return { ok: false, why: "\uD1A0\uD070\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4" };
  return { ok: true };
}
var nxtadmin_default = async (req2) => {
  const method = req2.method.toUpperCase();
  if (method === "GET") {
    const [pinned, cur] = await Promise.all([readPinned(), resolveFast()]);
    return json6({
      \uC218\uB3D9\uBA85\uB2E8: pinned && pinned.rows && Object.keys(pinned.rows).length ? { \uC885\uBAA9\uC218: Object.keys(pinned.rows).length, \uAE30\uC900\uC77C: pinned.asOf, \uBA54\uBAA8: pinned.note } : null,
      \uD604\uC7AC\uC801\uC6A9: { \uC2E0\uB8B0\uAC00\uB2A5: !!cur.trusted, \uC18C\uC2A4: cur.source, \uC885\uBAA9\uC218: cur.count, \uAE30\uC900\uC77C: cur.asOf },
      \uD1A0\uD070\uC124\uC815\uB428: !!envGet("NXT_ADMIN_TOKEN"),
      \uC0AC\uC6A9\uBC95: "POST \uB85C \uBA85\uB2E8 \uBCF8\uBB38\uC744 \uBCF4\uB0B4\uBA74 \uC989\uC2DC \uBC18\uC601\uB429\uB2C8\uB2E4. Authorization: Bearer <NXT_ADMIN_TOKEN>"
    });
  }
  const a = authed(req2);
  if (!a.ok) return json6({ ok: false, error: a.why }, 401);
  if (method === "DELETE") {
    await clearPinned();
    const r2 = await resolve(true);
    return json6({ ok: true, \uBA54\uC2DC\uC9C0: "\uC218\uB3D9 \uBA85\uB2E8\uC744 \uD574\uC81C\uD558\uACE0 \uC790\uB3D9 \uC218\uC9D1\uC73C\uB85C \uBCF5\uADC0\uD588\uC2B5\uB2C8\uB2E4.", \uD604\uC7AC: { \uC18C\uC2A4: r2.source, \uC885\uBAA9\uC218: r2.count, \uC2E0\uB8B0\uAC00\uB2A5: !!r2.trusted } });
  }
  if (method !== "POST") return json6({ ok: false, error: "GET / POST / DELETE \uB9CC \uC9C0\uC6D0\uD569\uB2C8\uB2E4" }, 405);
  const body = await req2.text();
  if (!body || body.length < 20) return json6({ ok: false, error: "\uBCF8\uBB38\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4" }, 400);
  const rows = extractRows(body);
  if (!rows) return json6({ ok: false, error: "\uBCF8\uBB38\uC5D0\uC11C \uC885\uBAA9\uCF54\uB4DC\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. CSV\xB7TSV\xB7JSON\xB7\uD45C \uBD99\uC5EC\uB123\uAE30 \uD615\uC2DD\uC744 \uC9C0\uC6D0\uD569\uB2C8\uB2E4." }, 400);
  const copy = {};
  for (const [k, v] of Object.entries(rows)) copy[k] = { ...v };
  const { rows: kept, removed } = applyExclusions(copy);
  const audit = auditList(kept);
  if (!audit.ok) {
    return json6({
      ok: false,
      error: "\uAC10\uC0AC\uC5D0 \uC2E4\uD328\uD574 \uBC18\uC601\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uC798\uBABB\uB41C \uBA85\uB2E8\uC73C\uB85C \uB36E\uC5B4\uC4F0\uBA74 \uC804 \uC885\uBAA9\uC774 \uC624\uD310\uB429\uB2C8\uB2E4.",
      \uAC10\uC0AC: audit,
      \uD30C\uC2F1\uB41C\uC885\uBAA9\uC218: Object.keys(rows).length,
      \uC81C\uC678\uACC4\uCE35\uC801\uC6A9: removed.length
    }, 422);
  }
  const url = new URL(req2.url);
  await writePinned(kept, { asOf: url.searchParams.get("asOf") || void 0, note: url.searchParams.get("note") || "manual" });
  const r = await resolve(true);
  return json6({
    ok: true,
    \uBA54\uC2DC\uC9C0: "\uBA85\uB2E8\uC774 \uC989\uC2DC \uBC18\uC601\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC7AC\uBC30\uD3EC\uAC00 \uD544\uC694 \uC5C6\uC2B5\uB2C8\uB2E4.",
    \uBC18\uC601\uACB0\uACFC: { \uC885\uBAA9\uC218: r.count, \uCF54\uC2A4\uD53C: r.kospi, \uCF54\uC2A4\uB2E5: r.kosdaq, \uAE30\uC900\uC77C: r.asOf, \uC18C\uC2A4: r.source },
    \uC81C\uC678\uACC4\uCE35\uC73C\uB85C_\uC81C\uAC70\uB428: removed.length,
    \uBCC0\uACBD: r.change ? { \uCD94\uAC00: r.change.added.length, \uC81C\uC678: r.change.dropped.length } : "\uBCC0\uACBD \uC5C6\uC74C"
  });
};

// netlify/functions/nxtcheck.js
init_nxt_core();
init_nxt_signal();
var nxtcheck_default = async (req2) => {
  const url = new URL(req2.url);
  const codes = (url.searchParams.get("codes") || "").split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[0-9A-Z]{6}$/.test(c)).slice(0, 40);
  if (!codes.length) return json7({ ok: false, error: "no codes", result: {} });
  const store = await blobStore();
  const list = await resolveFast();
  if (list && list.ok && list.count > 0) {
    const result2 = {};
    for (const c of codes) result2[c] = Object.prototype.hasOwnProperty.call(list.codes, c);
    return json7({ ok: true, basis: "\uBA85\uB2E8", asOf: list.asOf, source: list.source, result: result2 });
  }
  const signal = await ensureSignal(store);
  if (!signal.ok) {
    const result2 = {};
    for (const c of codes) result2[c] = null;
    return json7({ ok: false, basis: "\uC2E0\uD638 \uBBF8\uD655\uBCF4", why: signal.why, result: result2 });
  }
  const result = {};
  await Promise.all(codes.map(async (c) => {
    try {
      const m = await fetchStockMeta(c);
      result[c] = m ? isMember(m.feats, signal) : null;
    } catch {
      result[c] = null;
    }
  }));
  return json7({ ok: true, basis: "\uAC70\uB798\uC18C \uC18C\uC18D \uC2E0\uD638", features: signal.features.length, result });
};
var json7 = (o) => new Response(JSON.stringify(o), {
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, s-maxage=300" }
});

// netlify/functions/nxthistory.js
init_nxt_core();
var json8 = (o) => new Response(JSON.stringify(o), {
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, s-maxage=1800" }
});
var nxthistory_default = async () => {
  const store = await blobStore();
  const cur = await resolveFast();
  if (!cur || !cur.ok) return json8({ ok: false, error: "\uD604\uC7AC \uBA85\uB2E8\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4" });
  const curCodes = Object.keys(cur.codes);
  const curSet = new Set(curCodes);
  const curKey = "history:" + (cur.asOf || "unknown");
  let index = [];
  if (store) {
    try {
      index = await store.get("history:index", { type: "json" }) || [];
    } catch {
      index = [];
    }
    if (!index.some((x) => x.key === curKey)) {
      index.push({ key: curKey, asOf: cur.asOf, quarter: cur.quarter || null, count: curCodes.length, at: Date.now() });
      index.sort((a, b) => String(a.asOf).localeCompare(String(b.asOf)));
      try {
        await store.setJSON(curKey, { asOf: cur.asOf, quarter: cur.quarter || null, codes: curCodes, names: cur.names || {} });
        await store.setJSON("history:index", index);
      } catch {
      }
    }
  }
  let prev = null;
  const older = index.filter((x) => x.key !== curKey);
  if (store && older.length) {
    try {
      prev = await store.get(older[older.length - 1].key, { type: "json" });
    } catch {
      prev = null;
    }
  }
  let added = [], removed = [];
  if (prev && Array.isArray(prev.codes)) {
    const prevSet = new Set(prev.codes);
    added = curCodes.filter((c) => !prevSet.has(c)).map((c) => ({ code: c, name: (cur.names || {})[c] || "", market: cur.codes[c] || "" }));
    removed = prev.codes.filter((c) => !curSet.has(c)).map((c) => ({ code: c, name: (prev.names || {})[c] || "" }));
  }
  const officialRemoved = (cur.removed || []).map((r) => typeof r === "string" ? { code: r, name: "" } : r);
  return json8({
    ok: true,
    current: { asOf: cur.asOf, quarter: cur.quarter || NXT_UNIVERSE && NXT_UNIVERSE.quarter || null, count: curCodes.length, kospi: cur.kospi, kosdaq: cur.kosdaq, source: cur.source },
    previous: prev ? { asOf: prev.asOf, quarter: prev.quarter, count: prev.codes.length } : null,
    added,
    removed,
    officialRemoved,
    timeline: index.map((x) => ({ asOf: x.asOf, quarter: x.quarter, count: x.count }))
  });
};

// netlify/functions/nxtlist.js
init_store();
init_nxt_core();
var base = () => envGet("URL") || envGet("DEPLOY_PRIME_URL") || envGet("DEPLOY_URL") || "";
async function maybeRefresh(source) {
  if (NXT_UNIVERSE && NXT_UNIVERSE.official) return;
  if (!/snapshot|스냅샷/.test(String(source || ""))) return;
  try {
    const store = await blobStore();
    if (store) {
      const last = await store.get("lastKick", { type: "json" }).catch(() => null);
      if (last && last.at && Date.now() - last.at < 6 * 60 * 60 * 1e3) return;
      await store.setJSON("lastKick", { at: Date.now() });
    }
    fetch(base() + "/api/cronstep?job=nxt", { method: "POST" }).catch(() => {
    });
  } catch {
  }
}
function json9(body, maxAge) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, s-maxage=${maxAge}, stale-while-revalidate=86400`
    }
  });
}
var nxtlist_default = async (req2) => {
  const url = new URL(req2.url);
  const force = url.searchParams.get("refresh") === "1";
  const probe2 = url.searchParams.get("probe") === "1";
  const r = force ? await collect(2e4) : await resolveFast();
  if (!force) maybeRefresh(r.source);
  if (probe2) {
    const q = String(url.searchParams.get("code") || "").replace(/[^0-9]/g, "");
    return json9({
      ok: r.ok,
      source: r.source,
      count: r.count,
      asOf: r.asOf,
      envUrlSet: !!envGet("NXT_LIST_URL"),
      attempts: r.attempts || [],
      snapshotCount: Object.keys(NXT_UNIVERSE && NXT_UNIVERSE.codes || {}).length,
      probe: q ? { code: q, inList: !!r.codes[q], market: r.codes[q] || null } : null,
      sample: Object.keys(r.codes).slice(0, 10)
    }, 60);
  }
  return json9({
    ok: r.ok,
    trusted: !!r.trusted,
    audit: r.audit,
    attempts: r.attempts || [],
    kospi: r.kospi,
    kosdaq: r.kosdaq,
    halted: r.halted || [],
    status: r.status || "ok",
    asOf: r.asOf,
    quarter: r.quarter || NXT_UNIVERSE && NXT_UNIVERSE.quarter || null,
    official: !!(r.official || NXT_UNIVERSE && NXT_UNIVERSE.official),
    source: r.source,
    count: r.count,
    codes: Object.keys(r.codes),
    // 프런트는 배열만 받으면 된다(가볍게)
    markets: r.codes,
    removed: r.removed || []
  }, r.ok ? 3600 : 60);
};

// netlify/functions/nxtquote.js
init_nxt_core();
var UA23 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
async function jget9(url, ms = 4e3) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA23, "Referer": "https://m.stock.naver.com/", "Accept": "application/json" }, signal: c.signal });
    const txt = await r.text();
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
var num8 = (x) => {
  const n = Number(String(x == null ? "" : x).replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : 0;
};
var firstNum = (o, keys) => {
  for (const k of keys) {
    if (o && o[k] != null) {
      const v = num8(o[k]);
      if (v) return v;
    }
  }
  return 0;
};
var dirSign = (info) => {
  const c = info && info.compareToPreviousPrice && String(info.compareToPreviousPrice.code || "");
  if (c === "4" || c === "5") return -1;
  if (c === "3") return 0;
  return 1;
};
async function oneNxt(code) {
  const j = await jget9(`https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`);
  const arr = j && (j.datas || j.result && j.result.areas && j.result.areas.flatMap((a) => a.datas || []));
  const x = Array.isArray(arr) ? arr[0] : null;
  if (!x) return null;
  const om = x.overMarketPriceInfo;
  const price = om ? firstNum(om, ["overPriceRaw", "overPrice", "closePriceRaw", "closePrice"]) : 0;
  if (!price) return null;
  const kSign = dirSign(x), kChg = kSign * Math.abs(firstNum(x, ["compareToPreviousClosePriceRaw", "compareToPreviousClosePrice"]));
  const kPrice = firstNum(x, ["closePriceRaw", "closePrice"]);
  const prevClose = kPrice ? kPrice - kChg : 0;
  const sign = dirSign(om);
  const magChg = Math.abs(firstNum(om, ["compareToPreviousClosePriceRaw", "compareToPreviousClosePrice"]));
  const magRate = Math.abs(firstNum(om, ["fluctuationsRatioRaw", "fluctuationsRatio"]));
  const change = sign * magChg;
  const base3 = prevClose || (magChg ? price - change : 0);
  const rate = magRate ? sign * magRate : base3 ? (price - base3) / base3 * 100 : 0;
  return {
    code,
    price,
    change: Math.round(change),
    rate: Number(rate.toFixed(2)),
    prevClose: base3 || null,
    volume: firstNum(om, ["accumulatedTradingVolumeRaw", "accumulatedTradingVolume"]) || null,
    status: String(om.overMarketStatus || ""),
    source: "NXT"
  };
}
var nxtquote_default = async (req2) => {
  const url = new URL(req2.url);
  const raw = String(url.searchParams.get("codes") || "").toUpperCase().replace(/[^0-9A-Z,]/g, "");
  const codes = [...new Set(raw.split(",").filter((c) => /^[0-9A-Z]{6}$/.test(c)))].slice(0, 32);
  if (!codes.length) {
    return new Response(JSON.stringify({ ok: false, quotes: [] }), { headers: { "content-type": "application/json" } });
  }
  try {
    const list = await resolveFast();
    const listReady = !!(list && list.ok && list.count > 0);
    const isKrxOnly = (c) => listReady && !Object.prototype.hasOwnProperty.call(list.codes, c);
    const res = await Promise.all(codes.map((c) => isKrxOnly(c) ? Promise.resolve(null) : oneNxt(c).catch(() => null)));
    const quotes = res.filter(Boolean);
    return new Response(JSON.stringify({ ok: quotes.length > 0, n: quotes.length, asked: codes.length, listReady, quotes }), {
      headers: cacheHdr(2, 300)
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, quotes: [], error: String(e).slice(0, 120) }), {
      headers: { "content-type": "application/json" }
    });
  }
};

// netlify/functions/nxtrefresh.js
init_store();
init_nxt_core();
var base2 = () => envGet("URL") || envGet("DEPLOY_PRIME_URL") || envGet("DEPLOY_URL") || "";
var nxtrefresh_default = async (req2) => {
  const run = new URL(req2.url).searchParams.get("run") === "1";
  let \uAE30\uB3D9 = null;
  if (run) {
    const tok = envGet("NXT_ADMIN_TOKEN");
    const auth = req2.headers.get("authorization") || "";
    if (!tok || auth !== "Bearer " + tok)
      return new Response(
        JSON.stringify({ ok: false, err: "\uC778\uC99D \uD544\uC694 \u2014 Authorization: Bearer <NXT_ADMIN_TOKEN>" }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    try {
      const r = await fetch(base2() + "/api/cronstep?job=nxt", { method: "POST" });
      \uAE30\uB3D9 = `\uC218\uC9D1\uAE30 \uAE30\uB3D9\uB428 (${r.status}) \u2014 \uC218\uC2ED \uCD08 \uB4A4 /api/nxtlist \uC5D0 \uBC18\uC601\uB429\uB2C8\uB2E4`;
    } catch (e) {
      \uAE30\uB3D9 = "\uC218\uC9D1\uAE30 \uAE30\uB3D9 \uC2E4\uD328: " + String(e).slice(0, 120);
    }
  }
  const cur = await resolveFast();
  return new Response(JSON.stringify({
    \uAE30\uB3D9,
    \uD604\uC7AC\uC0C1\uD0DC: {
      \uC2E0\uB8B0\uAC00\uB2A5: !!cur.trusted,
      \uC885\uBAA9\uC218: cur.count,
      \uCF54\uC2A4\uD53C: cur.kospi,
      \uCF54\uC2A4\uB2E5: cur.kosdaq,
      \uAE30\uC900\uC77C: cur.asOf,
      \uC18C\uC2A4: cur.source,
      \uC9C4\uB2E8: cur.attempts || [],
      \uAC10\uC0AC: cur.audit
    },
    \uCD5C\uADFC\uC774\uB825: (await readHistory() || []).slice(0, 5)
  }, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
};

// functions/api/[[route]].js
init_picks();

// netlify/functions/popular.js
init_euckr();
function _mkDec10(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
var UA24 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
function decodeSmart11(buf, headerCT) {
  const dec = (enc) => {
    try {
      return _mkDec10(enc).decode(buf);
    } catch {
      return null;
    }
  };
  const score2 = (x) => {
    if (!x) return -1e9;
    const bad = (x.match(/\uFFFD/g) || []).length;
    const han = (x.match(/[가-힣]/g) || []).length;
    const broken = (x.match(/[\uD800-\uDFFF\u3130-\u318F]/g) || []).length;
    return han - bad * 5 - broken * 3;
  };
  let declared = "";
  const mH = /charset=([\w-]+)/i.exec(String(headerCT || ""));
  if (mH) declared = mH[1].toLowerCase();
  if (!declared) {
    const head = dec("latin1") || "";
    const mM = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head.slice(0, 2e3));
    if (mM) declared = mM[1].toLowerCase();
  }
  const norm2 = (c) => c === "ms949" || c === "cp949" || c === "ksc5601" ? "euc-kr" : c;
  const cands = [];
  if (declared) {
    const t = dec(norm2(declared));
    if (t) cands.push(t);
  }
  const u = dec("utf-8"), e = dec("euc-kr");
  if (u) cands.push(u);
  if (e) cands.push(e);
  return cands.sort((a, b) => score2(b) - score2(a))[0] || "";
}
function stripTags3(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
async function fetchDecoded2(url, ms = 6e3) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA24, "Referer": "https://finance.naver.com/sise/" }, signal: c.signal });
    const buf = await r.arrayBuffer();
    return decodeSmart11(buf, r.headers.get("content-type"));
  } finally {
    clearTimeout(t);
  }
}
function parseRank(html) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const re = /item\/main\.(?:naver|nhn)\?code=([0-9][0-9A-Za-z]{5})[^>]*>([\s\S]{1,120}?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const code = m[1];
    const name = stripTags3(m[2]);
    if (!name || /^\d+$/.test(name) || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name });
    if (out.length >= 200) break;          // [v4.13] 40 하드캡 해제 — 100위까지 만들려면 원재료가 더 필요
  }
  return out;
}
var numOf = (v) => {
  const n = Number(String(v == null ? "" : v).replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : 0;
};
async function jsonUniverse(pagesPerMarket = 6) {
  const jobs = [];
  for (const market of ["KOSPI", "KOSDAQ"]) {
    for (let page = 1; page <= pagesPerMarket; page++) {
      jobs.push((async () => {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 4500);
        try {
          const r = await fetch(
            `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=100`,
            { headers: { "User-Agent": UA24, Accept: "application/json", Referer: "https://m.stock.naver.com/" }, signal: c.signal }
          );
          if (!r.ok) return [];
          const j = await r.json();
          return j && (j.stocks || j.datas || j.result && j.result.stocks) || [];
        } catch {
          return [];
        } finally {
          clearTimeout(t);
        }
      })());
    }
  }
  const rows = (await Promise.all(jobs)).flat();
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const r of rows) {
    const code = String(r.itemCode || r.code || r.cd || "").toUpperCase();
    if (!/^[0-9][0-9A-Z]{5}$/.test(code) || seen.has(code)) continue;
    const price = numOf(r.closePrice ?? r.nv);
    const rate = numOf(r.fluctuationsRatio ?? r.cr);
    const vol = numOf(r.accumulatedTradingVolume ?? r.aq);
    if (!price) continue;
    seen.add(code);
    out.push({ code, name: String(r.stockName || r.nm || "").trim() || code, price, rate, volume: vol });
  }
  return out;
}
async function rankFromJson(type) {
  const uni = await jsonUniverse();
  if (uni.length < 50) return [];
  const live = uni.filter((x) => x.volume > 0);
  const base3 = live.length >= 50 ? live : uni;
  if (type === "rise") return base3.filter((x) => x.rate > 0).sort((a, b) => b.rate - a.rate).slice(0, 100);
  if (type === "fall") return base3.filter((x) => x.rate < 0).sort((a, b) => a.rate - b.rate).slice(0, 100);
  return base3.slice().sort((a, b) => b.volume * b.price - a.volume * a.price).slice(0, 100);
}
var URLS = {
  search: "https://finance.naver.com/sise/lastsearch2.naver",
  rise: "https://finance.naver.com/sise/sise_rise.naver",
  fall: "https://finance.naver.com/sise/sise_fall.naver"
};
var variants = (type) => {
  const base3 = URLS[type] || URLS.search;
  if (type === "rise" || type === "fall") return [`${base3}?sosok=0`, `${base3}?sosok=1`, base3];
  return [base3];
};
async function tryFetch(u) {
  for (let i = 0; i < 2; i++) {
    try {
      const html = await fetchDecoded2(u);
      const items = parseRank(html);
      if (items.length) return { u, items };
    } catch (e) {
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { u, items: [] };
}
var popular_default = async (req2) => {
  const url = new URL(req2.url);
  const type = String(url.searchParams.get("type") || "search");
  const diag = [];
  try {
    const res = await Promise.all(variants(type).map(tryFetch));
    const seen = /* @__PURE__ */ new Set();
    let items = [];
    let src = "html";
    for (const r of res) {
      diag.push(r.u.replace("https://finance.naver.com/sise/", "") + ":" + r.items.length);
      for (const it of r.items) {
        if (seen.has(it.code)) continue;
        seen.add(it.code);
        items.push(it);
      }
    }
    /* ══ [v4.18] 조회수 100위 — 가볍고 죽지 않는 합성 ═══════════════════════
       [v4.13 이 왜 화면을 통째로 비웠나]
         ① 최종 응답이 여전히 items.slice(0,40) 이라 100위가 잘려 나갔고
         ② 합성 블록에 try/catch 가 없어, 추가로 붙인 5개 원격 호출 중 하나만
            느려도(=Cloudflare CPU·시간 한도 초과) 함수 전체가 예외로 떨어져
            '조회수 순위를 불러오지 못했습니다'가 됐다.
       [해결] 무거운 합성은 KV 에 5분 캐시하고, 실패해도 기본 목록은 반드시 살린다.
       원격 호출은 2개(거래대금 코스피·코스닥)로 줄여 한도 안에 들어오게 한다. */
    if (type === "search") {
      const CK = "rank:composite";
      let merged = null;
      try {
        const cached = KV ? await KV.get(CK, "json") : null;
        /* [v9.95] 200종으로 늘렸으므로 캐시 유효 기준도 함께 올린다 —
           100종짜리 옛 캐시를 그대로 쓰면 확장이 반영되지 않는다 */
        if (cached && cached.at && Date.now() - cached.at < 5 * 60 * 1000 && Array.isArray(cached.items) && cached.items.length >= 150) {
          merged = cached.items; diag.push("comp:cache" + merged.length);
        }
      } catch (e) { diag.push("comp:kvget"); }

      if (!merged) {
        try {
          const score = /* @__PURE__ */ new Map();
          const feed = (list, weight, origin) => {
            const n = list.length || 1;
            list.forEach((it, i) => {
              if (!it || !it.code) return;
              const add = weight * (1 - i / n);
              const cur = score.get(it.code);
              if (cur) { cur.sc += add; if (cur.origin.indexOf(origin) < 0) cur.origin.push(origin); if (!cur.name && it.name) cur.name = it.name; }
              else score.set(it.code, { code: it.code, name: it.name || "", sc: add, origin: [origin] });
            });
          };
          feed(items, 1.0, "view");
          const grab = async (u) => { try { return parseRank(await fetchDecoded2(u, 4500)); } catch (e) { return []; } };
          const more = await Promise.all([
            grab("https://finance.naver.com/sise/sise_quant.naver?sosok=0"),
            grab("https://finance.naver.com/sise/sise_quant.naver?sosok=1")
          ]);
          diag.push("quant:" + more[0].length + "+" + more[1].length);
          feed(more[0], 0.55, "value"); feed(more[1], 0.55, "value");
          const viewSet = new Set(items.map((x) => x.code));
          /* [v9.95] 목록을 200종으로 확장 — 100위에서 잘려 "더 볼 것이 없어" 보였다 */
      const list = [...score.values()].sort((a2, b2) => b2.sc - a2.sc).slice(0, 200)
            .map((x) => ({ code: x.code, name: x.name, origin: x.origin.join("+"), fill: viewSet.has(x.code) ? "" : x.origin[0] }));
          if (list.length > items.length) {
            merged = list;
            try { if (KV) await KV.put(CK, JSON.stringify({ at: Date.now(), items: list }), { expirationTtl: 900 }); } catch (e) { }
          }
          diag.push("comp:build" + (merged ? merged.length : 0));
        } catch (e) { diag.push("comp:err " + String(e).slice(0, 30)); }   // 실패해도 기본 목록 유지
      }
      if (merged && merged.length > items.length) { items = merged; src = "composite"; }
    }
    if (items.length < 5 || (type === "search" && items.length < 60)) {
      try {
        const j = await rankFromJson(type);
        diag.push("json:" + j.length);
        if (j.length >= 5) {
          if (items.length >= 5) {          // [v4.13] 있는 목록을 버리지 않고 뒤에 이어 붙인다
            const have = new Set(items.map((x) => x.code));
            for (const it of j) { if (items.length >= 100) break; if (have.has(it.code)) continue; have.add(it.code); it.fill = it.fill || "value"; items.push(it); }
            src = src + "+json";
          } else { items = j.slice(0, 200); src = "json"; }
        }
      } catch (e) {
        diag.push("json:err " + String(e).slice(0, 40));
      }
    }
    return new Response(
      JSON.stringify({ ok: items.length > 0, type, n: items.length, src, items: items.slice(0, 200), diag }),
      { headers: { "content-type": "application/json", "cache-control": items.length ? "s-maxage=60" : "public, max-age=5" } }
    );
  } catch (e) {
    try {
      const j = await rankFromJson(type);
      if (j.length >= 5) return new Response(
        JSON.stringify({ ok: true, type, n: j.length, src: "json-rescue", items: j, diag }),
        { headers: { "content-type": "application/json", "cache-control": "s-maxage=60" } }
      );
    } catch {
    }
    return new Response(
      JSON.stringify({ ok: false, type, items: [], error: String(e).slice(0, 120), diag }),
      { headers: cacheHdr(30, 600) }
    );
  }
};

// netlify/functions/quote.js
var UA25 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
var HDRS = { "User-Agent": UA25, "Referer": "https://finance.naver.com/", "Accept": "application/json" };
var num9 = (v) => Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;
async function jget10(url, ms = 5e3) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: HDRS, signal: c.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
function normalize(d) {
  const price = num9(d.closePriceRaw ?? d.closePrice ?? d.nv);
  const ratio = num9(d.fluctuationsRatioRaw ?? d.fluctuationsRatio ?? d.cr);
  let change = Math.abs(num9(d.compareToPreviousClosePriceRaw ?? d.compareToPreviousClosePrice ?? d.cv));
  if (ratio < 0) change = -change;
  const ms = d.marketStatus ?? d.ms ?? "CLOSE";
  const om = d.overMarketPriceInfo || null;
  const omPrice = om ? num9(om.overPriceRaw ?? om.overPrice) : 0;
  const omStatus = om ? String(om.overMarketStatus ?? om.tradingSessionType ?? "") : "";
  const nxtMember = !!d.integratedPriceInfo;
  const ip = d.integratedPriceInfo || null;
  const ipPrice = ip ? num9(ip.integratedPriceRaw ?? ip.integratedPrice ?? ip.currentPriceRaw ?? ip.currentPrice ?? ip.closePriceRaw ?? ip.closePrice ?? ip.overPriceRaw ?? ip.overPrice) : 0;
  const prev = price - change;
  return {
    code: String(d.itemCode ?? d.cd ?? "").toUpperCase(),
    name: d.stockName ?? d.nm ?? "",
    price,
    change,
    rate: ratio,
    prevClose: prev,
    open: num9(d.openPriceRaw ?? d.openPrice ?? d.ov),
    high: num9(d.highPriceRaw ?? d.highPrice ?? d.hv),
    low: num9(d.lowPriceRaw ?? d.lowPrice ?? d.lv),
    /* ══ [v5.5] 거래량이 실제와 크게 어긋나던 이유 ═══════════════════════════
       네이버 응답에는 세 벌의 거래량이 들어 있다.
         · 기본(accumulatedTradingVolume)  = KRX 정규장 누적
         · overMarketPriceInfo            = NXT 시간외 누적
         · integratedPriceInfo            = KRX+NXT 통합 누적
       그런데 통합 정보에서 '가격'만 뽑고 거래량은 기본값을 그대로 쓰고 있었다.
       그래서 NXT 시간대에는 KRX 값만 보여 실제 거래량과 크게 달랐다.
       → 통합 값이 있으면 그것을 쓰고, 없으면 기본 + 시간외를 더한다. */
    volume: (function(){
      const base=num9(d.accumulatedTradingVolumeRaw ?? d.accumulatedTradingVolume ?? d.aq);
      const iv=ip?num9(ip.accumulatedTradingVolumeRaw ?? ip.accumulatedTradingVolume ?? ip.aq):0;
      if(iv>0)return iv;
      const ov=om?num9(om.accumulatedTradingVolumeRaw ?? om.accumulatedTradingVolume ?? om.aq):0;
      return (ov>0?base+ov:base);
    })(),
    value: (function(){
      const base=num9(d.accumulatedTradingValueRaw ?? d.accumulatedTradingValue ?? d.aa);
      const ivv=ip?num9(ip.accumulatedTradingValueRaw ?? ip.accumulatedTradingValue ?? ip.aa):0;
      if(ivv>0)return ivv;
      const ovv=om?num9(om.accumulatedTradingValueRaw ?? om.accumulatedTradingValue ?? om.aa):0;
      return (ovv>0?base+ovv:base);
    })(),
    /* 어느 쪽 값인지 화면에서 구분할 수 있게 함께 보낸다 */
    volKrx: num9(d.accumulatedTradingVolumeRaw ?? d.accumulatedTradingVolume ?? d.aq),
    volNxt: om?num9(om.accumulatedTradingVolumeRaw ?? om.accumulatedTradingVolume ?? om.aq):0,
    marketStatus: String(ms).toUpperCase().includes("OPEN") ? "OPEN" : "CLOSE",
    time: d.localTradedAt ?? "",
    // NXT 신호: nxtMember=자격(통합시세 존재), nxtHas=활동 구조, nxtLive=실제 NXT 체결가
    nxtMember,
    nxtHas: !!om,
    nxtLive: omPrice > 0,
    nxtPrice: omPrice || null,
    nxtRate: om ? num9(om.fluctuationsRatioRaw ?? om.fluctuationsRatio) : null,
    nxtStatus: omStatus,
    uniPrice: ipPrice || null
  };
}
async function pollingBatch(kind, codes) {
  const j = await jget10(`https://polling.finance.naver.com/api/realtime/domestic/${kind}/${codes.join(",")}`);
  const datas = j?.datas || (j?.result?.areas || []).flatMap((a) => a.datas || []) || [];
  return datas.map(normalize).filter((q) => q.code && q.price);
}
async function mobileOne(code) {
  const d = await jget10(`https://m.stock.naver.com/api/stock/${code}/basic`, 4e3);
  if (!d) return null;
  const q = normalize({
    itemCode: d.stockEndCode || d.itemCode || code,
    stockName: d.stockName,
    closePrice: d.closePrice,
    compareToPreviousClosePrice: d.compareToPreviousClosePrice,
    fluctuationsRatio: d.fluctuationsRatio,
    openPrice: d.openPrice,
    highPrice: d.highPrice,
    lowPrice: d.lowPrice,
    accumulatedTradingVolume: d.accumulatedTradingVolume,
    accumulatedTradingValue: d.accumulatedTradingValue,
    marketStatus: d.marketStatus
  });
  if (!q.code) q.code = String(code).toUpperCase();
  q.nxtHas = void 0;
  q.nxtLive = false;
  q.nxtMember = void 0;
  return q.price ? q : null;
}
var quote_default = async (req2) => {
  const url = new URL(req2.url);
  const raw = String(url.searchParams.get("codes") || "005930").toUpperCase().replace(/[^0-9A-Z,]/g, "");
  const codes = [...new Set(raw.split(",").filter((c) => /^[0-9A-Z]{6}$/.test(c)))].slice(0, 200);
  const diag = [];
  if (!codes.length) {
    return new Response(
      JSON.stringify({ ok: false, quotes: [], diag: ["no valid codes"] }),
      { headers: cacheHdr(2, 300) }
    );
  }
  try {
    const CH = 40;
    const chunks = [];
    for (let i = 0; i < codes.length; i += CH) chunks.push(codes.slice(i, i + CH));
    const per = await Promise.all(chunks.map(async (cs) => {
      let out = [];
      try {
        out = await pollingBatch("stock", cs);
      } catch (e) {
        diag.push("stock:" + String(e).slice(0, 40));
      }
      const missing = cs.filter((c) => !out.some((q) => q.code === c));
      if (missing.length) {
        try {
          const etf = await pollingBatch("etf", missing);
          out = out.concat(etf);
        } catch (e) {
          diag.push("etf:" + String(e).slice(0, 40));
        }
      }
      return out;
    }));
    let quotes = per.flat();
    const still = codes.filter((c) => !quotes.some((q) => q.code === c)).slice(0, 12);
    if (still.length) {
      const solo = await Promise.all(still.map((c) => mobileOne(c).catch(() => null)));
      quotes = quotes.concat(solo.filter(Boolean));
      diag.push("solo:" + still.length + "/" + solo.filter(Boolean).length);
    }
    const map = new Map(quotes.map((q) => [q.code, q]));
    const ordered = codes.map((c) => map.get(c)).filter(Boolean);
    return new Response(JSON.stringify({ ok: ordered.length > 0, n: ordered.length, asked: codes.length, quotes: ordered, diag }), {
      headers: cacheHdr(2, 300)
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e), quotes: [], diag }), {
      headers: cacheHdr(2, 300)
    });
  }
};

// netlify/functions/search.js
init_euckr();
function _mkDec11(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
var UA26 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
function decodeSmart12(buf, headerCT) {
  const dec = (enc) => {
    try {
      return _mkDec11(enc).decode(buf);
    } catch {
      return null;
    }
  };
  const score2 = (x) => {
    if (!x) return -1e9;
    const bad = (x.match(/\uFFFD/g) || []).length;
    const han = (x.match(/[가-힣]/g) || []).length;
    const broken = (x.match(/[\uD800-\uDFFF\u3130-\u318F]/g) || []).length;
    return han - bad * 5 - broken * 3;
  };
  let declared = "";
  const mH = /charset=([\w-]+)/i.exec(String(headerCT || ""));
  if (mH) declared = mH[1].toLowerCase();
  if (!declared) {
    const head = dec("latin1") || "";
    const mM = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head.slice(0, 2e3));
    if (mM) declared = mM[1].toLowerCase();
  }
  const norm2 = (c) => c === "ms949" || c === "cp949" || c === "ksc5601" ? "euc-kr" : c;
  const cands = [];
  if (declared) {
    const t = dec(norm2(declared));
    if (t) cands.push(t);
  }
  const u = dec("utf-8"), e = dec("euc-kr");
  if (u) cands.push(u);
  if (e) cands.push(e);
  return cands.sort((a, b) => score2(b) - score2(a))[0] || "";
}
async function fetchText4(url, ms, headers) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers, signal: c.signal });
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}
async function fetchEuc2(url, ms, headers) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers, signal: c.signal });
    const buf = await r.arrayBuffer();
    return decodeSmart12(buf, r.headers.get("content-type"));
  } finally {
    clearTimeout(t);
  }
}
var stripTags4 = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim();
var CODE_RE2 = /^[0-9A-Z]{6}$/;
var isCode2 = (v) => CODE_RE2.test(String(v || "").toUpperCase());
var mkMarket = (v) => {
  v = String(v || "");
  if (/KOSDAQ|코스닥/i.test(v)) return "\uCF54\uC2A4\uB2E5";
  if (/KONEX|코넥스/i.test(v)) return "\uCF54\uB125\uC2A4";
  if (/KOSPI|유가|코스피/i.test(v)) return "\uCF54\uC2A4\uD53C";
  return "";
};
function kindOf(name, raw) {
  const s = (String(raw || "") + " " + String(name || "")).toUpperCase();
  if (/ETN/.test(s)) return "ETN";
  if (/ETF/.test(s)) return "ETF";
  const n = String(name || "");
  if (/^(KODEX|TIGER|SOL|ACE|RISE|PLUS|KOSEF|ARIRANG|HANARO|TIMEFOLIO|KIWOOM|WOORI|BNK|히어로즈|마이다스|파워)/i.test(n)) return "ETF";
  if (/리츠$/.test(n)) return "\uB9AC\uCE20";
  if (/스팩|기업인수목적/.test(n)) return "\uC2A4\uD329";
  return "";
}
async function viaFrontApi(q, target) {
  const url = `https://m.stock.naver.com/front-api/search/autoComplete?query=${encodeURIComponent(q)}&target=${encodeURIComponent(target)}`;
  const j = JSON.parse(await fetchText4(url, 4e3, { "User-Agent": UA26, "Referer": "https://m.stock.naver.com/", "Accept": "application/json" }));
  const items = j && j.result && (j.result.items || j.result.stocks) || j && j.items || [];
  return items.map((it) => ({
    code: String(it.code || it.cd || it.itemCode || it.reutersCode || "").toUpperCase(),
    name: stripTags4(it.name || it.nm || it.stockName),
    market: mkMarket(it.stockExchangeType && (it.stockExchangeType.name || it.stockExchangeType.code) || it.marketName || it.market || it.nationName),
    kind: kindOf(stripTags4(it.name || it.nm || it.stockName), it.typeCode || it.stockType || it.category)
  })).filter((x) => isCode2(x.code) && x.name);
}
async function viaAc(q) {
  const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock,index,etf,etn,fund`;
  const j = JSON.parse(await fetchText4(url, 4e3, { "User-Agent": UA26, "Referer": "https://finance.naver.com/", "Accept": "application/json" }));
  const items = j && j.items || [];
  const out = [];
  for (const it of items) {
    const fields = (Array.isArray(it) ? it : []).map((f) => Array.isArray(f) ? String(f[0] || "") : String(f || ""));
    const code = (fields.find((f) => isCode2(f)) || "").toUpperCase();
    const market = mkMarket(fields.find((f) => /KOSPI|KOSDAQ|KONEX|코스피|코스닥|코넥스/i.test(f)));
    const name = stripTags4(fields.find((f) => /[가-힣A-Za-z]/.test(f) && !isCode2(f) && !/^\d+$/.test(f) && !/KOSPI|KOSDAQ|KONEX|stock|index|etf|etn/i.test(f)));
    if (code && name) out.push({ code, name, market, kind: kindOf(name, fields.join(" ")) });
  }
  return out;
}
async function viaFinanceHtml(q) {
  const url = `https://finance.naver.com/search/searchList.naver?query=${encodeURIComponent(q)}`;
  const html = await fetchEuc2(url, 5e3, { "User-Agent": UA26, "Referer": "https://finance.naver.com/" });
  const out = [];
  const re = /\/item\/main\.naver\?code=([0-9A-Za-z]{6})"[^>]*>([^<]{1,60})</g;
  let m;
  while (m = re.exec(html)) {
    const code = m[1].toUpperCase();
    const name = stripTags4(m[2]);
    if (isCode2(code) && name) out.push({ code, name, market: "", kind: kindOf(name, "") });
  }
  return out;
}
var search_default = async (req2) => {
  const url = new URL(req2.url);
  const raw = String(url.searchParams.get("q") || "").trim();
  if (!raw) return new Response(JSON.stringify({ ok: true, items: [] }), { headers: { "content-type": "application/json" } });
  const noSpace = raw.replace(/\s+/g, "");
  const variants2 = [.../* @__PURE__ */ new Set([raw, noSpace])];
  const tasks = [];
  for (const v of variants2) {
    tasks.push(viaFrontApi(v, "stock,etf,etn"));
    tasks.push(viaFrontApi(v, "stock"));
    tasks.push(viaAc(v));
  }
  tasks.push(viaFinanceHtml(raw));
  const settled = await Promise.allSettled(tasks);
  let items = [];
  settled.forEach((s) => {
    if (s.status === "fulfilled" && Array.isArray(s.value)) items.push(...s.value);
  });
  if (isCode2(raw.toUpperCase()) && !items.some((x) => x.code === raw.toUpperCase())) {
    items.unshift({ code: raw.toUpperCase(), name: raw.toUpperCase(), market: "", kind: "" });
  }
  const map = /* @__PURE__ */ new Map();
  for (const it of items) {
    const prev = map.get(it.code);
    if (!prev) {
      map.set(it.code, it);
      continue;
    }
    map.set(it.code, {
      code: it.code,
      name: prev.name && prev.name.length >= (it.name || "").length ? prev.name : it.name,
      market: prev.market || it.market,
      kind: prev.kind || it.kind
    });
  }
  const qn = noSpace.toLowerCase();
  const score2 = (n) => {
    const s = String(n || "").replace(/\s+/g, "").toLowerCase();
    if (s === qn) return 0;
    if (s.startsWith(qn)) return 1;
    if (s.includes(qn)) return 2;
    return 3;
  };
  const list = [...map.values()].sort((a, b) => score2(a.name) - score2(b.name) || a.name.localeCompare(b.name)).slice(0, 120);
  return new Response(
    JSON.stringify({ ok: true, items: list, diag: { n: list.length } }),
    { headers: { "content-type": "application/json", "cache-control": "s-maxage=300" } }
  );
};

// netlify/functions/stockaudit.js
init_nxt_core();
var UA27 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
var num10 = (v) => {
  const n = Number(String(v == null ? "" : v).replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : 0;
};
async function jget11(url, ms = 4e3) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA27, Referer: "https://finance.naver.com/", Accept: "application/json" }, signal: c.signal });
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
var UNI = null;
var UNI_AT = 0;
async function universe2() {
  if (UNI && Date.now() - UNI_AT < 10 * 60 * 1e3) return UNI;
  const out = [];
  for (const market of ["KOSPI", "KOSDAQ"]) {
    for (let page = 1; page <= 40; page++) {
      const j = await jget11(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=100`, 4500);
      const rows = j && (j.stocks || j.datas || j.result && j.result.stocks) || [];
      if (!rows.length) break;
      for (const r of rows) {
        const code = String(r.itemCode || r.code || r.cd || "").toUpperCase().replace(/\.(KS|KQ)$/, "");
        if (/^[0-9A-Z]{6}$/.test(code)) out.push({ code, name: String(r.stockName || r.nm || "").trim(), market });
      }
      if (rows.length < 100) break;
    }
  }
  const seen = /* @__PURE__ */ new Set();
  UNI = out.filter((s) => seen.has(s.code) ? false : (seen.add(s.code), true));
  UNI_AT = Date.now();
  return UNI;
}
async function pollOne(code) {
  const j = await jget11(`https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`, 4e3);
  const arr = j && (j.datas || j.result && j.result.areas && j.result.areas.flatMap((a) => a.datas || []));
  const d = Array.isArray(arr) ? arr[0] : null;
  if (!d) return null;
  const om = d.overMarketPriceInfo || null;
  const nxtPrice = om ? num10(om.overPriceRaw ?? om.overPrice ?? om.closePriceRaw ?? om.closePrice) : 0;
  const kPrice = num10(d.closePriceRaw ?? d.closePrice);
  const cc = d.compareToPreviousPrice && String(d.compareToPreviousPrice.code || "");
  const cSign = cc === "4" || cc === "5" ? -1 : cc === "3" ? 0 : 1;
  const kChg = cSign * Math.abs(num10(d.compareToPreviousClosePriceRaw ?? d.compareToPreviousClosePrice));
  const prevClose = kPrice ? kPrice - kChg : 0;
  const ip = d.integratedPriceInfo || null;
  const uniPrice = ip ? num10(ip.integratedPriceRaw ?? ip.integratedPrice ?? ip.currentPriceRaw ?? ip.currentPrice ?? ip.closePriceRaw ?? ip.closePrice ?? ip.overPriceRaw ?? ip.overPrice) : 0;
  return {
    member: !!d.integratedPriceInfo,
    active: !!om,
    priced: kPrice > 0,
    nxtPrice: nxtPrice || null,
    prevClose: prevClose || null,
    uniPrice: uniPrice || null
  };
}
async function pollBatch(codes) {
  const map = /* @__PURE__ */ new Map();
  const res = await Promise.all(codes.map((c) => pollOne(c).catch(() => null)));
  codes.forEach((c, i) => {
    if (res[i]) map.set(c, res[i]);
  });
  return map;
}
var stockaudit_default = async (req2) => {
  const url = new URL(req2.url);
  const from = Math.max(0, parseInt(url.searchParams.get("from") || "0", 10) || 0);
  const count = Math.min(40, Math.max(1, parseInt(url.searchParams.get("count") || "40", 10) || 40));
  const uni = await universe2();
  if (!uni.length) return json10({ ok: false, total: 0, error: "\uC804 \uC885\uBAA9 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4" });
  const list = await resolveFast();
  const listReady = !!(list && list.ok && list.count > 0);
  const snapMember = (code) => listReady ? Object.prototype.hasOwnProperty.call(list.codes, code) : null;
  let uniAll = uni;
  if (listReady) {
    const have = new Set(uni.map((s) => s.code));
    const extra = Object.keys(list.codes).filter((c) => !have.has(c)).map((c) => ({ code: c, name: list.names && list.names[c] || c, market: list.codes[c] || "" }));
    if (extra.length) uniAll = uni.concat(extra);
  }
  const slice = uniAll.slice(from, from + count);
  const codes = slice.map((s) => s.code);
  let pm = /* @__PURE__ */ new Map();
  try {
    pm = await pollBatch(codes);
  } catch {
  }
  const results = slice.map((s) => {
    const official = snapMember(s.code);
    const p = pm.get(s.code);
    const mk = s.market || "";
    if (!p || !p.priced) {
      if (official === true) return { code: s.code, name: s.name, market: mk, ok: true, nxt: true, halted: true };
      return { code: s.code, name: s.name, market: mk, ok: false, issue: "no-data", nxt: official === true };
    }
    if (official === false && p.active) return { code: s.code, name: s.name, market: mk, ok: false, issue: "add", nxt: true, nxtPrice: p.nxtPrice, prevClose: p.prevClose, uniPrice: p.uniPrice };
    return { code: s.code, name: s.name, market: mk, ok: true, nxt: official === true, active: p.active, nxtPrice: p.nxtPrice, prevClose: p.prevClose, uniPrice: p.uniPrice };
  });
  return json10({ ok: true, total: uniAll.length, from, count: slice.length, listReady, listAsOf: listReady ? list.asOf : null, results });
};
var json10 = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=5" } });

// netlify/functions/stocklist.js
init_euckr();
function _mkDec12(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
var UA28 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
function decodeSmart13(buf, ct) {
  const dec = (e2) => {
    try {
      return _mkDec12(e2).decode(buf);
    } catch {
      return null;
    }
  };
  const score2 = (x) => {
    if (!x) return -1e9;
    return (x.match(/[가-힣]/g) || []).length - (x.match(/\uFFFD/g) || []).length * 5;
  };
  let d = "";
  const m = /charset=([\w-]+)/i.exec(String(ct || ""));
  if (m) d = m[1].toLowerCase();
  const norm2 = (c) => c === "ms949" || c === "cp949" || c === "ksc5601" ? "euc-kr" : c;
  const cands = [];
  if (d) {
    const t = dec(norm2(d));
    if (t) cands.push(t);
  }
  const u = dec("utf-8"), e = dec("euc-kr");
  if (u) cands.push(u);
  if (e) cands.push(e);
  return cands.sort((a, b) => score2(b) - score2(a))[0] || "";
}
async function get(url, ms, headers) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: Object.assign({ "User-Agent": UA28 }, headers || {}), signal: c.signal });
    const buf = await r.arrayBuffer();
    return { status: r.status, text: decodeSmart13(buf, r.headers.get("content-type")) };
  } finally {
    clearTimeout(t);
  }
}
var clean2 = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
async function viaMobile(market, page) {
  const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=100`;
  const r = await get(url, 4e3, { "Referer": "https://m.stock.naver.com/", "Accept": "application/json" });
  let j = null;
  try {
    j = JSON.parse(r.text);
  } catch {
    return null;
  }
  const arr = j && (j.stocks || j.result || j.items) || null;
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr.map((x) => ({
    code: String(x.itemCode || x.code || x.reutersCode || "").toUpperCase().replace(/\.(KS|KQ)$/, ""),
    name: clean2(x.stockName || x.itemName || x.name),
    market: market === "KOSDAQ" ? "\uCF54\uC2A4\uB2E5" : market === "KONEX" ? "\uCF54\uB125\uC2A4" : "\uCF54\uC2A4\uD53C"
  })).filter((x) => /^[0-9A-Z]{6}$/.test(x.code) && x.name);
}
async function viaHtml(market, page) {
  if (market === "KONEX") return [];
  const sosok = market === "KOSDAQ" ? 1 : 0;
  const url = `https://finance.naver.com/sise/sise_market_sum.naver?sosok=${sosok}&page=${page}`;
  const r = await get(url, 4500, { "Referer": "https://finance.naver.com/sise/" });
  const html = r.text || "";
  const out = [];
  const re = /\/item\/main\.naver\?code=([0-9A-Za-z]{6})"[^>]*>([^<]{1,40})</g;
  let m;
  while (m = re.exec(html)) {
    const code = m[1].toUpperCase(), name = clean2(m[2]);
    if (name) out.push({ code, name, market: sosok ? "\uCF54\uC2A4\uB2E5" : "\uCF54\uC2A4\uD53C" });
  }
  const seen = /* @__PURE__ */ new Set();
  return out.filter((x) => {
    if (seen.has(x.code)) return false;
    seen.add(x.code);
    return true;
  });
}
var stocklist_default = async (req2) => {
  const url = new URL(req2.url);
  const mq = (url.searchParams.get("market") || "KOSPI").toUpperCase();
  const market = mq === "KOSDAQ" ? "KOSDAQ" : mq === "KONEX" ? "KONEX" : "KOSPI";
  const page = Math.max(1, Math.min(60, parseInt(url.searchParams.get("page") || "1", 10) || 1));
  const diag = {};
  let items = null;
  try {
    items = await viaMobile(market, page);
    diag.mobile = items ? items.length : "x";
  } catch {
    diag.mobile = "err";
  }
  if (!items || !items.length) {
    try {
      const a = await viaHtml(market, page * 2 - 1);
      const b = a && a.length === 50 ? await viaHtml(market, page * 2) : [];
      const seen = /* @__PURE__ */ new Set();
      items = (a || []).concat(b || []).filter((x) => seen.has(x.code) ? false : (seen.add(x.code), true));
      diag.html = items.length;
    } catch {
      diag.html = "err";
    }
  }
  items = items || [];
  return new Response(
    JSON.stringify({ ok: items.length > 0, market, page, n: items.length, items, diag }),
    /* [v2.9.7] 24시간 캐시 때문에 신규 상장이 하루 이틀 늦게 보였다.
       1시간으로 줄이고, 만료 뒤에도 옛 응답을 즉시 주면서 뒤에서 갱신한다(체감 지연 0). */
    { headers: { "content-type": "application/json", "cache-control": "s-maxage=3600, stale-while-revalidate=86400" } }
  );
};

// netlify/functions/themes.js
init_euckr();
function _mkDec13(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
var UA29 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
function decodeSmart14(buf, headerCT) {
  const dec = (enc) => {
    try {
      return _mkDec13(enc).decode(buf);
    } catch {
      return null;
    }
  };
  const score2 = (x) => {
    if (!x) return -1e9;
    const bad = (x.match(/\uFFFD/g) || []).length;
    const han = (x.match(/[가-힣]/g) || []).length;
    const broken = (x.match(/[\u3130-\u318F]/g) || []).length;
    return han - bad * 5 - broken * 3;
  };
  let declared = "";
  const mH = /charset=([\w-]+)/i.exec(String(headerCT || ""));
  if (mH) declared = mH[1].toLowerCase();
  if (!declared) {
    const head = dec("latin1") || "";
    const mM = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head.slice(0, 2e3));
    if (mM) declared = mM[1].toLowerCase();
  }
  const norm2 = (c) => c === "ms949" || c === "cp949" || c === "ksc5601" ? "euc-kr" : c;
  const cands = [];
  if (declared) {
    const t = dec(norm2(declared));
    if (t) cands.push(t);
  }
  const u = dec("utf-8"), e = dec("euc-kr");
  if (u) cands.push(u);
  if (e) cands.push(e);
  return cands.sort((a, b) => score2(b) - score2(a))[0] || "";
}
async function getHtml(url, ms = 6e3) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA29, "Referer": "https://finance.naver.com/sise/" }, signal: c.signal });
    const buf = await r.arrayBuffer();
    return decodeSmart14(buf, r.headers.get("content-type"));
  } finally {
    clearTimeout(t);
  }
}
var strip2 = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
function parseRow(row, type) {
  const link = new RegExp(`sise_group_detail\\.naver\\?type=${type}&no=(\\d+)"[^>]*>([^<]+)<`).exec(row);
  if (!link) return null;
  const no = link[1], name = strip2(link[2]);
  if (!name) return null;
  const text = strip2(row);
  const pcts = (text.match(/[+-]?\d+(?:\.\d+)?%/g) || []).map((x) => Number(x.replace("%", "")));
  const rate = pcts.length ? pcts[0] : null;
  const rate3 = pcts.length > 1 ? pcts[1] : null;
  const leaders = [];
  const re = /\/item\/main\.naver\?code=([0-9A-Z]{6})"[^>]*>([^<]{1,40})</g;
  let m;
  while ((m = re.exec(row)) !== null) leaders.push({ code: m[1].toUpperCase(), name: strip2(m[2]) });
  const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map(strip2);
  const ints = cells.filter((c) => /^\d{1,4}$/.test(c)).map(Number);
  let count = null, up = null, flat = null, down = null;
  if (ints.length >= 4) {
    count = ints[0];
    up = ints[1];
    flat = ints[2];
    down = ints[3];
  } else if (ints.length === 3) {
    up = ints[0];
    flat = ints[1];
    down = ints[2];
  } else if (ints.length === 2) {
    up = ints[0];
    down = ints[1];
  }
  return { no, name, rate, rate3, count, up, flat, down, leaders: leaders.slice(0, 3) };
}
function parseList2(html, type) {
  const rows = html.split(/<tr[^>]*>/i).slice(1);
  const out = [], seen = /* @__PURE__ */ new Set();
  for (const r of rows) {
    const g = parseRow(r, type);
    if (!g || seen.has(g.no)) continue;
    seen.add(g.no);
    out.push(g);
  }
  return out;
}
var themes_default = async (req2) => {
  const url = new URL(req2.url);
  const type = url.searchParams.get("type") === "upjong" ? "upjong" : "theme";
  const diag = [];
  try {
    let items = [];
    if (type === "theme") {
      /* ══ [v8.6] 테마가 빠지던 이유 ═══════════════════════════════════════
         네이버 테마 목록은 한 페이지에 40개씩, 2026년 기준 300개가 넘어
         8페이지(320개)로는 뒷부분이 잘렸다. 화면에는 '266개 테마'로 나왔는데
         실제로는 더 있었고, K-뷰티·화장품처럼 뒤쪽에 있는 테마가 통째로 빠졌다.
         [고침] 12페이지까지 읽고, 빈 페이지가 나오면 거기서 멈춘다.
         (한 페이지가 비면 그 뒤는 없다) */
      const pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const htmls = await Promise.all(pages.map((p) => getHtml(`https://finance.naver.com/sise/theme.naver?page=${p}`).catch((e) => {
        diag.push("p" + p + ":" + String(e).slice(0, 100));
        return "";
      })));
      const seen = /* @__PURE__ */ new Set();
      htmls.forEach((h) => parseList2(h, "theme").forEach((g) => {
        if (!seen.has(g.no)) {
          seen.add(g.no);
          items.push(g);
        }
      }));
    } else {
      const h = await getHtml("https://finance.naver.com/sise/sise_group.naver?type=upjong");
      items = parseList2(h, "upjong");
    }
    return new Response(JSON.stringify({ ok: items.length > 0, type, n: items.length, items, diag }), {
      headers: { "content-type": "application/json", "cache-control": "s-maxage=120" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, type, n: 0, items: [], error: String(e).slice(0, 120), diag }), {
      headers: { "content-type": "application/json" }
    });
  }
};

// netlify/functions/themestocks.js
init_euckr();
function _mkDec14(enc) {
  const e = String(enc || "utf-8").toLowerCase();
  if (/euc-kr|ks_c_5601|ksc5601|cp949|ms949|windows-949/.test(e)) return { decode: (b) => decodeEucKr(b) };
  try {
    return new TextDecoder(e);
  } catch (x) {
    return { decode: (b) => decodeEucKr(b) };
  }
}
var UA30 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
function decodeSmart15(buf, headerCT) {
  const dec = (enc) => {
    try {
      return _mkDec14(enc).decode(buf);
    } catch {
      return null;
    }
  };
  const score2 = (x) => {
    if (!x) return -1e9;
    const bad = (x.match(/\uFFFD/g) || []).length;
    const han = (x.match(/[가-힣]/g) || []).length;
    const broken = (x.match(/[\u3130-\u318F]/g) || []).length;
    return han - bad * 5 - broken * 3;
  };
  let declared = "";
  const mH = /charset=([\w-]+)/i.exec(String(headerCT || ""));
  if (mH) declared = mH[1].toLowerCase();
  if (!declared) {
    const head = dec("latin1") || "";
    const mM = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head.slice(0, 2e3));
    if (mM) declared = mM[1].toLowerCase();
  }
  const norm2 = (c) => c === "ms949" || c === "cp949" || c === "ksc5601" ? "euc-kr" : c;
  const cands = [];
  if (declared) {
    const t = dec(norm2(declared));
    if (t) cands.push(t);
  }
  const u = dec("utf-8"), e = dec("euc-kr");
  if (u) cands.push(u);
  if (e) cands.push(e);
  return cands.sort((a, b) => score2(b) - score2(a))[0] || "";
}
var strip3 = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
var themestocks_default = async (req2) => {
  const url = new URL(req2.url);
  const type = url.searchParams.get("type") === "upjong" ? "upjong" : "theme";
  const no = String(url.searchParams.get("no") || "").replace(/[^0-9]/g, "");
  if (!no) return new Response(
    JSON.stringify({ ok: false, items: [], error: "no required" }),
    { headers: { "content-type": "application/json" } }
  );
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 7e3);
    let html = "";
    try {
      const r = await fetch(
        `https://finance.naver.com/sise/sise_group_detail.naver?type=${type}&no=${no}`,
        { headers: { "User-Agent": UA30, "Referer": "https://finance.naver.com/sise/theme.naver" }, signal: c.signal }
      );
      html = decodeSmart15(await r.arrayBuffer(), r.headers.get("content-type"));
    } finally {
      clearTimeout(t);
    }
    let title = "";
    const mt = /<title>([^<]+)<\/title>/i.exec(html);
    if (mt) title = strip3(mt[1]).replace(/\s*:.*$/, "").replace(/\s*네이버.*$/, "");
    const mh = /class="type_1[^"]*"[\s\S]{0,400}?<h[34][^>]*>([^<]+)</i.exec(html);
    if (mh) title = strip3(mh[1]) || title;
    const items = [], seen = /* @__PURE__ */ new Set();
    const re = /\/item\/main\.naver\?code=([0-9A-Z]{6})"[^>]*>([^<]{1,40})</g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const code = m[1].toUpperCase(), name = strip3(m[2]);
      if (!name || seen.has(code)) continue;
      seen.add(code);
      items.push({ code, name });
      if (items.length >= 200) break;
    }
    return new Response(JSON.stringify({ ok: items.length > 0, type, no, title, n: items.length, items }), {
      headers: { "content-type": "application/json", "cache-control": "s-maxage=300" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, type, no, items: [], error: String(e).slice(0, 120) }), {
      headers: { "content-type": "application/json" }
    });
  }
};

// netlify/functions/version.js
init_store();

// data/version-info.js
var BUNDLED_VERSION = {
  version: "4.24.0",
  releasedAt: "2026-08-06 21:40",
  notes: [
    "NXT \uc2dc\uc7a5\uacbd\ubcf4 \uc624\ubc84\ub808\uc774 \ucd94\uac00 \u2014 \ud22c\uc790\uacbd\uace0\u00b7\uc704\ud5d8\u00b7\uac70\ub798\uc815\uc9c0\u00b7\uad00\ub9ac\uc885\ubaa9\uc740 NXT \uc8fc\ubb38\uc774 \uc989\uc2dc \uc7a0\uae30\uace0 \uc0ac\uc720\uac00 \ud45c\uc2dc\ub429\ub2c8\ub2e4",
    "\uc885\ubaa9 \ub85c\uace0 \uc5c6\uc74c 0\uac74 \ub2ec\uc131 \u2014 HS\ud6a8\uc131 \uacc4\uc5f4 \ub9e4\ud551\uc744 \ucd94\uac00\ud588\uc2b5\ub2c8\ub2e4",
    "\uacf5\ubaa8\uc8fc \uc77c\uc815 \uc218\uc9d1 \ubcf5\uad6c \u2014 https \uc804\ud658\u00b7\ub2e4\uc911 \uc8fc\uc18c\u00b7\ub9c8\uc9c0\ub9c9 \uc131\uacf5\ubcf8 \ubcf4\uad00\uc73c\ub85c \uc608\uc2dc \uc77c\uc815 \ub300\uccb4\ub97c \uc5c6\uc574\uc2b5\ub2c8\ub2e4",
    "\ucf54\uc2a4\ud53c200 \uc57c\uac04\uc120\ubb3c \uce74\ub4dc \uc815\uc0c1\ud654 \u2014 \uc57c\uac04 \uc2dc\uc138\uac00 \uc5c6\uc73c\uba74 \uc8fc\uac04 \ub9c8\uac10 \uae30\uc900\uc73c\ub85c \uc815\uc9c1\ud558\uac8c \ud45c\uc2dc\ud569\ub2c8\ub2e4",
    "\ud1a0\uc2a4\ud2b8\uac00 \uc8fc\ubb38\ucc3d \uc704\ub85c \u2014 \uac70\ub798\uc720\ud615 \ucc3d\uc774 \uc5f4\ub824 \uc788\uc5b4\ub3c4 \uc54c\ub9bc\uc774 \uac00\ub824\uc9c0\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4",
    "ETF\u00b7\uc885\ubaa9 \ub85c\uace0 \ud1b5\uc77c \u2014 \ubaa8\ub450 \ub465\uadfc \uc0ac\uac01\ud615\uc73c\ub85c \ubaa8\uc591\uc744 \ub9de\ucd94\uace0 \ud06c\uae30\ub97c \ud0a4\uc6cc \uae00\uc790\uac00 \uc798 \ubcf4\uc785\ub2c8\ub2e4"
  ]
};

// netlify/functions/version.js
var ENV5 = null;
async function vStore() {
  try {
    return await getStoreX({ name: "app-meta" }, ENV5);
  } catch {
    return null;
  }
}
var json11 = (o, status = 200, cc = "no-store") => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cc } });
function cmpVer(a, b) {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}
var version_default = async (req2) => {
  const store = await vStore();
  if (req2.method === "POST") {
    const tok = envGet("NXT_ADMIN_TOKEN");
    const auth = req2.headers.get("authorization") || "";
    if (!tok) return json11({ ok: false, err: "NXT_ADMIN_TOKEN \uD658\uACBD\uBCC0\uC218\uAC00 \uC11C\uBC84\uC5D0 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. Netlify > Site settings > Environment variables \uC5D0\uC11C \uCD94\uAC00\uD558\uC138\uC694." }, 500);
    if (auth !== "Bearer " + tok) return json11({ ok: false, err: "\uAD00\uB9AC\uC790 \uD1A0\uD070\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." }, 401);
    let body;
    try {
      body = await req2.json();
    } catch {
      return json11({ ok: false, err: "badbody" }, 400);
    }
    const version = String(body.version || "").trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) return json11({ ok: false, err: "\uBC84\uC804\uC740 1.91.0 \uD615\uC2DD(semver)\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4." }, 400);
    const notes = Array.isArray(body.notes) ? body.notes.map((s) => String(s).trim()).filter(Boolean).slice(0, 20) : [];
    if (!notes.length) return json11({ ok: false, err: "\uC5C5\uB370\uC774\uD2B8 \uB0B4\uC6A9\uC744 1\uC904 \uC774\uC0C1 \uC785\uB825\uD558\uC138\uC694." }, 400);
    const rec2 = { version, notes, releasedAt: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), savedAt: Date.now() };
    if (!store) return json11({ ok: false, err: "Blobs \uC800\uC7A5\uC18C\uB97C \uC5F4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, 500);
    await store.setJSON("app:version", rec2);
    return json11({ ok: true, saved: rec2 });
  }
  let rec = null;
  if (store) {
    try {
      rec = await store.get("app:version", { type: "json" });
    } catch {
      rec = null;
    }
  }
  if (!rec || cmpVer(BUNDLED_VERSION.version, rec.version) > 0) rec = { ...BUNDLED_VERSION, src: "bundled" };
  else rec = { ...rec, src: "blob" };
  return json11({ ok: true, ...rec });
};

// functions/api/[[route]].js
var ROUTES = {
  "accounts": accounts_default,
  "calendar": calendar_default,
  "chart": chart_default,
  "clan": clan_default,
  "cronstep": cronstep_default,
  "etf": etf_default,
  "etfaudit": etfaudit_default,
  "etflist": etflist_default,
  "etfprobe": etfprobe_default,
  "exchange": exchange_default,
  "friends": friends_default,
  "fundamentals": fundamentals_default,
  "fx": fx_default,
  "homepage": homepage_default,
  "investors": investors_default,
  "ipo": ipo_default,
  "logo": logo_default,
  "logoscan": logoscan_default,
  "market": market_default,
  "askprice": askprice_default,   /* [v9.81] 호가 */
  "srt": srt_default,             /* [v9.84] 공매도 잔고 */
  "coupon": coupon_default,       /* [v11.0] 이용권 쿠폰 */
  "push": push_default,          /* [v9.76] 웹 푸시 */
  "meta": meta_default,
  "news": news_default,
  "nxt": nxt_default,
  "nxtadmin": nxtadmin_default,
  "nxtcheck": nxtcheck_default,
  "nxthistory": nxthistory_default,
  "nxtlist": nxtlist_default,
  "nxtquote": nxtquote_default,
  "nxtrefresh": nxtrefresh_default,
  "picks": picks_default,
  "popular": popular_default,
  "quote": quote_default,
  "search": search_default,
  "stockaudit": stockaudit_default,
  "stocklist": stocklist_default,
  "themes": themes_default,
  "themestocks": themestocks_default,
  "version": version_default
};

/* ══ [v4.8] KRX 시장경보 → NXT 일시제외 오버레이 ═══════════════════════════
   [무엇이 문제였나]
   NXT 취급 여부는 넥스트레이드 공식 명단(분기 정기변경)만 봤다. 그런데 규정상
   ① 투자경고·투자위험 지정 ② KRX 거래정지 ③ 관리종목 지정 종목은
   명단과 무관하게 '즉시' NXT 체결 대상에서 정지/제외된다(사유 해소 시 복귀).
   삼현처럼 장중에 경고 지정된 종목이 앱에서는 계속 NXT 가능으로 보였다.
   [해결] 네이버 금융의 시장경보·거래정지·관리종목 목록을 10분 캐시로 수집해
   코드→사유 지도를 내려 준다. 클라이언트는 이 지도로 NXT 창구를 잠근다.
   (주의 caution 은 NXT 제외 사유가 아니므로 참고용으로만 별도 반환) */
async function krxalerts_default(req2, context) {
  const KV = context && context.env && context.env.APP_KV;
  const now = Date.now();
  const force = /[?&]refresh=1/.test(req2.url || "");
  try { if (KV && !force) { const c = await KV.get("krx:alerts", "json");
    if (c && c.at && now - c.at < 10 * 60 * 1000)
      return new Response(JSON.stringify({ ok: true, cached: true, ...c }), { headers: { "content-type": "application/json", "cache-control": "s-maxage=120" } });
  } } catch {}
  init_euckr();
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
  const dec = (buf, ct) => { try { if (/utf-8/i.test(String(ct || ""))) { const t = new TextDecoder("utf-8").decode(buf); if ((t.match(/[가-힣]/g) || []).length > 3) return t; } } catch {} return decodeEucKr(buf); };
  const pull = async (url) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
    try { const r = await fetch(url, { headers: { "User-Agent": UA, "Referer": "https://finance.naver.com/", "Accept-Language": "ko" }, signal: c.signal });
      if (!r.ok) return ""; return dec(await r.arrayBuffer(), r.headers.get("content-type"));
    } catch { return ""; } finally { clearTimeout(t); } };
  const codesOf = (html) => { const set2 = new Set(); const re = /code=(\d{6})/g; let m; while ((m = re.exec(html || ""))) set2.add(m[1]); return [...set2]; };
  const many = async (base3, pages) => { const out = []; for (let i = 1; i <= pages; i++) { const h = await pull(base3 + (base3.includes("?") ? "&" : "?") + "page=" + i); if (!h) break; const cs = codesOf(h); out.push(h); if (cs.length < 5 && i > 1) break; } return out.join("\n"); };
  const [wH, rH, hH, mH, cH] = await Promise.all([
    many("https://finance.naver.com/sise/investment_alert.naver?type=warning", 3),
    many("https://finance.naver.com/sise/investment_alert.naver?type=risk", 2),
    many("https://finance.naver.com/sise/trading_halt.naver", 2),
    many("https://finance.naver.com/sise/management.naver", 4),
    many("https://finance.naver.com/sise/investment_alert.naver?type=caution", 5)
  ]);
  const map = {};
  for (const c of codesOf(mH)) map[c] = "mgmt";
  for (const c of codesOf(wH)) map[c] = "warn";
  for (const c of codesOf(rH)) map[c] = "risk";
  for (const c of codesOf(hH)) map[c] = "halt";
  const body = { at: now, n: Object.keys(map).length, map, caution: codesOf(cH) };
  const gotAny = !!(wH || rH || hH || mH);
  if (gotAny) {
    try { if (KV) await KV.put("krx:alerts", JSON.stringify(body)); } catch {}
    return new Response(JSON.stringify({ ok: true, ...body }), { headers: { "content-type": "application/json", "cache-control": "s-maxage=120" } });
  }
  try { if (KV) { const c = await KV.get("krx:alerts", "json");
    if (c) return new Response(JSON.stringify({ ok: true, stale: true, ...c }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } } catch {}
  return new Response(JSON.stringify({ ok: false, ...body }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
ROUTES["krxalerts"] = krxalerts_default;

// [v4.9] 종목 심화 플래그 — 증거금률·페이지 표기 배지(지정예고·단기과열·정리매매 등)
async function stockflags_default(req2, context) {
  const KV = context && context.env && context.env.APP_KV;
  const url = new URL(req2.url);
  const code = String(url.searchParams.get("code") || "").trim();
  if (!/^\d{6}$/.test(code)) return new Response(JSON.stringify({ ok: false, err: "code" }), { headers: { "content-type": "application/json" } });
  const kvKey = "sflag:" + code, now = Date.now();
  try { if (KV) { const c = await KV.get(kvKey, "json");
    /* [v4.11] 배지·증거금을 하나도 못 얻은 '약한 결과'는 30분만 캐시 —
       예전엔 파싱 실패가 6시간 굳어 경고예고 종목이 계속 빈 칩으로 남았다. */
    /* [v4.26] 배지가 있는 결과도 오래 굳히지 않는다 — 지정예고는 하루 만에 소멸할 수 있다 */
    const _ttl = (c && (c.badges && c.badges.length)) ? 30 * 60 * 1000
               : (c && c.margin != null) ? 3 * 3600 * 1000 : 30 * 60 * 1000;
    if (c && c.at && now - c.at < _ttl)
      return new Response(JSON.stringify({ ok: true, cached: true, ...c }), { headers: { "content-type": "application/json", "cache-control": "s-maxage=600" } });
  } } catch {}
  init_euckr();
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
  let margin = null; const badges = [];
  /* 1차: 네이버 종목 페이지(EUC-KR) — 제목 옆 경보 아이콘 alt 와 증거금률 표기 */
  try {
    const c2 = new AbortController(); const t = setTimeout(() => c2.abort(), 6000);
    const r = await fetch("https://finance.naver.com/item/main.naver?code=" + code,
      { headers: { "User-Agent": UA, "Referer": "https://finance.naver.com/" }, signal: c2.signal });
    clearTimeout(t);
    if (r.ok) {
      /* [v4.12] 예전엔 EUC-KR 로 단정 디코딩했다. 네이버가 UTF-8 로 주면 한글이
         전부 깨져 어떤 용어도 매칭되지 않는다(무증상 실패). content-type 을 보고 고른다. */
      const html = decodeSmart2(await r.arrayBuffer(), r.headers.get("content-type"));
      const mm = html.match(/\uC99D\uAC70\uAE08\uB960[\s\S]{0,200}?(\d{2,3})\s*%/);
      if (mm) margin = +mm[1];
      /* 배지는 종목명 블록 근처(wrap_company)만 본다 — 하단 도움말 범례의 전체 나열을 오탐하지 않기 위해 */
      /* ══ [v4.11] 배지 파서 교체 ═══════════════════════════════════════════
         [원인] 예전 정규식은 alt="투자경고지정예고" 처럼 공백 없는 정확 일치만
         잡았는데, 네이버는 "투자경고 지정예고"처럼 띄어쓰기·태그 분절로 렌더링해
         경고예고·단기과열 배지가 한 건도 안 잡혔다(첨부: 로보티즈·티엑스알 누락).
         [해결] 종목명 블록 주변을 통째로 공백 제거한 평문으로 만들고,
         긴 용어부터 검사한 뒤 지워 나간다 — 마크업이 어떻게 바뀌어도 견딘다. */
      const wi = html.indexOf("wrap_company");
      const flat = (wi >= 0 ? html.slice(wi, wi + 9000) : html.slice(0, 9000)).replace(/\s+/g, "");
      const TERMS = ["\uD22C\uC790\uACBD\uACE0\uC9C0\uC815\uC608\uACE0","\uD22C\uC790\uC704\uD5D8\uC608\uACE0","\uB2E8\uAE30\uACFC\uC5F4\uC9C0\uC815\uC608\uACE0","\uD22C\uC790\uC8FC\uC758\uD658\uAE30\uC885\uBAA9","\uBD88\uC131\uC2E4\uACF5\uC2DC\uBC95\uC778","\uC815\uB9AC\uB9E4\uB9E4","\uB2E8\uAE30\uACFC\uC5F4","\uD22C\uC790\uACBD\uACE0","\uD22C\uC790\uC704\uD5D8","\uD22C\uC790\uC8FC\uC758","\uAD00\uB9AC\uC885\uBAA9","\uAC70\uB798\uC815\uC9C0"];
      let rest = flat;
      for (const t of TERMS) { if (rest.includes(t)) { badges.push(t); rest = rest.split(t).join("\u00A7"); } }
    }
  } catch {}
  /* ══ [v4.12 · 진짜 원인] 지정예고는 네이버 종목 페이지에 아예 없다 ══════════
     네이버 종목 페이지가 아이콘으로 보여 주는 건 '실제 지정'(관리·주의·경고·위험·정지)뿐이고,
     미래에셋이 표시하는 '경고예'(투자경고 지정예고)는 거래소 시장경보 공시로만 나온다.
     그래서 파서를 아무리 고쳐도 로보티즈·티엑스알에 배지가 붙을 수 없었다.
     → 종목 공시 목록(news_notice)에서 시장경보 공시를 읽어 카테고리별 최신 상태를 만든다.
       지정예고 → 지정 → 해제 순서로 덮어써서 '지금 상태'만 남긴다. */
  const noticeDiag = [];
  try {
    const c4 = new AbortController(); const t4 = setTimeout(() => c4.abort(), 6000);
    /* [v4.20] 1페이지만 읽으면 '지정예고' 뒤에 온 '지정'·'해제' 공시를 놓쳐
       철 지난 예고가 계속 배지로 남는다(삼현 사례). 2페이지까지 읽어 최신 상태를 만든다. */
    const pages = await Promise.all([1, 2].map(async (pg) => {
      try {
        const rr = await fetch("https://finance.naver.com/item/news_notice.naver?code=" + code + "&page=" + pg,
          { headers: { "User-Agent": UA, "Referer": "https://finance.naver.com/item/main.naver?code=" + code }, signal: c4.signal });
        if (!rr.ok) return "";
        return decodeSmart2(await rr.arrayBuffer(), rr.headers.get("content-type"));
      } catch (e) { return ""; }
    }));
    clearTimeout(t4);
    const rn = { ok: pages.some((x) => x) };
    if (rn.ok) {
      const nh = pages.join("\n");
      /* 행 단위로 제목+날짜를 뽑아 최신순 정렬 */
      const rows = [];
      for (const tr of (nh.match(/<tr[\s\S]*?<\/tr>/gi) || [])) {
        const dm = tr.match(/(20\d{2})[.\-\/](\d{2})[.\-\/](\d{2})/);
        const title = stripTags(tr).replace(/\s+/g, " ").trim();
        if (!title) continue;
        rows.push({ d: dm ? dm[1] + dm[2] + dm[3] : "", t: title.replace(/\s+/g, "") });
      }
      rows.sort((a2, b2) => (a2.d < b2.d ? -1 : a2.d > b2.d ? 1 : 0));   // 오래된 → 최신
      const CATS = [["\uD22C\uC790\uC704\uD5D8", "\uD22C\uC790\uC704\uD5D8"], ["\uD22C\uC790\uACBD\uACE0", "\uD22C\uC790\uACBD\uACE0"], ["\uB2E8\uAE30\uACFC\uC5F4", "\uB2E8\uAE30\uACFC\uC5F4"], ["\uD22C\uC790\uC8FC\uC758", "\uD22C\uC790\uC8FC\uC758"]];
      /* ══ [v4.26 · 진짜 원인] 지정예고는 '해제 공시'가 나오지 않는다 ══════════
         거래소의 투자경고종목 지정예고는 다음 매매일에 요건을 다시 판정해
         충족하면 '지정', 미충족이면 **아무 공시 없이 그대로 소멸**한다.
         그런데 우리 상태기계는 '해제' 문구를 찾아야만 배지를 지웠다.
         그래서 한 번 예고가 뜬 종목은 예고가 사라진 뒤에도 영원히 '경고예'가 붙어 있었다
         (첨부: 로보티즈·티엑스알로보틱스).
         → 예고에는 공시일을 함께 기록하고, 일정 기간이 지나면 스스로 만료시킨다.
           지정예고의 효력은 통상 1매매일이므로, 휴장·연휴를 감안해 넉넉히 5일로 잡는다.
           그 사이에 같은 등급의 '지정'이나 '해제'가 오면 당연히 그쪽이 우선한다. */
      const state = {}, when = {};
      for (const row of rows) {
        for (const [key, label] of CATS) {
          if (row.t.indexOf(key) < 0) continue;
          if (/\uD574\uC81C/.test(row.t)) { state[key] = null; when[key] = row.d; }
          else if (/\uC9C0\uC815\uC608\uACE0/.test(row.t)) { state[key] = label + "\uC9C0\uC815\uC608\uACE0"; when[key] = row.d; }
          else if (/\uC9C0\uC815/.test(row.t)) { state[key] = label; when[key] = row.d; }
        }
      }
      const PRE_TTL_DAYS = 5;
      const todayKst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
      const daysBetween = (a2, b2) => {
        if (!/^\d{8}$/.test(a2) || !/^\d{8}$/.test(b2)) return 0;
        const D = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
        return Math.round((D(b2) - D(a2)) / 86400000);
      };
      for (const k of Object.keys(state)) {
        const v = state[k];
        if (!v || !/\uC9C0\uC815\uC608\uACE0$/.test(v)) continue;
        const age = daysBetween(when[k] || "", todayKst);
        if (!when[k] || age > PRE_TTL_DAYS) {
          state[k] = null;                                   // 철 지난 예고는 소멸한 것으로 본다
          noticeDiag.push("expire:" + v + "@" + (when[k] || "?") + "(" + age + "d)");
        }
      }
      /* [v4.20] 사다리 정리 — 상위 등급이 지정되면 하위 등급(및 그 예고)은 흡수된다.
         클라이언트에서도 한 번 더 거르지만, 원천에서 깨끗하게 내보내는 편이 낫다. */
      const TIER = { "\uD22C\uC790\uC8FC\uC758": 1, "\uD22C\uC790\uACBD\uACE0": 2, "\uD22C\uC790\uC704\uD5D8": 3 };
      let topTier = 0;
      for (const k of Object.keys(state)) {
        const v = state[k];
        if (v && TIER[v]) topTier = Math.max(topTier, TIER[v]);
      }
      for (const k of Object.keys(state)) {
        const v = state[k]; if (!v) continue;
        const base = v.replace(/\uC9C0\uC815\uC608\uACE0$/, "");
        const t = TIER[base] || 0;
        if (t && t < topTier) continue;                        // 하위 등급은 버린다
        if (t && t === topTier && v !== base && TIER[v] !== topTier) continue;   // 같은 등급의 철 지난 예고
        if (!badges.includes(v)) badges.push(v);
      }
      noticeDiag.push("rows:" + rows.length, "today:" + todayKst, "state:" + JSON.stringify(state), "when:" + JSON.stringify(when));
    } else noticeDiag.push("http:" + rn.status);
  } catch (e) { noticeDiag.push("err:" + String(e).slice(0, 30)); }

  /* 2차(증거금 폴백): 다음 금융 JSON — 키 이름에 margin 이 들어간 수치 탐색 */
  if (margin == null) {
    try {
      const c3 = new AbortController(); const t3 = setTimeout(() => c3.abort(), 5000);
      const r3 = await fetch("https://finance.daum.net/api/quotes/A" + code,
        { headers: { "User-Agent": UA, "Referer": "https://finance.daum.net/quotes/A" + code, "Accept": "application/json" }, signal: c3.signal });
      clearTimeout(t3);
      if (r3.ok) { const j3 = await r3.json();
        for (const k of Object.keys(j3 || {})) if (/margin/i.test(k) && typeof j3[k] === "number" && j3[k] >= 20 && j3[k] <= 100) { margin = j3[k]; break; }
      }
    } catch {}
  }
  const body = { at: now, margin, badges, diag: noticeDiag };
  const got = margin != null || badges.length > 0;
  try { if (KV && got) await KV.put(kvKey, JSON.stringify(body), { expirationTtl: 86400 }); } catch {}
  if (!got) { try { if (KV) { const c = await KV.get(kvKey, "json");
    if (c) return new Response(JSON.stringify({ ok: true, stale: true, ...c }), { headers: { "content-type": "application/json" } });
  } } catch {} }
  return new Response(JSON.stringify({ ok: true, ...body }), { headers: { "content-type": "application/json", "cache-control": "s-maxage=600" } });
}
ROUTES["stockflags"] = stockflags_default;
/* [v4.13] 야간선물 소스 진단 — /api/nightdiag 를 열면 각 후보가 무엇을 돌려줬는지 그대로 보여 준다.
   샌드박스에서 원천에 접속할 수 없어 추측으로 고치는 일을 끝내기 위한 창구다. */
async function nightdiag_default() {
  const out = { at: new Date().toISOString(), tried: [] };
  const kD = new Date(Date.now() + 9 * 3600e3);
  if (kD.getUTCHours() >= 18) kD.setUTCDate(kD.getUTCDate() + 1);
  const ymd = kD.toISOString().slice(0, 10).replace(/-/g, "");
  out.kstNow = new Date(Date.now() + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 19);
  out.krxQueryDate = ymd;
  const probe = async (label, url, opt) => {
    const rec = { label, url };
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
      const r = await fetch(url, Object.assign({ headers: { "User-Agent": UA20, "Accept-Language": "ko" }, signal: c.signal }, opt || {}));
      clearTimeout(t);
      rec.status = r.status;
      const txt = await r.text();
      rec.len = txt.length;
      const i = txt.search(/\uC57C\uAC04|night|NIGHT/);
      rec.hasNightLabel = i >= 0;
      if (i >= 0) rec.sample = txt.slice(Math.max(0, i - 160), i + 360).replace(/\s+/g, " ");
      rec.numbers = [...txt.matchAll(/([0-9]{3,4}\.[0-9]{2})/g)].map((m) => m[1]).slice(0, 14);
    } catch (e) { rec.err = String(e).slice(0, 60); }
    out.tried.push(rec);
  };
  await probe("krx-json", "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd", {
    method: "POST",
    headers: { "User-Agent": UA20, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "Referer": "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd", "X-Requested-With": "XMLHttpRequest" },
    body: "bld=dbms/MDC/STAT/standard/MDCSTAT12501&locale=ko_KR&trdDd=" + ymd + "&prodId=KRDRVFUK2I&mktTpCd=N"
  });
  await probe("naver-sise", "https://finance.naver.com/sise/");
  await probe("naver-fut", "https://finance.naver.com/sise/sise_index.naver?code=FUT");
  await probe("mstock-fut", "https://m.stock.naver.com/api/index/FUT/basic");
  await probe("mstock-cat", "https://m.stock.naver.com/api/index/category/FUT");
  await probe("hankyung", "https://markets.hankyung.com/indices/kospi-future");
  await probe("daum-fut", "https://finance.daum.net/api/quotes/futures");
  return new Response(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
ROUTES["nightdiag"] = nightdiag_default;
/* ══ [v4.28] 해외(미국) 주식 — 시세·차트·진단 ═══════════════════════════════
   코드 표기는 네이버 로이터형("AAPL.O" 나스닥 / ".N" NYSE / ".A" AMEX).
   샌드박스에서 원천 검증이 불가하므로(403) /api/usdiag 로 실서버에서 확인한다. */
function usNum(v){ if(v==null)return null; const n=Number(String(v).replace(/[",\s]/g,"")); return isFinite(n)?n:null; }
function usPickQuote(txt){
  /* polling·basic 응답 어느 쪽이든 관대하게 뽑는다 */
  let j=null; try{ j=JSON.parse(txt); }catch(e){ return null; }
  const d=(j&&j.datas&&j.datas[0])||(j&&j.result&&j.result.datas&&j.result.datas[0])||j;
  if(!d||typeof d!=="object")return null;
  const close=usNum(d.closePrice!=null?d.closePrice:d.close);
  if(close==null)return null;
  const comp=usNum(d.compareToPreviousClosePrice!=null?d.compareToPreviousClosePrice:d.compareToPreviousPrice);
  const rate=usNum(d.fluctuationsRatio);
  let prev=null;
  if(comp!=null)prev=+(close-comp).toFixed(4);
  else if(rate!=null&&rate!==-100)prev=+(close/(1+rate/100)).toFixed(4);
  const out={price:close,prev,open:usNum(d.openPrice),high:usNum(d.highPrice),low:usNum(d.lowPrice),
    vol:usNum(d.accumulatedTradingVolume!=null?d.accumulatedTradingVolume:d.accumulatedTradingVol),
    cap:usNum(d.marketValue),name:d.stockName||d.name||"",
    /* ══ [v5.4] 이미 받아 온 응답에서 더 뽑는다 ═══════════════════════════════
       컨센서스·재무가 '—' 로 비던 종목이 많았다. 그런데 시세 응답에는
       PER·EPS·배당·52주 같은 값이 함께 들어 있는데도 쓰지 않고 버리고 있었다.
       추가 호출 없이 화면을 채울 수 있는 것부터 챙긴다. */
    per:usNum(d.perValue!=null?d.perValue:d.pe),
    eps:usNum(d.epsValue!=null?d.epsValue:d.eps),
    div:usNum(d.dividendYield!=null?d.dividendYield:d.dividend),
    bps:usNum(d.bps),
    beta:usNum(d.beta)};
  /* basic 형 확장정보에서 52주·시총 보강 */
  const infos=(j&&j.stockItemTotalInfos)||(d&&d.stockItemTotalInfos);
  if(Array.isArray(infos))for(const it of infos){
    const k=String(it.code||it.key||"")+String(it.name||"");
    const v=usNum(it.value);
    if(v==null)continue;
    if(/52.*(고|high)/i.test(k))out.w52h=v;
    else if(/52.*(저|low)/i.test(k))out.w52l=v;
    else if(/marketValue|시가총액/i.test(k))out.cap=out.cap!=null?out.cap:v;
  }
  return out;
}
var USQ_MEM=/* @__PURE__ */ new Map();
/* ══ [v4.42] 야후·Stooq 파서 — 네이버 해외 경로가 막혀도 시세·차트가 비지 않게 ══ */
function yahooParse(txt){
  let j=null; try{ j=JSON.parse(txt); }catch(e){ return null; }
  const r=j&&j.chart&&j.chart.result&&j.chart.result[0];
  if(!r||!r.meta)return null;
  const m=r.meta;
  /* ══ [v4.50] 전일 종가 우선순위 수정 — 등락률이 통째로 틀어지던 회귀 ═══════════
     v4.48 에서 시세용 요청을 range=2y → 5d 로 줄였다(속도·용량). 그런데 이 파서는
     chartPreviousClose 를 1순위로 썼다. 이 값은 '요청한 구간이 시작되기 직전의 종가'
     라서, 2y 일 때는 사실상 무의미했지만 5d 로 줄이자 '엿새 전 종가'가 되어 버린다.
     → 어제 대비 등락률 자리에 '엿새 전 대비' 가 찍힌다. 화면은 멀쩡해 보이는데
     숫자만 조용히 틀리는, 가장 나쁜 종류의 버그였다.
     regularMarketPreviousClose(진짜 전일 종가) → previousClose → 캔들 → chart 순으로 바로잡는다. */
  const q={ price:usNum(m.regularMarketPrice),
    prev:usNum(m.regularMarketPreviousClose!=null?m.regularMarketPreviousClose:m.previousClose),
    open:usNum(m.regularMarketOpen), high:usNum(m.regularMarketDayHigh), low:usNum(m.regularMarketDayLow),
    vol:usNum(m.regularMarketVolume), w52h:usNum(m.fiftyTwoWeekHigh), w52l:usNum(m.fiftyTwoWeekLow),
    name:m.shortName||m.symbol||"" };
  const ts=r.timestamp||[], qd=(r.indicators&&r.indicators.quote&&r.indicators.quote[0])||{};
  const cs=[];
  for(let i2=0;i2<ts.length;i2++){
    const c=usNum(qd.close&&qd.close[i2]); if(c==null)continue;
    const d=new Date(ts[i2]*1000);
    const t=+(d.getUTCFullYear()+String(d.getUTCMonth()+1).padStart(2,"0")+String(d.getUTCDate()).padStart(2,"0"));
    cs.push({t,o:usNum(qd.open&&qd.open[i2])||c,h:usNum(qd.high&&qd.high[i2])||c,
             l:usNum(qd.low&&qd.low[i2])||c,c,v:usNum(qd.volume&&qd.volume[i2])||0});
  }
  if(q.price==null&&cs.length)q.price=cs[cs.length-1].c;
  if(q.open==null&&cs.length)q.open=cs[cs.length-1].o;
  if(q.high==null&&cs.length)q.high=cs[cs.length-1].h;
  if(q.low==null&&cs.length)q.low=cs[cs.length-1].l;
  if(q.prev==null&&cs.length>1)q.prev=cs[cs.length-2].c;
  if(q.prev==null)q.prev=usNum(m.chartPreviousClose);          // 여기까지 왔을 때만 쓴다
  /* 전일 종가가 현재가와 40% 넘게 벌어지면 구간 경계값을 잘못 집은 것이다 — 캔들로 교정 */
  if(q.prev!=null&&q.price!=null&&q.prev>0&&Math.abs(q.price-q.prev)/q.prev>0.4&&cs.length>1)
    q.prev=cs[cs.length-2].c;
  if(q.price==null)return null;
  return { q, candles:cs.length?cs:null };
}
/* ══ [v4.43] 원천마다 클래스주 표기법이 다르다 ═══════════════════════════
   버크셔 B주는 네이버 로이터코드로 "BRK/B.N" 인데, 야후는 "BRK-B", Stooq 는
   "brk-b.us" 를 쓴다. 그대로 잘라 보내면 "BRK/B" 가 되어 이 종목만 영구 실패한다. */
function usSym(reu){ return String(reu||"").split(".")[0].replace(/\//g,"-"); }
function stooqParse(txt){
  const lines=String(txt||"").trim().split(/\r?\n/);
  if(lines.length<2)return null;
  const p=lines[1].split(",");
  if(p.length<8)return null;
  const c=usNum(p[6]); if(c==null)return null;
  return { price:c, open:usNum(p[3]), high:usNum(p[4]), low:usNum(p[5]), vol:usNum(p[7]), prev:null };
}
/* ══ [v4.48] 시세 원천 전면 교체 — '$—' 의 진짜 원인 ═══════════════════════
   [무엇이 죽었나] 워커(클라우드플레어)의 나가는 IP 는 수천 앱이 공유한다.
     · 야후: IP 단위 요청 제한 → 상시 429 "Edge: Too Many Requests"
     · 네이버: 데이터센터 IP 차단 → 403 (샌드박스에서 봤던 403 과 같은 계열)
     · Stooq: IP 하루 호출 한도 → 공유 IP 는 이미 소진, CSV 대신 안내문이 온다
   1·2·3순위가 '동시에' 죽어 해외 화면 전체가 $— · '불러오는 중…' 으로 남았다.
   [해법] 데이터센터 IP 에도 열려 있는 두 원천을 앞에 세운다.
     · CNBC restQuote — 한 번에 여러 종목(배치) + 52주 고저·시가총액까지 준다.
       외부 호출 1회로 18종목이 끝나 서브리퀘스트 한도(★11) 걱정도 사라진다.
     · Cboe 지연시세(cdn.cboe.com) — 봇에 관대한 공개 CDN. 배치 누락분 보충.
   야후·Stooq·네이버는 '되는 날의 보너스' 로 뒤에 남긴다(자가 호스팅 대비). */
function usSuffixNum(v){                 /* "3.19T"·"52,164,057" → 숫자 */
  if(v==null)return null;
  const m=String(v).trim().replace(/[\s,$%]/g,"").match(/^([-+]?\d+(?:\.\d+)?)([TBMK])?$/i);
  if(!m)return usNum(v);
  const n=Number(m[1]); if(!isFinite(n))return null;
  return n*({T:1e12,B:1e9,M:1e6,K:1e3}[(m[2]||"").toUpperCase()]||1);
}
function usSymDot(reu){ return usSym(reu).replace(/-/g,"."); }   /* BRK-B → BRK.B (CNBC·Cboe 표기) */
/* ══ [v9.71] 시가총액 단위 정규화 — 원천 표기가 제각각이라 검산이 필요하다 ══
   접미사가 있으면 이미 절대 달러, 없으면 백만 달러 표기로 본다.
   어느 쪽으로 읽어도 발행주식수가 말이 안 되면 값을 버린다(거짓 숫자 금지). */
function capNorm(raw, price){
  if(raw==null||raw==="")return null;
  const txt=String(raw).trim().replace(/[\s,$%]/g,"");
  const hadSuffix=/[TBMK]$/i.test(txt);
  let cap=usSuffixNum(raw);
  if(cap==null||!(cap>0))return null;
  if(!hadSuffix&&cap<1e8)cap=cap*1e6;          /* 접미사 없는 작은 수 = 백만 달러 표기 */
  const shOk=(n)=>n>=1e4&&n<=5e11;             /* 발행주식수 상식 범위 */
  if(price>0){
    if(!shOk(cap/price)){
      /* 읽는 방식을 뒤집어 한 번 더 — 그래도 안 맞으면 표시하지 않는다 */
      const alt=hadSuffix?cap*1e6:cap/1e6;
      if(shOk(alt/price))cap=alt; else return null;
    }
  }
  return cap>0?cap:null;
}
function cnbcParse(txt){
  let j=null; try{ j=JSON.parse(txt); }catch(e){ return null; }
  let arr=(j&&j.FormattedQuoteResult&&j.FormattedQuoteResult.FormattedQuote)
        ||(j&&j.QuickQuoteResult&&j.QuickQuoteResult.QuickQuote)||null;
  if(arr&&!Array.isArray(arr))arr=[arr];
  if(!Array.isArray(arr)||!arr.length)return null;
  const out={};
  for(const d of arr){
    if(!d||typeof d!=="object")continue;
    const pk=(...ks)=>{ for(const k of ks){ if(d[k]!=null&&d[k]!==""){ const n=usSuffixNum(d[k]); if(n!=null)return n; } } return null; };
    const pkRaw=(...ks)=>{ for(const k of ks){ if(d[k]!=null&&d[k]!=="")return d[k]; } return null; };   /* [v9.71] 원문 그대로 — 접미사 유무를 봐야 한다 */
    const regLast=pk("last","last_price","price");
    let price=regLast;
    /* 프리·애프터 시간에는 확장거래 체결가가 따로 온다 — 있으면 그걸 현재가로 */
    const ext=d.ExtendedMktQuote||d.extendedMktQuote;
    if(ext&&ext.last!=null&&String(d.curmktstatus||"").toUpperCase()!=="REG_MKT"){
      const ep=usSuffixNum(ext.last); if(ep!=null)price=ep;
    }
    if(price==null)continue;
    const sym=String(d.symbol||d.symbolName||d.code||"").toUpperCase().replace(/\./g,"-");
    if(!sym)continue;
    let prev=pk("previous_day_closing","prev_day_close","previousClose");
    /* [v4.49] change 로 전일종가를 되계산할 때는 반드시 '정규장 종가' 기준이어야 한다.
       확장거래가로 계산하면 프리·애프터 시간대의 등락률이 통째로 틀어진다. */
    /* [v4.50] change 가 부호 없는 절대값으로 오는 응답이 섞여 있다. 그대로 빼면
       내린 종목이 오른 것으로 뒤집혀 상승률 순위표까지 거짓말을 한다 —
       changetype(UP/DOWN) 으로 방향을 먼저 확정한 뒤 되계산한다. */
    if(prev==null&&regLast!=null){ let ch=pk("change");
      if(ch!=null){ const dir=String(d.changetype||"").toUpperCase();
        if(dir==="DOWN"&&ch>0)ch=-ch; else if(dir==="UP"&&ch<0)ch=-ch;
        prev=+(regLast-ch).toFixed(4); } }
    /* ══ [v9.71] 시가총액이 100만 배로 부풀던 오류 ═══════════════════════════
       [무엇이 잘못됐나] v4.49 의 방어식은 "cap<1e8 이면 백만 단위" 라고 단정했다.
       그런데 usSuffixNum 은 접미사를 이미 풀어서 돌려준다.
         · "3371148"(백만달러 표기) → 3,371,148 → ×1e6 = 3.37조 달러 ✔ 의도대로
         · "70.5M"(이미 달러 단위)  → 70,500,000 → ×1e6 = 70.5조 달러 ✘
       즉 시가총액 1억 달러 미만인 소형주는 전부 100만 배로 뻥튀기됐다.
       화면의 FGI·아이베다·리미나투스 같은 초소형주가 여기에 해당한다.
       [고침] ① 접미사(T/B/M/K)가 붙어 온 값은 이미 달러다 — 절대 곱하지 않는다.
              ② 접미사가 없는 작은 수만 백만 단위로 환산한다.
              ③ 마지막으로 주가로 검산한다. 시가총액÷주가 = 발행주식수인데,
                 이 값이 상식 범위(1만~5천억 주)를 벗어나면 표시하지 않는다.
                 값을 지어내느니 '—' 로 두는 편이 낫다. */
    let cap=capNorm(pkRaw("mktcapView","mktcap","market_cap"),price);
    /* 고가·저가가 현재가와 모순되면(원천 지연 혼합) 버린다 — 화면에 거짓 숫자를 남기지 않는다 */
    let hi=pk("high"), lo=pk("low");
    if(hi!=null&&price!=null&&hi<price*0.5)hi=null;
    if(lo!=null&&price!=null&&lo>price*1.5)lo=null;
    out[sym]={ price, prev,
      open:pk("open"), high:hi, low:lo,
      vol:pk("fullVolume","volume"),
      w52h:pk("yrhiprice","yrHiPrice"), w52l:pk("yrloprice","yrLoPrice"),
      cap,
      name:d.name||d.shortName||"" };
  }
  return Object.keys(out).length?out:null;
}
async function cnbcBatch(reus,diag,budget){
  if(!reus.length||(budget&&budget.left<=0))return {};
  try{
    budget&&budget.left--;
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),6500);
    const r=await fetch("https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols="
      +encodeURIComponent(reus.map(usSymDot).join("|"))
      +"&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json",
      {headers:{ "User-Agent": UA20, Accept:"application/json", Referer:"https://www.cnbc.com/quotes/" },signal:c.signal});
    clearTimeout(t);
    if(!r.ok){ diag&&diag.push("cnbc:"+r.status); return {}; }
    const m=cnbcParse(await r.text());
    if(!m){ diag&&diag.push("cnbc:parse"); return {}; }
    const out={};
    for(const reu of reus){ const q=m[usSym(reu).toUpperCase()]; if(q&&q.price!=null)out[reu]=q; }
    diag&&diag.push("cnbc:"+Object.keys(out).length+"/"+reus.length);
    return out;
  }catch(e){ diag&&diag.push("cnbc:"+String(e).slice(0,10)); return {}; }
}
async function cboeFetchOne(reu,diag,budget){
  if(budget&&budget.left<=0)return null;
  const tk=usSymDot(reu);
  try{
    budget&&budget.left--;
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),4500);
    const r=await fetch("https://cdn.cboe.com/api/global/delayed_quotes/quotes/"+encodeURIComponent(tk)+".json",
      {headers:{ "User-Agent": UA20, Accept:"application/json" },signal:c.signal});
    clearTimeout(t);
    if(!r.ok){ diag&&diag.push(tk+":cb"+r.status); return null; }
    let j=null; try{ j=JSON.parse(await r.text()); }catch(e){ diag&&diag.push(tk+":cb-parse"); return null; }
    const d=(j&&j.data)||j; if(!d||typeof d!=="object")return null;
    const price=usNum(d.current_price!=null?d.current_price:d.close);
    if(price==null){ diag&&diag.push(tk+":cb-empty"); return null; }
    diag&&diag.push(tk+":cb");
    return { price, prev:usNum(d.prev_day_close), open:usNum(d.open), high:usNum(d.high),
             low:usNum(d.low), vol:usNum(d.volume), name:d.name||"" };
  }catch(e){ diag&&diag.push(tk+":cb"+String(e).slice(0,8)); return null; }
}
/* 부분 성공을 합칠 때 이미 알던 값(52주·시총 등)을 지우지 않는다 */
/* [v4.75] 이름은 '있으면 지우지 않는다' — 뒤에 온 원천이 이름을 안 주면
   앞서 받은 한글 이름이 사라져 화면이 영문으로 되돌아갔다. */
function usMergeQ(oldQ,newQ){
  if(!oldQ)return newQ; if(!newQ)return oldQ;
  const o={...oldQ};
  for(const k of Object.keys(newQ)){
    const v=newQ[k];
    if(v==null)continue;
    if(k==="name"&&!String(v).trim())continue;      // 빈 이름으로 덮지 않는다
    o[k]=v;
  }
  return o;
}
/* KV 는 무료 플랜에서 하루 쓰기 1,000회 — 종목당 4분에 1번만 쓴다.
   한도를 넘으면 쓰기만 조용히 실패하고 읽기·메모리 캐시는 계속 동작한다. */
var _KVW=/* @__PURE__ */ new Map();
async function kvPutQuote(c,q){
  try{ if(!KV)return; const last=_KVW.get(c);
    if(last&&Date.now()-last<240e3)return;
    _KVW.set(c,Date.now());
    await KV.put("usq:"+c,JSON.stringify({at:Date.now(),q}),{expirationTtl:120});
  }catch(e){}
}
/* ══ [v4.53] 해외 시세가 계속 비던 진짜 이유 ═══════════════════════════════
   [어디서 틀렸나] 앞선 버전들은 '워커 IP 에서 네이버가 403 으로 막혔다'고 진단하고
   원천을 CNBC·Cboe 로 갈아 끼웠다. 그런데 그 진단이 애초에 틀렸다 —
   국내 시세는 지금도 멀쩡히 나온다. 국내가 쓰는 호스트가 바로 네이버다.
   즉 네이버는 막힌 적이 없고, '해외 코드만 다른 호스트를 두드리고 있었다'.
     · 작동함(국내 전역) : m.stock.naver.com/api/...      ← 앱 전체가 이 호스트로 산다
     · 실패함(해외 전용) : api.stock.naver.com/stock/...   ← 코드 어디에도 성공 사례 없음
                          polling.../realtime/worldstock/  ← 마찬가지
   국내 단건 조회가 m.stock.naver.com/api/stock/{코드}/basic 으로 확실히 되므로,
   해외도 같은 경로에 로이터코드(AAPL.O)를 넣어 부른다. 헤더도 국내와 똑같이(HDRS)
   맞춘다 — Referer 를 worldstock 경로로 바꿔 보내던 것도 굳이 다르게 굴던 부분이다.
   [교훈] 바깥 서비스를 의심하기 전에, 같은 앱 안에서 '되는 코드'와 '안 되는 코드'가
   무엇이 다른지부터 맞춰 본다. */
async function naverMOne(reu,diag,budget){
  if(budget&&budget.left<=0)return null;
  const tag=usSym(reu);
  for(const [nm,u] of [
    ["mbasic","https://m.stock.naver.com/api/stock/"+encodeURIComponent(reu)+"/basic"],
    ["mintg", "https://m.stock.naver.com/api/stock/"+encodeURIComponent(reu)+"/integration"]
  ]){
    if(budget&&budget.left<=0)break;
    budget&&budget.left--;
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),4500);
      /* 국내에서 실제로 통하는 헤더 그대로 쓴다(HDRS) */
      const r=await fetch(u,{headers:HDRS,signal:c.signal}); clearTimeout(t);
      if(!r.ok){ diag&&diag.push(tag+":"+nm+r.status); continue; }
      const q=usPickQuote(await r.text());
      if(q&&q.price!=null){ diag&&diag.push(tag+":"+nm); return q; }
      diag&&diag.push(tag+":"+nm+"-parse");
    }catch(e){ diag&&diag.push(tag+":"+nm+String(e).slice(0,8)); }
  }
  return null;
}
async function usFetchOne(reu,diag,budget){
  const hit=USQ_MEM.get(reu);
  if(hit&&Date.now()-hit.at<25e3)return hit.q;
  const tk=usSym(reu);
  /* ① 네이버 m.stock — 이 앱에서 유일하게 '작동이 확인된' 호스트다. 맨 앞에 세운다. */
  const nv=await naverMOne(reu,diag,budget);
  if(nv){ USQ_MEM.set(reu,{at:Date.now(),q:nv}); return nv; }
  /* ② Cboe — 데이터센터 IP 에도 열려 있는 CDN */
  const cb=await cboeFetchOne(reu,diag,budget);
  if(cb){ USQ_MEM.set(reu,{at:Date.now(),q:cb}); return cb; }
  /* ② 야후 — 워커 IP 에선 대개 429 지만, 되는 날은 그대로 쓴다.
     [v4.48] 매번 range=2y(종목당 수백 KB)를 받던 것을 5d 로 줄였다 — 시세에 2년치는 필요 없고,
     큰 응답이 5초 타임아웃과 시간 예산을 갉아먹고 있었다. 차트는 uscandle 이 따로 맡는다. */
  if(!budget||budget.left>0){ budget&&budget.left--;
  try{
    const yc=new AbortController(); const yt=setTimeout(()=>yc.abort(),5000);
    const yr=await fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(tk)+"?range=5d&interval=1d",
      {headers:{ "User-Agent": UA20, Accept:"application/json" },signal:yc.signal});
    clearTimeout(yt);
    if(yr.ok){
      const yp=yahooParse(await yr.text());
      if(yp&&yp.q){ USQ_MEM.set(reu,{at:Date.now(),q:yp.q}); diag&&diag.push(tk+":yh"); return yp.q; }
      diag&&diag.push(tk+":yh-parse");
    } else diag&&diag.push(tk+":yh"+yr.status);
  }catch(e){ diag&&diag.push(tk+":yh"+String(e).slice(0,8)); }
  }
  /* ③ Stooq — 공유 IP 일일 한도가 남아 있으면. 한도 소진 안내문은 파싱하지 말고 표시만 */
  if(!budget||budget.left>0){ budget&&budget.left--;
  try{
    const sc=new AbortController(); const st=setTimeout(()=>sc.abort(),4500);
    const sr=await fetch("https://stooq.com/q/l/?s="+encodeURIComponent(tk.toLowerCase())+".us&f=sd2t2ohlcv&h&e=csv",
      {headers:{ "User-Agent": UA20 },signal:sc.signal});
    clearTimeout(st);
    if(sr.ok){ const body=await sr.text();
      if(/exceeded/i.test(body))diag&&diag.push(tk+":sq-limit");
      else{ const q=stooqParse(body);
        if(q&&q.price){ USQ_MEM.set(reu,{at:Date.now(),q}); diag&&diag.push(tk+":sq"); return q; } } }
  }catch(e){ diag&&diag.push(tk+":sq"+String(e).slice(0,8)); }
  }
  /* ④ 네이버 — 주거용 IP 로 자가 호스팅할 때를 위해 남긴다(워커 IP 에선 403) */
  const H={ "User-Agent": UA20, Accept: "application/json", Referer: "https://m.stock.naver.com/worldstock/stock/"+reu, "Accept-Language":"ko" };
  for(const u of [
    "https://polling.finance.naver.com/api/realtime/worldstock/stock/"+reu,
    "https://api.stock.naver.com/stock/"+reu+"/basic"
  ]){
    if(budget&&budget.left<=0)break;
    budget&&budget.left--;
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),4000);
      const r=await fetch(u,{headers:H,signal:c.signal}); clearTimeout(t);
      if(!r.ok){ diag&&diag.push(reu.split(".")[0]+":"+r.status); continue; }
      const q=usPickQuote(await r.text());
      if(q){ USQ_MEM.set(reu,{at:Date.now(),q}); return q; }
      diag&&diag.push(reu.split(".")[0]+":parse");
    }catch(e){ diag&&diag.push(reu.split(".")[0]+":"+String(e).slice(0,12)); }
  }
  return null;
}
/* ══ [v4.35] 환율은 여러 곳에서 받는다 ═══════════════════════════════════
   네이버 marketindex 한 곳만 보고 있었는데 그 경로가 막히자 환율이 영영 오지
   않아 환전·주문이 전부 잠겼다(사용자 화면: '수신 대기'). 국내·해외 공개 소스를
   순서대로 시도하고, 한 번 성공하면 KV 에 담아 다음 요청은 즉시 응답한다. */
var USFX_MEM = null;
function usFxPick(txt){
  let j=null; try{ j=JSON.parse(txt); }catch(e){ return null; }
  const cand=[];
  const dig=(o,d)=>{ if(o==null||d>5)return;
    if(typeof o==="number"){cand.push(o);return;}
    if(typeof o==="string"){const n=usNum(o); if(n!=null)cand.push(n); return;}
    if(Array.isArray(o)){o.forEach(x=>dig(x,d+1));return;}
    if(typeof o==="object")Object.keys(o).forEach(k=>{
      if(/KRW|closePrice|basePrice|rate|value|price/i.test(k)||typeof o[k]==="object")dig(o[k],d+1);});
  };
  dig(j,0);
  const ok=cand.filter(v=>v>800&&v<3000);
  return ok.length?ok[0]:null;
}
async function usFx(diag){
  if(USFX_MEM&&Date.now()-USFX_MEM.at<60e3)return USFX_MEM.v;
  try{ if(KV){ const c=await KV.get("usfx","json");
    if(c&&c.v&&Date.now()-c.at<30*60e3){ USFX_MEM={v:c.v,at:Date.now()}; return c.v; } }}catch(e){}
  const srcs=[
    /* [v4.48] 워커에서 실제로 열리는 공개 환율을 앞으로 — 네이버 3형제는
       데이터센터 IP 에 403 이라, 그동안 첫 환율 응답만 최대 12초씩 늦추고 있었다 */
    ["erapi","https://open.er-api.com/v6/latest/USD",null],
    ["frankfurter","https://api.frankfurter.app/latest?from=USD&to=KRW",null],
    ["jsdelivr","https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",null],
    ["naver-poll","https://polling.finance.naver.com/api/realtime/marketindex/exchange/FX_USDKRW","https://finance.naver.com/marketindex/"],
    ["naver-api","https://api.stock.naver.com/marketindex/exchange/FX_USDKRW/basic","https://m.stock.naver.com/"],
    ["naver-front","https://m.stock.naver.com/front-api/marketIndex/prices?category=exchange&reutersCode=FX_USDKRW&page=1&pageSize=1","https://m.stock.naver.com/"]
  ];
  for(const [name,url,ref] of srcs){
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),4000);
      const h={ "User-Agent": UA20, Accept:"application/json" }; if(ref)h.Referer=ref;
      const r=await fetch(url,{headers:h,signal:c.signal}); clearTimeout(t);
      if(!r.ok){ diag&&diag.push("fx:"+name+":"+r.status); continue; }
      const txt=await r.text();
      let v=usFxPick(txt);
      if(!v&&name==="stooq-fx"){ const s=stooqParse(txt); v=(s&&s.price>800&&s.price<3000)?s.price:null; }
      if(!v&&name==="yahoo-fx"){ const y=yahooParse(txt); v=(y&&y.q&&y.q.price>800&&y.q.price<3000)?y.q.price:null; }
      if(v){ USFX_MEM={v,at:Date.now()};
        try{ if(KV)await KV.put("usfx",JSON.stringify({v,at:Date.now()}),{expirationTtl:3600}); }catch(e){}
        diag&&diag.push("fx:"+name+":ok"); return v; }
      diag&&diag.push("fx:"+name+":parse");
    }catch(e){ diag&&diag.push("fx:"+name+":"+String(e).slice(0,10)); }
  }
  return null;
}
/* ══ [v4.45] 다통화 환율 — 원화 기준 여러 통화를 한 번에 받아 온다 ═══════════
   기존 usFx 는 USD 하나만 다뤘다. 환전 코너에서 엔·유로·위안 등을 쓰려면
   통화별 KRW 환율이 필요하다. 한 소스에서 전 통화를 받아 KV 에 담는다. */
var USFXA_MEM=null;
function fxAllPick(txt){
  let j=null; try{ j=JSON.parse(txt); }catch(e){ return null; }
  /* er-api: {rates:{KRW:1385,JPY:150,...}} — USD 기준 */
  const R=(j&&j.rates)||(j&&j.usd)||null;
  if(!R||typeof R!=="object")return null;
  const krw=usNum(R.KRW!=null?R.KRW:R.krw);
  if(!krw||krw<800||krw>3000)return null;
  const out={KRW:krw};
  Object.keys(R).forEach(k=>{
    const v=usNum(R[k]); if(v==null||!(v>0))return;
    out[k.toUpperCase()]=v;                      // USD 1단위당 해당 통화
  });
  return out;
}
async function fxAll(diag){
  if(USFXA_MEM&&Date.now()-USFXA_MEM.at<10*60e3)return USFXA_MEM.v;
  try{ if(KV){ const c=await KV.get("usfxall","json");
    if(c&&c.v&&Date.now()-c.at<60*60e3){ USFXA_MEM={v:c.v,at:Date.now()}; return c.v; } }}catch(e){}
  for(const [name,url] of [
    ["erapi","https://open.er-api.com/v6/latest/USD"],
    ["jsdelivr","https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"],
    ["frankfurter","https://api.frankfurter.app/latest?from=USD"]
  ]){
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),5000);
      const r=await fetch(url,{headers:{ "User-Agent": UA20, Accept:"application/json" },signal:c.signal});
      clearTimeout(t);
      if(!r.ok){ diag&&diag.push("fxa:"+name+":"+r.status); continue; }
      const v=fxAllPick(await r.text());
      if(v){ USFXA_MEM={v,at:Date.now()};
        try{ if(KV)await KV.put("usfxall",JSON.stringify({v,at:Date.now()}),{expirationTtl:7200}); }catch(e){}
        diag&&diag.push("fxa:"+name+":ok"); return v; }
      diag&&diag.push("fxa:"+name+":parse");
    }catch(e){ diag&&diag.push("fxa:"+name+":"+String(e).slice(0,10)); }
  }
  return null;
}
async function fxall_default(){
  const diag=[]; const v=await fxAll(diag);
  return new Response(JSON.stringify({ok:!!v,rates:v||null,diag}),
    {headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});
}
ROUTES["fxall"]=fxall_default;
async function usfxdiag_default(){
  const out={at:new Date().toISOString(),tried:[]};
  const srcs=[["naver-poll","https://polling.finance.naver.com/api/realtime/marketindex/exchange/FX_USDKRW","https://finance.naver.com/marketindex/"],
    ["naver-api","https://api.stock.naver.com/marketindex/exchange/FX_USDKRW/basic","https://m.stock.naver.com/"],
    ["naver-front","https://m.stock.naver.com/front-api/marketIndex/prices?category=exchange&reutersCode=FX_USDKRW&page=1&pageSize=1","https://m.stock.naver.com/"],
    ["erapi","https://open.er-api.com/v6/latest/USD",null],
    ["frankfurter","https://api.frankfurter.app/latest?from=USD&to=KRW",null],
    ["jsdelivr","https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",null]];
  for(const [name,url,ref] of srcs){
    const rec={name,url};
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),6000);
      const h={ "User-Agent": UA20, Accept:"application/json" }; if(ref)h.Referer=ref;
      const r=await fetch(url,{headers:h,signal:c.signal}); clearTimeout(t);
      rec.status=r.status; const txt=await r.text();
      rec.len=txt.length; rec.parsed=usFxPick(txt); rec.sample=txt.slice(0,180).replace(/\s+/g," ");
    }catch(e){ rec.err=String(e).slice(0,60); }
    out.tried.push(rec);
  }
  out.usable=out.tried.filter(x=>x.parsed).map(x=>x.name+"="+x.parsed);
  return new Response(JSON.stringify(out,null,2),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}
async function usquote_default(req2){
  /* ══ [v4.48 · '$—' 전면 수리] ═══════════════════════════════════════════
     [원인] 야후 429 · 네이버 403 · Stooq 한도소진 — 세 원천이 워커 IP 에서
       '동시에' 죽어 있었다(위 v4.48 원천 교체 주석). 게다가 야후 파서는
       시가총액을 아예 안 뽑아서, 야후가 살아 있던 시절에도 '기업 규모' 는 '—' 였다.
     [수리] ① CNBC 배치 1회로 남은 종목 전부(52주·시총 포함)
            ② 빠진 종목만 Cboe→야후→Stooq→네이버 개별 체인
            ③ 그래도 빈 52주 고저는 KV 에 저장된 일봉으로 직접 계산(외부 호출 아님)
       외부 호출은 예산 카운터로 총 38회 아래에 묶는다(무료 플랜 50회 한도 ★11). */
  const T0=Date.now(), u=new URL(req2.url), diag=[];
  const budget={left:38};
  const codes=[...new Set(String(u.searchParams.get("codes")||"").split(",").map(s=>s.trim()).filter(Boolean))].slice(0,18);
  const out={}; let miss=[];
  /* 1) 메모리 → KV 캐시 우선 */
  for(const c of codes){
    const m=USQ_MEM.get(c);
    if(m&&Date.now()-m.at<20e3){ out[c]=m.q; continue; }
    miss.push(c);
  }
  if(miss.length&&KV){
    try{
      const got=await Promise.all(miss.map(c=>KV.get("usq:"+c,"json").catch(()=>null)));
      const still=[];
      miss.forEach((c,i)=>{ const v=got[i];
        if(v&&v.at&&Date.now()-v.at<40e3&&v.q){ out[c]=v.q; USQ_MEM.set(c,{at:Date.now(),q:v.q}); }
        else still.push(c); });
      diag.push("cache:"+(codes.length-still.length));
      miss=still;
    }catch(e){}
  }
  /* 2-A) 네이버 배치 — 국내 시세가 쓰는 것과 똑같은 방식(콤마로 이어 한 번에).
     [v4.53] 국내는 polling.finance.naver.com/api/realtime/domestic/stock/{코드들} 로
     40종목을 1회에 받아 오고 그게 지금도 잘 된다. 해외도 같은 서버의 worldstock
     갈래를 같은 헤더(HDRS)로 부른다 — 전에는 종목마다 따로, 다른 헤더로 불렀다. */
  if(miss.length){
    budget.left--;
    try{
      const j=await jget10("https://polling.finance.naver.com/api/realtime/worldstock/stock/"
        +miss.map(encodeURIComponent).join(","),5000);
      const arr=(j&&j.datas)||(j&&j.result&&j.result.areas||[]).flatMap(a=>a.datas||[])||[];
      let hit=0;
      for(const d of (Array.isArray(arr)?arr:[])){
        const key=String(d.reutersCode||d.cd||d.itemCode||"").toUpperCase();
        const q=usPickQuote(JSON.stringify(d));
        if(!key||!q||q.price==null)continue;
        const c=miss.find(x=>x.toUpperCase()===key);
        if(!c)continue;
        out[c]=usMergeQ(out[c],q); USQ_MEM.set(c,{at:Date.now(),q:out[c]});
        await kvPutQuote(c,out[c]); hit++;
      }
      diag.push("nvbatch:"+hit+"/"+miss.length);
      miss=miss.filter(c=>!out[c]);
    }catch(e){ diag.push("nvbatch:"+String(e).slice(0,14)); }
  }
  /* 2-B) 그래도 남으면 CNBC 배치 — 외부 호출 '1회' 로 나머지 전부 */
  if(miss.length){
    const got=await cnbcBatch(miss,diag,budget);
    const still=[];
    for(const c of miss){
      if(got[c]){ out[c]=usMergeQ(out[c],got[c]); USQ_MEM.set(c,{at:Date.now(),q:out[c]}); await kvPutQuote(c,out[c]); }
      else still.push(c);
    }
    miss=still;
  }
  /* 3) 그래도 빠진 것만 개별 체인 — 6개 동시, 시간·예산을 함께 감시 */
  for(let i=0;i<miss.length;i+=6){
    if(Date.now()-T0>9000||budget.left<=2){ diag.push("budget"); break; }
    const part=miss.slice(i,i+6);
    const rs=await Promise.all(part.map(c=>usFetchOne(c,diag,budget)));
    for(let k=0;k<part.length;k++){
      if(!rs[k])continue; const c=part[k];
      out[c]=usMergeQ(out[c],rs[k]); await kvPutQuote(c,out[c]);
    }
  }
  /* 4) 52주 고저가 빈 종목은 KV 일봉으로 계산 — KV 읽기는 외부 호출 예산을 안 쓴다 */
  /* [v4.50 · 정밀감사에서 드러난 두 구멍]
     ① Stooq CSV 에는 전일 종가 항목이 아예 없어 prev=null 로 온다. prev 가 없으면
        등락률이 '—' 가 되고 상승률 순위에서도 통째로 빠진다 — 야후가 죽고 Stooq 만
        살아난 날 '가격은 뜨는데 등락률만 전부 비는' 상태가 된다.
     ② Cboe 는 52주·시가총액을 주지 않는다. Cboe 가 개별 체인 1순위이므로 CNBC 배치가
        실패한 종목은 시가총액이 영원히 '—' 로 남는다.
     둘 다 KV 로 메운다 — KV 읽기는 외부 호출 예산(★11)을 쓰지 않으므로 공짜다. */
  const lack=Object.keys(out).filter(c=>out[c]&&(out[c].w52h==null||out[c].w52l==null||out[c].prev==null)).slice(0,18);
  if(lack.length&&KV){
    try{
      const cds=await Promise.all(lack.map(c=>KV.get("uscd:"+c,"json").catch(()=>null)));
      lack.forEach((c,i)=>{ const v=cds[i];
        if(v&&Array.isArray(v.candles)&&v.candles.length>5){
          const cs2=v.candles, y=cs2.slice(-252);
          if(out[c].w52h==null)out[c].w52h=Math.max.apply(null,y.map(k=>k.h));
          if(out[c].w52l==null)out[c].w52l=Math.min.apply(null,y.map(k=>k.l));
          if(out[c].prev==null&&cs2.length>1){
            /* 마지막 봉이 오늘 것이면 그 앞 봉이 전일 종가, 아니면 마지막 봉이 전일 종가 */
            const last=cs2[cs2.length-1], px=out[c].price;
            out[c].prev=(px!=null&&last&&Math.abs(last.c-px)<1e-9)?cs2[cs2.length-2].c:last.c;
          }
        }});
    }catch(e){}
  }
  /* 시가총액 24~36시간 캐시 — 하루 안에 크게 변하지 않는 값이라 한 번 받아 두면 오래 쓴다.
     CNBC 가 죽어도 '기업 규모'가 빈칸으로 남지 않게 하는 안전망. */
  if(KV){
    try{
      const need=Object.keys(out).filter(c=>out[c]&&!(out[c].cap>0)).slice(0,18);
      if(need.length){
        const got=await Promise.all(need.map(c=>KV.get("uscap:"+c,"json").catch(()=>null)));
        need.forEach((c,i)=>{ const v=got[i];
          if(v&&v.cap>0&&Date.now()-v.at<36*3600e3){ out[c].cap=v.cap; out[c].capOld=1; } });
      }
      for(const c of Object.keys(out).filter(c=>out[c]&&out[c].cap>0&&!out[c].capOld).slice(0,8)){
        const wk="capw:"+c, last=_KVW.get(wk);
        if(last&&Date.now()-last<12*3600e3)continue;
        _KVW.set(wk,Date.now());
        await KV.put("uscap:"+c,JSON.stringify({at:Date.now(),cap:out[c].cap}),{expirationTtl:172800});
      }
    }catch(e){}
  }
  /* ══ [v4.56] 시가총액 보충 ═══════════════════════════════════════════════
     [왜 비었나] 네이버 배치가 시세를 다 채우면 miss 가 비어 CNBC 를 아예 안 불렀다.
     그런데 배치 응답에는 시가총액 항목이 없다 → '기업 규모'가 늘 '—' 였다.
     [해법] 시세와 별개로 '시총이 없는 종목'만 모아 CNBC 배치를 한 번 더 부른다.
     시총은 하루 안에 크게 안 변하므로 KV 에 오래 담아 두고, 다음부터는 호출 없이 쓴다.
     KV 에서 먼저 복원하고, 그래도 없는 게 있을 때만 외부 호출 1회를 쓴다. */
  if(KV){
    try{
      const need=Object.keys(out).filter(c=>out[c]&&!(out[c].cap>0));
      if(need.length){
        const got=await Promise.all(need.slice(0,20).map(c=>KV.get("uscap:"+c,"json").catch(()=>null)));
        need.slice(0,20).forEach((c,i)=>{ const v=got[i];
          if(v&&v.cap>0&&Date.now()-v.at<36*3600e3)out[c].cap=v.cap; });
      }
    }catch(e){}
  }
  {
    /* ══ [v4.62] 시가총액 보충을 '요청할 때만' 한다 ═══════════════════════════
       [무엇이 느렸나] v4.56 부터 모든 시세 요청이 끝에 CNBC 를 한 번 더 불렀다.
       네이버 배치가 200ms 에 끝나도 CNBC 를 최대 6.5초 기다린 뒤에야 응답했고,
       목록 화면은 7묶음이라 그 지연을 7번 겪었다 — 해외만 유독 느리던 진짜 이유다.
       시가총액이 필요한 곳은 종목 상세와 시가총액 순위뿐이므로, 그때만 cap=1 로
       요청하게 한다. 목록 화면은 네이버 배치 한 번으로 곧장 끝난다. */
    const wantCap=u.searchParams.get("cap")==="1";
    const noCap=wantCap?Object.keys(out).filter(c=>out[c]&&!(out[c].cap>0)).slice(0,18):[];
    if(noCap.length&&budget.left>1&&Date.now()-T0<8000){
      const cm=await cnbcBatch(noCap,diag,budget);
      let n=0;
      for(const c of noCap){
        const q=cm[c];
        if(!q)continue;
        if(q.cap>0){ out[c].cap=q.cap; n++;
          try{ if(KV)await KV.put("uscap:"+c,JSON.stringify({at:Date.now(),cap:q.cap}),{expirationTtl:172800}); }catch(e){}
        }
        /* 온 김에 52주 고저도 비어 있으면 함께 채운다 — 추가 호출이 아니다 */
        if(out[c].w52h==null&&q.w52h!=null)out[c].w52h=q.w52h;
        if(out[c].w52l==null&&q.w52l!=null)out[c].w52l=q.w52l;
        USQ_MEM.set(c,{at:Date.now(),q:out[c]});
      }
      diag.push("cap:"+n+"/"+noCap.length);
    }
  }
  const body={ ok:Object.keys(out).length>0, n:Object.keys(out).length, asked:codes.length,
               codes:out, diag:diag.slice(0,12) };
  if(u.searchParams.get("fx")==="1")body.fx=await usFx(diag);
  /* ══ [v10.5] '시세 대기'가 길게 남던 진짜 이유 ═══════════════════════════════
     서버와 화면 양쪽 모두 no-store 였다. 그래서 목록을 위아래로 훑을 때마다
     이미 받아 온 종목까지 매번 새로 요청했고, 그때마다 워커 왕복(200~600ms)이
     그대로 기다림이 됐다. 200종을 오가면 같은 요청이 수십 번 반복된다.
     시세는 20초쯤 묵어도 목록에서는 문제가 없다(상세 화면은 따로 갱신한다).
     짧은 캐시를 허용해 두 번째부터는 브라우저가 즉시 돌려주게 한다. */
  return new Response(JSON.stringify(body),{headers:{ "content-type":"application/json", "cache-control":"public, max-age=15, stale-while-revalidate=45", "access-control-allow-origin":"*" }});
}
function usPickCandles(txt){
  let j=null; try{ j=JSON.parse(txt); }catch(e){ return null; }
  const arr=Array.isArray(j)?j:(j&&(j.priceInfos||j.result||j.datas))||null;
  if(!Array.isArray(arr)||!arr.length)return null;
  const out=[];
  for(const it of arr){
    const t=String(it.localDate||it.localDateTime||it.date||"").replace(/[^0-9]/g,"").slice(0,8);
    const c=usNum(it.closePrice), o=usNum(it.openPrice), h=usNum(it.highPrice), l=usNum(it.lowPrice);
    const v=usNum(it.accumulatedTradingVolume!=null?it.accumulatedTradingVolume:it.tradingVolume)||0;
    if(t.length===8&&c!=null)out.push({t:+t,o:o!=null?o:c,h:h!=null?h:c,l:l!=null?l:c,c,v});
  }
  return out.length?out.sort((a,b)=>a.t-b.t):null;
}
async function uscandle_default(req2){
  const u=new URL(req2.url), diag=[];
  const reu=String(u.searchParams.get("code")||"").trim().slice(0,16);
  if(!reu)return new Response(JSON.stringify({ok:false,err:"code"}),{headers:{"content-type":"application/json"}});
  /* ══ [v4.60] 해외 분봉 ═══════════════════════════════════════════════════
     [왜 이제 되나] 화면 진단(조회수 원천 확인)에서 야후가 200 으로 응답하는 것이
     실제로 확인됐다. 그동안 '야후는 429 로 막혔다'고 짐작했던 건 KV 오류로 요청이
     시작조차 못 하던 시절의 잘못된 추측이었다.
     → 야후 차트의 1분봉(최근 5일)을 한 번에 받아 두고, 3·5·10·30·60분은
       클라이언트에서 묶어 만든다. 국내와 같은 봉 종류를 해외에서도 쓸 수 있다. */
  if(String(u.searchParams.get("tf")||"")==="MIN"){
    /* ══ [v4.63] 분봉을 1년치까지 이어 붙인다 ═══════════════════════════════
       [원천의 한계를 먼저 밝힌다] 야후는 한 번에 주는 기간이 봉 크기마다 정해져 있다.
         · 1분봉  : 최대 7일   ← 1년치는 어떤 무료 원천도 주지 않는다
         · 5·30분 : 최대 60일
         · 60분   : 2년까지
       [그래서 이렇게 한다] period1·period2 로 창을 옮겨 가며 여러 번 받아 이어 붙인다.
       60·30·5분은 이렇게 1년을 채울 수 있고, 1분은 창이 7일이라 여러 번 받아도
       두 달 남짓이 한계다. 없는 데이터를 지어내지 않고, 실제로 확보한 기간을
       span 으로 함께 돌려줘 화면에 그대로 적는다. */
    const want=Math.max(1,parseInt(u.searchParams.get("m")||"1")||1);
    const bkt=want>=60?60:want>=30?30:want>=5?5:want>=3?3:1;
    const MK="usmin:"+reu+":"+bkt;
    try{ const c=KV?await KV.get(MK,"json"):null;
      if(c&&c.at&&Date.now()-c.at<5*60*1000&&Array.isArray(c.candles)&&c.candles.length)
        return new Response(JSON.stringify({ok:true,tf:"MIN",m:bkt,candles:c.candles,span:c.span,cached:1}),
          {headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});
    }catch(e){}
    const tk=usSymDot(reu);
    /* ══ [v4.64] 봉마다 '쓸모 있는' 기간을 따로 정한다 ═══════════════════════
       무조건 1년으로 밀면 1·3분봉은 원천이 못 주고, 억지로 늘려도 봉만 무거워진다.
       봉이 맡는 구간이 서로 겹치지 않도록 계단을 만든다.
         1분  : 7일   — 원천이 한 번에 주는 최대치. 딱 한 번만 받아 가장 빠르다
         3분  : 28일  — 1분(7일)과 5분(1년) 사이를 메운다. 7일 창 4개를 동시에 받는다
         5·10분: 1년
         30·60분: 1년 */
    const IV={1:"1m",3:"1m",5:"5m",30:"30m",60:"60m"}[bkt];
    const WIN={1:7,3:7,5:59,30:59,60:365}[bkt];      // 한 번에 받을 수 있는 일수
    const WANT_DAYS={1:7,3:28,5:365,30:365,60:365}[bkt];
    const winCount=Math.min(8,Math.max(1,Math.ceil(WANT_DAYS/WIN)));
    const now=Math.floor(Date.now()/1000), DAY=86400;
    const jobs=[];
    for(let i=0;i<winCount;i++){
      const p2=now-i*WIN*DAY, p1=p2-WIN*DAY;
      jobs.push(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tk)}`
        +`?interval=${IV}&period1=${p1}&period2=${p2}&includePrePost=false`);
    }
    const pull=async(url)=>{
      try{
        const c=new AbortController(); const t=setTimeout(()=>c.abort(),6000);
        const r=await fetch(url,{headers:{ "User-Agent": UA20, Accept:"application/json" },signal:c.signal});
        clearTimeout(t);
        if(!r.ok)return {err:"HTTP"+r.status};
        const j=await r.json();
        const res=j&&j.chart&&j.chart.result&&j.chart.result[0];
        const ts=res&&res.timestamp, q=res&&res.indicators&&res.indicators.quote&&res.indicators.quote[0];
        if(!ts||!q)return {err:"shape"};
        const out=[];
        for(let i=0;i<ts.length;i++){
          const cl=+q.close[i]; if(!(cl>0))continue;
          let o=+q.open[i],h=+q.high[i],l=+q.low[i];
          if(!(o>0))o=cl; if(!(h>0))h=Math.max(o,cl); if(!(l>0))l=Math.min(o,cl);
          out.push({t:ts[i]*1000,o,h:Math.max(h,o,cl),l:Math.min(l,o,cl),c:cl,v:+q.volume[i]||0});
        }
        return {rows:out};
      }catch(e){ return {err:String(e).slice(0,12)}; }
    };
    const res=await Promise.all(jobs.map(pull));
    const map=new Map(); let errs=0;
    res.forEach(r=>{ if(r.err){errs++;return;} (r.rows||[]).forEach(c=>{ if(!map.has(c.t))map.set(c.t,c); }); });
    let rows=[...map.values()].sort((a,b)=>a.t-b.t);
    diag.push(IV+":"+rows.length+(errs?"/err"+errs:""));
    /* 화면과 저장소가 감당할 만큼만 — 최근 것부터 남긴다 */
    const CAP=26000;
    if(rows.length>CAP)rows=rows.slice(-CAP);
    if(!rows.length){
      return new Response(JSON.stringify({ok:false,tf:"MIN",m:bkt,candles:[],diag}),
        {headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});
    }
    const days=Math.round((rows[rows.length-1].t-rows[0].t)/DAY/1000);
    /* 목표만큼 받았는지 화면이 구분할 수 있게 — 1년인 척하지 않는다 */
    const span={days,from:rows[0].t,to:rows[rows.length-1].t,want:WANT_DAYS,
      full:days>=WANT_DAYS*0.85,
      note:bkt===1?"시세 제공처가 1분 데이터를 이레까지만 제공합니다"
        :bkt===3?"3분봉은 1분 데이터로 만들어 한 달까지 제공합니다":""};
    try{ if(KV)await KV.put(MK,JSON.stringify({at:Date.now(),candles:rows,span}),{expirationTtl:600}); }catch(e){}
    return new Response(JSON.stringify({ok:true,tf:"MIN",m:bkt,candles:rows,span,diag}),
      {headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});
  }
  const CK="uscd:"+reu;
  try{ const c=KV?await KV.get(CK,"json"):null;
    if(c&&c.at&&Date.now()-c.at<15*60*1000&&Array.isArray(c.candles))
      return new Response(JSON.stringify({ok:true,candles:c.candles,cached:1}),{headers:{"content-type":"application/json","access-control-allow-origin":"*"}});
  }catch(e){}
  /* ══ [v4.60] 차트도 시세와 같은 순서로 ═══════════════════════════════════
     Cboe → Stooq → 네이버 순이라, 네이버가 가장 빠른데도 앞의 둘이 각각 6초씩
     헛돌고 나서야 도달했다. 종목 화면을 열 때마다 12초를 버리던 셈이다.
     시세에서 실제로 응답이 확인된 m.stock.naver.com 을 맨 앞에 세우고,
     타임아웃도 6초 → 4초로 줄인다. */
  try{
    for(const url of [
      "https://m.stock.naver.com/api/chart/foreign/item/"+reu+"/day",
      "https://m.stock.naver.com/api/chart/foreign/item/"+reu+"/day?range=2y"
    ]){
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),4000);
      let r=null; try{ r=await fetch(url,{headers:HDRS,signal:c.signal}); }catch(e){ diag.push("nv:"+String(e).slice(0,8)); }
      clearTimeout(t);
      if(!r||!r.ok){ if(r)diag.push("nv:"+r.status); continue; }
      const cs=usPickCandles(await r.text());
      if(cs&&cs.length>20){
        diag.push("nv:"+cs.length);
        try{ if(KV)await KV.put(CK,JSON.stringify({at:Date.now(),candles:cs}),{expirationTtl:3600}); }catch(e){}
        return new Response(JSON.stringify({ok:true,candles:cs,src:"naver",diag}),
          {headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});
      }
      diag.push("nv:thin");
    }
  }catch(e){ diag.push("nv:"+String(e).slice(0,10)); }
  const H={ "User-Agent": UA20, Accept:"application/json", Referer:"https://m.stock.naver.com/worldstock/stock/"+reu, "Accept-Language":"ko" };
  /* [v4.42] 야후에서 2년치 일봉을 먼저 받는다 — 네이버가 막혀도 차트가 비지 않는다 */
  try{
    const ytk=usSym(reu);
    const yc=new AbortController(); const yt=setTimeout(()=>yc.abort(),6000);
    const yr=await fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(ytk)+"?range=2y&interval=1d",
      {headers:{ "User-Agent": UA20, Accept:"application/json" },signal:yc.signal});
    clearTimeout(yt);
    if(yr.ok){
      const yp=yahooParse(await yr.text());
      if(yp&&yp.candles&&yp.candles.length>5){
        try{ if(KV)await KV.put(CK,JSON.stringify({at:Date.now(),candles:yp.candles}),{expirationTtl:3600}); }catch(e){}
        return new Response(JSON.stringify({ok:true,candles:yp.candles,diag:["yahoo"]}),
          {headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});
      }
      diag.push("yh:parse");
    } else diag.push("yh:"+yr.status);
  }catch(e){ diag.push("yh:"+String(e).slice(0,12)); }
  let candles=null;
  /* [v4.53] 시세와 같은 이유로 순서를 뒤집는다 — 이 앱에서 실제로 응답이 오는 호스트는
     m.stock.naver.com 이다. 검증 안 된 api.stock 을 앞에 두면 매번 헛돌다 시간만 쓴다. */
  for(const url of [
    "https://m.stock.naver.com/api/chart/foreign/item/"+reu+"/day",
    "https://m.stock.naver.com/api/chart/foreign/item/"+reu+"/day?range=2y",
    "https://api.stock.naver.com/chart/foreign/item/"+reu+"/day"
  ]){
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),6000);
      const r=await fetch(url,{headers:HDRS,signal:c.signal}); clearTimeout(t);
      if(!r.ok){ diag.push("cd:"+r.status); continue; }
      candles=usPickCandles(await r.text());
      if(candles){ diag.push("src:"+url.split("/")[2]); break; }
      diag.push("cd:parse");
    }catch(e){ diag.push("cd:"+String(e).slice(0,12)); }
  }
  if(candles){ try{ if(KV)await KV.put(CK,JSON.stringify({at:Date.now(),candles}),{expirationTtl:3600}); }catch(e){} }
  return new Response(JSON.stringify({ok:!!candles,candles:candles||[],diag}),
    {headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});
}
async function usdiag_default(){
  /* [v4.48] 원천 전면 교체에 맞춰 진단도 새 원천을 전부 두드린다.
     parsed=true 인 원천이 실제로 쓸 수 있는 문이고, usable 이 그 요약이다.
     usable 이 비어 있으면 그날은 정말 모든 문이 닫힌 것이다. */
  const out={at:new Date().toISOString(),ver:APP_VER,tried:[]};
  const probe=async(label,url,ref,parse)=>{
    const rec={label,url};
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),6000);
      const r=await fetch(url,{headers:{ "User-Agent": UA20, Accept:"application/json", Referer:ref||"https://m.stock.naver.com/", "Accept-Language":"ko" },signal:c.signal});
      clearTimeout(t);
      rec.status=r.status;
      const txt=await r.text(); rec.len=txt.length;
      try{ rec.parsed=!!(parse&&parse(txt)); }catch(e){ rec.parsed=false; }
      rec.sample=txt.slice(0,200).replace(/\s+/g," ");
    }catch(e){ rec.err=String(e).slice(0,60); }
    out.tried.push(rec);
  };
  await probe("cnbc-batch","https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=AAPL%7CMSFT&requestMethod=itv&noform=1&partnerId=2&fund=1&output=json","https://www.cnbc.com/quotes/",cnbcParse);
  await probe("cboe-quote","https://cdn.cboe.com/api/global/delayed_quotes/quotes/AAPL.json",null,(t)=>{try{const j=JSON.parse(t);return !!(j&&j.data&&j.data.current_price!=null);}catch(e){return false;}});
  await probe("cboe-candles","https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/AAPL.json",null,(t)=>{try{const j=JSON.parse(t);return !!(j&&Array.isArray(j.data)&&j.data.length>5);}catch(e){return false;}});
  await probe("yahoo","https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=5d&interval=1d",null,(t)=>!!yahooParse(t));
  await probe("stooq-quote","https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv",null,(t)=>!!stooqParse(t));
  await probe("stooq-candles","https://stooq.com/q/d/l/?s=aapl.us&i=d",null,(t)=>/^date,open/i.test(String(t||"").trim()));
  await probe("naver-poll","https://polling.finance.naver.com/api/realtime/worldstock/stock/AAPL.O","https://m.stock.naver.com/worldstock/stock/AAPL.O",(t)=>!!usPickQuote(t));
  await probe("naver-mbasic","https://m.stock.naver.com/api/stock/AAPL.O/basic","https://finance.naver.com/",(t)=>!!usPickQuote(t));
  await probe("naver-mintg","https://m.stock.naver.com/api/stock/AAPL.O/integration","https://finance.naver.com/",(t)=>!!usPickQuote(t));
  await probe("naver-mcandle","https://m.stock.naver.com/api/chart/foreign/item/AAPL.O/day","https://finance.naver.com/",(t)=>!!usPickCandles(t));
  await probe("naver-batch","https://polling.finance.naver.com/api/realtime/worldstock/stock/AAPL.O,NVDA.O","https://finance.naver.com/",(t)=>{try{const j=JSON.parse(t);const a=j.datas||[];return Array.isArray(a)&&a.length>0;}catch(e){return false;}});
  await probe("naver-basic","https://api.stock.naver.com/stock/AAPL.O/basic","https://m.stock.naver.com/worldstock/stock/AAPL.O",(t)=>!!usPickQuote(t));
  await probe("fx-erapi","https://open.er-api.com/v6/latest/USD",null,(t)=>!!usFxPick(t));
  out.usable=out.tried.filter(x=>x.parsed).map(x=>x.label);
  return new Response(JSON.stringify(out,null,2),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}
/* [v4.30] 해외 로고 중계 — 사용자 통신망에서 외부 CDN 이 막혀도 서버가 대신 받아 온다.
   국내 로고에서 토스·네이버가 통째로 차단됐던 전례가 있어 같은 안전장치를 둔다. */
/* 그림이 쓸 만한지 서버에서 판별한다.
   ① 너무 작으면 버린다  ② PNG 는 머리말에서 가로·세로를 읽어 16px 미만이면 버린다
   ③ 거의 같은 바이트만 반복되면(단색 그림) 버린다 — '흰 빈 상자'의 정체가 이것이다 */
function imgLooksReal(buf,ct,minPx){
  if(!buf||buf.length<400)return false;
  if(String(ct||"").indexOf("svg")>=0)return buf.length>200;
  if(buf.length>8&&buf[0]===0x89&&buf[1]===0x50){          // PNG
    const w=(buf[16]<<24)|(buf[17]<<16)|(buf[18]<<8)|buf[19];
    const h=(buf[20]<<24)|(buf[21]<<16)|(buf[22]<<8)|buf[23];
    /* [v4.93] 앞 후보에게는 48px 이상을 요구하고(뭉개짐 방지),
       마지막 보루(파비콘)에서는 16px 이상이면 받아들인다 — 없는 것보다 낫다. */
    const need=minPx||16;
    if(w<need||h<need)return false;
    /* 단색 PNG 는 압축이 극단적으로 잘 되어 픽셀 수에 비해 파일이 아주 작다 */
    if(buf.length < (w*h)/900 + 400)return false;
  }
  /* ══ [v5.4] 흰 빈 그림을 더 촘촘히 걸러낸다 ═══════════════════════════════
     화면 쪽 확인만으로는 늦다. 여기서 막아야 회색 배지로 곧장 넘어간다.
     ① 픽셀 수에 비해 파일이 지나치게 작으면 단색이다
     ② 바이트가 거의 같은 값만 반복돼도 단색이다 */
  if(buf.length>8&&buf[0]===0x89&&buf[1]===0x50){
    const w=(buf[16]<<24)|(buf[17]<<16)|(buf[18]<<8)|buf[19];
    const h2=(buf[20]<<24)|(buf[21]<<16)|(buf[22]<<8)|buf[23];
    if(w>0&&h2>0&&buf.length < (w*h2)/450 + 300)return false;
  }
  const step=Math.max(1,Math.floor(buf.length/512));
  const seen=new Set();
  for(let i=0;i<buf.length;i+=step){ seen.add(buf[i]); if(seen.size>24)return true; }
  return seen.size>12;
}
async function uslogo_default(req2){
  const u=new URL(req2.url);
  const d=String(u.searchParams.get("d")||"").toLowerCase().replace(/[^a-z0-9.-]/g,"").slice(0,64);
  const tk=String(u.searchParams.get("t")||"").toUpperCase().replace(/[^A-Z0-9.-]/g,"").slice(0,10);
  if(tk){                                   /* [v4.80] 티커가 있으면 도메인 후보까지 함께 본다 */
    /* ══ [v4.75] 티커 로고를 서버가 고르고 검사한다 ═════════════════════════
       [왜 서버인가] 브라우저는 다른 출처의 그림을 캔버스로 읽을 수 없어(CORS)
       '흰 빈 그림'인지 확인할 방법이 없었다. 서버는 그 제약이 없다.
       후보를 여러 곳 두드려 보고, 그림이 실제로 내용을 담고 있는지까지 확인한 뒤
       가장 나은 것을 돌려준다. 결과는 KV 에 담아 다음부터는 바로 내보낸다.
       화면 쪽에서도 같은 출처(우리 도메인)라 픽셀 검사가 그대로 통한다. */
    const TK=tk.replace(".","-"), tkl=TK.toLowerCase();
    const CKT="uslgt5:"+TK;
    try{ if(KV){ const c=await KV.get(CKT,"json");
      if(c&&c.b64)return new Response(Uint8Array.from(atob(c.b64),ch=>ch.charCodeAt(0)),
        {headers:{"content-type":c.ct||"image/png","cache-control":"public, max-age=604800","access-control-allow-origin":"*"}});
      if(c&&c.no)return new Response("none",{status:404,headers:{"cache-control":"public, max-age=21600"}});
    }}catch(e){}
    const cands=[
      /* ══ [v4.93] 흐릿한 로고의 정체 ═══════════════════════════════════════
         도메인이 있는 종목은 파비콘(.ico)을 먼저 잡고 있었다. 파비콘은 원래
         16~32px 짜리 아이콘이라 36px 배지에 늘리면 뭉개진다
         (첨부 사진의 TSMC·인텔·마이크론이 그 경우다).
         → 큰 그림을 주는 곳을 앞에 세우고, 파비콘은 정말 아무것도 없을 때만 쓴다.
         같은 이유로 구글 파비콘도 맨 뒤로 보낸다. */
      ...(d?["https://logo.clearbit.com/"+d+"?size=256",
             "https://cdn.brandfetch.io/"+d+"/w/256/h/256",
             "https://unavatar.io/"+d+"?fallback=false",
             "https://"+d+"/apple-touch-icon.png",
             "https://"+d+"/apple-touch-icon-precomposed.png",
             "https://icon.horse/icon/"+d,
             "https://www.google.com/s2/favicons?sz=256&domain="+d]:[]),
      "https://financialmodelingprep.com/image-stock/"+TK+".png",
      "https://assets.parqet.com/logos/symbol/"+TK+"?format=png&size=128",
      "https://s3-symbol-logo.tradingview.com/"+tkl+".svg",
      "https://logos.stockanalysis.com/"+tkl+".png",
      "https://eodhd.com/img/logos/US/"+TK+".png",
      "https://storage.googleapis.com/iexcloud-hl37opg/api/logos/"+TK+".png",
      "https://images.stockanalysis.com/logos/"+tkl+".png",
      /* 마지막 보루 — 작아서 흐릿하지만 없는 것보다는 낫다 */
      ...(d?["https://icons.duckduckgo.com/ip3/"+d+".ico",
             "https://www.google.com/s2/favicons?sz=128&domain="+d]:[])
    ];
    /* ══ [v5.5] 도메인을 아는 종목은 도메인 쪽을 끝까지 먼저 본다 ═══════════
       비자(V)·JP모건(JPM) 같은 대형주가 회색 배지로 나왔다. 티커가 짧으면
       티커 기반 소스가 엉뚱한 그림을 주거나 아예 없는 경우가 많은데,
       그 결과가 먼저 캐시되면 도메인 쪽을 시도할 기회조차 사라진다.
       도메인이 있으면 그 계열을 우선하고, 실패해도 티커 계열로 이어 간다. */
    /* ══ [v9.77] 우버·디즈니 같은 대형주가 로고 없이 나오던 이유 ═══════════════
       후보를 15곳까지 '한 줄로 세워' 하나씩 두드렸다. 앞쪽이 느리거나 죽어 있으면
       뒤쪽에 닿기 전에 워커의 외부호출 한도(50)나 시간에 걸린다. 그런데 실패하면
       "이 종목은 로고 없음(no:1)"을 12시간이나 캐시해 버려서, 한 번 실패한 종목은
       반나절 동안 회색 배지로 굳었다. 유명 회사인데 로고가 없던 건 대개 이것이다.
       [고침] ① 4개씩 묶어 동시에 두드린다 — 느린 후보 하나가 전체를 막지 못한다.
              ② 첫 묶음에 가장 잘 되는 곳들을 배치한다.
              ③ 실패 캐시를 12시간 → 25분으로 줄인다. 잠깐의 장애로 반나절을
                 잃지 않게. 성공 캐시는 그대로 2주다. */
    let best=null;
    const tryOne=async(url)=>{
      try{
        const c=new AbortController(); const t2=setTimeout(()=>c.abort(),3500);
        const r=await fetch(url,{headers:{ "User-Agent": UA20, Accept:"image/*" },signal:c.signal});
        clearTimeout(t2);
        if(!r.ok)return null;
        const ct=r.headers.get("content-type")||"image/png";
        if(ct.indexOf("image")<0&&ct.indexOf("svg")<0)return null;
        const buf=new Uint8Array(await r.arrayBuffer());
        const isIcon=/duckduckgo|s2\/favicons|icon\.horse/.test(url);
        if(!imgLooksReal(buf,ct,isIcon?16:48))return null;
        return {buf,ct};
      }catch(e){ return null; }
    };
    for(let i=0;i<cands.length&&!best;i+=4){
      const group=cands.slice(i,i+4);
      const res=await Promise.all(group.map(tryOne));
      /* 묶음 안에서는 앞선 후보(더 좋은 원천)를 우선한다 */
      for(const r of res){ if(r){ best=r; break; } }
    }
    if(best){
      try{ if(KV&&best.buf.length<80000){
        let bin=""; best.buf.forEach(b=>bin+=String.fromCharCode(b));
        await KV.put(CKT,JSON.stringify({ct:best.ct,b64:btoa(bin)}),{expirationTtl:1209600}); } }catch(e){}
      return new Response(best.buf,{headers:{"content-type":best.ct,"cache-control":"public, max-age=604800","access-control-allow-origin":"*"}});
    }
    /* [v9.77] 실패는 짧게만 기억한다 — 일시적 장애로 반나절을 잃지 않게 */
    try{ if(KV)await KV.put(CKT,JSON.stringify({no:1}),{expirationTtl:1500}); }catch(e){}
    return new Response("none",{status:404,headers:{"cache-control":"public, max-age=1500"}});
  }
  if(!d||d.indexOf(".")<0)return new Response("bad",{status:400});
  const CK="uslg:"+d;
  try{ if(KV){ const c=await KV.get(CK,"json");
    if(c&&c.b64)return new Response(Uint8Array.from(atob(c.b64),ch=>ch.charCodeAt(0)),
      {headers:{"content-type":c.ct||"image/png","cache-control":"public, max-age=604800","access-control-allow-origin":"*"}});
    if(c&&c.no)return new Response("none",{status:404,headers:{"cache-control":"public, max-age=21600"}});
  }}catch(e){}
  const cands=["https://logo.clearbit.com/"+d,
               "https://img.logo.dev/"+d+"?token=pk_X-1ZO13ESamOoEeKeLUTVA&size=128&format=png",
               "https://www.google.com/s2/favicons?sz=128&domain="+d,
               "https://icons.duckduckgo.com/ip3/"+d+".ico",
               "https://"+d+"/favicon.ico"];
  for(const url of cands){
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),4500);
      const r=await fetch(url,{headers:{ "User-Agent": UA20, Accept:"image/*" },signal:c.signal});
      clearTimeout(t);
      if(!r.ok)continue;
      const ct=r.headers.get("content-type")||"image/png";
      if(ct.indexOf("image")<0)continue;
      const buf=new Uint8Array(await r.arrayBuffer());
      if(buf.length<300)continue;                       // 빈 파비콘 방어
      try{ if(KV){ let s=""; for(let i=0;i<buf.length;i++)s+=String.fromCharCode(buf[i]);
        await KV.put(CK,JSON.stringify({b64:btoa(s),ct}),{expirationTtl:7*86400}); }}catch(e){}
      return new Response(buf,{headers:{"content-type":ct,"cache-control":"public, max-age=604800","access-control-allow-origin":"*"}});
    }catch(e){}
  }
  try{ if(KV)await KV.put(CK,JSON.stringify({no:1}),{expirationTtl:21600}); }catch(e){}
  return new Response("none",{status:404,headers:{"cache-control":"public, max-age=21600"}});
}
/* [v4.30] 로고 소스 진단 — 어느 제공자가 이 서버에서 실제로 응답하는지 확인한다.
   샌드박스에서는 외부망이 막혀 검증이 불가능하므로 배포 후 이 경로로 판정한다. */
async function uslogodiag_default(){
  const d="apple.com", out={at:new Date().toISOString(),domain:d,tried:[]};
  const srcs=[["clearbit","https://logo.clearbit.com/"+d],
              ["logo.dev","https://img.logo.dev/"+d+"?token=pk_X-1ZO13ESamOoEeKeLUTVA&size=128&format=png"],
              ["google","https://www.google.com/s2/favicons?sz=128&domain="+d],
              ["duckduckgo","https://icons.duckduckgo.com/ip3/"+d+".ico"],
              ["site-favicon","https://"+d+"/favicon.ico"],
              ["fmp","https://financialmodelingprep.com/image-stock/AAPL.png"]];
  for(const [name,url] of srcs){
    const rec={name,url};
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),6000);
      const r=await fetch(url,{headers:{ "User-Agent": UA20, Accept:"image/*" },signal:c.signal});
      clearTimeout(t);
      rec.status=r.status; rec.type=r.headers.get("content-type")||"";
      const b=new Uint8Array(await r.arrayBuffer()); rec.bytes=b.length;
      rec.ok=r.ok&&rec.type.indexOf("image")>=0&&b.length>=300;
    }catch(e){ rec.err=String(e).slice(0,60); }
    out.tried.push(rec);
  }
  out.usable=out.tried.filter(x=>x.ok).map(x=>x.name);
  return new Response(JSON.stringify(out,null,2),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}
ROUTES["uslogodiag"]=uslogodiag_default;
ROUTES["uslogo"]=uslogo_default;
/* ══ [v4.31] 해외 종목 통합 검색 — 내장 목록을 넘어 미국 전 상장 종목을 찾는다 ══
   네이버 해외주식 검색을 중계한다. 응답 구조가 엔드포인트마다 달라 관대하게 파싱하고,
   미국 상장(로이터코드 접미 .O/.N/.A)만 남긴다. */
function usSearchPick(txt){
  let j=null; try{ j=JSON.parse(txt); }catch(e){ return null; }
  const bags=[];
  const dig=(o,d)=>{ if(!o||d>4)return;
    if(Array.isArray(o)){ if(o.length&&typeof o[0]==="object")bags.push(o); o.forEach(x=>dig(x,d+1)); return; }
    if(typeof o==="object")Object.keys(o).forEach(k=>dig(o[k],d+1)); };
  dig(j,0);
  const out=[], seen=new Set();
  for(const arr of bags)for(const it of arr){
    if(!it||typeof it!=="object")continue;
    const reu=String(it.reutersCode||it.reuterCode||it.itemCode||it.code||it.symbolCode||"").trim();
    const m=/^([A-Za-z0-9.\-]{1,8})\.([ONA])$/.exec(reu);
    if(!m)continue;
    const t=m[1].toUpperCase();
    if(seen.has(t))continue; seen.add(t);
    const kr=String(it.stockNameKor||it.nameKor||it.korName||it.stockName||it.name||"").trim();
    const en=String(it.stockNameEng||it.nameEng||it.engName||it.stockName||"").trim();
    out.push({t,sfx:m[2],reu,kr:kr||t,en:en||t,
      etf:/ETF|ETN|상장지수/i.test(String(it.stockType||it.category||it.typeName||""))?1:0});
    if(out.length>=25)break;
  }
  return out.length?out:null;
}
async function ussearch_default(req2){
  const u=new URL(req2.url), diag=[];
  const q=String(u.searchParams.get("q")||"").trim().slice(0,40);
  if(q.length<1)return new Response(JSON.stringify({ok:false,items:[]}),{headers:{"content-type":"application/json"}});
  const CK="usq:"+q.toLowerCase();
  try{ const c=KV?await KV.get(CK,"json"):null;
    if(c&&c.at&&Date.now()-c.at<6*3600e3)
      return new Response(JSON.stringify({ok:true,items:c.items,cached:1}),
        {headers:{"content-type":"application/json","access-control-allow-origin":"*"}});
  }catch(e){}
  const H={ "User-Agent": UA20, Accept:"application/json", Referer:"https://m.stock.naver.com/", "Accept-Language":"ko" };
  const eq=encodeURIComponent(q);
  let items=null;
  for(const url of [
    "https://m.stock.naver.com/front-api/search/autoComplete?query="+eq+"&target=stock%2Cworldstock",
    "https://m.stock.naver.com/front-api/search/autoComplete?query="+eq+"&target=worldstock",
    "https://api.stock.naver.com/stock/search?query="+eq,
    "https://m.stock.naver.com/api/search/worldstock?query="+eq
  ]){
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),5000);
      const r=await fetch(url,{headers:H,signal:c.signal}); clearTimeout(t);
      if(!r.ok){ diag.push("s:"+r.status); continue; }
      items=usSearchPick(await r.text());
      if(items){ diag.push("hit:"+url.split("?")[0].split("/").pop()); break; }
      diag.push("s:parse");
    }catch(e){ diag.push("s:"+String(e).slice(0,12)); }
  }
  /* ══ [v4.73] 야후 검색을 함께 쓴다 ═══════════════════════════════════════
     [왜] 네이버 자동완성만으로는 갓 상장한 종목이 한동안 안 잡힌다. 스페이스X는
     2026년 6월 나스닥에 SPCX 로 상장했는데 검색해도 나오지 않았다.
     야후 검색은 상장 당일부터 잡히고, 거래소 정보(sfx)와 영문명도 함께 준다.
     네이버 결과를 앞에 두고(한글 종목명이 있어 보기 좋다) 야후로 빈 곳을 메운다. */
  let yh=null;
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),5000);
    const r=await fetch("https://query1.finance.yahoo.com/v1/finance/search?q="+eq
      +"&quotesCount=12&newsCount=0&enableFuzzyQuery=true",
      {headers:{ "User-Agent": UA20, Accept:"application/json" },signal:c.signal});
    clearTimeout(t);
    if(r.ok){
      const j=await r.json();
      const rows=(j&&j.quotes)||[];
      yh=[];
      for(const x of rows){
        const t2=String(x.symbol||"").toUpperCase();
        if(!/^[A-Z][A-Z0-9]{0,5}(-[A-Z])?$/.test(t2))continue;
        const ex=String(x.exchDisp||x.exchange||"").toUpperCase();
        const qt=String(x.quoteType||"").toUpperCase();
        if(qt&&qt!=="EQUITY"&&qt!=="ETF")continue;
        const sfx=usExchSfx(ex)||(/NAS|NMS|NCM|NGM/.test(ex)?"O":/NYQ|NYS/.test(ex)?"N":/ASE|PCX|AMX/.test(ex)?"A":null);
        if(!sfx)continue;
        yh.push({t:t2,sfx,kr:"",en:String(x.shortname||x.longname||"").trim(),etf:qt==="ETF"?1:0});
      }
      diag.push("yh-search:"+yh.length);
    } else diag.push("yh-search:"+r.status);
  }catch(e){ diag.push("yh-search:"+String(e).slice(0,10)); }
  /* 두 결과를 합친다 — 같은 티커는 네이버 쪽(한글명)을 남긴다 */
  const merged=[]; const seenT=new Set();
  for(const it of (items||[])){ const k=String(it.t||"").toUpperCase(); if(!k||seenT.has(k))continue; seenT.add(k); merged.push(it); }
  for(const it of (yh||[])){ if(seenT.has(it.t))continue; seenT.add(it.t); merged.push(it); }
  items=merged.length?merged:null;
  if(items){ try{ if(KV)await KV.put(CK,JSON.stringify({at:Date.now(),items}),{expirationTtl:21600}); }catch(e){} }
  return new Response(JSON.stringify({ok:!!items,items:items||[],diag}),
    {headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});
}
async function ussearchdiag_default(){
  const out={at:new Date().toISOString(),query:"apple",tried:[]};
  const H={ "User-Agent": UA20, Accept:"application/json", Referer:"https://m.stock.naver.com/", "Accept-Language":"ko" };
  for(const url of [
    "https://m.stock.naver.com/front-api/search/autoComplete?query=apple&target=stock%2Cworldstock",
    "https://m.stock.naver.com/front-api/search/autoComplete?query=apple&target=worldstock",
    "https://api.stock.naver.com/stock/search?query=apple",
    "https://m.stock.naver.com/api/search/worldstock?query=apple"
  ]){
    const rec={url};
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),6000);
      const r=await fetch(url,{headers:H,signal:c.signal}); clearTimeout(t);
      rec.status=r.status;
      const txt=await r.text(); rec.len=txt.length; rec.sample=txt.slice(0,300).replace(/\s+/g," ");
      const p=usSearchPick(txt); rec.parsed=p?p.length:0; rec.first=p?p[0]:null;
    }catch(e){ rec.err=String(e).slice(0,60); }
    out.tried.push(rec);
  }
  return new Response(JSON.stringify(out,null,2),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}
ROUTES["ussearch"]=ussearch_default;
ROUTES["ussearchdiag"]=ussearchdiag_default;
ROUTES["usfxdiag"]=usfxdiag_default;
ROUTES["usquote"]=usquote_default;
ROUTES["uscandle"]=uscandle_default;
/* ══ [v4.58] 해외 '조회수 TOP 100' ═══════════════════════════════════════════
   [무엇이 문제였나] 지금까지 해외 '조회수' 탭은 조회수가 아니라 거래대금(가격×거래량)
   순서였다. 상단에 그렇게 적어 두긴 했지만, 탭 이름이 조회수인데 다른 걸 보여 주는 건
   결국 거짓말이다. 게다가 50위까지만 나왔고, 유니버스가 113종이라 '113개 중 50등'을
   매기는 셈이라 순위로서 의미도 약했다.
   [어떻게 진짜 조회수를 만드나] 미국 주식은 '몇 명이 봤는지'를 공개하는 곳이 없다.
   그래서 밖에서 구해 오는 대신, 이 앱이 직접 센다.
     · 사용자가 해외 종목 화면을 열 때마다 /api/usview 로 1 을 올린다
     · 서버는 그 수를 KV 에 모아 두고, 최근 7일 가중치를 얹어 순위를 만든다
   이게 이 앱에서 말할 수 있는 유일하게 정직한 '조회수'다.
   [초반에 데이터가 없을 때] 아무도 안 본 상태에서는 순위가 비므로,
   바깥의 관심도 신호(네이버 해외 인기·Stocktwits 트렌딩·나스닥 활발종목)를 섞어
   자리를 채우고, 무엇을 근거로 매겼는지 화면에 그대로 밝힌다.
   조회가 쌓일수록 자체 집계 비중이 자연히 커진다. */
var USVIEW_MEM = /* @__PURE__ */ new Map();   // 아이솔레이트 안 임시 누적
var _usvFlush = 0;
function usvKey(){                              // 주 단위 버킷 — 오래된 인기가 영원히 남지 않게
  const d = new Date(Date.now() + 9 * 3600e3);
  const y = d.getUTCFullYear();
  const w = Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / 6048e5);
  return "usvw:" + y + "w" + w;
}
async function usvFlush(force){
  if (!KV || !USVIEW_MEM.size) return;
  if (!force && Date.now() - _usvFlush < 45e3) return;   // KV 쓰기 한도 보호
  _usvFlush = Date.now();
  const k = usvKey();
  try {
    const cur = (await KV.get(k, "json")) || {};
    for (const [t, n] of USVIEW_MEM) cur[t] = (cur[t] || 0) + n;
    USVIEW_MEM.clear();
    await KV.put(k, JSON.stringify(cur), { expirationTtl: 60 * 24 * 3600 });
  } catch (e) { }
}
async function usview_default(req2){
  const u = new URL(req2.url);
  const t = String(u.searchParams.get("t") || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  if (t) USVIEW_MEM.set(t, (USVIEW_MEM.get(t) || 0) + 1);
  await usvFlush(false);
  return new Response(JSON.stringify({ ok: !!t }), {
    headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
/* 최근 2주치 조회를 합산 — 이번 주에 가중치를 더 준다 */
async function usvTop(){
  if (!KV) return { map: {}, total: 0 };
  const d = new Date(Date.now() + 9 * 3600e3);
  const y = d.getUTCFullYear();
  const w = Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / 6048e5);
  const keys = ["usvw:" + y + "w" + w, "usvw:" + y + "w" + (w - 1)];
  const out = {}; let total = 0;
  for (let i = 0; i < keys.length; i++) {
    try {
      const v = await KV.get(keys[i], "json"); if (!v) continue;
      const wgt = i === 0 ? 1 : 0.45;
      for (const t in v) { const n = (+v[t] || 0) * wgt; if (n > 0) { out[t] = (out[t] || 0) + n; total += n; } }
    } catch (e) { }
  }
  for (const [t, n] of USVIEW_MEM) { out[t] = (out[t] || 0) + n; total += n; }
  return { map: out, total };
}
/* ══ [v4.68] 조회수 원천을 다시 잡는다 ═══════════════════════════════════════
   [지적이 옳다] 위키백과 문서 조회수는 '그 회사 문서를 본 횟수'이지 '그 종목을
   찾아본 횟수'가 아니다. 증권 앱이 보여 주는 조회수와는 다른 숫자다.
   [그래서 이렇게 바꾼다] 실제로 '종목을 찾아본 기록'을 주는 곳을 앞에 세운다.
     1) 네이버 해외증시 인기 종목 — 한국 사용자가 실제로 많이 본 미국 종목.
        API 경로는 계속 바뀌므로 화면 HTML 에 심긴 초기 데이터에서 직접 긁는다.
        (m.stock.naver.com 은 이 앱에서 응답이 확인된 유일한 네이버 호스트다)
     2) 야후 파이낸스 trending — 야후에서 가장 많이 '검색된' 종목
     3) Stocktwits trending — 관심 종목에 담은 사람이 급증한 종목
     4) 야후 most_actives 화면 — 한 번의 호출로 100종을 받아 남는 자리를 채운다
   위키백과는 주 원천에서 내리고, 순위를 다듬는 보조 신호로만 남긴다.
   [속도] 네 곳 모두 한 번씩만 부르므로 한 번의 요청으로 100위가 완성된다. */
var WIKI_UA = "LIVEjeungkwon/4.68 (educational paper-trading app; contact via github.com/jinnytcrew)";
/* 티커 → 거래소 접미(O 나스닥 / N 뉴욕 / A 아멕스) — 야후·Stocktwits 는 거래소를 안 준다 */
var US_NYSE = ("JPM BAC WFC GS MS C BLK SCHW AXP V MA BRK.B WMT TGT HD LOW NKE MCD KO PG CL UL "
  + "JNJ PFE MRK ABBV LLY BMY UNH CVS XOM CVX COP SLB BA LMT RTX NOC GD GE CAT DE HON MMM UPS FDX F GM "
  + "DIS T VZ NEE DUK SO LIN NIO LI XPEV BABA JD PDD SONY TM HMC NVO ASML TSM ACN ORCL IBM PM MO "
  + "SPGI CB MCO ICE CME AON MMC TRV ALL PGR AIG MET PRU BK STT "
  + "O SPG PLD AMT CCI EQIX PSA DLR VICI WELL ABT TMO DHR SYK BDX BSX MDT ZTS ELV CI HUM CNC "
  + "RIVN LCID VST CEG D AEP EXC XEL ED WEC PEG SRE PCG NRG IONQ "
  + "SHOP SQ SPOT UBER LYFT ABNB DASH RBLX HOOD COIN PLTR NET TWLO DOCU "
  + "GME AMC BB KSS M JWN GPS ANF AEO URBN PLUG SOFI MP UUUU CRML REPL CRVS").split(/\s+/);
var US_AMEX = "SMR OKLO LEU NXE DNN UEC SPCE".split(/\s+/);
var US_EXCH = (function(){ const m={};
  US_NYSE.forEach(t=>{ if(t)m[t]="N"; });
  US_AMEX.forEach(t=>{ if(t)m[t]="A"; });
  return m; })();
/* 위키 인기문서에서 종목을 알아보기 위한 문서명 표 — 순위를 다듬는 보조 신호에만 쓴다 */
var WIKI_ART = {
  AAPL:"Apple_Inc.", MSFT:"Microsoft", NVDA:"Nvidia", GOOGL:"Alphabet_Inc.", AMZN:"Amazon_(company)",
  META:"Meta_Platforms", TSLA:"Tesla,_Inc.", AVGO:"Broadcom", AMD:"Advanced_Micro_Devices",
  INTC:"Intel", MU:"Micron_Technology", QCOM:"Qualcomm", ARM:"Arm_Holdings", TSM:"TSMC",
  ASML:"ASML_Holding", SMCI:"Supermicro", IBM:"IBM", ORCL:"Oracle_Corporation", CRM:"Salesforce",
  ADBE:"Adobe_Inc.", PLTR:"Palantir_Technologies", NFLX:"Netflix", DIS:"The_Walt_Disney_Company",
  UBER:"Uber", ABNB:"Airbnb", SHOP:"Shopify", PYPL:"PayPal", COIN:"Coinbase", HOOD:"Robinhood_Markets",
  V:"Visa_Inc.", MA:"Mastercard", JPM:"JPMorgan_Chase", BAC:"Bank_of_America", GS:"Goldman_Sachs",
  WMT:"Walmart", COST:"Costco", NKE:"Nike,_Inc.", SBUX:"Starbucks", MCD:"McDonald's",
  KO:"Coca-Cola", PEP:"PepsiCo", JNJ:"Johnson_&_Johnson", PFE:"Pfizer", LLY:"Eli_Lilly_and_Company",
  UNH:"UnitedHealth_Group", XOM:"ExxonMobil", CVX:"Chevron_Corporation", BA:"Boeing",
  LMT:"Lockheed_Martin", RTX:"RTX_Corporation", GE:"General_Electric", CAT:"Caterpillar_Inc.",
  F:"Ford_Motor_Company", GM:"General_Motors", RIVN:"Rivian", LCID:"Lucid_Motors", NIO:"Nio_Inc.",
  BABA:"Alibaba_Group", T:"AT&T", VZ:"Verizon", CSCO:"Cisco", SPOT:"Spotify", RBLX:"Roblox_Corporation",
  SONY:"Sony", TM:"Toyota", GME:"GameStop", AMC:"AMC_Theatres", MSTR:"Strategy_(company)",
  IONQ:"IonQ", RGTI:"Rigetti_Computing", QBTS:"D-Wave_Quantum", SOFI:"SoFi", DKNG:"DraftKings",
  MP:"MP_Materials", UUUU:"Energy_Fuels", OKLO:"Oklo_Inc.", SMR:"NuScale_Power", VST:"Vistra_Corp",
  CEG:"Constellation_Energy", GEV:"GE_Vernova", VRT:"Vertiv", ANET:"Arista_Networks",
  CRWD:"CrowdStrike", PANW:"Palo_Alto_Networks", NOW:"ServiceNow", INTU:"Intuit", ACN:"Accenture"
};
function usGuessSfx(t){
  const k=String(t||"").toUpperCase();
  /* 표에 없으면 나스닥으로 본다 — 틀려도 CNBC·Cboe 는 티커만으로 시세를 주므로 화면이 비지 않는다 */
  return (typeof US_EXCH!=="undefined"&&US_EXCH[k])||"O";
}
function wikiDate(back){
  const d = new Date(Date.now() - back * 864e5);
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, "0"), dd = String(d.getUTCDate()).padStart(2, "0");
  return { y, m, d: dd, s: "" + y + m + dd };
}
async function wikiGet(url, ms){
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 5000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": WIKI_UA, Accept: "application/json" }, signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return { err: "HTTP" + r.status };
    return { j: await r.json() };
  } catch (e) { clearTimeout(t); return { err: String(e).slice(0, 14) }; }
}
/* 위키 인기문서(일간·월간) — 순위를 다듬는 보조 신호. 종목별 개별 조회는 하지 않는다. */
async function wikiTopViews(diag, budget){
  const out = {}, art2t = {};
  for (const k in WIKI_ART) { const a = WIKI_ART[k]; if (!art2t[a]) art2t[a] = k; }
  const d = wikiDate(2), dm = wikiDate(35);
  const urls = [
    ["day", `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${d.y}/${d.m}/${d.d}`],
    ["mon", `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${dm.y}/${dm.m}/all-days`]
  ];
  const rs = await Promise.all(urls.map(async ([nm, u]) => {
    if (budget && budget.left <= 0) return null;
    if (budget) budget.left--;
    const { j, err } = await wikiGet(u, 6000);
    if (err) { diag.push("wiki-" + nm + ":" + err); return null; }
    return { nm, arr: (j && j.items && j.items[0] && j.items[0].articles) || [] };
  }));
  for (const r of rs) {
    if (!r) continue;
    let n = 0;
    for (const a of r.arr) {
      const t = art2t[a.article];
      const v = r.nm === "mon" ? Math.round((+a.views || 0) / 30) : (+a.views || 0);
      if (t && !(out[t] > 0) && v > 0) { out[t] = v; n++; }
    }
    diag.push("wiki-" + r.nm + ":" + n);
  }
  return out;
}
/* 야후에서 가장 많이 검색된 종목 */
async function yahooTrending(diag, budget){
  if (budget && budget.left <= 1) return null;
  if (budget) budget.left--;
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 4500);
    const r = await fetch("https://query1.finance.yahoo.com/v1/finance/trending/US?count=40",
      { headers: { "User-Agent": UA20, Accept: "application/json" }, signal: c.signal });
    clearTimeout(t);
    if (!r.ok) { diag.push("yh-trend:" + r.status); return null; }
    const j = await r.json();
    const q = (j && j.finance && j.finance.result && j.finance.result[0] && j.finance.result[0].quotes) || [];
    const arr = q.map(x => String(x.symbol || "").toUpperCase()).filter(x => /^[A-Z][A-Z0-9]{0,5}$/.test(x));
    diag.push("yh-trend:" + arr.length);
    return arr.length ? arr : null;
  } catch (e) { diag.push("yh-trend:" + String(e).slice(0, 10)); return null; }
}
function usExchSfx(ex){
  const e=String(ex||"").toUpperCase();
  if(e.includes("NASDAQ"))return "O";
  if(e.includes("NYSEARCA")||e.includes("AMEX")||e.includes("NYSE AMERICAN"))return "A";
  if(e.includes("NYSE"))return "N";
  return null;
}
/* 네이버 해외증시 인기 종목 — 화면에 심긴 초기 데이터에서 로이터코드를 순서대로 긁는다 */
/* ══ [v4.70] '인기 순위'인지 확인하고 쓴다 ═══════════════════════════════════
   [지난 잘못] 네이버 화면 HTML 에서 종목 코드를 나오는 순서대로 전부 긁어
   그걸 인기 순위로 썼다. 그 페이지에는 인기 목록 말고도 여러 목록이 섞여 있어,
   결과는 '아무 순서의 미국 종목 100개'였다. 거기에 최고 가중치를 줬으니
   록히드마틴이 1위로 올라온 것이다. 데이터가 온다고 맞는 데이터가 아니다.
   [이번 방식]
     ① 페이지에 심긴 JSON(__NEXT_DATA__)을 실제로 파싱한다
     ② 키 이름에 popular·rank·top·hot·interest 가 들어간 '목록'만 고른다
     ③ 그래도 맞는지 검산한다 — 한국인이 많이 보는 미국 종목(엔비디아·테슬라·
        애플·팔란티어…)이 상위 20 안에 셋 이상 없으면 인기 순위가 아니라고 보고 버린다
   검산을 통과하지 못하면 아예 쓰지 않는다. 틀린 순위를 1위로 올리는 것보다 낫다. */
var KR_FAV = ["NVDA","TSLA","AAPL","PLTR","MU","AVGO","AMD","GOOGL","GOOG","AMZN","META","TSM",
  "SOXL","TQQQ","QLD","SCHD","QQQ","SPY","INTC","IONQ","MSFT","COIN","MSTR","SMCI","ARM","RGTI"];
/* ══ [v4.72] 한국 투자자 관심 유니버스 ═══════════════════════════════════════
   [왜 필요한가] 야후·Stocktwits 는 미국 개인투자자 기준이라, 그대로 쓰면 한국
   증권 앱에서 보는 목록과 딴판이 된다(록히드마틴·노키아 같은 이름이 올라온다).
   한국 투자자가 실제로 많이 보고 담는 종목을 유니버스로 두고, 실시간 관심 신호로
   그 안에서 순서를 매긴다. 신호가 막힌 날에도 '그럴듯한 이름들'이 남는다.
   순서는 서학개미 보유·거래 상위에서 흔히 보이는 차례를 기본값으로 깔아 둔다. */
var KR_UNIV = ("NVDA TSLA AAPL PLTR MU AVGO GOOGL AMZN META MSFT TSM AMD IONQ SMCI ARM INTC "
  + "SOXL TQQQ QLD SCHD QQQ SPY SOXX SPXL UPRO TSLL NVDL CONL BITX "
  + "COIN MSTR HOOD SOFI RGTI QBTS SPCX RKLB ASTS ACHR JOBY LUNR OKLO SMR LEU "
  + "NFLX DIS UBER ABNB SHOP SQ PYPL CRWD PANW SNOW NET DDOG MDB ZS OKTA "
  + "LLY UNH JNJ PFE MRNA NVO ABBV MRK BMY REGN VRTX "
  + "JPM BAC V MA GS MS BRK-B BLK SCHW AXP C WFC "
  + "XOM CVX COP OXY SLB BA LMT RTX GE CAT DE HON UPS "
  + "KO PEP PG WMT COST TGT HD MCD SBUX NKE LULU CMG "
  + "BABA JD PDD NIO LI XPEV BIDU SONY TM ASML NVS AZN SHEL "
  + "F GM RIVN LCID VST CEG NEE DUK GEV ETN PWR "
  + "T VZ TMUS CSCO ORCL CRM ADBE NOW INTU IBM QCOM TXN ADI LRCX AMAT KLAC MRVL "
  + "APP RBLX SPOT DASH ROKU WBD PARA GME AMC BB CHWY DKNG").split(/\s+/).filter(Boolean);
var KR_RANK = (function(){ const m={}; KR_UNIV.forEach((t,i)=>{ if(m[t]==null)m[t]=i; }); return m; })();
function looksLikePopular(arr){
  if(!arr||arr.length<8)return false;
  const head=arr.slice(0,20).map(x=>String(x.t||"").toUpperCase());
  let hit=0; for(const t of head)if(KR_FAV.includes(t))hit++;
  return hit>=3;
}
/* ══ [v4.71] 키 이름에 기대지 않는다 ═══════════════════════════════════════
   앞 버전은 키 이름에 popular·rank 가 들어간 배열만 찾았다. 그런데 실제 페이지는
   키 이름이 그렇지 않았고(진단: 200인데 목록 0건), 결국 아무것도 못 찾았다.
   → JSON 안의 '종목 배열'을 전부 모아 놓고, 이름이 아니라 '내용'으로 고른다.
     검산(looksLikePopular)이 통과시키는 것만 쓰므로 엉뚱한 목록은 알아서 걸러진다. */
function collectStockArrays(node,depth,out){
  if(!node||depth>9||typeof node!=="object")return out;
  if(Array.isArray(node)){
    const rows=[];
    for(const it of node){
      if(!it||typeof it!=="object")continue;
      const reu=String(it.reutersCode||it.symbolCode||it.code||"").toUpperCase();
      const m=reu.match(/^([A-Z0-9.\-]{1,10})\.([ONA])$/);
      if(!m)continue;
      rows.push({t:m[1],sfx:m[2],
        kr:String(it.stockNameKor||it.stockName||it.nameKor||"").trim(),
        en:String(it.stockNameEng||it.nameEng||"").trim()});
    }
    if(rows.length>=8)out.push(rows);
    for(const it of node)collectStockArrays(it,depth+1,out);
    return out;
  }
  for(const k of Object.keys(node))collectStockArrays(node[k],depth+1,out);
  return out;
}
function findPopularArray(root){
  const arrs=collectStockArrays(root,0,[]);
  /* 키 이름 대신 '한국인이 많이 보는 종목이 앞에 몰려 있는가'로 고른다 */
  let best=null,bestHit=0;
  for(const a of arrs){
    const head=a.slice(0,20).map(x=>x.t.toUpperCase());
    let hit=0; head.forEach(t=>{ if(KR_FAV.includes(t))hit++; });
    if(hit>bestHit){ bestHit=hit; best=a; }
  }
  return best;
}
async function naverWorldPopular(diag,budget){
  const urls=[
    "https://m.stock.naver.com/worldstock",
    "https://m.stock.naver.com/worldstock/home/USA/index",
    "https://m.stock.naver.com/worldstock/home/TOTAL/index",
    "https://m.stock.naver.com/api/stocks/interestTop/worldStock",
    "https://m.stock.naver.com/front-api/v1/worldStock/popular",
    "https://finance.naver.com/world/"
  ];
  for(const u of urls){
    if(budget&&budget.left<=1)break;
    if(budget)budget.left--;
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),6000);
      const r=await fetch(u,{headers:{ "User-Agent":UA25, Accept:"text/html,application/json",
        "Accept-Language":"ko-KR,ko;q=0.9", Referer:"https://m.stock.naver.com/" },signal:c.signal});
      clearTimeout(t);
      if(!r.ok){ diag.push("nv-pop:"+r.status); continue; }
      const txt=await r.text();
      let arr=null;
      /* HTML 이면 심긴 JSON 을 꺼내고, JSON 이면 그대로 쓴다 */
      const cands=[];
      const mNext=txt.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if(mNext){ try{ cands.push(JSON.parse(mNext[1])); }catch(e){} }
      try{ cands.push(JSON.parse(txt)); }catch(e){}
      /* 자바스크립트 안에 조각조각 심긴 JSON 도 훑는다 */
      const blobs=txt.match(/\{"[\s\S]{200,200000}?\}(?=[;,<\)])/g)||[];
      for(const b of blobs.slice(0,12)){ try{ cands.push(JSON.parse(b)); }catch(e){} }
      for(const j of cands){ arr=findPopularArray(j); if(arr)break; }
      if(!arr){ diag.push("nv-pop:no-list"); continue; }
      if(!looksLikePopular(arr)){ diag.push("nv-pop:not-rank"+arr.length); continue; }
      diag.push("nv-pop:"+arr.length);
      return arr.slice(0,60);
    }catch(e){ diag.push("nv-pop:"+String(e).slice(0,10)); }
  }
  return null;
}
/* 야후 화면(스크리너) — 한 번에 100종. 이름·거래소·시가총액까지 함께 준다 */
async function yahooScreen(scrId,count,diag,budget){
  if(budget&&budget.left<=1)return null;
  if(budget)budget.left--;
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),6000);
    const r=await fetch("https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved"
      +"?scrIds="+encodeURIComponent(scrId)+"&count="+count+"&start=0",
      {headers:{ "User-Agent":UA20, Accept:"application/json" },signal:c.signal});
    clearTimeout(t);
    if(!r.ok){ diag.push(scrId+":"+r.status); return null; }
    const j=await r.json();
    const q=(j&&j.finance&&j.finance.result&&j.finance.result[0]&&j.finance.result[0].quotes)||[];
    const out=[];
    for(const x of q){
      const t2=String(x.symbol||"").toUpperCase();
      if(!/^[A-Z][A-Z0-9]{0,5}([.\-][A-Z])?$/.test(t2))continue;   // 숫자·클래스주(BRK.B) 허용
      /* [v4.89] 이름이 티커와 똑같이 오는 응답이 있다(NASA·USO·BE…).
         그대로 두면 화면에 'USO · USO' 처럼 티커가 두 번 찍힌다.
         긴 이름(longName)을 우선 쓰고, 그것도 티커와 같으면 이름을 비워 보낸다
         — 화면 쪽 한글 표에서 채우도록 넘긴다. */
      const nm0=String(x.longName||x.shortName||"").trim();
      const en0=(nm0&&nm0.toUpperCase()!==t2)?nm0:"";
      /* ══ [v9.94] 응답에 있는 거래량·가격을 버리지 않는다 ═══════════════════
         실제 응답으로 확인한 필드다.
           regularMarketVolume: 156272681 · regularMarketPrice: 15.23
           regularMarketChangePercent: 9.33
         이 둘만 있으면 거래대금(가격×거래량)이 나온다. 지금까지 marketCap 만
         뽑고 나머지를 버려서, 거래대금 순위를 만들 수 없다고 잘못 판단했다.
         추가 호출은 0회 — 이미 받아 온 응답을 더 읽는 것뿐이다. */
      const _px=+x.regularMarketPrice||0, _vol=+x.regularMarketVolume||0;
      out.push({t:t2.replace(/\./g,"-"),sfx:usExchSfx(x.fullExchangeName||x.exchange),
        kr:"",en:en0,cap:+x.marketCap||0,
        px:_px, vol:_vol, val:Math.round(_px*_vol),
        rate:(x.regularMarketChangePercent!=null)?+(+x.regularMarketChangePercent).toFixed(2):null});
    }
    diag.push(scrId+":"+out.length);
    return out.length?out:null;
  }catch(e){ diag.push(scrId+":"+String(e).slice(0,10)); return null; }
}
async function usPopExternal(diag, budget){
  const lists = [];
  const push=(name,arr)=>{ if(arr&&arr.length)lists.push({name,arr}); };
  push("naver-pop", await naverWorldPopular(diag,budget));
  /* 야후에서 가장 많이 검색된 종목 */
  const yh=await yahooTrending(diag,budget);
  if(yh&&yh.length)push("yahoo-trend", yh.map(t=>({t,sfx:null,kr:"",en:""})));
  /* Stocktwits — 관심 급증 */
  if(budget&&budget.left>1){
    if(budget)budget.left--;
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),4500);
      const r=await fetch("https://api.stocktwits.com/api/2/trending/symbols.json?limit=30",
        {headers:{ "User-Agent":UA20, Accept:"application/json" },signal:c.signal});
      clearTimeout(t);
      if(r.ok){ const j=JSON.parse(await r.text());
        const arr=(j.symbols||[]).filter(x=>x&&/^[A-Z][A-Z0-9]{0,5}$/.test(String(x.symbol||"").toUpperCase()))
          .map(x=>({t:x.symbol,sfx:null,kr:"",en:String(x.title||"").trim()}));
        push("stocktwits",arr); diag.push("stocktwits:"+arr.length);
      } else diag.push("stocktwits:"+r.status);
    }catch(e){ diag.push("stocktwits:"+String(e).slice(0,10)); }
  }
  /* 남는 자리는 '거래가 가장 활발한 종목' 100종으로 채운다 — 한 번의 호출로 충분하다 */
  /* [v9.95] 200종을 채우려면 원천도 200종을 받아야 한다 — 호출 수는 그대로 1회 */
  push("yahoo-active", await yahooScreen("most_actives",250,diag,budget));
  return lists;
}
/* 미국 정규장이 열려 있는 시간대인가 — 순위를 얼마나 오래 붙잡을지 정하는 데 쓴다.
   (미국 동부 기준 평일 09:30~16:00. 휴일까지 정확히 볼 필요는 없다) */
function usMarketOpenish(){
  const d = new Date(Date.now() - 5 * 3600e3);   // 대략 미국 동부
  const wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= 9 * 60 + 30 && mins <= 16 * 60;
}
async function uspopular_default(req2){
  const diag = [], budget = { left: 20 };
  const CK = "uspop:v3";
  const fresh = new URL(req2.url).searchParams.get("fresh") === "1";
  if (!fresh) {
    try {
      const c = KV ? await KV.get(CK, "json") : null;
      /* ══ [v4.79] 장이 닫혀 있으면 순위가 흔들릴 이유가 없다 ═══════════════════
         주말·휴장에도 볼 때마다 순서가 달라졌다. 원인은 ① 10분마다 새로 만들고
         ② 그 재료(야후 검색 급상승 등)가 시시각각 바뀌기 때문이다.
         장중에는 10분, 장이 닫혀 있으면 6시간 동안 같은 순위를 유지한다. */
      /* ══ [v9.93] 장이 닫혔는데 순위가 계속 바뀌던 이유 ═══════════════════════
         이 순위는 '거래량 순위'가 아니라 관심도 순위다. 재료가
           naver-pop(네이버 인기검색) · yahoo-trend(야후 트렌딩)
           stocktwits(게시글 수) · wiki(위키 조회수) · app(앱 내 조회)
         인데, 이것들은 거래소와 무관하게 24시간 움직인다. 주말에도 사람들은
         검색하고 글을 쓰기 때문이다. 그래서 장이 닫힌 밤·주말·공휴일에도
         6시간마다 순서가 뒤바뀌었고, 사용자에게는 '시세가 움직이는 것처럼' 보였다.
         [고침] 장이 닫혀 있으면 마지막 개장 시간대에 만든 순위를 그대로 고정한다.
         캐시를 하루로 늘리고, 응답에 '언제 기준인지'를 실어 화면에 밝힌다. */
      const TTL = usMarketOpenish() ? 10 * 60e3 : 26 * 3600e3;
      if (c && c.at && Date.now() - c.at < TTL && Array.isArray(c.items) && c.items.length >= 60) {
        /* [v9.94] 캐시에서 내보낼 때도 거래대금 순위를 함께 — 빠뜨리면 캐시가
           살아 있는 동안 거래대금 탭이 비어 보인다 */
        return new Response(JSON.stringify({ ok: true, items: c.items, byVal: c.byVal || [], basis: c.basis, cached: 1 }),
          { headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" } });
      }
    } catch (e) { }
  }
  const score = new Map();
  const bump = (t, sfx, add, origin, kr, en, cap) => {
    if (!t) return;
    const cur = score.get(t);
    if (cur) { cur.sc += add; if (cur.origin.indexOf(origin) < 0) cur.origin.push(origin);
      if (!cur.sfx && sfx) cur.sfx = sfx; if (!cur.kr && kr) cur.kr = kr; if (!cur.en && en) cur.en = en;
      if (!cur.cap && cap) cur.cap = cap; }
    else score.set(t, { t, sfx: sfx || null, kr: kr || "", en: en || "", cap: cap || 0, sc: add, origin: [origin] });
  };
  /* ══ [v4.70] 계층으로 나눈다 — 점수 합산은 순서를 뒤집는다 ═══════════════
     가중치만으로는 '거래 활발 100종'이 합계에서 상위를 먹는 일을 못 막는다.
     원천을 계층으로 갈라 앞 계층이 무조건 위에 오게 한다.
       1층: 실제 관심 신호(네이버 인기 · 야후 검색 · 커뮤니티 · 앱 조회)
       2층: 거래 활발 — 1층으로 못 채운 뒷자리만 메운다
     같은 층 안에서만 점수로 겨룬다. */
  /* ══ [v4.69] 상위권은 '실제로 많이 본 종목'만 ═══════════════════════════════
     거래 활발(yahoo-active)은 거래대금 순서라 조회수와 다르다. 그런데 100종이나
     되다 보니 점수 총합에서 상위를 차지해 버렸다 — 화면에 록히드마틴·맥도날드가
     1·2위로 뜬 이유다. 조회 신호가 있는 종목을 무조건 위에 두고, 거래 활발은
     뒷자리를 채우는 데만 쓴다(점수 폭을 크게 낮춘다). */
  const W = { "naver-pop": 100000, "yahoo-trend": 40000, "stocktwits": 12000, "yahoo-active": 60 };
  const lists = await usPopExternal(diag, budget);
  lists.forEach(({ name, arr }) => {
    const n = arr.length || 1, w = W[name] || 200;
    arr.forEach((it, i) => bump(it.t, it.sfx, w * (1 - i / n), name, it.kr, it.en, it.cap));
  });
  /* 이 앱에서 실제로 열어 본 횟수 — 있으면 얹는다 */
  const vt = await usvTop();
  const vEntries = Object.entries(vt.map).sort((a, b) => b[1] - a[1]);
  const vMax = vEntries.length ? vEntries[0][1] : 0;
  vEntries.slice(0, 120).forEach(([t, n]) => bump(t, null, 20000 * (n / (vMax || 1)), "app"));
  /* 위키 문서 조회수는 '보조'로만 — 같은 순위대에서 더 많이 회자되는 쪽을 위로 올린다.
     인기문서 목록 2회만 보고, 종목별 개별 조회는 하지 않는다(느리고 조회수도 아니다). */
  let wikiV = {};
  try { wikiV = await wikiTopViews(diag, budget); } catch (e) { }
  const wEnt = Object.entries(wikiV).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  wEnt.forEach(([t], i) => { if (score.has(t)) bump(t, null, 400 * (1 - i / wEnt.length), "wiki"); });
  /* 쓰레기 티커 거르기 — 이름이 티커와 같고 어떤 관심 신호에도 안 걸린 것은 뺀다 */
  const ATTN = new Set(["naver-pop","yahoo-trend","stocktwits","app","wiki"]);
  const all = [...score.values()].filter(x => {
    if (!/^[A-Z][A-Z0-9]{0,5}(-[A-Z])?$/.test(x.t)) return false;
    if (/^(TEST|ZZZ|ZXYZ|ZVZZ|ZWZZ|ZBZX|ZJZZ|NTEST|NONE)/.test(x.t)) return false;
    return true;
  });
  /* ══ [v4.72] 한국 투자자가 보는 화면에 맞춘다 ═══════════════════════════════
     같은 '관심 신호'라도 한국에서 많이 보는 종목을 앞에 세운다.
       1층 : 관심 신호가 있고 + 한국 유니버스에 있는 종목  (순위의 얼굴)
       2층 : 관심 신호는 있으나 한국에서는 덜 보는 종목
       3층 : 한국 유니버스에 있으나 오늘 신호가 안 잡힌 종목 (기본 차례로 채움)
       4층 : 거래 활발 등 나머지
     이렇게 하면 신호가 막힌 날에도 록히드마틴이 1위로 올라오지 않는다. */
  /* [v4.76] 배수 표기를 국내식(2X·3X)으로 맞추고, 이름이 비면 위키 문서명에서 만든다.
     이름 없이 티커만 내려보내면 화면에 티커가 두 번 찍힌다. */
  const fixX = (v) => String(v || "").replace(/\b(\d)\s*(?:x|X|배)\b/g, "$1X");
  const artName = (t) => {
    const a = WIKI_ART[t]; if (!a) return "";
    return decodeURIComponent(a).replace(/_/g, " ")
      .replace(/\s*\((company|game engine)\)$/i, "").trim();
  };
  const inKR = (t) => KR_RANK[t] != null;
  const attnOf = (x) => x.origin.some(o => ATTN.has(o));
  /* 점수가 같으면 티커 순으로 — 안 그러면 매번 순서가 뒤바뀐다 */
  const byScore = (a, b) => (b.sc - a.sc) || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0);
  const t1 = all.filter(x => attnOf(x) && inKR(x.t)).sort(byScore);
  const t2 = all.filter(x => attnOf(x) && !inKR(x.t)).sort(byScore);
  const seen1 = new Set(t1.concat(t2).map(x => x.t));
  /* [v4.76] 유니버스로 채우는 종목도 이름을 붙여 보낸다 — 이름이 비면 화면이
     티커를 두 번 찍는다(MS · MS). 위키 문서명에서 사람이 읽는 이름을 만든다. */
  const t3 = KR_UNIV.filter(t => !seen1.has(t))
    .map(t => ({ t, sfx: null, kr: "", en: artName(t), cap: 0, sc: 0, origin: ["kr-univ"] }));
  const seen2 = new Set(t1.concat(t2, t3).map(x => x.t));
  const t4 = all.filter(x => !attnOf(x) && !seen2.has(x.t))
    .sort((a, b) => ((b.cap || 0) - (a.cap || 0)) || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  let ranked = t1.concat(t2, t3, t4);
  const fallback = t1.length < 8 ? 1 : 0;
  const items = ranked.slice(0, 200)
    .map(x => ({ t: x.t, sfx: x.sfx || usGuessSfx(x.t), kr: fixX(x.kr), en: fixX(x.en || artName(x.t)),
      cap: x.cap || 0, origin: x.origin, views: Math.round(vt.map[x.t] || 0) }));
  const _mktOpen = usMarketOpenish();
  /* ══ [v9.94] 거래대금 순위 — 관심도와 별개로 함께 보낸다 ═══════════════════
     관심도 순위(검색·게시글)는 거래소와 무관하게 24시간 움직여, 장이 닫히면
     순서가 흔들리는 것처럼 보였다. 실제 MTS 는 거래대금이 기본이다.
     yahoo-active 목록에 이미 가격·거래량이 들어 있으므로 추가 호출 없이 만든다.
     ETF·우선주도 그대로 둔다 — 실제 거래대금 상위에는 ETF 가 늘 섞여 있다. */
  let byVal = [];
  try {
    const act = (lists.find(l => l.name === "yahoo-active") || {}).arr || [];
    byVal = act.filter(x => x && x.val > 0)
      .sort((a, b) => b.val - a.val)
      .slice(0, 200)
      .map(x => ({ t: x.t, sfx: x.sfx || usGuessSfx(x.t), kr: fixX(x.kr), en: fixX(x.en || artName(x.t)),
        val: x.val, vol: x.vol, px: x.px, rate: x.rate, cap: x.cap || 0 }));
  } catch (e) { byVal = []; }
  const basis = { n: items.length, src: lists.map(l => ({ k: l.name, n: l.arr.length })),
    attn: t1.length, attnEtc: t2.length, fill: t3.length + t4.length, fallback,
    app: vEntries.length, appTotal: Math.round(vt.total), wiki: wEnt.length, diag,
    /* [v9.93] 언제·어떤 상태에서 만든 순위인지 화면이 알 수 있게 실어 보낸다 */
    mktOpen: _mktOpen, madeAt: Date.now() };
  /* [v9.93] KV 보관도 함께 늘린다 — 900초로 두면 위에서 TTL 을 늘려도
     캐시가 먼저 사라져 결국 매번 다시 만들었다(순위가 계속 흔들린 또 하나의 이유). */
  try { if (KV && items.length) await KV.put(CK, JSON.stringify({ at: Date.now(), items, byVal, basis }),
    { expirationTtl: _mktOpen ? 900 : 30 * 3600 }); } catch (e) { }
  await usvFlush(true);
  return new Response(JSON.stringify({ ok: items.length > 0, items, byVal, basis }),
    { headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
/* 어느 조회수 원천이 살아 있는지 화면에서 바로 확인한다 */
async function uspopdiag_default(){
  const out = { at: new Date().toISOString(), ver: APP_VER, tried: [] };
  const probe = async (label, url, hdr, pick) => {
    const rec = { label, url };
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
      const r = await fetch(url, { headers: hdr, signal: c.signal }); clearTimeout(t);
      rec.status = r.status;
      const txt = await r.text(); rec.len = txt.length;
      rec.sample = txt.slice(0, 160).replace(/\s+/g, " ");
      try { rec.parsed = pick(txt); } catch (e) { rec.parsed = 0; }
    } catch (e) { rec.err = String(e).slice(0, 60); }
    out.tried.push(rec);
  };
  const WH = { "User-Agent": WIKI_UA, Accept: "application/json" };
  const d2 = wikiDate(2), d8 = wikiDate(8);
  await probe("wiki-top(문서 조회수 1000위)",
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${d2.y}/${d2.m}/${d2.d}`,
    WH, (t) => { const j = JSON.parse(t); return ((j.items || [])[0] || {}).articles ? j.items[0].articles.length : 0; });
  await probe("wiki-article(Apple 조회수)",
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Apple_Inc./daily/${d8.s}/${d2.s}`,
    WH, (t) => (JSON.parse(t).items || []).length);
  await probe("yahoo-trending(검색 급상승)",
    "https://query1.finance.yahoo.com/v1/finance/trending/US?count=40",
    { "User-Agent": UA20, Accept: "application/json" },
    (t) => { const j = JSON.parse(t); return (((j.finance || {}).result || [])[0] || {}).quotes ? j.finance.result[0].quotes.length : 0; });
  await probe("stocktwits-trending(관심 급증)",
    "https://api.stocktwits.com/api/2/trending/symbols.json?limit=30",
    { "User-Agent": UA20, Accept: "application/json" },
    (t) => (JSON.parse(t).symbols || []).length);
  await probe("naver-popular(한국인 조회 상위)",
    "https://m.stock.naver.com/worldstock",
    { "User-Agent": UA25, Accept: "text/html", "Accept-Language": "ko-KR,ko;q=0.9", Referer: "https://m.stock.naver.com/" },
    (t) => { /* 인기 '순위'로 쓸 수 있는 목록이 실제로 있는지까지 판정한다 */
      const mN = t.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      let arr = null;
      if (mN) { try { arr = findPopularArray(JSON.parse(mN[1])); } catch (e) { } }
      if (!arr) return 0;
      return looksLikePopular(arr) ? arr.length : 0;
    });
  await probe("yahoo-active(거래 활발 100종)",
    "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=100&start=0",
    { "User-Agent": UA20, Accept: "application/json" },
    (t) => { const j = JSON.parse(t); return (((j.finance || {}).result || [])[0] || {}).quotes ? j.finance.result[0].quotes.length : 0; });
  out.usable = out.tried.filter(x => x.parsed > 0).map(x => x.label);
  return new Response(JSON.stringify(out, null, 2),
    { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
ROUTES["uspopdiag"]=uspopdiag_default;
/* ══ [v4.74] 미국 전 종목 목록 ═══════════════════════════════════════════════
   [무엇이 부족했나] 국내는 전 종목 5,455종을 받아 두고 검색하는데, 해외는 앱에
   박아 둔 114종 + 검색으로 우연히 등록된 것뿐이었다. 그래서 스페이스X 처럼
   목록에 없는 종목은 한글로 검색해도 나오지 않았다.
   [원천] 미국 증권거래위원회(SEC)가 상장사 티커 전체를 한 파일로 공개한다.
   약 1만 종이고 인증이 없다. 여기에 야후 화면에서 얻는 ETF 목록을 더해
   '국내처럼 하나도 빠짐없이' 검색되게 한다.
   [주의] SEC 는 연락처가 담긴 User-Agent 를 요구한다(정책). */
var SEC_UA = "LIVEjeungkwon/4.74 (educational paper-trading app; contact github.com/jinnytcrew)";
async function usall_default(){
  const CK = "usall:v2";
  try {
    const c = KV ? await KV.get(CK, "json") : null;
    if (c && c.at && Date.now() - c.at < 24 * 3600e3 && Array.isArray(c.rows) && c.rows.length > 2000)
      return new Response(JSON.stringify({ ok: true, n: c.rows.length, rows: c.rows, cached: 1 }),
        { headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" } });
  } catch (e) { }
  const diag = [], map = new Map();
  /* rows: [티커, 이름, ETF여부, 거래소(O/N/A)] */
  /* [v4.80] 거래소가 시험용으로 올려둔 종목(ZZZT·TEST 등)은 실제 종목이 아니다.
     화면에 섞이면 '무슨 회사인지 알 수 없는 항목'이 되므로 아예 걸러낸다. */
  const BAD = /^(TEST|ZZZ|ZXYZ|ZVZZ|ZWZZ|ZBZX|ZJZZ|IBM_|NTEST)/;
  const add = (t, en, etf, sfx) => {
    const k = String(t || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
    if (!k || k.length > 6) return;
    if (BAD.test(k)) return;
    if (/\btest\b/i.test(String(en || ""))) return;
    const cur = map.get(k);
    if (cur) { if (!cur[1] && en) cur[1] = String(en).slice(0, 60); if (!cur[3] && sfx) cur[3] = sfx; return; }
    map.set(k, [k, String(en || "").slice(0, 60), etf ? 1 : 0, sfx || ""]);
  };
  const grab = async (nm, url, hdr, ms) => {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 9000);
      const r = await fetch(url, { headers: hdr, signal: c.signal });
      clearTimeout(t);
      if (!r.ok) { diag.push(nm + ":" + r.status); return null; }
      return await r.text();
    } catch (e) { diag.push(nm + ":" + String(e).slice(0, 12)); return null; }
  };
  /* ══ [v4.78] 종목이 빠지지 않도록 원천을 바꾼다 ═══════════════════════════
     [무엇이 빠졌나] SEC 파일은 '상장 기업' 목록이라 ETF 가 통째로 없다.
     SOXL·TQQQ·SCHD 같은 것이 검색되지 않았다. 거래소 정보도 없어 전부 나스닥으로
     등록돼, 뉴욕 상장 종목은 네이버 시세 경로를 못 썼다.
     [바꾼 원천] 나스닥이 공개하는 심볼 디렉터리 두 파일이 미국 상장 증권 전체를
     담고 ETF 여부와 거래소까지 알려 준다. SEC 파일은 회사명 보강용으로만 쓴다. */
  const NH = { "User-Agent": SEC_UA, Accept: "text/plain,*/*" };
  const nas = await grab("nasdaq", "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt", NH, 12000);
  if (nas) {
    let n = 0;
    for (const line of nas.split("\n")) {
      const p2 = line.split("|");
      if (p2.length < 7 || p2[0] === "Symbol" || /^File Creation/.test(line)) continue;
      if (p2[3] === "Y") continue;                       // 시험용 종목 제외
      add(p2[0], nameOfSec(p2[1]), p2[6] === "Y", "O");  // 나스닥 = .O
      n++;
    }
    diag.push("nasdaq:" + n);
  }
  const oth = await grab("other", "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt", NH, 12000);
  if (oth) {
    let n = 0;
    for (const line of oth.split("\n")) {
      const p2 = line.split("|");
      if (p2.length < 5 || p2[0] === "ACT Symbol" || /^File Creation/.test(line)) continue;
      if (p2[6] === "Y") continue;
      /* 거래소 코드 — N 뉴욕 / A 아멕스 / P 아카(ETF 대부분) / Z·V 기타 */
      const ex = p2[2] === "N" ? "N" : (p2[2] === "A" || p2[2] === "P") ? "A" : "N";
      add(p2[0], nameOfSec(p2[1]), p2[4] === "Y", ex);
      n++;
    }
    diag.push("other:" + n);
  }
  /* ══ [v4.81] 나스닥 파일이 막히면 대안으로 채운다 ═══════════════════════
     원천이 하나뿐이면 그곳이 막힌 날 목록이 통째로 비어 검색이 죽는다.
     같은 파일을 담아 두는 공개 거울(깃허브 데이터셋)과 SEC 파일을 함께 둔다. */
  if (map.size < 2000) {
    const alt = await grab("mirror",
      "https://raw.githubusercontent.com/datasets/nasdaq-listings/main/data/nasdaq-listed-symbols.csv",
      { "User-Agent": SEC_UA, Accept: "text/csv,text/plain" }, 12000);
    if (alt) {
      let n = 0;
      for (const line of alt.split("\n")) {
        const c2 = line.split(",");
        if (c2.length < 2 || c2[0] === "Symbol") continue;
        add(c2[0].replace(/"/g, ""), nameOfSec(c2.slice(1).join(",").replace(/"/g, "")), 0, "O");
        n++;
      }
      diag.push("mirror:" + n);
    }
  }
  /* 회사명 보강 — 나스닥 파일의 이름은 증권 형태가 길게 붙어 있어 SEC 이름이 더 깔끔하다 */
  const sec = await grab("sec", "https://www.sec.gov/files/company_tickers.json",
    { "User-Agent": SEC_UA, Accept: "application/json" }, 9000);
  if (sec) {
    try {
      const j = JSON.parse(sec); let n = 0;
      for (const k in j) { const it = j[k]; if (!it || !it.ticker) continue;
        const cur = map.get(String(it.ticker).toUpperCase());
        if (cur) { cur[1] = String(it.title || cur[1]).slice(0, 60); n++; }
        else { add(it.ticker, it.title, 0, ""); n++; }
      }
      diag.push("sec:" + n);
    } catch (e) { diag.push("sec:parse"); }
  }
  const rows = [...map.values()];
  try { if (KV && rows.length > 2000) await KV.put(CK, JSON.stringify({ at: Date.now(), rows }), { expirationTtl: 172800 }); } catch (e) { }
  return new Response(JSON.stringify({ ok: rows.length > 0, n: rows.length,
    etf: rows.filter(r => r[2]).length, rows, diag }),
    { headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
/* 나스닥 파일의 이름에서 증권 형태 설명을 떼어낸다 */
function nameOfSec(v){
  return String(v || "").split(" - ")[0]
    .replace(/\s+(Common Stock|Class [A-Z]|Ordinary Shares|American Depositary Shares?)\s*$/i, "")
    .trim();
}
/* ══ [v4.80] 해외 종목의 기업·재무·컨센서스 정보 ═══════════════════════════
   증권 앱(미래에셋 등)이 보여 주는 해외 종목 정보는 대부분 FnGuide·Refinitiv 자료다.
   네이버 해외증시도 같은 자료를 쓴다 — 그리고 m.stock.naver.com 은 이 앱에서
   응답이 확인된 호스트다. 여러 경로를 차례로 두드려 얻어지는 것만 모아 돌려준다.
   [설계 원칙] 없는 항목은 만들어 내지 않는다. 받은 것만 담고, 무엇을 못 받았는지
   diag 에 남겨 화면에서 확인할 수 있게 한다. */
/* ══ [v4.82] 야후 상세자료 열쇠(쿠키·크럼) ═══════════════════════════════════
   [왜 필요한가] 컨센서스·재무·기업개요는 야후 quoteSummary 에 다 들어 있는데,
   야후가 2023년부터 이 경로에 '쿠키 + 크럼' 검사를 걸었다. 그래서 그동안
   목표주가·투자의견이 계속 '—' 로 비어 있었다.
   [절차] fc.yahoo.com 에서 쿠키를 받고 → 그 쿠키로 crumb 를 받는다.
   한 번 받으면 반나절 쓸 수 있으므로 KV 에 담아 둔다(매번 두 번씩 더 부르지 않도록). */
var YH_UA2="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
async function yhCrumb(diag){
  try{ if(KV){ const c=await KV.get("yhcrumb:v1","json");
    if(c&&c.at&&Date.now()-c.at<12*3600e3&&c.crumb)return c; } }catch(e){}
  const H={ "User-Agent":YH_UA2, Accept:"text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language":"en-US,en;q=0.9" };
  const pickCookie=(r)=>{
    let list=[];
    try{ if(r.headers.getSetCookie)list=r.headers.getSetCookie(); }catch(e){}
    if(!list.length){ const one=r.headers.get("set-cookie"); if(one)list=[one]; }
    return list.map(c=>String(c).split(";")[0].trim()).filter(Boolean).join("; ");
  };
  let cookie="";
  for(const u of ["https://fc.yahoo.com","https://finance.yahoo.com"]){
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),5000);
      const r=await fetch(u,{headers:H,redirect:"manual",signal:c.signal});
      clearTimeout(t);
      cookie=pickCookie(r);
      if(cookie)break;
    }catch(e){}
  }
  if(!cookie){ diag&&diag.push("yh-cookie:none"); return null; }
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),5000);
    const r=await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb",
      {headers:{...H,Cookie:cookie},signal:c.signal});
    clearTimeout(t);
    if(!r.ok){ diag&&diag.push("yh-crumb:"+r.status); return null; }
    const crumb=(await r.text()).trim();
    if(!crumb||crumb.length>32||/[<>]/.test(crumb)){ diag&&diag.push("yh-crumb:bad"); return null; }
    const rec={at:Date.now(),cookie,crumb};
    try{ if(KV)await KV.put("yhcrumb:v1",JSON.stringify(rec),{expirationTtl:43200}); }catch(e){}
    diag&&diag.push("yh-crumb:ok");
    return rec;
  }catch(e){ diag&&diag.push("yh-crumb:"+String(e).slice(0,10)); return null; }
}
async function yhSummary(tk,diag){
  const k=await yhCrumb(diag);
  if(!k)return null;
  const mods="assetProfile,summaryDetail,defaultKeyStatistics,financialData,"
    +"incomeStatementHistory,calendarEvents,price";
  for(const host of ["query2","query1"]){
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),7000);
      const r=await fetch(`https://${host}.finance.yahoo.com/v10/finance/quoteSummary/`
        +encodeURIComponent(tk)+`?modules=${mods}&crumb=`+encodeURIComponent(k.crumb),
        {headers:{ "User-Agent":YH_UA2, Accept:"application/json", Cookie:k.cookie },signal:c.signal});
      clearTimeout(t);
      if(!r.ok){ diag&&diag.push("yh-sum:"+r.status);
        if(r.status===401||r.status===403){ try{ if(KV)await KV.delete("yhcrumb:v1"); }catch(e){} }
        continue; }
      const j=await r.json();
      const res=j&&j.quoteSummary&&j.quoteSummary.result&&j.quoteSummary.result[0];
      if(!res){ diag&&diag.push("yh-sum:empty"); continue; }
      diag&&diag.push("yh-sum:ok");
      return res;
    }catch(e){ diag&&diag.push("yh-sum:"+String(e).slice(0,10)); }
  }
  return null;
}
async function usinfo_default(req2){
  const u=new URL(req2.url);
  const reu=String(u.searchParams.get("code")||"").trim().slice(0,16);
  if(!reu)return new Response(JSON.stringify({ok:false,err:"code"}),
    {headers:{"content-type":"application/json"}});
  const CK="usinfo:"+reu;
  try{ const c=KV?await KV.get(CK,"json"):null;
    if(c&&c.at&&Date.now()-c.at<6*3600e3)
      return new Response(JSON.stringify({ok:true,...c.data,cached:1}),
        {headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});
  }catch(e){}
  const diag=[], out={};
  const grab=async(nm,path)=>{
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),5000);
      const r=await fetch("https://m.stock.naver.com/api/stock/"+encodeURIComponent(reu)+path,
        {headers:HDRS,signal:c.signal});
      clearTimeout(t);
      if(!r.ok){ diag.push(nm+":"+r.status); return null; }
      const txt=await r.text();
      let j=null; try{ j=JSON.parse(txt); }catch(e){ diag.push(nm+":parse"); return null; }
      diag.push(nm+":ok");
      return j;
    }catch(e){ diag.push(nm+":"+String(e).slice(0,10)); return null; }
  };
  const pick=(o,...ks)=>{ for(const k of ks){ if(o&&o[k]!=null&&o[k]!=="")return o[k]; } return null; };
  /* ① 기업 개요·배당 — basic / integration 에 함께 담겨 오는 경우가 많다 */
  const basic=await grab("basic","/basic");
  const intg =await grab("intg","/integration");
  const src=Object.assign({},basic||{},intg||{});
  const prof={};
  const put=(k,v)=>{ if(v!=null&&v!=="")prof[k]=v; };
  put("name",  pick(src,"stockName","stockNameKor"));
  put("nameEn",pick(src,"stockNameEng"));
  put("exch",  pick(src,"stockExchangeName","exchangeName","nationName"));
  put("sector",pick(src,"industryCodeType","sectorName","industryName"));
  put("ceo",   pick(src,"ceoName","ceo"));
  put("addr",  pick(src,"address"));
  put("home",  pick(src,"homePageUrl","homepage","siteUrl"));
  put("listed",pick(src,"listingDate","ipoDate"));
  put("emp",   pick(src,"employeeCount","employees"));
  put("desc",  pick(src,"summary","companySummary","description","outline"));
  /* 배당 — 항목 이름이 제각각이라 넓게 훑는다 */
  const div={};
  const dv=(k,v)=>{ if(v!=null&&v!=="")div[k]=v; };
  dv("amount", pick(src,"dividendAmount","dps","dividend"));
  dv("yield",  pick(src,"dividendYieldRatio","dividendRatio","dividendYield"));
  dv("exDate", pick(src,"dividendExDate","exDividendDate"));
  dv("payDate",pick(src,"dividendPayDate","paymentDate"));
  /* 주요 지표 — 종목요약 표에 함께 담겨 오는 값들 */
  const key={};
  const kv=(k,v)=>{ if(v!=null&&v!=="")key[k]=v; };
  kv("per", pick(src,"per","peRatio"));
  kv("pbr", pick(src,"pbr","pbRatio"));
  kv("eps", pick(src,"eps"));
  kv("bps", pick(src,"bps"));
  kv("roe", pick(src,"roe"));
  kv("cap", pick(src,"marketValue","marketCap"));
  /* stockItemTotalInfos 안에 이름표가 붙은 값들이 더 들어 있다 */
  try{
    const arr=src.stockItemTotalInfos||src.totalInfos||[];
    for(const it of (Array.isArray(arr)?arr:[])){
      const k=String(it.key||it.code||""), v=it.value;
      if(!k||v==null||v==="")continue;
      if(/per/i.test(k)&&!key.per)key.per=v;
      else if(/pbr/i.test(k)&&!key.pbr)key.pbr=v;
      else if(/^eps$/i.test(k)&&!key.eps)key.eps=v;
      else if(/^bps$/i.test(k)&&!key.bps)key.bps=v;
      else if(/roe/i.test(k)&&!key.roe)key.roe=v;
      else if(/divid/i.test(k)&&!div.yield)div.yield=v;
      else if(/market.?value|시가총액/i.test(k)&&!key.cap)key.cap=v;
    }
  }catch(e){}
  /* ② 재무·컨센서스 — 있으면 그대로 담는다(구조가 제각각이라 원본을 넘긴다) */
  /* ══ [v4.82] 야후 상세자료를 먼저 쓴다 ═══════════════════════════════════
     네이버 해외 경로는 컨센서스·재무를 주지 않아 화면이 계속 '—' 였다.
     야후 quoteSummary 에는 목표주가·투자의견·재무·기업개요가 모두 들어 있다. */
  const yh=await yhSummary(usSymDot(reu),diag);
  if(yh){
    const n=(o)=>{ if(o==null)return null; if(typeof o==="number")return o;
      if(typeof o==="object"&&o.raw!=null)return o.raw; return null; };
    const t2=(o)=>{ if(o==null)return null; if(typeof o==="object"&&o.fmt!=null)return o.fmt;
      return typeof o==="object"?null:o; };
    const ap=yh.assetProfile||{}, sd=yh.summaryDetail||{}, ks=yh.defaultKeyStatistics||{},
          fd=yh.financialData||{}, ce=yh.calendarEvents||{}, pr=yh.price||{};
    put("nameEn",pr.longName||pr.shortName);
    put("exch",  pr.exchangeName||pr.fullExchangeName);
    put("sector",[ap.sector,ap.industry].filter(Boolean).join(" · "));
    put("ceo",   (ap.companyOfficers&&ap.companyOfficers[0]&&ap.companyOfficers[0].name)||null);
    put("addr",  [ap.address1,ap.city,ap.state,ap.country].filter(Boolean).join(", "));
    put("home",  ap.website);
    put("emp",   n(ap.fullTimeEmployees));
    put("desc",  ap.longBusinessSummary);
    dv("amount", n(sd.dividendRate));
    dv("yield",  n(sd.dividendYield)!=null?+(n(sd.dividendYield)*100).toFixed(2):null);
    dv("exDate", t2(sd.exDividendDate)||t2(ce.exDividendDate));
    dv("payDate",t2(ce.dividendDate));
    kv("per",  n(sd.trailingPE)!=null?n(sd.trailingPE).toFixed(2):null);
    kv("pbr",  n(ks.priceToBook)!=null?n(ks.priceToBook).toFixed(2):null);
    kv("eps",  n(ks.trailingEps));
    kv("bps",  n(ks.bookValue));
    kv("roe",  n(fd.returnOnEquity)!=null?+(n(fd.returnOnEquity)*100).toFixed(2):null);
    kv("cap",  t2(sd.marketCap)||n(sd.marketCap));
    /* 컨센서스 — 화면이 바로 쓸 수 있는 모양으로 정리해 넘긴다 */
    const cs={};
    const setc=(k2,v)=>{ if(v!=null)cs[k2]=v; };
    setc("score", n(fd.recommendationMean));
    setc("target",n(fd.targetMeanPrice));
    setc("high",  n(fd.targetHighPrice));
    setc("low",   n(fd.targetLowPrice));
    setc("num",   n(fd.numberOfAnalystOpinions));
    setc("key",   String(fd.recommendationKey||""));
    setc("eps",   n(ks.forwardEps));
    setc("per",   n(ks.forwardPE)!=null?n(ks.forwardPE).toFixed(2):null);
    if(Object.keys(cs).length)out.consensus={yh:cs};
    /* 재무 — 연간 손익계산서 */
    try{
      const hs=(yh.incomeStatementHistory&&yh.incomeStatementHistory.incomeStatementHistory)||[];
      const rows=hs.slice(0,4).map(x=>({
        yearMonth:String(t2(x.endDate)||"").slice(0,7),
        revenue:t2(x.totalRevenue), operatingIncome:t2(x.operatingIncome),
        netIncome:t2(x.netIncome), grossProfit:t2(x.grossProfit)}));
      if(rows.length)out.finance={annual:rows};
    }catch(e){}
  }
  /* 경로 이름이 버전마다 달라 여러 개를 차례로 두드린다 — 하나라도 되면 그걸 쓴다 */
  let fin=null;
  if(!out.finance)for(const p2 of ["/finance","/financeSummary"]){
    fin=await grab("fin"+p2.replace(/\//g,"_"),p2); if(fin)break;
  }
  let cons=null;
  if(!out.consensus)for(const p2 of ["/consensus","/analystOpinion"]){
    cons=await grab("cons"+p2.replace(/\//g,"_"),p2); if(cons)break;
  }
  if(Object.keys(prof).length)out.profile=prof;
  if(Object.keys(div).length)out.dividend=div;
  if(Object.keys(key).length)out.metrics=key;
  if(fin)out.finance=fin;
  if(cons)out.consensus=cons;
  out.diag=diag;
  try{ if(KV)await KV.put(CK,JSON.stringify({at:Date.now(),data:out}),{expirationTtl:43200}); }catch(e){}
  return new Response(JSON.stringify({ok:true,...out}),
    {headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});
}
/* ══ [v4.82] 해외 종목 뉴스 ═══════════════════════════════════════════════
   지금까지는 '야후에서 보기' 같은 바깥 링크만 늘어놓았다. 증권 앱은 제목·날짜·
   매체가 담긴 실제 목록을 보여 준다. 야후 검색이 뉴스를 함께 주므로 그것을 쓴다. */
async function usnews_default(req2){
  const u=new URL(req2.url);
  const tk=String(u.searchParams.get("t")||"").toUpperCase().replace(/[^A-Z0-9.\-]/g,"").slice(0,10);
  if(!tk)return new Response(JSON.stringify({ok:false,err:"t"}),{headers:{"content-type":"application/json"}});
  const CK="usnews:"+tk;
  try{ const c=KV?await KV.get(CK,"json"):null;
    if(c&&c.at&&Date.now()-c.at<10*60e3)
      return new Response(JSON.stringify({ok:true,items:c.items,cached:1}),
        {headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});
  }catch(e){}
  const diag=[]; let items=[];
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),6000);
    const r=await fetch("https://query1.finance.yahoo.com/v1/finance/search?q="+encodeURIComponent(tk)
      +"&quotesCount=0&newsCount=20&enableFuzzyQuery=false",
      {headers:{ "User-Agent":UA20, Accept:"application/json" },signal:c.signal});
    clearTimeout(t);
    if(r.ok){
      const j=await r.json();
      items=((j&&j.news)||[]).map(x=>({
        title:String(x.title||"").slice(0,180),
        link:String(x.link||""),
        pub:String(x.publisher||""),
        at:(+x.providerPublishTime||0)*1000,
        img:(x.thumbnail&&x.thumbnail.resolutions&&x.thumbnail.resolutions[0]
             &&x.thumbnail.resolutions[0].url)||""
      })).filter(x=>x.title&&x.link);
      diag.push("yh-news:"+items.length);
    } else diag.push("yh-news:"+r.status);
  }catch(e){ diag.push("yh-news:"+String(e).slice(0,10)); }
  try{ if(KV&&items.length)await KV.put(CK,JSON.stringify({at:Date.now(),items}),{expirationTtl:900}); }catch(e){}
  return new Response(JSON.stringify({ok:items.length>0,items,diag}),
    {headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});
}
/* ══ [v5.8] 다른 사람에게 송금 ═══════════════════════════════════════════════
   [설계] 잔고는 각자 기기에 있으므로 서버가 돈을 옮길 수는 없다.
   대신 서버가 '계좌번호 장부'와 '받을 돈 보관함'을 맡는다.
     ① register : 내 계좌번호를 장부에 올린다(누구 것인지 서버가 알게 된다)
     ② lookup   : 받는 사람 이름을 미리 보여 준다(잘못 보내는 것을 막는다)
     ③ send     : 보내는 쪽이 자기 잔고를 뺀 뒤, 받는 사람 보관함에 넣는다
     ④ inbox    : 받는 쪽이 접속하면 보관함을 가져가 잔고에 더한다
     ⑤ ack      : 받았다고 알리면 보관함에서 지운다(두 번 받지 않게)
   [안전장치] 같은 이체가 두 번 들어가지 않도록 보낼 때 만든 고유 번호(xid)로 거른다. */
async function xfer_default(req2){
  if(req2.method!=="POST")return json2({ok:false,err:"method"});
  let b; try{ b=await req2.json(); }catch{ return json2({ok:false,err:"body"}); }
  let st; try{ st=await stores(); }catch{ return json2({ok:false,err:"nostore"}); }
  const act=String(b.action||"");
  const NO=(v)=>String(v||"").replace(/[^0-9]/g,"");        // 계좌번호는 숫자만 비교한다
  const clip2=(v,n)=>String(v==null?"":v).slice(0,n);

  /* 받는 사람 이름 미리보기 — 인증 없이도 가능하다(이름만, 그것도 가린 채) */
  if(act==="lookup"){
    const no=NO(b.no);
    if(no.length<10)return json2({ok:false,err:"format"});
    const e=await st.clan.get("acct:"+no,{type:"json"}).catch(()=>null);
    if(!e)return json2({ok:false,err:"nouser"});
    const nm=String(e.name||"");
    const masked=nm.length<=1?nm:(nm[0]+"*".repeat(Math.max(1,nm.length-2))+(nm.length>1?nm[nm.length-1]:""));
    return json2({ok:true,name:masked,type:e.type||"",self:false});
  }

  const db=await readAccDb(st);            // [v7.5]
  const user=await verifyUser(db,b.id,b.pass,b.legacy);
  if(!user)return json2({ok:false,err:"auth"});
  const uid=String(b.id);
  const uname=clip2(b.name||user.name||uid,12);

  /* ① 내 계좌번호를 장부에 올린다 */
  if(act==="register"){
    const list=Array.isArray(b.accts)?b.accts.slice(0,30):[];
    let n=0;
    for(const a of list){
      const no=NO(a&&a.no);
      if(no.length<10)continue;
      const prev=await st.clan.get("acct:"+no,{type:"json"}).catch(()=>null);
      /* 남이 이미 올린 번호는 덮어쓰지 않는다 */
      if(prev&&prev.uid&&prev.uid!==uid)continue;
      if(prev&&prev.uid===uid&&prev.name===uname&&prev.type===a.type)continue;   // 바뀐 게 없으면 쓰지 않는다(KV 절약)
      await st.clan.setJSON("acct:"+no,{uid,name:uname,type:clip2(a.type,20),at:Date.now()});
      n++;
    }
    return json2({ok:true,n});
  }

  /* ③ 보낸다 — 받는 사람 보관함에 넣기만 한다 */
  if(act==="send"){
    const to=NO(b.toNo);
    const amt=Math.floor(Number(b.amt)||0);
    if(to.length<10)return json2({ok:false,err:"format"});
    if(!(amt>=1000))return json2({ok:false,err:"min"});
    if(amt>50000000)return json2({ok:false,err:"limit"});
    const e=await st.clan.get("acct:"+to,{type:"json"}).catch(()=>null);
    if(!e)return json2({ok:false,err:"nouser"});
    if(e.uid===uid)return json2({ok:false,err:"self"});
    const key="inbox:"+e.uid;
    const box=await st.clan.get(key,{type:"json"}).catch(()=>null)||[];
    const xid=clip2(b.xid,24)||("x"+Date.now().toString(36)+Math.random().toString(36).slice(2,6));
    if(box.some(x=>x&&x.xid===xid))return json2({ok:true,dup:1});   // 같은 이체는 한 번만
    box.push({xid,from:uname,fromNo:clip2(b.fromNo,20),toNo:to,amt,
      memo:clip2(b.memo,30),at:Date.now()});
    if(box.length>60)box.splice(0,box.length-60);
    await st.clan.setJSON(key,box);
    return json2({ok:true,xid,toName:e.name||""});
  }

  /* ④ 받을 돈을 가져간다 */
  if(act==="inbox"){
    const box=await st.clan.get("inbox:"+uid,{type:"json"}).catch(()=>null)||[];
    return json2({ok:true,items:box});
  }

  /* ⑤ 받았다고 알린다 — 보관함에서 지운다 */
  if(act==="ack"){
    const ids=Array.isArray(b.ids)?b.ids.map(x=>clip2(x,24)):[];
    if(!ids.length)return json2({ok:true,n:0});
    const key="inbox:"+uid;
    const box=await st.clan.get(key,{type:"json"}).catch(()=>null)||[];
    const left=box.filter(x=>x&&!ids.includes(x.xid));
    if(left.length!==box.length)await st.clan.setJSON(key,left);
    return json2({ok:true,n:box.length-left.length});
  }
  return json2({ok:false,err:"action"});
}
/* ══ [v6.2] 야간선물 진단 ═══════════════════════════════════════════════════
   카드가 비어 있을 때 '어느 길이 막혔는지' 눈으로 볼 수 있게 한다.
   추측으로 고치지 않고, 살아 있는 경로를 확인한 뒤 그것을 쓰기 위한 장치다. */
async function k200nfdiag_default(){
  const t0=Date.now();
  let r=null, err="";
  try{ r=await krFutures(); }catch(e){ err=String(e).slice(0,80); }
  return new Response(JSON.stringify({
    ok:!!(r&&r.night), ms:Date.now()-t0, err,
    day:r&&r.day?{price:r.day.price,rate:r.day.rate}:null,
    night:r&&r.night?{price:r.night.price,rate:r.night.rate,src:r.nightSrc||""}:null,
    diag:(r&&r.diag)||[],
    now:new Date(Date.now()+9*3600e3).toISOString().slice(0,19).replace("T"," ")+" KST"
  },null,1),{headers:{"content-type":"application/json; charset=utf-8",
    "cache-control":"no-store","access-control-allow-origin":"*"}});
}
/* ══ [v8.6] 야간선물 전용 경로 — 카드가 직접 부른다 ═══════════════════════════
   [왜 새로 만드나] 지금까지는 '주요 지수' 묶음(/api/market) 안에서 야간선물을
   함께 받아왔다. 그 묶음은 60초마다 한 번, 여러 지수를 한꺼번에 처리하느라
   야간선물 하나가 실패해도 다음 갱신까지 그대로 빈칸이었다.
   [바꾼 구조] 카드가 이 경로만 따로 부른다. 실패하면 카드가 스스로 다시 시도한다.
   응답에 '어디서 받았는지'와 '무엇이 막혔는지'를 함께 담아, 화면에서 바로 확인된다. */
async function k200nf_default(req2, ctx){
  const env=(ctx&&ctx.env)||_ENV||{};
  const diag=[];
  const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
  const num=(v)=>{const n=Number(String(v==null?"":v).replace(/,/g,""));return isFinite(n)?n:0;};
  const jget=async(u,h)=>{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),5000);
    try{ const r=await fetch(u,{signal:c.signal,headers:{"User-Agent":UA,Accept:"application/json",...(h||{})}});
      if(!r.ok){diag.push(u.split("/")[2]+":"+r.status);return null;}
      return await r.json();
    }catch(e){ diag.push(u.split("/")[2]+":"+String(e.name||e).slice(0,12)); return null; }
    finally{ clearTimeout(t); }
  };
  const tget2=async(u,h)=>{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),6000);
    try{ const r=await fetch(u,{signal:c.signal,headers:{"User-Agent":UA,...(h||{})}});
      if(!r.ok){diag.push(u.split("/")[2]+":"+r.status);return null;}
      return await r.text();
    }catch(e){ diag.push(u.split("/")[2]+":"+String(e.name||e).slice(0,12)); return null; }
    finally{ clearTimeout(t); }
  };
  let out=null;
  const take=(px,ch,rate,src,hist)=>{
    if(out||!(px>0))return;
    out={price:+px.toFixed(2),change:ch!=null?+Number(ch).toFixed(2):null,
      rate:rate!=null?+Number(rate).toFixed(2):null,src,history:Array.isArray(hist)?hist:[]};
  };

  /* ① 트레이딩뷰 스캐너 — KRX 직상장 심볼(야간 세션 포함) */
  for(const sym of ["KRX:K2I1!","KRX:K2I2!","KRX:K200F1!"]){
    if(out)break;
    const j=await jget("https://scanner.tradingview.com/symbol?symbol="+encodeURIComponent(sym)
      +"&fields=lp,ch,chp,prev_close_price&no_404=true",{Referer:"https://www.tradingview.com/"});
    if(j&&num(j.lp)>0)take(num(j.lp),num(j.ch),num(j.chp),"tv:"+sym);
  }
  /* ② 트레이딩뷰 스캐너(POST) — 위 GET 이 막힐 때 */
  if(!out){
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),6000);
      const r=await fetch("https://scanner.tradingview.com/futures/scan",{method:"POST",signal:c.signal,
        headers:{"User-Agent":UA,"content-type":"application/json",Referer:"https://www.tradingview.com/"},
        body:JSON.stringify({symbols:{tickers:["KRX:K2I1!"],query:{types:[]}},
          columns:["close","change","change_abs","description"]})});
      clearTimeout(t);
      if(r.ok){ const j=await r.json();
        const d=j&&j.data&&j.data[0]&&j.data[0].d;
        if(d&&num(d[0])>0)take(num(d[0]),num(d[2]),num(d[1]),"tv-scan");
        else diag.push("tv-scan:nodata");
      } else diag.push("tv-scan:"+r.status);
    }catch(e){ diag.push("tv-scan:"+String(e.name||e).slice(0,12)); }
  }
  /* ③ 인베스팅닷컴 선물 페이지 — HTML 에 값이 그대로 담겨 온다 */
  if(!out){
    for(const u of ["https://kr.investing.com/indices/korea-200-futures",
                    "https://www.investing.com/indices/korea-200-futures"]){
      if(out)break;
      const h=await tget2(u,{Accept:"text/html","Accept-Language":"ko,en;q=0.8"});
      if(!h)continue;
      let px=0,pc=0;
      let m=/data-test="instrument-price-last"[^>]*>([\d,]+\.?\d*)</.exec(h); if(m)px=num(m[1]);
      if(!px){ m=/"last"\s*:\s*"?([\d,]+\.?\d*)"?/.exec(h); if(m)px=num(m[1]); }
      const pm=/data-test="prevClose"[^>]*>([\d,]+\.?\d*)</.exec(h)
        ||/"prev_close"\s*:\s*"?([\d,]+\.?\d*)"?/.exec(h);
      if(pm)pc=num(pm[1]);
      if(px>0)take(px,pc>0?px-pc:null,pc>0?(px-pc)/pc*100:null,"investing");
      else diag.push("investing:noprice");
    }
  }
  /* ④ 네이버 선물 — 야간 종목코드 후보 */
  if(!out){
    for(const cd of ["KRDRVFUK2I","101W3000","101WC000"]){
      if(out)break;
      const j=await jget("https://api.stock.naver.com/futures/"+cd+"/basic",
        {Referer:"https://m.stock.naver.com/"});
      const px=num(j&&(j.closePrice??j.nowVal));
      if(px>0){ const pc=num(j.previousClose??j.baseValue);
        take(px,pc>0?px-pc:num(j.compareToPreviousClosePrice),
          num(j.fluctuationsRatio)||(pc>0?(px-pc)/pc*100:null),"naver:"+cd); }
    }
  }
  /* ══ [v8.8] 그래프가 비어 있던 이유 — 흐름을 받아오지 않았다 ═══════════════
     값만 받고 history 를 채우지 않아, 카드에 숫자만 나오고 선은 없었다. */
  if (out && (!out.history || out.history.length < 3)) {
    /* ① 트레이딩뷰 히스토리 — 5분봉 */
    try {
      const to2 = Math.floor(Date.now() / 1000), from2 = to2 - 2 * 86400;
      const j = await jget("https://history-data.tradingview.com/history?symbol="
        + encodeURIComponent("KRX:K2I1!") + "&resolution=5&from=" + from2 + "&to=" + to2,
        { Referer: "https://www.tradingview.com/" });
      if (j && Array.isArray(j.c) && j.c.length >= 3)
        out.history = j.c.map(Number).filter((v) => v > 0).slice(-40);
    } catch (e) {}
    /* ② 인베스팅 차트 데이터 */
    if (!out.history || out.history.length < 3) {
      try {
        const j = await jget("https://api.investing.com/api/financialdata/8830/historical/chart/?interval=PT5M&pointscount=60",
          { Referer: "https://kr.investing.com/" });
        const rows = (j && j.data) || [];
        const arr = rows.map((r) => Number(r[4] ?? r[1])).filter((v) => v > 0).slice(-40);
        if (arr.length >= 3) out.history = arr;
      } catch (e) {}
    }
    if (!out.history || out.history.length < 3) diag.push("hist:none");
  }
  const kst=new Date(Date.now()+9*3600e3);
  const h9=kst.getUTCHours(), wd=kst.getUTCDay();
  const open=(h9>=18)?(wd>=1&&wd<=5):(h9<6?(wd>=2&&wd<=6):false);
  const body={ok:!!out,open,...(out||{}),diag:diag.slice(0,14),
    at:kst.toISOString().slice(0,19).replace("T"," ")+" KST"};
  return new Response(JSON.stringify(body),{headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"public, max-age=20, s-maxage=20",
    "access-control-allow-origin":"*"}});
}
/* ══ [v9.2] 시장 전체 투자자별 매매동향 ═══════════════════════════════════════
   [무엇인가] 코스피·코스닥에서 개인·외국인·기관이 오늘 얼마를 순매수했는지.
   증권사 앱 첫 화면에 지수와 나란히 놓이는 정보다. '누가 사고 누가 파는지'는
   지수 숫자만으로는 알 수 없고, 흐름을 읽는 데 가장 먼저 보는 값이다.
   [단위] 억원. 양수면 순매수, 음수면 순매도. */
async function invtrend_default(){
  /* ══ [v9.71] 전면 재작성 — v9.2 가 한 번도 값을 못 내던 이유 ═══════════════
     ① 네이버 페이지는 EUC-KR 인데 tget(UTF-8 강제 디코드)으로 읽어 표가 깨졌고,
        bizdate 를 비워 보내 표 자체가 안 오는 날이 있었다.
        → arrayBuffer + decodeSmart9 로 읽고, bizdate 를 최근 영업일로 명시한다.
     ② KRX 예비 경로는 '오늘' 날짜 고정이라 주말·이른 아침엔 항상 빈 표였고,
        money 단위 가정도 어긋날 수 있었다.
        → 최근 영업일을 차례로 시도하고, money:"1"(원)을 1e8 로 나눠 억원을 만든다.
     단위: 억원. 양수 = 순매수, 음수 = 순매도. */
  const out={ok:false,kospi:null,kosdaq:null,at:"",diag:[]};
  const num=(v)=>{const n=Number(String(v==null?"":v).replace(/[,\s+]/g,""));return isFinite(n)?n:0;};
  /* 최근 평일 후보(오늘 포함 6일) — 휴장일이면 표가 비므로 다음 후보로 넘어간다 */
  const days=[];{let off=0;while(days.length<6&&off<10){
    const d=new Date(Date.now()+9*3600e3-off*864e5);const w=d.getUTCDay();
    if(w!==0&&w!==6)days.push(d.toISOString().slice(0,10).replace(/-/g,""));off++;}}
  const sane=(o)=>{ if(!o)return false;
    const a=[o.개인,o.외국인,o.기관];
    if(!a.every(v=>isFinite(v)&&Math.abs(v)<300000))return false;   /* 하루 순매수 30조 초과는 파싱 오류로 본다 */
    return a.some(v=>v!==0); };
  /* ① 네이버 금융 — 투자자별 매매동향(일별) */
  const tryNaver=async(mk)=>{
    for(const bd of [days[0],days[1]]){
      if(!bd)continue;
      try{
        const u="https://finance.naver.com/sise/investorDealTrendDay.naver?bizdate="+bd
          +"&sosok="+(mk==="kospi"?"01":"02");
        const c=new AbortController();const t=setTimeout(()=>c.abort(),6500);
        const r=await fetch(u,{headers:{ "User-Agent": UA20, Accept:"text/html,*/*",
          "Accept-Language":"ko", Referer:"https://finance.naver.com/sise/" },signal:c.signal});
        clearTimeout(t);
        if(!r.ok){out.diag.push("nv/"+mk+":"+r.status);continue;}
        const h=decodeSmart9(await r.arrayBuffer(),r.headers.get("content-type"));
        const rows=[...h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(x=>x[1]);
        for(const row of rows){
          const tds=[...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
            .map(t2=>t2[1].replace(/<[^>]*>/g,"").replace(/&nbsp;/gi," ").trim());
          if(tds.length<4)continue;
          if(!/^\d{2}\.\d{2}\.\d{2}$/.test(tds[0]))continue;   /* 표 첫 데이터 행 = 가장 최근 날짜 */
          const o={date:tds[0],개인:Math.round(num(tds[1])),외국인:Math.round(num(tds[2])),기관:Math.round(num(tds[3]))};
          if(sane(o))return o;
        }
        out.diag.push("nv/"+mk+":norow@"+bd);
      }catch(e){ out.diag.push("nv/"+mk+":"+String(e).slice(0,14)); }
    }
    return null;
  };
  /* ② KRX 정보데이터시스템 — 네이버가 막힌 날의 예비 경로 */
  const tryKrx=async(key,mkId)=>{
    for(const ymd2 of days){
      try{
        const body=new URLSearchParams({
          bld:"dbms/MDC/STAT/standard/MDCSTAT02201",
          locale:"ko_KR", mktId:mkId, trdDd:ymd2, share:"1", money:"1", csvxls_isNo:"false"});
        /* [v9.85] krxPost 로 통일 — 세션 획득과 LOGOUT 재시도가 함께 적용된다 */
        const rr=await krxPost("https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd",
          Object.fromEntries(body), 7000);
        if(rr.bad){out.diag.push("krx/"+key+":"+String(rr.bad).slice(0,12));continue;}
        const j=rr.j;
        const rows=(j&&(j.output||j.OutBlock_1))||[];
        if(!rows.length){out.diag.push("krx/"+key+":empty@"+ymd2);continue;}
        const pick=(nm)=>{const f=rows.find(x=>String(x.INVST_TP_NM||x.INVST_NM||"").includes(nm));
          return f?Math.round(num(f.NETBID_TRDVAL)/1e8):0;};   /* money:"1" = 원 → 억원 */
        const o={date:ymd2.slice(2,4)+"."+ymd2.slice(4,6)+"."+ymd2.slice(6),
          개인:pick("개인"),외국인:pick("외국인"),기관:pick("기관")};
        if(sane(o))return o;
        out.diag.push("krx/"+key+":zero@"+ymd2);
      }catch(e){ out.diag.push("krx/"+key+":"+String(e).slice(0,14)); }
    }
    return null;
  };
  let [a,b]=await Promise.all([tryNaver("kospi"),tryNaver("kosdaq")]);
  if(!a)a=await tryKrx("kospi","STK");
  if(!b)b=await tryKrx("kosdaq","KSQ");
  out.kospi=a; out.kosdaq=b;
  out.ok=!!(a||b);
  out.at=new Date(Date.now()+9*3600e3).toISOString().slice(0,16).replace("T"," ")+" KST";
  return new Response(JSON.stringify(out),{headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"public, max-age=120, s-maxage=120",
    "access-control-allow-origin":"*"}});
}
ROUTES["invtrend"]=invtrend_default;
ROUTES["k200nf"]=k200nf_default;
ROUTES["k200nfdiag"]=k200nfdiag_default;
/* ══ [v6.7] 구글 간편 로그인 ═══════════════════════════════════════════════
   [흐름] ① 버튼을 누르면 서버가 무작위 state 를 만들어 보관하고 구글로 보낸다
          ② 구글이 사용자 확인 뒤 code 를 들고 이 주소로 되돌아온다
          ③ state 가 맞는지 확인(위조 요청 차단) → code 를 토큰으로 바꾼다
          ④ 토큰으로 이메일·이름을 받아 계정을 찾거나 새로 만든다
          ⑤ 한 번만 쓸 수 있는 표(ticket)를 주고 앱으로 돌려보낸다
          ⑥ 앱이 그 표로 계정 정보를 받아 로그인 상태가 된다
   [보안] · 시크릿은 코드에 없고 환경변수(GOOGLE_CLIENT_SECRET)에서만 읽는다
          · state·ticket 모두 짧게 살고 한 번 쓰면 사라진다
          · 계정 비밀번호는 무작위로 만들어 서버가 보관한다(사용자가 알 필요 없음) */
function oaOrigin(req2){
  try{ const u=new URL(req2.url); return u.origin; }catch(e){ return ""; }
}
function oaRand(n){
  const b=new Uint8Array(n||24); crypto.getRandomValues(b);
  return [...b].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function oauth_google_default(req2, ctx){
  const env=(ctx&&ctx.env)||_ENV||{};
  const CID=env.GOOGLE_CLIENT_ID||"";
  const CSEC=env.GOOGLE_CLIENT_SECRET||"";
  const url=new URL(req2.url);
  const origin=oaOrigin(req2);
  const redirect=origin+"/api/oauth/google";
  let st; try{ st=await stores(); }catch{ return json2({ok:false,err:"nostore"}); }

  /* ⑥ 앱이 표를 들고 와 계정 정보를 받아 간다 */
  /* ══ [v8.0] 가입 마무리 — 앱이 받아 온 본인 정보로 계정을 만든다 ═══════════ */
  if(url.searchParams.get("finish")==="1"){
    if(req2.method!=="POST")return json2({ok:false,err:"method"});
    const ck0=req2.headers.get("cookie")||"";
    const mp=/(?:^|;\s*)oa_p=([^;]+)/.exec(ck0);
    if(!mp)return json2({ok:false,err:"expired"});
    let pend=null;
    try{ pend=JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(mp[1]))))); }catch(e){}
    if(!pend||!pend.email)return json2({ok:false,err:"expired"});
    if(Date.now()-(pend.at||0)>900000)return json2({ok:false,err:"expired"});
    let body={}; try{ body=await req2.json(); }catch(e){}
    const db2=await readAccDb(st);
    db2.accounts=db2.accounts||{}; db2.users=db2.users||{};
    const uid2=String(pend.email);
    /* 그 사이 같은 계정이 생겼으면 그것을 그대로 쓴다 */
    const pass2="s"+oaRand(32);
    let acc2=null;
    try{ acc2=await accLoad(st.acc,uid2,db2); }catch(e){}
    acc2=acc2||db2.accounts[uid2]||{created:Date.now()};
    acc2.name=clip(body.name||pend.gname||uid2,20);
    acc2.email=pend.email;
    acc2.googleSub=pend.sub;
    acc2.realName=clip(body.realName,20);
    acc2.birth=clip(body.birth,10);
    acc2.phone=clip(body.phone,16);
    acc2.terms={...(body.terms||{}),at:Date.now()};
    acc2.salt=oaRand(16);
    acc2.hash=await sha2562(acc2.salt+"|"+pass2);
    delete acc2.pass;
    db2.accounts[uid2]=acc2;
    await accSave(st.acc,uid2,acc2);      /* [v9.75] */
    /* [v9.74] 가입 마무리도 계정별 키를 먼저 본다 — 재가입 시 기존 데이터를
       빈 값으로 덮지 않기 위해서다. */
    let guser2=null;
    try{ guser2=await usrLoad(st.acc,uid2,db2); }catch(e){}
    if(guser2==null){
      guser2={watchlist:[],watchFolders:[],holdings:[],cash:0,
        usdCash:0,ipoPlans:[],acctType:"general",acctActive:"",acctList:[],acctBooks:{}};
      try{ await usrSave(st.acc,uid2,guser2); }catch(e){}
    }
    db2.users[uid2]=guser2;
    dbCacheSet(db2);
    /* [v9.75] 계정·사용자 모두 제 키에 저장했으므로 공유 키는 쓰지 않는다 */
    const hh=new Headers({"content-type":"application/json; charset=utf-8","cache-control":"no-store"});
    hh.append("set-cookie","oa_p=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax");
    return new Response(JSON.stringify({ok:true,id:uid2,pass:pass2,
      name:acc2.name,email:acc2.email,user:guser2}),{headers:hh});
  }
  /* 보류 정보 조회 — 가입 창에 미리 채울 값 */
  if(url.searchParams.get("pending")==="1"){
    const ck1=req2.headers.get("cookie")||"";
    const m1=/(?:^|;\s*)oa_p=([^;]+)/.exec(ck1);
    if(!m1)return json2({ok:false,err:"expired"});
    let p1=null;
    try{ p1=JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m1[1]))))); }catch(e){}
    if(!p1||!p1.email)return json2({ok:false,err:"expired"});
    return json2({ok:true,email:p1.email,gname:p1.gname||""});
  }
  const claim=url.searchParams.get("claim");
  if(claim){
    /* [v7.4] 쿠키에서 꺼낸다 — 시차가 없어 확실하다 */
    const ck=req2.headers.get("cookie")||"";
    const m=/(?:^|;\s*)oa_t=([^;]+)/.exec(ck);
    if(!m)return json2({ok:false,err:"expired",why:"nocookie"});
    let t=null;
    try{ t=JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); }catch(e){}
    if(!t||!t.id)return json2({ok:false,err:"expired",why:"bad"});
    if(Date.now()-(t.at||0)>180000)return json2({ok:false,err:"expired",why:"old"});
    /* 한 번 쓰면 지운다 */
    const h=new Headers({"content-type":"application/json; charset=utf-8","cache-control":"no-store"});
    h.append("set-cookie","oa_t=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax");
    return new Response(JSON.stringify({ok:true,...t}),{headers:h});
  }

  /* [v7.2] 설정이 빠졌을 때 날것의 JSON 을 보여 주면 사용자는 무엇을 해야 할지
     알 수 없다. 앱으로 돌려보내 화면 안에서 안내한다. */
  if(!CID||!CSEC){
    if(url.searchParams.get("json")==="1")
      return json2({ok:false,err:"noconfig",
        detail:"GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 환경변수가 필요합니다"});
    return Response.redirect(origin+"/?glogin=noconfig",302);
  }

  const code=url.searchParams.get("code");
  const back=(m)=>Response.redirect(origin+"/?glogin="+encodeURIComponent(m),302);

  /* ① 시작 — 구글로 보낸다 */
  if(!code){
    const state=oaRand(16);
    /* [v7.4] state 도 KV 대신 쿠키에 둔다. 표와 같은 이유이고,
       '보낸 쪽과 받은 쪽이 같은 브라우저인가'를 확인하는 표준 방식이다. */
    await st.clan.setJSON("oa:st:"+state,{at:Date.now()}).catch(()=>{});   // 예비
    const a=new URL("https://accounts.google.com/o/oauth2/v2/auth");
    a.searchParams.set("client_id",CID);
    a.searchParams.set("redirect_uri",redirect);
    a.searchParams.set("response_type","code");
    a.searchParams.set("scope","openid email profile");
    a.searchParams.set("state",state);
    a.searchParams.set("prompt","select_account");
    const h=new Headers();
    h.set("location",a.toString());
    h.append("set-cookie","oa_s="+state
      +"; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax");
    return new Response(null,{status:302,headers:h});
  }

  /* ③ 돌아왔다 — state 확인 */
  const state=String(url.searchParams.get("state")||"").replace(/[^a-f0-9]/g,"").slice(0,64);
  /* [v7.4] 쿠키에 담아 둔 값과 대조한다. 쿠키가 없으면 KV 로 한 번 더 본다
     (쿠키를 막아 둔 브라우저를 위한 예비 경로다). */
  let okState=false;
  try{
    const ck=req2.headers.get("cookie")||"";
    const m=/(?:^|;\s*)oa_s=([a-f0-9]+)/.exec(ck);
    if(m&&state&&m[1]===state)okState=true;
  }catch(e){}
  if(!okState&&state){
    const kv=await st.clan.get("oa:st:"+state,{type:"json"}).catch(()=>null);
    if(kv)okState=true;
  }
  if(!okState)return back("state");
  await st.clan.delete("oa:st:"+state).catch(()=>{});

  try{
    /* ④ code → 토큰 → 사용자 정보 */
    const tr=await fetchOpt("https://oauth2.googleapis.com/token",{method:"POST",
      headers:{"content-type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({code,client_id:CID,client_secret:CSEC,
        redirect_uri:redirect,grant_type:"authorization_code"})});
    if(!tr.ok)return back("token");
    const tj=await tr.json();
    if(!tj||!tj.access_token)return back("token");
    const ur=await fetchOpt("https://www.googleapis.com/oauth2/v3/userinfo",
      {headers:{authorization:"Bearer "+tj.access_token}});
    if(!ur.ok)return back("profile");
    const uj=await ur.json();
    const email=String(uj&&uj.email||"").trim().toLowerCase();
    if(!email||uj.email_verified===false)return back("email");
    const gname=clip(uj.name||email.split("@")[0],12);
    const gsub=String(uj.sub||"");

    /* ⑤ 계정을 찾거나 만든다 */
    const db=await st.acc.get("db",{type:"json"}).catch(()=>null)||{accounts:{},users:{}};
    db.accounts=db.accounts||{}; db.users=db.users||{};
    /* [v9.75] 전체 계정을 훑는 대신 되찾기 키(gsub:… / mail:…)로 바로 찾는다.
       예전 계정은 그 키가 아직 없으므로 옛 db 도 함께 살핀다. */
    let uid=await accFindByGoogle(st.acc,gsub,email,db)||"";
    let created=false;
    /* ══ [v8.0] 처음 오는 사람은 계정을 바로 만들지 않는다 ═══════════════════
       일반 가입과 같은 창에서 본인 정보와 약관을 받은 뒤에 만든다.
       여기서는 구글이 알려 준 것만 담아 보내고, 앱이 창을 띄운다. */
    if(!uid){
      const pend={pending:1,sub:gsub,email,gname,at:Date.now()};
      const b64p=btoa(unescape(encodeURIComponent(JSON.stringify(pend))));
      const hp=new Headers();
      hp.set("location",origin+"/?glogin=new");
      hp.append("set-cookie","oa_p="+encodeURIComponent(b64p)
        +"; Max-Age=900; Path=/; HttpOnly; Secure; SameSite=Lax");
      hp.append("set-cookie","oa_s=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax");
      return new Response(null,{status:302,headers:hp});
    }
    /* (신규 계정 생성은 위 보류 흐름과 아래 finish 에서 처리한다) */
    /* 서버가 보관하는 무작위 비밀번호 — 사용자는 몰라도 되고, 앱이 서버와 통신할 때만 쓴다 */
    const pass="s"+oaRand(32);
    let acc=null;
    try{ acc=await accLoad(st.acc,uid,db); }catch(e){}
    acc=acc||db.accounts[uid]||{name:gname,email,created:Date.now()};
    acc.name=acc.name||gname;
    acc.email=acc.email||email;
    acc.googleSub=gsub;
    acc.salt=oaRand(16);
    acc.hash=await sha2562(acc.salt+"|"+pass);
    delete acc.pass;
    db.accounts[uid]=acc;
    await accSave(st.acc,uid,acc);        /* [v9.75] 계정별 키에 */
    /* ══ [v9.74] 구글 로그인도 사용자 데이터는 계정별 키에서 읽고 쓴다 ═══════
       예전에는 db.users[uid] 만 봤기 때문에, 이미 usr:<uid> 로 옮겨진 사람이
       구글로 로그인하면 '빈 계정'을 새로 만들어 쿠키에 실어 보냈다.
       앱은 그 빈 데이터를 받아 화면에 덮어썼을 것이다 — 보유 종목이 사라지는
       종류의 사고다. 반드시 계정별 키를 먼저 확인한다. */
    let guser=null;
    try{ guser=await usrLoad(st.acc,uid,db); }catch(e){}
    if(guser==null){
      guser={watchlist:[],watchFolders:[],holdings:[],cash:0,
        usdCash:0,ipoPlans:[],acctType:"general",acctActive:"",acctList:[],acctBooks:{}};
      try{ await usrSave(st.acc,uid,guser); }catch(e){}
    }
    db.users[uid]=guser;
    dbCacheSet(db);                       // [v7.5] 방금 쓴 계정을 기억해 둔다
    /* [v9.75] 계정·사용자 모두 제 키에 저장했으므로 공유 키는 쓰지 않는다 */

    /* ══ [v7.4] 표를 KV 에 두면 못 받는다 ═══════════════════════════════════
       [무엇이 문제였나] KV 는 쓴 값이 전 세계에 퍼지는 데 시간이 걸린다(최대 1분).
       그런데 이 표는 쓴 직후 1초 안에 브라우저가 읽어 간다. 아직 퍼지지 않아
       '없는 표'로 나오고, 앱은 로그인에 실패한 것으로 판단해 로그인 창을 띄웠다.
       (게다가 setJSON 은 세 번째 인자를 받지 않아 만료 설정도 무시되고 있었다)
       [고침] 쿠키로 건네준다. 쿠키는 같은 응답에 실려 오므로 시차가 없다.
       HttpOnly 라 자바스크립트가 훔쳐볼 수 없고, 3분 뒤 저절로 사라진다. */
    const payload={id:uid,pass,name:acc.name,email:acc.email,
      created:!!created,user:guser,at:Date.now()};
    const b64=btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const h=new Headers();
    h.set("location",origin+"/?glogin=ok");
    h.append("set-cookie","oa_t="+encodeURIComponent(b64)
      +"; Max-Age=180; Path=/; HttpOnly; Secure; SameSite=Lax");
    /* 표를 다 썼으니 위조 방지용 쿠키는 지운다 */
    h.append("set-cookie","oa_s=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax");
    return new Response(null,{status:302,headers:h});
  }catch(e){ return back("error"); }
}
/* ══ [v7.2] 로그인 설정 진단 ═══════════════════════════════════════════════
   'noconfig' 가 떴을 때 무엇이 빠졌는지 눈으로 확인할 수 있게 한다.
   값 자체는 절대 내보내지 않는다 — 있는지 없는지와 길이만 알려 준다. */
async function oauthdiag_default(req2, ctx){
  const env=(ctx&&ctx.env)||_ENV||{};
  const has=(k)=>{
    const v=env[k];
    return { 있음:!!v, 길이:v?String(v).length:0,
      끝4자리:v?("…"+String(v).slice(-4)):"" };
  };
  const cid=env.GOOGLE_CLIENT_ID||"", csec=env.GOOGLE_CLIENT_SECRET||"";
  let 진단="정상";
  if(!cid&&!csec)진단="둘 다 없음 — wrangler.toml 의 [vars] 에 GOOGLE_CLIENT_ID 를 넣고, 시크릿은 `npx wrangler secret put GOOGLE_CLIENT_SECRET` 로 넣으세요";
  else if(!cid)진단="GOOGLE_CLIENT_ID 없음 — wrangler.toml 의 [vars] 에 넣으세요";
  else if(!csec)진단="GOOGLE_CLIENT_SECRET 없음 — `npx wrangler secret put GOOGLE_CLIENT_SECRET` 로 넣으세요";
  else if(!/apps\.googleusercontent\.com$/.test(cid))진단="GOOGLE_CLIENT_ID 형식이 이상합니다(끝이 apps.googleusercontent.com 이어야 합니다)";
  const origin=(()=>{try{return new URL(req2.url).origin;}catch(e){return"";}})();
  return new Response(JSON.stringify({
    진단,
    GOOGLE_CLIENT_ID:has("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET:has("GOOGLE_CLIENT_SECRET"),
    구글에_등록해야_하는_주소:origin+"/api/oauth/google",
    KV연결:!!env.APP_KV
  },null,1),{headers:{"content-type":"application/json; charset=utf-8",
    "cache-control":"no-store"}});
}
ROUTES["oauthdiag"]=oauthdiag_default;
ROUTES["oauth/google"]=oauth_google_default;
ROUTES["xfer"]=xfer_default;
ROUTES["usnews"]=usnews_default;
ROUTES["usinfo"]=usinfo_default;
ROUTES["usall"]=usall_default;
ROUTES["usview"]=usview_default;
ROUTES["uspopular"]=uspopular_default;
ROUTES["usdiag"]=usdiag_default;


async function onRequest(ctx) {
  const { request, env, waitUntil } = ctx;
  setEnv(env);
  const url = new URL(request.url);
  const name = url.pathname.replace(/^\/api\//, "").replace(/\/+$/, "");
  const h = ROUTES[name];
  if (!h) {
    return new Response(JSON.stringify({ ok: false, error: "unknown endpoint", name }), {
      status: 404,
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  }
  try {
    const res = await h(request, { env, waitUntil: waitUntil ? waitUntil.bind(ctx) : () => {
    }, cf: request.cf });
    return res instanceof Response ? res : new Response(JSON.stringify(res ?? { ok: false }), {
      headers: { "content-type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e).slice(0, 200), at: name }), {
      status: 500,
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  }
}

// _worker.js
/* ══ [v5.3.1] 이 값은 version-info.js 의 version 과 반드시 같아야 한다 ═══════
   PWA 설치 정보와 진단에 쓰인다. 판을 올릴 때 이 줄만 빠뜨려도 겉으로는
   아무 문제가 없어 보이므로, 배포 전에 두 값을 대조하는 검사를 함께 돌린다. */
var APP_VER = "12.2.0";
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      /* ══ [v9.97] 전체 사용량을 서버가 센다 ═══════════════════════════════════
         [무엇이 문제였나] 지금까지 호출 예산(fnbudget)은 브라우저의 localStorage 에
         저장돼, 사람마다 '자기가 쓴 양'만 알았다. A 가 8만 회를 써도 B 는 0 회로
         알고 가장 빠른 단계로 붙는다. Cloudflare 무료 한도는 하루 10만 요청인데
         한 사람이 장중 2.3만 회를 쓰므로, 넷만 모여도 한도에 닿는다.
         한도를 넘으면 앱 전체가 죽는다 — 시세도 로그인도 안 된다.
         [고침] 서버가 전체 요청 수를 세어 응답 헤더로 알려 준다. 화면은 그 값을
         보고 스스로 속도를 낮춘다. 각자 아끼는 게 아니라 다 같이 아끼는 구조다.
         [비용] 카운터는 워커 메모리에 두고 KV 에는 1분에 한 번만 적는다 —
         요청마다 KV 를 쓰면 그것 때문에 쓰기 한도(1,000/일)가 먼저 터진다. */
      try { budgetTick(env); } catch (e) {}
      /* ══ [v9.73] 외부호출(subrequest) 실측 계측 ═══════════════════════════════
         Cloudflare Workers 는 한 요청이 만들 수 있는 외부호출이 50회다. 넘으면
         그 뒤 호출이 전부 실패하는데, 우리 코드는 try/catch 로 감싸 둔 곳이 많아
         '데이터가 좀 부족한 날'처럼 조용히 넘어간다 — 가장 찾기 어려운 종류의 고장이다.
         호출 수를 세어 응답 헤더(x-subreq)로 내보내면, 어느 라우트가 한도에
         가까운지 추측이 아니라 숫자로 볼 수 있다. 한도에 근접하면 로그도 남긴다. */
      const _origFetch = globalThis.fetch;
      let _n = 0;
      globalThis.fetch = function (...a) { _n++; return _origFetch.apply(this, a); };
      try {
        const r = await onRequest({ request, env, waitUntil: ctx.waitUntil.bind(ctx), next: () => env.ASSETS.fetch(request) });
        try {
          const h = new Headers(r.headers);
          h.set("x-subreq", String(_n));
          /* [v9.97] 오늘 전체 사용량(%) — 화면이 이 값을 보고 속도를 낮춘다 */
          try { h.set("x-budget", String(budgetPct())); } catch (e) {}
          if (_n >= 42) { h.set("x-subreq-warn", "near-limit"); console.log("[subreq] " + url.pathname + " = " + _n + "/50"); }
          return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
        } catch (e) { return r; }
      } finally { globalThis.fetch = _origFetch; }
    }
    /* ══ [v4.21 · 정정] v4.18 의 진단은 틀렸다 ═══════════════════════════════
       _headers 는 Pages 전용이 아니라 Workers 정적 자산에서도 정식 지원된다.
       진짜 문제는 두 가지였다.
         ① Workers 는 run_worker_first 가 꺼져 있으면(기본값) 요청 경로와 일치하는
            자산을 워커를 거치지 않고 바로 내보낸다. 즉 아래 헤더 주입 코드는
            /icon-*.png · /manifest.webmanifest 에 대해 한 번도 실행되지 않았다.
         ② 그런데도 v4.18 에서 _headers 를 .assetsignore 에 넣어 업로드를 막아,
            유일하게 동작하던 통제 수단마저 꺼 버렸다.
       → 헤더 통제는 _headers 로 되돌리고, 아이콘은 파일명에 버전을 박아
         어떤 캐시도 본 적 없는 새 주소로 배포한다(가장 확실한 방법).
       아래 블록은 자산이 없을 때만 도달하므로 사실상 예비 경로다. */
    const res = await env.ASSETS.fetch(request);
    const p = url.pathname;
    /* ══ [v4.23] 매니페스트를 워커가 직접 만들어 준다 ═══════════════════════
       [왜] Chrome 은 '전에 본 매니페스트'와 지금 것을 비교해 갱신을 판정한다.
       정적 파일로 두면 배포 때 내용이 안 바뀔 수도 있고(아이콘 파일명을 고정했으므로),
       엣지 캐시에 걸리면 새 내용이 전달되지 않는다.
       → 주소는 /manifest.webmanifest 로 영구 고정하되, 내용은 매 요청 시 현재
         배포 버전을 박아 생성한다. 버전이 오르면 매니페스트가 확실히 달라지고,
         Chrome 은 그 차이를 보고 아이콘 재검사(해시 비교)를 예약한다.
       run_worker_first 가 꺼져 있으면 정적 자산이 먼저 나가므로,
       manifest.webmanifest 는 .assetsignore 로 자산에서 제외해 여기로 오게 한다. */
    if (p === "/manifest.webmanifest") {
      const body = JSON.stringify({
        name: "LIVE\uC99D\uAD8C \u2014 \uC2E4\uC2DC\uAC04 \uBAA8\uC758\uD22C\uC790",
        short_name: "LIVE\uC99D\uAD8C",
        id: "/", start_url: "/", scope: "/",
        display: "standalone", orientation: "any",
        background_color: "#0d1424", theme_color: "#0d1424",
        lang: "ko-KR", dir: "ltr",
        categories: ["finance", "education"],
        version: APP_VER,
        description: "\uC2E4\uC2DC\uAC04 \uC2DC\uC138\uB85C \uC5F0\uC2B5\uD558\uB294 \uAD6D\uB0B4\u00B7\uD574\uC678 \uC8FC\uC2DD \uBAA8\uC758\uD22C\uC790 \u00B7 v" + APP_VER,
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      }, null, 2);
      return new Response(body, { headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "no-cache, must-revalidate",
        "access-control-allow-origin": "*"
      } });
    }
    if (/^\/icon-[\w-]+\.png$/.test(p)
        || p === "/favicon.png" || p === "/" || p === "/index.html") {
      const h = new Headers(res.headers);
      h.set("cache-control", "no-cache, must-revalidate");
      if (/\.webmanifest$/.test(p)) h.set("content-type", "application/manifest+json; charset=utf-8");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }
    return res;
  }
};
export {
  worker_default as default
};
