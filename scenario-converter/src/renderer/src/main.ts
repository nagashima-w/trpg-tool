import type { ConversionResult, ConvertedBlock, BalanceSuggestion } from '../../converter/types'
import { escapeRe } from '../../converter/utils'
import { buildCombatContextText, parseBalanceSuggestions } from '../../converter/balance'

const api = window.converterAPI

// ── DOM参照 ─────────────────────────────────────────────────────────────────
const openBtn        = document.getElementById('open-btn')        as HTMLButtonElement
const settingsBtn    = document.getElementById('settings-btn')    as HTMLButtonElement
const dropZone       = document.getElementById('drop-zone')       as HTMLDivElement
const statusbar      = document.getElementById('statusbar')       as HTMLDivElement
const statusFile     = document.getElementById('status-file')     as HTMLSpanElement
const statusBlocks    = document.getElementById('status-blocks')    as HTMLSpanElement
const statusRenames   = document.getElementById('status-renames')   as HTMLSpanElement
const statusNarrative = document.getElementById('status-narrative') as HTMLSpanElement
const diffArea       = document.getElementById('diff-area')       as HTMLDivElement
const paneOriginal   = document.getElementById('pane-original')   as HTMLDivElement
const paneConverted  = document.getElementById('pane-converted')  as HTMLDivElement
const footer         = document.getElementById('footer')          as HTMLElement
const saveBtn        = document.getElementById('save-btn')        as HTMLButtonElement
const settingsModal     = document.getElementById('settings-modal')       as HTMLDivElement
const aiProviderSel      = document.getElementById('ai-provider-select')   as HTMLSelectElement
const claudeApikeyInput  = document.getElementById('claude-apikey-input')  as HTMLInputElement
const geminiApikeyInput  = document.getElementById('gemini-apikey-input')  as HTMLInputElement
const aiPdfExtractInput  = document.getElementById('ai-pdf-extract-input') as HTMLInputElement
const settingsSaveBtn   = document.getElementById('settings-save-btn')    as HTMLButtonElement
const settingsCancelBtn = document.getElementById('settings-cancel-btn')  as HTMLButtonElement
const aiReExtractBtn    = document.getElementById('ai-reextract-btn')     as HTMLButtonElement
const aiReformatBtn     = document.getElementById('ai-reformat-btn')      as HTMLButtonElement
const aiBalanceBtn      = document.getElementById('ai-balance-btn')        as HTMLButtonElement
const balanceModal      = document.getElementById('balance-modal')         as HTMLDivElement
const balanceSuggestionList = document.getElementById('balance-suggestion-list') as HTMLDivElement
const balanceApplyAllBtn = document.getElementById('balance-apply-all-btn') as HTMLButtonElement
const balanceCloseBtn   = document.getElementById('balance-close-btn')     as HTMLButtonElement
const warningBanner     = document.getElementById('warning-banner')       as HTMLDivElement
const warningText       = document.getElementById('warning-text')         as HTMLSpanElement
const warningClose      = document.getElementById('warning-close')        as HTMLButtonElement
const loadingOverlay    = document.getElementById('loading-overlay')      as HTMLDivElement
const loadingMsg        = document.getElementById('loading-msg')          as HTMLParagraphElement

// ── 状態 ────────────────────────────────────────────────────────────────────
let currentResult: ConversionResult | null = null
let editedConvertedText = ''
let currentLabel = ''
let currentFilePath = ''
let currentIsPdf = false
let cachedSettings: Awaited<ReturnType<typeof api.getSettings>> | null = null

// ── ローディング制御 ─────────────────────────────────────────────────────────

api.onLoadingProgress(msg => { loadingMsg.textContent = msg })

function showLoading(msg: string): void {
  loadingMsg.textContent = msg
  loadingOverlay.classList.remove('hidden')
}

function hideLoading(): void {
  loadingOverlay.classList.add('hidden')
}

// ── ファイル読み込み ─────────────────────────────────────────────────────────

function applyWarning(warning: string | undefined): void {
  warningBanner.classList.toggle('hidden', !warning)
  warningText.textContent = warning ?? ''
}

async function loadFile(): Promise<void> {
  showLoading('ファイルを読み込み中...')
  try {
    const file = await api.openFile()
    if (!file) return
    applyWarning(file.warning)
    currentFilePath = file.filePath
    currentIsPdf = file.filePath.toLowerCase().endsWith('.pdf')
    await processText(file.text, file.filePath)
  } catch (err) {
    alert(`ファイルの読み込みに失敗しました:\n${err}`)
  } finally {
    hideLoading()
  }
}

async function processText(text: string, label: string): Promise<void> {
  currentLabel = label
  showLoading('変換処理中...')
  try {
    const result = await api.convert(text)
    currentResult = result
    editedConvertedText = result.convertedText

    const totalRenames = result.blocks.reduce(
      (acc, b) => acc + b.skills.filter(s => s.renamed).length, 0
    )
    statusFile.textContent      = label
    statusBlocks.textContent    = String(result.blocks.length)
    statusRenames.textContent   = String(totalRenames)
    statusNarrative.textContent = String(result.narrativeReplacements.length)

    renderDiff(result)
    showDiffView()
    updateAiButtonVisibility(await getSettings())
  } finally {
    hideLoading()
  }
}

// ── 差分レンダリング ─────────────────────────────────────────────────────────

function renderDiff(result: ConversionResult): void {
  paneOriginal.innerHTML  = buildOriginalHtml(result)
  paneConverted.innerHTML = buildConvertedHtml(result)

  // 変換後パネルの編集可能ブロックにイベントを設定
  paneConverted.querySelectorAll<HTMLSpanElement>('[data-block-idx]').forEach(el => {
    el.contentEditable = 'true'
    el.addEventListener('input', () => {
      syncEditedText(result)
    })
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault()
        ;(e.target as HTMLElement).blur()
      }
    })
  })
}

/** 元テキストのHTMLを生成（statブロック・地の文変換をハイライト） */
function buildOriginalHtml(result: ConversionResult): string {
  const { originalText, blocks, narrativeReplacements } = result

  let html = ''
  let cursor = 0
  for (const block of blocks) {
    html += narrativeSegmentHtml(originalText, cursor, block.original.startIndex, narrativeReplacements, 'original')
    html += `<span class="block-original">${escHtml(block.original.originalText)}</span>`
    cursor = block.original.endIndex
  }
  html += narrativeSegmentHtml(originalText, cursor, originalText.length, narrativeReplacements, 'original')
  return html
}

/** 変換後テキストのHTMLを生成（変更値を緑・リネームを青・地の文変換を黄でハイライト） */
function buildConvertedHtml(result: ConversionResult): string {
  const { convertedText, blocks, narrativeReplacements } = result

  let html = ''
  let cursor = 0
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    html += narrativeSegmentHtml(convertedText, cursor, block.convertedStartIndex, narrativeReplacements, 'converted')
    const blockHtml = buildBlockHtml(block)
    html += `<span class="block-converted" data-block-idx="${i}" spellcheck="false">${blockHtml}</span>`
    cursor = block.convertedEndIndex
  }
  html += narrativeSegmentHtml(convertedText, cursor, convertedText.length, narrativeReplacements, 'converted')
  return html
}

/** 地の文セグメントのHTMLを生成（NarrativeReplacement 箇所にspan付与） */
function narrativeSegmentHtml(
  text: string,
  segStart: number,
  segEnd: number,
  replacements: ConversionResult['narrativeReplacements'],
  pane: 'original' | 'converted',
): string {
  const inSeg = replacements.filter(r =>
    pane === 'original'
      ? r.originalStart >= segStart && r.originalEnd <= segEnd
      : r.convertedStart >= segStart && r.convertedEnd <= segEnd
  )
  if (inSeg.length === 0) return escHtml(text.slice(segStart, segEnd))

  const spanClass = pane === 'original' ? 'narrative-original' : 'narrative-replaced'
  let html = ''
  let cursor = segStart
  for (const r of inSeg) {
    const start = pane === 'original' ? r.originalStart : r.convertedStart
    const end   = pane === 'original' ? r.originalEnd   : r.convertedEnd
    const term  = pane === 'original' ? r.from          : r.to
    html += escHtml(text.slice(cursor, start))
    html += `<span class="${spanClass}">${escHtml(term)}</span>`
    cursor = end
  }
  html += escHtml(text.slice(cursor, segEnd))
  return html
}

/** 1つのstatブロックのHTML（変更値・リネームをハイライト） */
function buildBlockHtml(block: ConvertedBlock): string {
  let text = block.convertedText

  // 変換後能力値をハイライト
  for (const [k, newVal] of Object.entries(block.abilities)) {
    if (newVal === undefined) continue
    const oldVal = block.original.abilities[k as keyof typeof block.original.abilities]
    if (oldVal === undefined || oldVal === newVal) continue
    const re = new RegExp(`(\\b${k}\\s*[：:／|｜│]?\\s*)${newVal}\\b`, 'g')
    text = text.replace(re, `$1<span class="val-changed">${newVal}</span>`)
  }

  // リネームされた技能名をハイライト
  for (const skill of block.skills) {
    if (!skill.renamed) continue
    const escaped = escapeRe(skill.name)
    const re = new RegExp(`([《〈]?)${escaped}([》〉]?)(\\s*[|｜│]?\\s*\\d{1,3}%?)`, 'g')
    text = text.replace(re, `$1<span class="skill-renamed">${escHtml(skill.name)}</span>$2$3`)
  }

  return text
}

/** 手動編集後の全文を再構築 */
function syncEditedText(result: ConversionResult): void {
  const spans = paneConverted.querySelectorAll<HTMLSpanElement>('[data-block-idx]')
  let text = result.convertedText
  // ブロックを後ろから置換することでインデックスズレを防ぐ（降順ソート）
  const sorted = Array.from(spans)
    .map(el => ({ el, idx: parseInt(el.dataset['blockIdx']!, 10) }))
    .sort((a, b) => b.idx - a.idx)
  for (const { el, idx } of sorted) {
    const block = result.blocks[idx]
    text = text.slice(0, block.convertedStartIndex) +
           (el.textContent ?? '') +
           text.slice(block.convertedEndIndex)
  }
  editedConvertedText = text
}

// ── UI 表示切り替え ─────────────────────────────────────────────────────────

function showDiffView(): void {
  statusbar.classList.remove('hidden')
  diffArea.classList.remove('hidden')
  footer.classList.remove('hidden')
}

// ── 保存 ────────────────────────────────────────────────────────────────────

async function saveFile(): Promise<void> {
  if (!currentResult) return
  await api.saveFile(editedConvertedText)
}

// ── AI整形 ────────────────────────────────────────────────────────────────────

async function reformatWithAI(): Promise<void> {
  if (!currentResult) return
  showLoading('AIで整形中...')
  try {
    const reformatted = await api.reformatWithAI(currentResult.originalText)
    await processText(reformatted, currentLabel + ' (AI整形済み)')
  } catch (err) {
    alert(`AI整形に失敗しました:\n${err}`)
  } finally {
    hideLoading()
  }
}

function updateAiButtonVisibility(settings: Awaited<ReturnType<typeof api.getSettings>>): void {
  const key = settings.aiProvider === 'claude' ? settings.claudeApiKey
    : settings.aiProvider === 'gemini' ? settings.geminiApiKey : ''
  const aiEnabled = settings.aiProvider !== 'none' && key.trim() !== ''
  const hasBlocks = (currentResult?.blocks.length ?? 0) > 0
  aiReformatBtn.classList.toggle('hidden', !aiEnabled)
  aiReExtractBtn.classList.toggle('hidden', !(aiEnabled && currentIsPdf))
  aiBalanceBtn.classList.toggle('hidden', !(aiEnabled && hasBlocks))
}

async function getSettings() {
  if (!cachedSettings) cachedSettings = await api.getSettings()
  return cachedSettings
}

async function reExtractWithAI(): Promise<void> {
  if (!currentFilePath) return
  showLoading('AIでPDFを再抽出中...')
  try {
    const result = await api.extractPdfWithAI(currentFilePath)
    applyWarning(undefined)
    await processText(result.text, result.filePath)
  } catch (err) {
    alert(`AI再抽出に失敗しました:\n${err}`)
  } finally {
    hideLoading()
  }
}

// ── 戦闘バランス分析 ─────────────────────────────────────────────────────────

let pendingSuggestions: BalanceSuggestion[] = []

function renderBalanceSuggestions(suggestions: BalanceSuggestion[]): void {
  if (suggestions.length === 0) {
    balanceSuggestionList.innerHTML = '<div class="balance-empty">バランス調整の提案はありませんでした。</div>'
    balanceApplyAllBtn.disabled = true
    return
  }

  balanceApplyAllBtn.disabled = false
  balanceSuggestionList.innerHTML = suggestions.map((s, i) => {
    const catLabel = s.category === 'ability' ? '能力値' : s.category === 'derived' ? '派生値' : '技能'
    return `
      <label class="balance-suggestion" id="suggestion-row-${i}">
        <input type="checkbox" class="suggestion-check" data-idx="${i}" checked />
        <div class="balance-suggestion-body">
          <div class="balance-block-label">敵キャラクター #${s.blockIndex + 1} / ${catLabel}</div>
          <div class="balance-suggestion-value">
            <strong>${escHtml(s.key)}</strong>：
            <span class="balance-val-from">${s.currentValue}</span>
            <span class="balance-val-arrow">→</span>
            <span class="balance-val-to">${s.suggestedValue}</span>
          </div>
          <div class="balance-suggestion-reason">${escHtml(s.reason)}</div>
        </div>
      </label>`
  }).join('')

  balanceSuggestionList.querySelectorAll<HTMLInputElement>('.suggestion-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const row = document.getElementById(`suggestion-row-${cb.dataset['idx']}`)
      row?.classList.toggle('checked', cb.checked)
    })
    cb.dispatchEvent(new Event('change'))
  })
}

async function analyzeBalance(): Promise<void> {
  if (!currentResult) return
  showLoading('戦闘バランスを分析中...')
  try {
    const contextText = buildCombatContextText(currentResult)
    const response = await api.balanceCheckWithAI(contextText)
    pendingSuggestions = parseBalanceSuggestions(response, currentResult.blocks.length)
    renderBalanceSuggestions(pendingSuggestions)
    balanceModal.classList.remove('hidden')
  } catch (err) {
    alert(`バランス分析に失敗しました:\n${err}`)
  } finally {
    hideLoading()
  }
}

function applySelectedSuggestions(): void {
  if (!currentResult) return
  syncEditedText(currentResult)

  const checked = balanceSuggestionList.querySelectorAll<HTMLInputElement>('.suggestion-check:checked')
  const indices = Array.from(checked).map(cb => parseInt(cb.dataset['idx']!, 10))
  const toApply = indices.map(i => pendingSuggestions[i]).filter(Boolean)

  for (const s of toApply) {
    const block = currentResult.blocks[s.blockIndex]
    const newBlockText = replaceStatValue(block.convertedText, s.key, s.currentValue, s.suggestedValue)
    block.convertedText = newBlockText
    editedConvertedText = replaceStatValue(editedConvertedText, s.key, s.currentValue, s.suggestedValue)
  }

  if (toApply.length > 0) renderDiff(currentResult)
  balanceModal.classList.add('hidden')
}

function replaceStatValue(text: string, key: string, from: number, to: number): string {
  const escaped = escapeRe(key)
  // 能力値・派生値: "KEY sep number"  技能: "KEY sep number%"
  const re = new RegExp(`(${escaped}\\s*[：:／|｜│]?\\s*)${from}(%)`, 'g')
  const withPercent = text.replace(re, `$1${to}$2`)
  const reNoPercent = new RegExp(`(${escaped}\\s*[：:／|｜│]?\\s*)${from}(?!%)(?=\\D|$)`, 'g')
  return withPercent.replace(reNoPercent, `$1${to}`)
}

// ── 設定モーダル ─────────────────────────────────────────────────────────────

function updatePdfExtractToggle(): void {
  const key = aiProviderSel.value === 'claude' ? claudeApikeyInput.value
    : aiProviderSel.value === 'gemini' ? geminiApikeyInput.value : ''
  const aiReady = aiProviderSel.value !== 'none' && key.trim() !== ''
  aiPdfExtractInput.disabled = !aiReady
  if (!aiReady) aiPdfExtractInput.checked = false
}

async function openSettings(): Promise<void> {
  const settings = await getSettings()
  aiProviderSel.value        = settings.aiProvider
  claudeApikeyInput.value    = settings.claudeApiKey
  geminiApikeyInput.value    = settings.geminiApiKey
  aiPdfExtractInput.checked  = settings.aiPdfExtract
  updatePdfExtractToggle()
  settingsModal.classList.remove('hidden')
}

// ── ドラッグ&ドロップ ────────────────────────────────────────────────────────

dropZone.addEventListener('dragover', e => {
  e.preventDefault()
  dropZone.classList.add('drag-over')
})
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
dropZone.addEventListener('drop', async e => {
  e.preventDefault()
  dropZone.classList.remove('drag-over')
  const file = e.dataTransfer?.files[0]
  if (!file) return
  // Electronではdragのfileはローカルパスを持たないためopenFileダイアログへ誘導
  // (rendererでFile APIを使いテキストを読む)
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'txt' && ext !== 'pdf') {
    alert('対応ファイルは .txt / .pdf のみです。')
    return
  }
  if (ext === 'pdf') {
    const filePath = api.getPathForFile(file)
    showLoading('PDFを読み込み中...')
    try {
      const result = await api.openFileByPath(filePath)
      if (!result) return
      applyWarning(result.warning)
      currentFilePath = filePath
      currentIsPdf = true
      await processText(result.text, result.filePath)
    } catch (err) {
      alert(`ファイルの読み込みに失敗しました:\n${err}`)
    } finally {
      hideLoading()
    }
    return
  }
  const reader = new FileReader()
  reader.onload = async () => {
    if (typeof reader.result !== 'string') return
    await processText(reader.result, file.name)
  }
  reader.onerror = () => alert('ファイルの読み込みに失敗しました。')
  reader.readAsText(file, 'utf-8')
})

// ── イベントリスナー ─────────────────────────────────────────────────────────

warningClose.addEventListener('click', () => applyWarning(undefined))
openBtn.addEventListener('click', () => { void loadFile() })
saveBtn.addEventListener('click', () => { void saveFile() })
settingsBtn.addEventListener('click', () => { void openSettings() })

getSettings().then(updateAiButtonVisibility)

aiProviderSel.addEventListener('change', updatePdfExtractToggle)
claudeApikeyInput.addEventListener('input', updatePdfExtractToggle)
geminiApikeyInput.addEventListener('input', updatePdfExtractToggle)

settingsSaveBtn.addEventListener('click', async () => {
  const settings = {
    aiProvider:    aiProviderSel.value as 'none' | 'claude' | 'gemini',
    claudeApiKey:  claudeApikeyInput.value,
    geminiApiKey:  geminiApikeyInput.value,
    aiPdfExtract:  aiPdfExtractInput.checked,
  }
  await api.saveSettings(settings)
  cachedSettings = settings
  settingsModal.classList.add('hidden')
  updateAiButtonVisibility(settings)
})
aiReExtractBtn.addEventListener('click', () => { void reExtractWithAI() })
aiReformatBtn.addEventListener('click', () => { void reformatWithAI() })
aiBalanceBtn.addEventListener('click', () => { void analyzeBalance() })
balanceApplyAllBtn.addEventListener('click', applySelectedSuggestions)
balanceCloseBtn.addEventListener('click', () => balanceModal.classList.add('hidden'))
balanceModal.addEventListener('click', e => {
  if (e.target === balanceModal) balanceModal.classList.add('hidden')
})
settingsCancelBtn.addEventListener('click', () => settingsModal.classList.add('hidden'))
settingsModal.addEventListener('click', e => {
  if (e.target === settingsModal) settingsModal.classList.add('hidden')
})

// ── スクロール同期 ────────────────────────────────────────────────────────────

let scrollSyncing = false
paneOriginal.addEventListener('scroll', () => {
  if (scrollSyncing) return
  scrollSyncing = true
  paneConverted.scrollTop = paneOriginal.scrollTop
  scrollSyncing = false
})
paneConverted.addEventListener('scroll', () => {
  if (scrollSyncing) return
  scrollSyncing = true
  paneOriginal.scrollTop = paneConverted.scrollTop
  scrollSyncing = false
})

// ── ユーティリティ ────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
