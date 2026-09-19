/**
 * FiLiGRA — Watermark & Transcode Studio (PWA)
 * Complete Application Logic, WYSIWYG Canvas Editor & FFmpeg.wasm Pipeline
 */

// ---------------------------------------------------------------------------
// 1. Dependency Resolution (FFmpeg v0.12+ and FFmpegUtil)
// ---------------------------------------------------------------------------
let FFmpegClass = window.FFmpegWASM ? window.FFmpegWASM.FFmpeg : null;
let toBlobURLFn = window.FFmpegUtil ? window.FFmpegUtil.toBlobURL : null;
let fetchFileFn = window.FFmpegUtil ? window.FFmpegUtil.fetchFile : null;

async function ensureFFmpegDependencies() {
  const withTimeout = (promise, ms, label) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms)
      ),
    ]);

  if (!FFmpegClass) {
    try {
      const module = await withTimeout(
        import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm"),
        8000,
        "FFmpeg ESM"
      );
      FFmpegClass = module.FFmpeg;
    } catch (e) {
      console.warn("[FiLiGRA] Échec du chargement dynamique ESM FFmpeg:", e);
    }
  }
  if (!toBlobURLFn || !fetchFileFn) {
    try {
      const utilModule = await withTimeout(
        import("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm"),
        8000,
        "FFmpegUtil ESM"
      );
      toBlobURLFn = utilModule.toBlobURL;
      fetchFileFn = utilModule.fetchFile;
    } catch (e) {
      console.warn("[FiLiGRA] Échec du chargement dynamique ESM FFmpegUtil:", e);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Application State
// ---------------------------------------------------------------------------
const state = {
  // Video Source
  videoFile: null,
  videoUrl: null,
  videoMeta: {
    name: "",
    width: 0,
    height: 0,
    duration: 0,
    sizeBytes: 0,
    fps: 30,
    aspectRatio: "16:9",
    aspectRatioVal: 16 / 9,
  },
  isPlaying: false,
  wakeLock: null,

  // Watermark
  watermarkFile: null,
  watermarkImage: null,
  watermarkLoaded: false,
  watermarkState: {
    x: 0.78, // Normalized coordinate (0 to 1)
    y: 0.78,
    scale: 0.18, // width as fraction of video width
    scaleY: null, // height as fraction of video height; null = keep PNG aspect ratio
    opacity: 0.85,
    margin: 0.04, // 4% edge margin
    rotation: 0, // degrees
    anchor: "bottom-right",
    stretchFullscreen: false,
  },

  // Canvas WYSIWYG Interaction
  drag: {
    active: false,
    mode: null, // 'move' | 'resize'
    handle: null, // 'tl' | 'tr' | 'bl' | 'br'
    freeStretch: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    initialScale: 0.18,
    initialScaleY: null,
    initialBounds: null,
    offsetX: 0,
    offsetY: 0,
  },

  // Export Settings
  exportSettings: {
    preset: "original",
    targetWidth: 0,
    targetHeight: 0,
    crf: 23,
    fitMode: "crop", // 'crop' (plein écran) | 'pad' (bandes noires)
    burnOverlays: false, // Guides informatifs par défaut (non gravés dans l'export)
  },

  // Active UI Overlay Guide
  activeOverlay: "none", // 'none' | 'tiktok' | 'shorts' | 'reels' | 'twitter' | 'universal'

  // Pipeline
  ffmpeg: null,
  isEncoding: false,
  encodingStartTime: 0,
  lastExportBlob: null,
  lastExportUrl: null,
  lastExportFilename: "FiLiGRA_Export.mp4",

  // Encode queue + silent folder save (File System Access)
  encodeQueue: [],
  queueRunning: false,
  activeQueueJobId: null,
  exportDirHandle: null,
  autoDownload: true,

  // Mobile Navigation
  activeMobileDrawer: null,
};

// ---------------------------------------------------------------------------
// 3. DOM Elements Cache
// ---------------------------------------------------------------------------
const els = {
  // Headers, Status & Burger Menu
  coiStatusPill: document.getElementById("coiStatusPill"),
  coiStatusText: document.getElementById("coiStatusText"),
  btnBurgerMenu: document.getElementById("btnBurgerMenu"),
  burgerDrawer: document.getElementById("burgerDrawer"),
  burgerBackdrop: document.getElementById("burgerBackdrop"),
  btnCloseBurger: document.getElementById("btnCloseBurger"),

  // Video Stage & Overlay Toolbar
  stageWrapper: document.getElementById("stageWrapper"),
  overlayToolbar: document.getElementById("overlayToolbar"),
  overlayPills: document.querySelectorAll(".btn-overlay-pill"),
  overlaySafeStatus: document.getElementById("overlaySafeStatus"),
  overlaySafeText: document.getElementById("overlaySafeText"),
  chkBurnOverlay: document.getElementById("chkBurnOverlay"),
  chkBurnOverlayMobile: null,
  videoDropzone: document.getElementById("videoDropzone"),
  btnBrowseVideo: document.getElementById("btnBrowseVideo"),
  videoFileInput: document.getElementById("videoFileInput"),
  sourceVideo: document.getElementById("sourceVideo"),
  canvasContainer: document.getElementById("canvasContainer"),
  previewCanvas: document.getElementById("previewCanvas"),
  stageControls: document.getElementById("stageControls"),
  videoScrubber: document.getElementById("videoScrubber"),
  timecodeDisplay: document.getElementById("timecodeDisplay"),
  btnPlayPause: document.getElementById("btnPlayPause"),
  iconPlay: document.getElementById("iconPlay"),
  iconPause: document.getElementById("iconPause"),
  labelPlay: document.getElementById("labelPlay"),
  btnStepBack: document.getElementById("btnStepBack"),
  btnStepForward: document.getElementById("btnStepForward"),
  btnResetWmPos: document.getElementById("btnResetWmPos"),
  btnChangeVideo: document.getElementById("btnChangeVideo"),
  videoMetaChips: document.getElementById("videoMetaChips"),
  chipResolution: document.getElementById("chipResolution"),
  chipFps: document.getElementById("chipFps"),
  chipDuration: document.getElementById("chipDuration"),
  chipSize: document.getElementById("chipSize"),

  // Watermark Studio
  wmDropzone: document.getElementById("wmDropzone"),
  wmThumbBox: document.getElementById("wmThumbBox"),
  wmFileInput: document.getElementById("wmFileInput"),
  wmFileName: document.getElementById("wmFileName"),
  wmMetaText: document.getElementById("wmMetaText"),
  autoScaleBadge: document.getElementById("autoScaleBadge"),
  anchorButtons: document.querySelectorAll(".btn-anchor"),
  btnSnapSafeZone: document.getElementById("btnSnapSafeZone"),
  btnWmFullscreen: document.getElementById("btnWmFullscreen"),
  sliderScale: document.getElementById("sliderScale"),
  valScale: document.getElementById("valScale"),
  sliderOpacity: document.getElementById("sliderOpacity"),
  valOpacity: document.getElementById("valOpacity"),
  sliderMargin: document.getElementById("sliderMargin"),
  valMargin: document.getElementById("valMargin"),
  sliderRotation: document.getElementById("sliderRotation"),
  valRotation: document.getElementById("valRotation"),

  // Export Settings & Weight
  presetButtons: document.querySelectorAll(".btn-preset"),
  targetResBadge: document.getElementById("targetResBadge"),
  fitModeWrapper: document.getElementById("fitModeWrapper"),
  fitModeButtons: document.querySelectorAll(".btn-fit-mode"),
  fitModeLabel: document.getElementById("fitModeLabel"),
  sliderCrf: document.getElementById("sliderCrf"),
  valCrf: document.getElementById("valCrf"),
  weightEstimatedValue: document.getElementById("weightEstimatedValue"),
  weightSourceCompare: document.getElementById("weightSourceCompare"),
  weightDiffBadge: document.getElementById("weightDiffBadge"),
  weightBarFill: document.getElementById("weightBarFill"),

  // Pipeline Action & Console
  btnExportVideo: document.getElementById("btnExportVideo"),
  iconExportWasm: document.getElementById("iconExportWasm"),
  iconExportSpinner: document.getElementById("iconExportSpinner"),
  labelBtnExport: document.getElementById("labelBtnExport"),
  queueFileInput: document.getElementById("queueFileInput"),
  btnAddToQueue: document.getElementById("btnAddToQueue"),
  btnQueueCurrent: document.getElementById("btnQueueCurrent"),
  btnStartQueue: document.getElementById("btnStartQueue"),
  btnClearQueue: document.getElementById("btnClearQueue"),
  btnPickExportDir: document.getElementById("btnPickExportDir"),
  exportDirLabel: document.getElementById("exportDirLabel"),
  queueList: document.getElementById("queueList"),
  queueCountBadge: document.getElementById("queueCountBadge"),
  progressStatusText: document.getElementById("progressStatusText"),
  progressDot: document.getElementById("progressDot"),
  progressPercent: document.getElementById("progressPercent"),
  progressFill: document.getElementById("progressFill"),
  statTimeElapsed: document.getElementById("statTimeElapsed"),
  statFpsSpeed: document.getElementById("statFpsSpeed"),
  statStage: document.getElementById("statStage"),
  successBanner: document.getElementById("successBanner"),
  btnDownloadAgain: document.getElementById("btnDownloadAgain"),
  consoleHeader: document.getElementById("consoleHeader"),
  consoleBody: document.getElementById("consoleBody"),
  iconChevronConsole: document.getElementById("iconChevronConsole"),
  logCount: document.getElementById("logCount"),

  // Mobile Nav Dock & Drawers
  mobileNavDock: document.getElementById("mobileNavDock"),
  mobileSheetBackdrop: document.getElementById("mobileSheetBackdrop"),
  dockTabs: document.querySelectorAll(".btn-dock-tab"),
  drawerCloseButtons: document.querySelectorAll("[data-close-drawer]"),
  cardWatermarkStudio: document.getElementById("cardWatermarkStudio"),
  cardExportSettings: document.getElementById("cardExportSettings"),
  cardGuidesSheet: null,
  cardPipelineAction: document.getElementById("cardPipelineAction"),
  btnSnapSafeZoneMobile: null,

  // PWA install / help
  btnInstallPwa: document.getElementById("btnInstallPwa"),
  helpInstallIos: document.getElementById("helpInstallIos"),
  helpInstallDone: document.getElementById("helpInstallDone"),
  helpInstallFallback: document.getElementById("helpInstallFallback"),

  // Display preference
  chkForceDesktop: document.getElementById("chkForceDesktop"),
  viewportMeta: document.getElementById("viewportMeta"),

  // Toast
  toastNotice: document.getElementById("toastNotice"),
  toastMessage: document.getElementById("toastMessage"),
};

const ctx = els.previewCanvas.getContext("2d", { willReadFrequently: true });
let logCounter = 0;
let progressTimerInterval = null;

// ---------------------------------------------------------------------------
// 4. Initialization & COOP/COEP Verification
// ---------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  // UI first — never block the burger / dock behind a CDN hang.
  checkIsolationStatus();
  initEventListeners();
  initPwaInstall();
  initDisplayPreference();
  initDefaultWatermarkFallback();
  initWakeLock();
  initExportDirPersistence();
  updatePredictiveWeight();
  renderQueueList();

  ensureFFmpegDependencies()
    .then(() => {
      appendLog("[Système] Dépendances FFmpeg prêtes.");
    })
    .catch((err) => {
      console.warn("[FiLiGRA] FFmpeg init:", err);
      appendLog("[Système] FFmpeg non disponible pour le moment.");
    });
});

/** Keep the screen on in browser + installed PWA (Wake Lock API). */
function initWakeLock() {
  if (!("wakeLock" in navigator)) {
    appendLog("[Wake Lock] Non supporté sur ce navigateur.");
    return;
  }

  const acquire = async () => {
    if (document.visibilityState !== "visible") return;
    try {
      if (state.wakeLock) {
        try {
          await state.wakeLock.release();
        } catch (_) {}
        state.wakeLock = null;
      }
      state.wakeLock = await navigator.wakeLock.request("screen");
      state.wakeLock.addEventListener("release", () => {
        state.wakeLock = null;
      });
      appendLog("[Wake Lock] Écran maintenu allumé.");
    } catch (err) {
      console.warn("[FiLiGRA] Wake Lock:", err);
    }
  };

  acquire();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") acquire();
  });
  window.addEventListener("focus", acquire);
}

/** Snap measured fps to common broadcast / phone rates. */
function normalizeFps(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 30;
  const candidates = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
  let best = 30;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = Math.abs(c - n);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  // Prefer integer labels when close (29.97→30 display still stores 30 if closer... keep 29.97 if within 0.2)
  if (bestDist > 3) return Math.round(n * 1000) / 1000;
  return best;
}

function formatFpsLabel(fps) {
  if (!fps) return "30";
  if (Math.abs(fps - 23.976) < 0.02) return "23.976";
  if (Math.abs(fps - 29.97) < 0.02) return "29.97";
  if (Math.abs(fps - 59.94) < 0.02) return "59.94";
  if (Number.isInteger(fps)) return String(fps);
  return String(Math.round(fps * 100) / 100);
}

function updateFpsChip() {
  if (!els.chipFps) return;
  const label = formatFpsLabel(state.videoMeta.fps);
  els.chipFps.innerHTML = `<strong>${label} fps</strong>`;
}

/**
 * Estimate fps via requestVideoFrameCallback while the clip plays briefly.
 * Falls back to 30 if the API is missing.
 */
function detectFpsFromElement(video) {
  return new Promise((resolve) => {
    const fallback = () => resolve(30);
    if (!video || typeof video.requestVideoFrameCallback !== "function") {
      fallback();
      return;
    }

    let frames = 0;
    let startMedia = null;
    let done = false;
    const finish = (fps) => {
      if (done) return;
      done = true;
      try {
        video.pause();
      } catch (_) {}
      resolve(normalizeFps(fps));
    };

    const timeout = setTimeout(() => finish(frames > 1 && startMedia != null ? frames / Math.max(0.05, (video.currentTime || 0) - startMedia) : 30), 1600);

    const onFrame = (_now, meta) => {
      if (done) return;
      if (startMedia == null) startMedia = meta.mediaTime;
      frames++;
      const elapsed = meta.mediaTime - startMedia;
      if (elapsed >= 0.45 && frames >= 8) {
        clearTimeout(timeout);
        finish(frames / Math.max(0.05, elapsed));
        return;
      }
      video.requestVideoFrameCallback(onFrame);
    };

    video.requestVideoFrameCallback(onFrame);
    const playP = video.play();
    if (playP && typeof playP.catch === "function") {
      playP.catch(() => {
        clearTimeout(timeout);
        fallback();
      });
    }
  });
}

/** Parse fps from FFmpeg -i probe logs (most reliable). */
function parseFpsFromFfmpegLog(text) {
  if (!text) return null;
  // Prefer explicit "XX fps" on a Video stream line
  const videoLine = text.match(/Video:[\s\S]{0,180}?(\d+(?:\.\d+)?)\s*fps/i);
  if (videoLine) return normalizeFps(parseFloat(videoLine[1]));
  const fps = text.match(/(\d+(?:\.\d+)?)\s*fps/i);
  if (fps) return normalizeFps(parseFloat(fps[1]));
  const tbr = text.match(/(\d+(?:\.\d+)?)\s*tbr/i);
  if (tbr) return normalizeFps(parseFloat(tbr[1]));
  const rate = text.match(/(\d+)\/(\d+)/);
  if (rate) {
    const a = parseFloat(rate[1]);
    const b = parseFloat(rate[2]);
    if (b > 0) return normalizeFps(a / b);
  }
  return null;
}

async function probeSourceFpsWithFFmpeg(ffmpeg) {
  let buf = "";
  let collecting = true;
  const onLog = ({ message }) => {
    if (collecting) buf += `${message}\n`;
  };
  ffmpeg.on("log", onLog);
  try {
    // -i alone exits with error but prints stream info
    await ffmpeg.exec(["-hide_banner", "-i", "input_source.mp4"]);
  } catch (_) {
    // expected: no output file
  }
  collecting = false;
  return parseFpsFromFfmpegLog(buf);
}

function checkIsolationStatus() {
  const isIsolated = window.crossOriginIsolated === true;
  if (els.coiStatusPill && els.coiStatusText) {
    els.coiStatusPill.classList.toggle("is-ok", isIsolated);
    els.coiStatusPill.classList.toggle("is-warn", !isIsolated);
    els.coiStatusText.textContent = isIsolated
      ? "Encodage multi-threads"
      : "Encodage mono-thread";
  }
  if (isIsolated) {
    appendLog("[Système] Environnement isolé Cross-Origin. Accélération multi-threads disponible.");
  } else {
    appendLog("[Système] Isolation Cross-Origin en attente (rechargement Service Worker).");
  }
}

// ---------------------------------------------------------------------------
// 4b. Display preference: force the desktop layout on small screens
// ---------------------------------------------------------------------------
const FORCE_DESKTOP_KEY = "filigra:force-desktop";

function initDisplayPreference() {
  if (!els.chkForceDesktop) return;

  let forced = false;
  try {
    forced = localStorage.getItem(FORCE_DESKTOP_KEY) === "1";
  } catch (e) {}
  els.chkForceDesktop.checked = forced;

  els.chkForceDesktop.addEventListener("change", () => {
    const enabled = els.chkForceDesktop.checked;
    try {
      localStorage.setItem(FORCE_DESKTOP_KEY, enabled ? "1" : "0");
    } catch (e) {}

    // Widening the viewport re-evaluates the responsive breakpoints; a reload
    // is still needed because the mobile sheets cache their layout on open.
    if (els.viewportMeta) {
      els.viewportMeta.setAttribute(
        "content",
        enabled ? "width=1280" : "width=device-width, initial-scale=1.0, viewport-fit=cover"
      );
    }
    showToast(enabled ? "Interface desktop activée" : "Interface mobile restaurée");
    window.setTimeout(() => window.location.reload(), 600);
  });
}

// ---------------------------------------------------------------------------
// 5. Toast & Logs Utilities
// ---------------------------------------------------------------------------
let toastTimeout = null;
function showToast(message, duration = 3200) {
  if (toastTimeout) clearTimeout(toastTimeout);
  els.toastMessage.textContent = message;
  els.toastNotice.classList.add("show");
  toastTimeout = setTimeout(() => {
    els.toastNotice.classList.remove("show");
  }, duration);
}

function appendLog(message) {
  if (!message) return;
  logCounter++;
  els.logCount.textContent = logCounter;
  const line = document.createElement("div");
  line.className = "console-log-line";
  line.textContent = message;
  els.consoleBody.appendChild(line);
  els.consoleBody.scrollTop = els.consoleBody.scrollHeight;
}

// ---------------------------------------------------------------------------
// 6. Video Ingestion & Metadata Analysis
// ---------------------------------------------------------------------------
function initEventListeners() {
  // Video Ingestion
  const openVideoPicker = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    els.videoFileInput.value = "";
    els.videoFileInput.click();
  };

  els.btnBrowseVideo.addEventListener("click", openVideoPicker);
  // Clic sur la zone (pas sur le bouton — sinon double .click() qui annule le dialog)
  els.videoDropzone.addEventListener("click", (e) => {
    if (e.target.closest("#btnBrowseVideo")) return;
    openVideoPicker(e);
  });
  if (els.btnChangeVideo) {
    els.btnChangeVideo.addEventListener("click", openVideoPicker);
  }
  els.videoFileInput.addEventListener("change", handleVideoSelect);

  // Drag & Drop for Video (overlay + stage)
  setupDropzone(els.videoDropzone, handleVideoFile);
  setupDropzone(els.stageWrapper, handleVideoFile);

  // Video Scrubber & Playback Controls
  els.btnPlayPause.addEventListener("click", togglePlayPause);
  els.sourceVideo.addEventListener("timeupdate", onVideoTimeUpdate);
  els.sourceVideo.addEventListener("ended", () => setPlayState(false));
  els.videoScrubber.addEventListener("input", onScrubberInput);
  els.btnStepBack.addEventListener("click", () => stepVideoTime(-1));
  els.btnStepForward.addEventListener("click", () => stepVideoTime(1));
  els.btnResetWmPos.addEventListener("click", () => applyAnchor("center"));

  // Watermark Ingestion
  els.wmDropzone.addEventListener("click", () => els.wmFileInput.click());
  els.wmFileInput.addEventListener("change", handleWatermarkSelect);
  setupDropzone(els.wmDropzone, handleWatermarkFile);

  // Watermark Anchors
  els.anchorButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const anchor = btn.dataset.anchor;
      applyAnchor(anchor);
    });
  });

  // Watermark Sliders
  els.sliderScale.addEventListener("input", (e) => {
    const val = parseInt(e.target.value, 10);
    state.watermarkState.stretchFullscreen = false;
    state.watermarkState.scaleY = null; // revenir au ratio PNG
    state.watermarkState.scale = val / 100;
    els.valScale.textContent = `${val}%`;
    state.watermarkState.anchor = "custom";
    updateAnchorButtonsUI();
    clampWatermarkPosition();
    renderCanvas();
  });

  els.sliderOpacity.addEventListener("input", (e) => {
    const val = parseInt(e.target.value, 10);
    state.watermarkState.opacity = val / 100;
    els.valOpacity.textContent = `${val}%`;
    renderCanvas();
  });

  els.sliderMargin.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    state.watermarkState.margin = val / 100;
    els.valMargin.textContent = `${val}%`;
    if (state.watermarkState.anchor !== "custom") {
      applyAnchor(state.watermarkState.anchor);
    } else {
      renderCanvas();
    }
  });

  els.sliderRotation.addEventListener("input", (e) => {
    const val = parseInt(e.target.value, 10);
    state.watermarkState.rotation = val;
    els.valRotation.textContent = `${val}°`;
    renderCanvas();
  });

  // Export Presets
  els.presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      els.presetButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.exportSettings.preset = btn.dataset.preset;

      // Auto-sélection du calque d'overlay UI selon le format social choisi
      if (btn.dataset.preset === "vertical-9-16" || btn.dataset.preset === "tiktok") {
        setOverlayGuide("tiktok");
      } else if (btn.dataset.preset === "shorts") {
        setOverlayGuide("shorts");
      } else if (btn.dataset.preset === "portrait-4-5" || btn.dataset.preset === "reels" || btn.dataset.preset === "insta-post") {
        setOverlayGuide("reels");
      } else if (btn.dataset.preset === "twitter") {
        setOverlayGuide("twitter");
      } else if (btn.dataset.preset === "square-1-1" || btn.dataset.preset === "1:1") {
        setOverlayGuide("none");
      } else if (btn.dataset.preset === "original" || btn.dataset.preset === "1080p") {
        setOverlayGuide("none");
      }

      updateTargetResolution();
      updatePredictiveWeight();
      renderCanvas();
    });
  });

  // Overlay Pills Selector (Sync across stage toolbar and mobile drawer)
  els.overlayPills.forEach((btn) => {
    btn.addEventListener("click", () => {
      setOverlayGuide(btn.dataset.overlay);
      renderCanvas();
    });
  });

  // Snap to Safe Zone Button (Desktop stage)
  if (els.btnSnapSafeZone) {
    els.btnSnapSafeZone.addEventListener("click", () => {
      // Positionne le watermark en haut à gauche (zone 100% dégagée de tous les boutons sociaux)
      state.watermarkState.stretchFullscreen = false;
      state.watermarkState.scaleY = null;
      state.watermarkState.x = 0.08;
      state.watermarkState.y = 0.14;
      state.watermarkState.anchor = "custom";
      updateAnchorButtonsUI();
      clampWatermarkPosition();
      renderCanvas();
      showToast("Filigrane repositionné dans la zone 100% sûre");
    });
  }

  if (els.btnWmFullscreen) {
    els.btnWmFullscreen.addEventListener("click", () => {
      applyWatermarkFullscreen(true);
    });
  }

  // Fit / Crop Mode Framing Toggle
  els.fitModeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      els.fitModeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.exportSettings.fitMode = btn.dataset.fit;
      if (els.fitModeLabel) {
        els.fitModeLabel.textContent =
          btn.dataset.fit === "crop"
            ? "Remplir (Plein écran)"
            : "Ajuster (Bandes noires)";
      }
      renderCanvas();
    });
  });

  // CRF Quality Slider
  els.sliderCrf.addEventListener("input", (e) => {
    const val = parseInt(e.target.value, 10);
    state.exportSettings.crf = val;
    let desc = "Équilibré";
    if (val <= 20) desc = "Quasi sans perte";
    else if (val <= 24) desc = "Optimal";
    else if (val <= 28) desc = "Compressé";
    else desc = "Forte compression";
    els.valCrf.textContent = `${val} (${desc})`;
    updatePredictiveWeight();
  });

  // Interactive WYSIWYG Canvas Pointer Events
  initCanvasPointerEvents();

  // Export Action
  els.btnExportVideo.addEventListener("click", () => startFFmpegExport());
  els.btnDownloadAgain.addEventListener("click", () => {
    autoSaveOrDownload(state.lastExportBlob, state.lastExportFilename);
  });

  if (els.btnAddToQueue && els.queueFileInput) {
    els.btnAddToQueue.addEventListener("click", () => els.queueFileInput.click());
    els.queueFileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = "";
      enqueueVideoFiles(files);
    });
  }
  if (els.btnQueueCurrent) {
    els.btnQueueCurrent.addEventListener("click", () => {
      if (!state.videoFile) {
        showToast("Chargez d’abord une vidéo.");
        return;
      }
      enqueueVideoFiles([state.videoFile]);
    });
  }
  if (els.btnStartQueue) {
    els.btnStartQueue.addEventListener("click", () => processEncodeQueue());
  }
  if (els.btnClearQueue) {
    els.btnClearQueue.addEventListener("click", () => {
      state.encodeQueue = state.encodeQueue.filter((j) => j.status === "running");
      renderQueueList();
      showToast("File vidée");
    });
  }
  if (els.btnPickExportDir) {
    els.btnPickExportDir.addEventListener("click", () => pickExportDirectory());
  }

  // Console Accordion Toggle
  els.consoleHeader.addEventListener("click", () => {
    const isVisible = els.consoleBody.style.display !== "none";
    els.consoleBody.style.display = isVisible ? "none" : "block";
    els.iconChevronConsole.style.transform = isVisible ? "rotate(-90deg)" : "rotate(0deg)";
  });

  // Burger Menu — handlers live in the inline script (index.html).
  // Keep a thin bridge so Escape / mobile sheets stay in sync.
  // (Do not re-bind click here or the drawer would toggle twice.)

  // Overlay Burn Toggle
  const handleBurnToggle = (e) => {
    const isChecked = e.target.checked;
    state.exportSettings.burnOverlays = isChecked;
    if (els.chkBurnOverlay) els.chkBurnOverlay.checked = isChecked;
    appendLog(`[Option] Incrustation des repères UI dans l'export : ${isChecked ? "ACTIVÉE" : "DÉSACTIVÉE (par défaut)"}`);
  };

  if (els.chkBurnOverlay) {
    els.chkBurnOverlay.addEventListener("change", handleBurnToggle);
  }

  // Escape key closes mobile drawers (burger Escape is handled inline)
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllMobileDrawers();
    }
  });

  // Mobile Bottom Navigation Dock & Drawers
  initMobileNavigation();
}

function toggleBurgerDrawer(isOpen) {
  if (typeof window.filigraToggleBurger === "function") {
    window.filigraToggleBurger(isOpen);
    return;
  }
  if (!els.burgerDrawer || !els.burgerBackdrop) return;
  if (isOpen) {
    closeAllMobileDrawers();
    els.burgerDrawer.classList.add("open");
    els.burgerBackdrop.classList.add("open");
    els.burgerBackdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("burger-open");
  } else {
    els.burgerDrawer.classList.remove("open");
    els.burgerBackdrop.classList.remove("open");
    els.burgerBackdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("burger-open");
  }
}

function initMobileNavigation() {
  if (!els.mobileNavDock) return;

  const drawerMap = {
    watermark: els.cardWatermarkStudio,
    format: els.cardExportSettings,
    export: els.cardPipelineAction,
  };

  els.dockTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      const targetCard = drawerMap[tab];
      if (!targetCard) return;

      const isCurrentlyOpen = targetCard.classList.contains("mobile-sheet-open");

      closeAllMobileDrawers();

      if (!isCurrentlyOpen) {
        targetCard.classList.add("mobile-sheet-open");
        if (els.mobileSheetBackdrop) els.mobileSheetBackdrop.classList.add("active");
        btn.classList.add("active");
        state.activeMobileDrawer = tab;
      }
    });
  });

  els.drawerCloseButtons.forEach((btn) => {
    btn.addEventListener("click", closeAllMobileDrawers);
  });

  if (els.mobileSheetBackdrop) {
    els.mobileSheetBackdrop.addEventListener("click", closeAllMobileDrawers);
  }
}

function closeAllMobileDrawers() {
  const cards = [
    els.cardWatermarkStudio,
    els.cardExportSettings,
    els.cardPipelineAction,
  ];
  cards.forEach((c) => c && c.classList.remove("mobile-sheet-open"));
  if (els.mobileSheetBackdrop) els.mobileSheetBackdrop.classList.remove("active");
  els.dockTabs.forEach((b) => b.classList.remove("active"));
  state.activeMobileDrawer = null;
}

let deferredInstallPrompt = null;

function isStandaloneDisplay() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function initPwaInstall() {
  const btn = els.btnInstallPwa;
  const iosBox = els.helpInstallIos;
  const done = els.helpInstallDone;
  const fallback = els.helpInstallFallback;

  const showInstalled = () => {
    if (btn) btn.hidden = true;
    if (iosBox) iosBox.hidden = true;
    if (fallback) fallback.hidden = true;
    if (done) done.hidden = false;
  };

  if (isStandaloneDisplay()) {
    showInstalled();
    return;
  }

  if (done) done.hidden = true;
  // Le bouton reste toujours visible hors mode installé / iOS
  if (btn) btn.hidden = false;

  if (isIosDevice()) {
    if (btn) btn.hidden = true;
    if (iosBox) iosBox.hidden = false;
    if (fallback) fallback.hidden = true;
  } else {
    if (iosBox) iosBox.hidden = true;
    // Consigne manuelle visible tant que le prompt natif n'est pas capturé
    if (fallback) fallback.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btn) {
      btn.hidden = false;
      btn.disabled = false;
      btn.textContent = "Installer FiLiGRA";
    }
    if (fallback) fallback.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    showInstalled();
    showToast("FiLiGRA installée sur l'écran d'accueil");
  });

  if (btn) {
    btn.addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        if (choice.outcome === "accepted") {
          showInstalled();
        }
        return;
      }
      if (isIosDevice()) {
        if (iosBox) iosBox.hidden = false;
        showToast("Sur iOS : Partager → Sur l’écran d’accueil");
        return;
      }
      if (fallback) fallback.hidden = false;
      showToast("Ouvrez le menu du navigateur → Installer l’application");
    });
  }
}

function setupDropzone(zoneEl, onDropFile) {
  if (!zoneEl) return;

  ["dragenter", "dragover"].forEach((eventName) => {
    zoneEl.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.add("dragover");
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });
  });

  zoneEl.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Ne retire le style que si on quitte vraiment la zone (pas un enfant)
    if (!zoneEl.contains(e.relatedTarget)) {
      zoneEl.classList.remove("dragover");
    }
  });

  zoneEl.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.remove("dragover");
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      onDropFile(dt.files[0]);
    }
  });
}

function handleVideoSelect(e) {
  if (e.target.files && e.target.files[0]) {
    handleVideoFile(e.target.files[0]);
  }
}

function isVideoFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith("video/")) return true;
  // Windows / certains navigateurs laissent type vide — on se rabat sur l'extension
  return /\.(mp4|mov|webm|mkv|m4v|avi|mpeg|mpg|ogv)$/i.test(file.name || "");
}

async function handleVideoFile(file, options = {}) {
  const silent = options.silent === true;
  if (!isVideoFile(file)) {
    showToast("Veuillez sélectionner un fichier vidéo valide (MP4, MOV, WebM, MKV).");
    return Promise.reject(new Error("invalid video"));
  }

  state.videoFile = file;
  state.videoMeta.name = file.name.replace(/\.[^/.]+$/, "");
  state.videoMeta.sizeBytes = file.size;

  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = URL.createObjectURL(file);
  els.sourceVideo.src = state.videoUrl;
  els.sourceVideo.load();

  appendLog(`[Vidéo] Fichier chargé : ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} Mo)`);

  return new Promise((resolve, reject) => {
    els.sourceVideo.onerror = () => reject(new Error("video load failed"));
    els.sourceVideo.onloadedmetadata = () => {
      const w = els.sourceVideo.videoWidth || 1920;
      const h = els.sourceVideo.videoHeight || 1080;
      const dur = els.sourceVideo.duration || 1;

      state.videoMeta.width = w;
      state.videoMeta.height = h;
      state.videoMeta.duration = dur;
      state.videoMeta.aspectRatioVal = w / h;

      const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
      const divisor = gcd(w, h);
      const simplified = `${Math.round(w / divisor)}:${Math.round(h / divisor)}`;
      state.videoMeta.aspectRatio = simplified;

      els.previewCanvas.width = w;
      els.previewCanvas.height = h;

      els.chipResolution.innerHTML = `<strong>${w}×${h}</strong> (${simplified})`;
      els.chipDuration.innerHTML = `<strong>${formatTime(dur)}</strong>`;
      els.chipSize.innerHTML = `<strong>${(file.size / (1024 * 1024)).toFixed(1)} Mo</strong>`;
      state.videoMeta.fps = 30;
      updateFpsChip();
      if (els.videoMetaChips) els.videoMetaChips.style.display = "flex";

      els.videoScrubber.min = 0;
      els.videoScrubber.max = dur;
      els.videoScrubber.value = 0;
      els.timecodeDisplay.textContent = `00:00 / ${formatTime(dur)}`;

      els.videoDropzone.style.display = "none";
      els.canvasContainer.style.display = "flex";
      els.stageControls.style.display = "flex";
      if (els.overlayToolbar) els.overlayToolbar.style.display = "flex";
      els.btnExportVideo.disabled = state.isEncoding;

      const seekPreview = () => {
        try {
          els.sourceVideo.pause();
        } catch (_) {}
        state.isPlaying = false;
        if (els.iconPlay) els.iconPlay.style.display = "block";
        if (els.iconPause) els.iconPause.style.display = "none";
        els.sourceVideo.currentTime = 0.01;
        els.sourceVideo.onseeked = () => {
          renderCanvas();
        };
      };

      const finishSetup = () => {
        if (state.watermarkLoaded) {
          applyAdaptiveWatermarkScaling();
        } else {
          applyAnchor(state.watermarkState.anchor);
        }
        updateTargetResolution();
        updatePredictiveWeight();
        if (!silent) {
          showToast(`Vidéo importée : ${w}×${h} (${formatTime(dur)})`);
        }
        resolve();
      };

      if (options.skipFpsDetect) {
        seekPreview();
        finishSetup();
        return;
      }

      detectFpsFromElement(els.sourceVideo)
        .then((fps) => {
          if (!state.videoFile) return;
          state.videoMeta.fps = fps;
          updateFpsChip();
          appendLog(`[Vidéo] Cadence source détectée : ${formatFpsLabel(fps)} fps`);
          updatePredictiveWeight();
          seekPreview();
          finishSetup();
        })
        .catch(() => {
          seekPreview();
          finishSetup();
        });
    };
  });
}

// ---------------------------------------------------------------------------
// 7. Video Playback & Scrubber Controls
// ---------------------------------------------------------------------------
function togglePlayPause() {
  if (!state.videoFile) return;
  if (state.isPlaying) {
    els.sourceVideo.pause();
    setPlayState(false);
  } else {
    els.sourceVideo.play().then(() => setPlayState(true)).catch((e) => console.warn(e));
  }
}

function setPlayState(playing) {
  state.isPlaying = playing;
  els.iconPlay.style.display = playing ? "none" : "block";
  els.iconPause.style.display = playing ? "block" : "none";
  els.labelPlay.textContent = playing ? "Pause" : "Lire";
}

function onVideoTimeUpdate() {
  if (!els.sourceVideo.duration) return;
  els.videoScrubber.value = els.sourceVideo.currentTime;
  els.timecodeDisplay.textContent = `${formatTime(els.sourceVideo.currentTime)} / ${formatTime(state.videoMeta.duration)}`;
  renderCanvas();
}

function onScrubberInput(e) {
  const targetTime = parseFloat(e.target.value);
  els.sourceVideo.currentTime = targetTime;
  els.timecodeDisplay.textContent = `${formatTime(targetTime)} / ${formatTime(state.videoMeta.duration)}`;
  renderCanvas();
}

function stepVideoTime(seconds) {
  if (!els.sourceVideo.duration) return;
  const newTime = Math.max(0, Math.min(state.videoMeta.duration, els.sourceVideo.currentTime + seconds));
  els.sourceVideo.currentTime = newTime;
  els.videoScrubber.value = newTime;
  renderCanvas();
}

function formatTime(sec) {
  if (isNaN(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// 8. Watermark Management & Adaptive Scaling
// ---------------------------------------------------------------------------
function handleWatermarkSelect(e) {
  if (e.target.files && e.target.files[0]) {
    handleWatermarkFile(e.target.files[0]);
  }
}

function handleWatermarkFile(file) {
  if (!file || (!file.type.includes("png") && !file.type.includes("webp") && !file.type.includes("svg"))) {
    showToast("Veuillez importer une image transparente (PNG ou WebP).");
    return;
  }

  state.watermarkFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      state.watermarkImage = img;
      state.watermarkLoaded = true;

      // Update thumbnail preview
      els.wmThumbBox.innerHTML = "";
      const thumb = img.cloneNode();
      els.wmThumbBox.appendChild(thumb);
      els.wmFileName.textContent = file.name;
      els.wmMetaText.textContent = `${img.naturalWidth}×${img.naturalHeight} px (Alpha OK)`;

      appendLog(`[Filigrane] Logo chargé : ${file.name} (${img.naturalWidth}×${img.naturalHeight}px)`);

      // Adaptive scaling test
      applyAdaptiveWatermarkScaling();
      renderCanvas();
      showToast("Filigrane chargé avec succès !");
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

async function initDefaultWatermarkFallback() {
  try {
    const res = await fetch("filigra_logo.png");
    if (!res.ok) throw new Error("filigra_logo.png not found");
    const blob = await res.blob();
    state.watermarkFile = new File([blob], "filigra_logo.png", { type: "image/png" });
    const img = new Image();
    img.onload = () => {
      state.watermarkImage = img;
      state.watermarkLoaded = true;
      els.wmThumbBox.innerHTML = "";
      els.wmThumbBox.appendChild(img.cloneNode());
      els.wmFileName.textContent = "Logo FiLiGRA officiel";
      els.wmMetaText.textContent = `${img.naturalWidth}×${img.naturalHeight} px (Alpha OK)`;
      applyAnchor("bottom-right");
      renderCanvas();
      appendLog(`[FiLiGRA] Logo officiel FiLiGRA initialisé (${img.naturalWidth}×${img.naturalHeight}px).`);
    };
    img.src = URL.createObjectURL(blob);
  } catch (e) {
    // Vector fallback with FiLiGRA cyan/purple styling
    const svgMarkup = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="120" viewBox="0 0 400 120">
        <defs>
          <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#00f2fe"/>
            <stop offset="100%" stop-color="#4facfe"/>
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="388" height="108" rx="24" fill="rgba(8, 5, 9, 0.88)" stroke="url(#g)" stroke-width="3"/>
        <text x="200" y="74" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-size="38" font-weight="900" fill="#00f2fe" letter-spacing="3">FiLiGRA</text>
      </svg>
    `;
    const blob = new Blob([svgMarkup], { type: "image/svg+xml" });
    state.watermarkFile = new File([blob], "filigra-watermark-default.png", { type: "image/png" });
    const img = new Image();
    img.onload = () => {
      state.watermarkImage = img;
      state.watermarkLoaded = true;
      els.wmThumbBox.innerHTML = "";
      els.wmThumbBox.appendChild(img.cloneNode());
      els.wmFileName.textContent = "Filigrane FiLiGRA";
      els.wmMetaText.textContent = "400×120 px (Prêt)";
      applyAnchor("bottom-right");
      renderCanvas();
    };
    img.src = URL.createObjectURL(blob);
  }
}

/**
 * Auto sizing:
 * - Same (or near) pixel size as the video → stretch fullscreen
 * - Otherwise keep a readable default (~18% width) when the PNG is tiny/huge
 */
function applyAdaptiveWatermarkScaling() {
  if (!state.watermarkLoaded || !state.watermarkImage) return;

  const videoW = state.videoMeta.width || els.previewCanvas.width || 1920;
  const videoH = state.videoMeta.height || els.previewCanvas.height || 1080;
  const ww = state.watermarkImage.naturalWidth;
  const wh = state.watermarkImage.naturalHeight;

  if (isNearExactResolution(videoW, videoH, ww, wh)) {
    applyWatermarkFullscreen(true);
    if (els.autoScaleBadge) els.autoScaleBadge.classList.add("visible");
    appendLog(
      `[Auto-Sizing] PNG ${ww}×${wh} ≈ vidéo ${videoW}×${videoH} → plein écran étiré.`
    );
    return;
  }

  const ratio = ww / videoW;
  if (ratio > 0.4 || ratio < 0.05) {
    state.watermarkState.stretchFullscreen = false;
    state.watermarkState.scaleY = null;
    state.watermarkState.scale = 0.18;
    els.sliderScale.value = 18;
    els.valScale.textContent = "18%";
    if (els.autoScaleBadge) els.autoScaleBadge.classList.add("visible");
    appendLog(
      `[Auto-Sizing] Ratio PNG/Vidéo ${(ratio * 100).toFixed(0)}%. Échelle à 18%.`
    );
  } else {
    if (els.autoScaleBadge) els.autoScaleBadge.classList.remove("visible");
  }

  applyAnchor(state.watermarkState.anchor || "bottom-right");
}

function isNearExactResolution(vw, vh, ww, wh) {
  return Math.abs(vw - ww) <= 4 && Math.abs(vh - wh) <= 4;
}

/** Stretch watermark to the full video frame (may distort aspect ratio). */
function applyWatermarkFullscreen(announce = false) {
  if (!state.watermarkLoaded || !state.watermarkImage) {
    showToast("Importez d’abord un filigrane PNG.");
    return;
  }
  state.watermarkState.stretchFullscreen = true;
  state.watermarkState.scale = 1;
  state.watermarkState.scaleY = 1;
  state.watermarkState.x = 0;
  state.watermarkState.y = 0;
  state.watermarkState.rotation = 0;
  state.watermarkState.anchor = "custom";
  els.sliderScale.value = 100;
  els.valScale.textContent = "100%";
  if (els.sliderRotation) {
    els.sliderRotation.value = 0;
    els.valRotation.textContent = "0°";
  }
  updateAnchorButtonsUI();
  renderCanvas();
  if (announce) {
    showToast("Plein écran — déplacez / pivotez pour dépasser le cadre");
    appendLog("[Filigrane] Plein écran : débordement et rotation autorisés.");
  }
}

// ---------------------------------------------------------------------------
// 9. Quick Anchor Positioning
// ---------------------------------------------------------------------------
function applyAnchor(anchorName) {
  if (!state.watermarkLoaded || !state.watermarkImage) return;
  if (state.watermarkState.stretchFullscreen) {
    state.watermarkState.stretchFullscreen = false;
    state.watermarkState.scaleY = null;
    if (state.watermarkState.scale >= 0.99) {
      state.watermarkState.scale = 0.18;
      els.sliderScale.value = 18;
      els.valScale.textContent = "18%";
    }
  }

  const canvasW = els.previewCanvas.width;
  const canvasH = els.previewCanvas.height;
  const margin = state.watermarkState.margin;
  const bounds = getWatermarkCanvasBounds();
  const normW = bounds.w / canvasW;
  const normH = bounds.h / canvasH;

  switch (anchorName) {
    case "top-left":
      state.watermarkState.x = margin;
      state.watermarkState.y = margin;
      break;
    case "top-right":
      state.watermarkState.x = 1 - margin - normW;
      state.watermarkState.y = margin;
      break;
    case "bottom-left":
      state.watermarkState.x = margin;
      state.watermarkState.y = 1 - margin - normH;
      break;
    case "bottom-right":
      state.watermarkState.x = 1 - margin - normW;
      state.watermarkState.y = 1 - margin - normH;
      break;
    case "center":
      state.watermarkState.x = 0.5 - normW / 2;
      state.watermarkState.y = 0.5 - normH / 2;
      break;
    default:
      break;
  }

  state.watermarkState.anchor = anchorName;
  updateAnchorButtonsUI();
  clampWatermarkPosition();
  renderCanvas();
}

function updateAnchorButtonsUI() {
  els.anchorButtons.forEach((btn) => {
    if (btn.dataset.anchor === state.watermarkState.anchor) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

/**
 * Soft clamp: the watermark may overflow the frame (shift / rotate a
 * full-bleed PNG). Keep a small overlap so it stays grabbable.
 */
function clampWatermarkPosition() {
  if (!state.watermarkLoaded || !state.watermarkImage) return;
  const canvasW = els.previewCanvas.width;
  const canvasH = els.previewCanvas.height;
  if (!canvasW || !canvasH) return;

  const bounds = getWatermarkCanvasBounds();
  if (!bounds) return;

  const keep = Math.max(
    48,
    Math.min(bounds.w, bounds.h, canvasW, canvasH) * 0.12
  );
  const minX = (keep - bounds.w) / canvasW;
  const maxX = (canvasW - keep) / canvasW;
  const minY = (keep - bounds.h) / canvasH;
  const maxY = (canvasH - keep) / canvasH;

  state.watermarkState.x = Math.max(minX, Math.min(maxX, state.watermarkState.x));
  state.watermarkState.y = Math.max(minY, Math.min(maxY, state.watermarkState.y));
}

function getWatermarkCanvasBounds() {
  if (!state.watermarkLoaded || !state.watermarkImage) return null;
  const canvasW = els.previewCanvas.width;
  const canvasH = els.previewCanvas.height;

  const wmAspect =
    state.watermarkImage.naturalWidth / Math.max(1, state.watermarkImage.naturalHeight);
  const w = canvasW * state.watermarkState.scale;
  const h =
    state.watermarkState.scaleY != null
      ? canvasH * state.watermarkState.scaleY
      : w / wmAspect;
  const x = canvasW * state.watermarkState.x;
  const y = canvasH * state.watermarkState.y;

  return { x, y, w, h, right: x + w, bottom: y + h };
}

function getWatermarkExportSize(outW, outH) {
  const w = Math.max(16, Math.round(outW * state.watermarkState.scale));
  let h;
  if (state.watermarkState.scaleY != null) {
    h = Math.max(16, Math.round(outH * state.watermarkState.scaleY));
  } else {
    const aspect =
      (state.watermarkImage.naturalHeight || 1) /
      Math.max(1, state.watermarkImage.naturalWidth || 1);
    h = Math.max(16, Math.round(w * aspect));
  }
  const x = Math.round(outW * state.watermarkState.x);
  const y = Math.round(outH * state.watermarkState.y);
  return { x, y, w, h };
}

/** Desktop (souris) vs mobile/tactile — pas basé sur la largeur fenêtre seule. */
function isTouchUi(pointerType) {
  if (pointerType === "touch") return true;
  if (typeof window.matchMedia !== "function") return false;
  if (window.matchMedia("(pointer: coarse)").matches) return true;
  if (window.matchMedia("(hover: none)").matches) return true;
  return false;
}

/** Half-size of the visible handle square, in canvas pixels. */
function getHandleVisualHalf(pointerType) {
  const touch = isTouchUi(pointerType);
  const hitR = getHandleHitRadius(pointerType);
  // Desktop : compact. Tactile : plus large mais plafonné pour ne pas manger le cadre.
  let half = Math.max(touch ? 12 : 7, hitR * (touch ? 0.48 : 0.32));
  const canvas = els.previewCanvas;
  const minDim = Math.min(canvas.width, canvas.height);
  const maxHalf = minDim * (touch ? 0.048 : 0.022);
  return Math.min(half, Math.max(touch ? 12 : 7, maxHalf));
}

/**
 * Hit target in canvas pixels.
 * Desktop ~24–28 CSS px ; tactile ~52–56 CSS px (HIG / Material).
 */
function getHandleHitRadius(pointerType) {
  const canvas = els.previewCanvas;
  const rect = canvas.getBoundingClientRect();
  const touch = isTouchUi(pointerType);
  const screenTarget = touch ? 54 : 26;
  const scale = Math.max(
    canvas.width / Math.max(1, rect.width),
    canvas.height / Math.max(1, rect.height)
  );
  return Math.max(touch ? 28 : 14, screenTarget * scale);
}

/**
 * Corner + mid-edge handles, inset toward the watermark so fingers
 * don't miss targets glued to the canvas / screen edge (PWA / mobile).
 */
function getResizeHandles(bounds, pointerType) {
  const inset = Math.min(
    getHandleVisualHalf(pointerType),
    Math.max(6, Math.min(bounds.w, bounds.h) * (isTouchUi(pointerType) ? 0.18 : 0.1))
  );
  const x0 = bounds.x + inset;
  const y0 = bounds.y + inset;
  const x1 = bounds.right - inset;
  const y1 = bounds.bottom - inset;
  const cx = (bounds.x + bounds.right) / 2;
  const cy = (bounds.y + bounds.bottom) / 2;
  return [
    { id: "tl", x: x0, y: y0 },
    { id: "t", x: cx, y: y0 },
    { id: "tr", x: x1, y: y0 },
    { id: "l", x: x0, y: cy },
    { id: "r", x: x1, y: cy },
    { id: "bl", x: x0, y: y1 },
    { id: "b", x: cx, y: y1 },
    { id: "br", x: x1, y: y1 },
  ];
}

function hitTestResizeHandle(coords, bounds, pointerType) {
  const r = getHandleHitRadius(pointerType);
  let bestId = null;
  let bestDist = r;
  for (const h of getResizeHandles(bounds, pointerType)) {
    const d = Math.hypot(coords.x - h.x, coords.y - h.y);
    if (d <= bestDist) {
      bestDist = d;
      bestId = h.id;
    }
  }
  return bestId;
}

function handleMovesEdges(handle) {
  return {
    left: handle === "tl" || handle === "bl" || handle === "l",
    right: handle === "tr" || handle === "br" || handle === "r",
    top: handle === "tl" || handle === "tr" || handle === "t",
    bottom: handle === "bl" || handle === "br" || handle === "b",
  };
}

function cursorForHandle(handleId) {
  if (!handleId) return "crosshair";
  if (handleId === "t" || handleId === "b") return "ns-resize";
  if (handleId === "l" || handleId === "r") return "ew-resize";
  if (handleId === "tl" || handleId === "br") return "nwse-resize";
  return "nesw-resize";
}

// ---------------------------------------------------------------------------
// 10. Interactive WYSIWYG Canvas (Pointer Events & Gestures)
// ---------------------------------------------------------------------------
function initCanvasPointerEvents() {
  const canvas = els.previewCanvas;

  // passive:false so preventDefault blocks scroll/zoom while dragging on iOS PWA
  canvas.addEventListener("pointerdown", onCanvasPointerDown, { passive: false });
  canvas.addEventListener("pointermove", onCanvasPointerMove, { passive: false });
  canvas.addEventListener("pointerup", onCanvasPointerUp);
  canvas.addEventListener("pointercancel", onCanvasPointerUp);
  canvas.addEventListener("lostpointercapture", onCanvasPointerUp);
}

function getCanvasPointerCoords(e) {
  const canvas = els.previewCanvas;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

function onCanvasPointerDown(e) {
  if (!state.watermarkLoaded) return;
  const coords = getCanvasPointerCoords(e);
  const bounds = getWatermarkCanvasBounds();
  if (!bounds) return;

  const handleId = hitTestResizeHandle(coords, bounds, e.pointerType);

  if (handleId) {
    state.drag.active = true;
    state.drag.mode = "resize";
    state.drag.handle = handleId;
    state.drag.pointerId = e.pointerId;
    state.drag.startX = coords.x;
    state.drag.startY = coords.y;
    state.drag.initialScale = state.watermarkState.scale;
    state.drag.initialScaleY =
      state.watermarkState.scaleY != null
        ? state.watermarkState.scaleY
        : bounds.h / els.previewCanvas.height;
    state.drag.initialBounds = { ...bounds };
    state.drag.freeStretch =
      state.watermarkState.stretchFullscreen || state.watermarkState.scaleY != null;
    els.previewCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  } else if (
    coords.x >= bounds.x &&
    coords.x <= bounds.right &&
    coords.y >= bounds.y &&
    coords.y <= bounds.bottom
  ) {
    state.drag.active = true;
    state.drag.mode = "move";
    state.drag.handle = null;
    state.drag.pointerId = e.pointerId;
    state.drag.offsetX = coords.x - bounds.x;
    state.drag.offsetY = coords.y - bounds.y;
    els.previewCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  } else {
    // Tap empty area → recentrer le filigrane (y compris hors cadre / plein écran)
    state.watermarkState.x =
      coords.x / els.previewCanvas.width - bounds.w / els.previewCanvas.width / 2;
    state.watermarkState.y =
      coords.y / els.previewCanvas.height - bounds.h / els.previewCanvas.height / 2;
    state.watermarkState.anchor = "custom";
    updateAnchorButtonsUI();
    clampWatermarkPosition();
    renderCanvas();
  }
}

function onCanvasPointerMove(e) {
  if (!state.drag.active) {
    const coords = getCanvasPointerCoords(e);
    const bounds = getWatermarkCanvasBounds();
    const handleId = bounds
      ? hitTestResizeHandle(coords, bounds, e.pointerType)
      : null;
    if (handleId) {
      els.previewCanvas.style.cursor = cursorForHandle(handleId);
    } else if (
      bounds &&
      coords.x >= bounds.x &&
      coords.x <= bounds.right &&
      coords.y >= bounds.y &&
      coords.y <= bounds.bottom
    ) {
      els.previewCanvas.style.cursor = "move";
    } else {
      els.previewCanvas.style.cursor = "crosshair";
    }
    return;
  }
  if (state.drag.pointerId != null && e.pointerId !== state.drag.pointerId) return;
  e.preventDefault();

  const coords = getCanvasPointerCoords(e);
  const canvasW = els.previewCanvas.width;
  const canvasH = els.previewCanvas.height;

  if (state.drag.mode === "move") {
    const newCanvasX = coords.x - state.drag.offsetX;
    const newCanvasY = coords.y - state.drag.offsetY;

    state.watermarkState.x = newCanvasX / canvasW;
    state.watermarkState.y = newCanvasY / canvasH;
    state.watermarkState.anchor = "custom";
    updateAnchorButtonsUI();
    clampWatermarkPosition();
    renderCanvas();
  } else if (state.drag.mode === "resize") {
    const ib = state.drag.initialBounds;
    const handle = state.drag.handle || "br";
    const edges = handleMovesEdges(handle);
    let left = ib.x;
    let top = ib.y;
    let right = ib.right;
    let bottom = ib.bottom;

    if (edges.right) right = coords.x;
    if (edges.left) left = coords.x;
    if (edges.bottom) bottom = coords.y;
    if (edges.top) top = coords.y;

    let newW = Math.max(40, right - left);
    let newH = Math.max(40, bottom - top);

    // Touch / souris : étirement libre. Alt = garder le ratio PNG.
    const free = !e.altKey;

    if (!free) {
      const aspect =
        state.watermarkImage.naturalWidth /
        Math.max(1, state.watermarkImage.naturalHeight);
      newH = newW / aspect;
      if (edges.top) top = bottom - newH;
      if (edges.left) left = right - newW;
    }

    if (left < 0) {
      newW += left;
      left = 0;
    }
    if (top < 0) {
      newH += top;
      top = 0;
    }
    if (left + newW > canvasW) newW = canvasW - left;
    if (top + newH > canvasH) newH = canvasH - top;
    newW = Math.max(40, newW);
    newH = Math.max(40, newH);

    state.watermarkState.stretchFullscreen = false;
    state.watermarkState.x = left / canvasW;
    state.watermarkState.y = top / canvasH;
    state.watermarkState.scale = Math.min(1, Math.max(0.05, newW / canvasW));
    if (free) {
      state.watermarkState.scaleY = Math.min(1, Math.max(0.05, newH / canvasH));
    } else {
      state.watermarkState.scaleY = null;
    }
    state.watermarkState.anchor = "custom";
    els.sliderScale.value = Math.round(state.watermarkState.scale * 100);
    els.valScale.textContent = `${Math.round(state.watermarkState.scale * 100)}%`;
    updateAnchorButtonsUI();
    renderCanvas();
  }
}

function onCanvasPointerUp(e) {
  if (!state.drag.active) return;
  if (state.drag.pointerId != null && e.pointerId !== state.drag.pointerId) return;
  state.drag.active = false;
  state.drag.mode = null;
  state.drag.handle = null;
  state.drag.pointerId = null;
  try {
    if (e && e.pointerId != null) {
      els.previewCanvas.releasePointerCapture(e.pointerId);
    }
  } catch (_) {}
  renderCanvas();
}

// ---------------------------------------------------------------------------
// 11. Canvas Rendering Engine
// ---------------------------------------------------------------------------
function renderCanvas() {
  const canvas = els.previewCanvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Draw current video frame (supporting vertical crop and letterbox)
  if (state.videoFile && els.sourceVideo.readyState >= 2) {
    const cw = canvas.width;
    const ch = canvas.height;
    const vw = els.sourceVideo.videoWidth || state.videoMeta.width || cw;
    const vh = els.sourceVideo.videoHeight || state.videoMeta.height || ch;
    const varAspect = vw / vh;
    const carAspect = cw / ch;

    if (Math.abs(varAspect - carAspect) < 0.02) {
      // Proportions identiques
      ctx.drawImage(els.sourceVideo, 0, 0, cw, ch);
    } else if (state.exportSettings.fitMode === "crop") {
      // Remplir tout l'écran vertical avec recadrage centré
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (varAspect > carAspect) {
        sw = vh * carAspect;
        sx = (vw - sw) / 2;
      } else {
        sh = vw / carAspect;
        sy = (vh - sh) / 2;
      }
      ctx.drawImage(els.sourceVideo, sx, sy, sw, sh, 0, 0, cw, ch);
    } else {
      // Ajuster avec bandes noires (Letterbox)
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, cw, ch);
      let dx = 0, dy = 0, dw = cw, dh = ch;
      if (varAspect > carAspect) {
        dh = cw / varAspect;
        dy = (ch - dh) / 2;
      } else {
        dw = ch * varAspect;
        dx = (cw - dw) / 2;
      }
      ctx.drawImage(els.sourceVideo, 0, 0, vw, vh, dx, dy, dw, dh);
    }
  } else {
    // Elegant background placeholder
    ctx.fillStyle = "#0c0914";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 2. Draw watermark with opacity and rotation
  if (state.watermarkLoaded && state.watermarkImage) {
    const bounds = getWatermarkCanvasBounds();
    if (bounds) {
      ctx.save();
      ctx.globalAlpha = state.watermarkState.opacity;

      const centerX = bounds.x + bounds.w / 2;
      const centerY = bounds.y + bounds.h / 2;

      if (state.watermarkState.rotation !== 0) {
        ctx.translate(centerX, centerY);
        ctx.rotate((state.watermarkState.rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
      }

      ctx.drawImage(state.watermarkImage, bounds.x, bounds.y, bounds.w, bounds.h);
      ctx.restore();

      // 3. Draw WYSIWYG selection box & handles
      drawSelectionBox(bounds);
    }
  }

  // 4. Draw Social Media UI Overlay Guide
  if (state.activeOverlay && state.activeOverlay !== "none") {
    drawSocialOverlay(canvas, ctx, state.activeOverlay);
  }
}

function setOverlayGuide(overlayKey) {
  state.activeOverlay = overlayKey || "none";
  els.overlayPills.forEach((b) => {
    if (b.dataset.overlay === state.activeOverlay) b.classList.add("active");
    else b.classList.remove("active");
  });
}

function drawSelectionBox(bounds) {
  ctx.save();
  const touch = isTouchUi();
  const isDanger = window._lastOverlayCollision === true;
  const accent = isDanger ? "#f43f5e" : "#00f5ff";
  // Tactile : traits / poignées plus transparents pour laisser voir la vidéo
  const boxAlpha = touch ? 0.45 : 0.85;
  const fillAlpha = touch ? 0.28 : 0.92;
  const strokeAlpha = touch ? 0.42 : 0.95;
  const dotAlpha = touch ? 0.55 : 1;

  ctx.strokeStyle = isDanger
    ? `rgba(244, 63, 94, ${boxAlpha})`
    : `rgba(0, 245, 255, ${boxAlpha})`;
  ctx.lineWidth = Math.max(1.5, els.previewCanvas.width * (touch ? 0.002 : 0.0025));
  ctx.setLineDash(touch ? [8, 8] : [10, 7]);
  ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.setLineDash([]);

  const half = getHandleVisualHalf();
  const handles = getResizeHandles(bounds);
  const lineW = Math.max(touch ? 1.5 : 2, els.previewCanvas.width * 0.0018);

  handles.forEach((h) => {
    ctx.fillStyle = `rgba(5, 10, 20, ${fillAlpha})`;
    ctx.strokeStyle = isDanger
      ? `rgba(244, 63, 94, ${strokeAlpha})`
      : `rgba(0, 245, 255, ${strokeAlpha})`;
    ctx.lineWidth = lineW;
    ctx.beginPath();
    ctx.rect(h.x - half, h.y - half, half * 2, half * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDanger
      ? `rgba(244, 63, 94, ${dotAlpha})`
      : `rgba(0, 245, 255, ${dotAlpha})`;
    ctx.beginPath();
    ctx.arc(h.x, h.y, Math.max(2, half * (touch ? 0.22 : 0.3)), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function updateSafeStatusBadge(hasCollision, type) {
  window._lastOverlayCollision = hasCollision;
  if (!els.overlaySafeStatus || type === "none") {
    if (els.overlaySafeStatus) els.overlaySafeStatus.style.display = "none";
    return;
  }

  els.overlaySafeStatus.style.display = "inline-flex";
  const labelMap = {
    tiktok: "TikTok",
    shorts: "Shorts",
    reels: "Reels",
    twitter: "Twitter / X",
    universal: "Multi-plateformes",
  };
  const name = labelMap[type] || type;

  if (hasCollision) {
    els.overlaySafeStatus.className = "overlay-status-badge danger";
    els.overlaySafeText.textContent = `⚠️ Filigrane sur les boutons ${name}`;
  } else {
    els.overlaySafeStatus.className = "overlay-status-badge safe";
    els.overlaySafeText.textContent = `✅ Zone Sûre Dégagée (${name})`;
  }
}

function drawSocialOverlay(canvas, ctx, type) {
  if (!type || type === "none") {
    updateSafeStatusBadge(false, "none");
    return;
  }

  const cw = canvas.width;
  const ch = canvas.height;
  const bounds = getWatermarkCanvasBounds();
  let hasCollision = false;

  ctx.save();

  // Helper: draw button circle with symbol
  const drawIconCircle = (x, y, r, label, iconSymbol) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(18, 14, 28, 0.7)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(r * 0.95)}px sans-serif`;
    ctx.fillText(iconSymbol, x, y);

    if (label) {
      ctx.font = `700 ${Math.max(10, Math.round(cw * 0.022))}px 'JetBrains Mono', sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
      ctx.fillText(label, x, y + r + Math.max(10, cw * 0.022));
      ctx.shadowBlur = 0;
    }
  };

  // Helper: draw hatched danger box
  const drawDangerZone = (x, y, w, h, labelText) => {
    ctx.fillStyle = "rgba(244, 63, 94, 0.08)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(244, 63, 94, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    if (labelText) {
      ctx.font = `600 ${Math.max(9, Math.round(cw * 0.02))}px 'JetBrains Mono', sans-serif`;
      ctx.fillStyle = "rgba(251, 113, 133, 0.8)";
      ctx.textAlign = "center";
      ctx.fillText(labelText, x + w / 2, y + Math.max(12, h * 0.08));
    }
  };

  // 1. TikTok Overlay (9:16)
  if (type === "tiktok") {
    // Top Tabs
    drawDangerZone(0, 0, cw, ch * 0.11, "Zone En-tête TikTok");
    ctx.font = `700 ${Math.max(14, Math.round(cw * 0.035))}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.textAlign = "center";
    ctx.fillText("Abonnements", cw * 0.40, ch * 0.06);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Pour toi", cw * 0.60, ch * 0.06);
    ctx.fillRect(cw * 0.55, ch * 0.075, cw * 0.10, Math.max(2, ch * 0.002));

    // Right Rail Icons & Danger Zone
    const railX = cw * 0.90;
    const iconR = Math.max(16, cw * 0.045);
    const startY = ch * 0.46;
    const stepY = ch * 0.085;

    drawDangerZone(cw * 0.78, ch * 0.42, cw * 0.22, ch * 0.46, "Boutons TikTok");
    drawIconCircle(railX, startY, iconR * 1.15, "", "👤");
    drawIconCircle(railX, startY + stepY, iconR, "142K", "♥");
    drawIconCircle(railX, startY + stepY * 2, iconR, "3.2K", "💬");
    drawIconCircle(railX, startY + stepY * 3, iconR, "18.5K", "★");
    drawIconCircle(railX, startY + stepY * 4, iconR, "9.1K", "↗");
    drawIconCircle(railX, startY + stepY * 5.2, iconR * 0.9, "", "♫");

    // Bottom Captions & Username
    const botX = cw * 0.06;
    const botY = ch * 0.80;
    drawDangerZone(0, ch * 0.74, cw * 0.80, ch * 0.24, "Légende & Son TikTok");
    ctx.textAlign = "left";
    ctx.font = `700 ${Math.max(13, Math.round(cw * 0.032))}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    ctx.fillText("@createur_tiktok", botX, botY);
    ctx.font = `400 ${Math.max(11, Math.round(cw * 0.024))}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText("Découvrez cette vidéo incroyable ! #shorts #viral #fyp", botX, botY + ch * 0.03);
    ctx.fillText("♫ Son original - Musique tendance", botX, botY + ch * 0.06);
    ctx.shadowBlur = 0;

    if (bounds) {
      const bNormX = bounds.x / cw;
      const bNormY = bounds.y / ch;
      const bNormW = bounds.w / cw;
      const bNormH = bounds.h / ch;

      const hitsRightRail = (bNormX + bNormW > 0.78 && bNormY + bNormH > 0.42 && bNormY < 0.90);
      const hitsBottom = (bNormY + bNormH > 0.74 && bNormX < 0.82);
      const hitsTop = (bNormY < 0.11);
      hasCollision = hitsRightRail || hitsBottom || hitsTop;
    }
  }

  // 2. YouTube Shorts Overlay (9:16)
  else if (type === "shorts") {
    // Top Bar
    drawDangerZone(0, 0, cw, ch * 0.10, "Zone En-tête Shorts");
    ctx.font = `600 ${Math.max(14, Math.round(cw * 0.032))}px sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText("←", cw * 0.06, ch * 0.06);
    ctx.textAlign = "right";
    ctx.fillText("🔍  ⋮", cw * 0.94, ch * 0.06);

    // Right Rail
    const railX = cw * 0.90;
    const iconR = Math.max(15, cw * 0.042);
    const startY = ch * 0.48;
    const stepY = ch * 0.082;

    drawDangerZone(cw * 0.78, ch * 0.44, cw * 0.22, ch * 0.44, "Boutons Shorts");
    drawIconCircle(railX, startY, iconR, "84K", "👍");
    drawIconCircle(railX, startY + stepY, iconR, "Non", "👎");
    drawIconCircle(railX, startY + stepY * 2, iconR, "1.4K", "💬");
    drawIconCircle(railX, startY + stepY * 3, iconR, "Partager", "↗");
    drawIconCircle(railX, startY + stepY * 4, iconR, "Remix", "🔀");

    // Bottom Title & Channel Pill
    const botX = cw * 0.06;
    const botY = ch * 0.82;
    drawDangerZone(0, ch * 0.76, cw * 0.80, ch * 0.22, "Titre & Chaîne Shorts");
    ctx.textAlign = "left";
    ctx.font = `600 ${Math.max(13, Math.round(cw * 0.03))}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Titre officiel de la vidéo #Shorts", botX, botY);

    // Channel badge + S'abonner
    ctx.font = `700 ${Math.max(12, Math.round(cw * 0.026))}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillText("@ChaineYouTube", botX, botY + ch * 0.035);
    // Red subscribe button
    ctx.fillStyle = "#cc0000";
    ctx.beginPath();
    ctx.roundRect(botX + cw * 0.38, botY + ch * 0.015, cw * 0.24, ch * 0.032, 16);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText("S'abonner", botX + cw * 0.50, botY + ch * 0.035);

    // Red progress bar
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, ch - 4, cw * 0.35, 4);

    if (bounds) {
      const bNormX = bounds.x / cw;
      const bNormY = bounds.y / ch;
      const bNormW = bounds.w / cw;
      const bNormH = bounds.h / ch;

      const hitsRightRail = (bNormX + bNormW > 0.78 && bNormY + bNormH > 0.44);
      const hitsBottom = (bNormY + bNormH > 0.76);
      const hitsTop = (bNormY < 0.10);
      hasCollision = hitsRightRail || hitsBottom || hitsTop;
    }
  }

  // 3. Instagram Reels Overlay (9:16)
  else if (type === "reels") {
    // Top Bar
    drawDangerZone(0, 0, cw, ch * 0.10, "Zone En-tête Reels");
    ctx.font = `700 ${Math.max(16, Math.round(cw * 0.038))}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText("Reels", cw * 0.06, ch * 0.06);

    // Right Rail
    const railX = cw * 0.90;
    const iconR = Math.max(16, cw * 0.044);
    const startY = ch * 0.50;
    const stepY = ch * 0.085;

    drawDangerZone(cw * 0.78, ch * 0.46, cw * 0.22, ch * 0.44, "Boutons Reels");
    drawIconCircle(railX, startY, iconR, "98K", "♥");
    drawIconCircle(railX, startY + stepY, iconR, "1.2K", "💬");
    drawIconCircle(railX, startY + stepY * 2, iconR, "9.5K", "↗");
    drawIconCircle(railX, startY + stepY * 3, iconR, "", "⋮");
    drawIconCircle(railX, startY + stepY * 4, iconR * 0.85, "", "♫");

    // Bottom Section
    const botX = cw * 0.06;
    const botY = ch * 0.82;
    drawDangerZone(0, ch * 0.76, cw * 0.80, ch * 0.22, "Compte & Audio Reels");
    ctx.textAlign = "left";
    ctx.font = `700 ${Math.max(13, Math.round(cw * 0.03))}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("@compte_instagram", botX, botY);
    // Follow button pill
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(botX + cw * 0.42, botY - ch * 0.018, cw * 0.18, ch * 0.026);
    ctx.font = `600 ${Math.max(10, Math.round(cw * 0.022))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Suivre", botX + cw * 0.51, botY);

    if (bounds) {
      const bNormX = bounds.x / cw;
      const bNormY = bounds.y / ch;
      const bNormW = bounds.w / cw;
      const bNormH = bounds.h / ch;

      const hitsRightRail = (bNormX + bNormW > 0.78 && bNormY + bNormH > 0.46);
      const hitsBottom = (bNormY + bNormH > 0.76);
      const hitsTop = (bNormY < 0.10);
      hasCollision = hitsRightRail || hitsBottom || hitsTop;
    }
  }

  // 4. Twitter / X Overlay
  else if (type === "twitter") {
    // Top Bar
    drawDangerZone(0, 0, cw, ch * 0.09, "Zone En-tête X");
    ctx.font = `600 ${Math.max(16, Math.round(cw * 0.038))}px sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText("✕", cw * 0.06, ch * 0.05);

    // Bottom Controls
    const botY = ch * 0.90;
    drawDangerZone(0, ch * 0.82, cw, ch * 0.18, "Barre de lecture X");
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, ch * 0.84, cw, ch * 0.16);

    // Progress Bar
    ctx.fillStyle = "#1d9bf0";
    ctx.fillRect(cw * 0.06, ch * 0.86, cw * 0.40, 3);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(cw * 0.46, ch * 0.86, cw * 0.48, 3);

    ctx.font = `600 ${Math.max(11, Math.round(cw * 0.024))}px sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText("0:12 / 0:45", cw * 0.06, botY);
    ctx.textAlign = "right";
    ctx.fillText("💬  ⇄  ♥  ★  ↗", cw * 0.94, botY);

    if (bounds) {
      const bNormY = bounds.y / ch;
      const bNormH = bounds.h / ch;
      hasCollision = (bNormY + bNormH > 0.82 || bNormY < 0.09);
    }
  }

  // 5. Universal Safe Zone
  else if (type === "universal") {
    const safeX = cw * 0.08;
    const safeY = ch * 0.14;
    const safeW = cw * 0.70;
    const safeH = ch * 0.58;

    // Outer shade
    ctx.fillStyle = "rgba(244, 63, 94, 0.06)";
    ctx.fillRect(0, 0, cw, safeY);
    ctx.fillRect(0, safeY + safeH, cw, ch - (safeY + safeH));
    ctx.fillRect(safeX + safeW, safeY, cw - (safeX + safeW), safeH);

    // Inner safe zone
    ctx.fillStyle = "rgba(16, 185, 129, 0.08)";
    ctx.fillRect(safeX, safeY, safeW, safeH);

    ctx.strokeStyle = "rgba(52, 211, 153, 0.9)";
    ctx.lineWidth = Math.max(2, cw * 0.003);
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(safeX, safeY, safeW, safeH);
    ctx.setLineDash([]);

    ctx.font = `700 ${Math.max(11, Math.round(cw * 0.022))}px 'JetBrains Mono', sans-serif`;
    ctx.fillStyle = "#34d399";
    ctx.textAlign = "center";
    ctx.fillText("ZONE 100% SÛRE MULTI-PLATEFORMES", safeX + safeW / 2, safeY + Math.max(16, ch * 0.022));

    if (bounds) {
      const isInside = (
        bounds.x >= safeX &&
        bounds.y >= safeY &&
        bounds.right <= safeX + safeW &&
        bounds.bottom <= safeY + safeH
      );
      hasCollision = !isInside;
    }
  }

  ctx.restore();

  // Update Safe Status Pill
  updateSafeStatusBadge(hasCollision, type);
}

// ---------------------------------------------------------------------------
// 12. Export Presets & Predictive Weight Calculation
// ---------------------------------------------------------------------------
function updateTargetResolution() {
  const preset = state.exportSettings.preset;
  const origW = state.videoMeta.width || 1920;
  const origH = state.videoMeta.height || 1080;
  const isPortrait = origH > origW;

  let outW = origW;
  let outH = origH;
  let label = "Original";

  switch (preset) {
    case "vertical-9-16":
    case "tiktok":
    case "shorts":
    case "reels":
      outW = 1080;
      outH = 1920;
      label = "9:16 Vertical (1080×1920)";
      break;
    case "portrait-4-5":
    case "insta-post":
    case "twitter":
      outW = 1080;
      outH = 1350;
      label = "4:5 Portrait (1080×1350)";
      break;
    case "square-1-1":
    case "1:1":
    case "square":
      outW = 1080;
      outH = 1080;
      label = "1:1 Carré (1080×1080)";
      break;
    case "1080p":
      outW = isPortrait ? 1080 : 1920;
      outH = isPortrait ? 1920 : 1080;
      label = "1080p FHD";
      break;
    case "720p":
      outW = isPortrait ? 720 : 1280;
      outH = isPortrait ? 1280 : 720;
      label = "720p HD";
      break;
    case "480p":
      outW = isPortrait ? 480 : 854;
      outH = isPortrait ? 854 : 480;
      label = "480p SD";
      break;
    case "original":
    default:
      outW = origW;
      outH = origH;
      label = "Original";
      break;
  }

  // Ensure dimensions are divisible by 2 for H.264
  outW = Math.round(outW / 2) * 2;
  outH = Math.round(outH / 2) * 2;

  state.exportSettings.targetWidth = outW;
  state.exportSettings.targetHeight = outH;

  els.targetResBadge.textContent = `${label} • ${outW}×${outH}`;

  // Afficher ou masquer le sélecteur de cadrage (Fit/Crop) selon que le ratio change
  const isDifferentRatio = Math.abs(origW / origH - outW / outH) > 0.05;
  if (els.fitModeWrapper) {
    els.fitModeWrapper.style.display = isDifferentRatio ? "flex" : "none";
  }

  // Update canvas dimensions for pixel-perfect WYSIWYG
  if (els.previewCanvas && outW > 0 && outH > 0) {
    els.previewCanvas.width = outW;
    els.previewCanvas.height = outH;
    clampWatermarkPosition();
    renderCanvas();
  }
}

/**
 * Predictive File Size Formula:
 * Estimated Size = ((Calculated Video Bitrate + 128 kbps audio) * Duration) / 8
 */
function updatePredictiveWeight() {
  const durationSec = state.videoMeta.duration || 10;
  const sourceBytes = state.videoMeta.sizeBytes || 15 * 1024 * 1024;
  const sourceMB = sourceBytes / (1024 * 1024);

  const targetW = state.exportSettings.targetWidth || state.videoMeta.width || 1920;
  const targetH = state.exportSettings.targetHeight || state.videoMeta.height || 1080;
  const crf = state.exportSettings.crf;

  // Base bitrate calculation based on pixel density
  const totalPixels = targetW * targetH;
  const referencePixels = 1920 * 1080;
  const baseBitrateKbps = Math.max(300, (totalPixels / referencePixels) * 3200);

  // x264 CRF exponential rule: 6 points of CRF halves or doubles bitrate
  const videoBitrateKbps = Math.max(150, Math.round(baseBitrateKbps * Math.pow(2, (23 - crf) / 6)));
  const audioBitrateKbps = 128; // Standard AAC bitrate

  // Total estimated bytes
  const totalBitrateKbps = videoBitrateKbps + audioBitrateKbps;
  const estimatedBytes = (totalBitrateKbps * 1000 * durationSec) / 8;
  const estimatedMB = Math.max(0.1, estimatedBytes / (1024 * 1024));

  els.weightEstimatedValue.textContent = `~${estimatedMB.toFixed(1)} Mo`;
  els.weightSourceCompare.textContent = `(Taille source : ${sourceMB.toFixed(1)} Mo)`;

  const diffPercent = Math.round(((estimatedMB - sourceMB) / sourceMB) * 100);
  if (diffPercent < 0) {
    els.weightDiffBadge.textContent = `${Math.abs(diffPercent)}% d'économie`;
    els.weightDiffBadge.style.color = "#34d399";
    els.weightDiffBadge.style.background = "rgba(16, 185, 129, 0.15)";
    els.weightDiffBadge.style.borderColor = "rgba(16, 185, 129, 0.3)";
  } else {
    els.weightDiffBadge.textContent = `+${diffPercent}% qualité max`;
    els.weightDiffBadge.style.color = "#c084fc";
    els.weightDiffBadge.style.background = "rgba(168, 85, 247, 0.15)";
    els.weightDiffBadge.style.borderColor = "rgba(168, 85, 247, 0.3)";
  }

  // Visual comparison bar fill
  const ratioBar = Math.min(100, Math.max(10, Math.round((estimatedMB / Math.max(estimatedMB, sourceMB)) * 100)));
  els.weightBarFill.style.width = `${ratioBar}%`;
}

// ---------------------------------------------------------------------------
// 13. FFmpeg.wasm Pipeline & Transcoding Engine
// ---------------------------------------------------------------------------
async function initFFmpeg() {
  if (state.ffmpeg) return state.ffmpeg;

  await ensureFFmpegDependencies();
  if (!FFmpegClass) {
    throw new Error("La bibliothèque FFmpeg.wasm n'a pas pu être chargée depuis le CDN.");
  }

  const ffmpeg = new FFmpegClass();

  ffmpeg.on("log", ({ message }) => {
    appendLog(message);
    parseEncodingSpeedAndFps(message);
  });

  ffmpeg.on("progress", ({ progress, time }) => {
    const pct = Math.min(99, Math.max(1, Math.round(progress * 100)));
    updateProgressUI(pct, "Encodage vidéo H.264...");
  });

  appendLog("[FFmpeg] Initialisation du moteur WebAssembly...");
  els.statStage.textContent = "Chargement WASM...";

  const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
  const classWorkerURL = new URL("./ffmpeg-worker.js", window.location.href).href;

  try {
    await ffmpeg.load({
      classWorkerURL,
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    });
    appendLog("[FFmpeg] Cœur WebAssembly chargé et prêt.");
    state.ffmpeg = ffmpeg;
    return ffmpeg;
  } catch (err) {
    appendLog(`[FFmpeg Erreur] Impossible de charger le cœur WASM: ${err.message}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Encode queue + silent folder save (File System Access API)
// ---------------------------------------------------------------------------
const EXPORT_DIR_IDB = "filigra-export-dir-v1";

function openExportDirDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(EXPORT_DIR_IDB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("handles")) {
        db.createObjectStore("handles");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSetExportDir(handle) {
  const db = await openExportDirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("handles", "readwrite");
    tx.objectStore("handles").put(handle, "dir");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetExportDir() {
  const db = await openExportDirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("handles", "readonly");
    const req = tx.objectStore("handles").get("dir");
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function initExportDirPersistence() {
  if (!window.showDirectoryPicker) {
    if (els.exportDirLabel) {
      els.exportDirLabel.textContent = "Auto-save dossier : Chrome / Edge / PWA";
    }
    if (els.btnPickExportDir) els.btnPickExportDir.disabled = true;
    return;
  }
  try {
    const handle = await idbGetExportDir();
    if (!handle) return;
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") {
      state.exportDirHandle = handle;
      updateExportDirLabel();
      appendLog(`[Auto-save] Dossier restauré : ${handle.name}`);
    }
  } catch (err) {
    console.warn("[FiLiGRA] export dir restore:", err);
  }
}

function updateExportDirLabel() {
  if (!els.exportDirLabel) return;
  if (state.exportDirHandle) {
    els.exportDirLabel.textContent = `Dossier : ${state.exportDirHandle.name} (sans confirmation)`;
    els.exportDirLabel.classList.add("is-ready");
  } else {
    els.exportDirLabel.textContent = "Téléchargement navigateur";
    els.exportDirLabel.classList.remove("is-ready");
  }
}

async function pickExportDirectory() {
  if (!window.showDirectoryPicker) {
    showToast("Choix de dossier non supporté — utilisez Chrome, Edge ou la PWA.");
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    const perm = await handle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      showToast("Permission dossier refusée.");
      return;
    }
    state.exportDirHandle = handle;
    await idbSetExportDir(handle);
    updateExportDirLabel();
    showToast(`Auto-save activé → ${handle.name}`);
    appendLog(`[Auto-save] Dossier choisi : ${handle.name}`);
  } catch (err) {
    if (err && err.name === "AbortError") return;
    console.warn(err);
    showToast("Impossible d’ouvrir le dossier.");
  }
}

async function ensureExportDirPermission() {
  const handle = state.exportDirHandle;
  if (!handle) return false;
  try {
    let perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") return true;
    perm = await handle.requestPermission({ mode: "readwrite" });
    return perm === "granted";
  } catch (_) {
    return false;
  }
}

async function writeBlobToExportDir(blob, filename) {
  if (!(await ensureExportDirPermission())) return false;
  const safeName = String(filename || "FiLiGRA_Export.mp4").replace(/[\\/:*?"<>|]/g, "_");
  const fileHandle = await state.exportDirHandle.getFileHandle(safeName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}

async function autoSaveOrDownload(blob, filename) {
  if (!blob) {
    triggerDownload();
    return;
  }
  try {
    if (state.exportDirHandle && (await writeBlobToExportDir(blob, filename))) {
      showToast(`Enregistré : ${filename}`);
      appendLog(`[Auto-save] Écrit sans confirmation → ${filename}`);
      return;
    }
  } catch (err) {
    console.warn("[FiLiGRA] auto-save:", err);
    appendLog(`[Auto-save] Échec dossier — fallback téléchargement (${err.message || err})`);
  }
  if (state.lastExportUrl) URL.revokeObjectURL(state.lastExportUrl);
  state.lastExportUrl = URL.createObjectURL(blob);
  state.lastExportBlob = blob;
  state.lastExportFilename = filename;
  triggerDownload();
}

function snapshotForQueue() {
  return {
    watermarkState: JSON.parse(JSON.stringify(state.watermarkState)),
    exportSettings: JSON.parse(JSON.stringify(state.exportSettings)),
  };
}

function enqueueVideoFiles(files) {
  const vids = (files || []).filter(isVideoFile);
  if (!vids.length) {
    showToast("Aucun fichier vidéo valide.");
    return;
  }
  if (!state.watermarkLoaded) {
    showToast("Importez d’abord un filigrane PNG.");
    return;
  }
  if (state.videoFile) {
    try {
      updateTargetResolution();
    } catch (_) {}
  }
  const snap = snapshotForQueue();
  let added = 0;
  for (const file of vids) {
    state.encodeQueue.push({
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      videoFile: file,
      name: file.name,
      watermarkState: snap.watermarkState,
      exportSettings: snap.exportSettings,
      status: "pending",
    });
    added++;
  }
  renderQueueList();
  showToast(`${added} vidéo${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""} à la file`);
  appendLog(`[File] +${added} — total ${state.encodeQueue.filter((j) => j.status === "pending").length} en attente`);
}

function renderQueueList() {
  if (!els.queueList) return;
  const pending = state.encodeQueue.filter((j) => j.status === "pending").length;
  const running = state.encodeQueue.some((j) => j.status === "running");
  if (els.queueCountBadge) els.queueCountBadge.textContent = String(pending + (running ? 1 : 0));
  if (els.btnStartQueue) {
    els.btnStartQueue.disabled = pending === 0 || state.isEncoding || state.queueRunning;
  }
  if (els.btnClearQueue) {
    els.btnClearQueue.disabled = !state.encodeQueue.some((j) => j.status !== "running");
  }

  els.queueList.innerHTML = "";
  state.encodeQueue.forEach((job) => {
    if (job.status === "done") return;
    const li = document.createElement("li");
    li.className = `queue-item is-${job.status}`;
    const statusLabel =
      job.status === "pending"
        ? "attente"
        : job.status === "running"
          ? "encodage"
          : job.status === "error"
            ? "erreur"
            : job.status;
    const safeName = job.name.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    li.innerHTML = `
      <span class="queue-item-name" title="${safeName}">${safeName}</span>
      <span class="queue-item-status">${statusLabel}</span>
      ${
        job.status === "pending"
          ? `<button type="button" class="queue-item-remove" data-remove="${job.id}" aria-label="Retirer">×</button>`
          : ""
      }
    `;
    els.queueList.appendChild(li);
  });

  els.queueList.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove");
      state.encodeQueue = state.encodeQueue.filter((j) => j.id !== id);
      renderQueueList();
    });
  });
}

async function processEncodeQueue() {
  if (state.isEncoding || state.queueRunning) return;
  const next = state.encodeQueue.find((j) => j.status === "pending");
  if (!next) {
    state.queueRunning = false;
    state.activeQueueJobId = null;
    renderQueueList();
    showToast("File d’attente terminée");
    return;
  }

  state.queueRunning = true;
  state.activeQueueJobId = next.id;
  next.status = "running";
  renderQueueList();
  appendLog(`[File] Encodage → ${next.name}`);

  try {
    Object.assign(state.watermarkState, JSON.parse(JSON.stringify(next.watermarkState)));
    Object.assign(state.exportSettings, JSON.parse(JSON.stringify(next.exportSettings)));
    if (els.sliderScale) {
      els.sliderScale.value = Math.round(state.watermarkState.scale * 100);
      els.valScale.textContent = `${Math.round(state.watermarkState.scale * 100)}%`;
    }
    if (els.sliderOpacity) {
      els.sliderOpacity.value = Math.round(state.watermarkState.opacity * 100);
      els.valOpacity.textContent = `${Math.round(state.watermarkState.opacity * 100)}%`;
    }
    if (els.sliderRotation) {
      els.sliderRotation.value = state.watermarkState.rotation || 0;
      els.valRotation.textContent = `${state.watermarkState.rotation || 0}°`;
    }

    await handleVideoFile(next.videoFile, { silent: true, skipFpsDetect: true });
    if (next.exportSettings.targetWidth > 0 && next.exportSettings.targetHeight > 0) {
      state.exportSettings.targetWidth = next.exportSettings.targetWidth;
      state.exportSettings.targetHeight = next.exportSettings.targetHeight;
      if (els.previewCanvas) {
        els.previewCanvas.width = state.exportSettings.targetWidth;
        els.previewCanvas.height = state.exportSettings.targetHeight;
        clampWatermarkPosition();
        renderCanvas();
      }
    }

    await startFFmpegExport({ fromQueue: true, jobId: next.id });
  } catch (err) {
    next.status = "error";
    state.queueRunning = false;
    state.activeQueueJobId = null;
    appendLog(`[File] Erreur ${next.name}: ${err.message || err}`);
    renderQueueList();
    showToast(`Erreur file : ${next.name}`);
    setTimeout(() => processEncodeQueue(), 400);
  }
}

async function startFFmpegExport(options = {}) {
  if (!state.videoFile) {
    showToast("Veuillez d'abord sélectionner une vidéo source.");
    return;
  }
  if (state.isEncoding) return;

  state.isEncoding = true;
  setExportingButtonState(true);
  els.successBanner.classList.remove("visible");
  updateProgressUI(0, "Préparation du pipeline...");
  renderQueueList();

  state.encodingStartTime = Date.now();
  startElapsedTimer();

  try {
    const ffmpeg = await initFFmpeg();

    // 1. Write video file to virtual filesystem
    updateProgressUI(5, "Copie de la vidéo source en mémoire...");
    appendLog("[Pipeline] Transfert de la vidéo source vers la mémoire virtuelle...");
    const videoData = await fetchFileFn(state.videoFile);
    await ffmpeg.writeFile("input_source.mp4", videoData);

    // Probe source fps (keeps 30→30, 60→60, etc.)
    updateProgressUI(8, "Analyse de la cadence source...");
    const probedFps = await probeSourceFpsWithFFmpeg(ffmpeg);
    if (probedFps) {
      state.videoMeta.fps = probedFps;
      updateFpsChip();
      appendLog(`[Pipeline] Cadence source (probe) : ${formatFpsLabel(probedFps)} fps`);
    } else {
      appendLog(
        `[Pipeline] Cadence source (UI) : ${formatFpsLabel(state.videoMeta.fps || 30)} fps`
      );
    }

    // 2. Prepare watermark PNG (and optionally burn social UI overlays if explicitly requested)
    updateProgressUI(10, "Préparation du filigrane...");
    appendLog("[Pipeline] Génération du filigrane avec transparence alpha...");

    const outW = state.exportSettings.targetWidth;
    const outH = state.exportSettings.targetHeight;
    const isDifferent = outW !== state.videoMeta.width || outH !== state.videoMeta.height;
    const fitMode = state.exportSettings.fitMode || "crop";
    let filterComplex = "";

    if (state.exportSettings.burnOverlays && state.activeOverlay !== "none") {
      // Option explicite cochée : On grave le filigrane ET les repères visuels de la plateforme
      appendLog(`[Pipeline] Option active : Gravure des repères UI de ${state.activeOverlay.toUpperCase()} dans la vidéo.`);
      const fullCanvas = document.createElement("canvas");
      fullCanvas.width = outW;
      fullCanvas.height = outH;
      const fCtx = fullCanvas.getContext("2d");

      // 2a. Dessiner le filigrane
      if (state.watermarkImage) {
        fCtx.save();
        const wmBounds = getWatermarkExportSize(outW, outH);
        const wmTargetW = wmBounds.w;
        const wmTargetH = wmBounds.h;
        const posX = wmBounds.x;
        const posY = wmBounds.y;
        fCtx.globalAlpha = state.watermarkState.opacity;

        const rot = state.watermarkState.rotation || 0;
        if (rot !== 0) {
          fCtx.translate(posX + wmTargetW / 2, posY + wmTargetH / 2);
          fCtx.rotate((rot * Math.PI) / 180);
          fCtx.drawImage(state.watermarkImage, -wmTargetW / 2, -wmTargetH / 2, wmTargetW, wmTargetH);
        } else {
          fCtx.drawImage(state.watermarkImage, posX, posY, wmTargetW, wmTargetH);
        }
        fCtx.restore();
      }

      // 2b. Dessiner l'overlay social indicatif
      drawSocialOverlay(fCtx, outW, outH, null, state.activeOverlay);

      const watermarkBlob = await new Promise((res) => fullCanvas.toBlob(res, "image/png"));
      const wmArrayBuffer = await watermarkBlob.arrayBuffer();
      await ffmpeg.writeFile("watermark.png", new Uint8Array(wmArrayBuffer));

      // 3. Construction du filter_complex (incrustation plein cadre 0:0)
      updateProgressUI(15, "Construction des filtres vidéo...");
      if (isDifferent) {
        if (fitMode === "crop") {
          filterComplex = `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}[v0];[1:v]format=rgba[wm];[v0][wm]overlay=0:0[outv]`;
        } else {
          filterComplex = `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black[v0];[1:v]format=rgba[wm];[v0][wm]overlay=0:0[outv]`;
        }
      } else {
        filterComplex = `[0:v]null[v0];[1:v]format=rgba[wm];[v0][wm]overlay=0:0[outv]`;
      }
    } else {
      // Bake WYSIWYG (position hors cadre + rotation) into a full-frame PNG
      updateProgressUI(15, "Composition du filigrane...");
      const overlayCanvas = await renderWatermarkFrameCanvas(outW, outH);
      const watermarkBlob = await new Promise((res) =>
        overlayCanvas.toBlob(res, "image/png")
      );
      const wmArrayBuffer = await watermarkBlob.arrayBuffer();
      await ffmpeg.writeFile("watermark.png", new Uint8Array(wmArrayBuffer));

      if (isDifferent) {
        if (fitMode === "crop") {
          filterComplex = `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}[v0];[1:v]format=rgba[wm];[v0][wm]overlay=0:0[outv]`;
        } else {
          filterComplex = `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black[v0];[1:v]format=rgba[wm];[v0][wm]overlay=0:0[outv]`;
        }
      } else {
        filterComplex = `[0:v]null[v0];[1:v]format=rgba[wm];[v0][wm]overlay=0:0[outv]`;
      }
    }

    appendLog(`[FFmpeg Filter] ${filterComplex}`);

    // 4. Construct FFmpeg command with WebKit/iOS Safari flags
    const outFps = state.videoMeta.fps || 30;
    const fpsArg = formatFpsLabel(outFps);
    const ffmpegArgs = [
      "-i", "input_source.mp4",
      "-i", "watermark.png",
      "-filter_complex", filterComplex,
      "-map", "[outv]",
      "-map", "0:a?", // Include audio if present, gracefully ignore if none
      "-c:v", "libx264",
      "-preset", "veryfast", // plus compact qu'ultrafast, encore OK en WASM
      "-crf", String(state.exportSettings.crf),
      "-r", fpsArg, // conserver la cadence source (30 / 60 / …)
      "-vsync", "cfr",
      "-pix_fmt", "yuv420p", // Guaranteed Safari iOS & Android compatibility
      "-movflags", "+faststart", // Quick playback
      "-c:a", "aac",
      "-b:a", "128k",
      "output_final.mp4",
    ];

    appendLog(`[FFmpeg Commande] ffmpeg ${ffmpegArgs.join(" ")}`);
    updateProgressUI(20, `Encodage H.264 @ ${fpsArg} fps...`);

    // 5. Execute Transcoding
    await ffmpeg.exec(ffmpegArgs);

    // 6. Read and prepare output file
    updateProgressUI(98, "Lecture et finalisation du fichier...");
    const outputData = await ffmpeg.readFile("output_final.mp4");
    const outputBlob = new Blob([outputData.buffer], { type: "video/mp4" });

    state.lastExportBlob = outputBlob;
    if (state.lastExportUrl) URL.revokeObjectURL(state.lastExportUrl);
    state.lastExportUrl = URL.createObjectURL(outputBlob);
    state.lastExportFilename = `FiLiGRA_${state.videoMeta.name}_${outW}x${outH}.mp4`;

    updateProgressUI(100, "Encodage terminé !");
    els.statStage.textContent = "Terminé";
    appendLog(`[Succès] Fichier généré avec succès : ${state.lastExportFilename} (${(outputBlob.size / (1024 * 1024)).toFixed(2)} Mo)`);

    // 7. Rigorous Memory Cleanup (Avoid WebKit iOS RAM Crashes)
    try {
      await ffmpeg.deleteFile("input_source.mp4");
      await ffmpeg.deleteFile("watermark.png");
      await ffmpeg.deleteFile("output_final.mp4");
      appendLog("[Mémoire] Fichiers virtuels temporaires libérés.");
    } catch (cleanErr) {
      console.warn("[FFmpeg] Avertissement nettoyage:", cleanErr);
    }

    // 8. Auto-save (dossier sans confirmation) ou téléchargement navigateur immédiat
    await autoSaveOrDownload(outputBlob, state.lastExportFilename);
    els.successBanner.classList.add("visible");
    showToast("Vidéo exportée avec succès !");

    if (options.fromQueue && options.jobId) {
      const job = state.encodeQueue.find((j) => j.id === options.jobId);
      if (job) job.status = "done";
    }
  } catch (error) {
    console.error("[FFmpeg Erreur]", error);
    appendLog(`[Erreur Fatale] ${error.message}`);
    updateProgressUI(0, `Erreur : ${error.message}`);
    els.statStage.textContent = "Échec";
    showToast(`Erreur d'encodage : ${error.message}`, 5000);
    if (options.fromQueue && options.jobId) {
      const job = state.encodeQueue.find((j) => j.id === options.jobId);
      if (job) job.status = "error";
    }
  } finally {
    state.isEncoding = false;
    setExportingButtonState(false);
    stopElapsedTimer();
    renderQueueList();

    if (options.fromQueue) {
      state.activeQueueJobId = null;
      setTimeout(() => {
        state.queueRunning = false;
        processEncodeQueue();
      }, 350);
    }
  }
}

/**
 * Rasterize the watermark exactly as in the WYSIWYG preview
 * (scale, overflow outside the frame, rotation, opacity) onto outW×outH.
 * Pixels outside the frame are clipped — matches "dépasser l'écran".
 */
function renderWatermarkFrameCanvas(outW, outH) {
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const c = canvas.getContext("2d");
  if (!state.watermarkImage) return canvas;

  const bounds = getWatermarkExportSize(outW, outH);
  c.save();
  c.globalAlpha = state.watermarkState.opacity;
  const rot = state.watermarkState.rotation || 0;
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  if (rot !== 0) {
    c.translate(cx, cy);
    c.rotate((rot * Math.PI) / 180);
    c.drawImage(
      state.watermarkImage,
      -bounds.w / 2,
      -bounds.h / 2,
      bounds.w,
      bounds.h
    );
  } else {
    c.drawImage(state.watermarkImage, bounds.x, bounds.y, bounds.w, bounds.h);
  }
  c.restore();
  return canvas;
}

async function getWatermarkBlobForExport() {
  if (!state.watermarkImage) return state.watermarkFile;
  const frame = renderWatermarkFrameCanvas(
    state.exportSettings.targetWidth || els.previewCanvas.width,
    state.exportSettings.targetHeight || els.previewCanvas.height
  );
  return new Promise((resolve) => frame.toBlob(resolve, "image/png"));
}

function triggerDownload() {
  if (!state.lastExportUrl) return;
  const a = document.createElement("a");
  a.href = state.lastExportUrl;
  a.download = state.lastExportFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function updateProgressUI(percent, statusMessage) {
  els.progressPercent.textContent = `${percent}%`;
  els.progressFill.style.width = `${percent}%`;
  els.progressStatusText.childNodes[2].textContent = ` ${statusMessage}`;

  els.progressDot.classList.toggle("is-running", percent > 0 && percent < 100);
  els.progressDot.classList.toggle("is-done", percent === 100);
}

function parseEncodingSpeedAndFps(logMessage) {
  // Extract FPS and Speed metrics from FFmpeg stdout
  const fpsMatch = logMessage.match(/fps=\s*([\d.]+)/);
  const speedMatch = logMessage.match(/speed=\s*([\d.]+x)/);

  if (fpsMatch || speedMatch) {
    const fps = fpsMatch ? `${fpsMatch[1]} fps` : "";
    const speed = speedMatch ? speedMatch[1] : "";
    els.statFpsSpeed.textContent = `Vitesse : ${[fps, speed].filter(Boolean).join(" | ")}`;
    els.statStage.textContent = "Encodage en cours";
  }
}

function setExportingButtonState(isExporting) {
  els.btnExportVideo.disabled = isExporting;
  els.iconExportWasm.style.display = isExporting ? "none" : "block";
  els.iconExportSpinner.style.display = isExporting ? "block" : "none";
  els.labelBtnExport.textContent = isExporting ? "Encodage FFmpeg en cours..." : "Exporter la Vidéo Filigranée";
}

function startElapsedTimer() {
  if (progressTimerInterval) clearInterval(progressTimerInterval);
  progressTimerInterval = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - state.encodingStartTime) / 1000);
    els.statTimeElapsed.textContent = `Temps : ${formatTime(elapsedSec)}`;
  }, 1000);
}

function stopElapsedTimer() {
  if (progressTimerInterval) {
    clearInterval(progressTimerInterval);
    progressTimerInterval = null;
  }
}
