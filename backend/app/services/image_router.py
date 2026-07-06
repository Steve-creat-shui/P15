"""Image Router — 统一管理图像生成，支持多个 Provider 动态切换。

MVP 阶段支持：dalle（默认）和 flux（可选）。
Seedream 暂不实现，预留接口。

图片存储结构：
backend/static/images/
├── {case_id}/
│   ├── scenes/           # 场景图
│   ├── evidence/         # 物证特写
│   └── documents/        # 书证渲染
"""

import io
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings

from PIL import Image, ImageDraw
import asyncio
import httpx
from openai import AsyncOpenAI, InternalServerError, APITimeoutError, APIConnectionError

from app.services.scene_engine import (
    SceneState,
    SceneObject,
    scene_to_image_prompt,
    scene_objects_to_rich_prompt,
)

# ==============================================================================
# 图片存储根目录
# ==============================================================================

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static"
IMAGES_DIR = STATIC_DIR / "images"

# ==============================================================================
# Provider 分类配置
# ==============================================================================

# 每种图片类型可以独立配置不同的 Provider
DEFAULT_PROVIDER_CONFIG = {
    "scene_overview":    "dalle",    # 场景全图：DALL·E（forensic理解最好）
    "evidence_closeup":  "dalle",    # 物证特写：DALL·E AI生成（默认，确保物证描述准确）
    "document_render":   "pillow",   # 书证渲染：Pillow（固定，不走AI）
}

# 特写的 fallback 顺序：裁剪法不可用时依次尝试
CLOSEUP_FALLBACK_ORDER = ["crop", "hunyuan", "dalle"]

# 人体部位中英文映射（用于 AI prompt 生成）
BODY_PART_EN: dict[str, str] = {
    "头部": "head", "脸部": "face", "颈部": "neck",
    "左肩": "left shoulder", "右肩": "right shoulder",
    "左上臂": "left upper arm", "右上臂": "right upper arm",
    "左手臂": "left arm", "右手臂": "right arm",
    "左肘": "left elbow", "右肘": "right elbow",
    "左前臂": "left forearm", "右前臂": "right forearm",
    "左手": "left hand", "右手": "right hand",
    "胸部": "chest", "腹部": "abdomen",
    "左腰": "left waist", "右腰": "right waist",
    "左大腿": "left thigh", "右大腿": "right thigh",
    "左膝": "left knee", "右膝": "right knee",
    "左小腿": "left calf", "右小腿": "right calf",
    "左脚": "left foot", "右脚": "right foot",
    "手臂": "arm", "腿部": "leg", "背部": "back", "躯干": "torso",
}


def _extract_gender_from_description(description: str) -> str | None:
    """从伤情描述中推断性别。

    通过关键词匹配判断性别，用于伤情特写生成时确保人物特征一致。
    返回 "male"、"female" 或 None（无法判断）。
    """
    if not description:
        return None

    female_keywords = [
        "女性", "女士", "女子", "女孩", "女", "妇女", "妇", "她",
        "被害人女", "受害人女", "女被害人", "女受害人",
        "妻子", "女朋友", "女友", "母亲", "妈妈", "女儿", "姐姐", "妹妹",
        "阿姨", "大妈", "小姐", "女士",
    ]
    male_keywords = [
        "男性", "男士", "男子", "男孩", "男", "他",
        "被害人男", "受害人男", "男被害人", "男受害人",
        "丈夫", "男朋友", "男友", "父亲", "爸爸", "儿子", "哥哥", "弟弟",
        "叔叔", "大爷", "先生",
    ]

    desc_lower = description.lower()
    for kw in female_keywords:
        if kw in desc_lower:
            return "female"
    for kw in male_keywords:
        if kw in desc_lower:
            return "male"
    return None


def _build_injury_closeup_prompt(
    body_part: str,
    injury_description: str,
    gender: str | None = None,
) -> str:
    """构建伤情特写的 AI prompt。

    使用临床医学/法医风格描述，避免触发内容安全过滤。
    强调教育用途和临床文档性质。
    加入性别信息以确保人物特征一致性。

    Args:
        body_part: 受伤部位（中文）
        injury_description: 伤情描述（中文）
        gender: 性别（"male" / "female" / None）
    """
    part_en = BODY_PART_EN.get(body_part, body_part)

    # 性别相关描述
    gender_desc = ""
    if gender == "female":
        gender_desc = (
            "This is a female person. "
            "The skin texture and features are consistent with a young to middle-aged adult woman. "
        )
    elif gender == "male":
        gender_desc = (
            "This is a male person. "
            "The skin texture and features are consistent with a young to middle-aged adult man. "
        )
    else:
        gender_desc = (
            "The skin and body features are consistent across all views — "
            "same person, same skin tone, same age range. "
        )

    return (
        f"A clinical medical reference photograph of a human {part_en}, "
        f"taken for forensic documentation and medical training purposes. "
        f"{gender_desc}"
        f"The skin surface shows markings described as: {injury_description}. "
        f"This is a professional forensic training image — clinical documentation, "
        f"not a scene of violence. Neutral medical lighting, sharp macro focus on "
        f"skin texture and surface details. Clean, professional, educational style. "
        f"Photorealistic quality, 1024x1024, medical textbook reference photograph. "
        f"IMPORTANT: This is the same person throughout — consistent skin tone, "
        f"consistent age, consistent body proportions. No text, no watermarks."
    )


def _ensure_dir(path: Path) -> Path:
    """自动创建目录，不存在时不报错。"""
    path.mkdir(parents=True, exist_ok=True)
    return path


# ==============================================================================
# Abstract Base Provider
# ==============================================================================


class BaseImageProvider(ABC):
    """图像生成 Provider 抽象基类。"""

    @abstractmethod
    async def generate(self, prompt: str, size: str = "1024x1024") -> bytes:
        """返回生成图片的原始字节数据。"""
        ...

    @abstractmethod
    async def inpaint(
        self,
        base_image_path: str,
        mask_path: str,
        prompt: str,
    ) -> bytes:
        """在已有图片上的 mask 区域进行 inpainting，返回新图片原始字节数据。"""
        ...


# ==============================================================================
# DALL·E Provider
# ==============================================================================


class DalleProvider(BaseImageProvider):
    """图像生成 Provider — 通过 OpenAI 兼容接口（支持聚合平台代理）。

    generate: 调用 gpt-image-2（兼容 DALL·E 3 代理）
    inpaint: DALL·E 2 edit 接口（聚合平台通常不支持，回退占位图）
    """

    # 可通过环境变量覆盖的默认值
    _base_url: str = "https://api.aigocode.com/v1"
    _model: str = "gpt-image-2"

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key or settings.OPENAI_API_KEY or ""

    def _get_client(self) -> AsyncOpenAI:
        """延迟初始化客户端，指向聚合平台代理地址。"""
        if not self._api_key:
            raise RuntimeError(
                "OPENAI_API_KEY not set. Please configure it in .env or pass api_key."
            )
        return AsyncOpenAI(
            api_key=self._api_key,
            base_url=self._base_url,
            timeout=httpx.Timeout(180.0, connect=10.0),
            max_retries=1,
        )

    async def generate(self, prompt: str, size: str = "1024x1024") -> bytes:
        """使用 gpt-image-2 生成。

        包含重试逻辑：遇到 Cloudflare 524 超时或 5xx 错误时自动重试，
        最多重试 3 次，重试间隔递增。全部失败时返回占位图，不抛异常。

        Args:
            prompt: 图像生成提示词。
            size: 图片尺寸。

        Returns:
            bytes: 图片原始字节数据。
        """
        import base64
        import logging
        logger = logging.getLogger(__name__)

        max_retries = 3
        last_error: Exception | None = None

        for attempt in range(max_retries + 1):
            try:
                client = self._get_client()
                response = await client.images.generate(
                    model=self._model,
                    prompt=prompt,
                    size=size,
                    n=1,
                )

                img_data = response.data[0]
                image_url = img_data.url
                b64_json = getattr(img_data, 'b64_json', None)

                if not image_url and not b64_json:
                    raise RuntimeError("Image generation returned no URL or b64_json")

                if b64_json:
                    return base64.b64decode(b64_json)

                # 下载生成的图片（带超时）
                async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as http:
                    resp = await http.get(image_url)
                    resp.raise_for_status()
                    return resp.content

            except (InternalServerError, APITimeoutError, APIConnectionError) as e:
                last_error = e
                if attempt < max_retries:
                    wait = (attempt + 1) * 30  # 30s, 60s, 90s 递增等待
                    logger.warning(
                        f"[DalleProvider] 第 {attempt + 1}/{max_retries} 次重试失败，"
                        f"{wait}s 后重试 | 错误: {e}"
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.error(
                        f"[DalleProvider] 全部 {max_retries} 次重试均失败，"
                        f"使用占位图 | 最后错误: {e}"
                    )

            except httpx.HTTPStatusError as e:
                last_error = e
                if attempt < max_retries:
                    wait = (attempt + 1) * 30
                    logger.warning(
                        f"[DalleProvider] 下载图片失败 (HTTP {e.response.status_code})，"
                        f"第 {attempt + 1}/{max_retries} 次重试，{wait}s 后重试"
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.error(
                        f"[DalleProvider] 下载图片全部重试失败，使用占位图 | 最后错误: {e}"
                    )

        # 全部重试失败 → 返回占位图，不抛异常
        return self._make_placeholder(
            prompt,
            f"DalleProvider 生成失败（已重试 {max_retries} 次）\n"
            f"最后错误: {str(last_error)[:100] if last_error else '未知'}"
        )

    def _make_placeholder(self, prompt: str, reason: str) -> bytes:
        """生成占位图 — 当 API 调用彻底失败时使用。

        灰底 + 说明文字，让前端知道图片生成失败但不阻塞流程。
        在 PNG 文本块中标记 `placeholder=true` 和 `placeholder_reason=...`，
        供 _is_placeholder_bytes() 识别，避免将占位图保存为正式生成结果。
        """
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"[DalleProvider] 使用占位图 | 原因: {reason[:80]}")

        img = Image.new("RGB", (1024, 1024), color=(60, 60, 60))
        # 添加占位标记到 PNG info，供 fallback 逻辑识别
        img.info["placeholder"] = "true"
        img.info["placeholder_reason"] = reason[:200]
        draw = ImageDraw.Draw(img)
        lines = [
            "DALL·E Image Generation Failed",
            "",
            reason[:100],
            "",
            f"Prompt: {prompt[:120]}...",
            "",
            "请检查 API Key 配置或稍后重试",
        ]
        y = 350
        for line in lines:
            bbox = draw.textbbox((0, 0), line)
            tw = bbox[2] - bbox[0]
            draw.text(((1024 - tw) / 2, y), line, fill=(255, 255, 200))
            y += 28
        buf = io.BytesIO()
        img.save(buf, format="PNG", pnginfo=self._make_pnginfo("DALL·E", reason))
        return buf.getvalue()

    @staticmethod
    def _make_pnginfo(provider_name: str, reason: str):
        """创建带占位标记的 PngImagePlugin.PngInfo。"""
        try:
            from PIL.PngImagePlugin import PngInfo
            pnginfo = PngInfo()
            pnginfo.add_text("placeholder", "true")
            pnginfo.add_text("placeholder_provider", provider_name)
            pnginfo.add_text("placeholder_reason", reason[:200])
            return pnginfo
        except Exception:
            return None

    async def inpaint(
        self,
        base_image_path: str,
        mask_path: str,
        prompt: str,
    ) -> bytes:
        """使用 DALL·E 2 edit 接口进行 inpainting。

        DALL·E 3 不支持 inpainting，回落至 DALL·E 2（gpt-image-1）。

        包含重试逻辑：遇到超时或 5xx 错误时自动重试，最多 3 次。

        Args:
            base_image_path: 原始场景图片的本地路径。
            mask_path: 遮罩图片的本地路径（透明=要重绘的区域）。
            prompt: 描述要生成的内容。

        Returns:
            bytes: inpainting 后图片的原始字节数据。

        Raises:
            RuntimeError: 全部重试失败时抛出。
        """
        import logging
        logger = logging.getLogger(__name__)

        max_retries = 2
        last_error: Exception | None = None

        for attempt in range(max_retries + 1):
            try:
                client = self._get_client()
                response = await client.images.edit(
                    model="gpt-image-1",
                    image=open(base_image_path, "rb"),
                    mask=open(mask_path, "rb"),
                    prompt=prompt,
                    size="1024x1024",
                    n=1,
                )

                img_data = response.data[0]
                image_url = img_data.url
                b64_json = getattr(img_data, 'b64_json', None)

                if not image_url and not b64_json:
                    raise RuntimeError("DALL·E 2 inpaint returned no URL or b64_json")

                import httpx
                import base64

                if b64_json:
                    return base64.b64decode(b64_json)

                async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as http:
                    resp = await http.get(image_url)
                    resp.raise_for_status()
                    return resp.content

            except (InternalServerError, APITimeoutError, APIConnectionError) as e:
                last_error = e
                if attempt < max_retries:
                    wait = (attempt + 1) * 15
                    logger.warning(
                        f"[DalleProvider.inpaint] 第 {attempt + 1}/{max_retries} 次重试失败，"
                        f"{wait}s 后重试 | 错误: {e}"
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.error(
                        f"[DalleProvider.inpaint] 全部 {max_retries} 次重试均失败"
                        f" | 最后错误: {e}"
                    )

            except Exception as e:
                last_error = e
                if attempt < max_retries:
                    wait = (attempt + 1) * 10
                    logger.warning(
                        f"[DalleProvider.inpaint] 第 {attempt + 1}/{max_retries} 次重试失败"
                        f" (非超时错误), {wait}s 后重试 | 错误: {e}"
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.error(
                        f"[DalleProvider.inpaint] 全部 {max_retries} 次重试均失败"
                        f" | 最后错误: {e}"
                    )

        raise RuntimeError(
            f"DalleProvider.inpaint 全部重试失败（{max_retries} 次）"
            f" | 最后错误: {str(last_error)[:100] if last_error else '未知'}"
        )


# ==============================================================================
# Flux Provider（占位实现）
# ==============================================================================


class FluxProvider(BaseImageProvider):
    """Flux 图像生成 Provider。

    MVP 阶段：如果没有 FLUX_API_KEY，generate 返回占位图片。
    不抛出异常，优雅降级。
    """

    PLACEHOLDER_TEXT = "Flux Provider Not Configured"

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key or settings.FLUX_API_KEY or ""

    async def _try_flux_generate(self, prompt: str, size: str) -> bytes | None:
        """尝试调用 FLUX API，失败返回 None。"""
        if not self._api_key:
            return None

        try:
            import httpx

            w, h = 1024, 768
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                submit = await client.post(
                    "https://api.bfl.ml/v1/flux-pro-1.1",
                    headers={"Content-Type": "application/json", "X-Key": self._api_key},
                    json={"prompt": prompt, "width": w, "height": h, "steps": 50,
                          "prompt_upsampling": False, "safety_tolerance": 2},
                )
                if submit.status_code != 200:
                    return None
                task_id = submit.json().get("id")
                if not task_id:
                    return None

                import asyncio

                for _ in range(20):
                    await asyncio.sleep(3)
                    result = await client.get(
                        "https://api.bfl.ml/v1/get_result",
                        headers={"X-Key": self._api_key},
                        params={"id": task_id},
                    )
                    if result.status_code != 200:
                        continue
                    data = result.json()
                    if data.get("status") == "Ready":
                        img_url = data.get("result", {}).get("sample")
                        if img_url:
                            r = await client.get(img_url)
                            return r.content
                        break
        except Exception:
            pass
        return None

    def _make_placeholder(self, text: str) -> bytes:
        """用 Pillow 生成占位图片：灰色背景 + 文字。"""
        img = Image.new("RGB", (1024, 768), color=(80, 80, 80))
        draw = ImageDraw.Draw(img)
        # 居中绘制多行文字
        lines = text.split("\n")
        y = 300
        for line in lines:
            bbox = draw.textbbox((0, 0), line)
            tw = bbox[2] - bbox[0]
            draw.text(((1024 - tw) / 2, y), line, fill=(255, 255, 200))
            y += 30
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    async def generate(self, prompt: str, size: str = "1024x1024") -> bytes:
        """尝试 Flux API，失败则返回占位图 bytes（不抛异常）。"""
        raw = await self._try_flux_generate(prompt, size)
        if raw is None:
            raw = self._make_placeholder(self.PLACEHOLDER_TEXT)
        return raw

    async def inpaint(
        self,
        base_image_path: str,
        mask_path: str,
        prompt: str,
    ) -> bytes:
        """Flux 当前不支持 inpainting。返回占位图 bytes。"""
        raw = self._make_placeholder(
            f"{self.PLACEHOLDER_TEXT}\n\nInpaint not supported by Flux Provider\nPrompt: {prompt[:100]}"
        )
        return raw


# ==============================================================================
# Hunyuan Provider（占位实现）
# ==============================================================================


class HunyuanProvider(BaseImageProvider):
    """
    腾讯混元图像 API Provider。

    API 文档：https://cloud.tencent.com/document/product/1668
    需要：HUNYUAN_SECRET_ID 和 HUNYUAN_SECRET_KEY（腾讯云访问密钥）

    注意：混元图像 API 使用腾讯云 SDK，不是 OpenAI 兼容格式。
    需要安装：pip install tencentcloud-sdk-python
    """

    def __init__(self, secret_id: str | None = None, secret_key: str | None = None):
        self.secret_id  = secret_id or settings.HUNYUAN_SECRET_ID or ""
        self.secret_key = secret_key or settings.HUNYUAN_SECRET_KEY or ""
        self.region     = settings.HUNYUAN_REGION or "ap-guangzhou"
        self.output_dir = str(STATIC_DIR / "images")

        if not self.secret_id or not self.secret_key:
            import logging
            logging.getLogger(__name__).warning(
                "[HunyuanProvider] 未配置 HUNYUAN_SECRET_ID / HUNYUAN_SECRET_KEY，"
                "调用时将使用占位图"
            )

    async def generate(self, prompt: str, size: str = "1024x1024") -> bytes:
        """
        调用混元生图 API 生成图片。
        未配置密钥时返回占位图（不抛异常）。
        """
        import logging
        logger = logging.getLogger(__name__)

        if not self.secret_id or not self.secret_key:
            return self._make_placeholder(prompt, "HunyuanProvider: API Key 未配置")

        try:
            from tencentcloud.common import credential
            from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
            from tencentcloud.hunyuan.v20230901 import hunyuan_client, models

            cred = credential.Credential(self.secret_id, self.secret_key)
            client = hunyuan_client.HunyuanClient(cred, self.region)

            req = models.TextToImageLiteRequest()
            req.Prompt = prompt
            req.NegativePrompt = (
                "people, person, human, face, text, watermark, logo, "
                "cartoon, anime, painting, blur, low quality"
            )
            req.LogoAdd = 0  # 不加水印

            resp = client.TextToImageLite(req)

            # 解码 base64 图片并保存
            import base64
            image_data = base64.b64decode(resp.ResultImage)

            output_path = self._save_image_bytes(image_data)
            logger.info(f"[HunyuanProvider] 生成成功: {output_path}")
            return output_path

        except TencentCloudSDKException as e:
            logger.error(f"[HunyuanProvider] API 调用失败: {e}")
            return self._make_placeholder(prompt, f"混元API错误: {str(e)[:50]}")
        except ImportError:
            logger.error("[HunyuanProvider] tencentcloud-sdk-python 未安装")
            return self._make_placeholder(prompt, "请安装: pip install tencentcloud-sdk-python")

    async def inpaint(
        self,
        base_image_path: str,
        mask_path: str,
        prompt: str,
    ) -> bytes:
        """混元暂不支持 inpainting，返回占位图。"""
        return self._make_placeholder(prompt, "HunyuanProvider: inpainting 暂不支持")

    def _save_image_bytes(self, image_data: bytes) -> bytes:
        """将 base64 解码后的 bytes 直接返回。"""
        return image_data

    def _make_placeholder(self, prompt: str, reason: str) -> bytes:
        """生成占位图（灰色背景 + 说明文字）。"""
        from PIL import Image as PILImage, ImageDraw, ImageFont
        img = PILImage.new("RGB", (1024, 1024), color=(180, 180, 180))
        draw = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 24)
            small_font = ImageFont.truetype("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 16)
        except Exception:
            font = ImageFont.load_default()
            small_font = font
        draw.text((50, 450), "混元 Provider 占位图", fill=(80, 80, 80), font=font)
        draw.text((50, 490), reason[:60], fill=(100, 100, 100), font=small_font)
        draw.text((50, 520), f"prompt: {prompt[:80]}...", fill=(120, 120, 120), font=small_font)
        import time as _time
        os.makedirs(f"{self.output_dir}/hunyuan", exist_ok=True)
        path = f"{self.output_dir}/hunyuan/placeholder_{int(_time.time())}.png"
        img.save(path)
        # Read back as bytes for the return interface
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()


# ==============================================================================
# Seedream Provider（纯占位）
# ==============================================================================


class SeedreamProvider(BaseImageProvider):
    """Seedream 图像生成 Provider。

    纯占位实现。待 Seedream API 公开后实现。
    """

    PLACEHOLDER_TEXT = "Seedream Provider — Not Yet Implemented"

    def _make_placeholder(self, text: str) -> bytes:
        img = Image.new("RGB", (1024, 768), color=(60, 60, 60))
        draw = ImageDraw.Draw(img)
        lines = text.split("\n")
        y = 300
        for line in lines:
            bbox = draw.textbbox((0, 0), line)
            tw = bbox[2] - bbox[0]
            draw.text(((1024 - tw) / 2, y), line, fill=(200, 200, 200))
            y += 30
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    async def generate(self, prompt: str, size: str = "1024x1024") -> bytes:
        """占位实现 — 待 Seedream API 公开。"""
        return self._make_placeholder(self.PLACEHOLDER_TEXT)

    async def inpaint(
        self,
        base_image_path: str,
        mask_path: str,
        prompt: str,
    ) -> bytes:
        """占位实现 — 待 Seedream API 公开。"""
        return self._make_placeholder(
            f"{self.PLACEHOLDER_TEXT}\n\nInpaint not yet implemented\nPrompt: {prompt[:100]}"
        )


# ==============================================================================
# Agnes Provider (OpenAI-compatible)
# ==============================================================================


class AgnesProvider(BaseImageProvider):
    """Agnes Image 2.1 Flash 图像生成 Provider。

    通过 OpenAI 兼容接口调用 Agnes API。
    需要：AGNES_API_KEY（环境变量）
    """

    _base_url: str = "https://apihub.agnes-ai.com/v1"
    _model: str = "agnes-image-2.1-flash"

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key or settings.AGNES_API_KEY or ""

    def _get_client(self) -> AsyncOpenAI:
        """延迟初始化客户端，指向 Agnes API 地址。"""
        if not self._api_key:
            raise RuntimeError(
                "AGNES_API_KEY not set. Please configure it in .env or pass api_key."
            )
        return AsyncOpenAI(
            api_key=self._api_key,
            base_url=self._base_url,
            timeout=httpx.Timeout(180.0, connect=10.0),
            max_retries=1,
        )

    async def generate(self, prompt: str, size: str = "1024x1024") -> bytes:
        """使用 Agnes Image 2.1 Flash 生成图片。

        包含重试逻辑：遇到 Cloudflare 524 超时或 5xx 错误时自动重试，
        最多重试 3 次，重试间隔递增。全部失败时返回占位图，不抛异常。
        """
        import base64
        import logging
        logger = logging.getLogger(__name__)

        max_retries = 3
        last_error: Exception | None = None

        for attempt in range(max_retries + 1):
            try:
                client = self._get_client()
                response = await client.images.generate(
                    model=self._model,
                    prompt=prompt,
                    size=size,
                    n=1,
                )

                img_data = response.data[0]
                image_url = img_data.url
                b64_json = getattr(img_data, 'b64_json', None)

                if not image_url and not b64_json:
                    raise RuntimeError("Image generation returned no URL or b64_json")

                if b64_json:
                    return base64.b64decode(b64_json)

                # 下载生成的图片（带超时）
                async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as http:
                    resp = await http.get(image_url)
                    resp.raise_for_status()
                    return resp.content

            except (InternalServerError, APITimeoutError, APIConnectionError) as e:
                last_error = e
                if attempt < max_retries:
                    wait = (attempt + 1) * 30
                    logger.warning(
                        f"[AgnesProvider] 第 {attempt + 1}/{max_retries} 次重试失败，"
                        f"{wait}s 后重试 | 错误: {e}"
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.error(
                        f"[AgnesProvider] 全部 {max_retries} 次重试均失败，"
                        f"使用占位图 | 最后错误: {e}"
                    )

            except httpx.HTTPStatusError as e:
                last_error = e
                if attempt < max_retries:
                    wait = (attempt + 1) * 30
                    logger.warning(
                        f"[AgnesProvider] 下载图片失败 (HTTP {e.response.status_code})，"
                        f"第 {attempt + 1}/{max_retries} 次重试，{wait}s 后重试"
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.error(
                        f"[AgnesProvider] 下载图片全部重试失败，使用占位图 | 最后错误: {e}"
                    )

        # 全部重试失败 → 返回占位图
        return self._make_placeholder(
            prompt,
            f"AgnesProvider 生成失败（已重试 {max_retries} 次）\n"
            f"最后错误: {str(last_error)[:100] if last_error else '未知'}"
        )

    def _make_placeholder(self, prompt: str, reason: str | None = None) -> bytes:
        """生成占位图 — 当 API 调用彻底失败时使用。"""
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"[AgnesProvider] 使用占位图 | 原因: {reason[:80] if reason else ''}")

        img = Image.new("RGB", (1024, 1024), color=(60, 60, 60))
        draw = ImageDraw.Draw(img)
        lines = [
            "Agnes Image 2.1 Flash Generation Failed",
            "",
            (reason or "Unknown error")[:100],
            "",
            f"Prompt: {prompt[:120]}...",
            "",
            "请检查 AGNES_API_KEY 配置或稍后重试",
        ]
        y = 350
        for line in lines:
            bbox = draw.textbbox((0, 0), line)
            tw = bbox[2] - bbox[0]
            draw.text(((1024 - tw) / 2, y), line, fill=(255, 255, 200))
            y += 28
        buf = io.BytesIO()
        img.save(buf, format="PNG", pnginfo=DalleProvider._make_pnginfo("Agnes", reason or "Unknown"))
        return buf.getvalue()

    async def inpaint(
        self,
        base_image_path: str,
        mask_path: str,
        prompt: str,
    ) -> bytes:
        """Agnes 暂不支持 inpainting，返回占位图。"""
        return self._make_placeholder(
            prompt,
            f"AgnesProvider: inpainting 暂不支持\nPrompt: {prompt[:100]}"
        )


# ==============================================================================
# ZenMux GPT-Image-2 Provider (OpenAI-compatible)
# ==============================================================================


class ZenMuxProvider(BaseImageProvider):
    """ZenMux.ai GPT-Image-2 图像生成 Provider。

    通过 OpenAI 兼容接口调用 ZenMux API，支持 GPT-Image-2 模型。
    需要：ZENMUX_API_KEY（通过 api_key 参数传入或环境变量）
    """

    _base_url: str = "https://zenmux.ai/api/v1"
    _model: str = "gpt-image-2"

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key or ""

    def _make_placeholder(self, prompt: str, reason: str) -> bytes:
        """生成占位图 — 当 API 调用彻底失败时使用。"""
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"[ZenMuxProvider] 使用占位图 | 原因: {reason[:80]}")

        img = Image.new("RGB", (1024, 1024), color=(60, 60, 60))
        draw = ImageDraw.Draw(img)
        lines = [
            "ZenMux GPT-Image-2 Generation Failed",
            "",
            reason[:100],
            "",
            f"Prompt: {prompt[:120]}...",
            "",
            "请检查 API Key 配置或稍后重试",
        ]
        y = 350
        for line in lines:
            bbox = draw.textbbox((0, 0), line)
            tw = bbox[2] - bbox[0]
            draw.text(((1024 - tw) / 2, y), line, fill=(255, 255, 200))
            y += 28
        buf = io.BytesIO()
        img.save(buf, format="PNG", pnginfo=DalleProvider._make_pnginfo("ZenMux", reason))
        return buf.getvalue()

    def _get_client(self) -> AsyncOpenAI:
        """延迟初始化客户端，指向 ZenMux API 地址。"""
        if not self._api_key:
            raise RuntimeError(
                "ZENMUX_API_KEY not set. Please configure it in api_keys or .env."
            )
        return AsyncOpenAI(
            api_key=self._api_key,
            base_url=self._base_url,
            timeout=httpx.Timeout(180.0, connect=10.0),
            max_retries=2,
        )

    async def generate(self, prompt: str, size: str = "1024x1024") -> bytes:
        """使用 ZenMux GPT-Image-2 生成图片。

        GPT-Image-2 是 OpenAI 最新一代图像生成模型，
        写实度和理解力都非常出色。
        包含重试逻辑，最多重试 2 次，全部失败时返回占位图。
        """
        import base64
        import logging
        logger = logging.getLogger(__name__)

        max_retries = 2
        last_error: Exception | None = None

        # ZenMux/GPT-Image-2 支持的尺寸映射
        size_mapping = {
            "1024x1024": "1024x1024",
            "1024x1792": "1024x1792",
            "1792x1024": "1792x1024",
        }
        api_size = size_mapping.get(size, "1024x1024")

        for attempt in range(max_retries + 1):
            try:
                client = self._get_client()
                response = await client.images.generate(
                    model=self._model,
                    prompt=prompt,
                    size=api_size,
                    n=1,
                )

                img_data = response.data[0]
                image_url = img_data.url
                b64_json = getattr(img_data, 'b64_json', None)

                if not image_url and not b64_json:
                    raise RuntimeError("Image generation returned no URL or b64_json")

                if b64_json:
                    return base64.b64decode(b64_json)

                # 下载生成的图片（带超时）
                async with httpx.AsyncClient(timeout=60.0) as http_client:
                    resp = await http_client.get(image_url)
                    resp.raise_for_status()
                    return resp.content

            except Exception as e:
                last_error = e
                logger.warning(f"[ZenMuxProvider] 第 {attempt + 1}/{max_retries + 1} 次尝试失败: {type(e).__name__}: {str(e)[:80]}")
                if attempt < max_retries:
                    import asyncio
                    await asyncio.sleep(2 * (attempt + 1))  # 递增等待

        logger.error(f"[ZenMuxProvider] 全部 {max_retries + 1} 次尝试均失败 | 最后错误: {type(last_error).__name__}: {str(last_error)[:100]}")
        return self._make_placeholder(
            prompt,
            f"ZenMux GPT-Image-2 生成失败（已重试 {max_retries} 次）\n最后错误: {type(last_error).__name__}"
        )

    async def inpaint(
        self,
        base_image_path: str,
        mask_path: str,
        prompt: str,
    ) -> bytes:
        """ZenMux GPT-Image-2 支持局部重绘（编辑功能）。

        使用 OpenAI 的 images.edit 接口实现局部修改。
        """
        import base64
        import logging
        logger = logging.getLogger(__name__)

        try:
            client = self._get_client()

            # 读取并编码图片
            with open(base_image_path, "rb") as f:
                base64_image = base64.b64encode(f.read()).decode()

            with open(mask_path, "rb") as f:
                mask_image = base64.b64encode(f.read()).decode()

            response = await client.images.edit(
                model=self._model,
                image=base64_image,
                mask=mask_image,
                prompt=prompt,
                n=1,
            )

            img_data = response.data[0]
            image_url = img_data.url

            if image_url:
                async with httpx.AsyncClient(timeout=60.0) as http_client:
                    resp = await http_client.get(image_url)
                    resp.raise_for_status()
                    return resp.content

        except Exception as e:
            logger.warning(f"[ZenMuxProvider] inpaint 失败: {type(e).__name__}: {str(e)[:80]}")

        return self._make_placeholder(
            prompt,
            f"ZenMuxProvider: inpaint 暂不可用\nPrompt: {prompt[:100]}"
        )



# ==============================================================================
# Image Router 主类
# ==============================================================================


class ImageRouter:
    """统一图像生成路由。

    支持按图片类型分别配置不同的 Provider，例如：
        router = ImageRouter({"scene_overview": "dalle", "evidence_closeup": "crop"})

    支持动态传入 API Key，覆盖环境变量配置。
    """

    def __init__(self, provider_config: dict | None = None, api_keys: dict | None = None):
        """初始化 Router。

        Args:
            provider_config: 按图片类型指定的 Provider 配置字典。
                            不传时使用 DEFAULT_PROVIDER_CONFIG。
            api_keys: 各 Provider 的 API Key 字典，格式：
                      {"dalle": "...", "openai": "...", "flux": "...",
                       "hunyuan_secret_id": "...", "hunyuan_secret_key": "...", "agnes": "..."}
        """
        self.config = dict(provider_config or DEFAULT_PROVIDER_CONFIG)
        self._api_keys = dict(api_keys or {})
        # 懒加载：Provider 实例在首次调用 _get_provider 时初始化
        self._instances: dict[str, BaseImageProvider | None] = {}

    def _get_provider(self, provider_name: str) -> BaseImageProvider:
        """获取或初始化指定 Provider 实例。

        Args:
            provider_name: Provider 名称（"dalle", "flux", "hunyuan", "seedream", "agnes", "zenmux"）。

        Returns:
            BaseImageProvider 实例。

        Raises:
            ValueError: 未知的 Provider 名称。
        """
        if provider_name in ("crop", "pillow"):
            raise ValueError(
                f"Provider '{provider_name}' 不是 AI Provider，"
                f"不应通过 _get_provider 调用。请使用专门的裁剪/渲染方法。"
            )

        if provider_name not in self._instances:
            provider_map = {
                "dalle":    DalleProvider,
                "flux":     FluxProvider,
                "hunyuan":  HunyuanProvider,
                "seedream": SeedreamProvider,
                "agnes":    AgnesProvider,
                "zenmux":   ZenMuxProvider,
            }
            cls = provider_map.get(provider_name.lower())
            if cls is None:
                raise ValueError(
                    f"未知的 Provider: '{provider_name}'，"
                    f"可选值: {list(provider_map.keys())}"
                )
            
            api_key = self._api_keys.get(provider_name.lower())
            if provider_name.lower() == "hunyuan":
                self._instances[provider_name] = cls(
                    secret_id=self._api_keys.get("hunyuan_secret_id"),
                    secret_key=self._api_keys.get("hunyuan_secret_key"),
                )
            elif provider_name.lower() == "agnes":
                api_key = api_key or self._api_keys.get("agnes_image")
                self._instances[provider_name] = cls(api_key=api_key)
            elif provider_name.lower() == "zenmux":
                api_key = api_key or self._api_keys.get("zenmux_api_key")
                self._instances[provider_name] = cls(api_key=api_key)
            else:
                self._instances[provider_name] = cls(api_key=api_key)

        return self._instances[provider_name]

    def get_scene_provider_name(self) -> str:
        """当前场景全图的 Provider 名称。"""
        return self.config.get("scene_overview", "dalle")

    def get_closeup_provider_name(self) -> str:
        """当前物证特写的 Provider 名称。"""
        return self.config.get("evidence_closeup", "crop")

    def _case_dirs(self, case_id: int) -> dict[str, Path]:
        """为 case_id 构建完整的目录结构并返回各子目录。"""
        base = _ensure_dir(IMAGES_DIR / str(case_id))
        dirs = {
            "scenes": _ensure_dir(base / "scenes"),
            "evidence": _ensure_dir(base / "evidence"),
            "documents": _ensure_dir(base / "documents"),
        }
        return dirs

    def _save_image(self, dir_path: Path, prefix: str, raw_bytes: bytes) -> str:
        """将图片 bytes 写入目录，返回绝对路径字符串。"""
        ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        uid = uuid.uuid4().hex[:8]
        # Sanitize prefix: keep only ASCII alphanumeric and underscore
        safe_prefix = "".join(c for c in prefix if c.isascii() and (c.isalnum() or c == "_"))[:50]
        filename = f"{safe_prefix}_{ts}_{uid}.png"
        filepath = dir_path / filename
        filepath.write_bytes(raw_bytes)
        return str(filepath)

    async def generate_base_scene(
        self,
        scene: SceneState,
        case_id: int,
        case_style: str | None = None,
    ) -> str:
        """生成空白场景图（无物证）。

        使用 scene_to_image_prompt() 构建 prompt，调用 scene_overview Provider。

        Args:
            scene: 来自 Scene State Engine 的场景状态。
            case_id: 案件 ID，用于确定存储路径。
            case_style: 可选的 case 级别环境/装修风格描述。

        Returns:
            str: 生成图片的本地绝对路径。
        """
        provider_name = self.config.get("scene_overview", "dalle")
        provider = self._get_provider(provider_name)
        prompt = scene_to_image_prompt(scene, case_style=case_style)
        raw_bytes = await provider.generate(prompt, size="1024x1024")

        dirs = self._case_dirs(case_id)
        return self._save_image(dirs["scenes"], f"scene_{scene.scene_id}", raw_bytes)

    async def generate_scene_with_objects(
        self,
        scene: SceneState,
        case_id: int,
        case_style: str | None = None,
    ) -> tuple[str, list[str]]:
        """
        一次 API 调用生成包含所有物证的完整场景图。
        使用 scene_overview Provider。

        返回：
        - image_path: str — 生成图片的本地路径
        - omitted_items: list[str] — 因 prompt 长度超限被省略的物品（用于前端提示）
        """
        provider_name = self.config.get("scene_overview", "dalle")
        provider = self._get_provider(provider_name)

        prompt, omitted_items = scene_objects_to_rich_prompt(scene, case_style=case_style)

        # 记录使用的 prompt（用于审计）
        import logging
        logger = logging.getLogger(__name__)
        logger.info(
            f"[image_router] 生成场景图 | provider: {provider_name} | "
            f"场景: {scene.scene_name} | 物品数: {len(scene.objects)} | prompt长度: {len(prompt)}"
        )

        raw_bytes = await provider.generate(prompt, size="1024x1024")
        dirs = self._case_dirs(case_id)
        image_path = self._save_image(dirs["scenes"], f"scene_{scene.scene_id}", raw_bytes)
        return image_path, omitted_items

    async def insert_object(
        self,
        scene_image_path: str,
        obj: SceneObject,
        case_id: int,
        mask_generator=None,
    ) -> str:
        """
        [DEPRECATED] 逐物品 inpainting 方法，已被 generate_scene_with_objects() 替代。
        保留此方法用于向后兼容，不建议在新代码中使用。

        在场景图中插入单个物证（inpainting）。

        Args:
            scene_image_path: 场景图的本地路径。
            obj: 要插入的 SceneObject。
            case_id: 案件 ID。
            mask_generator: 可选的 Pillow mask 生成器（callable）。
                           若为 None，使用默认的椭圆 mask。

        Returns:
            str: inpainting 后图片的本地绝对路径。
        """
        from app.services.scene_engine import object_to_inpaint_prompt

        provider = self._get_provider(self.config.get("scene_overview", "dalle"))
        dirs = self._case_dirs(case_id)

        # DALL·E edit API requires square PNG — resize scene image to 1024x1024
        scene_img = Image.open(scene_image_path)
        if scene_img.size != (1024, 1024):
            scene_img = scene_img.resize((1024, 1024), Image.LANCZOS)
            sq_path = dirs["scenes"] / f"_sq_{uuid.uuid4().hex[:6]}.png"
            scene_img.save(sq_path, format="PNG")
            scene_image_path = str(sq_path)

        # 生成或加载 mask
        if mask_generator is not None:
            mask_path = mask_generator(scene_image_path, obj)
        else:
            mask_path = self._make_default_mask(dirs["scenes"])

        prompt = object_to_inpaint_prompt(obj)
        raw_bytes = await provider.inpaint(scene_image_path, mask_path, prompt)

        return self._save_image(dirs["scenes"], f"inpaint_{obj.id}", raw_bytes)

    def _make_default_mask(self, dir_path: Path) -> str:
        """生成默认椭圆 mask 图片（RGBA，透明区域=需要重绘）。

        DALL·E API 要求 mask 必须是 RGBA 格式，透明区域表示要 inpainting 的部分。
        """
        # RGBA: 透明(alpha=0) = inpainting 区域, 不透明(alpha=255) = 保留区域
        img = Image.new("RGBA", (1024, 1024), color=(0, 0, 0, 255))
        draw = ImageDraw.Draw(img)
        # 中心 256x256 椭圆 — 设 alpha=0 表示要重绘
        cx, cy = 512, 512
        draw.ellipse(
            [cx - 128, cy - 128, cx + 128, cy + 128],
            fill=(0, 0, 0, 0),  # 透明 = 要 inpainting
        )
        filepath = dir_path / "_default_mask.png"
        img.save(filepath, format="PNG")
        return str(filepath)

    async def generate_evidence_closeup(
        self,
        obj: SceneObject,
        case_id: int,
        scene_image_path: str | None = None,
        scene_name: str = "案发现场",
        room_type: str = "unknown",
        case_style: str | None = None,
        manual_position: dict | None = None,
        custom_details: str | None = None,
    ) -> tuple[str, str]:
        """
        生成物证特写图。

        策略选择（尊重用户配置的 evidence_closeup Provider）：
        - Provider = "crop" + 有场景全图 → 裁剪法（几何裁剪，零 API 成本）
        - Provider = "crop" + 无场景全图 → fallback 到 AI 生成
        - Provider = "dalle" + 有场景全图 → background_inpaint（背景100%来自场景图）
        - Provider = "dalle" + 无场景全图 → prompt_lock
        - Provider = "hunyuan" → prompt_lock

        内置多 Provider fallback：主 provider 失败时按顺序尝试其他可用 provider。

        Args:
            obj: 场景物品对象
            case_id: 案件 ID
            scene_image_path: 场景全图路径（用于裁剪/inpaint）
            scene_name: 场景名称
            room_type: 房间类型
            case_style: 案件风格描述
            manual_position: 手动裁剪坐标
            custom_details: 用户自定义的细节描述（如"刀刃上有明显的血迹"）

        返回：
        - closeup_image_path: 特写图路径
        - strategy_used: "crop" / "background_inpaint" / "prompt_lock"
        """
        from .closeup_generator import (
            generate_closeup_by_crop,
            generate_closeup_reference_preview,
            build_prompt_lock_closeup_prompt,
            generate_closeup_background_and_mask,
            build_inpaint_item_prompt,
        )
        import logging
        import time as _time
        logger = logging.getLogger(__name__)

        dirs = self._case_dirs(case_id)
        output_dir = dirs["evidence"]
        output_path = str(output_dir / f"closeup_{obj.id}_{int(_time.time())}.png")

        closeup_provider_name = self.config.get("evidence_closeup", "dalle")

        # ===== 策略1：裁剪法（仅当用户明确选择 crop 且有场景全图时）=====
        if closeup_provider_name == "crop":
            if scene_image_path and os.path.exists(scene_image_path):
                logger.info(f"[closeup] 使用裁剪法 | 物证: {obj.description}")

                try:
                    closeup_path = generate_closeup_by_crop(
                        scene_image_path=scene_image_path,
                        render_position=obj.render_position,
                        object_description=obj.description,
                        output_path=output_path,
                        manual_position=manual_position,
                    )

                    # 同时生成带红框的参考预览图（供前端展示）
                    preview_path = output_path.replace(".png", "_preview.png")
                    generate_closeup_reference_preview(
                        scene_image_path=scene_image_path,
                        render_position=obj.render_position,
                        object_description=obj.description,
                        output_path=preview_path,
                    )

                    return closeup_path, "crop"

                except Exception as e:
                    logger.warning(f"[closeup] 裁剪法失败，fallback 到 AI 生成: {e}")
            else:
                logger.info(
                    f"[closeup] Provider=crop 但无场景全图，fallback 到 DALL·E AI 生成"
                )
            closeup_provider_name = "dalle"

        # ===== 策略2：background_inpaint（dalle + 有场景全图时优先）=====
        if closeup_provider_name == "dalle" and scene_image_path and os.path.exists(scene_image_path):
            logger.info(f"[closeup] 尝试 background_inpaint | 物证: {obj.description}")
            try:
                # 1. 从场景全图裁剪背景 + 生成 mask
                base_path, mask_path = generate_closeup_background_and_mask(
                    scene_image_path=scene_image_path,
                    render_position=obj.render_position,
                    object_description=obj.description,
                    output_dir=str(output_dir),
                )

                # 2. 构建纯物证 prompt（不含环境描述，含用户自定义细节）
                item_prompt = build_inpaint_item_prompt(
                    obj_description=obj.description,
                    obj_type=obj.object_type,
                    obj_state=obj.state,
                    custom_details=custom_details,
                )
                logger.info(f"[closeup] inpaint prompt: {item_prompt[:100]}...")

                # 3. 调用 DALL·E inpainting（带 fallback）
                dalle_provider = self._get_provider("dalle")
                raw_bytes = await dalle_provider.inpaint(base_path, mask_path, item_prompt)

                # 4. 保存特写图
                closeup_path = self._save_image(dirs["evidence"], f"closeup_{obj.id}", raw_bytes)
                logger.info(f"[closeup] background_inpaint 成功: {closeup_path}")
                return closeup_path, "background_inpaint"

            except Exception as e:
                logger.warning(
                    f"[closeup] background_inpaint 失败，回退到 prompt_lock | "
                    f"物证: {obj.description} | 错误: {e}"
                )
                # 继续执行下面的 prompt_lock

        # ===== 策略3：prompt_lock（AI 生成，含用户自定义细节）=====
        logger.info(
            f"[closeup] 使用 AI 生成 ({closeup_provider_name}) | 物证: {obj.description}"
        )

        # 构建 fallback 顺序
        fallback_order = self._build_provider_fallback_order(closeup_provider_name)
        last_error: Exception | None = None

        for idx, provider_name in enumerate(fallback_order):
            try:
                provider = self._get_provider(provider_name)

                prompt = build_prompt_lock_closeup_prompt(
                    obj_description=obj.description,
                    obj_type=obj.object_type,
                    obj_state=obj.state,
                    scene_name=scene_name,
                    room_type=room_type,
                    location_key=obj.location_key,
                    case_style=case_style,
                    custom_details=custom_details,
                )
                logger.info(
                    f"[closeup] AI 生成 prompt: {prompt[:100]}... | provider: {provider_name}"
                )

                raw_bytes = await provider.generate(prompt, size="1024x1024")

                # 检查是否返回占位图
                if self._is_placeholder_bytes(raw_bytes, provider_name):
                    logger.warning(
                        f"[closeup] provider={provider_name} 返回占位图，尝试下一个"
                    )
                    last_error = RuntimeError(f"Provider {provider_name} returned placeholder")
                    continue

                dirs = self._case_dirs(case_id)
                closeup_path = self._save_image(
                    dirs["evidence"],
                    f"closeup_{obj.id}",
                    raw_bytes,
                )
                logger.info(
                    f"[closeup] prompt_lock 成功: {closeup_path} (provider={provider_name})"
                )
                return closeup_path, "prompt_lock"

            except Exception as e:
                last_error = e
                logger.warning(
                    f"[closeup] provider={provider_name} 失败: "
                    f"{type(e).__name__}: {str(e)[:100]}"
                )
                continue

        # 所有 provider 都失败
        logger.error(f"[closeup] 所有 provider 均失败 | 最后错误: {last_error}")
        raise RuntimeError(
            f"物证特写生成失败（已尝试 {len(fallback_order)} 个 provider）。"
            f"最后错误: {str(last_error)[:150] if last_error else '未知'}"
        )

    async def generate_injury_closeup(
        self,
        case_id: int,
        evidence_id: int,
        body_part: str,
        injury_description: str,
        gender: str | None = None,
    ) -> str:
        """生成伤情特写图（AI 生成，独立伤口照片）。

        与物证特写不同，伤情特写直接通过 AI 生成逼真的受伤部位特写照片，
        不依赖场景全图裁剪。Prompt 聚焦于：
        - 特定身体部位（如"左前臂"）
        - 伤情类型和特征（擦伤、淤青、抓痕、裂伤等）
        - 医学/法医风格的写实摄影
        - 性别一致性（从描述中推断或显式传入）

        内置多 Provider fallback 机制：主 provider 失败时按顺序尝试其他可用 provider，
        避免单点故障。

        Args:
            case_id: 案件 ID
            evidence_id: 证据 ID
            body_part: 受伤部位（如"左前臂"、"颈部"、"胸部"）
            injury_description: 伤情描述（如"多处擦挫伤"、"抓挠伤痕"）
            gender: 性别（"male" / "female" / None，None 时从描述中推断）

        Returns:
            str: 生成图片的本地绝对路径
        """
        import logging
        import time as _time
        logger = logging.getLogger(__name__)

        # 从描述中推断性别（如果未显式传入）
        if gender is None:
            gender = _extract_gender_from_description(injury_description)
            if gender:
                logger.info(f"[injury_closeup] 从描述推断性别: {gender}")

        prompt = _build_injury_closeup_prompt(body_part, injury_description, gender=gender)

        # Fallback 顺序：用户配置的 provider 在前，其他可用 provider 在后
        primary_provider = self.config.get("evidence_closeup", "dalle")
        if primary_provider == "crop":
            primary_provider = "dalle"
        fallback_order = self._build_provider_fallback_order(primary_provider)
        logger.info(
            f"[injury_closeup] body_part={body_part} | gender={gender} | "
            f"desc={injury_description[:60]} | fallback_order={fallback_order}"
        )

        last_error: Exception | None = None
        for idx, provider_name in enumerate(fallback_order):
            try:
                provider = self._get_provider(provider_name)
                logger.info(
                    f"[injury_closeup] 尝试 provider: {provider_name} "
                    f"({idx + 1}/{len(fallback_order)})"
                )
                raw_bytes = await provider.generate(prompt, size="1024x1024")

                # 检查是否返回了占位图（失败标记）
                if self._is_placeholder_bytes(raw_bytes, provider_name):
                    logger.warning(
                        f"[injury_closeup] provider={provider_name} 返回占位图（生成失败），"
                        f"尝试下一个 provider"
                    )
                    last_error = RuntimeError(f"Provider {provider_name} returned placeholder image")
                    continue

                # 成功：保存并返回
                dirs = self._case_dirs(case_id)
                output_path = self._save_image(
                    dirs["evidence"],
                    f"injury_closeup_{evidence_id}",
                    raw_bytes,
                )
                logger.info(f"[injury_closeup] saved: {output_path} (provider={provider_name})")
                return output_path

            except Exception as e:
                last_error = e
                logger.warning(
                    f"[injury_closeup] provider={provider_name} 失败: "
                    f"{type(e).__name__}: {str(e)[:150]}"
                )
                continue

        # 所有 provider 都失败
        logger.error(f"[injury_closeup] 所有 provider 均失败 | 最后错误: {last_error}")
        raise RuntimeError(
            f"伤情特写生成失败（已尝试 {len(fallback_order)} 个 provider）。"
            f"可能原因：API 内容安全过滤、配额不足或网络问题。"
            f"最后错误: {str(last_error)[:150] if last_error else '未知'}"
        )

    def _build_provider_fallback_order(self, primary: str) -> list[str]:
        """构建 provider 尝试顺序，主 provider 在前，其他可用 provider 紧随其后。"""
        # 候选列表（按优先级）
        all_providers = ["dalle", "zenmux", "agnes", "flux", "hunyuan"]
        # 移除 "crop"（伤情特写不能用）
        order = [p for p in all_providers if p != primary]
        return [primary] + order

    def _is_placeholder_bytes(self, raw_bytes: bytes, provider_name: str) -> bool:
        """通过 PNG 文本块（tEXt）检测占位图。

        失败时 DalleProvider / ZenMuxProvider / AgnesProvider 会返回包含
        "Generation Failed" 文字的灰底图。我们利用 Pillow 的 PNG 文本元数据
        标记占位图，避免依赖图像识别。
        """
        try:
            import io
            from PIL import Image
            img = Image.open(io.BytesIO(raw_bytes))
            # 检查 PNG info 中的占位标记
            placeholder_marker = img.info.get("placeholder") or img.info.get("placeholder_reason")
            if placeholder_marker:
                return True
            # Fallback: 简单灰度检测（占位图是纯灰色）
            if img.mode == "RGB":
                extrema = img.getextrema()
                if extrema:
                    r_range = extrema[0]
                    g_range = extrema[1]
                    b_range = extrema[2]
                    # 占位图：RGB 通道范围都很窄（< 50）
                    if all(rng[1] - rng[0] < 50 for rng in (r_range, g_range, b_range)):
                        return True
        except Exception:
            pass
        return False

    def switch_provider(self, new_provider: str):
        """动态切换场景全图 Provider（向后兼容旧接口）。

        Args:
            new_provider: 新 Provider 名称，可选 "dalle", "flux", "seedream"。
        """
        self.config["scene_overview"] = new_provider.lower()

    @property
    def current_provider(self) -> str:
        """当前场景全图 Provider 名称（向后兼容旧接口）。"""
        return self.config.get("scene_overview", "dalle")


# ==============================================================================
# 模块级便捷函数（保持向后兼容）
# ==============================================================================

async def generate_scene_image(
    scene: SceneState,
    case_id: int,
    provider: str = "dalle",
    style: str = "realistic",
) -> dict:
    """一站式函数：生成场景图并返回结果字典。

    Args:
        scene: 场景状态。
        case_id: 案件 ID。
        provider: Provider 名称。
        style: 风格（保留参数，当前未使用）。

    Returns:
        dict: image_path, prompt_used, provider, style, image_type。
    """
    router = ImageRouter({"scene_overview": provider})
    prompt = scene_to_image_prompt(scene)
    path = await router.generate_base_scene(scene, case_id)
    return {
        "image_path": path,
        "prompt_used": prompt,
        "provider": provider,
        "style": style,
        "image_type": "scene_overview",
    }


# ==============================================================================
# 测试用例
# ==============================================================================

if __name__ == "__main__":
    import asyncio
    from app.services.evidence_filter import EvidenceItem
    from app.services.scene_engine import build_scene_from_evidence

    async def main():
        print("=" * 60)
        print("Image Router — 测试用例")
        print("=" * 60)

        # 构建测试场景
        evs = [
            EvidenceItem(
                evidence_type="物证",
                description="带血水果刀",
                location="under_bed_left",
                state={"bloody": True},
                source_quote="床下发现带血水果刀",
            ),
        ]
        scene = build_scene_from_evidence(evs, scene_name="卧室")
        print(f"场景: {scene.scene_name} | 房间类型: {scene.base_room_type}")
        print(f"物品数: {len(scene.objects)}")
        print()

        # 测试各 Provider 初始化
        for name in ["dalle", "flux", "hunyuan", "seedream"]:
            router = ImageRouter({"scene_overview": name})
            prov = router._get_provider(name)
            print(f"Provider [{name}]: {type(prov).__name__}")
        print()

        # 测试目录创建
        dirs = ImageRouter()._case_dirs(999)
        for name, path in dirs.items():
            exists = "✓" if path.exists() else "✗"
            print(f"  {name}: {path} {exists}")
        print()

        # 测试 switch_provider / current_provider（向后兼容）
        router = ImageRouter()
        print(f"初始 provider: {router.current_provider}")
        router.switch_provider("flux")
        print(f"切换后 provider: {router.current_provider}")
        router.switch_provider("seedream")
        print(f"切换后 provider: {router.current_provider}")
        print()

        # 测试分类配置
        router2 = ImageRouter({"scene_overview": "dalle", "evidence_closeup": "crop"})
        print(f"场景图 provider: {router2.get_scene_provider_name()}")
        print(f"特写 provider:   {router2.get_closeup_provider_name()}")
        print()

        print("=" * 60)
        print("Provider 状态总览:")
        print(f"  DalleProvider:     已实现 (DALL·E 3 generate, DALL·E 2 inpaint)")
        print(f"  FluxProvider:      占位实现 (有 Key 则调用 API，无 Key 用 Pillow 占位图)")
        print(f"  HunyuanProvider:   占位实现 (待接入腾讯混元 API)")
        print(f"  SeedreamProvider:  纯占位 (待 Seedream API 公开)")
        print("=" * 60)

    asyncio.run(main())
