@echo off
echo ========================================
echo   DEPLOY BIA - Firebase Hosting
echo ========================================
echo.

echo [1/2] Fazendo login no Firebase...
call firebase login
if errorlevel 1 goto error

echo.
echo [2/2] Fazendo deploy...
echo.
echo IMPORTANTE: Se for a primeira vez, escolha:
echo   - Create a new project (ou use um existente)
echo   - Public directory: public
echo   - Configure as SPA: Yes
echo   - Overwrite index.html: No
echo.
pause

call firebase init hosting
if errorlevel 1 goto error

call firebase deploy
if errorlevel 1 goto error

echo.
echo ========================================
echo   DEPLOY CONCLUIDO COM SUCESSO!
echo ========================================
echo.
echo Acesse a URL exibida acima para testar.
pause
exit /b 0

:error
echo.
echo ========================================
echo   ERRO NO DEPLOY
echo ========================================
pause
exit /b 1
