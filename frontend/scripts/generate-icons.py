#!/usr/bin/env python3
"""
Build-time PWA icon generator for PrintX.

Reproduces the PrintXLogo design (a rounded-square badge with a blue->purple
diagonal gradient and a white printer glyph) as PNG icons for the web app
manifest + Apple touch icon. This is a BUILD TOOL, not an app dependency — it is
run once to produce the static icons under frontend/public/icons/. It uses
Pillow from the document-engine venv so no new frontend dependency is added.

Outputs (frontend/public/icons/):
  - icon-192.png         (any)   192x192 badge with rounded corners
  - icon-512.png         (any)   512x512 badge with rounded corners
  - maskable-512.png     (maskable) 512x512 FULL-BLEED gradient + centered glyph
                                     inside the ~80% safe zone (no rounded corners
                                     so platform masks can crop freely)
  - apple-touch-icon.png (iOS)   180x180 full-bleed (iOS applies its own mask)
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)

# Brand gradient endpoints (match PrintXLogo: #2563EB -> #7C3AED).
C1 = (0x25, 0x63, 0xEB)
C2 = (0x7C, 0x3A, 0xED)


def gradient(size):
    """A diagonal (top-left -> bottom-right) blue->purple gradient, RGBA."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    maxd = (size - 1) * 2 or 1
    for y in range(size):
        for x in range(size):
            t = (x + y) / maxd
            r = round(C1[0] + (C2[0] - C1[0]) * t)
            g = round(C1[1] + (C2[1] - C1[1]) * t)
            b = round(C1[2] + (C2[2] - C1[2]) * t)
            px[x, y] = (r, g, b)
    return img.convert("RGBA")


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def draw_printer(draw, size, cx, cy, glyph):
    """Draw the white printer glyph centered at (cx, cy), scaled to `glyph` px.
    Mirrors the shapes in PrintXLogo (top sheet, body, output tray, lines)."""
    u = glyph / 48.0  # the logo art is authored on a 48px grid
    white = (255, 255, 255, 242)
    accentblue = (0x25, 0x63, 0xEB, 255)
    accentpurple = (0x7C, 0x3A, 0xED, 255)

    def R(x0, y0, x1, y1, rad, fill):
        # coords are in 48-grid units relative to the glyph's top-left
        gx = cx - glyph / 2
        gy = cy - glyph / 2
        draw.rounded_rectangle(
            [gx + x0 * u, gy + y0 * u, gx + x1 * u, gy + y1 * u],
            radius=max(1, rad * u),
            fill=fill,
        )

    # top sheet (the paper feeding in)
    R(15, 14.5, 33, 20, 2, white)
    # printer body
    R(11.5, 20, 36.5, 32, 2.5, white)
    # output tray (blue)
    R(16, 26.5, 32, 34.5, 1.5, accentblue)
    # two text lines on the tray
    R(18.5, 29, 29.5, 30.6, 0.8, white)
    R(18.5, 31.3, 26.5, 32.9, 0.8, white)
    # status dot (purple)
    gx = cx - glyph / 2
    gy = cy - glyph / 2
    draw.ellipse(
        [gx + 30.2 * u, gy + 22.2 * u, gx + 32.8 * u, gy + 24.8 * u],
        fill=accentpurple,
    )


def make_badge(size, rounded=True):
    """Rounded-square badge icon (the 'any' purpose icon)."""
    base = gradient(size)
    if rounded:
        mask = rounded_mask(size, radius=round(size * 0.25))
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(base, (0, 0), mask)
    else:
        out = base
    d = ImageDraw.Draw(out)
    draw_printer(d, size, size / 2, size / 2, glyph=size * 0.62)
    return out


def make_maskable(size):
    """Full-bleed gradient (no transparent corners) with the glyph kept inside
    the ~80% safe zone so platform masks never clip the printer mark."""
    out = gradient(size)  # full bleed, square
    d = ImageDraw.Draw(out)
    # Safe zone: keep the glyph within the central ~66% so a circular mask is safe.
    draw_printer(d, size, size / 2, size / 2, glyph=size * 0.5)
    return out


def main():
    make_badge(192).save(os.path.join(OUT, "icon-192.png"))
    make_badge(512).save(os.path.join(OUT, "icon-512.png"))
    make_maskable(512).save(os.path.join(OUT, "maskable-512.png"))
    # Apple touch icon: full-bleed (iOS rounds it itself), 180x180.
    make_badge(180, rounded=False).save(os.path.join(OUT, "apple-touch-icon.png"))
    print("Wrote icons to", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
