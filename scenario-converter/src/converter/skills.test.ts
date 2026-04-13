import { describe, it, expect } from 'vitest'
import { mapSkillName, convertSkills } from './skills'

describe('mapSkillName', () => {
  it('ドッジ → 回避', () => {
    expect(mapSkillName('ドッジ')).toBe('回避')
  })

  it('組み付き → 格闘（組み付き）', () => {
    expect(mapSkillName('組み付き')).toBe('格闘（組み付き）')
  })

  it('こぶし → 格闘（こぶし）', () => {
    expect(mapSkillName('こぶし')).toBe('格闘（こぶし）')
  })

  it('こぶし（パンチ）→ 格闘（こぶし）', () => {
    expect(mapSkillName('こぶし（パンチ）')).toBe('格闘（こぶし）')
  })

  it('キック → 格闘（キック）', () => {
    expect(mapSkillName('キック')).toBe('格闘（キック）')
  })

  it('頭突き → 格闘（頭突き）', () => {
    expect(mapSkillName('頭突き')).toBe('格闘（頭突き）')
  })

  it('拳銃 → 射撃（拳銃）', () => {
    expect(mapSkillName('拳銃')).toBe('射撃（拳銃）')
  })

  it('ライフル → 射撃（ライフル）', () => {
    expect(mapSkillName('ライフル')).toBe('射撃（ライフル）')
  })

  it('ショットガン → 射撃（ショットガン）', () => {
    expect(mapSkillName('ショットガン')).toBe('射撃（ショットガン）')
  })

  it('マシンガン → 射撃（マシンガン）', () => {
    expect(mapSkillName('マシンガン')).toBe('射撃（マシンガン）')
  })

  it('マッピングにない技能はそのまま返す', () => {
    expect(mapSkillName('心理学')).toBe('心理学')
    expect(mapSkillName('図書館')).toBe('図書館')
    expect(mapSkillName('聞き耳')).toBe('聞き耳')
  })
})

describe('convertSkills', () => {
  it('技能リストを変換してrenameフラグを立てる', () => {
    const skills = [
      { name: 'ドッジ', value: 30 },
      { name: '心理学', value: 45 },
      { name: '組み付き', value: 60 },
    ]
    const result = convertSkills(skills)
    expect(result[0].name).toBe('回避')
    expect(result[0].originalName).toBe('ドッジ')
    expect(result[0].renamed).toBe(true)

    expect(result[1].name).toBe('心理学')
    expect(result[1].renamed).toBe(false)

    expect(result[2].name).toBe('格闘（組み付き）')
    expect(result[2].renamed).toBe(true)
  })

  it('値は変更しない', () => {
    const skills = [{ name: 'ドッジ', value: 33 }]
    const result = convertSkills(skills)
    expect(result[0].value).toBe(33)
  })
})
