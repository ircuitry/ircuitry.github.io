/* ircuitry Bot Factory - pick community bots, merge them client-side (a port of the app's BotMerge),
   resolve command clashes, bake with a cute animation, then download/copy the result. */
(function () {
  "use strict";
  var WORKFLOWS = "ircuitry/community-workflows";
  var WF_INDEX = "https://raw.githubusercontent.com/" + WORKFLOWS + "/main/index.json";

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function toast(msg) { var t = el("toast"); if (!t) return; t.textContent = msg; t.classList.add("show"); setTimeout(function () { t.classList.remove("show"); }, 2200); }

  // ---------------- merge logic (mirrors BotMerge.cs) ----------------
  function isCommand(n) { return n.type === "event.command"; }
  function isTrigger(n) { return (n.type || "").indexOf("event.") === 0; }
  function cmdKey(n) { var p = (n.params && n.params.prefix) || ""; var c = ((n.params && n.params.command) || "").trim(); return (p + c).toLowerCase(); }

  function detect(bots) {
    var map = {};
    bots.forEach(function (b, bi) {
      (b.nodes || []).filter(isCommand).forEach(function (n) {
        var cmd = ((n.params && n.params.command) || "").trim(); if (!cmd) return;
        var key = cmdKey(n);
        if (!map[key]) map[key] = { prefix: (n.params && n.params.prefix) || "", command: cmd, bots: [], resolution: "runAll", keepBot: 0 };
        if (map[key].bots.indexOf(bi) < 0) map[key].bots.push(bi);
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; }).filter(function (c) { return c.bots.length > 1; })
      .sort(function (a, b) { return (a.prefix + a.command).localeCompare(b.prefix + b.command); });
  }

  function merge(bots, conflicts) {
    var nodes = [], conns = [], botTrig = [], uid = 0;
    bots.forEach(function (b, bi) {
      var idmap = {}, off = bi * 680;
      (b.nodes || []).forEach(function (n) {
        var nid = "m" + (uid++) + Math.random().toString(36).slice(2, 8);
        idmap[n.id] = nid;
        nodes.push({ id: nid, type: n.type, x: (n.x || 0), y: (n.y || 0) + off, muted: !!n.muted, title: n.title || "", params: Object.assign({}, n.params || {}) });
      });
      (b.connections || []).forEach(function (c) { if (idmap[c.from] && idmap[c.to]) conns.push({ from: idmap[c.from], fromPin: c.fromPin, to: idmap[c.to], toPin: c.toPin }); });
      var trg = {}; (b.nodes || []).filter(isCommand).forEach(function (n) { var cmd = ((n.params && n.params.command) || "").trim(); if (cmd) trg[cmdKey(n)] = idmap[n.id]; });
      botTrig.push(trg);
    });
    function byId(id) { return nodes.filter(function (n) { return n.id === id; })[0]; }
    function removeNode(id) { nodes = nodes.filter(function (n) { return n.id !== id; }); conns = conns.filter(function (c) { return c.from !== id && c.to !== id; }); }

    conflicts.forEach(function (c) {
      var key = (c.prefix + c.command).toLowerCase();
      var trigs = c.bots.filter(function (b) { return botTrig[b] && botTrig[b][key]; }).map(function (b) { return { bot: b, id: botTrig[b][key] }; });
      if (trigs.length < 2) return;
      if (c.resolution === "runAll") return;
      if (c.resolution === "keep") { trigs.forEach(function (t) { if (t.bot !== c.keepBot) removeNode(t.id); }); }
      else if (c.resolution === "rename") { var n = 2; trigs.slice().sort(function (a, b) { return a.bot - b.bot; }).forEach(function (t, i) { if (i === 0) return; var nn = byId(t.id); if (nn) nn.params.command = c.command + (n++); }); }
      else if (c.resolution === "combine") {
        var keeper = trigs.slice().sort(function (a, b) { return a.bot - b.bot; })[0].id;
        trigs.forEach(function (t) { if (t.id === keeper) return; conns.forEach(function (w) { if (w.from === t.id) w.from = keeper; }); removeNode(t.id); });
      }
    });

    if (nodes.some(isTrigger)) {   // prune flows whose trigger was removed
      var adj = {}; nodes.forEach(function (n) { adj[n.id] = []; });
      conns.forEach(function (c) { if (adj[c.from] && adj[c.to]) { adj[c.from].push(c.to); adj[c.to].push(c.from); } });
      var live = {}, stack = [];
      nodes.forEach(function (n) { if (isTrigger(n) && !live[n.id]) { live[n.id] = 1; stack.push(n.id); } });
      while (stack.length) { var id = stack.pop(); adj[id].forEach(function (nb) { if (!live[nb]) { live[nb] = 1; stack.push(nb); } }); }
      nodes = nodes.filter(function (n) { return live[n.id]; });
      conns = conns.filter(function (c) { return live[c.from] && live[c.to]; });
    }
    return { format: "ircuitry.workflow.v1", name: "", nodes: nodes, connections: conns };
  }

  // ---------------- state + gallery ----------------
  var ALL = [], SEL = [], CONFLICTS = [], MERGED = null;

  function botOf(w) { return w.workflow || { nodes: [], connections: [] }; }
  function nameOf(i) { return ALL[i] ? ALL[i].name : "bot"; }

  function card(w, i) {
    var sel = SEL.indexOf(i) >= 0;
    return '<div class="node pick' + (sel ? " sel" : "") + '" data-i="' + i + '">' +
      '<div class="tick">' + (sel ? "✓" : "") + '</div>' +
      '<div class="top"><div class="badge">🤖</div><div>' +
      '<div class="name">' + esc(w.name) + '</div><div class="meta">' + esc(w.nodeCount) + " nodes · " + esc(w.connectionCount) + " wires</div></div></div>" +
      '<div class="desc">' + esc(w.description || "") + "</div></div>";
  }

  function renderGrid() {
    var q = (el("search").value || "").trim().toLowerCase();
    var list = ALL.map(function (w, i) { return { w: w, i: i }; }).filter(function (o) {
      return !q || (o.w.name + " " + (o.w.description || "") + " " + (o.w.category || "") + " " + (o.w.tags || []).join(" ")).toLowerCase().indexOf(q) >= 0;
    });
    el("count").textContent = list.length + " bots";
    el("empty").hidden = list.length > 0;
    el("grid").innerHTML = '<div class="grid">' + list.map(function (o) { return card(o.w, o.i); }).join("") + "</div>";
    el("grid").querySelectorAll(".pick").forEach(function (c) {
      c.addEventListener("click", function () { toggle(+c.getAttribute("data-i")); });
    });
    renderTray();
  }

  function toggle(i) {
    var k = SEL.indexOf(i);
    if (k >= 0) SEL.splice(k, 1); else SEL.push(i);
    renderGrid();
  }

  function renderTray() {
    var tray = el("tray");
    tray.hidden = SEL.length === 0;
    el("trayChips").innerHTML = SEL.map(function (i) { return '<span class="pillbot">' + esc(nameOf(i)) + "</span>"; }).join("");
    var btn = el("mergeBtn");
    btn.disabled = SEL.length < 2;
    btn.textContent = SEL.length < 2 ? "🧁 Pick 2+ to merge" : ("🧁 Merge " + SEL.length + " bots");
  }

  // ---------------- wizard ----------------
  function openWizard() {
    if (SEL.length < 2) return;
    var bots = SEL.map(function (i) { return botOf(ALL[i]); });
    CONFLICTS = detect(bots);
    el("mergeName").value = SEL.slice(0, 3).map(nameOf).join(" + ") + (SEL.length > 3 ? " +" : "");
    el("clashes").innerHTML = CONFLICTS.length === 0
      ? '<div class="clash" style="background:#eef9ed;border-color:#cfead0;">✓ No command clashes - these bots merge cleanly.</div>'
      : CONFLICTS.map(function (c, ci) {
        var who = c.bots.map(function (b) { return esc(nameOf(SEL[b])); }).join(", ");
        var opts = c.bots.map(function (b) { return '<button class="opt" data-c="' + ci + '" data-r="keep" data-b="' + b + '">keep ' + esc(nameOf(SEL[b])) + "</button>"; }).join("");
        opts += '<button class="opt" data-c="' + ci + '" data-r="runAll">run both</button>';
        opts += '<button class="opt" data-c="' + ci + '" data-r="rename">keep both</button>';
        opts += '<button class="opt" data-c="' + ci + '" data-r="combine">combine</button>';
        return '<div class="clash"><span class="cmd">' + esc((c.prefix || "") + c.command) + '</span> <span style="color:#9b8c70;font-size:13px;">in ' + who + '</span><div class="opts" id="opts' + ci + '">' + opts + "</div></div>";
      }).join("");
    syncOpts();
    el("clashes").querySelectorAll(".opt").forEach(function (o) {
      o.addEventListener("click", function () {
        var c = CONFLICTS[+o.getAttribute("data-c")];
        c.resolution = o.getAttribute("data-r");
        if (c.resolution === "keep") c.keepBot = +o.getAttribute("data-b");
        syncOpts();
      });
    });
    el("scrim").classList.add("show");
  }
  function syncOpts() {
    CONFLICTS.forEach(function (c, ci) {
      var box = el("opts" + ci); if (!box) return;
      box.querySelectorAll(".opt").forEach(function (o) {
        var r = o.getAttribute("data-r");
        var on = r === c.resolution && (r !== "keep" || +o.getAttribute("data-b") === c.keepBot);
        o.classList.toggle("on", on);
      });
    });
  }

  // ---------------- bake ----------------
  function bake() {
    var bots = SEL.map(function (i) { return botOf(ALL[i]); });
    MERGED = merge(bots, CONFLICTS);
    MERGED.name = (el("mergeName").value || "Merged Bot").trim() || "Merged Bot";
    el("scrim").classList.remove("show");
    el("bakeCap").textContent = "Baking your bot…";
    el("bakefx").classList.add("show");
    // mirror the app: oven + clock ~2s, then the bot pops, ~2.8s total
    setTimeout(function () { el("bakeCap").textContent = MERGED.name + " is ready!"; }, 2150);
    setTimeout(function () {
      el("bakefx").classList.remove("show");
      el("resultSub").textContent = MERGED.name + " · " + MERGED.nodes.length + " nodes · " + MERGED.connections.length + " wires";
      el("resultScrim").classList.add("show");
    }, 3950);
  }

  function download(text, name) {
    var b = new Blob([text], { type: "application/json" });
    var u = URL.createObjectURL(b), a = document.createElement("a");
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
  }

  // ---------------- boot ----------------
  document.addEventListener("DOMContentLoaded", function () {
    el("search").addEventListener("input", renderGrid);
    el("mergeBtn").addEventListener("click", openWizard);
    el("cancelMerge").addEventListener("click", function () { el("scrim").classList.remove("show"); });
    el("bakeBtn").addEventListener("click", bake);
    el("dlBtn").addEventListener("click", function () { download(JSON.stringify(MERGED, null, 2), MERGED.name.replace(/[^a-zA-Z0-9 ._-]/g, "") + ".ircbot"); });
    el("copyBtn").addEventListener("click", function () {
      var t = JSON.stringify(MERGED, null, 2);
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast("Copied - press Ctrl+V in ircuitry"); }, function () { toast("Copy failed - use Download"); });
    });
    el("closeResult").addEventListener("click", function () { el("resultScrim").classList.remove("show"); });

    fetch(WF_INDEX, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (data) {
      ALL = (data.workflows || []).filter(function (w) { return w.workflow; }).sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
      el("state").style.display = "none";
      renderGrid();
    }).catch(function () {
      el("state").innerHTML = 'Could not load right now. Browse bots on <a href="https://github.com/' + WORKFLOWS + '">GitHub</a>.';
    });
  });
})();
