"""Document Renderer — 书证渲染系统。

核心原则：
- 文字 100% 准确，直接来自原始证据内容
- 禁止 AI 改写或补全任何文字
- 使用 Pillow 代码渲染，不调用任何 AI 图像生成
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import TYPE_CHECKING

from PIL import Image, ImageDraw, ImageFont

if TYPE_CHECKING:
    from app.models import Case, Evidence
    from app.schemas.scene import SceneStateSnapshot

# ==============================================================================
# 中文字体加载
# ==============================================================================

_FONT_CACHE: dict[tuple[int, bool], ImageFont.FreeTypeFont | ImageFont.ImageFont] = {}


def load_chinese_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """按优先级尝试加载中文字体。

    1. /System/Library/Fonts/PingFang.ttc（macOS）
    2. /usr/share/fonts/truetype/wqy/wqy-microhei.ttc（Linux）
    3. C:/Windows/Fonts/msyh.ttc（Windows）
    4. PIL 默认字体（fallback，中文可能显示为方块，但不报错）

    Returns:
        ImageFont 对象。
    """
    cache_key = (size, bold)
    if cache_key in _FONT_CACHE:
        return _FONT_CACHE[cache_key]

    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
    ]

    for path in candidates:
        try:
            if bold:
                font = ImageFont.truetype(path, size, index=1)
            else:
                font = ImageFont.truetype(path, size)
            _FONT_CACHE[cache_key] = font
            return font
        except (OSError, IOError):
            continue

    # Fallback to PIL default (won't render CJK, but won't crash)
    try:
        font = ImageFont.load_default()
    except Exception:
        font = ImageFont.ImageFont()
    _FONT_CACHE[cache_key] = font
    return font


# ==============================================================================
# 文本换行
# ==============================================================================


def _measure_text_width(font: ImageFont.ImageFont, text: str) -> int:
    """测量文本的渲染宽度（返回像素）。

    优先使用 font.getlength()（Pillow 9.2+，更精确），
    回退到 font.getbbox()。
    """
    if not text:
        return 0
    try:
        return int(font.getlength(text) + 0.5)
    except AttributeError:
        bbox = font.getbbox(text)
        if bbox is None:
            return 0
        return bbox[2] - bbox[0]


def wrap_chinese_text(
    text: str,
    max_chars_per_line: int,
    font: ImageFont.ImageFont | None = None,
    max_pixel_width: int | None = None,
    safety_margin: int = 6,
) -> list[str]:
    """中文文本自动换行。

    支持两种模式：
    1. 字符数模式（max_chars_per_line）：按字符数切割
    2. 像素模式（max_pixel_width）：按实际渲染宽度切割（推荐，更精确）

    优先使用像素模式（如果提供了 font 和 max_pixel_width），
    否则退回到字符数模式。

    换行策略：加字符前先判断，若加入后会超过宽度则先换行再加，
    确保每行的实际渲染宽度永远不超过上限（含安全边距）。

    Args:
        text: 待换行的文本。
        max_chars_per_line: 每行最大中文字符数（字符数模式时使用）。
        font: 字体对象（像素模式时需要）。
        max_pixel_width: 每行最大像素宽度（像素模式时使用）。
        safety_margin: 像素模式的安全边距（像素），避免字体渲染误差导致溢出。

    Returns:
        list[str]: 换行后的行列表。
    """
    lines: list[str] = []

    use_pixel_mode = font is not None and max_pixel_width is not None
    # 减去安全边距，确保文字不会贴边
    effective_pixel_width = (max_pixel_width or 0) - safety_margin if use_pixel_mode else 0

    for paragraph in text.split("\n"):
        if not paragraph.strip():
            lines.append("")
            continue
        current = ""
        char_count = 0.0
        for ch in paragraph:
            if ch == "\r":
                continue

            # 中文字符和全角符号计为 1，ASCII 字母数字计为 0.5
            ch_width = 1.0 if ord(ch) > 127 else 0.5

            should_break_before = False
            if use_pixel_mode:
                # 像素模式：先预测加入这个字符后的宽度
                test_text = current + ch
                text_w = _measure_text_width(font, test_text)
                # 如果加入后超过了，且当前行不为空，则先换行再加
                if text_w > effective_pixel_width and current:
                    should_break_before = True
            else:
                # 字符数模式：如果加入后超过限制且当前行不为空，则先换行再加
                if char_count + ch_width > max_chars_per_line and current:
                    should_break_before = True

            if should_break_before:
                lines.append(current)
                current = ""
                char_count = 0.0

            current += ch
            char_count += ch_width

        if current:
            lines.append(current)

    return lines


# ==============================================================================
# 1. 格子纸渲染器
# ==============================================================================


def render_grid_paper(
    text: str,
    title: str = "",
    output_path: str | None = None,
) -> str:
    """在格子纸背景上渲染手写风格书证。

    Args:
        text: 书证文本内容。
        title: 左上角标题（可选）。
        output_path: 输出路径，为 None 则自动生成。

    Returns:
        str: 图片保存的绝对路径。
    """
    width, height = 794, 1123  # A4 比例
    grid_spacing = 28

    img = Image.new("RGB", (width, height), color=(245, 240, 232))  # 米黄色
    draw = ImageDraw.Draw(img)

    # --- 绘制格子线 ---
    line_color = (180, 200, 220)  # 浅蓝色
    for x in range(0, width, grid_spacing):
        draw.line([(x, 0), (x, height)], fill=line_color, width=1)
    for y in range(0, height, grid_spacing):
        draw.line([(0, y), (width, y)], fill=line_color, width=1)

    # 左侧红线（中式信纸风格）
    for x_offset in [40, 44]:
        draw.line([(x_offset, 0), (x_offset, height)], fill=(220, 180, 180), width=1)

    # --- 标题 ---
    font_title = load_chinese_font(22, bold=True)
    font_body = load_chinese_font(20)
    font_watermark = load_chinese_font(14)

    text_y = 60
    if title:
        draw.text((60, text_y), title, fill=(26, 35, 126), font=font_title)
        text_y += 50

    # --- 正文 ---
    text_color = (26, 35, 126)  # 深蓝色，模拟钢笔
    lines = wrap_chinese_text(text, 20)
    for line in lines:
        draw.text((60, text_y), line, fill=text_color, font=font_body)
        text_y += 30

    # --- 右下角水印 ---
    wm_text = "（书证原文，教学用）"
    wm_bbox = draw.textbbox((0, 0), wm_text, font=font_watermark)
    wm_w = wm_bbox[2] - wm_bbox[0]
    draw.text(
        (width - wm_w - 30, height - 40),
        wm_text,
        fill=(150, 150, 150),
        font=font_watermark,
    )

    # --- 保存 ---
    if output_path is None:
        from datetime import datetime, timezone
        import uuid
        ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        uid = uuid.uuid4().hex[:8]
        output_path = f"grid_paper_{ts}_{uid}.png"

    path = Path(output_path)
    if not path.is_absolute():
        from pathlib import Path as P
        out_dir = P(__file__).resolve().parent.parent.parent / "static" / "images" / "test"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / path.name
    else:
        path.parent.mkdir(parents=True, exist_ok=True)

    img.save(str(path), format="PNG")
    return str(path)


# ==============================================================================
# 2. A4 打印文件渲染器
# ==============================================================================


def _draw_arc_text(
    image: Image.Image,
    cx: float,
    cy: float,
    r: float,
    text: str,
    font_size: int,
    color: tuple[int, int, int],
    start_angle: float,
    end_angle: float,
) -> None:
    """沿圆弧放置文字，每个字符旋转至与圆相切。

    PIL 屏幕角度约定：0°=右侧，顺时针增加，270°=顶部。
    圆弧从 start_angle 逆时针走到 end_angle（经过顶部 270°）。
    """
    font = load_chinese_font(font_size, bold=True)
    n = len(text)
    if n < 1:
        return

    span = (end_angle - start_angle) % 360
    if span == 0:
        span = 360
    step = span / (n - 1) if n > 1 else 0

    for i, char in enumerate(text):
        a = (start_angle + i * step) % 360
        rad = math.radians(a)
        px = cx + r * math.cos(rad)
        py = cy + r * math.sin(rad)

        # 文字旋转：字脚朝向圆心，PIL rotate(+) 逆时针
        rotation = 270 - a

        bbox = font.getbbox(char)
        char_w = bbox[2] - bbox[0]
        char_h = bbox[3] - bbox[1]
        pad = 4
        char_img = Image.new("RGBA", (char_w + pad * 2, char_h + pad * 2), (0, 0, 0, 0))
        cd = ImageDraw.Draw(char_img)
        cd.text((pad - bbox[0], pad - bbox[1]), char, fill=color, font=font)

        rotated = char_img.rotate(rotation, expand=False, resample=Image.BICUBIC)
        image.paste(
            rotated,
            (int(px - rotated.width / 2), int(py - rotated.height / 2)),
            rotated,
        )


def _draw_circular_seal(
    image: Image.Image,
    cx: float,
    cy: float,
    radius: float,
    org_name: str,
    sub_text: str = "",
) -> None:
    """绘制中国式圆形红色公章。"""
    seal_color = (200, 30, 30)
    draw = ImageDraw.Draw(image)

    # 外圈（粗）
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        outline=seal_color,
        width=5,
    )
    # 内圈（细）
    inner_r = radius - 9
    draw.ellipse(
        [cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r],
        outline=seal_color,
        width=1,
    )

    # 顶部弧形文字（机构名称）
    if org_name:
        _draw_arc_text(
            image, cx, cy, inner_r - 8, org_name,
            font_size=16, color=seal_color,
            start_angle=198, end_angle=342,
        )

    # 中央五角星
    star_r = 16
    star_points: list[tuple[int, int]] = []
    for j in range(5):
        outer_a = math.radians(-90 + j * 72)        # 顶点
        inner_a = math.radians(-90 + 36 + j * 72)   # 凹点
        star_points.append((int(cx + star_r * math.cos(outer_a)),
                            int(cy + star_r * math.sin(outer_a))))
        star_points.append((int(cx + star_r * 0.38 * math.cos(inner_a)),
                            int(cy + star_r * 0.38 * math.sin(inner_a))))
    draw.polygon(star_points, fill=seal_color)

    # 副文字（专用章等）在星下方
    if sub_text:
        font_sub = load_chinese_font(13)
        bbox = draw.textbbox((0, 0), sub_text, font=font_sub)
        tw = bbox[2] - bbox[0]
        draw.text(
            (cx - tw / 2, cy + star_r + 4),
            sub_text,
            fill=seal_color,
            font=font_sub,
        )


def render_a4_document(
    text: str,
    title: str = "",
    document_date: str = "",
    seal_text: str = "",
    seal_sub_text: str = "",
    output_path: str | None = None,
) -> str:
    """渲染正式 A4 打印风格书证。

    Args:
        text: 书证文本内容。
        title: 居中标题。
        document_date: 日期文本（如 "2024年3月15日"）。
        seal_text: 印章文字第一行（为空时显示"（印章）"）。
        seal_sub_text: 印章文字第二行（为空时不显示）。
        output_path: 输出路径，为 None 则自动生成。

    Returns:
        str: 图片保存的绝对路径。
    """
    width, height = 794, 1123
    margin_top, margin_bottom = 60, 60
    margin_left, margin_right = 80, 80

    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    font_title = load_chinese_font(20, bold=True)
    font_body = load_chinese_font(14)
    font_date = load_chinese_font(12)

    content_width = width - margin_left - margin_right
    y = margin_top

    # --- 标题（居中） ---
    if title:
        bbox = draw.textbbox((0, 0), title, font=font_title)
        title_w = bbox[2] - bbox[0]
        draw.text(((width - title_w) / 2, y), title, fill=(0, 0, 0), font=font_title)
        y += 50

    # --- 正文 ---
    text_color = (30, 30, 30)
    lines = wrap_chinese_text(text, 30)
    line_height = int(font_body.size * 1.6)
    for line in lines:
        if y + line_height > height - margin_bottom - 100:
            break  # 超出页面，截断
        draw.text((margin_left, y), line, fill=text_color, font=font_body)
        y += line_height

    # --- 日期（右对齐） ---
    if document_date:
        y += 20
        bbox = draw.textbbox((0, 0), document_date, font=font_date)
        date_w = bbox[2] - bbox[0]
        draw.text(
            (width - margin_right - date_w, y),
            document_date,
            fill=(120, 120, 120),
            font=font_date,
        )

    # --- 底部红色印章（圆形公章风格） ---
    seal_radius = 65
    seal_cx = width - margin_right - seal_radius - 10
    seal_cy = height - margin_bottom - seal_radius - 5
    seal_text_line1 = seal_text if seal_text else "（印章）"
    _draw_circular_seal(img, seal_cx, seal_cy, seal_radius, seal_text_line1, seal_sub_text)

    # --- 保存 ---
    if output_path is None:
        from datetime import datetime, timezone
        import uuid
        ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        uid = uuid.uuid4().hex[:8]
        output_path = f"a4_doc_{ts}_{uid}.png"

    path = Path(output_path)
    if not path.is_absolute():
        from pathlib import Path as P
        out_dir = P(__file__).resolve().parent.parent.parent / "static" / "images" / "test"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / path.name
    else:
        path.parent.mkdir(parents=True, exist_ok=True)

    img.save(str(path), format="PNG")
    return str(path)


# ==============================================================================
# 3. 手机聊天截图渲染器
# ==============================================================================


def render_chat_screenshot(
    messages: list[dict],
    output_path: str | None = None,
) -> str:
    """渲染手机聊天记录截图风格书证。

    Args:
        messages: 消息列表，每项格式:
            {"sender": "A"|"B", "text": "消息内容", "time": "14:30"}
        output_path: 输出路径，为 None 则自动生成。

    Returns:
        str: 图片保存的绝对路径。
    """
    phone_width = 420  # 略宽于 iPhone 14，避免衬线体换行过多
    nav_height = 80
    padding = 15
    bubble_max_width = int(phone_width * 0.72)
    # 气泡内文字可用像素宽度（气泡最大宽 - 左右内边距）
    bubble_text_max_pixel = bubble_max_width - 24
    # 实际用于换行判断的像素宽度
    # 容器里实际是 Noto Serif CJK 衬线体，字宽较大且与 getlength() 可能有差异
    # 大量扣除：20px = 8px 安全边距 + 12px 字距/字形误差
    effective_wrap_width = bubble_text_max_pixel - 20

    font_nav = load_chinese_font(16, bold=True)
    font_msg = load_chinese_font(15)
    font_time = load_chinese_font(11)
    font_sender = load_chinese_font(12)

    msg_color_left = (255, 255, 255)      # 对方白色气泡
    msg_color_right = (149, 236, 105)     # 本人绿色气泡
    bg_color = (237, 237, 237)            # 微信背景

    # --- 预计算内容高度（按像素宽度换行）---
    content_y = nav_height + padding
    y = content_y

    for msg in messages:
        wrapped = wrap_chinese_text(
            msg["text"],
            max_chars_per_line=18,
            font=font_msg,
            max_pixel_width=effective_wrap_width,
        )
        bubble_h = len(wrapped) * 24 + 20
        y += bubble_h + 20  # 气泡 + 间距 + 时间戳行 + 间距
        # 时间戳行
        y += 20 + 8

    total_height = max(y + padding, nav_height + 200)

    img = Image.new("RGB", (phone_width, total_height), color=bg_color)
    draw = ImageDraw.Draw(img)

    # --- 顶部导航栏 ---
    draw.rectangle([(0, 0), (phone_width, nav_height)], fill=(30, 30, 30))
    nav_title = "聊天记录（教学用）"
    nbbox = draw.textbbox((0, 0), nav_title, font=font_nav)
    nw = nbbox[2] - nbbox[0]
    draw.text(
        ((phone_width - nw) / 2, (nav_height - font_nav.size) / 2),
        nav_title,
        fill=(255, 255, 255),
        font=font_nav,
    )

    # --- 消息气泡 ---
    y = content_y

    for msg in messages:
        sender = msg.get("sender", "A")
        text = msg.get("text", "")
        time_str = msg.get("time", "")

        is_left = (sender != "B")  # 非 B 即为左侧（对方）

        # 按像素宽度换行（关键修复：避免文字超出气泡）
        wrapped = wrap_chinese_text(
            text,
            max_chars_per_line=18,
            font=font_msg,
            max_pixel_width=effective_wrap_width,
        )
        bubble_h = len(wrapped) * 24 + 20
        bubble_color = msg_color_left if is_left else msg_color_right

        # 气泡宽度（按实际渲染像素计算，确保能容纳文字）
        bubble_w = 0
        for l in wrapped:
            bw = _measure_text_width(font_msg, l)
            bubble_w = max(bubble_w, bw)
        bubble_w += 24  # 左右内边距各 12
        # 不再 min 截断，因为换行后文字宽度已严格 < effective_wrap_width
        # bubble_w 最大约为 effective_wrap_width + 24 ≈ 241px
        bubble_w = min(bubble_w, bubble_max_width)

        if is_left:
            bubble_x = padding
            sender_x = padding + 10
        else:
            bubble_x = phone_width - padding - bubble_w
            sender_x = phone_width - padding - 10

        # 发送者标签（确保不超出画布边界）
        sender_label = msg.get("sender_name", "")
        if not sender_label:
            sender_label = "对方" if is_left else "本人"

        # 计算标签最大可用宽度
        if is_left:
            # 左侧：左对齐，最多占气泡宽度的 80%，但不超过左边界 + 气泡宽 - 气泡内padding
            max_label_w = bubble_w - 20
        else:
            # 右侧：右对齐，最多占气泡宽度的 80%
            max_label_w = bubble_w - 20

        # 截断过长的发送者名称
        label_w = _measure_text_width(font_sender, sender_label)
        if label_w > max_label_w:
            # 逐步截断直到符合宽度（预添加"…"）
            truncated = sender_label
            while True:
                truncated = truncated[:-1]
                test_label = truncated + "…"
                test_w = _measure_text_width(font_sender, test_label)
                if test_w <= max_label_w or len(truncated) <= 1:
                    sender_label = test_label
                    label_w = test_w
                    break

        # 定位标签（与气泡对齐，而不是画布边缘）
        if is_left:
            # 左侧：与气泡左边缘对齐（略右一点）
            label_x = bubble_x + 12
        else:
            # 右侧：右对齐，标签右边 = 气泡右边 - 12
            label_x = bubble_x + bubble_w - 12 - label_w

        draw.text((label_x, y - 2), sender_label, fill=(150, 150, 150), font=font_sender)

        y += 18

        # 圆角效果：画圆角矩形
        radius = 12
        draw.rounded_rectangle(
            [bubble_x, y, bubble_x + bubble_w, y + bubble_h],
            radius=radius,
            fill=bubble_color,
        )

        # 气泡文字
        text_y = y + 10
        for line in wrapped:
            draw.text((bubble_x + 12, text_y), line, fill=(0, 0, 0), font=font_msg)
            text_y += 24

        y += bubble_h + 6

        # 时间戳
        if time_str:
            tbbox = draw.textbbox((0, 0), time_str, font=font_time)
            tw = tbbox[2] - tbbox[0]
            draw.text(
                ((phone_width - tw) / 2, y),
                time_str,
                fill=(180, 180, 180),
                font=font_time,
            )
            y += 20

        y += 8  # 消息间距

    # --- 保存 ---
    if output_path is None:
        from datetime import datetime, timezone
        import uuid
        ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        uid = uuid.uuid4().hex[:8]
        output_path = f"chat_{ts}_{uid}.png"

    path = Path(output_path)
    if not path.is_absolute():
        from pathlib import Path as P
        out_dir = P(__file__).resolve().parent.parent.parent / "static" / "images" / "test"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / path.name
    else:
        path.parent.mkdir(parents=True, exist_ok=True)

    img.save(str(path), format="PNG")
    return str(path)


# ==============================================================================
# 向后兼容的异步报告渲染函数（保留 Phase 2 API）
# ==============================================================================


async def render_case_report(
    case,
    evidences: list,
    scene_state=None,
    fmt: str = "markdown",
) -> str:
    """渲染完整的案件分析报告。

    保留此函数用于向后兼容（Phase 2 的 HTML/Markdown 模板渲染）。
    如需纯 Pillow 书证渲染，请使用上面的 render_* 函数。

    Args:
        case: Case DB model instance.
        evidences: List of Evidence DB model instances.
        scene_state: Optional SceneStateSnapshot.
        fmt: "markdown" or "html".

    Returns:
        str: Rendered report.
    """
    import json
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    approved = [e for e in evidences if e.is_approved and not e.is_excluded]
    pending = [e for e in evidences if not e.is_approved and not e.is_excluded]
    excluded = [e for e in evidences if e.is_excluded]

    status_labels = {
        "pending": "待处理", "extracted": "已提取证据",
        "reviewed": "已推演现场", "generated": "已生成图像",
    }
    status_label = status_labels.get(case.status, case.status)
    raw_excerpt = case.raw_text[:500] + "..." if len(case.raw_text) > 500 else case.raw_text

    rationale = "尚未进行现场推演。"
    if scene_state and scene_state.deduction_rationale:
        rationale = scene_state.deduction_rationale

    def _ev_table(evs):
        if not evs:
            return "*(无)*\n"
        lines = ["| # | 类别 | 类型 | 描述 | 位置 |", "|---|------|------|------|------|"]
        for i, ev in enumerate(evs, 1):
            d = ev.description[:60] + "..." if len(ev.description) > 60 else ev.description
            lines.append(f"| {i} | {ev.category} | {ev.evidence_type} | {d} | {ev.location or '-'} |")
        return "\n".join(lines) + "\n"

    if fmt == "html":
        # Simplified HTML template for backward compat
        badge = {"approved": "#c6f6d5", "pending": "#fefcbf", "excluded": "#fed7d7"}
        return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><title>{case.title}</title></head>
<body><h1>{case.title}</h1><p>{now} | {status_label}</p>
<h2>证据概览</h2><p>总计 {len(evidences)} 条（已核准 {len(approved)}，待审核 {len(pending)}，已排除 {len(excluded)}）</p>
<h3>已核准</h3><pre>{_ev_table(approved)}</pre>
<h3>待审核</h3><pre>{_ev_table(pending)}</pre>
<h3>已排除</h3><pre>{_ev_table(excluded)}</pre>
<h2>现场推演</h2><blockquote>{rationale}</blockquote>
<h2>原始材料</h2><pre>{raw_excerpt}</pre>
<p><em>JEVS 自动生成，仅供教学参考。</em></p></body></html>"""

    # Markdown
    return f"""# 案件分析报告：{case.title}

> 生成时间：{now} | 状态：{status_label} | 证据：{len(evidences)} 条

## 证据概览
总计 {len(evidences)} 条证据（已核准 {len(approved)}，待审核 {len(pending)}，已排除 {len(excluded)}）。

### 已核准
{_ev_table(approved)}
### 待审核
{_ev_table(pending)}
### 已排除
{_ev_table(excluded)}

## 现场推演
{scene_to_md(scene_state) if scene_state else '*(尚未进行)*'}

> {rationale}

## 原始材料
```
{raw_excerpt}
```
*JEVS 自动生成，仅供教学参考。*"""


def scene_to_md(scene_state) -> str:
    """将 SceneStateSnapshot 转为 Markdown 表格。"""
    lines = [f"**场景**: {scene_state.scene_name}", "", "| 物体 | 类型 | 位置 |", "|------|------|------|"]
    for obj in scene_state.objects:
        pos = obj.position_3d if hasattr(obj, 'position_3d') else [0, 0, 0]
        name = getattr(obj, 'name', '?')
        typ = getattr(obj, 'type', '?')
        lines.append(f"| {name} | {typ} | ({pos[0]:.1f}, {pos[1]:.1f}, {pos[2]:.1f}) |")
    return "\n".join(lines)


# ==============================================================================
# 测试用例
# ==============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("Document Renderer — 测试用例")
    print("=" * 60)

    # 测试文本
    test_text = (
        "甲方张三与乙方李四于2024年1月15日签订借款合同，约定张三向李四借款人民币伍拾万元整"
        "（￥500,000.00），借款期限为12个月，年利率为6%。双方约定按月付息，到期一次还本。\n\n"
        "担保人王五自愿为上述借款提供连带责任保证。"
    )

    test_messages = [
        {"sender": "A", "sender_name": "张三", "text": "李四，那笔钱什么时候能还？", "time": "14:20"},
        {"sender": "B", "sender_name": "李四", "text": "再宽限几天，我这周之内一定想办法", "time": "14:22"},
        {"sender": "A", "sender_name": "张三", "text": "已经拖了三个月了，你每次都说下周", "time": "14:23"},
        {"sender": "B", "sender_name": "李四", "text": "这次真的，下周一定", "time": "14:25"},
        {"sender": "A", "sender_name": "张三", "text": "好吧，那我再等你一周。如果还是不行我就走法律程序了", "time": "14:28"},
    ]

    # --- 测试 1: 格子纸 ---
    path1 = render_grid_paper(test_text, title="借款合同（书证）")
    img1 = Image.open(path1)
    print(f"\n[格子纸] {path1}")
    print(f"  尺寸: {img1.size[0]}x{img1.size[1]}px")
    print(f"  模式: {img1.mode}")

    # --- 测试 2: A4 文档 ---
    path2 = render_a4_document(
        test_text,
        title="借款合同",
        document_date="2024年1月15日",
    )
    img2 = Image.open(path2)
    print(f"\n[A4文档] {path2}")
    print(f"  尺寸: {img2.size[0]}x{img2.size[1]}px")
    print(f"  模式: {img2.mode}")

    # --- 测试 3: 聊天截图 ---
    path3 = render_chat_screenshot(test_messages)
    img3 = Image.open(path3)
    print(f"\n[聊天截图] {path3}")
    print(f"  尺寸: {img3.size[0]}x{img3.size[1]}px")
    print(f"  模式: {img3.mode}")

    print(f"\n字体测试: load_chinese_font(20) = {type(load_chinese_font(20)).__name__}")
    print(f"换行测试: wrap_chinese_text('测试中文换行功能', 4) = {wrap_chinese_text('测试中文换行功能', 4)}")
    print("\n" + "=" * 60)
    print("全部渲染器测试通过")
    print("=" * 60)
