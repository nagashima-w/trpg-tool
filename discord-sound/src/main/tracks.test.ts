import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { TrackManager } from './tracks'

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'tracks-test-'))
}

describe('TrackManager.updateTags', () => {
  let dir: string
  let mgr: TrackManager

  beforeEach(() => {
    dir = makeTmp()
    // Create dummy audio files
    writeFileSync(join(dir, 'a.mp3'), '')
    writeFileSync(join(dir, 'b.mp3'), '')
    mgr = new TrackManager(dir)
    mgr.addFiles([join(dir, 'a.mp3'), join(dir, 'b.mp3')])
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('sets tags on a track', () => {
    const tracks = mgr.getAll()
    mgr.updateTags(tracks[0].id, ['戦闘', 'ボス'])
    expect(mgr.getById(tracks[0].id)?.tags).toEqual(['戦闘', 'ボス'])
  })

  it('replaces existing tags', () => {
    const tracks = mgr.getAll()
    mgr.updateTags(tracks[0].id, ['環境音'])
    mgr.updateTags(tracks[0].id, ['戦闘'])
    expect(mgr.getById(tracks[0].id)?.tags).toEqual(['戦闘'])
  })

  it('does nothing for unknown id', () => {
    expect(() => mgr.updateTags('nonexistent', ['tag'])).not.toThrow()
  })
})

describe('TrackManager.getAllTags', () => {
  let dir: string
  let mgr: TrackManager

  beforeEach(() => {
    dir = makeTmp()
    writeFileSync(join(dir, 'a.mp3'), '')
    writeFileSync(join(dir, 'b.mp3'), '')
    writeFileSync(join(dir, 'c.mp3'), '')
    mgr = new TrackManager(dir)
    mgr.addFiles([join(dir, 'a.mp3'), join(dir, 'b.mp3'), join(dir, 'c.mp3')])
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns empty array when no tags', () => {
    expect(mgr.getAllTags()).toEqual([])
  })

  it('returns sorted unique tags across all tracks', () => {
    const [a, b, c] = mgr.getAll()
    mgr.updateTags(a.id, ['環境音', '街'])
    mgr.updateTags(b.id, ['戦闘', '環境音'])
    mgr.updateTags(c.id, ['戦闘', 'ボス'])
    const tags = mgr.getAllTags()
    expect(tags).toEqual(['ボス', '戦闘', '環境音', '街'].sort())
  })

  it('excludes tracks with no tags', () => {
    const [a] = mgr.getAll()
    mgr.updateTags(a.id, ['戦闘'])
    const tags = mgr.getAllTags()
    expect(tags).toContain('戦闘')
    expect(tags).toHaveLength(1)
  })
})
