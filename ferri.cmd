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
if /i "%CMD%"=="up" goto up
if /i "%CMD%"=="down" (docker compose --profile * down & exit /b %ERRORLEVEL%)
if /i "%CMD%"=="reset" goto reset
if /i "%CMD%"=="logs" (docker compose logs -f --tail 200 %ARGS% & exit /b %ERRORLEVEL%)
if /i "%CMD%"=="ps" (docker compose ps -a & exit /b %ERRORLEVEL%)
if /i "%CMD%"=="build" (docker compose --profile cli build & exit /b %ERRORLEVEL%)
if /i "%CMD%"=="pull" (docker compose pull & exit /b %ERRORLEVEL%)
if /i "%CMD%"=="help" goto help
docker compose run --rm --no-deps -e ANTHROPIC_API_KEY ferri-cli pnpm -s run %CMD% %ARGS%
exit /b %ERRORLEVEL%

:up
call :ensure_image || exit /b 1
docker compose run --rm --no-deps -e ANTHROPIC_API_KEY ferri-cli pnpm -s stack init || exit /b 1
echo Starting the stack (the first start downloads Switch and Mattermost, a few minutes) ...
docker compose up -d --wait --wait-timeout 900
if errorlevel 1 (
  docker compose ps -a
  echo ferri: the stack did not come up. See "ferri logs ferri-setup" ^(or switch, mattermost^), and docs\troubleshooting.md.
  exit /b 1
)
docker compose run --rm --no-deps ferri-cli pnpm -s stack summary
exit /b %ERRORLEVEL%

:ensure_image
if "%FERRI_BUILD%"=="1" (docker compose --profile cli build ferri-cli & exit /b %ERRORLEVEL%)
docker compose --profile cli pull --quiet ferri-cli >nul 2>nul
if errorlevel 1 (
  echo Ferri's image is not published for this version yet; building it from this checkout ^(a few minutes, once^).
  docker compose --profile cli build ferri-cli
)
exit /b %ERRORLEVEL%

:reset
set /p ANSWER=This deletes all Ferri, Switch and Mattermost data in this stack. Type yes to go on:
if /i not "%ANSWER%"=="yes" (echo ferri: nothing deleted. & exit /b 1)
docker compose --profile * down -v
echo Deleted. "ferri up" starts fresh (your .env is kept).
exit /b 0

:help
echo usage: ferri ^<command^>
echo   up                 start everything (first run: asks for your Anthropic key, makes .env)
echo   down               stop (keeps your data)
echo   reset              stop and delete all data; keeps .env
echo   logs [service]     follow logs (ferri, desk, switch, ...)
echo   ps                 what is running
echo   build              build Ferri's image from this checkout instead of pulling it
echo   doctor             what is on, off or broken, with the next step for each
echo   connect telegram --token ^<bot token^>   (also discord, slack)
echo   ^<script^> [args]    any other package.json script, run inside the stack
exit /b 0
