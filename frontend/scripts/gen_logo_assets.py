"""
Generate PrintX web/PWA/favicon assets from the source logo.

Input : src/assets/printx-logo.png (RGBA, transparent background)
Output:
  public/logo.png                  trimmed, transparent, ~512px tall (navbar/footer)
  public/icons/icon-192.png        PWA icon on brand dark bg (any purpose)
  public/icons/icon-512.png        PWA icon on brand dark bg (any purpose)
  public/icons/maskable-512.png    PWA maskable (extra safe-area padding)
  public/icons/apple-touch-icon.png iOS home-screen (opaque, 180px)
  public/favicon.ico               multi-size favicon
  public/favicon-32.png            32px favicon fallback

Run from the frontend/ dir with the document-engine venv python:
  ..\document-engine\venv\Scripts\python.exe scripts\gen_logo_assets.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "assets" / "printx-logo.png"
PUB = ROOT / "public"
ICONS = PUB / "icons"
ICONS.mkdir(parents=True, exist_ok=True)

BRAND_BG = (11, 15, 25, 255)  # #0B0F19 — matches theme_color / manifest


def trim(im: Image.Image) -> Image.Image:
    """Crop to the non-transparent bounding box."""
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    bbox = im.split()[3].getbbox()  # alpha channel bbox
    return im.crop(bbox) if bbox else im


def square_canvas(im: Image.Image, size: int, bg, pad_ratio: float) -> Image.Image:
    """Fit `im` (preserving aspect) centered on a square `size` canvas with
    `pad_ratio` padding on each side. bg=None -> transparent."""
    canvas = Image.new("RGBA", (size, size), bg if bg else (0, 0, 0, 0))
    inner = int(size * (1 - 2 * pad_ratio))
    w, h = im.size
    scale = min(inner / w, inner / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = im.resize((nw, nh), Image.LANCZOS)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    logo = trim(src)

    # 1) Web logo: transparent, height ~160px (renders at ~32-40px; 2x+ for
    #    retina crispness) with a reduced palette for a small file. The navbar
    #    never needs more than ~80px tall, so 160px is plenty and keeps it light.
    target_h = 160
    w, h = logo.size
    web = logo.resize((int(w * target_h / h), target_h), Image.LANCZOS)
    # Quantize with alpha preserved for a much smaller PNG.
    web_q = web.quantize(colors=256, method=Image.FASTOCTREE).convert("RGBA")
    web_q.save(PUB / "logo.png", optimize=True)

    # 2) PWA "any" icons: logo on brand dark bg, modest padding.
    for size in (192, 512):
        square_canvas(logo, size, BRAND_BG, pad_ratio=0.14).save(
            ICONS / f"icon-{size}.png", optimize=True
        )

    # 3) Maskable: more padding so nothing is clipped by the OS mask.
    square_canvas(logo, 512, BRAND_BG, pad_ratio=0.22).save(
        ICONS / "maskable-512.png", optimize=True
    )

    # 4) Apple touch icon: opaque brand bg, 180px.
    square_canvas(logo, 180, BRAND_BG, pad_ratio=0.14).convert("RGB").save(
        ICONS / "apple-touch-icon.png", optimize=True
    )

    # 5) Favicons: 32px PNG + multi-size .ico (on brand bg for small-size clarity).
    fav32 = square_canvas(logo, 32, BRAND_BG, pad_ratio=0.08)
    fav32.save(PUB / "favicon-32.png", optimize=True)
    ico_src = square_canvas(logo, 256, BRAND_BG, pad_ratio=0.08)
    ico_src.save(PUB / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    print("Generated:")
    for p in [
        PUB / "logo.png",
        ICONS / "icon-192.png",
        ICONS / "icon-512.png",
        ICONS / "maskable-512.png",
        ICONS / "apple-touch-icon.png",
        PUB / "favicon-32.png",
        PUB / "favicon.ico",
    ]:
        kb = p.stat().st_size / 1024
        print(f"  {p.relative_to(ROOT)}  ({kb:.1f} KB)")


if __name__ == "__main__":
    main()
