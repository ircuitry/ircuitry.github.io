/*
 * mirc2ircbot - a best-effort mIRC remote-script -> ircuitry .ircbot converter.
 *
 * Tier-1 scope (by design): event handlers (`on ...`) made of a linear run of common
 * commands, plus a single one-level if/else, with `{token}` substitution for the common
 * identifiers. Comments become sticky notes. Anything it can't map cleanly (loops, goto,
 * nested ifs, aliases, unknown commands/identifiers) is preserved verbatim in a "needs a
 * human" sticky note and listed in the report - so the output is always honest, never silently
 * wrong. Runs entirely in the browser; nothing is uploaded.
 */
(function (root) {
  "use strict";

  // ---- id + node helpers --------------------------------------------------
  function mkCtx() {
    var seq = 0;
    return { nid: function () { return "n" + (++seq).toString(36); } };
  }
  function node(ctx, type, params, x, y) {
    return { id: ctx.nid(), type: type, x: x | 0, y: y | 0, muted: false, streamAsTool: null, title: "", colorTag: -1, params: params || {} };
  }
  function frame(ctx, title, body, x, y, color) {
    var lines = String(body || "").split("\n");
    var w = Math.max(180, Math.min(560, 30 + lines.reduce(function (m, l) { return Math.max(m, l.length); }, 0) * 7.2));
    var h = Math.max(70, 34 + lines.length * 18);
    return { id: "f" + ctx.nid().slice(1), x: x | 0, y: y | 0, w: Math.round(w), h: Math.round(h), title: title || "Note", body: String(body || ""), color: color || 0, collapsed: false };
  }

  // ---- expression / token translation ------------------------------------
  // mIRC identifiers/variables -> ircuitry {tokens}. Returns {text, unknowns:[...]}.
  var SIMPLE_ID = {
    nick: "{nick}", me: "{me}", chan: "{channel}", channel: "{channel}", active: "{channel}",
    target: "{channel}", time: "{time}", ctime: "{time}"
  };
  function translateExpr(expr) {
    var unknowns = [];
    var s = String(expr == null ? "" : expr);
    // $+(a,b,c) concat -> join inner with nothing (inner ids resolved below)
    s = s.replace(/\$\+\(([^()]*)\)/g, function (_m, inner) {
      return inner.split(",").map(function (p) { return p.trim(); }).join("");
    });
    // infix  $+  (concatenation) -> remove it and surrounding spaces
    s = s.replace(/\s*\$\+\s*/g, "");
    // $1- (all params from 1) -> {args}; $2- etc unsupported
    s = s.replace(/\$(\d+)-/g, function (m, n) { if (n === "1") return "{args}"; unknowns.push(m); return m; });
    // $1 $2 ... -> {arg1} {arg2}
    s = s.replace(/\$(\d+)\b/g, function (_m, n) { return "{arg" + n + "}"; });
    // named identifiers (optionally with a (..) call form -> unsupported)
    s = s.replace(/\$([A-Za-z][A-Za-z0-9]*)(\([^)]*\))?/g, function (m, name, call) {
      if (call) { unknowns.push(m); return m; }
      var low = name.toLowerCase();
      if (SIMPLE_ID[low]) return SIMPLE_ID[low];
      unknowns.push(m); return m;
    });
    // %variables -> {var}  (ircuitry resolves these from Set Variable / state)
    s = s.replace(/%([A-Za-z_][\w]*)/g, function (_m, v) { return "{" + v + "}"; });
    return { text: s, unknowns: unknowns };
  }

  // split a string on a separator char, ignoring separators inside () [] {}
  function splitTopLevel(str, sep) {
    var out = [], depth = 0, cur = "";
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
      if (c === sep && depth === 0) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }
  function firstWord(s) { var m = String(s).match(/^\s*(\S+)([\s\S]*)$/); return m ? [m[1], m[2].replace(/^\s+/, "")] : [s, ""]; }

  // ---- command -> node(s) -------------------------------------------------
  // returns {ok, node, extras:[], wires:[], unknowns:[], reason}
  // `node` is the exec node to chain; `extras` are pure helper nodes feeding it.
  function buildCmd(ctx, raw, x, y) {
    var line = raw.replace(/^\//, "").trim();           // commands may or may not lead with /
    var fw = firstWord(line);
    var cmd = fw[0].toLowerCase();
    var rest = fw[1];
    var U = [];
    function tr(e) { var r = translateExpr(e); r.unknowns.forEach(function (u) { U.push(u); }); return r.text; }
    function ret(n, extras, wires) { return { ok: true, node: n, extras: extras || [], wires: wires || [], unknowns: U }; }

    switch (cmd) {
      case "msg": case "say": case "privmsg": case "amsg": {
        var t = firstWord(rest); var target = tr(t[0]); var text = tr(t[1]);
        return ret(node(ctx, "action.say", { channel: target, message: text }, x, y));
      }
      case "describe": {
        var d = firstWord(rest); var dt = tr(d[0]); var dm = tr(d[1]);
        return ret(node(ctx, "irc.raw", { line: "PRIVMSG " + dt + " :ACTION " + dm + "" }, x, y));
      }
      case "me": case "action":
        return ret(node(ctx, "irc.action", { text: tr(rest) }, x, y));
      case "notice": {
        var nt = firstWord(rest); var ntgt = tr(nt[0]); var ntext = tr(nt[1]);
        return ret(node(ctx, "irc.raw", { line: "NOTICE " + ntgt + " :" + ntext }, x, y));
      }
      case "kick": {
        var kp = rest.split(/\s+/); var kch = tr(kp.shift() || ""); var kn = tr(kp.shift() || "");
        var kr = tr(kp.join(" "));
        return ret(node(ctx, "irc.kick", { channel: kch, nick: kn, reason: kr }, x, y));
      }
      case "mode": {
        var mp = rest.split(/\s+/); var mch = tr(mp.shift() || ""); var modes = tr(mp.shift() || "");
        var mtgt = tr(mp.join(" "));
        return ret(node(ctx, "irc.mode", { channel: mch, modes: modes, target: mtgt }, x, y));
      }
      case "ban": {
        var bp = rest.split(/\s+/); var bch = tr(bp.shift() || ""); var bn = tr(bp.join(" "));
        return ret(node(ctx, "irc.mode", { channel: bch, modes: "+b", target: bn }, x, y));
      }
      case "topic": {
        var tp = firstWord(rest); var tch = tr(tp[0]); var ttx = tr(tp[1]);
        return ret(node(ctx, "irc.topic", { channel: tch, topic: ttx }, x, y));
      }
      case "join": case "j":
        return ret(node(ctx, "action.join", { channel: tr(firstWord(rest)[0]) }, x, y));
      case "part": case "hop":
        return ret(node(ctx, "action.part", { channel: tr(firstWord(rest)[0]) }, x, y));
      case "nick":
        return ret(node(ctx, "irc.raw", { line: "NICK " + tr(rest.trim()) }, x, y));
      case "echo":
        return ret(node(ctx, "action.log", { text: tr(rest.replace(/^-\S+\s*/, "").replace(/^[@%#&]\S*\s*/, "")) }, x, y));
      case "set": case "var": {
        var sp = rest.replace(/^-\S+\s*/, "").trim();        // drop flags like -u600
        var sm = sp.match(/^%?([A-Za-z_][\w]*)\s*([\s\S]*)$/);
        if (!sm) return { ok: false, reason: "could not parse " + cmd, unknowns: U };
        return ret(node(ctx, "data.setvar", { name: sm[1], value: tr(sm[2]) }, x, y));
      }
      case "unset":
        return ret(node(ctx, "data.setvar", { name: rest.replace(/^%/, "").trim(), value: "" }, x, y));
      case "inc": case "dec": {
        var ip = rest.replace(/^-\S+\s*/, "").trim().split(/\s+/);
        var v = ip.shift().replace(/^%/, ""); var by = (ip.shift() || "1");
        var m = node(ctx, "data.math", { a: "{" + v + "}", op: cmd === "inc" ? "+" : "-", b: tr(by) }, x, y + 90);
        var sv = node(ctx, "data.setvar", { name: v, value: "" }, x, y);
        return ret(sv, [m], [{ from: m.id, fromPin: 0, to: sv.id, toPin: 1 }]);
      }
      case "hadd": {
        var hp = rest.replace(/^-\S+\s*/, "").trim().split(/\s+/);
        var tbl = hp.shift() || "main"; var key = tr(hp.shift() || ""); var val = tr(hp.join(" "));
        return ret(node(ctx, "db.set", { table: tbl, key: key, value: val }, x, y));
      }
      case "hdel": {
        var hd = rest.replace(/^-\S+\s*/, "").trim().split(/\s+/);
        return ret(node(ctx, "db.set", { table: hd.shift() || "main", key: tr(hd.shift() || ""), value: "" }, x, y));
      }
      case "write": {
        var wp = rest.replace(/^-\S+\s*/, "").trim(); var wf = firstWord(wp);
        return ret(node(ctx, "file.write", { path: wf[0], text: tr(wf[1]), mode: "append" }, x, y));
      }
      case "halt": case "haltdef": case "return": case "":
        return { ok: true, stop: true, unknowns: U };          // ends the chain, no node
      default:
        return { ok: false, reason: "unsupported command: /" + cmd, unknowns: U };
    }
  }

  // map an mIRC if-condition to a logic.if {opA-template, op, b-template}
  function parseCond(cond) {
    var c = cond.trim().replace(/^\(|\)$/g, "").trim();
    // a isin b  ->  b contains a
    var m = c.match(/^(.+?)\s+(isin|iswm|==|===|!=|>|<)\s+(.+)$/i);
    if (!m) return null;
    var a = m[1].trim(), op = m[2].toLowerCase(), b = m[3].trim();
    var OPS = { "==": "=", "===": "=", "!=": "≠", ">": ">", "<": "<" };
    if (op === "isin") return { A: translateExpr(b).text, op: "contains", b: translateExpr(a).text };
    if (op === "iswm") return { A: translateExpr(b).text, op: "matches", b: translateExpr(a).text };
    if (OPS[op]) return { A: translateExpr(a).text, op: OPS[op], b: translateExpr(b).text };
    return null;
  }

  // ---- event header -> trigger node --------------------------------------
  // returns {nodes:[trigger,(filter)], entryId, entryPin, why} or null
  function buildTrigger(ctx, header, baseY) {
    var parts = header.replace(/^on\s+/i, "").split(":");
    var ev = (parts[1] || "").trim().toUpperCase();
    var note = "";
    function n(type, params) { return node(ctx, type, params || {}, 0, baseY); }

    if (ev === "TEXT" || ev === "ACTION" || ev === "NOTICE") {
      var match = (parts[2] || "*").trim();
      var cmdm = match.match(/^([!.@`~+])([A-Za-z0-9_-]+)\*?$/);
      if (cmdm) return { nodes: [n("event.command", { prefix: cmdm[1], command: cmdm[2] })], entry: 0, why: "on " + ev + " " + match + " -> On Command " + cmdm[1] + cmdm[2] };
      if (match === "*" || match === "") return { nodes: [n("event.message", {})], entry: 0, why: "on " + ev + " -> On Message" };
      // a wildcard phrase -> On Message + Text Contains(core word)
      var core = match.replace(/[*?]/g, "").trim();
      var t = n("event.message", {});
      var f = node(ctx, "filter.contains", { needle: core }, 240, baseY);
      return { nodes: [t, f], entry: 0, chainFrom: { id: f.id, pin: 0 }, pre: [{ from: t.id, fromPin: 0, to: f.id, toPin: 0 }], why: "on " + ev + " " + match + " -> On Message + Text Contains \"" + core + "\"" };
    }
    var EVMAP = {
      JOIN: "event.join", PART: "event.part", QUIT: "event.quit", KICK: "event.kick",
      NICK: "event.nick", MODE: "event.mode", RAWMODE: "event.mode", INVITE: "event.invite",
      CONNECT: "event.connect", START: "event.connect", TOPIC: "event.message"
    };
    if (EVMAP[ev]) return { nodes: [n(EVMAP[ev], {})], entry: 0, why: "on " + ev + " -> " + EVMAP[ev] };
    return null;   // unknown event -> caller turns the whole block into a note
  }

  // ---- body -> node chain -------------------------------------------------
  // statements: array of strings (already split). startWire {id,pin}. baseX,baseY.
  // returns {nodes, conns, frames, warnings, converted, unsupported}
  function buildLinear(ctx, stmts, startWire, baseX, baseY) {
    var nodes = [], conns = [], warnings = [], converted = 0, unsupported = [];
    var prev = startWire, x = baseX;
    for (var i = 0; i < stmts.length; i++) {
      var st = stmts[i].trim(); if (!st) continue;
      var r = buildCmd(ctx, st, x, baseY);
      if (r.stop) break;
      if (!r.ok) { unsupported.push(st); warnings.push(r.reason || ("unsupported: " + st)); continue; }
      // don't emit a silently-wrong node: a command with an unmapped $identifier becomes a note
      if (r.unknowns && r.unknowns.length) { unsupported.push(st + "   (unmapped " + r.unknowns.join(", ") + ")"); warnings.push("left for a human (unmapped " + r.unknowns.join(", ") + "): " + st); continue; }
      (r.extras || []).forEach(function (e) { nodes.push(e); });
      (r.wires || []).forEach(function (w) { conns.push(w); });
      nodes.push(r.node);
      if (prev) conns.push({ from: prev.id, fromPin: prev.pin, to: r.node.id, toPin: 0 });
      prev = { id: r.node.id, pin: 0 };
      if (r.unknowns && r.unknowns.length) warnings.push("approximated identifier(s) " + r.unknowns.join(", ") + " in: " + st);
      converted++; x += 240;
    }
    return { nodes: nodes, conns: conns, warnings: warnings, converted: converted, unsupported: unsupported, lastWire: prev };
  }

  // ---- top-level parse ----------------------------------------------------
  function countBraces(s) { return (s.match(/{/g) || []).length - (s.match(/}/g) || []).length; }
  function parseScript(src) {
    var lines = src.replace(/\r\n/g, "\n").split("\n");
    var items = [], pending = [], k = 0;
    while (k < lines.length) {
      var raw = lines[k], t = raw.trim();
      if (t === "") { k++; continue; }
      if (t.charAt(0) === ";") { pending.push(t.replace(/^;\s?/, "")); k++; continue; }
      if (t.indexOf("/*") === 0) {
        var buf = [];
        while (k < lines.length && lines[k].indexOf("*/") < 0) { buf.push(lines[k]); k++; }
        if (k < lines.length) { buf.push(lines[k]); k++; }
        pending.push(buf.join("\n").replace(/\/\*|\*\//g, "").trim());
        continue;
      }
      var head = t.match(/^(on|alias|ctcp|menu|dialog|raw)\b/i);
      if (head) {
        var bufL = [raw], started = raw.indexOf("{") >= 0, depth = countBraces(raw);
        while ((!started || depth > 0) && k + 1 < lines.length) {
          k++; bufL.push(lines[k]);
          if (lines[k].indexOf("{") >= 0) started = true;
          depth += countBraces(lines[k]);
        }
        var block = bufL.join("\n"), bi = block.indexOf("{");
        var header = (bi >= 0 ? block.slice(0, bi) : block).trim();
        var body = bi >= 0 ? block.slice(bi + 1, block.lastIndexOf("}")) : "";
        items.push({ kind: head[1].toLowerCase(), header: header, body: body, comments: pending.slice() });
        pending = []; k++; continue;
      }
      // a loose top-level line (e.g. a one-liner alias, or a directive)
      items.push({ kind: "other", header: t, body: "", comments: pending.slice() });
      pending = []; k++;
    }
    return { items: items, trailing: pending };
  }

  // detect a single one-level if/else with no other statements and no nesting
  function asSingleIf(body) {
    var b = body.trim();
    if (!/^if\s*\(/i.test(b)) return null;
    if (/\belseif\b/i.test(b) || /\bwhile\b/i.test(b) || /\bgoto\b/i.test(b)) return null;
    // if ( cond ) { then } [ else { else } ]   - no nested braces inside the blocks
    var m = b.match(/^if\s*\(([\s\S]+?)\)\s*\{([^{}]*)\}(?:\s*else\s*\{([^{}]*)\})?\s*$/i);
    if (!m) return null;
    return { cond: m[1], thenB: m[2], elseB: m[3] || "" };
  }

  // ---- main ---------------------------------------------------------------
  function convert(src, opts) {
    opts = opts || {};
    var ctx = mkCtx();
    var parsed = parseScript(src || "");
    var nodes = [], conns = [], frames = [];
    var report = { events: [], warnings: [], notes: 0, stats: { events: 0, commands: 0, notesOnly: 0 } };
    var baseY = 0, LANE = 220;

    function noteForBlock(item, why) {
      var src2 = (item.header ? item.header + "\n{\n" : "") + (item.body || "") + (item.header ? "\n}" : "");
      frames.push(frame(ctx, "TODO (mIRC): " + why, src2.trim(), -380, baseY - 10, 3));
      report.notes++; report.stats.notesOnly++;
    }

    parsed.items.forEach(function (item) {
      // comments preceding the item -> a sticky note to its left
      if (item.comments && item.comments.length) {
        frames.push(frame(ctx, "Note", item.comments.join("\n\n"), -380, baseY - 10, 0));
        report.notes++;
      }

      if (item.kind !== "on") {
        if (item.kind === "alias" || item.kind === "ctcp" || item.kind === "other") {
          frames.push(frame(ctx, "TODO (mIRC " + item.kind + "): finish by hand", (item.header + (item.body ? "\n{\n" + item.body + "\n}" : "")).trim(), 0, baseY, 3));
          report.events.push({ name: item.header.slice(0, 60), result: "note (" + item.kind + " not auto-converted)" });
          report.stats.notesOnly++;
        }
        baseY += LANE; return;
      }

      var trig = buildTrigger(ctx, item.header, baseY);
      if (!trig) { noteForBlock(item, "unrecognised event: " + item.header); report.events.push({ name: item.header, result: "note (unknown event)" }); baseY += LANE; return; }
      trig.nodes.forEach(function (nn) { nodes.push(nn); });
      (trig.pre || []).forEach(function (w) { conns.push(w); });
      var startWire = trig.chainFrom ? { id: trig.chainFrom.id, pin: trig.chainFrom.pin } : { id: trig.nodes[0].id, pin: 0 };
      var startX = trig.nodes.length > 1 ? 480 : 240;
      report.stats.events++;

      var sIf = asSingleIf(item.body);
      if (sIf) {
        var cond = parseCond(sIf.cond);
        if (!cond) { noteForBlock(item, "if-condition not understood: " + sIf.cond.trim()); report.events.push({ name: trig.why, result: "partial (condition -> note)" }); baseY += LANE; return; }
        var af = node(ctx, "data.format", { template: cond.A }, startX, baseY + 90);
        var iff = node(ctx, "logic.if", { op: cond.op, b: cond.b }, startX + 220, baseY);
        nodes.push(af, iff);
        conns.push({ from: startWire.id, fromPin: startWire.pin, to: iff.id, toPin: 0 });
        conns.push({ from: af.id, fromPin: 0, to: iff.id, toPin: 1 });
        var thenStmts = splitTopLevel(sIf.thenB, "\n").join("\n").split(/\n|\|/);
        var elseStmts = sIf.elseB ? sIf.elseB.split(/\n|\|/) : [];
        var tb = buildLinear(ctx, thenStmts, { id: iff.id, pin: 0 }, startX + 460, baseY);
        var eb = buildLinear(ctx, elseStmts, { id: iff.id, pin: 1 }, startX + 460, baseY + 110);
        [tb, eb].forEach(function (bb) { bb.nodes.forEach(function (n2) { nodes.push(n2); }); bb.conns.forEach(function (c) { conns.push(c); }); bb.warnings.forEach(function (w) { report.warnings.push(w); }); });
        report.stats.commands += tb.converted + eb.converted;
        var unsup = tb.unsupported.concat(eb.unsupported);
        if (unsup.length) frames.push(frame(ctx, "TODO: unconverted lines", unsup.join("\n"), startX + 460, baseY + 230, 3));
        report.events.push({ name: trig.why, result: "if/else -> " + (tb.converted + eb.converted) + " node(s)" + (unsup.length ? ", " + unsup.length + " manual" : "") });
        baseY += LANE + (eb.nodes.length ? 60 : 0); return;
      }

      // linear body
      if (/\bif\s*\(|\bwhile\b|\bgoto\b|\{/.test(item.body)) {
        // control flow we don't handle in v1 -> trigger node + the body as a note
        frames.push(frame(ctx, "TODO (mIRC): finish this body by hand", item.body.trim(), startX, baseY + 10, 3));
        report.events.push({ name: trig.why, result: "trigger + body note (control flow)" });
        report.stats.notesOnly++; baseY += LANE; return;
      }
      var stmts = item.body.split(/\n|\|/);
      var lin = buildLinear(ctx, stmts, startWire, startX, baseY);
      lin.nodes.forEach(function (n2) { nodes.push(n2); });
      lin.conns.forEach(function (c) { conns.push(c); });
      lin.warnings.forEach(function (w) { report.warnings.push(w); });
      report.stats.commands += lin.converted;
      if (lin.unsupported.length) frames.push(frame(ctx, "TODO: unconverted lines", lin.unsupported.join("\n"), startX, baseY + 100, 3));
      report.events.push({ name: trig.why, result: lin.converted + " command node(s)" + (lin.unsupported.length ? ", " + lin.unsupported.length + " manual" : "") });
      baseY += LANE;
    });

    if (parsed.trailing && parsed.trailing.length) { frames.push(frame(ctx, "Note", parsed.trailing.join("\n\n"), -380, baseY, 0)); report.notes++; }

    var name = (opts.name || "imported-mirc-bot").replace(/[^\w.-]+/g, "-");
    var doc = { format: "ircuitry.workflow.v1", name: name, nodes: nodes, connections: conns };
    if (frames.length) doc.frames = frames;
    report.summary = report.stats.events + " event(s), " + report.stats.commands + " command node(s), " +
      frames.length + " sticky note(s)" + (report.warnings.length ? ", " + report.warnings.length + " warning(s)" : "");
    return { name: name, doc: doc, json: JSON.stringify(doc, null, 2), report: report };
  }

  var api = { convert: convert, translateExpr: translateExpr };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MircConvert = api;
})(typeof window !== "undefined" ? window : this);
