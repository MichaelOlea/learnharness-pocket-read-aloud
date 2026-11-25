"""Line-delimited JSON bridge for a single on-demand local Pocket TTS process."""

import base64
from contextlib import redirect_stdout
import io
import json
from pathlib import Path, PurePosixPath
import sys
import tempfile
import wave

# Reserve stdout for the protocol, even if a dependency prints during import.
output = sys.stdout
sys.stdout = sys.stderr


def custom_config(selection):
    from huggingface_hub import hf_hub_download
    import yaml

    if selection["type"] == "local":
        source = Path(selection["source"])
        if source.is_dir():
            source = source / "config.yaml"
        base = source.parent
    else:
        repo, name = selection["source"].split(":", 1)
        source = Path(hf_hub_download(repo, name))
        base = PurePosixPath(name).parent

    with source.open(encoding="utf-8") as stream:
        config = yaml.safe_load(stream)
    if not isinstance(config, dict):
        raise ValueError("Expected a Pocket TTS YAML configuration.")

    paths = {"weights_path", "weights_path_without_voice_cloning", "tokenizer_path"}

    def resolve(node):
        for key, value in node.items():
            if isinstance(value, dict):
                resolve(value)
            elif key in paths and isinstance(value, str) and not value.startswith("hf://"):
                if "://" in value:
                    raise ValueError("Use local or Hugging Face paths for model assets.")
                if selection["type"] == "local":
                    node[key] = str((base / value).resolve())
                else:
                    relative = PurePosixPath(value)
                    if relative.is_absolute() or ".." in relative.parts:
                        raise ValueError("Use repository-relative model asset paths.")
                    node[key] = f"hf://{repo}/{base / relative}"

    resolve(config)
    return yaml.safe_dump(config)


def load(selection):
    import torch
    from pocket_tts import TTSModel
    from pocket_tts.default_parameters import get_default_voice_for_language

    torch.set_num_threads(2)
    if selection["type"] == "builtin":
        language = selection["source"]
        model = TTSModel.load_model(language=language)
        default_voice = get_default_voice_for_language(language)
    else:
        with tempfile.TemporaryDirectory(prefix="lh-pocket-tts-") as directory:
            config = Path(directory) / "config.yaml"
            config.write_text(custom_config(selection), encoding="utf-8")
            model = TTSModel.load_model(config=config)
        default_voice = get_default_voice_for_language(None, config="custom")
    voice = selection.get("voice")
    if selection["type"] != "builtin" and not voice and not model.has_voice_cloning:
        raise ValueError("This model needs a matching local .safetensors voice state.")
    return model, model.get_state_for_audio_prompt(voice or default_voice)


def wav(model, voice, text):
    audio = model.generate_audio(voice, text).detach().cpu()
    pcm = (audio.clamp(-1, 1) * 32767).short().numpy().astype("<i2", copy=False)
    data = io.BytesIO()
    with wave.open(data, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(model.sample_rate)
        stream.writeframes(pcm.tobytes())
    return base64.b64encode(data.getvalue()).decode("ascii")


def main():
    loaded = None
    model = voice = None
    with redirect_stdout(sys.stderr):
        for line in sys.stdin:
            try:
                request = json.loads(line)
                selection = request["model"]
                if selection != loaded:
                    loaded = None
                    model = voice = None
                    model, voice = load(selection)
                    loaded = selection
                if request.get("probe"):
                    from pocket_tts.default_parameters import get_default_text_for_language

                    language = selection["source"] if selection["type"] == "builtin" else None
                    sample = get_default_text_for_language(language).split(".")[0]
                    model.generate_audio(voice, sample)
                result = wav(model, voice, request["text"]) if "text" in request else True
                reply = {"result": result}
            except ModuleNotFoundError:
                reply = {"error": "Install Pocket TTS 4.0.1 in the configured Python environment."}
            except Exception as error:
                reply = {"error": str(error) or type(error).__name__}
            print(json.dumps(reply), file=output, flush=True)


if __name__ == "__main__":
    main()
