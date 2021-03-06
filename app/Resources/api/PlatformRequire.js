/*
 * Copyright (c) 2011-2014 YY Digital Pty Ltd. All Rights Reserved.
 * Please see the LICENSE file included with this distribution for details.
 */

var log = require("/api/Log"),
    utils = require("/api/Utils"),
    densityFile = require("/api/DensityAssets"),
    os = Ti.Platform.osname,
    _ = require("/lib/underscore"),
    global_context = this,
    global_keys,
    cache={},
    spys = {};

/*
 * require() override
 */
function custom_require(file) {
  try {
    log.info("Requiring: " + file);
    var rfile = Ti.Filesystem.getFile(file);
    var contents = rfile.read().text;
    return eval("(function(exports){var __OXP=exports;var module={'exports':exports};" + contents + ";if(module.exports !== __OXP){return module.exports;}return exports;})({})");
  } catch(e) {
    e.file=file;
    log.error(utils.extractExceptionData(e));
  }
}

exports.require = function(extension) {
  try {
    // Full Path
    var path = exports.file(extension + ".js");
    // Assuming that it is a native module if the path does not exist
    if (!Ti.Filesystem.getFile(path).exists()) {
      log.debug("Native module:" + extension);
      return require(extension);
    }
    // Is the CommonJS module in the cache
    if (cache[path]) {
      return cache[path];
    }
    var mod = custom_require(path);
    cache[path] = mod;
    return mod;
  } catch(e) {
    log.error(utils.extractExceptionData(e));
  }
};

/*
 * Ti.include() override (only used once in /api/TiShadow.js));
 */
exports.include = function(context, file) {
  try {
    var path = exports.file(file);
    var ifile = Ti.Filesystem.getFile(path);
    var contents = ifile.read().text;
    eval.call(context || global_context, contents);
  } catch(e) {
    log.error(utils.extractExceptionData(e));
  }
};
/*
 * Read all file content
 */
exports.fileContent = function(context) {
  var contents="";
  for (var i = 0, length = arguments.length; i< length; i++) {
    var path = exports.file(arguments[i]);
    var ifile = Ti.Filesystem.getFile(path);
    contents += ifile.read().text + "\n";
  }
  return contents;
};

/*
 * Asset Redirection
 */
exports.file = function(extension) {
  console.warn(extension);
  if (_.isArray(extension)) {
    return extension.map(exports.file);
  } else if (typeof extension !== "string") {
    return extension;
  }
  var base = Ti.Filesystem.applicationDataDirectory + require("/api/TiShadow").currentApp + "/";
  if (extension.indexOf(base) !== -1) {
    extension = extension.replace(base,"");
  }
  if (extension.indexOf("://") !== -1) {
    return extension;
  }
  var path = base + extension.replace(/^\//, ''),
  platform_path =  base + (os === "android" ? "android" : "iphone") + "/" + extension.replace(/^\//, '');
  var isImage = extension.toLowerCase().match("\\.(png|jpg)$");
  if (!isImage) {
    var file = Ti.Filesystem.getFile(platform_path);
    if (file.exists()) {
      return platform_path;
    }
  } else {
    var platform_dense = densityFile.find(platform_path);
    if (null !== platform_dense) {
      return platform_dense;
    }
    // might be a badly organised projects, so need to check no platform paths for density assets as well
    var image_dense = densityFile.find(path);
    if (null !== image_dense) {
      return image_dense;
    }
  }

  if (Ti.Filesystem.getFile(path).exists()) {
    return path;
  }
  return extension;
};

/*
 * Asset Redirection - ByPass for file method.
 * Parses the whole list of argument and merges them using a safe structure
 */
exports.getFile = function() {
  var extension = '';
  for(var i=0; i<arguments.length; i++){
  	var argument = arguments[i];
  	//Only adds a slash when left arguments don't have it
  	if(extension.charAt(extension.length-1) != '/' && argument.charAt(0) != '/' && i != 0){
	  extension += '/' + argument;
  	} else {
  	  extension += argument;
  	}
  }
  return exports.file(extension);
};

/*
 * clear require and global cache
 */
// if a list of files is provided it will selectively clear the cache
exports.clearCache = function (list) {
  if (_.isArray(list)) {
    list.forEach(function(file) {
      if (file.match(".js$")) {
        cache[exports.file(file)] = null;
      }
    });
  } else {
    cache = {};
  }
  for (var a in global_context) {
    if (global_context.hasOwnProperty(a) && !_.contains(global_keys, a)) {
      delete global_context[a];
    }
  }
};

/*
 * clear require and global cache using a regular expression. any file
 * that matches will be removed.
 */
exports.clearCacheWithRegEx = function (regex) {
  for (var key in cache) {
    if (cache.hasOwnProperty(key) && key.match(regex)) {
      log.debug('Clearing: ' + key + ' from the require cache');
      delete cache[key];
    }
  }
  for (var a in global_context) {
    if (global_context.hasOwnProperty(a) && !_.contains(global_keys, a) && a.match(regex)) {
      log.debug('Clearing: ' + a + ' from global context');
      delete global_context[a];
    }
  }
};

/*
 * new repl
 */
exports.eval = function(message) {
  try {
    __log.repl(eval.call(global_context, message.code));
  } catch (e) {
    __log.error(require('/api/Utils').extractExceptionData(e));
  }
};

exports.addSpy = function(name,spy) {
  spys[name]=spy;
  global_context.me = spy;
};
exports.removeSpy = function(name,spy) {
  spys[name]=spy;
};

/*
 * inject global functions
 */
(function(context) {
  context.__log = require('/api/Log');
  context.__p = exports;
  context.__ui = require('/api/UI');
  context.__app = require('/api/App');
  context.__L = require('/api/Localisation').fetchString;
  context.assert = require('/api/Assert');
  context.closeApp =require('/api/TiShadow').closeApp;
  context.launchApp = require('/api/TiShadow').nextApp;
  context.clearCache = require('/api/TiShadow').clearCache;
  context.runSpec = function() {
    var path_name = require('/api/TiShadow').currentApp.replace(/ /g,"_");
    require("/api/Spec").run(path_name, false);
  };
  context.addSpy = exports.addSpy;
  context.getSpy = function(name) {
    return spys[name];
  };
  context.Ti.Shadow = true;
})(global_context);
//Needed for Android
Ti.Shadow = true;
global_keys = _.keys(global_context);
