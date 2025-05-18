import { z } from 'zod';
import { proxyActivities, defineSignal, setHandler, sleep } from '@temporalio/workflow';
import type * as activities from './activities';

// Define the activities that will be used in the workflow
const { 
  loadConfig, 
  analyzeProject, 
  generateConfigUpdate, 
  applyConfigUpdate, 
  notifyConfigChange 
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    maximumAttempts: 3,
  },
});

// Define signals for user interaction
export const approveConfigUpdateSignal = defineSignal<[boolean]>('approveConfigUpdate');

// Define the input schema for the workflow
export const ConfigEvolutionInputSchema = z.object({
  repositoryPath: z.string(),
  configTypes: z.array(z.enum(['eslint', 'prettier', 'typescript', 'jest', 'husky'])),
  autoApprove: z.boolean().default(false),
  evolutionFrequency: z.enum(['onCommit', 'daily', 'weekly', 'monthly']).default('weekly'),
});

export type ConfigEvolutionInput = z.infer<typeof ConfigEvolutionInputSchema>;

// The main workflow function for evolving configurations
export async function configEvolutionWorkflow(input: ConfigEvolutionInput): Promise<string> {
  // Validate input
  const validatedInput = ConfigEvolutionInputSchema.parse(input);
  const { repositoryPath, configTypes, autoApprove, evolutionFrequency } = validatedInput;
  
  // Initialize workflow state
  let updateApproved = autoApprove;
  let lastEvolutionTime = Date.now();
  
  // Set up signal handler for user approval
  setHandler(approveConfigUpdateSignal, (approved) => {
    updateApproved = approved;
  });
  
  // Determine sleep duration based on evolution frequency
  const getSleepDuration = () => {
    switch (evolutionFrequency) {
      case 'onCommit':
        return 0; // No sleep, triggered externally
      case 'daily':
        return 24 * 60 * 60 * 1000; // 24 hours
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000; // 7 days
      case 'monthly':
        return 30 * 24 * 60 * 60 * 1000; // 30 days
      default:
        return 7 * 24 * 60 * 60 * 1000; // Default to weekly
    }
  };
  
  // Main evolution loop
  while (true) {
    try {
      // Load current configurations
      const currentConfigs = await loadConfig({
        repositoryPath,
        configTypes,
      });
      
      // Analyze project to determine optimal configurations
      const analysisResult = await analyzeProject({
        repositoryPath,
        currentConfigs,
      });
      
      // Generate configuration updates based on analysis
      const configUpdates = await generateConfigUpdate({
        analysisResult,
        currentConfigs,
      });
      
      // If there are updates to apply
      if (configUpdates.hasUpdates) {
        // If not auto-approving, notify the user and wait for approval
        if (!autoApprove) {
          await notifyConfigChange({
            configUpdates,
            repositoryPath,
          });
          
          // Wait for user approval signal (with timeout)
          const timeoutMs = 24 * 60 * 60 * 1000; // 24 hours
          const startTime = Date.now();
          
          while (!updateApproved && Date.now() - startTime < timeoutMs) {
            await sleep(1000); // Check every second
          }
          
          if (!updateApproved) {
            console.log('Config update was not approved within the timeout period.');
            updateApproved = autoApprove; // Reset for next iteration
            
            // Sleep until next evolution cycle
            if (evolutionFrequency !== 'onCommit') {
              lastEvolutionTime = Date.now();
              await sleep(getSleepDuration());
            } else {
              // For onCommit, we'll exit and wait for next trigger
              return 'Config evolution workflow completed without updates.';
            }
            
            continue; // Skip to next iteration
          }
        }
        
        // Apply the approved configuration updates
        const updateResult = await applyConfigUpdate({
          configUpdates,
          repositoryPath,
        });
        
        console.log(`Applied configuration updates: ${updateResult}`);
        updateApproved = autoApprove; // Reset for next iteration
      } else {
        console.log('No configuration updates needed at this time.');
      }
      
      // For onCommit frequency, exit after one iteration
      if (evolutionFrequency === 'onCommit') {
        return 'Config evolution workflow completed successfully.';
      }
      
      // Sleep until next evolution cycle
      lastEvolutionTime = Date.now();
      await sleep(getSleepDuration());
      
    } catch (error) {
      // Handle any errors that occur during the workflow
      console.error(`Error in config evolution workflow: ${error instanceof Error ? error.message : String(error)}`);
      
      // Sleep for a shorter duration before retrying
      await sleep(Math.min(getSleepDuration(), 60 * 60 * 1000)); // 1 hour or less
    }
  }
}
