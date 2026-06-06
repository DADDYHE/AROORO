from PIL import Image, ImageDraw, ImageFont
import os

W, H = 750, 1624
BG = (245, 245, 247)
WHITE = (255, 255, 255)
VIOLET = (156, 39, 176)
VIOLET_DARK = (123, 31, 162)
VIOLET_LIGHT = (225, 190, 231)
TEXT_PRIMARY = (29, 29, 31)
TEXT_SECONDARY = (134, 134, 139)
TEXT_TERTIARY = (199, 199, 204)
BORDER = (242, 242, 247)
DIVIDER = (242, 242, 247)
SHADOW_COLOR = (0, 0, 0, 10)

FONT_DIR = os.path.expanduser("~/.trae-cn/skills/canvas-design/canvas-fonts")

def load_font(name, size):
    path = os.path.join(FONT_DIR, name)
    if os.path.exists(path):
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()

font_title = load_font("WorkSans-Bold.ttf", 36)
font_label = load_font("WorkSans-Bold.ttf", 28)
font_input = load_font("WorkSans-Regular.ttf", 26)
font_btn = load_font("WorkSans-Bold.ttf", 30)
font_small = load_font("WorkSans-Regular.ttf", 22)
font_section = load_font("WorkSans-Bold.ttf", 24)
font_tag = load_font("WorkSans-Bold.ttf", 18)

img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img, "RGBA")

# --- Nav Bar ---
draw.rectangle([0, 0, W, 100], fill=WHITE)
draw.line([0, 99, W, 99], fill=BORDER, width=1)
draw.text((375, 50), "地址簿", font=font_title, fill=TEXT_PRIMARY, anchor="mm")
draw.text((40, 50), "←", font=font_title, fill=TEXT_PRIMARY, anchor="lm")

# --- Address Card 1 (Default) ---
y = 130
card_h = 220
draw.rounded_rectangle([32, y, W - 32, y + card_h], radius=24, fill=WHITE)
draw.rounded_rectangle([32, y, W - 32, y + 3], radius=24, fill=VIOLET)

draw.text((64, y + 36), "张三", font=font_label, fill=TEXT_PRIMARY)
draw.text((160, y + 40), "138****8888", font=font_input, fill=TEXT_SECONDARY)

tag_x = 380
draw.rounded_rectangle([tag_x, y + 30, tag_x + 64, y + 58], radius=20, fill=VIOLET)
draw.text((tag_x + 32, y + 44), "默认", font=font_tag, fill=WHITE, anchor="mm")

draw.text((64, y + 80), "广东省深圳市南山区科技园路1号腾讯大厦A座", font=font_input, fill=TEXT_SECONDARY)

draw.line([64, y + 130, W - 64, y + 130], fill=DIVIDER, width=1)

draw.text((W - 200, y + 155), "设为默认", font=font_section, fill=VIOLET)
draw.text((W - 100, y + 155), "删除", font=font_section, fill=(255, 59, 48))

# --- Address Card 2 ---
y2 = y + card_h + 20
draw.rounded_rectangle([32, y2, W - 32, y2 + card_h - 40], radius=24, fill=WHITE)

draw.text((64, y2 + 36), "李四", font=font_label, fill=TEXT_PRIMARY)
draw.text((160, y2 + 40), "139****9999", font=font_input, fill=TEXT_SECONDARY)

draw.text((64, y2 + 80), "北京市朝阳区望京SOHO T3", font=font_input, fill=TEXT_SECONDARY)

draw.line([64, y2 + 120, W - 64, y2 + 120], fill=DIVIDER, width=1)

draw.text((W - 280, y2 + 145), "编辑", font=font_section, fill=TEXT_SECONDARY)
draw.text((W - 200, y2 + 145), "设为默认", font=font_section, fill=VIOLET)
draw.text((W - 100, y2 + 145), "删除", font=font_section, fill=(255, 59, 48))

# --- Add Button ---
btn_y = y2 + card_h - 40 + 30
draw.rounded_rectangle([32, btn_y, W - 32, btn_y + 88], radius=24, fill=VIOLET)
draw.text((375, btn_y + 44), "+  新增地址", font=font_btn, fill=WHITE, anchor="mm")

# --- Bottom Sheet Popup (New Address Form) ---
popup_y = btn_y + 130
popup_h = H - popup_y + 40

draw.rounded_rectangle([0, popup_y, W, H + 40], radius=30, fill=WHITE)

draw.line([W // 2 - 40, popup_y + 16, W // 2 + 40, popup_y + 16], fill=TEXT_TERTIARY, width=4)

draw.text((64, popup_y + 50), "新增地址", font=font_title, fill=TEXT_PRIMARY)
draw.text((W - 64, popup_y + 50), "×", font=font_title, fill=TEXT_SECONDARY, anchor="rm")

# Form fields
form_y = popup_y + 110
field_h = 100
gap = 24

fields = [
    ("姓名", "请输入姓名", False),
    ("手机号", "请输入手机号", False),
    ("所在地区", "请选择省/市/区", True),
    ("详细地址", "街道、楼牌号等", False),
]

for i, (label, placeholder, is_picker) in enumerate(fields):
    fy = form_y + i * (field_h + gap)

    draw.text((64, fy), label, font=font_label, fill=TEXT_PRIMARY)

    if is_picker:
        draw.rounded_rectangle([200, fy - 8, W - 64, fy + 48], radius=16, fill=None, outline=BORDER, width=2)
        draw.text((220, fy + 12), placeholder, font=font_input, fill=TEXT_TERTIARY)
        draw.text((W - 80, fy + 12), "›", font=font_label, fill=TEXT_TERTIARY)
    elif label == "详细地址":
        draw.rounded_rectangle([200, fy - 8, W - 64, fy + 72], radius=16, fill=None, outline=BORDER, width=2)
        draw.text((220, fy + 12), placeholder, font=font_input, fill=TEXT_TERTIARY)
    else:
        draw.rounded_rectangle([200, fy - 8, W - 64, fy + 48], radius=16, fill=None, outline=BORDER, width=2)
        draw.text((220, fy + 12), placeholder, font=font_input, fill=TEXT_TERTIARY)

# Default switch
sw_y = form_y + 4 * (field_h + gap) + 10
draw.text((64, sw_y), "默认地址", font=font_label, fill=TEXT_PRIMARY)

switch_x = W - 140
draw.rounded_rectangle([switch_x, sw_y - 4, switch_x + 76, sw_y + 40], radius=20, fill=TEXT_TERTIARY)
draw.ellipse([switch_x + 4, sw_y, switch_x + 36, sw_y + 32], fill=WHITE)

# Divider
div_y = sw_y + 60
draw.line([64, div_y, W - 64, div_y], fill=DIVIDER, width=2)

# Buttons
btn_row_y = div_y + 24
cancel_w = (W - 64 - 20) // 2
draw.rounded_rectangle([64, btn_row_y, 64 + cancel_w, btn_row_y + 80], radius=20, fill=BORDER)
draw.text((64 + cancel_w // 2, btn_row_y + 40), "取消", font=font_btn, fill=TEXT_SECONDARY, anchor="mm")

save_x = 64 + cancel_w + 20
draw.rounded_rectangle([save_x, btn_row_y, save_x + cancel_w, btn_row_y + 80], radius=20, fill=VIOLET)
draw.text((save_x + cancel_w // 2, btn_row_y + 40), "保存", font=font_btn, fill=WHITE, anchor="mm")

# --- Decorative: Violet gradient accent on popup top ---
for i in range(6):
    alpha = max(0, 60 - i * 10)
    draw.rounded_rectangle([0, popup_y + i, W, popup_y + i + 1], fill=(*VIOLET, alpha))

output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "address-design.png")
img.save(output_path, "PNG")
print(f"Saved to {output_path}")
