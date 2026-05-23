const Module = require("node:module");
const path = require("node:path");

const originalLoad = Module._load;

const obsidianPkgDir = path.join(__dirname, "..", "node_modules", "obsidian");
const momentPath = require.resolve("moment", { paths: [obsidianPkgDir] });

Module._load = function (request) {
	if (request === "moment") {
		return require(momentPath);
	}

	if (request === "obsidian") {
		const moment = require(momentPath);

		return {
			moment,
			normalizePath: (path) => path,
			requestUrl: async () => ({
				status: 200,
				json: {},
				text: "",
				arrayBuffer: async () => new ArrayBuffer(0),
			}),
			Notice: class {},
			Plugin: class {},
			Setting: class {},
			ButtonComponent: class {},
			PluginSettingTab: class {},
			Modal: class {},
			App: class {},
		};
	}

	if (request === "obsidian-daily-notes-interface") {
		return {
			createDailyNote: async () => ({}),
			getAllDailyNotes: () => new Map(),
			getDailyNote: () => null,
		};
	}

	return originalLoad.apply(this, arguments);
};
