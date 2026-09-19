/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
let coepCredentialless = false;

if (typeof window === "undefined") {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("message", (ev) => {
        if (!ev.data) {
            return;
        } else if (ev.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => {
                    return self.clients.matchAll();
                })
                .then((clients) => {
                    clients.forEach((client) => client.navigate(client.url));
                });
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        }
    });

    self.addEventListener("fetch", function (event) {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }

        const request =
            coepCredentialless && r.mode === "no-cors"
                ? new Request(r, {
                      credentials: "omit",
                  })
                : r;

        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set(
                        "Cross-Origin-Embedder-Policy",
                        coepCredentialless ? "credentialless" : "require-corp"
                    );
                    if (!coepCredentialless) {
                        newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
                    }
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => {
                    console.warn("[COI-SW] Fetch error:", e);
                })
        );
    });
} else {
    (() => {
        const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
        window.sessionStorage.removeItem("coiReloadedBySelf");
        const coepDegrading = reloadedBySelf === "coepdegrade";

        // Global coi configuration overrides
        const coi = {
            shouldRegister: () => !reloadedBySelf,
            shouldDeregister: () => false,
            coepCredentialless: () => true,
            coepDegrade: () => true,
            doReload: () => window.location.reload(),
            quiet: false,
            ...window.coi,
        };

        const n = navigator;
        const controlling = n.serviceWorker && n.serviceWorker.controller;

        // Record the failure if the page is served by serviceWorker
        if (controlling && !window.crossOriginIsolated) {
            window.sessionStorage.setItem("coiCoepHasFailed", "true");
        }
        const coepHasFailed = window.sessionStorage.getItem("coiCoepHasFailed");

        if (controlling) {
            // Reload only on the first failure
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
                !coi.quiet && console.log("[COI-SW] Reloading page to degrade COEP.");
                window.sessionStorage.setItem("coiReloadedBySelf", "coepdegrade");
                coi.doReload("coepdegrade");
            }

            if (coi.shouldDeregister()) {
                n.serviceWorker.controller.postMessage({ type: "deregister" });
            }
        }

        // If we're already cross-origin isolated, nothing more is required
        if (window.crossOriginIsolated !== false || !coi.shouldRegister()) return;

        if (!window.isSecureContext) {
            !coi.quiet &&
                console.log(
                    "[COI-SW] Cross-Origin Isolation Service Worker requires a secure context (HTTPS or localhost)."
                );
            return;
        }

        if (!n.serviceWorker) {
            !coi.quiet &&
                console.error(
                    "[COI-SW] Service Worker is not supported or disabled in this browser session."
                );
            return;
        }

        const currentScript = window.document.currentScript;
        const scriptUrl = currentScript ? currentScript.src : "coi-serviceworker.js";

        n.serviceWorker.register(scriptUrl).then(
            (registration) => {
                !coi.quiet &&
                    console.log(
                        "[COI-SW] Service Worker registered with scope:",
                        registration.scope
                    );

                registration.addEventListener("updatefound", () => {
                    !coi.quiet &&
                        console.log(
                            "[COI-SW] Reloading page to activate updated Service Worker."
                        );
                    window.sessionStorage.setItem("coiReloadedBySelf", "updatefound");
                    coi.doReload();
                });

                // If registration is active but not controlling yet, reload to take control
                if (registration.active && !n.serviceWorker.controller) {
                    !coi.quiet &&
                        console.log(
                            "[COI-SW] Reloading page to take control and enable Cross-Origin Isolation."
                        );
                    window.sessionStorage.setItem("coiReloadedBySelf", "notcontrolling");
                    coi.doReload();
                }
            },
            (err) => {
                !coi.quiet &&
                    console.error("[COI-SW] Service Worker registration failed:", err);
            }
        );
    })();
}
