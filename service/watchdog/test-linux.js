const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const mkdir = promisify(fs.mkdir);

async function runTest() {
    console.log("Starting Linux notification test...");

    // 1. Ensure config directory exists
    const appData = process.env['APPDATA'] || (process.platform == 'darwin' ? path.join(process.env.HOME, 'Library', 'Application Support') : path.join(process.env.HOME, '.config'));
    const cfgDir = path.join(appData, "Achievement Watcher/cfg");
    
    console.log(`Config directory: ${cfgDir}`);
    
    try {
        await mkdir(cfgDir, { recursive: true });
        console.log("Config directory created/verified.");
    } catch (err) {
        console.error("Error creating config directory:", err);
    }

    // 2. Load the test module
    try {
        const test = require('./notification-test.js');
        console.log("notification-test.js loaded.");

        // 3. Run the toast test
        console.log("Running toast test...");
        await test.toast();
        console.log("Toast test completed successfully (check for notification).");
    } catch (err) {
        console.error("Test failed:", err);
        process.exit(1);
    }
}

runTest();
