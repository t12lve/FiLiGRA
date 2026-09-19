/**
 * FiLiGRA PWA boot — COI + SW registration + auto-update (web & installed PWA)
 */
(() => {
  const STORAGE_KEY = "filigra:deploy-version";
  const RELOAD_FLAG = "filigra:hard-reload-for";
  const CHECK_INTERVAL_MS = 5 * 60 * 1000;

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
  let swRegistration = null;

  async function clearClientCaches() {
    if (!("caches" in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }

  async function unregisterWorkers() {
    if (!n.serviceWorker) return;
    const regs = await n.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }

  /**
   * Fetch version.json (never from cache).
   * On mismatch → wipe SW/caches + hard reload (works for browser tab AND installed PWA).
   */
  async function hardRefreshIfNewDeploy() {
    try {
      const res = await fetch(`version.json?_=${Date.now()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return false;
      const data = await res.json();
      const remote = String(data.version || "").trim();
      if (!remote) return false;

      const local = localStorage.getItem(STORAGE_KEY);
      if (local === remote) return false;

      localStorage.setItem(STORAGE_KEY, remote);
      if (sessionStorage.getItem(RELOAD_FLAG) === remote) return false;
      sessionStorage.setItem(RELOAD_FLAG, remote);

      if (!coi.quiet) {
        console.log("[FiLiGRA-PWA] Nouvelle version", remote, "— mise à jour auto.");
      }

      await clearClientCaches();
      await unregisterWorkers();

      const u = new URL(window.location.href);
      u.searchParams.set("_v", remote);
      window.location.replace(u.href);
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Periodic + on-resume update checks for installed PWA / long-lived tabs. */
  function scheduleAutoUpdateChecks() {
    const run = () => {
      hardRefreshIfNewDeploy().then((did) => {
        if (did) return;
        if (swRegistration) swRegistration.update().catch(() => {});
      });
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") run();
    });
    window.addEventListener("focus", run);
    setInterval(run, CHECK_INTERVAL_MS);
  }

  function paintVersionLabels() {
    const v = window.FILIGRA_VERSION || localStorage.getItem(STORAGE_KEY) || "—";
    const label = v.charAt(0) === "v" ? v : "v" + v;
    document.querySelectorAll("[data-filigra-version]").forEach((el) => {
      el.textContent = label;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paintVersionLabels);
  } else {
    paintVersionLabels();
  }

  const refreshGate = hardRefreshIfNewDeploy();

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

  refreshGate.then((didReload) => {
    if (didReload) return;
    bootServiceWorker();
    scheduleAutoUpdateChecks();
  });

  function bootServiceWorker() {
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

    const ver = window.FILIGRA_VERSION || "dev";
    const scriptUrl = new URL(`sw.js?v=${encodeURIComponent(ver)}`, window.location.href)
      .href;

    let refreshing = false;
    n.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      if (!coi.quiet) console.log("[FiLiGRA-PWA] Nouveau SW actif — reload.");
      window.sessionStorage.setItem("coiReloadedBySelf", "controllerchange");
      coi.doReload();
    });

    n.serviceWorker.register(scriptUrl).then(
      (registration) => {
        swRegistration = registration;
        if (!coi.quiet) {
          console.log("[FiLiGRA-PWA] SW registered:", registration.scope);
        }

        registration.update().catch(() => {});

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              n.serviceWorker.controller
            ) {
              installing.postMessage({ type: "SKIP_WAITING" });
              if (!coi.quiet) console.log("[FiLiGRA-PWA] SW update — skipWaiting.");
            }
          });
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
  }
})();
