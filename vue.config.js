const ScriptSetup = require('unplugin-vue2-script-setup/webpack').default;

module.exports = {
  parallel: false,
  configureWebpack: {
    plugins: [
      ScriptSetup({
      }),
    ],
  },
  chainWebpack(config) {
    config.plugins.delete('fork-ts-checker');
  },
};
