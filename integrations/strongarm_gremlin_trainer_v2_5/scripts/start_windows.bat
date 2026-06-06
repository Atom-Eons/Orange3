@echo off
cd /d %~dp0\..
python council_v2.py init
python council_v2.py server
pause
