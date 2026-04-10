// ============================================================
// Discord インタラクションのオプション解析（純粋関数）
// ============================================================

type DiscordOption = Record<string, unknown>

export interface ParsedCommandOptions {
  args: string
  ccTargetUserId?: string
}

/**
 * コマンド名と Discord の options 配列から、各ハンドラに渡す args 文字列と
 * /cc 専用の ccTargetUserId を返す。
 */
export function parseCommandOptions(
  commandName: string,
  dataOptions: DiscordOption[] | undefined,
): ParsedCommandOptions {
  if (commandName === 'cc') {
    return {
      args: dataOptions?.find(o => o.name === 'args')?.value as string ?? '',
      ccTargetUserId: dataOptions?.find(o => o.name === 'target')?.value as string | undefined,
    }
  }

  if (commandName === 'session') {
    const subCmd     = dataOptions?.[0]?.name as string ?? ''
    const subCmdOpts = dataOptions?.[0]?.options as DiscordOption[] | undefined
    const sessionName   = subCmdOpts?.find(o => o.name === 'name')?.value as string ?? ''
    const sessionSystem = subCmdOpts?.find(o => o.name === 'system')?.value as string ?? ''
    const pcParam       = subCmdOpts?.find(o => o.name === 'param')?.value as string ?? ''

    let args: string
    if (subCmd === 'pc') {
      args = `pc ${pcParam}`
    } else if (sessionName && sessionSystem) {
      args = `${subCmd} ${sessionName} ${sessionSystem}`
    } else if (sessionName) {
      args = `${subCmd} ${sessionName}`
    } else {
      args = subCmd
    }
    return { args }
  }

  return { args: dataOptions?.[0]?.value as string ?? '' }
}
