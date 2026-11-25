from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent
version = json.loads((root / "src/manifest.json").read_text())["version"]
target = root / f"pocket-read-aloud-v{version}.zip"
with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    for file in sorted((root / "src").iterdir()):
        if file.is_file():
            archive.write(file, f"pocket-read-aloud/dist/{file.name}")
    for name in ("README.md", "LICENSE", "AI_DISCLOSURE.md"):
        archive.write(root / name, f"pocket-read-aloud/{name}")
print(target)
