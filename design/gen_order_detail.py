from PIL import Image, ImageDraw, ImageFont
import os

FONTS_DIR = os.path.expanduser("~/.trae-cn/skills/canvas-design/canvas-fonts")
OUT_DIR = "/Users/yy/Documents/trae_projects/zuoyou/design"

W, H = 390, 844
BG = (245, 245, 247)
WHITE = (255, 255, 255)
VIOLET = (156, 39, 176)
VIOLET_DARK = (123, 31, 162)
TEXT_PRIMARY = (29, 29, 31)
TEXT_SECONDARY = (134, 134, 139)
TEXT_TERTIARY = (174, 174, 178)
BORDER = (242, 242, 247)

font_bold = ImageFont.truetype(os.path.join(FONTS_DIR, "Outfit-Bold.ttf"), 22)
font_medium = ImageFont.truetype(os.path.join(FONTS_DIR, "Outfit-Regular.ttf"), 16)
font_small = ImageFont.truetype(os.path.join(FONTS_DIR, "Outfit-Regular.ttf"), 13)
font_title = ImageFont.truetype(os.path.join(FONTS_DIR, "Outfit-Bold.ttf"), 26)
font_price = ImageFont.truetype(os.path.join(FONTS_DIR, "Outfit-Bold.ttf"), 20)
font_mono = ImageFont.truetype(os.path.join(FONTS_DIR, "GeistMono-Regular.ttf"), 12)
font_btn = ImageFont.truetype(os.path.join(FONTS_DIR, "Outfit-Bold.ttf"), 15)

img = Image.new("RGBA", (W, H), BG)
draw = ImageDraw.Draw(img, "RGBA")

for y in range(110):
    r = int(VIOLET[0] + (VIOLET_DARK[0] - VIOLET[0]) * y / 110)
    g = int(VIOLET[1] + (VIOLET_DARK[1] - VIOLET[1]) * y / 110)
    b = int(VIOLET[2] + (VIOLET_DARK[2] - VIOLET[2]) * y / 110)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

draw.text((24, 32), "待付款", fill=WHITE, font=font_title)
draw.text((24, 68), "请尽快完成付款，超时订单将自动取消", fill=(255, 255, 255, 200), font=font_small)

card_y = 126
draw.rounded_rectangle((17, card_y + 2, W - 15, card_y + 142), radius=16, fill=(0, 0, 0, 6))
draw.rounded_rectangle((16, card_y, W - 16, card_y + 140), radius=16, fill=WHITE)
draw.rounded_rectangle((32, card_y + 16, 128, card_y + 112), radius=12, fill=(237, 237, 237))
draw.text((60, card_y + 52), "IMG", fill=TEXT_TERTIARY, font=font_small)
draw.text((144, card_y + 20), "宠物智能喂食器 Pro", fill=TEXT_PRIMARY, font=font_bold)
draw.rounded_rectangle((144, card_y + 50, 228, card_y + 68), radius=5, fill=BORDER)
draw.text((152, card_y + 52), "星空灰 / 大号", fill=TEXT_SECONDARY, font=font_small)
draw.text((144, card_y + 88), "¥299", fill=VIOLET, font=font_price)
draw.text((280, card_y + 92), "×1", fill=TEXT_TERTIARY, font=font_medium)

card_y2 = card_y + 156
draw.rounded_rectangle((17, card_y2 + 2, W - 15, card_y2 + 112), radius=16, fill=(0, 0, 0, 6))
draw.rounded_rectangle((16, card_y2, W - 16, card_y2 + 110), radius=16, fill=WHITE)
draw.text((32, card_y2 + 14), "收货信息", fill=TEXT_PRIMARY, font=font_bold)
draw.text((32, card_y2 + 44), "张三  138****8888", fill=TEXT_PRIMARY, font=font_medium)
draw.text((32, card_y2 + 70), "北京市朝阳区建国路88号SOHO现代城A座1208", fill=TEXT_SECONDARY, font=font_small)

card_y3 = card_y2 + 126
draw.rounded_rectangle((17, card_y3 + 2, W - 15, card_y3 + 192), radius=16, fill=(0, 0, 0, 6))
draw.rounded_rectangle((16, card_y3, W - 16, card_y3 + 190), radius=16, fill=WHITE)
draw.text((32, card_y3 + 14), "订单信息", fill=TEXT_PRIMARY, font=font_bold)

rows = [
    ("订单编号", "MLO6XK2RA7BC", True),
    ("下单时间", "2026-05-14 10:30", False),
    ("商品单价", "¥299", False),
    ("购买数量", "1件", False),
]
ry = card_y3 + 44
for label, value, has_copy in rows:
    draw.text((32, ry), label, fill=TEXT_SECONDARY, font=font_medium)
    vx = W - 32 - len(value) * 8 - (44 if has_copy else 0)
    draw.text((vx, ry), value, fill=TEXT_PRIMARY, font=font_medium)
    if has_copy:
        cx = W - 72
        draw.rounded_rectangle((cx, ry - 2, cx + 40, ry + 18), radius=10, fill=(156, 39, 176, 13), outline=(156, 39, 176, 77))
        draw.text((cx + 8, ry), "复制", fill=VIOLET, font=font_small)
    ry += 30
    if ry < card_y3 + 164:
        draw.line([(32, ry - 8), (W - 32, ry - 8)], fill=BORDER, width=1)

draw.line([(32, ry - 4), (W - 32, ry - 4)], fill=(229, 229, 234), width=1)
draw.text((32, ry + 4), "订单总额", fill=TEXT_SECONDARY, font=font_medium)
draw.text((W - 100, ry + 2), "¥299", fill=VIOLET, font=font_price)

draw.rounded_rectangle((0, H - 80, W, H), radius=0, fill=WHITE)
draw.line([(0, H - 80), (W, H - 80)], fill=(0, 0, 0, 15), width=1)

draw.rounded_rectangle((W - 240, H - 64, W - 136, H - 28), radius=20, fill=WHITE, outline=(209, 209, 214))
draw.text((W - 218, H - 56), "取消订单", fill=TEXT_SECONDARY, font=font_btn)

draw.rounded_rectangle((W - 120, H - 64, W - 24, H - 28), radius=20, fill=VIOLET)
draw.text((W - 96, H - 56), "去付款", fill=WHITE, font=font_btn)

draw.text((16, H - 20), "VP-001", fill=(209, 209, 214), font=font_mono)
draw.text((W - 60, H - 20), "v1.0", fill=(209, 209, 214), font=font_mono)

out_path = os.path.join(OUT_DIR, "mall-order-detail-design.png")
img.convert("RGB").save(out_path, quality=95)
print(f"Saved to {out_path}")
