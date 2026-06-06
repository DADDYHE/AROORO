from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 750, 1624
BG = "#ffffff"
SPINE_BG = "#1d1d1f"
SPINE_W = 180
ACCENT = "#4ECDC4"
PRICE_RED = "#ff3b30"
SKU_TAG_BG = "#fff8f0"
SKU_TAG_TEXT = "#ff8c00"
MUTED = "#999999"
LIGHT_GRAY = "#f5f5f7"
BORDER_GRAY = "#e0e0e0"
TEXT_DARK = "#1d1d1f"
TEXT_MID = "#333333"
SELECTED_BG = "#f0faf4"
SELECTED_BORDER = "#4ECDC4"
FOOTER_BG = "#ffffff"
CONFIRM_GREEN = "#07c160"

FONTS_DIR = os.path.expanduser("~/.trae-cn/skills/canvas-design/canvas-fonts")

def load_font(name, size):
    path = os.path.join(FONTS_DIR, name)
    if os.path.exists(path):
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()

font_outfit_r = load_font("Outfit-Regular.ttf", 24)
font_outfit_b = load_font("Outfit-Bold.ttf", 28)
font_jura_m = load_font("Jura-Medium.ttf", 20)
font_jura_l = load_font("Jura-Light.ttf", 18)
font_instrument_b = load_font("InstrumentSans-Bold.ttf", 22)
font_instrument_r = load_font("InstrumentSans-Regular.ttf", 20)
font_dm = load_font("DMMono-Regular.ttf", 16)
font_work_b = load_font("WorkSans-Bold.ttf", 32)
font_work_r = load_font("WorkSans-Regular.ttf", 22)
font_national_b = load_font("NationalPark-Bold.ttf", 26)
font_crimson_b = load_font("CrimsonPro-Bold.ttf", 30)

img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# === STATUS BAR AREA ===
draw.rectangle([0, 0, W, 88], fill=BG)

# === SEARCH BAR ===
search_y = 88
draw.rounded_rectangle([24, search_y + 12, W - 24, search_y + 72], radius=16, fill=LIGHT_GRAY)
draw.text((48, search_y + 28), "搜索商品名称", fill=MUTED, font=font_outfit_r)

# === MAIN BODY: SPINE + GRID ===
body_top = search_y + 96
spine_left = 0
grid_left = SPINE_W + 2
grid_right = W

# Category spine
draw.rectangle([spine_left, body_top, SPINE_W, H - 120], fill=LIGHT_GRAY)
draw.rectangle([spine_left, body_top, SPINE_W, H - 120], fill="#f5f5f5")

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

cat_h = 88
for i, (cat, active) in enumerate(categories):
    y = body_top + i * cat_h
    if active:
        draw.rectangle([spine_left, y, SPINE_W, y + cat_h], fill=SPINE_BG)
        draw.text((spine_left + 24, y + 30), cat, fill="#ffffff", font=font_outfit_r)
        draw.rectangle([spine_left, y, spine_left + 4, y + cat_h], fill=ACCENT)
    else:
        draw.rectangle([spine_left, y, SPINE_W, y + cat_h], fill="#f5f5f5")
        draw.text((spine_left + 24, y + 30), cat, fill=TEXT_MID, font=font_outfit_r)
    if i < len(categories) - 1:
        draw.line([spine_left + 16, y + cat_h, SPINE_W - 16, y + cat_h], fill=BORDER_GRAY, width=1)

# === PRODUCT GRID ===
grid_pad = 16
card_w = (grid_right - grid_left - grid_pad * 3) // 2
card_h = 280
gap = grid_pad

products = [
    {"name": "天然猫粮 海洋鱼味", "price": "89.00", "orig": "128.00", "stock": 256, "sku": False, "selected": True},
    {"name": "智能自动喂食器", "price": "299.00", "orig": "", "stock": 42, "sku": True, "sku_count": 3, "selected": False},
    {"name": "宠物羊奶粉 400g", "price": "68.00", "orig": "98.00", "stock": 180, "sku": False, "selected": False},
    {"name": "逗猫棒套装 5件", "price": "29.90", "orig": "", "stock": 520, "sku": True, "sku_count": 2, "selected": True},
    {"name": "猫砂盆 全封闭式", "price": "159.00", "orig": "199.00", "stock": 67, "sku": False, "selected": False},
    {"name": "宠物牵引绳 可伸缩", "price": "45.00", "orig": "", "stock": 330, "sku": True, "sku_count": 4, "selected": False},
    {"name": "猫咪饮水机 循环", "price": "128.00", "orig": "168.00", "stock": 95, "sku": False, "selected": False},
    {"name": "宠物窝 冬季保暖", "price": "79.00", "orig": "", "stock": 210, "sku": True, "sku_count": 2, "selected": False},
]

for idx, p in enumerate(products):
    col = idx % 2
    row = idx // 2
    x = grid_left + grid_pad + col * (card_w + gap)
    y = body_top + grid_pad + row * (card_h + gap)

    if p["selected"]:
        draw.rounded_rectangle([x - 2, y - 2, x + card_w + 2, y + card_h + 2], radius=14, fill=None, outline=ACCENT, width=3)
        draw.rounded_rectangle([x, y, x + card_w, y + card_h], radius=12, fill=SELECTED_BG)
    else:
        draw.rounded_rectangle([x, y, x + card_w, y + card_h], radius=12, fill="#ffffff")

    # Product image placeholder
    img_area_top = y + 12
    img_area_h = 140
    img_x = x + 16
    img_w = card_w - 32
    draw.rounded_rectangle([img_x, img_area_top, img_x + img_w, img_area_top + img_area_h], radius=8, fill="#e8e8e8")

    # Placeholder icon in image area
    cx = img_x + img_w // 2
    cy = img_area_top + img_area_h // 2
    draw.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill="#d0d0d0")
    draw.polygon([(cx - 6, cy - 10), (cx + 10, cy), (cx - 6, cy + 10)], fill="#c0c0c0")

    # Product name
    name_y = img_area_top + img_area_h + 10
    draw.text((x + 16, name_y), p["name"], fill=TEXT_DARK, font=font_instrument_r)

    # SKU tag
    if p["sku"]:
        tag_y = name_y + 28
        tag_text = f"多规格 ({p['sku_count']}SKU)"
        tag_w = len(tag_text) * 9 + 16
        draw.rounded_rectangle([x + 16, tag_y, x + 16 + tag_w, tag_y + 24], radius=6, fill=SKU_TAG_BG)
        draw.text((x + 24, tag_y + 3), tag_text, fill=SKU_TAG_TEXT, font=font_jura_l)

    # Price row
    price_y = name_y + 56
    draw.text((x + 16, price_y), "¥" + p["price"], fill=PRICE_RED, font=font_outfit_b)
    if p["orig"]:
        orig_x = x + 16 + len("¥" + p["price"]) * 14 + 8
        draw.text((orig_x, price_y + 6), "¥" + p["orig"], fill=MUTED, font=font_jura_l)

    # Stock
    stock_y = price_y + 32
    draw.text((x + 16, stock_y), f"库存: {p['stock']}", fill=MUTED, font=font_jura_l)

    # Selection indicator (circle in top-right corner)
    indicator_x = x + card_w - 40
    indicator_y = y + 12
    if p["selected"]:
        draw.ellipse([indicator_x, indicator_y, indicator_x + 28, indicator_y + 28], fill=ACCENT)
        check_cx = indicator_x + 14
        check_cy = indicator_y + 14
        draw.line([check_cx - 6, check_cy, check_cx - 2, check_cy + 5], fill="#ffffff", width=2)
        draw.line([check_cx - 2, check_cy + 5, check_cx + 7, check_cy - 4], fill="#ffffff", width=2)
    else:
        draw.ellipse([indicator_x, indicator_y, indicator_x + 28, indicator_y + 28], fill=None, outline=BORDER_GRAY, width=2)

# === CATEGORY HEADER ===
header_y = body_top
draw.rectangle([grid_left, header_y, grid_right, header_y + 60], fill="#ffffff")
draw.text((grid_left + 24, header_y + 16), "全部商品", fill=TEXT_DARK, font=font_national_b)
draw.line([grid_left, header_y + 60, grid_right, header_y + 60], fill=SPINE_BG, width=2)

# === FOOTER BAR ===
footer_y = H - 120
draw.rectangle([0, footer_y, W, H], fill=FOOTER_BG)
draw.line([0, footer_y, W, footer_y], fill=BORDER_GRAY, width=1)

# Selected count
draw.text((32, footer_y + 20), "已选 2 个", fill=TEXT_MID, font=font_outfit_r)

# Buttons
cancel_x = W - 340
confirm_x = W - 180
btn_y = footer_y + 16
btn_h = 56

draw.rounded_rectangle([cancel_x, btn_y, cancel_x + 140, btn_y + btn_h], radius=12, fill=LIGHT_GRAY)
draw.text((cancel_x + 36, btn_y + 14), "取消", fill=TEXT_MID, font=font_outfit_r)

draw.rounded_rectangle([confirm_x, btn_y, confirm_x + 148, btn_y + btn_h], radius=12, fill=CONFIRM_GREEN)
draw.text((confirm_x + 22, btn_y + 14), "确认导入", fill="#ffffff", font=font_outfit_r)

# === DECORATIVE ELEMENTS ===
# Thin accent line at very top
draw.rectangle([0, 0, W, 3], fill=SPINE_BG)

# Subtle grid reference markers (design philosophy: systematic observation)
for row in range(4):
    y = body_top + grid_pad + row * (card_h + gap) + card_h // 2
    draw.line([grid_left, y, grid_left + 8, y], fill=ACCENT, width=1)

# Page title area (top-left, minimal)
draw.text((W - 160, 30), "SELECT", fill=ACCENT, font=font_dm)
draw.text((W - 160, 48), "PRODUCTS", fill=SPINE_BG, font=font_dm)

output_path = "/Users/yy/Documents/trae_projects/zuoyou/design/group-buy-selector.png"
img.save(output_path, "PNG", quality=95)
print(f"Design saved to {output_path}")
