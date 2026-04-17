import { registerPlugin } from '@capacitor/core'

export const MicrophonePermission = registerPlugin('MicrophonePermission', {
  requestPermission: async () => {
    const { requestPermission } = await import('./MicrophonePermission.web.js')
    return requestPermission()
  },
})
