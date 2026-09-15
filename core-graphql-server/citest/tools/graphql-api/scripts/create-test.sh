#!/bin/bash

# GraphQL API Test Template Generator
# Creates focused integration test files with minimal boilerplate

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 GraphQL API Test Template Generator${NC}"
echo -e "${YELLOW}Creates focused integration test files with sequential structure${NC}"
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is required but not installed${NC}"
    exit 1
fi

# Change to project root
cd "$PROJECT_ROOT"

# Run the generator
node scripts/create-test-template.js

echo ""
echo -e "${GREEN}🎉 Test template generation complete!${NC}"
echo -e "${BLUE}💡 Pro tips:${NC}"
echo "  • Run 'npm test' or 'bun test' to execute your new test"
echo "  • Check the generated imports match your GraphQL schema"
echo "  • Customize the citestMarker prefix for your feature"
echo "  • Add custom assertions in the TODO sections"
