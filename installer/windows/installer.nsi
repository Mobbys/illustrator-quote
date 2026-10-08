; Installer Windows per il pannello "Quote" di Illustrator.
; Installa per l'utente corrente (niente permessi di amministratore).
; Compilare con: makensis -DVERSION=x.y.z installer.nsi

Unicode true
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!define EXT_ID "com.mobbys.illustratorquote"
!define APP_NAME "Illustrator Quote"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${EXT_ID}"

Name "${APP_NAME}"
OutFile "..\..\dist\IllustratorQuote-Setup-${VERSION}.exe"
RequestExecutionLevel user
InstallDir "$APPDATA\Adobe\CEP\extensions\${EXT_ID}"
SetCompressor /SOLID lzma
ShowInstDetails nevershow
AutoCloseWindow true

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileDescription" "Installer del pannello Quote per Adobe Illustrator"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Mobbys"

Page instfiles
UninstPage instfiles

Function .onInit
  MessageBox MB_OKCANCEL|MB_ICONINFORMATION "Verrà installato il pannello Quote per Adobe Illustrator.$\r$\n$\r$\nSe Illustrator è aperto, chiudilo prima di continuare." IDOK +2
  Abort
FunctionEnd

Section "Install"
  ; rimuove una versione precedente
  RMDir /r "$INSTDIR"
  SetOutPath "$INSTDIR"
  File /r /x ".debug" "..\..\extension\*.*"

  ; permette a Illustrator di caricare l'estensione (CEP 8-13)
  WriteRegStr HKCU "Software\Adobe\CSXS.8" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.9" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.10" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.11" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.12" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.13" "PlayerDebugMode" "1"

  ; disinstallazione da Impostazioni > App
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME} (pannello Illustrator)"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Mobbys"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Function .onInstSuccess
  MessageBox MB_OK|MB_ICONINFORMATION "Fatto! Apri Illustrator e scegli Finestra > Estensioni > Quote."
FunctionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
SectionEnd
