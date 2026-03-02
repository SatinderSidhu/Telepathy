#!/bin/bash

set -e

echo "🚀 Starting ChatCall Deployment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env.production exists
if [ ! -f server/.env.production ]; then
    echo -e "${RED}❌ Error: server/.env.production not found${NC}"
    echo "Please create it from server/.env.example"
    exit 1
fi

# Build frontend
echo -e "${YELLOW}📦 Building frontend...${NC}"
cd web
npm install
npm run build
cd ..

# Create uploads directory if it doesn't exist
mkdir -p uploads

# Stop existing containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose -f docker-compose.prod.yml down

# Build and start containers
echo -e "${YELLOW}🏗️  Building and starting containers...${NC}"
docker-compose -f docker-compose.prod.yml up -d --build

# Wait for database to be ready
echo -e "${YELLOW}⏳ Waiting for database to be ready...${NC}"
sleep 10

# Run database migrations
echo -e "${YELLOW}🗄️  Running database migrations...${NC}"
docker-compose -f docker-compose.prod.yml exec -T backend sh -c "cd /app && npx knex migrate:latest --knexfile src/config/knexfile.js"

# Show logs
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "📊 Container status:"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "📝 View logs with: docker-compose -f docker-compose.prod.yml logs -f"
echo "🔍 Check health: curl http://localhost:3001/api/health"
