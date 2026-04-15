import { describe, it, expect } from 'vitest'
import { mapSkillName, convertSkills } from './skills'

describe('mapSkillName', () => {
  // ── 近接格闘系（統合先: 近接戦闘（格闘）） ──────────────────────────
  it('こぶし → 近接戦闘（格闘）', () => {
    expect(mapSkillName('こぶし')).toBe('近接戦闘（格闘）')
  })

  it('こぶし（パンチ）→ 近接戦闘（格闘）', () => {
    expect(mapSkillName('こぶし（パンチ）')).toBe('近接戦闘（格闘）')
  })

  it('キック → 近接戦闘（格闘）', () => {
    expect(mapSkillName('キック')).toBe('近接戦闘（格闘）')
  })

  it('頭突き → 近接戦闘（格闘）', () => {
    expect(mapSkillName('頭突き')).toBe('近接戦闘（格闘）')
  })

  it('組み付き → 近接戦闘（格闘）', () => {
    expect(mapSkillName('組み付き')).toBe('近接戦闘（格闘）')
  })

  // ── 隠密系（統合先: 隠密） ───────────────────────────────────────────
  it('隠れる → 隠密', () => {
    expect(mapSkillName('隠れる')).toBe('隠密')
  })

  it('忍び歩き → 隠密', () => {
    expect(mapSkillName('忍び歩き')).toBe('隠密')
  })

  it('潜む → 隠密', () => {
    expect(mapSkillName('潜む')).toBe('隠密')
  })

  it('隠す → 隠密', () => {
    expect(mapSkillName('隠す')).toBe('隠密')
  })

  // ── ドッジ ────────────────────────────────────────────────────────────
  it('ドッジ → 回避', () => {
    expect(mapSkillName('ドッジ')).toBe('回避')
  })

  // ── 射撃系 ────────────────────────────────────────────────────────────
  it('ハンドガン → 射撃（ハンドガン）', () => {
    expect(mapSkillName('ハンドガン')).toBe('射撃（ハンドガン）')
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

  it('サブマシンガン → 射撃（サブマシンガン）', () => {
    expect(mapSkillName('サブマシンガン')).toBe('射撃（サブマシンガン）')
  })

  it('マシンガン → 射撃（マシンガン）', () => {
    expect(mapSkillName('マシンガン')).toBe('射撃（マシンガン）')
  })

  it('機関銃 → 射撃（機関銃）', () => {
    expect(mapSkillName('機関銃')).toBe('射撃（機関銃）')
  })

  it('火炎放射器 → 射撃（火炎放射器）', () => {
    expect(mapSkillName('火炎放射器')).toBe('射撃（火炎放射器）')
  })

  it('機関砲 → 射撃（機関砲）', () => {
    expect(mapSkillName('機関砲')).toBe('射撃（機関砲）')
  })

  // ── 近接武器系（近接戦闘（○○）） ────────────────────────────────────
  it('ナイフ → 近接戦闘（ナイフ）', () => {
    expect(mapSkillName('ナイフ')).toBe('近接戦闘（ナイフ）')
  })

  it('こん棒 → 近接戦闘（こん棒）', () => {
    expect(mapSkillName('こん棒')).toBe('近接戦闘（こん棒）')
  })

  it('斧 → 近接戦闘（斧）', () => {
    expect(mapSkillName('斧')).toBe('近接戦闘（斧）')
  })

  it('剣 → 近接戦闘（剣）', () => {
    expect(mapSkillName('剣')).toBe('近接戦闘（剣）')
  })

  it('槍 → 近接戦闘（槍）', () => {
    expect(mapSkillName('槍')).toBe('近接戦闘（槍）')
  })

  it('刀 → 近接戦闘（刀）', () => {
    expect(mapSkillName('刀')).toBe('近接戦闘（刀）')
  })

  it('チェーンソー → 近接戦闘（チェーンソー）', () => {
    expect(mapSkillName('チェーンソー')).toBe('近接戦闘（チェーンソー）')
  })

  it('鞭 → 近接戦闘（鞭）', () => {
    expect(mapSkillName('鞭')).toBe('近接戦闘（鞭）')
  })

  // ── 操縦 ─────────────────────────────────────────────────────────────
  it('飛行機操縦 → 操縦（航空機）', () => {
    expect(mapSkillName('飛行機操縦')).toBe('操縦（航空機）')
  })

  // ── 値切り ────────────────────────────────────────────────────────────
  it('値切り → 言いくるめ', () => {
    expect(mapSkillName('値切り')).toBe('言いくるめ')
  })

  it('言いくるめ → そのまま（7版では有効な技能名）', () => {
    expect(mapSkillName('言いくるめ')).toBe('言いくるめ')
  })
  it('心理学 → そのまま', () => {
    expect(mapSkillName('心理学')).toBe('心理学')
  })

  it('図書館 → そのまま', () => {
    expect(mapSkillName('図書館')).toBe('図書館')
  })

  it('回避 → そのまま（6版で既に「回避」の場合）', () => {
    expect(mapSkillName('回避')).toBe('回避')
  })
})

describe('convertSkills', () => {
  it('リネームありの技能にrenamedフラグを立てる', () => {
    const skills = [
      { name: 'ドッジ', value: 30 },
      { name: '心理学', value: 45 },
    ]
    const result = convertSkills(skills)
    expect(result[0].name).toBe('回避')
    expect(result[0].originalName).toBe('ドッジ')
    expect(result[0].renamed).toBe(true)

    expect(result[1].name).toBe('心理学')
    expect(result[1].renamed).toBe(false)
  })

  it('技能値は変更しない', () => {
    const skills = [{ name: 'ドッジ', value: 33 }]
    const result = convertSkills(skills)
    expect(result[0].value).toBe(33)
  })

  it('統合技能（格闘）: 複数→最高値を採用し1つにまとめる', () => {
    const skills = [
      { name: 'こぶし', value: 50 },
      { name: 'キック', value: 35 },
      { name: '組み付き', value: 65 },
    ]
    const result = convertSkills(skills)
    const fightSkills = result.filter(s => s.name === '近接戦闘（格闘）')
    expect(fightSkills).toHaveLength(1)
    expect(fightSkills[0].value).toBe(65)
    expect(fightSkills[0].renamed).toBe(true)
  })

  it('統合技能（隠密）: 複数→最高値を採用し1つにまとめる', () => {
    const skills = [
      { name: '隠れる', value: 30 },
      { name: '忍び歩き', value: 45 },
      { name: '潜む', value: 20 },
      { name: '隠す', value: 40 },
    ]
    const result = convertSkills(skills)
    const stealthSkills = result.filter(s => s.name === '隠密')
    expect(stealthSkills).toHaveLength(1)
    expect(stealthSkills[0].value).toBe(45)
  })

  it('統合技能が1つだけの場合もリネームされる', () => {
    const skills = [{ name: '組み付き', value: 55 }]
    const result = convertSkills(skills)
    expect(result[0].name).toBe('近接戦闘（格闘）')
    expect(result[0].renamed).toBe(true)
  })

  it('値切りのみの場合、言いくるめにリネームされる', () => {
    const skills = [{ name: '値切り', value: 40 }]
    const result = convertSkills(skills)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('言いくるめ')
    expect(result[0].value).toBe(40)
    expect(result[0].renamed).toBe(true)
  })

  it('値切りと言いくるめが両方ある場合、高い方を採用して1つにまとめる', () => {
    const skills = [
      { name: '値切り', value: 40 },
      { name: '言いくるめ', value: 55 },
    ]
    const result = convertSkills(skills)
    const fastTalk = result.filter(s => s.name === '言いくるめ')
    expect(fastTalk).toHaveLength(1)
    expect(fastTalk[0].value).toBe(55)
  })

  it('言いくるめのみの場合、リネームフラグは立たない', () => {
    const skills = [{ name: '言いくるめ', value: 50 }]
    const result = convertSkills(skills)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('言いくるめ')
    expect(result[0].renamed).toBe(false)
  })
})
