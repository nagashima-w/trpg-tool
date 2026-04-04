import { describe, it, expect } from 'vitest'
import { filterTracks } from './trackFilter'
import type { Track } from '../../shared/types'

const tracks: Track[] = [
  { id: '1', name: 'Battle Theme', filePath: '/a.mp3', tags: ['戦闘', 'ボス'] },
  { id: '2', name: 'Town Ambient', filePath: '/b.mp3', tags: ['環境音', '街'] },
  { id: '3', name: 'Dungeon BGM', filePath: '/c.mp3', tags: ['環境音', 'ダンジョン'] },
  { id: '4', name: 'Victory Fanfare', filePath: '/d.mp3', tags: [] },
  { id: '5', name: 'Silent Forest', filePath: '/e.mp3' },
]

describe('filterTracks - search', () => {
  it('returns all tracks for empty query', () => {
    expect(filterTracks(tracks, '', [])).toHaveLength(5)
  })

  it('filters by name (case insensitive)', () => {
    const result = filterTracks(tracks, 'battle', [])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('filters by partial name match', () => {
    const result = filterTracks(tracks, 'bgm', [])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('3')
  })

  it('returns empty for no match', () => {
    expect(filterTracks(tracks, 'xyz', [])).toHaveLength(0)
  })

  it('trims whitespace from query', () => {
    const result = filterTracks(tracks, '  town  ', [])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })
})

describe('filterTracks - tag filter', () => {
  it('returns all tracks for empty tag filter', () => {
    expect(filterTracks(tracks, '', [])).toHaveLength(5)
  })

  it('filters by single tag (OR logic)', () => {
    const result = filterTracks(tracks, '', ['戦闘'])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('filters by multiple tags (OR logic - any match)', () => {
    const result = filterTracks(tracks, '', ['戦闘', '環境音'])
    expect(result).toHaveLength(3)
    expect(result.map(t => t.id)).toEqual(expect.arrayContaining(['1', '2', '3']))
  })

  it('excludes tracks with no tags when filter is active', () => {
    const result = filterTracks(tracks, '', ['戦闘'])
    expect(result.find(t => t.id === '4')).toBeUndefined()
    expect(result.find(t => t.id === '5')).toBeUndefined()
  })

  it('handles tracks with undefined tags', () => {
    const result = filterTracks(tracks, '', ['環境音'])
    expect(result.find(t => t.id === '5')).toBeUndefined()
  })
})

describe('filterTracks - combined', () => {
  it('applies both search and tag filter', () => {
    const result = filterTracks(tracks, 'dungeon', ['環境音'])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('3')
  })

  it('returns empty when search matches but tag does not', () => {
    const result = filterTracks(tracks, 'battle', ['環境音'])
    expect(result).toHaveLength(0)
  })
})
