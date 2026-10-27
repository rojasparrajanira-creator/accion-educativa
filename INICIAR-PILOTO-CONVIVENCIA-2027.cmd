@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Material Educativo Chile - Piloto Convivencia 2027
color 1F
cd /d "%~dp0"

echo.
echo ================================================================
echo   MATERIAL EDUCATIVO CHILE - PILOTO CONVIVENCIA EDUCATIVA 2027
echo   SOLO ESTE COMPUTADOR - INFORMACION TOTALMENTE FICTICIA
echo ================================================================
echo.

if not exist "convivencia-api\piloto-local-pgce-2027.cjs" (
  echo ERROR: Falta la carpeta "convivencia-api".
  echo Descarga el ZIP completo de la rama del piloto y extraelo.
  goto :fail
)
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: No se encontro Node.js.
  echo Instala Node.js 22 LTS o superior desde https://nodejs.org/
  echo Cierra esta ventana y vuelve a hacer doble clic en este archivo.
  goto :fail
)
for /f "delims=" %%v in ('node -p "parseInt(process.versions.node.split('.')[0],10)"') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR goto :node_old
if %NODE_MAJOR% LSS 22 goto :node_old

cd /d "%~dp0convivencia-api"
echo Comprobando los componentes del laboratorio...
node -e "require.resolve('express');require.resolve('@electric-sql/pglite')" >nul 2>nul
if errorlevel 1 (
  where npm >nul 2>nul
  if errorlevel 1 (
    echo ERROR: No se encontro npm. Reinstala Node.js desde nodejs.org.
    goto :fail
  )
  echo Instalando dependencias SOLO en esta carpeta.
  echo Esta instalacion necesita Internet una vez; NO conecta a Render.
  call npm install --include=dev --no-audit --no-fund
  if errorlevel 1 (
    echo ERROR: La instalacion no se completo. Verifica tu conexion a Internet.
    goto :fail
  )
)

set "PGCE_PILOT_LOCAL=1"
set "PGCE_PILOT_PORT=4173"
echo.
echo El piloto solo se abrira en este computador: 127.0.0.1
echo Si Windows pregunta por acceso de red, NO habilites redes publicas.
echo.
echo Al abrir el navegador, selecciona "Abrir pauta UAT (20 casos)".
echo Recuerda descargar el JSON antes de cerrar la pauta: los datos
echo sinteticos del laboratorio no se guardan en la nube.
echo.
echo Para cerrar el piloto, vuelve a esta ventana y pulsa Ctrl+C.
echo.
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 4; Start-Process 'http://127.0.0.1:4173/?perfil=coordinacion'"
node piloto-local-pgce-2027.cjs
if errorlevel 1 (
  echo.
  echo ERROR: No se pudo iniciar el piloto.
  echo Revisa que el puerto 4173 este disponible y que no uses variables
  echo DATABASE_URL o de entorno productivo en tu computador.
  goto :fail
)
goto :end

:node_old
echo ERROR: Se requiere Node.js 22 LTS o superior.
echo Descargalo desde https://nodejs.org/
goto :fail

:fail
echo.
echo No se ha realizado ninguna modificacion en Render o en la plataforma real.
pause
exit /b 1

:end
endlocal
