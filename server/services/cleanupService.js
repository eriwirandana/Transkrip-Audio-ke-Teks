const cron = require('node-cron');
const fs = require('fs-extra');
const path = require('path');
const winston = require('winston');

class CleanupService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'cleanup' },
      transports: [
        new winston.transports.File({ filename: 'logs/cleanup.log' }),
        new winston.transports.Console()
      ]
    });

    this.config = {
      tempFileRetentionHours: parseInt(process.env.TEMP_FILE_RETENTION_HOURS) || 24,
      processedFileRetentionDays: parseInt(process.env.PROCESSED_FILE_RETENTION_DAYS) || 30,
      logFileRetentionDays: parseInt(process.env.LOG_FILE_RETENTION_DAYS) || 7,
      backupRetentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 90
    };
  }

  start() {
    this.logger.info('Starting cleanup service');

    // Run every hour to clean temp files
    cron.schedule('0 * * * *', () => {
      this.cleanTempFiles();
    });

    // Run daily at 2 AM to clean old files
    cron.schedule('0 2 * * *', () => {
      this.cleanOldFiles();
      this.cleanLogFiles();
      this.cleanBackups();
      this.optimizeStorage();
    });

    // Run weekly on Sunday at 3 AM for deep cleanup
    cron.schedule('0 3 * * 0', () => {
      this.deepCleanup();
    });

    this.logger.info('Cleanup service started with schedules');
  }

  async cleanTempFiles() {
    try {
      this.logger.info('Starting temp files cleanup');
      
      const tempDir = path.join(__dirname, '../uploads/temp');
      
      if (!(await fs.pathExists(tempDir))) {
        return;
      }

      const files = await fs.readdir(tempDir);
      const cutoffTime = Date.now() - (this.config.tempFileRetentionHours * 60 * 60 * 1000);
      let cleanedCount = 0;
      let cleanedSize = 0;

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            cleanedSize += stats.size;
            await fs.remove(filePath);
            cleanedCount++;
            this.logger.debug(`Deleted temp file: ${file}`);
          }
        } catch (error) {
          this.logger.warn(`Failed to process temp file ${file}:`, error);
        }
      }

      this.logger.info(`Temp cleanup completed: ${cleanedCount} files, ${this.formatBytes(cleanedSize)} freed`);
      
    } catch (error) {
      this.logger.error('Temp files cleanup failed:', error);
    }
  }

  async cleanOldFiles() {
    try {
      this.logger.info('Starting old files cleanup');
      
      const directories = [
        { path: path.join(__dirname, '../uploads/audio'), retention: this.config.processedFileRetentionDays },
        { path: path.join(__dirname, '../processed'), retention: this.config.processedFileRetentionDays },
        { path: path.join(__dirname, '../exports'), retention: this.config.processedFileRetentionDays }
      ];

      let totalCleaned = 0;
      let totalSize = 0;

      for (const dir of directories) {
        if (!(await fs.pathExists(dir.path))) {
          continue;
        }

        const files = await fs.readdir(dir.path);
        const cutoffTime = Date.now() - (dir.retention * 24 * 60 * 60 * 1000);

        for (const file of files) {
          const filePath = path.join(dir.path, file);
          
          try {
            const stats = await fs.stat(filePath);
            
            if (stats.mtime.getTime() < cutoffTime) {
              totalSize += stats.size;
              await fs.remove(filePath);
              totalCleaned++;
              this.logger.debug(`Deleted old file: ${filePath}`);
            }
          } catch (error) {
            this.logger.warn(`Failed to process old file ${filePath}:`, error);
          }
        }
      }

      this.logger.info(`Old files cleanup completed: ${totalCleaned} files, ${this.formatBytes(totalSize)} freed`);
      
    } catch (error) {
      this.logger.error('Old files cleanup failed:', error);
    }
  }

  async cleanLogFiles() {
    try {
      this.logger.info('Starting log files cleanup');
      
      const logsDir = path.join(__dirname, '../logs');
      
      if (!(await fs.pathExists(logsDir))) {
        return;
      }

      const files = await fs.readdir(logsDir);
      const cutoffTime = Date.now() - (this.config.logFileRetentionDays * 24 * 60 * 60 * 1000);
      let cleanedCount = 0;
      let cleanedSize = 0;

      for (const file of files) {
        // Skip current log files
        if (file.endsWith('.log') && !file.includes('.') || file.endsWith('.log.1')) {
          continue;
        }

        const filePath = path.join(logsDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            cleanedSize += stats.size;
            await fs.remove(filePath);
            cleanedCount++;
            this.logger.debug(`Deleted old log file: ${file}`);
          }
        } catch (error) {
          this.logger.warn(`Failed to process log file ${file}:`, error);
        }
      }

      this.logger.info(`Log files cleanup completed: ${cleanedCount} files, ${this.formatBytes(cleanedSize)} freed`);
      
    } catch (error) {
      this.logger.error('Log files cleanup failed:', error);
    }
  }

  async cleanBackups() {
    try {
      this.logger.info('Starting backups cleanup');
      
      const backupsDir = path.join(__dirname, '../backups');
      
      if (!(await fs.pathExists(backupsDir))) {
        return;
      }

      const files = await fs.readdir(backupsDir);
      const cutoffTime = Date.now() - (this.config.backupRetentionDays * 24 * 60 * 60 * 1000);
      let cleanedCount = 0;
      let cleanedSize = 0;

      for (const file of files) {
        const filePath = path.join(backupsDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            cleanedSize += stats.size;
            await fs.remove(filePath);
            cleanedCount++;
            this.logger.debug(`Deleted old backup: ${file}`);
          }
        } catch (error) {
          this.logger.warn(`Failed to process backup file ${file}:`, error);
        }
      }

      this.logger.info(`Backups cleanup completed: ${cleanedCount} files, ${this.formatBytes(cleanedSize)} freed`);
      
    } catch (error) {
      this.logger.error('Backups cleanup failed:', error);
    }
  }

  async optimizeStorage() {
    try {
      this.logger.info('Starting storage optimization');
      
      // Get disk usage
      const stats = await this.getDiskUsage();
      this.logger.info(`Current disk usage: ${this.formatBytes(stats.used)} / ${this.formatBytes(stats.total)} (${stats.percentage}%)`);

      // If disk usage is above 80%, perform aggressive cleanup
      if (stats.percentage > 80) {
        this.logger.warn('Disk usage is high, performing aggressive cleanup');
        await this.aggressiveCleanup();
      }

      // Compress old files if needed
      await this.compressOldFiles();
      
    } catch (error) {
      this.logger.error('Storage optimization failed:', error);
    }
  }

  async aggressiveCleanup() {
    try {
      this.logger.info('Starting aggressive cleanup');
      
      // Reduce retention periods temporarily
      const originalConfig = { ...this.config };
      
      this.config.tempFileRetentionHours = 1;
      this.config.processedFileRetentionDays = 7;
      this.config.logFileRetentionDays = 1;
      
      // Run all cleanup tasks
      await this.cleanTempFiles();
      await this.cleanOldFiles();
      await this.cleanLogFiles();
      
      // Restore original config
      this.config = originalConfig;
      
      this.logger.info('Aggressive cleanup completed');
      
    } catch (error) {
      this.logger.error('Aggressive cleanup failed:', error);
    }
  }

  async compressOldFiles() {
    try {
      // Implementation for compressing old files
      // This could use gzip or other compression algorithms
      this.logger.info('File compression not implemented yet');
    } catch (error) {
      this.logger.error('File compression failed:', error);
    }
  }

  async deepCleanup() {
    try {
      this.logger.info('Starting deep cleanup');
      
      // Remove empty directories
      await this.removeEmptyDirectories();
      
      // Clean up orphaned files
      await this.cleanOrphanedFiles();
      
      // Validate file integrity
      await this.validateFiles();
      
      this.logger.info('Deep cleanup completed');
      
    } catch (error) {
      this.logger.error('Deep cleanup failed:', error);
    }
  }

  async removeEmptyDirectories() {
    const directories = [
      path.join(__dirname, '../uploads'),
      path.join(__dirname, '../processed'),
      path.join(__dirname, '../exports'),
      path.join(__dirname, '../backups')
    ];

    for (const dir of directories) {
      await this.removeEmptyDirsRecursive(dir);
    }
  }

  async removeEmptyDirsRecursive(dirPath) {
    try {
      if (!(await fs.pathExists(dirPath))) {
        return;
      }

      const files = await fs.readdir(dirPath);
      
      if (files.length === 0) {
        // Don't remove main directories
        if (!dirPath.includes('uploads') && !dirPath.includes('processed') && 
            !dirPath.includes('exports') && !dirPath.includes('backups')) {
          await fs.remove(dirPath);
          this.logger.debug(`Removed empty directory: ${dirPath}`);
        }
        return;
      }

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isDirectory()) {
          await this.removeEmptyDirsRecursive(filePath);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to process directory ${dirPath}:`, error);
    }
  }

  async cleanOrphanedFiles() {
    // Implementation for cleaning files that are no longer referenced
    // This would require database integration to check references
    this.logger.info('Orphaned files cleanup not implemented yet');
  }

  async validateFiles() {
    // Implementation for validating file integrity
    // This could check for corrupted files, missing files, etc.
    this.logger.info('File validation not implemented yet');
  }

  async getDiskUsage() {
    const { execSync } = require('child_process');
    
    try {
      // For Unix-like systems
      const output = execSync('df -h /', { encoding: 'utf8' });
      const lines = output.split('\n');
      const diskInfo = lines[1].split(/\s+/);
      
      const total = this.parseSize(diskInfo[1]);
      const used = this.parseSize(diskInfo[2]);
      const percentage = parseInt(diskInfo[4].replace('%', ''));
      
      return { total, used, percentage };
    } catch (error) {
      // Fallback for systems where df is not available
      return { total: 0, used: 0, percentage: 0 };
    }
  }

  parseSize(sizeStr) {
    const units = { K: 1024, M: 1024**2, G: 1024**3, T: 1024**4 };
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)([KMGT]?)$/);
    
    if (!match) return 0;
    
    const size = parseFloat(match[1]);
    const unit = match[2];
    
    return size * (units[unit] || 1);
  }

  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  // Manual cleanup methods
  async manualCleanup(options = {}) {
    try {
      this.logger.info('Starting manual cleanup with options:', options);
      
      if (options.temp !== false) {
        await this.cleanTempFiles();
      }
      
      if (options.old !== false) {
        await this.cleanOldFiles();
      }
      
      if (options.logs !== false) {
        await this.cleanLogFiles();
      }
      
      if (options.backups !== false) {
        await this.cleanBackups();
      }
      
      if (options.optimize !== false) {
        await this.optimizeStorage();
      }
      
      this.logger.info('Manual cleanup completed');
      
    } catch (error) {
      this.logger.error('Manual cleanup failed:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      service: 'cleanup',
      status: 'running',
      config: this.config,
      nextRun: {
        tempFiles: 'Every hour',
        dailyCleanup: 'Daily at 2 AM',
        weeklyCleanup: 'Weekly on Sunday at 3 AM'
      }
    };
  }
}

module.exports = CleanupService;