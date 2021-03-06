'use strict';

const path = require('path');
const debounce = require('debounce');
const multimatch = require('multimatch');
const rimraf = require('mz-modules/rimraf');
const fs = require('mz/fs');


module.exports = agent => {
  const logger = agent.logger;
  const baseDir = agent.config.baseDir;
  const config = agent.config.development;

  let watchDirs = config.overrideDefault ? [] : [
    'app',
    'config',
    'mocks',
    'mocks_proxy',
    'app.js',
  ];

  watchDirs = watchDirs.concat(config.watchDirs).map(dir => path.join(baseDir, dir));

  const ignoreReloadFileDirs = [
    'app/views',
    'app/view',
    'app/assets',
    'app/public',
  ].concat(config.ignoreDirs).map(dir => path.join(baseDir, dir));

  // watch dirs to reload worker, will debounce 200ms
  agent.watcher.watch(watchDirs, debounce(reloadWorker, 200));

  // clean all timing json
  agent.beforeStart(async () => {
    const rundir = agent.config.rundir;
    const files = await fs.readdir(rundir);
    for (const file of files) {
      if (!/^(agent|application)_timing/.test(file)) continue;
      await rimraf(path.join(agent.config.rundir, file));
    }
  });

  // add simple lifecycle beforeReload
  const scopeList = [];
  agent.beforeReload = async function(scope) {
    scopeList.push(scope);
  };

  // run lifecycle beforeReload function
  async function runBeforeReloadFunc() {
    for (const scope of scopeList) {
      await scope();
    }
  }

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
  async function reloadWorker(info) {
    if (!config.reloadOnDebug) {
      return;
    }

    if (isAssetsDir(info.path) || info.isDirectory) {
      return;
    }

    // don't reload if don't match
    if (config.reloadPattern && multimatch(info.path, config.reloadPattern).length === 0) {
      return;
    }

    // dev lifecycle add BeforeReload events
    await runBeforeReloadFunc();

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
