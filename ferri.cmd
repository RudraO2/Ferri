@echo off
rem Ferri's one command for Windows (PowerShell or cmd): ferri up, ferri down, ferri doctor, ...
rem The same commands as ./ferri (macOS, Linux, Git Bash). Run "ferri help" for the list.
setlocal EnableExtensions
cd /d "%~dp0"

where docker >nul 2>nul || (echo ferri: Docker is not installed. Get Docker Desktop: https://docs.docker.com/get-docker/ & exit /b 1)
docker info >nul 2>nul || (echo ferri: Docker is installed but not running. Start Docker Desktop and try again. & exit /b 1)
docker compose version >nul 2>nul || (echo ferri: Docker Compose v2 is missing. Update Docker Desktop. & exit /b 1)

rem A bind mount of a missing file would make Docker create a folder named .env.
if exist ".env\" (echo ferri: .env is a folder ^(Docker made it^). Remove it: rmdir .env & exit /b 1)
if not exist ".env" type nul > ".env"

set "CMD=%~1"
if "%CMD%"=="" set "CMD=help"
shift
set "ARGS="
:collect
if "%~1"=="" goto dispatch
set ARGS=%ARGS% %1
shift
goto collect

:dispatch
rem Inside ( ) the error level is read before the block runs, so these lines use && and ||.
if /i "%CMD%"=="up" goto up
if /i "%CMD%"=="down" (docker compose --profile * down && exit /b 0 || exit /b 1)
if /i "%CMD%"=="reset" goto reset
if /i "%CMD%"=="logs" (docker compose logs -f --tail 200 %ARGS% && exit /b 0 || exit /b 1)
if /i "%CMD%"=="ps" (docker compose ps -a && exit /b 0 || exit /b 1)
if /i "%CMD%"=="build" (docker compose --profile cli build && exit /b 0 || exit /b 1)
if /i "%CMD%"=="pull" (docker compose pull && exit /b 0 || exit /b 1)
if /i "%CMD%"=="help" goto help
docker compose run --rm --no-deps -e ANTHROPIC_API_KEY ferri-cli pnpm -s run %CMD% %ARGS%
exit /b %ERRORLEVEL%

:up
call :ensure_image || exit /b 1
docker compose run --rm --no-deps -e ANTHROPIC_API_KEY ferri-cli pnpm -s stack init || exit /b 1
echo Starting the stack (the first start downloads Switch and Mattermost, a few minutes) ...
call :ensure_core || exit /b 1
docker compose up -d --wait --wait-timeout 900
if errorlevel 1 (
  docker compose ps -a
  echo ferri: the stack did not come up. See "ferri logs ferri-setup" ^(or switch, mattermost^), and docs\troubleshooting.md.
  exit /b 1
)
docker compose run --rm --no-deps ferri-cli pnpm -s stack summary
exit /b %ERRORLEVEL%

:ensure_image
if "%FERRI_BUILD%"=="1" (docker compose --profile cli build ferri-cli && exit /b 0 || exit /b 1)
echo Getting Ferri's image ^(about 350 MB the first time, quick after that^) ...
docker compose --profile cli pull --quiet ferri-cli >nul 2>nul
if errorlevel 1 (
  echo Ferri's image is not published for this version yet; building it from this checkout ^(a few minutes, once^).
  docker compose --profile cli build ferri-cli
)
exit /b %ERRORLEVEL%

:ensure_core
rem Switch's core image (the switch service): the copy on this machine, else a pull, else a build
rem from our Switch fork at SWITCH_FORK_REF (.env) on top of Switch's published core. Compose reads
rem the extra file below with .env, so the build gets the exact image name the stack runs
rem (SWITCH_CORE_IMAGE, SWITCH_CORE_TAG) and the same Switch version as the gateway. Keep the
rem default commit in sync with .env.example and ./ferri.
docker compose pull --quiet --policy missing switch >nul 2>nul && exit /b 0
echo Switch's core image could not be pulled; building it from the Switch fork on GitHub (a few minutes, once).
set "CORE_YML=%TEMP%\ferri-switch-core-%RANDOM%.yml"
> "%CORE_YML%" (
  echo services:
  echo   switch:
  echo     build:
  echo       context: https://github.com/RudraO2/switch.git#${SWITCH_FORK_REF:-a3d560e0f1595e74e8456d01af30a6b6424b2048}
  echo       dockerfile: deploy/local/ferri/Dockerfile
  echo       args:
  echo         BASE: ${SWITCH_REGISTRY:-ghcr.io}/${SWITCH_IMAGE_NAMESPACE:-sandbox-quantum/dev}/switch-core:${SWITCH_VERSION:-0.31.1-dev.339.g86d5928}
)
set "CORE_FILES=-f compose.yml"
if exist "compose.override.yml" set "CORE_FILES=-f compose.yml -f compose.override.yml"
docker compose %CORE_FILES% -f "%CORE_YML%" build switch
set "CORE_RC=%ERRORLEVEL%"
del "%CORE_YML%" >nul 2>nul
if not "%CORE_RC%"=="0" echo ferri: could not build Switch's core image. See "pull access denied" in docs\troubleshooting.md.
exit /b %CORE_RC%

:reset
set /p ANSWER=This deletes all Ferri, Switch and Mattermost data in this stack. Type yes to go on:
if /i not "%ANSWER%"=="yes" (echo ferri: nothing deleted. & exit /b 1)
docker compose --profile * down -v
echo Deleted. "ferri up" starts fresh (your .env is kept).
exit /b 0

:help
echo usage: ferri ^<command^>
echo   up                 start everything (first run: asks for your Anthropic key, makes .env;
echo                      builds an image from source when it cannot pull it)
echo   down               stop (keeps your data)
echo   reset              stop and delete all data; keeps .env
echo   logs [service]     follow logs (ferri, desk, switch, ...)
echo   ps                 what is running
echo   build              build Ferri's image from this checkout instead of pulling it
echo   doctor             what is on, off or broken, with the next step for each
echo   connect telegram --token ^<bot token^>   (also discord, slack)
echo   ^<script^> [args]    any other package.json script, run inside the stack
exit /b 0
