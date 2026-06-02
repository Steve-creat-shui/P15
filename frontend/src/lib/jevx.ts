/** JEVS API 辅助函数 — 封装对 JEVS 端点的 fetch 调用。 */

const API_PREFIX = "/api/v1"

function getToken(): string | null {
  if (typeof localStorage === "undefined") return null
  return localStorage.getItem("access_token")
}

async function request<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  const res = await fetch(`${API_PREFIX}${url}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = (body as { detail?: string }).detail || res.statusText
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const jevx = {
  /** POST /cases — 创建新案件 */
  createCase(title: string, raw_text: string) {
    return request<{ id: number; title: string; status: string }>("/cases/", {
      method: "POST",
      body: JSON.stringify({ title, raw_text }),
    })
  },

  /** POST /cases/upload — 上传文件创建案件（支持 PDF/DOCX/TXT） */
  async uploadAndCreateCase(
    file: File,
    title?: string,
  ): Promise<{ id: number; title: string; status: string }> {
    const token = getToken()
    const formData = new FormData()
    formData.append("file", file)
    if (title) formData.append("title", title)

    const headers: Record<string, string> = {}
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    const res = await fetch(`${API_PREFIX}/cases/upload`, {
      method: "POST",
      headers,
      body: formData,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const detail = (body as { detail?: string }).detail || res.statusText
      throw new Error(detail)
    }
    return res.json()
  },

  /** POST /cases/{id}/extract — 触发证据提取 */
  extractEvidence(caseId: number) {
    return request<{
      case: unknown
      extraction_result: unknown
      stored_evidence: { extractable: unknown[]; uncertain: unknown[] }
    }>(`/cases/${caseId}/extract`, { method: "POST" })
  },

  /** GET /cases/{id}/evidence — 获取证据列表 */
  getEvidence(caseId: number, category?: string) {
    const params = category ? `?category=${category}` : ""
    return request<unknown[]>(`/cases/${caseId}/evidence${params}`)
  },

  /** PATCH /cases/{id} — 更新案件（含 style_description） */
  updateCase(
    caseId: number,
    data: {
      title?: string
      raw_text?: string
      status?: string
      style_description?: string | null
    },
  ) {
    return request(`/cases/${caseId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  /** PATCH /evidence/{id} — 审核单条证据 */
  updateEvidence(
    evidenceId: number,
    data: {
      is_approved?: boolean
      is_excluded?: boolean
      location?: string
      description?: string
      state_json?: string
      scene_id?: number | null
    },
  ) {
    return request(`/evidence/${evidenceId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  /** POST /cases/{id}/build-scene — 构建场景 */
  buildScene(caseId: number) {
    return request<{ case: unknown; scene: unknown; scene_id: number }>(
      `/cases/${caseId}/build-scene`,
      { method: "POST" },
    )
  },

  /** POST /cases/{id}/generate-images — 为指定场景生成图片 */
  generateImages(
    caseId: number,
    data: {
      scene_id?: number;
      provider_config?: {
        scene_overview: string;
        evidence_closeup: string;
        document_render: string;
      };
      provider?: string;
      style?: string;
    },
  ) {
    return request<{
      image: {
        id: number
        case_id: number
        scene_id: number | null
        image_type: string
        image_path: string
        provider: string
        style: string
        created_at: string | null
      } | null
      omitted_items: string[]
      warning: { should_warn: boolean; message: string; item_count: number; threshold: number } | null
    }>(`/cases/${caseId}/generate-images`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  /** POST /cases/{id}/generate-all-scenes — 串行批量生成所有场景图 */
  generateAllScenes(caseId: number, data: { provider: string }) {
    return request<{
      total_scenes: number
      generated: number
      failed: number
      results: Array<{
        scene: string
        scene_id: number
        image_id: number
        image_path: string
        omitted_items: string[]
        progress: string
      }>
      errors: Array<{ scene: string; error: string }>
    }>(`/cases/${caseId}/generate-all-scenes`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  /** POST /evidence/{id}/generate-closeup — 按需生成单个物证特写 */
  generateEvidenceCloseup(evidenceId: number, data: {
    provider_config?: {
      scene_overview: string;
      evidence_closeup: string;
      document_render: string;
    };
    provider?: string;
  }) {
    return request<{
      id: number
      case_id: number
      scene_id: number | null
      image_type: string
      image_path: string
      provider: string
      created_at: string | null
      strategy_used: string
      strategy_label: string
      has_reference_preview: boolean
      scene_image_used: string | null
    }>(`/evidence/${evidenceId}/generate-closeup`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  /** GET /cases/{id}/images — 获取案件图片 */
  getImages(caseId: number, imageType?: string) {
    const params = imageType ? `?image_type=${imageType}` : ""
    return request<unknown[]>(`/cases/${caseId}/images${params}`)
  },

  /** POST /cases/{id}/scenes/suggest — 自动建议场景 */
  suggestScenes(caseId: number) {
    return request<{ suggestions: Array<{ name: string; room_type: string; reason: string }> }>(
      `/cases/${caseId}/scenes/suggest`,
      { method: "POST" },
    )
  },

  /** POST /cases/{id}/scenes — 创建场景 */
  createScene(caseId: number, data: { name: string; room_type: string }) {
    return request(`/cases/${caseId}/scenes`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  /** GET /cases/{id}/scenes — 获取场景列表 */
  getScenes(caseId: number) {
    return request<
      Array<{
        id: number
        case_id: number
        name: string
        room_type: string
        sort_order: number
        evidence_count: number
        created_at: string
        updated_at: string
      }>
    >(`/cases/${caseId}/scenes`)
  },

  /** PATCH /scenes/{id} — 更新场景 */
  updateScene(sceneId: number, data: { name?: string; room_type?: string }) {
    return request(`/scenes/${sceneId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  /** DELETE /scenes/{id} — 删除场景 */
  deleteScene(sceneId: number) {
    return request(`/scenes/${sceneId}`, { method: "DELETE" })
  },

  /** PATCH /cases/{id}/scenes/reorder — 重新排序场景 */
  reorderScenes(caseId: number, sceneIds: number[]) {
    return request(`/cases/${caseId}/scenes/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ scene_ids: sceneIds }),
    })
  },

  /** GET /templates — 获取可用书证模板列表 */
  getDocTemplates() {
    return request<{
      templates: Array<{
        type: string
        label: string
        description: string
        required_fields: string[]
        optional_fields: string[]
      }>
    }>("/templates")
  },

  /** POST /evidence/{id}/render-document — 渲染书证图片（Pillow，0 API 调用） */
  renderDocument(
    evidenceId: number,
    data: {
      evidence_id: number
      template_type: string
      title?: string
      text_content?: string
      document_date?: string
      messages?: Array<{ sender: string; text: string; time: string }>
    },
  ) {
    return request<{
      id: number
      case_id: number
      scene_id: number | null
      image_type: string
      image_path: string
      provider: string
      style: string
      created_at: string | null
    }>(`/evidence/${evidenceId}/render-document`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  /** GET /projects — 获取案件列表 */
  getProjects() {
    return request<
      Array<{
        id: number
        title: string
        status: string
        style_description: string | null
        created_at: string
        evidence_count: number
        image_count: number
      }>
    >("/projects")
  },
}

/** LOCATION_MAP keys — 用于前端下拉选择 */
export const LOCATION_KEYS = [
  { value: "under_bed", label: "床下" },
  { value: "under_bed_left", label: "床下左侧" },
  { value: "under_bed_right", label: "床下右侧" },
  { value: "on_bed", label: "床上" },
  { value: "on_desk", label: "桌上" },
  { value: "under_desk", label: "桌下" },
  { value: "near_window", label: "窗户附近" },
  { value: "on_windowsill", label: "窗台" },
  { value: "near_door", label: "门附近" },
  { value: "behind_door", label: "门后" },
  { value: "on_floor", label: "地面中央" },
  { value: "floor_left", label: "地面左侧" },
  { value: "floor_right", label: "地面右侧" },
  { value: "in_drawer", label: "抽屉内" },
  { value: "on_shelf", label: "搁架上" },
  // 沙发/茶几
  { value: "on_sofa", label: "沙发上" },
  { value: "under_sofa", label: "沙发下" },
  { value: "on_coffee_table", label: "茶几上" },
  { value: "under_coffee_table", label: "茶几下" },
  // 接待区
  { value: "on_reception_desk", label: "接待台上" },
  { value: "behind_reception_desk", label: "接待台后" },
  { value: "near_reception", label: "接待区附近" },
  // 衣物
  { value: "on_clothing", label: "衣物上" },
  { value: "in_wardrobe", label: "衣柜内" },
  { value: "on_hanger", label: "衣架上" },
  // 血迹/痕迹
  { value: "blood_on_floor", label: "地面血迹处" },
  { value: "blood_on_wall", label: "墙面血迹处" },
  { value: "blood_near_door", label: "门口血迹处" },
  // 厨房
  { value: "on_kitchen_counter", label: "厨房台面" },
  { value: "in_kitchen_sink", label: "厨房水槽" },
  // 通用
  { value: "against_wall", label: "靠墙处" },
  { value: "corner_left", label: "左角落" },
  { value: "corner_right", label: "右角落" },
]
