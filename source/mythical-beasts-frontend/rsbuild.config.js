import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    template: './public/index.html',
  },
  source: {
    entry: {
      index: './src/index.js',
    },
  },
  output: {
    distPath: {
      root: 'build',
    },
  },
  server: {
    port: 3000,
  },
  dev: {
    hmr: true,
  },
  tools: {
    htmlPlugin: {
      templateParameters: {
        PUBLIC_URL: process.env.NODE_ENV === 'production' ? '' : '',
      },
    },
  },
  environments: {
    web: {
      source: {
        define: {
          'process.env.REACT_APP_API_URL': JSON.stringify(process.env.REACT_APP_API_URL || '/api'),
          'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
        },
      },
    },
  },
});
