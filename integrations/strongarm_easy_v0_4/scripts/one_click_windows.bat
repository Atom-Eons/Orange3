@echo off
cd /d %~dp0\..
echo STRONGARM one-click start
python strongarm.py doctor
python strongarm.py pull
python strongarm.py server
pause
