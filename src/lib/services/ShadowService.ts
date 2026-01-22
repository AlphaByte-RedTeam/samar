import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { ConfigManager } from '../ConfigManager.js';

export class ShadowService {
  private projectRoot: string;
  private shadowRoot: string;
  private config: ConfigManager;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    this.config = new ConfigManager(this.projectRoot);
    
    // Create a unique temp path: e.g., /tmp/samar-projectname-123456
    const projectName = path.basename(this.projectRoot);
    const uniqueId = Date.now().toString(36);
    this.shadowRoot = path.join(os.tmpdir(), `samar-${projectName}-${uniqueId}`);
  }

  public getShadowPath(): string {
    return this.shadowRoot;
  }

  public async initialize(dryRun: boolean = false): Promise<void> {
    if (dryRun) {
      console.log(chalk.magenta('🔍 DRY RUN: Simulating Shadow Creation...'));
    } else {
      // 1. Create the shadow directory
      await fs.ensureDir(this.shadowRoot);
    }
    
    // 2. Walk the project structure
    await this.copyRecursive(this.projectRoot, this.shadowRoot, dryRun);
  }

  private async copyRecursive(src: string, dest: string, dryRun: boolean) {
    const items = await fs.readdir(src);

    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      
      let stats;
      try {
        stats = await fs.stat(srcPath);
      } catch (e) {
        continue; // Skip invalid files
      }

      // 1. Priority: Heavy Directories -> SYMLINK (Even if ignored by git)
      if (stats.isDirectory() && this.config.isHeavy(item)) {
        if (dryRun) {
           console.log(chalk.yellow(`  [LINK]    ${item} -> (Symlink)`));
        } else {
          try {
             await fs.ensureSymlink(srcPath, destPath, os.platform() === 'win32' ? 'junction' : 'dir'); 
          } catch (error) {
             console.warn(chalk.yellow(`Could not link ${item}, falling back to copy.`));
             await fs.copy(srcPath, destPath);
          }
        }
        continue; // Done with this item
      }

      // 2. Priority: Ignored Files -> SKIP
      if (this.config.isIgnored(srcPath)) {
        if (dryRun) console.log(chalk.red(`  [IGNORED] ${item}`));
        continue; 
      }

      // 3. Priority: Normal Files/Dirs -> COPY
      if (stats.isDirectory()) {
        if (dryRun) {
          console.log(chalk.blue(`  [DIR]     ${item}`));
        } else {
          await fs.ensureDir(destPath);
        }
        await this.copyRecursive(srcPath, destPath, dryRun);
      } else {
        if (dryRun) {
          console.log(chalk.cyan(`  [FILE]    ${item}`));
        } else {
          await fs.copy(srcPath, destPath);
        }
      }
    }
  }

  public async cleanup() {
    try {
      await fs.remove(this.shadowRoot);
      console.log(chalk.gray(`Cleaned up shadow workspace: ${this.shadowRoot}`));
    } catch (e) {
      console.error(chalk.red('Failed to clean up shadow workspace.'));
    }
  }
}
