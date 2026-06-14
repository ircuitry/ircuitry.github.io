/* ircuitry site - live download buttons + community node gallery, all client-side from GitHub. */
(function () {
  "use strict";
  var REPO = "ircuitry/ircuitry";
  var NODES = "ircuitry/community-nodes";
  var INDEX_URL = "https://raw.githubusercontent.com/" + NODES + "/main/index.json";
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
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  // ---------- OS detection ----------
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
  var OS_LABEL = { windows: "Windows", linux: "Linux", mac: "macOS", android: "your device", unknown: "your computer" };

  // ---------- downloads ----------
  function assetByName(rel, name) {
    var a = (rel.assets || []).filter(function (x) { return x.name === name; })[0];
    return a ? a.browser_download_url : null;
  }
  function assetBySuffix(rel, suf) {
    var a = (rel.assets || []).filter(function (x) { return x.name.slice(-suf.length) === suf; })[0];
    return a ? a.browser_download_url : null;
  }
  function link(url, label) { return url ? '<a href="' + url + '">' + esc(label) + "</a>" : ""; }

  function renderDownloads(host, rel) {
    var os = detectOS();
    var ver = rel.tag_name || "";
    var win = assetByName(rel, "ircuitry-win-x64.zip");
    var appimg = assetBySuffix(rel, ".AppImage");
    var deb = assetBySuffix(rel, ".deb");
    var lzip = assetByName(rel, "ircuitry-linux-x64.zip");
    var marm = assetByName(rel, "ircuitry-osx-arm64.zip");
    var mint = assetByName(rel, "ircuitry-osx-x64.zip");

    var primaryUrl, primarySub, others = [];
    if (os === "windows") {
      primaryUrl = win; primarySub = ".zip · unzip and run Ircuitry.exe";
      others = [link(appimg, "Linux AppImage"), link(deb, "Linux .deb"), link(marm, "macOS")];
    } else if (os === "linux") {
      primaryUrl = appimg || lzip; primarySub = "AppImage · chmod +x and run";
      others = [link(deb, ".deb (apt)"), link(lzip, "portable zip"), link(win, "Windows"), link(marm, "macOS")];
    } else if (os === "mac") {
      primaryUrl = marm; primarySub = "Apple Silicon · unzip and open";
      others = [link(mint, "macOS Intel"), link(win, "Windows"), link(appimg, "Linux AppImage")];
    } else {
      primaryUrl = null;
      others = [link(win, "Windows"), link(appimg, "Linux AppImage"), link(deb, "Linux .deb"), link(marm, "macOS Apple Silicon"), link(mint, "macOS Intel")];
    }

    var html = "";
    if (primaryUrl) {
      html += '<a class="btn primary" href="' + primaryUrl + '">' +
        "<span>⬇︎&nbsp; Download for " + esc(OS_LABEL[os]) + "</span>" +
        (primarySub ? '<span class="sub">' + esc(primarySub) + "</span>" : "") + "</a>";
    }
    html += '<a class="btn ghost" href="https://github.com/' + REPO + '">View on GitHub</a>';
    el("dl-extra").innerHTML =
      (ver ? "Latest: <b>" + esc(ver) + "</b> &nbsp;·&nbsp; " : "") +
      "Other platforms: " + others.filter(Boolean).join(" &nbsp;·&nbsp; ") +
      ' &nbsp;·&nbsp; <a href="https://github.com/' + REPO + '/releases/latest">all downloads</a>';
    host.innerHTML = html;
  }

  function loadDownloads() {
    var host = el("download");
    if (!host) return;
    fetch(RELEASE_API)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (rel) { renderDownloads(host, rel); })
      .catch(function () {
        host.innerHTML =
          '<a class="btn primary" href="https://github.com/' + REPO + '/releases/latest">Download from GitHub</a>' +
          '<a class="btn ghost" href="https://github.com/' + REPO + '">View on GitHub</a>';
        var ex = el("dl-extra");
        if (ex) ex.innerHTML = 'Pick the build for your OS on the <a href="https://github.com/' + REPO + '/releases/latest">releases page</a>.';
      });
  }

  // ---------- node gallery ----------
  var allNodes = [], activeCat = "all", query = "";

  function safeIcon(node) {
    if (node.iconImage && /^[A-Za-z0-9+/=\s]+$/.test(node.iconImage)) {
      return '<img alt="" src="data:image/png;base64,' + node.iconImage.replace(/\s+/g, "") + '">';
    }
    return esc(node.icon || "🧩");
  }

  function cardHTML(node, i) {
    var lang = node.language === "subgraph" ? "subflow" : (node.language || "python");
    var author = node.author && node.author !== "ircuitry" ? "by " + esc(node.author) : "community";
    return (
      '<div class="node">' +
        '<div class="top">' +
          '<div class="badge">' + safeIcon(node) + "</div>" +
          "<div>" +
            '<div class="name">' + esc(node.title || node.typeId) + "</div>" +
            '<div class="meta">' + esc(node.typeId) + " · " + author + "</div>" +
          "</div>" +
        "</div>" +
        '<div class="cat">' + esc(node.category || "Action") + ' <span class="lang-tag">' + esc(lang) + "</span></div>" +
        '<div class="desc">' + esc(node.description || "") + "</div>" +
        '<div class="actions">' +
          '<button class="btn primary" data-copy="' + i + '">Copy</button>' +
          '<button class="btn" data-dl="' + i + '">Download</button>' +
        "</div>" +
      "</div>"
    );
  }

  function render() {
    var grid = el("grid");
    if (!grid) return;
    var q = query.trim().toLowerCase();
    var list = allNodes.filter(function (n) {
      if (activeCat !== "all" && (n.category || "Action") !== activeCat) return false;
      if (!q) return true;
      var hay = (n.title + " " + n.typeId + " " + n.description + " " + (n.tags || []).join(" ")).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    el("count").textContent = list.length + " of " + allNodes.length + " nodes";
    grid.innerHTML = list.map(function (n) { return cardHTML(n, allNodes.indexOf(n)); }).join("");
    grid.querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () { copyNode(allNodes[+b.getAttribute("data-copy")]); });
    });
    grid.querySelectorAll("[data-dl]").forEach(function (b) {
      b.addEventListener("click", function () { downloadNode(allNodes[+b.getAttribute("data-dl")]); });
    });
  }

  function copyNode(node) {
    var text = JSON.stringify(node.manifest, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast("Copied " + node.typeId + " · paste into ircuitry"); },
        function () { fallbackCopy(text); }
      );
    } else { fallbackCopy(text); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied to clipboard"); } catch (e) { toast("Press Ctrl+C to copy"); }
    ta.remove();
  }
  function downloadNode(node) {
    var blob = new Blob([JSON.stringify(node.manifest, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = node.typeId + ".ircnode";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function buildChips() {
    var box = el("chips");
    if (!box) return;
    var cats = ["all"].concat(Object.keys(allNodes.reduce(function (m, n) { m[n.category || "Action"] = 1; return m; }, {})).sort());
    box.innerHTML = cats.map(function (c) {
      return '<button class="chip' + (c === activeCat ? " active" : "") + '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("");
    box.querySelectorAll("[data-cat]").forEach(function (b) {
      b.addEventListener("click", function () {
        activeCat = b.getAttribute("data-cat");
        box.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        render();
      });
    });
  }

  function loadNodes() {
    var grid = el("grid");
    if (!grid) return;
    fetch(INDEX_URL, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        allNodes = (data.nodes || []).sort(function (a, b) { return (a.title || "").localeCompare(b.title || ""); });
        el("state").style.display = "none";
        buildChips();
        var s = el("search");
        if (s) s.addEventListener("input", function () { query = s.value; render(); });
        render();
      })
      .catch(function () {
        el("state").innerHTML = 'Could not load the node list right now. Browse it on <a href="https://github.com/' + NODES + '">GitHub</a>.';
      });
  }

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", function () {
    loadDownloads();
    loadNodes();
  });
})();
