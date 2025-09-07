#!/bin/bash
# Create a self-signed certificate for testing code signing
# NOTE: This will NOT work for distribution - only for local testing

echo "Creating self-signed certificate for local testing..."

# Create a self-signed certificate
security create-certificate-identity \
  -c "Developer ID Application: Test Certificate" \
  -e "test@example.com" \
  -s "TestCert" \
  -S "/System/Library/Keychains/login.keychain"

echo "Certificate created. Check with:"
echo "security find-identity -v -p codesigning"