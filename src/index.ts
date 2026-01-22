#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { ShadowService } from './lib/services/ShadowService.js';
import { WatcherService } from './lib/services/WatcherService.js';
import { InitService } from './lib/services/InitService.js';
import { StatusService } from './lib/services/StatusService.js';
import { MCPService } from './lib/services/MCPService.js';

const program = new Command();

program
  .name('samar')
  .description('Shadow Workspace Manager for Safe AI Agent Execution')
  .version('0.0.1');

program
  .command('mcp')
  .description('Start the Samar MCP Server (for AI Agents)')
  .option('-s, --strict', 'Strict Mode: Instantly delete any secrets created in Shadow Workspace')
  .action(async (options) => {
    // CRITICAL: Redirect all stdout logs to stderr so JSON-RPC over stdio works
    const originalLog = console.log;
    console.log = console.error;

    try {
       const projectRoot = process.cwd();
       
       // Ensure init
       const initService = new InitService(projectRoot);
       await initService.run();

       const mcpService = new MCPService(projectRoot, options.strict);
       await mcpService.start();
    } catch (e) {
       console.error("Fatal MCP Error:", e);
       process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize Samar configuration in the current project')
  .action(async () => {
    const initService = new InitService(process.cwd());
    await initService.run();
  });

program
  .command('status')
  .description('Analyze the current project and show what will be synced/ignored')
  .action(async () => {
    const statusService = new StatusService(process.cwd());
    await statusService.run();
  });

program
  .command('watch')
  .description('Start the Samar daemon to sync between Real and Shadow workspaces')
  .option('-d, --dry-run', 'Simulate shadow creation without copying files')
  .option('-s, --strict', 'Strict Mode: Instantly delete any secrets created in Shadow Workspace')
  .action(async (options) => {
    const projectRoot = process.cwd();
    
    // Auto-Init: Ensure configuration exists before starting
    const initService = new InitService(projectRoot);
    await initService.run();

    if (options.dryRun) {
      console.log(chalk.bold.magenta('🕵️  Samar Dry Run Mode'));
      const shadow = new ShadowService(projectRoot);
      await shadow.initialize(true);
      console.log(chalk.gray('----------------------------------------'));
      console.log(chalk.magenta('Done. No files were moved.'));
      process.exit(0);
    }

    const spinner = ora('Initializing Security Layer...').start();

    const shadow = new ShadowService(projectRoot);
    
    try {
      // 1. Initialize Shadow Workspace
      await shadow.initialize(false);
      const shadowPath = shadow.getShadowPath();
      
      spinner.succeed('Shadow Workspace Ready!');
      console.log(chalk.gray('----------------------------------------'));
      console.log(`📂 Real Path:   ${projectRoot}`);
      console.log(`👻 Shadow Path: ${chalk.yellow(shadowPath)}`);
      console.log(chalk.gray('----------------------------------------'));
      console.log(chalk.cyan('👉 Point your AI Agent to the Shadow Path above.'));

      // 2. Start Watcher
      const watcher = new WatcherService(projectRoot, shadowPath, options.strict);
      await watcher.start();

      // 3. Handle Cleanup on Exit
      const cleanup = async () => {
        console.log('\n');
        console.log(chalk.yellow('🛑 Stopping Samar...'));
        await shadow.cleanup();
        console.log(chalk.green('👋 Bye!'));
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      // Keep process alive
      setInterval(() => {}, 1000);

    } catch (error) {
      console.error(chalk.red('❌ Fatal Error:'), error);
      await shadow.cleanup(); // Try to cleanup even on error
      process.exit(1);
    }
  });

program.parse();