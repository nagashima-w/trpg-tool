import type { Track } from '../../shared/types'

export function filterTracks(
  tracks: Track[],
  searchQuery: string,
  activeTagFilters: string[]
): Track[] {
  let result = tracks

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase()
    result = result.filter((t) => t.name.toLowerCase().includes(q))
  }

  if (activeTagFilters.length > 0) {
    result = result.filter((t) =>
      activeTagFilters.some((tag) => t.tags?.includes(tag))
    )
  }

  return result
}
