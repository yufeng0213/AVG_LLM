/**
 * 手机主屏天气数据
 * 目前使用静态数据占位，后续可接入真实天气 API
 */
import { ref, computed, onMounted } from 'vue'

// 天气类型映射
const WEATHER_MAP = {
  '晴': { emoji: '☀️', bg: 'linear-gradient(135deg, #f6d365, #fda085)' },
  '多云': { emoji: '⛅', bg: 'linear-gradient(135deg, #a1c4fd, #c2e9fb)' },
  '阴': { emoji: '☁️', bg: 'linear-gradient(135deg, #d4d4d4, #a8a8a8)' },
  '雨': { emoji: '🌧️', bg: 'linear-gradient(135deg, #667eea, #764ba2)' },
  '雪': { emoji: '️', bg: 'linear-gradient(135deg, #e6e9f0, #eef1f5)' },
  '风暴': { emoji: '️', bg: 'linear-gradient(135deg, #2c3e50, #4ca1af)' },
}

export function usePhoneHomeWeather() {
  const weatherData = ref({
    weather: '晴',
    temperature: '24',
    humidity: '60%',
    wind: '微风',
    suggestion: '适合外出活动',
  })

  onMounted(async () => {
    // TODO: 接入真实天气 API
    // 示例接入和风天气 API：
    // const res = await fetch('https://devapi.heweather.net/v7/weather/now?location=CN&key=YOUR_KEY')
    // const data = await res.json()
    // weatherData.value = { ... }
  })

  /**
   * 手动设置天气数据
   * 供后续 UI 配置或 API 回调使用
   */
  function setWeather(data) {
    weatherData.value = { ...weatherData.value, ...data }
  }

  /**
   * 获取天气 emoji 和背景渐变
   */
  const weatherStyle = computed(() => {
    const w = WEATHER_MAP[weatherData.value.weather] || WEATHER_MAP['晴']
    return { emoji: w.emoji, bg: w.bg }
  })

  return {
    weatherData,
    weatherStyle,
    setWeather,
  }
}
