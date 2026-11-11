"""Generate UAG Studio workspace artwork locally (requires Pillow).

From the repository root:
    python scripts/generate-brand-artwork.py
    python scripts/generate-social-preview.py
    python -m unittest discover -s scripts -p "branding_artifacts_test.py"

The SVG is the canonical 32-unit mark, with a purpose-drawn optical 16-unit
favicon. Pillow rasterizes the same path data, sampling cubic Bezier curves at
4x resolution before Lanczos downsampling. No external services, fonts, browser
sessions, or image-model dependencies are used for icon artwork.
"""

import argparse
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PURPLE = "#6b4fb3"
DARK_PURPLE = "#c9b4ff"
SIZES = (16, 32, 48, 180, 192, 512)
WORKSPACE_PATHS = (
    "M9 3H29V23H26V6H9Z",
    "M3 8H24V11H3Z",
    "M3 11H6V26H3Z",
    "M21 11H24V26H21Z",
    "M3 26H24V29H3Z",
    "M9 14H18V24H15V17H12V24H9Z",
)
OPTICAL_WORKSPACE_PATHS = (
    "M5 1H15V11H13V3H5Z",
    "M1 4H12V6H1Z",
    "M1 6H3V13H1Z",
    "M10 6H12V13H10Z",
    "M1 13H12V15H1Z",
    "M4 7H9V12H7.5V9H5.5V12H4Z",
)


def svg_markup(units, paths):
    geometry = "\n".join(f'    <path d="{path}"/>' for path in paths)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {units} {units}" role="img" aria-labelledby="title">
  <title id="title">UAG Studio workspace</title>
  <rect width="{units}" height="{units}" rx="{units * 3 // 16}" fill="white"/>
  <g fill="{PURPLE}">
{geometry}
  </g>
</svg>
'''


SVG = svg_markup(32, WORKSPACE_PATHS)
FAVICON_SVG = svg_markup(16, OPTICAL_WORKSPACE_PATHS)


def path_points(path):
    """Flatten the mark's SVG commands, including exact cubic Bezier curves."""
    tokens = re.findall(r"[MmLlHhVvCcZz]|-?\d+(?:\.\d+)?", path)
    points = []
    x = y = 0
    index = 0
    while index < len(tokens):
        command = tokens[index]
        index += 1
        kind = command.upper()
        if kind == "Z":
            points.append(points[0])
            continue
        count = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6}[kind]
        values = list(map(float, tokens[index:index + count]))
        index += count
        relative = command.islower()
        if kind == "C":
            coordinates = [(values[i] + (x if relative else 0),
                            values[i + 1] + (y if relative else 0)) for i in (0, 2, 4)]
            start = (x, y)
            for step in range(1, 257):
                t = step / 256
                weights = ((1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3)
                points.append(tuple(sum(w * p[axis] for w, p in zip(weights, [start] + coordinates))
                                    for axis in (0, 1)))
            x, y = coordinates[-1]
        else:
            if kind in ("M", "L", "H"):
                x = values[0] + (x if relative else 0)
            if kind in ("M", "L", "V"):
                y = values[-1] + (y if relative else 0)
            points.append((x, y))
    return points


def render_icon(size, background="white", color=PURPLE):
    """Rasterize the exact mark with an optional rounded background."""
    units = 16 if size == 16 else 32
    scale = size * 4 / units
    image = Image.new("RGBA", (size * 4, size * 4))
    draw = ImageDraw.Draw(image)
    if background is not None:
        draw.rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=units * 3 / 16 * scale, fill=background)
    paths = OPTICAL_WORKSPACE_PATHS if size == 16 else WORKSPACE_PATHS
    for path in paths:
        draw.polygon([(x * scale, y * scale) for x, y in path_points(path)], fill=color)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def generate(root=ROOT):
    public = root / "public"
    assets = root / "assets"
    (public / "logo.svg").write_text(SVG, encoding="utf-8", newline="\n")
    (public / "favicon.svg").write_text(FAVICON_SVG, encoding="utf-8", newline="\n")
    for size in SIZES:
        render_icon(size).save(public / f"favicon-{size}.png", optimize=True)
    render_icon(256).save(public / "logo.png", optimize=True)
    render_icon(48).save(public / "favicon.ico", format="ICO", sizes=[(size, size) for size in (16, 32, 48)],
                         append_images=[render_icon(16), render_icon(32)])
    for name, size in (("uag-studio-icon.png", 1024), ("uag-studio-readme-icon.png", 140), ("avatar-460.png", 460)):
        render_icon(size).save(assets / name, optimize=True)
    render_icon(140, background=None, color=DARK_PURPLE).save(assets / "uag-studio-readme-icon-dark.png", optimize=True)
    for name in ("gateway-forge-icon.png", "gateway-forge-readme-icon.png",
                 "uag-foundry-icon.png", "uag-foundry-readme-icon.png", "uag-foundry-readme-icon-dark.png"):
        (assets / name).unlink(missing_ok=True)


def main():
    argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    generate()


if __name__ == "__main__":
    main()
