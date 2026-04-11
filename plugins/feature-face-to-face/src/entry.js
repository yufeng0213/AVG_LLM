import FaceToFaceScreen from './FaceToFaceScreen.vue'

const FaceToFaceFeatureEntry = {
  id: 'face-to-face',
  route: 'face-to-face',
  mount() {
    return {
      type: 'route',
      route: 'face-to-face',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: FaceToFaceScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default FaceToFaceFeatureEntry
