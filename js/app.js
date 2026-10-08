(function () {
  "use strict";

  var ROUTES = window.ROUTES, HOLIDAYS = window.HOLIDAYS, PACKING = window.PACKING;
  var filters = { age: "all", weather: "all", dur: "all" };
  var favOnly = false;
  var forecast = {}; // { "YYYY-MM-DD": {code, tmax, tmin, rain} }
  window.FORECAST = forecast;

  var $ = function (s) { return document.querySelector(s); };

  // ---- localStorage（失敗時安靜略過）----
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  var favs = load("mrt-favs", []);
  var packed = load("mrt-packed", []);

  // ---- 日期工具 ----
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var WEEK = ["日", "一", "二", "三", "四", "五", "六"];
  function nice(s) { var d = parse(s); return (d.getMonth() + 1) + "/" + d.getDate() + "（" + WEEK[d.getDay()] + "）"; }

  // ---- 天氣 ----
  function icon(code) {
    if (code === 0) return "☀️";
    if (code <= 2) return "🌤️";
    if (code === 3) return "☁️";
    if (code <= 48) return "🌫️";
    if (code <= 67) return "🌧️";
    if (code <= 77) return "❄️";
    if (code <= 82) return "🌦️";
    return "⛈️";
  }
  function fetchWeather() {
    var url = "https://api.open-meteo.com/v1/forecast?latitude=25.04&longitude=121.56" +
      "&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=Asia%2FTaipei&forecast_days=16";
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var d = j.daily;
      d.time.forEach(function (t, i) {
        forecast[t] = {
          code: d.weathercode[i],
          tmax: Math.round(d.temperature_2m_max[i]),
          tmin: Math.round(d.temperature_2m_min[i]),
          rain: d.precipitation_probability_max[i]
        };
      });
    });
  }
  function renderStrip() {
    var el = $("#weather-strip"), sel = $("#date").value, html = "";
    Object.keys(forecast).slice(0, 14).forEach(function (t) {
      var f = forecast[t];
      html += '<button class="wday' + (t === sel ? " on" : "") + '" data-d="' + t + '">' +
        nice(t) + '<div class="ico">' + icon(f.code) + "</div>" +
        f.tmin + "–" + f.tmax + "°<small>雨 " + f.rain + "%</small></button>";
    });
    el.innerHTML = html;
  }
  function renderWeatherNow() {
    var el = $("#weather-now"), t = $("#date").value, f = forecast[t];
    if (!Object.keys(forecast).length) { el.textContent = "目前無法取得天氣預報，請參考中央氣象署。"; return; }
    if (!f) { el.textContent = "這天超出 16 天預報範圍，出發前再來看一次吧。"; return; }
    var wet = f.rain >= 50;
    el.innerHTML = icon(f.code) + " " + nice(t) + " " + f.tmin + "–" + f.tmax + "°C，降雨機率 " + f.rain + "%。" +
      (wet ? ' 可能下雨，建議看<button class="btn small ghost" id="apply-rain">雨天也行的路線</button>'
           : (f.rain <= 20 ? " 天氣不錯，適合戶外路線！" : " 帶把傘更保險。"));
    var b = $("#apply-rain");
    if (b) b.onclick = function () { setFilter("weather", "rainy"); location.hash = "routes"; };
  }

  // ---- 假期提醒 ----
  function renderHoliday() {
    var today = ymd(new Date()), el = $("#holiday-banner");
    var h = HOLIDAYS.filter(function (x) { return x.end >= today; })[0];
    if (!h) return;
    var days = Math.round((parse(h.start) - parse(today)) / 864e5);
    var when = days > 0 ? "還有 " + days + " 天" : "進行中";
    el.hidden = false;
    el.innerHTML = "<span>🎉 下一個連假：<b>" + h.name + "</b> " + nice(h.start) + " – " + nice(h.end) +
      "（" + when + "）</span>";
    var b = document.createElement("button");
    b.className = "btn small primary";
    b.textContent = "用連假第一天規劃";
    b.onclick = function () {
      $("#date").value = h.start > today ? h.start : today;
      onDateChange();
    };
    el.appendChild(b);
  }

  // ---- 路線卡片 ----
  var AGE_TXT = { toddler: "幼兒", kid: "學童" };
  function matches(r) {
    if (filters.age !== "all" && r.ages.indexOf(filters.age) < 0) return false;
    if (filters.weather !== "all" && r.weather.indexOf(filters.weather) < 0) return false;
    if (filters.dur !== "all" && r.duration !== filters.dur) return false;
    if (favOnly && favs.indexOf(r.id) < 0) return false;
    return true;
  }
  function renderCards() {
    var list = ROUTES.filter(matches), grid = $("#route-grid");
    $("#result-count").textContent = "共 " + list.length + " 條路線";
    if (!list.length) {
      grid.innerHTML = '<div class="empty">沒有符合的路線，試著放寬條件看看。</div>';
      return;
    }
    grid.innerHTML = list.map(function (r) {
      var isFav = favs.indexOf(r.id) >= 0;
      return '<article class="card" style="--c:' + r.color + '">' +
        '<img class="thumb" src="' + r.img + '" alt="' + r.title + '插圖" loading="lazy">' +
        '<div class="body"><h3>' + r.emoji + " " + r.title + "</h3>" +
        '<div class="meta"><span class="tag line">' + r.line + "</span>" +
        '<span class="tag">' + (r.duration === "half" ? "半天" : "一天") + "</span>" +
        r.ages.map(function (a) { return '<span class="tag">' + AGE_TXT[a] + "</span>"; }).join("") +
        '<span class="tag">' + (r.weather.indexOf("rainy") >= 0 ? "🌧️ 雨天也行" : "☀️ 晴天") + "</span></div>" +
        "<p>" + r.summary + "</p>" +
        '<div class="actions"><button class="btn primary" data-open="' + r.id + '">看行程</button>' +
        '<button class="fav" data-fav="' + r.id + '" aria-pressed="' + isFav + '" aria-label="' +
        (isFav ? "取消收藏" : "收藏") + r.title + '">' + (isFav ? "❤️" : "🤍") + "</button></div></div></article>";
    }).join("");
  }
  function setFilter(key, val) {
    filters[key] = val;
    var g = document.querySelector('.fgroup[data-key="' + key + '"]');
    g.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("on", c.dataset.v === val); });
    renderCards();
  }

  // ---- 行事曆 ----
  function eventTimes(r) {
    var d = $("#date").value || ymd(new Date());
    var base = parse(d), sp = r.start.split(":");
    var s = new Date(base.getFullYear(), base.getMonth(), base.getDate(), +sp[0], +sp[1]);
    var e = new Date(s.getTime() + r.hours * 3600e3);
    return [s, e];
  }
  function stamp(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00";
  }
  function detailsText(r) {
    return r.stops.map(function (s) { return s.time + " " + s.place; }).join("\n");
  }
  function googleUrl(r) {
    var t = eventTimes(r);
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(r.emoji + " " + r.title) +
      "&dates=" + stamp(t[0]) + "/" + stamp(t[1]) +
      "&ctz=Asia%2FTaipei" +
      "&details=" + encodeURIComponent(detailsText(r)) +
      "&location=" + encodeURIComponent(r.location);
  }
  function downloadIcs(r) {
    var t = eventTimes(r);
    var esc = function (s) { return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); };
    var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//mrt-family//ZH", "BEGIN:VEVENT",
      "UID:" + r.id + "-" + stamp(t[0]) + "@mrt-family",
      "DTSTAMP:" + stamp(new Date()),
      "DTSTART:" + stamp(t[0]), "DTEND:" + stamp(t[1]),
      "SUMMARY:" + esc(r.emoji + " " + r.title),
      "LOCATION:" + esc(r.location),
      "DESCRIPTION:" + esc(detailsText(r)),
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    a.download = r.id + ".ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // ---- 詳細視窗 ----
  function openDetail(id) {
    var r = ROUTES.filter(function (x) { return x.id === id; })[0];
    var dlg = $("#detail"), d = $("#date").value, f = forecast[d];
    dlg.style.setProperty("--c", r.color);
    dlg.innerHTML =
      '<button class="btn small ghost d-close" data-close>關閉 ✕</button>' +
      '<img class="d-img" src="' + r.img + '" alt="' + r.title + '插圖">' +
      '<div class="d-body"><h3 id="d-title" style="font-size:1.5rem">' + r.emoji + " " + r.title + "</h3>" +
      "<p>" + r.summary + "</p>" +
      "<p><b>搭乘路線：</b>" + r.line + "<br><b>適合季節：</b>" + r.season + "</p>" +
      (f ? "<p><b>" + nice(d) + " 天氣：</b>" + icon(f.code) + " " + f.tmin + "–" + f.tmax + "°C，降雨機率 " + f.rain + "%" +
        (f.rain >= 50 && r.weather.indexOf("rainy") < 0 ? "（這條路線偏戶外，建議改天或換路線）" : "") + "</p>" : "") +
      "<h3>行程時間軸</h3><ol class=\"timeline\">" +
      r.stops.map(function (s) {
        return "<li><b>" + s.time + "</b> " + s.place + '<span class="tip">💡 ' + s.tip + "</span></li>";
      }).join("") + "</ol>" +
      "<h3>親子小提醒</h3><ul>" + r.tips.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>" +
      (r.alt ? "<p class=\"alt\">☔ <b>雨天備案：</b>" + r.alt + "</p>" : "") +
      (r.eat ? "<h3>🍜 順路吃</h3><p class=\"muted small\">" + r.eatNote + "</p><ul class=\"eatlist\">" +
        r.eat.map(function (e) {
          var url = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(e.n + " 捷運" + e.st + "站 台北");
          return "<li><span><b>" + e.n + "</b><small>" + e.st + "站・" + e.tag + '</small></span><a class="btn small ghost" target="_blank" rel="noopener" href="' + url + '">地圖</a></li>';
        }).join("") + "</ul><p class=\"muted small\">店家資料整理自台北捷運旅遊趣 2026 年主題地圖；營業時間與是否適合帶孩子請自行確認。</p>" : "") +
      '<div class="d-actions">' +
      '<a class="btn primary" target="_blank" rel="noopener" href="' + googleUrl(r) + '">📅 加入 Google 行事曆</a>' +
      '<button class="btn ghost" data-ics="' + r.id + '">下載 .ics（其他行事曆）</button></div>' +
      '<p class="muted" style="font-size:.85rem">行事曆日期為上方選擇的 ' + nice(d || ymd(new Date())) + "，出發時間 " + r.start + "。</p></div>";
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }

  // ---- 清單 ----
  function renderPack() {
    $("#pack-list").innerHTML = PACKING.map(function (item, i) {
      return '<li><label><input type="checkbox" data-i="' + i + '"' + (packed.indexOf(i) >= 0 ? " checked" : "") +
        "><span>" + item + "</span></label></li>";
    }).join("");
  }

  // ---- 事件 ----
  function onDateChange() {
    renderStrip(); renderWeatherNow();
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button,a,dialog");
    if (!t) return;
    if (t.matches(".fgroup[data-key] .chip") || t.closest(".fgroup[data-key]") && t.classList.contains("chip")) {
      setFilter(t.closest(".fgroup").dataset.key, t.dataset.v);
    } else if (t.id === "fav-only") {
      favOnly = !favOnly;
      t.setAttribute("aria-pressed", favOnly);
      renderCards();
    } else if (t.dataset.open) {
      openDetail(t.dataset.open);
    } else if (t.dataset.fav) {
      var i = favs.indexOf(t.dataset.fav);
      if (i >= 0) favs.splice(i, 1); else favs.push(t.dataset.fav);
      save("mrt-favs", favs); renderCards();
    } else if (t.dataset.close !== undefined) {
      $("#detail").close();
    } else if (t.dataset.ics) {
      downloadIcs(ROUTES.filter(function (x) { return x.id === t.dataset.ics; })[0]);
    } else if (t.classList.contains("wday")) {
      $("#date").value = t.dataset.d; onDateChange();
    } else if (t.id === "pack-reset") {
      packed = []; save("mrt-packed", packed); renderPack();
    } else if (t.id === "detail" && e.target === t) {
      t.close(); // 點擊背景關閉
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "date") onDateChange();
    if (e.target.matches("#pack-list input")) {
      var i = +e.target.dataset.i, k = packed.indexOf(i);
      if (e.target.checked && k < 0) packed.push(i);
      if (!e.target.checked && k >= 0) packed.splice(k, 1);
      save("mrt-packed", packed);
    }
  });

  // ---- 啟動 ----
  var today = ymd(new Date());
  $("#date").value = today;
  $("#date").min = today;
  renderHoliday(); renderCards(); renderPack();
  fetchWeather().then(onDateChange).catch(function () { renderWeatherNow(); });
})();
