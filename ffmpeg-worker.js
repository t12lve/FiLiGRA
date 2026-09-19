/**
 * FiLiGRA — Self-Hosted Local FFmpeg Web Worker
 * Solves browser Cross-Origin Worker restrictions on GitHub Pages and localhost.
 */

const FFMessageType = {
  LOAD: "LOAD",
  EXEC: "EXEC",
  WRITE_FILE: "WRITE_FILE",
  READ_FILE: "READ_FILE",
  DELETE_FILE: "DELETE_FILE",
  RENAME: "RENAME",
  CREATE_DIR: "CREATE_DIR",
  LIST_DIR: "LIST_DIR",
  DELETE_DIR: "DELETE_DIR",
  ERROR: "ERROR",
  DOWNLOAD: "DOWNLOAD",
  PROGRESS: "PROGRESS",
  LOG: "LOG",
  MOUNT: "MOUNT",
  UNMOUNT: "UNMOUNT",
};

let ffmpeg = null;

const load = async ({ coreURL, wasmURL, workerURL }) => {
  const first = !ffmpeg;

  const defaultCoreURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js";
  const targetCoreURL = coreURL || defaultCoreURL;
  const targetWasmURL = wasmURL || targetCoreURL.replace(/\.js$/g, ".wasm");
  const targetWorkerURL = workerURL || targetCoreURL.replace(/\.js$/g, ".worker.js");

  try {
    const coreModule = await import(/* @vite-ignore */ targetCoreURL);
    self.createFFmpegCore = coreModule.default || coreModule.createFFmpegCore || self.createFFmpegCore;
  } catch (importErr) {
    // Fallback if classic worker
    try {
      importScripts(targetCoreURL);
    } catch (e) {
      throw new Error(`Failed to import ffmpeg core: ${importErr.message || importErr}`);
    }
  }

  if (!self.createFFmpegCore) {
    throw new Error("createFFmpegCore is undefined after importing core script.");
  }

  ffmpeg = await self.createFFmpegCore({
    mainScriptUrlOrBlob: `${targetCoreURL}#${btoa(
      JSON.stringify({ wasmURL: targetWasmURL, workerURL: targetWorkerURL })
    )}`,
  });

  ffmpeg.setLogger((data) => self.postMessage({ type: FFMessageType.LOG, data }));
  ffmpeg.setProgress((data) => self.postMessage({ type: FFMessageType.PROGRESS, data }));

  return first;
};

const exec = ({ args, timeout = -1 }) => {
  if (timeout > 0) ffmpeg.setTimeout(timeout);
  ffmpeg.exec(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
};

const writeFile = ({ path, data }) => {
  ffmpeg.FS.writeFile(path, data);
  return true;
};

const readFile = ({ path, encoding }) => {
  return ffmpeg.FS.readFile(path, { encoding });
};

const deleteFile = ({ path }) => {
  ffmpeg.FS.unlink(path);
  return true;
};

const rename = ({ oldPath, newPath }) => {
  ffmpeg.FS.rename(oldPath, newPath);
  return true;
};

const createDir = ({ path }) => {
  ffmpeg.FS.mkdir(path);
  return true;
};

const listDir = ({ path }) => {
  const names = ffmpeg.FS.readdir(path);
  const nodes = [];
  for (const name of names) {
    const stat = ffmpeg.FS.stat(`${path}/${name}`);
    const isDir = ffmpeg.FS.isDir(stat.mode);
    nodes.push({ name, isDir });
  }
  return nodes;
};

const deleteDir = ({ path }) => {
  ffmpeg.FS.rmdir(path);
  return true;
};

self.onmessage = async ({ data: { id, type, data: msgData } }) => {
  const trans = [];
  let resultData;

  try {
    if (type !== FFMessageType.LOAD && !ffmpeg) {
      throw new Error("FFmpeg is not loaded yet. Call load() first.");
    }

    switch (type) {
      case FFMessageType.LOAD:
        resultData = await load(msgData);
        break;
      case FFMessageType.EXEC:
        resultData = exec(msgData);
        break;
      case FFMessageType.WRITE_FILE:
        resultData = writeFile(msgData);
        break;
      case FFMessageType.READ_FILE:
        resultData = readFile(msgData);
        break;
      case FFMessageType.DELETE_FILE:
        resultData = deleteFile(msgData);
        break;
      case FFMessageType.RENAME:
        resultData = rename(msgData);
        break;
      case FFMessageType.CREATE_DIR:
        resultData = createDir(msgData);
        break;
      case FFMessageType.LIST_DIR:
        resultData = listDir(msgData);
        break;
      case FFMessageType.DELETE_DIR:
        resultData = deleteDir(msgData);
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (err) {
    self.postMessage({
      id,
      type: FFMessageType.ERROR,
      data: err.message || err.toString(),
    });
    return;
  }

  if (resultData instanceof Uint8Array) {
    trans.push(resultData.buffer);
  }

  self.postMessage({ id, type, data: resultData }, trans);
};
