; Installer Windows per il pannello "Quote" di Illustrator.
; Il pannello va nella cartella dell'utente. Se l'utente è amministratore, Windows chiede conferma
; per poter copiare anche lo script "Quota" nel menu File > Script di Illustrator (scorciatoia da tastiera).
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
RequestExecutionLevel highest
InstallDir "$APPDATA\Adobe\CEP\extensions\${EXT_ID}"
SetCompressor /SOLID lzma
ShowInstDetails nevershow
AutoCloseWindow true

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileDescription" "Installer del pannello Quote per Adobe Illustrator"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Mobbys"

Var ScriptMissing

; Esegue ACTION ("copy" o "delete") sullo script Quota.jsx in ogni cartella Presets\<lingua>\Scripts
; delle versioni di Illustrator installate.
!macro ScriptFolders ACTION
  FindFirst $0 $1 "$PROGRAMFILES64\Adobe\Adobe Illustrator*"
  ${ACTION}_loop:
    StrCmp $1 "" ${ACTION}_done
    FindFirst $2 $3 "$PROGRAMFILES64\Adobe\$1\Presets\*"
    ${ACTION}_loop2:
      StrCmp $3 "" ${ACTION}_done2
      StrCmp $3 "." ${ACTION}_next2
      StrCmp $3 ".." ${ACTION}_next2
      IfFileExists "$PROGRAMFILES64\Adobe\$1\Presets\$3\Scripts\*.*" 0 ${ACTION}_next2
        ClearErrors
        !if "${ACTION}" == "copy"
          CopyFiles /SILENT "$INSTDIR\script\Quota.jsx" "$PROGRAMFILES64\Adobe\$1\Presets\$3\Scripts"
          IfErrors 0 +2
            StrCpy $ScriptMissing "1"
        !else
          Delete "$PROGRAMFILES64\Adobe\$1\Presets\$3\Scripts\Quota.jsx"
        !endif
      ${ACTION}_next2:
      FindNext $2 $3
      Goto ${ACTION}_loop2
    ${ACTION}_done2:
    FindClose $2
    FindNext $0 $1
    Goto ${ACTION}_loop
  ${ACTION}_done:
  FindClose $0
!macroend

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

  ; script per la scorciatoia da tastiera (serve l'amministratore; se manca il pannello funziona comunque)
  StrCpy $ScriptMissing ""
  !insertmacro ScriptFolders "copy"

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
  StrCmp $ScriptMissing "1" 0 +3
    MessageBox MB_OK|MB_ICONINFORMATION "Fatto! Apri Illustrator e scegli Finestra > Estensioni > Quote.$\r$\n$\r$\nLo script Quota per la scorciatoia da tastiera non è stato installato: servono i permessi di amministratore."
    Return
  MessageBox MB_OK|MB_ICONINFORMATION "Fatto! Apri Illustrator e scegli Finestra > Estensioni > Quote."
FunctionEnd

Section "Uninstall"
  !insertmacro ScriptFolders "delete"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
SectionEnd
