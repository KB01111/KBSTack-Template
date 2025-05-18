// src/activities.ts
import { z } from 'zod';
import { OpenAI } from 'openai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Define schemas for activity inputs and outputs
export const AnalysisInputSchema = z.object({
  repositoryPath: z.string(),
  filePath: z.string(),
  issueDescription: z.string().optional(),
});

export const AnalysisResultSchema = z.object({
  issuesFound: z.boolean(),
  issues: z.array(z.object({
    type: z.string(),
    description: z.string(),
    line: z.number().optional(),
    column: z.number().optional(),
    severity: z.enum(['error', 'warning', 'info']).optional(),
  })).optional(),
  fileContent: z.string().optional(),
});

export const FixSuggestionInputSchema = z.object({
  analysisResult: AnalysisResultSchema,
  filePath: z.string(),
});

export const FixSuggestionSchema = z.object({
  originalCode: z.string(),
  fixedCode: z.string(),
  explanation: z.string(),
  changes: z.array(z.object({
    line: z.number(),
    description: z.string(),
  })).optional(),
});

export const ApplyFixInputSchema = z.object({
  fixSuggestion: FixSuggestionSchema,
  filePath: z.string(),
  repositoryPath: z.string(),
});

export const ValidationResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});

export const NotifyUserInputSchema = z.object({
  message: z.string(),
  fixSuggestion: FixSuggestionSchema,
  filePath: z.string(),
});

// Activity implementations
export async function analyzeCode(input: z.infer<typeof AnalysisInputSchema>): Promise<z.infer<typeof AnalysisResultSchema>> {
  try {
    // Read the file content
    const fullPath = path.join(input.repositoryPath, input.filePath);
    const fileContent = await fs.readFile(fullPath, 'utf-8');
    
    // Run ESLint on the file
    const { stdout: eslintOutput } = await execAsync(`npx eslint ${fullPath} --format json`);
    let eslintResults = [];
    
    try {
      eslintResults = JSON.parse(eslintOutput);
    } catch (e) {
      console.warn('Failed to parse ESLint output:', e);
    }
    
    // Use AI to analyze the code
    const aiAnalysis = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a code analysis assistant. Analyze the provided code for issues, bugs, and potential improvements. Focus on type safety, error handling, and code quality."
        },
        {
          role: "user",
          content: `Analyze this code file for issues:\n\n${fileContent}${input.issueDescription ? `\n\nSpecific issue to look for: ${input.issueDescription}` : ''}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    // Parse AI response
    const aiResponse = JSON.parse(aiAnalysis.choices[0].message.content || '{}');
    
    // Combine ESLint and AI analysis
    const issues = [
      ...(eslintResults.flatMap(result => 
        result.messages.map(msg => ({
          type: 'eslint',
          description: msg.message,
          line: msg.line,
          column: msg.column,
          severity: msg.severity === 2 ? 'error' : msg.severity === 1 ? 'warning' : 'info',
        }))
      )),
      ...(aiResponse.issues || []),
    ];
    
    return {
      issuesFound: issues.length > 0,
      issues,
      fileContent,
    };
  } catch (error) {
    console.error('Error in analyzeCode activity:', error);
    throw error;
  }
}

export async function generateFix(input: z.infer<typeof FixSuggestionInputSchema>): Promise<z.infer<typeof FixSuggestionSchema>> {
  try {
    const { analysisResult, filePath } = input;
    
    if (!analysisResult.fileContent || !analysisResult.issues) {
      throw new Error('Invalid analysis result');
    }
    
    // Use AI to generate a fix
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a code fixing assistant. Generate fixes for the issues identified in the code. Provide the complete fixed code and an explanation of the changes."
        },
        {
          role: "user",
          content: `Fix the following issues in this code:\n\nFile: ${filePath}\n\nOriginal code:\n${analysisResult.fileContent}\n\nIssues:\n${JSON.stringify(analysisResult.issues, null, 2)}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    // Parse AI response
    const fixResponse = JSON.parse(aiResponse.choices[0].message.content || '{}');
    
    return {
      originalCode: analysisResult.fileContent,
      fixedCode: fixResponse.fixedCode || analysisResult.fileContent,
      explanation: fixResponse.explanation || 'No explanation provided',
      changes: fixResponse.changes || [],
    };
  } catch (error) {
    console.error('Error in generateFix activity:', error);
    throw error;
  }
}

export async function applyFix(input: z.infer<typeof ApplyFixInputSchema>): Promise<string> {
  try {
    const { fixSuggestion, filePath, repositoryPath } = input;
    const fullPath = path.join(repositoryPath, filePath);
    
    // Create a backup of the original file
    const backupPath = `${fullPath}.bak`;
    await fs.copyFile(fullPath, backupPath);
    
    // Write the fixed code to the file
    await fs.writeFile(fullPath, fixSuggestion.fixedCode, 'utf-8');
    
    return `Fix applied to ${filePath}. Original file backed up at ${backupPath}`;
  } catch (error) {
    console.error('Error in applyFix activity:', error);
    throw error;
  }
}

export async function validateFix(input: { filePath: string, repositoryPath: string }): Promise<z.infer<typeof ValidationResultSchema>> {
  try {
    const fullPath = path.join(input.repositoryPath, input.filePath);
    
    // Run ESLint on the fixed file
    const { stdout: eslintOutput } = await execAsync(`npx eslint ${fullPath} --format json`);
    let eslintResults = [];
    
    try {
      eslintResults = JSON.parse(eslintOutput);
    } catch (e) {
      console.warn('Failed to parse ESLint output:', e);
    }
    
    // Check if there are any remaining errors
    const errors = eslintResults.flatMap(result => 
      result.messages.filter(msg => msg.severity === 2)
    );
    
    // Check if the file compiles (for TypeScript files)
    if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      try {
        await execAsync(`npx tsc --noEmit ${fullPath}`);
      } catch (e) {
        return {
          success: false,
          error: `TypeScript compilation failed: ${e.message}`,
        };
      }
    }
    
    if (errors.length > 0) {
      return {
        success: false,
        error: `ESLint errors remain after fix: ${errors.map(e => e.message).join(', ')}`,
      };
    }
    
    return {
      success: true,
    };
  } catch (error) {
    console.error('Error in validateFix activity:', error);
    return {
      success: false,
      error: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function notifyUser(input: z.infer<typeof NotifyUserInputSchema>): Promise<void> {
  // In a real implementation, this would send a notification to the user
  // For now, we'll just log the message
  console.log(`[NOTIFICATION] ${input.message}`);
  console.log(`File: ${input.filePath}`);
  console.log(`Explanation: ${input.fixSuggestion.explanation}`);
  console.log('Changes:');
  console.log('--- Original ---');
  console.log(input.fixSuggestion.originalCode);
  console.log('--- Fixed ---');
  console.log(input.fixSuggestion.fixedCode);
}
