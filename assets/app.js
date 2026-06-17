/* ircuitry site - live download buttons + community node/workflow galleries, all client-side from GitHub. */
(function () {
  "use strict";
  var REPO = "ircuitry/ircuitry";
  var NODES = "ircuitry/community-nodes";
  var WORKFLOWS = "ircuitry/community-workflows";
  var THEMES = "ircuitry/community-themes";
  var NODES_RAW = "https://raw.githubusercontent.com/" + NODES + "/main/";
  var WF_RAW = "https://raw.githubusercontent.com/" + WORKFLOWS + "/main/";
  var THEMES_RAW = "https://raw.githubusercontent.com/" + THEMES + "/main/";
  var NODES_INDEX = NODES_RAW + "index.json";
  var WF_INDEX = WF_RAW + "index.json";
  var THEMES_INDEX = THEMES_RAW + "index.json";
  function rawUrl(base, file) { return base + file.split("/").map(encodeURIComponent).join("/"); }
  function installHref(action, raw) { return "ircuitry://" + action + "?url=" + encodeURIComponent(raw); }
  var RELEASE_API = "https://api.github.com/repos/" + REPO + "/releases/latest";

  // ---------- Phosphor icons (web font; no emoji in the UI) ----------
  function phi(name, cls) { return '<i class="ph ph-' + name + (cls ? " " + cls : "") + '" aria-hidden="true"></i>'; }
  var CAT_ICON = { Event: "lightning", Filter: "funnel", Logic: "git-branch", Data: "hash", Ai: "sparkle",
    Ircv3: "broadcast", Storage: "database", Action: "paper-plane-tilt", Code: "code", AI: "sparkle",
    Games: "game-controller", Moderation: "shield", Community: "users-three", Utility: "wrench", Reminders: "alarm", Testing: "test-tube",
    Cozy: "coffee", Light: "sun", Nature: "leaf", Seasonal: "tree", Dark: "moon", Vibrant: "sparkle", Retro: "television", Minimal: "circle-half", Accessibility: "eye" };
  // name -> glyph char, for drawing node icons inside the SVG graph viewer (where <i> classes can't go)
  var PH_GLYPH = {};
  fetch("assets/phosphor-codepoints.json", { cache: "force-cache" }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j) Object.keys(j).forEach(function (k) { PH_GLYPH[k] = String.fromCharCode(parseInt(j[k], 16)); }); }).catch(function () {});
  function phGlyph(name) { return PH_GLYPH[name] || ""; }

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

  // ---------- app capability detection (loopback probe + dependency-aware buttons) ----------
  // The desktop app serves a read-only loopback endpoint; we probe it ONLY after the user has clicked an
  // install (their cue that they have the app), then tailor each card: 'Upgrade to use this' when their build
  // is missing a node, community-node prerequisites with a confirm, and updates for nodes they already have.
  var BUILTINS_URL = "builtins.json";                                   // same-origin: latest built-in node types
  var CAP_PORTS = [48457, 48458, 48459];                                // app's loopback capability endpoint
  var RELEASES_URL = "https://github.com/ircuitry/ircuitry/releases/latest";
  var CAPS = null;          // {version, builtins:{type:1}, community:{typeId:manifest}} once the app answers
  var LATEST = null;        // {version, builtins:{type:1}} from builtins.json (newest available)
  var NODE_BY_TYPE = {};    // community-node typeId -> gallery index entry (for prerequisites + update diffs)
  var GALLERIES = [];       // gallery render() fns to refresh when detection data arrives
  var PROBING = false;
  var NODETYPES_URL = "nodetypes.json";   // same-origin: built-in node-type pin/category/icon schema (for the viewer)
  var TYPE_INFO = {};       // typeId -> {t:title, c:category, i:icon, g:trigger, in:[[name,kind]], out:[[name,kind]]}

  function deepEq(a, b) {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false; return true; }
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var j = 0; j < ka.length; j++) { if (!Object.prototype.hasOwnProperty.call(b, ka[j]) || !deepEq(a[ka[j]], b[ka[j]])) return false; }
    return true;
  }
  function refreshGalleries() { GALLERIES.forEach(function (f) { try { f(); } catch (e) {} }); renderUpgradePanel(); }
  // fire a custom-scheme (ircuitry://) deep link via a real anchor click - far more reliable across
  // browsers than reassigning window.location.href repeatedly (which can drop all-but-the-first launch)
  function fireDeepLink(href) {
    var a = document.createElement("a"); a.href = href; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(function () { try { document.body.removeChild(a); } catch (e) {} }, 60);
  }

  function setCaps(j) {
    var bi = {}; (j.builtins || []).forEach(function (t) { bi[t] = 1; });
    var cm = {}; (j.community || []).forEach(function (m) { if (m && m.typeId) cm[m.typeId] = m; });
    CAPS = { version: j.version || "", builtins: bi, community: cm };
  }
  function tryAllPorts(i) {
    i = i || 0;
    if (i >= CAP_PORTS.length) return Promise.resolve(null);
    return fetch("http://127.0.0.1:" + CAP_PORTS[i] + "/capabilities", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.app === "ircuitry") ? j : tryAllPorts(i + 1); })
      .catch(function () { return tryAllPorts(i + 1); });
  }
  // probe, retrying a few times so a just-launched app (still binding its port) is still detected
  function probeApp() {
    if (CAPS) return Promise.resolve(CAPS);
    if (PROBING) return Promise.resolve(null);
    PROBING = true;
    var round = 0;
    function attempt() {
      return tryAllPorts().then(function (j) {
        if (j) { setCaps(j); PROBING = false; refreshGalleries(); return CAPS; }
        if (++round >= 4) { PROBING = false; return null; }                 // app not running - leave plain buttons
        return new Promise(function (res) { setTimeout(function () { res(attempt()); }, 1500); });
      });
    }
    return attempt();
  }

  function loadDetectionData() {
    fetch(BUILTINS_URL, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.builtins) { var s = {}; j.builtins.forEach(function (t) { s[t] = 1; }); LATEST = { version: j.version || "", builtins: s }; refreshGalleries(); }
    }).catch(function () {});
    fetch(NODES_INDEX, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.nodes) { j.nodes.forEach(function (n) { NODE_BY_TYPE[n.typeId] = n; }); refreshGalleries(); }
    }).catch(function () {});
    fetch(NODETYPES_URL, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.types) TYPE_INFO = j.types;   // built-in node-type schema for the graph viewer
    }).catch(function () {});
  }

  function reqTypes(item, kind) {
    if (kind === "workflows") return item.nodeTypes || [];
    var m = item.manifest || {}, t = [];                                  // a community NODE needs its subgraph's types
    if (m.subgraph && Array.isArray(m.subgraph.nodes)) m.subgraph.nodes.forEach(function (n) { if (n && n.type) t.push(n.type); });
    return t;
  }
  function statusFor(item, kind) {
    if (!CAPS) return { state: "install" };                               // not probed yet -> plain install
    var missing = reqTypes(item, kind).filter(function (t) { return !CAPS.builtins[t] && !CAPS.community[t]; });
    var upgrade = false, prereqs = [];
    missing.forEach(function (t) {
      if (LATEST && LATEST.builtins[t]) upgrade = true;                    // a built-in the newest app has, theirs lacks
      else if (NODE_BY_TYPE[t]) prereqs.push(NODE_BY_TYPE[t]);             // a community-node prerequisite
      else upgrade = true;                                                 // unknown -> safest to suggest upgrade
    });
    var update = (kind === "nodes" && CAPS.community[item.typeId]) ? !deepEq(CAPS.community[item.typeId], item.manifest) : false;
    if (upgrade) return { state: "upgrade" };
    if (prereqs.length) return { state: "prereq", prereqs: prereqs };
    if (update) return { state: "update" };
    return { state: "install" };
  }

  function actionsHtml(item, i, kind, action, raw) {
    var st = statusFor(item, kind), main;
    if (st.state === "upgrade")
      main = '<a class="btn upgrade" href="' + RELEASES_URL + '" target="_blank" rel="noopener" data-tip="Your ircuitry is missing a node this needs - update to the latest">' + phi("arrow-circle-up") + " Upgrade to use this</a>";
    else if (st.state === "prereq")
      main = '<button class="btn primary prereq" data-prereq="' + i + '" data-kind="' + kind + '" data-tip="Needs community node(s) you don\'t have yet">' + phi("package") + " Install + " + st.prereqs.length + " node" + (st.prereqs.length > 1 ? "s" : "") + "</button>";
    else if (st.state === "update")
      main = '<a class="btn update install-link" href="' + installHref(action, raw) + '" data-tip="Update to the latest version">' + phi("arrows-clockwise") + " Update to latest</a>";
    else
      main = '<a class="btn primary install-link" href="' + installHref(action, raw) + '" data-tip="Hands the file straight to your running ircuitry">' + phi("package") + " One-click install</a>";
    return '<div class="actions">' + main +
      '<button class="btn icon" data-inspect="' + i + '" data-kind="' + kind + '" data-tip="Inspect graph">' + phi("magnifying-glass") + "</button>" +
      '<button class="btn icon" data-copy="' + i + '" data-tip="Copy JSON">' + phi("copy") + "</button>" +
      '<button class="btn icon" data-dl="' + i + '" data-tip="Download ' + (kind === "workflows" ? ".ircbot" : ".ircnode") + '">' + phi("download-simple") + "</button></div>";
  }

  function handlePrereq(item, kind) {
    var st = statusFor(item, kind);
    if (st.state !== "prereq") { probeApp(); return; }
    var names = st.prereqs.map(function (p) { return "  • " + (p.title || p.typeId); }).join("\n");
    var label = item.name || item.title || item.typeId;
    if (!window.confirm('"' + label + '" needs ' + st.prereqs.length + ' community node' + (st.prereqs.length > 1 ? "s" : "") + " you don't have yet:\n\n" + names + "\n\nInstall " + (st.prereqs.length > 1 ? "them" : "it") + " first, then " + label + "? (ircuitry will confirm each one.)")) return;
    var steps = st.prereqs.map(function (p) { return installHref("install-node", rawUrl(NODES_RAW, p.file)); });
    steps.push(kind === "workflows" ? installHref("install-bot", rawUrl(WF_RAW, item.file)) : installHref("install-node", rawUrl(NODES_RAW, item.file)));
    var k = 0;
    (function next() { if (k >= steps.length) { setTimeout(probeApp, 1500); return; } fireDeepLink(steps[k++]); setTimeout(next, 1300); })();
  }

  function renderUpgradePanel() {
    var grid = el("grid"); if (!grid) return;
    var host = el("upgradePanel");
    if (!host) { host = document.createElement("div"); host.id = "upgradePanel"; grid.parentNode.insertBefore(host, grid); }
    if (!CAPS) { host.innerHTML = ""; return; }
    var ups = [];
    Object.keys(CAPS.community).forEach(function (tid) {
      var idx = NODE_BY_TYPE[tid];
      if (idx && idx.manifest && !deepEq(CAPS.community[tid], idx.manifest)) ups.push(idx);
    });
    if (!ups.length) { host.innerHTML = ""; return; }
    host.className = "upgrade-panel";
    host.innerHTML = '<div class="up-head">' + phi("arrows-clockwise") + " " + ups.length + " node update" + (ups.length > 1 ? "s" : "") + " available <span>for community nodes you have installed</span></div>" +
      '<div class="up-list">' + ups.map(function (n) {
        return '<div class="up-item"><span class="up-name">' + safeIcon(n) + " " + esc(n.title || n.typeId) + "</span>" +
          '<a class="btn update" href="' + installHref("install-node", rawUrl(NODES_RAW, n.file)) + '">Update</a></div>';
      }).join("") + "</div>";
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
    if (primaryUrl) html += '<a class="btn primary" href="' + primaryUrl + '">' + phi("download-simple") + "<span>&nbsp;Download for " + esc(OS_LABEL[os]) + "</span>" + (primarySub ? '<span class="sub">' + esc(primarySub) + "</span>" : "") + "</a>";
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

  // ---------- visual graph viewer ("Inspect") ----------
  // Draws the node graph under a community node (manifest.subgraph) or workflow (item.workflow) as an SVG
  // in the app's own cozy style: 196-wide cards, pastel category headers, kind-coloured pins + bezier wires.
  var GV_CAT = { Event: "#56C0D2", Filter: "#F2AE46", Logic: "#B09EE2", Action: "#8CC454", Data: "#F08A9E", Ai: "#C68ED6", Storage: "#74AEE0", Code: "#7C8AD2", Ircv3: "#4EC4B2" };
  var GV_PIN = { Exec: "#7ED6E4", Text: "#F2AE46", User: "#F08A9E", Channel: "#B09EE2", Number: "#8CC454", Bool: "#7EC45C", Tool: "#F08A9E" };
  var GV_IDLE = "#B0A284", GV_PINDEF = "#8C7A5C";
  var GV_W = 196, GV_HEAD = 34, GV_ROW = 24, GV_PAD = 12, GV_RAD = 13, GV_PR = 5.5, GV_GAP = 84;
  function gvCat(c) { return GV_CAT[c] || GV_IDLE; }
  function gvPinCol(k) { return GV_PIN[k] || GV_PINDEF; }
  function gvHx(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? "0" : "") + n.toString(16); }
  function gvMix(a, b, t) {
    var ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
    var br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    return "#" + gvHx(ar + (br - ar) * t) + gvHx(ag + (bg - ag) * t) + gvHx(ab + (bb - ab) * t);
  }
  function gvClip(s, max) { s = String(s == null ? "" : s); return s.length > max ? s.slice(0, max - 1) + "…" : s; }
  // resolve a node type to {title, cat, icon, trig, ins:[{n,k}], outs:[{n,k}]} - built-in schema first, then a community node, else null
  function gvType(type) {
    var b = TYPE_INFO[type];
    if (b) return { title: b.t || type, cat: b.c || "", icon: b.i || "circle", trig: !!b.g,
      ins: (b.in || []).map(function (p) { return { n: p[0], k: p[1] }; }),
      outs: (b.out || []).map(function (p) { return { n: p[0], k: p[1] }; }) };
    var c = NODE_BY_TYPE[type];
    if (c) return { title: c.title || type, cat: c.category || "", icon: c.icon || "puzzle-piece", trig: false,
      ins: (c.inputs || []).map(function (p) { return { n: p.name, k: p.kind }; }),
      outs: (c.outputs || []).map(function (p) { return { n: p.name, k: p.kind }; }) };
    return null;
  }
  // build a layout model from {nodes, connections}; rows account for dynamic pins implied by connection indices
  function gvBuild(graph) {
    var nodes = (graph.nodes || []).map(function (n) {
      return { id: n.id, type: n.type, title: n.title, params: n.params || {}, muted: !!n.muted, x: +n.x || 0, y: +n.y || 0, info: gvType(n.type), cin: {}, cout: {}, maxIn: 0, maxOut: 0 };
    });
    var byId = {}; nodes.forEach(function (n) { byId[n.id] = n; n.maxIn = n.info ? n.info.ins.length : 0; n.maxOut = n.info ? n.info.outs.length : 0; });
    // pins come from untrusted community JSON - coerce to non-negative integers (like x/y above) so a
    // missing/odd pin can never produce a NaN wire coordinate or an "undefined" connectivity key
    var conns = (graph.connections || []).filter(function (c) { return byId[c.from] && byId[c.to]; })
      .map(function (c) { return { from: c.from, to: c.to, fromPin: Math.max(0, Math.floor(+c.fromPin || 0)), toPin: Math.max(0, Math.floor(+c.toPin || 0)) }; });
    conns.forEach(function (c) {
      var f = byId[c.from], t = byId[c.to];
      f.cout[c.fromPin] = 1; t.cin[c.toPin] = 1;
      if (c.fromPin + 1 > f.maxOut) f.maxOut = c.fromPin + 1;
      if (c.toPin + 1 > t.maxIn) t.maxIn = c.toPin + 1;
    });
    nodes.forEach(function (n) { n.rows = Math.max(1, n.maxIn, n.maxOut); n.h = GV_HEAD + n.rows * GV_ROW + GV_PAD; });
    return { nodes: nodes, byId: byId, conns: conns };
  }
  // when nodes carry no real coordinates (all stacked at one point), lay them out left-to-right by flow depth
  function gvAutoLayout(model) {
    var ns = model.nodes, layer = {};
    ns.forEach(function (n) { layer[n.id] = 0; });
    for (var it = 0; it < ns.length; it++) {
      var changed = false;
      model.conns.forEach(function (c) { if (layer[c.to] < layer[c.from] + 1) { layer[c.to] = layer[c.from] + 1; changed = true; } });
      if (!changed) break;
    }
    var cols = {}; ns.forEach(function (n) { (cols[layer[n.id]] = cols[layer[n.id]] || []).push(n); });
    Object.keys(cols).forEach(function (L) { var y = 0; cols[L].forEach(function (n) { n.x = (+L) * (GV_W + GV_GAP); n.y = y; y += n.h + 30; }); });
  }
  function gvLayout(model) {
    var ns = model.nodes; if (!ns.length) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ns.forEach(function (n) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y); });
    if (ns.length > 1 && maxX - minX < 1 && maxY - minY < 1) gvAutoLayout(model);   // all on one spot -> auto
  }
  function gvPinShape(cx, cy, kind, connected) {
    var col = gvPinCol(kind), r = GV_PR, fill = connected ? col : "#EEE5D0";
    if (kind === "Exec") { var s = r * 2; return '<rect x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + s + '" height="' + s + '" rx="' + (r * 0.4) + '" fill="' + fill + '" stroke="' + col + '" stroke-width="1.4"/>'; }
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '" stroke="' + col + '" stroke-width="1.4"/>';
  }
  function gvLabel(x, y, text, anchor) {
    return '<text x="' + x + '" y="' + y + '" dominant-baseline="central" text-anchor="' + anchor + '" font-family="var(--font)" font-size="10.5" fill="#8C7A5C">' + esc(text) + "</text>";
  }
  function gvHeaderPath(w, h, r) { return "M" + r + " 0 H" + (w - r) + " A" + r + " " + r + " 0 0 1 " + w + " " + r + " V" + h + " H0 V" + r + " A" + r + " " + r + " 0 0 1 " + r + " 0 Z"; }
  function gvNodeSvg(n) {
    var info = n.info, accent = gvCat(info ? info.cat : "");
    var body = gvMix("#FCF7EB", accent, 0.05), head = gvMix("#FFFCF4", accent, 0.30);
    var title = n.title || (info && info.title) || n.type, icon = info ? info.icon : "puzzle-piece";
    var g = '<g class="gv-node" data-nid="' + esc(n.id) + '" transform="translate(' + n.x + "," + n.y + ')"' + (n.muted ? ' opacity="0.5"' : "") + ">";
    g += '<rect class="gv-nbody" x="0" y="0" width="' + GV_W + '" height="' + n.h + '" rx="' + GV_RAD + '" fill="' + body + '" stroke="' + (info ? "#C9B690" : "#D8553F") + '" stroke-width="1.5" filter="url(#gvsh)"/>';
    g += '<path d="' + gvHeaderPath(GV_W, GV_HEAD, GV_RAD) + '" fill="' + head + '"/>';
    g += '<line x1="2" y1="' + GV_HEAD + '" x2="' + (GV_W - 2) + '" y2="' + GV_HEAD + '" stroke="' + accent + '" stroke-opacity="0.55" stroke-width="1.5"/>';
    g += '<text x="11" y="' + (GV_HEAD / 2 + 1) + '" dominant-baseline="central" font-family="Phosphor" font-size="16">' + esc(phGlyph(icon)) + "</text>";
    g += '<text x="34" y="' + (GV_HEAD / 2 + 1) + '" dominant-baseline="central" font-family="var(--font-head)" font-size="13.5" font-weight="700" fill="#564630">' + esc(gvClip(title, 17)) + "</text>";
    for (var i = 0; i < n.rows; i++) {
      var cy = GV_HEAD + GV_ROW * (i + 0.5);
      if (i < n.maxIn) { var ip = info && info.ins[i] ? info.ins[i] : { n: "", k: "Exec" }; g += gvPinShape(0, cy, ip.k, !!n.cin[i]); if (ip.n) g += gvLabel(11, cy, gvClip(ip.n, 11), "start"); }
      if (i < n.maxOut) { var op = info && info.outs[i] ? info.outs[i] : { n: "", k: "Exec" }; g += gvPinShape(GV_W, cy, op.k, !!n.cout[i]); if (op.n) g += gvLabel(GV_W - 11, cy, gvClip(op.n, 11), "end"); }
    }
    return g + "</g>";
  }
  function gvSvg(model) {
    var ns = model.nodes, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ns.forEach(function (n) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + GV_W); maxY = Math.max(maxY, n.y + n.h); });
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = GV_W; maxY = GV_HEAD; }
    var pad = 56; minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    var W = maxX - minX, H = maxY - minY;
    var wires = model.conns.map(function (c) {
      var f = model.byId[c.from], t = model.byId[c.to];
      var ax = f.x + GV_W, ay = f.y + GV_HEAD + GV_ROW * (c.fromPin + 0.5);
      var bx = t.x, by = t.y + GV_HEAD + GV_ROW * (c.toPin + 0.5);
      var col = f.info && f.info.outs[c.fromPin] ? gvPinCol(f.info.outs[c.fromPin].k) : "#7ED6E4";
      var dx = Math.max(40, Math.abs(bx - ax) * 0.5), dim = f.muted || t.muted ? ' opacity="0.3"' : "";
      return '<path d="M' + ax + " " + ay + " C" + (ax + dx) + " " + ay + " " + (bx - dx) + " " + by + " " + bx + " " + by + '" fill="none" stroke="' + col + '" stroke-width="2.4" stroke-linecap="round"' + dim + "/>" +
        '<circle cx="' + ax + '" cy="' + ay + '" r="2.6" fill="' + col + '"' + dim + "/><circle cx=\"" + bx + '" cy="' + by + '" r="2.6" fill="' + col + '"' + dim + "/>";
    }).join("");
    return '<svg class="gv-svg" xmlns="http://www.w3.org/2000/svg" viewBox="' + minX + " " + minY + " " + W + " " + H + '" preserveAspectRatio="xMidYMid meet">' +
      '<defs><filter id="gvsh" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="3" flood-color="#000000" flood-opacity="0.13"/></filter>' +
      '<pattern id="gvgrid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#DCE7C6" stroke-width="1"/></pattern></defs>' +
      '<rect x="' + minX + '" y="' + minY + '" width="' + W + '" height="' + H + '" fill="#E9F2D8"/>' +
      '<rect x="' + minX + '" y="' + minY + '" width="' + W + '" height="' + H + '" fill="url(#gvgrid)"/>' +
      '<g>' + wires + "</g><g>" + ns.map(gvNodeSvg).join("") + "</g></svg>";
  }
  function gvLegendHtml(model) {
    var kinds = {}; model.nodes.forEach(function (n) {
      if (!n.info) return;
      n.info.ins.concat(n.info.outs).forEach(function (p) { if (p.k) kinds[p.k] = 1; });
    });
    return Object.keys(kinds).map(function (k) { return '<span class="gv-leg"><i style="background:' + gvPinCol(k) + '"></i>' + esc(k) + "</span>"; }).join("");
  }
  var GV_ESC_HANDLER = null;
  function gvEnsureModal() {
    var m = el("gview"); if (m) return m;
    m = document.createElement("div"); m.className = "gv-backdrop"; m.id = "gview"; m.hidden = true;
    m.innerHTML = '<div class="gv-modal" role="dialog" aria-modal="true" aria-label="Node graph preview">' +
      '<div class="gv-head"><div class="gv-title"></div><button class="btn ghost gv-close icon" type="button" aria-label="Close">' + phi("x") + "</button></div>" +
      '<div class="gv-body"><div class="gv-stage"></div><div class="gv-detail"></div></div>' +
      '<div class="gv-foot"><span class="gv-hint">click a node for details · drag to pan · scroll to zoom · this is exactly what installs</span><span class="gv-legend"></span></div></div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e) { if (e.target === m) gvHide(); });
    m.querySelector(".gv-close").addEventListener("click", gvHide);
    return m;
  }
  function gvHide() {
    var m = el("gview"); if (!m) return;
    m.classList.remove("show");
    if (GV_ESC_HANDLER) { document.removeEventListener("keydown", GV_ESC_HANDLER); GV_ESC_HANDLER = null; }
    document.body.style.overflow = "";
    setTimeout(function () { if (!m.classList.contains("show")) m.hidden = true; }, 200);
  }
  function openInspect(item, kind) {
    var graph, title, sub;
    if (kind === "workflows" || (item && item.workflow)) { graph = item.workflow; title = item.name || "Workflow"; sub = (item.nodeCount != null ? item.nodeCount + " nodes · " + item.connectionCount + " wires" : "workflow"); }
    else { graph = item && item.manifest && item.manifest.subgraph; title = (item && (item.title || item.typeId)) || "Node"; sub = "node graph"; }
    var m = gvEnsureModal();
    m.querySelector(".gv-title").innerHTML = esc(title) + ' <span class="gv-sub">' + esc(sub) + "</span>";
    var stage = m.querySelector(".gv-stage"), detail = m.querySelector(".gv-detail");
    detail.classList.remove("show"); detail.innerHTML = "";
    if (!graph || !graph.nodes || !graph.nodes.length) {
      // a single code/leaf node with no sub-graph: show the node itself (its own pins) plus a note
      if (item && item.typeId && (TYPE_INFO[item.typeId] || NODE_BY_TYPE[item.typeId])) graph = { nodes: [{ id: "self", type: item.typeId, title: item.title || item.typeId, x: 0, y: 0 }], connections: [] };
      else { stage.innerHTML = '<div class="gv-empty">This item has no sub-graph to preview.</div>'; m.querySelector(".gv-legend").innerHTML = ""; gvOpen(m); return; }
    }
    var model = gvBuild(graph); gvLayout(model);
    stage.innerHTML = gvSvg(model);
    m.querySelector(".gv-legend").innerHTML = gvLegendHtml(model);
    var svg = stage.querySelector("svg");
    gvPanZoom(svg);
    gvWireSelect(svg, stage, detail, model);
    gvOpen(m);
  }
  // click a node -> highlight it and show its type, pins and configured params (like the app inspector)
  function gvWireSelect(svg, stage, detail, model) {
    svg.addEventListener("click", function (e) {
      if (svg.__dragged) return;                                  // ignore the click that ends a pan-drag
      var g = e.target.closest ? e.target.closest("[data-nid]") : null;
      stage.querySelectorAll(".gv-node.sel").forEach(function (n) { n.classList.remove("sel"); });
      if (!g) { detail.classList.remove("show"); return; }        // clicked empty space -> deselect
      g.classList.add("sel");
      detail.innerHTML = gvDetailHtml(model.byId[g.getAttribute("data-nid")]);
      detail.classList.add("show");
      var c = detail.querySelector(".gv-dclose");
      if (c) c.addEventListener("click", function () { detail.classList.remove("show"); g.classList.remove("sel"); });
    });
  }
  function gvDetailHtml(node) {
    if (!node) return "";
    var info = node.info, accent = gvCat(info ? info.cat : ""), name = node.title || (info && info.title) || node.type;
    var icon = info ? info.icon : "puzzle-piece", desc = (NODE_BY_TYPE[node.type] && NODE_BY_TYPE[node.type].description) || "";
    function pins(list) {
      if (!list || !list.length) return '<div class="gv-d-empty">none</div>';
      return list.map(function (p) { return '<div class="gv-d-pin"><i style="background:' + gvPinCol(p.k) + '"></i><span class="gv-d-pn">' + esc(p.n || "(exec)") + '</span><span class="gv-d-pk">' + esc(p.k) + "</span></div>"; }).join("");
    }
    var keys = Object.keys(node.params || {});
    var params = keys.length ? keys.map(function (k) {
      var v = node.params[k]; if (v && typeof v === "object") v = JSON.stringify(v);
      v = String(v == null ? "" : v); if (v.length > 140) v = v.slice(0, 139) + "…";
      return '<div class="gv-d-row"><span class="gv-d-k">' + esc(k) + '</span><span class="gv-d-v">' + (v === "" ? "—" : esc(v)) + "</span></div>";
    }).join("") : '<div class="gv-d-empty">no parameters set</div>';
    return '<button class="gv-dclose" type="button" aria-label="Close details">' + phi("x") + "</button>" +
      '<div class="gv-d-head"><span class="gv-d-ic" style="background:' + gvMix("#ffffff", accent, 0.22) + '">' + phi(icon) + "</span>" +
      '<div><div class="gv-d-name">' + esc(name) + '</div><div class="gv-d-type" style="color:' + accent + '">' + esc(node.type) + (info && info.trig ? " · trigger" : "") + "</div></div></div>" +
      (desc ? '<div class="gv-d-desc">' + esc(desc) + "</div>" : "") +
      '<div class="gv-d-sec">Inputs</div>' + pins(info ? info.ins : []) +
      '<div class="gv-d-sec">Outputs</div>' + pins(info ? info.outs : []) +
      '<div class="gv-d-sec">Parameters</div>' + params;
  }
  function gvOpen(m) {
    m.hidden = false; document.body.style.overflow = "hidden";
    requestAnimationFrame(function () { m.classList.add("show"); });
    GV_ESC_HANDLER = function (e) { if (e.key === "Escape") gvHide(); };
    document.addEventListener("keydown", GV_ESC_HANDLER);
  }
  function gvPanZoom(svg) {
    if (!svg) return;
    var vb = svg.getAttribute("viewBox").split(/\s+/).map(Number), st = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
    function apply() { svg.setAttribute("viewBox", st.x + " " + st.y + " " + st.w + " " + st.h); }
    svg.addEventListener("mousedown", function (e) {
      e.preventDefault(); svg.style.cursor = "grabbing"; svg.__dragged = false;
      var sx = e.clientX, sy = e.clientY, ox = st.x, oy = st.y, r = svg.getBoundingClientRect();
      function mv(ev) {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) svg.__dragged = true;
        st.x = ox - (ev.clientX - sx) * (st.w / r.width); st.y = oy - (ev.clientY - sy) * (st.h / r.height); apply();
      }
      function up() { svg.style.cursor = ""; document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); }
      document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
    });
    svg.addEventListener("wheel", function (e) {
      e.preventDefault(); var r = svg.getBoundingClientRect();
      var fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height, f = e.deltaY < 0 ? 0.86 : 1.16;
      var nw = Math.max(140, Math.min(9000, st.w * f)), nh = Math.max(140, Math.min(9000, st.h * f));
      st.x += (st.w - nw) * fx; st.y += (st.h - nh) * fy; st.w = nw; st.h = nh; apply();
    }, { passive: false });
  }

  // ---------- bot merge (the old Bot Factory, folded into the workflows gallery) ----------
  var WF_ITEMS = [];        // the loaded workflow index entries (set by the workflows gallery)
  var MSEL = [];            // indices into WF_ITEMS the user has picked to merge
  var MCONFLICTS = [], MERGED = null;
  var MAX_CHIPS = 5;        // the Merging tray caps shown bots at 5 (+N more)

  function mIsCommand(n) { return n.type === "event.command"; }
  function mIsTrigger(n) { return (n.type || "").indexOf("event.") === 0; }
  function mCmdKey(n) { var p = (n.params && n.params.prefix) || ""; var c = ((n.params && n.params.command) || "").trim(); return (p + c).toLowerCase(); }
  function mBotOf(w) { return (w && w.workflow) || { nodes: [], connections: [] }; }
  function mName(i) { return WF_ITEMS[i] ? WF_ITEMS[i].name : "bot"; }
  function mFirstSentence(s) { s = String(s == null ? "" : s).trim(); var m = s.split(/(?<=\.)\s/)[0] || s; return m.length > 80 ? m.slice(0, 79) + "…" : m; }

  function mDetect(bots) {
    var map = {};
    bots.forEach(function (b, bi) {
      (b.nodes || []).filter(mIsCommand).forEach(function (n) {
        var cmd = ((n.params && n.params.command) || "").trim(); if (!cmd) return;
        var k = mCmdKey(n); (map[k] = map[k] || { prefix: (n.params && n.params.prefix) || "", command: cmd, bots: [], resolution: "rename", keepBot: bi });
        if (map[k].bots.indexOf(bi) < 0) map[k].bots.push(bi);
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; }).filter(function (c) { return c.bots.length > 1; })
      .sort(function (a, b) { return (a.prefix + a.command).localeCompare(b.prefix + b.command); });
  }
  function mPrune(nodes, conns) {
    if (!nodes.some(mIsTrigger)) return { nodes: nodes, conns: conns };
    var adj = {}; nodes.forEach(function (n) { adj[n.id] = []; });
    conns.forEach(function (c) { if (adj[c.from] && adj[c.to]) { adj[c.from].push(c.to); adj[c.to].push(c.from); } });
    var live = {}, stack = [];
    nodes.forEach(function (n) { if (mIsTrigger(n) && !live[n.id]) { live[n.id] = 1; stack.push(n.id); } });
    while (stack.length) { var id = stack.pop(); adj[id].forEach(function (nb) { if (!live[nb]) { live[nb] = 1; stack.push(nb); } }); }
    return { nodes: nodes.filter(function (n) { return live[n.id]; }), conns: conns.filter(function (c) { return live[c.from] && live[c.to]; }) };
  }
  function mMerge(bots, conflicts, genHelp, botMeta) {
    var nodes = [], conns = [], botTrig = [], uid = 0;
    bots.forEach(function (b, bi) {
      var idmap = {}, off = bi * 680;
      (b.nodes || []).forEach(function (n) {
        var nid = "m" + (uid++) + "x" + bi;
        idmap[n.id] = nid;
        nodes.push({ id: nid, type: n.type, x: (n.x || 0), y: (n.y || 0) + off, muted: !!n.muted, title: n.title || "", params: Object.assign({}, n.params || {}), __bi: bi });
      });
      (b.connections || []).forEach(function (c) { if (idmap[c.from] && idmap[c.to]) conns.push({ from: idmap[c.from], fromPin: c.fromPin, to: idmap[c.to], toPin: c.toPin }); });
      var trg = {}; (b.nodes || []).filter(mIsCommand).forEach(function (n) { var cmd = ((n.params && n.params.command) || "").trim(); if (cmd) trg[mCmdKey(n)] = idmap[n.id]; });
      botTrig.push(trg);
    });
    function byId(id) { return nodes.filter(function (n) { return n.id === id; })[0]; }
    function removeNode(id) { nodes = nodes.filter(function (n) { return n.id !== id; }); conns = conns.filter(function (c) { return c.from !== id && c.to !== id; }); }
    conflicts.forEach(function (c) {
      var key = (c.prefix + c.command).toLowerCase();
      var trigs = c.bots.filter(function (b) { return botTrig[b] && botTrig[b][key]; }).map(function (b) { return { bot: b, id: botTrig[b][key] }; });
      if (trigs.length < 2 || c.resolution === "runAll") return;
      if (c.resolution === "keep") trigs.forEach(function (t) { if (t.bot !== c.keepBot) removeNode(t.id); });
      else if (c.resolution === "rename") { var n = 2; trigs.slice().sort(function (a, b) { return a.bot - b.bot; }).forEach(function (t, i) { if (i === 0) return; var nn = byId(t.id); if (nn) nn.params.command = c.command + (n++); }); }
      else if (c.resolution === "combine") {
        var keeper = trigs.slice().sort(function (a, b) { return a.bot - b.bot; })[0].id;
        trigs.forEach(function (t) { if (t.id === keeper) return; conns.forEach(function (w) { if (w.from === t.id) w.from = keeper; }); removeNode(t.id); });
      }
    });
    var pr = mPrune(nodes, conns); nodes = pr.nodes; conns = pr.conns;

    if (genHelp) {
      // drop any existing !help, then bundle ONE that lists every merged command
      nodes.filter(function (n) { return mIsCommand(n) && ((n.params.command || "").trim().toLowerCase() === "help"); })
        .map(function (n) { return n.id; }).forEach(removeNode);
      var seen = {}, parts = [];
      nodes.filter(mIsCommand).forEach(function (n) {
        var c = (n.params.command || "").trim(); if (!c) return;
        var full = ((n.params.prefix || "!") + c); if (seen[full]) return; seen[full] = 1;
        var m = botMeta[n.__bi] || {};
        parts.push(full + (m.desc ? " - " + mFirstSentence(m.desc) : (m.name ? " (" + m.name + ")" : "")));
      });
      var helpMsg = parts.length ? "Commands: " + parts.join("  |  ") : "This bot has no commands yet.";
      var hc = "mhelpc", hr = "mhelpr";
      nodes.push({ id: hc, type: "event.command", x: -360, y: -260, muted: false, title: "!help", params: { prefix: "!", command: "help", contexts: "public, private, pm" } });
      nodes.push({ id: hr, type: "action.reply", x: -40, y: -260, muted: false, title: "help", params: { message: helpMsg } });
      conns.push({ from: hc, fromPin: 0, to: hr, toPin: 0 });
      var pr2 = mPrune(nodes, conns); nodes = pr2.nodes; conns = pr2.conns;
    }
    nodes.forEach(function (n) { delete n.__bi; });
    return { format: "ircuitry.workflow.v1", name: "", nodes: nodes, connections: conns };
  }

  function mEnsureUi() {
    if (el("mtray")) return;
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="mtray" id="mtray"><div class="mtray-in"><strong>Merging</strong>' +
      '<div class="mtray-chips" id="mtrayChips"></div>' +
      '<button class="btn" id="mtrayClear" type="button">Clear</button>' +
      '<button class="btn primary" id="mtrayMerge" type="button" disabled>' + phi("cake") + ' Merge</button></div></div>' +
      '<div class="scrim" id="mwiz"><div class="wizard"><h2>' + phi("cake") + ' Bake a merged bot</h2>' +
      '<p class="section-sub" style="text-align:left;margin:0 0 6px;">Resolve any command clashes, name it, then bake.</p>' +
      '<div id="mclashes"></div><label class="lbl">New bot name</label><input class="field" id="mname" placeholder="Merged Bot">' +
      '<label class="mhelp"><input type="checkbox" id="mhelpchk" checked><span><span class="t">Auto-generate a combined !help</span><br>' +
      '<span class="s">Bundles one !help that lists every command from the merged bots</span></span></label>' +
      '<div class="row-end"><button class="btn" id="mcancel" type="button">Cancel</button>' +
      '<button class="btn primary" id="mbake" type="button">' + phi("cake") + ' Bake!</button></div></div></div>' +
      '<div class="bakefx" id="bakefx"></div>';
    document.body.appendChild(wrap);
    el("mtrayClear").addEventListener("click", mClear);
    el("mtrayMerge").addEventListener("click", mOpenWizard);
    el("mcancel").addEventListener("click", function () { el("mwiz").classList.remove("show"); });
    el("mbake").addEventListener("click", mBake);
    el("mwiz").addEventListener("click", function (e) { if (e.target === el("mwiz")) el("mwiz").classList.remove("show"); });
  }
  function mStageHtml() {
    return '<div class="stage">' +
      '<div class="oven"><div class="strip"><i style="left:14px"></i><i style="left:40px"></i><i style="left:66px"></i></div><div class="win"></div></div>' +
      '<div class="orbit"><div class="clockfx"><div class="hand h"></div><div class="hand m"></div></div></div>' +
      '<div class="ripburst"></div><div class="ripglint"></div>' +
      '<div class="ripring a"></div><div class="ripring b"></div><div class="ripring c"></div><div class="ripring d"></div>' +
      '<img class="bakebot" src="assets/icon-256.png" alt="">' +
      '<div class="cap" id="bakeCap">Baking your bot…</div>' +
      '<div class="barfx"><i></i></div>' +
      '<div class="bakeresult" id="bakeResult">' +
        '<div class="bakeactions" id="bakeActions"></div>' +
        '<div class="baketitle" id="bakeTitle"></div>' +
        '<div class="bakedone" id="bakeDone"></div>' +
      '</div></div>';
  }
  function mToggle(i) {
    var k = MSEL.indexOf(i);
    if (k >= 0) MSEL.splice(k, 1); else MSEL.push(i);
    refreshGalleries(); mRenderTray();
  }
  function mClear() { MSEL = []; refreshGalleries(); mRenderTray(); }
  function mRenderTray() {
    mEnsureUi();
    var tray = el("mtray"); tray.classList.toggle("show", MSEL.length > 0);
    var shown = MSEL.slice(0, MAX_CHIPS).map(function (i) { return '<span class="mtray-chip">' + esc(mName(i)) + "</span>"; });
    if (MSEL.length > MAX_CHIPS) shown.push('<span class="mtray-chip more">+' + (MSEL.length - MAX_CHIPS) + " more</span>");
    el("mtrayChips").innerHTML = shown.join("");
    var btn = el("mtrayMerge"); btn.disabled = MSEL.length < 2;
    btn.innerHTML = phi("cake") + (MSEL.length < 2 ? " Pick 2+ to merge" : " Merge " + MSEL.length + " bots");
  }
  function mOpenWizard() {
    if (MSEL.length < 2) return;
    var bots = MSEL.map(function (i) { return mBotOf(WF_ITEMS[i]); });
    MCONFLICTS = mDetect(bots);
    el("mname").value = MSEL.slice(0, 3).map(mName).join(" + ") + (MSEL.length > 3 ? " +" : "");
    el("mclashes").innerHTML = MCONFLICTS.length === 0
      ? '<div class="clash" style="background:#eef9ed;border-color:#cfead0;">' + phi("check") + " No command clashes - these bots merge cleanly.</div>"
      : MCONFLICTS.map(function (c, ci) {
        var who = c.bots.map(function (b) { return esc(mName(MSEL[b])); }).join(", ");
        var opts = c.bots.map(function (b) { return '<button class="opt" data-c="' + ci + '" data-r="keep" data-b="' + b + '">keep ' + esc(mName(MSEL[b])) + "</button>"; }).join("");
        opts += '<button class="opt" data-c="' + ci + '" data-r="runAll">run both</button><button class="opt" data-c="' + ci + '" data-r="rename">keep both</button><button class="opt" data-c="' + ci + '" data-r="combine">combine</button>';
        return '<div class="clash"><span class="cmd">' + esc((c.prefix || "") + c.command) + '</span> <span style="color:#9b8c70;font-size:13px;">in ' + who + '</span><div class="opts" id="mopts' + ci + '">' + opts + "</div></div>";
      }).join("");
    mSyncOpts();
    el("mclashes").querySelectorAll(".opt").forEach(function (o) {
      o.addEventListener("click", function () {
        var c = MCONFLICTS[+o.getAttribute("data-c")]; c.resolution = o.getAttribute("data-r");
        if (c.resolution === "keep") c.keepBot = +o.getAttribute("data-b"); mSyncOpts();
      });
    });
    el("mwiz").classList.add("show");
  }
  function mSyncOpts() {
    MCONFLICTS.forEach(function (c, ci) {
      var box = el("mopts" + ci); if (!box) return;
      box.querySelectorAll(".opt").forEach(function (o) {
        var r = o.getAttribute("data-r");
        o.classList.toggle("on", r === c.resolution && (r !== "keep" || +o.getAttribute("data-b") === c.keepBot));
      });
    });
  }
  function mInstallHref() {
    try {
      var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(MERGED))));
      var href = "ircuitry://install-bot?data=" + encodeURIComponent(b64);
      return href.length > 8000 ? null : href;   // too big for a safe deep link - fall back to Copy/Download
    } catch (e) { return null; }
  }
  function mBake() {
    var bots = MSEL.map(function (i) { return mBotOf(WF_ITEMS[i]); });
    var botMeta = MSEL.map(function (i) { return { name: WF_ITEMS[i].name, desc: WF_ITEMS[i].description }; });
    var genHelp = el("mhelpchk").checked;
    MERGED = mMerge(bots, MCONFLICTS, genHelp, botMeta);
    MERGED.name = (el("mname").value || "Merged Bot").trim() || "Merged Bot";
    el("mwiz").classList.remove("show");
    var fx = el("bakefx"); fx.classList.remove("done"); fx.innerHTML = mStageHtml(); fx.classList.add("show");   // fresh markup restarts the animation
    setTimeout(function () {
      var json = JSON.stringify(MERGED, null, 2), safe = MERGED.name.replace(/[^a-zA-Z0-9 ._-]/g, "") || "merged-bot";
      var href = mInstallHref();
      var install = href
        ? '<a class="btn primary install-link" href="' + href + '" data-tip="Hands the merged bot straight to your running ircuitry">' + phi("package") + " One-click install</a>"
        : '<button class="btn primary" data-tip="Too big to one-click - use Copy or Download" disabled>' + phi("package") + " One-click install</button>";
      el("bakeActions").innerHTML = install +
        '<button class="btn icon" id="bakeCopy" data-tip="Copy JSON">' + phi("copy") + "</button>" +
        '<button class="btn icon" id="bakeDl" data-tip="Download .ircbot">' + phi("download-simple") + "</button>";
      el("bakeTitle").textContent = MERGED.name + " is ready!";
      el("bakeDone").innerHTML = '<span style="color:#7a6a52;font-size:13.5px;">' + esc(MERGED.name) + " · " + MERGED.nodes.length + " nodes · " + MERGED.connections.length + ' wires</span><br><a id="bakeClose">Done</a>';
      fx.classList.add("done"); el("bakeResult").classList.add("show");   // hides the baking caption/bar, reveals buttons -> title -> subtitle
      var inst = el("bakeActions").querySelector(".install-link"); if (inst) inst.addEventListener("click", function () { setTimeout(probeApp, 1500); });
      el("bakeCopy").addEventListener("click", function () { copyText(json, "Copied - press Ctrl+V in ircuitry"); });
      el("bakeDl").addEventListener("click", function () { downloadFile(json, safe + ".ircbot"); });
      el("bakeClose").addEventListener("click", function () { fx.classList.remove("show"); mClear(); });
    }, 2900);
  }

  // ---------- generic gallery ----------
  function safeIcon(it) {
    if (it.iconImage && /^[A-Za-z0-9+/=\s]+$/.test(it.iconImage)) return '<img alt="" src="data:image/png;base64,' + it.iconImage.replace(/\s+/g, "") + '">';
    return phi(it.icon || "puzzle-piece");
  }
  function nodeCard(n, i) {
    var lang = n.language === "subgraph" ? "subflow" : (n.language || "python");
    var author = "by " + esc(n.author || "community");
    return '<div class="node"><div class="top"><div class="badge">' + safeIcon(n) + '</div><div>' +
      '<div class="name">' + esc(n.title || n.typeId) + '</div><div class="meta">' + esc(n.typeId) + " · " + author + "</div></div></div>" +
      '<div class="desc">' + esc(n.description || "") + "</div>" +
      '<div class="cat"><span class="lang-tag">' + esc(lang) + "</span></div>" +
      actionsHtml(n, i, "nodes", "install-node", rawUrl(NODES_RAW, n.file)) + "</div>";
  }
  function workflowCard(w, i) {
    var author = "by " + esc(w.author || "community");
    var tags = (w.tags || []).slice(0, 3).map(function (t) { return '<span class="lang-tag">' + esc(t) + "</span>"; }).join(" ");
    var sel = MSEL.indexOf(i) >= 0;
    return '<div class="node' + (sel ? " msel" : "") + '">' +
      '<button class="mpick" data-mpick="' + i + '" data-tip="Pick to merge" type="button">' + phi("check") + "</button>" +
      '<div class="top"><div class="badge">' + phi("robot") + '</div><div>' +
      '<div class="name">' + esc(w.name) + '</div><div class="meta">' + esc(w.nodeCount) + " nodes · " + esc(w.connectionCount) + " wires · " + author + "</div></div></div>" +
      '<div class="desc">' + esc(w.description || "") + "</div>" +
      '<div class="cat">' + tags + "</div>" +
      actionsHtml(w, i, "workflows", "install-bot", rawUrl(WF_RAW, w.file)) + "</div>";
  }

  // themes install with a single action (preview-in-app, then keep/revert); no capability detection needed
  function themeActions(t, i, raw) {
    return '<div class="actions">' +
      '<a class="btn primary install-link" href="' + installHref("install-theme", raw) + '" data-tip="Preview it live in ircuitry, then keep or revert">' + phi("package") + " One-click install</a>" +
      '<button class="btn icon" data-copy="' + i + '" data-tip="Copy JSON">' + phi("copy") + "</button>" +
      '<button class="btn icon" data-dl="' + i + '" data-tip="Download .irctheme">' + phi("download-simple") + "</button></div>";
  }
  function themeCard(t, i) {
    var author = "by " + esc(t.author || "community");
    var sw = (t.preview || []).map(function (c) { return '<span class="sw" style="background:' + esc(c) + '"></span>'; }).join("");
    var tags = (t.tags || []).slice(0, 3).map(function (x) { return '<span class="lang-tag">' + esc(x) + "</span>"; }).join(" ");
    return '<div class="node theme' + (t.dark ? " dark" : "") + '">' +
      '<div class="swatches">' + sw + "</div>" +
      '<div class="top"><div class="badge">' + phi("palette") + '</div><div>' +
      '<div class="name">' + esc(t.name) + '</div><div class="meta">' + esc(t.category) + (t.dark ? " · dark" : "") + " · " + author + "</div></div></div>" +
      '<div class="desc">' + esc(t.description || "") + "</div>" +
      '<div class="cat">' + tags + "</div>" +
      themeActions(t, i, rawUrl(THEMES_RAW, t.file)) + "</div>";
  }

  function startGallery(opts) {
    var grid = el("grid"), rail = el("chips");
    if (!grid) return;
    var all = [], query = "", io = null;

    function primary(it) { var fs = opts.facets(it); return (fs && fs[0]) || "Other"; }
    function catRank(c) { var i = (opts.order || []).indexOf(c); return i < 0 ? 99 : i; }
    function secId(c) { return "cat-" + c.replace(/[^A-Za-z0-9]+/g, "-"); }
    function icon(c) { return phi(CAT_ICON[c] || "package"); }   // Phosphor icon per category
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
          '<div class="section-head"><div class="ic">' + icon(c) + '</div>' +
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
      // the moment the user installs anything, probe their app and re-tailor every card
      grid.querySelectorAll(".install-link").forEach(function (a) { a.addEventListener("click", function () { probeApp(); }); });
      grid.querySelectorAll("[data-prereq]").forEach(function (btn) {
        btn.addEventListener("click", function () { handlePrereq(all[+btn.getAttribute("data-prereq")], btn.getAttribute("data-kind")); });
      });
      grid.querySelectorAll("[data-inspect]").forEach(function (btn) {
        btn.addEventListener("click", function () { openInspect(all[+btn.getAttribute("data-inspect")], btn.getAttribute("data-kind")); });
      });
      grid.querySelectorAll("[data-mpick]").forEach(function (btn) {   // pick a workflow to merge (workflows gallery only)
        btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); mToggle(+btn.getAttribute("data-mpick")); });
      });
      buildRail(b, cats);
      observe();
    }
    GALLERIES.push(render);   // let detection-data arrival re-render this gallery

    function buildRail(b, cats) {
      if (!rail) return;
      rail.innerHTML = cats.map(function (c) {
        return '<button class="chip" data-cat="' + esc(secId(c)) + '"><span class="ic">' + icon(c) + "</span>" + esc(c) + '<span class="n">' + b[c].length + "</span></button>";
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
      if (document.body.getAttribute("data-gallery") === "workflows") { WF_ITEMS = all; mEnsureUi(); mRenderTray(); }
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
    if (gallery === "nodes" || gallery === "workflows") loadDetectionData();
    if (gallery === "nodes") {
      startGallery({
        url: NODES_INDEX, repo: NODES, listKey: "nodes", noun: "nodes",
        order: ["Event", "Filter", "Logic", "Data", "Ai", "Ircv3", "Storage", "Action"],
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
        order: ["Testing", "AI", "Games", "Moderation", "Community", "Utility", "Reminders"],
        blurbs: { Testing: "Drive one command to verify an IRCv3 feature", AI: "Bots powered by language models", Games: "Play right in your channel", Moderation: "Keep the channel tidy", Community: "Social and onboarding helpers", Utility: "Look things up and fetch data", Reminders: "Timed and scheduled posts" },
        facets: function (w) { return [w.category || "Utility"]; },
        haystack: function (w) { return w.name + " " + w.description + " " + (w.category || "") + " " + (w.tags || []).join(" ") + " " + (w.nodeTypes || []).join(" "); },
        sortKey: function (w) { return w.name || ""; },
        card: workflowCard,
        copyData: function (w) { return JSON.stringify(w.workflow, null, 2); },
        copyMsg: function (w) { return "Copied " + w.name + " · press Ctrl+V in ircuitry"; },
        dlName: function (w) { return w.name.replace(/[^a-zA-Z0-9 ._-]/g, "") + ".ircbot"; }
      });
    } else if (gallery === "themes") {
      startGallery({
        url: THEMES_INDEX, repo: THEMES, listKey: "themes", noun: "themes",
        order: ["Cozy", "Light", "Nature", "Seasonal", "Vibrant", "Retro", "Minimal", "Dark", "Accessibility"],
        blurbs: { Cozy: "Warm and soft, the house style", Light: "Bright and airy", Nature: "Greens, waters and earth", Seasonal: "A mood for the time of year", Vibrant: "Bold and saturated", Retro: "Throwback palettes", Minimal: "Quiet and low-contrast", Dark: "Easy on the eyes at night", Accessibility: "High-contrast and colour-blind-friendly" },
        facets: function (t) { return [t.category || "Cozy"]; },
        haystack: function (t) { return t.name + " " + t.description + " " + (t.category || "") + " " + (t.tags || []).join(" "); },
        sortKey: function (t) { return t.name || ""; },
        card: themeCard,
        copyData: function (t) { return JSON.stringify(t.theme, null, 2); },
        copyMsg: function (t) { return "Copied " + t.name + " · paste into ircuitry Appearance"; },
        dlName: function (t) { return t.name.replace(/[^a-zA-Z0-9 ._-]/g, "") + ".irctheme"; }
      });
    }
  });
})();
