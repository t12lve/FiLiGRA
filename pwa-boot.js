/**
 * FiLiGRA PWA boot — registers sw.js (COI headers + shell cache)
 * Adapted from coi-serviceworker client pattern.
 */
(() => {
  const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
  window.sessionStorage.removeItem("coiReloadedBySelf");
  const coepDegrading = reloadedBySelf === "coepdegrade";

  const coi = {
    shouldRegister: () => !reloadedBySelf,
    shouldDeregister: () => false,
    coepCredentialless: () => true,
    coepDegrade: () => true,
    doReload: () => window.location.reload(),
    quiet: false,
    ...(window.coi || {}),
  };

  const n = navigator;
  const controlling = n.serviceWorker && n.serviceWorker.controller;

  if (controlling && !window.crossOriginIsolated) {
    window.sessionStorage.setItem("coiCoepHasFailed", "true");
  }
  const coepHasFailed = window.sessionStorage.getItem("coiCoepHasFailed");

  if (controlling) {
    const reloadToDegrade =
      coi.coepDegrade() && !(coepDegrading || window.crossOriginIsolated);
    n.serviceWorker.controller.postMessage({
      type: "coepCredentialless",
      value:
        reloadToDegrade || (coepHasFailed && coi.coepDegrade())
          ? false
          : coi.coepCredentialless(),
    });
    if (reloadToDegrade) {
      if (!coi.quiet) console.log("[FiLiGRA-PWA] Reloading to degrade COEP.");
      window.sessionStorage.setItem("coiReloadedBySelf", "coepdegrade");
      coi.doReload();
    }
    if (coi.shouldDeregister()) {
      n.serviceWorker.controller.postMessage({ type: "deregister" });
    }
  }

  if (window.crossOriginIsolated !== false || !coi.shouldRegister()) return;

  if (!window.isSecureContext) {
    if (!coi.quiet) {
      console.log("[FiLiGRA-PWA] Secure context required for COI / PWA.");
    }
    return;
  }

  if (!n.serviceWorker) {
    if (!coi.quiet) console.error("[FiLiGRA-PWA] Service Worker unsupported.");
    return;
  }

  const scriptUrl = new URL("sw.js", window.location.href).href;

  n.serviceWorker.register(scriptUrl).then(
    (registration) => {
      if (!coi.quiet) {
        console.log("[FiLiGRA-PWA] SW registered:", registration.scope);
      }
      registration.addEventListener("updatefound", () => {
        if (!coi.quiet) console.log("[FiLiGRA-PWA] SW updatefound — reload.");
        window.sessionStorage.setItem("coiReloadedBySelf", "updatefound");
        coi.doReload();
      });
      if (registration.active && !n.serviceWorker.controller) {
        if (!coi.quiet) console.log("[FiLiGRA-PWA] Taking control — reload.");
        window.sessionStorage.setItem("coiReloadedBySelf", "notcontrolling");
        coi.doReload();
      }
    },
    (err) => {
      if (!coi.quiet) console.error("[FiLiGRA-PWA] SW registration failed:", err);
    }
  );
})();
