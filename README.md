# Pocket Read Aloud for LearnHarness

An independent community plugin for [LearnHarness](https://github.com/amosblomqvist/learnharness) that reads lesson chunks aloud using [Kyutai Pocket TTS](https://github.com/kyutai-labs/pocket-tts) on your computer.

## Install

1. Download [pocket-read-aloud-v1.1.1.zip](pocket-read-aloud-v1.1.1.zip).
2. In LearnHarness, open Settings → Community plugins and locate the plugins directory.
3. Extract the ZIP there. The expected path is `pocket-read-aloud/dist/manifest.json`.
4. Install Pocket TTS 4.0.1 in Python 3.10–3.14: `python -m pip install "pocket-tts==4.0.1"`. Use CPU PyTorch if available.
5. Refresh Community plugins and enable Pocket Read Aloud.

The plugin starts `python3` on macOS/Linux or `python` on Windows. If you use a virtual environment, set `LH_POCKET_TTS_PYTHON` to its absolute Python interpreter path before launching LearnHarness.

For updates, replace only the plugin's `dist/` directory and restart the app. Keep `data/` and downloaded model files.

## Use

Click the speaker beside a lesson chunk to read it aloud. Click again to stop. Select text and use **Read from here** to start at the selection. The speaker resumes a saved position, and the restart button starts the chunk over. Fenced code blocks are skipped.

## Settings

| Setting | Behavior |
| --- | --- |
| Pocket TTS model | Choose a built-in model or compatible custom configuration. |
| Model setup | Download and validate the chosen model before using it. |
| Highlight spoken words | Follow estimated word timing during playback. |
| Keep last word highlighted | Retain the highlighted word when stopped. |
| Remember playback position | Save positions per chunk in local browser storage. |
| Highlight color | Use the current theme or a custom color. |

The default is the 18M English model. Custom Hugging Face models require a compatible Pocket TTS configuration: enter `owner/repo` for a root config.yaml or `owner/repo:path/to/config.yaml`. Local models accept an absolute YAML path or a directory containing config.yaml. Some custom models require a matching local voice-state file or voice sample.

## Resources and privacy

Speech is generated locally using a Python worker with two CPU threads. Initial model setup downloads model assets. The default worker peaked at 674 MiB in one Linux cold-start test. It exits after two minutes idle. Model settings live in plugin data; positions and highlight preferences live in browser storage. Lesson text is passed to the local worker. Once assets are cached, set `HF_HUB_OFFLINE=1` before launching LearnHarness for offline asset access.

## Compatibility and limitations

- Stock LearnHarness 0.6.1 and 0.7.0 were tested for plugin loading and offline synthesis using the original drop-in package.
- The plugin uses internal lesson DOM structure to place its controls; future app updates may require changes.
- Pocket TTS does not return word timestamps. Highlight and resume timing are estimated.
- The latest UI uses the CSS Custom Highlight API. Full desktop selection and cross-platform testing are pending.
- The user reported the plugin working in their installation.

## Build

The distributable source is in `src/`. Run `python build.py` to create the installable ZIP. No JavaScript build dependencies are required.

## License and AI disclosure

AGPL-3.0, following LearnHarness. Pocket TTS and its separately downloaded model weights have their own terms. See [AI_DISCLOSURE.md](AI_DISCLOSURE.md).
