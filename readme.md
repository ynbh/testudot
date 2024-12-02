
# course monitoring application

## overview

this is a nodejs-based course monitoring application that fetches course section information from the university of maryland's public course info api, tracks changes, and sends email notifications when updates occur.

## features

- api-based course section retrieval
- real-time monitoring of course availability
- email notifications for:
  - new sections
  - seat availability changes
  - section removals
- automated scheduling with cron jobs
- sqlite database integration

## setup

simply run the setup script after cloning the repository:

```bash
chmod +x monitor.sh
./monitor.sh
```

the script will:

- check node.js and npm installations
- install dependencies
- create a default `.env` file
- guide you through final configuration

**note**: for nodemailer to work wth gmail, you will first have to turn 2FA on for your gmail account, and then create an  **_app password_** that you will use as your `EMAIL_PASS` environment variable. your `ÈMAIL_USER` remains the same as your gmail username.

## usage

when you run the application, you'll be prompted to enter course namesgit separated by commas. the app will:

- immediately start monitoring
- scrape course information from the testudo's schedule of classes page
- store course data in sqlite database
- send email notifications on changes
- repeat monitoring every 30 minutes

## important notes

- relies on the university's public course information api
- be mindful of api usage terms and potential rate limits
- sqlite database creates a local `course_monitor.db` file to track course information

## technologies used

- nodemailer
- sqlite3
- node-cron
- typescript

## license

mit license. do what you want with this at your will.
