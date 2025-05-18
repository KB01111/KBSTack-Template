import React from 'react';
import { ComponentTestConfig, executeComponentTest, generateComponentTests } from './ui-testing';

// Higher-order component to make components testable with CopilotKit
export function withCopilotTesting<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string
) {
  const WrappedComponent = (props: P) => {
    return <Component {...props} />;
  };
  
  // Attach testing utilities to the component
  WrappedComponent.displayName = `CopilotTesting(${componentName})`;
  WrappedComponent.generateTests = async (componentCode: string) => {
    return generateComponentTests(componentCode, componentName);
  };
  WrappedComponent.executeTest = async (testConfig: ComponentTestConfig) => {
    return executeComponentTest(Component, testConfig);
  };
  
  return WrappedComponent;
}

// Export all UI testing utilities
export * from './ui-testing';
export { withCopilotTesting };
