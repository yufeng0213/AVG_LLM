/**
 * ComfyUI 服务模块
 * 负责与本地 ComfyUI API 通信，生成 CG 图片
 *
 * ComfyUI 默认运行在 http://127.0.0.1:8188
 * 主要 API 端点：
 * - POST /prompt - 提交工作流执行
 * - GET /history/{prompt_id} - 获取执行历史
 * - GET /view - 查看生成的图片
 *
 * 在 Electron 环境下通过 IPC 代理请求，解决 CORS 问题
 */

import { kvStorage } from '../storage/index.js'
import { CapacitorHttp } from '@capacitor/core'

// 存储 key 常量
const COMFYUI_CONFIG_KEY = 'comfyui_config'
const LEGACY_DEFAULT_WORKFLOW_PATH = './data/comfyui/workflow_default.json'
const BUNDLED_DEFAULT_WORKFLOW_PATH = '/data/comfyui/workflow_default.json'

const normalizeWorkflowPath = (workflowPath) => {
  if (!workflowPath) return BUNDLED_DEFAULT_WORKFLOW_PATH
  if (workflowPath === LEGACY_DEFAULT_WORKFLOW_PATH) return BUNDLED_DEFAULT_WORKFLOW_PATH
  return workflowPath
}

// 默认配置
const DEFAULT_CONFIG = {
  serverUrl: 'http://127.0.0.1:8188',
  timeout: 300000, // 5分钟超时
  workflowPath: BUNDLED_DEFAULT_WORKFLOW_PATH,
  // 默认生成参数
  model: 'z-image-turbo-fp8-e4m3fn.safetensors',
  vae: 'ae.safetensors',
  clip: 'qwen_3_4b_fp8_mixed.safetensors',
  width: 1024,
  height: 1024,
  steps: 8,
  cfgScale: 1,
  sampler: 'res_multistep',
  scheduler: 'simple',
  seed: -1, // -1 表示随机
}

/**
 * 检查是否在 Electron 环境中
 * @returns {boolean}
 */
const isElectron = () => {
  return typeof window !== 'undefined' && window.avgLLM?.comfyui
}

const isNativeRuntime = () => {
  return typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true
}

const parseJsonPayload = (payload) => {
  if (typeof payload !== 'string') return payload
  try {
    return JSON.parse(payload)
  } catch {
    return payload
  }
}

const requestJson = async (url, { method = 'GET', headers = {}, body = null } = {}) => {
  if (isNativeRuntime() && CapacitorHttp?.request) {
    const nativeHeaders = {
      Accept: 'application/json',
      ...headers,
    }
    if (body !== null && body !== undefined && !nativeHeaders['Content-Type']) {
      nativeHeaders['Content-Type'] = 'application/json'
    }

    const response = await CapacitorHttp.request({
      url,
      method,
      headers: nativeHeaders,
      data: body,
      connectTimeout: 15000,
      readTimeout: 300000,
    })

    const parsed = parseJsonPayload(response.data)
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      data: parsed,
      text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? ''),
    }
  }

  const fetchOptions = {
    method,
    headers: {
      Accept: 'application/json',
      ...headers,
    },
  }
  if (body !== null && body !== undefined) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  const response = await fetch(url, fetchOptions)
  const text = await response.text()
  return {
    ok: response.ok,
    status: response.status,
    data: parseJsonPayload(text),
    text,
  }
}

const getHeaderValue = (headers, key) => {
  if (!headers) return ''
  if (Object.prototype.hasOwnProperty.call(headers, key)) return headers[key]
  const lowerKey = key.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === lowerKey) return v
  }
  return ''
}

const getMimeTypeFromHeaders = (headers) => {
  const raw = getHeaderValue(headers, 'content-type')
  if (!raw) return 'image/png'
  return String(raw).split(';')[0].trim() || 'image/png'
}

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

const normalizeNativeBinaryToBase64 = (data) => {
  if (!data) return null
  if (typeof data === 'string') {
    return data.trim()
  }
  if (data instanceof ArrayBuffer) {
    return arrayBufferToBase64(data)
  }
  if (Array.isArray(data)) {
    return arrayBufferToBase64(new Uint8Array(data).buffer)
  }
  if (typeof data === 'object' && Array.isArray(data.data)) {
    return arrayBufferToBase64(new Uint8Array(data.data).buffer)
  }
  return null
}

/**
 * 获取 ComfyUI 配置
 * @returns {Promise<Object>} ComfyUI 配置对象
 */
export const getComfyUIConfig = async () => {
  if (typeof window === 'undefined') return DEFAULT_CONFIG

  try {
    const raw = await kvStorage.get(COMFYUI_CONFIG_KEY)
    if (raw) {
      return {
        ...DEFAULT_CONFIG,
        ...raw,
        workflowPath: normalizeWorkflowPath(raw.workflowPath),
      }
    }
  } catch {
    // 忽略解析错误
  }
  return {
    ...DEFAULT_CONFIG,
    workflowPath: normalizeWorkflowPath(DEFAULT_CONFIG.workflowPath),
  }
}

/**
 * 保存 ComfyUI 配置
 * @param {Object} config - 配置对象
 */
export const saveComfyUIConfig = async (config) => {
  if (typeof window === 'undefined') return

  try {
    await kvStorage.set(COMFYUI_CONFIG_KEY, {
      ...config,
      workflowPath: normalizeWorkflowPath(config?.workflowPath),
    })
  } catch {
    // 忽略存储错误
  }
}

/**
 * 检查 ComfyUI 服务是否可用
 * @param {string} serverUrl - 服务器地址
 * @returns {Promise<boolean>} 是否可用
 */
export const checkComfyUIAvailable = async (serverUrl) => {
  const config = await getComfyUIConfig()
  const url = serverUrl || config.serverUrl

  // Electron 环境：使用 IPC 代理
  if (isElectron()) {
    const result = await window.avgLLM.comfyui.checkAvailable(url)
    return result.available
  }

  // Web/Native 环境：直接请求（Native 优先走 CapacitorHttp，规避 WebView CORS）
  try {
    const response = await requestJson(`${url}/system_stats`)
    return response.ok
  } catch {
    return false
  }
}

/**
 * 获取可用的检查点模型列表
 * @param {string} serverUrl - 服务器地址
 * @returns {Promise<string[]>} 模型名称列表
 */
export const getAvailableModels = async (serverUrl) => {
  const config = await getComfyUIConfig()
  const url = serverUrl || config.serverUrl

  try {
    let data
    if (isElectron()) {
      const unetResult = await window.avgLLM.comfyui.getObjectInfo(url, 'UNETLoader')
      if (unetResult.success) {
        const unetModels = unetResult.data?.UNETLoader?.input?.required?.unet_name?.[0] || []
        if (Array.isArray(unetModels) && unetModels.length > 0) {
          return unetModels
        }
      }
    } else {
      const unetResponse = await requestJson(`${url}/object_info/UNETLoader`)
      if (unetResponse.ok) {
        const unetModels = unetResponse.data?.UNETLoader?.input?.required?.unet_name?.[0] || []
        if (Array.isArray(unetModels) && unetModels.length > 0) {
          return unetModels
        }
      }
    }

    // 回退到 CheckpointLoaderSimple（兼容旧工作流）
    if (isElectron()) {
      const result = await window.avgLLM.comfyui.getObjectInfo(url, 'CheckpointLoaderSimple')
      if (!result.success) return []
      data = result.data
    } else {
      const response = await requestJson(`${url}/object_info/CheckpointLoaderSimple`)
      if (!response.ok) return []
      data = response.data
    }
    return data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || []
  } catch {
    return []
  }
}

/**
 * 获取可用的 VAE 列表
 * @param {string} serverUrl - 服务器地址
 * @returns {Promise<string[]>} VAE 名称列表
 */
export const getAvailableVAEs = async (serverUrl) => {
  const config = await getComfyUIConfig()
  const url = serverUrl || config.serverUrl

  try {
    let data
    if (isElectron()) {
      const result = await window.avgLLM.comfyui.getObjectInfo(url, 'VAELoader')
      if (!result.success) return []
      data = result.data
    } else {
      const response = await requestJson(`${url}/object_info/VAELoader`)
      if (!response.ok) return []
      data = response.data
    }
    return data?.VAELoader?.input?.required?.vae_name?.[0] || []
  } catch {
    return []
  }
}

/**
 * 获取可用的 CLIP 列表
 * @param {string} serverUrl - 服务器地址
 * @returns {Promise<string[]>} CLIP 名称列表
 */
export const getAvailableCLIPs = async (serverUrl) => {
  const config = await getComfyUIConfig()
  const url = serverUrl || config.serverUrl

  try {
    let data
    if (isElectron()) {
      const result = await window.avgLLM.comfyui.getObjectInfo(url, 'CLIPLoader')
      if (!result.success) return []
      data = result.data
    } else {
      const response = await requestJson(`${url}/object_info/CLIPLoader`)
      if (!response.ok) return []
      data = response.data
    }
    return data?.CLIPLoader?.input?.required?.clip_name?.[0] || []
  } catch {
    return []
  }
}

/**
 * 获取可用的采样器列表
 * @param {string} serverUrl - 服务器地址
 * @returns {Promise<string[]>} 采样器名称列表
 */
export const getAvailableSamplers = async (serverUrl) => {
  const config = await getComfyUIConfig()
  const url = serverUrl || config.serverUrl

  try {
    let data
    if (isElectron()) {
      const result = await window.avgLLM.comfyui.getObjectInfo(url, 'KSampler')
      if (!result.success) return ['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_2m_sde', 'ddim']
      data = result.data
    } else {
      const response = await requestJson(`${url}/object_info/KSampler`)
      if (!response.ok) return ['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_2m_sde', 'ddim']
      data = response.data
    }
    return data?.KSampler?.input?.required?.sampler_name?.[0] || ['euler', 'euler_ancestral', 'dpmpp_2m']
  } catch {
    return ['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_2m_sde', 'ddim']
  }
}

/**
 * 获取可用的调度器列表
 * @param {string} serverUrl - 服务器地址
 * @returns {Promise<string[]>} 调度器名称列表
 */
export const getAvailableSchedulers = async (serverUrl) => {
  const config = await getComfyUIConfig()
  const url = serverUrl || config.serverUrl

  try {
    let data
    if (isElectron()) {
      const result = await window.avgLLM.comfyui.getObjectInfo(url, 'KSampler')
      if (!result.success) return ['normal', 'karras', 'exponential', 'sgm_uniform']
      data = result.data
    } else {
      const response = await requestJson(`${url}/object_info/KSampler`)
      if (!response.ok) return ['normal', 'karras', 'exponential', 'sgm_uniform']
      data = response.data
    }
    return data?.KSampler?.input?.required?.scheduler?.[0] || ['normal', 'karras', 'exponential']
  } catch {
    return ['normal', 'karras', 'exponential', 'sgm_uniform']
  }
}

/**
 * 加载工作流 JSON 文件
 * @param {string} workflowPath - 工作流文件路径
 * @returns {Promise<Object>} 工作流对象
 */
export const loadWorkflow = async (workflowPath) => {
  const config = await getComfyUIConfig()
  const path = normalizeWorkflowPath(workflowPath || config.workflowPath)
  
  try {
    // Electron 环境：使用文件 API
    if (window.avgLLM?.file?.readText) {
      console.log('ComfyUI: 尝试从文件加载工作流:', path)
      const content = await window.avgLLM.file.readText(path)
      if (!content) {
        throw new Error('文件内容为空或文件不存在')
      }
      console.log('ComfyUI: 工作流文件加载成功')
      return JSON.parse(content)
    }
    
    // Web 环境：使用 fetch
    console.log('ComfyUI: 尝试从网络加载工作流:', path)
    const response = await fetch(path)
    if (!response.ok) {
      throw new Error(`加载工作流失败: ${response.status}`)
    }
    const workflow = await response.json()
    console.log('ComfyUI: 工作流网络加载成功')
    return workflow
  } catch (err) {
    console.error('加载工作流失败，使用默认工作流:', err)
    // 返回默认工作流
    return getDefaultWorkflow()
  }
}

/**
 * 获取默认工作流（当文件加载失败时使用）
 * @returns {Object} 默认工作流对象
 */
const getDefaultWorkflow = () => {
  return {
    "39": {
      "inputs": {
        "clip_name": "%clip%",
        "type": "lumina2",
        "device": "default"
      },
      "class_type": "CLIPLoader",
      "_meta": {
        "title": "加载CLIP"
      }
    },
    "40": {
      "inputs": {
        "vae_name": "%vae%"
      },
      "class_type": "VAELoader",
      "_meta": {
        "title": "加载VAE"
      }
    },
    "41": {
      "inputs": {
        "width": "%width%",
        "height": "%height%",
        "batch_size": 1
      },
      "class_type": "EmptySD3LatentImage",
      "_meta": {
        "title": "空Latent图像(SD3)"
      }
    },
    "45": {
      "inputs": {
        "text": "%positive_prompt%",
        "clip": [
          "39",
          0
        ]
      },
      "class_type": "CLIPTextEncode",
      "_meta": {
        "title": "正向提示词"
      }
    },
    "59": {
      "inputs": {
        "text": "%negative_prompt%",
        "clip": [
          "39",
          0
        ]
      },
      "class_type": "CLIPTextEncode",
      "_meta": {
        "title": "反向提示词"
      }
    },
    "46": {
      "inputs": {
        "unet_name": "%model%",
        "weight_dtype": "default"
      },
      "class_type": "UNETLoader",
      "_meta": {
        "title": "加载UNET"
      }
    },
    "47": {
      "inputs": {
        "model": [
          "46",
          0
        ],
        "shift": 3
      },
      "class_type": "ModelSamplingAuraFlow",
      "_meta": {
        "title": "ModelSamplingAuraFlow"
      }
    },
    "44": {
      "inputs": {
        "seed": "%seed%",
        "steps": "%steps%",
        "cfg": "%cfg_scale%",
        "sampler_name": "%sampler%",
        "scheduler": "%scheduler%",
        "denoise": 1,
        "model": ["47", 0],
        "positive": ["45", 0],
        "negative": ["59", 0],
        "latent_image": ["41", 0]
      },
      "class_type": "KSampler",
      "_meta": {
        "title": "K采样器"
      }
    },
    "43": {
      "inputs": {
        "samples": ["44", 0],
        "vae": ["40", 0]
      },
      "class_type": "VAEDecode",
      "_meta": {
        "title": "VAE解码"
      }
    },
    "58": {
      "inputs": {
        "filename_prefix": "avg_cg",
        "images": ["43", 0]
      },
      "class_type": "SaveImage",
      "_meta": {
        "title": "保存图像"
      }
    }
  }
}

/**
 * 替换工作流中的参数占位符
 * @param {Object} workflow - 工作流对象
 * @param {Object} params - 参数对象
 * @returns {Object} 替换后的工作流对象
 */
export const fillWorkflowParams = async (workflow, params) => {
  const config = await getComfyUIConfig()
  
  // 合并参数，使用传入参数或默认配置
  const finalParams = {
    seed: params.seed ?? (config.seed === -1 ? Math.floor(Math.random() * 1000000000000) : config.seed),
    steps: params.steps ?? config.steps,
    cfg_scale: params.cfgScale ?? config.cfgScale,
    sampler: params.sampler ?? config.sampler,
    scheduler: params.scheduler ?? config.scheduler,
    width: params.width ?? config.width,
    height: params.height ?? config.height,
    model: params.model ?? config.model,
    vae: params.vae ?? config.vae,
    clip: params.clip ?? config.clip ?? DEFAULT_CONFIG.clip,
    positive_prompt: params.positivePrompt || '',
    negative_prompt: params.negativePrompt || 'low quality, bad quality, blurry, ugly, distorted, deformed',
  }

  console.log('ComfyUI 最终参数:', finalParams)

  // 深拷贝工作流
  const filledWorkflow = JSON.parse(JSON.stringify(workflow))

  // 递归替换占位符
  const replacePlaceholders = (obj) => {
    if (typeof obj === 'string') {
      const exactPlaceholderMatch = obj.match(/^%([a-zA-Z0-9_]+)%$/)
      if (exactPlaceholderMatch) {
        const key = exactPlaceholderMatch[1]
        if (Object.prototype.hasOwnProperty.call(finalParams, key)) {
          return finalParams[key]
        }
      }

      // 替换所有占位符
      let result = obj
      for (const [key, value] of Object.entries(finalParams)) {
        const placeholder = `%${key}%`
        if (result.includes(placeholder)) {
          result = result.replaceAll(placeholder, String(value))
        }
      }
      return result
    } else if (Array.isArray(obj)) {
      return obj.map(item => replacePlaceholders(item))
    } else if (typeof obj === 'object' && obj !== null) {
      const newObj = {}
      for (const [key, value] of Object.entries(obj)) {
        newObj[key] = replacePlaceholders(value)
      }
      return newObj
    }
    return obj
  }

  const result = replacePlaceholders(filledWorkflow)
  console.log('ComfyUI 填充后工作流:', JSON.stringify(result, null, 2))
  return result
}

/**
 * 提交工作流到 ComfyUI
 * @param {Object} workflow - ComfyUI 工作流对象
 * @param {string} serverUrl - 服务器地址
 * @returns {Promise<Object>} 执行结果
 */
export const submitWorkflow = async (workflow, serverUrl) => {
  const config = await getComfyUIConfig()
  const url = serverUrl || config.serverUrl

  // Electron 环境：使用 IPC 代理
  if (isElectron()) {
    const result = await window.avgLLM.comfyui.submitWorkflow(url, workflow)
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        data: null,
      }
    }
    return {
      success: true,
      promptId: result.data.prompt_id,
      data: result.data,
    }
  }

  // Web/Native 环境：直接请求（Native 优先走 CapacitorHttp）
  try {
    const response = await requestJson(`${url}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: { prompt: workflow },
    })

    if (!response.ok) {
      return {
        success: false,
        error: `提交工作流失败: ${response.status} ${response.text || ''}`,
        data: null,
      }
    }

    const data = response.data
    return {
      success: true,
      promptId: data.prompt_id,
      data,
    }
  } catch (err) {
    return {
      success: false,
      error: `网络请求失败: ${err.message}`,
      data: null,
    }
  }
}

/**
 * 等待工作流执行完成并获取结果
 * @param {string} promptId - 工作流 ID
 * @param {string} serverUrl - 服务器地址
 * @param {number} timeout - 超时时间（毫秒）
 * @param {Function} onProgress - 进度回调函数
 * @returns {Promise<Object>} 执行结果
 */
export const waitForResult = async (promptId, serverUrl, timeout = 300000, onProgress = null) => {
  const config = await getComfyUIConfig()
  const url = serverUrl || config.serverUrl
  const startTime = Date.now()

  // 轮询检查执行状态
  while (Date.now() - startTime < timeout) {
    try {
      let history
      
      // Electron 环境：使用 IPC 代理
      if (isElectron()) {
        const result = await window.avgLLM.comfyui.getHistory(url, promptId)
        if (!result.success) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }
        history = result.data
      } else {
        const response = await requestJson(`${url}/history/${promptId}`)
        if (!response.ok) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }
        history = response.data
      }

      const historyEntry = history[promptId]

      // 检查是否有图片输出
      if (historyEntry?.outputs) {
        const outputs = historyEntry.outputs

        // 查找保存的图片
        for (const nodeId in outputs) {
          const output = outputs[nodeId]
          if (output.images && output.images.length > 0) {
            const image = output.images[0]
            
            // Electron 环境：通过 IPC 获取图片 Base64
            if (isElectron()) {
              const imgResult = await window.avgLLM.comfyui.getImage(
                url,
                image.filename,
                image.subfolder || '',
                image.type || 'output'
              )
              
              if (imgResult.success) {
                return {
                  success: true,
                  image: {
                    filename: image.filename,
                    subfolder: image.subfolder || '',
                    type: image.type || 'output',
                    url: imgResult.data.dataUrl,
                    base64: imgResult.data.base64,
                  },
                  data: outputs,
                }
              }
            }
            
            // Native 环境：直接转 data URL，避免 WebView 直接加载 http 图片失败
            const imageUrl = `${url}/view?filename=${encodeURIComponent(image.filename)}&type=${image.type || 'output'}&subfolder=${image.subfolder || ''}`
            if (isNativeRuntime()) {
              try {
                const dataUrl = await getImageBase64(imageUrl)
                return {
                  success: true,
                  image: {
                    filename: image.filename,
                    subfolder: image.subfolder || '',
                    type: image.type || 'output',
                    url: dataUrl,
                    base64: dataUrl,
                  },
                  data: outputs,
                }
              } catch (nativeImageErr) {
                console.warn('ComfyUI: Native 图片转 data URL 失败，回退普通 URL', nativeImageErr)
              }
            }

            // Web 环境：返回 URL
            return {
              success: true,
              image: {
                filename: image.filename,
                subfolder: image.subfolder || '',
                type: image.type || 'output',
                url: imageUrl,
              },
              data: outputs,
            }
          }
        }
      }

      // 已完成但没有图片输出时，直接返回明确错误，避免一直轮询到超时
      const statusInfo = historyEntry?.status
      if (statusInfo?.completed) {
        if (statusInfo.status_str === 'error') {
          const errorMessage = statusInfo.messages?.find?.((msg) => msg?.[0] === 'execution_error')?.[1]?.exception_message
            || statusInfo.messages?.find?.((msg) => msg?.[0] === 'execution_error')?.[1]?.error
            || 'ComfyUI 执行失败'
          return {
            success: false,
            error: errorMessage,
            data: historyEntry,
          }
        }

        if (statusInfo.status_str === 'success') {
          return {
            success: false,
            error: '任务执行完成但未返回图片（可能命中缓存）。请尝试更换种子后重试。',
            data: historyEntry,
          }
        }
      }

      // 调用进度回调
      if (onProgress) {
        onProgress({
          elapsed: Date.now() - startTime,
          status: 'processing',
        })
      }
    } catch {
      // 忽略网络错误，继续轮询
    }

    // 等待 1 秒后继续轮询
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return {
    success: false,
    error: '生成超时，请检查 ComfyUI 是否正常运行',
    data: null,
  }
}

/**
 * 生成 CG 图片（完整流程）
 * @param {Object} params - 生成参数
 * @param {string} params.positivePrompt - 正向提示词
 * @param {string} params.negativePrompt - 负向提示词
 * @param {string} params.model - 模型名称
 * @param {string} params.vae - VAE 名称
 * @param {string} params.clip - CLIP 名称
 * @param {number} params.width - 图片宽度
 * @param {number} params.height - 图片高度
 * @param {number} params.steps - 采样步数
 * @param {number} params.cfgScale - CFG 缩放
 * @param {number} params.seed - 随机种子
 * @param {string} params.sampler - 采样器
 * @param {string} params.scheduler - 调度器
 * @param {string} params.serverUrl - ComfyUI 服务器地址（可选，优先于配置）
 * @param {string} params.workflowPath - 工作流文件路径（可选）
 * @param {Function} onProgress - 进度回调函数
 * @returns {Promise<Object>} 生成结果
 */
export const generateCG = async (params, onProgress = null) => {
  const config = await getComfyUIConfig()
  const runtimeServerUrl = (params?.serverUrl || config.serverUrl || '').trim()
  const runtimeWorkflowPath = params?.workflowPath || config.workflowPath

  // 检查服务是否可用
  if (onProgress) onProgress({ status: 'connecting', message: '正在连接 ComfyUI...' })

  const available = await checkComfyUIAvailable(runtimeServerUrl)
  if (!available) {
    return {
      success: false,
      error: '无法连接到 ComfyUI 服务，请确保 ComfyUI 已启动并运行在 ' + runtimeServerUrl,
      data: null,
    }
  }

  // 加载工作流
  if (onProgress) onProgress({ status: 'loading_workflow', message: '正在加载工作流...' })

  const workflow = await loadWorkflow(runtimeWorkflowPath)

  // 填充参数
  if (onProgress) onProgress({ status: 'preparing', message: '正在准备生成任务...' })

  const filledWorkflow = await fillWorkflowParams(workflow, params)

  // 提交工作流
  const submitResult = await submitWorkflow(filledWorkflow, runtimeServerUrl)
  if (!submitResult.success) {
    return submitResult
  }

  // 等待结果
  if (onProgress) onProgress({ status: 'generating', message: '正在生成图片...' })

  const result = await waitForResult(
    submitResult.promptId,
    runtimeServerUrl,
    config.timeout,
    onProgress
  )

  return result
}

/**
 * 获取图片的 Base64 数据
 * @param {string} imageUrl - 图片 URL
 * @returns {Promise<string>} Base64 编码的图片数据
 */
export const getImageBase64 = async (imageUrl) => {
  try {
    if (!imageUrl) {
      throw new Error('图片地址为空')
    }

    if (imageUrl.startsWith('data:')) {
      return imageUrl
    }

    if (isNativeRuntime() && CapacitorHttp?.request) {
      const response = await CapacitorHttp.request({
        url: imageUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        connectTimeout: 15000,
        readTimeout: 300000,
      })

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`原生请求图片失败: ${response.status}`)
      }

      const mimeType = getMimeTypeFromHeaders(response.headers)
      const base64 = normalizeNativeBinaryToBase64(response.data)
      if (!base64) {
        throw new Error('原生响应图片数据为空')
      }

      if (base64.startsWith('data:')) {
        return base64
      }

      return `data:${mimeType};base64,${base64}`
    }

    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`获取图片失败: ${response.status}`)
    }

    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (err) {
    throw new Error(`获取图片失败: ${err.message}`)
  }
}

export default {
  getComfyUIConfig,
  saveComfyUIConfig,
  checkComfyUIAvailable,
  getAvailableModels,
  getAvailableVAEs,
  getAvailableCLIPs,
  getAvailableSamplers,
  getAvailableSchedulers,
  loadWorkflow,
  fillWorkflowParams,
  submitWorkflow,
  waitForResult,
  generateCG,
  getImageBase64,
}
