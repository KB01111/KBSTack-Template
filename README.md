# KBStack Template - Getting Started Guide

## Introduction

KBStack is a modern, typesafe software template that integrates Expo, Temporal, and CopilotKit within a T3 stack-like structure. It provides autofix capabilities and supports Web, Windows 11, and iOS platforms.

## Prerequisites

- Node.js 18.0.0 or later
- pnpm 8.6.0 or later
- Git

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/kbstack-template.git my-kbstack-app
cd my-kbstack-app
```

2. Install dependencies:

```bash
pnpm install
```

## Development

### Web Application (Next.js)

```bash
# Start the Next.js development server
pnpm dev:web
```

### iOS Application (Expo)

```bash
# Start the Expo development server
pnpm dev:ios
```

### Windows Application (Electron)

```bash
# Start the Electron development server
pnpm dev:windows
```

### All Platforms

```bash
# Start development servers for all platforms
pnpm dev:all
```

## Building for Production

### Web Application

```bash
pnpm build:web
```

### iOS Application

```bash
pnpm build:ios
```

### Windows Application

```bash
pnpm build:windows
```

### All Platforms

```bash
pnpm build:all
```

## Project Structure

```
kbstack-template/
├── apps/                      # Platform-specific applications
│   ├── expo/                  # iOS application
│   ├── next/                  # Web application
│   └── desktop/               # Windows 11 application
├── packages/                  # Shared packages and libraries
│   ├── api/                   # API layer with tRPC
│   ├── auth/                  # Authentication with NextAuth.js
│   ├── db/                    # Database layer with Prisma
│   ├── temporal/              # Temporal workflow orchestration
│   ├── copilot/               # CopilotKit AI assistance
│   └── ui/                    # Shared UI components
└── tools/                     # Development and build tools
    ├── eslint/                # ESLint configuration
    └── typescript/            # TypeScript configuration
```

## Key Features

### Typesafe Development

KBStack provides end-to-end typesafety with TypeScript, tRPC, and Prisma.

### Autofix Capabilities

ESLint and Prettier are configured for automatic error detection and correction.

### Cross-Platform Support

Shared code structure with platform-specific implementations for Web, iOS, and Windows.

### Workflow Orchestration

Temporal integration for reliable execution of business logic.

### AI Assistance

CopilotKit integration for AI-powered development.

## Customization

### Adding a New Package

1. Create a new directory in the `packages` folder
2. Add a `package.json` file with appropriate dependencies
3. Configure TypeScript and ESLint
4. Reference the new package in apps that need it

### Adding a New App

1. Create a new directory in the `apps` folder
2. Add a `package.json` file with appropriate dependencies
3. Configure TypeScript and ESLint
4. Reference shared packages as needed

## Troubleshooting

### Common Issues

- **Build Errors**: Ensure all dependencies are installed and TypeScript is configured correctly
- **Type Errors**: Check for missing type definitions or incorrect imports
- **Cross-Platform Issues**: Ensure platform-specific code is properly isolated

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
