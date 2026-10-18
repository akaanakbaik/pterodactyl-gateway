#!/usr/bin/env node
import { runWizard } from "./wizard.js";

async function main() {
  try {
    await runWizard(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
