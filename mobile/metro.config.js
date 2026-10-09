// Metro loads this configuration as CommonJS, as in Expo's configuration template.
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Shared runtime helpers live outside the mobile root. They have no dependencies;
// watch only this folder, without exposing the web application's dependencies.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../shared')];

module.exports = config;
