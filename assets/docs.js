(function () {
  "use strict";
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var PIN = { Exec: "#7ED6E4", Text: "#F2AE46", User: "#F08A9E", Channel: "#B09EE2", Number: "#8CC454", Bool: "#7EC45C", Tool: "#F08A9E" };
  var CAT = { Event: "#56C0D2", Filter: "#F2AE46", Logic: "#B09EE2", Action: "#8CC454", Data: "#F08A9E", Ai: "#C68ED6", Storage: "#74AEE0", Code: "#7C8AD2", Ircv3: "#4EC4B2" };
  var CAT_ORDER = ["Event", "Filter", "Logic", "Data", "Action", "Ai", "Storage", "Code", "Ircv3"];
  var CAT_LABEL = { Ai: "AI", Ircv3: "IRCv3" };
  function pinColor(k) { return PIN[k] || "#8C7A5C"; }
  function catColor(c) { return CAT[c] || "#B0A284"; }
  function catLabel(c) { return CAT_LABEL[c] || c; }

  // colour the inline pin-kind chips in the prose
  document.querySelectorAll(".kindchip").forEach(function (ch) {
    var k = ch.getAttribute("data-k"); ch.style.setProperty("--kc", pinColor(k));
  });

  // ---- node reference ----
  var NODES = [];
  function pinList(pins) {
    if (!pins || !pins.length) return '<span class="nr-none">none</span>';
    return pins.map(function (p) {
      return '<span class="nr-pin"><i style="background:' + pinColor(p.k) + '"></i>' + esc(p.n || "(exec)") +
        '<em>' + esc(p.k) + (p.multi ? " *" : "") + "</em></span>";
    }).join("");
  }
  function paramRows(ps) {
    if (!ps || !ps.length) return "";
    return '<div class="nr-sec">Parameters</div><div class="nr-params">' + ps.map(function (p) {
      var meta = [p.type];
      if (p.choices && p.choices.length) meta = ["one of: " + p.choices.join(", ")];
      else if (p.default) meta.push("default " + p.default);
      return '<div class="nr-param"><span class="nr-pk">' + esc(p.label || p.key) + '</span>' +
        '<span class="nr-pv">' + esc(meta.join(" · ")) + "</span></div>";
    }).join("") + "</div>";
  }
  function nodeCard(n) {
    var ac = catColor(n.category);
    return '<details class="nr-node" data-cat="' + esc(n.category) + '" data-hay="' +
      esc((n.title + " " + n.typeId + " " + n.category + " " + n.description).toLowerCase()) + '">' +
      '<summary><span class="nr-ic" style="background:' + ac + '22;color:' + ac + '"><i class="ph ph-' + esc(n.icon) + '"></i></span>' +
      '<span class="nr-name">' + esc(n.title) + (n.trigger ? ' <span class="nr-trig">trigger</span>' : "") + "</span>" +
      '<code class="nr-id">' + esc(n.typeId) + "</code></summary>" +
      '<div class="nr-body">' +
      (n.description ? '<p class="nr-desc">' + esc(n.description) + "</p>" : "") +
      '<div class="nr-pins"><div><div class="nr-sec">Inputs</div>' + pinList(n.inputs) + "</div>" +
      '<div><div class="nr-sec">Outputs</div>' + pinList(n.outputs) + "</div></div>" +
      paramRows(n.params) + "</div></details>";
  }
  function render(q) {
    var host = el("nodeRef"); if (!host) return;
    q = (q || "").trim().toLowerCase();
    var by = {}; NODES.forEach(function (n) { (by[n.category] = by[n.category] || []).push(n); });
    var cats = CAT_ORDER.filter(function (c) { return by[c]; }).concat(Object.keys(by).filter(function (c) { return CAT_ORDER.indexOf(c) < 0; }));
    var shown = 0;
    var html = cats.map(function (c) {
      var list = by[c].filter(function (n) { return !q || (n.title + " " + n.typeId + " " + n.category + " " + n.description).toLowerCase().indexOf(q) >= 0; });
      if (!list.length) return "";
      shown += list.length;
      return '<section class="nr-cat"><h3 style="color:' + catColor(c) + '"><i class="ph ph-circle"></i> ' +
        esc(catLabel(c)) + ' <span>' + list.length + "</span></h3>" + list.map(nodeCard).join("") + "</section>";
    }).join("");
    host.innerHTML = html || '<p class="docs-loading">No nodes match "' + esc(q) + '".</p>';
  }

  fetch("node-reference.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !j.nodes) { el("nodeRef").innerHTML = '<p class="docs-loading">Could not load the node reference.</p>'; return; }
    NODES = j.nodes;
    var v = el("docsVer"); if (v) v.textContent = "ircuitry v" + j.version + " · " + NODES.length + " built-in nodes";
    render("");
  }).catch(function () {});

  var ns = el("nodeSearch");
  if (ns) ns.addEventListener("input", function () { render(ns.value); });

  // ---- TOC: active-section highlight + filter ----
  var toc = el("toc"), links = toc ? [].slice.call(toc.querySelectorAll("a")) : [];
  var sections = links.map(function (a) { return el(a.getAttribute("href").slice(1)); }).filter(Boolean);
  function onScroll() {
    var y = window.scrollY + 120, cur = sections[0];
    sections.forEach(function (s) { if (s.offsetTop <= y) cur = s; });
    links.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + (cur && cur.id)); });
  }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  var ts = el("tocSearch");
  if (ts) ts.addEventListener("input", function () {
    var q = ts.value.trim().toLowerCase();
    links.forEach(function (a) { a.style.display = !q || a.textContent.toLowerCase().indexOf(q) >= 0 ? "" : "none"; });
  });
})();
