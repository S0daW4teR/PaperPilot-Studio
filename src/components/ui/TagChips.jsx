import { getNode } from '../../lib/learningStore.js'

export default function TagChips({ tags, litIds = [] }) {
  return (
    <div className="tag-chips">
      {tags.map((id) => {
        const n = getNode(id)
        return (
          <span className={`tag-chip${litIds.includes(id) ? ' lit' : ''}`} key={id} title={n?.def ?? id}>
            {n?.name ?? id}
          </span>
        )
      })}
    </div>
  )
}