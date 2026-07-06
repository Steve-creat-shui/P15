"""
人体损伤示意图渲染器。

使用 Pillow 绘制简化的正面人体轮廓，
在图上标注受伤部位和伤情描述。

原则：
- 使用简化人体正面轮廓（椭圆组合）
- 通过 Pillow 在对应位置画标注圆圈和文字
- 不依赖 AI，100% 代码控制
"""

from PIL import Image, ImageDraw, ImageFont
import os
import math
from pathlib import Path

# 人体轮廓关键部位的相对坐标（正面视图，比例坐标）
# 坐标原点在图片左上角，(0,0) 到 (1,1)
BODY_LANDMARKS_FRONT = {
    "头部":     (0.50, 0.08),
    "脸部":     (0.50, 0.10),
    "颈部":     (0.50, 0.15),
    "左肩":     (0.35, 0.21),
    "右肩":     (0.65, 0.21),
    "左上臂":   (0.28, 0.28),
    "右上臂":   (0.72, 0.28),
    "左手臂":   (0.28, 0.28),
    "右手臂":   (0.72, 0.28),
    "左肘":     (0.24, 0.35),
    "右肘":     (0.76, 0.35),
    "左前臂":   (0.22, 0.41),
    "右前臂":   (0.78, 0.41),
    "左手":     (0.20, 0.48),
    "右手":     (0.80, 0.48),
    "胸部":     (0.50, 0.28),
    "腹部":     (0.50, 0.38),
    "左腰":     (0.38, 0.40),
    "右腰":     (0.62, 0.40),
    "左大腿":   (0.42, 0.55),
    "右大腿":   (0.58, 0.55),
    "左膝":     (0.42, 0.65),
    "右膝":     (0.58, 0.65),
    "左小腿":   (0.42, 0.73),
    "右小腿":   (0.58, 0.73),
    "左脚":     (0.42, 0.82),
    "右脚":     (0.58, 0.82),
    # 通用
    "手臂":     (0.28, 0.33),
    "腿部":     (0.42, 0.62),
    "背部":     (0.50, 0.32),
    "躯干":     (0.50, 0.33),
}

# 图片尺寸
BODY_DIAGRAM_SIZE = (800, 1000)


def render_body_injury_diagram(
    injury_descriptions: list[str],
    victim_name: str = "",
    case_info: str = "",
    output_path: str = None
) -> str:
    """
    生成人体损伤示意图。

    参数：
    - injury_descriptions: 伤情描述列表，如 ["手臂多处擦挫伤", "颈部抓挠伤"]
    - victim_name: 被害人姓名（用于标题）
    - case_info: 案件信息（用于页脚）
    - output_path: 输出路径

    返回：输出图片路径
    """
    img = Image.new("RGB", BODY_DIAGRAM_SIZE, color=(250, 248, 245))
    draw = ImageDraw.Draw(img)

    W, H = BODY_DIAGRAM_SIZE

    # 尝试加载中文字体
    title_font   = _load_font(22)
    label_font   = _load_font(16)
    caption_font = _load_font(13)
    small_font   = _load_font(11)

    # ===== 绘制标题 =====
    title = "人体损伤示意图"
    if victim_name:
        title += f"  — {victim_name}"
    draw.text((W // 2, 25), title, fill=(30, 30, 30), font=title_font, anchor="mm")
    draw.text((W // 2, 48), "（教学用，基于法医检查记录）", fill=(120, 120, 120), font=small_font, anchor="mm")

    # ===== 绘制人体轮廓（简化版） =====
    _draw_body_outline(draw, W, H)

    # ===== 解析并标注伤情 =====
    annotations = _parse_and_locate_injuries(injury_descriptions)

    used_positions = []  # 已使用的标注位置，用于避免重叠

    for i, (injury_text, landmark_key, rel_x, rel_y) in enumerate(annotations):
        px = int(W * rel_x)
        py = int(H * rel_y)

        # 避免标注重叠：如果位置太近，稍微偏移
        px, py = _avoid_overlap(px, py, used_positions)
        used_positions.append((px, py))

        # 画标注圆圈（红色）
        r = 12
        draw.ellipse([px-r, py-r, px+r, py+r], outline="red", width=2)
        draw.text((px, py), str(i+1), fill="red", font=caption_font, anchor="mm")

        # 在右侧画说明文字（避免遮住人体）
        text_x = int(W * 0.68)
        text_y = 110 + i * 52

        marker_symbols = "❶❷❸❹❺❻❼❽❾❿"
        marker = marker_symbols[i] if i < len(marker_symbols) else str(i+1)
        draw.text((text_x, text_y), f"{marker} {i+1}.", fill=(180, 0, 0), font=label_font)
        # 自动换行（每行最多14个字符）
        wrapped = _wrap_text(injury_text, 14)
        for j, line in enumerate(wrapped[:2]):  # 最多2行
            draw.text((text_x + 25, text_y + j * 20), line, fill=(40, 40, 40), font=caption_font)

        # 从圆圈画线到文字
        if abs(px - text_x) > 60:
            line_end_x = text_x
            line_end_y = text_y + 10
            draw.line([px + r, py, line_end_x, line_end_y], fill=(180, 0, 0), width=1)

    # ===== 底部水印 =====
    footer = "教学用途 · 基于法医检查记录 · 非实际照片"
    if case_info:
        footer += f" · {case_info[:20]}"
    draw.text((W // 2, H - 20), footer, fill=(160, 160, 160), font=small_font, anchor="mm")

    # ===== 右侧图例标题 =====
    draw.text((int(W * 0.65), 80), "伤情说明：", fill=(80, 80, 80), font=label_font)

    # ===== 保存 =====
    if output_path is None:
        import time
        import tempfile
        output_dir_tmp = Path(tempfile.gettempdir()) / "jevs_body_diagrams"
        output_dir_tmp.mkdir(exist_ok=True)
        output_path = str(output_dir_tmp / f"body_diagram_{int(time.time())}.png")
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    img.save(output_path, "PNG")

    return output_path


def _draw_body_outline(draw: ImageDraw.Draw, W: int, H: int):
    """绘制简化的人体正面轮廓（椭圆组合）。"""

    OUTLINE_COLOR = (100, 100, 100)
    FILL_COLOR = (235, 225, 215)
    LW = 2  # line width

    # 人体居中偏左，右侧留给文字
    center_x = W * 0.42

    def p(rx, ry):  # 相对坐标转像素
        return (int(center_x + (rx - 0.5) * W * 0.55),
                int(H * ry))

    # 头部（圆形）
    hx, hy = p(0.5, 0.10)
    draw.ellipse([hx-45, hy-55, hx+45, hy+45],
                 fill=FILL_COLOR, outline=OUTLINE_COLOR, width=LW)

    # 颈部
    nx, ny = p(0.5, 0.165)
    draw.rectangle([nx-15, ny-15, nx+15, ny+15],
                   fill=FILL_COLOR, outline=OUTLINE_COLOR, width=LW)

    # 躯干
    tx, ty = p(0.5, 0.33)
    draw.rounded_rectangle([tx-65, ty-90, tx+65, ty+80],
                            radius=20, fill=FILL_COLOR, outline=OUTLINE_COLOR, width=LW)

    # 左臂
    draw.rounded_rectangle([p(0.22, 0.22)[0]-15, p(0.22, 0.22)[1],
                             p(0.22, 0.22)[0]+15, p(0.22, 0.48)[1]],
                            radius=10, fill=FILL_COLOR, outline=OUTLINE_COLOR, width=LW)

    # 右臂
    draw.rounded_rectangle([p(0.78, 0.22)[0]-15, p(0.78, 0.22)[1],
                             p(0.78, 0.22)[0]+15, p(0.78, 0.48)[1]],
                            radius=10, fill=FILL_COLOR, outline=OUTLINE_COLOR, width=LW)

    # 左手
    lhx, lhy = p(0.20, 0.50)
    draw.ellipse([lhx-18, lhy-12, lhx+18, lhy+12],
                 fill=FILL_COLOR, outline=OUTLINE_COLOR, width=LW)

    # 右手
    rhx, rhy = p(0.80, 0.50)
    draw.ellipse([rhx-18, rhy-12, rhx+18, rhy+12],
                 fill=FILL_COLOR, outline=OUTLINE_COLOR, width=LW)

    # 左腿
    draw.rounded_rectangle([p(0.42, 0.49)[0]-20, p(0.42, 0.49)[1],
                             p(0.42, 0.49)[0]+20, p(0.42, 0.82)[1]],
                            radius=10, fill=FILL_COLOR, outline=OUTLINE_COLOR, width=LW)

    # 右腿
    draw.rounded_rectangle([p(0.58, 0.49)[0]-20, p(0.58, 0.49)[1],
                             p(0.58, 0.49)[0]+20, p(0.58, 0.82)[1]],
                            radius=10, fill=FILL_COLOR, outline=OUTLINE_COLOR, width=LW)

    # 左脚
    lfx, lfy = p(0.40, 0.84)
    draw.rounded_rectangle([lfx-25, lfy, lfx+25, lfy+25],
                            radius=8, fill=FILL_COLOR, outline=OUTLINE_COLOR, width=LW)

    # 右脚
    rfx, rfy = p(0.60, 0.84)
    draw.rounded_rectangle([rfx-25, rfy, rfx+25, rfy+25],
                            radius=8, fill=FILL_COLOR, outline=OUTLINE_COLOR, width=LW)


def _parse_and_locate_injuries(
    injury_descriptions: list[str]
) -> list[tuple[str, str, float, float]]:
    """
    解析伤情描述，匹配到人体部位坐标。
    返回：[(描述文字, 部位关键词, rel_x, rel_y), ...]
    """
    results = []

    for desc in injury_descriptions:
        matched_key = None
        matched_pos = None

        # 按关键词长度从长到短匹配（优先匹配更具体的部位）
        sorted_landmarks = sorted(
            BODY_LANDMARKS_FRONT.items(),
            key=lambda x: len(x[0]),
            reverse=True
        )

        for landmark_key, (rel_x, rel_y) in sorted_landmarks:
            if landmark_key in desc:
                matched_key = landmark_key
                matched_pos = (rel_x, rel_y)
                break

        if matched_pos is None:
            # 未匹配到具体部位，放在躯干中心
            matched_key = "躯干"
            matched_pos = BODY_LANDMARKS_FRONT["躯干"]

        results.append((desc, matched_key, matched_pos[0], matched_pos[1]))

    return results


def _avoid_overlap(
    px: int, py: int,
    used: list[tuple[int, int]],
    min_dist: int = 30
) -> tuple[int, int]:
    """如果新标注点与已有标注点太近，稍微偏移。"""
    for ux, uy in used:
        dist = math.sqrt((px - ux) ** 2 + (py - uy) ** 2)
        if dist < min_dist:
            px += 20
            py -= 15
    return px, py


def _load_font(size: int):
    FONT_PATHS = [
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "C:/Windows/Fonts/msyh.ttc",
    ]
    for path in FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _wrap_text(text: str, max_chars: int) -> list[str]:
    lines = []
    while len(text) > max_chars:
        lines.append(text[:max_chars])
        text = text[max_chars:]
    if text:
        lines.append(text)
    return lines
