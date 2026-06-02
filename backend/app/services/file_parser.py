"""File Parser — 从 PDF / DOCX / TXT 文件中提取纯文本。

使用 pypdf 解析 PDF，stdlib zipfile + xml 解析 DOCX。
不依赖 heavy NLP 库，提取的文本直接送入 Evidence Filtering Engine。
"""

from __future__ import annotations

import io
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import BinaryIO


class FileParser:
    """多格式文件文本提取器。

    Usage:
        text = FileParser.parse(uploaded_bytes, filename="判决书.pdf")
    """

    @staticmethod
    def parse(content: bytes, filename: str = "") -> str:
        """根据文件扩展名自动选择解析方法。

        Args:
            content: 文件的原始字节内容。
            filename: 原始文件名（用于判断扩展名）。

        Returns:
            str: 提取的纯文本。

        Raises:
            ValueError: 不支持的文件格式。
        """
        ext = Path(filename).suffix.lower() if filename else ""

        if ext == ".txt":
            return FileParser._parse_txt(content)
        elif ext == ".pdf":
            return FileParser._parse_pdf(content)
        elif ext in (".docx", ".doc"):
            return FileParser._parse_docx(content)
        else:
            raise ValueError(
                f"不支持的文件格式: {ext or '未知'}。"
                f"请上传 .txt / .pdf / .docx 文件。"
            )

    @staticmethod
    def _parse_txt(content: bytes) -> str:
        """从 TXT 文件读取文本，自动检测编码。"""
        # 尝试 UTF-8，失败则回退到 GBK（中文 Windows 常用）
        for encoding in ("utf-8", "gbk", "gb2312", "latin-1"):
            try:
                return content.decode(encoding).strip()
            except (UnicodeDecodeError, LookupError):
                continue
        # 最终 fallback：替换无法解码的字符
        return content.decode("utf-8", errors="replace").strip()

    @staticmethod
    def _parse_pdf(content: bytes) -> str:
        """使用 pypdf 从 PDF 中提取文本。"""
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(content))
        pages: list[str] = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text.strip())

        result = "\n\n".join(pages).strip()
        if not result:
            raise ValueError(
                "PDF 文件中未提取到文本。该 PDF 可能是扫描图片版，"
                "请用 OCR 工具提取文本后粘贴到文本框中。"
            )
        return result

    @staticmethod
    def _parse_docx(content: bytes) -> str:
        """从 DOCX 文件中提取文本。

        DOCX 本质是 ZIP 压缩包，文本内容在 word/document.xml 中。
        使用 stdlib zipfile + xml.etree 解析，无需第三方依赖。
        """
        # DOCX namespaces
        NS = {
            "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        }

        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                # 列出所有文件用于调试
                names = zf.namelist()

                if "word/document.xml" not in names:
                    raise ValueError(
                        "无效的 DOCX 文件：缺少 word/document.xml。"
                    )

                xml_content = zf.read("word/document.xml")

            root = ET.fromstring(xml_content)

            # 提取所有 <w:t> 标签中的文本
            paragraphs: list[str] = []
            for para in root.iter(f"{{{NS['w']}}}p"):
                texts: list[str] = []
                for t_node in para.iter(f"{{{NS['w']}}}t"):
                    if t_node.text:
                        texts.append(t_node.text)
                line = "".join(texts).strip()
                if line:
                    paragraphs.append(line)

            result = "\n".join(paragraphs).strip()
            if not result:
                raise ValueError(
                    "DOCX 文件中未提取到文本。文件可能为空或格式异常。"
                )
            return result

        except zipfile.BadZipFile:
            raise ValueError("文件不是有效的 DOCX/ZIP 格式。")
        except ET.ParseError as e:
            raise ValueError(f"DOCX 文件 XML 解析失败: {e}")


# ==============================================================================
# 测试用例
# ==============================================================================

if __name__ == "__main__":
    import tempfile

    print("=" * 60)
    print("File Parser — 测试用例")
    print("=" * 60)

    # --- 测试 TXT ---
    txt_bytes = "这是一份判决书全文。\n被告张三故意伤害案。".encode("utf-8")
    txt_result = FileParser.parse(txt_bytes, "test.txt")
    print(f"\n[TXT] {len(txt_result)} chars: {txt_result[:60]}...")

    # --- 测试 DOCX（手动构造最简 docx）---
    minimal_docx_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>"
        "<w:p><w:r><w:t>被告张三故意伤害案判决书</w:t></w:r></w:p>"
        "<w:p><w:r><w:t>案发当日，被告从床底取出水果刀。</w:t></w:r></w:p>"
        "</w:body>"
        "</w:document>"
    )
    # 创建最小 DOCX (ZIP)
    docx_buf = io.BytesIO()
    with zipfile.ZipFile(docx_buf, "w") as zf:
        zf.writestr("word/document.xml", minimal_docx_xml)
        zf.writestr("[Content_Types].xml", (
            '<?xml version="1.0"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="xml" ContentType="application/xml"/>'
            "</Types>"
        ))
    docx_bytes = docx_buf.getvalue()
    docx_result = FileParser.parse(docx_bytes, "判决书.docx")
    print(f"[DOCX] {len(docx_result)} chars:\n{docx_result}")

    print("\n" + "=" * 60)
    print("File Parser 测试完成")
    print("=" * 60)
