# START HERE — STRONGARM EASY

This is the easiest version.

## Windows

1. Install Ollama.
2. Double-click:

```text
scripts\pull_model_windows.bat
```

3. Double-click:

```text
scripts\start_windows.bat
```

4. Open:

```text
http://127.0.0.1:8094/ui
```

## Mac / Linux

```bash
chmod +x scripts/*.sh
./scripts/pull_model_mac_linux.sh
./scripts/start_mac_linux.sh
```

Then open:

```text
http://127.0.0.1:8094/ui
```

## No Ollama yet

You can still test the logic:

```bash
python strongarm.py demo --heuristic
```

## The whole point

Do not train first.

Get STRONGARM running as a local critic first. Every receipt becomes future training data.
