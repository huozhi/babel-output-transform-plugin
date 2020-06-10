const babel = require('@babel/core')
const {SourceMapSource, RawSource} = require('webpack-sources');

class BabelOutputTransformPlugin {
  constructor(options) {
    this.options = Object.assign({test: /\.js$/}, options);
    this.plugin = {name: 'BabelOutputTransformPlugin'};
  }

  apply(compiler) {
    const {test, babelOptions = {}} = this.options;

    const optimizeFn = (compilation, chunks) => {
      const files = Array.from(chunks).reduce((files, chunk) => files.concat(chunk.files), [])
        .concat(compilation.additionalChunkAssets || []);

      const assets = compilation.assets;
      const jsFiles = files.filter(f => test.test(f));
      jsFiles.forEach(filename => {
        try {
          const asset = assets[filename];
          let input;
          let inputSourceMap;
          if (asset.sourceAndMap) {
            const {source, map} = asset.sourceAndMap();
            input = source;
            inputSourceMap = map;
            babelOptions.inputSourceMap = map;
          } else {
            inputSourceMap = asset.map();
            input = asset.source();
          }
          const {code, map} = babel.transformSync(input, babelOptions);
          compilation.assets[filename] = map ?
            new SourceMapSource(code, filename, map, input, inputSourceMap) :
            new RawSource(code);
        } catch (e) {
          compilation.errors.push(e);
        }
      });
    }

    const compilationFn = compilation => {
      const {options, plugin} = this;

      if (compilation.hooks) {
        if (options.sourceMap) {
          compilation.hooks
            .buildModule
            .tap(plugin, (module) => {
              module.useSourceMap = true;
            });
        }

        // NOTE: if you put terser in plugins, it will cause memory leak or timeout
        // optimize.minimize will execute after chunk assets which break mangle property process
        // so we put it in `afterOptimizeChunkAssets` hook step
        compilation.hooks
          .afterOptimizeChunkAssets
          .tap(plugin, (chunks) => {
            optimizeFn(compilation, chunks);
          })
      } else {
        if (options.sourceMap) {
          compilation.plugin('build-module', (module) => {
            module.useSourceMap = true;
          });
        }

        compilation.plugin('optimize-chunk-assets', (chunks, callback) => {
          optimizeFn(compilation, chunks);
          callback();
        });
      }
    }

    if (compiler.hooks) {
      const {compilation} = compiler.hooks;
      compilation.tap(this.plugin, compilationFn);
    } else {
      compiler.plugin('compilation', compilationFn);
    }
  }
}

module.exports = BabelOutputTransformPlugin
