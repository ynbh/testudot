#!/bin/bash

if ! command -v node &> /dev/null
then
    echo "Node.js is not installed. Please install Node.js first."
    exit 1
fi

if ! command -v npm &> /dev/null
then
    echo "npm is not installed. Please install npm first."
    exit 1
fi

npm install

cat << EOF > .env
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password
EOF


echo "Setup complete! Update your .env variables and run npx tsx monitor.ts"

