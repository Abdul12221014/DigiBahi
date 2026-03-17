# DigBahi Backend API

FastAPI backend for DigBahi Accounting Software with secure federated learning support.

## Features

- **Secure Sync**: AES-GCM encrypted model updates for federated learning
- **Role-based Access Control**: Admin, accountant, viewer roles
- **Session Management**: Secure session handling with JWT
- **Audit Logging**: Comprehensive activity tracking
- **WebSocket Sync**: Real-time synchronization support

---

## Environment Variables

### Required for Federated Learning

The federated learning module requires secure environment variables for encryption. **NEVER** commit these secrets to version control.

#### Option 1: Pre-Derived AES Key (Recommended for Production)

```bash
export FEDERATED_AES_KEY="<base64-encoded-32-byte-key>"
```

Generate a secure key:
```bash
python3 -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
```

#### Option 2: Master Secret + Salt (Fallback)

If `FEDERATED_AES_KEY` is not set, the system will use PBKDF2 key derivation:

```bash
export FEDERATED_MASTER_SECRET="<your-secure-master-password>"
export FEDERATED_SALT="<hex-string-at-least-32-chars>"
```

Generate a secure salt:
```bash
python3 -c "import secrets; print(secrets.token_hex(16))"
```

### Security Notes

- **DO NOT** use hardcoded values in production
- **DO NOT** commit `.env` files with secrets
- Use environment variable management (e.g., AWS Secrets Manager, HashiCorp Vault)
- Rotate keys periodically
- Use different keys for dev/staging/production

---

## Installation

### 1. Create Virtual Environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Set Environment Variables

Create a `.env` file (DO NOT commit):

```bash
# Federated Learning Security
FEDERATED_MASTER_SECRET="your-secure-secret-here"
FEDERATED_SALT="a1b2c3d4e5f67890a1b2c3d4e5f67890"

# Database (if applicable)
DATABASE_URL="sqlite:///./digbahi.db"

# JWT Secret
JWT_SECRET_KEY="your-jwt-secret"
```

### 4. Run Server

Development:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Production:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## Testing

### Run All Tests

```bash
pytest
```

### Run Specific Test Suite

```bash
# Crypto tests
pytest tests/test_secure_sync_crypto.py -v

# Federated endpoints
pytest tests/test_federated_endpoints.py -v
```

### With Coverage

```bash
pytest --cov=app --cov-report=html
```

---

## API Endpoints

### Health Check
```
GET /health
```

### Federated Learning
```
POST /api/v1/ai/federated/upload
POST /api/v1/ai/federated/aggregate
```

See API documentation at: `http://localhost:8000/docs`

---

## Security Checklist

Before deploying to production:

- [ ] All environment variables set securely
- [ ] No hardcoded secrets in code
- [ ] `cryptography` library version pinned
- [ ] HTTPS/TLS enabled
- [ ] Rate limiting configured
- [ ] Audit logging enabled
- [ ] Backup/disaster recovery plan

---

## Troubleshooting

### "Master key required" Error

**Cause**: `FEDERATED_MASTER_SECRET` environment variable not set.

**Solution**: 
```bash
export FEDERATED_MASTER_SECRET="your-secret"
```

### "FEDERATED_SALT environment variable required" Error

**Cause**: Using PBKDF2 mode but salt not provided.

**Solution**: Either:
1. Set `FEDERATED_AES_KEY` (recommended), OR
2. Set both `FEDERATED_MASTER_SECRET` and `FEDERATED_SALT`

### Decryption Fails

**Cause**: Wrong key or corrupted ciphertext.

**Solution**: 
- Verify environment variables match between encryption/decryption
- Check for data corruption in storage
- Ensure keys haven't been rotated without re-encrypting data

---

## Contributing

1. Follow PEP 8 style guide
2. Add type hints to all functions
3. Write tests for new features
4. Update documentation
5. Run linters before committing:
   ```bash
   flake8 app/ tests/
   mypy app/
   ```

---

## License

Proprietary - DigBahi Accounting Software

