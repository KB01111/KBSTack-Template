// src/autofix-workflow.ts
import { proxyActivities, defineSignal, setHandler, sleep } from '@temporalio/workflow';
import type * as activities from './activities';
import { z } from 'zod';

// Define the activities that will be used in the workflow
const { 
  analyzeCode, 
  generateFix, 
  applyFix, 
  validateFix, 
  notifyUser 
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    maximumAttempts: 3,
  },
});

// Define signals for user interaction
export const approveFixSignal = defineSignal<[boolean]>('approveFix');

// Define the input schema for the workflow
export const AutofixInputSchema = z.object({
  repositoryPath: z.string(),
  filePath: z.string(),
  issueDescription: z.string().optional(),
  autoApprove: z.boolean().default(false),
});

export type AutofixInput = z.infer<typeof AutofixInputSchema>;

// The main workflow function
export async function autofixWorkflow(input: AutofixInput): Promise<string> {
  // Validate input
  const validatedInput = AutofixInputSchema.parse(input);
  const { repositoryPath, filePath, issueDescription, autoApprove } = validatedInput;
  
  // Initialize workflow state
  let fixApproved = autoApprove;
  let fixResult = '';
  
  // Set up signal handler for user approval
  setHandler(approveFixSignal, (approved) => {
    fixApproved = approved;
  });
  
  try {
    // Step 1: Analyze the code to identify issues
    const analysisResult = await analyzeCode({
      repositoryPath,
      filePath,
      issueDescription,
    });
    
    if (!analysisResult.issuesFound) {
      return 'No issues found that require fixing.';
    }
    
    // Step 2: Generate a fix for the identified issues
    const fixSuggestion = await generateFix({
      analysisResult,
      filePath,
    });
    
    // Step 3: If not auto-approving, notify the user and wait for approval
    if (!autoApprove) {
      await notifyUser({
        message: 'Code fix suggestion is ready for review',
        fixSuggestion,
        filePath,
      });
      
      // Wait for user approval signal (with timeout)
      const timeoutMs = 24 * 60 * 60 * 1000; // 24 hours
      const startTime = Date.now();
      
      while (!fixApproved && Date.now() - startTime < timeoutMs) {
        await sleep(1000); // Check every second
      }
      
      if (!fixApproved) {
        return 'Fix was not approved within the timeout period.';
      }
    }
    
    // Step 4: Apply the fix
    fixResult = await applyFix({
      fixSuggestion,
      filePath,
      repositoryPath,
    });
    
    // Step 5: Validate the fix
    const validationResult = await validateFix({
      filePath,
      repositoryPath,
    });
    
    if (!validationResult.success) {
      // If validation fails, revert the changes
      return `Fix validation failed: ${validationResult.error}. Changes have been reverted.`;
    }
    
    return `Successfully applied fix to ${filePath}: ${fixResult}`;
  } catch (error) {
    // Handle any errors that occur during the workflow
    return `Error in autofix workflow: ${error instanceof Error ? error.message : String(error)}`;
  }
}
