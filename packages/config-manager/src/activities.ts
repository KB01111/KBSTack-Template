import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import deepmerge from 'deepmerge';
import { OpenAI } from 'openai';

const execAsync = promisify(exec);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Define schemas for activity inputs and outputs
export const LoadConfigInputSchema = z.object({
  repositoryPath: z.string(),
  configTypes: z.array(z.enum(['eslint', 'prettier', 'typescript', 'jest', 'husky'])),
});

export const ConfigSchema = z.record(z.any());

export const ConfigsSchema = z.object({
  eslint: ConfigSchema.optional(),
  prettier: ConfigSchema.optional(),
  typescript: ConfigSchema.optional(),
  jest: ConfigSchema.optional(),
  husky: ConfigSchema.optional(),
});

export const AnalysisResultSchema = z.object({
  projectStats: z.object({
    fileCount: z.number(),
    lineCount: z.number(),
    packageCount: z.number(),
    dependencies: z.record(z.string()),
    devDependencies: z.record(z.string()),
  }),
  recommendations: z.array(z.object({
    configType: z.enum(['eslint', 'prettier', 'typescript', 'jest', 'husky']),
    reason: z.string(),
    severity: z.enum(['suggestion', 'recommended', 'critical']),
  })),
});

export const ConfigUpdateSchema = z.object({
  hasUpdates: z.boolean(),
  updates: z.record(z.object({
    configType: z.enum(['eslint', 'prettier', 'typescript', 'jest', 'husky']),
    currentConfig: ConfigSchema,
    newConfig: ConfigSchema,
    changes: z.array(z.object({
      path: z.string(),
      oldValue: z.any(),
      newValue: z.any(),
      reason: z.string(),
    })),
  })),
});

export const ApplyUpdateInputSchema = z.object({
  configUpdates: z.instanceof(ConfigUpdateSchema),
  repositoryPath: z.string(),
});

export const NotifyChangeInputSchema = z.object({
  configUpdates: z.instanceof(ConfigUpdateSchema),
  repositoryPath: z.string(),
});

// Activity implementations
export async function loadConfig(input: z.infer<typeof LoadConfigInputSchema>): Promise<z.infer<typeof ConfigsSchema>> {
  const configs: Record<string, any> = {};
  
  for (const configType of input.configTypes) {
    try {
      let configPath = '';
      let configContent = null;
      
      switch (configType) {
        case 'eslint':
          configPath = path.join(input.repositoryPath, '.eslintrc.js');
          if (!await fileExists(configPath)) {
            configPath = path.join(input.repositoryPath, '.eslintrc.json');
          }
          break;
        case 'prettier':
          configPath = path.join(input.repositoryPath, '.prettierrc');
          if (!await fileExists(configPath)) {
            configPath = path.join(input.repositoryPath, '.prettierrc.json');
          }
          break;
        case 'typescript':
          configPath = path.join(input.repositoryPath, 'tsconfig.json');
          break;
        case 'jest':
          configPath = path.join(input.repositoryPath, 'jest.config.js');
          if (!await fileExists(configPath)) {
            configPath = path.join(input.repositoryPath, 'jest.config.json');
          }
          break;
        case 'husky':
          configPath = path.join(input.repositoryPath, '.husky');
          if (await fileExists(configPath)) {
            // For husky, we'll check the pre-commit hook
            const preCommitPath = path.join(configPath, 'pre-commit');
            if (await fileExists(preCommitPath)) {
              configContent = await fs.readFile(preCommitPath, 'utf-8');
            }
          }
          break;
      }
      
      if (!configContent && configPath && await fileExists(configPath)) {
        if (configPath.endsWith('.js')) {
          // For JS configs, we need to execute them
          const { stdout } = await execAsync(`node -e "console.log(JSON.stringify(require('${configPath}')))"`, {
            cwd: input.repositoryPath,
          });
          configContent = JSON.parse(stdout);
        } else {
          // For JSON configs, we can read them directly
          const content = await fs.readFile(configPath, 'utf-8');
          configContent = JSON.parse(content);
        }
      }
      
      if (configContent) {
        configs[configType] = configContent;
      }
    } catch (error) {
      console.error(`Error loading ${configType} config:`, error);
      // If we can't load a config, we'll just skip it
    }
  }
  
  return configs;
}

export async function analyzeProject(input: { 
  repositoryPath: string, 
  currentConfigs: z.infer<typeof ConfigsSchema> 
}): Promise<z.infer<typeof AnalysisResultSchema>> {
  try {
    // Get project stats
    const fileStats = await getProjectStats(input.repositoryPath);
    
    // Get package.json to analyze dependencies
    const packageJsonPath = path.join(input.repositoryPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    
    // Analyze the project with AI
    const aiAnalysis = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a configuration expert for TypeScript projects. Analyze the project stats and current configurations to recommend optimal configuration updates for ESLint, Prettier, TypeScript, Jest, and Husky."
        },
        {
          role: "user",
          content: `Analyze this project and recommend configuration improvements:\n\nProject Stats: ${JSON.stringify(fileStats)}\n\nCurrent Configs: ${JSON.stringify(input.currentConfigs)}\n\nPackage Dependencies: ${JSON.stringify(packageJson.dependencies || {})}\n\nDev Dependencies: ${JSON.stringify(packageJson.devDependencies || {})}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    // Parse AI response
    const aiRecommendations = JSON.parse(aiAnalysis.choices[0].message.content || '{}');
    
    return {
      projectStats: {
        fileCount: fileStats.fileCount,
        lineCount: fileStats.lineCount,
        packageCount: fileStats.packageCount,
        dependencies: packageJson.dependencies || {},
        devDependencies: packageJson.devDependencies || {},
      },
      recommendations: aiRecommendations.recommendations || [],
    };
  } catch (error) {
    console.error('Error in analyzeProject activity:', error);
    throw error;
  }
}

export async function generateConfigUpdate(input: {
  analysisResult: z.infer<typeof AnalysisResultSchema>,
  currentConfigs: z.infer<typeof ConfigsSchema>
}): Promise<z.infer<typeof ConfigUpdateSchema>> {
  try {
    const { analysisResult, currentConfigs } = input;
    
    // Use AI to generate config updates
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a configuration expert for TypeScript projects. Generate specific configuration updates based on the project analysis and current configurations."
        },
        {
          role: "user",
          content: `Generate configuration updates for this project:\n\nAnalysis Result: ${JSON.stringify(analysisResult)}\n\nCurrent Configs: ${JSON.stringify(currentConfigs)}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    // Parse AI response
    const updateResponse = JSON.parse(aiResponse.choices[0].message.content || '{}');
    
    // Process the updates
    const updates: Record<string, any> = {};
    let hasUpdates = false;
    
    for (const configType of Object.keys(updateResponse.updates || {})) {
      const update = updateResponse.updates[configType];
      const currentConfig = currentConfigs[configType] || {};
      const newConfig = deepmerge(currentConfig, update.config || {});
      
      // Calculate changes
      const changes = [];
      for (const key of Object.keys(update.config || {})) {
        changes.push({
          path: key,
          oldValue: currentConfig[key],
          newValue: update.config[key],
          reason: update.reason || 'Optimization based on project analysis',
        });
      }
      
      if (changes.length > 0) {
        hasUpdates = true;
        updates[configType] = {
          configType,
          currentConfig,
          newConfig,
          changes,
        };
      }
    }
    
    return {
      hasUpdates,
      updates,
    };
  } catch (error) {
    console.error('Error in generateConfigUpdate activity:', error);
    throw error;
  }
}

export async function applyConfigUpdate(input: z.infer<typeof ApplyUpdateInputSchema>): Promise<string> {
  try {
    const { configUpdates, repositoryPath } = input;
    
    if (!configUpdates.hasUpdates) {
      return 'No updates to apply';
    }
    
    const results = [];
    
    for (const [configType, update] of Object.entries(configUpdates.updates)) {
      try {
        let configPath = '';
        
        switch (configType) {
          case 'eslint':
            configPath = path.join(repositoryPath, '.eslintrc.json');
            break;
          case 'prettier':
            configPath = path.join(repositoryPath, '.prettierrc');
            break;
          case 'typescript':
            configPath = path.join(repositoryPath, 'tsconfig.json');
            break;
          case 'jest':
            configPath = path.join(repositoryPath, 'jest.config.json');
            break;
          case 'husky':
            // For husky, we need to set up the hooks
            await setupHuskyHooks(repositoryPath, update.newConfig);
            results.push(`Updated husky configuration`);
            continue;
        }
        
        // Write the updated config
        await fs.writeFile(configPath, JSON.stringify(update.newConfig, null, 2), 'utf-8');
        results.push(`Updated ${configType} configuration at ${configPath}`);
      } catch (error) {
        console.error(`Error applying ${configType} update:`, error);
        results.push(`Failed to update ${configType} configuration: ${error.message}`);
      }
    }
    
    return results.join('\n');
  } catch (error) {
    console.error('Error in applyConfigUpdate activity:', error);
    throw error;
  }
}

export async function notifyConfigChange(input: z.infer<typeof NotifyChangeInputSchema>): Promise<void> {
  // In a real implementation, this would send a notification to the user
  // For now, we'll just log the message
  console.log(`[NOTIFICATION] Configuration updates available`);
  console.log(`Repository: ${input.repositoryPath}`);
  console.log('Updates:');
  
  for (const [configType, update] of Object.entries(input.configUpdates.updates)) {
    console.log(`\n${configType.toUpperCase()} Updates:`);
    for (const change of update.changes) {
      console.log(`- ${change.path}: ${JSON.stringify(change.oldValue)} -> ${JSON.stringify(change.newValue)}`);
      console.log(`  Reason: ${change.reason}`);
    }
  }
}

// Helper functions
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getProjectStats(repositoryPath: string): Promise<{ 
  fileCount: number, 
  lineCount: number, 
  packageCount: number 
}> {
  try {
    // Count TypeScript/JavaScript files
    const { stdout: fileCountOutput } = await execAsync(
      `find ${repositoryPath} -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | wc -l`,
      { cwd: repositoryPath }
    );
    
    // Count lines of code
    const { stdout: lineCountOutput } = await execAsync(
      `find ${repositoryPath} -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | xargs cat | wc -l`,
      { cwd: repositoryPath }
    );
    
    // Count packages in monorepo
    const { stdout: packageCountOutput } = await execAsync(
      `find ${repositoryPath}/packages -type f -name "package.json" | wc -l`,
      { cwd: repositoryPath }
    );
    
    return {
      fileCount: parseInt(fileCountOutput.trim(), 10),
      lineCount: parseInt(lineCountOutput.trim(), 10),
      packageCount: parseInt(packageCountOutput.trim(), 10) + 1, // +1 for root package.json
    };
  } catch (error) {
    console.error('Error getting project stats:', error);
    return { fileCount: 0, lineCount: 0, packageCount: 0 };
  }
}

async function setupHuskyHooks(repositoryPath: string, config: any): Promise<void> {
  try {
    // Install husky if not already installed
    await execAsync('npx husky install', { cwd: repositoryPath });
    
    // Set up pre-commit hook
    if (config.preCommit) {
      await execAsync(`npx husky add .husky/pre-commit "${config.preCommit}"`, { cwd: repositoryPath });
      await fs.chmod(path.join(repositoryPath, '.husky/pre-commit'), 0o755);
    }
    
    // Set up pre-push hook
    if (config.prePush) {
      await execAsync(`npx husky add .husky/pre-push "${config.prePush}"`, { cwd: repositoryPath });
      await fs.chmod(path.join(repositoryPath, '.husky/pre-push'), 0o755);
    }
    
    // Set up commit-msg hook for commitlint if specified
    if (config.commitMsg) {
      await execAsync(`npx husky add .husky/commit-msg "${config.commitMsg}"`, { cwd: repositoryPath });
      await fs.chmod(path.join(repositoryPath, '.husky/commit-msg'), 0o755);
    }
  } catch (error) {
    console.error('Error setting up husky hooks:', error);
    throw error;
  }
}
