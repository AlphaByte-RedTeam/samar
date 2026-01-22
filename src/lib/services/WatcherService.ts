import chokidar from 'chokidar';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { ConfigManager } from '../ConfigManager.js';

export class WatcherService {
  private projectRoot: string;
  private shadowRoot: string;
  private config: ConfigManager;
  
  // These sets act as our "Echo Cancellation" system
  private pendingShadowSyncs = new Set<string>();
  private pendingRealSyncs = new Set<string>();
  private strictMode: boolean;

  constructor(projectRoot: string, shadowRoot: string, strictMode: boolean = false) {
    this.projectRoot = projectRoot;
    this.shadowRoot = shadowRoot;
    this.strictMode = strictMode;
    this.config = new ConfigManager(projectRoot);
  }

  public async start() {
    console.log(chalk.cyan('👀 Watchers started. Syncing active...'));
    if (this.strictMode) {
      console.log(chalk.bgRed.white.bold(' 🛡️ STRICT MODE ACTIVE: Secrets in Shadow will be destroyed. '));
      await this.initialStrictSweep();
    }

    // 1. Watch REAL Project (Source of Truth)
    const realWatcher = chokidar.watch(this.projectRoot, {
      ignored: (path) => this.config.isIgnored(path),
      ignoreInitial: true,
      persistent: true
    });

    realWatcher.on('all', (event, filePath) => this.handleRealChange(event, filePath));

    // 2. Watch SHADOW Workspace (Agent's Playground)
    const shadowWatcher = chokidar.watch(this.shadowRoot, {
      ignoreInitial: true,
      persistent: true
    });

    shadowWatcher.on('all', (event, filePath) => this.handleShadowChange(event, filePath));
  }

  private async initialStrictSweep() {
    const sweep = async (dir: string) => {
      const items = await fs.readdir(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.relative(this.shadowRoot, fullPath);
        const targetPath = path.join(this.projectRoot, relativePath);

        if (this.config.isIgnored(targetPath)) {
          try {
            await fs.remove(fullPath);
            console.warn(chalk.red(`🔥 STRICT MODE: Purged existing forbidden file: ${relativePath}`));
          } catch (e) {
            // Ignore errors for system files or links
          }
          continue;
        }

        const stats = await fs.lstat(fullPath);
        if (stats.isDirectory() && !stats.isSymbolicLink()) {
          await sweep(fullPath);
        }
      }
    };
    await sweep(this.shadowRoot);
  }

  private async handleRealChange(event: string, sourcePath: string) {
    // Calculate relative path to map it to shadow
    const relativePath = path.relative(this.projectRoot, sourcePath);
    const targetPath = path.join(this.shadowRoot, relativePath);

    // Check if this was an echo from a shadow sync
    if (this.pendingRealSyncs.has(sourcePath)) {
      this.pendingRealSyncs.delete(sourcePath);
      return;
    }

    if (this.config.isIgnored(sourcePath)) return;

    try {
      // Mark this path so the Shadow Watcher ignores the incoming change
      this.pendingShadowSyncs.add(targetPath);

      if (event === 'unlink' || event === 'unlinkDir') {
        await fs.remove(targetPath);
        // console.log(chalk.gray(`Sync -> Shadow (Deleted): ${relativePath}`));
      } else {
        await fs.copy(sourcePath, targetPath);
        console.log(chalk.blue(`Sync -> Shadow: ${relativePath}`));
      }
    } catch (err) {
      console.error(chalk.red(`Error syncing to shadow: ${err}`));
    }
  }

  private async handleShadowChange(event: string, sourcePath: string) {
    const relativePath = path.relative(this.shadowRoot, sourcePath);
    const targetPath = path.join(this.projectRoot, relativePath);

    // Check if this was an echo from a real sync
    if (this.pendingShadowSyncs.has(sourcePath)) {
      this.pendingShadowSyncs.delete(sourcePath);
      return;
    }

    // SECURITY CHECK: Is the agent trying to write a secret?
    if (this.config.isIgnored(targetPath)) {
      if (this.strictMode && event !== 'unlink' && event !== 'unlinkDir') {
        try {
          await fs.remove(sourcePath);
          console.warn(chalk.red(`🔥 STRICT MODE: Incinerated forbidden file in Shadow: ${relativePath}`));
        } catch (e) {
          console.error(chalk.red(`Failed to delete forbidden file: ${relativePath}`));
        }
      } else {
        console.warn(chalk.red(`🛑 BLOCKED: Agent tried to modify ignored file: ${relativePath}`));
      }
      return;
    }

    try {
      // Mark this path so the Real Watcher ignores the incoming change
      this.pendingRealSyncs.add(targetPath);

      if (event === 'unlink' || event === 'unlinkDir') {
        await fs.remove(targetPath);
        // console.log(chalk.gray(`Sync <- Real (Deleted): ${relativePath}`));
      } else {
        await fs.copy(sourcePath, targetPath);
        console.log(chalk.green(`Sync <- Real: ${relativePath}`));
      }
    } catch (err) {
      console.error(chalk.red(`Error syncing to real: ${err}`));
    }
  }
}
