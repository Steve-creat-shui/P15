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
        """
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"[DalleProvider] 使用占位图 | 原因: {reason[:80]}")

        img = Image.new("RGB", (1024, 1024), color=(60, 60, 60))
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
        img.save(buf, format="PNG")
        return buf.getvalue()

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

    def __init__(self):
        self.secret_id  = settings.HUNYUAN_SECRET_ID or ""
        self.secret_key = settings.HUNYUAN_SECRET_KEY or ""
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
# Image Router 主类
# ==============================================================================


class ImageRouter:
    """统一图像生成路由。

    支持按图片类型分别配置不同的 Provider，例如：
        router = ImageRouter({"scene_overview": "dalle", "evidence_closeup": "crop"})
    """

    def __init__(self, provider_config: dict | None = None):
        """初始化 Router。

        Args:
            provider_config: 按图片类型指定的 Provider 配置字典。
                            不传时使用 DEFAULT_PROVIDER_CONFIG。
        """
        self.config = dict(provider_config or DEFAULT_PROVIDER_CONFIG)
        # 懒加载：Provider 实例在首次调用 _get_provider 时初始化
        self._instances: dict[str, BaseImageProvider | None] = {}

    def _get_provider(self, provider_name: str) -> BaseImageProvider:
        """获取或初始化指定 Provider 实例。

        Args:
            provider_name: Provider 名称（"dalle", "flux", "hunyuan", "seedream"）。

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
            }
            cls = provider_map.get(provider_name.lower())
            if cls is None:
                raise ValueError(
                    f"未知的 Provider: '{provider_name}'，"
                    f"可选值: {list(provider_map.keys())}"
                )
            self._instances[provider_name] = cls()

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
        scene_image_path: str | None = None,  # 场景全图路径（仅当 Provider=crop 时使用）
        scene_name: str = "案发现场",
        room_type: str = "unknown",
        case_style: str | None = None,  # case 级别风格描述，用于跨场景统一
    ) -> tuple[str, str]:
        """
        生成物证特写图。

        策略选择（尊重用户配置的 evidence_closeup Provider）：
        - Provider = "crop" + 有场景全图 → 裁剪法（几何裁剪，零 API 成本）
        - Provider = "crop" + 无场景全图 → fallback 到 AI 生成
        - Provider = "dalle" + 有场景全图 → background_inpaint（背景100%来自场景图）
        - Provider = "dalle" + 无场景全图 → prompt_lock
        - Provider = "hunyuan" → prompt_lock

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
                    # 裁剪失败时 fallback 到 AI 生成
            else:
                logger.info(
                    f"[closeup] Provider=crop 但无场景全图，fallback 到 DALL·E AI 生成"
                )
            # crop 不可用时 fallback 到 dalle
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

                # 2. 构建纯物证 prompt（不含环境描述）
                item_prompt = build_inpaint_item_prompt(
                    obj_description=obj.description,
                    obj_type=obj.object_type,
                    obj_state=obj.state,
                )
                logger.info(f"[closeup] inpaint prompt: {item_prompt[:100]}...")

                # 3. 调用 DALL·E inpainting
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
        logger.info(
            f"[closeup] 使用 AI 生成 ({closeup_provider_name}) | 物证: {obj.description}"
        )

        provider = self._get_provider(closeup_provider_name)

        prompt = build_prompt_lock_closeup_prompt(
            obj_description=obj.description,
            obj_type=obj.object_type,
            obj_state=obj.state,
            scene_name=scene_name,
            room_type=room_type,
            location_key=obj.location_key,
            case_style=case_style,
        )

        logger.info(f"[closeup] AI 生成 prompt: {prompt[:100]}...")

        raw_bytes = await provider.generate(prompt, size="1024x1024")
        dirs = self._case_dirs(case_id)
        closeup_path = self._save_image(dirs["evidence"], f"closeup_{obj.id}", raw_bytes)

        return closeup_path, "prompt_lock"

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
