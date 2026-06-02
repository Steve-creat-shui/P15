# JEVS — Judicial Evidence Visualization System

> 教学用证据可视化生成系统 | Judicial Evidence Visualization System for Education

## 项目简介

JEVS 是一个面向法学教育的智能证据可视化生成系统。系统接收非结构化的判决书、起诉书或卷宗材料，通过 LLM 驱动的证据过滤引擎抽取核心证据链，再经由场景状态引擎推演出三维空间现场布局，最终由图像路由和文档渲染模块生成可用于课堂教学的可视化现场还原图与结构化分析报告。

### 核心技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | FastAPI (Python 3.10+) |
| 前端框架 | React + TypeScript + Vite |
| 数据库 | PostgreSQL (via SQLModel) |
| LLM 编排 | Instructor + OpenAI/DeepSeek |
| 图像生成 | FLUX (via API) |
| 文档解析 | Unstructured |
| 图像处理 | Pillow |
| 容器化 | Docker Compose + Traefik |

---

## 启动方式

### 开发环境（Docker Compose）

```bash
# 1. 进入项目目录
cd full-stack-fastapi-template

# 2. 复制并编辑环境变量
cp .env .env.local
# 编辑 .env，填入 API Keys

# 3. 启动全部服务（PostgreSQL + Backend + Frontend + Traefik）
docker compose up -d

# 4. 查看日志
docker compose logs -f
```

### 仅启动后端（本地开发）

```bash
cd backend

# 使用 uv 管理依赖
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 仅启动前端（本地开发）

```bash
cd frontend
bun install
bun run dev
```

访问地址：
- 前端：`http://localhost:5173`
- 后端 API 文档（Swagger）：`http://localhost:8000/api/v1/docs`
- Traefik 仪表盘：`http://localhost:8090`

---

## 环境变量说明

在项目根目录的 `.env` 文件中配置以下变量：

### 核心 AI Provider 密钥

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DEEPSEEK_API_KEY` | 否 | DeepSeek API 密钥，用于证据提取和场景推演（Provider 设置为 `deepseek` 时使用） |
| `OPENAI_API_KEY` | 否 | OpenAI API 密钥，用于证据提取和场景推演（Provider 设置为 `openai` 时使用） |
| `FLUX_API_KEY` | 否 | FLUX 图像生成 API 密钥，用于现场还原图像生成 |

> **Provider 选择逻辑**：证据提取和场景推演模块支持 `openai` 和 `deepseek` 双 Provider。在 API 调用时通过 `provider` 参数切换。系统会根据选择的 Provider 自动路由到对应的 API endpoint：
> - `openai` → `gpt-4o-mini` 模型
> - `deepseek` → `deepseek-chat` 模型（base_url: `https://api.deepseek.com`）

### 数据库

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `POSTGRES_SERVER` | 是 | PostgreSQL 服务器地址（默认 `localhost`） |
| `POSTGRES_PORT` | 是 | PostgreSQL 端口（默认 `5432`） |
| `POSTGRES_DB` | 是 | 数据库名（默认 `app`） |
| `POSTGRES_USER` | 是 | 数据库用户（默认 `postgres`） |
| `POSTGRES_PASSWORD` | 是 | 数据库密码 |

> `DATABASE_URL` 由以上五个变量自动拼接生成，格式为 `postgresql+psycopg://user:password@server:port/db`。

### 安全与部署

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `SECRET_KEY` | 是 | JWT 签名密钥，生产环境务必修改 |
| `FIRST_SUPERUSER` | 是 | 初始超级用户邮箱 |
| `FIRST_SUPERUSER_PASSWORD` | 是 | 初始超级用户密码 |
| `BACKEND_CORS_ORIGINS` | 是 | 允许的 CORS 来源（逗号分隔） |
| `ENVIRONMENT` | 是 | 运行环境：`local` / `staging` / `production` |

---

## 模块说明

### 1. Evidence Filtering Engine（证据过滤引擎）

**文件位置**：`backend/app/services/evidence_filter.py`

**功能**：
- 从非结构化的判决书、起诉书或卷宗案卷材料中抽取核心证据链条
- 对隐私信息（人名、地名、身份证号、组织机构）进行清洗和脱敏处理
- 抽取具备视觉化潜力的关键物证、书证、现场物理结构以及实体间空间关系
- 使用 Instructor 框架进行结构化输出，将非结构化文本映射为 Pydantic 数据模型

**输入**：原始文本（判决书全文）  
**输出**：`EvidenceExtractionResult`（包含标题和证据列表）  
**支持 Provider**：OpenAI (`gpt-4o-mini`)、DeepSeek (`deepseek-chat`)

### 2. Scene State Engine（场景状态引擎）

**文件位置**：`backend/app/services/scene_engine.py`

**功能**：
- 根据教师审核确认后的结构化证据条目进行全局一致性的时空推演
- 将零散的法医和物理物证信息拼凑还原为宏观一致的三维仿真场景状态
- 为每个涉案实体（人员、武器、家具、结构、痕迹）分配三维空间坐标和旋转角
- 推演光照、天气等全局教学环境参数

**输入**：场景名称 + 已审核通过的证据列表  
**输出**：`SceneStateSnapshot`（包含物体坐标、全局环境参数、推演依据）  
**支持 Provider**：OpenAI (`gpt-4o-mini`)、DeepSeek (`deepseek-chat`)

### 3. Image Router（图像路由）

**文件位置**：`backend/app/services/image_router.py`

**功能**（待实现）：
- 根据场景状态快照生成图像生成提示词
- 路由到不同图像生成后端（FLUX API 等）
- 管理图像生成请求的排队与回调
- 缓存已生成图像，避免重复调用

### 4. Document Renderer（文档渲染器）

**文件位置**：`backend/app/services/document_renderer.py`

**功能**（待实现）：
- 将证据分析结果和场景推演结果渲染为结构化教学文档
- 支持多格式导出（PDF、Markdown、HTML）
- 生成包含证据链、现场还原图和推演依据的综合分析报告
- 支持原始判决书的上传解析（通过 Unstructured 库处理 PDF/DOCX）

---

## API 端点说明

### 现有通用端点（来自模板）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/login/access-token` | 用户登录，获取 JWT Token |
| `POST` | `/api/v1/users/signup` | 用户注册 |
| `GET` | `/api/v1/users/me` | 获取当前用户信息 |
| `PATCH` | `/api/v1/users/me` | 更新当前用户信息 |
| `PATCH` | `/api/v1/users/me/password` | 修改密码 |
| `POST` | `/api/v1/password-recovery/{email}` | 发送密码重置邮件 |
| `POST` | `/api/v1/reset-password` | 重置密码 |
| `GET` | `/api/v1/items/` | 获取 Items 列表 |
| `POST` | `/api/v1/items/` | 创建 Item |
| `GET` | `/api/v1/items/{id}` | 获取单个 Item |
| `PUT` | `/api/v1/items/{id}` | 更新 Item |
| `DELETE` | `/api/v1/items/{id}` | 删除 Item |
| `GET` | `/api/v1/utils/health-check/` | 健康检查 |

### JEVS 核心端点

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| `POST` | `/api/v1/cases/` | 创建案件，上传判决书文本 | 待实现 |
| `GET` | `/api/v1/cases/` | 获取案件列表 | 待实现 |
| `GET` | `/api/v1/cases/{id}` | 获取案件详情 | 待实现 |
| `POST` | `/api/v1/cases/{id}/extract` | 触发证据提取（调用 Evidence Filtering Engine） | 待实现 |
| `GET` | `/api/v1/cases/{id}/evidences` | 获取案件下的证据列表 | 待实现 |
| `PATCH` | `/api/v1/evidences/{id}` | 更新证据（审核/排除/修改） | 待实现 |
| `POST` | `/api/v1/cases/{id}/scene` | 触发场景推演（调用 Scene State Engine） | 待实现 |
| `GET` | `/api/v1/cases/{id}/scene` | 获取场景状态快照 | 待实现 |
| `POST` | `/api/v1/scenes/{id}/render` | 生成现场还原图像（调用 Image Router） | 待实现 |
| `GET` | `/api/v1/cases/{id}/report` | 导出综合分析报告（调用 Document Renderer） | 待实现 |

---

## Provider 切换方式

证据提取（Evidence Filtering Engine）和场景推演（Scene State Engine）均支持在运行时通过 API 参数切换 LLM Provider。

### API 调用示例

```json
// 使用 OpenAI 作为后端 (默认)
POST /api/v1/cases/1/extract
{
  "provider": "openai"
}

// 使用 DeepSeek 作为后端
POST /api/v1/cases/1/extract
{
  "provider": "deepseek"
}
```

### 切换逻辑（源码层面）

```python
# backend/app/services/evidence_filter.py (以及 scene_engine.py)
if provider == "deepseek":
    client = instructor.from_openai(
        AsyncOpenAI(api_key=os.getenv("DEEPSEEK_API_KEY"), base_url="https://api.deepseek.com")
    )
    model_name = "deepseek-chat"
else:
    client = instructor.from_openai(
        AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    )
    model_name = "gpt-4o-mini"
```

- **OpenAI**：使用标准 OpenAI API endpoint，需要 `OPENAI_API_KEY` 环境变量
- **DeepSeek**：使用 DeepSeek 兼容接口 (`https://api.deepseek.com`)，需要 `DEEPSEEK_API_KEY` 环境变量
- 两个 Provider 均通过 Instructor 框架进行结构化输出约束，保证返回格式一致性

---

## 项目目录结构

```
full-stack-fastapi-template/
├── JEVS_README.md              ← 本文件
├── README.md                   ← 原始模板 README
├── backend/
│   ├── pyproject.toml          ← Python 依赖配置
│   ├── app/
│   │   ├── main.py             ← FastAPI 应用入口
│   │   ├── models.py           ← SQLModel 数据模型
│   │   ├── api/
│   │   │   └── routes/         ← API 路由
│   │   ├── core/
│   │   │   └── config.py       ← 配置管理（读取 .env）
│   │   ├── schemas/
│   │   │   ├── evidence.py     ← 证据相关 Pydantic Schemas
│   │   │   └── scene.py        ← 场景相关 Pydantic Schemas
│   │   └── services/
│   │       ├── evidence_filter.py    ← 证据过滤引擎
│   │       ├── scene_engine.py       ← 场景状态引擎
│   │       ├── image_router.py       ← 图像路由
│   │       └── document_renderer.py  ← 文档渲染器
│   └── tests/                  ← 后端测试
├── frontend/                   ← React 前端
├── compose.yml                 ← Docker Compose 配置
└── .env                        ← 环境变量配置
```
