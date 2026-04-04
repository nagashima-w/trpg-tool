import type { Track } from '../../shared/types'

export type TagFilterMode = 'OR' | 'AND'

export function filterTracks(
  tracks: Track[],
  searchQuery: string,
  activeTagFilters: string[],
  tagFilterMode: TagFilterMode = 'OR'
): Track[] {
  let result = tracks

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase()
    result = result.filter((t) => t.name.toLowerCase().includes(q))
  }

  if (activeTagFilters.length > 0) {
    if (tagFilterMode === 'AND') {
      result = result.filter((t) =>
        activeTagFilters.every((tag) => t.tags?.includes(tag))
      )
    } else {
      result = result.filter((t) =>
        activeTagFilters.some((tag) => t.tags?.includes(tag))
      )
    }
  }

  return result
}
