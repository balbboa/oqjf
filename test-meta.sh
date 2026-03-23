#!/usr/bin/env bash
set -a
source apps/api/.env
set +a

curl --http1.1 -i -X POST \
  "https://graph.facebook.com/v22.0/${META_PHONE_NUMBER_ID}/messages" \
  -H "Authorization: Bearer ${META_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "5584994129804",
    "type": "template",
    "template": { "name": "hello_world", "language": { "code": "en_US" } }
  }'
