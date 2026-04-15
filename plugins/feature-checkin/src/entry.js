import CheckInScreen from './CheckInScreen.vue'
import CheckIn7Screen from './CheckIn7Screen.vue'

const CheckinFeatureEntry = {
  id: 'checkin',
  route: 'checkin',
  mount() {
    return {
      type: 'route',
      route: 'checkin',
    }
  },
  resolveRouteConfig(context = {}) {
    const onBack = context.onBackToStart || (() => {})
    const onCheckinResult = context.onCheckinDailyResult || (() => {})

    return {
      component: CheckInScreen,
      props: () => ({
        coins: 0,
      }),
      events: {
        back: onBack,
        'checkin-daily-result': onCheckinResult,
      },
    }
  },
  resolveExtraRouteConfigs() {
    return [
      {
        route: 'checkin7',
        resolveRouteConfig(context = {}) {
          const onBack = context.onBackToStart || (() => {})
          const onResult = context.onCheckin7Result || (() => {})
          return {
            component: CheckIn7Screen,
            props: () => ({
              coins: 0,
            }),
            events: {
              back: onBack,
              'checkin7-result': onResult,
            },
          }
        },
      },
    ]
  },
}

export default CheckinFeatureEntry
