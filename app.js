/* app.js — interactive view ของ wiki kati-primary-school (อ่านอย่างเดียว, ไม่แก้ wiki) */
"use strict";
const D = window.WIKI_DATA;
/* raw/*.md ที่ build ฝังมา — index ตาม path สัมพัทธ์จาก root (เช่น raw/scans/rais.md)
   ให้ลิงก์อ้างอิง raw เปิดดูในหน้าเว็บเอง (serve เฉพาะ web/ ก็กดได้ ไม่ 404 เหมือนชี้ ../raw/) */
const RAW = new Map((D.raw_files || []).map(f => [f.path, f.content]));
/* เวอร์ชันแชร์ (D.share จาก web/build_share.py): ไม่มีข้อมูลบ้าน/ที่ทำงาน — จุดตั้งต้น = อนุบาลบ้านสนุกคิด
   ใช้ app.js ตัวเดียวกับเวอร์ชันหลัก แยกพฤติกรรมด้วย flag นี้ (เวอร์ชันหลักไม่มีคีย์ share → ทำงานเหมือนเดิมทุกอย่าง) */
const SHARE = !!D.share;
const SK = SHARE ? "katis." : "kati."; // localStorage แยกชุดต่อเวอร์ชัน — กันค่าที่เวอร์ชันหลักบันทึกไว้ (เช่นพิกัดบ้านจริง) หลุดมาแสดงในเวอร์ชันแชร์
const distWord = SHARE ? "จุดตั้งต้น" : "บ้าน";   // คำอ้างอิงระยะทางใน UI
const distIcon = SHARE ? "🏫" : "🏠";              // ไอคอนจุดตั้งต้นบนการ์ด/ตาราง/แผนที่

/* ---------- constants ---------- */
const LEVELS = {
  1: { name: "สามัญ", short: "สามัญ", color: "#94a3b8", desc: "หลักสูตรไทยล้วน อังกฤษเป็นวิชาภาษา" },
  2: { name: "สามัญ + เสริมอังกฤษ", short: "เสริมอังกฤษ", color: "#0092f9", desc: "ครูต่างชาติ 5-10 คาบ/สัปดาห์" },
  3: { name: "English Program แบบไทย", short: "EP", color: "#01a88f", desc: "วิชาหลักบางวิชาสอนเป็นอังกฤษ" },
  4: { name: "สองภาษาเข้มข้น / หลักสูตรผสม", short: "สองภาษา", color: "#014f95", desc: "อังกฤษ ~50%+ (Oxford/Cambridge/ตรีภาษา)" },
  5: { name: "นานาชาติเต็มรูปแบบ", short: "นานาชาติ", color: "#fd5b65", desc: "อังกฤษ 90-95%+" },
};
const ZH = { intensive: "จีนเข้มข้น", some: "มีจีน", none: "ไม่มีจีน", unknown: "จีน: ไม่รู้" };
const DOC_ORDER = ["overview", "criteria", "program-types", "school-groups", "cost", "cost-breakdown", "programs", "activities", "contacts", "admission-calendar"];
const TABS = [
  ["overview", "📋 ภาพรวม"], ["calendar", "🗓️ ปฏิทินรับสมัคร"], ["schools", "🏫 โรงเรียน"],
  ["map", "🗺️ แผนที่"], ["cost", "💰 ค่าใช้จ่าย"], ["compare", "⚖️ เทียบรายโรงเรียน"], ["radar", "🕸️ จุดเด่น"], ["docs", "📖 เอกสาร"],
];
if (!D.admission) TABS.splice(TABS.findIndex(t => t[0] === "calendar"), 1); // wiki ยังไม่มีข้อมูลปฏิทิน = ซ่อนแท็บ

/* ---------- state ---------- */
const DEFAULT_FILTERS = { q: "", budget: 400000, dist: 10, minLevel: 0, chinese: "all", secondary: false, hideUnknown: false };
const state = {
  tab: "overview",
  view: "cards", // มุมมองในแท็บโรงเรียน: cards | table
  filters: { ...DEFAULT_FILTERS },
  sort: { key: "distance_km", dir: 1 },
  compare: [],
  radar: [], // โรงที่ซ้อนบนเรดาร์ (แยกจาก state.compare — เก็บ localStorage ของตัวเอง)
  doc: "overview",
  mapColor: "level",
  mapSel: null,
  costSort: "cost",
  costFilters: { q: "", max: 400000 },
  calFilter: null,
  origin: null, // จุดตั้งต้นของแผนที่ — null = บ้านจริง (D.home) · ย้ายได้บนแผนที่ แล้วคำนวณเส้นทางใหม่สด
};
let actionsDone = new Set();
try { actionsDone = new Set(JSON.parse(localStorage.getItem(SK + "actions") || "[]")); } catch (e) {}

/* ---------- helpers ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
const bySlug = slug => D.schools.find(s => s.slug === slug);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtBaht = n => n == null ? "ไม่เปิดเผย" : "฿" + n.toLocaleString("th-TH");
const fmtK = n => n == null ? "?" : Math.round(n / 1000) + "K";
/* โรงที่ราคาต่างตามโปรแกรม (cost_p1_programs — ไม่แยกหน้า wiki): ใช้ตัวเลขระดับโปรแกรมแทนเมื่อไม่มีราคาหลัก */
const progCosts = s => (s.cost_programs || []).filter(p => p.cost != null);
const costOf = s => s.cost != null ? s.cost : (progCosts(s).length ? Math.min(...progCosts(s).map(p => p.cost)) : null);
const costRangeText = s => {
  const cs = progCosts(s);
  if (!cs.length) return null;
  const lo = Math.min(...cs.map(p => p.cost)), hi = Math.max(...cs.map(p => p.cost));
  return lo === hi ? fmtBaht(lo) : fmtBaht(lo) + "–" + fmtBaht(hi);
};
const costProgramText = s => (s.cost_programs || []).map(p => p.text).join(" · ");
const lvMax = s => s.english_level[1] || 0;
const lvMin = s => s.english_level[0] || 0;
const lvColor = s => (LEVELS[lvMax(s)] || LEVELS[1]).color;
const lvText = s => (lvMin(s) === lvMax(s)) ? LEVELS[lvMax(s)].short : `${LEVELS[lvMin(s)].short}–${LEVELS[lvMax(s)].short}`;
/* สัดส่วนภาษา ป.1 (% ของเวลาเรียน) — จาก wiki/comparisons/language-mix.md ผ่าน frontmatter
   ค่า = ตัวเลขเดี่ยว หรือ [ต่ำ,สูง] (ช่วง) · lang_basis: official โรงประกาศ / counted นับจากตารางคาบ / estimate ประมาณ */
const langNum = v => Array.isArray(v) ? (v[0] + v[1]) / 2 : (typeof v === "number" ? v : null);
const langPct = v => Array.isArray(v) ? `${v[0]}–${v[1]}%` : (typeof v === "number" ? `${v}%` : null);
const LANG_BASIS = { official: "✅ โรงประกาศ", counted: "🧮 นับจากตารางคาบ", estimate: "~ ประมาณ" };
const langBasisTag = s => LANG_BASIS[s.lang_basis] || "";
const langMix = s => (s.lang_thai != null || s.lang_eng != null || s.lang_zh != null)
  ? `🇹🇭 ${langPct(s.lang_thai) || "?"} · 🇬🇧 ${langPct(s.lang_eng) || "?"}` + (s.lang_zh != null ? ` · 🇨🇳 ${langPct(s.lang_zh)}` : "")
  : null;
const foodText = f => f === "yes" ? "✅ รวมอาหาร" : f === "no" ? "❌ ไม่รวม" : "❓ ไม่ชัด/ไม่พบ";
/* แผนที่: ระยะ = เส้นทางขับรถจาก OSRM เทียบกับ "จุดตั้งต้นปัจจุบัน" (state.origin — ย้ายได้บนแผนที่)
   liveRoutes[slug] = {km, min, coords?} จากจุดตั้งต้นนั้น · pending = กำลังคำนวณ · ไม่มี = fallback ระยะตรง (*) */
const OSRM = "https://router.project-osrm.org";
let liveRoutes = {};
const geoCache = new Map(); // "lat,lon|slug" → Promise<route> กันดึง geometry ซ้ำ
const homePos = () => state.origin || D.home;
const rOf = s => liveRoutes[s.slug];
function isCustomOrigin() {
  const o = state.origin;
  return !!o && (Math.abs(o.lat - D.home.lat) > 1e-4 || Math.abs(o.lon - D.home.lon) > 1e-4);
}
function straightKm(s) { // ระยะตรง (Haversine) จากจุดตั้งต้นปัจจุบัน
  const o = homePos(), rad = Math.PI / 180;
  const a = Math.sin((s.lat - o.lat) * rad / 2) ** 2 + Math.cos(o.lat * rad) * Math.cos(s.lat * rad) * Math.sin((s.lon - o.lon) * rad / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(a)) * 10) / 10;
}
function initLiveRoutes() {
  liveRoutes = {};
  D.schools.forEach(s => { if (s.route) liveRoutes[s.slug] = { ...s.route }; }); // route ที่ build ฝังไว้ = จากบ้านจริง
}
const distKm = s => { const r = rOf(s); return r && !r.pending ? r.km : straightKm(s); };
const distText = s => { const r = rOf(s); if (r && !r.pending) return `🚗 ${r.km} กม.`; if (r) return "⏳ …"; return `${straightKm(s)} กม.*`; };
const driveTip = s => { const r = rOf(s); if (r && !r.pending) return `🚗 ${r.km} กม. · ≈${r.min} นาที (ไม่รวมรถติด)`; if (r) return "กำลังคำนวณเส้นทางจากจุดตั้งต้นใหม่…"; return `${straightKm(s)} กม. (ระยะตรง — ยังไม่มีเส้นทางขับ)`; };

function costColor(c) {
  if (c == null) return "#94a3b8";
  if (c <= 60000) return "#46b151";
  if (c <= 120000) return "#facc15";
  if (c <= 200000) return "#fda102";
  return "#fd4c3d";
}

/* ---------- markdown (subset ที่ wiki ใช้จริง) ---------- */
function inline(s) {
  s = s.replace(/\[\[([^\]|]+?)\\?\|([^\]]+)\]\]/g, (_, t, d) => `<span class="wikilink" data-target="${t.trim()}">${d}</span>`); // \\? = wikilink ในตาราง md ที่ escape | เป็น \|
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, t) => `<span class="wikilink" data-target="${t.trim()}">${t.trim()}</span>`);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<i>$2</i>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
    if (/raw\//.test(href)) {
      const path = href.slice(href.indexOf("raw/")).split("#")[0];
      return `<a class="rawlink" data-raw="${path}" title="เปิดไฟล์ข้อมูลดิบ (แสดงในหน้าเว็บ)">${text}</a>`;
    }
    const stem = href.replace(/\.md$/, "").split("/").pop().replace(/\.md$/, "");
    if (stem === "index") return `<span class="wikilink" data-target="overview">${text}</span>`;
    if (D.docs[stem]) return `<span class="wikilink" data-target="${stem}">${text}</span>`;
    return `<a href="${href}" target="_blank">${text}</a>`;
  });
  return s;
}

function mdToHtml(text) {
  const lines = esc(text).split("\n").map(l => l.replace(/\s+$/, ""));
  const out = [];
  let i = 0;
  const splitRow = l => l.replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, "|").trim());

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) {
      const h = Math.min(m[1].length + 1, 4);
      out.push(`<h${h}>${inline(m[2])}</h${h}>`); i++;

    } else if (/^\s*---+\s*$/.test(line)) {
      out.push("<hr>"); i++;

    } else if (line.startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const head = splitRow(line); i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(splitRow(lines[i++]));
      out.push("<table><thead><tr>" + head.map(c => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
        rows.map(r => "<tr>" + r.map(c => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table>");

    } else if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${buf.map(inline).join("<br>")}</blockquote>`);

    } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        let t = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, "");
        let task = null;
        if (/^\[( |x)\]\s*/.test(t)) { task = t[1] === "x"; t = t.replace(/^\[( |x)\]\s*/, ""); }
        const cls = task === null ? "" : ` class="task"`;
        items.push(`<li${cls}>${task === true ? "☑ " : task === false ? "☐ " : ""}${inline(t)}</li>`);
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);

    } else {
      const buf = [lines[i++]];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\||>|\s*([-*]|\d+\.)\s|---+\s*$)/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${buf.map(inline).join("<br>")}</p>`);
    }
  }
  return out.join("\n");
}

/* ---------- tabs ---------- */
function renderTabs() {
  $("#tabs").innerHTML = TABS.map(([id, label]) => {
    let name = label;
    if (id === "compare" && state.compare.length) name = `⚖️ เทียบ (${state.compare.length})`;
    return `<button class="tab-btn ${state.tab === id ? "active" : ""}" data-tab="${id}">${name}</button>`;
  }).join("");
}
function switchTab(tab) {
  state.tab = tab;
  $$(".tabview").forEach(v => (v.hidden = v.id !== "view-" + tab));
  renderTabs();
  if (tab === "map") { initMap(); setTimeout(() => map && map.invalidateSize(), 60); }
  if (tab === "cost") renderCostChart();
  if (tab === "calendar") renderCalendar();
  if (tab === "compare") renderCompare();
  if (tab === "radar") renderRadar();
  window.scrollTo({ top: 0 });
}

/* ---------- overview ---------- */
function renderOverview() {
  const withCost = D.schools.filter(s => costOf(s) != null);
  const costs = withCost.map(s => costOf(s));
  const nSchools = new Set(D.schools.map(s => s.school_base)).size;  // หน้าแยกโปรแกรม (EP/IEP) นับรวมเป็นโรงเดียว
  const stats = [
    [nSchools + " โรงเรียน · " + D.schools.length + " โปรแกรม", "ในลิสต์ รัศมี ~10 กม. รอบ" + distWord + (SHARE ? " (อนุบาลบ้านสนุกคิด)" : "") + " — โรงเรียนที่มีหลายแผนการเรียน (สามัญ/EP/IEP) แยกนับเป็นโปรแกรม"],
    [Math.min(...D.schools.map(s => s.distance_km)) + "–" + Math.max(...D.schools.map(s => s.distance_km)) + " กม.", "ระยะตรงจาก" + distWord + " (ขับจริง ×1.3–1.6)"],
    ["฿" + Math.min(...costs).toLocaleString() + "–" + Math.max(...costs).toLocaleString(), "ค่าเล่าเรียน/ปี (" + withCost.length + "/" + D.schools.length + " โปรแกรมเปิดเผยราคา)"],
    [new Set(D.schools.filter(s => s.secondary).map(s => s.school_base)).size + " โรงเรียน", "มีเส้นทางเรียนต่อมัธยมในระบบเดียวกัน — สูงสุดต่างกัน (ม.3 ถึง ม.6/G.12)"],
  ];
  $("#stat-grid").innerHTML = stats.map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join("");

  // กลุ่มตามระดับอังกฤษสูงสุดที่ ป.1 ใหม่เข้าได้
  const groups = {};
  D.schools.forEach(s => { (groups[lvMax(s)] = groups[lvMax(s)] || []).push(s); });
  $("#tier-grid").innerHTML = Object.keys(groups).sort().map(lv => {
    const L = LEVELS[lv];
    return `<div class="tier-card" style="border-top-color:${L.color}">
      <h3>${lv}. ${L.name}</h3><div class="tier-sub">${L.desc}</div>` +
      groups[lv].sort((a, b) => a.distance_km - b.distance_km).map(s =>
        `<button class="tier-chip" data-open="${s.slug}">${s.short} <span class="d">${s.distance_km} กม. · ${fmtK(costOf(s))}</span></button>`).join("") +
      "</div>";
  }).join("");

  renderActions();
  $("#overview-notes").innerHTML = mdToHtml(D.docs.overview.body);
}

function renderActions() {
  const panel = $("#panel-actions");
  if (panel) { // เวอร์ชันแชร์/ไม่มี action = ซ่อนทั้งแผง (เป็น to-do ส่วนตัวของเจ้าของโปรเจกต์) — ซ่อนแล้วต้องยุบ grid ด้วย ไม่งั้นพาเนลข้อสังเกตตกคอลัมน์แคบ 340px
    panel.hidden = !D.actions.length;
    panel.parentElement.classList.toggle("single", panel.hidden);
  }
  if (!D.actions.length) { $("#action-list").innerHTML = ""; return; }
  const done = D.actions.filter(a => actionsDone.has(a));
  const pct = D.actions.length ? Math.round(done.length / D.actions.length * 100) : 0;
  $("#action-list").innerHTML =
    `<div class="action-progress"><i style="width:${pct}%"></i></div>` +
    D.actions.map((a, idx) =>
      `<label class="action-item ${actionsDone.has(a) ? "done" : ""}"><input type="checkbox" data-action="${idx}" ${actionsDone.has(a) ? "checked" : ""}><span>${inline(esc(a))}</span></label>`).join("");
}

/* ---------- map ---------- */
let map = null, markers = [], rings = [], selLine = null, homeMarker = null, pickMode = false;
const homeTipText = () => isCustomOrigin() ? "🧭 จุดตั้งต้นสำรวจ — ลากหมุดเพื่อย้าย"
  : SHARE ? "🏫 อนุบาลบ้านสนุกคิด — จุดตั้งต้น · ลากหมุดเพื่อย้ายไปบ้านของคุณ"
  : "🏠 บ้าน — ลากหมุดเพื่อย้ายจุดตั้งต้น";
function initMap() {
  initLiveRoutes();
  renderMapList();
  renderHomePanel();
  if (typeof L === "undefined") { $("#map-fallback").hidden = false; return; }
  if (map) return;
  map = L.map("map", { scrollWheelZoom: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · เส้นทางขับรถ <a href="https://project-osrm.org/">OSRM</a>',
  }).addTo(map);
  const h = homePos();
  map.setView([h.lat, h.lon], 12);

  const homeIcon = L.divIcon({ className: "", html: `<div style="font-size:26px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))">${distIcon}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
  homeMarker = L.marker([h.lat, h.lon], { icon: homeIcon, zIndexOffset: 1000, draggable: true, autoPan: true }).addTo(map)
    .bindTooltip(homeTipText(), { permanent: true, direction: "right", className: "home-tip" });
  homeMarker.on("drag", e => { const p = e.target.getLatLng(); rings.forEach(r => r.setLatLng(p)); }); // ลากสด = วงรัศมีวิ่งตาม
  homeMarker.on("dragend", e => { const p = e.target.getLatLng(); setOrigin(p.lat, p.lng); });
  map.on("click", e => { if (pickMode) setOrigin(e.latlng.lat, e.latlng.lng); }); // โหมดเลือกจุด: คลิกแผนที่ = ตั้งจุดใหม่
  (D.work || []).forEach(w => {
    const icon = L.divIcon({ className: "", html: `<div style="font-size:20px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))">💼</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
    L.marker([w.lat, w.lon], { icon }).addTo(map).bindTooltip(w.name, { permanent: true, direction: "right" });
  });

  renderRings();
  // โรงที่แยกหลักสูตรเป็นคนละหน้าแต่อาคารเดียวกัน (เช่น โสมาภา สามัญ/IEP) จะซ้อนพิกัดเดียวกัน — เยื้องเฉพาะตำแหน่งหมุดให้กดได้ทั้งสองจุด (logic อื่นใช้พิกัดจริงตามเดิม)
  const seenAt = new Map();
  D.schools.forEach(s => {
    const key = `${s.lat},${s.lon}`;
    const dup = seenAt.get(key) || 0;
    seenAt.set(key, dup + 1);
    const pos = dup > 0 ? [s.lat + 0.0009 * dup, s.lon + 0.0009 * dup] : [s.lat, s.lon];
    const mk = L.circleMarker(pos, { radius: 10, weight: 2.5, color: "#fff", fillOpacity: .95, fillColor: colorOf(s) })
      .addTo(map).bindTooltip(() => `${s.short} · ${distText(s)}`, { direction: "top" }); // content แบบ function = อัปเดตตามเส้นทางล่าสุด
    mk.bindPopup(() => popupNode(s));
    mk.on("click", () => pickMode ? setOrigin(s.lat, s.lon) : selectSchool(s, false));
    markers.push({ slug: s.slug, mk });
  });
  if (isCustomOrigin()) recalcRoutes(); // จำจุดที่เคยเลือกไว้ (localStorage) → คำนวณเส้นทางใหม่ตอนเปิดแท็บ
}
function colorOf(s) {
  if (state.mapColor === "cost") return costColor(costOf(s));
  if (state.mapColor === "chinese") return s.chinese === "intensive" ? "#fda102" : s.chinese === "some" ? "#fcd34d" : "#d1d5db";
  return lvColor(s);
}
function refreshColors() {
  markers.forEach(({ slug, mk }) => mk.setStyle({ fillColor: colorOf(bySlug(slug)) }));
}
function renderRings() {
  if (!map) return;
  rings.forEach(r => map.removeLayer(r)); rings = [];
  if (!$("#map-rings").checked) return;
  const o = homePos();
  [3, 5, 10].forEach(km => {
    const c = L.circle([o.lat, o.lon], {
      radius: km * 1000, color: "#0092f9", weight: 1, dashArray: "5 6", fill: false, opacity: .5,
    }).addTo(map).bindTooltip(km + " กม.", { permanent: true, className: "ring-tip" });
    rings.push(c);
  });
}
function renderHomePanel() {
  const custom = isCustomOrigin();
  $("#home-label").textContent = custom ? "จุดตั้งต้นสำรวจ (จุดที่คุณเลือกเอง)" : D.home.name;
  $("#home-coord").textContent = custom ? `${state.origin.lat.toFixed(5)}, ${state.origin.lon.toFixed(5)}` : "";
  $("#home-reset").hidden = !custom;
  $("#home-reset").textContent = SHARE ? "↩️ กลับจุดตั้งต้นเริ่มต้น" : "↩️ กลับบ้านจริง";
  if (homeMarker) homeMarker.setTooltipContent(homeTipText());
}
function popupNode(s) {
  const r = rOf(s);
  const routeRow = !r ? `📏 ${straightKm(s)} กม. จากจุดตั้งต้น (ระยะตรง*)`
    : r.pending ? "⏳ กำลังคำนวณเส้นทาง…"
    : `🚗 ขับจากจุดตั้งต้น ${r.km} กม. · ≈${r.min} นาที (ไม่รวมรถติด)`;
  const div = document.createElement("div");
  div.innerHTML = `
    <div class="popup-title">${s.short}</div>
    <div class="popup-row">${routeRow}</div>
    ${s.km_tdp != null ? `<div class="popup-row">💼 ระยะตรง — TDP ${s.km_tdp} / OB ${s.km_ob} กม.</div>` : ""}
    <div class="popup-row">💰 ${s.cost != null ? `${fmtBaht(s.cost)}/ปี` : costRangeText(s) ? `${costRangeText(s)}/ปี ตามโปรแกรม` : "ไม่เปิดเผย"}${s.first_year_est ? ` · ปีแรก ~${fmtK(s.first_year_est)}` : ""}</div>
    <div class="popup-row">🗣️ ${lvText(s)} · ${ZH[s.chinese]}</div>
    <div class="popup-row" style="margin-top:4px">${s.oneliner ? inline(esc(s.oneliner)) : ""}</div>
    <div class="popup-gm">
      <a href="${gmPin(s)}" target="_blank" rel="noopener">🗺️ เปิดใน Google Maps</a>
      <a href="${gmRoute(s)}" target="_blank" rel="noopener">🧭 เส้นทางจาก${distWord}</a>
    </div>
    <div class="popup-btns">
      <button class="btn btn-primary btn-sm" data-x="detail">รายละเอียด</button>
      <button class="btn btn-sm" data-x="cmp">＋เทียบ</button>
    </div>`;
  $("[data-x=detail]", div).onclick = () => openDetail(s.slug);
  $("[data-x=cmp]", div).onclick = () => toggleCompare(s.slug);
  return div;
}
function renderMapList() {
  const el = $("#map-list");
  const sorted = [...D.schools].sort((a, b) => distKm(a) - distKm(b)); // เรียงตามระยะขับรถจากจุดตั้งต้น (ไม่มีเส้นทางใช้ระยะตรง)
  el.innerHTML = sorted.map(s => {
    const r = rOf(s);
    const kmCell = !r ? `<span class="km">${straightKm(s)}*<span class="sub"> กม.</span></span>`
      : r.pending ? `<span class="km pending">…</span>`
      : `<span class="km">🚗 ${r.km}<span class="sub"> กม.</span></span>`;
    return `
    <button class="side-row ${state.mapSel === s.slug ? "active" : ""}" data-side="${s.slug}" title="${driveTip(s)}">
      <span class="side-dot" style="background:${colorOf(s)}"></span>
      <span class="nm">${s.short}</span>
      ${kmCell}
      <span class="pr">${fmtK(costOf(s))}</span>
    </button>`;
  }).join("");
  $$("[data-side]", el).forEach(b => b.onclick = () => selectSchool(bySlug(b.dataset.side)));
}

/* ---------- ลิงก์ออกไป Google Maps (เปิดหมุด/เส้นทางจากจุดตั้งต้นปัจจุบัน — ลากหมุดย้ายจุดแล้วลิงก์ตามไปด้วย) ---------- */
const gmPin = s => `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}`;
const gmRoute = s => { const o = homePos(); return `https://www.google.com/maps/dir/?api=1&origin=${o.lat},${o.lon}&destination=${s.lat},${s.lon}&hl=th`; };

/* ---------- เส้นทางสดจาก OSRM (ย้ายจุดตั้งต้นได้) ---------- */
async function osrmJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
async function fetchRoute(o, s) {
  const data = await osrmJson(`${OSRM}/route/v1/driving/${o.lon.toFixed(5)},${o.lat.toFixed(5)};${s.lon.toFixed(5)},${s.lat.toFixed(5)}?overview=full&geometries=geojson`);
  const r = data.routes[0];
  return { km: +(r.distance / 1000).toFixed(1), min: Math.round(r.duration / 60), coords: r.geometry.coordinates.map(c => [c[1], c[0]]) };
}
function routeGeometry(o, s) { // geometry เส้นทางโรงเดียว (มี cache) — ดึงตอนกดเลือกโรง
  const key = `${o.lat.toFixed(4)},${o.lon.toFixed(4)}|${s.slug}`;
  if (!geoCache.has(key)) geoCache.set(key, fetchRoute(o, s).catch(() => (geoCache.delete(key), null)));
  return geoCache.get(key);
}
function setRouteStatus(txt) {
  const el = $("#route-status");
  el.hidden = !txt;
  el.textContent = txt;
}
async function recalcRoutes() {
  const o = state.origin, targets = D.schools.filter(s => s.lat && s.lon);
  targets.forEach(s => liveRoutes[s.slug] = { pending: true });
  renderMapList();
  setRouteStatus("กำลังคำนวณเส้นทางจากจุดตั้งต้นใหม่…");
  const pts = [o, ...targets].map(p => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  try { // table service = ระยะ/เวลาครบทุกโรงในคำขอเดียว (geometry ค่อยดึงตอนกดเลือกโรง)
    const data = await osrmJson(`${OSRM}/table/v1/driving/${pts}?sources=0&annotations=duration,distance`);
    if (state.origin !== o) return; // ผู้ใช้ย้ายจุดซ้ำระหว่างรอ
    const dist = (data.distances || [])[0], dur = (data.durations || [])[0];
    if (!dist) throw new Error("no distances");
    targets.forEach((s, i) => {
      liveRoutes[s.slug] = dist[i + 1] != null
        ? { km: +(dist[i + 1] / 1000).toFixed(1), min: dur && dur[i + 1] != null ? Math.round(dur[i + 1] / 60) : null }
        : null;
    });
    setRouteStatus(`✓ คำนวณเส้นทางใหม่จากจุดตั้งต้นแล้ว (${targets.length} โรงเรียน) — เส้นทางวาดตอนกดเลือกโรงเรียน`);
  } catch (e) { // table ล่ม → ทีละโรงแบบ route เต็ม (ได้ geometry มาด้วย)
    let ok = 0;
    for (let i = 0; i < targets.length; i++) {
      if (state.origin !== o) return;
      const s = targets[i];
      setRouteStatus(`กำลังคำนวณเส้นทางทีละโรงเรียน ${i + 1}/${targets.length}…`);
      try { liveRoutes[s.slug] = await fetchRoute(o, s); ok++; }
      catch (e2) { liveRoutes[s.slug] = null; }
      renderMapList();
      if (i < targets.length - 1) await new Promise(r2 => setTimeout(r2, 300));
    }
    setRouteStatus(ok ? `✓ คำนวณเส้นทางใหม่แล้ว (${ok}/${targets.length} โรงเรียน)` : "✗ คำนวณเส้นทางไม่ได้ (ต้องออนไลน์) — แสดงระยะตรงแทน");
  }
  renderMapList();
}
async function setOrigin(lat, lon) {
  setPickMode(false);
  state.origin = { lat, lon };
  try { localStorage.setItem(SK + "origin", JSON.stringify(state.origin)); } catch (e) {}
  if (homeMarker) homeMarker.setLatLng([lat, lon]);
  renderRings();
  renderHomePanel();
  if (isCustomOrigin()) {
    await recalcRoutes();
    if (state.mapSel) selectSchool(bySlug(state.mapSel), false);
  } else { // กลับบ้านจริง — ใช้เส้นทางที่ build ฝังไว้
    initLiveRoutes();
    setRouteStatus("");
    renderMapList();
    if (state.mapSel) selectSchool(bySlug(state.mapSel), false);
  }
}
function setPickMode(on) {
  pickMode = on;
  $("#home-pick").classList.toggle("active", on);
  $("#home-pick").textContent = on ? "🖱️ คลิกจุดบนแผนที่…" : SHARE ? "📍 เลือกจุดตั้งต้นใหม่" : "📍 เลือกจุด Home ใหม่";
  $("#map").classList.toggle("picking", on);
}
function selectSchool(s, fly = true) {
  state.mapSel = s.slug;
  renderMapList();
  if (!map) return;
  const mk = markers.find(m => m.slug === s.slug);
  if (!mk) return;
  const o = homePos(), r = rOf(s);
  if (!drawRouteLine(s, fly)) {
    // ยังไม่มี geometry — วาดเส้นตรง (ประ) ไปก่อน แล้วดึงเส้นทางขับจริงมาแทนเมื่อได้
    selLine = L.polyline([[o.lat, o.lon], [s.lat, s.lon]], { color: "#014f95", weight: 2.5, dashArray: "7 7", opacity: .8 }).addTo(map);
    if (fly) map.fitBounds(L.latLngBounds([[o.lat, o.lon], [s.lat, s.lon]]).pad(0.35));
    if (r && !r.pending) {
      routeGeometry(o, s).then(route => {
        if (!route || state.mapSel !== s.slug || homePos() !== o) return;
        liveRoutes[s.slug] = route;
        renderMapList();
        drawRouteLine(s, false);
      });
    }
  }
  mk.mk.openPopup();
}
function drawRouteLine(s, fly) {
  if (selLine) { map.removeLayer(selLine); selLine = null; }
  const o = homePos(), r = rOf(s);
  if (!r || !r.coords) return false;
  // เส้นทางขับรถจริงตามถนน (OSRM) — เส้นทึบ + จุดปลายทาง
  const line = L.polyline(r.coords, { color: "#014f95", weight: 4.5, opacity: .9 })
    .bindTooltip(`🚗 ${r.km} กม. · ≈${r.min} นาที (ไม่รวมรถติด)`, { sticky: true });
  selLine = L.layerGroup([
    line,
    L.circleMarker([o.lat, o.lon], { radius: 4, color: "#fff", weight: 2, fillColor: "#014f95", fillOpacity: 1 }),
    L.circleMarker([s.lat, s.lon], { radius: 4, color: "#fff", weight: 2, fillColor: "#014f95", fillOpacity: 1 }),
  ]).addTo(map);
  if (fly) map.fitBounds(L.latLngBounds(r.coords).pad(0.15));
  return true;
}

/* ---------- schools: filter + cards ---------- */
function applyFilters() {
  const f = state.filters;
  return D.schools.filter(s => {
    if (f.q && !(s.name + s.short + s.oneliner + (s.programs || []).join(" ")).toLowerCase().includes(f.q.toLowerCase())) return false;
    if (f.dist < 10 && s.distance_km > f.dist) return false;
    if (f.minLevel && lvMax(s) < f.minLevel) return false;
    if (f.chinese !== "all" && s.chinese !== f.chinese) return false;
    if (f.secondary && !s.secondary) return false;
    if (f.hideUnknown && costOf(s) == null) return false;
    if (costOf(s) != null && costOf(s) > f.budget) return false;
    return true;
  });
}
function countActiveFilters() { // จำนวนตัวกรองที่เปิดอยู่ — ป้ายบนปุ่มล้างของแถบตัวกรองโรงเรียน
  const f = state.filters;
  return (f.q ? 1 : 0) + (f.budget < 400000 ? 1 : 0) + (f.dist < 10 ? 1 : 0) + (f.minLevel ? 1 : 0)
    + (f.chinese !== "all" ? 1 : 0) + (f.secondary ? 1 : 0) + (f.hideUnknown ? 1 : 0);
}
function patchResetBtn(sel, n) { // ปุ่มล้างตัวกรอง: มีอะไรให้ล้าง = ไฮไลต์ + บอกจำนวน · ไม่มี = จางกดไม่ได้
  const b = $(sel);
  b.textContent = n ? `↺ ล้าง ${n} ตัวกรอง` : "↺ ล้างตัวกรอง";
  b.disabled = !n;
  b.classList.toggle("has-active", !!n);
}
/* คู่สไลเดอร์ + ช่องพิมพ์เลข (งบ/ราคา) — ลากหรือพิมพ์ตรง ๆ ก็ได้ ค่า sync กันเสมอ
   พิมพ์ได้ "150000" / "150,000" / "150k" · เกินช่วงปัดเข้า [min,400000] · ครบ 400000 = ทั้งหมด
   ระหว่างพิมพ์ไม่เขียนทับช่อง (กัน caret เด้ง) — จัดรูปช่องตอน blur */
function wireBudgetNum(numSel, rangeSel, outSel, minV, apply) {
  const num = $(numSel), range = $(rangeSel), out = $(outSel);
  const commit = v => {
    v = Math.round(Math.max(minV, Math.min(400000, v)));
    range.value = v;
    out.textContent = v >= 400000 ? "ทั้งหมด" : "≤ " + fmtBaht(v);
    apply(v);
  };
  range.oninput = () => { commit(+range.value); num.value = range.value; };
  num.oninput = () => {
    const m = num.value.replace(/[,\s]/g, "").match(/^(\d+(?:\.\d+)?)(k?)$/i);
    if (m) commit(parseFloat(m[1]) * (m[2] ? 1000 : 1));
  };
  num.onblur = () => { num.value = range.value; };
}
function renderFilterBar() {
  const f = state.filters;
  $("#filter-bar").innerHTML = `
    <div class="filter-head">
      <span class="filter-title">ตัวกรองโรงเรียน</span>
      <button class="filter-reset" id="f-reset" title="คืนค่าทุกตัวกรองเป็นค่าเริ่มต้น">↺ ล้างตัวกรอง</button>
    </div>
    <div class="frow">
      <span class="flabel" title="หาจากชื่อโรงเรียน ชื่อย่อ โปรแกรม และคำในคำโปรยของการ์ด">🔍 ค้นหา</span>
      <div class="fctrl"><input type="text" id="f-q" placeholder="ชื่อโรงเรียน / โปรแกรม…" value="${esc(f.q)}"></div>
    </div>
    <div class="frow">
      <span class="flabel" title="โรงเรียนหลายโปรแกรม (สามัญ/EP/IEP) ใช้ราคาต่ำสุดของโปรแกรม · โรงเรียนที่ไม่เปิดเผยราคาจะถูกหรี่ไว้">💰 งบค่าเล่าเรียน</span>
      <div class="fctrl fctrl-slider"><output class="fval" id="f-budget-v">${f.budget >= 400000 ? "ทั้งหมด" : "≤ " + fmtBaht(f.budget)}</output><input type="range" id="f-budget" min="37000" max="400000" step="1000" value="${f.budget}" aria-label="งบค่าเล่าเรียนสูงสุดต่อปี"><input type="text" class="fnum" id="f-budget-n" inputmode="numeric" value="${f.budget}" placeholder="บาท/ปี" title="พิมพ์ตัวเลขได้ เช่น 150000 หรือ 150k" aria-label="พิมพ์งบค่าเล่าเรียนสูงสุดต่อปี (บาท)"></div>
    </div>
    <div class="frow">
      <span class="flabel" title="ระยะตรงจาก${distWord} — ขับจริงประมาณ ×1.3–1.6 เท่า">📏 ระยะจาก${distWord}</span>
      <div class="fctrl fctrl-slider"><output class="fval" id="f-dist-v">${f.dist >= 10 ? "ทั้งหมด" : "≤ " + f.dist + " กม."}</output><input type="range" id="f-dist" min="3" max="10" step="0.5" value="${f.dist}" aria-label="ระยะจาก${distWord}สูงสุด"></div>
    </div>
    <div class="frow">
      <span class="flabel" title="แสดงเฉพาะโรงเรียนที่มีโปรแกรมระดับนี้ขึ้นไป (โปรแกรมสูงสุดที่ ป.1 ใหม่เข้าได้)">🗣️ ระดับอังกฤษ</span>
      <div class="fchips" id="f-level">
        <button data-lv="0" aria-pressed="${!f.minLevel}" class="${!f.minLevel ? "active" : ""}">ทุกระดับ</button>
        <button data-lv="2" aria-pressed="${f.minLevel === 2}" class="${f.minLevel === 2 ? "active" : ""}">เสริมอังกฤษ+</button>
        <button data-lv="3" aria-pressed="${f.minLevel === 3}" class="${f.minLevel === 3 ? "active" : ""}">EP+</button>
        <button data-lv="4" aria-pressed="${f.minLevel === 4}" class="${f.minLevel === 4 ? "active" : ""}">สองภาษา+</button>
        <button data-lv="5" aria-pressed="${f.minLevel === 5}" class="${f.minLevel === 5 ? "active" : ""}">นานาชาติ</button>
      </div>
    </div>
    <div class="frow">
      <span class="flabel">🇨🇳 ภาษาจีน</span>
      <div class="fctrl fctrl-wrap">
        <div class="fchips" id="f-zh">
          <button data-zh="all" aria-pressed="${f.chinese === "all"}" class="${f.chinese === "all" ? "active" : ""}">ทั้งหมด</button>
          <button data-zh="some" aria-pressed="${f.chinese === "some"}" class="${f.chinese === "some" ? "active" : ""}">มีจีนบ้าง</button>
          <button data-zh="intensive" aria-pressed="${f.chinese === "intensive"}" class="${f.chinese === "intensive" ? "active" : ""}">เข้มข้น (ตรีภาษา)</button>
        </div>
        <label class="ftoggle" title="แสดงเฉพาะโรงเรียนที่มีเส้นทางเรียนต่อมัธยม — ระดับสูงสุดต่างกัน (ม.3 ถึง ม.6/G.12 ดูชิป/คอลัมน์ มัธยมต่อ)"><input type="checkbox" id="f-sec" ${f.secondary ? "checked" : ""}>มีมัธยมต่อ</label>
        <label class="ftoggle" title="ซ่อนโรงเรียนที่ยังไม่มีตัวเลขราคา (ต้องโทรถามโรงเรียนเอง)"><input type="checkbox" id="f-hideunk" ${f.hideUnknown ? "checked" : ""}>ซ่อนโรงเรียนที่ไม่เปิดเผยราคา</label>
      </div>
    </div>`;
  patchResetBtn("#f-reset", countActiveFilters());

  $("#f-q").oninput = e => { f.q = e.target.value; patchResetBtn("#f-reset", countActiveFilters()); renderSchoolViews(); };
  wireBudgetNum("#f-budget-n", "#f-budget", "#f-budget-v", 37000, v => { f.budget = v; patchResetBtn("#f-reset", countActiveFilters()); renderSchoolViews(); });
  $("#f-dist").oninput = e => { f.dist = +e.target.value; $("#f-dist-v").textContent = f.dist >= 10 ? "ทั้งหมด" : "≤ " + f.dist + " กม."; patchResetBtn("#f-reset", countActiveFilters()); renderSchoolViews(); };
  $$("#f-level button").forEach(b => b.onclick = () => {
    f.minLevel = +b.dataset.lv;
    $$("#f-level button").forEach(x => { x.classList.toggle("active", x === b); x.setAttribute("aria-pressed", x === b); });
    patchResetBtn("#f-reset", countActiveFilters()); renderSchoolViews();
  });
  $$("#f-zh button").forEach(b => b.onclick = () => {
    f.chinese = b.dataset.zh;
    $$("#f-zh button").forEach(x => { x.classList.toggle("active", x === b); x.setAttribute("aria-pressed", x === b); });
    patchResetBtn("#f-reset", countActiveFilters()); renderSchoolViews();
  });
  $("#f-sec").onchange = e => { f.secondary = e.target.checked; patchResetBtn("#f-reset", countActiveFilters()); renderSchoolViews(); };
  $("#f-hideunk").onchange = e => { f.hideUnknown = e.target.checked; patchResetBtn("#f-reset", countActiveFilters()); renderSchoolViews(); };
  $("#f-reset").onclick = () => { state.filters = { ...DEFAULT_FILTERS }; renderFilterBar(); renderSchoolViews(); };
}
function schoolCard(s) {
  const dim = state.filters.budget < 400000 && costOf(s) == null;
  const inCmp = state.compare.includes(s.slug);
  return `<article class="school-card ${dim ? "dim" : ""}" style="border-left-color:${lvColor(s)}">
    <div class="card-head">
      <h3 data-open="${s.slug}">${s.short}</h3>
      <span class="dist-badge"${s.km_tdp != null ? ` title="True Digital Park ${s.km_tdp} กม. · One Bangkok ${s.km_ob} กม."` : ""}>${distIcon} ${s.distance_km} กม.</span>
    </div>
    <div class="chips">
      <span class="chip lv" style="background:${lvColor(s)}" title="${(LEVELS[lvMax(s)] || {}).desc || ""}">${lvText(s)}</span>
      ${s.chinese !== "none" ? `<span class="chip zh ${s.chinese === "intensive" ? "zh-intensive" : ""}">${ZH[s.chinese]}</span>` : ""}
      ${s.secondary ? `<span class="chip sec">มัธยมต่อ${s.secondary_to ? " ถึง " + esc(s.secondary_to) : ""}</span>` : ""}
      ${(s.programs || []).map(p => `<span class="chip">${esc(p)}</span>`).join("")}
    </div>
    <div class="card-cost">${s.cost != null ? `<b>${fmtBaht(s.cost)}</b>/ปี` : costRangeText(s) ? `<b>${costRangeText(s)}</b>/ปี <span class="footnote">ต่างตามโปรแกรม</span>` : "<b>ไม่เปิดเผย</b>"} ${s.first_year_est ? `<span class="footnote">· ปีแรก ~${fmtBaht(s.first_year_est)}</span>` : ""}
      <span class="ref">${esc(s.cost != null ? s.cost_ref : (s.cost_programs || []).length ? costProgramText(s) + " — " + s.cost_ref : s.cost_ref)}</span></div>
    ${s.oneliner ? `<div class="card-oneliner">${inline(esc(s.oneliner))}</div>` : ""}
    <div class="card-facts">
      ${s.class_size ? `<span>👶 ${esc(String(s.class_size))}</span>` : ""}
      ${s.school_hours ? `<span>🕐 ${esc(String(s.school_hours))}</span>` : ""}
      <span>${foodText(s.includes_food)}</span>
    </div>
    <div class="card-btns">
      <button class="btn btn-sm" data-open="${s.slug}">รายละเอียด</button>
      <button class="btn btn-sm ${inCmp ? "btn-toggle-on" : ""}" data-cmp="${s.slug}">${inCmp ? "✓ อยู่ในเทียบ" : "＋ เทียบ"}</button>
    </div>
  </article>`;
}
function renderSchools() {
  const list = applyFilters();
  $("#school-count").textContent = `พบ ${list.length} จาก ${D.schools.length} โรงเรียน` + (list.length === 0 ? " — ลองคลายตัวกรอง" : "");
  $("#school-grid").innerHTML = list.map(schoolCard).join("");
}
/* มุมมองการ์ด/ตารางในแท็บโรงเรียน — ใช้ชุดตัวกรองเดียวกัน */
function renderSchoolViews() { renderSchools(); if (state.view === "table") renderTable(); }
function setView(v) {
  state.view = v;
  $("#school-grid").hidden = v !== "cards";
  $("#table-block").hidden = v !== "table";
  $$("#view-seg button").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  if (v === "table") renderTable();
}

/* ---------- table ---------- */
const COLS = [
  { key: "short", label: "โรงเรียน", fmt: s => `<span class="nm" data-open="${s.slug}">${s.short}</span><span class="sub">${s.distance_km} กม. จาก${distWord}</span>` },
  { key: "distance_km", label: "ระยะ " + distIcon, fmt: s => `<span class="num">${s.distance_km}</span>${s.km_tdp != null ? `<span class="sub">TDP ${s.km_tdp} · OB ${s.km_ob}</span>` : ""}` },
  { key: "lv", label: "ระดับอังกฤษ", fmt: s => `<span class="chip lv" style="background:${lvColor(s)}">${lvText(s)}</span>` },
  { key: "chinese", label: "จีน", fmt: s => s.chinese === "none" ? "—" : `<span class="chip ${s.chinese === "intensive" ? "zh-intensive" : "zh"}">${ZH[s.chinese]}</span>` },
  { key: "cost", label: "ค่าเล่าเรียน/ปี", fmt: s => `<span class="num"><b>${s.cost != null ? fmtBaht(s.cost) : costRangeText(s) || "ไม่เปิดเผย"}</b></span><span class="sub">${esc(s.cost != null ? s.cost_ref : (s.cost_programs || []).length ? costProgramText(s) : s.cost_ref)}</span>` },
  { key: "first_year_est", label: "ปีแรกประมาณ", fmt: s => s.first_year_est ? `<span class="num">${fmtBaht(s.first_year_est)}</span>` : `<span class="sub">${esc((s.first_year_note || "").slice(0, 60)) || "—"}</span>` },
  { key: "includes_food", label: "อาหาร", fmt: s => s.includes_food === "yes" ? "✅" : s.includes_food === "no" ? "❌" : "❓" },
  { key: "class_size", label: "คน/ห้อง", fmt: s => esc(String(s.class_size || "—")) },
  { key: "school_hours", label: "เวลาเรียน", fmt: s => esc(String(s.school_hours || "ไม่พบ")) },
  { key: "secondary", label: "มัธยมต่อ", fmt: s => s.secondary ? esc(s.secondary_to || "มี") : "—" },
  { key: "cmp", label: "เทียบ", fmt: s => `<input type="checkbox" data-cmpchk="${s.slug}" ${state.compare.includes(s.slug) ? "checked" : ""} style="accent-color:#0092f9;width:16px;height:16px">` },
];
function sortVal(s, key) {
  if (key === "lv") return lvMax(s);
  if (key === "cost") return costOf(s); // โรงหลายโปรแกรมใช้ราคาต่ำสุดของโปรแกรม
  if (key === "cmp" || key === "short") return s.short;
  const v = s[key];
  return v == null || v === "" ? null : v;
}
function renderTable() { // ตารางเทียบ — แสดงเฉพาะโรงที่ผ่านตัวกรองชุดเดียวกับมุมมองการ์ด
  const { key, dir } = state.sort;
  const list = [...applyFilters()].sort((a, b) => {
    const va = sortVal(a, key), vb = sortVal(b, key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;          // ค่าว่างไว้ท้ายเสมอ
    if (vb == null) return -1;
    return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
  });
  $("#schools-table").innerHTML =
    "<thead><tr>" + COLS.map(c =>
      `<th data-sk="${c.key}">${c.label} ${key === c.key ? `<span class="arrow">${dir === 1 ? "▲" : "▼"}</span>` : ""}</th>`).join("") + "</tr></thead>" +
    "<tbody>" + list.map(s => `<tr>${COLS.map(c => `<td>${c.fmt(s)}</td>`).join("")}</tr>`).join("") + "</tbody>";
  $$("#schools-table th[data-sk]").forEach(th => th.onclick = () => {
    const k = th.dataset.sk;
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 };
    renderTable();
  });
}

/* ---------- cost chart ---------- */
function renderCostFilterBar() {
  const f = state.costFilters;
  const nActive = () => (f.q ? 1 : 0) + (f.max < 400000 ? 1 : 0);
  $("#cost-filter-bar").innerHTML = `
    <div class="filter-head">
      <span class="filter-title">ตัวกรองค่าใช้จ่าย</span>
      <button class="filter-reset" id="cf-reset" title="คืนค่าทุกตัวกรองเป็นค่าเริ่มต้น">↺ ล้างตัวกรอง</button>
    </div>
    <div class="frow">
      <span class="flabel">🔍 ค้นหา</span>
      <div class="fctrl"><input type="text" id="cf-q" placeholder="ชื่อโรงเรียน / โปรแกรม…" value="${esc(f.q)}"></div>
    </div>
    <div class="frow">
      <span class="flabel">💰 ราคาสูงสุด</span>
      <div class="fctrl fctrl-slider"><output class="fval" id="cf-max-v">${f.max >= 400000 ? "ทั้งหมด" : "≤ " + fmtBaht(f.max)}</output><input type="range" id="cf-max" min="0" max="400000" step="1000" value="${f.max}" aria-label="ราคาสูงสุดต่อปี"><input type="text" class="fnum" id="cf-max-n" inputmode="numeric" value="${f.max}" placeholder="บาท/ปี" title="พิมพ์ตัวเลขได้ เช่น 80000 หรือ 80k" aria-label="พิมพ์ราคาสูงสุดต่อปี (บาท)"></div>
    </div>`;
  patchResetBtn("#cf-reset", nActive());
  $("#cf-q").oninput = e => { f.q = e.target.value; patchResetBtn("#cf-reset", nActive()); renderCostChart(); };
  wireBudgetNum("#cf-max-n", "#cf-max", "#cf-max-v", 0, v => { f.max = v; patchResetBtn("#cf-reset", nActive()); renderCostChart(); });
  $("#cf-reset").onclick = () => { state.costFilters = { q: "", max: 400000 }; renderCostFilterBar(); renderCostChart(); };
}
function renderCostChart() {
  const maxVal = 400000;
  const cf = state.costFilters;
  const cfHit = (s, extra) => !cf.q || (s.name + s.short + s.oneliner + (s.programs || []).join(" ") + (extra || "")).toLowerCase().includes(cf.q.toLowerCase());
  const inRange = c => c != null && c <= cf.max;
  // 1 แถว/1 ราคา: โรงที่มีราคาเดียว = แถวเดียว · โรงที่ราคาต่างตามโปรแกรม (cost_p1_programs) = แยกแถวตามโปรแกรมที่มีตัวเลข
  const rows = [];
  let totalRows = 0;
  for (const s of D.schools) {
    if (s.cost != null) {
      totalRows++;
      if (cfHit(s) && inRange(s.cost)) rows.push({ s, label: s.short, cost: s.cost, unc: false, prog: null, tip: s.cost_includes });
    } else {
      for (const p of s.cost_programs || []) {
        if (p.cost == null) continue;
        totalRows++;
        if (cfHit(s, p.name) && inRange(p.cost)) rows.push({ s, label: s.short + " · " + p.name, cost: p.cost, unc: p.uncertain, prog: p, tip: p.text + (s.cost_includes ? " — " + s.cost_includes : "") });
      }
    }
  }
  const mode = state.costSort;
  // เรียงตามปีแรก: ใช้ first_year_est เมื่อมี — โรงที่ยังไม่มีตัวเลขปีแรก ใช้ราคา/ปีแทน (ปีแรกมัก ≥ ราคา/ปี จึงเรียงโดยประมาณได้)
  const fyv = r => (!r.prog && r.s.first_year_est) || r.cost;
  if (mode === "level") rows.sort((a, b) => lvMax(b.s) - lvMax(a.s) || a.cost - b.cost);
  else if (mode === "dist") rows.sort((a, b) => a.s.distance_km - b.s.distance_km || a.cost - b.cost);
  else if (mode === "name") rows.sort((a, b) => a.s.short.localeCompare(b.s.short, "th") || a.cost - b.cost); // โรงหลายโปรแกรม (สามัญ/EP/IEP) อยู่ติดกัน เรียงโปรแกรมจากราคาถูกไปแพง
  else if (mode === "firstyear") rows.sort((a, b) => fyv(a) - fyv(b));
  else rows.sort((a, b) => a.cost - b.cost);

  $("#cost-chart").innerHTML = rows.length ? rows.map(r => {
    const fy = !r.prog && r.s.first_year_est ? r.s.first_year_est : null;
    const fyExtra = fy && fy > r.cost; // ส่วนที่จ่ายเพิ่มปีแรก (ค่าครั้งเดียว/ค่าเก็บเฉพาะนักเรียนใหม่) — วาดแถบลายต่อจากแถบราคา/ปี
    return `
    <div class="cost-row">
      <div class="lb" data-open="${r.s.slug}">${esc(r.label)}${r.unc ? '<span class="unc"> (?)</span>' : ""}<span class="sub" style="display:block;color:var(--ink-3);font-size:11px">${r.s.distance_km} กม. · ${lvText(r.s)}</span></div>
      <div class="cost-track" data-fee="${r.s.slug}"${r.prog ? ` data-fee-prog="${esc(r.prog.name)}"` : ""} title="กดเพื่อดูรายการค่าใช้จ่ายแยกบรรทัด${r.tip ? " — " + esc(r.tip) : ""}">
        <div class="cost-bar${r.unc ? " unc" : ""}" style="width:${(r.cost / maxVal * 100).toFixed(1)}%;background:${lvColor(r.s)}"></div>
        ${fyExtra ? `<div class="cost-fy" style="left:${(r.cost / maxVal * 100).toFixed(1)}%;width:${((fy - r.cost) / maxVal * 100).toFixed(1)}%" title="+${fmtBaht(fy - r.cost)} ที่จ่ายเพิ่มปีแรก"></div>` : ""}
        ${fy ? `<div class="cost-diamond" style="left:${(fy / maxVal * 100).toFixed(1)}%" title="ปีแรก ~${fmtBaht(fy)}"></div>` : ""}
      </div>
      <div class="cost-val">${fmtBaht(r.cost)}${r.unc ? " (?)" : ""}${fy ? `<span class="fy">◆ ปีแรก ${fmtBaht(fy)}</span>` : ""}<span class="sub">${esc((r.s.cost_ref.match(/ป\.?\s?\d{3,4}|26-27|25[0-9]{2}/) || [r.unc ? "ต้องยืนยันกับโรงเรียน" : "ไม่ระบุปี"])[0])}</span></div>
    </div>`;
  }).join("") : `<div class="footnote" style="padding:14px 2px">ไม่มีรายการที่ตรงตัวกรอง — ลองปรับราคาสูงสุด ล้างคำค้น หรือกด "ล้างตัวกรอง"</div>`;
  $$("#cost-chart .cost-track").forEach(t => t.onclick = () => openFeeModal(t.dataset.fee, t.dataset.feeProg));
  $("#cost-count").textContent = `พบ ${rows.length} จาก ${totalRows} รายการราคา` + (rows.length === 0 && totalRows ? " — ลองคลายตัวกรอง" : "");

  const unknown = D.schools.filter(s => costOf(s) == null && cfHit(s));
  $("#cost-unknown").innerHTML = unknown.length ? "ยังไม่มีตัวเลขใช้เทียบ: " + unknown.map(s => {
    const progs = (s.cost_programs || []).map(p => p.text).join(" · ");
    return `<span class="chip" data-open="${s.slug}" title="${esc(s.cost_ref)}">${s.short}${progs ? " — " + esc(progs) : " — " + esc(String(s.cost_ref).slice(0, 50)) + "…"}</span>`;
  }).join("") : "";

  $("#cost-doc").innerHTML = mdToHtml(D.docs.cost.body);
}

/* ---------- modal breakdown รายการค่าใช้จ่าย (แท็บค่าใช้จ่าย: กดที่แถบ) ----------
   แหล่งข้อมูล = wiki/comparisons/cost-breakdown.md (ผ่าน D.docs["cost-breakdown"]) — สกัด section
   "### [[slug|ชื่อโรง]] …" ของโรงนั้นมาแสดงเป็นรายการแยก · โรงที่มีเฉพาะแถวในตาราง "ข้อมูลไม่สมบูรณ์"
   สร้างตาราง 1 แถว (หัวตาราง + แถวของโรงนั้น) · โรงที่แยกหลายหน้าแต่รวม section เดียว (เช่น สามัญ/EP) ชี้มาที่เดียวกัน */
let feeSecCache = null;
function feeSections() {
  if (feeSecCache) return feeSecCache;
  const map = new Map(); // slug → บรรทัด markdown ของ section
  const body = ((D.docs || {})["cost-breakdown"] || {}).body || "";
  const slugsIn = line => [...line.matchAll(/\[\[([^\]|]+?)(?:\\?\|[^\]]*)?\]\]/g)].map(m => m[1].trim());
  if (body) {
    const lines = body.split("\n");
    let sec = null, tblHead = null; // sec = ### section ปัจจุบัน · tblHead = หัวตาราง 2 บรรทัดของตารางใน ## ที่ไม่มี ###
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^##\s/.test(line)) { sec = null; tblHead = null; continue; }
      if (/^###\s/.test(line)) {
        sec = [line];
        slugsIn(line).forEach(slug => { if (!map.has(slug)) map.set(slug, sec); }); // section แรกที่เจอชนะ (กลุ่มสแกน/เว็บ ก่อนตารางไม่สมบูรณ์)
        continue;
      }
      if (sec) { sec.push(line); continue; }
      if (!line.startsWith("|") || /^\|[\s:|-]+\|?\s*$/.test(line)) continue;
      if (i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) { tblHead = [line, lines[i + 1]]; continue; }
      if (tblHead) slugsIn(line).forEach(slug => { if (!map.has(slug)) map.set(slug, [...tblHead, line]); });
    }
  }
  return (feeSecCache = map);
}
function openFeeModal(slug, progName) {
  const s = bySlug(slug); if (!s) return;
  const c = lvColor(s);
  const prog = progName ? (s.cost_programs || []).find(p => p.name === progName) : null;
  const cost = prog ? prog.cost : s.cost;
  const unc = prog ? !!prog.uncertain : false;
  const year = (String(s.cost_ref).match(/ป\.?\s?\d{3,4}|26-27|25[0-9]{2}/) || ["ไม่ระบุปี"])[0];
  const sec = feeSections().get(slug);
  const qf = [
    ["ค่าเล่าเรียน/ปี" + (prog ? " (โปรแกรมนี้)" : ""), cost != null ? fmtBaht(cost) + (unc ? " (?)" : "") : "ไม่เปิดเผย"],
    ["ปีแรกประมาณ", !prog && s.first_year_est ? fmtBaht(s.first_year_est) : (s.first_year_note || "—")],
    ["รวมอาหารกลางวัน?", foodText(s.includes_food)],
    ["อ้างอิงราคา", year],
  ];
  const noSec = `<div class="fee-nosec"><b>ยังไม่มีตารางแยกรายการค่าใช้จ่ายของโรงเรียนนี้ใน wiki</b><br>
    ${(s.cost_programs || []).length ? "ราคาตามโปรแกรม: " + esc(costProgramText(s)) + "<br>" : ""}
    <span class="footnote">${esc(s.cost_ref)}</span></div>`;
  $("#fee-modal").innerHTML = `
    <div class="fee-head" style="background:linear-gradient(120deg, ${c}, ${c}cc)">
      <button class="drawer-close" id="fee-x" title="ปิด">✕</button>
      <h2>${s.name}${prog ? ` · ${esc(prog.name)}` : ""}</h2>
      <div class="sub">${s.distance_km} กม. จาก${distWord} · ${lvText(s)} · ${ZH[s.chinese]}</div>
    </div>
    <div class="fee-body">
      <div class="qf-grid">${qf.map(([k, v]) => `<div class="qf"><b>${k}</b>${esc(String(v))}</div>`).join("")}</div>
      ${sec ? `<h3 class="fee-sec-title">🧾 รายการค่าใช้จ่ายแยกบรรทัด — ถอดจากหน้า wiki "Breakdown รายการค่าใช้จ่าย"</h3>
        <div class="md fee-md">${mdToHtml(sec.join("\n").trim())}</div>` : noSec}
      <p class="footnote" style="margin:10px 0 12px">ตัวเลขอ้างอิงปีการศึกษาต่างกัน (2567–2570) — (?) = อ่านจากแหล่งไม่ชัด/ทุติยภูมิ ตามไฟล์ raw ของโรงเรียน</p>
    </div>
    <div class="fee-btns">
      <button class="btn btn-sm" id="fee-detail">🏫 รายละเอียดโรงเรียน</button>
      ${D.docs["cost-breakdown"] ? `<button class="btn btn-sm" id="fee-alldoc">📄 หน้า breakdown ทั้งหมด</button>` : ""}
      <button class="btn btn-sm btn-primary" id="fee-close">ปิด</button>
    </div>`;
  $("#fee-modal").hidden = false;
  $("#fee-scrim").hidden = false;
  $("#fee-x").onclick = closeFeeModal;
  $("#fee-close").onclick = closeFeeModal;
  $("#fee-scrim").onclick = closeFeeModal;
  $("#fee-detail").onclick = () => { closeFeeModal(); openDetail(slug); };
  const ad = $("#fee-alldoc");
  if (ad) ad.onclick = () => { closeFeeModal(); state.doc = "cost-breakdown"; switchTab("docs"); renderDocs(); };
}
function closeFeeModal() {
  $("#fee-modal").hidden = true;
  $("#fee-modal").innerHTML = "";
  $("#fee-scrim").hidden = true;
}

/* ---------- modal ดูไฟล์ข้อมูลดิบ raw/*.md ----------
   ลิงก์ raw ใน wiki ชี้ path สัมพัทธ์ (../../raw/…) ซึ่ง 404 เมื่อ serve เฉพาะ web/ —
   build.py เลยฝังเนื้อหา .md ของ raw/ มาใน data.js แล้วเปิดดูที่นี่แทน · ไฟล์ที่ไม่ได้ฝัง
   (รูปสแกน/KMZ) แจ้งและชี้ path จริงของ repo ตามเดิม */
function openRaw(path) {
  const el = $("#raw-modal");
  const content = RAW.get(path);
  const name = path.split("/").pop();
  if (content == null && path.endsWith("/")) { // ลิงก์โฟลเดอร์ — แสดงรายชื่อไฟล์ .md ที่ฝังมาในโฟลเดอร์นั้น
    const subs = [...RAW.keys()].filter(k => k.startsWith(path)).sort();
    el.innerHTML = `
      <div class="fee-head" style="background:#64748b">
        <button class="drawer-close" id="raw-x" title="ปิด">✕</button>
        <h2>📁 ${esc(path)}</h2><div class="sub">โฟลเดอร์ข้อมูลดิบ — ไฟล์ .md ที่ฝังในเว็บ ${subs.length} ไฟล์</div>
      </div>
      <div class="fee-body"><div class="raw-dir">${subs.length
        ? subs.map(k => `<a class="rawlink" data-raw="${esc(k)}">📎 ${esc(k)}</a>`).join("")
        : `<div class="fee-nosec">ไม่มีไฟล์ .md ในโฟลเดอร์นี้ที่ฝังในเว็บ</div>`}</div></div>
      <div class="fee-btns"><button class="btn btn-sm btn-primary" id="raw-close">ปิด</button></div>`;
  } else if (content == null) {
    el.innerHTML = `
      <div class="fee-head" style="background:#64748b">
        <button class="drawer-close" id="raw-x" title="ปิด">✕</button>
        <h2>📎 ${esc(name)}</h2><div class="sub">${esc(path)}</div>
      </div>
      <div class="fee-body"><div class="fee-nosec"><b>ไฟล์นี้ไม่ได้ฝังในเว็บ</b> (เช่น รูปสแกน/KMZ — ไฟล์ใหญ่)<br>
        ดูในโฟลเดอร์ <code>raw/</code> ของโปรเจกต์ หรือเปิด path จริง: <a href="../${esc(path)}" target="_blank">${esc(path)}</a></div></div>
      <div class="fee-btns"><button class="btn btn-sm btn-primary" id="raw-close">ปิด</button></div>`;
  } else {
    el.innerHTML = `
      <div class="fee-head" style="background:linear-gradient(120deg,#b45309,#d97706)">
        <button class="drawer-close" id="raw-x" title="ปิด">✕</button>
        <h2>📎 ${esc(name)}</h2><div class="sub">ไฟล์ข้อมูลดิบ ${esc(path)} — source of truth (ห้ามแก้)</div>
      </div>
      <div class="fee-body">
        <div class="raw-meta">
          <label style="display:inline-flex;align-items:center;gap:5px;font-size:13px">
            <input type="checkbox" id="raw-src-toggle" style="accent-color:#b45309"><span>แสดงต้นฉบับ (มาร์กดาวน์ดิบ)</span></label>
          <span class="footnote">เนื้อหาตรงจากไฟล์ raw ทั้งไฟล์ — (?) = ไม่แน่นอนตามที่ raw ใช้</span>
        </div>
        <div class="md" id="raw-view">${mdToHtml(content)}</div>
        <pre class="raw-src" id="raw-src" hidden>${esc(content)}</pre>
      </div>
      <div class="fee-btns">
        <button class="btn btn-sm" id="raw-dl">⬇️ ดาวน์โหลด .md</button>
        <button class="btn btn-sm btn-primary" id="raw-close">ปิด</button>
      </div>`;
    $("#raw-src-toggle").onchange = e => { $("#raw-view").hidden = e.target.checked; $("#raw-src").hidden = !e.target.checked; };
    $("#raw-dl").onclick = () => {
      const blob = new Blob([content], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
  }
  el.hidden = false;
  $("#raw-scrim").hidden = false;
  $("#raw-x").onclick = closeRaw;
  $("#raw-close").onclick = closeRaw;
  $("#raw-scrim").onclick = closeRaw;
}
function closeRaw() {
  $("#raw-modal").hidden = true;
  $("#raw-modal").innerHTML = "";
  $("#raw-scrim").hidden = true;
}

/* ---------- ปฏิทินรับสมัคร (Gantt จาก wiki/comparisons/admission-calendar.md) ---------- */
const ADM_STATUS = {
  open:    { label: "เปิดรับแล้ว", icon: "🟢", color: "#2fa14b", soft: "#e7f6ea", ink: "#1d6f31" },
  rolling: { label: "รับตลอด/ไม่มีรอบ", icon: "🔵", color: "#0284d2", soft: "#e3f2fe", ink: "#015f9e" },
  early:   { label: "ยื่นล่วงหน้าได้", icon: "🟡", color: "#e08900", soft: "#fef3df", ink: "#8f5300" },
  none:    { label: "ยังไม่มีประกาศ", icon: "⚪", color: "#94a3b8", soft: "#f1f5f9", ink: "#475569" },
};
const TH_M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const CAL_W = 74;      // px ต่อเดือน
const CAL_LANE_H = 24; // px ต่อ lane ของเหตุการณ์

function ymParse(s) { const p = String(s).split("-").map(Number); return { y: p[0], m: p[1], d: p.length > 2 ? p[2] : null }; }
function thDate(str) {
  const { y, m, d } = ymParse(str);
  return d ? `${d} ${TH_M[m - 1]} ${String(y + 543).slice(-2)}` : `${TH_M[m - 1]} ${String(y + 543).slice(-2)}`;
}

function renderCalendar() {
  if (!D.admission) return;
  renderCalGroups();
  renderCalChart();
  renderCalCards();
}

/* การ์ดกลุ่มสถานะ (ตาราง "ภาพรวม" ของ wiki) — กดเพื่อไฮไลต์กลุ่มนั้นในไทม์ไลน์ */
function renderCalGroups() {
  const A = D.admission;
  $("#cal-groups").innerHTML = A.groups.map(g => {
    const st = ADM_STATUS[g.code];
    const n = A.rows.filter(r => r.status === g.code).length;
    return `<button class="cal-group ${state.calFilter === g.code ? "active" : ""}" style="--gc:${st.color};--gb:${st.soft};--gi:${st.ink}" data-gfilter="${g.code}">
      <div class="cal-group-head">${st.icon} <b>${esc(g.title)}</b> <span class="count">${n} โรงเรียน</span></div>
      <div class="cal-group-urg">${inline(esc(g.urgency))}</div>
    </button>`;
  }).join("");
  $$("#cal-groups [data-gfilter]").forEach(b => b.onclick = () => {
    state.calFilter = state.calFilter === b.dataset.gfilter ? null : b.dataset.gfilter;
    renderCalGroups(); renderCalChart(); renderCalCards();
  });
}

/* ไทม์ไลน์แบบ Gantt: 1 แถว/โรง · แถบ = ช่วงวันที่ · ลาย = คาดการณ์ · จาง = ผ่านแล้ว */
function renderCalChart() {
  const A = D.admission;
  const months = (() => {
    const a = ymParse(A.span[0]), b = ymParse(A.span[1]);
    const out = [];
    for (let y = a.y, m = a.m; y * 12 + m <= b.y * 12 + b.m; m === 12 ? (m = 1, y++) : m++) out.push({ y, m });
    return out;
  })();
  const m0 = months[0];
  const totalW = months.length * CAL_W;
  const xOf = (str, isEnd) => {
    const { y, m, d } = ymParse(str);
    const idx = (y - m0.y) * 12 + (m - m0.m);
    const dim = new Date(y, m, 0).getDate();
    const frac = d ? Math.min(((d - 1) + (isEnd ? 1 : 0)) / dim, 1) : (isEnd ? 1 : 0);
    return (idx + frac) * CAL_W;
  };

  const evTip = ev => {
    let t = ev.label + (ev.uncertain ? " (?)" : "");
    if (ev.start) t += ` · ${thDate(ev.start)}${ev.kind === "from" ? " เป็นต้นไป" : ev.end ? " – " + thDate(ev.end) : ""}`;
    if (ev.expected) t += " · คาดการณ์ ไม่ใช่ประกาศโรงเรียน";
    return t;
  };
  const pill = (ev, x1, x2, lane, slug, st) => {
    const cls = ["cal-ev", ev.expected ? "is-expected" : "", ev.past ? "is-past" : "", ev.uncertain ? "is-uncertain" : ""].filter(Boolean).join(" ");
    const top = lane * CAL_LANE_H + 3;
    const label = esc(ev.label) + (ev.uncertain ? " (?)" : "");
    if (ev.kind === "always") return `<div class="${cls} is-always" style="left:0;width:${totalW}px;top:${top}px;background:${st.soft};color:${st.ink}" title="${esc(evTip(ev))}" data-open="${slug}">${label}</div>`;
    if (ev.kind === "from") return `<div class="cal-tail" style="left:${x1}px;width:${Math.max(totalW - x1, 0)}px;top:${top + CAL_LANE_H / 2}px;background:${st.color}"></div>` +
      `<div class="${cls}" style="left:${x1}px;top:${top}px;background:${st.color}" title="${esc(evTip(ev))}" data-open="${slug}">${label} →</div>`;
    if (x2 - x1 < 64) return `<div class="${cls} cal-dot" style="left:${x1}px;top:${top}px;background:${st.color}" title="${esc(evTip(ev))}" data-open="${slug}"></div>` +
      `<span class="cal-note" style="left:${x2 + 6}px;top:${top + 2}px">${label}</span>`;
    return `<div class="${cls}" style="left:${x1}px;width:${x2 - x1}px;top:${top}px;background:${st.color}" title="${esc(evTip(ev))}" data-open="${slug}">${label}</div>`;
  };
  const rowHtml = r => {
    const s = bySlug(r.slug) || {};
    const st = ADM_STATUS[r.status] || ADM_STATUS.none;
    const evs = (A.events[r.slug] || []).map(ev => {
      if (ev.kind === "always") return { ev, x1: 0, x2: totalW };
      const x1 = xOf(ev.start);
      const x2 = ev.kind === "from" ? totalW : xOf(ev.end || ev.start, true) + (ev.end ? 0 : (ymParse(ev.start).d ? 16 : CAL_W));
      return { ev, x1, x2: Math.max(x2, x1 + 12) };
    }).sort((a, b) => a.x1 - b.x1);
    const laneEnds = [];
    evs.forEach(it => {
      let lane = laneEnds.findIndex(end => end + 4 <= it.x1);
      if (lane === -1) { lane = laneEnds.length; }
      laneEnds[lane] = Math.max(laneEnds[lane] || 0, it.ev.kind === "from" ? totalW : it.x2);
      it.lane = lane;
    });
    const lanes = Math.max(1, laneEnds.length);
    const dim = state.calFilter && r.status !== state.calFilter ? " cal-dim" : "";
    return `<div class="cal-row${dim}">
      <div class="cal-label"><button class="cal-name" data-open="${r.slug}">${s.short || esc(r.name)}</button><span class="cal-dist">${s.distance_km != null ? s.distance_km + " กม." : ""}</span></div>
      <div class="cal-track" style="height:${lanes * CAL_LANE_H + 6}px;width:${totalW}px">${evs.map(it => pill(it.ev, it.x1, it.x2, it.lane, r.slug, st)).join("")}</div>
    </div>`;
  };

  const msStrip = `<div class="cal-row cal-ms-row">
    <div class="cal-label cal-ms-label">หมุดหมาย</div>
    <div class="cal-track" style="height:30px;width:${totalW}px">${A.milestones.map(ms => `<span class="cal-ms is-${ms.kind}" style="left:${xOf(ms.date)}px" title="${esc(ms.label)}">${ms.kind === "term" ? "🎒" : "🔁"} ${esc(ms.label)}</span>`).join("")}</div>
  </div>`;
  const vLines = A.milestones.filter(ms => ms.kind === "term").map(ms =>
    `<i class="cal-vline is-term" style="left:${xOf(ms.date)}px"></i>`).join("") +
    `<i class="cal-vline is-now" style="left:${xOf(A.as_of)}px"><span>ข้อมูล ณ ${thDate(A.as_of)}</span></i>`;
  const grid = months.map((mm, i) => `<i class="cal-grid" style="left:${i * CAL_W}px"></i>`).join("");

  $("#cal-chart").innerHTML =
    `<div class="cal-hrow"><div class="cal-corner">โรงเรียน (ระยะจาก${distWord}) / เดือน</div><div class="cal-months">` +
    months.map(mm => `<span class="cal-month${mm.m === 1 ? " yr" : ""}">${TH_M[mm.m - 1]} ${String(mm.y + 543).slice(-2)}</span>`).join("") +
    `</div></div>
     <div class="cal-body">${grid}${msStrip}${A.rows.map(rowHtml).join("")}
       <div class="cal-lines">${vLines}</div>
     </div>`;
  $("#cal-legend").innerHTML = [
    `<span class="lg"><i class="sw" style="background:#0284d2"></i>แถบสี = กำหนดการจากโรงเรียน</span>`,
    `<span class="lg"><i class="sw is-expected"></i>ลาย = คาดการณ์ (รอบปีก่อน)</span>`,
    `<span class="lg"><i class="sw is-uncertain"></i>ขอบประ + (?) = ยังไม่ยืนยัน</span>`,
    `<span class="lg">→ จาง = "เป็นต้นไป" · แถบจางมาก = ผ่านไปแล้ว</span>`,
    `<span class="lg"><i class="cal-vline is-term" style="position:static;height:14px"></i>เส้นประเขียว = เปิดเทอม</span>`,
  ].join("");
}

/* การ์ดรายโรง: กำหนดการ/ค่าสมัคร/เกณฑ์อายุ/ช่องทาง — ข้อความจากตารางหลักของ wiki */
function renderCalCards() {
  const A = D.admission;
  $("#cal-cards").innerHTML = ["open", "rolling", "early", "none"].map(code => {
    const rows = A.rows.filter(r => r.status === code);
    if (!rows.length) return "";
    const st = ADM_STATUS[code];
    const g = A.groups.find(x => x.code === code);
    const dim = state.calFilter && state.calFilter !== code ? " cal-dim" : "";
    return `<div class="cal-card-group${dim}">
      <h3 style="border-bottom-color:${st.color}">${st.icon} ${esc(g ? g.title : st.label)} <span class="footnote">${rows.length} โรงเรียน</span></h3>
      <div class="cal-cards-grid">` +
      rows.map(r => {
        const s = bySlug(r.slug) || {};
        return `<article class="cal-card" style="border-top:3px solid ${st.color}">
          <div class="cal-card-head">
            <h4 data-open="${r.slug}">${s.short || esc(r.name)}</h4>
            <span class="chip" style="background:${st.soft};color:${st.ink}">${st.icon} ${esc(r.status_text || st.label)}</span>
          </div>
          <div class="cal-card-sched">${inline(esc(r.schedule))}</div>
          <dl class="cal-card-facts">
            <div><dt>ค่าสมัคร</dt><dd>${inline(esc(r.fee))}</dd></div>
            <div><dt>อายุ ป.1/2570</dt><dd>${inline(esc(r.age))}</dd></div>
            <div><dt>ช่องทาง</dt><dd>${inline(esc(r.channel))}</dd></div>
          </dl>
        </article>`;
      }).join("") + `</div></div>`;
  }).join("");
}

/* ---------- compare ---------- */
function renderCompare() {
  const list = state.compare.map(bySlug).filter(Boolean);
  if (!list.length) {
    $("#compare-area").innerHTML = `<div class="panel compare-hint">ยังไม่ได้เลือกโรงเรียนเทียบ<br><span class="footnote">ไปที่แท็บ "โรงเรียน" แล้วกดปุ่ม "＋ เทียบ" หรือติ๊กคอลัมน์เทียบในตาราง (เลือกได้ 2–4 โรงเรียน)</span></div>`;
    return;
  }
  const minCost = Math.min(...list.map(costOf).filter(c => c != null));
  const minDist = Math.min(...list.map(s => s.distance_km));
  const rows = [
    ["ระยะจาก" + distWord, s => `<span class="num ${s.distance_km === minDist ? "best" : ""}">${s.distance_km} กม.</span>`],
    ...(D.schools.some(x => x.km_tdp != null)
      ? [["ระยะจากที่ทำงาน", s => `TDP ${s.km_tdp} · One Bangkok ${s.km_ob} กม.`]]
      : []),
    ["โปรแกรม ป.1", s => esc((s.programs || []).join(" · "))],
    ["ระดับอังกฤษ", s => `<span class="chip lv" style="background:${lvColor(s)}">${lvText(s)}</span> <span class="footnote">${(LEVELS[lvMax(s)] || {}).desc}</span>`],
    ["สัดส่วนภาษา ป.1", s => { const m = langMix(s); return m
      ? `<b>${m}</b> <span class="footnote">${langBasisTag(s)}${s.lang_note ? " — " + esc(s.lang_note) : ""}</span>`
      : `<span class="footnote">ไม่เปิดเผย — ต้องถามโรง (ดูหน้าเอกสาร "สัดส่วนภาษา")</span>`; }],
    ["ภาษาจีน", s => { const p = langPct(s.lang_zh); return p != null
      ? `<b>${p}</b>${s.chinese === "intensive" ? " (ตรีภาษา)" : ""}` : ZH[s.chinese]; }],
    ["ค่าเล่าเรียน/ปี", s => `<b class="num ${costOf(s) === minCost ? "best" : ""}">${s.cost != null ? fmtBaht(s.cost) : costRangeText(s) || "ไม่เปิดเผย"}</b><span class="sub">${esc(s.cost != null ? s.cost_ref : (s.cost_programs || []).length ? costProgramText(s) + " — " + s.cost_ref : s.cost_ref)}</span>`],
    ["ปีแรกประมาณ", s => s.first_year_est ? fmtBaht(s.first_year_est) : `<span class="footnote">${esc(s.first_year_note)}</span>`],
    ["รวมอาหาร?", s => foodText(s.includes_food)],
    ["รายละเอียดสิ่งที่รวม", s => `<span class="footnote">${esc(s.cost_includes)}</span>`],
    ["ขนาดห้อง", s => esc(String(s.class_size || "ไม่พบ"))],
    ["เวลาเรียน", s => esc(String(s.school_hours || "ไม่พบ"))],
    ["มัธยมต่อ", s => s.secondary ? (s.secondary_to ? "✅ ถึง " + s.secondary_to : "✅ มี") : "— จบที่ ป.6"],
    ["ประเภท/เครือ", s => esc(s.type)],
  ];
  $("#compare-area").innerHTML = `<div class="panel"><div class="compare-table-wrap"><table class="cmp-table">
    <thead><tr><th></th>${list.map(s => `<th style="border-bottom-color:${lvColor(s)}"><span class="cmp-remove" data-uncmp="${s.slug}">✕</span><span data-open="${s.slug}" style="cursor:pointer">${s.short}</span><span class="sub">${s.distance_km} กม.</span></th>`).join("")}</tr></thead>
    <tbody>${rows.map(([label, fmt]) => `<tr><td>${label}</td>${list.map(s => `<td>${fmt(s)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div></div>
  <div class="panel md" id="cmp-notes">${list.map(s => mdToHtml(s.body)).join('<hr style="border-top:2px solid var(--line)">')}</div>`;
}

/* ---------- radar จุดเด่น–จุดสังเกต ---------- */
const RC = ["#0092f9", "#fd5b65", "#01a88f", "#fda102"]; // สีของโรงบนกราฟตามลำดับที่เลือก — 4 สีหลักจากโลโก้
const hasInfo = v => v != null && !/^ไม่(ชัด|พบ|ระบุ|ทราบ)/.test(String(v).trim()); // มีค่าและไม่ใช่ "ไม่ชัด/ไม่พบ…"
const lin = (lo, hi, v) => Math.max(1, Math.min(5, 5 - (v - lo) * 4 / (hi - lo))); // ค่าจริง → 1–5 (น้อยกว่า = กว้างกว่า)
const infoScore = s => (costOf(s) != null ? 2 : 0) + (hasInfo(s.class_size) ? 1.5 : 0) + (hasInfo(s.school_hours) ? 1.5 : 0);
const costYear = s => (String(s.cost_ref || "").match(/ป\.?\s?\d{3,4}|26-27|25[0-9]{2}/) || [""])[0];

/* 7 แกนของเรดาร์ — คะแนนทั้งหมด normalize จากข้อมูลจริงใน wiki ไม่ใช่การตัดสินคุณภาพ
   (น้ำหนักแต่ละแกนเป็นของผู้ปกครอง — ยังไม่ได้กำหนดใน criteria.md)
   3 แกนภาษาใช้ % ของเวลาเรียนจริงจาก wiki/comparisons/language-mix.md เมื่อมีข้อมูล
   โรงที่ไม่เปิดเผย % จะ fallback เป็นระดับ L1–L5 (อังกฤษ) หรือ ไม่มี/วิชาภาษา/เข้มข้น (จีน) */
const pctScore = (v, full) => v == null ? null : Math.max(1, Math.min(5, 1 + 4 * v / full)); // v% → 1–5
const AXES = [
  { icon: "🗣️", label: "อังกฤษเข้ม",
    desc: "% ของเวลาเรียนที่สอนเป็นอังกฤษ (หน้า wiki สัดส่วนภาษา) — 5% = 1 · 95% = 5 · โรงที่ไม่เปิดเผย % ใช้ระดับโปรแกรม L1 สามัญ → L5 นานาชาติ แทน",
    score: s => { const v = langNum(s.lang_eng); return v != null ? pctScore(v, 95) : (lvMax(s) || 1); },
    raw: s => { const p = langPct(s.lang_eng); return p != null
      ? `<b>${p}</b> <span class="sub">${langBasisTag(s)}</span>`
      : `${(LEVELS[lvMax(s)] || {}).short || "?"} (L${lvMax(s) || "?"}) <span class="sub">% ไม่เปิดเผย</span>`; } },
  { icon: "🇹🇭", label: "ภาษาไทย",
    desc: "% ของเวลาเรียนที่สอนเป็นไทย — 5% = 1 · 95% = 5 · เป็นสัดส่วนเวลา ไม่ใช่คุณภาพการสอน (น้ำหนักของแกนนี้เป็นของผู้ปกครอง) · โรงที่ไม่เปิดเผย = ไม่มีข้อมูล (?)",
    score: s => pctScore(langNum(s.lang_thai), 95),
    raw: s => { const p = langPct(s.lang_thai); return p != null
      ? `<b>${p}</b> <span class="sub">${langBasisTag(s)}</span>` : '<span class="miss">ไม่มีข้อมูล</span>'; } },
  { icon: "🏠", label: SHARE ? "ใกล้จุดตั้งต้น" : "ใกล้บ้าน",
    desc: `ระยะตรงจาก${distWord}` + (SHARE ? " (อนุบาลบ้านสนุกคิด)" : "") + " — ≤3 กม. = 5 · ≥9 กม. = 1 (ระยะตรง ไม่ใช่ระยะขับจริง)",
    score: s => lin(3, 9, s.distance_km),
    raw: s => `${s.distance_km} กม.` },
  { icon: "🇨🇳", label: "ภาษาจีน",
    desc: "% ของเวลาเรียนที่สอนเป็นจีน — 24% (ตรีภาษาเต็ม) = 5 · 7% = 2 · ไม่มีจีน = 1 · โรงที่รู้แค่ว่ามีจีนเป็นวิชาภาษา (~1 คาบ) = 3",
    score: s => { const v = langNum(s.lang_zh); if (v != null) return pctScore(v, 24);
      return ({ intensive: 5, some: 3, none: 1 })[s.chinese] ?? null; },
    raw: s => { const p = langPct(s.lang_zh); if (p != null)
        return `<b>${p}</b> <span class="sub">${langBasisTag(s)}</span>${s.chinese === "intensive" ? " ตรีภาษา" : ""}`;
      return ZH[s.chinese] + (s.chinese === "some" ? " (วิชาภาษา)" : ""); } },
  { icon: "💸", label: "ค่าใช้จ่าย",
    desc: "ค่าเล่าเรียน/ปี โรงเรียนหลายโปรแกรมใช้ราคาต่ำสุด — ≤฿60K = 5 · ≥฿350K = 1 · ⚠️ ปีอ้างอิงต่างกัน (2567–2570) ดูปีในตาราง",
    score: s => costOf(s) == null ? null : lin(60000, 350000, costOf(s)),
    raw: s => { const c = costOf(s); return c == null ? '<span class="miss">ไม่เปิดเผย</span>'
      : `${s.cost != null ? fmtBaht(s.cost) : costRangeText(s)} <span class="sub">${costYear(s) || "ไม่ระบุปี"}</span>`; } },
  { icon: "🎓", label: "มัธยมต่อ",
    desc: "น้ำหนักต่ำตามผู้ปกครอง (19/9/69) — สอนต่อถึง ม.6/G.12 = 3 · ถึงแค่ ม.3 = 2 · จบที่ ป.6 = 1",
    score: s => !s.secondary ? 1 : (s.secondary_to === "ม.3" ? 2 : 3),
    raw: s => s.secondary ? (s.secondary_to ? "ถึง " + s.secondary_to : "มีต่อ") : "จบ ป.6" },
  { icon: "🔍", label: "ข้อมูลโปร่งใส",
    desc: "เปิดเผยราคา (2) + ขนาดห้อง (1.5) + เวลาเรียน (1.5) — คะแนนต่ำ = ข้อมูลต้องโทรถามโรงเรียนเอง",
    score: s => infoScore(s),
    raw: s => `ราคา${costOf(s) != null ? "✓" : "✗"} ห้อง${hasInfo(s.class_size) ? "✓" : "✗"} เวลา${hasInfo(s.school_hours) ? "✓" : "✗"}` },
];

function radarSvg(schools, size, opt = {}) {
  const n = AXES.length, c = size / 2;
  const R = c - (opt.labels ? 88 : 12);
  const P = (i, r) => { const a = (-90 + i * 360 / n) * Math.PI / 180; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  const F = x => x.toFixed(1);
  let out = "";
  for (let v = 1; v <= 5; v++)
    out += `<polygon points="${AXES.map((_, i) => P(i, R * v / 5).map(F).join(",")).join(" ")}" fill="none" stroke="#e2e8f0" stroke-width="${v === 5 ? 1.5 : 1}"/>`;
  AXES.forEach((ax, i) => {
    const [x, y] = P(i, R);
    out += `<line x1="${c}" y1="${c}" x2="${F(x)}" y2="${F(y)}" stroke="#e2e8f0"/>`;
    if (opt.labels) {
      const a = (-90 + i * 360 / n) * Math.PI / 180;
      const lx = c + (R + 18) * Math.cos(a), ly = c + (R + 18) * Math.sin(a);
      const anchor = Math.cos(a) > .25 ? "start" : Math.cos(a) < -.25 ? "end" : "middle";
      const dy = Math.sin(a) > .25 ? 12 : Math.sin(a) < -.25 ? -6 : 4;
      out += `<text x="${F(lx)}" y="${F(ly + dy)}" text-anchor="${anchor}" class="radar-ax">${ax.icon} ${ax.label}</text>`;
    }
  });
  if (opt.labels) for (let v = 1; v <= 5; v += 2) { // ตัวเลขวง 1/3/5 ตามแกนบน
    const [x, y] = P(0, R * v / 5);
    out += `<text x="${F(x + 4)}" y="${F(y - 3)}" class="radar-ring">${v}</text>`;
  }
  schools.forEach((s, k) => {
    const col = opt.color || RC[k % RC.length];
    const vals = AXES.map(ax => ax.score(s));
    const miss = vals.some(v => v == null);
    out += `<polygon points="${vals.map((v, i) => P(i, v == null ? 0 : R * v / 5).map(F).join(",")).join(" ")}" fill="${col}" fill-opacity=".09" stroke="${col}" stroke-width="${opt.labels ? 2.5 : 2}"${miss ? ' stroke-dasharray="6 4"' : ""} stroke-linejoin="round"/>`;
    vals.forEach((v, i) => {
      if (v == null) {
        if (opt.labels) { const [x, y] = P(i, 13); out += `<text x="${F(x)}" y="${F(y + 4)}" text-anchor="middle" class="radar-q">?</text>`; }
      } else if (opt.dots) { const [x, y] = P(i, R * v / 5); out += `<circle cx="${F(x)}" cy="${F(y)}" r="3.6" fill="${col}" stroke="#fff" stroke-width="1.6"/>`; }
    });
  });
  return `<svg class="radar-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="เรดาร์เทียบโรงเรียน">${out}</svg>`;
}

/* จุดเด่น/จุดสังเกตอัตโนมัติ — กติกาเดียวกันทุกโรง อ่านจากข้อมูลจริงเท่านั้น */
function schoolCallouts(s) {
  const hi = [], note = [];
  const eng = lvMax(s), ep = langNum(s.lang_eng), tp = langNum(s.lang_thai), zp = langNum(s.lang_zh);
  if (ep != null && ep >= 60) hi.push(`อังกฤษ ${langPct(s.lang_eng)} ของเวลาเรียน`);
  else if (ep != null && ep <= 20) note.push(`อังกฤษน้อย ${langPct(s.lang_eng)} — ไทยเป็นหลัก`);
  else if (eng >= 4) hi.push(`อังกฤษเข้ม L${eng} (${LEVELS[eng].short})`);
  else if (eng === 1) note.push("อังกฤษน้อย — ไทยล้วน (L1)");
  if (tp != null && tp >= 70) hi.push(`ไทยเป็นหลัก ${langPct(s.lang_thai)}`);
  else if (tp != null && tp <= 15) note.push(`ไทยแค่ ${langPct(s.lang_thai)} — เกือบทั้งวันเป็นอังกฤษ`);
  if (s.distance_km <= 4) hi.push(`ใกล้${distWord} ${s.distance_km} กม.`);
  else if (s.distance_km >= 7) note.push(`ไกลจาก${distWord} ${s.distance_km} กม.`);
  const c = costOf(s);
  if (c == null) note.push("ไม่เปิดเผยราคา");
  else if (c <= 60000) hi.push(`ค่าใช้จ่าย ~${fmtK(c)}/ปี`);
  else if (c >= 300000) note.push(`ราคาสูง ${fmtK(c)}/ปี`);
  if (zp != null && zp >= 20) hi.push(`จีน ${langPct(s.lang_zh)} ของเวลาเรียน (ตรีภาษา)`);
  else if (zp != null && zp > 0) hi.push(`มีจีนในตาราง ${langPct(s.lang_zh)} (~2 คาบ)`);
  else if (s.chinese === "intensive") hi.push("จีนเข้มข้น (ตรีภาษา)");
  if (s.secondary) hi.push(s.secondary_to ? "เรียนต่อถึง " + s.secondary_to : "มีมัธยมต่อ");
  else note.push("จบที่ ป.6 ต้องหาโรงเรียนต่อ ม.1");
  const t = infoScore(s);
  if (t <= 1.5) note.push("ข้อมูลเปิดเผยน้อย — ต้องถามโรงเรียน");
  else if (t >= 4.5) hi.push("เปิดเผยข้อมูลครบ");
  return { hi: hi.slice(0, 3), note: note.slice(0, 3) };
}

/* ดึง bullet จาก section ของหน้าโรงใน wiki ("## สิ่งที่โดดเด่น" / "## ข้อควรระวัง…") */
function wikiBullets(s, re) {
  const out = []; let on = false;
  for (const l of s.body.split("\n")) {
    if (/^##\s/.test(l)) { on = re.test(l); continue; }
    if (on && /^\s*[-*]\s+/.test(l)) out.push(l.replace(/^\s*[-*]\s+/, ""));
  }
  return out;
}

function toggleRadar(slug) {
  const i = state.radar.indexOf(slug);
  if (i >= 0) state.radar.splice(i, 1);
  else if (state.radar.length >= 4) { alert("ซ้อนกราฟได้สูงสุด 4 โปรแกรม"); return; }
  else state.radar.push(slug);
  try { localStorage.setItem(SK + "radar", JSON.stringify(state.radar)); } catch (e) {}
  renderRadar(); renderTabs();
}

function renderRadar() {
  const sel = state.radar.map(bySlug).filter(Boolean);
  const full = state.radar.length >= 4;

  // ฝั่งซ้าย: รายการติ๊กเลือกโรงขึ้นกราฟ — เรียงตามระยะ กล่องสี = ลำดับ/สีเส้นบนกราฟ
  $("#radar-pick").innerHTML =
    `<div class="radar-pick-head"><b>โรงเรียนที่แสดงบนกราฟ</b><span class="rp-count">${state.radar.length}/4</span>
       <button class="btn btn-ghost btn-sm" id="radar-clear" ${state.radar.length ? "" : "hidden"}>ล้าง</button></div>
     <p class="rp-hint">เลือกได้ 2–4 โปรแกรม · เลขในกล่อง = สีเส้นบนกราฟ</p>
     <div class="radar-pick-list">` +
    D.schools.map(s => {
      const idx = state.radar.indexOf(s.slug);
      const on = idx >= 0;
      return `<button class="radar-pick-row ${on ? "sel" : ""} ${!on && full ? "full" : ""}" data-radar="${s.slug}" ${!on && full ? 'title="เต็ม 4 โปรแกรมแล้ว — ลบออกหนึ่งก่อน"' : ""}>
        <span class="rp-box" style="${on ? `background:${RC[idx % RC.length]};border-color:${RC[idx % RC.length]}` : ""}">${on ? idx + 1 : ""}</span>
        <span class="rp-txt"><span class="rp-name">${s.short}</span><span class="rp-sub">${s.distance_km} กม. · ${s.cost != null ? fmtK(s.cost) : costRangeText(s) || "ราคา?"} · ${lvText(s)}${langPct(s.lang_eng) ? ` · อังกฤษ ${langPct(s.lang_eng)}` : ""}</span></span>
      </button>`;
    }).join("") + `</div>`;
  $("#radar-clear").onclick = () => {
    state.radar = [];
    try { localStorage.setItem(SK + "radar", "[]"); } catch (e) {}
    renderRadar(); renderTabs();
  };

  $("#radar-chart").innerHTML = sel.length ? radarSvg(sel, 540, { labels: true, dots: true })
    : `<div class="radar-empty">ยังไม่ได้เลือกโรงเรียน — ติ๊กจากรายการด้านซ้าย (ได้ 2–4 โปรแกรม)</div>`;

  // ฝั่งขวา: ชิปโรงที่เลือก (ลบออกได้) + จุดเด่น/จุดสังเกตอัตโนมัติ + เกณฑ์ให้คะแนน
  $("#radar-side").innerHTML =
    (sel.length ? `<div class="radar-sel">` + sel.map((s, i) =>
      `<span class="radar-chip" style="--cc:${RC[i % RC.length]}"><i></i>${s.short}<button data-radar-x="${s.slug}" title="ลบออกจากกราฟ">✕</button></span>`).join("") + `</div>` +
      sel.map((s, i) => {
        const { hi, note } = schoolCallouts(s);
        return `<div class="radar-co" style="--cc:${RC[i % RC.length]}">
          <b class="nm" data-open="${s.slug}">${s.short}</b>
          ${hi.length ? `<div class="rc-row hi">${hi.map(t => `<span>✅ ${esc(t)}</span>`).join("")}</div>` : ""}
          ${note.length ? `<div class="rc-row note">${note.map(t => `<span>⚠️ ${esc(t)}</span>`).join("")}</div>` : ""}
        </div>`;
      }).join("") : "") +
    `<details class="radar-rubric" open><summary>เกณฑ์ให้คะแนนทั้ง ${AXES.length} แกน (ปรับจากข้อมูลจริงใน wiki)</summary>
      <ul>${AXES.map(ax => `<li><b>${ax.icon} ${ax.label}</b> — ${ax.desc}</li>`).join("")}</ul>
      <p class="footnote">คะแนนเป็นการวาดรูปทรงข้อมูล ไม่ใช่คะแนนรวมหรือการตัดสินโรงเรียน · น้ำหนักความสำคัญแต่ละแกนเป็นของผู้ปกครอง (ยังไม่ได้กำหนดใน criteria.md)</p>
    </details>`;

  // ตารางค่าจริงตามแกน (เขียว = สูงสุดในกลุ่มที่เลือก)
  if (sel.length) {
    const best = AXES.map(ax => { const vs = sel.map(ax.score).filter(v => v != null); return vs.length ? Math.max(...vs) : null; });
    $("#radar-values").innerHTML = `<h3 class="radar-vt">ค่าจริงตามแกน <span class="sec-hint">ตัวเขียว = สูงสุดในกลุ่มที่เลือก · ราคาอ้างอิงปีต่างกัน อ่านปีกำกับเสมอ</span></h3>
      <div class="table-wrap"><table class="radar-table"><thead><tr><th></th>${sel.map((s, i) =>
        `<th style="border-bottom:2.5px solid ${RC[i % RC.length]}"><span data-open="${s.slug}" style="cursor:pointer">${s.short}</span></th>`).join("")}</tr></thead>
      <tbody>${AXES.map((ax, r) => `<tr><td>${ax.icon} ${ax.label}</td>${sel.map(s => {
        const v = ax.score(s);
        return `<td><b class="${v != null && best[r] != null && Math.abs(v - best[r]) < .01 ? "best" : ""}">${ax.raw(s)}</b><span class="score">${v == null ? "ไม่มีข้อมูล" : "คะแนน " + Math.round(v * 10) / 10}</span></td>`;
      }).join("")}</tr>`).join("")}</tbody></table></div>`;
  } else $("#radar-values").innerHTML = "";

  // สรุป "สิ่งที่โดดเด่น" / "ข้อควรระวัง" จากหน้า wiki ของโรงที่เลือก
  $("#radar-wiki").innerHTML = sel.length ? `<h3 class="radar-vt" style="margin-top:0">📝 สรุปจากหน้า wiki — "สิ่งที่โดดเด่น" / "ข้อควรระวัง / ช่องว่างข้อมูล" <span class="sec-hint">กดเพื่อกางอ่านทีละโรงเรียน</span></h3>` +
    sel.map((s, i) => {
      const pros = wikiBullets(s, /^##\s*สิ่งที่โดดเด่น/), cons = wikiBullets(s, /^##\s*ข้อควรระวัง/);
      return `<details class="radar-wiki-block" style="--cc:${RC[i % RC.length]}">
        <summary>${s.short} <span class="footnote">✅ ${pros.length} จุดโดดเด่น · ⚠️ ${cons.length} ข้อควรระวัง</span></summary>
        <div class="rwb-body">
          <div><h4>✅ สิ่งที่โดดเด่น</h4><ul>${pros.map(b => `<li>${inline(esc(b))}</li>`).join("") || "<li>—</li>"}</ul></div>
          <div><h4>⚠️ ข้อควรระวัง / ช่องว่างข้อมูล</h4><ul>${cons.map(b => `<li>${inline(esc(b))}</li>`).join("") || "<li>—</li>"}</ul></div>
        </div></details>`;
    }).join("") : "";

  // การ์ด mini-radar ทุกโรง/ทุกโปรแกรม — กดเพื่อเพิ่ม/ลบจากกราฟใหญ่
  $("#radar-grid").innerHTML = D.schools.map(s => {
    const idx = state.radar.indexOf(s.slug);
    const { hi, note } = schoolCallouts(s);
    return `<div class="radar-card ${idx >= 0 ? "sel" : ""}" data-radar="${s.slug}" title="${idx >= 0 ? "กดเพื่อลบออกจากกราฟ" : "กดเพื่อเพิ่มขึ้นกราฟ"}">
      <div class="radar-mini">${radarSvg([s], 130, { color: lvColor(s) })}</div>
      <b class="nm" data-open="${s.slug}">${s.short}</b>
      <span class="sub">${s.distance_km} กม. · ${s.cost != null ? fmtK(s.cost) : costRangeText(s) || "ราคา?"} · ${lvText(s)}</span>
      ${hi.length ? `<span class="rc-mini hi">${hi.map(t => "✅ " + esc(t)).join(" · ")}</span>` : ""}
      ${note.length ? `<span class="rc-mini note">⚠️ ${note.slice(0, 2).map(esc).join(" · ")}</span>` : ""}
      <i class="ord" style="${idx >= 0 ? `background:${RC[idx % RC.length]};color:#fff;border-color:transparent` : ""}">${idx >= 0 ? idx + 1 : "＋"}</i>
    </div>`;
  }).join("");
}

/* ---------- docs ---------- */
function renderDocs() {
  const keys = DOC_ORDER.filter(k => D.docs[k]);
  $("#doc-nav").innerHTML = keys.map(k =>
    `<button class="${state.doc === k ? "active" : ""}" data-doc="${k}">${D.docs[k].title}</button>`).join("");
  $("#doc-body").innerHTML = mdToHtml(D.docs[state.doc].body);
}

/* ---------- ดาวน์โหลด wiki .md ทั้งหมดเป็น zip ----------
   เขียน zip เองแบบไม่บีบอัด (method STORE) — ไฟล์ md เล็กอยู่แล้ว และไม่ต้องพึ่งไลบรารี/CDN
   (ใช้ได้แม้ออฟไลน์ เช่นเดียวกับแท็บที่ไม่ใช่แผนที่) · ชื่อไฟล์/เนื้อหาเข้ารหัส UTF-8 เสมอ */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function makeZip(files) { // [{path, content: string|Uint8Array}] → array ของ Blob parts (zip โครงสร้างตาม path ที่ให้)
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0, count = 0;
  const now = new Date(); // เวลาแก้ไขไฟล์ใน zip = เวลาที่กดดาวน์โหลด (รู้ว่า export เมื่อไหร่)
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const head = len => { const dv = new DataView(new ArrayBuffer(len)); parts.push(dv); return dv; };

  for (const f of files) {
    const name = enc.encode(f.path), data = f.content instanceof Uint8Array ? f.content : enc.encode(f.content);
    const crc = crc32(data);
    const lh = head(30); // local file header
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);      // version needed
    lh.setUint16(6, 0x0800, true);  // flags: ชื่อไฟล์เป็น UTF-8
    lh.setUint16(8, 0, true);       // method: STORE
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    parts.push(name, data);

    const ch = new DataView(new ArrayBuffer(46)); // central directory record (ค่าที่ไม่เขียน = 0 จาก buffer ใหม่)
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch, name);
    offset += 30 + name.length + data.length;
    count++;
  }
  const cdStart = offset;
  for (const p of central) { parts.push(p); offset += p.byteLength; }
  const eocd = head(22); // end of central directory
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, count, true); eocd.setUint16(10, count, true);
  eocd.setUint32(12, offset - cdStart, true);
  eocd.setUint32(16, cdStart, true);
  return parts;
}
function downloadWikiZip() {
  const files = D.wiki_files || [];
  if (!files.length) { alert("ไม่พบไฟล์ wiki ใน data.js — รัน python3 web/build.py ใหม่ก่อน"); return; }
  const blob = new Blob(makeZip(files), { type: "application/zip" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kati-wiki-${(D.generated || "").replace(/-/g, "") || "export"}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- ดาวน์โหลดโบรชัวร์/เอกสาร (raw/downloads/ + raw/Scan Docs/ — build สำเนาไว้ที่ assets/) ---------- */
function fmtMB(bytes) { return bytes >= 1e6 ? (bytes / 1e6).toFixed(1) + " MB" : Math.round(bytes / 1e3) + " KB"; }
function openBrochures() {
  const el = $("#brochure-modal");
  const list = D.brochures || [];
  if (!list.length) { alert("ไม่พบไฟล์โบรชัวร์ใน data.js — หยิบไฟล์ใส่ raw/downloads/ หรือ raw/Scan Docs/ แล้วรัน python3 web/build.py ใหม่ก่อน"); return; }
  const total = list.reduce((t, b) => t + b.size, 0);
  // จัดกลุ่มที่ระดับโรง (school_base — สแกน+โปสเตอร์ของพระมารดาฯ รวมกลุ่มเดียวกัน) เรียงกลุ่มตามระยะจากบ้านเหมือนหน้าโรงเรียน
  const baseIdx = {};
  D.schools.forEach((s, i) => { if (!(s.school_base in baseIdx)) baseIdx[s.school_base] = i; });
  const baseOf = b => ((b.slug && bySlug(b.slug)) || {}).school_base || "";
  const groupsMap = new Map();
  for (const b of list) {
    const k = b.slug ? baseOf(b) : "";
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(b);
  }
  const groups = [...groupsMap.entries()]
    .sort((a, b) => (baseIdx[a[0]] ?? 1e9) - (baseIdx[b[0]] ?? 1e9))  // กลุ่มที่จับคู่โรงไม่ได้ ("") ไปท้ายสุด
    .map(([k, files]) => [k, files.sort((a, b) => (a.source === b.source)
      ? a.file.localeCompare(b.file, "th")
      : (a.source === "downloads" ? -1 : 1))]); // โปสเตอร์จากเว็บก่อนสแกน ภายในโรงเดียวกัน
  const zipLabel = `⬇️ ทั้งหมด ${list.length} ไฟล์ (.zip · ${fmtMB(total)})`;
  const card = b => {
    const isPdf = /\.pdf$/i.test(b.file);
    const src = b.thumb || b.url;
    const tag = b.source === "scans" ? `📷 สแกน${b.folder ? " · " + esc(b.folder) : ""}` : "🌐 ดาวน์โหลดจากเว็บ";
    return `<div class="brochure-card">
      ${isPdf ? `<div class="brochure-thumb brochure-pdf">📄 PDF</div>`
              : `<img class="brochure-thumb" src="${encodeURI(src)}" loading="lazy" alt="${esc(b.file)}">`}
      <div class="brochure-name" title="${esc(b.path)}">${esc(b.file)}</div>
      <div class="brochure-meta">${tag} · ${fmtMB(b.size)}</div>
      <div class="brochure-btns">
        <a class="btn btn-sm" href="${encodeURI(b.url)}" target="_blank" title="เปิดไฟล์ต้นฉบับเต็มขนาด">🔍 ดู</a>
        <a class="btn btn-sm" href="${encodeURI(b.url)}" download="${esc(b.file)}">⬇️ โหลด</a>
      </div>
    </div>`;
  };
  el.innerHTML = `
    <div class="fee-head" style="background:linear-gradient(120deg,#0166c4,#0092f9)">
      <button class="drawer-close" id="brochure-x" title="ปิด">✕</button>
      <h2>🖼️ โบรชัวร์/เอกสารโรงเรียน — ${list.length} ไฟล์</h2>
      <div class="sub">ภาพประกาศที่ดาวน์โหลดจากเว็บโรงเรียน (raw/downloads/) + เอกสารสแกนที่ได้จากโรงเรียน (raw/Scan Docs/) — source of truth · เรียงกลุ่มตามระยะจาก${distWord}</div>
    </div>
    <div class="fee-body">
      ${groups.map(([k, files]) => `
        <h3 class="brochure-group">${k && bySlug(k) ? `${esc(bySlug(k).name)} <span class="footnote">${k}</span>` : "อื่น ๆ (จับคู่โรงเรียนไม่ได้)"} <span class="footnote">${files.length} ไฟล์</span></h3>
        <div class="brochure-grid">${files.map(card).join("")}</div>`).join("")}
      <p class="footnote" style="margin:12px 0 4px">thumbnail เป็นรูปย่อที่ build สร้าง — กด 🔍 ดู หรือ ⬇️ โหลด ได้ไฟล์ต้นฉบับเต็มขนาด · ปุ่ม "ทั้งหมด (.zip)" ใช้ได้เมื่อเปิดเว็บผ่าน http server — เปิดจากไฟล์ตรง ๆ (file://) browser จะบล็อกการอ่านไฟล์ ให้กดโหลดทีละไฟล์แทน</p>
    </div>
    <div class="fee-btns">
      <button class="btn btn-sm" id="brochure-zip">${zipLabel}</button>
      <button class="btn btn-sm btn-primary" id="brochure-close">ปิด</button>
    </div>`;
  el.hidden = false;
  $("#brochure-scrim").hidden = false;
  $("#brochure-x").onclick = closeBrochures;
  $("#brochure-close").onclick = closeBrochures;
  $("#brochure-scrim").onclick = closeBrochures;
  $("#brochure-zip").onclick = async () => {
    const btn = $("#brochure-zip");
    try {
      btn.disabled = true; btn.textContent = "กำลังรวมไฟล์…";
      const files = [];
      for (const b of list) {
        const buf = new Uint8Array(await (await fetch(encodeURI(b.url))).arrayBuffer());
        files.push({ path: b.rel, content: buf }); // คงโครงสร้างโฟลเดอร์ raw (downloads/…, Scan Docs/…) · png/jpg บีบอัดอยู่แล้ว — zip แบบ STORE ตาม makeZip
      }
      const blob = new Blob(makeZip(files), { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kati-brochures-${(D.generated || "").replace(/-/g, "") || "export"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      alert("รวมเป็น zip ไม่สำเร็จ (มักเกิดเมื่อเปิดเว็บจากไฟล์ตรง ๆ ที่ browser บล็อก fetch) — กด ⬇️ โหลดทีละไฟล์แทน หรือเปิดเว็บผ่าน http เช่น python3 -m http.server");
    } finally {
      btn.disabled = false; btn.textContent = zipLabel;
    }
  };
}
function closeBrochures() {
  $("#brochure-modal").hidden = true;
  $("#brochure-modal").innerHTML = "";
  $("#brochure-scrim").hidden = true;
}

/* ---------- modal วิธีใช้ไฟล์ KMZ (แท็บแผนที่) ---------- */
function openKmzHelp() {
  $("#kmz-modal").hidden = false;
  $("#kmz-scrim").hidden = false;
}
function closeKmzHelp() {
  $("#kmz-modal").hidden = true;
  $("#kmz-scrim").hidden = true;
}

/* ---------- drawer ---------- */
function openDetail(slug) {
  const s = bySlug(slug); if (!s) return;
  closeFeeModal(); // wikilink ใน modal fee → เปิด drawer ทับ ปิด modal ก่อน
  closeRaw();      // ลิงก์ใน modal raw ก็เปิด drawer ทับเช่นกัน
  const c = lvColor(s);
  const qf = [
    ["ระยะจาก" + distWord + " (ตรง)", `${s.distance_km} กม. (ขับจริงประมาณ ${(s.distance_km * 1.45).toFixed(1)} กม.)`],
    ...(s.km_tdp != null
      ? [["จากที่ทำงาน", `True Digital Park ${s.km_tdp} กม. · One Bangkok ${s.km_ob} กม.`]]
      : []),
    ["ค่าเล่าเรียน ป.1", s.cost != null ? `${fmtBaht(s.cost)}/ปี — ${s.cost_ref}`
      : (s.cost_programs || []).length ? `${costProgramText(s)} — ${s.cost_ref}`
      : `ไม่เปิดเผย — ${s.cost_ref}`],
    ["ปีแรกประมาณ", s.first_year_est ? fmtBaht(s.first_year_est) : (s.first_year_note || "—")],
    ["ระดับอังกฤษ", `${lvText(s)} (L${lvMin(s) || "?"}–L${lvMax(s) || "?"})`],
    ...(langMix(s) ? [["สัดส่วนภาษา ป.1", `${langMix(s)} — ${langBasisTag(s)} · ${s.lang_note}`]]
                   : [["สัดส่วนภาษา ป.1", "ไม่เปิดเผย — ต้องถามโรง"]]),
    ["ภาษาที่ 3", s.third_language],
    ["ขนาดห้อง", s.class_size || "ไม่พบ"],
    ["เวลาเรียน", s.school_hours || "ไม่พบ"],
    ["มัธยมต่อ", s.secondary ? "✅ สอนต่อในที่เดียวกัน" + (s.secondary_to ? " (ถึง " + s.secondary_to + ")" : "") : "ไม่มี (จบที่ ป.6)"],
    ["อัปเดตข้อมูล", s.updated],
  ];
  const inCmp = state.compare.includes(s.slug);
  $("#drawer").innerHTML = `
    <div class="drawer-hero" style="background:linear-gradient(120deg, ${c}, ${c}cc)">
      <button class="drawer-close" id="drawer-x">✕</button>
      <h2>${s.name}</h2>
      <div class="sub">${esc(s.type)} · อัปเดต ${s.updated}</div>
    </div>
    <div class="qf-grid">${qf.map(([k, v]) => `<div class="qf"><b>${k}</b>${esc(String(v))}</div>`).join("")}</div>
    <div class="drawer-btns">
      <button class="btn btn-sm" id="d-map">📍 ดูบนแผนที่</button>
      <a class="btn btn-sm btn-gm" href="${gmRoute(s)}" target="_blank" rel="noopener" title="เปิดเส้นทางขับรถจากจุดตั้งต้นปัจจุบันใน Google Maps (มีจราจรจริง)">🧭 เส้นทาง Google Maps</a>
      <button class="btn btn-sm ${inCmp ? "btn-toggle-on" : ""}" id="d-cmp">${inCmp ? "✓ อยู่ในเทียบ" : "＋ เพิ่มเทียบ"}</button>
    </div>
    <div class="md">${mdToHtml(s.body)}</div>`;
  $("#drawer").hidden = false;
  $("#drawer-scrim").hidden = false;
  $("#drawer").scrollTop = 0;
  $("#drawer-x").onclick = closeDetail;
  $("#drawer-scrim").onclick = closeDetail;
  $("#d-map").onclick = () => { closeDetail(); switchTab("map"); setTimeout(() => selectSchool(s), 350); };
  $("#d-cmp").onclick = () => { toggleCompare(s.slug); openDetail(slug); };
}
function closeDetail() { $("#drawer").hidden = true; $("#drawer-scrim").hidden = true; }

/* ---------- compare state + tray ---------- */
function toggleCompare(slug) {
  const i = state.compare.indexOf(slug);
  if (i >= 0) state.compare.splice(i, 1);
  else if (state.compare.length >= 4) { alert("เทียบได้สูงสุด 4 โรงเรียน"); return; }
  else state.compare.push(slug);
  localStorage.setItem(SK + "compare", JSON.stringify(state.compare));
  renderTray(); renderTabs();
  if (state.tab === "schools") renderSchoolViews();
  if (state.tab === "compare") renderCompare();
}
function renderTray() {
  const t = $("#compare-tray");
  t.hidden = !state.compare.length;
  $("#tray-chips").innerHTML = state.compare.map(slug =>
    `<span class="tray-chip">${bySlug(slug).short}<button data-uncmp="${slug}">✕</button></span>`).join("");
  $("#tray-go").textContent = `เทียบแบบละเอียด (${state.compare.length}) →`;
}

/* ---------- global events ---------- */
document.addEventListener("click", e => {
  const rawA = e.target.closest("a[data-raw]");
  if (rawA) { e.preventDefault(); openRaw(rawA.dataset.raw); return; }
  const open = e.target.closest("[data-open]");
  if (open) { openDetail(open.dataset.open); return; }
  const cmp = e.target.closest("[data-cmp]");
  if (cmp) { toggleCompare(cmp.dataset.cmp); return; }
  const uncmp = e.target.closest("[data-uncmp]");
  if (uncmp) { toggleCompare(uncmp.dataset.uncmp); return; }
  const rx = e.target.closest("[data-radar-x]");
  if (rx) { toggleRadar(rx.dataset.radarX); return; }
  const rt = e.target.closest("[data-radar]");
  if (rt && !e.target.closest("[data-open]")) { toggleRadar(rt.dataset.radar); return; }
  const docBtn = e.target.closest("#doc-nav [data-doc]");
  if (docBtn) { state.doc = docBtn.dataset.doc; renderDocs(); return; }
  const wl = e.target.closest(".wikilink");
  if (wl) {
    closeRaw(); // wikilink ใน modal raw → เปิดหน้าโรง/เอกสารที่อยู่ใต้ modal ปิด modal ก่อน
    let t = wl.dataset.target.split("/").pop().replace(/\.md$/, "");
    if (bySlug(t)) { openDetail(t); return; }
    if (D.docs[t]) { state.doc = t; switchTab("docs"); renderDocs(); return; }
    if (t === "index") { switchTab("overview"); return; }
    switchTab("docs"); // fallback
  }
});
document.addEventListener("change", e => {
  if (e.target.matches("[data-cmpchk]")) toggleCompare(e.target.dataset.cmpchk);
  if (e.target.matches("[data-action]")) {
    const a = D.actions[+e.target.dataset.action];
    e.target.checked ? actionsDone.add(a) : actionsDone.delete(a);
    localStorage.setItem(SK + "actions", JSON.stringify([...actionsDone]));
    renderActions();
  }
});
$("#tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) switchTab(b.dataset.tab); });
$("#badge-calendar").onclick = () => { if (D.admission) switchTab("calendar"); };
$("#tray-go").onclick = () => switchTab("compare");
$("#tray-clear").onclick = () => { [...state.compare].forEach(toggleCompare); };
$("#map-color-mode").onchange = e => { state.mapColor = e.target.value; refreshColors(); renderMapList(); };
$("#map-rings").onchange = renderRings;
$("#cost-sort").onchange = e => { state.costSort = e.target.value; renderCostChart(); };
$("#view-seg").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) setView(b.dataset.view); });
$("#wiki-dl").onclick = downloadWikiZip;
$("#wiki-dl-foot").onclick = downloadWikiZip;
$("#brochure-dl").onclick = openBrochures;
$("#brochure-dl-foot").onclick = openBrochures;
if ((D.brochures || []).length) { // บอกจำนวนไฟล์บนปุ่มล่วงหน้า — รู้ว่ามีอะไรโหลดบ้างก่อนกด
  const n = D.brochures.length;
  $("#brochure-dl").textContent = `🖼️ โบรชัวร์/ประกาศ (${n} ไฟล์)`;
  $("#brochure-dl-foot").textContent = `🖼️ โบรชัวร์/ประกาศ (${n} ไฟล์)`;
}
$("#home-pick").onclick = () => setPickMode(!pickMode);
$("#home-reset").onclick = () => { try { localStorage.removeItem(SK + "origin"); } catch (e) {} setOrigin(D.home.lat, D.home.lon); };
$("#kmz-help-open").onclick = openKmzHelp;
$("#kmz-x").onclick = closeKmzHelp;
$("#kmz-close").onclick = closeKmzHelp;
$("#kmz-scrim").onclick = closeKmzHelp;
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("#raw-modal").hidden) { closeRaw(); return; }
  if (!$("#fee-modal").hidden) { closeFeeModal(); return; }
  if (!$("#brochure-modal").hidden) { closeBrochures(); return; }
  if (!$("#kmz-modal").hidden) { closeKmzHelp(); return; }
  if (pickMode) setPickMode(false);
});

/* ---------- init ---------- */
try { state.compare = JSON.parse(localStorage.getItem(SK + "compare") || "[]").filter(s => bySlug(s)); } catch (e) {}
try { // โรงบนเรดาร์ — จำที่เคยเลือกไว้ · เข้าครั้งแรก = ตั้งต้น 3 โรงใกล้จุดตั้งต้นสุดให้เห็นตัวอย่าง
  const saved = JSON.parse(localStorage.getItem(SK + "radar") || "null");
  state.radar = (saved || D.schools.slice(0, 3).map(s => s.slug)).filter(s => bySlug(s)).slice(0, 4);
} catch (e) { state.radar = D.schools.slice(0, 3).map(s => s.slug); }
try { // จุดตั้งต้นที่เคยเลือกไว้บนแผนที่ (ถ้าไม่ใช่จุดตั้งต้นหลัก = เปิดแท็บแผนที่แล้วค่อยคำนวณเส้นทางใหม่)
  const o = JSON.parse(localStorage.getItem(SK + "origin") || "null");
  if (o && isFinite(o.lat) && isFinite(o.lon)) state.origin = o;
} catch (e) {}
// ข้อความส่วนที่ต่างกันตามเวอร์ชัน (index.html เก็บโครงสร้างไว้ ให้ JS เติม)
$("#home-emoji").textContent = distIcon;
$("#home-hint").innerHTML = SHARE
  ? "ลากหมุดเพื่อย้ายจุดตั้งต้น (เช่น บ้านของคุณ) · ระยะในแท็บนี้ = <b>เส้นทางขับรถ</b> · <b>*</b> = ระยะตรง · กดโรงเรียนเพื่อลากเส้นทาง"
  : "ลากหมุด 🏠 เพื่อย้ายจุดตั้งต้น (ลองจากที่ทำงาน/บ้านปู่ย่า) · ระยะในแท็บนี้ = <b>เส้นทางขับรถ</b> · <b>*</b> = ระยะตรง · กดโรงเรียนเพื่อลากเส้นทาง";
$("#home-pick").textContent = SHARE ? "📍 เลือกจุดตั้งต้นใหม่" : "📍 เลือกจุด Home ใหม่";
$("#map-note").innerHTML = "🚗 เส้นทาง/เวลาคำนวณจาก OSRM (OpenStreetMap) — เส้นทางสั้นที่สุดตามถนน ไม่รวมรถติด · ย้ายจุดตั้งต้นแล้วเว็บดึงเส้นทางใหม่สด (ต้องออนไลน์) · วงรัศมี 3/5/10 กม. เป็นระยะตรง"
  + (SHARE ? "" : " และระยะ TDP/OB เป็นระยะตรง");
$("#data-date").textContent = "ข้อมูล ณ " + D.generated;
if (SHARE) document.title = "ข้อมูลประกอบการเลือกโรงเรียน ชั้นประถม — ฉบับแชร์ (จุดอ้างอิง: อนุบาลบ้านสนุกคิด)";
const nMd = (D.wiki_files || []).length;
if (nMd) $("#wiki-dl").textContent = `⬇️ ดาวน์โหลด wiki .md ทั้งหมด (${nMd} ไฟล์)`;
setView("cards");
renderTabs(); renderOverview(); renderFilterBar(); renderSchools(); renderTable(); renderCompare(); renderDocs(); renderTray(); renderCostFilterBar();
switchTab("overview");
