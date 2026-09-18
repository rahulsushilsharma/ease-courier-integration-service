#!/usr/bin/env bash
# Example requests against a locally running server (npm run dev).
BASE=http://localhost:3000/api/v1

# Create order (mock courier - works with no external creds)
curl -s -X POST $BASE/orders -H "Content-Type: application/json" -d '{
  "order_id": "ORD-1001",
  "courier_partner": "mockcourier",
  "pickup_address": {"name":"Warehouse A","phone":"9999999999","line1":"Plot 1","city":"Bengaluru","state":"KA","pincode":"560001","country":"IN"},
  "drop_address": {"name":"Jane Doe","phone":"8888888888","line1":"Flat 2B","city":"Mumbai","state":"MH","pincode":"400001","country":"IN"},
  "package": {"weight_kg": 1.2},
  "payment_mode": "PREPAID"
}' | jq .

# Track
curl -s $BASE/orders/ORD-1001/track | jq .

# Cancel
curl -s -X POST $BASE/orders/ORD-1001/cancel | jq .

# Create with UrbaneBolt (requires real UAT credentials in .env)
curl -s -X POST $BASE/orders -H "Content-Type: application/json" -d '{
  "order_id": "ORD-1002",
  "courier_partner": "urbanebolt",
  "pickup_address": {"name":"Warehouse A","phone":"9999999999","line1":"Plot 1","city":"Bengaluru","state":"KA","pincode":"560001","country":"IN"},
  "drop_address": {"name":"John Doe","phone":"7777777777","line1":"House 9","city":"Delhi","state":"DL","pincode":"110001","country":"IN"},
  "package": {"weight_kg": 2.5}
}' | jq .

# Unknown courier -> 400
curl -s -X POST $BASE/orders -H "Content-Type: application/json" -d '{
  "order_id": "ORD-BAD",
  "courier_partner": "doesnotexist",
  "pickup_address": {"name":"A","phone":"9999999999","line1":"L1","city":"C","state":"S","pincode":"123456","country":"IN"},
  "drop_address": {"name":"B","phone":"8888888888","line1":"L2","city":"C2","state":"S2","pincode":"654321","country":"IN"},
  "package": {"weight_kg": 1}
}' | jq .

# Bulk create (100 orders max) - returns batch_id immediately
curl -s -X POST $BASE/orders/bulk -H "Content-Type: application/json" -d '{
  "orders": [
    {"order_id":"BULK-1","courier_partner":"mockcourier","pickup_address":{"name":"A","phone":"9999999999","line1":"L1","city":"C","state":"S","pincode":"123456","country":"IN"},"drop_address":{"name":"B","phone":"8888888888","line1":"L2","city":"C2","state":"S2","pincode":"654321","country":"IN"},"package":{"weight_kg":1}},
    {"order_id":"BULK-2","courier_partner":"urbanebolt","pickup_address":{"name":"A","phone":"9999999999","line1":"L1","city":"C","state":"S","pincode":"123456","country":"IN"},"drop_address":{"name":"B","phone":"8888888888","line1":"L2","city":"C2","state":"S2","pincode":"654321","country":"IN"},"package":{"weight_kg":1}}
  ]
}' | jq .

# Poll batch status (replace BATCH_ID with the id returned above)
curl -s $BASE/orders/bulk/BATCH_ID | jq .
