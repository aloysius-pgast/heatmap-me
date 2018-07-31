import webpack from 'webpack';

/**
 * Function that mutates original webpack config.
 * Supports asynchronous changes when promise is returned.
 *
 * @param {object} config - original webpack config.
 * @param {object} env - options passed to CLI.
 * @param {WebpackConfigHelpers} helpers - object with useful helpers when working with config.
 **/
export default function (config, env, helpers) {
  if (env.production)
  {
      // by default, use '/ui' for production builds
      config.output.publicPath = '/ui/';
      if (undefined !== process.env.publicPath)
      {
          let path = process.env.publicPath.trim();
          if ('' != path)
          {
              // should end with a '/'
              if ('/' != path.substr(-1))
              {
                  path += '/';
              }
              config.output.publicPath = path;
          }
          console.log(`Will use '${path}' as root path`);
      }
  }

  // check if we have ws endpoint in env
  let wsEndpoint = undefined;
  if (undefined !== process.env.wsEndpoint)
  {
      wsEndpoint = process.env.wsEndpoint.trim();
      if ('' == wsEndpoint)
      {
          wsEndpoint = undefined;
      }
  }
  if (undefined !== wsEndpoint)
  {
      console.log(`Will use '${wsEndpoint}' as ws endpoint`);
  }
  // check if we have default theme in env
  let defaultTheme = undefined;
  if (undefined !== process.env.defaultTheme)
  {
      defaultTheme = process.env.defaultTheme.trim();
      if ('' == defaultTheme)
      {
          defaultTheme = undefined;
      }
  }
  if (undefined !== defaultTheme)
  {
      console.log(`Will use '${defaultTheme}' as default theme`);
  }
  // check if we have a title in env
  if (undefined !== process.env.title)
  {
      let title = process.env.title.trim();
      if ('' != title)
      {
          let { plugin } = helpers.getPluginsByName(config, 'HtmlWebpackPlugin')[0];
          plugin.options.title = title;
          if ('' != title)
          {
              console.log(`Will use '${title}' as title`);
          }
      }
  }
  config.plugins.push(new webpack.DefinePlugin({
      'process.env.wsEndpoint': JSON.stringify(wsEndpoint),
      'process.env.defaultTheme': JSON.stringify(defaultTheme)
  }));
}
