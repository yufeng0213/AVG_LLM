import { registerPlugin } from '@capacitor/core';

/**
 * Widget背景图片选择插件
 * 允许用户从相册选择PNG图片并保存到文件系统
 */
const WidgetBackgroundPicker = registerPlugin('WidgetBackgroundPicker', {
  web: () => Promise.resolve({
    pickImage: async () => {
      // Web平台模拟：使用文件选择器
      return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/webp';

        input.onchange = async (e) => {
          const file = e.target.files?.[0];
          if (!file) {
            reject(new Error('No file selected'));
            return;
          }

          // Web端返回虚拟路径
          resolve({
            filePath: '/web/virtual/custom_bg.png',
            width: 300,
            height: 200,
            success: true
          });
        };

        input.click();
      });
    }
  })
});

export { WidgetBackgroundPicker };