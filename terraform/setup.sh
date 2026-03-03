#!/bin/bash

# ChatCall Terraform Setup Script
# This helps you get started with Terraform deployment

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 ChatCall - Terraform Setup${NC}"
echo ""

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    echo -e "${RED}❌ Terraform is not installed${NC}"
    echo ""
    echo "Install Terraform:"
    echo "  macOS:   brew tap hashicorp/tap && brew install hashicorp/tap/terraform"
    echo "  Linux:   https://www.terraform.io/downloads"
    echo "  Windows: https://www.terraform.io/downloads"
    exit 1
fi

echo -e "${GREEN}✅ Terraform installed: $(terraform --version | head -n1)${NC}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${YELLOW}⚠️  AWS CLI is not installed (optional but recommended)${NC}"
    echo "Install: https://aws.amazon.com/cli/"
else
    echo -e "${GREEN}✅ AWS CLI installed: $(aws --version)${NC}"
fi

echo ""

# Check if AWS credentials are configured
if aws sts get-caller-identity &> /dev/null; then
    echo -e "${GREEN}✅ AWS credentials configured${NC}"
    aws sts get-caller-identity --output table
else
    echo -e "${YELLOW}⚠️  AWS credentials not configured${NC}"
    echo ""
    echo "Configure AWS credentials:"
    echo "  1. Get credentials from: https://console.aws.amazon.com/iam/"
    echo "  2. Run: aws configure"
    echo "  3. Enter Access Key ID and Secret Access Key"
    echo ""
    read -p "Press Enter to continue or Ctrl+C to exit..."
fi

echo ""

# Create terraform.tfvars if it doesn't exist
if [ ! -f "terraform.tfvars" ]; then
    echo -e "${YELLOW}📝 Creating terraform.tfvars...${NC}"
    cp terraform.tfvars.example terraform.tfvars
    echo -e "${GREEN}✅ Created terraform.tfvars${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: Edit terraform.tfvars before deploying!${NC}"
    echo "Configure:"
    echo "  - aws_region (default: us-east-1)"
    echo "  - instance_bundle_id (default: medium_2_0 = \$10/month)"
    echo "  - domain_name (optional)"
    echo ""
    read -p "Press Enter to open terraform.tfvars in editor..."
    ${EDITOR:-nano} terraform.tfvars
else
    echo -e "${GREEN}✅ terraform.tfvars already exists${NC}"
fi

echo ""

# Initialize Terraform
echo -e "${YELLOW}🔧 Initializing Terraform...${NC}"
terraform init

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo ""
echo "  1. Review configuration:"
echo "     terraform plan"
echo ""
echo "  2. Deploy infrastructure:"
echo "     terraform apply"
echo ""
echo "  3. After deployment, follow the 'next_steps' output"
echo ""
echo -e "${YELLOW}💰 Estimated cost: \$10-20/month (depending on instance size)${NC}"
