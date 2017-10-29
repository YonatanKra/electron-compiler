#!/usr/bin/env node

const path = require("path");
const fs = require("fs-extra");
const util = require("util");
const prompt = require("prompt");
const child_process = require("child_process");

const colors = require("colors");
const zipFolder = require("zip-folder");
const pkgInfo = require('pkginfo')(module);
const builder = require("electron-builder");
const beautify = require("js-beautify").js_beautify;
const removeEmptyDirs = require("remove-empty-directories");

const appDir = "./app/";
const releasesDir = "./releases";
const cachedDependsDir = "./cached_node_modules";

const babelPath = path.normalize("node_modules/.bin/babel");
const minifyPath = path.normalize("node_modules/.bin/minify");

let repoDir = "";
let srcDir = "";
let configPath = "";
let packagePath = "";

let config = {};
let packageJSON = {};

let platforms = [];

const validPlatforms =
	[
		"win32",
		"linux",
		"darwin"
	];

let ignoreList = IgnoreList();

function IgnoreList()
{
	let list = [];

	function search(searchItem)
	{
		for (let cnt = 0; cnt < list.length; cnt++)
		{
			const item = list[cnt];

			if (item === searchItem)
				return cnt;

			if (item.slice(-1) == "/")
			{
				searchItem = searchItem.replace("\\", "/");

				if (searchItem.indexOf(item) === 0)
					return cnt;
			}
			else
			{
				if (searchItem === path.parse(item).base)
					return cnt;
			}
		}

		return -1;
	}

	return {
		set: function (ignoreList)
		{
			if (ignoreList === undefined)
				return;

			list = ignoreList;
		},

		get: function ()
		{
			return list;
		},

		search: function (searchItem)
		{
			return search(searchItem);
		}
	};
}

function logTitle()
{
	if (arguments.length === 0)
		return;

	console.log("");
	console.log(util.format.apply(util, arguments));
	console.log("");
}

function logError()
{
	if (arguments.length === 0)
		return;

	arguments[0] = colors.red(arguments[0]);
	console.log(util.format.apply(util, arguments));
}

function displayWelcome()
{
	console.log("");
	console.log("Welcome!!!!");
	console.log("electron-compiler %s", module.exports.version);
	console.log("-----------------------");
	console.log("");
}

function readEnvironment()
{
	if (process.argv.length < 3)
	{
		logError("Applicaton path not found.");
		return false;
	}

	repoDir = process.argv[2].replace("\"", "");

	let stats = null;

	try
	{
		stats = fs.statSync(repoDir);

		if (!stats.isDirectory())
		{
			logError("%s is not a valid directory.", repoDir);
			return false;
		}

	}
	catch (error)
	{
		logError("%s is not a valid directory. %s", repoDir, error);
		return false;
	}

	packagePath = path.join(repoDir, "package.json");

	try
	{
		stats = fs.statSync(packagePath);

		if (!stats.isFile())
		{
			logError("package.json was not found in %s.", repoDir);
			return false;
		}
	}
	catch (error)
	{
		logError("package.json was not found in %s.", repoDir);
		return false;
	}

	try
	{
		packageJSON = JSON.parse(fs.readFileSync(packagePath));
	}
	catch (error)
	{
		logError("Failed to parse package.json. %s", error);
		return false;
	}

	configPath = path.join(repoDir, "electron_compiler.json");

	try 
	{
		config = JSON.parse(fs.readFileSync(configPath));
	}
	catch (error)
	{
		logError("Failed to parse electron_compiler.json.");
		return false;
	}

	ignoreList.set(config.ignoreList);

    srcDir = config.srcDir === undefined ? repoDir : config.srcDir;

	config.appName = packageJSON.productName;

	if (config.appName === undefined || config.appName.length === 0)
		config.appName = packageJSON.name;

	if (config.versionString === undefined)
	{
		config.versionString =
			{
				"CompanyName": "",
				"FileDescription": "",
				"OriginalFilename": "",
				"ProductName": "",
				"InternalName": ""
			};
	}

	if (config.uglifyList === undefined)
		config.uglifyList = [];

	if (config.verifyConfig === undefined)
		config.verifyConfig = true;
	
	if (config.archiveOutput === undefined)
		config.archiveOutput = true;

	if (!detectPlatforms())
		return false;

	dumpConfig();
	console.log("");
	testPaths();

	return true;
}

function detectPlatforms()
{
	return true;
	if (config.platforms === undefined || config.platforms.length === 0)
	{
		console.log("Specify at least one platform to build for.");
		return false;
	}

	let success = true;

	config.platforms.forEach(
		function (item)
		{
			if (!success)
				return;

			if (validPlatforms.indexOf(item) === -1)
			{
				console.log("%s is not a valid platform.", item);
				success = false;

				return;
			}

			const platform =
				{
					"name": item,
					"done": false
				};

			platforms.push(platform);
		});

	return success;
}

function dumpConfig()
{
	console.log("Application: %s", config.appName);
	console.log("Current version: %s", packageJSON.version);
	console.log("");
	//console.log("Building for: %s", config.platforms.join(", "));

	if (ignoreList.get().length > 0)
		console.log("Ignoring: %s", ignoreList.get().join(", "));

	if (config.uglifyList.length > 0)
		console.log("Uglifying: %s", config.uglifyList.join(", "));
}

function testPaths()
{
	config.uglifyList.forEach(
		function (item)
		{
			item = path.join(repoDir, item);

			try
			{
				fs.statSync(item);
			}
			catch (error)
			{
				logError("Invalid path in uglify list: %s. %s", item, error);
			}
		});

	ignoreList.get().forEach(
		function (item)
		{
			item = path.join(repoDir, item);

			try
			{
				fs.statSync(item);
			}
			catch (error)
			{
				logError("Invalid path in ignore list: %s. %s", item, error);
			}
		});
}

function verifyConfig(callback)
{
	if (!config.verifyConfig)
	{
		callback(true);
		return;
	}

	console.log("");

	const schema =
		{
			"properties":
			{
				"startBuild":
				{
					"description": "Start build?",
					"type": "string",
					"default": "y",
					"required": true
				}
			}
		};

	prompt.get(schema,
		function (err, result)
		{
			console.log(result.startBuild);

			if (result.startBuild === "y")
			{
				callback(true);
				return;
			}

			callback(false);
		});
}

function clean()
{
	logTitle("Cleaning build environment...");

	console.log("Removing %s", appDir);

	try
	{
		fs.removeSync(appDir);
	}
	catch (error)
	{
		logError("Failed to remove %s. %s", appDir, error);
		return false;
	}

	console.log("Build environment cleaned.");
	return true;
}

function copyRepo()
{
	logTitle("Copying repository to build environment...");

	function isItemAllowed(item)
	{
		item = path.relative(repoDir, item);

		if (item === "")
			return true;

		if (ignoreList.search(item) > -1)
			return false;

		console.log("Copying %s...", item);
		return true;
	}

	let options =
		{
			"filter": isItemAllowed
		};

	try
	{
		console.log(repoDir);
		console.log(appDir);
		console.log(options);
		fs.copySync(srcDir, appDir, options);
		// create the package json file inside the copied dir
		// fs.writeFileSync(appDir + 'package.json', JSON.stringify(packageJSON));
	}
	catch (error)
	{
		logError("Failed to copy repository to %s. %s", appDir, error);
		return false;
	}

	console.log("");
	console.log("Removing empty directories...");

	removeEmptyDirs(appDir);

	console.log("");
	console.log("Application copied to %s", appDir);

	return true;
}

/**
 * @description recursively uglifies a directory and its sub directories
 * @param dirPath
 */
function uglifyDir(dirPath)
{
	try
	{
		let dirItems = fs.readdirSync(dirPath);

		dirItems.forEach(
			function (item)
			{
				let fullPath = path.join(dirPath, item);
				let stats = fs.statSync(fullPath);

				if (stats.isDirectory())
				{
					uglifyDir(fullPath);
				}
				else
				{
					uglifyFile(fullPath);
				}
			});
	}
	catch (error)
	{
		console.log("Failed to read directory %s. %s", dirPath, error);
	}
}

function uglifyFile(filePath)
{
	console.log("Uglifying %s...", filePath);

	let options =
		{
			"stdio": "inherit"
		};

	let cmd = "";

	switch (path.parse(filePath).ext)
	{
		case ".js":
			cmd = babelPath + " " + filePath + " --out-file " + filePath + " --presets babili";
			break;

		case ".css":
			cmd = minifyPath + " " + filePath + " --output " + filePath;
			break;

		default:
			logError("%s cannot be uglified.", filePath);
			return false;
	}

	try
	{
		child_process.execSync(cmd, options);
	}
	catch (error)
	{
		logError("Failed to uglify %s. %s", filePath, error);
		return false;
	}

	return true;
}

function uglifyApp()
{
	logTitle("Uglifying source code...");

	let success = true;

	config.uglifyList.forEach(
		function (item)
		{
			if (!success)
				return;

			item = path.join(appDir, item);

			if (item.slice(-1) == path.sep)
			{
				uglifyDir(item);
				return;
			}

			if (!uglifyFile(item))
				success = false;
		});

	return success;
}

function isCachedDepends()
{
	try
	{
		let stats = fs.statSync(cachedDependsDir);

		if (!stats.isDirectory())
			return false;
	}
	catch (error)
	{
		return false;
	}

	return true;
}

function copyCachedDepends()
{
	console.log("Copying cached dependencies...");

	let dest = appDir + "node_modules";

	let options =
		{
			"clobber": false
		};

	try
	{
		fs.copySync(cachedDependsDir, dest, options);
	}
	catch (error)
	{
		logError("Failed to copy cached dependencies. %s", error);
	}
}

function cacheDepends()
{
	console.log("Caching dependencies...");

	let source = appDir + "node_modules";

	let options =
		{
			"clobber": false
		};

	try
	{
		fs.copySync(source, cachedDependsDir, options);
	}
	catch (error)
	{
		logError("Failed to cache dependencies. %s", error);
	}
}

function installDepends()
{
	logTitle("Installing npm dependencies...");

	let useCachedDepends = isCachedDepends();

	if (useCachedDepends)
		copyCachedDepends();

	let options =
		{
			"cwd": appDir,
			"stdio": "inherit"
		};

	try
	{
		child_process.execSync("npm install", options);
	}
	catch (error)
	{
		logError("Failed to install npm dependencies. %s", error);
		return false;
	}

	if (!useCachedDepends)
		cacheDepends();

	return true;
}

function updateVersion()
{
	let version = packageJSON.version.split(".");

	if (version.length < 3)
	{
		logError("Invalid version format.");
		return false;
	}

	let minorVersion = parseInt(version[2]);
	version[2] = ++minorVersion;

	packageJSON.version = version.join(".");
	return true;
}

function isAllPlatformsReady()
{
	let allReady = true;

	platforms.forEach(
		function (platform)
		{
			if (!allReady)
				return;

			if (platform.done)
				return;

			allReady = false;
		});

	return allReady;
}

function archiveOutput(platform, outputPath, callback)
{
	if (!config.archiveOutput ||
		platform === "darwin")
	{
		callback(null);
		return;
	}

	console.log("");
	console.log("Archiving %s output...", platform);

	let archivePath = outputPath + ".zip";

	zipFolder(outputPath, archivePath,
		function (error)
		{
			if (error)
			{
				logError("Failed to archive output for %s. %s", platform);
			}
			else
			{
				console.log("Archived %s output at %s.", platform, archivePath);

				console.log("Removing %s output directory...", platform);
				fs.removeSync(outputPath);
			}

			callback(error);
		});
}

function runPackager(platform, callback)
{
	logTitle("Packaging application for %s...", platform);

	let iconPath = path.join(repoDir, "icons/icon.");

	switch (platform)
	{
		case "win32":
		case "linux":
			iconPath += "ico";
			break;

		case "darwin":
			iconPath += "icns";
			break;
	}

	let options =
		{
			"dir": appDir,
			"arch": "x64",
			"platform": platform,
			"app-copyright": config.versionString.CompanyName,
			"app-version": packageJSON.version,
			"icon": iconPath,
			"name": config.appName,
			"out": releasesDir,
			"overwrite": true,
			"prune": true,
			"version-string": config.versionString
		};

	packager(options,
		function (error, appPaths)
		{
			if (error !== null)
			{
				logError("Packaging failed for %s. %s", platform, error);

				callback(error);
				return;
			}
			else if (appPaths.length === 0)
			{
				logError("Packaging failed for %s", platform);

				callback(error);
				return;
			}
			else
			{
				console.log("Packaged %s successfully to %s.", platform, appPaths[0]);
			}

			archiveOutput(platform, appPaths[0], callback);
		});
}

function savePackageJSON()
{
	logTitle("Updating package.json in repository...");

	let options =
		{
			"indent_with_tabs": true,
			"brace_style": "expand",
			"end_with_newline": true
		};

	let data = beautify(JSON.stringify(packageJSON), options);

	if (data.length === 0)
	{
		logError("Failed to beautify package.json.");
		return false;
	}

	try
	{
		fs.writeFileSync(packagePath, data);
	}
	catch (error)
	{
		logError("Failed to copy package.json to repository. %s", error);
		return false;
	}

	console.log("Updated package.json in repository.");
	return true;
}

function run(callback)
{
	prompt.start();

	displayWelcome();

	if (!readEnvironment())
	{
		callback();
		return;
	}

	verifyConfig(
		function (startBuild)
		{
			if (!startBuild)
				return;

			build(callback);
		});
}

function build(callback)
{
	if (!clean())
	{
		callback();
		return;
	}

	if (!copyRepo())
	{
		callback();
		return;
	}

	if (!uglifyApp())
	{
		callback();
		return;
	}

	if (!installDepends())
	{
		callback();
		return;
	}

	if (!updateVersion())
	{
		callback();
		return;
	}
return;
	//TODO::change the packageJSON electron builder source dir defs and build
	platforms.forEach(
		function (platform)
		{
			runPackager(platform.name,
				function (error)
				{
					platform.done = true;

					if (isAllPlatformsReady())
					{
						savePackageJSON();
						clean();

						callback();
					}
				}
			);
		});
}

run(
	function (error)
	{
		process.exit();
	});
