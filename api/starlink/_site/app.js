(function () {
  "use strict";

  // PLACEHOLDERS — replace with LAVAALL's real contact details before any launch (see ASSET-NEEDS.md).
  var CONTACT = {
    whatsapp: "https://wa.me/00000000000",
    call: "tel:+00000000000",
    email: "hello@lavaall.com"
  };

  var IMG = "assets/product/cutout/";
  var ITEMS = {
    kit:     { label: "Starlink kit", img: IMG + "starlink-dish.webp" },
    mount:   { label: "Roof / pole mount", img: IMG + "lavaall-pole-mount.webp" },
    mesh:    { label: "Mesh Wi-Fi", img: IMG + "lavaall-mesh.webp" },
    meshPlus:{ label: "Multi-node mesh", img: IMG + "lavaall-mesh.webp" },
    power:   { label: "Power protection + UPS", img: IMG + "lavaall-ups.webp" },
    router:  { label: "Router setup", img: IMG + "starlink-router.webp" },
    install: { label: "Professional installation" },
    support: { label: "Ongoing support" }
  };

  var STEPS = [
    { key: "place", q: "Where do you need Starlink?", help: "Pick the closest fit.",
      opts: ["Home", "Business", "Office", "School", "Hotel", "Organization", "Other"] },
    { key: "country", q: "Where are you located?", help: "We'll confirm coverage and access for your area.",
      opts: ["Sierra Leone", "Liberia", "Guinea", "Guinea-Bissau", "Somewhere else"], city: true },
    { key: "need", q: "What do you need?", help: "Already have hardware? That's fine.",
      opts: ["New complete setup", "I already have Starlink", "Installation only", "Better Wi-Fi coverage", "Power backup", "Not sure"] },
    { key: "size", q: "How large is the space?", help: "A rough idea is enough.",
      opts: ["Small", "Medium", "Large", "Multiple buildings"] },
    { key: "priority", q: "What matters most?", help: "We'll shape the setup around it.",
      opts: ["Lowest starting cost", "Best Wi-Fi coverage", "Backup power", "Fast installation", "Business reliability"], single: true }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var host = $("stepHost"), form = $("wizard"), back = $("backBtn"), next = $("nextBtn");
  var result = $("result"), progress = $("progress");
  var state = { i: 0, a: {}, code: null };

  try {
    var saved = JSON.parse(sessionStorage.getItem("lv-setup") || "null");
    if (saved && saved.a && saved.code) state = saved;
  } catch (e) {}

  function save() { try { sessionStorage.setItem("lv-setup", JSON.stringify(state)); } catch (e) {} }

  // ---------- Backend (api/starlink). Relative to <base href="/starlink/">. ----------
  // If the API is not reachable (e.g. the page is opened from a plain static
  // server), the page falls back to the original client-side code + wa.me link.
  function api(method, path, body) {
    if (!window.fetch) return Promise.reject(new Error("no_fetch"));
    return fetch("api" + path, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || "http_" + r.status); e.status = r.status; e.body = j; throw e; }
        return j;
      });
    });
  }

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function setProgress() {
    var n = state.i + 1;
    $("progressText").textContent = n + " of " + STEPS.length;
    $("progressBar").setAttribute("aria-valuenow", String(n));
    $("progressFill").style.width = (n / STEPS.length * 100) + "%";
  }

  function canContinue() {
    return !!state.a[STEPS[state.i].key];
  }

  function render(dir, moveFocus) {
    var s = STEPS[state.i];
    host.innerHTML = "";
    var fs = el("fieldset", { "class": "step" + (dir ? " is-enter-" + dir : "") });
    var lg = el("legend", { "class": "step__q", tabindex: "-1", id: "q-" + s.key }, s.q);
    fs.appendChild(lg);
    fs.appendChild(el("p", { "class": "step__help" }, s.help));

    var grid = el("div", { "class": "opts" + (s.single ? " opts--single" : "") });
    s.opts.forEach(function (o, idx) {
      var lab = el("label", { "class": "opt" });
      var inp = el("input", { type: "radio", name: s.key, value: o, id: s.key + "-" + idx });
      if (state.a[s.key] === o) inp.checked = true;
      inp.addEventListener("change", function () {
        state.a[s.key] = o;
        next.disabled = !canContinue();
      });
      lab.appendChild(inp);
      lab.appendChild(el("span", {}, o));
      grid.appendChild(lab);
    });
    fs.appendChild(grid);

    if (s.city) {
      var f = el("div", { "class": "field" });
      f.appendChild(el("label", { "for": "city" }, "City or area (optional)"));
      var ci = el("input", { id: "city", type: "text", autocomplete: "address-level2", placeholder: "e.g. Freetown, Bo, Monrovia" });
      ci.value = state.a.city || "";
      ci.addEventListener("input", function () { state.a.city = ci.value.trim(); });
      f.appendChild(ci);
      fs.appendChild(f);
    }

    host.appendChild(fs);
    back.hidden = state.i === 0;
    next.textContent = state.i === STEPS.length - 1 ? "See my setup" : "Continue";
    next.disabled = !canContinue();
    setProgress();
    if (moveFocus) lg.focus({ preventScroll: true });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!canContinue()) return;
    if (state.i < STEPS.length - 1) { state.i++; render("fwd", true); }
    else showResult(true);
  });
  back.addEventListener("click", function () {
    if (state.i > 0) { state.i--; render("back", true); }
  });

  // ---------- Recommendation (deterministic; same rules in api/starlink/_lib/recommend.js) ----------
  function recommend(a) {
    var big = a.size === "Large" || a.size === "Multiple buildings";
    var mid = a.size === "Medium";
    var biz = ["Business", "Office", "School", "Hotel", "Organization"].indexOf(a.place) > -1;
    var lean = a.priority === "Lowest starting cost";
    var list = [], title = "Complete Starlink setup", note = "";

    switch (a.need) {
      case "I already have Starlink":
        title = "Install + optimise your Starlink";
        list = ["mount", "install"];
        break;
      case "Installation only":
        title = "Professional installation";
        list = ["mount", "install"];
        break;
      case "Better Wi-Fi coverage":
        title = "Wi-Fi coverage upgrade";
        list = [big ? "meshPlus" : "mesh", "router", "install"];
        break;
      case "Power backup":
        title = "Power protection + backup";
        list = ["power", "install"];
        break;
      default:
        list = ["kit", "mount", "install"];
    }

    var wantsMesh = big || (mid && !lean) || a.priority === "Best Wi-Fi coverage" || (biz && !lean);
    if (wantsMesh && list.indexOf("mesh") < 0 && list.indexOf("meshPlus") < 0 && a.need !== "Power backup" && a.need !== "Installation only")
      list.splice(list.indexOf("install"), 0, big ? "meshPlus" : "mesh");

    var wantsPower = a.priority === "Backup power" || a.priority === "Business reliability" || (biz && !lean);
    if (wantsPower && list.indexOf("power") < 0 && a.need !== "Better Wi-Fi coverage")
      list.splice(list.indexOf("install"), 0, "power");

    list.push("support");

    if (lean) note = "Core connection first. Add coverage or backup later.";
    if (a.priority === "Fast installation") note = "We'll schedule as early as availability allows.";
    return { title: title, items: list, note: note };
  }

  function code() {
    var c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "";
    var r = new Uint32Array(5);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(r) : r.forEach(function (_, i) { r[i] = Math.random() * 1e9; });
    for (var i = 0; i < 5; i++) s += c[r[i] % c.length];
    return "LV-" + s;
  }

  function summary() {
    var a = state.a;
    var where = (a.city ? a.city + ", " : "") + (a.country || "");
    return [a.place, where, a.size ? a.size + " space" : ""].filter(Boolean).join(" · ");
  }

  function message() {
    var rec = recommend(state.a);
    return "Hi LAVAALL, I'd like to get connected.\nSetup code: " + state.code +
      "\n" + summary() + "\nNeed: " + state.a.need + "\nPriority: " + state.a.priority +
      "\nRecommended: " + rec.items.map(function (k) { return ITEMS[k].label; }).join(", ");
  }

  function showResult(moveFocus) {
    if (state.code) return paint(moveFocus);
    next.disabled = true;
    var answers = { place: state.a.place, country: state.a.country, city: state.a.city || "", need: state.a.need, size: state.a.size, priority: state.a.priority };
    api("POST", "/setups", answers).then(function (j) {
      state.code = j.code; state.server = true;
    }, function () {
      state.code = code(); state.server = false;
    }).then(function () {
      next.disabled = false;
      paint(moveFocus);
    });
  }

  function paint(moveFocus) {
    save();
    var rec = recommend(state.a);
    form.hidden = true; progress.hidden = true; result.hidden = false;
    $("resultTitle").textContent = rec.title;
    $("resultMeta").textContent = summary();
    $("setupCode").textContent = state.code;
    var ul = $("resultItems"); ul.innerHTML = "";
    rec.items.forEach(function (k) {
      var it = ITEMS[k], li = el("li", it.img ? {} : { "class": "is-text" });
      if (it.img) li.appendChild(el("img", { src: it.img, alt: "", width: "120", height: "120", loading: "lazy" }));
      li.appendChild(el("span", {}, it.label));
      ul.appendChild(li);
    });
    var n = result.querySelector(".result__note");
    n.textContent = (rec.note ? rec.note + " " : "") + "Pricing and install timing are confirmed after we review your setup.";
    wireContacts();
    if (moveFocus) {
      $("resultTitle").focus({ preventScroll: true });
      var top = $("panel").getBoundingClientRect().top + scrollY - 88;
      scrollTo({ top: top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }

  function wireContacts() {
    var msg = state.code ? message() : "Hi LAVAALL, I'd like to get connected.";
    var subj = state.code ? "Starlink setup " + state.code : "Starlink setup";
    document.querySelectorAll("[data-contact]").forEach(function (a) {
      var t = a.getAttribute("data-contact");
      var sku = a.getAttribute("data-sku");
      if (t === "whatsapp") {
        var text = sku ? "Hi LAVAALL, I'd like to ask about the " + sku + "." : msg;
        a.href = CONTACT.whatsapp + "?text=" + encodeURIComponent(text); a.target = "_blank"; a.rel = "noopener";
      }
      if (t === "call") a.href = CONTACT.call;
      if (t === "email") a.href = "mailto:" + CONTACT.email + "?subject=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(msg);
    });
    var gc = $("getConnected");
    gc.href = CONTACT.whatsapp + "?text=" + encodeURIComponent(msg); gc.target = "_blank"; gc.rel = "noopener";
  }

  function say(node, text) { node.textContent = text; node.hidden = !text; }

  $("getConnected").addEventListener("click", function (e) {
    // Offline fallback keeps the original behaviour (href set in wireContacts).
    if (!state.code || !state.server) return;
    e.preventDefault();
    var gc = this, st = $("connectStatus");
    if (gc.getAttribute("aria-disabled") === "true") return;
    var wa = $("connectWhatsapp").value.trim(), em = $("connectEmail").value.trim();
    if (!wa && !em) {
      say(st, "Add a WhatsApp number or email so we can reach you.");
      $("connectWhatsapp").focus();
      return;
    }
    gc.setAttribute("aria-disabled", "true");
    say(st, "Saving\u2026");
    api("POST", "/setups/" + encodeURIComponent(state.code) + "/connect", { whatsapp: wa, email: em, website: $("connectWebsite").value })
      .then(function (j) {
        state.connected = true; save();
        var via = [j.contact && j.contact.whatsapp ? "WhatsApp" : "", j.contact && j.contact.email ? "email" : ""].filter(Boolean).join(" and ");
        say(st, "Saved. We'll reach you on " + via + " about setup " + state.code + "." +
          (j.delivery && j.delivery.mode === "test" ? " (Test mode: nothing was sent.)" : ""));
        if (j.links) {
          result.querySelectorAll('[data-contact="whatsapp"]').forEach(function (a) { a.href = j.links.whatsapp; });
          result.querySelectorAll('[data-contact="email"]').forEach(function (a) { a.href = j.links.mailto; });
        }
      }, function (err) {
        if (err && err.status === 404) { state.server = false; }
        say(st, err && err.body && err.body.message ? err.body.message : "We couldn't save that. Use WhatsApp or Email below.");
      }).then(function () { gc.removeAttribute("aria-disabled"); });
  });

  $("copyCode").addEventListener("click", function () {
    var b = this, done = function () { b.textContent = "Copied"; $("copyStatus").textContent = "Setup code copied"; setTimeout(function () { b.textContent = "Copy"; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(state.code).then(done, function () {});
  });

  $("restart").addEventListener("click", function () {
    state = { i: 0, a: {}, code: null };
    try { sessionStorage.removeItem("lv-setup"); } catch (e) {}
    say($("connectStatus"), "");
    result.hidden = true; form.hidden = false; progress.hidden = false;
    render(null, true);
    wireContacts();
  });

  wireContacts();
  if (state.code) {
    paint(false);
    // Re-check a saved server code; if the server no longer has it, make a new one.
    if (state.server) api("GET", "/setups/" + encodeURIComponent(state.code)).catch(function (err) {
      if (err && err.status === 404) { state.code = null; state.server = false; showResult(false); }
    });
  } else render(null, false);
})();
