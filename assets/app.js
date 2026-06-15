/* ircuitry site - live download buttons + community node/workflow galleries, all client-side from GitHub. */
(function () {
  "use strict";
  var REPO = "ircuitry/ircuitry";
  var NODES = "ircuitry/community-nodes";
  var WORKFLOWS = "ircuitry/community-workflows";
  var NODES_RAW = "https://raw.githubusercontent.com/" + NODES + "/main/";
  var WF_RAW = "https://raw.githubusercontent.com/" + WORKFLOWS + "/main/";
  var NODES_INDEX = NODES_RAW + "index.json";
  var WF_INDEX = WF_RAW + "index.json";
  function rawUrl(base, file) { return base + file.split("/").map(encodeURIComponent).join("/"); }
  function installHref(action, raw) { return "ircuitry://" + action + "?url=" + encodeURIComponent(raw); }
  var RELEASE_API = "https://api.github.com/repos/" + REPO + "/releases/latest";

  // ---------- helpers ----------
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg) {
    var t = el("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function copyText(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, function () { fallbackCopy(text); });
    } else { fallbackCopy(text); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied to clipboard"); } catch (e) { toast("Press Ctrl+C to copy"); }
    ta.remove();
  }
  function downloadFile(text, name) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- OS detection + downloads ----------
  function detectOS() {
    var ua = navigator.userAgent || "";
    var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    var s = plat + " " + ua;
    if (/Win/i.test(s)) return "windows";
    if (/Android/i.test(ua)) return "android";
    if (/Linux/i.test(s)) return "linux";
    if (/Mac|iPhone|iPad|iPod/i.test(s)) return "mac";
    return "unknown";
  }
  // Default Linux to the .deb; only switch to AppImage if the UA clearly indicates an rpm/arch-family
  // distro. (Browsers rarely expose the distro at all - notably Chrome and Zorin - so guessing "is this
  // Debian-family?" failed; assuming .deb unless told otherwise is the reliable choice.)
  function rpmFamily() {
    return /fedora|red ?hat|\brhel\b|centos|\brocky\b|alma|\bsuse\b|opensuse|mageia|\barch\b|manjaro|endeavour|garuda|nobara|gentoo|\bvoid\b|alpine|nixos/i.test(navigator.userAgent || "");
  }
  var OS_LABEL = { windows: "Windows", linux: "Linux", mac: "macOS", android: "your device", unknown: "your computer" };
  function byName(rel, name) { var a = (rel.assets || []).filter(function (x) { return x.name === name; })[0]; return a ? a.browser_download_url : null; }
  function bySuffix(rel, suf) { var a = (rel.assets || []).filter(function (x) { return x.name.slice(-suf.length) === suf; })[0]; return a ? a.browser_download_url : null; }
  function link(url, label) { return url ? '<a href="' + url + '">' + esc(label) + "</a>" : ""; }

  function renderDownloads(host, rel) {
    var os = detectOS(), ver = rel.tag_name || "";
    var winexe = byName(rel, "ircuitry-win-x64.exe"), win = byName(rel, "ircuitry-win-x64.zip"), appimg = bySuffix(rel, ".AppImage"), deb = bySuffix(rel, ".deb");
    var lzip = byName(rel, "ircuitry-linux-x64.zip"), marm = byName(rel, "ircuitry-osx-arm64.zip"), mint = byName(rel, "ircuitry-osx-x64.zip");
    var win1 = winexe || win;   // prefer the single-file .exe
    var primaryUrl, primarySub, others = [];
    if (os === "windows") { primaryUrl = win1; primarySub = winexe ? ".exe · just run it" : ".zip · unzip and run Ircuitry.exe"; others = [link(appimg, "Linux AppImage"), link(deb, "Linux .deb"), link(marm, "macOS")]; }
    else if (os === "linux") {
      // Browsers don't reliably expose the distro, so default to the .deb (Debian/Ubuntu/Mint/Zorin/Pop -
      // the bulk of desktop Linux) and only flip to the universal AppImage when the UA clearly shows an
      // rpm/arch-family distro. AppImage is always offered as the first alternative.
      if (appimg && rpmFamily()) {
        primaryUrl = appimg; primarySub = "AppImage · runs on any distro";
        others = [link(deb, "Debian/Ubuntu .deb"), link(lzip, "portable zip"), link(win1, "Windows"), link(marm, "macOS")];
      } else {
        primaryUrl = deb || appimg || lzip;
        primarySub = deb ? "Debian / Ubuntu / Mint / Zorin · sudo apt install ./*.deb" : "AppImage · runs on any distro";
        others = [link(appimg, "AppImage (any distro)"), link(lzip, "portable zip"), link(win1, "Windows"), link(marm, "macOS")];
      }
    }
    else if (os === "mac") { primaryUrl = marm; primarySub = "Apple Silicon · unzip and open"; others = [link(mint, "macOS Intel"), link(win1, "Windows"), link(appimg, "Linux AppImage")]; }
    else { primaryUrl = null; others = [link(win1, "Windows"), link(appimg, "Linux AppImage"), link(deb, "Linux .deb"), link(marm, "macOS Apple Silicon"), link(mint, "macOS Intel")]; }

    var html = "";
    if (primaryUrl) html += '<a class="btn primary" href="' + primaryUrl + '"><span>⬇︎&nbsp; Download for ' + esc(OS_LABEL[os]) + "</span>" + (primarySub ? '<span class="sub">' + esc(primarySub) + "</span>" : "") + "</a>";
    html += '<a class="btn ghost" href="https://github.com/' + REPO + '">View on GitHub</a>';
    var ex = el("dl-extra");
    if (ex) ex.innerHTML = (ver ? "Latest: <b>" + esc(ver) + "</b> &nbsp;·&nbsp; " : "") + "Other platforms: " + others.filter(Boolean).join(" &nbsp;·&nbsp; ") + ' &nbsp;·&nbsp; <a href="https://github.com/' + REPO + '/releases/latest">all downloads</a>';
    host.innerHTML = html;
  }
  function loadDownloads() {
    var host = el("download");
    if (!host) return;
    fetch(RELEASE_API).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (rel) { renderDownloads(host, rel); })
      .catch(function () {
        host.innerHTML = '<a class="btn primary" href="https://github.com/' + REPO + '/releases/latest">Download from GitHub</a><a class="btn ghost" href="https://github.com/' + REPO + '">View on GitHub</a>';
        var ex = el("dl-extra"); if (ex) ex.innerHTML = 'Pick the build for your OS on the <a href="https://github.com/' + REPO + '/releases/latest">releases page</a>.';
      });
  }

  // ---------- generic gallery ----------
  function safeIcon(it) {
    if (it.iconImage && /^[A-Za-z0-9+/=\s]+$/.test(it.iconImage)) return '<img alt="" src="data:image/png;base64,' + it.iconImage.replace(/\s+/g, "") + '">';
    return esc(it.icon || "🧩");
  }
  function nodeCard(n, i) {
    var lang = n.language === "subgraph" ? "subflow" : (n.language || "python");
    var author = n.author && n.author !== "ircuitry" ? "by " + esc(n.author) : "community";
    return '<div class="node"><div class="top"><div class="badge">' + safeIcon(n) + '</div><div>' +
      '<div class="name">' + esc(n.title || n.typeId) + '</div><div class="meta">' + esc(n.typeId) + " · " + author + "</div></div></div>" +
      '<div class="desc">' + esc(n.description || "") + "</div>" +
      '<div class="cat"><span class="lang-tag">' + esc(lang) + "</span></div>" +
      '<div class="actions"><a class="btn primary" href="' + installHref("install-node", rawUrl(NODES_RAW, n.file)) + '">Install in app</a>' +
      '<button class="btn" data-copy="' + i + '">Copy</button><button class="btn" data-dl="' + i + '">Download</button></div></div>';
  }
  function workflowCard(w, i) {
    var author = w.author && w.author !== "ircuitry" ? "by " + esc(w.author) : "community";
    var tags = (w.tags || []).slice(0, 3).map(function (t) { return '<span class="lang-tag">' + esc(t) + "</span>"; }).join(" ");
    return '<div class="node"><div class="top"><div class="badge">🤖</div><div>' +
      '<div class="name">' + esc(w.name) + '</div><div class="meta">' + esc(w.nodeCount) + " nodes · " + esc(w.connectionCount) + " wires · " + author + "</div></div></div>" +
      '<div class="desc">' + esc(w.description || "") + "</div>" +
      '<div class="cat">' + tags + "</div>" +
      '<div class="actions"><a class="btn primary" href="' + installHref("install-bot", rawUrl(WF_RAW, w.file)) + '">Install in app</a>' +
      '<button class="btn" data-copy="' + i + '">Copy</button><button class="btn" data-dl="' + i + '">Download</button></div></div>';
  }

  function startGallery(opts) {
    var grid = el("grid"), rail = el("chips");
    if (!grid) return;
    var all = [], query = "", io = null;

    function primary(it) { var fs = opts.facets(it); return (fs && fs[0]) || "Other"; }
    function catRank(c) { var i = (opts.order || []).indexOf(c); return i < 0 ? 99 : i; }
    function secId(c) { return "cat-" + c.replace(/[^A-Za-z0-9]+/g, "-"); }
    function icon(c) { return (opts.icons && opts.icons[c]) || "📦"; }
    function blurb(c) { return (opts.blurbs && opts.blurbs[c]) || ""; }
    function ordered(b) { return Object.keys(b).sort(function (a, c) { return catRank(a) - catRank(c) || a.localeCompare(c); }); }

    function render() {
      var q = query.trim().toLowerCase();
      var list = all.filter(function (it) { return !q || opts.haystack(it).toLowerCase().indexOf(q) >= 0; });
      el("count").textContent = q ? (list.length + " of " + all.length + " " + opts.noun) : (all.length + " " + opts.noun);
      var b = {}; list.forEach(function (it) { var k = primary(it); (b[k] = b[k] || []).push(it); });
      var cats = ordered(b);
      var emptyEl = el("empty"); if (emptyEl) emptyEl.hidden = list.length > 0;

      grid.innerHTML = cats.map(function (c) {
        return '<section class="cat-section" id="' + secId(c) + '">' +
          '<div class="section-head"><div class="ic">' + esc(icon(c)) + '</div>' +
          '<div class="h"><h3>' + esc(c) + ' <span class="pill">' + b[c].length + "</span></h3>" +
          (blurb(c) ? '<div class="blurb">' + esc(blurb(c)) + "</div>" : "") + "</div></div>" +
          '<div class="grid">' + b[c].map(function (it) { return opts.card(it, all.indexOf(it)); }).join("") + "</div></section>";
      }).join("");

      grid.querySelectorAll("[data-copy]").forEach(function (btn) {
        btn.addEventListener("click", function () { var it = all[+btn.getAttribute("data-copy")]; copyText(opts.copyData(it), opts.copyMsg(it)); });
      });
      grid.querySelectorAll("[data-dl]").forEach(function (btn) {
        btn.addEventListener("click", function () { var it = all[+btn.getAttribute("data-dl")]; downloadFile(opts.copyData(it), opts.dlName(it)); });
      });
      buildRail(b, cats);
      observe();
    }

    function buildRail(b, cats) {
      if (!rail) return;
      rail.innerHTML = cats.map(function (c) {
        return '<button class="chip" data-cat="' + esc(secId(c)) + '"><span class="ic">' + esc(icon(c)) + "</span>" + esc(c) + '<span class="n">' + b[c].length + "</span></button>";
      }).join("");
      rail.querySelectorAll("[data-cat]").forEach(function (btn) {
        btn.addEventListener("click", function () { var s = document.getElementById(btn.getAttribute("data-cat")); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" }); });
      });
    }

    function observe() {
      if (!rail || !("IntersectionObserver" in window)) return;
      if (io) io.disconnect();
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          rail.querySelectorAll(".chip").forEach(function (x) { x.classList.toggle("active", x.getAttribute("data-cat") === e.target.id); });
        });
      }, { rootMargin: "-12% 0px -78% 0px", threshold: 0 });
      grid.querySelectorAll(".cat-section").forEach(function (s) { io.observe(s); });
    }

    fetch(opts.url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (data) {
      all = (data[opts.listKey] || []).sort(function (a, b) { return opts.sortKey(a).localeCompare(opts.sortKey(b)); });
      el("state").style.display = "none";
      var s = el("search"); if (s) s.addEventListener("input", function () { query = s.value; render(); });
      render();
    }).catch(function () {
      el("state").innerHTML = "Could not load right now. Browse it on <a href=\"https://github.com/" + opts.repo + "\">GitHub</a>.";
    });
  }

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", function () {
    loadDownloads();
    var gallery = document.body.getAttribute("data-gallery");
    if (gallery === "nodes") {
      startGallery({
        url: NODES_INDEX, repo: NODES, listKey: "nodes", noun: "nodes",
        order: ["Event", "Filter", "Logic", "Data", "Ai", "Ircv3", "Storage", "Action"],
        icons: { Event: "⚡", Filter: "🔍", Logic: "🧠", Data: "🔢", Ai: "🤖", Ircv3: "🛰️", Storage: "💾", Action: "📤" },
        blurbs: { Event: "Triggers that start a flow", Filter: "Branch on a condition", Logic: "Control flow and state", Data: "Transform and compute values", Ai: "Language-model helpers", Ircv3: "Modern IRC niceties", Storage: "Files, databases and calendars", Action: "Do something out in the world" },
        facets: function (n) { return [n.category || "Action"]; },
        haystack: function (n) { return n.title + " " + n.typeId + " " + n.description + " " + (n.tags || []).join(" "); },
        sortKey: function (n) { return n.title || n.typeId || ""; },
        card: nodeCard,
        copyData: function (n) { return JSON.stringify(n.manifest, null, 2); },
        copyMsg: function (n) { return "Copied " + n.typeId + " · paste into ircuitry"; },
        dlName: function (n) { return n.typeId + ".ircnode"; }
      });
    } else if (gallery === "workflows") {
      startGallery({
        url: WF_INDEX, repo: WORKFLOWS, listKey: "workflows", noun: "workflows",
        order: ["AI", "Games", "Moderation", "Community", "Utility", "Reminders"],
        icons: { AI: "🤖", Games: "🎮", Moderation: "🛡️", Community: "💬", Utility: "🔧", Reminders: "⏰" },
        blurbs: { AI: "Bots powered by language models", Games: "Play right in your channel", Moderation: "Keep the channel tidy", Community: "Social and onboarding helpers", Utility: "Look things up and fetch data", Reminders: "Timed and scheduled posts" },
        facets: function (w) { return [w.category || "Utility"]; },
        haystack: function (w) { return w.name + " " + w.description + " " + (w.category || "") + " " + (w.tags || []).join(" ") + " " + (w.nodeTypes || []).join(" "); },
        sortKey: function (w) { return w.name || ""; },
        card: workflowCard,
        copyData: function (w) { return JSON.stringify(w.workflow, null, 2); },
        copyMsg: function (w) { return "Copied " + w.name + " · press Ctrl+V in ircuitry"; },
        dlName: function (w) { return w.name.replace(/[^a-zA-Z0-9 ._-]/g, "") + ".ircbot"; }
      });
    }
  });
})();
