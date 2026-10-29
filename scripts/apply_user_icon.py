import os
from PIL import Image

src_path = r"C:\Users\65638\.gemini\antigravity\brain\328deb1c-1329-4ea6-b2c8-2870996c1226\.user_uploaded\media_1793196536584_b6ed4531.png"
icons_dir = r"D:\!PROJECT\tiez-clipboard\src-tauri\icons"

im = Image.open(src_path).convert("RGBA")

# 1. Save original master
im.save(os.path.join(icons_dir, "app-icon-source.png"), "PNG")
im.save(os.path.join(icons_dir, "icon.png"), "PNG")

# 2. Multi-size PNGs
sizes = [
    (16, "16x16.png"),
    (24, "24x24.png"),
    (30, "Square30x30Logo.png"),
    (32, "32x32.png"),
    (44, "Square44x44Logo.png"),
    (64, "64x64.png"),
    (71, "Square71x71Logo.png"),
    (89, "Square89x89Logo.png"),
    (107, "Square107x107Logo.png"),
    (128, "128x128.png"),
    (142, "Square142x142Logo.png"),
    (150, "Square150x150Logo.png"),
    (256, "128x128@2x.png"),
    (284, "Square284x284Logo.png"),
    (310, "Square310x310Logo.png"),
]

for s, filename in sizes:
    resized = im.resize((s, s), Image.Resampling.LANCZOS)
    resized.save(os.path.join(icons_dir, filename), "PNG")

# 3. Tray icon
# In tray, a 64x64 and 32x32 version of this exact user image
tray_64 = im.resize((64, 64), Image.Resampling.LANCZOS)
tray_64.save(os.path.join(icons_dir, "tray-icon.png"), "PNG")

# 4. Multi-resolution icon.ico for Windows executable
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
im.save(os.path.join(icons_dir, "icon.ico"), format="ICO", sizes=ico_sizes)

print("Successfully replaced all icons with user's official AuraClip image!")
