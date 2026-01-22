import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export class InitService {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  public async run() {
    const configPath = path.join(this.projectRoot, '.samarignore');
    
    if (fs.existsSync(configPath)) {
      // Silent success - don't spam the user every time they run 'watch'
      return;
    }

    const defaultContent = `# Samar Ignore File
# Patterns here will be HIDDEN from the Shadow Workspace.

# Build Artifacts (Recommended to symlink via ConfigManager instead of copying)
node_modules/
.next/
dist/
build/
.cache/

# Environment & Secrets (ALWAYS IGNORED by default, but listed here for clarity)
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Git
.git/

# OS Files
.DS_Store
Thumbs.db
`;

    try {
      await fs.writeFile(configPath, defaultContent);
      console.log(chalk.green('✅ Created .samarignore with smart defaults.'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to create .samarignore:'), error);
    }
  }
}
