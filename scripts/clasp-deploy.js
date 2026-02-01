#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const CONFIG_FILE = ".clasp.local.json";
const CLASP_FILE = ".clasp.json";

// Parse CLI flags
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");
const QUIET = process.argv.includes("--quiet") || process.argv.includes("-q");

/**
 * Log message (respects quiet mode)
 */
function log(message) {
  if (!QUIET)
    console.log(message);
}

/**
 * Debug log (only in verbose mode)
 */
function debug(message) {
  if (VERBOSE)
    console.log(`[DEBUG] ${message}`);
}

/**
 * Create readline interface helper
 */
function createPrompt() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt for user input
 * @param {string} question - The question to ask
 * @param {string} defaultValue - Optional default value
 * @returns {Promise<string>} User's answer
 */
function prompt(question, defaultValue = "") {
  const rl = createPrompt();

  return new Promise((resolve) => {
    const promptText = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Prompt for yes/no confirmation
 * @param {string} question - The question to ask
 * @returns {Promise<boolean>} True if yes, false if no
 */
function confirm(question) {
  const rl = createPrompt();

  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

/**
 * Validate sheet name format
 * @param {string} name - Sheet name to validate
 * @returns {string} Validated name
 * @throws {Error} If name is invalid
 */
function validateSheetName(name) {
  if (!name || name.trim() === "") {
    throw new Error("Sheet name cannot be empty");
  }
  if (!/^[a-z0-9-]+$/i.test(name)) {
    throw new Error("Sheet name can only contain letters, numbers, and hyphens");
  }
  return name.trim();
}

/**
 * Validate Apps Script ID format
 * @param {string} id - Script ID to validate
 * @returns {string} Validated ID
 * @throws {Error} If ID is invalid
 */
function validateScriptId(id) {
  if (!id || !/^[\w-]{30,}$/.test(id)) {
    throw new Error("Invalid Script ID format (should be 30+ alphanumeric characters)");
  }
  return id;
}

/**
 * Find if a scriptId is already used by another sheet
 * @param {object} config - Config object
 * @param {string} scriptId - Script ID to check
 * @returns {string|null} Name of sheet using this scriptId, or null
 */
function findDuplicateScriptId(config, scriptId) {
  return Object.entries(config.sheets).find(
    ([, sheet]) => sheet.scriptId === scriptId,
  )?.[0] || null;
}

/**
 * Save config to file
 * @param {object} config - Config object to save
 * @returns {boolean} True if successful
 */
function saveConfig(config) {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    debug(`Saved config to ${CONFIG_FILE}`);
    return true;
  } catch (error) {
    console.error(`Failed to write ${CONFIG_FILE}:`, error.message);
    return false;
  }
}

/**
 * Check if clasp is installed
 * @returns {boolean} True if clasp is available
 */
function checkClaspInstalled() {
  try {
    execSync("clasp --version", { stdio: "ignore" });
    debug("clasp is installed");
    return true;
  } catch {
    console.error("Error: clasp is not installed");
    console.error("Install it with: npm install -g @google/clasp");
    return false;
  }
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Usage:
  clasp-deploy.js [command] [options]

Commands:
  setup [sheet]     Generate .clasp.json for a sheet (no push)
  push [sheet]      Build and push to a sheet
  add [sheet]       Add a new deployment target
  list              List all configured sheets
  --all             Push to all configured sheets

Options:
  -v, --verbose     Show detailed output
  -q, --quiet       Suppress non-error output
  -h, --help        Show this help message

Examples:
  clasp-deploy.js push               # Interactive sheet selection
  clasp-deploy.js push my-sheet      # Push to specific sheet
  clasp-deploy.js add                # Add new sheet interactively
  clasp-deploy.js list               # Show all configured sheets
  clasp-deploy.js --all              # Push to all sheets
`);
}

/**
 * Create default config file interactively
 * @returns {Promise<object>} Created config object
 */
async function createDefaultConfig() {
  log(`\n${CONFIG_FILE} not found.`);

  const shouldCreate = await confirm("Would you like to create one now?");

  if (!shouldCreate) {
    log("Aborted.");
    process.exit(0);
  }

  log("\nLet's set up your first deployment target.\n");

  const projectId = await prompt("Default Project ID (optional, for GCP association)", "");
  let sheetName = await prompt("Sheet name (identifier)", "main");
  let scriptId = await prompt("Script ID (from Apps Script project)");
  const description = await prompt("Description (optional)", "");

  // Validate inputs
  try {
    sheetName = validateSheetName(sheetName);
    scriptId = validateScriptId(scriptId);
  } catch (error) {
    console.error(`Validation error: ${error.message}`);
    process.exit(1);
  }

  const config = {
    ...(projectId && { projectId }),
    rootDir: "./build",
    sheets: {
      [sheetName]: {
        scriptId,
        ...(description && { description }),
      },
    },
  };

  if (!saveConfig(config)) {
    process.exit(1);
  }

  log(`\n✓ Created ${CONFIG_FILE}`);
  log(`You can add more sheets with: npm run push:add\n`);

  return config;
}

/**
 * Read the local clasp configuration
 * @returns {Promise<object>} Config object
 */
async function readConfig() {
  if (!existsSync(CONFIG_FILE)) {
    return await createDefaultConfig();
  }

  try {
    const config = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    debug(`Loaded config from ${CONFIG_FILE}`);

    // Validate config structure
    if (!config.sheets || typeof config.sheets !== "object") {
      throw new Error("Invalid config: missing or invalid \"sheets\" object");
    }

    return config;
  } catch (error) {
    console.error(`Error reading ${CONFIG_FILE}:`, error.message);
    process.exit(1);
  }
}

/**
 * Generate .clasp.json for a specific target
 * @param {object} config - Config object
 * @param {string} targetName - Name of the target sheet
 */
function generateClaspJson(config, targetName) {
  const target = config.sheets[targetName];

  if (!target) {
    console.error(`Error: Target "${targetName}" not found in ${CONFIG_FILE}`);
    console.error(`Available targets: ${Object.keys(config.sheets).join(", ")}`);
    process.exit(1);
  }

  const projectId = target.projectId || config.projectId;

  const claspConfig = {
    scriptId: target.scriptId,
    ...(projectId && { projectId }), // Only include if projectId exists
    rootDir: config.rootDir,
  };

  writeFileSync(CLASP_FILE, JSON.stringify(claspConfig, null, 2));
  log(`✓ Generated ${CLASP_FILE} for: ${targetName}`);
  if (target.description) {
    log(`  ${target.description}`);
  }
  if (target.projectId) {
    debug(`  Using custom projectId: ${target.projectId}`);
  }
}

/**
 * Push to clasp
 */
function push() {
  log("Pushing to clasp...");
  try {
    execSync("clasp push", { stdio: "inherit" });
    log("✓ Successfully pushed to clasp");
  } catch (_error) {
    console.error("✗ Failed to push to clasp");
    process.exit(1);
  }
}

/**
 * Prompt user to select a target
 * @param {object} config - Config object
 * @returns {Promise<string>} Selected target name
 */
async function promptForTarget(config) {
  const sheets = Object.keys(config.sheets);

  if (sheets.length === 0) {
    console.error(`Error: No sheets configured in ${CONFIG_FILE}`);
    process.exit(1);
  }

  log("\nAvailable sheets:");
  sheets.forEach((name, index) => {
    const sheet = config.sheets[name];
    log(`  ${index + 1}. ${name}${sheet.description ? ` - ${sheet.description}` : ""}`);
  });

  const rl = createPrompt();

  return new Promise((resolve) => {
    rl.question("\nSelect a sheet (number or name): ", (answer) => {
      rl.close();

      // Check if it's a number
      const num = Number.parseInt(answer);
      if (!Number.isNaN(num) && num > 0 && num <= sheets.length) {
        resolve(sheets[num - 1]);
      } else if (sheets.includes(answer)) {
        resolve(answer);
      } else {
        console.error(`Invalid selection: ${answer}`);
        process.exit(1);
      }
    });
  });
}

/**
 * List all configured sheets
 * @param {object} config - Config object
 */
function listSheets(config) {
  const sheets = Object.entries(config.sheets);

  if (sheets.length === 0) {
    log("No sheets configured");
    log("\nAdd a sheet with: npm run push:add");
    return;
  }

  log("\nConfigured sheets:\n");
  sheets.forEach(([name, sheet]) => {
    log(`  ${name}`);
    log(`    Script ID: ${sheet.scriptId}`);
    if (sheet.description)
      log(`    Description: ${sheet.description}`);
    if (sheet.projectId)
      log(`    Project ID: ${sheet.projectId}`);
    log("");
  });
}

/**
 * Add a new sheet to the config
 * @param {object} config - Config object
 * @param {string} sheetName - Optional sheet name
 */
async function addSheet(config, sheetName) {
  log("\nAdding a new deployment target...\n");

  // Prompt for sheet name if not provided
  if (!sheetName) {
    sheetName = await prompt("Sheet name (identifier)");
  }

  // Validate sheet name
  try {
    sheetName = validateSheetName(sheetName);
  } catch (error) {
    console.error(`Validation error: ${error.message}`);
    process.exit(1);
  }

  // Check if sheet already exists
  if (config.sheets[sheetName]) {
    console.error(`Error: Sheet "${sheetName}" already exists`);
    process.exit(1);
  }

  // Prompt for scriptId, description, and optional projectId override
  let scriptId = await prompt("Script ID (from Apps Script project)");
  const description = await prompt("Description (optional)", "");
  const projectIdPrompt = config.projectId
    ? `Project ID override (optional, default: ${config.projectId})`
    : "Project ID (optional)";
  const customProjectId = await prompt(projectIdPrompt, "");

  // Validate scriptId
  try {
    scriptId = validateScriptId(scriptId);
  } catch (error) {
    console.error(`Validation error: ${error.message}`);
    process.exit(1);
  }

  // Check for duplicate scriptId
  const duplicate = findDuplicateScriptId(config, scriptId);
  if (duplicate) {
    console.error(`Error: Script ID already used by sheet "${duplicate}"`);
    process.exit(1);
  }

  // Add to config
  config.sheets[sheetName] = {
    scriptId,
    ...(description && { description }),
    ...(customProjectId && { projectId: customProjectId }),
  };

  // Save config
  if (!saveConfig(config)) {
    process.exit(1);
  }

  log(`\n✓ Added "${sheetName}" to ${CONFIG_FILE}`);
  if (description) {
    log(`  ${description}`);
  }
  log(`\nYou can now deploy to this sheet with:`);
  log(`  npm run push ${sheetName}`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2).filter(arg => !arg.startsWith("-"));
  const command = args[0];

  // Handle help
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    showHelp();
    return;
  }

  // Check if clasp is installed (skip for list command)
  if (command !== "list" && command !== "add") {
    if (!checkClaspInstalled()) {
      process.exit(1);
    }
  }

  // Handle list command
  if (command === "list") {
    const config = await readConfig();
    listSheets(config);
    return;
  }

  // Handle add command
  if (command === "add") {
    const config = await readConfig();
    const sheetName = args[1]; // Optional
    await addSheet(config, sheetName);
    return;
  }

  // Handle --all flag
  if (process.argv.includes("--all")) {
    const config = await readConfig();
    const sheets = Object.keys(config.sheets);

    log(`Pushing to ${sheets.length} sheet(s)...\n`);

    for (const sheetName of sheets) {
      log(`\n=== ${sheetName} ===`);
      generateClaspJson(config, sheetName);
      push();
    }

    log(`\n✓ Successfully pushed to all ${sheets.length} sheet(s)`);
    return;
  }

  const config = await readConfig();
  let targetName = null;

  // Determine target
  if (command === "setup" || command === "push") {
    targetName = args[1];
  } else if (command && config.sheets[command]) {
    // Direct sheet name provided
    targetName = command;
  } else if (command) {
    console.error(`Unknown command or sheet: ${command}`);
    console.error("Run with --help to see usage information");
    process.exit(1);
  }

  // Prompt if no target specified
  if (!targetName) {
    targetName = await promptForTarget(config);
  }

  // Generate .clasp.json
  generateClaspJson(config, targetName);

  // Push if command is 'push' or no command specified
  if (!command || command === "push" || config.sheets[command]) {
    push();
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
