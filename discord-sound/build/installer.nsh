; Custom NSIS installer script for Discord Sound Player
; Adds Windows Firewall rules so UDP voice packets can reach Discord's servers.

!macro customInstall
  ; Remove any stale rules from a previous install first
  ExecWait '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="Discord Sound Player"'
  ; Allow inbound UDP responses from Discord voice servers
  ExecWait '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="Discord Sound Player" dir=in action=allow program="$INSTDIR\Discord Sound Player.exe" enable=yes'
!macroend

!macro customUnInstall
  ExecWait '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="Discord Sound Player"'
!macroend
