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

// 存储 key 常量
const COMFYUI_CONFIG_KEY = 'comfyui_config'

// 默认配置
const DEFAULT_CONFIG = {
  serverUrl: 'http://127.0.0.1:8188',
  timeout: 300000, // 5分钟超时
  workflowPath: './data/comfyui/workflow_default.json',
  // 默认生成参数
  model: '',
  vae: '',
  clip: '',
  width: 512,
  height: 768,
  steps: 20,
  cfgScale: 7,
  sampler: 'euler',
  scheduler: 'normal',
  seed: -1, // -1 表示随机
}

/**
 * 检查是否在 Electron 环境中
 * @returns {boolean}
 */
const isElectron = () => {
  return typeof window !== 'undefined' && window.avgLLM?.comfyui
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
      return { ...DEFAULT_CONFIG, ...raw }
    }
  } catch {
    // 忽略解析错误
  }
  return DEFAULT_CONFIG
}

/**
 * 保存 ComfyUI 配置
 * @param {Object} config - 配置对象
 */
export const saveComfyUIConfig = async (config) => {
  if (typeof window === 'undefined') return

  try {
    await kvStorage.set(COMFYUI_CONFIG_KEY, config)
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
  const url = serverUrl || getComfyUIConfig().serverUrl

  // Electron 环境：使用 IPC 代理
  if (isElectron()) {
    const result = await window.avgLLM.comfyui.checkAvailable(url)
    return result.available
  }

  // Web 环境：直接 fetch（可能遇到 CORS）
  try {
    const response = await fetch(`${url}/system_stats`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })
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
  const url = serverUrl || getComfyUIConfig().serverUrl

  try {
    let data
    if (isElectron()) {
      const result = await window.avgLLM.comfyui.getObjectInfo(url, 'CheckpointLoaderSimple')
      if (!result.success) return []
      data = result.data
    } else {
      const response = await fetch(`${url}/object_info/CheckpointLoaderSimple`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })
      if (!response.ok) return []
      data = await response.json()
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
  const url = serverUrl || getComfyUIConfig().serverUrl

  try {
    let data
    if (isElectron()) {
      const result = await window.avgLLM.comfyui.getObjectInfo(url, 'VAELoader')
      if (!result.success) return []
      data = result.data
    } else {
      const response = await fetch(`${url}/object_info/VAELoader`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })
      if (!response.ok) return []
      data = await response.json()
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
  const url = serverUrl || getComfyUIConfig().serverUrl

  try {
    let data
    if (isElectron()) {
      const result = await window.avgLLM.comfyui.getObjectInfo(url, 'CLIPLoader')
      if (!result.success) return []
      data = result.data
    } else {
      const response = await fetch(`${url}/object_info/CLIPLoader`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })
      if (!response.ok) return []
      data = await response.json()
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
  const url = serverUrl || getComfyUIConfig().serverUrl

  try {
    let data
    if (isElectron()) {
      const result = await window.avgLLM.comfyui.getObjectInfo(url, 'KSampler')
      if (!result.success) return ['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_2m_sde', 'ddim']
      data = result.data
    } else {
      const response = await fetch(`${url}/object_info/KSampler`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })
      if (!response.ok) return ['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_2m_sde', 'ddim']
      data = await response.json()
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
  const url = serverUrl || getComfyUIConfig().serverUrl

  try {
    let data
    if (isElectron()) {
      const result = await window.avgLLM.comfyui.getObjectInfo(url, 'KSampler')
      if (!result.success) return ['normal', 'karras', 'exponential', 'sgm_uniform']
      data = result.data
    } else {
      const response = await fetch(`${url}/object_info/KSampler`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })
      if (!response.ok) return ['normal', 'karras', 'exponential', 'sgm_uniform']
      data = await response.json()
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
  const path = workflowPath || getComfyUIConfig().workflowPath
  
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
    "4": {
      "inputs": {
        "seed": "%seed%",
        "steps": "%steps%",
        "cfg": "%cfg_scale%",
        "sampler_name": "%sampler%",
        "scheduler": "%scheduler%",
        "denoise": 1,
        "model": ["15", 0],
        "positive": ["6", 0],
        "negative": ["7", 0],
        "latent_image": ["5", 0]
      },
      "class_type": "KSampler",
      "_meta": {
        "title": "K采样器"
      }
    },
    "5": {
      "inputs": {
        "width": "%width%",
        "height": "%height%",
        "batch_size": 1
      },
      "class_type": "EmptyLatentImage",
      "_meta": {
        "title": "空Latent图像"
      }
    },
    "6": {
      "inputs": {
        "text": "%positive_prompt%",
        "clip": ["15", 1]
      },
      "class_type": "CLIPTextEncode",
      "_meta": {
        "title": "正向提示词"
      }
    },
    "7": {
      "inputs": {
        "text": "%negative_prompt%",
        "clip": ["15", 1]
      },
      "class_type": "CLIPTextEncode",
      "_meta": {
        "title": "反向提示词"
      }
    },
    "8": {
      "inputs": {
        "vae_name": "%vae%"
      },
      "class_type": "VAELoader",
      "_meta": {
        "title": "加载VAE"
      }
    },
    "9": {
      "inputs": {
        "samples": ["4", 0],
        "vae": ["8", 0]
      },
      "class_type": "VAEDecode",
      "_meta": {
        "title": "VAE解码"
      }
    },
    "10": {
      "inputs": {
        "filename_prefix": "avg_cg",
        "images": ["9", 0]
      },
      "class_type": "SaveImage",
      "_meta": {
        "title": "保存图像"
      }
    },
    "15": {
      "inputs": {
        "ckpt_name": "%model%"
      },
      "class_type": "CheckpointLoaderSimple",
      "_meta": {
        "title": "Checkpoint加载器"
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
export const fillWorkflowParams = (workflow, params) => {
  const config = getComfyUIConfig()
  
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
    clip: params.clip ?? config.clip,
    positive_prompt: params.positivePrompt || '',
    negative_prompt: params.negativePrompt || 'low quality, bad quality, blurry, ugly, distorted, deformed',
  }

  console.log('ComfyUI 最终参数:', finalParams)

  // 深拷贝工作流
  const filledWorkflow = JSON.parse(JSON.stringify(workflow))

  // 递归替换占位符
  const replacePlaceholders = (obj) => {
    if (typeof obj === 'string') {
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
  const url = serverUrl || getComfyUIConfig().serverUrl

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

  // Web 环境：直接 fetch
  try {
    const response = await fetch(`${url}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: workflow }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `提交工作流失败: ${response.status} ${errorText}`,
        data: null,
      }
    }

    const data = await response.json()
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
  const url = serverUrl || getComfyUIConfig().serverUrl
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
        const response = await fetch(`${url}/history/${promptId}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        })

        if (!response.ok) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        history = await response.json()
      }

      // 检查是否完成
      if (history[promptId]?.outputs) {
        const outputs = history[promptId].outputs

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
            
            // Web 环境：返回 URL
            const imageUrl = `${url}/view?filename=${encodeURIComponent(image.filename)}&type=${image.type || 'output'}&subfolder=${image.subfolder || ''}`
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
 * @param {string} params.workflowPath - 工作流文件路径（可选）
 * @param {Function} onProgress - 进度回调函数
 * @returns {Promise<Object>} 生成结果
 */
export const generateCG = async (params, onProgress = null) => {
  const config = getComfyUIConfig()

  // 检查服务是否可用
  if (onProgress) onProgress({ status: 'connecting', message: '正在连接 ComfyUI...' })

  const available = await checkComfyUIAvailable(config.serverUrl)
  if (!available) {
    return {
      success: false,
      error: '无法连接到 ComfyUI 服务，请确保 ComfyUI 已启动并运行在 ' + config.serverUrl,
      data: null,
    }
  }

  // 加载工作流
  if (onProgress) onProgress({ status: 'loading_workflow', message: '正在加载工作流...' })

  const workflow = await loadWorkflow(params.workflowPath || config.workflowPath)

  // 填充参数
  if (onProgress) onProgress({ status: 'preparing', message: '正在准备生成任务...' })

  const filledWorkflow = fillWorkflowParams(workflow, params)

  // 提交工作流
  const submitResult = await submitWorkflow(filledWorkflow, config.serverUrl)
  if (!submitResult.success) {
    return submitResult
  }

  // 等待结果
  if (onProgress) onProgress({ status: 'generating', message: '正在生成图片...' })

  const result = await waitForResult(
    submitResult.promptId,
    config.serverUrl,
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