import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import cleanup from 'rollup-plugin-cleanup';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

// Copy appsscript.json to build directory
function copyAppsScriptJson() {
  return {
    name: 'copy-appsscript-json',
    buildEnd() {
      mkdirSync('build', { recursive: true });
      copyFileSync('src/appsscript.json', 'build/appsscript.json');
    }
  };
}

// Add top-level function declarations after the bundle
function addTopLevelFunctions() {
  return {
    name: 'add-top-level-functions',
    writeBundle() {
      const bundlePath = 'build/Code.js';
      let code = readFileSync(bundlePath, 'utf-8');

      // Append top-level declarations after the IIFE
      code += `

// Export to global scope for Google Apps Script
var ChecklistApp = Bundle.ChecklistApp;
var ChecklistMeta = Bundle.ChecklistMeta;
var Settings = Bundle.Settings;
var Status = Bundle.Status;
var Formula = Bundle.Formula;
var time = Bundle.time;
var timeEnd = Bundle.timeEnd;

// Add SheetBase to ChecklistApp namespace for backward compatibility
ChecklistApp.SheetBase = Bundle.SheetBase;

// Top-level functions required by Google Apps Script
function onOpen(e) { return Bundle.onOpen(e); }
function onEdit(e) { return Bundle.onEdit(e); }
function handleEdit(e) { return Bundle.handleEdit(e); }
function handleChange(e) { return Bundle.handleChange(e); }
function AttachTriggers() { return Bundle.AttachTriggers(); }
function CalculatePreReqs() { return Bundle.CalculatePreReqs(); }
function LinkPreReqs() { return Bundle.LinkPreReqs(); }
function ResetChecklist(checklist) { return Bundle.ResetChecklist(checklist); }
function ProcessMeta() { return Bundle.ProcessMeta(); }
function CreateMetaSheet() { return Bundle.CreateMetaSheet(); }
`;

      writeFileSync(bundlePath, code);
    }
  };
}

export default {
  input: 'src/index.ts',
  output: {
    file: 'build/Code.js',
    format: 'iife',
    name: 'Bundle',
    banner: '/* Games Checklist - Bundled with Rollup */',
  },
  plugins: [
    resolve(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
    }),
    cleanup({
      comments: 'none',
      extensions: ['js', 'ts'],
    }),
    copyAppsScriptJson(),
    addTopLevelFunctions(),
  ],
};
