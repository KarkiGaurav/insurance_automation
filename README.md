# Insurance Form Automation API

A production-ready Node.js API for automating insurance form submissions using Puppeteer. This system handles complex multi-step insurance forms with dynamic content, state management, and robust error handling.

![API Status](https://img.shields.io/badge/status-production--ready-green)
![Node.js](https://img.shields.io/badge/node.js-16%2B-brightgreen)
![Puppeteer](https://img.shields.io/badge/puppeteer-21.0.0-blue)
![Docker](https://img.shields.io/badge/docker-ready-blue)

## 🚀 Features

- **Multi-step Form Automation**: Handles complex insurance forms with conditional steps
- **Dynamic Content Handling**: Adapts to vehicle make/model dependencies and API-driven dropdowns
- **Robust Error Handling**: Comprehensive validation, fraud detection, and retry mechanisms
- **Production Ready**: Docker support, logging, monitoring, and security features
- **Scalable Architecture**: Clean separation of concerns with controllers, services, and utilities
- **Cross-platform Support**: Works on macOS, Linux, and Windows (with Docker)

## 📋 Prerequisites

- **Node.js** 16.0.0 or higher
- **npm** 8.0.0 or higher
- **Google Chrome** or **Chromium** browser
- **Docker** (optional, for containerized deployment)

## 🛠️ Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/yourcompany/insurance-form-automation.git
cd insurance-automation

# Install dependencies and setup environment
npm run setup

# Edit environment variables
cp .env.example .env
nano .env  # Configure your environment
```

### 2. Development Mode

```bash
# Start in development mode with auto-reload
npm run dev

# Test the API
curl http://localhost:3000/api/health
```

### 3. Production Mode

```bash
# Start in production mode
npm start

# Or use PM2 for process management
npm install -g pm2
pm2 start app.js --name insurance-automation
```

## 🏗️ Project Structure

```
insurance-automation/
├── src/
│   ├── config/              # Configuration files
│   │   ├── database.js      # Database configuration
│   │   └── puppeteer.js     # Browser configuration
│   ├── controllers/         # Request handlers
│   │   ├── automationController.js
│   │   └── diagnosticController.js
│   ├── services/            # Business logic
│   │   └── InsuranceFormAutomator.js
│   ├── utils/               # Utility functions
│   │   ├── logger.js        # Logging system
│   │   ├── stateMapping.js  # State code mappings
│   │   └── validator.js     # Data validation
│   ├── middleware/          # Express middleware
│   └── routes/              # API routes
├── public/
│   └── images/              # Static images
├── temp/
│   └── screenshots/         # Debug screenshots
├── logs/                    # Application logs
├── app.js                   # Main application file
├── Dockerfile              # Docker configuration
├── docker-compose.yml      # Multi-container setup
└── README.md               # This file
```

## 🔌 API Endpoints

### Health & Diagnostics
- `GET /api/health` - Health check
- `GET /api/browser-check` - Browser availability test
- `GET /api/simple-test` - Basic Puppeteer test
- `GET /api/quick-url-test` - Target URL accessibility
- `POST /api/test` - Basic API test

### Form Automation
- `POST /api/submit-insurance-form` - **Main automation endpoint**
- `POST /api/debug-form-fill` - Debug form filling process

### Example Request

```bash
curl -X POST http://localhost:3000/api/submit-insurance-form \\
  -H "Content-Type: application/json" \\
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "address": "123 Main St",
    "apartment": "Apt 4B",
    "city": "Los Angeles",
    "state": "CA",
    "zipCode": "90210",
    "email": "john@example.com",
    "phone": "2139851300",
    "leadSource": "DIRECT",
    "timeAtResidence": "60"
  }'
```

### Success Response

```json
{
  "success": true,
  "message": "Step 1 completed successfully - moved to vehicle selection",
  "currentUrl": "https://...auto/Prefill",
  "nextStep": "vehicle_selection",
  "step": "step1_completed",
  "processingTime": 12450
}
```

## 🐳 Docker Deployment

### Single Container

```bash
# Build image
docker build -t insurance-automation .

# Run container
docker run -p 3000:3000 \\
  -e NODE_ENV=production \\
  -v $(pwd)/logs:/usr/src/app/logs \\
  -v $(pwd)/temp:/usr/src/app/temp \\
  insurance-automation
```

### Docker Compose (Recommended)

```bash
# Start all services (app + database + cache)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## ☁️ Cloud Deployment

### AWS EC2 Deployment

1. **Launch EC2 Instance**
```bash
# Recommended: Ubuntu 22.04 LTS, t3.medium or larger
# Open ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)
```

2. **Server Setup**
```bash
# SSH into your instance
ssh -i your-key.pem ubuntu@your-server-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

3. **Deploy Application**
```bash
# Clone repository
git clone https://github.com/yourcompany/insurance-form-automation.git
cd insurance-automation

# Configure environment
cp .env.example .env
nano .env  # Edit production settings

# Deploy with Docker Compose
docker-compose up -d

# Setup SSL (optional)
sudo apt install certbot nginx
sudo certbot --nginx -d your-domain.com
```

### Digital Ocean Deployment

```bash
# Create Droplet (4GB RAM recommended)
# Ubuntu 22.04, enable monitoring

# Follow same Docker setup as AWS EC2
# Use Digital Ocean's managed databases for production
```

### Google Cloud Platform

```bash
# Use Cloud Run for serverless deployment
gcloud run deploy insurance-automation \\
  --image gcr.io/PROJECT_ID/insurance-automation \\
  --platform managed \\
  --region us-central1 \\
  --memory 2Gi \\
  --cpu 2 \\
  --max-instances 10
```

### Heroku Deployment

```bash
# Install Heroku CLI
npm install -g heroku

# Login and create app
heroku login
heroku create your-app-name

# Add Puppeteer buildpack
heroku buildpacks:add jontewks/puppeteer

# Deploy
git push heroku main

# Configure environment
heroku config:set NODE_ENV=production
heroku config:set PUPPETEER_HEADLESS=new
```

## 🔧 Configuration

### Environment Variables

```bash
# Core Configuration
NODE_ENV=production
PORT=3000

# Browser Settings
CHROME_EXECUTABLE_PATH=/usr/bin/google-chrome
PUPPETEER_HEADLESS=new
PUPPETEER_TIMEOUT=60000

# Storage
LOG_DIR=./logs
SCREENSHOT_DIR=./temp/screenshots
KEEP_SCREENSHOTS_DAYS=7

# Security
API_KEY=your-secure-api-key
CORS_ORIGIN=https://yourdomain.com

# Database (Optional)
MONGODB_URI=mongodb://localhost:27017/insurance_automation
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Browser Configuration

The system automatically detects Chrome/Chromium installations:

- **macOS**: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- **Linux**: `/usr/bin/google-chrome-stable`
- **Docker**: Uses included Chromium

## 📊 Monitoring & Logging

### Log Files
```bash
# Application logs
tail -f logs/$(date +%Y-%m-%d).log

# Error monitoring
grep "ERROR" logs/*.log

# Performance monitoring
grep "processingTime" logs/*.log
```

### Health Checks
```bash
# Basic health
curl http://localhost:3000/api/health

# Browser availability
curl http://localhost:3000/api/browser-check

# End-to-end test
curl -X POST http://localhost:3000/api/debug-form-fill
```

## 🔍 Troubleshooting

### Common Issues

**1. Chrome/Chromium Not Found**
```bash
# Install Chrome on Ubuntu
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
echo "deb https://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt update && sudo apt install google-chrome-stable
```

**2. Permission Denied (Docker)**
```bash
# Fix Docker permissions
sudo chown -R $(whoami):$(whoami) logs/ temp/
sudo chmod -R 755 logs/ temp/
```

**3. Out of Memory**
```bash
# Increase Docker memory limit
docker run --memory=2g -p 3000:3000 insurance-automation

# Or edit docker-compose.yml
```

**4. Network Timeout**
```bash
# Increase timeouts in .env
PUPPETEER_TIMEOUT=90000
FORM_TIMEOUT=45000
```

### Debug Mode

```bash
# Enable debug logging
NODE_ENV=development npm run dev

# Take debug screenshots
curl -X POST http://localhost:3000/api/debug-form-fill

# Check screenshots
ls -la temp/screenshots/
```

## 🚀 Advanced Features

### Multi-step Form Handling

The system is designed to handle complex insurance forms with multiple conditional steps:

```javascript
// Future vehicle selection endpoint
POST /api/submit-vehicle-info
{
  "year": 2023,
  "make": "Toyota",
  "model": "Camry",
  "vin": "1234567890ABCDEFG"
}

// Driver information endpoint
POST /api/submit-driver-info
{
  "drivers": [
    {
      "firstName": "John",
      "lastName": "Doe",
      "dateOfBirth": "1990-01-01",
      "licenseNumber": "D1234567"
    }
  ]
}
```

### Dynamic Content Handling

The system can handle:
- **API-driven dropdowns** (vehicle makes → models)
- **Conditional form sections** (based on previous selections)
- **Multi-page workflows** with session state
- **Real-time validation** and error handling

## 📈 Scaling for Production

### Performance Optimization

1. **Browser Instance Pooling**
```javascript
// Future implementation
const browserPool = new BrowserPool({
  min: 2,
  max: 10,
  idleTimeoutMillis: 30000
});
```

2. **Request Queuing**
```javascript
// Add to package.json dependencies
"bull": "^4.10.4",
"redis": "^4.6.7"
```

3. **Load Balancing**
```nginx
# nginx.conf
upstream insurance_automation {
    server app1:3000;
    server app2:3000;
    server app3:3000;
}
```

### Monitoring & Analytics

```bash
# Add monitoring dependencies
npm install express-prometheus-middleware prom-client

# Setup alerts
curl -X POST webhook-url -d '{
  "text": "Insurance automation API error detected",
  "errors": ["Browser launch failed", "Form submission timeout"]
}'
```

## 🔐 Security Best Practices

1. **API Rate Limiting** ✅ Implemented
2. **Input Validation** ✅ Implemented
3. **Fraud Detection** ✅ Implemented
4. **CORS Configuration** ✅ Implemented
5. **Security Headers** ✅ Implemented
6. **Error Sanitization** ✅ Implemented

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📄 License

This project is licensed under the ISC License - see the LICENSE file for details.

## 🆘 Support

- **Documentation**: [GitHub Wiki](https://github.com/yourcompany/insurance-form-automation/wiki)
- **Issues**: [GitHub Issues](https://github.com/yourcompany/insurance-form-automation/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourcompany/insurance-form-automation/discussions)

---

**Made with ❤️ for automated insurance processing**