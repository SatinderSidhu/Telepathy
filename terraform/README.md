# ChatCall - Terraform Deployment

Deploy ChatCall to AWS Lightsail with a single command!

---

## Prerequisites

### 1. Install Terraform

**macOS:**
```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
```

**Linux:**
```bash
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform
```

**Windows:**
Download from: https://www.terraform.io/downloads

Verify installation:
```bash
terraform --version
```

### 2. Install AWS CLI

**macOS:**
```bash
brew install awscli
```

**Linux:**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**Windows:**
Download from: https://aws.amazon.com/cli/

### 3. Configure AWS Credentials

```bash
aws configure
```

You'll be prompted for:
- **AWS Access Key ID**: Get from AWS Console → IAM → Users → Security Credentials
- **AWS Secret Access Key**: From same location
- **Default region**: `us-east-1` (or your preferred region)
- **Default output format**: `json`

**How to get AWS credentials:**
1. Go to: https://console.aws.amazon.com/iam/
2. Click **Users** → Your username
3. **Security credentials** tab
4. **Create access key**
5. Download the CSV file (keep it secure!)

---

## Quick Start (3 Steps)

### Step 1: Configure Variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars
```

**Customize:**
- `aws_region` - Choose closest to your users
- `instance_bundle_id` - `medium_2_0` ($10/month recommended)
- `domain_name` - Your domain (or leave empty for IP testing)

### Step 2: Deploy Infrastructure

```bash
# Initialize Terraform
terraform init

# Preview what will be created
terraform plan

# Deploy (confirm with 'yes')
terraform apply
```

**This creates:**
- ✅ Lightsail instance (Ubuntu 22.04)
- ✅ Static IP address
- ✅ Firewall rules (HTTPS, WebRTC, TURN)
- ✅ Pre-installed: Docker, Node.js, Nginx

**Time:** ~5 minutes

### Step 3: Note the Outputs

After deployment, Terraform will show:
- **Static IP address** - Your server's public IP
- **SSH command** - How to connect to server
- **Next steps** - What to do next

Example output:
```
static_ip = "18.xxx.xxx.xxx"
ssh_connection_command = "ssh -i ~/.ssh/LightsailDefaultKey-us-east-1.pem ubuntu@18.xxx.xxx.xxx"
```

---

## What Happens During Deployment

1. **Creates Lightsail instance** with Ubuntu 22.04
2. **Assigns static IP** (won't change when you restart)
3. **Configures firewall** for HTTPS, WebRTC, TURN
4. **Runs initialization script**:
   - Installs Docker & Docker Compose
   - Installs Node.js 20
   - Installs Nginx & Certbot (SSL)
   - Optimizes system for WebRTC
   - Creates swap file
   - Sets up security updates

---

## After Terraform Deployment

### 1. Download SSH Key

```bash
# For macOS/Linux
mkdir -p ~/.ssh
aws lightsail download-default-key-pair --region us-east-1 --output text > ~/.ssh/LightsailDefaultKey-us-east-1.pem
chmod 400 ~/.ssh/LightsailDefaultKey-us-east-1.pem
```

### 2. Connect to Server

Use the SSH command from Terraform output:
```bash
ssh -i ~/.ssh/LightsailDefaultKey-us-east-1.pem ubuntu@YOUR_STATIC_IP
```

### 3. Continue with Application Deployment

Follow **LIGHTSAIL_QUICKSTART.md** starting from **Step 6** (Clone & Configure).

Or use the quick deployment script:

```bash
# On the server
git clone <your-repo-url> chatcall
cd chatcall

# Configure environment
cd server
cp .env.production.example .env.production
nano .env.production
# Update: DB_PASSWORD, JWT secrets, MEDIASOUP_ANNOUNCED_IP, etc.

cd ../web
cat > .env << EOF
VITE_API_URL=https://yourdomain.com/api
VITE_SOCKET_URL=https://yourdomain.com
EOF

# Deploy
cd ..
./deploy.sh
```

---

## Terraform Commands Reference

### Deploy/Update
```bash
terraform apply
```

### Preview Changes
```bash
terraform plan
```

### Destroy Infrastructure
```bash
terraform destroy
```

### Show Current State
```bash
terraform show
```

### Show Outputs Again
```bash
terraform output
```

### Format Code
```bash
terraform fmt
```

### Validate Configuration
```bash
terraform validate
```

---

## Customization

### Change Instance Size

Edit `terraform.tfvars`:
```hcl
instance_bundle_id = "large_2_0"  # Upgrade to 4GB RAM ($20/month)
```

Apply changes:
```bash
terraform apply
```

**Note:** Changing bundle size will recreate the instance!

### Add Custom Domain

Edit `terraform.tfvars`:
```hcl
domain_name = "chatcall.yourdomain.com"
```

Apply:
```bash
terraform apply
```

Then configure DNS:
- Point A record to the static IP
- Run certbot on the server to get SSL

---

## Cost Breakdown

| Bundle | RAM | vCPU | Storage | Cost/Month |
|--------|-----|------|---------|------------|
| micro_2_0 | 512 MB | 1 | 20 GB | $3.50 |
| small_2_0 | 1 GB | 1 | 40 GB | $5.00 |
| medium_2_0 ⭐ | 2 GB | 1 | 60 GB | $10.00 |
| large_2_0 | 4 GB | 2 | 80 GB | $20.00 |
| xlarge_2_0 | 8 GB | 2 | 160 GB | $40.00 |

**Recommended for testing:** `medium_2_0` ($10/month)
**Recommended for production:** `large_2_0` ($20/month)

---

## Troubleshooting

### "Error: No valid credential sources found"
**Solution:** Run `aws configure` and set up AWS credentials

### "Error: creating Lightsail Instance: InvalidInput"
**Solution:** Check if `instance_bundle_id` is valid for your region

### Can't SSH into server
**Solution:**
1. Download SSH key: `aws lightsail download-default-key-pair --region YOUR_REGION`
2. Set permissions: `chmod 400 ~/.ssh/LightsailDefaultKey-*.pem`
3. Check firewall allows SSH (port 22)

### Want to start fresh
```bash
terraform destroy  # Delete everything
terraform apply    # Recreate
```

---

## State Management

Terraform stores the infrastructure state in `terraform.tfstate`.

**Important:**
- ⚠️ Don't delete `terraform.tfstate` - Terraform needs it
- ⚠️ Don't commit it to Git (contains sensitive data)
- ✅ Back it up regularly
- ✅ Consider using remote state (S3) for production

### Use Remote State (Optional)

For team deployments, store state in S3:

```hcl
# Add to main.tf
terraform {
  backend "s3" {
    bucket = "your-terraform-state-bucket"
    key    = "chatcall/terraform.tfstate"
    region = "us-east-1"
  }
}
```

---

## Advanced: Multiple Environments

Create separate `.tfvars` files:

```bash
# Development
terraform apply -var-file="dev.tfvars"

# Production
terraform apply -var-file="prod.tfvars"
```

**dev.tfvars:**
```hcl
instance_bundle_id = "small_2_0"
environment = "development"
```

**prod.tfvars:**
```hcl
instance_bundle_id = "large_2_0"
environment = "production"
```

---

## Cleanup

To delete all infrastructure and stop charges:

```bash
terraform destroy
```

Confirm with `yes`.

**This will delete:**
- Lightsail instance
- Static IP
- All data on the instance

**Before destroying:**
- Backup your data
- Export database if needed
- Save any important files

---

## Next Steps

1. ✅ Infrastructure deployed with Terraform
2. 📝 Follow LIGHTSAIL_QUICKSTART.md from Step 6
3. 🚀 Deploy ChatCall application
4. 🎉 Test across networks

---

## Support

If you encounter issues:
1. Check Terraform output for errors
2. Verify AWS credentials: `aws sts get-caller-identity`
3. Check Lightsail console: https://lightsail.aws.amazon.com/
4. Review logs: `terraform show`
