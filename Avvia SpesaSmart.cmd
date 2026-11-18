@echo off
setlocal
title SpesaSmart
rem ------------------------------------------------------------------
rem  Avvia SpesaSmart sul computer (doppio clic su questo file).
rem  I file del progetto restano in questa cartella; per velocita' l'app
rem  viene copiata ed eseguita da una cartella locale del PC:
rem  %LOCALAPPDATA%\SpesaSmart\app
rem ------------------------------------------------------------------

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non e' installato. Scarica la versione LTS da https://nodejs.org , installala e riprova.
  pause
  exit /b 1
)

set "SRC=%~dp0."
set "APP=%LOCALAPPDATA%\SpesaSmart\app"

echo [1/3] Copio i file del progetto...
robocopy "%SRC%" "%APP%" /MIR /XD node_modules dist dev-dist .git .claude carburanti /XF "*.cmd" /NFL /NDL /NJH /NJS /NP >nul
if %ERRORLEVEL% GEQ 8 (
  echo Errore nella copia dei file.
  pause
  exit /b 1
)

cd /d "%APP%"
echo [2/3] Controllo le librerie (la prima volta richiede qualche minuto)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo Installazione delle librerie non riuscita: controlla la connessione a Internet.
  pause
  exit /b 1
)

rem "verifica": controlla solo copia e installazione, senza avviare l'app.
if /i "%~1"=="verifica" exit /b 0

if /i "%~1"=="telefono" (
  echo [3/3] Avvio per il telefono: apri sul telefono l'indirizzo "Network: https://..." mostrato qui sotto
  echo        ^(stessa rete Wi-Fi; il browser avvisera' del certificato: scegli "Procedi"^).
  call npm run dev:telefono
) else (
  echo [3/3] Avvio SpesaSmart: si aprira' il browser su http://localhost:5173
  echo        Per chiudere l'app chiudi questa finestra.
  call npm run dev -- --open
)
pause
