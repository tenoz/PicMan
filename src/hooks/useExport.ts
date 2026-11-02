import { useState, useCallback, useMemo, useRef } from 'react';
import { AppFile, ZipEngine, ZipLayout } from '../types';
import JSZip from 'jszip';
import { saveFile, formatBytes } from '../utils';
import { groupFilesForZip, zipPathInGroup, sanitizeZipBaseName, dedupeNames, topFolderOf } from '../utils/zipGrouping';
import { canZipNatively, zipEntriesNatively } from '../services/systemZip';
import { DEFAULT_RENAME_RULE, RenameRule, buildExportName } from '../utils/rename';
import { mimeOf } from '../utils/mime';

// Fix JSZip import
const zipModule = JSZip;

interface UseExportOptions {
  /** 旧的后缀字段：没给 renameRule 时用它拼一个最简规则，兼容老调用 */
  filenameSuffix?: string;
  /** 完整的导出重命名规则（前缀/后缀/替换/序号） */
  renameRule?: RenameRule;
  exportMode?: 'overwrite' | 'rename';
  /** 导出时忽略原文件夹层级，全部铺平；撞名自动加 _1、_2 */
  flattenExport?: boolean;
  /**
   * 打包过程中的关键事实（用了哪个引擎、写到哪个路径、大小多少）。
   * 全部进运行日志——「日志说成功但磁盘上没文件」这种情况，
   * 没有实际路径就完全没法往下查（2026-11-01 卡了半天）。
   */
  onExportNotice?: (message: string, level?: 'info' | 'warn' | 'error') => void;
  /**
   * 打包结束后回传**实际生成的压缩包路径**。
   *
   * 为什么需要：包名很长时，`xxx.zip` 和 `xxx_1.zip` 在 Finder 里看着一模一样，
   * 用户会以为第二次没导出（2026-11-01 老大找了半天）。界面上直接报出文件名最省事。
   */
  onZipFilesWritten?: (paths: string[]) => void;
  onExportStart?: (count: number) => void;
  /** fileName：当前正在写的文件，进度栏第二行用它显示"正在导出 xxx" */
  onExportProgress?: (current: number, total: number, fileName?: string) => void;
  onExportComplete?: (stats: { success: number; failed: number; elapsedMs?: number }) => void;
  onExportError?: (error: Error) => void;
}

/**
 * 桌面端超过这个体积就一律走本机压缩。
 *
 * 2026-11-02 实测：374 张 / 211.7 MB 走内置 JSZip 花了 **98 秒**（约 2.2MB/s），
 * 而本机压缩（硬链接摆 + ditto）同量级只要几秒。原来这条线设成 300MB，
 * 结果 211MB 的包正好落在"内置慢慢磨"的区间里，用户体感极差。
 * 降到 10MB 后，只有真正的小包才交给 JSZip（省一次临时目录 IO）。
 */
const NATIVE_PREFER_BYTES = 10 * 1024 * 1024;

/**
 * 单个 ZIP 的体积上限。JSZip 会把整包在内存里生成，所以不能无限大；
 * 但也不能像原来那样"每 50 张切一包"。默认：不超这个体积就只出一个包。
 */
const MAX_ZIP_BYTES = 1.5 * 1024 * 1024 * 1024;

/**
 * 内置引擎的内存安全线（本机压缩不可用时按它切包）。
 * 408MB 一次打包实测 `Out of memory`——产物本身就占 408MB，JSZip 再要一份。
 */
const MEMORY_SAFE_BYTES = 300 * 1024 * 1024;

export interface ZipExportOptions {
  /** 已选定的输出目录（桌面端）。有值时直接写盘，只让用户选一次目录 */
  outputDir?: string;
  /** 分组方式：整包 / 按顶层文件夹分别打包 */
  layout?: ZipLayout;
  /** 打包引擎：内置 JSZip / 本机压缩工具 */
  engine?: ZipEngine;
  /** 单个 ZIP 的体积上限（只对内置引擎生效），缺省 1.5GB */
  maxBytesPerZip?: number;
}

interface TauriFsBridge {
  fs?: {
    writeBinaryFile?: (path: string, contents: Uint8Array) => Promise<void>;
    exists?: (path: string) => Promise<boolean>;
    metadata?: (path: string) => Promise<unknown>;
  };
}

/** 目标路径是否已存在（浏览器环境没有 fs，一律按"不存在"处理） */const remoteFileExists = async (path: string): Promise<boolean> => {
  const fs = (window as unknown as { __TAURI__?: TauriFsBridge }).__TAURI__?.fs;
  if (!fs) return false;
  try {
    if (typeof fs.exists === 'function') return await fs.exists(path);
    if (typeof fs.metadata === 'function') {
      await fs.metadata(path);
      return true;
    }
  } catch {
    return false;
  }
  return false;
};

/**
 * 给压缩包找一个不冲突的路径：`杂图.zip` → `杂图_1.zip`。
 *
 * 2026-11-01 老大实测：同一目录第二次打包，第一个包直接没了——因为写盘用的是
 * 固定路径，`writeBinaryFile` 覆盖，Rust 侧的 `zip_directory` 还会先 `remove_file`。
 * 目录导出早就有 `resolveFreePath` 兜着，ZIP 这边一直漏了。
 */
const resolveFreeZipPath = async (desired: string): Promise<string> => {
  if (!(await remoteFileExists(desired))) return desired;

  const base = desired.replace(/\.zip$/i, '');
  for (let n = 1; n <= 9999; n++) {
    const candidate = `${base}_${n}.zip`;
    if (!(await remoteFileExists(candidate))) return candidate;
  }
  return desired;
};

interface UseExportReturn {
  // State
  isExporting: boolean;
  isZipping: boolean;
  isZipPaused: boolean;
  isDownloadPaused: boolean;
  zipProgress: number;
  /** 打包过程的一句话说明（引擎 · 张数 · 体积 · 当前阶段），进度栏第二行显示它 */
  zipDetail: string;
  exportProgress: { current: number; total: number };

  // Actions
  exportToZip: (files: AppFile[], options?: ZipExportOptions) => Promise<boolean>;
  exportToDirectory: (files: AppFile[], directory: string) => Promise<{
    exported: number;
    failed: number;
    failedFiles: string[];
    /** 用户点了终止：已写入的会保留，只是后面的没写 */
    cancelled: boolean;
  }>;
  cancelExport: () => void;
  cancelZip: () => void;
  toggleZipPause: () => void;
  toggleDownloadPause: () => void;
  terminateZip: () => void;
  terminateDownload: () => void;
}

export function useExport(options: UseExportOptions = {}): UseExportReturn {
  const {
    filenameSuffix = '_processed',
    renameRule,
    exportMode = 'rename',
    flattenExport = false,
    onExportNotice,
    onZipFilesWritten,
    onExportStart,
    onExportProgress,
    onExportComplete,
    onExportError,
  } = options;

  /** 实际生效的规则：优先用完整规则，否则把旧的后缀字段包装成最简规则 */
  const effectiveRenameRule = useMemo<RenameRule>(
    () => renameRule ?? { ...DEFAULT_RENAME_RULE, suffix: filenameSuffix ?? '' },
    [renameRule, filenameSuffix],
  );

  const [isExporting, setIsExporting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isZipPaused, setIsZipPaused] = useState(false);
  const [isDownloadPaused, setIsDownloadPaused] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [zipDetail, setZipDetail] = useState('');
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });

  // Use refs for stop flags
  const stopExportRef = useRef(false);
  const stopZipRef = useRef(false);
  const pauseZipRef = useRef(false);
  const pauseDownloadRef = useRef(false);

  const getExtensionFromMime = (mime: string) => {
    switch (mime) {
      case 'image/png': return 'png';
      case 'image/webp': return 'webp';
      case 'image/gif': return 'gif';
      case 'image/bmp': return 'bmp';
      default: return 'jpg';
    }
  };

  // Export to ZIP：支持「整包 / 按文件夹分组」+「内置 / 本机压缩工具」
  const exportToZip = useCallback(async (
    files: AppFile[],
    options: ZipExportOptions = {}
  ): Promise<boolean> => {
    const successFiles = files.filter(f => f.status === 'success' && (f.processedBlob || f.processedPath));
    if (successFiles.length === 0) return false;

    const layout: ZipLayout = options.layout ?? 'single';
    const engine: ZipEngine = options.engine ?? 'builtin';
    const outputDir = options.outputDir?.replace(/\/+$/, '');

    // 本机压缩不占 JSZip 那份内存，所以除了用户显式选它，体积一大也要自动切过去
    const totalBytes = successFiles.reduce((sum, f) => sum + (f.processedSize ?? f.processedBlob?.size ?? 0), 0);
    const nativeReady = Boolean(outputDir) && canZipNatively();
    const useSystem = nativeReady && (engine === 'system' || totalBytes > NATIVE_PREFER_BYTES);
    if (useSystem && engine !== 'system') {
      console.info(
        `[Export] 批次 ${(totalBytes / 1024 / 1024).toFixed(0)}MB 超过内置打包的适用体积，`
        + '自动改用本机压缩（内置 JSZip 打上百 MB 会慢到分钟级）',
      );
    }

    // 内置引擎会把整包在内存里拼出来，本机不可用时只能靠切包把峰值压住
    const maxBytes = options.maxBytesPerZip ?? (nativeReady ? MAX_ZIP_BYTES : MEMORY_SAFE_BYTES);

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    // 整批来自同一个顶层文件夹（拖进来的就是一个目录）时，包名直接用它，
    // 比「图片处理结果_时间戳」直观。混了多个目录或全是散文件就退回默认名。
    const topFolders = new Set(successFiles.map(f => topFolderOf(f.file)));
    const soleTopFolder = topFolders.size === 1 ? [...topFolders][0] : '';
    // 序号按**整批顺序**连续（跨 ZIP 分组也不重置），和目录导出保持同一套规则
    const indexById = new Map<string, number>();
    successFiles.forEach((f, i) => indexById.set(f.id, i));
    const nameFor = (f: AppFile): string => {
      const ext = getExtensionFromMime(mimeOf(f));
      return buildExportName(f.file.name, effectiveRenameRule, indexById.get(f.id) ?? 0, ext);
    };

    // 扁平化只会摊平**顶层目录以内**的层级，最外层目录要留着：
    // 拖进 `a/b1/x.jpg` + `a/b2/y.jpg`，导出应是 `a/x.jpg` + `a/y.jpg`，而不是散在目标目录里。
    // per-folder 布局例外——包名本身已经是 `a`，包内再套一层 a/ 就多了一层。
    const relPathFor = (f: AppFile): string => {
      const name = nameFor(f);
      if (!flattenExport) return zipPathInGroup(f, layout, name);
      if (layout === 'per-folder') return name;
      const root = topFolderOf(f.file);
      return root ? `${root}/${name}` : name;
    };

    // 扁平化：ZIP 里同名条目会互相覆盖，必须整批先算一遍去重表
    const flatPathById = new Map<string, string>();
    if (flattenExport) {
      const rels = successFiles.map(relPathFor);
      dedupeNames(rels).forEach((p, i) => flatPathById.set(successFiles[i].id, p));
    }

    /** 文件在包内的路径：扁平化时按去掉中间层级后的相对路径，否则按原目录结构 */
    const pathFor = (f: AppFile): string =>
      flattenExport ? flatPathById.get(f.id) ?? relPathFor(f) : zipPathInGroup(f, layout, nameFor(f));

    // 把「组」摊平成「一个 zip 一项」的任务列表
    type ZipJob = { zipName: string; files: AppFile[] };
    const jobs: ZipJob[] = [];

    for (const group of groupFilesForZip(successFiles, layout)) {
      const base = group.name
        ? sanitizeZipBaseName(group.name)
        : (soleTopFolder ? sanitizeZipBaseName(soleTopFolder) : `图片处理结果_${dateStr}`);

      if (useSystem) {
        // 系统工具打大包没压力，不按体积切
        jobs.push({ zipName: `${base}.zip`, files: group.files });
        continue;
      }

      // 内置引擎：按体积切，避免 JSZip 在内存里拼出超大包
      const chunks: AppFile[][] = [];
      let current: AppFile[] = [];
      let bytes = 0;
      for (const f of group.files) {
        const size = f.processedSize ?? f.processedBlob?.size ?? 0;
        if (current.length > 0 && bytes + size > maxBytes) {
          chunks.push(current);
          current = [];
          bytes = 0;
        }
        current.push(f);
        bytes += size;
      }
      if (current.length > 0) chunks.push(current);

      chunks.forEach((chunk, idx) => {
        const zipName = chunks.length > 1 ? `${base}_第${idx + 1}部分.zip` : `${base}.zip`;
        jobs.push({ zipName, files: chunk });
      });
    }

    setIsZipping(true);
    setIsZipPaused(false);
    setZipProgress(0);
    stopZipRef.current = false;
    pauseZipRef.current = false;

    // 进度栏第二行用它说明"这会儿到底在干什么"——打包失败时最缺的就是这个信息
    const batchLabel = `${successFiles.length} 张 · ${formatBytes(totalBytes)}`;
    const engineLabel = useSystem ? '本机压缩' : '内置打包';
    /** 整批耗时基准：导出完成时写进日志，用户不用盯着也能事后看 */
    const startedAt = Date.now();
    onExportNotice?.(
      `打包开始 · ${batchLabel} · ${engineLabel}`
      + (outputDir ? ` · 输出目录 ${outputDir}` : ' · 未选目录，将弹保存框'),
    );

    try {
      onExportStart?.(successFiles.length);

      /** 本次实际写出的压缩包路径，结束时回传给界面报文件名 */
      const writtenPaths: string[] = [];

      let totalFailed = 0;
      let done = 0;

      for (let jobIndex = 0; jobIndex < jobs.length; jobIndex++) {
        if (stopZipRef.current) throw new Error('用户取消了打包');

        if (pauseZipRef.current) {
          await new Promise<void>(resolve => {
            const check = setInterval(() => {
              if (!pauseZipRef.current || stopZipRef.current) {
                clearInterval(check);
                resolve();
              }
            }, 100);
          });
          if (stopZipRef.current) throw new Error('用户取消了打包');
        }

        const job = jobs[jobIndex];
        let handledNatively = false;

        // rename 模式（默认）下绝不覆盖已存在的压缩包：同目录第二次打包要得到 xxx_1.zip，
        // 而不是把上一次的包顶掉。overwrite 模式才按用户意图直接盖。
        const destZip = outputDir
          ? (exportMode === 'overwrite'
            ? `${outputDir}/${job.zipName}`
            : await resolveFreeZipPath(`${outputDir}/${job.zipName}`))
          : '';

        // A. 先试系统压缩
        if (useSystem && outputDir) {
          const entries = job.files.map(f => ({
            path: pathFor(f),
            sourcePath: f.processedPath,
            blob: f.processedBlob,
          }));
          const pkgPrefix = jobs.length > 1 ? `第 ${jobIndex + 1}/${jobs.length} 包 · ` : '';
          setZipDetail(`${pkgPrefix}${engineLabel} · ${batchLabel} · 写入临时文件 0/${entries.length}`);
          const result = await zipEntriesNatively(
            entries,
            destZip,
            (written, total) => {
              setZipDetail(written >= total
                ? `${pkgPrefix}${engineLabel} · ${batchLabel} · 交给 ditto 打包…`
                : `${pkgPrefix}${engineLabel} · ${batchLabel} · 写入临时文件 ${written}/${total}`);
            },
          );
          if (result) {
            handledNatively = true;
            writtenPaths.push(destZip);
            // 把两段耗时分开报：摆放（硬链接应接近 0）+ 系统工具打包
            const stage = ((result.stageMs ?? 0) / 1000).toFixed(1);
            const pack = ((result.zipMs ?? 0) / 1000).toFixed(1);
            const mode = result.linkMode === 'hardlink' ? '硬链接' : result.linkMode === 'blob' ? '内存写盘' : '复制';
            onExportNotice?.(
              `已写入 ${destZip}（${formatBytes(result.size)}，${result.tool} · ${mode} ${stage}s + 打包 ${pack}s）`,
            );
            done += job.files.length;
            onExportProgress?.(done, successFiles.length);
            setZipProgress((done / successFiles.length) * 100);
            continue;
          }
          // 失败就落到内置路径重来一次，不让用户白等
          setZipDetail(`${pkgPrefix}本机压缩失败，改用内置打包 · ${batchLabel}`);
        }

        // B. 内置 JSZip
        if (!handledNatively) {
          const zip = new JSZip();
          let failedHere = 0;
          // useSystem 时这句已经在上面设过「本机压缩失败，改用内置打包」，别覆盖
          if (!useSystem) {
            const pkgPrefix = jobs.length > 1 ? `第 ${jobIndex + 1}/${jobs.length} 包 · ` : '';
            setZipDetail(`${pkgPrefix}内置打包 · ${batchLabel}`);
          }
          for (const f of job.files) {
            try {
              zip.file(pathFor(f), f.processedBlob!);
            } catch {
              failedHere++;
            }
          }

          // 内置引擎也记耗时：之前只有本机压缩那条会报时间，
          // 走 JSZip 时日志里一片空白，用户根本不知道慢在哪（2026-11-02）
          const jobStartedAt = Date.now();
          // 图片本身已是压缩数据，DEFLATE 只多花 CPU、几乎不省体积，直接用 STORE
          const content = await zip.generateAsync({
            type: 'blob',
            compression: 'STORE'
          }, (metadata) => {
            setZipProgress(((done + (metadata.percent / 100) * job.files.length) / successFiles.length) * 100);
            if (stopZipRef.current) throw new Error('用户取消了打包');
          });
          const buildMs = Date.now() - jobStartedAt;

          let saved = true;
          if (outputDir) {
            const tauri = (window as unknown as { __TAURI__?: TauriFsBridge }).__TAURI__;
            if (tauri?.fs?.writeBinaryFile) {
              const bytes = new Uint8Array(await content.arrayBuffer());
              const target = destZip || `${outputDir}/${job.zipName}`;
              await tauri.fs.writeBinaryFile(target, bytes);
              writtenPaths.push(target);
              // 记下**实际写出的路径和大小**：日志报成功、磁盘上找不到文件时，
              // 没有这一行就完全没法往下查（2026-11-01 卡了大半天）
              onExportNotice?.(
                `已写入 ${target}（${formatBytes(bytes.length)}，内置 JSZip ${(buildMs / 1000).toFixed(1)}s）`,
              );
            } else {
              saved = (await saveFile(content, job.zipName)).success;
              if (saved) onExportNotice?.(`经保存框写出 ${job.zipName}（${formatBytes(content.size)}）`);
            }
          } else {
            saved = (await saveFile(content, job.zipName)).success;
            if (saved) onExportNotice?.(`经保存框写出 ${job.zipName}（${formatBytes(content.size)}）`);
          }

          if (!saved) {
            // 用户在「另存为」里点了取消。别再当成功往下走——否则界面报「打包完成」，
            // 磁盘上却一个包都没有（2026-11-01 老大就撞过这个，完全没提示）。
            onExportNotice?.('保存被取消或写入失败，压缩包没有写入磁盘', 'error');
            onExportError?.(new Error('保存被取消或写入失败，压缩包没有写入磁盘'));
            return false;
          }

          done += job.files.length;
          totalFailed += failedHere;
          onExportProgress?.(done, successFiles.length);
          setZipProgress((done / successFiles.length) * 100);
        }

        // 包之间让出主线程
        if (jobIndex < jobs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      onExportComplete?.({
        success: successFiles.length - totalFailed,
        failed: totalFailed,
        elapsedMs: Date.now() - startedAt,
      });
      onZipFilesWritten?.(writtenPaths);

      return true;
    } catch (error) {
      onExportError?.(error as Error);
      return false;
    } finally {
      setIsZipping(false);
      setIsZipPaused(false);
      setZipProgress(0);
      setZipDetail('');
      stopZipRef.current = false;
      pauseZipRef.current = false;
    }
  }, [effectiveRenameRule, flattenExport, exportMode, onExportStart, onExportProgress, onExportComplete, onExportError]);

  // Export to directory (Tauri only)
  const exportToDirectory = useCallback(async (
    files: AppFile[], 
    directory: string
  ): Promise<{ exported: number; failed: number; failedFiles: string[]; cancelled: boolean }> => {
    // @ts-ignore
    const tauri = window.__TAURI__;
    if (!tauri) {
      throw new Error('自动导出功能仅在桌面版可用');
    }

    const successFiles = files.filter(f => f.status === 'success' && (f.processedBlob || f.processedPath));
    if (successFiles.length === 0) {
      return { exported: 0, failed: 0, failedFiles: [], cancelled: false };
    }

    setIsExporting(true);
    setExportProgress({ current: 0, total: successFiles.length });
    stopExportRef.current = false;
    /** 目录导出也记整批耗时，和 ZIP 保持一致 */
    const dirStartedAt = Date.now();

    const fs = tauri.fs;
    let exportedCount = 0;
    let errorCount = 0;
    const failedFilesList: string[] = [];

    /**
     * 本批次已经占用的目标路径。
     * 并发写的时候两个文件可能同时算出同一个候选名，靠这个集合兜住。
     */
    const claimedPaths = new Set<string>();

    const pathExists = async (p: string): Promise<boolean> => {
      try {
        if (typeof fs.exists === 'function') return await fs.exists(p);
        await fs.metadata(p);
        return true;
      } catch {
        return false;
      }
    };

    /**
     * 「重命名」模式下找一个不会覆盖已有文件的路径。
     *
     * 原来只是把 `filenameSuffix` 拼到文件名后面，而默认后缀是空串 —— 等于文件名没变，
     * 目标目录里已有同名文件就被直接盖掉（2026-10-31 用户实测：第二批导出把第一批的文件全覆盖了）。
     * 现在改成：目标存在就依次试 `_1`、`_2`…，保证一字节都不动别人的文件。
     */
    const resolveFreePath = async (desired: string): Promise<string> => {
      // 关键顺序：**先在内存里占位，再去查磁盘**。
      // 反过来的话，同批并发（BATCH_SIZE=5 用 Promise.all）时两个文件会同时查到"不存在"，
      // 然后算出同一个名字、互相覆盖。
      if (!claimedPaths.has(desired)) {
        claimedPaths.add(desired);
        if (!(await pathExists(desired))) return desired;
      }

      const dot = desired.lastIndexOf('.');
      const slash = desired.lastIndexOf('/');
      const hasExt = dot > slash + 1;
      const base = hasExt ? desired.slice(0, dot) : desired;
      const ext = hasExt ? desired.slice(dot) : '';

      for (let n = 1; n <= 9999; n++) {
        const candidate = `${base}_${n}${ext}`;
        if (claimedPaths.has(candidate)) continue;
        claimedPaths.add(candidate);
        if (!(await pathExists(candidate))) return candidate;
      }
      throw new Error(`找不到可用的文件名：${desired}`);
    };

    /**
     * 本批次「顶层文件夹名」→ 实际写入的目录名。
     * 存的是 Promise 不是字符串：同一个文件夹的上百个文件并发调用，只会真正判一次。
     */
    const rootFolderAssignments = new Map<string, Promise<string>>();
    /** 本批次已经分配出去的目录名，防止两个根文件夹抢到同一个名字 */
    const claimedRootDirs = new Set<string>();

    /**
     * 文件夹级别判重名：拖入的是文件夹时，以「顶层文件夹」为单位整批改名。
     *
     * 为什么不能逐文件判：导出 `/归档/素材A/` 时若它已存在，逐文件判会变成
     * `/归档/素材A/img_1.jpg`——两批图混在同一个文件夹里，分不清哪批是哪批。
     * 整批挪到 `/归档/素材A_1/` 才对。
     */
    const assignRootFolder = (rootName: string): Promise<string> => {
      const cached = rootFolderAssignments.get(rootName);
      if (cached) return cached;

      const task = (async () => {
        if (!claimedRootDirs.has(rootName) && !(await pathExists(`${directory}/${rootName}`))) {
          claimedRootDirs.add(rootName);
          return rootName;
        }

        for (let n = 1; n <= 9999; n++) {
          const candidate = `${rootName}_${n}`;
          if (claimedRootDirs.has(candidate)) continue;
          if (!(await pathExists(`${directory}/${candidate}`))) {
            claimedRootDirs.add(candidate);
            return candidate;
          }
        }
        throw new Error(`文件夹重名无法解决：${rootName}`);
      })();

      rootFolderAssignments.set(rootName, task);
      return task;
    };

    onExportStart?.(successFiles.length);

    try {
      const total = successFiles.length;
      const BATCH_SIZE = 5;

      for (let i = 0; i < successFiles.length; i += BATCH_SIZE) {
        if (stopExportRef.current) break;

        // 暂停等待
        if (pauseDownloadRef.current) {
          await new Promise<void>(resolve => {
            const check = setInterval(() => {
              if (!pauseDownloadRef.current || stopExportRef.current) {
                clearInterval(check);
                resolve();
              }
            }, 100);
          });
          if (stopExportRef.current) break;
        }

        const batch = successFiles.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (file, batchIndex) => {
          const fileIndex = i + batchIndex;
          if (!file.processedBlob && !file.processedPath) return;

          // 逐文件刷进度会每张都触发一次父组件重渲染（1000 张 = 1000 次），
          // 改成每批（5 张）统一刷一次，视觉上看不出差别
          onExportProgress?.(fileIndex + 1, total, file.file.name);

          const mime = mimeOf(file);
          const ext = getExtensionFromMime(mime);
          const originalName = file.file.name;
          const newName = buildExportName(originalName, effectiveRenameRule, fileIndex, ext);
          const relRaw = file.file.webkitRelativePath || '';

          let targetPath: string;

          if (flattenExport) {
            // 扁平化只摊平顶层目录**以内**的层级，最外层目录留着：
            // a/b1/x.jpg → 目标/a/x.jpg。散文件没有顶层目录，才直接放在目标目录下。
            // 一律走 resolveFreePath（哪怕处在覆盖模式）——不同子文件夹里的同名文件
            // 摊到同一层会撞车，覆盖模式的"直接盖"会静默丢文件。
            const root = topFolderOf(file.file);
            const baseDir = root ? `${directory}/${await assignRootFolder(root)}` : directory;
            targetPath = await resolveFreePath(`${baseDir}/${newName}`);
          } else if (exportMode === 'overwrite') {
            // 覆盖模式：什么都不改，按原名/原结构直接写
            targetPath = `${directory}/${relRaw || originalName}`;
          } else if (relRaw.includes('/')) {
            // 带文件夹结构：「顶层文件夹」整体判重名，一次决定、整批跟着走
            const slash = relRaw.indexOf('/');
            const rootName = relRaw.slice(0, slash);
            const innerDirs = relRaw.slice(slash, relRaw.lastIndexOf('/')); // 形如 "/sub"，没有子目录时为空
            const mappedRoot = await assignRootFolder(rootName);
            targetPath = `${directory}/${mappedRoot}${innerDirs}/${newName}`;
          } else {
            // 散文件：逐个判重名
            targetPath = await resolveFreePath(`${directory}/${newName}`);
          }

          try {
            // rename 模式下 targetPath 已经是「不冲突」的路径（文件夹层面或文件层面判过了），
            // overwrite 模式按用户意图直接盖
            const finalPath = targetPath;

            // 确保目标目录存在
            const targetDir = finalPath.substring(0, finalPath.lastIndexOf('/'));
            if (targetDir) {
              try {
                await fs.createDir(targetDir, { recursive: true });
              } catch {
                // 目录可能已存在，忽略
              }
            }

            // 写文件：优先磁盘到磁盘复制，产物已经在工作目录里了，
            // 没必要读进 JS 内存再写出去（408MB 批次能省掉一份同等大小的内存占用）
            let done = false;
            if (file.processedPath && fs.copyFile) {
              try {
                await fs.copyFile(file.processedPath, finalPath);
                done = true;
              } catch {
                // 源文件可能已被清理，退回内存里的那份
              }
            }
            if (!done) {
              if (!file.processedBlob) {
                throw new Error('产物既不在磁盘上也已释放');
              }
              const arrayBuffer = await file.processedBlob.arrayBuffer();
              await fs.writeBinaryFile(finalPath, new Uint8Array(arrayBuffer));
            }
            exportedCount++;
          } catch (err: any) {
            errorCount++;
            failedFilesList.push(file.file.name);
          }
        }));

        // 一批写完刷一次进度（逐文件刷会让父组件重渲染上千次）
        setExportProgress({ current: Math.min(i + BATCH_SIZE, total), total });
      }

      setExportProgress({ current: total, total });
      
      onExportComplete?.({ success: exportedCount, failed: errorCount, elapsedMs: Date.now() - dirStartedAt });

      // 终止 = 只停后续写入。**已经落盘的文件一个都不回删**：
      // 用户导出到自己的目录里，任何"回滚"都可能误删他原有的东西。
      return { exported: exportedCount, failed: errorCount, failedFiles: failedFilesList, cancelled: stopExportRef.current };
    } catch (error: any) {
      onExportError?.(error);
      return { exported: exportedCount, failed: errorCount, failedFiles: failedFilesList, cancelled: stopExportRef.current };
    } finally {
      setIsExporting(false);
      setExportProgress({ current: 0, total: 0 });
    }
  }, [effectiveRenameRule, exportMode, flattenExport, onExportStart, onExportProgress, onExportComplete, onExportError]);

  const cancelExport = useCallback(() => {
    stopExportRef.current = true;
  }, []);

  const cancelZip = useCallback(() => {
    stopZipRef.current = true;
  }, []);

  const toggleZipPause = useCallback(() => {
    setIsZipPaused((prev: boolean) => {
      const next = !prev;
      pauseZipRef.current = next;
      return next;
    });
  }, []);

  const toggleDownloadPause = useCallback(() => {
    setIsDownloadPaused((prev: boolean) => {
      const next = !prev;
      pauseDownloadRef.current = next;
      return next;
    });
  }, []);

  const terminateZip = useCallback(() => {
    stopZipRef.current = true;
    pauseZipRef.current = false; // 解除暂停以便退出
    setIsZipPaused(false);
  }, []);

  const terminateDownload = useCallback(() => {
    stopExportRef.current = true;
    pauseDownloadRef.current = false;
    setIsDownloadPaused(false);
  }, []);

  return {
    isExporting,
    isZipping,
    isZipPaused,
    isDownloadPaused,
    zipProgress,
    zipDetail,
    exportProgress,
    exportToZip,
    exportToDirectory,
    cancelExport,
    cancelZip,
    toggleZipPause,
    toggleDownloadPause,
    terminateZip,
    terminateDownload,
  };
}