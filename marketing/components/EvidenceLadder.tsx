// 证据阶梯 L0–L4（首页用短说明，方法论页用带例子的长说明）。徽章形状与应用 ui-ev 一致：
// 实心=实测（L4）、深灰实心=抽样实测（L3）、描边=推断（L2）、虚线=假设（L1）；L0 不允许作为结论存储，没有徽章。
type Level = { level: string; label: string; ev: string | null; short: string; long: string }

const LADDER: Level[] = [
  {
    level: 'L0',
    label: 'Unsupported',
    ev: null,
    short: 'An opinion with no evidence. Never stored as a conclusion.',
    long: 'An opinion with no evidence behind it, such as “I think the competitor is doing better.” Veris does not store it as a conclusion at all.',
  },
  {
    level: 'L1',
    label: 'Hypothesis',
    ev: 'hypothesis',
    short: 'An unverified assumption, labeled as suspected.',
    long: 'An unverified assumption, labeled as suspected — for example, a possible link to a SERP feature that hasn’t been checked yet.',
  },
  {
    level: 'L2',
    label: 'Inferred',
    ev: 'inferred',
    short: 'Derived from evidence, never written up as settled causation.',
    long: 'A conclusion derived from evidence — for example, a low click-through rate on a query that shows an AI Overview, suspected (not proven) to be losing clicks to it. Inference is never written up as settled causation.',
  },
  {
    level: 'L3',
    label: 'Sampled',
    ev: 'sample',
    short: 'A directional measurement from a defined sample, such as 23 questions.',
    long: 'A directional measurement from a defined sample — for example, asking AI engines the same set of questions five times each and counting how often a brand actually appears.',
  },
  {
    level: 'L4',
    label: 'Measured',
    ev: 'hard',
    short: 'A hard, direct measurement, such as Search Console data or the initial HTML.',
    long: 'A hard, directly observed measurement — for example, “Search Console: 0.8% CTR over the last 28 days” or “the initial HTML contains 0 characters of body text.”',
  },
]

export function EvidenceLadder({ variant }: { variant: 'short' | 'long' }) {
  return (
    <div className="ladder-wrap">
      <table className="ladder">
        <thead>
          <tr>
            <th scope="col">Level</th>
            <th scope="col">Label</th>
            <th scope="col">What it means</th>
          </tr>
        </thead>
        <tbody>
          {LADDER.map((row) => (
            <tr key={row.level}>
              <td>{row.level}</td>
              <td>{row.ev ? <span className={`ev ev--${row.ev}`}>{row.label}</span> : row.label}</td>
              <td>{variant === 'short' ? row.short : row.long}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
