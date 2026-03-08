const GEOJSON_FILES = [{ key: "taiwan", url: "./js/taiwan.geojson" }];
const CACHE_KEY = "tw_lighthouses_historical_sidebar_v6_ports_hatched_fishing";
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const statusText = document.getElementById("statusText");
const retryBtn = document.getElementById("retryBtn");
const summaryCount = document.getElementById("summaryCount");
const summaryMode = document.getElementById("summaryMode");
const summaryEra = document.getElementById("summaryEra");

const eraFilterEl = document.getElementById("eraFilter");
const togglePortsEl = document.getElementById("togglePorts");
const toggleHistoricStylingEl = document.getElementById("toggleHistoricStyling");
const toggleFishingGroundsEl = document.getElementById("toggleFishingGrounds");

function setStatus(msg, canRetry = false) {
  statusText.textContent = msg;
  retryBtn.style.display = canRetry ? "inline-flex" : "none";
}

retryBtn.addEventListener("click", () => location.reload());

if (location.protocol === "file:") {
  setStatus("Tip: run a local server first: python3 -m http.server 8000");
}

function rgba(rgb, alpha) {
  return `rgba(${rgb},${alpha})`;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function guessName(feature) {
  const p = feature.properties || {};
  return (
    p.name ||
    p["name:en"] ||
    p["name:zh"] ||
    p["name:zh-Hant"] ||
    p["seamark:name"] ||
    p.title ||
    "Lighthouse"
  );
}

function getCandidateNames(feature) {
  const p = feature.properties || {};
  return [
    p.name,
    p["name:en"],
    p["name:zh"],
    p["name:zh-Hant"],
    p["seamark:name"],
    p.title
  ].filter(Boolean);
}

function getLatLngFromFeature(feature) {
  const g = feature.geometry;
  if (!g) return null;

  if (g.type === "Point" && Array.isArray(g.coordinates)) {
    return [g.coordinates[1], g.coordinates[0]];
  }

  try {
    const tmp = L.geoJSON(feature);
    const b = tmp.getBounds();
    if (b && b.isValid()) {
      const c = b.getCenter();
      return [c.lat, c.lng];
    }
  } catch {}

  return null;
}

function featureId(feature, fallbackKey) {
  const p = feature.properties || {};
  const raw = p.id || p["@id"] || p.osm_id || null;
  if (raw) return String(raw);

  const ll = getLatLngFromFeature(feature);
  const n = guessName(feature);
  return ll
    ? `${fallbackKey}:${n}:${ll[0].toFixed(6)},${ll[1].toFixed(6)}`
    : `${fallbackKey}:${n}`;
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.t || !obj.data) return null;
    if ((Date.now() - obj.t) > CACHE_TTL_MS) return null;
    return obj.data;
  } catch {
    return null;
  }
}

function saveCache(fc) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: fc }));
  } catch {}
}

async function fetchGeoJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

async function loadMerged() {
  const cached = loadCache();
  if (cached && cached.type === "FeatureCollection" && Array.isArray(cached.features)) {
    setStatus(`Loaded from cache: ${cached.features.length} features.`);
    return cached;
  }

  setStatus("Loading ./js/taiwan.geojson …");

  const results = await Promise.all(
    GEOJSON_FILES.map(async (f) => ({
      key: f.key,
      geojson: await fetchGeoJson(f.url)
    }))
  );

  const seen = new Set();
  const merged = { type: "FeatureCollection", features: [] };

  for (const r of results) {
    const feats = r.geojson?.features || [];
    for (const feat of feats) {
      const id = featureId(feat, r.key);
      if (seen.has(id)) continue;
      seen.add(id);
      merged.features.push(feat);
    }
  }

  saveCache(merged);
  setStatus(`Loaded: ${merged.features.length} unique features.`);
  return merged;
}

/* =========================================================
   LIGHTHOUSE HISTORY
   ========================================================= */

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[()\-_,./]/g, " ")
    .replace(/\b(lighthouse|light|beacon|tower|port|harbor|harbour)\b/g, "")
    .replace(/燈塔/g, "")
    .replace(/燈桿/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const HISTORICAL_LOOKUP = [
  { aliases: ["yuwengdao", "xiyu", "西嶼", "西嶼燈塔", "漁翁島", "漁翁島燈塔"], year_built: 1875, era: "Qing", note: "Current lighthouse built in 1875 on the site of earlier beacon structures." },
  { aliases: ["eluanbi", "oluanpi", "eluan pi", "鵝鑾鼻", "鵝鑾鼻燈塔"], year_built: 1883, era: "Qing", note: "Built during the late Qing period; rebuilt after wartime damage." },
  { aliases: ["kaohsiung", "takao", "高雄", "高雄燈塔", "旗後", "旗后", "cijin", "qihou"], year_built: 1883, era: "Qing", note: "Originally Qing-era; rebuilt and expanded under Japanese harbor development." },
  { aliases: ["wuqiu", "wuchiu", "wu chiu", "wu-chiu", "烏坵"], year_built: 1874, era: "Qing", note: "19th-century light later damaged in war and restored." },

  { aliases: ["bitoujiao", "bitou jiao", "bitou cape", "鼻頭角", "鼻頭角燈塔"], year_built: 1897, era: "Japanese", note: "Originally built under Japanese rule; current structure restored later." },
  { aliases: ["baishajia", "paisha chia", "白沙岬", "白沙岬燈塔"], year_built: 1902, era: "Japanese", note: "Established during Japanese rule; upper portion was later destroyed in WWII." },
  { aliases: ["dongyong", "dongyin", "東湧", "東湧燈塔"], year_built: 1904, era: "Japanese", note: "Construction completed in 1904 after planning in 1902." },
  { aliases: ["pengjia", "pengjia islet", "彭佳嶼", "彭佳嶼燈塔"], year_built: 1909, era: "Japanese", note: "Service started in 1909 after construction from 1906 to 1908." },
  { aliases: ["cape santiago", "santiago", "三貂角", "三貂角燈塔", "sandiaojiao"], year_built: 1935, era: "Japanese", note: "Northeast cape lighthouse completed during Japanese rule." },
  { aliases: ["qilaibi", "奇萊鼻", "奇萊鼻燈塔"], year_built: 1931, era: "Japanese", note: "Original lighthouse built in 1931; later rebuilt on the same base." },
  { aliases: ["qimei", "七美", "七美嶼", "七美嶼燈塔"], year_built: 1939, era: "Japanese", note: "Last lighthouse built by the Japanese government in Taiwan." },
  { aliases: ["ludao", "lyudao", "green island", "綠島", "綠島燈塔"], year_built: 1939, era: "Japanese", note: "Built after the SS President Hoover wreck; rebuilt by ROC in 1948." },
  { aliases: ["keelung island", "基隆島", "基隆島燈塔"], year_built: null, era: "Japanese", note: "Likely established during Japanese rule." },
  { aliases: ["keelung", "基隆", "基隆燈塔"], year_built: null, era: "Japanese", note: "Likely established during Japanese rule." },
  { aliases: ["ciouzishan", "chiutzu shan", "球子山", "球子山燈塔"], year_built: null, era: "Japanese", note: "Likely established during Japanese rule." },
  { aliases: ["suao", "蘇澳", "蘇澳燈塔"], year_built: null, era: "Japanese", note: "Likely established during Japanese rule." },
  { aliases: ["hualien port", "花蓮港", "花蓮港燈塔", "花蓮港紅燈塔"], year_built: null, era: "Japanese", note: "Likely associated with Japanese-era harbor development." },
  { aliases: ["mudouyu", "目斗嶼", "目斗嶼燈塔"], year_built: null, era: "Japanese", note: "Likely established during Japanese rule." },
  { aliases: ["huayu", "花嶼", "花嶼燈塔"], year_built: null, era: "Japanese", note: "Likely established during Japanese rule." },
  { aliases: ["chamu", "查母嶼", "查母嶼燈塔"], year_built: null, era: "Japanese", note: "Likely established during Japanese rule." },
  { aliases: ["dongji", "東吉嶼", "東吉嶼燈塔"], year_built: null, era: "Japanese", note: "Likely established during Japanese rule." },
  { aliases: ["dongquan", "東莒島", "東莒島燈塔"], year_built: null, era: "Japanese", note: "Likely established during Japanese rule." },

  { aliases: ["fuguijiao", "富貴角", "富貴角燈塔"], year_built: 1949, year_lit: 1962, era: "ROC", note: "Postwar lighthouse at Taiwan’s northern cape." },
  { aliases: ["gaomei", "高美", "高美燈塔"], year_built: 1967, era: "ROC", note: "Defunct lighthouse later opened as a tourism site." },
  { aliases: ["fangyuan", "芳苑", "芳苑燈塔"], year_built: 1983, era: "ROC", note: "One of the newest lighthouses in Taiwan." },
  { aliases: ["lanyu", "orchid island", "蘭嶼", "蘭嶼燈塔"], year_built: 1982, era: "ROC", note: "Built on Orchid Island in the early 1980s." },
  { aliases: ["guosheng", "國聖港", "國聖港燈塔"], year_built: 1957, era: "ROC", note: "Postwar lighthouse on Taiwan’s southwest coast." },
  { aliases: ["taiping island", "太平島", "太平島燈塔"], year_built: null, era: "ROC", note: "Modern-era lighthouse in Taiwan-administered South China Sea territory." }
];

function getHistoryForFeature(feature) {
  const names = getCandidateNames(feature);

  for (const raw of names) {
    const n = normalizeName(raw);

    for (const item of HISTORICAL_LOOKUP) {
      for (const alias of item.aliases) {
        const a = normalizeName(alias);
        if (n === a || n.includes(a) || a.includes(n)) {
          return item;
        }
      }
    }
  }

  return {
    year_built: null,
    era: "Modern Restoration",
    note: "Exact historic construction date is not confirmed here; likely modern restoration or later Taiwanese maintenance."
  };
}

function eraColor(era) {
  switch (era) {
    case "Qing": return "#d6b98c";
    case "Japanese": return "#de6b72";
    case "ROC": return "#69b7ff";
    case "Modern Restoration": return "#9aa3b2";
    default: return "#9aa3b2";
  }
}

function eraLabel(era) {
  switch (era) {
    case "Qing": return "Qing";
    case "Japanese": return "Japanese rule";
    case "ROC": return "Republic of China";
    case "Modern Restoration": return "Modern Restoration";
    default: return "Modern Restoration";
  }
}

function eraLabelLong(era) {
  switch (era) {
    case "Qing": return "Qing (1874–1883)";
    case "Japanese": return "Japanese Rule (1897–1939)";
    case "ROC": return "ROC (1949–1983)";
    case "Modern Restoration": return "Modern Restoration (post-1945)";
    default: return "Modern Restoration (post-1945)";
  }
}

/* =========================================================
   DATA FOR NEW PORT LINKS + FISHING GROUNDS
   ========================================================= */

const HISTORIC_PORTS = [
  { id: "keelung", name: "Keelung", lat: 25.153, lng: 121.741, cargo_2023: 62362891 },
  { id: "taichung", name: "Taichung", lat: 24.296, lng: 120.538, cargo_2023: 117064643 },
  { id: "kaohsiung", name: "Kaohsiung", lat: 22.616, lng: 120.300, cargo_2023: 391237217 },
  { id: "hualien", name: "Hualien", lat: 23.972, lng: 121.607, cargo_2023: 8827632 }
];

const SHIPPING_LINKS = [
  {
    name: "Keelung ↔ Taichung",
    coords: [
      [25.15, 121.74],
      [24.95, 121.10],
      [24.70, 120.60],
      [24.30, 120.54]
    ]
  },
  {
    name: "Taichung ↔ Kaohsiung",
    coords: [
      [24.30, 120.54],
      [23.80, 120.28],
      [23.20, 120.18],
      [22.62, 120.30]
    ]
  },
  {
    name: "Keelung ↔ Hualien",
    coords: [
      [25.15, 121.74],
      [24.85, 121.95],
      [24.40, 121.88],
      [23.97, 121.61]
    ]
  },
  {
    name: "Hualien ↔ Kaohsiung",
    coords: [
      [23.97, 121.61],
      [23.45, 121.30],
      [22.95, 121.02],
      [22.62, 120.30]
    ]
  },
  {
    name: "Kaohsiung ↔ Penghu",
    coords: [
      [22.62, 120.30],
      [22.95, 120.00],
      [23.28, 119.72],
      [23.57, 119.56]
    ]
  },
  {
    name: "Taichung ↔ Penghu",
    coords: [
      [24.30, 120.54],
      [24.05, 120.15],
      [23.82, 119.82],
      [23.57, 119.56]
    ]
  },
  {
    name: "Keelung ↔ Northeast Approach",
    coords: [
      [25.15, 121.74],
      [25.35, 121.95],
      [25.65, 122.10],
      [26.00, 122.20]
    ]
  },
  {
    name: "Kaohsiung ↔ Bashi Channel",
    coords: [
      [22.62, 120.30],
      [22.25, 120.45],
      [21.85, 120.65],
      [21.40, 120.82]
    ]
  }
];

const FISHING_GROUNDS = [
  {
    name: "Taiwan Strait Shelf Grounds",
    label: [23.85, 119.55],
    polygon: [
      [25.45, 118.85],
      [25.10, 119.55],
      [24.55, 119.95],
      [23.90, 120.05],
      [23.15, 120.05],
      [22.55, 119.82],
      [22.25, 119.25],
      [22.40, 118.70],
      [23.05, 118.40],
      [24.05, 118.35],
      [24.95, 118.45]
    ]
  },
  {
    name: "Penghu / Taiwan Bank Grounds",
    label: [23.45, 119.00],
    polygon: [
      [24.10, 118.50],
      [23.95, 119.05],
      [23.70, 119.45],
      [23.30, 119.52],
      [23.00, 119.18],
      [22.92, 118.75],
      [23.18, 118.35],
      [23.72, 118.25]
    ]
  },
  {
    name: "Northeast Coast Grounds",
    label: [25.15, 121.95],
    polygon: [
      [25.85, 121.25],
      [25.72, 121.88],
      [25.45, 122.35],
      [25.05, 122.42],
      [24.82, 122.10],
      [24.86, 121.55],
      [25.15, 121.20],
      [25.55, 121.10]
    ]
  },
  {
    name: "Southeast / Green Island–Lanyu Grounds",
    label: [22.45, 121.72],
    polygon: [
      [23.10, 121.10],
      [23.05, 121.85],
      [22.78, 122.18],
      [22.28, 122.25],
      [21.92, 122.02],
      [21.86, 121.48],
      [22.08, 121.10],
      [22.58, 120.98]
    ]
  }
];

function makeTextMarker(html, latlng) {
  return L.marker(latlng, {
    interactive: false,
    icon: L.divIcon({
      className: "",
      iconSize: null,
      iconAnchor: [0, 0],
      html
    })
  });
}

function shippingLabelHTML(name) {
  return `
    <div class="nautical" style="opacity:.82;">
      <span class="sym">↝</span>
      <span class="txt">${escapeHTML(name)}</span>
    </div>
  `;
}

function fishingLabelHTML(name) {
  return `<div class="fishing-label">${escapeHTML(name)}</div>`;
}

function makeHatchPattern(isNight) {
  const size = 12;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = isNight ? "rgba(160,220,255,0.40)" : "rgba(80,85,110,0.35)";
  ctx.lineWidth = 1.2;

  ctx.beginPath();
  ctx.moveTo(-2, size - 2);
  ctx.lineTo(size - 2, -2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(4, size + 2);
  ctx.lineTo(size + 2, 4);
  ctx.stroke();

  return canvas.toDataURL();
}

function buildShippingLinksLayer(isNight = false) {
  const layer = L.layerGroup();
  const items = [];

  function styleSet(night) {
    return {
      halo: {
        color: night ? "rgba(120,220,255,0.14)" : "rgba(80,55,30,0.10)",
        weight: 8,
        opacity: 1
      },
      main: {
        color: night ? "rgba(180,220,255,0.62)" : "rgba(80,55,35,0.48)",
        weight: 2.2,
        opacity: 0.95,
        dashArray: "8 8",
        lineCap: "round",
        lineJoin: "round"
      }
    };
  }

  const styles = styleSet(isNight);

  for (const route of SHIPPING_LINKS) {
    const halo = L.polyline(route.coords, { ...styles.halo, interactive: false });
    const main = L.polyline(route.coords, { ...styles.main, interactive: false });
    const labelPt = route.coords[Math.floor(route.coords.length / 2)];
    const label = makeTextMarker(shippingLabelHTML(route.name), labelPt);

    main.bindPopup(`
      <div style="font-weight:800; margin-bottom:6px;">${escapeHTML(route.name)}</div>
      <div style="font-size:12px; line-height:1.4; color:rgba(232,238,252,.88);">
        Stylized maritime connection between major port approaches.
      </div>
    `);

    layer.addLayer(halo);
    layer.addLayer(main);
    items.push({ halo, main, label });
  }

  let showLabels = false;

  function refreshLabels() {
    for (const item of items) {
      if (showLabels) {
        if (!layer.hasLayer(item.label)) layer.addLayer(item.label);
      } else if (layer.hasLayer(item.label)) {
        layer.removeLayer(item.label);
      }
    }
  }

  layer.setMode = function setMode(night) {
    const s = styleSet(night);
    for (const item of items) {
      item.halo.setStyle(s.halo);
      item.main.setStyle(s.main);
    }
  };

  layer.setLabelVisibility = function setLabelVisibility(flag) {
    showLabels = !!flag;
    refreshLabels();
  };

  layer.setLabelVisibility(false);
  return layer;
}

function buildFishingGroundsLayer(isNight = false) {
  const layer = L.layerGroup();
  const polys = [];
  const labels = [];
  const hatchUrl = makeHatchPattern(isNight);

  function styleSet(night) {
    return {
      color: night ? "rgba(170,105,255,0.45)" : "rgba(70,55,35,0.35)",
      weight: 1.4,
      opacity: 0.95,
      fillColor: night ? "rgba(110,200,255,0.10)" : "rgba(90,120,160,0.09)",
      fillOpacity: night ? 0.18 : 0.14
    };
  }

  const style = styleSet(isNight);

  for (const ground of FISHING_GROUNDS) {
    const poly = L.polygon(ground.polygon, {
      ...style,
      interactive: false
    });

    poly.bindPopup(`
      <div style="font-weight:800; margin-bottom:6px;">${escapeHTML(ground.name)}</div>
      <div style="font-size:12px; line-height:1.4; color:rgba(232,238,252,.88);">
        Stylized fishing-ground overlay for visual comparison with lighthouse distribution.
      </div>
    `);

    const hatchBounds = L.latLngBounds(ground.polygon);
    const hatch = L.imageOverlay(hatchUrl, hatchBounds, {
      opacity: isNight ? 0.42 : 0.32,
      interactive: false
    });

    const label = makeTextMarker(fishingLabelHTML(ground.name), ground.label);

    layer.addLayer(poly);
    layer.addLayer(hatch);

    polys.push({ poly, hatch, polygon: ground.polygon });
    labels.push(label);
  }

  let showLabels = true;

  function refreshLabels() {
    for (const label of labels) {
      if (showLabels) {
        if (!layer.hasLayer(label)) layer.addLayer(label);
      } else if (layer.hasLayer(label)) {
        layer.removeLayer(label);
      }
    }
  }

  layer.setMode = function setMode(night) {
    const s = styleSet(night);
    const newHatch = makeHatchPattern(night);
    for (const item of polys) {
      item.poly.setStyle(s);
      item.hatch.setOpacity(night ? 0.42 : 0.32);
      item.hatch.setUrl(newHatch);
    }
  };

  layer.setLabelVisibility = function setLabelVisibility(flag) {
    showLabels = !!flag;
    refreshLabels();
  };

  layer.setLabelVisibility(true);
  return layer;
}

class GlowDotsLayer extends L.Layer {
  constructor(points, opts = {}) {
    super();
    this.points = points || [];
    this.opts = Object.assign(
      {
        maxR: 18,
        glowR: 56,
        alpha: 0.8,
        twinkle: true,
        twinkleSpeed: 1.15,
        purple: "170,105,255",
        green: "130,255,170"
      },
      opts
    );
    this._frame = null;
    this._t0 = performance.now();
  }

  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create("canvas", "leaflet-zoom-animated");
    this._ctx = this._canvas.getContext("2d");
    map.getPane("overlayPane").appendChild(this._canvas);
    map.on("move zoom resize", this._reset, this);
    this._reset();
    this._animate();
  }

  onRemove(map) {
    map.getPane("overlayPane").removeChild(this._canvas);
    map.off("move zoom resize", this._reset, this);
    cancelAnimationFrame(this._frame);
    this._frame = null;
    this._map = null;
  }

  _reset() {
    const size = this._map.getSize();
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = Math.round(size.x * dpr);
    this._canvas.height = Math.round(size.y * dpr);
    this._canvas.style.width = `${size.x}px`;
    this._canvas.style.height = `${size.y}px`;
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._draw(performance.now());
  }

  _animate() {
    const tick = (t) => {
      this._draw(t);
      this._frame = requestAnimationFrame(tick);
    };
    this._frame = requestAnimationFrame(tick);
  }

  _radial(ctx, x, y, r, outer, inner) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  _draw(tNow) {
    if (!this._map) return;

    const ctx = this._ctx;
    const size = this._map.getSize();
    ctx.clearRect(0, 0, size.x, size.y);
    ctx.globalCompositeOperation = "lighter";

    const dt = (tNow - this._t0) / 1000;
    const zoom = this._map.getZoom();
    const zMul = Math.min(1.7, Math.max(0.65, zoom / 10));

    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const pt = this._map.latLngToLayerPoint([p.lat, p.lng]);
      if (pt.x < -80 || pt.y < -80 || pt.x > size.x + 80 || pt.y > size.y + 80) continue;

      const w = p.w ?? 1;
      let pulse = 1;
      if (this.opts.twinkle) {
        const phase = (i * 0.37) % (Math.PI * 2);
        pulse = 0.72 + 0.28 * Math.sin(dt * this.opts.twinkleSpeed + phase);
      }

      const coreR = (this.opts.maxR * 0.32 + this.opts.maxR * 0.22 * w) * zMul;
      const glowR = this.opts.glowR * (0.55 + 0.55 * w) * zMul;
      const rgb = p.colorKey === "green" ? this.opts.green : this.opts.purple;

      ctx.globalAlpha = this.opts.alpha * 0.26 * pulse;
      this._radial(ctx, pt.x, pt.y, glowR, rgba(rgb, 0), rgba(rgb, 0.52));

      ctx.globalAlpha = this.opts.alpha * 0.44 * pulse;
      this._radial(ctx, pt.x, pt.y, glowR * 0.55, rgba(rgb, 0), rgba(rgb, 0.7));

      ctx.globalAlpha = this.opts.alpha * 0.95 * pulse;
      this._radial(ctx, pt.x, pt.y, coreR, rgba(rgb, 0), rgba(rgb, 0.95));
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

class BeaconBeamsLayer extends L.Layer {
  constructor(points, opts = {}) {
    super();
    this.points = points || [];
    this.opts = Object.assign(
      {
        maxActive: 10,
        coneDeg: 22,
        rangePx: 270,
        speed: 0.88,
        flashSpeed: 2.25,
        dayAlpha: 0.1,
        nightAlpha: 0.22,
        warm: "255,220,150",
        cool: "120,220,255"
      },
      opts
    );
    this._t0 = performance.now();
    this._frame = null;
    this._isNight = false;
    this._active = [];
  }

  setMode(isNight) {
    this._isNight = !!isNight;
  }

  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create("canvas", "leaflet-zoom-animated");
    this._ctx = this._canvas.getContext("2d");
    map.getPane("overlayPane").appendChild(this._canvas);
    map.on("move zoom resize", this._reset, this);
    this._chooseActive();
    this._reset();
    this._animate();
  }

  onRemove(map) {
    map.getPane("overlayPane").removeChild(this._canvas);
    map.off("move zoom resize", this._reset, this);
    cancelAnimationFrame(this._frame);
    this._frame = null;
    this._map = null;
  }

  _chooseActive() {
    const rand = mulberry32(20260213);
    const pts = this.points.slice().sort((a, b) => b.strength - a.strength);
    this._active = pts.slice(0, Math.min(this.opts.maxActive, pts.length)).map((p) => ({
      ...p,
      _phase: rand() * Math.PI * 2,
      _spin: 0.6 + rand() * 0.9
    }));
  }

  _reset() {
    const size = this._map.getSize();
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = Math.round(size.x * dpr);
    this._canvas.height = Math.round(size.y * dpr);
    this._canvas.style.width = `${size.x}px`;
    this._canvas.style.height = `${size.y}px`;
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._draw(performance.now());
  }

  _animate() {
    const tick = (t) => {
      this._draw(t);
      this._frame = requestAnimationFrame(tick);
    };
    this._frame = requestAnimationFrame(tick);
  }

  _draw(tNow) {
    if (!this._map) return;

    const ctx = this._ctx;
    const size = this._map.getSize();
    ctx.clearRect(0, 0, size.x, size.y);

    const dt = (tNow - this._t0) / 1000;
    const zoom = this._map.getZoom();
    const zMul = Math.min(1.55, Math.max(0.8, zoom / 9));
    const range = this.opts.rangePx * zMul;
    const baseA = this._isNight ? this.opts.nightAlpha : this.opts.dayAlpha;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const p of this._active) {
      const pt = this._map.latLngToLayerPoint([p.lat, p.lng]);
      if (pt.x < -200 || pt.y < -200 || pt.x > size.x + 200 || pt.y > size.y + 200) continue;

      const ang = dt * (this.opts.speed * p._spin) + p._phase;
      const flash = 0.35 + 0.65 * Math.max(0, Math.sin(dt * this.opts.flashSpeed + p._phase));
      const alpha = baseA * flash * (0.7 + 0.3 * p.strength);
      const rgb = p.hueKey === "cool" ? this.opts.cool : this.opts.warm;

      const cone = (this.opts.coneDeg * Math.PI) / 180;
      const a1 = ang - cone * 0.5;
      const a2 = ang + cone * 0.5;

      const gx = pt.x + Math.cos(ang) * range;
      const gy = pt.y + Math.sin(ang) * range;

      const grad = ctx.createRadialGradient(pt.x, pt.y, 0, gx, gy, range);
      grad.addColorStop(0, rgba(rgb, 0.85 * alpha));
      grad.addColorStop(0.18, rgba(rgb, 0.4 * alpha));
      grad.addColorStop(1, rgba(rgb, 0));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.arc(pt.x, pt.y, range, a1, a2);
      ctx.closePath();
      ctx.fill();

      const rx = pt.x + Math.cos(ang) * (range * 0.55);
      const ry = pt.y + Math.sin(ang) * (range * 0.55);

      ctx.save();
      ctx.globalAlpha = alpha * 0.45;
      ctx.translate(rx, ry);
      ctx.rotate(ang);
      const w = 10 + 18 * p.strength;
      const h = 80 + 140 * p.strength;
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h));
      rg.addColorStop(0, rgba(rgb, 0.35));
      rg.addColorStop(1, rgba(rgb, 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = alpha * 0.55;
      const core = 6 + 6 * p.strength;
      const cg = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, core * 3.2);
      cg.addColorStop(0, rgba(rgb, 0.85));
      cg.addColorStop(1, rgba(rgb, 0));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, core * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }
}

function addGraticule(map, opts = {}) {
  const step = opts.step ?? 1;
  const color = opts.color ?? "rgba(60,140,210,0.12)";
  const weight = opts.weight ?? 1;
  const labelColor = opts.labelColor ?? "rgba(232,238,252,0.50)";
  const layer = L.layerGroup();
  let lastKey = "";

  function fmt(v, hemiPos, hemiNeg) {
    const a = Math.abs(v).toFixed(0);
    return v >= 0 ? `${a}°${hemiPos}` : `${a}°${hemiNeg}`;
  }

  function redraw() {
    const b = map.getBounds();
    const key = [
      b.getSouth().toFixed(2),
      b.getWest().toFixed(2),
      b.getNorth().toFixed(2),
      b.getEast().toFixed(2),
      map.getZoom()
    ].join("|");

    if (key === lastKey) return;
    lastKey = key;
    layer.clearLayers();

    const west = Math.floor(b.getWest() / step) * step;
    const east = Math.ceil(b.getEast() / step) * step;
    const south = Math.floor(b.getSouth() / step) * step;
    const north = Math.ceil(b.getNorth() / step) * step;
    const padLat = (north - south) * 0.03;
    const padLon = (east - west) * 0.02;

    for (let lon = west; lon <= east; lon += step) {
      layer.addLayer(L.polyline([[south, lon], [north, lon]], { color, weight, interactive: false }));
      layer.addLayer(
        L.marker([south + padLat, lon], {
          interactive: false,
          icon: L.divIcon({
            className: "grat-label",
            html: `<div style="color:${labelColor};font-size:11px;letter-spacing:.3px;text-shadow:0 1px 6px rgba(0,0,0,.55);">${fmt(lon, "E", "W")}</div>`
          })
        })
      );
    }

    for (let lat = south; lat <= north; lat += step) {
      layer.addLayer(L.polyline([[lat, west], [lat, east]], { color, weight, interactive: false }));
      layer.addLayer(
        L.marker([lat, west + padLon], {
          interactive: false,
          icon: L.divIcon({
            className: "grat-label",
            html: `<div style="color:${labelColor};font-size:11px;letter-spacing:.3px;text-shadow:0 1px 6px rgba(0,0,0,.55);">${fmt(lat, "N", "S")}</div>`
          })
        })
      );
    }
  }

  map.on("moveend zoomend", redraw);
  redraw();
  layer.addTo(map);
  return layer;
}

const MAJOR_PLACES = [
  { name: "Taipei", lat: 25.033, lng: 121.565, importance: 3 },
  { name: "Keelung", lat: 25.128, lng: 121.741, importance: 3 },
  { name: "Taichung", lat: 24.147, lng: 120.673, importance: 3 },
  { name: "Tainan", lat: 22.999, lng: 120.227, importance: 2 },
  { name: "Kaohsiung", lat: 22.627, lng: 120.301, importance: 3 },
  { name: "Hualien", lat: 23.992, lng: 121.601, importance: 2 },
  { name: "Penghu", lat: 23.570, lng: 119.563, importance: 2 },
  { name: "Matsu", lat: 26.160, lng: 119.950, importance: 2 },
  { name: "Kinmen", lat: 24.433, lng: 118.317, importance: 2 },
  { name: "Green Island", lat: 22.661, lng: 121.493, importance: 1 },
  { name: "Orchid Island", lat: 22.046, lng: 121.548, importance: 1 }
];

const NAUTICAL_SYMBOLS = [
  { name: "Keelung Harbor", lat: 25.155, lng: 121.742, sym: "⚓", minZoom: 8.2 },
  { name: "Kaohsiung Port", lat: 22.616, lng: 120.283, sym: "⚓", minZoom: 8.2 },
  { name: "Taichung Port", lat: 24.296, lng: 120.510, sym: "⚓", minZoom: 8.3 },
  { name: "Rhumb", lat: 23.60, lng: 121.95, sym: "✦", minZoom: 8.9 }
];

function makePlaceIcon(place) {
  const imp = place.importance ?? 2;
  const dur = imp === 3 ? 7.5 : imp === 2 ? 8.8 : 10.5;

  return L.divIcon({
    className: "",
    iconSize: null,
    iconAnchor: [0, 0],
    html: `
      <div class="place-label" data-imp="${imp}" style="animation: labelBreathe ${dur}s ease-in-out infinite;">
        <span class="dot"></span>
        <span class="kicon">✦</span>
        <span>${escapeHTML(place.name)} <span class="sub">PLACE</span></span>
      </div>
    `
  });
}

function buildPlacesLayer(places, placeEntries) {
  const layer = L.layerGroup();
  for (const p of places) {
    const m = L.marker([p.lat, p.lng], { interactive: false, icon: makePlaceIcon(p) });
    layer.addLayer(m);
    placeEntries.push({ marker: m, importance: p.importance ?? 2, name: p.name });
  }
  return layer;
}

function nauticalIcon(item) {
  return L.divIcon({
    className: "",
    iconSize: null,
    iconAnchor: [0, 0],
    html: `
      <div class="nautical">
        <span class="sym">${item.sym}</span>
        <span class="txt">${escapeHTML(item.name)}</span>
      </div>
    `
  });
}

function buildSymbolsLayer() {
  const layer = L.layerGroup();
  for (const s of NAUTICAL_SYMBOLS) {
    const m = L.marker([s.lat, s.lng], { interactive: false, icon: nauticalIcon(s) });
    m._minZoom = s.minZoom ?? 9;
    layer.addLayer(m);
  }
  return layer;
}

function lighthouseIcon(era = "Modern Restoration", styled = true) {
  const color = styled ? eraColor(era) : "#ffffff";
  return L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -12],
    html: `
      <div style="
        width:34px;
        height:34px;
        border-radius:999px;
        background:${styled ? "rgba(12,16,28,.96)" : "rgba(255,255,255,.92)"};
        border:2px solid ${color};
        box-shadow:0 10px 25px rgba(0,0,0,.24), 0 0 12px ${color}33;
        display:grid;
        place-items:center;
        font-size:16px;
        color:${color};">
        🗼
      </div>
    `
  });
}

function buildHistoricPortsLayer() {
  const layer = L.layerGroup();
  const maxCargo = Math.max(...HISTORIC_PORTS.map((p) => p.cargo_2023));

  for (const p of HISTORIC_PORTS) {
    const r = 8 + 28 * Math.sqrt(p.cargo_2023 / maxCargo);

    const circle = L.circleMarker([p.lat, p.lng], {
      radius: r,
      weight: 2,
      color: "rgba(255,220,120,0.95)",
      fillColor: "rgba(255,110,110,0.55)",
      fillOpacity: 0.55
    });

    circle.bindPopup(`
      <div style="font-weight:800; margin-bottom:6px;">Port of ${escapeHTML(p.name)}</div>
      <div style="font-size:12px; line-height:1.4; color:rgba(232,238,252,.88);">
        <div><strong>Historical metric:</strong> Cargo handled</div>
        <div><strong>Year:</strong> 2023</div>
        <div><strong>Value:</strong> ${p.cargo_2023.toLocaleString()} revenue tons</div>
      </div>
    `);

    const label = L.marker([p.lat, p.lng], {
      interactive: false,
      icon: L.divIcon({
        className: "",
        iconSize: null,
        iconAnchor: [-12, -18],
        html: `<div class="historic-port-label">${escapeHTML(p.name)}</div>`
      })
    });

    layer.addLayer(circle);
    layer.addLayer(label);
  }

  return layer;
}

(async function init() {
  try {
    const map = L.map("map", { zoomControl: true }).setView([23.7, 121.0], 7.8);

    map.createPane("seaArtPane");
    map.getPane("seaArtPane").style.zIndex = 320;
    map.getPane("seaArtPane").style.pointerEvents = "none";

    const artWrap = L.DomUtil.create("div", "art-wrap", map.getPane("seaArtPane"));
    artWrap.innerHTML = `<div class="seaTint"></div><div class="waves"></div><div class="bathyDay"></div>`;

    const watercolor = L.tileLayer(
      "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg?api_key=ad2dff62-b9ab-4b60-a9ef-d91c975567ca",
      {
        maxZoom: 16,
        attribution: "&copy; Stadia Maps &copy; Stamen Design &copy; OpenStreetMap contributors"
      }
    );

    const nightTiles = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
      }
    );

    const nightOverlay = L.rectangle(
      [[-90, -180], [90, 180]],
      { color: null, weight: 0, fillColor: "#070b18", fillOpacity: 0.03, interactive: false }
    );

    function isNightNow() {
      const h = new Date().getHours();
      return h >= 18 || h < 6;
    }

    function isNightLayerActive() {
      return map.hasLayer(nightTiles);
    }

    const insetMap = L.map("insetMap", {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false
    }).setView([23.7, 121.0], 6.0);

    const insetWater = L.tileLayer("https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg", { maxZoom: 16 });
    const insetNight = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 19 });

    const insetRect = L.rectangle(map.getBounds(), {
      weight: 2,
      color: "rgba(120,220,255,0.85)",
      fillOpacity: 0.05
    }).addTo(insetMap);

    function syncInsetBasemap(isNight) {
      if (isNight) {
        if (insetMap.hasLayer(insetWater)) insetMap.removeLayer(insetWater);
        if (!insetMap.hasLayer(insetNight)) insetNight.addTo(insetMap);
        insetRect.setStyle({ color: "rgba(120,220,255,0.92)", fillOpacity: 0.07 });
      } else {
        if (insetMap.hasLayer(insetNight)) insetMap.removeLayer(insetNight);
        if (!insetMap.hasLayer(insetWater)) insetWater.addTo(insetMap);
        insetRect.setStyle({ color: "rgba(55,35,18,0.78)", fillOpacity: 0.06 });
      }
    }

    function syncInset() {
      insetRect.setBounds(map.getBounds());
      const c = map.getCenter();
      insetMap.setView([c.lat, c.lng], Math.max(5.2, map.getZoom() - 2.2), { animate: false });
    }

    map.on("moveend zoomend", syncInset);

    let shippingLayer = null;
    let fishingGroundsLayer = null;
    let beamsLayer = null;
    let historicPortsLayer = null;

    function applyNightState(isNight) {
      document.body.classList.toggle("night", isNight);

      if (isNight) {
        if (!map.hasLayer(nightOverlay)) nightOverlay.addTo(map);
      } else if (map.hasLayer(nightOverlay)) {
        map.removeLayer(nightOverlay);
      }

      const sea = document.querySelector(".seaTint");
      const waves = document.querySelector(".waves");
      if (sea) sea.style.opacity = isNight ? "0.86" : "0.70";
      if (waves) waves.style.opacity = isNight ? "0.18" : "0.15";

      if (shippingLayer?.setMode) shippingLayer.setMode(isNight);
      if (fishingGroundsLayer?.setMode) fishingGroundsLayer.setMode(isNight);
      if (beamsLayer) beamsLayer.setMode(isNight);

      const icon = document.getElementById("dnIcon");
      const text = document.getElementById("dnText");
      if (icon && text) {
        icon.textContent = isNight ? "🌙" : "🎨";
        text.textContent = isNight ? "Night" : "Watercolor";
      }

      if (summaryMode) summaryMode.textContent = isNight ? "Night" : "Watercolor";
      syncInsetBasemap(isNight);
    }

    if (isNightNow()) {
      nightTiles.addTo(map);
      applyNightState(true);
    } else {
      watercolor.addTo(map);
      applyNightState(false);
    }

    document.getElementById("dnToggle").addEventListener("click", () => {
      if (isNightLayerActive()) {
        map.removeLayer(nightTiles);
        watercolor.addTo(map);
      } else {
        map.removeLayer(watercolor);
        nightTiles.addTo(map);
      }
      applyNightState(isNightLayerActive());
      setGraticuleStyle(isNightLayerActive());
    });

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyDistanceMultiplier: 1.2,
      iconCreateFunction(c) {
        return L.divIcon({
          html: `<div class="cluster">${c.getChildCount()}</div>`,
          className: "",
          iconSize: [42, 42]
        });
      }
    }).addTo(map);

    let glowLayer = null;
    let coastLayer = null;
    let placesLayer = null;
    let symbolsLayer = null;
    const searchList = [];
    const placeEntries = [];
    const markerEntries = [];

    const FancyCompassControl = L.Control.extend({
      options: { position: "topleft" },
      onAdd() {
        const div = L.DomUtil.create("div", "panel-block");
        div.style.padding = "10px";
        div.style.width = "84px";
        div.style.display = "grid";
        div.style.placeItems = "center";
        div.innerHTML = `
          <svg width="72" height="72" viewBox="0 0 72 72" aria-label="Compass rose">
            <defs>
              <radialGradient id="g1" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="rgba(255,255,255,.18)"/>
                <stop offset="70%" stop-color="rgba(255,255,255,.06)"/>
                <stop offset="100%" stop-color="rgba(0,0,0,.20)"/>
              </radialGradient>
              <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="rgba(0,0,0,.40)"/>
              </filter>
            </defs>
            <circle cx="36" cy="36" r="33" fill="url(#g1)" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
            <circle cx="36" cy="36" r="27" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1"/>
            <g stroke="rgba(255,255,255,.22)" stroke-width="1">
              ${Array.from({ length: 16 })
                .map((_, i) => {
                  const a = i * (360 / 16);
                  return `<line x1="36" y1="6" x2="36" y2="10" transform="rotate(${a} 36 36)" />`;
                })
                .join("")}
            </g>
            <g filter="url(#shadow)" class="compass-needle">
              <polygon points="36,7 41,36 36,65 31,36" fill="rgba(255,80,80,.92)" stroke="rgba(255,255,255,.22)" stroke-width="1"/>
              <polygon points="7,36 36,31 65,36 36,41" fill="rgba(120,220,255,.55)" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
              <polygon points="36,14 39,36 36,58 33,36" fill="rgba(255,255,255,.12)"/>
            </g>
            <circle cx="36" cy="36" r="3.2" fill="rgba(255,255,255,.75)" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
            <text x="36" y="16" text-anchor="middle" font-size="10" font-weight="800" fill="rgba(232,238,252,.95)">N</text>
            <text x="56" y="39" text-anchor="middle" font-size="9" font-weight="700" fill="rgba(232,238,252,.70)">E</text>
            <text x="36" y="62" text-anchor="middle" font-size="9" font-weight="700" fill="rgba(232,238,252,.70)">S</text>
            <text x="16" y="39" text-anchor="middle" font-size="9" font-weight="700" fill="rgba(232,238,252,.70)">W</text>
          </svg>
        `;
        L.DomEvent.disableClickPropagation(div);
        return div;
      }
    });
    map.addControl(new FancyCompassControl());

    L.control.scale({ position: "bottomleft", metric: true, imperial: false }).addTo(map);

    const grat = addGraticule(map, {
      step: 1,
      color: "rgba(55,35,18,0.22)",
      weight: 1.3,
      labelColor: "rgba(55,35,18,0.62)"
    });

    function setGraticuleStyle(isNight) {
      grat.eachLayer((lyr) => {
        if (lyr.setStyle) {
          lyr.setStyle(
            isNight
              ? { color: "rgba(60,140,210,0.12)", weight: 1 }
              : { color: "rgba(55,35,18,0.22)", weight: 1.3 }
          );
        } else if (lyr.getElement) {
          const el = lyr.getElement();
          if (el) el.style.opacity = isNight ? "0.55" : "0.90";
        }
      });
    }

    syncInsetBasemap(isNightLayerActive());
    setGraticuleStyle(isNightLayerActive());
    syncInset();

    const merged = await loadMerged();

    try {
      coastLayer = L.geoJSON(merged, {
        filter: (f) => f.geometry && f.geometry.type !== "Point",
        style: () => ({
          color: "rgba(140,220,255,0.55)",
          weight: 2,
          opacity: 0.85
        }),
        className: "coast-glow",
        interactive: false
      });

      if (coastLayer.getLayers().length > 0) coastLayer.addTo(map);
      else coastLayer = null;
    } catch {
      coastLayer = null;
    }

    const glowPts = [];
    const beamPts = [];

    for (const feature of merged.features) {
      const latlng = getLatLngFromFeature(feature);
      if (!latlng) continue;

      const rawName = guessName(feature);
      const p = feature.properties || {};
      const id = p.id || p["@id"] || p.osm_id || "";
      const history = getHistoryForFeature(feature);

      const w = rawName && rawName !== "Lighthouse" ? 1.25 : 1.0;
      const colorKey = latlng[0] > 24 ? "green" : "purple";
      glowPts.push({ lat: latlng[0], lng: latlng[1], w, colorKey });

      if (rawName && rawName !== "Lighthouse") {
        beamPts.push({
          lat: latlng[0],
          lng: latlng[1],
          strength: Math.min(1.0, 0.55 + (w - 1.0) * 0.6),
          hueKey: latlng[0] > 24 ? "cool" : "warm"
        });
      }

      const popup = `
        <div style="font-weight:800; margin-bottom:6px;">${escapeHTML(rawName)}</div>
        <div style="font-size:12px; line-height:1.4; color:rgba(232,238,252,.88);">
          <div><strong>Era:</strong> ${escapeHTML(eraLabel(history.era))}</div>
          <div><strong>Year built:</strong> ${history.year_built ?? "Unknown"}</div>
          ${history.year_lit ? `<div><strong>Year lit:</strong> ${history.year_lit}</div>` : ""}
          ${id ? `<div><strong>OSM id:</strong> ${escapeHTML(String(id))}</div>` : ""}
          ${p.operator ? `<div><strong>Operator:</strong> ${escapeHTML(p.operator)}</div>` : ""}
          ${p.height ? `<div><strong>Height:</strong> ${escapeHTML(p.height)} m</div>` : ""}
        </div>
        <div style="margin-top:8px; font-size:11px; color:rgba(232,238,252,.72);">
          ${escapeHTML(history.note)}
        </div>
        <div style="margin-top:8px; font-size:11px; color:rgba(232,238,252,.65);">
          ${latlng[0].toFixed(5)}, ${latlng[1].toFixed(5)}
        </div>
      `;

      const styled = toggleHistoricStylingEl.checked;
      const marker = L.marker(latlng, {
        icon: lighthouseIcon(history.era, styled)
      }).bindPopup(popup);

      cluster.addLayer(marker);
      searchList.push({ name: rawName, marker, latlng });
      markerEntries.push({ marker, name: rawName, history });
    }

    function updateMarkerIcons() {
      const styled = toggleHistoricStylingEl.checked;
      for (const item of markerEntries) {
        item.marker.setIcon(lighthouseIcon(item.history.era, styled));
      }
    }

    function applyEraFilter() {
      const selected = eraFilterEl.value;
      cluster.clearLayers();

      let visible = 0;
      for (const item of markerEntries) {
        const pass = selected === "all" || item.history.era === selected;
        if (pass) {
          cluster.addLayer(item.marker);
          visible++;
        }
      }

      summaryCount.textContent = visible.toLocaleString();
      summaryEra.textContent = selected === "all" ? "All" : eraLabelLong(selected);
    }

    glowLayer = new GlowDotsLayer(glowPts, {
      alpha: 0.82,
      maxR: 18,
      glowR: 58,
      twinkle: true,
      twinkleSpeed: 1.12
    }).addTo(map);

    shippingLayer = buildShippingLinksLayer(isNightLayerActive()).addTo(map);
    beamsLayer = new BeaconBeamsLayer(beamPts);
    beamsLayer.setMode(isNightLayerActive());
    beamsLayer.addTo(map);

    fishingGroundsLayer = buildFishingGroundsLayer(isNightLayerActive());
    if (toggleFishingGroundsEl?.checked) fishingGroundsLayer.addTo(map);

    placesLayer = buildPlacesLayer(MAJOR_PLACES, placeEntries).addTo(map);
    symbolsLayer = buildSymbolsLayer().addTo(map);

    historicPortsLayer = buildHistoricPortsLayer();
    if (togglePortsEl.checked) historicPortsLayer.addTo(map);

    function computePlaceOpacity(zoom, imp) {
      const t = clamp01((zoom - 8.5) / 2.0);
      const w2 = imp === 3 ? 1.0 : imp === 2 ? 0.82 : 0.62;
      return t * w2;
    }

    function updatePlacesLayout() {
      if (!placesLayer || !map.hasLayer(placesLayer)) return;
      const z = map.getZoom();

      for (const e of placeEntries) {
        const el = e.marker.getElement();
        if (!el) continue;
        const label = el.querySelector(".place-label");
        if (!label) continue;

        const op = computePlaceOpacity(z, e.importance);
        label.style.opacity = op.toFixed(3);
        const s = 0.985 + 0.02 * clamp01((z - 8.5) / 3.0);
        label.style.transform = `translateZ(0) scale(${s.toFixed(3)})`;
        label.style.display = op < 0.05 ? "none" : "inline-flex";
        label.style.visibility = "visible";
      }

      const candidates = placeEntries
        .map((e) => {
          const el = e.marker.getElement();
          const label = el ? el.querySelector(".place-label") : null;
          return { ...e, el, label };
        })
        .filter((x) => x.label && x.label.style.display !== "none");

      candidates.sort((a, b) => (b.importance - a.importance) || a.name.localeCompare(b.name));

      const kept = [];
      const pad = 6;

      for (const c of candidates) {
        const r = c.label.getBoundingClientRect();
        const box = { l: r.left - pad, t: r.top - pad, r: r.right + pad, b: r.bottom + pad };

        let collide = false;
        for (const k of kept) {
          if (!(box.r < k.l || box.l > k.r || box.b < k.t || box.t > k.b)) {
            collide = true;
            break;
          }
        }

        c.label.style.visibility = collide ? "hidden" : "visible";
        if (!collide) kept.push(box);
      }
    }

    function syncPlacesVisibility() {
      if (!placesLayer) return;
      const shouldShow = map.getZoom() >= 8.5;

      if (shouldShow && !map.hasLayer(placesLayer)) map.addLayer(placesLayer);
      if (!shouldShow && map.hasLayer(placesLayer)) map.removeLayer(placesLayer);

      requestAnimationFrame(() => requestAnimationFrame(updatePlacesLayout));
    }

    function syncSymbolsVisibility() {
      if (!symbolsLayer) return;
      const z = map.getZoom();

      symbolsLayer.eachLayer((m) => {
        const el = m.getElement();
        if (!el) return;
        const minz = m._minZoom ?? 9;
        el.style.display = z >= minz ? "block" : "none";
        if (z >= minz) {
          const t = Math.max(0, Math.min(1, (z - minz) / 1.4));
          el.style.opacity = (0.25 + 0.75 * t).toFixed(3);
        }
      });
    }

    function syncRouteLabels() {
      const z = map.getZoom();
      shippingLayer?.setLabelVisibility(z >= 8.6);
      fishingGroundsLayer?.setLabelVisibility(z >= 8.8);
    }

    function populateSearchDatalist(items) {
      const dl = document.getElementById("lhList");
      if (!dl) return;
      dl.innerHTML = "";
      const top = items.filter((x) => x.name && x.name !== "Lighthouse").slice(0, 250);
      for (const it of top) {
        const opt = document.createElement("option");
        opt.value = it.name;
        dl.appendChild(opt);
      }
    }

    function flyToMarker(item) {
      map.flyTo(item.latlng, 11.5, { duration: 0.9 });
      setTimeout(() => item.marker.openPopup(), 850);
    }

    function searchAndZoom(query) {
      if (!query) return;
      const q = query.trim().toLowerCase();
      if (!q) return;

      const exact = searchList.find((x) => x.name.toLowerCase() === q);
      if (exact) return flyToMarker(exact);

      const contains = searchList.find((x) => x.name.toLowerCase().includes(q));
      if (contains) return flyToMarker(contains);

      setStatus(`No match for "${query}". Try selecting a suggestion.`);
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target && e.target.id === "searchInput") {
        searchAndZoom(e.target.value);
      }
    });

    document.addEventListener("change", (e) => {
      if (e.target && e.target.id === "searchInput") {
        searchAndZoom(e.target.value);
      }
    });

    eraFilterEl.addEventListener("change", applyEraFilter);

    togglePortsEl.addEventListener("change", () => {
      if (togglePortsEl.checked) {
        if (!map.hasLayer(historicPortsLayer)) historicPortsLayer.addTo(map);
      } else if (map.hasLayer(historicPortsLayer)) {
        map.removeLayer(historicPortsLayer);
      }
    });

    toggleHistoricStylingEl.addEventListener("change", () => {
      updateMarkerIcons();
      applyEraFilter();
    });

    if (toggleFishingGroundsEl) {
      toggleFishingGroundsEl.addEventListener("change", () => {
        if (toggleFishingGroundsEl.checked) {
          if (!map.hasLayer(fishingGroundsLayer)) fishingGroundsLayer.addTo(map);
        } else if (map.hasLayer(fishingGroundsLayer)) {
          map.removeLayer(fishingGroundsLayer);
        }
      });
    }

    syncPlacesVisibility();
    syncSymbolsVisibility();
    syncRouteLabels();

    const baseLayers = {
      "Watercolor (Stamen)": watercolor,
      "Night (Neon Ink)": nightTiles
    };

    const overlays = {
      "Beacon beams": beamsLayer,
      "Glow particles": glowLayer,
      "Shipping links": shippingLayer,
      "Fishing grounds": fishingGroundsLayer,
      "Historical ports": historicPortsLayer,
      "Nautical symbols": symbolsLayer,
      "Major places": placesLayer,
      "Lighthouse markers (clustered)": cluster
    };

    if (coastLayer) overlays["Coastline glow"] = coastLayer;
    L.control.layers(baseLayers, overlays, { collapsed: false }).addTo(map);

    applyNightState(isNightLayerActive());
    setGraticuleStyle(isNightLayerActive());
    updateMarkerIcons();
    applyEraFilter();

    map.on("zoomend moveend", () => {
      syncPlacesVisibility();
      syncSymbolsVisibility();
      syncRouteLabels();
      requestAnimationFrame(() => requestAnimationFrame(updatePlacesLayout));
    });

    searchList.sort((a, b) => a.name.localeCompare(b.name));
    populateSearchDatalist(searchList);

    setTimeout(() => {
      updatePlacesLayout();
      syncSymbolsVisibility();
      syncRouteLabels();
    }, 250);

    setStatus(`Ready: ${markerEntries.length} lighthouse points loaded with port links and optional fishing grounds.`);
  } catch (err) {
    console.error(err);
    setStatus(
      `Failed to load Taiwan GeoJSON. ${err.message} Check that ./js/taiwan.geojson exists and run a local server.`,
      true
    );
  }

})();
