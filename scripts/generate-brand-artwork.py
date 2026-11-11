"""Generate original UAG Foundry Cast gateway artwork locally (requires Pillow).

From the repository root:
    python scripts/generate-brand-artwork.py
    python scripts/generate-social-preview.py
    python -m unittest discover -s scripts -p "branding_artifacts_test.py"

The SVG is the canonical 32-unit mark. Pillow rasterizes its circular arcs and
round strokes at 4x resolution before Lanczos downsampling; no external services,
fonts, browser sessions, or image-model dependencies are used for icon artwork.
"""

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PURPLE = "#6b4fb3"
DARK_PURPLE = "#c9b4ff"
SIZES = (16, 32, 48, 180, 192, 512)
BODY_PATH = "M4 6h6v12a6 6 0 0 0 12 0V6h6v12a12 12 0 0 1-24 0Z"
ARROW_PATH = "M7 14h16m-4-4 4 4-4 4"
SVG = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-labelledby="title">
  <title id="title">UAG Foundry Cast gateway</title>
  <rect width="32" height="32" rx="6" fill="white"/>
  <g color="{PURPLE}">
    <path d="{BODY_PATH}" fill="currentColor"/>
    <path d="{ARROW_PATH}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
'''


def render_icon(size, background="white", color=PURPLE):
    """Rasterize the exact mark with an optional rounded background."""
    scale = size * 4 / 32
    image = Image.new("RGBA", (size * 4, size * 4))
    draw = ImageDraw.Draw(image)
    if background is not None:
        draw.rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=6 * scale, fill=background)

    def arc(radius, start, end):
        return [(16 + radius * math.cos(math.radians(start + (end - start) * i / 720)),
                 18 + radius * math.sin(math.radians(start + (end - start) * i / 720)))
                for i in range(721)]

    points = [(4, 6), (10, 6), (10, 18)] + arc(6, 180, 0)
    points += [(22, 6), (28, 6), (28, 18)] + arc(12, 0, 180)
    draw.polygon([(x * scale, y * scale) for x, y in points], fill=color)
    radius = 1.25 * scale
    for line in (((7, 14), (23, 14)), ((19, 10), (23, 14), (19, 18))):
        pixels = [(x * scale, y * scale) for x, y in line]
        draw.line(pixels, fill=color, width=round(2.5 * scale), joint="curve")
        for x, y in pixels:
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def generate(root=ROOT):
    public = root / "public"
    assets = root / "assets"
    (public / "logo.svg").write_text(SVG, encoding="utf-8", newline="\n")
    for size in SIZES:
        render_icon(size).save(public / f"favicon-{size}.png", optimize=True)
    render_icon(256).save(public / "logo.png", optimize=True)
    render_icon(48).save(public / "favicon.ico", format="ICO", sizes=[(size, size) for size in (16, 32, 48)],
                         append_images=[render_icon(16), render_icon(32)])
    for name, size in (("uag-foundry-icon.png", 1024), ("uag-foundry-readme-icon.png", 140), ("avatar-460.png", 460)):
        render_icon(size).save(assets / name, optimize=True)
    render_icon(140, background=None, color=DARK_PURPLE).save(assets / "uag-foundry-readme-icon-dark.png", optimize=True)
    for name in ("gateway-forge-icon.png", "gateway-forge-readme-icon.png"):
        (assets / name).unlink(missing_ok=True)


def main():
    argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    generate()


if __name__ == "__main__":
    main()
