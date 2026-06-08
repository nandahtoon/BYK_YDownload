@echo off
title VeloceDL Launcher
echo ===================================================
echo             VeloceDL - YouTube Downloader          
echo ===================================================
echo.

:: Check for Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not added to your system PATH.
    echo Please install Python 3.10+ and select "Add Python to PATH" during setup.
    pause
    exit /b 1
)

:: Check if virtual environment exists, if not create it
if not exist .venv (
    echo [INFO] Creating Python virtual environment...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

:: Install/verify dependencies
echo [INFO] Verifying requirements...
.venv\Scripts\python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

:: Launch the application
echo [INFO] Launching VeloceDL...
start "" .venv\Scripts\pythonw.exe main.py
echo [INFO] Launcher finished. The app is running in the background.
exit /b 0
