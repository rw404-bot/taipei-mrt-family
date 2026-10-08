// 🎲 大冒險：依現有路網與地點資料，隨機組合「半天／一天」親子行程。
(function () {
  "use strict";

  var NET = window.MRTNET, PLACES = window.PLACES, TYPES = window.TYPES, LINES = window.LINES;
  var $ = function (s) { return document.querySelector(s); };
  if (!NET) return;

  var opts = { age: "all", len: "half" };
  var current = null, lastKey = "";

  // ---------- 1. 路網圖與最短路徑 ----------
  var adj = {}, lineStations = {};
  LINES.forEach(function (l) {
    var names = NET.resolved[l.id].map(function (p) { return p.n; });
    lineStations[l.id] = names;
    for (var i = 0; i < names.length - 1; i++) {
      (adj[names[i]] = adj[names[i]] || []).push({ to: names[i + 1], line: l.id });
      (adj[names[i + 1]] = adj[names[i + 1]] || []).push({ to: names[i], line: l.id });
    }
  });
  function lineName(id) { return LINES.filter(function (l) { return l.id === id; })[0].name.replace("（部分站）", ""); }

  var TRANSFER = 3, cache = {};
  function dijkstra(src) {
    if (cache[src]) return cache[src];
    var dist = {}, prev = {}, queue = [{ k: src + "|", st: src, line: "", d: 0 }];
    dist[src + "|"] = 0;
    while (queue.length) {
      queue.sort(function (a, b) { return a.d - b.d; });
      var cur = queue.shift();
      if (cur.d > dist[cur.k]) continue;
      (adj[cur.st] || []).forEach(function (e) {
        var nd = cur.d + 1 + (cur.line && cur.line !== e.line ? TRANSFER : 0), k = e.to + "|" + e.line;
        if (dist[k] == null || nd < dist[k]) {
          dist[k] = nd; prev[k] = { k: cur.k, st: cur.st, line: cur.line };
          queue.push({ k: k, st: e.to, line: e.line, d: nd });
        }
      });
    }
    var best = {};
    Object.keys(dist).forEach(function (k) {
      var st = k.split("|")[0];
      if (best[st] == null || dist[k] < dist[best[st]]) best[st] = k;
    });
    return (cache[src] = { dist: dist, prev: prev, best: best, src: src });
  }
  function cost(a, b) {
    if (a === b) return 0;
    var r = dijkstra(a), k = r.best[b];
    return k == null ? 999 : r.dist[k];
  }
  // 回傳 [{line, from, to, stops}]
  function route(a, b) {
    if (a === b) return [];
    var r = dijkstra(a), k = r.best[b], chain = [];
    while (k && k !== a + "|") {
      var p = r.prev[k]; chain.push({ st: k.split("|")[0], line: k.split("|")[1], from: p.st });
      k = p.k;
    }
    chain.reverse();
    var legs = [];
    chain.forEach(function (c) {
      var last = legs[legs.length - 1];
      if (last && last.line === c.line) { last.to = c.st; last.stops++; last.via.push(c.st); }
      else legs.push({ line: c.line, from: c.from, to: c.st, stops: 1, via: [c.from, c.st] });
    });
    return legs;
  }
  function legMinutes(legs) {
    var stops = 0; legs.forEach(function (l) { stops += l.stops; });
    return Math.round((stops * 3 + Math.max(0, legs.length - 1) * 5 + 10) / 5) * 5; // 含出站步行約 10 分
  }
  function legText(legs, to) {
    if (!legs.length) return "不用搭車，直接步行前往";
    return legs.map(function (l, i) {
      var names = lineStations[l.line], a = names.indexOf(l.from), b = names.indexOf(l.to);
      var term = b > a ? names[names.length - 1] : names[0];
      return (i === 0 ? "從 " + l.from + "站搭" : "在 " + l.from + "站轉乘") + "「" + lineName(l.line) + "」往 " + term + " 方向，坐 " + l.stops + " 站到 " + l.to + "站";
    }).join("；") + "，出站後步行到「" + to + "」";
  }
  function pathStations(legs, first) {
    var out = [first];
    legs.forEach(function (l) { l.via.slice(1).forEach(function (s) { out.push(s); }); });
    return out;
  }

  // ---------- 2. 候選地點 ----------
  function monthOk(note, m) {
    if (!note) return false;
    var r = note.match(/(\d{1,2})\s*(?:月)?\s*(?:中旬|上旬|下旬)?\s*[–-]\s*(\d{1,2})\s*月/) || note.match(/(\d{1,2})\/\d{1,2}\s*[–-]\s*(\d{1,2})\/\d{1,2}/);
    if (r) { var a = +r[1], b = +r[2]; return a <= b ? (m >= a && m <= b) : (m >= a || m <= b); }
    r = note.match(/(\d{1,2})\s*月/);
    return r ? +r[1] === m : false;
  }
  function indoor(p) { return /館|博物|美術|圖書|植物園|溫室|劇場|劇院|電影|展演|遊客中心|市場|科學|天文|華山1914|放送所|孔廟/.test(p[1]); }
  var WEIGHT = { play: 3, spot: 3, trail: 2, park: 2, bloom: 1 };
  function activityPool(rainy) {
    var m = new Date().getMonth() + 1;
    var pool = PLACES.filter(function (p) {
      if (!WEIGHT[p[2]] || !window.MRTNET.nodes[p[0]]) return false;
      if (p[2] === "trail" && opts.age === "toddler") return false;
      if (p[2] === "bloom" && !monthOk(p[3], m)) return false;
      if (/（轉乘公車）|沿線眺望與轉乘/.test(p[1])) return false;
      return true;
    });
    if (rainy) { var ind = pool.filter(indoor); if (ind.length >= 8) pool = ind; }
    return pool;
  }
  function foodPool() {
    return PLACES.filter(function (p) { return p[2] === "food" && !/米其林 [123] 星/.test(p[3] || "") && window.MRTNET.nodes[p[0]]; });
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  // 先依類型抽（避免 200 多個小公園壓過景點與步道），再在類型內隨機；有備註或路線的地點權重較高
  function pickWeighted(arr, avoid) {
    var by = {}; arr.forEach(function (p) { (by[p[2]] = by[p[2]] || []).push(p); });
    var types = Object.keys(by);
    if (avoid && types.length > 1 && Math.random() < 0.85) types = types.filter(function (t) { return t !== avoid; });
    var total = 0; types.forEach(function (t) { total += WEIGHT[t] || 1; });
    var r = Math.random() * total, type = types[types.length - 1];
    for (var i = 0; i < types.length; i++) { r -= WEIGHT[types[i]] || 1; if (r <= 0) { type = types[i]; break; } }
    var list = by[type], w = list.map(function (p) { return p[3] || p[4] ? 2 : 1; }), sum = w.reduce(function (a, b) { return a + b; }, 0);
    r = Math.random() * sum;
    for (var j = 0; j < list.length; j++) { r -= w[j]; if (r <= 0) return list[j]; }
    return list[list.length - 1];
  }  function nearby(pool, st, maxCost, exclude) {
    return pool.filter(function (p) { return (!exclude || exclude.indexOf(p[0]) < 0) && cost(st, p[0]) <= maxCost; });
  }

  // ---------- 3. 文案 ----------
  var ADJ = ["彩虹", "魔法", "勇者", "星空", "陽光", "祕密基地", "超級", "快樂", "探險隊", "閃亮"];
  var NOUN = { play: "放電", park: "綠洲", trail: "山徑", spot: "探索", bloom: "花園" };
  var MISSION = {
    play: ["每種遊具至少玩一次，數數總共玩了幾種", "和家人比賽，看誰先跑到指定的樹", "找一個最適合當「祕密基地」的角落並拍照"],
    park: ["找出 3 種不同形狀的葉子", "在草地上找到最大的一棵樹，大家一起量量看", "聽一聽，數出 5 種不同的聲音"],
    trail: ["數數今天爬了幾級階梯（猜猜看再比對）", "找到一個可以眺望的地方，大聲說出看到的 3 樣東西", "撿一片落葉做紀念（記得不要摘活的花草）"],
    spot: ["找出展品或建築裡最有趣的一個細節，說給大家聽", "每人選出最喜歡的一個地方並拍照", "回家後說說「今天學到的一件新事」"],
    bloom: ["找出 3 種不同顏色的花並拍照", "比一比，誰找到的花最小、誰找到的最大", "把最喜歡的花畫下來"],
    food: ["每人點一樣沒吃過的東西，分享一口", "猜猜看這道菜用了哪些食材"],
    night: ["每人挑一樣想吃的小吃，湊成「夜市套餐」", "找一家排最長的隊伍，猜猜為什麼大家愛吃"]
  };
  var GENERAL = ["在捷運上猜猜下一站的名字，答對的人加一分", "出發前先說好今天的「冒險口號」", "回家前一起投票，選出今天最棒的一站"];

  function dur(p) { return p[2] === "trail" ? 120 : p[2] === "bloom" ? 60 : 90; }
  function hm(t) { var h = Math.floor(t / 60), m = t % 60; return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m; }

  // ---------- 4. 產生行程 ----------
  function weather() {
    var d = $("#date") && $("#date").value, f = window.FORECAST && d && window.FORECAST[d];
    return f ? { date: d, rain: f.rain, tmax: f.tmax, tmin: f.tmin } : null;
  }
  function generate() {
    var w = weather(), rainy = !!(w && w.rain >= 50);
    var acts = activityPool(rainy), foods = foodPool(), nights = PLACES.filter(function (p) { return p[2] === "night" && NET.nodes[p[0]]; });
    var full = opts.len === "full", best = null;

    for (var tries = 0; tries < 80; tries++) {
      var a1 = pickWeighted(acts);
      var lunchPool = nearby(foods, a1[0], 3);
      var lunch = lunchPool.length ? pick(lunchPool) : null;
      var base = lunch ? lunch[0] : a1[0];
      var pool2 = nearby(acts, base, 7, [a1[0]]);
      if (!pool2.length) continue;
      var a2 = pickWeighted(pool2, a1[2]), stops = [a1, lunch, a2], a3 = null, dinner = null;
      if (full) {
        var pool3 = nearby(acts, a2[0], 7, [a1[0], a2[0]]);
        if (!pool3.length) continue;
        a3 = pickWeighted(pool3, a2[2]);
        var dp = nearby(nights, a3[0], 6).concat(nearby(foods, a3[0], 3));
        dinner = dp.length ? pick(dp) : null;
        stops = [a1, lunch, a2, a3, dinner];
      }
      var key = a1.id + "-" + a2.id + (a3 ? "-" + a3.id : "");
      if (key === lastKey && tries < 70) continue;
      best = { stops: stops, key: key };
      break;
    }
    if (!best) return null;
    lastKey = best.key;
    return build(best.stops, w, rainy);
  }

  function accessText(st) {
    var ids = NET.nodes[st].lines;
    if (ids.every(function (i) { return i === "MK"; })) return "搭捷運到 動物園站，再轉搭貓空纜車前往 " + st + "站";
    if (ids.every(function (i) { return i === "V" || i === "V2"; })) return "搭捷運到 紅樹林站，再轉乘淡海輕軌前往 " + st + "站";
    if (ids.every(function (i) { return i === "K"; })) return "搭捷運到 十四張站，再轉乘安坑輕軌前往 " + st + "站";
    return "搭捷運前往 " + st + "站";
  }

  function build(stops, w, rainy) {
    var t = 9 * 60 + 30, items = [], totalStops = 0, transfers = 0, pathSt = [], marks = [], prevSt = null;
    items.push({ kind: "start", time: hm(t), text: "從家裡出發，" + accessText(stops[0][0]) });
    t += 30;
    var order = stops.filter(function (s, i) { return s || i === 1 || i === 4; });
    var seq = stops.map(function (s, i) { return { p: s, role: i === 1 ? "lunch" : i === 4 ? "dinner" : "act" }; });
    seq.forEach(function (s, idx) {
      var p = s.p, st = p ? p[0] : prevSt;
      if (!p) { // 找不到合適店家時，用通用建議
        items.push({ kind: "meal", time: hm(Math.max(t, s.role === "dinner" ? 17 * 60 + 30 : 11 * 60 + 30)), generic: true, role: s.role, st: st });
        t = Math.max(t, s.role === "dinner" ? 17 * 60 + 30 : 11 * 60 + 30) + 60;
        return;
      }
      if (prevSt && prevSt !== st) {
        var legs = route(prevSt, st), mins = legMinutes(legs);
        legs.forEach(function (l) { totalStops += l.stops; }); transfers += Math.max(0, legs.length - 1);
        items.push({ kind: "ride", time: hm(t), text: legText(legs, p[1]), mins: mins });
        t += mins;
        pathSt = pathSt.concat(pathStations(legs, prevSt).slice(pathSt.length ? 1 : 0));
      } else if (!prevSt) { pathSt.push(st); }
      if (s.role === "lunch" && t < 11 * 60 + 30) t = 11 * 60 + 30;
      if (s.role === "dinner" && t < 17 * 60 + 30) {
        items.push({ kind: "rest", time: hm(t), text: "先在附近休息、補充體力，等到晚餐時間" });
        t = 17 * 60 + 30;
      }
      var d = s.role === "act" ? dur(p) : 60;
      items.push({ kind: s.role, time: hm(t), place: p, dur: d });
      if (s.role === "act" || true) marks.push({ st: st, name: p[1] });
      t += d; prevSt = st;
    });
    items.push({ kind: "end", time: hm(t), text: "搭捷運回家，記得一起聊聊今天的收穫" });

    var acts = stops.filter(function (s, i) { return s && i !== 1 && i !== 4; });
    var first = acts[0];
    var difficulty = totalStops > 14 || transfers > 2 ? "⭐⭐⭐ 體力挑戰" : totalStops > 7 || transfers > 0 ? "⭐⭐ 輕鬆" : "⭐ 超輕鬆";
    var missions = [];
    acts.forEach(function (p) { missions.push({ icon: TYPES[p[2]].icon, text: pick(MISSION[p[2]]), at: p[1] }); });
    stops.forEach(function (p, i) { if (p && (i === 1 || i === 4)) missions.push({ icon: TYPES[p[2]].icon, text: pick(MISSION[p[2]]), at: p[1] }); });
    missions.push({ icon: "🚇", text: pick(GENERAL), at: "沿途" });
    var title = pick(ADJ) + NOUN[first[2]] + "大冒險";

    // 地圖標記只放有地點的站，去除相鄰重複
    var mk = [], seen = {};
    marks.forEach(function (m) { if (!seen[m.st]) { seen[m.st] = 1; mk.push(m); } });
    var clean = pathSt.filter(function (s, i) { return i === 0 || s !== pathSt[i - 1]; });
    return {
      title: title, items: items, missions: missions, minutes: t - (9 * 60 + 30), totalStops: totalStops, transfers: transfers,
      difficulty: difficulty, weather: w, rainy: rainy, path: clean, marks: mk, place0: first[1]
    };
  }

  // ---------- 5. 畫面 ----------
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function dirUrl(st, name) {
    return "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent("捷運" + st + "站") + "&destination=" + encodeURIComponent(name + " 台北") + "&travelmode=walking";
  }
  function weatherLine(a) {
    if (!a.weather) return "";
    var w = a.weather;
    return '<p class="adv-w">' + (a.rainy ? "☔ " : "🌤️ ") + (w.date.slice(5).replace("-", "/")) + " 降雨機率 " + w.rain + "%，" + w.tmin + "–" + w.tmax + "°C。" +
      (a.rainy ? "已優先安排室內景點。" : "戶外行程沒問題！") + "</p>";
  }
  function render() {
    var a = current, dlg = $("#adventure");
    if (!a) { dlg.innerHTML = '<div class="d-body"><button class="btn small ghost d-close" data-adv-close>關閉 ✕</button><p>暫時想不到合適的行程，再試一次吧！</p><button class="btn primary" data-adv-again>🎲 再來一次</button></div>'; return; }
    var html = '<button class="btn small ghost d-close" data-adv-close>關閉 ✕</button><div class="adv-head"><span class="kicker">🎲 今日大冒險</span><h3 id="adv-title">' + esc(a.title) + "</h3>" +
      '<p class="adv-meta"><span>⏱ 約 ' + Math.round(a.minutes / 60 * 10) / 10 + " 小時</span><span>🚇 搭 " + a.totalStops + " 站・轉乘 " + a.transfers + " 次</span><span>" + a.difficulty + "</span></p></div>" +
      '<div class="adv-body">' + weatherLine(a) +
      '<div class="adv-opts"><div class="fgroup"><span>年齡</span>' +
      [["all", "不限"], ["toddler", "幼兒 0–6"], ["kid", "學童 7–12"]].map(function (x) { return '<button class="chip' + (opts.age === x[0] ? " on" : "") + '" data-adv-age="' + x[0] + '">' + x[1] + "</button>"; }).join("") +
      '</div><div class="fgroup"><span>時間</span>' +
      [["half", "半天"], ["full", "一天（含晚餐）"]].map(function (x) { return '<button class="chip' + (opts.len === x[0] ? " on" : "") + '" data-adv-len="' + x[0] + '">' + x[1] + "</button>"; }).join("") +
      "</div></div>" +
      '<ol class="adv-tl">' + a.items.map(itemHtml).join("") + "</ol>" +
      '<div class="adv-missions"><h4>🎯 冒險任務</h4><ul>' + a.missions.map(function (m) { return "<li>" + m.icon + " <b>" + esc(m.at) + "</b>：" + esc(m.text) + "</li>"; }).join("") + "</ul></div>" +
      '<p class="muted small">行程由系統依路網與地點資料隨機組合，搭乘時間為粗估；開放時間、是否適合你的孩子請出發前再確認。</p>' +
      '<div class="d-actions"><button class="btn primary" data-adv-again>🎲 再來一次</button><button class="btn ghost" data-adv-map>🗺️ 在地圖看路線</button>' +
      '<a class="btn ghost" target="_blank" rel="noopener" href="' + gcalUrl(a) + '">📅 加入 Google 行事曆</a><button class="btn ghost" data-adv-copy>📋 複製行程</button></div></div>';
    dlg.innerHTML = html;
  }
  function itemHtml(it) {
    if (it.kind === "ride") return '<li class="ride"><b>' + it.time + '</b><span>🚇 ' + esc(it.text) + '<small>約 ' + it.mins + " 分鐘（含步行）</small></span></li>";
    if (it.kind === "start" || it.kind === "end" || it.kind === "rest") return '<li class="plain"><b>' + it.time + "</b><span>" + (it.kind === "end" ? "🏠 " : it.kind === "rest" ? "🛋️ " : "🎒 ") + esc(it.text) + "</span></li>";
    if (it.generic) return '<li class="meal"><b>' + it.time + "</b><span>🍽️ " + (it.role === "dinner" ? "晚餐" : "午餐") + '<small>附近沒有收錄的店家，可用地圖搜尋「' + esc(it.st) + '站 美食」</small></span></li>';
    var p = it.place, t = TYPES[p[2]], label = it.kind === "lunch" ? "午餐" : it.kind === "dinner" ? "晚餐" : t.label;
    return '<li class="' + (it.kind === "act" ? "act" : "meal") + '"><b>' + it.time + '</b><span><em>' + t.icon + " " + label + "・" + p[0] + "站</em> <strong>" + esc(p[1]) + "</strong>" +
      (p[3] ? "<small>" + esc(p[3]) + "</small>" : "") + '<small>停留約 ' + it.dur + ' 分鐘 ・ <a target="_blank" rel="noopener" href="' + dirUrl(p[0], p[1]) + '">步行導航</a></small></span></li>';
  }
  function plainText(a) {
    var d = ($("#date") && $("#date").value) || "";
    var lines = ["🎲 " + a.title + (d ? "（" + d + "）" : "")];
    a.items.forEach(function (it) {
      if (it.place) lines.push(it.time + " " + it.place[0] + "站｜" + it.place[1] + "（約 " + it.dur + " 分鐘）");
      else if (it.generic) lines.push(it.time + " " + (it.role === "dinner" ? "晚餐" : "午餐") + "（" + it.st + "站附近）");
      else lines.push(it.time + " " + it.text);
    });
    lines.push("", "冒險任務：");
    a.missions.forEach(function (m) { lines.push("- " + m.at + "：" + m.text); });
    return lines.join("\n");
  }
  function gcalUrl(a) {
    var d = ($("#date") && $("#date").value) || (function () { var n = new Date(); return n.getFullYear() + "-" + ("0" + (n.getMonth() + 1)).slice(-2) + "-" + ("0" + n.getDate()).slice(-2); })();
    var s = d.replace(/-/g, "") + "T093000", mins = 9 * 60 + 30 + a.minutes, e = d.replace(/-/g, "") + "T" + hm(mins).replace(":", "") + "00";
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("🎲 " + a.title) + "&dates=" + s + "/" + e +
      "&ctz=Asia%2FTaipei&details=" + encodeURIComponent(plainText(a)) + "&location=" + encodeURIComponent(a.place0);
  }

  function roll() {
    current = generate();
    render();
    var dlg = $("#adventure");
    if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
    else dlg.scrollTop = 0;
  }

  // ---------- 6. 事件 ----------
  document.addEventListener("click", function (e) {
    var el = e.target.closest("#adv-btn,#adv-btn2,[data-adv-again],[data-adv-close],[data-adv-age],[data-adv-len],[data-adv-map],[data-adv-copy],#adventure");
    if (!el) return;
    if (el.id === "adv-btn" || el.id === "adv-btn2" || el.hasAttribute("data-adv-again")) roll();
    else if (el.hasAttribute("data-adv-close")) $("#adventure").close();
    else if (el.dataset.advAge) { opts.age = el.dataset.advAge; roll(); }
    else if (el.dataset.advLen) { opts.len = el.dataset.advLen; roll(); }
    else if (el.hasAttribute("data-adv-map") && current) {
      $("#adventure").close();
      NET.setAdventure({ title: current.title, path: current.path, stops: current.marks });
      NET.scrollToMap();
    } else if (el.hasAttribute("data-adv-copy") && current) {
      var txt = plainText(current);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { el.textContent = "✅ 已複製"; }, function () { window.prompt("複製下面的文字：", txt); });
      else window.prompt("複製下面的文字：", txt);
    } else if (el.id === "adventure" && e.target === el) el.close();
  });
})();
