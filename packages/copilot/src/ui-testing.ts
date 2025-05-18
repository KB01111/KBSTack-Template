import React from 'react';
import { z } from 'zod';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpenAI } from 'openai';
import { CopilotProvider } from '@copilotkit/react-core';

// Schema for component test configuration
export const ComponentTestConfigSchema = z.object({
  componentName: z.string(),
  props: z.record(z.any()).optional(),
  interactions: z.array(
    z.object({
      type: z.enum(['click', 'type', 'hover', 'select', 'wait']),
      target: z.string().optional(),
      value: z.string().optional(),
      waitForMs: z.number().optional(),
      waitForText: z.string().optional(),
    })
  ).optional(),
  expectations: z.array(
    z.object({
      type: z.enum(['toBeInTheDocument', 'toHaveTextContent', 'toBeDisabled', 'toBeEnabled', 'toBeChecked']),
      target: z.string(),
      value: z.string().optional(),
    })
  ),
});

export type ComponentTestConfig = z.infer<typeof ComponentTestConfigSchema>;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

/**
 * Generates UI test cases for a React component using AI
 */
export async function generateComponentTests(
  componentCode: string,
  componentName: string
): Promise<ComponentTestConfig[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a UI testing expert. Generate comprehensive test cases for React components that cover all important functionality and edge cases."
        },
        {
          role: "user",
          content: `Generate test cases for this React component:\n\n${componentCode}\n\nThe component name is ${componentName}. Return the test cases as a JSON array conforming to the ComponentTestConfig schema.`
        }
      ],
      response_format: { type: "json_object" }
    });

    const testCases = JSON.parse(response.choices[0].message.content || '{}');
    return Array.isArray(testCases.tests) 
      ? testCases.tests.map(test => ComponentTestConfigSchema.parse(test))
      : [];
  } catch (error) {
    console.error('Error generating component tests:', error);
    throw error;
  }
}

/**
 * Executes a test case against a React component
 */
export async function executeComponentTest(
  Component: React.ComponentType<any>,
  testConfig: ComponentTestConfig
): Promise<void> {
  // Setup user event
  const user = userEvent.setup();
  
  // Render the component with the provided props
  render(
    <CopilotProvider>
      <Component {...(testConfig.props || {})} />
    </CopilotProvider>
  );
  
  // Execute interactions
  if (testConfig.interactions) {
    for (const interaction of testConfig.interactions) {
      switch (interaction.type) {
        case 'click':
          if (interaction.target) {
            const element = screen.getByText(interaction.target);
            await user.click(element);
          }
          break;
        case 'type':
          if (interaction.target && interaction.value) {
            const element = screen.getByLabelText(interaction.target);
            await user.type(element, interaction.value);
          }
          break;
        case 'hover':
          if (interaction.target) {
            const element = screen.getByText(interaction.target);
            await user.hover(element);
          }
          break;
        case 'select':
          if (interaction.target && interaction.value) {
            const element = screen.getByLabelText(interaction.target);
            await user.selectOptions(element, interaction.value);
          }
          break;
        case 'wait':
          if (interaction.waitForMs) {
            await new Promise(resolve => setTimeout(resolve, interaction.waitForMs));
          } else if (interaction.waitForText) {
            await waitFor(() => screen.getByText(interaction.waitForText));
          }
          break;
      }
    }
  }
  
  // Check expectations
  for (const expectation of testConfig.expectations) {
    const element = screen.getByText(expectation.target);
    
    switch (expectation.type) {
      case 'toBeInTheDocument':
        expect(element).toBeInTheDocument();
        break;
      case 'toHaveTextContent':
        if (expectation.value) {
          expect(element).toHaveTextContent(expectation.value);
        }
        break;
      case 'toBeDisabled':
        expect(element).toBeDisabled();
        break;
      case 'toBeEnabled':
        expect(element).toBeEnabled();
        break;
      case 'toBeChecked':
        expect(element).toBeChecked();
        break;
    }
  }
}
