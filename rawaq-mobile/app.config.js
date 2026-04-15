const appJson = require('./app.json')

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  undefined

module.exports = ({ config = {} } = {}) => ({
  ...appJson.expo,
  ...config,
  android: {
    ...appJson.expo.android,
    ...(config.android || {}),
    ...(googleMapsApiKey
      ? {
          config: {
            ...(appJson.expo.android?.config || {}),
            ...(config.android?.config || {}),
            googleMaps: {
              apiKey: googleMapsApiKey,
            },
          },
        }
      : {}),
  },
})
