const path = require('path');
const fs = require('fs');
const { VitePlugin } = require('@electron-forge/plugin-vite');
const { MakerSquirrel } = require('@electron-forge/maker-squirrel');
const { MakerZIP } = require('@electron-forge/maker-zip');

const bundledLiteLLMRuntimePath = fs.realpathSync.native(path.join(__dirname, 'build-resources', 'llmrt'));

module.exports = {
  packagerConfig: {
    name: 'memoQ AI Gateway',
    executableName: 'memoQ AI Gateway',
    appBundleId: 'com.memoq.gateway',
    icon: path.join(__dirname, 'images', 'icon'),
    extraResource: [
      path.join(__dirname, 'src'),
      path.join(__dirname, 'node_modules'),
      path.join(__dirname, '..', 'shared-contracts', 'desktop-contract.json'),
      path.join(__dirname, 'build-resources', 'memoq-integration', 'ClientDevConfig.xml'),
      path.join(__dirname, 'build-resources', 'memoq-integration', 'MemoQ.AIGateway.Plugin.dll'),
      bundledLiteLLMRuntimePath,
    ],
  },
  makers: [
    new MakerSquirrel({
      setupExe: 'memoQ-AI-Gateway-Setup.exe',
      setupIcon: path.join(__dirname, 'images', 'icon.ico'),
      noMsi: true,
    }),
    new MakerZIP({}, ['win32']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.js',
          config: 'vite.main.config.mjs',
          target: 'main',
        },
        {
          entry: 'src/preload.js',
          config: 'vite.preload.config.mjs',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mjs',
        },
      ],
    }),
  ],
};
