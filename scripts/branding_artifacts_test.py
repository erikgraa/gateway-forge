"""Local branding validation: python -m unittest discover -s scripts -p branding_artifacts_test.py."""

import hashlib
import importlib.util
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("brand_artwork", ROOT / "scripts" / "generate-brand-artwork.py")
artwork = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artwork)
social_spec = importlib.util.spec_from_file_location("social_preview", ROOT / "scripts" / "generate-social-preview.py")
social = importlib.util.module_from_spec(social_spec)
social_spec.loader.exec_module(social)


class BrandingArtifactsTest(unittest.TestCase):
    def test_canonical_svg(self):
        svg = ET.parse(ROOT / "public" / "logo.svg").getroot()
        ns = {"svg": "http://www.w3.org/2000/svg"}
        self.assertEqual(svg.attrib["viewBox"], "0 0 32 32")
        self.assertEqual(svg.find("svg:title", ns).text, "UAG Studio workspace")
        self.assertEqual(svg.find("svg:g", ns).attrib["fill"], "#6b4fb3")
        self.assertEqual([path.attrib["d"] for path in svg.findall("svg:g/svg:path", ns)], [
            "M9 3H29V23H26V6H9Z", "M3 8H24V11H3Z", "M3 11H6V26H3Z",
            "M21 11H24V26H21Z", "M3 26H24V29H3Z", "M9 14H18V24H15V17H12V24H9Z",
        ])
        self.assertEqual(svg.find("svg:rect", ns).attrib, {"width": "32", "height": "32", "rx": "6", "fill": "white"})

    def test_png_dimensions_and_generator_consistency(self):
        files = {f"public/favicon-{size}.png": size for size in artwork.SIZES}
        files.update({"public/logo.png": 256, "assets/uag-studio-icon.png": 1024,
                      "assets/uag-studio-readme-icon.png": 140, "assets/avatar-460.png": 460})
        for relative, size in files.items():
            with self.subTest(path=relative), Image.open(ROOT / relative) as image:
                self.assertEqual(image.size, (size, size))
                self.assertEqual(image.mode, "RGBA")
                self.assertEqual(image.tobytes(), artwork.render_icon(size).tobytes())
                self.assertLessEqual(image.getpixel((0, 0))[3], 3)
        for name in ("gateway-forge-icon.png", "gateway-forge-readme-icon.png",
                     "uag-foundry-icon.png", "uag-foundry-readme-icon.png", "uag-foundry-readme-icon-dark.png"):
            self.assertFalse((ROOT / "assets" / name).exists())

    def test_render_geometry(self):
        image = artwork.render_icon(512)
        for point in ((16, 4), (27, 15), (13, 9), (4, 16), (22, 16), (13, 27), (10, 20), (16, 20)):
            self.assertEqual(image.getpixel(tuple(round(v * 16) for v in point)), (107, 79, 179, 255))
        for point in ((2, 16), (8, 20), (13, 20), (19, 20), (25, 16), (13, 12), (16, 7)):
            self.assertEqual(image.getpixel(tuple(round(v * 16) for v in point)), (255, 255, 255, 255))

    def test_closed_workspace_paths(self):
        for path in artwork.WORKSPACE_PATHS + artwork.OPTICAL_WORKSPACE_PATHS:
            points = artwork.path_points(path)
            self.assertEqual(points[0], points[-1])
        self.assertEqual(artwork.path_points(artwork.WORKSPACE_PATHS[0]),
                         [(9, 3), (29, 3), (29, 23), (26, 23), (26, 6), (9, 6), (9, 3)])

    def test_optical_favicon(self):
        svg = ET.parse(ROOT / "public" / "favicon.svg").getroot()
        ns = {"svg": "http://www.w3.org/2000/svg"}
        self.assertEqual(svg.attrib["viewBox"], "0 0 16 16")
        self.assertEqual(svg.find("svg:rect", ns).attrib, {"width": "16", "height": "16", "rx": "3", "fill": "white"})
        self.assertEqual(svg.find("svg:g", ns).attrib["fill"], artwork.PURPLE)
        self.assertEqual([path.attrib["d"] for path in svg.findall("svg:g/svg:path", ns)],
                         list(artwork.OPTICAL_WORKSPACE_PATHS))
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('<link rel="icon" type="image/svg+xml" href="./favicon.svg" sizes="any" />', html)
        self.assertNotIn('href="./logo.svg"', html)
        self.assertEqual(artwork.OPTICAL_WORKSPACE_PATHS, (
            "M5 1H15V11H13V3H5Z", "M1 4H12V6H1Z", "M1 6H3V13H1Z",
            "M10 6H12V13H10Z", "M1 13H12V15H1Z", "M4 7H9V12H7.5V9H5.5V12H4Z",
        ))
        optical = artwork.render_icon(16)
        self.assertNotEqual(optical.tobytes(), artwork.render_icon(32).resize((16, 16), Image.Resampling.LANCZOS).tobytes())
        for point in ((7, 1), (1, 10), (8, 14)):
            self.assertGreater(optical.getpixel(point)[3], 250)
        self.assertGreater(optical.getpixel((6, 10))[0], 240)

    def test_readme_theme_variants(self):
        with Image.open(ROOT / "assets" / "uag-studio-readme-icon-dark.png") as dark:
            self.assertEqual(dark.size, (140, 140))
            self.assertEqual(dark.mode, "RGBA")
            self.assertEqual(dark.tobytes(), artwork.render_icon(140, background=None, color=artwork.DARK_PURPLE).tobytes())
            self.assertEqual(dark.getpixel((58, 80))[3], 0)
            self.assertEqual(dark.getpixel((7, 70))[3], 0)
            self.assertEqual(dark.getpixel((44, 88)), (201, 180, 255, 255))
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn('<source media="(prefers-color-scheme: dark)" srcset="assets/uag-studio-readme-icon-dark.png">', readme)
        self.assertIn('<img src="assets/uag-studio-readme-icon.png"', readme)

    def test_ico_frames_match_pngs(self):
        with Image.open(ROOT / "public" / "favicon.ico") as ico:
            self.assertEqual(ico.ico.sizes(), {(16, 16), (32, 32), (48, 48)})
            for size in (16, 32, 48):
                with Image.open(ROOT / "public" / f"favicon-{size}.png") as png:
                    self.assertEqual(ico.ico.getimage((size, size)).tobytes(), png.tobytes())

    def test_social_icon_transparency_and_preserved_layout(self):
        icon = artwork.render_icon(256, background=None, color=artwork.DARK_PURPLE)
        self.assertEqual(icon.getpixel((16, 128))[3], 0)
        self.assertEqual(icon.getpixel((80, 160)), (201, 180, 255, 255))
        fonts = Path(r"C:\Windows\Fonts")
        regular = fonts / "segoeui.ttf" if (fonts / "segoeui.ttf").exists() else "DejaVuSans.ttf"
        bold = fonts / "segoeuib.ttf" if (fonts / "segoeuib.ttf").exists() else "DejaVuSans-Bold.ttf"
        preview = social.render_preview(regular, bold)
        with patch.object(social.artwork, "render_icon", return_value=artwork.render_icon(256)):
            released_layout = social.render_preview(regular, bold)
        bounds = ImageChops.difference(preview, released_layout).getbbox()
        self.assertIsNotNone(bounds)
        self.assertGreaterEqual(bounds[0], 84)
        self.assertGreaterEqual(bounds[1], 160)
        self.assertLessEqual(bounds[2], 332)
        self.assertLessEqual(bounds[3], 408)
        icon.thumbnail((248, 248), Image.Resampling.LANCZOS)
        expected = Image.new("RGB", (248, 248), "#172338")
        expected.paste(icon, (0, 0), icon)
        actual = preview.crop((84, 160, 332, 408))
        self.assertEqual(actual.tobytes(), expected.tobytes())
        self.assertNotIn((255, 255, 255), actual.getdata())
        self.assertEqual(preview.getpixel((0, 20)), (16, 24, 39))
        self.assertEqual(preview.getpixel((0, 0)), (167, 139, 250))

    def test_social_preview_and_repeatable_generation(self):
        with Image.open(ROOT / "public" / "social-preview.png") as image:
            self.assertEqual(image.size, (1200, 630))
            self.assertEqual(image.mode, "RGB")
        paths = [ROOT / "public" / "logo.svg", ROOT / "public" / "favicon.svg", ROOT / "public" / "favicon.ico"]
        paths += list((ROOT / "public").glob("*.png")) + list((ROOT / "assets").glob("*.png"))
        def digest(path):
            data = path.read_text(encoding="utf-8").encode("utf-8") if path.suffix == ".svg" else path.read_bytes()
            return hashlib.sha256(data).hexdigest()

        before = {path.relative_to(ROOT): digest(path) for path in paths}
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "public").mkdir()
            (root / "assets").mkdir()
            obsolete = ("gateway-forge-icon.png", "gateway-forge-readme-icon.png",
                        "uag-foundry-icon.png", "uag-foundry-readme-icon.png", "uag-foundry-readme-icon-dark.png")
            for name in obsolete:
                (root / "assets" / name).write_bytes(b"obsolete artwork")
            artwork.generate(root)
            for name in obsolete:
                self.assertFalse((root / "assets" / name).exists())
            with patch.object(social, "ROOT", root), patch.object(sys, "argv", ["generate-social-preview.py"]):
                social.main()
            self.assertEqual(before, {relative: digest(root / relative) for relative in before})
        source = (ROOT / "scripts" / "generate-social-preview.py").read_text(encoding="utf-8")
        for text in ("UAG Studio", "Visual configuration builder", "Omnissa Unified Access Gateway", "INI  /  JSON  /  PowerShell  /  OpenShift YAML", "Runs entirely in your browser", "Community project. Not affiliated with or endorsed by Omnissa."):
            self.assertIn(text, source)
        self.assertNotIn('"Gateway Forge"', source)


if __name__ == "__main__":
    unittest.main()
