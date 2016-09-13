'use strict';

const path = require('path');
const debounce = require('debounce');

module.exports = function(agent) {
  const logger = agent.logger;
  const baseDir = agent.config.baseDir;
  const config = agent.config.development;

  const watchDirs = [
    'app',
    'config',
    'mocks',
    'mocks_proxy',
  ].concat(config.watchDirs).map(dir => path.join(baseDir, dir));

  const ignoreReloadFileDirs = [
    'app/views',
    'app/assets',
    'app/public',
  ].concat(config.ignoreDirs).map(dir => path.join(baseDir, dir));

  // watch dirs to reload worker, will debounce 200ms
  agent.watcher.watch(watchDirs, debounce(reloadWorker, 200));

  /**
   * reload app worker:
   *   [AgentWorker] - on file change
   *    |-> emit reload-worker
   *   [Master] - receive reload-worker event
   *    |-> TODO: Mark worker will die
   *    |-> Fork new worker
   *      |-> kill old worker
   *
   * @param {Object} info - changed fileInfo
   */
  function reloadWorker(info) {
    // don't reload at `egg-bin debug`
    if (process.env.EGG_DEBUG) {
      return;
    }

    if (isAssetsDir(info.path) || !info.isFile) {
      return;
    }

    logger.warn(`[agent:development] reload worker because ${info.path} ${info.event}`);

    process.send({
      to: 'master',
      action: 'reload-worker',
    });
  }

  function isAssetsDir(path) {
    for (const ignorePath of ignoreReloadFileDirs) {
      if (path.startsWith(ignorePath)) {
        return true;
      }
    }
    return false;
  }
};