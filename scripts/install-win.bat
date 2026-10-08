@echo off
rem Installa il pannello "Quote" in Illustrator (Windows) senza firma ZXP.
set "SRC=%~dp0..\extension"
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.mobbys.illustratorquote"

rem Permette il caricamento di estensioni non firmate
for %%v in (8 9 10 11 12 13) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul

if exist "%DEST%" rmdir /s /q "%DEST%"
xcopy /E /I /Y /Q "%SRC%" "%DEST%" >nul
echo Installato in: %DEST%
echo Riavvia Illustrator e apri Finestra ^> Estensioni ^> Quote
pause
