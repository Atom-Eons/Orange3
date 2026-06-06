@echo off
cd /d %~dp0\..
python council_v2.py init
python council_v2.py run "Design STRONGARM v2 for GTi15 with low token burn" --mode normal --heuristic
pause
