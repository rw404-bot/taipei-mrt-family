(function () {
  "use strict";

  var LINES = window.LINES, PLACES = window.PLACES, TYPES = window.TYPES,
      HOW = window.HOW || {}, ROUTES = window.ROUTES, FIX = window.LABEL_FIX || {};
  var $ = function (s) { return document.querySelector(s); };
  var W = 1100, H = 1060;

  var state = { cat: "family", line: "all", q: "", station: null, shown: 24 };
  var scale = 1;

  // ---------- 1. 計算站點座標 ----------
  var nodes = {};      // 站名 -> {x, y, lines: [line.id]}
  var resolved = {};   // line.id -> [{n, x, y}]

  function parseItem(s) {
    var m = s.split("@");
    if (m.length > 1) { var c = m[1].split(","); return { n: m[0], x: +c[0], y: +c[1] }; }
    return { n: s };
  }
  LINES.forEach(function (line) {
    var it = line.items.map(parseItem);
    it.forEach(function (p) {
      if (nodes[p.n]) { p.x = nodes[p.n].x; p.y = nodes[p.n].y; }
      else if (p.x != null) nodes[p.n] = { x: p.x, y: p.y, lines: [] };
    });
    var i = 0;
    while (i < it.length) {
      if (it[i].x != null) { i++; continue; }
      var a = i - 1, b = i;
      while (b < it.length && it[b].x == null) b++;
      for (var k = a + 1; k < b; k++) {
        var t = (k - a) / (b - a);
        it[k].x = Math.round((it[a].x + (it[b].x - it[a].x) * t) * 10) / 10;
        it[k].y = Math.round((it[a].y + (it[b].y - it[a].y) * t) * 10) / 10;
        nodes[it[k].n] = { x: it[k].x, y: it[k].y, lines: [] };
      }
      i = b;
    }
    it.forEach(function (p) { if (nodes[p.n].lines.indexOf(line.id) < 0) nodes[p.n].lines.push(line.id); });
    resolved[line.id] = it;
  });
  function lineById(id) { return LINES.filter(function (l) { return l.id === id; })[0]; }

  // ---------- 2. 地點索引 ----------
  var byStation = {};
  PLACES.forEach(function (p, i) { p.id = i; (byStation[p[0]] = byStation[p[0]] || []).push(p); });
  function matchCat(p) {
    if (state.cat === "all") return true;
    if (state.cat === "family") return p[2] !== "food" && p[2] !== "night";
    if (state.cat === "park") return p[2] === "park" || p[2] === "play";
    return p[2] === state.cat;
  }
  function matchQ(p) {
    var q = state.q.trim();
    return !q || p[1].indexOf(q) >= 0 || p[0].indexOf(q) >= 0 || (p[3] || "").indexOf(q) >= 0;
  }
  function stationLines(st) {
    var n = nodes[st]; if (!n) return [];
    var seen = {}, out = [];
    n.lines.forEach(function (id) { var l = lineById(id); if (!seen[l.name]) { seen[l.name] = 1; out.push(l); } });
    return out;
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  // ---------- 3. 畫路網 ----------
  function labelFor(name) {
    var n = nodes[name], line = lineById(n.lines[0]);
    var arr = resolved[line.id], idx = arr.map(function (p) { return p.n; }).indexOf(name);
    var prev = arr[Math.max(0, idx - 1)], next = arr[Math.min(arr.length - 1, idx + 1)];
    var dx = next.x - prev.x, dy = next.y - prev.y;
    var fix = FIX[name];
    if (fix) return { dx: fix[0], dy: fix[1], anchor: fix[2], rot: 0, side: fix[0] < 0 ? "l" : "r" };
    if (Math.abs(dx) >= Math.abs(dy) * 1.2) {
      return line.hor === "up"
        ? { dx: 3, dy: -13, anchor: "start", rot: -40, side: "up" }
        : { dx: 3, dy: 15, anchor: "start", rot: 40, side: "down" };
    }
    return line.side === "r"
      ? { dx: 14, dy: 4, anchor: "start", rot: 0, side: "r" }
      : { dx: -14, dy: 4, anchor: "end", rot: 0, side: "l" };
  }
  function pinPos(x, y, lb) {
    if (lb.side === "up") return [x, y + 18];
    if (lb.side === "down") return [x, y - 18];
    if (lb.side === "r") return [x - 18, y];
    return [x + 18, y];
  }

  function drawNet() {
    var svg = $("#net");
    var html = '<rect width="' + W + '" height="' + H + '" fill="transparent"/>';
    // 線
    LINES.forEach(function (l) {
      var pts = resolved[l.id].map(function (p) { return p.x + "," + p.y; }).join(" ");
      var dim = state.line !== "all" && state.line !== l.id && state.line !== (l.id === "R2" ? "R" : l.id === "O2" ? "O" : l.id);
      html += '<polyline class="nl' + (dim ? " dim" : "") + '" points="' + pts + '" stroke="' + l.color +
        '" fill="none" stroke-width="' + (l.id === "MK" ? 6 : 10) + '" stroke-linecap="round" stroke-linejoin="round"' +
        (l.id === "MK" ? ' stroke-dasharray="2 10"' : "") + "/>";
    });
    // 大冒險路線
    if (state.adv && state.adv.path && state.adv.path.length > 1) {
      var ap = state.adv.path.filter(function (n) { return nodes[n]; }).map(function (n) { return nodes[n].x + "," + nodes[n].y; }).join(" ");
      html += '<polyline class="advunder" points="' + ap + '" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>' +
        '<polyline class="advpath" points="' + ap + '" fill="none" stroke="#ff6a00" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 13"/>';
    }
    // 站與名稱
    Object.keys(nodes).forEach(function (name) {
      var n = nodes[name], lb = labelFor(name), ls = stationLines(name), multi = ls.length > 1;
      var main = lineById(n.lines[0]);
      var onLine = state.line === "all" || n.lines.some(function (id) {
        return id === state.line || (state.line === "R" && id === "R2") || (state.line === "O" && id === "O2");
      });
      var cnt = (byStation[name] || []).filter(matchCat).filter(matchQ).length;
      html += '<g class="stn' + (onLine ? "" : " dim") + (state.station === name ? " sel" : "") +
        '" data-st="' + esc(name) + '" tabindex="0" role="button" aria-label="' + esc(name) + '站，' + cnt + ' 個地點">';
      html += '<circle class="hit" cx="' + n.x + '" cy="' + n.y + '" r="15"/>';
      html += '<circle class="dot" cx="' + n.x + '" cy="' + n.y + '" r="' + (multi ? 9 : 6.5) + '" fill="#fff" stroke="' +
        (multi ? "#2d2a32" : main.color) + '" stroke-width="' + (multi ? 3.5 : 4) + '"/>';
      var tx = n.x + lb.dx, ty = n.y + lb.dy;
      html += '<text class="lbl' + (multi ? " big" : "") + '" text-anchor="' + lb.anchor + '" ' +
        (lb.rot ? 'transform="translate(' + tx + " " + ty + ") rotate(" + lb.rot + ')"' : 'x="' + tx + '" y="' + ty + '"') + ">" + esc(name) + "</text>";
      if (cnt) {
        var pp = pinPos(n.x, n.y, lb), col = (state.cat === "all" || state.cat === "family") ? "#ff9f43" : TYPES[state.cat === "park" ? "park" : state.cat].color;
        html += '<g class="pin"><circle cx="' + pp[0] + '" cy="' + pp[1] + '" r="9.5" fill="' + col + '" stroke="#fff" stroke-width="2.5"/>' +
          '<text x="' + pp[0] + '" y="' + (pp[1] + 4) + '" text-anchor="middle">' + cnt + "</text></g>";
      }
      html += "</g>";
    });
    if (state.adv && state.adv.stops) {
      state.adv.stops.forEach(function (s, i) {
        var n = nodes[s.st]; if (!n) return;
        html += '<g class="advmark"><path d="M' + n.x + ' ' + (n.y - 8) + ' l-6 -10 h12z" fill="#ff3b2f"/><circle cx="' + n.x + '" cy="' + (n.y - 30) + '" r="14" fill="#ff3b2f" stroke="#fff" stroke-width="3"/>' +
          '<text x="' + n.x + '" y="' + (n.y - 25) + '" text-anchor="middle">' + (i + 1) + "</text></g>";
      });
    }
    svg.innerHTML = html;
  }

  function applyScale() {
    var svg = $("#net");
    svg.style.width = Math.round(W * scale) + "px";
    $("#zoom-val").textContent = Math.round(scale * 100) + "%";
  }
  function fitScale() {
    var cw = $("#netscroll").clientWidth;
    scale = Math.max(0.75, Math.min(1.15, cw / W));
    applyScale();
  }

  // ---------- 4. 控制列 ----------
  function renderControls() {
    var html = '<button class="chip' + (state.cat === "family" ? " on" : "") + '" data-cat="family">親子地點</button><button class="chip' + (state.cat === "all" ? " on" : "") + '" data-cat="all">全部（含美食與夜市）</button>';
    ["play", "park", "trail", "bloom", "spot", "food", "night"].forEach(function (k) {
      var label = k === "park" ? "公園（含共融）" : TYPES[k].label;
      html += '<button class="chip' + (state.cat === k ? " on" : "") + '" data-cat="' + k + '">' + TYPES[k].icon + " " + label + "</button>";
    });
    $("#net-cats").innerHTML = html;

    var lh = '<button class="chip' + (state.line === "all" ? " on" : "") + '" data-line="all">所有路線</button>';
    LINES.filter(function (l) { return !l.branch; }).forEach(function (l) {
      lh += '<button class="chip lchip' + (state.line === l.id ? " on" : "") + '" data-line="' + l.id +
        '" style="--c:' + l.color + '"><i></i>' + l.name + "</button>";
    });
    $("#net-lines").innerHTML = lh;
  }

  // ---------- 5. 公園牆 ----------
  function filteredPlaces() {
    return PLACES.filter(function (p) {
      if (!matchCat(p) || !matchQ(p)) return false;
      if (state.station && p[0] !== state.station) return false;
      if (state.line !== "all") {
        var n = nodes[p[0]];
        if (!n || !n.lines.some(function (id) { return id === state.line || (state.line === "R" && id === "R2") || (state.line === "O" && id === "O2"); })) return false;
      }
      return true;
    });
  }
  function renderWall() {
    var list = filteredPlaces();
    var head = "共 " + list.length + " 個地點";
    if (state.station) head += "（" + state.station + "站）";
    $("#wall-count").innerHTML = head + (state.station ? ' <button class="btn small ghost" data-clear-st>清除站點篩選 ✕</button>' : "");
    var show = list.slice(0, state.shown);
    $("#wall").innerHTML = show.map(function (p) {
      var t = TYPES[p[2]], ls = stationLines(p[0]), c = ls.length ? ls[0].color : "#999";
      return '<button class="pcard" data-place="' + p.id + '" style="--c:' + c + '">' +
        '<span class="pico" style="background:' + t.color + '22">' + t.icon + "</span>" +
        '<span class="ptxt"><b>' + esc(p[1]) + "</b>" +
        '<small>' + esc(p[0]) + "站・" + t.label + (p[3] ? "・" + esc(p[3]) : "") + "</small></span>" +
        '<span class="pline">' + ls.map(function (l) { return '<i style="background:' + l.color + '"></i>'; }).join("") + "</span></button>";
    }).join("") || '<p class="muted">找不到符合的地點，換個條件試試。</p>';
    $("#wall-more").hidden = list.length <= state.shown;
  }

  // ---------- 6. 側邊抽屜 ----------
  var drawer = $("#drawer"), lastFocus = null;
  function openDrawer(html) {
    lastFocus = document.activeElement;
    drawer.innerHTML = '<button class="d-x" data-dclose aria-label="關閉">✕</button>' + html;
    drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false");
    $("#drawer-bg").classList.add("on");
    drawer.scrollTop = 0;
    var x = drawer.querySelector(".d-x"); if (x) x.focus();
  }
  function closeDrawer() {
    drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true");
    $("#drawer-bg").classList.remove("on");
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }
  function lineChips(st) {
    return stationLines(st).map(function (l) {
      return '<span class="tag line" style="--c:' + l.color + '">' + l.name + "</span>";
    }).join(" ");
  }
  function stationView(st) {
    var all = byStation[st] || [], list = all.filter(matchCat).filter(matchQ);
    var html = '<div class="d-head" style="--c:' + (stationLines(st)[0] || { color: "#3fae6a" }).color + '">' +
      '<span class="kicker">捷運站</span><h3>' + esc(st) + "站</h3><p>" + lineChips(st) + "</p></div><div class=\"d-main\">";
    if (!all.length) html += '<p class="muted">這一站目前還沒有收錄親子地點，可以看看相鄰的站。</p>';
    else if (!list.length) html += '<p class="muted">沒有符合目前篩選的地點。</p>';
    else {
      html += '<p class="muted">出站後可以去這些地方（點選看怎麼走）：</p><ul class="plist">';
      list.forEach(function (p) {
        var t = TYPES[p[2]];
        html += '<li><button class="prow" data-place="' + p.id + '"><span class="pi">' + t.icon + "</span><span><b>" +
          esc(p[1]) + "</b>" + (p[3] ? '<small>' + esc(p[3]) + "</small>" : "") + "</span><em>怎麼走 ›</em></button></li>";
      });
      html += "</ul>";
    }
    html += '<button class="btn small ghost" data-filter-st="' + esc(st) + '">在下方公園牆只看這一站</button></div>';
    openDrawer(html);
  }
  function dirUrl(st, name) {
    return "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent("捷運" + st + "站") +
      "&destination=" + encodeURIComponent(name + " 台北") + "&travelmode=walking";
  }
  function placeView(id) {
    var p = PLACES[id], st = p[0], t = TYPES[p[2]], how = HOW[st + "|" + p[1]];
    var route = p[4] && ROUTES.filter(function (r) { return r.id === p[4]; })[0];
    var html = '<div class="d-head place" style="--c:' + t.color + '"><span class="big">' + t.icon + '</span><span class="kicker">' + t.label +
      "</span><h3>" + esc(p[1]) + "</h3><p>" + lineChips(st) + ' <span class="tag">' + esc(st) + "站</span></p></div>" +
      '<div class="d-main">' + (p[3] ? '<p class="note">' + esc(p[3]) + "</p>" : "") +
      "<h4>🚶 從捷運出站怎麼走</h4>";
    if (p[2] === "food") html += '<p class="muted small">美食資料整理自台北捷運「旅遊趣」2026 年主題地圖；營業時間、是否適合帶孩子請自行確認。</p>';
    if (how) {
      html += '<p class="walk">' + esc(st) + "站 → " + esc(how.walk) + '</p><ol class="steps">' +
        how.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
        '<p class="muted small">路線整理自公開資訊，實際出口與步行時間請以現場指標與導航為準。</p>';
    } else {
      html += '<ol class="steps"><li>在<b>' + esc(st) + "站</b>出站，依站內指標找離「" + esc(p[1]) + "」最近的出口。</li>" +
        "<li>各站出口位置不同，按下方「步行導航」可看到最適合的出口、路線與預估時間。</li></ol>" +
        '<p class="muted small">這個地點尚未整理圖文步行說明，先用導航確認最準確。</p>';
    }
    html += '<div class="d-btns"><a class="btn primary" target="_blank" rel="noopener" href="' + dirUrl(st, p[1]) + '">🧭 Google 步行導航</a>' +
      '<button class="btn ghost" data-showmap="' + id + '">📍 看地圖位置</button>' +
      (route ? '<button class="btn ghost" data-open="' + route.id + '">' + route.emoji + " 看完整行程</button>" : "") +
      '</div><div id="map-embed"></div>' +
      '<button class="btn small ghost" data-back="' + esc(st) + '">‹ 回到' + esc(st) + "站</button></div>";
    openDrawer(html);
  }

  // ---------- 7. 事件 ----------
  function selectStation(name) { state.station = name; drawNet(); stationView(name); }
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-cat],[data-line],[data-st],[data-place],[data-dclose],[data-back],[data-showmap],[data-filter-st],[data-clear-st],[data-adv-clear],#wall-more,#zoom-in,#zoom-out,#zoom-fit,#drawer-bg");
    if (!el) return;
    if (el.dataset.cat) { state.cat = el.dataset.cat; state.shown = 24; refresh(); }
    else if (el.dataset.line) { state.line = el.dataset.line; state.shown = 24; refresh(); }
    else if (el.dataset.st !== undefined) { selectStation(el.dataset.st); }
    else if (el.dataset.place !== undefined) { placeView(+el.dataset.place); }
    else if (el.dataset.back) { stationView(el.dataset.back); }
    else if (el.dataset.showmap !== undefined) {
      var p = PLACES[+el.dataset.showmap];
      $("#map-embed").innerHTML = '<iframe title="' + esc(p[1]) + ' 地圖" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=' +
        encodeURIComponent(p[1] + " 台北") + '&hl=zh-TW&z=16&output=embed"></iframe>';
      el.hidden = true;
    }
    else if (el.dataset.filterSt) { state.station = el.dataset.filterSt; state.shown = 24; closeDrawer(); refresh(); $("#wall-head").scrollIntoView({ behavior: "smooth" }); }
    else if (el.hasAttribute("data-clear-st")) { state.station = null; refresh(); }
    else if (el.hasAttribute("data-dclose") || el.id === "drawer-bg") closeDrawer();
    else if (el.id === "wall-more") { state.shown += 24; renderWall(); }
    else if (el.id === "zoom-in") { scale = Math.min(2, scale + 0.15); applyScale(); }
    else if (el.id === "zoom-out") { scale = Math.max(0.5, scale - 0.15); applyScale(); }
    else if (el.id === "zoom-fit") fitScale();
    else if (el.hasAttribute("data-adv-clear")) { state.adv = null; drawNet(); renderAdvBar(); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("g.stn")) {
      e.preventDefault(); selectStation(e.target.dataset.st);
    }
  });
  $("#net-q").addEventListener("input", function (e) { state.q = e.target.value; state.shown = 24; refresh(); });

  function refresh() { renderControls(); drawNet(); renderWall(); }

  function renderThemed() {
    var el = $("#themed"); if (!el || !window.THEMED_2026) return;
    el.innerHTML = window.THEMED_2026.map(function (m) {
      return '<article class="tcard"><span class="tdate">' + esc(m.date) + "</span><h4>" + esc(m.title) + "</h4><p>" + esc(m.desc) + "</p>" +
        '<p class="tnote">' + esc(m.done) + '</p><a class="btn small ghost" target="_blank" rel="noopener" href="https://ssl.metro.taipei/travelfun/MapInfoDetailWeb.aspx?Id=' + m.id + '">看官方地圖 ↗</a></article>';
    }).join("");
  }

  function renderAdvBar() {
    var bar = $("#adv-bar"); if (!bar) return;
    if (!state.adv) { bar.hidden = true; bar.innerHTML = ""; return; }
    bar.hidden = false;
    bar.innerHTML = "<span>🎲 <b>" + esc(state.adv.title || "大冒險路線") + "</b>：" +
      state.adv.stops.map(function (s, i) { return "<em>" + (i + 1) + "</em>" + esc(s.st) + "站"; }).join(" → ") +
      '</span> <button class="btn small ghost" data-adv-clear>清除路線</button>';
  }
  window.MRTNET = {
    nodes: nodes, lines: LINES, resolved: resolved, stationLines: stationLines,
    placeView: placeView, stationView: stationView,
    setAdventure: function (adv) { state.adv = adv; drawNet(); renderAdvBar(); },
    scrollToMap: function () { var el = $("#netscroll"); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }
  };

  refresh();
  renderThemed();
  fitScale();
  window.addEventListener("resize", function () { /* 保留使用者手動縮放，不自動重設 */ });
})();
