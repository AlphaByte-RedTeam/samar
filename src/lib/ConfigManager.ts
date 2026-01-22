import fs from 'fs-extra';
import path from 'path';
import ignore from 'ignore';

// The "Ironclad" list of patterns that are ALWAYS ignored for security.
export const SECURITY_IGNORES = [
  '.env*',             // All environment files
  '*.pem',             // Private keys
  '*.key',             // Generic key files
  'id_rsa*',           // SSH keys
  '*.pfx',             // Certificates
  '*.p12',             // Certificates
  '.git',              // Git history (too heavy/dangerous to mess with)
  '.samarignore'       // Samar's own config
];

// Patterns that are heavy and should be SYMLINKED, not copied.
export const DEFAULT_HEAVY_DIRS = [
  'node_modules',
  '.next',
  'dist',
  'build',
  'target', // Rust/Java
  'venv',   // Python
  '.venv',  // Python
  'vendor'  // PHP/Go
];

export class ConfigManager {
  private ig = ignore();
  private heavyDirs = new Set<string>(DEFAULT_HEAVY_DIRS);
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.init();
  }

  private init() {
    // 1. Add Security Rules
    this.ig.add(SECURITY_IGNORES);

    // 2. Read .gitignore if it exists
    const gitignorePath = path.join(this.projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        this.ig.add(content);
      } catch (e) {
        console.warn('⚠️ Could not read .gitignore, proceeding with defaults.');
      }
    }

    // 3. Read .samarignore if it exists (user custom overrides)
    const samarignorePath = path.join(this.projectRoot, '.samarignore');
    if (fs.existsSync(samarignorePath)) {
       try {
        const content = fs.readFileSync(samarignorePath, 'utf-8');
        this.ig.add(content);

        // Check for special "heavy:" comments or similar? 
        // For now, let's just allow a .samarrc or similar for complex config.
      } catch (e) {
        console.warn('⚠️ Could not read .samarignore');
      }
    }
  }

  /**
   * Checks if a file path should be IGNORED (Hidden from Shadow).
   */
  public isIgnored(filePath: string): boolean {
    // ignore package expects relative paths
    const relativePath = path.relative(this.projectRoot, filePath);
    if (!relativePath) return false; // Root directory
    return this.ig.ignores(relativePath);
  }

  /**
   * Checks if a directory is "Heavy" and should be Symlinked.
   */
  public isHeavy(dirName: string): boolean {
    return this.heavyDirs.has(dirName);
  }

  public addHeavyDir(dirName: string) {
    this.heavyDirs.add(dirName);
  }
}
