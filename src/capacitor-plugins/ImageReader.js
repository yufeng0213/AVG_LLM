import { registerPlugin } from '@capacitor/core';

/**
 * 图片读取插件
 * 用于从文件系统读取图片并返回 base64
 * 支持 Widget 使用角色立绘
 */
const ImageReader = registerPlugin('ImageReader', {
  web: () => Promise.resolve({
    readImage: async (options) => {
      // Web平台模拟
      const { filePath } = options;

      // 如果是 dataUrl，直接返回
      if (filePath && filePath.startsWith('data:image')) {
        return {
          base64: filePath.split(',')[1] || '',
          mimeType: 'image/png',
          width: 300,
          height: 200,
          dataUrl: filePath,
          success: true
        };
      }

      // 如果是 http URL，模拟返回
      if (filePath && (filePath.startsWith('http://') || filePath.startsWith('https://'))) {
        return {
          base64: '',
          mimeType: 'image/png',
          width: 300,
          height: 200,
          dataUrl: filePath,
          success: true
        };
      }

      // 其他路径返回失败
      return {
        base64: '',
        mimeType: '',
        width: 0,
        height: 0,
        dataUrl: '',
        success: false
      };
    }
  })
});

/**
 * 读取角色立绘图片并返回 base64
 * @param {Object} character - 角色数据
 * @param {Object} options - 配置选项
 * @returns {Promise<{dataUrl: string, success: boolean}>}
 */
export async function readCharacterPortrait(character, options = {}) {
  const maxWidth = options.maxWidth || 800;
  const maxHeight = options.maxHeight || 600;

  // 优先使用 smsAvatar (已经是 base64)
  const smsAvatar = character?.smsAvatar;
  if (smsAvatar && smsAvatar.startsWith('data:image')) {
    return {
      dataUrl: smsAvatar,
      base64: smsAvatar.split(',')[1] || '',
      mimeType: smsAvatar.match(/data:(image\/[^;]+);/)?.[1] || 'image/png',
      width: 300,
      height: 200,
      success: true,
      source: 'smsAvatar'
    };
  }

  // 尝试从 portraits 数组加载
  const portraits = character?.portraits;
  if (!Array.isArray(portraits) || portraits.length === 0) {
    return { dataUrl: '', success: false, error: 'No portraits available' };
  }

  // 查找 default 情感的立绘，否则用第一个
  const portrait = portraits.find(p => String(p?.emotion || '').trim() === 'default') || portraits[0];
  const filePath = portrait?.filePath;

  if (!filePath) {
    return { dataUrl: '', success: false, error: 'Portrait filePath is empty' };
  }

  // 如果已经是 dataUrl
  if (filePath.startsWith('data:image')) {
    return {
      dataUrl: filePath,
      base64: filePath.split(',')[1] || '',
      mimeType: filePath.match(/data:(image\/[^;]+);/)?.[1] || 'image/png',
      width: 300,
      height: 200,
      success: true,
      source: 'portraits'
    };
  }

  // 如果是 http URL，返回 URL
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return {
      dataUrl: filePath,
      base64: '',
      mimeType: 'image/png',
      width: 300,
      height: 200,
      success: true,
      source: 'url'
    };
  }

  // 使用 ImageReader 插件读取文件
  try {
    const result = await ImageReader.readImage({
      filePath,
      maxWidth,
      maxHeight
    });

    if (result?.success && result?.dataUrl) {
      return {
        ...result,
        source: 'file'
      };
    }

    return { dataUrl: '', success: false, error: 'ImageReader failed' };
  } catch (e) {
    console.error('ImageReader error:', e);
    return { dataUrl: '', success: false, error: e.message };
  }
}

export { ImageReader };