const path = require('path');
const webpack = require('webpack');
const Dotenv = require('dotenv-webpack');

module.exports = {
  entry: {
    polyfills: './src/polyfills',
    index: './src/index.ts'
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /(bower_components|dojo)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      {
        test: /\.ts(x?)$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser',
    }),
    new Dotenv()
    // , new webpack.ProvidePlugin({
    //     'fetch': 'imports?this=>global!exports?global.fetch!whatwg-fetch'
    // })
  ],
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js'
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist')
    },
    compress: false,
    port: 3333
  },
  optimization: {
    minimize: false
  },
};
