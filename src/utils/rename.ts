/**
 * rename.ts
 * 导出文件名的生成规则（纯函数，便于单测）。
 *
 * 只作用于**导出产物**：磁盘上的原文件永远不动，扩展名由调用方按输出格式补，用户改不了。
 *
 * 规则顺序：原名 → 查找替换 → 前缀/后缀 → 序号
 * 例：`IMG_001.jpg` + 前缀 `旅行-` + 替换 `IMG→DSC` + 序号 3 位 → `旅行-DSC_001-001.jpg`
 *
 * `sequenceOnly` 会换一条路：名字主体直接是序号（`001`），原名不参与、查找替换一并失效，
 * 于是整批变成 `001、002、003…`，与原来叫什么彻底脱钩。前缀/后缀仍然生效（`旅行-001`）。
 *
 * **没有「启用开关」**：所有字段都是空的就等于不改名（`isRenameRuleActive`）。
 * 留个开关只会让人填了规则却忘了打开，白等一轮导出。
 */

export interface RenameRule {
  prefix: string;
  suffix: string;
  /** 查找替换：find 为空时跳过 */
  find: string;
  replace: string;
  /** 只用序号当名字主体，与原名彻底脱钩；此时 find/replace 不参与 */
  sequenceOnly: boolean;
  sequence: boolean;
  /** 序号起始值（1 起） */
  sequenceStart: number;
  /** 补零位数，0 表示不补零 */
  sequenceDigits: number;
  /** 序号与名字之间的连接符（`sequenceOnly` 时无意义，序号本身就是主体） */
  sequenceSeparator: string;
}

export const DEFAULT_RENAME_RULE: RenameRule = {
  prefix: '',
  suffix: '',
  find: '',
  replace: '',
  sequenceOnly: false,
  sequence: false,
  sequenceStart: 1,
  sequenceDigits: 3,
  sequenceSeparator: '-',
};

/** 文件名里不能出现的字符（macOS/Windows 取并集），统一换成下划线 */
const ILLEGAL_CHARS = /[/\\:*?"<>|]/g;

/** 去掉扩展名：`a.b.jpg` → `a.b` */
export function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** 非法字符换下划线 + 去首尾空白 */
const sanitizeName = (name: string): string => name.replace(ILLEGAL_CHARS, '_').trim();

/** 按起始值与补零位数算出序号文本 */
const formatSequence = (rule: RenameRule, index: number): string => {
  const start = Number.isFinite(rule.sequenceStart) ? rule.sequenceStart : 1;
  const digits = Math.max(0, Math.min(6, Math.floor(rule.sequenceDigits ?? 0)));
  const raw = String(start + index);
  return digits > 0 ? raw.padStart(digits, '0') : raw;
};

/**
 * 生成导出用的**文件名主干**（不含扩展名）。
 * @param originalName 原文件名（可带扩展名）
 * @param rule 重命名规则
 * @param index 该文件在本批次中的 0-based 序号（决定 `{序号}` 的值）
 */
export function buildBaseName(originalName: string, rule: RenameRule, index: number): string {
  const original = stripExtension(originalName);

  if (!isRenameRuleActive(rule)) return original;

  const prefix = rule.prefix ?? '';
  const suffix = rule.suffix ?? '';
  // sequenceOnly 隐含要序号，不用用户再单独勾一次
  const seq = rule.sequence || rule.sequenceOnly ? formatSequence(rule, index) : '';

  // 只用序号：原名与查找替换都不参与，前缀/后缀夹着序号
  if (rule.sequenceOnly) {
    return sanitizeName(`${prefix}${seq}${suffix}`) || original;
  }

  // 1. 查找替换：用 split/join 而不是 new RegExp，避免用户输入 `.` `(` 之类炸掉
  let name = original;
  const find = rule.find ?? '';
  if (find) {
    name = name.split(find).join(rule.replace ?? '');
  }

  // 2. 前缀 / 后缀
  name = `${prefix}${name}${suffix}`;

  // 3. 序号
  if (rule.sequence) {
    name = `${name}${rule.sequenceSeparator ?? ''}${seq}`;
  }

  // 4-5. 清理非法字符与首尾空白；规则把名字清空了就退回原名，总比导出一个没有名字的文件好
  return sanitizeName(name) || original;
}

/** 导出用的完整文件名：主干 + 输出格式对应的扩展名 */
export function buildExportName(
  originalName: string,
  rule: RenameRule,
  index: number,
  ext: string,
): string {
  return `${buildBaseName(originalName, rule, index)}.${ext}`;
}

/** 规则是否会产生任何变化：所有字段都空 = 不改名 */
export function isRenameRuleActive(rule: RenameRule): boolean {
  return Boolean(
    (rule.prefix && rule.prefix.length > 0)
    || (rule.suffix && rule.suffix.length > 0)
    || (rule.find && rule.find.length > 0)
    || rule.sequence
    || rule.sequenceOnly,
  );
}

/** 面板标题摘要，如「重命名 · 前缀+序号」 */
export function describeRenameRule(rule: RenameRule): string {
  if (!isRenameRuleActive(rule)) return '原文件名';
  if (rule.sequenceOnly) {
    const extra: string[] = [];
    if (rule.prefix) extra.push('前缀');
    if (rule.suffix) extra.push('后缀');
    return extra.length > 0 ? `序号重排 · ${extra.join('+')}` : '序号重排';
  }
  const parts: string[] = [];
  if (rule.prefix) parts.push('前缀');
  if (rule.suffix) parts.push('后缀');
  if (rule.find) parts.push('替换');
  if (rule.sequence) parts.push('序号');
  return `已改 · ${parts.join('+')}`;
}
