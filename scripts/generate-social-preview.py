"""Regenerate the static sharing image from the existing logo (requires Pillow)."""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--font", type=Path, help="Regular TrueType font path")
    parser.add_argument("--bold-font", type=Path, help="Bold TrueType font path")
    args = parser.parse_args()
    regular = args.font or "DejaVuSans.ttf"
    bold = args.bold_font or "DejaVuSans-Bold.ttf"
    windows_fonts = Path(r"C:\Windows\Fonts")
    if not args.font and (windows_fonts / "segoeui.ttf").exists():
        regular = windows_fonts / "segoeui.ttf"
    if not args.bold_font and (windows_fonts / "segoeuib.ttf").exists():
        bold = windows_fonts / "segoeuib.ttf"

    image = Image.new("RGB", (1200, 630), "#101827")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1199, 11), fill="#a78bfa")
    draw.rounded_rectangle((50, 50, 1150, 580), radius=28, fill="#172338", outline="#344460", width=2)
    logo = Image.open(ROOT / "public" / "logo.png").convert("RGBA")
    logo.thumbnail((248, 248), Image.Resampling.LANCZOS)
    image.paste(logo, (84, 160), logo)

    def text(position, content, size, color, strong=False):
        font = ImageFont.truetype(str(bold if strong else regular), size)
        bounds = draw.textbbox(position, content, font=font)
        if bounds[2] > 1120:
            raise ValueError(f"Text exceeds the sharing image's safe area: {content}")
        draw.text(position, content, font=font, fill=color)

    text((370, 128), "Gateway Forge", 70, "#f3f6fc", strong=True)
    text((374, 227), "Visual configuration builder", 36, "#c4b5fd")
    text((374, 286), "Omnissa Unified Access Gateway", 30, "#cbd5e1")
    text((90, 456), "INI  /  JSON  /  PowerShell  /  OpenShift YAML", 29, "#f3f6fc", strong=True)
    text((90, 517), "Runs entirely in your browser", 26, "#a8b8d0")
    image.save(ROOT / "public" / "social-preview.png", optimize=True)


if __name__ == "__main__":
    main()
