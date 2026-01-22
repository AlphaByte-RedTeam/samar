import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { ConfigManager } from '../ConfigManager.js';

export class StatusService {
  private projectRoot: string;
  private config: ConfigManager;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.config = new ConfigManager(projectRoot);
  }

  public async run() {
    console.log(chalk.bold.blue('📊 Analyzing Project Structure...'));
    
    const stats = {
      totalFiles: 0,
      syncedFiles: 0,
      ignoredFiles: 0,
      heavyDirs: 0,
      heavyDirsList: [] as string[]
    };

    const walk = async (dir: string) => {
      const items = await fs.readdir(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.relative(this.projectRoot, fullPath);

        // 1. Check Heavy Dirs
        if (this.config.isHeavy(item)) {
          stats.heavyDirs++;
          stats.heavyDirsList.push(relativePath);
          continue; // Don't walk inside heavy dirs for status check
        }

        // 2. Check Ignored
        if (this.config.isIgnored(fullPath)) {
          stats.ignoredFiles++;
          continue; 
        }

        // 3. Normal Files
        const fileStat = await fs.stat(fullPath);
        if (fileStat.isDirectory()) {
          await walk(fullPath);
        } else {
          stats.totalFiles++;
          stats.syncedFiles++;
        }
      }
    };

    await walk(this.projectRoot);

    console.log(chalk.gray('----------------------------------------'));
    console.log(`📂 Project Root:  ${this.projectRoot}`);
    console.log(`📑 Total Files:   ${stats.totalFiles}`);
    console.log(chalk.gray('----------------------------------------'));
    console.log(chalk.green(`✅ Synced Files:  ${stats.syncedFiles}`));
    console.log(chalk.red(`🚫 Ignored Files: ${stats.ignoredFiles}`));
    console.log(chalk.yellow(`🔗 Heavy Links:   ${stats.heavyDirs} (${stats.heavyDirsList.join(', ') || 'None'})`));
    console.log(chalk.gray('----------------------------------------'));
    
    if (stats.ignoredFiles === 0) {
      console.log(chalk.yellow('⚠️  Warning: No files are being ignored. Ensure your .gitignore or .samarignore is set up!'));
    } else {
      console.log(chalk.cyan('✨ Configuration looks healthy.'));
    }
  }
}
