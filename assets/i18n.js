// Auto-detect Chinese from the browser and swap any element carrying a data-zh translation.
// English is the default (and the SEO/source language); zh* browsers see Simplified Chinese. No switcher.
(function () {
  var zh = /^zh/i.test(navigator.language || navigator.userLanguage || "");
  if (!zh) return;
  function apply() {
    document.documentElement.lang = "zh";
    document.querySelectorAll("[data-zh]").forEach(function (n) {
      var v = n.getAttribute("data-zh");
      if (n.tagName === "META") n.setAttribute("content", v);
      else if (n.tagName === "TITLE") n.textContent = v;
      else n.innerHTML = v;
    });
    document.querySelectorAll("[data-zh-ph]").forEach(function (n) { n.setAttribute("placeholder", n.getAttribute("data-zh-ph")); });
  }
  if (document.readyState !== "loading") apply();
  else document.addEventListener("DOMContentLoaded", apply);
})();
