// 证据等级 L0–L4 阶梯图例（SP-G2d，plan-ux §5.1）。
// 产品护城河的显性化：向用户解释「实测 / 推断 / 假设」标签背后的可信度阶梯。
// i18n-free 纯展示：调用方 t() 后传入已翻译的 name/desc；tone 复用 .tag 语义色
// （g=假设/不可入库、i=推断、m=实测 L3/L4），可直接用于 Server Component。
export function EvidenceLadder({
  title,
  levels,
}: {
  title: string
  levels: { code: string; name: string; desc: string; tone: 'g' | 'i' | 'm' }[]
}) {
  return (
    <div className="card ladder">
      <div className="ladder-h">{title}</div>
      <ol className="ladder-list">
        {levels.map((l) => (
          <li key={l.code} className="ladder-row">
            <span className={`ladder-dot ${l.tone}`} />
            <span className="ladder-code">{l.code}</span>
            <span className="ladder-name">{l.name}</span>
            <span className="ladder-desc">{l.desc}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
