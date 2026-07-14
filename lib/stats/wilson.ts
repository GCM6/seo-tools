// Wilson score 区间下限：小样本纪律的共享纯函数。
// 原实现在 lib/diagnosis/rule-stats.ts（Phase F 内部效果统计）；
// GEO branded/unbranded 重设计（D4）里 lib/probes/summary.ts 也需要同一实现
// 算 unbranded 层可见度的 95% 下限。probes 层若直接 import lib/diagnosis/rule-stats
// 会形成反向依赖（lib/diagnosis 已经 import lib/probes/summary 的类型/输出，
// 见 lib/diagnosis/context.ts、lib/diagnosis/types.ts），因此把纯数学函数抽到这个
// 不依赖任何业务模块的公共位置，两边都从这里 import。

/** Wilson score 区间下限（默认 z=1.96 即 95%）。小样本时显著低于点估计，抑制噪声信号。 */
export function wilsonLowerBound(successes: number, total: number, z = 1.96): number {
  if (total <= 0) return 0
  const phat = successes / total
  const z2 = z * z
  const denom = 1 + z2 / total
  const centre = phat + z2 / (2 * total)
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total)
  return Math.max(0, (centre - margin) / denom)
}
