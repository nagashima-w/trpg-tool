import type { Track, ConnectionStatus, PlaybackState, LoopMode } from '../../shared/types'

const api = window.electronAPI

// State
let tracks: Track[] = []
let currentStatus: ConnectionStatus = 'disconnected'
let currentPlayback: PlaybackState = { status: 'idle', currentTrackId: null, volume: 80, positionMs: 0, durationMs: 0 }
let savedLastGuildId = ''
let savedLastChannelId = ''
let isSeeking = false
let draggedTrackId: string | null = null

// DOM references
const guildSelect = document.getElementById('guild-select') as HTMLSelectElement
const channelSelect = document.getElementById('channel-select') as HTMLSelectElement
const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement
const disconnectBtn = document.getElementById('disconnect-btn') as HTMLButtonElement
const statusBadge = document.getElementById('status-badge') as HTMLSpanElement
const trackList = document.getElementById('track-list') as HTMLDivElement
const addFilesBtn = document.getElementById('add-files-btn') as HTMLButtonElement
const addFolderBtn = document.getElementById('add-folder-btn') as HTMLButtonElement
const nowPlayingName = document.getElementById('now-playing-name') as HTMLDivElement
const playBtn = document.getElementById('play-btn') as HTMLButtonElement
const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement
const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement
const volumeDisplay = document.getElementById('volume-display') as HTMLSpanElement
const seekSlider = document.getElementById('seek-slider') as HTMLInputElement
const positionDisplay = document.getElementById('position-display') as HTMLSpanElement
const durationDisplay = document.getElementById('duration-display') as HTMLSpanElement
const loopModeSelect = document.getElementById('loop-mode-select') as HTMLSelectElement
const refreshGuildsBtn = document.getElementById('refresh-guilds-btn') as HTMLButtonElement
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement
const footerStatusText = document.getElementById('footer-status-text') as HTMLSpanElement
const settingsModal = document.getElementById('settings-modal') as HTMLDivElement
const modalCloseBtn = document.getElementById('modal-close-btn') as HTMLButtonElement
const tokenInput = document.getElementById('token-input') as HTMLInputElement
const defaultVolumeInput = document.getElementById('default-volume-input') as HTMLInputElement
const restoreConnectionInput = document.getElementById('restore-connection-input') as HTMLInputElement
const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement
const cancelSettingsBtn = document.getElementById('cancel-settings-btn') as HTMLButtonElement

// Selected track for playback
let selectedTrackId: string | null = null

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function statusLabel(status: ConnectionStatus): string {
  if (status === 'connected') return '接続済み'
  if (status === 'connecting') return '接続中...'
  return '切断済み'
}

function updateStatusBadge(status: ConnectionStatus): void {
  const label = statusLabel(status)
  statusBadge.textContent = label
  statusBadge.className = `status-badge status-${status}`
  footerStatusText.textContent = `ステータス: ${label}`
  connectBtn.disabled = status === 'connected' || status === 'connecting'
  disconnectBtn.disabled = status !== 'connected'
}

function updateSeekBar(positionMs: number, durationMs: number): void {
  if (isSeeking) return
  positionDisplay.textContent = formatTime(positionMs)
  if (durationMs > 0) {
    seekSlider.max = String(durationMs)
    seekSlider.value = String(positionMs)
    seekSlider.disabled = false
    durationDisplay.textContent = formatTime(durationMs)
  } else {
    seekSlider.max = '100'
    seekSlider.value = '0'
    seekSlider.disabled = true
    durationDisplay.textContent = '0:00'
  }
}

function updatePlaybackUI(state: PlaybackState): void {
  currentPlayback = state

  const track = tracks.find(t => t.id === state.currentTrackId)
  nowPlayingName.textContent = track ? track.name : '--'

  playBtn.disabled = state.status === 'playing' || selectedTrackId === null
  pauseBtn.disabled = state.status !== 'playing'
  stopBtn.disabled = state.status === 'idle'

  volumeSlider.value = String(state.volume)
  volumeDisplay.textContent = `${state.volume}%`

  updateSeekBar(state.positionMs, state.durationMs)

  if (state.status === 'idle') {
    seekSlider.value = '0'
    seekSlider.disabled = true
    positionDisplay.textContent = '0:00'
    durationDisplay.textContent = '0:00'
  }

  // Highlight current track in list
  document.querySelectorAll('.track-item').forEach(el => {
    el.classList.remove('playing')
  })
  if (state.currentTrackId) {
    const item = document.querySelector(`[data-track-id="${state.currentTrackId}"]`)
    item?.classList.add('playing')
  }
}

function renderTracks(): void {
  trackList.innerHTML = ''
  if (tracks.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-message'
    empty.textContent = '再生リストにトラックがありません。追加してください。'
    trackList.appendChild(empty)
    return
  }
  for (const track of tracks) {
    const item = document.createElement('div')
    item.className = 'track-item'
    item.dataset.trackId = track.id
    item.draggable = true
    if (currentPlayback.currentTrackId === track.id) {
      item.classList.add('playing')
    }
    if (selectedTrackId === track.id) {
      item.classList.add('selected')
    }

    // Drag-and-drop handlers
    item.addEventListener('dragstart', (e) => {
      draggedTrackId = track.id
      item.classList.add('dragging')
      e.dataTransfer!.effectAllowed = 'move'
    })

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging')
      draggedTrackId = null
      document.querySelectorAll('.track-item').forEach(el => el.classList.remove('drag-over'))
    })

    item.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      if (draggedTrackId && draggedTrackId !== track.id) {
        document.querySelectorAll('.track-item').forEach(el => el.classList.remove('drag-over'))
        item.classList.add('drag-over')
      }
    })

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over')
    })

    item.addEventListener('drop', async (e) => {
      e.preventDefault()
      item.classList.remove('drag-over')
      if (!draggedTrackId || draggedTrackId === track.id) return

      const fromIdx = tracks.findIndex(t => t.id === draggedTrackId)
      const toIdx = tracks.findIndex(t => t.id === track.id)
      if (fromIdx === -1 || toIdx === -1) return

      const reordered = [...tracks]
      const [moved] = reordered.splice(fromIdx, 1)
      reordered.splice(toIdx, 0, moved)
      tracks = reordered

      renderTracks()
      updatePlaybackUI(currentPlayback)
      await api.tracksReorder(tracks.map(t => t.id))
    })

    const nameSpan = document.createElement('span')
    nameSpan.className = 'track-name'
    nameSpan.textContent = track.name
    nameSpan.title = track.filePath

    // Double-click to rename
    nameSpan.addEventListener('dblclick', () => {
      startRename(track.id, nameSpan)
    })

    const playTrackBtn = document.createElement('button')
    playTrackBtn.className = 'btn btn-icon-small'
    playTrackBtn.title = '再生'
    playTrackBtn.textContent = '▶'
    playTrackBtn.addEventListener('click', async () => {
      try {
        await api.playbackPlay(track.id)
      } catch (e) {
        console.error(e)
        alert(`再生エラー: ${e}`)
      }
    })

    const removeBtn = document.createElement('button')
    removeBtn.className = 'btn btn-icon-small btn-danger-small'
    removeBtn.title = '削除'
    removeBtn.textContent = '×'
    removeBtn.addEventListener('click', async () => {
      await api.tracksRemove(track.id)
      tracks = tracks.filter(t => t.id !== track.id)
      if (selectedTrackId === track.id) selectedTrackId = null
      renderTracks()
      updatePlaybackUI(currentPlayback)
    })

    item.addEventListener('click', () => {
      selectedTrackId = track.id
      document.querySelectorAll('.track-item').forEach(el => el.classList.remove('selected'))
      item.classList.add('selected')
      // Enable play button if not already playing
      playBtn.disabled = currentPlayback.status === 'playing'
    })

    item.appendChild(nameSpan)
    item.appendChild(playTrackBtn)
    item.appendChild(removeBtn)
    trackList.appendChild(item)
  }
}

function startRename(trackId: string, nameSpan: HTMLSpanElement): void {
  const oldName = nameSpan.textContent ?? ''
  const input = document.createElement('input')
  input.type = 'text'
  input.value = oldName
  input.className = 'rename-input'
  nameSpan.replaceWith(input)
  input.focus()
  input.select()

  const commit = async (): Promise<void> => {
    const newName = input.value.trim()
    if (newName && newName !== oldName) {
      await api.tracksRename(trackId, newName)
      const track = tracks.find(t => t.id === trackId)
      if (track) track.name = newName
    }
    renderTracks()
    if (currentPlayback.currentTrackId) {
      updatePlaybackUI(currentPlayback)
    }
  }

  input.addEventListener('blur', commit)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur()
    } else if (e.key === 'Escape') {
      renderTracks()
    }
  })
}

async function loadGuilds(): Promise<void> {
  try {
    const guilds = await api.discordGetGuilds()
    guildSelect.innerHTML = '<option value="">-- サーバーを選択 --</option>'
    for (const g of guilds) {
      const opt = document.createElement('option')
      opt.value = g.id
      opt.textContent = g.name
      guildSelect.appendChild(opt)
    }
  } catch (e) {
    console.error('Failed to load guilds:', e)
  }
}

async function loadChannels(guildId: string): Promise<void> {
  try {
    const channels = await api.discordGetVoiceChannels(guildId)
    channelSelect.innerHTML = '<option value="">-- チャンネルを選択 --</option>'
    for (const c of channels) {
      const opt = document.createElement('option')
      opt.value = c.id
      opt.textContent = c.name
      channelSelect.appendChild(opt)
    }
  } catch (e) {
    console.error('Failed to load channels:', e)
  }
}

function showSettingsModal(): void {
  settingsModal.classList.remove('hidden')
}

function hideSettingsModal(): void {
  settingsModal.classList.add('hidden')
}

// Event listeners
refreshGuildsBtn.addEventListener('click', async () => {
  await loadGuilds()
  channelSelect.innerHTML = '<option value="">-- チャンネルを選択 --</option>'
})

guildSelect.addEventListener('change', async () => {
  const guildId = guildSelect.value
  channelSelect.innerHTML = '<option value="">-- チャンネルを選択 --</option>'
  if (guildId) {
    await loadChannels(guildId)
  }
})

connectBtn.addEventListener('click', async () => {
  const guildId = guildSelect.value
  const channelId = channelSelect.value
  if (!guildId || !channelId) {
    alert('サーバーとチャンネルを選択してください')
    return
  }
  try {
    await api.discordConnect(guildId, channelId)
  } catch (e) {
    console.error(e)
    alert(`接続エラー: ${e}`)
  }
})

disconnectBtn.addEventListener('click', async () => {
  await api.discordDisconnect()
})

addFilesBtn.addEventListener('click', async () => {
  const added = await api.tracksAdd()
  tracks.push(...added)
  renderTracks()
})

addFolderBtn.addEventListener('click', async () => {
  const added = await api.tracksAddFolder()
  tracks.push(...added)
  renderTracks()
})

playBtn.addEventListener('click', async () => {
  if (currentPlayback.status === 'paused') {
    await api.playbackResume()
  } else if (selectedTrackId) {
    try {
      await api.playbackPlay(selectedTrackId)
    } catch (e) {
      console.error(e)
      alert(`再生エラー: ${e}`)
    }
  }
})

pauseBtn.addEventListener('click', async () => {
  await api.playbackPause()
})

stopBtn.addEventListener('click', async () => {
  await api.playbackStop()
})

volumeSlider.addEventListener('input', () => {
  volumeDisplay.textContent = `${volumeSlider.value}%`
})

volumeSlider.addEventListener('change', async () => {
  await api.playbackSetVolume(Number(volumeSlider.value))
})

// Seek bar
seekSlider.addEventListener('mousedown', () => {
  isSeeking = true
})

seekSlider.addEventListener('mouseup', async () => {
  isSeeking = false
  await api.playbackSeek(Number(seekSlider.value))
})

seekSlider.addEventListener('input', () => {
  positionDisplay.textContent = formatTime(Number(seekSlider.value))
})

// Loop mode
loopModeSelect.addEventListener('change', async () => {
  await api.playbackSetLoopMode(loopModeSelect.value as LoopMode)
})

settingsBtn.addEventListener('click', () => {
  showSettingsModal()
})

modalCloseBtn.addEventListener('click', () => {
  hideSettingsModal()
})

cancelSettingsBtn.addEventListener('click', () => {
  hideSettingsModal()
})

saveSettingsBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim()
  const defaultVolume = Number(defaultVolumeInput.value)
  const restoreLastConnection = restoreConnectionInput.checked

  const current = await api.getSettings()
  await api.saveSettings({
    ...current,
    token: token || current.token,
    defaultVolume,
    restoreLastConnection,
  })

  if (token) {
    try {
      await api.discordLogin(token)
      await loadGuilds()
      hideSettingsModal()
    } catch (e) {
      alert(`Botログインエラー: ${e}`)
    }
  } else {
    hideSettingsModal()
  }
})

// IPC event listeners
api.onLoggedIn(async () => {
  await loadGuilds()
  if (savedLastGuildId) {
    guildSelect.value = savedLastGuildId
    await loadChannels(savedLastGuildId)
    if (savedLastChannelId) {
      channelSelect.value = savedLastChannelId
    }
  }
})

api.onStatusChange(async (status: ConnectionStatus) => {
  const previous = currentStatus
  currentStatus = status
  updateStatusBadge(status)
  if (status === 'connected' && previous !== 'connected') {
    await loadGuilds()
    if (savedLastGuildId) {
      guildSelect.value = savedLastGuildId
      await loadChannels(savedLastGuildId)
      if (savedLastChannelId) {
        channelSelect.value = savedLastChannelId
      }
    }
  }
})

api.onPlaybackChange((state: PlaybackState) => {
  updatePlaybackUI(state)
})

api.onPositionUpdate(({ positionMs, durationMs }) => {
  updateSeekBar(positionMs, durationMs)
})

api.onForcedDisconnect(() => {
  currentStatus = 'disconnected'
  updateStatusBadge('disconnected')
  alert('Discord ボイスチャンネルから切断されました。')
})

// Keyboard shortcuts
document.addEventListener('keydown', async (e) => {
  // Ignore when typing in an input field
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    const newVol = Math.min(100, Number(volumeSlider.value) + 5)
    volumeSlider.value = String(newVol)
    volumeDisplay.textContent = `${newVol}%`
    await api.playbackSetVolume(newVol)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    const newVol = Math.max(0, Number(volumeSlider.value) - 5)
    volumeSlider.value = String(newVol)
    volumeDisplay.textContent = `${newVol}%`
    await api.playbackSetVolume(newVol)
  } else if (e.key === 'ArrowRight' && currentPlayback.status !== 'idle') {
    e.preventDefault()
    const newPos = Number(seekSlider.value) + 5000
    await api.playbackSeek(newPos)
  } else if (e.key === 'ArrowLeft' && currentPlayback.status !== 'idle') {
    e.preventDefault()
    const newPos = Math.max(0, Number(seekSlider.value) - 5000)
    await api.playbackSeek(newPos)
  }
})

// Close modal on overlay click
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    hideSettingsModal()
  }
})

// Initialize
async function init(): Promise<void> {
  const settings = await api.getSettings()

  // Set volume from settings
  volumeSlider.value = String(settings.defaultVolume)
  volumeDisplay.textContent = `${settings.defaultVolume}%`

  // Set loop mode from settings
  loopModeSelect.value = settings.loopMode ?? 'single'

  // Populate settings modal
  tokenInput.value = settings.token
  defaultVolumeInput.value = String(settings.defaultVolume)
  restoreConnectionInput.checked = settings.restoreLastConnection

  // Load tracks
  tracks = await api.tracksGetAll()
  renderTracks()

  // Load playback state
  const state = await api.playbackGetState()
  updatePlaybackUI(state)

  // Remember last connection for use when 'connected' event fires after auto-connect
  savedLastGuildId = settings.lastGuildId
  savedLastChannelId = settings.lastChannelId

  // Load guilds if already logged in (non-auto-connect case or manual login)
  if (settings.token) {
    await loadGuilds()
    if (settings.lastGuildId) {
      guildSelect.value = settings.lastGuildId
      await loadChannels(settings.lastGuildId)
      if (settings.lastChannelId) {
        channelSelect.value = settings.lastChannelId
      }
    }
  }

  // Show settings if no token
  if (!settings.token) {
    showSettingsModal()
  }
}

document.addEventListener('DOMContentLoaded', init)
