module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    // react-native-worklets/plugin must remain last: Reanimated 4 relies on it
    // running after every other transform.
    plugins: ['react-native-worklets/plugin'],
  };
};
