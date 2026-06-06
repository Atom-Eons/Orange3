@echo off
cd /d %~dp0\..
python strongarm.py doctor
python strongarm.py server
pause
