from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, random

random.seed(42)

W, H = 2400, 3200
BG = (245, 245, 247)
WHITE = (255, 255, 255)
TEAL = (78, 205, 196)
TEAL_DARK = (42, 183, 169)
DARK = (29, 29, 31)
GRAY = (142, 142, 147)
LIGHT_GRAY = (229, 229, 234)
PALE = (242, 242, 247)
AMBER = (255, 149, 0)
RED = (255, 59, 48)

FONT_DIR = '/Users/yy/.trae-cn/skills/canvas-design/canvas-fonts/'

def load_font(name, size):
    return ImageFont.truetype(FONT_DIR + name, size)

canvas = Image.new('RGBA', (W, H), (*BG, 255))
draw = ImageDraw.Draw(canvas)

grain = Image.new('RGBA', (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(grain)
for _ in range(15000):
    x = random.randint(0, W - 1)
    y = random.randint(0, H - 1)
    a = random.randint(1, 3)
    gd.point((x, y), fill=(0, 0, 0, a))

def rrect(d, xy, r, **kw):
    d.rounded_rectangle(xy, radius=r, **kw)

def soft_shadow(layer, xy, r, color=(0, 0, 0), alpha_max=18, spread=18):
    sd = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = xy
    for i in range(spread, 0, -1):
        a = int(alpha_max * (spread - i) / spread)
        sd.rounded_rectangle([x0 - i, y0 - i, x1 + i, y1 + i], radius=r + i, fill=(*color, a))

font_title_thin = load_font('Jura-Light.ttf', 148)
font_title = load_font('InstrumentSans-Regular.ttf', 148)
font_label = load_font('DMMono-Regular.ttf', 18)
font_ref = load_font('DMMono-Regular.ttf', 15)
font_num = load_font('DMMono-Regular.ttf', 96)
font_spec_title = load_font('InstrumentSans-Regular.ttf', 28)
font_spec_desc = load_font('DMMono-Regular.ttf', 15)
font_small = load_font('DMMono-Regular.ttf', 13)
font_body = load_font('InstrumentSans-Regular.ttf', 22)
font_mono = load_font('DMMono-Regular.ttf', 20)
font_ui = load_font('InstrumentSans-Regular.ttf', 22)
font_ui_sm = load_font('InstrumentSans-Regular.ttf', 18)
font_ui_lg = load_font('InstrumentSans-Regular.ttf', 28)

MARGIN_L = 120
MARGIN_R = 120
SPEC_NUM_W = 180
SPEC_BODY_X = MARGIN_L + SPEC_NUM_W + 36

draw.rectangle([0, 0, W, 5], fill=TEAL)

draw.text((MARGIN_L, 80), "TACTILE", fill=(*DARK, 255), font=font_title_thin)
draw.text((MARGIN_L, 248), "CURATION", fill=(*DARK, 255), font=font_title)

draw.line([MARGIN_L, 432, 276, 432], fill=(*LIGHT_GRAY, 255), width=2)
draw.ellipse([276, 426, 288, 438], fill=(*TEAL, 255))

draw.text((MARGIN_L, 458), "Interaction Pattern Catalog  ·  Plate I", fill=(*GRAY, 255), font=font_label)
draw.text((MARGIN_L, 482), "Activity Management Interface — Partner Module", fill=(*LIGHT_GRAY, 255), font=font_ref)

draw.line([MARGIN_L, 510, W - MARGIN_R, 510], fill=(*PALE, 255), width=1)

ROW_H = 268
GAP = 12

def draw_specimen(y, num, title, desc, draw_fn):
    draw.text((MARGIN_L, y), num, fill=(*TEAL, 255), font=font_num)
    draw.text((MARGIN_L, y + 106), title, fill=(*DARK, 255), font=font_spec_title)
    draw.text((MARGIN_L, y + 140), desc, fill=(*GRAY, 255), font=font_spec_desc)
    draw_fn(SPEC_BODY_X, y + 8)
    draw.line([MARGIN_L, y + ROW_H - GAP, W - MARGIN_R, y + ROW_H - GAP], fill=(*PALE, 255), width=1)
    draw.text((W - MARGIN_R - 28, y + 2), num, fill=(*PALE, 255), font=font_ref)
    return y + ROW_H

def specimen_card(bx, by):
    cw, ch = 620, 190
    shadow_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    soft_shadow(shadow_layer, [bx, by, bx + cw, by + ch], 20, color=TEAL_DARK, alpha_max=12, spread=12)
    canvas.alpha_composite(shadow_layer)

    rrect(draw, [bx, by, bx + cw, by + ch], 20, fill=(*WHITE, 255))
    rrect(draw, [bx, by + 12, bx + 5, by + ch - 12], 3, fill=(*TEAL, 255))

    draw.text((bx + 30, by + 24), "周末宠物社交聚会", fill=(*DARK, 255), font=font_ui_lg)
    rrect(draw, [bx + cw - 124, by + 22, bx + cw - 20, by + 50], 7, fill=(*TEAL, 32))
    draw.text((bx + cw - 112, by + 26), "报名中", fill=(*TEAL_DARK, 255), font=font_ui_sm)

    draw.ellipse([bx + 30, by + 70, bx + 40, by + 80], fill=(*TEAL, 255))
    draw.text((bx + 48, by + 66), "2026-06-15  14:00", fill=(*GRAY, 255), font=font_mono)
    draw.ellipse([bx + 30, by + 96, bx + 40, by + 106], fill=(*AMBER, 255))
    draw.text((bx + 48, by + 92), "城市公园 · 草坪区", fill=(*GRAY, 255), font=font_mono)

    draw.line([bx + 30, by + 124, bx + cw - 30, by + 124], fill=(*PALE, 255), width=1)

    bar_w = 120
    rrect(draw, [bx + 30, by + 140, bx + 30 + bar_w, by + 146], 3, fill=(*PALE, 255))
    fill_w = int(bar_w * 0.65)
    rrect(draw, [bx + 30, by + 140, bx + 30 + fill_w, by + 146], 3, fill=(*TEAL, 255))
    draw.text((bx + 30 + bar_w + 8, by + 134), "13/20", fill=(*GRAY, 255), font=font_mono)
    draw.text((bx + cw - 124, by + 134), "¥128/人", fill=(*TEAL, 255), font=font_body)

    sx = bx + cw + 44
    sw2 = 460
    rrect(draw, [sx, by, sx + sw2, by + ch], 20, fill=(*WHITE, 255))
    rrect(draw, [sx, by + 12, sx + 5, by + ch - 12], 3, fill=(*LIGHT_GRAY, 255))
    for i, w_pct in enumerate([0.7, 0.5, 0.3]):
        lw = int((sw2 - 64) * w_pct)
        ly = by + 32 + i * 28
        rrect(draw, [sx + 30, ly, sx + 30 + lw, ly + 11], 5, fill=(*PALE, 255))
    draw.line([sx + 30, by + 128, sx + sw2 - 30, by + 128], fill=(*PALE, 255), width=1)
    rrect(draw, [sx + 30, by + 142, sx + 30 + 84, by + 148], 3, fill=(*PALE, 255))
    rrect(draw, [sx + 30, by + 142, sx + 30 + 26, by + 148], 3, fill=(*LIGHT_GRAY, 255))
    draw.text((sx + 30 + 84 + 8, by + 136), "skeleton", fill=(*LIGHT_GRAY, 255), font=font_ref)

def specimen_filter(bx, by):
    tabs = ["报名中", "报名截止", "已结束", "待发布", "全部"]
    states = [0, 2, 4]
    for row, active_i in enumerate(states):
        py = by + row * 68
        px = bx
        for i, t in enumerate(tabs):
            bbox = font_ui.getbbox(t)
            tw = bbox[2] - bbox[0]
            pw = tw + 30
            ph = 42
            if i == active_i:
                if active_i == 0:
                    fill_c = (*TEAL, 255)
                elif active_i == 2:
                    fill_c = (*GRAY, 255)
                else:
                    fill_c = (*DARK, 255)
                rrect(draw, [px, py, px + pw, py + ph], 10, fill=fill_c)
                draw.text((px + 15, py + 8), t, fill=(*WHITE, 255), font=font_ui)
                if active_i == 0:
                    draw.ellipse([px + pw // 2 - 2, py + ph + 6, px + pw // 2 + 2, py + ph + 10], fill=(*TEAL, 255))
            else:
                rrect(draw, [px, py, px + pw, py + ph], 10, fill=(*WHITE, 255), outline=(*PALE, 255), width=1)
                draw.text((px + 15, py + 8), t, fill=(*GRAY, 255), font=font_ui)
            px += pw + 10

def specimen_search(bx, by):
    sw, sh = 640, 54

    rrect(draw, [bx, by, bx + sw, by + sh], 12, fill=(*WHITE, 255), outline=(*PALE, 255), width=2)
    r = 9
    cx_m = bx + 30
    cy_m = by + sh // 2
    draw.ellipse([cx_m - r, cy_m - r, cx_m + r, cy_m + r], outline=(*LIGHT_GRAY, 255), width=2)
    angle = math.radians(45)
    sx_m = cx_m + r * math.cos(angle)
    sy_m = cy_m + r * math.sin(angle)
    draw.line([sx_m, sy_m, sx_m + r * 0.5, sy_m + r * 0.5], fill=(*LIGHT_GRAY, 255), width=2)
    draw.text((bx + 52, by + 12), "搜索活动名称", fill=(*LIGHT_GRAY, 255), font=font_ui)
    draw.text((bx + sw + 14, by + 14), "← idle", fill=(*LIGHT_GRAY, 255), font=font_ref)

    by2 = by + 82
    rrect(draw, [bx, by2, bx + sw, by2 + sh], 12, fill=(*WHITE, 255), outline=(*TEAL, 255), width=2)
    draw.ellipse([cx_m - r, by2 + sh // 2 - r, cx_m + r, by2 + sh // 2 + r], outline=(*TEAL, 255), width=2)
    sx_m2 = cx_m + r * math.cos(angle)
    sy_m2 = by2 + sh // 2 + r * math.sin(angle)
    draw.line([sx_m2, sy_m2, sx_m2 + r * 0.5, sy_m2 + r * 0.5], fill=(*TEAL, 255), width=2)
    draw.text((bx + 52, by2 + 12), "宠物友好活动", fill=(*DARK, 255), font=font_ui)

    clear_x = bx + sw - 124
    clear_cy = by2 + sh // 2
    draw.ellipse([clear_x - 11, clear_cy - 11, clear_x + 11, clear_cy + 11], fill=(*PALE, 255))
    draw.text((clear_x - 4, clear_cy - 7), "×", fill=(*GRAY, 255), font=font_ui_sm)

    rrect(draw, [bx + sw - 90, by2 + 9, bx + sw - 12, by2 + sh - 9], 8, fill=(*TEAL, 255))
    draw.text((bx + sw - 74, by2 + 14), "搜索", fill=(*WHITE, 255), font=font_ui_sm)
    draw.text((bx + sw + 14, by2 + 14), "← focused", fill=(*TEAL, 255), font=font_ref)

def specimen_pulse(bx, by):
    for i in range(3):
        x = bx + 18 + i * 30
        r_dot = 8
        draw.ellipse([x - r_dot, by - r_dot, x + r_dot, by + r_dot], fill=(*TEAL, 255))
    draw.text((bx + 120, by - 8), "loading dots", fill=(*LIGHT_GRAY, 255), font=font_ref)

    by2 = by + 40
    for i in range(16):
        x = bx + i * 64
        alpha_val = max(0.06, 1.0 - i * 0.06)
        c = tuple(int(TEAL[j] * alpha_val + BG[j] * (1 - alpha_val)) for j in range(3))
        r_dot = max(2, int(6 * alpha_val))
        draw.ellipse([x - r_dot, by2 - r_dot, x + r_dot, by2 + r_dot], fill=(*c, 255))
    draw.text((bx + 16 * 64 + 10, by2 - 8), "fade trail", fill=(*LIGHT_GRAY, 255), font=font_ref)

    by3 = by2 + 40
    for i in range(10):
        x = bx + i * 40
        h = 4 + int(4 * math.sin(i * 0.9))
        c = TEAL if i < 6 else LIGHT_GRAY
        rrect(draw, [x, by3 - h // 2, x + 20, by3 + h // 2], 2, fill=(*c, 255))
    draw.text((bx + 10 * 40 + 10, by3 - 8), "waveform", fill=(*LIGHT_GRAY, 255), font=font_ref)

    by4 = by3 + 36
    draw.line([bx, by4, bx + 360, by4], fill=(*PALE, 255), width=1)
    draw.text((bx + 144, by4 + 6), "已加载全部", fill=(*LIGHT_GRAY, 255), font=font_ref)
    draw.line([bx + 280, by4, bx + 360, by4], fill=(*PALE, 255), width=1)

def specimen_action(bx, by):
    fab_r = 38
    for idx, (fx, fy, rot, lbl) in enumerate([
        (bx + 54, by + 40, 0, "rest"),
        (bx + 180, by + 40, 45, "pressed"),
    ]):
        shadow_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        soft_shadow(shadow_layer, [fx - fab_r, fy - fab_r, fx + fab_r, fy + fab_r], fab_r, color=TEAL_DARK, alpha_max=8, spread=8)
        canvas.alpha_composite(shadow_layer)

        draw.ellipse([fx - fab_r, fy - fab_r, fx + fab_r, fy + fab_r], fill=(*TEAL, 255))
        cross_len = int(fab_r * 0.4)
        for angle_a in [0, 90]:
            a = math.radians(angle_a + rot)
            dx = cross_len * math.cos(a)
            dy = cross_len * math.sin(a)
            draw.line([fx - dx, fy - dy, fx + dx, fy + dy], fill=(*WHITE, 255), width=3)
        draw.text((fx - 14, fy + fab_r + 10), lbl, fill=(*GRAY, 255), font=font_ref)

    arrow_y = by + 40
    draw.line([bx + 100, arrow_y, bx + 132, arrow_y], fill=(*LIGHT_GRAY, 255), width=1)
    draw.polygon([(bx + 128, arrow_y - 4), (bx + 136, arrow_y), (bx + 128, arrow_y + 4)], fill=(*LIGHT_GRAY, 255))

def specimen_progress(bx, by):
    for i, pct in enumerate([0.10, 0.28, 0.48, 0.70, 0.90, 1.0]):
        yy = by + i * 30
        bw = 440
        rrect(draw, [bx, yy, bx + bw, yy + 6], 3, fill=(*PALE, 255))
        fw = max(6, int(bw * pct))
        c = AMBER if pct >= 1.0 else TEAL
        rrect(draw, [bx, yy, bx + fw, yy + 6], 3, fill=(*c, 255))
        draw.text((bx + bw + 12, yy - 4), f"{int(pct * 100)}%", fill=(*c, 255), font=font_mono)

def specimen_status(bx, by):
    statuses = [
        ("报名中", TEAL, TEAL_DARK),
        ("报名截止", AMBER, AMBER),
        ("已结束", GRAY, GRAY),
        ("待发布", LIGHT_GRAY, GRAY),
        ("已取消", RED, RED),
    ]
    spx = bx
    for label, bg_c, text_c in statuses:
        bbox = font_ui_sm.getbbox(label)
        tw = bbox[2] - bbox[0]
        pw = tw + 22
        ph = 34
        r_bg = tuple(int(c * 0.13 + 255 * 0.87) for c in bg_c[:3])
        rrect(draw, [spx, by, spx + pw, by + ph], 6, fill=(*r_bg, 255))
        draw.text((spx + 11, by + 5), label, fill=(*text_c, 255), font=font_ui_sm)
        rrect(draw, [spx, by + 42, spx + 4, by + 92], 2, fill=(*bg_c, 255))
        spx += pw + 40

y_pos = 540
y_pos = draw_specimen(y_pos, "01", "THE CARD", "Primary information vessel — accent stripe as chromatic key", specimen_card)
y_pos = draw_specimen(y_pos, "02", "THE FILTER", "Chromatic navigation — active state as chromatic anchor", specimen_filter)
y_pos = draw_specimen(y_pos, "03", "THE SEARCH", "Focused attention — border as state indicator", specimen_search)
y_pos = draw_specimen(y_pos, "04", "THE PULSE", "Temporal rhythm — loading as anticipation", specimen_pulse)
y_pos = draw_specimen(y_pos, "05", "THE ACTION", "Floating creation trigger — rotation as feedback", specimen_action)
y_pos = draw_specimen(y_pos, "06", "THE PROGRESS", "Participation density — gradient as capacity", specimen_progress)
y_pos = draw_specimen(y_pos, "07", "THE STATUS", "Chromatic classification — color as taxonomy", specimen_status)

draw.line([MARGIN_L, y_pos, 350, y_pos], fill=(*LIGHT_GRAY, 255), width=1)
draw.text((368, y_pos - 6), "END OF PLATE I", fill=(*LIGHT_GRAY, 255), font=font_ref)
draw.line([540, y_pos, W - MARGIN_R, y_pos], fill=(*LIGHT_GRAY, 255), width=1)

draw.text((MARGIN_L, y_pos + 20), "Tactile Curation — Interaction Pattern Catalog", fill=(*LIGHT_GRAY, 255), font=font_small)
draw.text((MARGIN_L, y_pos + 36), "Activity Management · Partner Module · 2026", fill=(*LIGHT_GRAY, 255), font=font_small)

canvas_final = Image.alpha_composite(canvas, grain).convert('RGB')

output_path = '/Users/yy/Documents/trae_projects/zuoyou/docs/tactile-curation-plate-I.png'
canvas_final.save(output_path, 'PNG', quality=100)
print(f"Saved to {output_path}")
