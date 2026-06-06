from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
import math

W, H = 750, 1624
BG = "#ffffff"
SPINE_BG = "#1d1d1f"
SPINE_W = 180
ACCENT = "#4ECDC4"
ACCENT_LIGHT = "#e6f9f7"
PRICE_RED = "#e8413c"
SKU_TAG_BG = "#fff6ed"
SKU_TAG_BORDER = "#ffd4a0"
SKU_TAG_TEXT = "#e8820c"
MUTED = "#999999"
LIGHT_GRAY = "#f5f5f7"
MID_GRAY = "#e8e8e8"
BORDER_GRAY = "#e5e5e5"
TEXT_DARK = "#1d1d1f"
TEXT_MID = "#555555"
TEXT_LIGHT = "#888888"
SELECTED_BG = "#f0faf4"
SELECTED_BORDER = "#4ECDC4"
FOOTER_BG = "#ffffff"
CONFIRM_GREEN = "#07c160"
SHADOW_COLOR = (0, 0, 0, 12)

FONTS_DIR = os.path.expanduser("~/.trae-cn/skills/canvas-design/canvas-fonts")

def load_font(name, size):
    path = os.path.join(FONTS_DIR, name)
    if os.path.exists(path):
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()

f_outfit_r = load_font("Outfit-Regular.ttf", 24)
f_outfit_b = load_font("Outfit-Bold.ttf", 26)
f_outfit_sb = load_font("Outfit-Bold.ttf", 22)
f_jura_m = load_font("Jura-Medium.ttf", 18)
f_jura_l = load_font("Jura-Light.ttf", 16)
f_instr_b = load_font("InstrumentSans-Bold.ttf", 20)
f_instr_r = load_font("InstrumentSans-Regular.ttf", 19)
f_dm = load_font("DMMono-Regular.ttf", 14)
f_work_b = load_font("WorkSans-Bold.ttf", 28)
f_work_r = load_font("WorkSans-Regular.ttf", 20)
f_national_b = load_font("NationalPark-Bold.ttf", 24)
f_crimson_b = load_font("CrimsonPro-Bold.ttf", 28)

img = Image.new("RGBA", (W, H), BG)
draw = ImageDraw.Draw(img)

def draw_shadow_rect(draw, x1, y1, x2, y2, radius, fill, shadow_offset=3, shadow_blur=4):
    shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.rounded_rectangle([x1 + shadow_offset, y1 + shadow_offset, x2 + shadow_offset, y2 + shadow_offset], radius=radius, fill=(0, 0, 0, 18))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(shadow_blur))
    img.paste(Image.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 0)), shadow_layer), (0, 0), shadow_layer)
    draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=fill)

# === TOP ACCENT LINE ===
draw.rectangle([0, 0, W, 3], fill=SPINE_BG)

# === NAVIGATION BAR ===
nav_y = 3
nav_h = 88
draw.rectangle([0, nav_y, W, nav_y + nav_h], fill=BG)
# Back arrow
draw.text((32, nav_y + 28), "←", fill=TEXT_DARK, font=f_work_b)
# Title
draw.text((W // 2 - 60, nav_y + 30), "选择商品", fill=TEXT_DARK, font=f_national_b)
# Right reference
draw.text((W - 130, nav_y + 34), "SELECT", fill=ACCENT, font=f_dm)
draw.text((W - 130, nav_y + 52), "PRODUCTS", fill="#c0c0c0", font=f_dm)

# === SEARCH BAR ===
search_y = nav_y + nav_h + 8
search_h = 64
draw.rounded_rectangle([24, search_y, W - 24, search_y + search_h], radius=14, fill="#f0f0f2")
draw.ellipse([44, search_y + 20, 44 + 24, search_y + 44], fill=None, outline=MUTED, width=2)
draw.line([62, search_y + 38, 68, search_y + 44], fill=MUTED, width=2)
draw.text((80, search_y + 20), "搜索商品名称 / 编号", fill=MUTED, font=f_outfit_r)

# === FILTER TAGS ===
filter_y = search_y + search_h + 12
tags = ["全部", "有库存", "多规格", "已上架"]
tag_x = 24
for i, tag in enumerate(tags):
    tw = len(tag) * 18 + 28
    if i == 0:
        draw.rounded_rectangle([tag_x, filter_y, tag_x + tw, filter_y + 40], radius=20, fill=SPINE_BG)
        draw.text((tag_x + 14, filter_y + 8), tag, fill="#ffffff", font=f_instr_r)
    else:
        draw.rounded_rectangle([tag_x, filter_y, tag_x + tw, filter_y + 40], radius=20, fill=None, outline=BORDER_GRAY, width=1)
        draw.text((tag_x + 14, filter_y + 8), tag, fill=TEXT_MID, font=f_instr_r)
    tag_x += tw + 12

# === MAIN BODY: SPINE + GRID ===
body_top = filter_y + 56
spine_left = 0
grid_left = SPINE_W + 2
grid_right = W

# Category spine
draw.rectangle([spine_left, body_top, SPINE_W, H - 120], fill="#f7f7f7")

categories = [
    ("全部", True),
    ("宠物食品", False),
    ("宠物用品", False),
    ("宠物玩具", False),
    ("健康护理", False),
    ("服饰配件", False),
    ("智能设备", False),
    ("清洁美容", False),
]

cat_h = 82
for i, (cat, active) in enumerate(categories):
    y = body_top + i * cat_h
    if active:
        draw.rectangle([spine_left, y, SPINE_W, y + cat_h], fill=SPINE_BG)
        draw.text((spine_left + 20, y + 28), cat, fill="#ffffff", font=f_outfit_r)
        draw.rectangle([spine_left, y, spine_left + 4, y + cat_h], fill=ACCENT)
    else:
        draw.rectangle([spine_left, y, SPINE_W, y + cat_h], fill="#f7f7f7")
        draw.text((spine_left + 20, y + 28), cat, fill=TEXT_MID, font=f_outfit_r)
    if i < len(categories) - 1:
        draw.line([spine_left + 12, y + cat_h, SPINE_W - 12, y + cat_h], fill="#eeeeee", width=1)

# Subtle spine right border
draw.line([SPINE_W, body_top, SPINE_W, H - 120], fill="#e0e0e0", width=1)

# === CATEGORY HEADER ===
header_h = 52
draw.rectangle([grid_left, body_top, grid_right, body_top + header_h], fill=BG)
draw.text((grid_left + 20, body_top + 12), "全部商品", fill=TEXT_DARK, font=f_instr_b)
draw.text((grid_left + 20 + 96, body_top + 16), "8", fill=ACCENT, font=f_dm)
draw.line([grid_left, body_top + header_h, grid_right, body_top + header_h], fill=SPINE_BG, width=2)

# === PRODUCT GRID ===
grid_pad = 14
card_w = (grid_right - grid_left - grid_pad * 3) // 2
card_h = 290
gap = grid_pad

products = [
    {"name": "天然猫粮 海洋鱼味", "price": "89.00", "orig": "128.00", "stock": 256, "sku": False, "selected": True},
    {"name": "智能自动喂食器", "price": "299.00", "orig": "", "stock": 42, "sku": True, "sku_count": 3, "selected": False},
    {"name": "宠物羊奶粉 400g", "price": "68.00", "orig": "98.00", "stock": 180, "sku": False, "selected": False},
    {"name": "逗猫棒套装 5件", "price": "29.90", "orig": "", "stock": 520, "sku": True, "sku_count": 2, "selected": True},
    {"name": "猫砂盆 全封闭式", "price": "159.00", "orig": "199.00", "stock": 67, "sku": False, "selected": False},
    {"name": "宠物牵引绳 可伸缩", "price": "45.00", "orig": "", "stock": 330, "sku": True, "sku_count": 4, "selected": False},
    {"name": "猫咪饮水机", "price": "128.00", "orig": "168.00", "stock": 95, "sku": False, "selected": False},
    {"name": "宠物窝 冬季保暖", "price": "79.00", "orig": "", "stock": 210, "sku": True, "sku_count": 2, "selected": False},
]

for idx, p in enumerate(products):
    col = idx % 2
    row = idx // 2
    x = grid_left + grid_pad + col * (card_w + gap)
    y = body_top + header_h + grid_pad + row * (card_h + gap)

    # Card shadow
    shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.rounded_rectangle([x + 2, y + 2, x + card_w + 2, y + card_h + 2], radius=12, fill=(0, 0, 0, 10))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(3))
    img.paste(Image.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 0)), shadow_layer), (0, 0), shadow_layer)

    # Card background
    if p["selected"]:
        draw.rounded_rectangle([x, y, x + card_w, y + card_h], radius=12, fill=SELECTED_BG, outline=SELECTED_BORDER, width=2)
    else:
        draw.rounded_rectangle([x, y, x + card_w, y + card_h], radius=12, fill="#ffffff")

    # Product image placeholder
    img_pad = 12
    img_area_top = y + img_pad
    img_area_h = 148
    img_x = x + img_pad
    img_w = card_w - img_pad * 2
    draw.rounded_rectangle([img_x, img_area_top, img_x + img_w, img_area_top + img_area_h], radius=10, fill="#f0f0f2")

    # Subtle placeholder pattern (diagonal lines)
    for lx in range(img_x + 20, img_x + img_w - 10, 24):
        draw.line([lx, img_area_top + 20, lx + 30, img_area_top + img_area_h - 20], fill="#e4e4e6", width=1)

    # Placeholder icon
    cx = img_x + img_w // 2
    cy = img_area_top + img_area_h // 2
    draw.ellipse([cx - 18, cy - 18, cx + 18, cy + 18], fill="#dcdcdc")
    draw.polygon([(cx - 7, cy - 12), (cx + 12, cy), (cx - 7, cy + 12)], fill="#cccccc")

    # Product name
    name_y = img_area_top + img_area_h + 8
    draw.text((x + 14, name_y), p["name"][:10], fill=TEXT_DARK, font=f_instr_r)
    if len(p["name"]) > 10:
        draw.text((x + 14, name_y + 22), p["name"][10:], fill=TEXT_DARK, font=f_instr_r)

    # SKU tag
    if p["sku"]:
        tag_y = name_y + 46
        tag_text = f"多规格 ({p['sku_count']}SKU)"
        tag_w = len(tag_text) * 8 + 16
        draw.rounded_rectangle([x + 14, tag_y, x + 14 + tag_w, tag_y + 22], radius=5, fill=SKU_TAG_BG, outline=SKU_TAG_BORDER, width=1)
        draw.text((x + 22, tag_y + 2), tag_text, fill=SKU_TAG_TEXT, font=f_jura_l)

    # Price row
    price_y = name_y + 72
    draw.text((x + 14, price_y), "¥", fill=PRICE_RED, font=f_jura_m)
    draw.text((x + 28, price_y - 2), p["price"], fill=PRICE_RED, font=f_outfit_b)
    if p["orig"]:
        orig_x = x + 28 + len(p["price"]) * 13 + 8
        draw.line([orig_x, price_y + 12, orig_x + len(p["orig"]) * 8 + 8, price_y + 12], fill=MUTED, width=1)
        draw.text((orig_x, price_y + 4), "¥" + p["orig"], fill=MUTED, font=f_jura_l)

    # Stock
    stock_y = price_y + 28
    draw.text((x + 14, stock_y), f"库存 {p['stock']}", fill=TEXT_LIGHT, font=f_jura_l)

    # Selection indicator
    ind_x = x + card_w - 38
    ind_y = y + 10
    if p["selected"]:
        draw.ellipse([ind_x, ind_y, ind_x + 26, ind_y + 26], fill=ACCENT)
        ccx, ccy = ind_x + 13, ind_y + 13
        draw.line([ccx - 5, ccy, ccx - 1, ccy + 5], fill="#ffffff", width=2)
        draw.line([ccx - 1, ccy + 5, ccx + 6, ccy - 3], fill="#ffffff", width=2)
    else:
        draw.ellipse([ind_x, ind_y, ind_x + 26, ind_y + 26], fill=BG, outline="#d0d0d0", width=2)

# === FOOTER BAR ===
footer_y = H - 120
draw.rectangle([0, footer_y, W, H], fill=FOOTER_BG)
draw.line([0, footer_y, W, footer_y], fill=BORDER_GRAY, width=1)

# Safe area bottom padding indicator
draw.rectangle([0, H - 34, W, H], fill="#fafafa")

# Selected count with accent
draw.text((32, footer_y + 18), "已选", fill=TEXT_MID, font=f_outfit_r)
draw.text((32 + 40, footer_y + 16), "2", fill=ACCENT, font=f_outfit_b)
draw.text((32 + 62, footer_y + 18), "个商品", fill=TEXT_MID, font=f_outfit_r)

# Buttons
cancel_x = W - 340
confirm_x = W - 178
btn_y = footer_y + 14
btn_h = 56

draw.rounded_rectangle([cancel_x, btn_y, cancel_x + 140, btn_y + btn_h], radius=14, fill=LIGHT_GRAY)
draw.text((cancel_x + 38, btn_y + 15), "取消", fill=TEXT_MID, font=f_outfit_r)

draw.rounded_rectangle([confirm_x, btn_y, confirm_x + 154, btn_y + btn_h], radius=14, fill=CONFIRM_GREEN)
draw.text((confirm_x + 24, btn_y + 15), "确认导入", fill="#ffffff", font=f_outfit_sb)

# === SYSTEMATIC REFERENCE MARKERS ===
# Small tick marks along the grid edge (design philosophy: scientific observation)
for row in range(4):
    y = body_top + header_h + grid_pad + row * (card_h + gap) + card_h // 2
    draw.rectangle([grid_left, y - 1, grid_left + 6, y + 1], fill=ACCENT)

# Page number reference
draw.text((W - 80, H - 30), "01 / 01", fill="#d0d0d0", font=f_dm)

output_path = "/Users/yy/Documents/trae_projects/zuoyou/design/group-buy-selector.png"
img = img.convert("RGB")
img.save(output_path, "PNG", quality=95)
print(f"Design v2 saved to {output_path}")
